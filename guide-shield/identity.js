/**
 * Trusted guidance identity for the panel host.
 *
 * A guidance conversation is a continuable subagent child whose own
 * `subagent/descriptor` was established by the `guide-fork` provider. The
 * inherited seed is ignored: a fork seed may replay an ancestor's descriptor,
 * and `agentPreset` is not a discriminator because a guide's ordinary children
 * inherit the guide's preset.
 *
 * The host's `foldSubagentDescriptor()` is first-wins (the establishing
 * provider appends exactly one descriptor) and `coldResume()` folds
 * `events.slice(inheritedEventCount)`. This module follows that rule; callers
 * pass the official fold function so tests do not need the host runtime.
 *
 * The synchronous reader is intentionally small: the shield wrappers are
 * synchronous, so they need a verdict without awaiting an observation. Async
 * callers (tool-result filtering, control guards) use `isGuideId()` and may
 * fall back to a `sessionQuery` observation.
 */

/** Provider name registered by guide-panel. */
export const GUIDE_PROVIDER = 'guide-fork'

/** The settlement notice prefix used by the subagent runtime. */
export const SETTLEMENT_PREFIX = 'Background subagent '

/** Fold the first descriptor from child-owned events; malformed input is unknown. */
function foldEvents(events, foldDescriptor) {
  if (typeof foldDescriptor !== 'function' || !Array.isArray(events)) return undefined
  try {
    return foldDescriptor(events)
  } catch {
    return undefined
  }
}

/**
 * Classify one live Session by its own descriptor.
 *
 * @param session - Session with `header`, `inheritedEventCount` and
 *   `snapshotEvents(fromSeq)`.
 * @param foldDescriptor - `foldSubagentDescriptor` from `@deepseek-ai/dsh-subagent`.
 * @returns `true` for a guide, `false` for a definite non-guide, `undefined`
 *   when the child-owned prefix is missing or malformed.
 */
export function classifySession(session, foldDescriptor) {
  if (session === undefined || session === null) return false
  if (session.header?.origin !== 'subagent') return false
  const cut = session.inheritedEventCount
  if (!Number.isSafeInteger(cut) || cut < 0) return undefined
  let own
  try {
    own = session.snapshotEvents(cut)
  } catch {
    return undefined
  }
  if (!Array.isArray(own)) return undefined
  const descriptor = foldEvents(own, foldDescriptor)
  if (descriptor === undefined) return undefined
  return descriptor.mode === 'continuable' && descriptor.provider === GUIDE_PROVIDER
}

/**
 * Boolean convenience wrapper. A malformed/missing descriptor reads as
 * `false`; callers that need "unknown" use {@link classifySession}.
 */
export function isGuideSession(session, foldDescriptor) {
  return classifySession(session, foldDescriptor) === true
}

/**
 * Read the establishing provider from one session observation.
 *
 * @param observation - `sessionQuery.observeSession()` result.
 * @param foldDescriptor - `foldSubagentDescriptor`.
 * @param expectedId - optional session id the observation must describe.
 * @returns the provider string, or `undefined` when the observation is
 *   unavailable, belongs to another session, or has no usable descriptor.
 */
function descriptorFromObservation(observation, foldDescriptor, expectedId) {
  const header = observation?.header
  const cut = observation?.inheritedEventCount
  if (header?.origin !== 'subagent') return undefined
  if (expectedId !== undefined && header.id !== expectedId) return undefined
  if (!Number.isSafeInteger(cut) || cut < 0 || !Array.isArray(observation.events) || cut > observation.events.length) return undefined
  return foldEvents(observation.events.slice(cut), foldDescriptor)
}

export function providerFromObservation(observation, foldDescriptor, expectedId) {
  const descriptor = descriptorFromObservation(observation, foldDescriptor, expectedId)
  return descriptor?.mode === 'continuable' ? descriptor.provider : undefined
}

/** Tri-state observation classification used by the async path. */
function classifyObservation(observation, id, foldDescriptor) {
  const descriptor = descriptorFromObservation(observation, foldDescriptor, id)
  if (descriptor === undefined) return undefined
  return descriptor.mode === 'continuable' && descriptor.provider === GUIDE_PROVIDER
}

/** Dispose one observation lease without letting a host error escape. */
function disposeObservation(observation) {
  try {
    const dispose = observation?.[Symbol.dispose]
    if (typeof dispose === 'function') dispose.call(observation)
  } catch {
    // A lease that cannot be disposed costs memory, not correctness.
  }
}

/** Structural service read: absent/rebuilding services must not throw. */
function serviceValue(service, id) {
  try {
    return typeof service?.get === 'function' ? service.get(id) : undefined
  } catch {
    return undefined
  }
}

function nonNegative(value, fallback) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback
}

/**
 * Build one identity reader with a bounded hint table and a per-Session cache.
 *
 * @param options - `{ sessions, agents, sessionQuery, foldDescriptor, hintLimit,
 *   hintTtlMs, now, observeTimeoutMs }`.
 * @returns the panel-facing identity API.
 */
export function createIdentity({
  sessions,
  agents,
  sessionQuery,
  foldDescriptor,
  hintLimit = 128,
  hintTtlMs = 10 * 60 * 1000,
  now = Date.now,
  observeTimeoutMs = 4_000,
} = {}) {
  if (typeof foldDescriptor !== 'function') throw new TypeError('createIdentity requires foldDescriptor')

  const limit = Math.max(1, nonNegative(hintLimit, 128))
  const ttl = nonNegative(hintTtlMs, 10 * 60 * 1000)
  const clock = typeof now === 'function' ? now : Date.now
  const timeoutMs = Math.max(1, nonNegative(observeTimeoutMs, 4_000))
  /** sessionId -> `{ value, at, parentSessionId }` */
  let hints = new Map()
  /** Session -> `{ seq, value }` */
  let cache = new WeakMap()
  // A child is detached before the runtime notifies its parent. These short
  // lived receipts preserve confirmed identity across that teardown boundary.
  // They are scoped to the exact receiving parent, never a global ID set.
  let settlements = new WeakMap()
  const reads = new Map()

  function cancelReads(id) {
    for (const controller of reads.get(id) ?? []) controller.abort()
  }

  function readHint(id) {
    if (typeof id !== 'string' || id === '') return undefined
    const entry = hints.get(id)
    if (entry === undefined) return undefined
    if (clock() - entry.at > ttl) {
      hints.delete(id)
      return undefined
    }
    return entry
  }

  function setHint(id, value, parentSessionId) {
    if (typeof id !== 'string' || id === '') return
    const previous = readHint(id)
    if (previous !== undefined) {
      previous.value = value
      previous.at = clock()
      if (typeof parentSessionId === 'string' || parentSessionId === undefined) {
        previous.parentSessionId = parentSessionId ?? previous.parentSessionId
      }
      return
    }
    hints.set(id, {
      value,
      at: clock(),
      parentSessionId: typeof parentSessionId === 'string' ? parentSessionId : undefined,
    })
    while (hints.size > limit) hints.delete(hints.keys().next().value)
  }

  function liveSession(id) {
    const direct = serviceValue(sessions, id)
    if (direct !== undefined) return direct
    return serviceValue(agents, id)?.session
  }

  function classify(session) {
    if (session === undefined || session === null) return false
    const seq = session.seq
    const previous = cache.get(session)
    if (previous !== undefined && previous.seq === seq) return previous.value
    const value = classifySession(session, foldDescriptor)
    cache.set(session, { seq, value })
    return value
  }

  function isGuideIdSync(id) {
    if (typeof id !== 'string' || id === '') return undefined
    const session = liveSession(id)
    if (session !== undefined) {
      const verdict = classify(session)
      if (verdict !== undefined) return verdict
    }
    return readHint(id)?.value
  }

  async function withObservation(id, signal, callback) {
    if (signal?.aborted || typeof sessionQuery?.observeSession !== 'function') return undefined
    const initialSession = liveSession(id)
    const initialAgent = serviceValue(agents, id)
    const controller = new AbortController()
    const pending = reads.get(id) ?? new Set()
    pending.add(controller)
    reads.set(id, pending)
    const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])])
    let observation
    let detachAbort
    try {
      // Also bound a provider that ignores cancellation. A late lease still
      // belongs to this read and must be released without running callback.
      observation = await new Promise((resolve, reject) => {
        let done = false
        const onAbort = () => {
          if (done) return
          done = true
          reject(combined.reason)
        }
        combined.addEventListener('abort', onAbort, { once: true })
        detachAbort = () => combined.removeEventListener('abort', onAbort)
        Promise.resolve().then(() => {
          combined.throwIfAborted()
          return sessionQuery.observeSession(id, { signal: combined })
        }).then(value => {
          if (done) { disposeObservation(value); return }
          done = true
          resolve(value)
        }, error => {
          if (done) return
          done = true
          reject(error)
        })
      })
      if (combined.aborted || liveSession(id) !== initialSession || serviceValue(agents, id) !== initialAgent) return undefined
      return callback(observation)
    } catch {
      return undefined
    } finally {
      detachAbort?.()
      pending.delete(controller)
      if (pending.size === 0 && reads.get(id) === pending) reads.delete(id)
      disposeObservation(observation)
    }
  }

  async function isGuideId(id, { signal } = {}) {
    if (signal?.aborted || typeof id !== 'string' || id === '') return undefined
    const sync = isGuideIdSync(id)
    if (sync !== undefined) return sync
    return withObservation(id, signal, (observation) => {
      const verdict = classifyObservation(observation, id, foldDescriptor)
      if (verdict === undefined) return undefined
      const parent = observation.header?.parentSession
      setHint(id, verdict, typeof parent === 'string' ? parent : undefined)
      return verdict
    })
  }

  async function parentOf(id, { signal } = {}) {
    if (signal?.aborted || typeof id !== 'string' || id === '') return undefined
    const hinted = readHint(id)?.parentSessionId
    if (typeof hinted === 'string') return hinted
    const session = liveSession(id)
    const direct = session?.header?.parentSession
    if (typeof direct === 'string') {
      setHint(id, readHint(id)?.value, direct)
      return direct
    }
    return withObservation(id, signal, (observation) => {
      if (observation?.header?.id !== id || observation.header.origin !== 'subagent') return undefined
      const parent = observation.header?.parentSession
      if (typeof parent !== 'string') return undefined
      setHint(id, readHint(id)?.value, parent)
      return parent
    })
  }

  function remember(id, parentSessionId) {
    if (typeof id !== 'string' || id === '') return
    cancelReads(id)
    setHint(id, true, typeof parentSessionId === 'string' ? parentSessionId : readHint(id)?.parentSessionId)
  }

  function forget(id) {
    if (typeof id !== 'string' || id === '') return
    cancelReads(id)
    hints.delete(id)
  }

  function invalidate(session) {
    if (session !== undefined && session !== null) {
      cache.delete(session)
      cancelReads(session.id)
    }
  }

  function isHint(id) {
    return readHint(id)?.value === true
  }

  function retainSettlement(agent, parent) {
    if (!parent || serviceValue(agents, parent.id) !== parent || !classify(agent?.session)) return
    const records = settlements.get(parent) ?? new Map()
    for (const [id, record] of records) if (clock() - record.at > ttl) records.delete(id)
    records.delete(agent.id)
    records.set(agent.id, { at: clock() })
    while (records.size > limit) records.delete(records.keys().next().value)
    settlements.set(parent, records)
  }

  function consumeSettlement(id, parent) {
    if (!parent || serviceValue(agents, parent.id) !== parent) return false
    const records = settlements.get(parent)
    const record = records?.get(id)
    if (!record) return false
    records.delete(id)
    return clock() - record.at <= ttl
  }

  function beginAgent(agent, parent) {
    forget(agent?.id)
    // A new same-ID lifecycle must never inherit a prior terminal receipt.
    if (parent) settlements.get(parent)?.delete(agent?.id)
  }

  function releaseParent(parent) {
    if (parent) settlements.delete(parent)
  }

  function isGuideText(text) {
    if (typeof text !== 'string' || !text.startsWith(SETTLEMENT_PREFIX)) return false
    const id = text.slice(SETTLEMENT_PREFIX.length).split(' ')[0]
    if (id === '') return false
    return isGuideIdSync(id) === true
  }

  function clear() {
    for (const id of reads.keys()) cancelReads(id)
    hints.clear()
    cache = new WeakMap()
    settlements = new WeakMap()
  }

  return {
    isGuideSession: (session) => classify(session) === true,
    isGuideIdSync,
    isGuideId,
    parentOf,
    remember,
    forget,
    invalidate,
    isHint,
    retainSettlement,
    consumeSettlement,
    beginAgent,
    releaseParent,
    isGuideText,
    clear,
  }
}

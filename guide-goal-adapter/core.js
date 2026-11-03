import { createHash } from 'node:crypto'

export const PROVIDER = 'guide-fork'
export const DRIVER_HASH = '255483fbf86bed0dac5f641d89684de1933695e2c034475b2fa3953ec7f1ff92'
export const JOIN_HASH = '4998abd8041b70b418feee9fa8e8caa96f1696601b40ddf97e1dadf9348b539b'

export function functionHash(fn) {
  return createHash('sha256').update(Function.prototype.toString.call(fn).replace(/\r\n/g, '\n').trim()).digest('hex')
}

/** The establishing child-owned descriptor wins, matching coldResume(). */
export function providerFromObservation(observation, session, foldDescriptor) {
  const header = observation?.header
  const cut = observation?.inheritedEventCount
  if (header?.origin !== 'subagent' || header.id !== session.id || header.parentSession !== session.header?.parentSession
    || !Number.isSafeInteger(cut) || cut < 0 || !Array.isArray(observation.events)) return undefined
  try {
    if (cut > observation.events.length) return undefined
    const descriptor = foldDescriptor(observation.events.slice(cut))
    return descriptor?.mode === 'continuable' ? descriptor.provider : undefined
  } catch { return undefined }
}

function disposeObservation(observation) {
  observation?.[Symbol.dispose]?.()
}

export function createIdentityReader(ctx, signal, foldDescriptor) {
  const cache = new WeakMap()
  // Re-read the complete own prefix: a later descriptor cannot replace the
  // establishing one, including when the establishing descriptor is invalid.
  ctx.on('session/event', (session, event) => {
    if (session.header?.origin === 'subagent' && event.type === 'subagent/descriptor'
      && session.isOwnSeq?.(event.seq) === true) {
      let provider
      try {
        const cut = session.inheritedEventCount
        if (Number.isSafeInteger(cut) && cut >= 0) {
          const descriptor = foldDescriptor(session.snapshotEvents(cut))
          if (descriptor?.mode === 'continuable') provider = descriptor.provider
        }
      } catch { /* Unknown identity retains native waiting. */ }
      cache.set(session, { provider, seq: session.seq })
    }
  })
  const identify = async function (agent) {
    const session = agent?.session
    if (session?.header?.origin !== 'subagent') return undefined
    const previous = cache.get(session)
    if (previous && (previous.provider !== undefined || previous.seq === session.seq)) return previous.provider
    const query = ctx.get('sessionQuery')
    if (typeof query?.observeSession !== 'function') return undefined
    let observation
    const seq = session.seq
    try {
      observation = await query.observeSession(agent.id, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
      })
      // A cold read must still describe the exact live Session lifecycle.
      if (ctx.agents.get(agent.id) !== agent || signal.aborted || session.seq !== seq) return undefined
      const changed = cache.get(session)
      if (changed && changed !== previous) return changed.provider
      const provider = providerFromObservation(observation, session, foldDescriptor)
      cache.set(session, { provider, seq: session.seq })
      return provider
    } catch {
      return undefined
    } finally {
      disposeObservation(observation)
    }
  }
  identify.peek = agent => cache.get(agent?.session)?.provider
  return identify
}

/** Reject a second scheduler rather than accepting conflicting pre-step fences. */
export function assertSingleDriver(ctx) {
  const loader = ctx.get('loader')
  if (loader === undefined) return // Bare Contexts used in keyless integration tests.
  const schedulers = [...loader.entries()].filter(entry => !entry.disabled && (
    entry.options?.name === '@deepseek-ai/dsh-goal-round-driver'
    || entry.options?.name === '@local/dsh-guide-goal-adapter'
  ))
  if (schedulers.length !== 1 || schedulers[0].options.name !== '@local/dsh-guide-goal-adapter') {
    throw new Error('guide-goal-adapter: expected exactly one enabled adapter and a disabled original goal-round-driver; restore the paired profile configuration')
  }
}

export function createSubagentsFacade(ctx, identify, status, signal, enabled) {
  const methods = new Map()
  function upstream() { return ctx.get('subagents') }
  const waitForChildren = async parent => {
    const service = upstream()
    if (service === undefined) return false
    const native = () => service.waitForChildren(parent)
    const manager = service.manager
    let supported = false
    try {
      supported = enabled && manager?.resident instanceof Map && manager.materializations instanceof Set
        && typeof manager.waitForChildren === 'function' && functionHash(manager.waitForChildren) === JOIN_HASH
    } catch { /* Preserve native semantics when the private shape cannot be inspected. */ }
    if (!supported) {
      status.set('native', enabled ? 'unsupported-manager' : 'unsupported-driver')
      return native()
    }
    if (typeof ctx.get('sessionQuery')?.observeSession !== 'function') {
      status.set('native', 'session-query-unavailable')
      return native()
    }
    status.set('filtered', null)
    // Run upstream join in passes: classify currently published activations,
    // then let the original loop handle pending creations and lifecycle edges.
    // Newly encountered unknowns remain included, never optimistically skipped.
    const candidates = [...manager.resident.values()].filter(item => item.kind === 'local'
      && item.parent === parent && item.closing === undefined && item.ownedChildren?.size === 0)
    await Promise.all(candidates.map(item => identify(item.handle?.agent)))
    if (signal.aborted) return false
    if (upstream()?.manager !== manager) return upstream()?.waitForChildren(parent) ?? false
    const view = new Proxy(manager, {
      get(target, property) {
        if (property !== 'resident') return Reflect.get(target, property, target)
        return new Map([...target.resident].filter(([, item]) => identify.peek(item.handle?.agent) !== PROVIDER
          || item.parent !== parent || item.closing !== undefined || item.ownedChildren?.size !== 0))
      },
      set() { throw new Error('guide-goal-adapter: join view is read-only') },
    })
    return Reflect.apply(manager.waitForChildren, view, [parent])
  }
  return new Proxy({}, {
    get(_target, property) {
      if (property === 'waitForChildren') return waitForChildren
      const service = upstream()
      const value = service?.[property]
      if (typeof value !== 'function') return value
      const cached = methods.get(property)
      if (cached?.service === service && cached.value === value) return cached.bound
      const bound = value.bind(service)
      methods.set(property, { service, value, bound })
      return bound
    },
    set() { throw new Error('guide-goal-adapter: service facade is read-only') },
  })
}

export function createAdapter(originalDriver, { driverHash, foldDescriptor } = {}) {
  if (typeof originalDriver.apply !== 'function' || !Array.isArray(originalDriver.inject)) {
    throw new Error('guide-goal-adapter: original driver exports are unavailable; restore original profile entry')
  }
  return {
    name: 'guide-goal-adapter',
    inject: [...originalDriver.inject],
    async apply(ctx) {
      assertSingleDriver(ctx)
      let current = { mode: 'starting', reason: null, driverHash }
      const listeners = new Set()
      const status = {
        getState: () => ({ ...current }),
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        set(mode, reason) {
          if (mode === current.mode && reason === current.reason) return
          current = { ...current, mode, reason }
          ctx.logger[mode === 'native' ? 'warn' : 'info'](`guide-goal-adapter: ${mode}${reason ? ` (${reason})` : ''}`)
          for (const listener of listeners) { try { listener(status.getState()) } catch {} }
        },
      }
      ctx.provide('guideGoalAdapter', status)
      const controller = new AbortController()
      const enabled = driverHash === DRIVER_HASH
      status.set(enabled ? 'ready' : 'native', enabled ? null : 'unsupported-driver')
      ctx.effect(() => () => { controller.abort(); listeners.clear() }, 'guide-goal-adapter: observation cleanup')
      const runtime = ctx.plugin({
        name: 'guide-goal-adapter/runtime',
        inject: [...originalDriver.inject],
        apply(child) {
          const identify = createIdentityReader(child, controller.signal, foldDescriptor)
          const facade = createSubagentsFacade(child, identify, status, controller.signal, enabled)
          const scoped = child.isolate('subagents')
          scoped.provide('subagents', facade)
          return originalDriver.apply(scoped)
        },
      })
      await runtime
    },
  }
}

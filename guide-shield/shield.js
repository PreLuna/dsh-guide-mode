/**
 * Parent settlement shield.
 *
 * A guidance child's settlement is a runtime subagent notice addressed to its
 * parent. The first activation is `delivery: 'caller'` (no notice), but a
 * cold-resumed continuation settles with `delivery: 'parent'`; the notice must
 * not enter the main conversation. This module owns only the wrapping and
 * restoration; the identity predicate is injected so T1.1 can keep the current
 * predicate while T1.3 moves it onto the shared identity reader.
 *
 * Wrapping is intentionally narrow: `followup`, `steer` and `inject`.
 * Everything else is forwarded untouched.
 */

/** Marks a wrapper owned by this plugin, for idempotence and diagnostics. */
export const SHIELD_MARK = Symbol.for('dsh-guide-panel.shield')

/** The settlement notice prefix used by the subagent runtime. */
export const SETTLEMENT_PREFIX = 'Background subagent '

/**
 * Build the settlement predicate over one identity reader.
 *
 * The runtime stamps settlements with `source.kind === 'subagent-settled'` and
 * `source.senderSessionId`; prefer that identity. A source without a sender id,
 * or the legacy bare message, falls back to the first summary block — never to
 * a scan over closing text.
 *
 * @param options - `{ identity }` with `isGuideIdSync`, `isHint` and
 *   `isGuideText`.
 * @returns a synchronous predicate.
 */
export function createSettlementPredicate({ identity } = {}) {
  if (typeof identity?.isGuideIdSync !== 'function' || typeof identity?.isHint !== 'function') {
    throw new TypeError('createSettlementPredicate requires an identity reader')
  }
  return function isGuidanceSettlement(input, parent) {
    const source = input?.source
    if (source !== undefined) {
      if (source.kind !== 'subagent-settled') return false
      const id = source.senderSessionId
      if (typeof id === 'string') {
        const verdict = identity.isGuideIdSync(id)
        if (verdict !== undefined) return verdict
        return identity.consumeSettlement?.(id, parent) === true || identity.isHint(id)
      }
      // A settlement stamped without a sender id: fall through to the summary.
    }
    const first = input?.content?.[0]
    if (first?.type !== 'text' || typeof first.text !== 'string') return false
    if (!first.text.startsWith(SETTLEMENT_PREFIX)) return false
    if (identity.isGuideText(first.text)) return true
    const id = first.text.slice(SETTLEMENT_PREFIX.length).split(' ')[0]
    return identity.consumeSettlement?.(id, parent) === true
  }
}

/**
 * Create one shield instance for a plugin activation.
 *
 * @param options - `{ isSettlement, logger, inject }`; `isSettlement(input)`
 *   must be a synchronous predicate. `inject` defaults to true; O8 keeps the
 *   closing-path wrapper on unless the profile explicitly disables it.
 * @returns `{ shieldParent, restoreAll, getState }`.
 */
export function createShield({ isSettlement, logger, inject = true, enabled = true } = {}) {
  if (typeof isSettlement !== 'function') throw new TypeError('createShield requires isSettlement')
  const injectEnabled = inject !== false
  const shieldEnabled = enabled !== false
  const methods = injectEnabled ? ['followup', 'steer', 'inject'] : ['followup', 'steer']

  /** agent -> { restore } */
  const parents = new WeakMap()
  /** Every restore currently owned by this activation. */
  const restorers = new Set()
  /** Methods that at least one parent could not be wrapped in. */
  const failed = new Set()

  function shieldParent(agent) {
    if (!shieldEnabled) return () => {}
    if (agent === undefined || agent === null) return () => {}
    const existing = parents.get(agent)
    if (existing !== undefined) return existing.restore

    const originals = new Map()
    const wrappers = new Map()
    let active = true
    for (const method of methods) {
      const original = agent[method]
      if (typeof original !== 'function') {
        failed.add(method)
        if (typeof logger?.warn === 'function') {
          logger.warn(`guide-panel: parent "${String(agent.id)}" has no "${method}" method; settlement shield is partial`)
        }
        continue
      }
      const wrapper = function shielded(input) {
        if (!active) return Reflect.apply(original, this, arguments)
        try {
          if (isSettlement(input, agent)) return undefined
        } catch {
          // A malformed notice falls through to the runtime.
        }
        return Reflect.apply(original, this, arguments)
      }
      wrapper[SHIELD_MARK] = true
      try {
        agent[method] = wrapper
      } catch {
        try {
          Object.defineProperty(agent, method, { value: wrapper, configurable: true, writable: true })
        } catch {
          // A frozen agent keeps the notice; the state reports `partial`.
          failed.add(method)
          if (typeof logger?.warn === 'function') {
            logger.warn(`guide-panel: cannot shield parent "${String(agent.id)}" method "${method}"`)
          }
          continue
        }
      }
      originals.set(method, original)
      wrappers.set(method, wrapper)
    }
    if (wrappers.size === 0) return () => {}

    let restored = false
    const restore = () => {
      if (restored) return
      restored = true
      // An outer owner may still hold this function. Retiring it must work
      // even when we cannot remove it from that owner's closure.
      active = false
      for (const [method, wrapper] of wrappers) {
        if (agent[method] !== wrapper) continue
        try {
          agent[method] = originals.get(method)
        } catch {
          // A third party may have frozen the method after we wrapped it.
        }
      }
      parents.delete(agent)
      restorers.delete(restore)
    }
    parents.set(agent, { restore })
    restorers.add(restore)
    return restore
  }

  function restoreAll() {
    for (const restore of [...restorers]) {
      try {
        restore()
      } catch {
        // Restoration is best-effort; one broken parent must not block others.
      }
    }
    failed.clear()
  }

  function releaseParent(agent) {
    parents.get(agent)?.restore()
  }

  function getState() {
    if (!shieldEnabled) return { mode: 'off', reason: 'disabled', inject: injectEnabled }
    return {
      mode: failed.size > 0 ? 'partial' : 'active',
      reason: failed.size > 0 ? `unwrapped:${[...failed].join(',')}` : null,
      inject: injectEnabled,
    }
  }

  return { shieldParent, releaseParent, restoreAll, getState }
}

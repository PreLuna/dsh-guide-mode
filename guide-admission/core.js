import { createHash } from 'node:crypto'
import { classifySession } from '../guide-shield/identity.js'

export const name = 'guide-admission'
export const inject = ['subagents', 'agents']
export const MATERIALIZE_SHA256 = '578c6251b13d80982a25321d57732df46ad6fe46ef830684be524bd2d01b1573'
const hashFunction = fn => createHash('sha256').update(Function.prototype.toString.call(fn).trim()).digest('hex')
const read = (ctx, key) => { try { return ctx.get(key) } catch { return undefined } }
const integer = value => Number.isSafeInteger(value) && value >= 0

/** One process/profile owner. Core updates require a stopped Host, not HMR. */
export function createAdmission({ agents, foldDescriptor, SubagentError, sourceError, reserve = 2, maxGuides = 4,
  methodHash = MATERIALIZE_SHA256, now = Date.now } = {}) {
  const policyError = !integer(reserve) || !integer(maxGuides) ? 'invalid-policy' : undefined
  const bindings = new Set(), byManager = new WeakMap(), poolIds = new WeakMap(), parentIds = new WeakMap()
  let current, sequence = 0, active = true, revision = 0, bindError
  const policy = Object.freeze({ reserve, maxGuides })
  function error(reason) {
    const messages = {
      reserve: '子代理名额紧张：当前池须给普通工作保留名额，请稍后重试',
      'global-guides': '指导对话并发已达 profile 上限，请等一个指导结束',
    }
    const failure = new SubagentError(messages[reason] ?? `无法核实名额，暂时无法启动指导（${reason}）`,
      reason === 'reserve' || reason === 'global-guides' ? 'ACTIVATION_LIMIT_REACHED' : 'CONTINUATION_UNAVAILABLE')
    failure.admissionReason = reason
    return failure
  }
  function identity(object, ids, prefix) {
    if (!ids.has(object)) ids.set(object, `${prefix}-${++sequence}`)
    return ids.get(object)
  }
  function shape(manager) {
    return manager?.resident instanceof Map && manager.rootPools instanceof WeakMap
      && manager.materializations instanceof Set
      && ['materialize', 'maxActiveSubagents', 'assertAdmitting', 'assertLiveParent'].every(key => typeof manager[key] === 'function')
  }
  function globalSnapshot() {
    const guides = new Set(), busyIds = new Set()
    let unknown = 0, creatingGuides = 0
    for (const binding of bindings) {
      const { manager, records, bootstrap } = binding
      if (binding !== current && manager.resident.size === 0 && manager.materializations.size === 0 && records.size === 0) {
        if (manager.materialize === binding.wrapper) manager.materialize = binding.original
        bindings.delete(binding); byManager.delete(manager)
        continue
      }
      for (const pending of bootstrap) {
        if (!manager.materializations.has(pending)) bootstrap.delete(pending)
        else unknown++
      }
      for (const activation of manager.resident.values()) {
        busyIds.add(activation.childId)
        if (activation.kind === 'external') continue
        if (activation.kind !== 'local' || !activation.handle?.agent?.session) { unknown++; continue }
        const verdict = classifySession(activation.handle.agent.session, foldDescriptor)
        if (verdict === true) guides.add(activation)
        else if (verdict !== false) unknown++
      }
      for (const record of records) {
        const resident = manager.resident.get(record.childId)
        if (record.activation && resident !== record.activation) { records.delete(record); continue }
        busyIds.add(record.childId)
        if (!record.activation && resident?.parent === record.parent) record.activation = resident
        if (record.activation) guides.add(record.activation)
        else { guides.add(record); creatingGuides++ }
      }
    }
    return { usedGuides: guides.size, creatingGuides, unknown, busyIds: [...busyIds] }
  }
  function snapshot(parent) {
    const base = { ...policy, sampledAt: now(), revision: ++revision, capacitySource: 'host.maxActiveSubagents',
      globalScope: 'profile', coreUpdate: 'cold-restart', mode: 'blocked', reason: null,
      capacity: null, used: null, budget: null, poolId: null, available: 0, allowed: false }
    if (!active) return { ...base, mode: 'off', reason: 'service-disposed' }
    if (sourceError || bindError || !current) return { ...base, mode: 'unsupported', reason: sourceError ?? bindError ?? 'manager-unavailable', enforcement: 'unavailable' }
    if (current.manager.materialize !== current.wrapper) return { ...base, mode: 'unsupported', reason: 'materialize-ownership-changed', enforcement: 'unavailable' }
    try {
      const global = globalSnapshot()
      Object.assign(base, { globalGuides: global.usedGuides, creatingGuides: global.creatingGuides, unknown: global.unknown,
        busyIds: global.busyIds, enforcement: 'native-materialize' })
      if (!parent || agents.get(parent.id) !== parent) return { ...base, reason: 'parent-unavailable' }
      const { manager } = current
      const resident = manager.resident.get(parent.id)
      if (resident && (resident.kind !== 'local' || resident.handle.agent !== parent)) return { ...base, reason: 'parent-epoch-mismatch' }
      const pool = resident?.pool ?? manager.rootPools.get(parent)
      if (pool && !(pool.slots instanceof Set)) return { ...base, reason: 'unknown-pool-shape' }
      const capacity = manager.maxActiveSubagents()
      if (!Number.isSafeInteger(capacity) || capacity <= 0) return { ...base, reason: 'unknown-capacity' }
      const used = pool?.slots.size ?? 0, budget = Math.max(0, capacity - reserve)
      const residents = pool ? [...manager.resident.values()].filter(item => item.pool === pool) : []
      Object.assign(base, { capacity, used, budget,
        resident: residents.length, creating: Math.max(0, used - residents.length),
        closing: residents.filter(item => item.closing !== undefined).length,
        external: residents.filter(item => item.kind === 'external').length,
        poolId: pool ? identity(pool, poolIds, 'pool') : identity(parent, parentIds, 'unallocated-parent'),
        poolAllocated: !!pool, pressure: used / capacity })
      const reason = policyError ?? (global.unknown ? 'identity-or-creating-unknown'
        : maxGuides === 0 ? 'global-guides' : used + 1 > budget ? 'reserve'
          : global.usedGuides + 1 > maxGuides ? 'global-guides' : null)
      return { ...base, mode: reason ? (global.unknown ? 'reconciling' : 'blocked') : 'active', reason,
        allowed: !reason, available: reason ? 0 : Math.max(0, Math.min(budget - used, maxGuides - global.usedGuides)) }
    } catch { return { ...base, mode: 'blocked', reason: 'snapshot-failed', allowed: false, available: 0 } }
  }
  function bind(manager) {
    current = undefined
    bindError = undefined
    if (!manager) return
    if (byManager.has(manager)) { current = byManager.get(manager); return }
    if (sourceError) { bindError = sourceError; return }
    try {
      if (!shape(manager) || hashFunction(manager.materialize) !== methodHash) { bindError = 'unsupported-manager-contract'; return }
    } catch { bindError = 'unsupported-manager-contract'; return }
    const original = manager.materialize
    const binding = { manager, original, records: new Set(), bootstrap: new Set(manager.materializations) }
    function wrapper(inputs) {
      // No diagnostics, policy reads, awaits or Promise replacement for ordinary work.
      if (!active || inputs?.kind !== 'local' || inputs.provider !== 'guide-fork') return Reflect.apply(original, this, arguments)
      manager.assertAdmitting(inputs.parent)
      inputs.signal.throwIfAborted()
      manager.assertLiveParent(inputs.parent, inputs.childId)
      // Preserve the native closing path and its own rollback/errors.
      const parentActivation = manager.resident.get(inputs.parent.id)
      if (parentActivation?.closing === undefined) {
        if (current !== binding) throw error('manager-replaced')
        const before = snapshot(inputs.parent)
        if (!before.allowed) throw error(before.reason)
      }
      const record = { childId: inputs.childId, parent: inputs.parent, activation: undefined }
      binding.records.add(record)
      let promise
      try { promise = Reflect.apply(original, this, arguments) }
      catch (failure) { binding.records.delete(record); throw failure }
      promise.then(activation => {
        if (binding.records.has(record)) record.activation = activation
      }, () => { binding.records.delete(record) })
      return promise
    }
    binding.wrapper = wrapper
    manager.materialize = wrapper
    bindings.add(binding); byManager.set(manager, binding); current = binding
  }
  function state({ sessionId, sessionIds = [] } = {}) {
    const parents = [...new Set([sessionId, ...sessionIds].filter(id => typeof id === 'string' && id.length <= 256))].slice(0, 128)
    const poolsBySession = Object.fromEntries(parents.map(id => [id, snapshot(agents.get(id))]))
    const value = parents.length ? poolsBySession[parents[0]] : snapshot(undefined)
    // No target is required for global diagnostics/configuration.
    if (!parents.length && value.reason === 'parent-unavailable') {
      value.mode = value.unknown ? 'reconciling' : policyError ? 'blocked' : 'active'
      value.reason = value.unknown ? 'identity-or-creating-unknown' : policyError ?? null
      try {
        value.capacity = current.manager.maxActiveSubagents()
        if (!Number.isSafeInteger(value.capacity) || value.capacity <= 0) throw Error('capacity')
        value.budget = Math.max(0, value.capacity - reserve)
        if (!value.reason) {
          value.reason = maxGuides === 0 || value.globalGuides >= maxGuides ? 'global-guides' : value.budget === 0 ? 'reserve' : null
          value.mode = value.reason ? 'blocked' : 'active'
        }
      } catch { value.mode = 'blocked'; value.reason = 'unknown-capacity'; value.capacity = null; value.budget = null }
    }
    return { ...value, poolsBySession }
  }
  return { bind, snapshot, state, policy,
    assertAvailable(parent) { const value = snapshot(parent); if (!value.allowed) throw error(value.reason); return value },
    dispose() {
      active = false; current = undefined
      for (const binding of bindings) {
        if (binding.manager.materialize === binding.wrapper) binding.manager.materialize = binding.original
        binding.records.clear(); binding.bootstrap.clear()
      }
      bindings.clear()
    },
  }
}

/** Watch the exact service's manager assignment synchronously, including rebuilds. */
export function apply(ctx, config = {}, dependencies) {
  const service = createAdmission({
    agents: { get: id => read(ctx, 'agents')?.get(id) }, ...dependencies,
    reserve: config.reserve ?? 2, maxGuides: config.maxGuides ?? 4,
  })
  ctx.provide('guideAdmission', service)
  ctx.effect(() => {
    const subagents = read(ctx, 'subagents')
    if (dependencies.sourceError) return () => service.dispose()
    const descriptor = Object.getOwnPropertyDescriptor(subagents, 'manager')
    if (!descriptor?.configurable || !('value' in descriptor) || !descriptor.writable) return () => service.dispose()
    let manager = descriptor.value
    service.bind(manager)
    const get = () => manager
    const set = value => { manager = value; service.bind(value) }
    Object.defineProperty(subagents, 'manager', { configurable: true, enumerable: descriptor.enumerable, get, set })
    return () => {
      service.dispose()
      if (Object.getOwnPropertyDescriptor(subagents, 'manager')?.get === get) {
        Object.defineProperty(subagents, 'manager', { ...descriptor, value: manager })
      }
    }
  }, 'guide-admission: native manager ownership (cold updates only)')
}

/**
 * Model-facing O6 projection for the guidance panel.
 *
 * B' decorates the original first-party tool definitions at `tools.register`
 * time instead of replacing tool results in `tools/post-execute`. The original
 * tool body, output schema, renderer and `tools/result` notification therefore
 * remain the single source of truth:
 *
 * - `list_agents`: run the original body, then filter guidance rows.
 * - `send_message` / `interrupt_agent`: decide identity before the original
 *   body, so a denied guidance target never reaches the subagent service.
 *
 * The registration observer is deliberately narrow: it wraps one service
 * method, preserves the registering context/scope and returns the original
 * disposer. Existing definitions are bootstrapped from the original modules'
 * live fibers. An unknown definition is reported as unsupported; it is never
 * silently treated as an official one.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Cordis service target behind a traceable context proxy. */
const ORIGINAL = Symbol.for('cordis.original')

/** Marker used only for diagnostics; ownership is the record/closure. */
const DECORATED = Symbol('guide-panel.decorated-definition')

/** The three model-facing definitions covered by O6. */
const TARGET_NAMES = ['list_agents', 'send_message', 'interrupt_agent']

/**
 * Supported first-party source hashes, pinned to DSH 0.2.1-rc.3. These are
 * checked once at startup; the adapter never hashes a function body per call.
 */
export const SUPPORTED_SOURCE = Object.freeze({
  '@deepseek-ai/dsh-tools': '1e53932e7c4213ea24a7d87f06960b7a7702cb21f8a5741c97242b4a470a442a',
  '@deepseek-ai/dsh-tool-subagent-control': '3f64ef2df3bfc7d7f5e31607949246dc64c32bf4179b74188bc4b764e081af38',
  '@deepseek-ai/dsh-tool-subagent-control/list-agents': '0cfb5e0e36fdd48d8fbe9f720d15760eb025d42c6e538b07808a13e7e655677f',
  '@deepseek-ai/cordis': '6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e',
  '@deepseek-ai/dsh-scope': '2829df71d76e08941457d4dd173eac60783e55354921137c8b75e8b5c0d2ecca',
})

/** Scope requested by `list_agents`. */
function listView(exec) {
  return exec?.arguments?.scope === 'descendants' ? 'descendants' : 'children'
}

/**
 * Filter one projected `list_agents` result.
 *
 * @param entries - the tool's projected array (child/diagnostic rows).
 * @param scope - `children` or `descendants`.
 * @param isGuide - async/sync `id => true | false | undefined`.
 * @returns a new array; entries with an unknown identity are preserved.
 */
export async function filterGuidanceEntries(entries, scope, isGuide) {
  if (!Array.isArray(entries) || typeof isGuide !== 'function') return entries
  const guide = new Map()
  await Promise.all(entries.map(async (entry) => {
    if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') return
    try {
      guide.set(entry.id, await isGuide(entry.id))
    } catch {
      guide.set(entry.id, undefined)
    }
  }))
  const hidden = new Set()
  const output = []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') {
      output.push(entry)
      continue
    }
    const underHidden = scope === 'descendants'
      && entry.parent !== undefined
      && hidden.has(entry.parent)
    if (underHidden || guide.get(entry.id) === true) {
      if (typeof entry.id === 'string') hidden.add(entry.id)
      continue
    }
    output.push(entry)
  }
  return output
}

/** The model-facing refusal for a guidance target. */
export const CONTROL_DENY_REASON = 'Guidance conversations are not task subagents; use the guidance panel to open or stop them.'

/** True when the identity reader exposes the contract this module needs. */
function hasIdentityContract(identity, controlEnabled) {
  return typeof identity?.isGuideId === 'function'
    && (!controlEnabled || typeof identity?.parentOf === 'function')
}

/** Read a service without making an uninjected context throw. */
function serviceOf(ctx, name) {
  try {
    if (ctx?.[name] !== undefined) return ctx[name]
    return typeof ctx?.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

function emptyToolState(enabled) {
  return {
    enabled,
    visibleScopes: 0,
    visibleDefinitions: 0,
    wrappedDefinitions: 0,
    unsupportedDefinitions: 0,
    notExposed: false,
    reason: null,
  }
}

function initialToolStates() {
  return {
    list_agents: emptyToolState(true),
    send_message: emptyToolState(true),
    interrupt_agent: emptyToolState(true),
  }
}

function cloneState(state) {
  return {
    ...state,
    tools: Object.fromEntries(Object.entries(state.tools).map(([name, value]) => [name, { ...value }])),
  }
}

/**
 * Load and hash-verify the original first-party modules used by B'.
 * The module objects are also the runtime-identity keys used by
 * `ctx.registry.get()`.
 */
export async function loadModelProjectionSource() {
  const [listModule, controlModule, scopeModule] = await Promise.all([
    import('@deepseek-ai/dsh-tool-subagent-control/list-agents'),
    import('@deepseek-ai/dsh-tool-subagent-control'),
    import('@deepseek-ai/dsh-scope'),
  ])
  if (typeof scopeModule.scopeOf !== 'function') throw new TypeError('unsupported dsh-scope: scopeOf is missing')
  for (const [spec, expected] of Object.entries(SUPPORTED_SOURCE)) {
    const url = import.meta.resolve(spec)
    if (!url.startsWith('file:')) throw new TypeError(`unsupported source URL for ${spec}`)
    const actual = createHash('sha256').update(readFileSync(fileURLToPath(url))).digest('hex')
    if (actual !== expected) throw new TypeError(`unsupported ${spec} source hash: ${actual}`)
  }
  return { listModule, controlModule, scopeOf: scopeModule.scopeOf }
}

function isWritableExecute(definition) {
  if (definition === null || typeof definition !== 'object') return false
  if (typeof definition.name !== 'string') return false
  if (typeof definition.execute !== 'function') return false
  if (definition.output === null || typeof definition.output !== 'object') return false
  if (typeof definition.output.render !== 'function') return false
  if (definition.output.schema === undefined) return false
  const descriptor = Object.getOwnPropertyDescriptor(definition, 'execute')
  if (descriptor?.get !== undefined || descriptor?.set !== undefined) return false
  if (descriptor?.writable === false) return false
  return Object.isExtensible(definition) || descriptor?.writable === true
}

/**
 * Create the model projection for one panel activation.
 *
 * @param options - `{ identity, source, sourceError, tools, agents, hideGuidance,
 *   blockControl, logger }`. The services are normally supplied by
 *   `start(ctx)`; tests may pass them directly.
 * @returns `{ start, getState }`; `start` installs the registration observer,
 *   bootstraps existing definitions and returns a disposer.
 */
export function createModelProjection({
  identity,
  source,
  sourceError,
  tools,
  agents,
  hideGuidance = true,
  blockControl = true,
  logger,
} = {}) {
  const enabled = hideGuidance !== false
  const controlEnabled = blockControl !== false
  const initialTools = initialToolStates()
  if (!controlEnabled) {
    initialTools.send_message.enabled = false
    initialTools.interrupt_agent.enabled = false
  }
  let state = {
    mode: enabled ? 'pending' : 'off',
    reason: enabled ? 'not-started' : 'disabled',
    blockControl: controlEnabled,
    scanRevision: 0,
    tools: initialTools,
  }

  let started = false
  let active = false
  let token = null
  let ctxRef
  let toolsRef
  let agentsRef
  let sourceRef
  let observer
  let listeners = []
  let records = new Set()
  let recordsByDefinition = new WeakMap()
  let sourceMap = new WeakMap()
  // Exact registrations, including unpublished/restricted scopes. Visibility
  // is only for coverage counts; it does not own a definition's lifetime.
  let registrations = new Set()
  let layersRef
  let scanQueued = false

  function isCurrent(record) {
    return active
      && record?.active === true
      && record.token === token
  }

  function fail(reason) {
    state = { ...state, mode: 'unsupported', reason }
    if (typeof logger?.warn === 'function') logger.warn(`guide-panel: model projection unsupported (${reason})`)
  }

  function sentinel(name) {
    return name === 'send_message' ? { messageId: '' } : { accepted: true }
  }

  /** The original module whose runtime is allowed to register this name. */
  function officialNameFor(runtime) {
    if (runtime === undefined || runtime === null) return undefined
    try {
      const listRuntime = ctxRef.registry.get(sourceRef.listModule)
      if (listRuntime !== undefined && runtime === listRuntime) return 'list_agents'
      const controlRuntime = ctxRef.registry.get(sourceRef.controlModule)
      if (controlRuntime !== undefined && runtime === controlRuntime) return 'control'
    } catch {
      // A registry lookup failure is an unknown source, never a trust fallback.
    }
    return undefined
  }

  function ensureWrapped(definition, name) {
    const provenance = sourceMap.get(definition)
    if (provenance?.name !== name) return undefined
    const existing = recordsByDefinition.get(definition)
    if (existing?.active === true && existing.token === token && existing.wrapper === definition.execute) {
      return existing
    }
    if (existing !== undefined) releaseRecord(existing)
    // A known object is not permission to trust a new execute closure.
    if (definition.execute !== provenance.execute) return undefined
    if (!isWritableExecute(definition)) return undefined
    const record = {
      definition,
      name,
      originalExecute: definition.execute,
      wrapper: null,
      active: true,
      token,
    }
    const wrapper = name === 'list_agents' ? makeListWrapper(record) : makeControlWrapper(record)
    record.wrapper = wrapper
    try {
      definition.execute = wrapper
      Object.defineProperty(wrapper, DECORATED, { value: record, enumerable: false })
    } catch {
      return undefined
    }
    if (definition.execute !== wrapper) return undefined
    records.add(record)
    recordsByDefinition.set(definition, record)
    return record
  }

  function restoreRecord(record) {
    record.active = false
    if (record.definition?.execute !== record.wrapper) return
    try {
      record.definition.execute = record.originalExecute
    } catch {
      // A frozen third-party wrapper is not ours to force; the inactive wrapper
      // still passes through, so no old policy runs.
    }
  }

  function releaseRecord(record) {
    restoreRecord(record)
    records.delete(record)
    if (recordsByDefinition.get(record.definition) === record) recordsByDefinition.delete(record.definition)
  }

  function registeredAt(name, scope) {
    const layer = scope === undefined ? layersRef.global : layersRef.peek(scope)
    return layer?.tools.get(name)
  }

  function rememberDefinition(definition, name, scope) {
    let provenance = sourceMap.get(definition)
    if (provenance === undefined) {
      provenance = { definition, name, execute: definition.execute, scopes: new Set() }
      sourceMap.set(definition, provenance)
      registrations.add(provenance)
    }
    if (provenance.name !== name) return undefined
    provenance.scopes.add(scope)
    return provenance
  }

  function sweepRegistrations() {
    for (const provenance of registrations) {
      const { definition, name, scopes } = provenance
      for (const scope of scopes) {
        if (registeredAt(name, scope) !== definition) scopes.delete(scope)
      }
      const record = recordsByDefinition.get(definition)
      if (scopes.size === 0) {
        if (record !== undefined) releaseRecord(record)
        registrations.delete(provenance)
        sourceMap.delete(definition)
      } else if (record !== undefined && definition.execute !== record.wrapper) {
        // A third-party outer wrapper may retain this closure. Deactivate it
        // without overwriting that party's function or stacking another layer.
        releaseRecord(record)
      }
    }
  }

  function makeListWrapper(record) {
    return async function listProjection(args, exec) {
      const signal = exec?.signal
      if (signal?.aborted) return []
      if (!isCurrent(record)) return Reflect.apply(record.originalExecute, this, [args, exec])
      const result = await Reflect.apply(record.originalExecute, this, [args, exec])
      if (signal?.aborted) return []
      if (!isCurrent(record)) return result
      if (!Array.isArray(result)) return result
      try {
        const filtered = await filterGuidanceEntries(result, listView(exec), id => identity.isGuideId(id, { signal }))
        if (signal?.aborted) return []
        if (!isCurrent(record)) return result
        return filtered
      } catch {
        if (signal?.aborted) return []
        return result
      }
    }
  }

  async function controlVerdict(record, target, callerId, signal) {
    const check = () => {
      if (signal?.aborted) return 'cancel'
      if (!isCurrent(record)) return 'stop'
      return 'ok'
    }
    try {
      if (record.name === 'send_message') {
        let status = check()
        if (status !== 'ok') return status
        const parent = await identity.parentOf(target, { signal })
        status = check()
        if (status !== 'ok') return status
        if (parent !== callerId) return 'allow'
        const guide = await identity.isGuideId(target, { signal })
        status = check()
        if (status !== 'ok') return status
        return guide === true ? 'deny' : 'allow'
      }
      let current = target
      const seen = new Set()
      for (let depth = 0; depth < 64; depth += 1) {
        const status = check()
        if (status !== 'ok') return status
        if (typeof current !== 'string' || current === '' || seen.has(current)) return 'allow'
        if (current === callerId) return 'allow'
        seen.add(current)
        const guide = await identity.isGuideId(current, { signal })
        const afterGuide = check()
        if (afterGuide !== 'ok') return afterGuide
        if (guide === true) return 'deny'
        current = await identity.parentOf(current, { signal })
        const afterParent = check()
        if (afterParent !== 'ok') return afterParent
      }
      return 'allow'
    } catch {
      if (signal?.aborted) return 'cancel'
      if (!isCurrent(record)) return 'stop'
      return 'allow'
    }
  }

  function makeControlWrapper(record) {
    return async function controlProjection(args, exec) {
      const callOriginal = () => Reflect.apply(record.originalExecute, this, [args, exec])
      const signal = exec?.signal
      if (signal?.aborted) return sentinel(record.name)
      if (!isCurrent(record)) return callOriginal()
      const target = args?.agent_id
      if (typeof target !== 'string' || target === '' || exec?.agent === undefined) return callOriginal()
      const verdict = await controlVerdict(record, target, exec.agent.id, signal)
      if (signal?.aborted || verdict === 'cancel') return sentinel(record.name)
      if (!isCurrent(record)) return callOriginal()
      if (verdict === 'deny') throw new Error(CONTROL_DENY_REASON)
      return callOriginal()
    }
  }

  function restoreDefinitions() {
    for (const record of records) restoreRecord(record)
    records = new Set()
    recordsByDefinition = new WeakMap()
    registrations = new Set()
    sourceMap = new WeakMap()
  }

  function removeListeners() {
    for (const dispose of listeners) {
      try {
        if (typeof dispose === 'function') dispose()
      } catch {
        // Cleanup is best-effort; the activation must still settle.
      }
    }
    listeners = []
  }

  function disposeRuntime(preserveFailure = false) {
    if (!active && !started && observer === undefined) return
    active = false
    scanQueued = false
    removeListeners()
    if (observer !== undefined) {
      try { observer() } catch {}
      observer = undefined
    }
    restoreDefinitions()
    if (enabled && !preserveFailure) state = { ...state, mode: 'unsupported', reason: 'stopped' }
    started = false
  }

  function scan() {
    if (!active) return
    sweepRegistrations()
    const liveAgents = agentsRef.list()
    if (!Array.isArray(liveAgents)) throw new TypeError('agents.list() did not return an array')
    const scopes = [undefined]
    const seenScopes = new Set([undefined])
    for (const agent of liveAgents) {
      if (agent === undefined || seenScopes.has(agent)) continue
      seenScopes.add(agent)
      scopes.push(agent)
    }
    const nextTools = {}
    let visibleTotal = 0
    let unsupportedTotal = 0
    for (const name of TARGET_NAMES) {
      const enabledTool = name === 'list_agents' ? true : controlEnabled
      if (!enabledTool) {
        nextTools[name] = emptyToolState(false)
        nextTools[name].reason = 'disabled'
        continue
      }
      const definitions = new Set()
      const visibleScopes = new Set()
      const unsupported = new Set()
      const reasons = new Set()
      for (const scope of scopes) {
        let definition
        try {
          definition = toolsRef.get(name, scope)
        } catch (error) {
          throw new TypeError(`tools.get(${name}) failed: ${String(error?.message ?? error)}`)
        }
        if (definition === undefined) continue
        definitions.add(definition)
        visibleScopes.add(scope)
        if (!sourceMap.has(definition)) {
          unsupported.add(definition)
          reasons.add('unknown-source')
          continue
        }
        if (ensureWrapped(definition, name) === undefined) {
          unsupported.add(definition)
          reasons.add(definition.execute !== sourceMap.get(definition).execute ? 'execute-replaced' : 'unsupported-shape')
        }
      }
      const wrapped = [...definitions].filter((definition) => {
        const record = recordsByDefinition.get(definition)
        return record?.active === true && record.token === token && definition.execute === record.wrapper
      }).length
      nextTools[name] = {
        enabled: true,
        visibleScopes: visibleScopes.size,
        visibleDefinitions: definitions.size,
        wrappedDefinitions: wrapped,
        unsupportedDefinitions: unsupported.size,
        notExposed: definitions.size === 0,
        reason: unsupported.size === 0 ? null : [...reasons].join(', '),
      }
      visibleTotal += definitions.size
      unsupportedTotal += unsupported.size
    }
    state = {
      ...state,
      scanRevision: state.scanRevision + 1,
      tools: nextTools,
    }
    if (unsupportedTotal > 0) {
      state = { ...state, mode: 'partial', reason: 'unsupported-definition' }
    } else if (visibleTotal === 0) {
      state = { ...state, mode: 'idle', reason: 'no-target-tools' }
    } else {
      state = { ...state, mode: 'active', reason: null }
    }
  }

  function scheduleScan() {
    if (!active || scanQueued) return
    scanQueued = true
    queueMicrotask(() => {
      scanQueued = false
      if (!active) return
      try {
        scan()
      } catch (error) {
        fail('scan-failed')
        disposeRuntime(true)
        if (typeof logger?.warn === 'function') logger.warn(`guide-panel: model projection scan failed: ${String(error?.message ?? error)}`)
      }
    })
  }

  function bootstrapExistingDefinitions() {
    for (const [name, module] of [
      ['list_agents', sourceRef.listModule],
      ['send_message', sourceRef.controlModule],
      ['interrupt_agent', sourceRef.controlModule],
    ]) {
      const runtime = ctxRef.registry.get(module)
      if (runtime === undefined) continue
      for (const fiber of runtime.fibers ?? []) {
        let scope
        try { scope = sourceRef.scopeOf(fiber.ctx) } catch { continue }
        let definition
        try { definition = registeredAt(name, scope) } catch { continue }
        if (definition !== undefined) {
          rememberDefinition(definition, name, scope)
          if (name === 'list_agents' || controlEnabled) ensureWrapped(definition, name)
        }
      }
    }
  }

  function installObserver() {
    const target = toolsRef[ORIGINAL] ?? toolsRef
    if (target === undefined || typeof target.register !== 'function') {
      throw new TypeError('tools.register is unavailable')
    }
    const own = Object.getOwnPropertyDescriptor(target, 'register')
    const originalRegister = target.register
    function observer(definition) {
      if (!active) return Reflect.apply(originalRegister, this, arguments)
      const name = definition?.name
      let sourceName
      try { sourceName = officialNameFor(this?.ctx?.fiber?.runtime) } catch { sourceName = undefined }
      let added = false
      let provenance
      let scope
      let hadScope = false
      let known = false
      if (TARGET_NAMES.includes(name) && sourceName !== undefined) {
        const expected = name === 'list_agents' ? 'list_agents' : 'control'
        if (sourceName === expected) {
          scope = sourceRef.scopeOf(this.ctx)
          known = sourceMap.has(definition)
          hadScope = sourceMap.get(definition)?.scopes.has(scope) === true
          provenance = rememberDefinition(definition, name, scope)
          const current = recordsByDefinition.get(definition)
          if ((name === 'list_agents' || controlEnabled)
            && !(current?.active === true && current.token === token && current.wrapper === definition.execute)) {
            added = ensureWrapped(definition, name) !== undefined
          }
        }
      }
      try {
        const disposer = Reflect.apply(originalRegister, this, arguments)
        scheduleScan()
        return disposer
      } catch (error) {
        if (added) {
          const record = recordsByDefinition.get(definition)
          if (record !== undefined) releaseRecord(record)
        }
        if (provenance !== undefined) {
          if (!hadScope) provenance.scopes.delete(scope)
          if (!known) {
            registrations.delete(provenance)
            sourceMap.delete(definition)
          }
        }
        throw error
      }
    }
    try {
      target.register = observer
    } catch {
      throw new TypeError('tools.register is not writable')
    }
    if (target.register !== observer) throw new TypeError('tools.register did not accept the observer')
    return () => {
      if (target.register !== observer) return
      try {
        if (own === undefined) delete target.register
        else Object.defineProperty(target, 'register', own)
      } catch {
        // The inactive observer still forwards if restoration is impossible.
      }
    }
  }

  function start(ctx) {
    if (started) return () => {}
    if (!enabled) {
      started = true
      state = { ...state, mode: 'off', reason: 'disabled' }
      return () => {}
    }
    if (!hasIdentityContract(identity, controlEnabled)) {
      fail('identity-contract')
      return () => {}
    }
    if (sourceError !== undefined || source === undefined) {
      fail(sourceError !== undefined ? `source-unavailable: ${String(sourceError?.message ?? sourceError)}` : 'source-unavailable')
      return () => {}
    }
    if (typeof source.scopeOf !== 'function' || source.listModule === undefined || source.controlModule === undefined) {
      fail('source-unavailable')
      return () => {}
    }
    const resolvedTools = tools ?? serviceOf(ctx, 'tools')
    const resolvedAgents = agents ?? serviceOf(ctx, 'agents')
    if (resolvedTools === undefined || typeof resolvedTools.get !== 'function' || typeof resolvedTools.register !== 'function') {
      fail('tools-unavailable')
      return () => {}
    }
    if (resolvedAgents === undefined || typeof resolvedAgents.list !== 'function') {
      fail('agents-unavailable')
      return () => {}
    }
    if (ctx?.registry === undefined || typeof ctx.registry.get !== 'function') {
      fail('registry-unavailable')
      return () => {}
    }
    if (typeof ctx.on !== 'function') {
      fail('events-unavailable')
      return () => {}
    }
    ctxRef = ctx
    toolsRef = resolvedTools
    agentsRef = resolvedAgents
    sourceRef = source
    // This raw, exact-layer read is part of the pinned ToolRuntime/ScopedLayers
    // contract. tools.get() applies visibility/restrictions and cannot prove
    // that an unpublished or hidden registration has ended.
    layersRef = (resolvedTools[ORIGINAL] ?? resolvedTools).layers
    if (typeof layersRef?.global?.tools?.get !== 'function' || typeof layersRef?.peek !== 'function') {
      fail('registration-lifetime-contract')
      return () => {}
    }
    token = {}
    active = true
    started = true
    state = { ...state, mode: 'pending', reason: null }
    try {
      observer = installObserver()
      bootstrapExistingDefinitions()
      listeners.push(ctx.on('agent/created', () => scheduleScan()))
      listeners.push(ctx.on('agent/disposed', () => scheduleScan()))
      listeners.push(ctx.on('tools/change', () => scheduleScan()))
      scan()
      if (state.mode === 'unsupported') {
        disposeRuntime(true)
      }
    } catch (error) {
      fail('startup-failed')
      disposeRuntime(true)
      if (typeof logger?.warn === 'function') logger.warn(`guide-panel: model projection startup failed: ${String(error?.message ?? error)}`)
      return () => {}
    }
    return () => {
      if (!started && !active) return
      disposeRuntime()
    }
  }

  function getState() {
    if (!enabled) return { ...cloneState(state), mode: 'off', reason: 'disabled' }
    if (!hasIdentityContract(identity, controlEnabled)) {
      return { ...cloneState(state), mode: 'unsupported', reason: 'identity-contract' }
    }
    return { ...cloneState(state), diagnostics: { registeredDefinitions: registrations.size, wrapperRecords: records.size } }
  }

  return { start, getState }
}

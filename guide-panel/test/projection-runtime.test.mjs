/** Regression tests against the installed, unmodified Cordis/ToolRuntime/tools.
 * ELECTRON_RUN_AS_NODE=1 <DSH>/DeepSeek Harness.exe --expose-internals <this file>
 * No desktop profile, external model or user session is used.
 */
import assert from 'node:assert/strict'
import { join, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createModelProjection } from '../model-projection.js'
import { createIdentity } from '../identity.js'

const packages = join(dirname(process.execPath), 'resources/app.asar/dsh/node_modules/@deepseek-ai')
const imp = (name, file = 'lib/index.js') => import(pathToFileURL(join(packages, name, file)).href)
const { Context } = await imp('cordis')
const { createScope, scopeOf } = await imp('dsh-scope')
const { default: ToolRuntime, TOOL_RUNTIME_SCHEDULER } = await imp('dsh-tools')
const list = await imp('dsh-tool-subagent-control', 'lib/types/list-agents.js')
const controls = await imp('dsh-tool-subagent-control')
const source = { listModule: list, controlModule: controls, scopeOf }
const ORIGINAL = Symbol.for('cordis.original')
const parent = { id: 'parent' }
const rows = [{ id: 'guide', mode: 'continuable', label: '指导: probe' },
  { id: 'work', mode: 'continuable', label: 'work' }]
const identity = { isGuideId: async id => id === 'guide', parentOf: async () => parent.id }
const results = []
const tick = async () => { await Promise.resolve(); await Promise.resolve() }
function input(name = 'list_agents', signal = new AbortController().signal, agent = parent) {
  return { name, arguments: name === 'list_agents' ? { scope: 'children' } : { agent_id: 'guide', message: 'probe' },
    callId: `regression-${Math.random()}`, signal, agent }
}
async function fixture() {
  const ctx = new Context()
  const live = [parent]
  const counts = { sends: 0, stops: 0, lists: 0 }
  ctx.provide('systemPrompt', { tools() {}, section() {} })
  ctx.provide('agents', { get: () => ({ status: 'running' }), list: () => live })
  ctx.provide('subagents', {
    listChildren: async () => { counts.lists++; return rows },
    listDescendants: async () => rows.map(row => ({ ...row, parentId: parent.id, depth: 1 })),
    sendMessage: async () => { counts.sends++; return 'message' },
    interrupt: () => { counts.stops++ },
  })
  const toolsHandle = await ctx.plugin(ToolRuntime)
  await ctx.plugin(list)
  await ctx.plugin(controls)
  const tools = ctx.tools
  const projections = []
  function start(options = {}) {
    const projection = createModelProjection({ identity, source, tools, agents: { list: () => live }, ...options })
    const dispose = projection.start(ctx)
    projections.push(dispose)
    return { projection, dispose }
  }
  async function scheduled(exec = input()) {
    const scheduler = tools[TOOL_RUNTIME_SCHEDULER]
    const prepared = await scheduler.prepare(exec)
    if (prepared.kind === 'final-result') return scheduler.finish(prepared.exec, prepared.result)
    if (prepared.kind === 'post-result') return scheduler.finalize(prepared.exec, prepared.result)
    const dispatched = await scheduler.dispatch(prepared.exec)
    return dispatched.kind === 'post-result' ? scheduler.finalize(prepared.exec, dispatched.result) : scheduler.finish(prepared.exec, dispatched.result)
  }
  return { ctx, tools, toolsHandle, counts, live, start, scheduled,
    close: async () => { for (const dispose of projections.reverse()) dispose(); await ctx.fiber.dispose() } }
}
async function check(name, callback) {
  const f = await fixture()
  try { await callback(f); results.push({ name, status: 'passed' }) }
  finally { await f.close() }
}

await check('BP-1: unpublished custom scope retains all wrappers across microtasks and unregisters cleanly', async f => {
  const { projection } = f.start()
  const scope = { id: parent.id }
  const child = createScope(f.ctx, scope)
  await child.ctx.plugin(list)
  await child.ctx.plugin(controls)
  await tick()
  const def = f.tools.get('list_agents', scope)
  assert.equal(def.execute.name, 'listProjection')
  assert.equal(projection.getState().tools.list_agents.visibleDefinitions, 1, 'unpublished scope is excluded from coverage')
  assert.equal(projection.getState().diagnostics.wrapperRecords, 6, 'but retains its three registered wrappers')
  const listResult = await f.scheduled(input('list_agents', undefined, scope))
  assert.equal(listResult.isError, false)
  assert.deepEqual(listResult.value.map(row => row.id), ['work'])
  for (const name of ['send_message', 'interrupt_agent']) {
    const result = await f.scheduled(input(name, undefined, scope))
    assert.equal(result.isError, true)
    assert.match(JSON.stringify(result.content), /Guidance conversations/)
  }
  f.live.push(scope); f.ctx.emit('agent/created', { agent: scope }); await tick()
  assert.equal(projection.getState().tools.list_agents.visibleDefinitions, 2)
  f.live.pop(); f.ctx.emit('agent/disposed', { agent: scope }); await tick()
  assert.equal(def.execute.name, 'listProjection', 'agent removal does not unregister shared preset tools')
  await child.dispose(); await tick()
  assert.equal(def.execute.name, 'execute', 'exact unregister restores the original body')
  assert.deepEqual(projection.getState().diagnostics, { registeredDefinitions: 3, wrapperRecords: 3 })
})

await check('BP-1: restricted globals remain wrapped until their registration ends', async f => {
  const { projection } = f.start()
  const scope = { id: 'restricted' }, child = createScope(f.ctx, scope)
  let unrestrict
  await child.ctx.inject(['tools'], ctx => { unrestrict = ctx.tools.restrict({ deny: ['list_agents'] }) })
  f.live.push(scope); await tick()
  assert.equal(f.tools.get('list_agents', scope), undefined)
  assert.equal(f.tools.get('list_agents').execute.name, 'listProjection')
  unrestrict(); await tick()
  assert.equal(f.tools.get('list_agents', scope).execute.name, 'listProjection')
  assert.equal(projection.getState().mode, 'active')
  await child.dispose()
})

await check('BP-1: bootstrap wraps already registered unpublished scopes, and repeated scope disposal stays bounded', async f => {
  const child = createScope(f.ctx, {})
  await child.ctx.plugin(list)
  const { projection } = f.start()
  assert.equal(projection.getState().diagnostics.wrapperRecords, 4)
  await child.dispose(); await tick()
  for (let i = 0; i < 12; i++) {
    const next = createScope(f.ctx, {})
    await next.ctx.plugin(list)
    await tick()
    assert.equal(projection.getState().diagnostics.wrapperRecords, 4)
    await next.dispose(); await tick()
    assert.equal(projection.getState().diagnostics.wrapperRecords, 3)
  }
})

await check('BP-1: shared definitions survive one exact registration being disposed', async f => {
  const { projection } = f.start()
  const def = f.tools.get('list_agents'), wrapper = def.execute
  const owner = [...f.ctx.registry.get(list).fibers][0].ctx
  const scopes = [{}, {}], children = scopes.map(scope => createScope(owner, scope))
  const disposers = children.map(child => child.ctx.extend({ fiber: owner.fiber }).tools.register(def))
  f.live.push(...scopes); await tick()
  assert.equal(projection.getState().tools.list_agents.visibleDefinitions, 1, 'one object across three scopes')
  assert.equal(projection.getState().diagnostics.wrapperRecords, 3)
  disposers[0](); await tick()
  assert.equal(def.execute, wrapper)
  disposers[1](); await tick()
  assert.equal(def.execute, wrapper, 'global registration still owns the wrapper')
  assert.equal(projection.getState().diagnostics.wrapperRecords, 3)
  for (const child of children) await child.dispose()
})

for (const name of ['list_agents', 'send_message', 'interrupt_agent']) {
  for (const action of ['cancel', 'unload', 'cancel-unload', 'unload-cancel']) {
    await check(`BP-2: ${name}, identity await + ${action}`, async f => {
      const entered = Promise.withResolvers(), gate = Promise.withResolvers(), controller = new AbortController()
      const delayed = { ...identity, isGuideId: async () => { entered.resolve(); await gate.promise; return true } }
      const { dispose } = f.start({ identity: delayed })
      const call = f.scheduled(input(name, controller.signal))
      await entered.promise
      for (const step of action.split('-')) {
        if (step === 'cancel') controller.abort(new Error('caller cancelled'))
        else dispose()
      }
      gate.resolve()
      const result = await call
      if (action.includes('cancel')) {
        assert.equal(result.isError, true)
        assert.equal(result.error?.info?.code, 'ABORTED')
        assert.equal(f.counts.sends, 0)
        assert.equal(f.counts.stops, 0)
      } else {
        assert.equal(result.isError, false, 'unload without caller cancellation delegates normally')
        if (name === 'list_agents') assert.deepEqual(result.value.map(row => row.id), ['guide', 'work'])
        else assert.equal(f.counts[name === 'send_message' ? 'sends' : 'stops'], 1)
      }
    })
  }
}

for (const name of ['send_message', 'interrupt_agent']) {
  for (const action of ['cancel', 'unload', 'cancel-unload', 'unload-cancel']) {
    await check(`BP-2: ${name}, parent lookup await + ${action}`, async f => {
      const entered = Promise.withResolvers(), gate = Promise.withResolvers(), controller = new AbortController()
      const delayed = { isGuideId: async () => false,
        parentOf: async () => { entered.resolve(); await gate.promise; return parent.id } }
      const { dispose } = f.start({ identity: delayed })
      const call = f.scheduled(input(name, controller.signal))
      await entered.promise
      for (const step of action.split('-')) {
        if (step === 'cancel') controller.abort(new Error('caller cancelled'))
        else dispose()
      }
      gate.resolve()
      const result = await call
      if (action.includes('cancel')) {
        assert.equal(result.error?.info?.code, 'ABORTED')
        assert.equal(f.counts.sends, 0); assert.equal(f.counts.stops, 0)
      } else {
        assert.equal(result.isError, false)
        assert.equal(f.counts[name === 'send_message' ? 'sends' : 'stops'], 1)
      }
    })
  }
}

await check('BP-2: genuine identity observation timeout fails open without cancelling the caller', async f => {
  const realIdentity = createIdentity({ observeTimeoutMs: 5, foldDescriptor: () => undefined,
    sessionQuery: { observeSession: (_id, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }) } })
  f.start({ identity: realIdentity })
  // AbortSignal.timeout is unref'ed; keep this offline process alive while the
  // real identity reader waits (a running Host already has active handles).
  const keepAlive = setInterval(() => {}, 1000)
  try {
    for (const name of ['list_agents', 'send_message', 'interrupt_agent']) {
      const result = await f.scheduled(input(name))
      assert.equal(result.isError, false)
      if (name === 'list_agents') assert.deepEqual(result.value.map(row => row.id), ['guide', 'work'])
    }
  } finally { clearInterval(keepAlive) }
  assert.equal(f.counts.sends, 1); assert.equal(f.counts.stops, 1)
})

await check('BP-3: same object execute replacement + event remains third-party owned and partial without record growth', async f => {
  const { projection, dispose } = f.start()
  const def = f.tools.get('list_agents')
  const old = def.execute
  for (let i = 0; i < 12; i++) {
    const thirdParty = async (...args) => old(...args)
    def.execute = thirdParty
    f.ctx.emit('tools/change'); await tick()
    assert.equal(def.execute, thirdParty)
    const state = projection.getState()
    assert.equal(state.mode, 'partial')
    assert.equal(state.tools.list_agents.reason, 'execute-replaced')
    assert.equal(state.tools.list_agents.wrappedDefinitions, 0)
    assert.equal(state.tools.list_agents.unsupportedDefinitions, 1)
    assert.equal(state.diagnostics.wrapperRecords, 2)
    assert.equal(state.diagnostics.registeredDefinitions, 3)
    assert.deepEqual((await f.scheduled()).value.map(row => row.id), ['guide', 'work'], 'retained old wrapper is inactive')
  }
  const thirdParty = def.execute
  dispose()
  assert.equal(def.execute, thirdParty, 'unload never overwrites the replacement')
})

await check('visible unknown registrations and frozen official definitions are explicitly partial', async f => {
  const def = f.tools.get('list_agents')
  Object.freeze(def)
  const { projection } = f.start()
  assert.equal(projection.getState().mode, 'partial')
  assert.equal(projection.getState().tools.list_agents.reason, 'unsupported-shape')
  const scope = {}, child = createScope(f.ctx, scope)
  f.live.push(scope)
  await child.ctx.inject(['tools'], ctx => ctx.tools.register({ name: 'list_agents', execute: async () => [],
    output: { schema: { type: 'array' }, render: () => [] } }))
  await tick()
  assert.equal(f.tools.get('list_agents', scope).execute.name, 'execute')
  assert.match(projection.getState().tools.list_agents.reason, /unknown-source/)
  assert.equal(projection.getState().tools.list_agents.unsupportedDefinitions, 2)
  await child.dispose()
})

for (const name of ['list_agents', 'send_message', 'interrupt_agent']) {
  await check(`BP-2: direct tools.execute + genuine identity catches caller abort (${name})`, async f => {
    const entered = Promise.withResolvers(), controller = new AbortController()
    const realIdentity = createIdentity({ foldDescriptor: () => undefined, sessionQuery: {
      observeSession: (_id, { signal }) => new Promise((_, reject) => {
        entered.resolve()
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
    } })
    const { dispose } = f.start({ identity: realIdentity })
    const call = f.tools.execute(input(name, controller.signal))
    await entered.promise
    dispose(); controller.abort(new Error('caller cancelled'))
    const result = await call
    assert.equal(result.error?.info?.code, 'ABORTED')
    assert.equal(f.counts.sends, 0); assert.equal(f.counts.stops, 0)
  })
}

await check('tools service rebuild disposes the old activation and bootstraps the replacement service', async f => {
  const projection = createModelProjection({ identity, source })
  const injection = await f.ctx.inject(['tools', 'agents'], ctx => ctx.effect(() => projection.start(ctx)))
  const oldDefinition = f.tools.get('list_agents')
  assert.equal(oldDefinition.execute.name, 'listProjection')
  await f.toolsHandle.dispose()
  await tick()
  assert.equal(oldDefinition.execute.name, 'execute')
  assert.equal(projection.getState().mode, 'unsupported')
  await f.ctx.plugin(ToolRuntime)
  for (let i = 0; i < 10; i++) await tick()
  assert.equal(projection.getState().mode, 'active')
  assert.equal(f.ctx.tools.get('list_agents').execute.name, 'listProjection')
  assert.notEqual(f.ctx.tools[ORIGINAL], f.tools[ORIGINAL])
  const result = await f.ctx.tools.execute(input())
  assert.deepEqual(result.value.map(row => row.id), ['work'])
  await injection.dispose()
})

await check('production observer preserves registering context, original disposer and duplicate-registration rollback', async f => {
  const target = f.tools[ORIGINAL], originalRegister = target.register
  let returned, caller, installedBeforeInsert
  target.register = function (def) {
    caller = this.ctx
    installedBeforeInsert = def.execute.name === 'listProjection'
    return returned = Reflect.apply(originalRegister, this, arguments)
  }
  const { projection } = f.start()
  const owner = [...f.ctx.registry.get(list).fibers][0].ctx
  const def = { name: 'list_agents', execute: async () => [], output: { schema: { type: 'array' }, render: () => [] } }
  const original = def.execute
  assert.throws(() => owner.tools.register(def), /duplicate|already/i)
  assert.equal(def.execute, original, 'failed registration rolls back its wrapper')
  assert.equal(installedBeforeInsert, true)
  assert.equal(caller.fiber, owner.fiber)
  assert.deepEqual(projection.getState().diagnostics, { registeredDefinitions: 3, wrapperRecords: 3 })
  const scope = { id: 'disposer-scope' }, child = createScope(owner, scope)
  const registering = child.ctx.extend({ fiber: owner.fiber })
  const disposer = registering.tools.register(def)
  assert.equal(disposer, returned, 'exact host disposer is returned')
  assert.equal(scopeOf(caller), scope)
  assert.equal(f.tools.get('list_agents', scope), def)
  disposer(); await tick()
  assert.equal(def.execute, original)
  assert.deepEqual(projection.getState().diagnostics, { registeredDefinitions: 3, wrapperRecords: 3 })
  await child.dispose()
})

await check('off/list-only/on activations and repeated reload preserve original definitions', async f => {
  const def = f.tools.get('list_agents'), original = def.execute
  const disabled = f.start({ hideGuidance: false })
  assert.equal(disabled.projection.getState().mode, 'off'); assert.equal(def.execute, original)
  disabled.dispose()
  const listOnly = f.start({ blockControl: false })
  assert.equal((await f.scheduled(input('send_message'))).isError, false)
  assert.deepEqual((await f.scheduled()).value.map(row => row.id), ['work'])
  const scope = {}, child = createScope(f.ctx, scope)
  await child.ctx.plugin(controls); await tick()
  assert.equal(f.tools.get('send_message', scope).execute.name, 'execute')
  listOnly.dispose(); await child.dispose()
  for (let i = 0; i < 8; i++) {
    const current = f.start()
    assert.equal(current.projection.getState().mode, 'active')
    assert.equal((await f.scheduled(input('interrupt_agent'))).isError, true)
    current.dispose()
    assert.equal(def.execute, original)
    assert.deepEqual(current.projection.getState().diagnostics, { registeredDefinitions: 0, wrapperRecords: 0 })
  }
})

await check('third-party outer register observer survives unload and the next activation', async f => {
  const target = f.tools[ORIGINAL]
  const first = f.start()
  const ours = target.register
  let forwarded = 0
  function thirdParty(...args) { forwarded++; return Reflect.apply(ours, this, args) }
  target.register = thirdParty
  first.dispose()
  assert.equal(target.register, thirdParty)
  const second = f.start()
  const scope = {}, child = createScope(f.ctx, scope)
  await child.ctx.plugin(list); await tick()
  assert.equal(f.tools.get('list_agents', scope).execute.name, 'listProjection')
  assert.equal(forwarded, 1)
  await child.dispose(); await tick()
  assert.equal(second.projection.getState().diagnostics.wrapperRecords, 3)
  second.dispose()
  assert.equal(target.register, thirdParty)
})

const outcome = { status: 'passed', assertions: results.length, results }
if (process.env.BP_FIX_EVIDENCE) {
  const output = resolve(process.env.BP_FIX_EVIDENCE)
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, 'runtime-regressions.json'), JSON.stringify(outcome, null, 2) + '\n')
}
console.log(JSON.stringify(outcome))

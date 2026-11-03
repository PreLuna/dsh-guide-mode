/**
 * O6 B' projection tests: registration-time definition decoration, state, and
 * wrapper ownership. The real registration/source probe lives under evidence;
 * this test supplies a minimal tools/registry fake so the decision logic and
 * lifecycle stay deterministic.
 *
 *   node guide-panel/test/model-projection.test.mjs
 */
import assert from 'node:assert'
import { filterGuidanceEntries, createModelProjection, CONTROL_DENY_REASON } from '../model-projection.js'

const guide = { kind: 'child', id: 'guide-1', label: '指导: G', status: 'running' }
const guideChild = { kind: 'child', id: 'guide-child-1', parent: 'guide-1', depth: 2, label: 'work', status: 'running' }
const worker = { kind: 'child', id: 'worker-1', parent: 'root', depth: 1, label: 'work', status: 'running' }
const workerChild = { kind: 'child', id: 'worker-child-1', parent: 'worker-1', depth: 2, label: 'work', status: 'running' }
const guideDiag = { kind: 'diagnostic', id: 'guide-diag-1', parent: 'guide-1', depth: 2, reason: 'unavailable' }

const isGuideId = async id => id === 'guide-1'
const parents = {
  'guide-1': 'parent-1',
  'guide-child-1': 'guide-1',
  'worker-1': 'parent-1',
  'worker-child-1': 'worker-1',
  'parent-1': 'root-1',
}
const parentOf = async id => parents[id]

// ── pure filter ────────────────────────────────────────────────────────────
{
  const input = [guide, worker, guideDiag]
  const output = await filterGuidanceEntries(input, 'children', isGuideId)
  assert.deepEqual(output.map(entry => entry.id), ['worker-1', 'guide-diag-1'])
  assert.equal(input.length, 3, 'the input array is not mutated')
}
{
  const input = [guide, guideChild, guideDiag, worker, workerChild]
  const output = await filterGuidanceEntries(input, 'descendants', isGuideId)
  assert.deepEqual(output.map(entry => entry.id), ['worker-1', 'worker-child-1'])
}
{
  const unknown = async () => undefined
  assert.deepEqual((await filterGuidanceEntries([guide, worker], 'children', unknown)).map(entry => entry.id),
    ['guide-1', 'worker-1'])
  const throwing = async () => { throw new Error('classification failed') }
  assert.deepEqual((await filterGuidanceEntries([guide, worker], 'children', throwing)).map(entry => entry.id),
    ['guide-1', 'worker-1'])
}
assert.equal(await filterGuidanceEntries(undefined, 'children', isGuideId), undefined)
assert.deepEqual(await filterGuidanceEntries([guide], 'children', undefined), [guide])

// ── fake Host ──────────────────────────────────────────────────────────────
function definition(name, execute) {
  return { name, execute, output: { schema: { type: 'array' }, render: () => [] } }
}

function environment({ defs = {}, fibers = true } = {}) {
  const listModule = { name: 'list-module' }
  const controlModule = { name: 'control-module' }
  const listRuntime = { fibers: fibers ? [{ ctx: { scope: undefined } }] : [] }
  const controlRuntime = { fibers: fibers ? [{ ctx: { scope: undefined } }] : [] }
  const listeners = new Map()
  const disposers = []
  const items = new Map(Object.entries(defs))
  const tools = {
    items,
    layers: { global: { tools: items }, peek: () => undefined },
    register(def) {
      this.items.set(def.name, def)
      const dispose = () => { this.items.delete(def.name) }
      disposers.push(dispose)
      return dispose
    },
    get(name, scope) {
      return this.items.get(name)
    },
  }
  const agents = { list: () => [{ id: 'parent-1' }] }
  const ctx = {
    registry: {
      get(module) {
        if (module === listModule) return listRuntime
        if (module === controlModule) return controlRuntime
        return undefined
      },
    },
    on(name, listener) {
      listeners.set(name, listener)
      return () => { listeners.delete(name) }
    },
  }
  const source = {
    listModule,
    controlModule,
    scopeOf: value => value?.scope,
  }
  return {
    tools, agents, ctx, source, listRuntime, controlRuntime, listModule, controlModule, items, listeners, disposers,
  }
}

function projectionFor(env, options = {}) {
  return createModelProjection({
    identity: { isGuideId, parentOf },
    source: env.source,
    tools: env.tools,
    agents: env.agents,
    ...options,
  })
}

// ── active: all three definitions wrapped and enforced ────────────────────
{
  let sends = 0
  let stops = 0
  const env = environment({
    defs: {
      list_agents: definition('list_agents', async () => [guide, worker]),
      send_message: definition('send_message', async () => { sends += 1; return { messageId: 'm1' } }),
      interrupt_agent: definition('interrupt_agent', async () => { stops += 1; return { accepted: true } }),
    },
  })
  const listDef = env.items.get('list_agents')
  const sendDef = env.items.get('send_message')
  const interruptDef = env.items.get('interrupt_agent')
  const originalList = listDef.execute
  const projection = projectionFor(env)
  assert.equal(projection.getState().mode, 'pending')
  const dispose = projection.start(env.ctx)
  assert.equal(projection.getState().mode, 'active')
  assert.equal(projection.getState().scanRevision, 1)
  assert.equal(projection.getState().tools.list_agents.wrappedDefinitions, 1)
  assert.equal(projection.getState().tools.send_message.wrappedDefinitions, 1)
  assert.equal(projection.getState().tools.interrupt_agent.wrappedDefinitions, 1)
  assert.notEqual(listDef.execute, originalList)

  const exec = { agent: { id: 'parent-1' }, signal: new AbortController().signal }
  assert.deepEqual((await listDef.execute({ scope: 'children' }, exec)).map(entry => entry.id), ['worker-1'])
  await assert.rejects(sendDef.execute({ agent_id: 'guide-1', message: 'x' }, exec), new RegExp(CONTROL_DENY_REASON))
  assert.equal(sends, 0, 'the denied send never reached the original body')
  assert.deepEqual(await sendDef.execute({ agent_id: 'worker-1', message: 'x' }, exec), { messageId: 'm1' })
  assert.equal(sends, 1)
  await assert.rejects(interruptDef.execute({ agent_id: 'guide-child-1' }, exec), new RegExp(CONTROL_DENY_REASON))
  assert.equal(stops, 0)
  assert.deepEqual(await interruptDef.execute({ agent_id: 'worker-1' }, exec), { accepted: true })
  assert.equal(stops, 1)

  // Guide child -> guide parent is reporting, not control of a guidance branch.
  assert.deepEqual(await sendDef.execute({ agent_id: 'parent-1', message: 'report' },
    { agent: { id: 'guide-1' }, signal: new AbortController().signal }), { messageId: 'm1' })
  assert.equal(sends, 2)

  dispose()
  assert.equal(projection.getState().mode, 'unsupported')
  assert.equal(projection.getState().reason, 'stopped')
  assert.equal(env.tools.register.name, 'register', 'the original register method is restored')
  assert.equal(listDef.execute, originalList)
}

// ── idle: no visible target tools ─────────────────────────────────────────
{
  const env = environment()
  const projection = projectionFor(env)
  const dispose = projection.start(env.ctx)
  assert.equal(projection.getState().mode, 'idle')
  assert.equal(projection.getState().reason, 'no-target-tools')
  assert.equal(projection.getState().tools.list_agents.notExposed, true)
  assert.equal(projection.getState().tools.send_message.notExposed, true)
  dispose()
}

// ── partial: visible definition with no verified source ───────────────────
{
  const env = environment({ defs: { list_agents: definition('list_agents', async () => [guide]) }, fibers: false })
  const listDef = env.items.get('list_agents')
  const original = listDef.execute
  const projection = projectionFor(env)
  const dispose = projection.start(env.ctx)
  assert.equal(projection.getState().mode, 'partial')
  assert.equal(projection.getState().tools.list_agents.unsupportedDefinitions, 1)
  assert.equal(listDef.execute, original, 'unknown definitions are never wrapped')
  dispose()
}

// ── off: no observer, no tools mutation ───────────────────────────────────
{
  const env = environment({ defs: { list_agents: definition('list_agents', async () => [guide]) } })
  const listDef = env.items.get('list_agents')
  const original = listDef.execute
  const projection = projectionFor(env, { hideGuidance: false })
  const dispose = projection.start(env.ctx)
  assert.equal(projection.getState().mode, 'off')
  assert.equal(projection.getState().reason, 'disabled')
  assert.equal(listDef.execute, original)
  dispose()
}

// ── blockControl=false: list only; controls retain the original body ──────
{
  let sends = 0
  const env = environment({
    defs: {
      list_agents: definition('list_agents', async () => [guide, worker]),
      send_message: definition('send_message', async () => { sends += 1; return { messageId: 'm1' } }),
    },
  })
  const sendDef = env.items.get('send_message')
  const projection = projectionFor(env, { blockControl: false })
  const dispose = projection.start(env.ctx)
  assert.equal(projection.getState().blockControl, false)
  assert.equal(projection.getState().tools.send_message.enabled, false)
  assert.equal(projection.getState().tools.send_message.wrappedDefinitions, 0)
  assert.deepEqual(await sendDef.execute({ agent_id: 'guide-1' }, { agent: { id: 'parent-1' } }),
    { messageId: 'm1' })
  assert.equal(sends, 1)
  dispose()
}

// ── cancellation: no original side effect; schema-valid sentinels ─────────
{
  let sends = 0
  let listCalls = 0
  const env = environment({
    defs: {
      list_agents: definition('list_agents', async () => { listCalls += 1; return [guide] }),
      send_message: definition('send_message', async () => { sends += 1; return { messageId: 'm1' } }),
    },
  })
  const listDef = env.items.get('list_agents')
  const sendDef = env.items.get('send_message')
  const projection = projectionFor(env)
  const dispose = projection.start(env.ctx)
  const aborted = new AbortController()
  aborted.abort()
  assert.deepEqual(await listDef.execute({ scope: 'children' }, { agent: { id: 'parent-1' }, signal: aborted.signal }), [])
  assert.equal(listCalls, 0, 'an already-aborted list call does not execute the body')
  assert.deepEqual(await sendDef.execute({ agent_id: 'guide-1' }, { agent: { id: 'parent-1' }, signal: aborted.signal }),
    { messageId: '' })
  assert.equal(sends, 0, 'an already-aborted control call does not execute the body')
  dispose()
}

// ── registration observer: decorates before the original register call ────
{
  const env = environment()
  const projection = projectionFor(env)
  const dispose = projection.start(env.ctx)
  assert.equal(projection.getState().mode, 'idle')
  const fresh = definition('list_agents', async () => [guide, worker])
  const originalFresh = fresh.execute
  env.tools.ctx = { fiber: { runtime: env.listRuntime } }
  const registered = env.tools.register(fresh)
  assert.equal(typeof registered, 'function')
  assert.notEqual(fresh.execute, originalFresh)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(projection.getState().mode, 'active')
  assert.equal(env.items.get('list_agents'), fresh)
  assert.deepEqual((await fresh.execute({ scope: 'children' }, { agent: { id: 'parent-1' } })).map(entry => entry.id),
    ['worker-1'])
  dispose()
  assert.equal(fresh.execute, originalFresh)
}

// ── unknown registrant is reported partial, not silently wrapped ──────────
{
  const env = environment()
  const projection = projectionFor(env)
  const dispose = projection.start(env.ctx)
  const fresh = definition('list_agents', async () => [guide])
  const originalFresh = fresh.execute
  env.tools.ctx = { fiber: { runtime: { name: 'third-party' } } }
  env.tools.register(fresh)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(projection.getState().mode, 'partial')
  assert.equal(projection.getState().tools.list_agents.unsupportedDefinitions, 1)
  assert.equal(fresh.execute, originalFresh)
  dispose()
}

// ── missing identity contract is explicit and installs nothing ────────────
{
  const env = environment()
  const projection = createModelProjection({ identity: {}, source: env.source, tools: env.tools, agents: env.agents })
  const dispose = projection.start(env.ctx)
  assert.equal(projection.getState().mode, 'unsupported')
  assert.equal(projection.getState().reason, 'identity-contract')
  assert.equal(env.tools.register.name, 'register')
  dispose()
}

// Missing lifetime/source contracts fail explicitly before installing anything.
for (const change of [
  env => { delete env.tools.layers },
  env => { env.source.scopeOf = undefined },
]) {
  const env = environment({ defs: { list_agents: definition('list_agents', async () => [guide]) } })
  change(env)
  const original = env.items.get('list_agents').execute
  const projection = projectionFor(env)
  const dispose = projection.start(env.ctx)
  assert.equal(projection.getState().mode, 'unsupported')
  assert.equal(env.items.get('list_agents').execute, original)
  assert.equal(env.tools.register.name, 'register')
  dispose()
}
{
  const env = environment({ defs: { list_agents: Object.freeze(definition('list_agents', async () => [guide])) } })
  const projection = projectionFor(env)
  const dispose = projection.start(env.ctx)
  assert.equal(projection.getState().mode, 'partial')
  assert.equal(projection.getState().tools.list_agents.reason, 'unsupported-shape')
  dispose()
}
{
  const env = environment()
  const projection = projectionFor(env, { sourceError: new Error('source hash mismatch') })
  projection.start(env.ctx)
  assert.equal(projection.getState().mode, 'unsupported')
  assert.match(projection.getState().reason, /hash mismatch/)
  assert.equal(env.tools.register.name, 'register')
}

console.log('guide-panel model projection: all checks passed')

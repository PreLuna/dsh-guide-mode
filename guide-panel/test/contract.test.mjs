/**
 * Composition contract: the real identity reader and the B' projection must
 * agree on the async classifier name. Fake-only projection tests previously
 * exposed `isGuide`, while `createIdentity()` returns `isGuideId`; this test
 * exercises the actual pair through a wrapped `list_agents` definition.
 *
 *   node guide-panel/test/contract.test.mjs
 */
import assert from 'node:assert'
import { createIdentity, GUIDE_PROVIDER } from '../identity.js'
import { createModelProjection } from '../model-projection.js'

const descriptor = (provider = GUIDE_PROVIDER, mode = 'continuable') => ({
  type: 'subagent/descriptor',
  data: { mode, provider },
})

const foldDescriptor = (events) => events.find(event => event.type === 'subagent/descriptor')?.data

function session(id, events) {
  return {
    id,
    header: { id, origin: 'subagent', parentSession: 'parent-1' },
    inheritedEventCount: 0,
    get seq() { return events.length },
    snapshotEvents(fromSeq = 0) { return events.slice(fromSeq) },
  }
}

const guide = session('guide-1', [descriptor()])
const worker = session('worker-1', [descriptor('spawn')])
const sessions = new Map([[guide.id, guide], [worker.id, worker]])
const identity = createIdentity({
  sessions: { get: id => sessions.get(id) },
  agents: { get: () => undefined },
  foldDescriptor,
})

assert.equal(typeof identity.isGuideId, 'function')
assert.equal(await identity.isGuideId('guide-1'), true)
assert.equal(await identity.isGuideId('worker-1'), false)

const listModule = {}
const listRuntime = { fibers: [{ ctx: { scope: undefined } }] }
const definition = {
  name: 'list_agents',
  execute: async () => [
    { kind: 'child', id: 'guide-1', label: '指导: contract', status: 'running' },
    { kind: 'child', id: 'worker-1', label: 'work', status: 'running' },
  ],
  output: { schema: { type: 'array' }, render: () => [] },
}
const tools = {
  items: new Map([['list_agents', definition]]),
  register(def) { this.items.set(def.name, def); return () => {} },
  get(name) { return this.items.get(name) },
}
tools.layers = { global: { tools: tools.items }, peek: () => undefined }
const agents = { list: () => [] }
const ctx = {
  registry: { get: module => module === listModule ? listRuntime : undefined },
  on: () => () => {},
}
const source = { listModule, controlModule: {}, scopeOf: value => value?.scope }

const projection = createModelProjection({ identity, source, tools, agents })
const dispose = projection.start(ctx)
assert.equal(projection.getState().mode, 'active')
const output = await definition.execute({ scope: 'children' }, { agent: { id: 'parent-1' } })
assert.deepEqual(output.map(entry => entry.id), ['worker-1'],
  'the real identity reader must drive the B\u2032 list wrapper')
dispose()

console.log('guide-panel identity/projection contract: all checks passed')

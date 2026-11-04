/**
 * Host-half smoke test: the guidance route, its subagent provider, and the
 * parent-notification shield.
 *
 * Runs the real `apply()` against a fake cordis context (webServer / agents /
 * subagents / connection) and drives the registered HTTP route through a real
 * node:http server, so the body reader, the fence, the error mapping and the
 * `startActivation` contract are all exercised without booting DSH.
 *
 *   node guide-panel/test/host-route.test.mjs
 */
import http from 'node:http'
import assert from 'node:assert'
import { createHash } from 'node:crypto'
import { createAdmission } from '../../guide-admission/core.js'
import { apply as applyShield } from '../../guide-shield/core.js'
import {
  apply,
  GuideForkProvider,
  GUIDE_PRESET,
  GUIDE_PROVIDER,
  hostCompatibility,
  resolveLimits,
} from '../index.js'

// ── the provider: seed = the parent's balanced completed-turn prefix ──────
const provider = new GuideForkProvider()
assert.equal(provider.name, GUIDE_PROVIDER)
assert.equal(provider.capabilities.agentPreset, true, 'an independent preset needs this capability')
assert.equal(provider.inheritsParentContext, false, 'the service refuses a preset when this is true')
assert.equal(typeof provider.prepareContinuable, 'function')

const eventLog = [
  { type: 'turn/start', seq: 0 },
  { type: 'assistant/message', seq: 1 },
  { type: 'turn/end', seq: 2 },
  { type: 'turn/start', seq: 3 },
  { type: 'tool/call', seq: 4 },
]
const seeded = await provider.prepareContinuable({ parent: { session: { snapshotEvents: () => eventLog } } })
assert.equal(seeded.seed.length, 3, 'the open turn after the last turn/end is excluded')
assert.equal(seeded.seed[2].type, 'turn/end')

const noTurns = await provider.prepareContinuable({
  parent: { session: { snapshotEvents: () => [{ type: 'turn/start', seq: 0 }] } },
})
assert.equal(noTurns.seed, undefined, 'no completed turn means a fresh child')
assert.equal((await provider.prepareContinuable({ parent: {} })).seed, undefined)

// ── the route ─────────────────────────────────────────────────────────────
const calls = []
const forwarded = []
let registeredProvider
const parent = {
  id: 'session-a',
  followup: (input) => { forwarded.push(['followup', input]) },
  steer: (input) => { forwarded.push(['steer', input]) },
  inject: (input) => { forwarded.push(['inject', input]) },
}
const services = {
  webServer: { register: (route) => { services.route = route; return () => {} } },
  connection: { requestRejection: (req) => (req.headers['x-bad'] === '1' ? 403 : undefined) },
  agents: { get: (id) => (id === 'session-a' ? parent : undefined), list: () => [parent] },
  subagents: {
    registerProvider: (value) => {
      registeredProvider = value
      return () => {}
    },
    startActivation: async (spec) => {
      calls.push(spec)
      return { childId: 'session-child-1', messageId: 'message-1', result: Promise.resolve({}) }
    },
  },
}
const ctx = {
  get: (name) => services[name],
  provide: (name, value) => { services[name] = value },
  inject: (_names, callback) => callback(ctx),
  effect: (fn) => { fn() },
  on: () => () => {},
  logger: { info() {}, warn() {} },
}

let nativeCapacity = 8
const manager = { resident: new Map(), rootPools: new WeakMap(), materializations: new Set(),
  maxActiveSubagents: () => nativeCapacity, assertAdmitting() {}, assertLiveParent() {}, materialize() { return Promise.resolve() } }
const methodHash = createHash('sha256').update(manager.materialize.toString().trim()).digest('hex')
class SubagentError extends Error { constructor(message, code) { super(message); this.code = code } }
function capacityService(capacity = 8, reserve = 2, maxGuides = 4, used = 0, guides = 0) {
  services.guideAdmission?.dispose()
  nativeCapacity = capacity; manager.resident.clear()
  manager.rootPools.set(parent, { slots: new Set(Array.from({ length: used }, () => Symbol())) })
  for (let i = 0; i < guides; i++) manager.resident.set(`g-${i}`, { kind: 'local', childId: `g-${i}`, handle: { agent: { session: {
    header: { origin: 'subagent' }, inheritedEventCount: 0,
    snapshotEvents: () => [{ type: 'subagent/descriptor', data: { mode: 'continuable', provider: 'guide-fork' } }],
  } } } })
  services.guideAdmission = createAdmission({ agents: services.agents, foldDescriptor: events => events[0]?.data,
    SubagentError, methodHash, reserve, maxGuides })
  services.guideAdmission.bind(manager)
}
services.sessions = { get() {} }
services.sessionQuery = { async observeSession() { return undefined } }
services.workspaceRegistry = { async archiveSession() {} }
services.sessionTitle = { rename() {} }
capacityService()
applyShield(ctx, {}, events => events.find(event => event.type === 'subagent/descriptor')?.data)
await apply(ctx, {}, {supported:true})
assert.ok(services.route, 'the route must be registered')
assert.equal(registeredProvider?.name, GUIDE_PROVIDER, 'apply must register the guidance provider')

// Minimal host probe: this fixture has agents/subagents but no tools,
// sessions or sessionQuery. It is a report only; nothing is registered.
const shape = hostCompatibility(ctx)
assert.deepEqual(shape, {
  tools: false,
  sessions: true,
  agents: true,
  sessionQuery: true,
  subagents: true,
})
const completeShape = hostCompatibility({
  get: (name) => ({
    tools: {},
    sessions: { get() {} },
    agents: { get() {} },
    sessionQuery: { observeSession() {} },
    subagents: { startActivation() {} },
  })[name],
})
assert.deepEqual(completeShape, {
  tools: true,
  sessions: true,
  agents: true,
  sessionQuery: true,
  subagents: true,
})

const server = http.createServer((req, res) => services.route.handler(req, res))
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const url = `http://127.0.0.1:${port}/guide/api/start`

const post = async (body, headers = {}, path = 'start') => {
  const response = await fetch(`http://127.0.0.1:${port}/guide/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

// The panel's health probe: proves this host half is the live one.
const ping = await post({}, {}, 'ping')
assert.equal(ping.status, 200)
assert.equal(ping.body.value.service, 'guide-panel')
assert.equal(calls.length, 0, 'a ping must not create a child')

// O8 is enabled from startup; no parent has been shielded yet, but "off"
// means explicitly disabled, not "not used yet".
const initialState = await post({}, {}, 'state')
assert.equal(initialState.status, 200)
assert.equal(initialState.body.value.settlementShield.mode, 'active')
assert.equal(initialState.body.value.settlementShield.inject, true)

// The happy path: one child with BOTH the guidance preset and the parent seed.
const ok = await post({ sessionId: 'session-a', question: '我现在该用什么技能？' })
assert.equal(ok.status, 200, JSON.stringify(ok.body))
assert.equal(ok.body.value.childId, 'session-child-1')
assert.equal(ok.body.value.parentSessionId, 'session-a')
assert.match(ok.body.value.label, /^指导: /)
assert.equal(calls.length, 1)
assert.equal(calls[0].provider, GUIDE_PROVIDER)
assert.equal(calls[0].delivery, 'caller')
assert.equal(calls[0].request.parent, parent)
assert.equal(calls[0].request.agentPreset, GUIDE_PRESET, 'the child must be composed with the guidance preset')
assert.match(calls[0].request.prompt[0].text, /guidance conversation/i)
assert.match(calls[0].request.prompt[0].text, /我现在该用什么技能？/)


// The settlement notice of that child never reaches the parent...
parent.followup({
  content: [{ type: 'text', text: 'Background subagent session-child-1 finished and will do no further work unless you send it more.' }],
})
parent.steer({
  content: [{ type: 'text', text: 'Background subagent session-child-1 was stopped before it finished.' }],
})
// The closing/teardown path uses `inject`, not followup/steer.
parent.inject({
  source: { kind: 'subagent-settled', form: 'notice', summary: 'x', senderSessionId: 'session-child-1' },
  content: [{ type: 'text', text: 'Background subagent session-child-1 finished.' }],
})
assert.equal(forwarded.length, 0, 'guidance settlements must be swallowed on all three paths')

// ...while every other waking delivery still goes through.
const ordinary = { content: [{ type: 'text', text: '继续' }] }
parent.followup(ordinary)
assert.deepEqual(forwarded, [['followup', ordinary]])

// Another child's settlement is not ours to swallow.
forwarded.length = 0
parent.followup({ content: [{ type: 'text', text: 'Background subagent other-child finished.' }] })
assert.equal(forwarded.length, 1)

// A sibling's settlement whose CLOSING text merely quotes our prefix is not
// ours: only the first (summary) block may identify the child.
parent.followup({
  content: [
    { type: 'text', text: 'Background subagent other-child finished.' },
    { type: 'text', text: 'Its closing message:' },
    { type: 'text', text: 'Background subagent session-child-1 finished and will do no further work unless you send it more.' },
  ],
})
assert.equal(forwarded.length, 2, 'closing text must not classify a sibling settlement')

// A user prompt that quotes a settlement prefix is still a user prompt.
parent.followup({
  source: { kind: 'user' },
  content: [{ type: 'text', text: 'Background subagent session-child-1 finished.' }],
})
assert.equal(forwarded.length, 3, 'a user message must never be swallowed')

// Source-first: a guidance settlement is dropped even when its summary text
// does not match the legacy prefix.
parent.followup({
  source: { kind: 'subagent-settled', form: 'notice', summary: 'x', senderSessionId: 'session-child-1' },
  content: [{ type: 'text', text: 'Custom summary' }],
})
assert.equal(forwarded.length, 3, 'the source id identifies the guidance child')

// The `inject` path forwards everything that is not a guidance settlement.
forwarded.length = 0
const ordinaryInject = { content: [{ type: 'text', text: '继续' }] }
parent.inject(ordinaryInject)
assert.deepEqual(forwarded, [['inject', ordinaryInject]], 'ordinary inject must be forwarded')

// A blank question is a client bug, not a child.
const blank = await post({ sessionId: 'session-a', question: '   ' })
assert.equal(blank.status, 400)
assert.match(blank.body.error.message, /缺少问题/)

// A session with no live agent cannot seed anything.
const cold = await post({ sessionId: 'session-not-live', question: 'x' })
assert.equal(cold.status, 400)
assert.match(cold.body.error.message, /不在运行状态/)

// The connection fence runs before any work.
const fenced = await post({ sessionId: 'session-a', question: 'x' }, { 'x-bad': '1' })
assert.equal(fenced.status, 403)

// Unknown method and wrong verb.
const unknown = await fetch(`http://127.0.0.1:${port}/guide/api/nope`, { method: 'POST', body: '{}' })
assert.equal(unknown.status, 404)
const wrongVerb = await fetch(url)
assert.equal(wrongVerb.status, 405)

// The client scheduler reads the capacity/archive policy from the host.
const state = await post({}, {}, 'state')
assert.equal(state.status, 200)
assert.equal(state.body.value.capacity, 8)
assert.equal(state.body.value.reserve, 2)
assert.equal(state.body.value.maxGuides, 4)
assert.equal(state.body.value.admission.budget, 6)
assert.equal(state.body.value.admission.globalScope, 'profile')
assert.equal('effectiveMaxGuides' in state.body.value, false)
assert.equal(state.body.value.archive.lowDelayMs, 600_000)
assert.equal(state.body.value.archive.auto, false, 'O5 automatic archiving is opt-in')
assert.equal(state.body.value.archive.holdMs, 120_000)
assert.equal(state.body.value.modelProjection.mode, 'pending', 'this fixture never reaches the tools/agents injection')
assert.equal(state.body.value.modelProjection.reason, 'not-started')
assert.equal(state.body.value.settlementShield.mode, 'active', 'the parent was shielded during start')
assert.equal(state.body.value.settlementShield.reason, null)
assert.equal(state.body.value.settlementShield.inject, true)

// Panel reads the Host service; catalog/labels no longer participate.
assert.equal(resolveLimits({ archive: { holdMs: 90_000 } }).archive.holdMs, 90_000)
assert.equal(resolveLimits({}).archive.auto, false)
assert.equal(resolveLimits({ archive: { auto: true } }).archive.auto, true)
capacityService(8, 2, 4, 6)
const full = await post({ sessionId: 'session-a', question: 'x' })
assert.equal(full.status, 400)
assert.match(full.body.error.message, /名额紧张/)
capacityService(8, 2, 4, 0, 4)
const tooMany = await post({ sessionId: 'session-a', question: 'x' })
assert.equal(tooMany.status, 400)
assert.match(tooMany.body.error.message, /并发已达/)
for (const [capacity, reserve, maxGuides] of [[2,2,4],[1,2,4],[8,2,0]]) {
  capacityService(capacity,reserve,maxGuides)
  const denied = await post({sessionId:'session-a',question:'zero'})
  assert.equal(denied.status,400)
  const config = await post({sessionId:'session-a'}, {}, 'state')
  assert.equal(config.body.value.admission.allowed,false)
  assert.equal(config.body.value.admission.budget,Math.max(0,capacity-reserve))
}
services.guideAdmission.dispose(); delete services.guideAdmission
const absent = await post({sessionId:'session-a',question:'missing'})
assert.equal(absent.status,503)
assert.match(absent.body.error.message,/面板暂不可用/)
server.close()
console.log('guide-panel host route: all checks passed')

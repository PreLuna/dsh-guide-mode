import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAdapter, createIdentityReader, createSubagentsFacade, functionHash,
  JOIN_HASH, DRIVER_HASH, providerFromObservation, assertSingleDriver } from '../core.js'

const { Context, originalDriver, foldSubagentDescriptor: fold, snapshotSubagentDescriptor: descriptor, rawJoin } = globalThis.hostTest
const tick = () => new Promise(resolve => setImmediate(resolve))
const tests = []
function check(name, fn) { tests.push(test(name, { timeout: 5000 }, fn)) }
function setup() {
  const ctx = new Context()
  const actors = new Map()
  const observations = new Map()
  const parent = { id: 'parent', status: 'idle', session: {}, inbox: { nextTurn: [], nextStep: [], remove() {} } }
  const prompts = []
  parent.followup = message => prompts.push(message)
  actors.set(parent.id, parent)
  const manager = { resident: new Map(), materializations: new Set(), waitForChildren: rawJoin }
  const service = { manager, value: 42, readValue() { return this.value }, waitForChildren: p => manager.waitForChildren(p) }
  const goal = { id: 'goal', objective: 'test', revision: 1, phase: 'active', activation: 'disarmed', roundsStarted: 0, maxGoalRounds: 3 }
  ctx.provide('agents', { list: () => [...actors.values()], get: id => actors.get(id), withoutInitiator: fn => fn() })
  ctx.provide('goals', { get: () => goal, disarm() { goal.activation = 'disarmed' } })
  ctx.provide('sessions', { flush: async () => {} })
  ctx.provide('subagents', service)
  ctx.provide('sessionQuery', { observeSession: async id => observations.get(id) })
  const controller = new AbortController()
  const identify = createIdentityReader(ctx, controller.signal, fold)
  const modes = []
  const facade = createSubagentsFacade(ctx, identify, { set: (...value) => modes.push(value) }, controller.signal, true)
  function child(id, provider = 'spawn', options = {}) {
    const idle = Promise.withResolvers(), result = Promise.withResolvers()
    const event = { seq: options.cut ?? 0, type: 'subagent/descriptor', data: descriptor({ mode: 'continuable', provider, label: id }) }
    const session = { id, header: { id, origin: 'subagent', parentSession: parent.id }, seq: event.seq + 1,
      isOwnSeq: seq => seq >= (options.cut ?? 0) && seq < session.seq }
    const agent = { id, session, status: 'running', inbox: { nextTurn: [], nextStep: [] }, whenIdle: () => idle.promise }
    const item = { kind: 'local', parent, childId: id, handle: { agent }, ancestry: new WeakSet([parent, agent]),
      ownedChildren: new Set(), result, poke: Promise.withResolvers() }
    const source = { header: session.header, inheritedEventCount: options.cut ?? 0, events: [...(options.seed ?? []), event],
      [Symbol.dispose]() {} }
    session.inheritedEventCount = source.inheritedEventCount
    session.snapshotEvents = (from = 0) => source.events.slice(from)
    actors.set(id, agent); observations.set(id, source)
    if (options.publish !== false) manager.resident.set(id, item)
    return { agent, item, session, source, event, publish() {
      ctx.emit('session/event', session, event); manager.resident.set(id, item)
    }, finish() {
      manager.resident.delete(id); agent.status = 'idle'; idle.resolve(); result.resolve()
    } }
  }
  return { ctx, actors, parent, manager, service, goal, prompts, child, facade, identify, modes,
    close: () => { controller.abort(); return ctx.fiber.dispose() } }
}
function watch(promise) { const result = { done: false }; result.promise = promise.then(x => { result.done = true; return x }); return result }

check('installed join matches the reviewed fingerprint', () => assert.equal(functionHash(rawJoin), JOIN_HASH))
check('own descriptor excludes inherited identity and the establishing descriptor wins', async () => {
  const s = setup()
  try {
    const inherited = { seq: 0, type: 'subagent/descriptor', data: descriptor({ mode: 'continuable', provider: 'guide-fork', label: 'ancestor' }) }
    const worker = s.child('worker', 'spawn', { cut: 1, seed: [inherited] })
    assert.equal(providerFromObservation(worker.source, worker.session, fold), 'spawn')
    worker.source.events.push({ seq: 2, type: 'subagent/descriptor', data: { version: -1 } })
    assert.equal(providerFromObservation(worker.source, worker.session, fold), 'spawn')
    worker.source.events.push({ seq: 3, type: 'subagent/descriptor', data: descriptor({ mode: 'continuable', provider: 'guide-fork', label: 'later' }) })
    assert.equal(providerFromObservation(worker.source, worker.session, fold), 'spawn')
    const guide = s.child('guide', 'guide-fork')
    guide.source.events.push({ seq: 1, type: 'subagent/descriptor', data: descriptor({ mode: 'continuable', provider: 'spawn', label: 'later' }) })
    assert.equal(await s.identify(guide.agent), 'guide-fork')
    s.ctx.emit('session/event', guide.session, { ...guide.source.events[1], seq: 0 })
    assert.equal(await s.identify(guide.agent), 'guide-fork')
    guide.finish()
    worker.finish()
  } finally { await s.close() }
})
check('guidance is skipped only in the facade; work and native service still wait', async () => {
  const s = setup()
  try {
    const guide = s.child('guide', 'guide-fork'), worker = s.child('worker')
    const native = watch(s.service.waitForChildren(s.parent))
    const filtered = watch(s.facade.waitForChildren(s.parent))
    await tick(); assert.equal(filtered.done, false)
    worker.finish(); await filtered.promise
    assert.equal(native.done, false); assert.equal(s.manager.resident.size, 1)
    assert.equal(s.facade.readValue(), 42)
    guide.finish(); await native.promise
  } finally { await s.close() }
})
check('pending creation settles before a newly published guidance is excluded', async () => {
  const s = setup()
  try {
    const pending = Promise.withResolvers()
    const materialization = { lineage: [s.parent], settled: pending.promise }
    s.manager.materializations.add(materialization)
    const wait = watch(s.facade.waitForChildren(s.parent))
    await tick(); assert.equal(wait.done, false)
    const guide = s.child('late-guide', 'guide-fork', { publish: false }); guide.publish()
    s.manager.materializations.delete(materialization); pending.resolve()
    await wait.promise; assert.equal(guide.agent.status, 'running'); guide.finish()
  } finally { await s.close() }
})
check('pending work and work arriving during a join are retained', async () => {
  const s = setup()
  try {
    const pending = Promise.withResolvers(), tracked = { lineage: [s.parent], settled: pending.promise }
    s.manager.materializations.add(tracked)
    const wait = watch(s.facade.waitForChildren(s.parent)); await tick()
    const first = s.child('first'); first.publish()
    s.manager.materializations.delete(tracked); pending.resolve(); await tick()
    assert.equal(wait.done, false)
    const second = s.child('second'); first.finish(); await tick(); assert.equal(wait.done, false)
    second.finish(); await wait.promise
  } finally { await s.close() }
})
check('guidance with owned work, closing guidance, and external work retain native waiting', async () => {
  const s = setup()
  try {
    const guide = s.child('guide', 'guide-fork'); guide.item.ownedChildren.add('nested')
    const wait = watch(s.facade.waitForChildren(s.parent)); await tick(); assert.equal(wait.done, false)
    guide.item.ownedChildren.clear(); guide.finish(); await wait.promise
    const externalResult = Promise.withResolvers()
    const external = { kind: 'external', childId: 'external', parent: s.parent, ancestry: new WeakSet([s.parent]), result: externalResult }
    s.manager.resident.set('external', external)
    const other = watch(s.facade.waitForChildren(s.parent)); await tick(); assert.equal(other.done, false)
    s.manager.resident.delete('external'); externalResult.resolve(); await other.promise
    const closing = s.child('closing-guide', 'guide-fork'); closing.item.closing = closing.item.result.promise
    const closeWait = watch(s.facade.waitForChildren(s.parent)); await tick(); assert.equal(closeWait.done, false)
    closing.finish(); await closeWait.promise
  } finally { await s.close() }
})
check('idle parked inbox does not force joining, matching upstream behavior', async () => {
  const s = setup()
  try {
    const child = s.child('parked'); child.finish()
    child.agent.inbox.nextTurn.push({ id: 'later' })
    child.agent.whenIdle = async () => {}; s.manager.resident.set('parked', child.item)
    await s.facade.waitForChildren(s.parent)
  } finally { await s.close() }
})
check('changed private method falls back and identity observations are released', async () => {
  const s = setup()
  try {
    const guide = s.child('guide', 'guide-fork'); let released = 0
    guide.source[Symbol.dispose] = () => released++
    assert.equal(await s.identify(guide.agent), 'guide-fork'); assert.equal(released, 1)
    let called = 0; s.manager.waitForChildren = async () => { called++; return true }
    assert.equal(await s.facade.waitForChildren(s.parent), true)
    assert.equal(called, 1); assert.deepEqual(s.modes.at(-1), ['native', 'unsupported-manager'])
    guide.finish()
  } finally { await s.close() }
})
check('driver queues real upstream messages and cleanup removes authority', async () => {
  const s = setup()
  try {
    const guide = s.child('guide', 'guide-fork')
    const adapter = createAdapter(originalDriver, { driverHash: DRIVER_HASH, foldDescriptor: fold })
    const handle = s.ctx.plugin(adapter); await handle
    s.goal.activation = 'armed'; s.ctx.emit('goal/changed', { agent: s.parent, change: { operation: 'resume' } })
    for (let i = 0; i < 8 && s.prompts.length === 0; i++) await tick()
    assert.equal(s.prompts.length, 1); assert.equal(s.prompts[0].source.round, 1)
    assert.equal(guide.agent.status, 'running')
    await handle.dispose(); assert.equal(s.goal.activation, 'disarmed')
    s.goal.activation = 'armed'; s.ctx.emit('goal/changed', { agent: s.parent, change: { operation: 'resume' } }); await tick()
    assert.equal(s.prompts.length, 1); assert.equal(s.service.manager.waitForChildren, rawJoin)
    guide.finish()
  } finally { await s.close() }
})
check('durability failure disarms the upstream driver before queuing another round', async () => {
  const s = setup()
  try {
    s.ctx.sessions.flush = async () => { throw new Error('LI simulated durability failure') }
    const handle = s.ctx.plugin(createAdapter(originalDriver, { driverHash: DRIVER_HASH, foldDescriptor: fold })); await handle
    s.goal.activation = 'armed'; s.ctx.emit('goal/changed', { agent: s.parent, change: { operation: 'resume' } })
    for (let i = 0; i < 8 && s.goal.activation !== 'disarmed'; i++) await tick()
    assert.equal(s.goal.activation, 'disarmed'); assert.equal(s.prompts.length, 0)
    await handle.dispose()
  } finally { await s.close() }
})
check('facade follows a replacement upstream service after an asynchronous identity read', async () => {
  const s = setup()
  try {
    const guide = s.child('guide', 'guide-fork')
    const gate = Promise.withResolvers(), started = Promise.withResolvers()
    s.ctx.sessionQuery.observeSession = async () => { started.resolve(); await gate.promise; return guide.source }
    const waiting = s.facade.waitForChildren(s.parent); await started.promise
    let calls = 0
    const replacement = { manager: {}, value: 84, readValue() { return this.value }, waitForChildren: async () => { calls++; return 'replacement' } }
    const lookup = s.ctx.get.bind(s.ctx)
    s.ctx.get = key => key === 'subagents' ? replacement : lookup(key)
    gate.resolve()
    assert.equal(await waiting, 'replacement'); assert.equal(calls, 1)
    assert.equal(s.facade.readValue(), 84); assert.equal(s.manager.waitForChildren, rawJoin)
    guide.finish()
  } finally { await s.close() }
})
check('unknown driver preserves native behavior and duplicate entries fail loudly', async () => {
  const s = setup()
  try {
    const handle = s.ctx.plugin(createAdapter(originalDriver, { driverHash: 'unknown', foldDescriptor: fold })); await handle
    assert.equal(s.ctx.get('guideGoalAdapter').getState().mode, 'native')
    await handle.dispose()
    assert.throws(() => assertSingleDriver({ get: () => ({ entries: () => [
      { options: { name: '@deepseek-ai/dsh-goal-round-driver' }, disabled: false },
      { options: { name: '@local/dsh-guide-goal-adapter' }, disabled: false },
    ] }) }), /exactly one/)
  } finally { await s.close() }
})

await Promise.all(tests)

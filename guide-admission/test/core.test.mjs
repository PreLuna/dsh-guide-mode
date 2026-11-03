import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createAdmission, apply } from '../core.js'

class NativeError extends Error { constructor(message, code) { super(message); this.code = code } }
const foldDescriptor = events => events.find(event => event.type === 'subagent/descriptor')?.data
const session = (provider, extra = {}) => ({ header: { origin: 'subagent' }, inheritedEventCount: 0,
  snapshotEvents: () => [{ type: 'subagent/descriptor', data: { mode: 'continuable', provider } }], ...extra })
let count = 0
const check = fn => { fn(); count++ }
function setup(config = {}) {
  const a = { id: 'a' }, b = { id: 'b' }, agents = new Map([['a', a], ['b', b]])
  const deferred = []
  let capacity = 8
  const manager = {
    resident: new Map(), rootPools: new WeakMap(), materializations: new Set(),
    maxActiveSubagents: () => capacity,
    assertAdmitting() { if (this.draining) throw new NativeError('draining', 'DRAINING') },
    assertLiveParent(parent) { if (agents.get(parent.id) !== parent) throw new NativeError('stale', 'UNAUTHORIZED') },
    materialize(inputs) {
      this.assertAdmitting(inputs.parent); inputs.signal.throwIfAborted()
      let pool = this.rootPools.get(inputs.parent)
      if (!pool) this.rootPools.set(inputs.parent, pool = { slots: new Set() })
      if (pool.slots.size >= capacity) throw new NativeError('full', 'ACTIVATION_LIMIT_REACHED')
      const slot = Symbol(), pending = {}, promise = Promise.withResolvers()
      pool.slots.add(slot); this.materializations.add(pending)
      deferred.push({ inputs, pool, slot, pending, promise })
      return promise.promise
    },
  }
  const methodHash = createHash('sha256').update(manager.materialize.toString().trim()).digest('hex')
  const service = createAdmission({ agents, foldDescriptor, SubagentError: NativeError, methodHash, ...config })
  const native = manager.materialize
  service.bind(manager)
  const input = (childId, provider = 'guide-fork', parent = a) => ({ kind: 'local', childId, provider, parent, signal: new AbortController().signal })
  function publish(index) {
    const item = deferred[index]
    const activation = { kind: 'local', childId: item.inputs.childId, parent: item.inputs.parent, pool: item.pool,
      handle: { agent: { session: session(item.inputs.provider) } } }
    manager.resident.set(activation.childId, activation); manager.materializations.delete(item.pending); item.promise.resolve(activation)
    return activation
  }
  function release(index) {
    const item = deferred[index]
    manager.resident.delete(item.inputs.childId); item.pool.slots.delete(item.slot); manager.materializations.delete(item.pending)
  }
  return { a, b, agents, manager, service, native, input, publish, release, deferred, methodHash, setCapacity: value => { capacity = value } }
}

for (const [capacity, reserve, maxGuides] of [[2,2,4],[1,2,4],[8,2,0],[8,8,4],[8,9,4]]) {
  const t = setup({ reserve, maxGuides }); t.setCapacity(capacity)
  check(() => assert.throws(() => t.manager.materialize(t.input('g')), /名额|并发/))
  check(() => assert.equal(t.service.snapshot(t.a).budget, Math.max(0,capacity-reserve)))
  check(() => assert.equal(t.deferred.length, 0))
  t.service.dispose()
}
{
  const t = setup({ maxGuides: 1 })
  const promise = t.manager.materialize(t.input('g1'))
  check(() => assert.equal(promise, t.deferred[0].promise.promise))
  check(() => assert.equal(t.service.snapshot(t.a).globalGuides, 1))
  check(() => assert.throws(() => t.manager.materialize(t.input('g2','guide-fork',t.b)), /并发/))
  const activation = t.publish(0)
  check(() => assert.equal(t.service.snapshot(t.a).globalGuides, 1))
  await promise
  activation.closing = Promise.resolve()
  check(() => assert.equal(t.service.snapshot(t.a).globalGuides, 1))
  t.release(0)
  check(() => assert.equal(t.service.snapshot(t.a).globalGuides, 0))
  // A late old completion must not release this new same-id epoch.
  const second = t.manager.materialize(t.input('g1')); t.publish(1); await second
  check(() => assert.equal(t.service.snapshot(t.a).globalGuides, 1))
  t.release(1); t.service.dispose()
}
{
  const t = setup()
  const pending = {}; t.manager.materializations.add(pending)
  t.service.dispose()
  const adopted = createAdmission({ agents:t.agents, foldDescriptor, SubagentError:NativeError, methodHash:t.methodHash })
  adopted.bind(t.manager)
  check(() => assert.equal(adopted.snapshot(t.a).mode, 'reconciling'))
  check(() => assert.throws(() => t.manager.materialize(t.input('g')), /无法核实/))
  const worker = t.manager.materialize(t.input('w','spawn'))
  check(() => assert.equal(worker, t.deferred[0].promise.promise))
  t.publish(0); await worker; t.release(0)
  t.manager.materializations.delete(pending)
  check(() => assert.equal(adopted.snapshot(t.a).allowed, true))
  adopted.dispose()
}
{
  const t = setup()
  // Diagnostic failure must not touch ordinary work.
  t.manager.maxActiveSubagents = () => { throw Error('diagnostics failed') }
  const p = t.manager.materialize(t.input('w','spawn')); t.publish(0); await p
  check(() => assert.equal(t.service.snapshot(t.a).reason, 'snapshot-failed'))
  check(() => assert.throws(() => t.manager.materialize(t.input('g')), /无法核实/))
  t.release(0)
  const abort = new AbortController(); abort.abort(new NativeError('cancel', 'ABORTED'))
  check(() => assert.throws(() => t.manager.materialize({...t.input('g'),signal:abort.signal}), e=>e.code==='ABORTED'))
  t.manager.draining = true
  check(() => assert.throws(() => t.manager.materialize({...t.input('g'),signal:abort.signal}), e=>e.code==='DRAINING'))
  t.manager.draining = false
  t.agents.set('a',{id:'a'})
  check(() => assert.throws(() => t.manager.materialize(t.input('g')), e=>e.code==='UNAUTHORIZED'))
  t.service.dispose()
}
{
  const t = setup()
  const unknown = {kind:'local', childId:'unknown', handle:{agent:{session:session('spawn',{snapshotEvents:()=>[]})}}}
  t.manager.resident.set('unknown',unknown)
  check(() => assert.equal(t.service.snapshot(t.a).unknown,1))
  t.manager.resident.delete('unknown')
  const p=t.manager.materialize(t.input('fake','spawn')); const act=t.publish(0); await p
  act.handle.agent.label='指导: fake'; act.handle.agent.session.agentPreset='guide'
  check(() => assert.equal(t.service.snapshot(t.a).globalGuides,0))
  t.release(0)
  const wrapped=t.manager.materialize, outer=function(...args){return Reflect.apply(wrapped,this,args)}
  t.manager.materialize=outer; t.service.dispose()
  check(()=>assert.equal(t.manager.materialize,outer))
  const after=t.manager.materialize(t.input('g')); t.publish(1); await after; t.release(1)
}
{
  const t=setup(); t.service.dispose()
  const services={agents:t.agents,subagents:{manager:t.manager}}, cleanups=[]
  const ctx={get:key=>services[key],provide:(key,value)=>services[key]=value,effect:fn=>cleanups.push(fn())}
  apply(ctx,{}, {foldDescriptor,SubagentError:NativeError,methodHash:t.methodHash})
  const old=t.manager
  const pending=old.materialize(t.input('g')); t.publish(0); await pending
  const fresh=setup(); fresh.service.dispose()
  services.subagents.manager=fresh.manager
  check(()=>assert.equal(services.guideAdmission.state().globalGuides,1))
  check(()=>assert.throws(()=>old.materialize(t.input('g2')), /manager-replaced/))
  t.release(0)
  check(()=>assert.equal(services.guideAdmission.state().globalGuides,0))
  cleanups.reverse().forEach(fn=>fn())
  check(()=>assert.equal(services.subagents.manager,fresh.manager))
  check(()=>assert.equal(fresh.manager.materialize,fresh.native))
}
{
  const t=setup({sourceError:'unknown-version'})
  check(()=>assert.equal(t.manager.materialize,t.native))
  check(()=>assert.equal(t.service.state().mode,'unsupported'))
  t.service.dispose()
}
{
  const t=setup()
  t.manager.resident.set(t.a.id,{kind:'local',childId:t.a.id,closing:Promise.resolve(),
    handle:{agent:{session:session('spawn')}}})
  const closing=t.manager.materialize(t.input('closing-guide'))
  check(()=>assert.equal(closing,t.deferred[0].promise.promise))
  check(()=>assert.equal(t.service.snapshot(t.b).globalGuides,1))
  t.release(0);t.deferred[0].promise.reject(new NativeError('closing','ACTIVATION_CLOSING'))
  await assert.rejects(closing,e=>e.code==='ACTIVATION_CLOSING')
  await Promise.resolve()
  check(()=>assert.equal(t.service.snapshot(t.b).globalGuides,0))
  t.service.dispose()
}
console.log(`guide-admission core: ${count} checks passed`)

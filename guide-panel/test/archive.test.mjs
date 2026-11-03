import assert from 'node:assert/strict'
import {inspectCandidates,autoArchive} from '../archive.js'
const fold=events=>events.find(e=>e.type==='subagent/descriptor')?.data
let active=false,fail=false,disposed=0,archived=[]
const services={agents:{get:id=>active&&id==='guide'?{}:undefined},sessionQuery:{async observeSession(id){
  if(fail)throw Error('query failed')
  return {header:{id,origin:'subagent',parentSession:'p'},inheritedEventCount:0,
    events:[{type:'subagent/descriptor',data:{mode:'continuable',provider:id==='fake'?'spawn':'guide-fork'}}],
    [Symbol.dispose](){disposed++}}
}},guideAdmission:{state:()=>({enforcement:'native-materialize',unknown:0,poolId:'pool',busyIds:[]})},
workspaceRegistry:{async archiveSession(...args){archived.push(args)}}}
const ctx={get:key=>services[key]},candidate={id:'guide',parentSessionId:'p'}
assert.equal((await inspectCandidates(ctx,[candidate],fold)).guide.status,'idle')
assert.equal((await inspectCandidates(ctx,[{...candidate,id:'fake'}],fold)).fake.status,'not-guide')
assert.equal((await inspectCandidates(ctx,[{...candidate,parentSessionId:'deleted-parent'}],fold)).guide.status,'parent-mismatch')
active=true
await assert.rejects(autoArchive(ctx,candidate,fold),/状态已变化/)
active=false;fail=true
assert.equal((await inspectCandidates(ctx,[candidate],fold)).guide.status,'unknown')
await assert.rejects(autoArchive(ctx,candidate,fold),/状态已变化/)
fail=false
await autoArchive(ctx,candidate,fold)
assert.deepEqual(archived,[['guide']],'automatic archive never requests stopActivity')
services.workspaceRegistry.archiveSession=async()=>{throw Error('native activity changed')}
await assert.rejects(autoArchive(ctx,candidate,fold),/native activity/)
assert.ok(disposed>=6,'all acquired observations released')
console.log('O20 Host: durable identity/parent, active/unknown, native race refusal and no force-stop passed')

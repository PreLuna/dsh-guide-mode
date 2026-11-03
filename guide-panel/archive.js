import { providerFromObservation } from './identity.js'
const service=(ctx,key)=>{try{return ctx.get(key)}catch{return undefined}}
export function candidateInputs(value) {
  if(!Array.isArray(value))return []
  const found=new Map()
  for(const item of value.slice(0,128)) {
    if(typeof item?.id!=='string'||!item.id||item.id.length>256||typeof item.parentSessionId!=='string'||!item.parentSessionId||item.parentSessionId.length>256)continue
    if(!found.has(item.id))found.set(item.id,{id:item.id,parentSessionId:item.parentSessionId})
  }
  return [...found.values()]
}
/** Durable identity/parent verification; localStorage and catalog are discovery hints only. */
export async function inspectCandidates(ctx, inputs, foldDescriptor) {
  const output={}
  const values=candidateInputs(inputs)
  const batch=AbortSignal.timeout(4500)
  let cursor=0
  await Promise.all(Array.from({length:Math.min(4,values.length)},async()=>{
    while(cursor<values.length){
      const item=values[cursor++]
      if(batch.aborted){output[item.id]={status:'unknown'};continue}
      const signal=AbortSignal.any([batch,AbortSignal.timeout(3000)])
      let observation,request,onAbort
      try {
        request=Promise.resolve(service(ctx,'sessionQuery')?.observeSession?.(item.id,{signal}))
        observation=await Promise.race([request,new Promise((_,reject)=>{
          onAbort=()=>reject(signal.reason)
          signal.addEventListener('abort',onAbort,{once:true})
          if(signal.aborted)onAbort()
        })])
        if(!observation){output[item.id]={status:'unknown'};continue}
        const provider=providerFromObservation(observation,foldDescriptor,item.id)
        if(provider===undefined){output[item.id]={status:'unknown'};continue}
        if(provider!=='guide-fork'){output[item.id]={status:'not-guide'};continue}
        if(observation.header.parentSession!==item.parentSessionId){output[item.id]={status:'parent-mismatch'};continue}
        const active=service(ctx,'agents')?.get?.(item.id)!==undefined
        output[item.id]={status:active?'active':'idle',parentSessionId:item.parentSessionId}
      }catch{output[item.id]={status:'unknown'}}
      finally{
        if(onAbort)signal.removeEventListener('abort',onAbort)
        if(observation){try{observation[Symbol.dispose]?.()}catch{}}
        else request?.then(late=>{try{late?.[Symbol.dispose]?.()}catch{}},()=>{})
      }
    }
  }))
  return output
}
export async function autoArchive(ctx,input,foldDescriptor) {
  const [candidate]=candidateInputs([input])
  if(!candidate)throw Error('无效的指导归档请求')
  const status=(await inspectCandidates(ctx,[candidate],foldDescriptor))[candidate.id]
  if(status?.status!=='idle')throw Error('指导状态已变化或无法确认，暂不自动归档')
  const admission=service(ctx,'guideAdmission')
  const snapshot=admission?.state({sessionId:candidate.parentSessionId})
  if(snapshot?.enforcement!=='native-materialize'||snapshot.unknown!==0||!snapshot.poolId||snapshot.busyIds?.includes(candidate.id))throw Error('无法确认当前池，暂不自动归档')
  const workspace=service(ctx,'workspaceRegistry')
  if(typeof workspace?.archiveSession!=='function')throw Error('归档服务不可用')
  // Native activity admission rejects a race with running work. Never request stopActivity here.
  await workspace.archiveSession(candidate.id)
  return {archived:true,childId:candidate.id}
}

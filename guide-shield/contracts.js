import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const hashes={
  '@deepseek-ai/dsh-subagent':'9a9572e70fffdb100deb63326167f32bbf63016ce49c0017495dabcb95b44168',
  '@deepseek-ai/cordis':'6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e',
}
const clientHashes={
  '@deepseek-ai/dsh-client-ui-sidebar-right/client':'87e13d16e47b9eb00f8f25096d2c674ebe71a31026161a10d7c89ad6e6dfe379',
  '@deepseek-ai/dsh-client-ui-workspace/client':'bafd2d6eea2f82674cc0606bec13fc891e44b42fb2ac973f01cb32c735d4062f',
}
export async function loadHostContracts({client=false}={}) {
  try {
    for(const [specifier,expected] of Object.entries({...hashes,...(client?clientHashes:{})})){
      const actual=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.resolve(specifier)))).digest('hex')
      if(actual!==expected)throw Error(`unsupported-source:${specifier}`)
    }
    const {foldSubagentDescriptor}=await import('@deepseek-ai/dsh-subagent')
    if(typeof foldSubagentDescriptor!=='function')throw Error('missing-official-descriptor-fold')
    return{supported:true,foldDescriptor:foldSubagentDescriptor,baseline:'DSH 0.2.1-rc.3 / Cordis 4.0.5',identityRead:'snapshotEvents(inheritedEventCount); deprecated; pinned and rechecked on upgrade'}
  }catch(error){return{supported:false,reason:error.message,identityRead:'unavailable'}}
}

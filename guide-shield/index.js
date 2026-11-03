import { loadHostContracts } from './contracts.js'
import { apply as mountShield } from './core.js'
export { name, inject } from './core.js'
export async function apply(ctx, config) {
  const proof=await loadHostContracts()
  return mountShield(ctx,config,proof.foldDescriptor,proof)
}

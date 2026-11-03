// Compatibility entry; the Host service owns the stable implementation.
const core = await import('@local/dsh-guide-shield/shield').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  return import('../guide-shield/shield.js')
})
export const { SHIELD_MARK, SETTLEMENT_PREFIX, createSettlementPredicate, createShield } = core

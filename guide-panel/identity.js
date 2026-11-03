// Compatibility entry; the Host service owns the stable implementation.
const core = await import('@local/dsh-guide-shield/identity').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  return import('../guide-shield/identity.js')
})
export const { GUIDE_PROVIDER, SETTLEMENT_PREFIX, classifySession, isGuideSession, providerFromObservation, createIdentity } = core

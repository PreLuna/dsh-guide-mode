/** Host-owned settlement protection. Panel/provider HMR does not own this fiber. */
import { createIdentity } from './identity.js'
import { createShield, createSettlementPredicate } from './shield.js'

export const name = 'guide-settlement-shield'
export const inject = ['agents', 'sessions']

const service = (ctx, key) => {
  try { return ctx.get(key) } catch { return undefined }
}

export function apply(ctx, config = {}, foldDescriptor) {
  if (typeof foldDescriptor !== 'function') throw new TypeError('guide-shield requires the Host descriptor fold')
  const identity = createIdentity({
    sessions: { get: id => service(ctx, 'sessions')?.get?.(id) },
    agents: { get: id => service(ctx, 'agents')?.get?.(id) },
    sessionQuery: { observeSession: (id, options) => service(ctx, 'sessionQuery')?.observeSession?.(id, options) },
    foldDescriptor,
  })
  const shield = createShield({ isSettlement: createSettlementPredicate({ identity }), logger: ctx.logger,
    enabled: config.enabled !== false, inject: config.inject !== false })
  const childParents = new WeakMap()
  const agents = service(ctx, 'agents')
  const track = agent => {
    if (!agent || !identity.isGuideSession(agent.session)) return
    const parentId = agent.session.header.parentSession
    const parent = agents?.get?.(parentId)
    identity.remember(agent.id, parentId)
    if (parent) {
      childParents.set(agent, parent)
      shield.shieldParent(parent)
    }
  }
  const listeners = []
  ctx.effect(() => {
    listeners.push(ctx.on('agent/created', ({ agent }) => {
      identity.beginAgent(agent, agents?.get?.(agent?.session?.header?.parentSession))
      track(agent)
      for (const child of agents?.list?.() ?? []) if (child.session?.header?.parentSession === agent?.id) track(child)
    }))
    listeners.push(ctx.on('agent/disposed', payload => {
      const agent = payload?.agent ?? payload
      if (!agent) return
      identity.retainSettlement(agent, childParents.get(agent))
      identity.releaseParent(agent)
      shield.releaseParent(agent)
      identity.forget(agent.id)
    }))
    listeners.push(ctx.on('session/event', (session, event) => {
      if (event?.type !== 'subagent/descriptor' || session?.header?.origin !== 'subagent') return
      identity.invalidate(session)
      identity.forget(session.id)
      track(agents?.get?.(session.id))
    }))
    for (const agent of agents?.list?.() ?? []) track(agent)
    return () => {
      for (const dispose of listeners) {
        try { dispose?.() } catch { /* One host listener must not prevent retiring our wrappers. */ }
      }
      shield.restoreAll()
      identity.clear()
    }
  }, 'guide-shield: parent lifecycle and settlement ownership')
  ctx.provide('guideSettlementShield', {
    shieldParent: shield.shieldParent,
    rememberChild(id, parent) {
      identity.remember(id, parent?.id)
      shield.shieldParent(parent)
    },
    getState: shield.getState,
  })
}

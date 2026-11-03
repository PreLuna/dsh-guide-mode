/**
 * Host lifecycle test for the guidance identity + settlement shield.
 *
 * `apply()` is exercised with a small fake event bus so the actual
 * `agent/created` / `session/event` / `agent/disposed` wiring is tested rather
 * than only the identity functions. A standalone Node process cannot resolve
 * the host's `@deepseek-ai/dsh-subagent`, so `apply()` uses its minimal
 * `mode`/`provider` fold fallback here; the production path still prefers the
 * official fold.
 *
 *   node guide-panel/test/lifecycle.test.mjs
 */
import assert from 'node:assert'
import { apply } from '../index.js'
import { apply as applyShield } from '../../guide-shield/core.js'

const GUIDE = 'guide-fork'

const descriptor = (provider = GUIDE, mode = 'continuable') => ({
  type: 'subagent/descriptor',
  data: { mode, provider },
})

const settlement = (id) => ({
  source: { kind: 'subagent-settled', form: 'notice', summary: 'x', senderSessionId: id },
  content: [{ type: 'text', text: `Background subagent ${id} finished.` }],
})

function makeSession({ id, cut = 0, events = [], parentSession = 'parent-1' } = {}) {
  const state = { events: [...events] }
  return {
    id,
    header: { id, origin: 'subagent', parentSession },
    get inheritedEventCount() {
      return cut
    },
    get seq() {
      return state.events.length
    },
    snapshotEvents(fromSeq = 0) {
      return state.events.slice(fromSeq)
    },
    append(event) {
      state.events.push(event)
    },
  }
}

function makeParent(id) {
  const forwarded = []
  const parent = {
    id,
    followup: (input) => { forwarded.push(['followup', input]) },
    steer: (input) => { forwarded.push(['steer', input]) },
    inject: (input) => { forwarded.push(['inject', input]) },
  }
  return { parent, forwarded }
}

async function setup({ parents = [], guides = [], sessions = [] } = {}) {
  const listeners = new Map()
  const cleanups = []
  const agents = new Map(parents.map(parent => [parent.id, parent]))
  const sessionMap = new Map(sessions.map(session => [session.id, session]))
  for (const guide of guides) {
    agents.set(guide.id, guide)
    sessionMap.set(guide.id, guide.session)
  }
  const services = {
    subagents: { registerProvider: () => () => {}, startActivation: async () => ({}) },
    webServer: { register: () => () => {} },
    agents: {
      get: (id) => agents.get(id),
      list: () => [...agents.values()],
    },
    sessions: {
      get: (id) => sessionMap.get(id),
    },
  }
  const ctx = {
    get: (name) => services[name],
    provide: (name, value) => { services[name] = value },
    inject: (_names, callback) => callback(ctx),
    effect(fn) {
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return cleanup
    },
    on(name, listener) {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return () => {
        const current = listeners.get(name) ?? []
        listeners.set(name, current.filter(item => item !== listener))
      }
    },
    logger: { info() {}, warn() {} },
  }
  const fire = (name, ...args) => {
    for (const listener of [...(listeners.get(name) ?? [])]) listener(...args)
  }
  const restore = () => {
    for (const cleanup of cleanups.reverse()) {
      try { cleanup() } catch {}
    }
  }
  applyShield(ctx, {}, events => events.find(event => event.type === 'subagent/descriptor')?.data)
  await apply(ctx)
  return { agents, sessionMap, fire, restore }
}

// ── agent/created: a live guide child shields its parent ──────────────────
{
  const { parent, forwarded } = makeParent('parent-1')
  const guideSession = makeSession({ id: 'guide-1', events: [descriptor()] })
  const guideAgent = { id: 'guide-1', session: guideSession }
  const { fire } = await setup({
    parents: [parent],
    guides: [guideAgent],
  })
  fire('agent/created', { agent: guideAgent })
  parent.inject(settlement('guide-1'))
  assert.equal(forwarded.length, 0, 'the guide settlement is swallowed on inject')
  parent.inject({ content: [{ type: 'text', text: 'ordinary' }] })
  assert.equal(forwarded.length, 1, 'ordinary inject is forwarded')
}

// ── inherited prefix: an ancestor's guide descriptor is not identity ──────
{
  const { parent, forwarded } = makeParent('parent-2')
  const ordinarySession = makeSession({
    id: 'ordinary-1',
    cut: 1,
    events: [descriptor(), descriptor('spawn')],
    parentSession: 'parent-2',
  })
  const ordinaryAgent = { id: 'ordinary-1', session: ordinarySession }
  const { fire } = await setup({ parents: [parent], guides: [ordinaryAgent] })
  fire('agent/created', { agent: ordinaryAgent })
  parent.inject(settlement('ordinary-1'))
  assert.equal(forwarded.length, 1, 'a non-guide child is not identified by the inherited prefix')
}

// ── a descriptor landing after agent/created reclassifies the child ───────
{
  const { parent, forwarded } = makeParent('parent-3')
  const session = makeSession({ id: 'late-1', events: [], parentSession: 'parent-3' })
  const agent = { id: 'late-1', session }
  const { fire } = await setup({ parents: [parent], guides: [agent] })
  fire('agent/created', { agent })
  parent.inject(settlement('late-1'))
  assert.equal(forwarded.length, 1, 'no descriptor yet: ordinary delivery')
  session.append(descriptor())
  fire('session/event', session, descriptor())
  parent.inject(settlement('late-1'))
  assert.equal(forwarded.length, 1, 'the descriptor makes the child a guide and shields the parent')
}

// ── teardown releases the live identity before notifying the parent ──────
{
  const { parent, forwarded } = makeParent('parent-4')
  const guideSession = makeSession({ id: 'guide-4', events: [descriptor()], parentSession: 'parent-4' })
  const guideAgent = { id: 'guide-4', session: guideSession }
  const { fire, sessionMap, agents } = await setup({ parents: [parent], guides: [guideAgent] })
  fire('agent/created', { agent: guideAgent })
  parent.inject(settlement('guide-4'))
  assert.equal(forwarded.length, 0)
  fire('agent/disposed', { agent: guideAgent })
  agents.delete('guide-4')
  sessionMap.delete('guide-4')
  parent.inject(settlement('guide-4'))
  assert.equal(forwarded.length, 0, 'confirmed terminal identity survives child teardown')
  parent.inject(settlement('guide-4'))
  assert.equal(forwarded.length, 1, 'disposed hint is gone and no Session remains to classify')
}

// A terminal receipt cannot cross into a replacement same-ID parent.
{
  const old = makeParent('parent-rebuild')
  const guide = { id: 'rebuild-guide', session: makeSession({ id: 'rebuild-guide',
    parentSession: old.parent.id, events: [descriptor()] }) }
  const s = await setup({ parents: [old.parent], guides: [guide] })
  s.fire('agent/disposed', { agent: guide })
  s.agents.delete(guide.id); s.sessionMap.delete(guide.id)
  s.fire('agent/disposed', { agent: old.parent })
  const next = makeParent(old.parent.id)
  s.agents.set(next.parent.id, next.parent)
  s.fire('agent/created', { agent: next.parent })
  next.parent.inject(settlement(guide.id))
  assert.equal(next.forwarded.length, 1)
  old.parent.inject(settlement(guide.id))
  assert.equal(old.forwarded.length, 1, 'released parent wrappers are inert')
  s.restore()
}

// A child discovered before its parent is connected when that parent appears.
{
  const { parent, forwarded } = makeParent('late-parent')
  const guide = { id: 'early-guide', session: makeSession({ id: 'early-guide',
    parentSession: parent.id, events: [descriptor()] }) }
  const s = await setup({ guides: [guide] })
  s.agents.set(parent.id, parent)
  s.fire('agent/created', { agent: parent })
  parent.followup(settlement(guide.id))
  assert.equal(forwarded.length, 0)
  s.restore()
}

// ── unload restores the parent and clears identity ────────────────────────
{
  const { parent, forwarded } = makeParent('parent-5')
  const guideSession = makeSession({ id: 'guide-5', events: [descriptor()], parentSession: 'parent-5' })
  const guideAgent = { id: 'guide-5', session: guideSession }
  const { fire, restore } = await setup({ parents: [parent], guides: [guideAgent] })
  fire('agent/created', { agent: guideAgent })
  parent.inject(settlement('guide-5'))
  assert.equal(forwarded.length, 0)
  restore()
  parent.inject(settlement('guide-5'))
  assert.equal(forwarded.length, 1, 'restoreAll puts the original inject back')
}

console.log('guide-panel lifecycle: all checks passed')

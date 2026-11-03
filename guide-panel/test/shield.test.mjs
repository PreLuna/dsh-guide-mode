/**
 * Settlement shield wrapper test.
 *
 * The identity predicate is injected, so this test covers only the wrapping
 * contract: swallow matching deliveries, forward everything else, restore
 * exactly what this activation owns, and report active/partial/off.
 *
 *   node guide-panel/test/shield.test.mjs
 */
import assert from 'node:assert'
import { createShield, SHIELD_MARK } from '../shield.js'

function makeAgent({ id = 'parent-1', freeze = false } = {}) {
  const calls = []
  const agent = {
    id,
    followup(input) {
      calls.push({ method: 'followup', input })
      return 'followup-result'
    },
    steer(input) {
      calls.push({ method: 'steer', input })
      return 'steer-result'
    },
    inject(input) {
      calls.push({ method: 'inject', input })
      return 'inject-result'
    },
  }
  return { agent: freeze ? Object.freeze(agent) : agent, calls }
}

// ── swallow followup/steer/inject, forward others ─────────────────────────
{
  const { agent, calls } = makeAgent()
  const shield = createShield({ isSettlement: (input) => input?.guide === true })
  assert.equal(shield.getState().mode, 'active', 'enabled shield is active before the first parent')
  const restore = shield.shieldParent(agent)
  assert.equal(shield.getState().mode, 'active')
  assert.equal(shield.getState().inject, true)
  assert.equal(agent.followup({ guide: true }), undefined)
  assert.equal(agent.steer({ guide: true }), undefined)
  assert.equal(agent.inject({ guide: true }), undefined)
  assert.equal(calls.length, 0)
  assert.equal(agent.followup({ guide: false }), 'followup-result')
  assert.equal(agent.steer({ guide: false }), 'steer-result')
  assert.equal(agent.inject({ guide: false }), 'inject-result')
  assert.equal(calls.length, 3)
  assert.equal(agent.followup[SHIELD_MARK], true)
  assert.equal(agent.inject[SHIELD_MARK], true)
  restore()
  assert.notEqual(agent.followup[SHIELD_MARK], true)
  assert.equal(agent.inject({ guide: true }), 'inject-result')
  assert.equal(calls.length, 4)
  assert.equal(shield.getState().mode, 'active', 'restoring a parent leaves the shield armed')
}

// ── explicitly disabled shield: off and no wrapping ───────────────────────
{
  const { agent, calls } = makeAgent()
  const shield = createShield({ isSettlement: (input) => input?.guide === true, enabled: false })
  assert.equal(shield.getState().mode, 'off')
  assert.equal(shield.getState().reason, 'disabled')
  shield.shieldParent(agent)
  assert.equal(agent.inject({ guide: true }), 'inject-result')
  assert.equal(calls.length, 1)
}

// ── inject can be disabled without disabling followup/steer ───────────────
{
  const { agent, calls } = makeAgent()
  const shield = createShield({ isSettlement: (input) => input?.guide === true, inject: false })
  assert.equal(shield.getState().inject, false)
  shield.shieldParent(agent)
  assert.equal(agent.followup({ guide: true }), undefined)
  assert.equal(agent.inject({ guide: true }), 'inject-result')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'inject')
}

// ── idempotence: the same parent is wrapped once ──────────────────────────
{
  const { agent, calls } = makeAgent()
  const shield = createShield({ isSettlement: (input) => input?.guide === true })
  shield.shieldParent(agent)
  const first = agent.followup
  shield.shieldParent(agent)
  assert.equal(agent.followup, first)
  agent.followup({ guide: false })
  assert.equal(calls.length, 1)
}

// ── a throwing predicate must not break ordinary delivery ─────────────────
{
  const { agent, calls } = makeAgent()
  const shield = createShield({
    isSettlement() {
      throw new Error('malformed notice')
    },
  })
  shield.shieldParent(agent)
  assert.equal(agent.followup({ anything: true }), 'followup-result')
  assert.equal(calls.length, 1)
}

// ── missing method: partial, not silent ───────────────────────────────────
{
  const { agent } = makeAgent()
  delete agent.inject
  const shield = createShield({ isSettlement: (input) => input?.guide === true })
  shield.shieldParent(agent)
  const state = shield.getState()
  assert.equal(state.mode, 'partial')
  assert.match(state.reason, /inject/)
}

// ── frozen parent: no throw, partial state, all methods reported ──────────
{
  const { agent } = makeAgent({ freeze: true })
  const warnings = []
  const shield = createShield({
    isSettlement: (input) => input?.guide === true,
    logger: { warn: (message) => warnings.push(message) },
  })
  const restore = shield.shieldParent(agent)
  assert.equal(typeof restore, 'function')
  restore()
  assert.equal(warnings.length, 3, 'followup/steer/inject are all unwrappable')
  assert.equal(shield.getState().mode, 'partial')
  shield.restoreAll()
  assert.equal(shield.getState().mode, 'active', 'restoreAll clears the partial marker')
}

// ── restoreAll covers every parent this activation wrapped ────────────────
{
  const first = makeAgent({ id: 'p1' })
  const second = makeAgent({ id: 'p2' })
  const shield = createShield({ isSettlement: (input) => input?.guide === true })
  shield.shieldParent(first.agent)
  shield.shieldParent(second.agent)
  assert.equal(shield.getState().mode, 'active')
  assert.equal(first.agent.followup({ guide: true }), undefined)
  assert.equal(second.agent.steer({ guide: true }), undefined)
  shield.restoreAll()
  assert.equal(first.agent.followup({ guide: true }), 'followup-result')
  assert.equal(second.agent.steer({ guide: true }), 'steer-result')
  assert.equal(shield.getState().mode, 'active')
}

// Third-party outer wrappers retain their pointer; our retired closure is inert.
{
  const { agent, calls } = makeAgent()
  const shield = createShield({ isSettlement: input => input.guide })
  shield.shieldParent(agent)
  const old = agent.followup
  const outer = function () { return Reflect.apply(old, this, arguments) }
  agent.followup = outer
  shield.restoreAll()
  assert.equal(agent.followup, outer)
  agent.followup({ guide: true })
  assert.equal(calls.length, 1, 'the retained old wrapper forwards after unload')
}

// Overlapping activations can retire in either order without a stale filter.
for (const order of [[0, 1], [1, 0]]) {
  const { agent, calls } = makeAgent()
  const shields = [0, 1].map(() => createShield({ isSettlement: input => input.guide }))
  for (const shield of shields) shield.shieldParent(agent)
  shields[order[0]].restoreAll()
  agent.inject({ guide: true })
  assert.equal(calls.length, 0, 'the remaining activation still shields')
  shields[order[1]].restoreAll()
  agent.inject({ guide: true })
  assert.equal(calls.length, 1, 'all retired closures forward')
}

// Release only the exact parent and preserve the original call contract.
{
  const a = makeAgent(), b = makeAgent()
  const receiver = { tag: 'receiver' }
  a.agent.followup = function (...args) { assert.equal(this, receiver); return args }
  const shield = createShield({ isSettlement: input => input.guide })
  shield.shieldParent(a.agent); shield.shieldParent(b.agent)
  assert.deepEqual(a.agent.followup.call(receiver, { guide: false }, 'extra'), [{ guide: false }, 'extra'])
  shield.releaseParent(a.agent)
  assert.deepEqual(a.agent.followup.call(receiver, { guide: true }, 'extra'), [{ guide: true }, 'extra'])
  b.agent.followup({ guide: true })
  assert.equal(b.calls.length, 0)
  shield.restoreAll()
}

console.log('guide-panel shield: all checks passed')

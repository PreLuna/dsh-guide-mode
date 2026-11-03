/**
 * Client-half scheduler test: pressure bands (B1) and the peak-hold policy
 * (C3) without React or a host context.
 *
 * The pure policy is exposed as `__internals` by `client.js`; keeping the
 * formulas out of the component makes the 30s / 3min / 10min behaviour
 * reviewable and testable without a fake session store.
 *
 *   node guide-panel/test/scheduler.test.mjs
 */
import assert from 'node:assert'

// The bundle is a browser module: it only needs the loader, React, and enough
// of `window` to evaluate. None of the component/host paths run here.
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect() {},
  useRef: (initial) => ({ current: initial }),
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}

let plugin = null
globalThis.window = {
  __ModuleLoader__: {
    load({ factory }) {
      plugin = factory((id) => (id === 'react' ? fakeReact : {}))
    },
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
  document: { baseURI: 'http://local/' },
}

await import('../client.js')
assert.ok(plugin, 'the client bundle must register a module')
assert.ok(plugin.__internals, 'the client bundle must expose the scheduler policy')

const { bandOf, delayForBand, nextHold, archiveVerdict, archiveDelay } = plugin.__internals
const ARCHIVE = { lowDelayMs: 600_000, midDelayMs: 180_000, highDelayMs: 30_000, holdMs: 120_000 }

// ── B1: running children / capacity, half-open band boundaries ────────────
assert.equal(bandOf(0, 8), 'none')
assert.equal(bandOf(1, 8), 'none', '12.5% is still below the first band')
assert.equal(bandOf(2, 8), 'low', '25% already enters low')
assert.equal(bandOf(3, 8), 'low')
assert.equal(bandOf(4, 8), 'mid', '50% enters mid')
assert.equal(bandOf(5, 8), 'mid')
assert.equal(bandOf(6, 8), 'high', '75% enters high')
assert.equal(bandOf(8, 8), 'high')
assert.equal(bandOf(1, 4), 'low')
assert.equal(bandOf(2, 4), 'mid')
assert.equal(bandOf(3, 4), 'high')
assert.equal(bandOf(0, 0), 'none', 'a zero capacity is treated as one')

// ── delays ────────────────────────────────────────────────────────────────
assert.equal(delayForBand('none', ARCHIVE), null)
assert.equal(delayForBand('low', ARCHIVE), 600_000)
assert.equal(delayForBand('mid', ARCHIVE), 180_000)
assert.equal(delayForBand('high', ARCHIVE), 30_000)
assert.equal(archiveDelay(3, 4, ARCHIVE), 30_000, 'the old helper keeps its meaning')

// ── C3: the 3→2 guide drop keeps the high band for the hold window ────────
let hold = { band: 'none', until: 0 }
const step = (now, running) => {
  const current = bandOf(running, 4)
  hold = nextHold(current, hold.band, hold.until, now, ARCHIVE.holdMs)
  return { band: hold.band, delay: delayForBand(hold.band, ARCHIVE) }
}
assert.deepEqual(step(0, 3), { band: 'high', delay: 30_000 })
assert.deepEqual(step(10_000, 2), { band: 'high', delay: 30_000 }, 'the hold starts on the drop')
assert.deepEqual(step(40_000, 2), { band: 'high', delay: 30_000 }, 'the idle guide this hits 30s still archives')
assert.deepEqual(step(130_000, 2), { band: 'mid', delay: 180_000 }, 'the hold expires back to mid')

// A rise during a hold is a new peak: no stale hold remains.
hold = { band: 'none', until: 0 }
step(0, 3)
assert.deepEqual(step(10_000, 2), { band: 'high', delay: 30_000 })
assert.deepEqual(step(20_000, 4), { band: 'high', delay: 30_000 })

// `none` never holds; the caller keeps `idleSince`, so pressure returning
// high archives a long-idle thread immediately.
assert.deepEqual(step(30_000, 0), { band: 'none', delay: null })
assert.deepEqual(step(40_000, 3), { band: 'high', delay: 30_000 })
assert.equal(archiveVerdict(40_000, 10_000, 30_000), 'archive', 'the timer is kept across a null band')

// ── per-thread verdict ────────────────────────────────────────────────────
assert.equal(archiveVerdict(10_000, 0, 30_000), 'wait')
assert.equal(archiveVerdict(30_000, 0, 30_000), 'archive')
assert.equal(archiveVerdict(30_000, 0, null), 'hold')
assert.equal(archiveVerdict(30_000, 0, 0), 'archive')

// holdMs 0 is legal: the drop takes effect immediately (no hold).
assert.deepEqual(nextHold('mid', 'high', 0, 1_000, 0), { band: 'mid', until: 0 })

console.log('guide-panel scheduler: all checks passed')

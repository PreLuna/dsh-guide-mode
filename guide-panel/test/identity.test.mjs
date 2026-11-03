/**
 * Host identity helper test: trusted guidance identity from a child's own
 * `subagent/descriptor` only.
 *
 * The module intentionally takes the official `foldSubagentDescriptor` as a
 * parameter, so this test needs no DSH runtime. The fake Session mirrors the
 * two host facts the reader depends on: `inheritedEventCount` and
 * `snapshotEvents(fromSeq)`.
 *
 *   node guide-panel/test/identity.test.mjs
 */
import assert from 'node:assert'
import {
  GUIDE_PROVIDER,
  classifySession,
  isGuideSession,
  providerFromObservation,
  createIdentity,
} from '../identity.js'

const descriptor = (provider = GUIDE_PROVIDER, mode = 'continuable') => ({
  type: 'subagent/descriptor',
  data: { mode, provider },
})

/** First-wins fold, matching `foldSubagentDescriptor`. */
const fold = (events) => {
  const event = events.find((candidate) => candidate.type === 'subagent/descriptor')
  if (event === undefined) return undefined
  if (event.data.malformed === true) throw new Error('malformed descriptor')
  return event.data
}

function makeSession({ id = 'child-1', origin = 'subagent', cut = 0, events = [], parentSession = 'parent-1' } = {}) {
  const state = {
    id,
    origin,
    cut,
    events: [...events],
    parentSession,
  }
  return {
    id,
    get header() {
      return {
        id: state.id,
        ...(state.origin === undefined ? {} : { origin: state.origin }),
        ...(state.parentSession === undefined ? {} : { parentSession: state.parentSession }),
      }
    },
    get inheritedEventCount() {
      return state.cut
    },
    get seq() {
      return state.events.length
    },
    snapshotEvents(fromSeq = 0) {
      return state.events.slice(fromSeq)
    },
    replace(events) {
      state.events = [...events]
    },
    setCut(cut) {
      state.cut = cut
    },
  }
}

// ── own vs inherited descriptor ───────────────────────────────────────────
assert.equal(classifySession(makeSession({ events: [descriptor()] }), fold), true)
assert.equal(isGuideSession(makeSession({ events: [descriptor()] }), fold), true)

const inherited = makeSession({ cut: 1, events: [descriptor(), descriptor('spawn')] })
assert.equal(classifySession(inherited, fold), false, 'a guide descriptor in the inherited prefix must not count')
assert.equal(isGuideSession(inherited, fold), false)

// first-wins: a later descriptor cannot rewrite the establishing one.
assert.equal(classifySession(makeSession({ events: [descriptor(), descriptor('spawn')] }), fold), true)
assert.equal(classifySession(makeSession({ events: [descriptor('spawn'), descriptor()] }), fold), false)

// one-shot, root, missing, malformed.
assert.equal(classifySession(makeSession({ events: [descriptor(GUIDE_PROVIDER, 'one-shot')] }), fold), false)
assert.equal(classifySession(makeSession({ origin: null, events: [descriptor()] }), fold), false)
assert.equal(classifySession(makeSession({ events: [] }), fold), undefined)
assert.equal(classifySession(makeSession({ events: [{ type: 'subagent/descriptor', data: { malformed: true } }] }), fold), undefined)
assert.equal(isGuideSession(makeSession({ events: [] }), fold), false)

// ── observation provider ──────────────────────────────────────────────────
const observation = {
  header: { id: 'child-1', origin: 'subagent', parentSession: 'parent-1' },
  inheritedEventCount: 1,
  events: [descriptor(), descriptor('spawn')],
}
assert.equal(providerFromObservation(observation, fold), 'spawn')
assert.equal(providerFromObservation(observation, fold, 'child-1'), 'spawn')
assert.equal(providerFromObservation({
  header: { id: 'child-1', origin: 'subagent' },
  inheritedEventCount: 0,
  events: [descriptor(), descriptor('spawn')],
}, fold), GUIDE_PROVIDER, 'observation folding is first-wins as well')
assert.equal(providerFromObservation(observation, fold, 'other'), undefined)
assert.equal(providerFromObservation({ header: { origin: 'user' } }, fold), undefined)

// ── reader: sync, async fallback, hints, TTL, LRU ─────────────────────────
const sessionsById = new Map()
const observations = new Map()
let observeCalls = 0
let clock = 1_000
const sessions = { get: (id) => sessionsById.get(id) }
const agents = { get: () => undefined }
const sessionQuery = {
  async observeSession(id) {
    observeCalls += 1
    return observations.get(id)
  },
}

const identity = createIdentity({
  sessions,
  agents,
  sessionQuery,
  foldDescriptor: fold,
  hintLimit: 2,
  hintTtlMs: 100,
  now: () => clock,
  observeTimeoutMs: 50,
})

identity.remember('g1', 'p1')
assert.equal(identity.isGuideIdSync('g1'), true)
assert.equal(identity.isHint('g1'), true)
assert.equal(await identity.parentOf('g1'), 'p1')
assert.equal(identity.isGuideText('Background subagent g1 finished.'), true)
assert.equal(identity.isGuideText('Background subagent unknown finished.'), false)
identity.forget('g1')
assert.equal(identity.isGuideIdSync('g1'), undefined)

const guideSession = makeSession({ id: 'g2', events: [descriptor()] })
sessionsById.set('g2', guideSession)
assert.equal(identity.isGuideIdSync('g2'), true)
assert.equal(await identity.parentOf('g2'), 'parent-1')

const workerSession = makeSession({ id: 'w1', events: [descriptor('spawn')] })
sessionsById.set('w1', workerSession)
assert.equal(identity.isGuideIdSync('w1'), false)
assert.equal(identity.isGuideIdSync('missing'), undefined)

observations.set('g3', {
  header: { id: 'g3', origin: 'subagent', parentSession: 'p3' },
  inheritedEventCount: 0,
  events: [descriptor()],
})
assert.equal(await identity.isGuideId('g3'), true)
assert.equal(identity.isGuideIdSync('g3'), true)
assert.equal(observeCalls, 1)
assert.equal(await identity.isGuideId('g3'), true)
assert.equal(observeCalls, 1, 'a resolved hint must avoid a second observation')

observations.set('w2', {
  header: { id: 'w2', origin: 'subagent' },
  inheritedEventCount: 0,
  events: [descriptor('spawn')],
})
assert.equal(await identity.isGuideId('w2'), false)

observations.set('p2', {
  header: { id: 'p2', origin: 'subagent', parentSession: 'root-1' },
  inheritedEventCount: 0,
  events: [descriptor('spawn')],
})
assert.equal(await identity.parentOf('p2'), 'root-1')

// TTL: remember, advance the clock past the bound, expect a miss.
const shortLived = createIdentity({
  sessions,
  agents,
  sessionQuery,
  foldDescriptor: fold,
  hintLimit: 8,
  hintTtlMs: 100,
  now: () => clock,
})
shortLived.remember('ttl', 'p')
assert.equal(shortLived.isHint('ttl'), true)
clock += 101
assert.equal(shortLived.isHint('ttl'), false)

// LRU: limit 2, the oldest hint is evicted.
const small = createIdentity({
  sessions,
  agents,
  sessionQuery,
  foldDescriptor: fold,
  hintLimit: 2,
  hintTtlMs: 10_000,
  now: () => clock,
})
small.remember('a')
small.remember('b')
small.remember('c')
assert.equal(small.isHint('a'), false)
assert.equal(small.isHint('c'), true)

// Cache invalidation when the Session object is reused with new events.
const changing = makeSession({ id: 'g4', events: [descriptor()] })
sessionsById.set('g4', changing)
assert.equal(identity.isGuideIdSync('g4'), true)
changing.replace([descriptor('spawn')])
identity.invalidate(changing)
assert.equal(identity.isGuideIdSync('g4'), false)

identity.clear()
assert.equal(identity.isHint('g3'), false)

// Async and sync readers agree on mode; observation addresses must match.
{
  const reader = createIdentity({ foldDescriptor: fold, sessionQuery: {
    async observeSession(id) { return { header: { id, origin: 'subagent' }, inheritedEventCount: 0,
      events: [descriptor(GUIDE_PROVIDER, 'one-shot')] } },
  } })
  assert.equal(await reader.isGuideId('one-shot'), false)
  assert.equal(reader.isGuideIdSync('one-shot'), false)
}

for (const operation of ['clear', 'forget', 'abort', 'replace', 'timeout']) {
  const started = Promise.withResolvers(), delayed = Promise.withResolvers()
  const live = new Map()
  let disposed = 0
  const reader = createIdentity({ foldDescriptor: fold, sessions: { get: id => live.get(id) },
    observeTimeoutMs: operation === 'timeout' ? 15 : 1000,
    sessionQuery: { observeSession() { started.resolve(); return delayed.promise } },
  })
  const abort = new AbortController()
  const pending = reader.isGuideId('late', { signal: abort.signal })
  await started.promise
  if (operation === 'clear') reader.clear()
  if (operation === 'forget') reader.forget('late')
  if (operation === 'abort') abort.abort()
  if (operation === 'replace') live.set('late', makeSession({ id: 'late', events: [descriptor('spawn')] }))
  const lease = { header: { id: 'late', origin: 'subagent', parentSession: 'p' }, inheritedEventCount: 0,
    events: [descriptor()], [Symbol.dispose]() { disposed++ } }
  if (operation === 'replace') delayed.resolve(lease)
  const keepAlive = setTimeout(() => {}, 100)
  assert.equal(await pending, undefined, operation)
  clearTimeout(keepAlive)
  if (operation !== 'replace') delayed.resolve(lease)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(disposed, 1, `${operation}: even a late lease is released exactly once`)
  assert.equal(reader.isHint('late'), false, `${operation}: stale reads cannot repopulate hints`)
}

{
  let disposed = 0
  const reader = createIdentity({ foldDescriptor: fold, sessionQuery: { async observeSession() {
    return { header: { id: 'wrong', origin: 'subagent', parentSession: 'wrong-parent' },
      [Symbol.dispose]() { disposed++ } }
  } } })
  assert.equal(await reader.parentOf('expected'), undefined)
  assert.equal(disposed, 1)
}

// Terminal identity is one-use, parent-bound, bounded, and lifecycle-scoped.
{
  let time = 0
  const parent = { id: 'receipt-parent' }
  const liveParents = new Map([[parent.id, parent]])
  const reader = createIdentity({ agents: { get: id => liveParents.get(id) }, foldDescriptor: fold,
    hintLimit: 2, hintTtlMs: 100, now: () => time })
  const guide = id => ({ id, session: makeSession({ id, events: [descriptor()], parentSession: parent.id }) })
  reader.retainSettlement(guide('a'), parent)
  assert.equal(reader.consumeSettlement('a', { id: parent.id }), false)
  assert.equal(reader.consumeSettlement('a', parent), true)
  assert.equal(reader.consumeSettlement('a', parent), false)
  for (const id of ['a', 'b', 'c']) reader.retainSettlement(guide(id), parent)
  assert.equal(reader.consumeSettlement('a', parent), false, 'unused records are bounded')
  reader.beginAgent({ id: 'b' }, parent)
  assert.equal(reader.consumeSettlement('b', parent), false, 'same-ID lifecycle invalidates old terminal identity')
  time = 101
  assert.equal(reader.consumeSettlement('c', parent), false)
  reader.retainSettlement(guide('d'), parent)
  reader.releaseParent(parent)
  assert.equal(reader.consumeSettlement('d', parent), false)
}

console.log('guide-panel identity: all checks passed')

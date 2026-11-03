/**
 * Client-half render smoke test: loads `client.js` with a fake module loader,
 * a fake React, and a fake host context, then renders the registered panel in
 * the empty state and in a state carrying one guidance thread.
 *
 * The point is to catch structural mistakes the type-free bundle cannot catch
 * at build time: hook usage, service access, dictionary lookups and the
 * element tree shape.
 *
 *   node guide-panel/test/panel-render.test.mjs
 */
import assert from 'node:assert'

// ── fake browser ─────────────────────────────────────────────────────────
const storage = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
  },
  setTimeout: () => 0,
  document: { baseURI: 'http://local/' },
  __ModuleLoader__: undefined,
}
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async () => {} } },
    configurable: true,
  })
} catch {
  // Node's built-in navigator is read-only on some versions; copy never runs here.
}

// ── fake React ───────────────────────────────────────────────────────────
const fakeReact = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat() }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useEffect() {},
  useRef(initial) { return { current: initial } },
  useMemo(factory) { return factory() },
  useCallback(fn) { return fn },
  useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot() },
}

let plugin = null
window.__ModuleLoader__ = {
  load({ factory }) {
    plugin = factory((id) => (id === 'react' ? fakeReact : {}))
  },
}

// ── fake host ────────────────────────────────────────────────────────────
let descriptor = null
let body = null
let listSnapshot = { byId: {}, projectionsBySession: {} }
const services = {
  sessions: {
    list: {
      getSnapshot: () => listSnapshot,
      subscribe: () => () => {},
    },
  },
  workspaces: {
    list: { getSnapshot: () => ({ archivedSessionIds: [] }), subscribe: () => () => {} },
  },
  sidebarRight: { openTabs: { getSnapshot: () => [], subscribe: () => () => {} }, openResource: () => {}, tabsIn: () => [], close: () => {} },
  sidebarRightTabs: {
    register: (value) => { descriptor = value; return () => {} },
    get: () => ({}),
  },
  slots: {
    inject: (_key, callback) => callback(),
    register: (options, component) => { body = { options, component }; return () => {} },
  },
  uiWorkspace: { openSession() {}, selection: { getSnapshot: () => ({}) }, archiveSession: async () => {}, unarchiveSession: async () => {} },
}
const ctx = {
  locale: { register: () => () => {}, bind: () => (key) => key },
  effect: (fn) => fn(),
  inject: (_deps, callback) => callback(ctx),
  sidebarRightTabs: services.sidebarRightTabs,
  slots: services.slots,
  get: (name) => services[name],
}

await import('../client.js')
assert.ok(plugin, 'the client bundle must register a module')
assert.deepEqual(plugin.inject, ['uiWorkspace', 'sessions', 'sidebarRight', 'locale'])
plugin.apply(ctx)
assert.ok(descriptor, 'apply must register one native sidebar tab type')
assert.equal(descriptor.id, 'guide-panel')
assert.equal(descriptor.kind, 'guide-panel', 'the panel must not shadow the built-in sidebar start page ("guide")')
assert.equal(descriptor.guide?.[0]?.id, 'guide-panel', 'the guide card needs its own entry id')
assert.ok(body, 'apply must register the tab body')
assert.equal(body.options.name, 'sidebar.right.pane.tab')
assert.equal(body.options.key, 'guide-panel')
const render = (props = {}) => body.component({ ctx, sessionId: 'session-1', tab: {}, visible: true, ...props })

const textOf = (node) => {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node.type === 'function') return textOf(node.type(node.props))
  return textOf(node.children)
}

// Empty state: no records, no catalog.
const emptyTree = render()
assert.match(textOf(emptyTree), /title/)
assert.match(textOf(emptyTree), /threads/)

// Populated state: one local record plus the catalog row for the same child.
storage.set('dsh-guide-panel.threads.v1', JSON.stringify({
  'child-1': { label: '指导: 我现在该先做什么？', createdAt: 1_700_000_000_000, parentSessionId: 'session-1' },
}))
listSnapshot = {
  byId: {
    'child-1': { id: 'child-1', displayTitle: '指导: 我现在该先做什么？', origin: 'subagent', parentId: 'session-1', running: false },
  },
  projectionsBySession: {
    'session-1': {
      values: { subagentCatalog: [{ id: 'child-1', createdAt: 1_700_000_000_000, mode: 'continuable', label: '指导: 我现在该先做什么？' }] },
      state: 'ready',
      error: null,
    },
  },
}
const populatedTree = render()
const text = textOf(populatedTree)
assert.match(text, /我现在该先做什么？/)
assert.match(text, /copyId/)
assert.equal(text.includes('archivedTag'), false)

// An archived thread stays visible with its own tag and wake actions.
services.workspaces.list.getSnapshot = () => ({ archivedSessionIds: ['child-1'] })
const archivedText = textOf(render())
assert.match(archivedText, /sleepTag/, 'an archived thread must show the sleeping tag')
assert.match(archivedText, /reopen/, 'a sleeping thread must still be openable')
assert.match(archivedText, /unarchive/, 'a sleeping thread must offer the wake action')

// The shield status is a pure translation; `active` stays silent.
const t = (key) => key
assert.equal(plugin.__internals.shieldNoteFor({ mode: 'partial' }, t), 'shieldPartial')
assert.equal(plugin.__internals.shieldNoteFor({ mode: 'off' }, t), 'shieldOff')
assert.equal(plugin.__internals.shieldNoteFor({ mode: 'active' }, t), '')
assert.equal(plugin.__internals.shieldNoteFor(undefined, t), '')
assert.equal(plugin.__internals.modelNoteFor({ mode: 'unsupported' }, t), 'modelUnsupported')
assert.equal(plugin.__internals.modelNoteFor({ mode: 'partial' }, t), 'modelPartial')
assert.equal(plugin.__internals.modelNoteFor({ mode: 'pending' }, t), 'modelPending')
assert.equal(plugin.__internals.modelNoteFor({ mode: 'idle' }, t), '')
assert.equal(plugin.__internals.modelNoteFor({ mode: 'off' }, t), 'modelOff')
assert.equal(plugin.__internals.modelNoteFor({ mode: 'active' }, t), '')
assert.equal(plugin.__internals.modelNoteFor(undefined, t), '')

console.log('guide-panel client render: all checks passed')



import assert from 'node:assert/strict'
import test from 'node:test'

globalThis.window = {
  document: { baseURI: 'http://local/' },
  setInterval: () => 0,
  clearInterval: () => {},
  __ModuleLoader__: undefined,
}

const fakeReact = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat() }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useEffect() {},
  useCallback(fn) { return fn },
}

let plugin = null
window.__ModuleLoader__ = {
  load({ factory }) {
    plugin = factory((id) => (id === 'react' ? fakeReact : {}))
  },
}

let registration = null
let applied = false
const ctx = {
  locale: {
    register: () => () => {},
    bind: () => (key) => key,
  },
  slots: {
    inject: (_name, callback) => callback(),
    register: (options, component) => {
      registration = { options, component }
      return () => {}
    },
  },
  effect: (fn) => {
    fn()
  },
}

await import('../client.js')

test('manager client registers a Plugins page tab', () => {
  assert.ok(plugin, 'the client bundle must register a module')
  assert.deepEqual(plugin.inject, ['slots', 'locale'])
  plugin.apply(ctx)
  applied = true
  assert.ok(registration)
  assert.equal(registration.options.name, 'plugins.tab')
  assert.equal(registration.options.id, 'guide-manager')
  assert.equal(registration.options.order, 10)
  assert.equal(registration.options.locale, 'guideManager')
  assert.equal(registration.options.label(), 'tab')
  assert.equal(typeof registration.component, 'function')
})

test('manager tab renders its loading shell without a Host round-trip', () => {
  assert.equal(applied, true)
  const tree = registration.component({ t: (key) => key, openPackage: () => {} })
  const textOf = (node) => {
    if (node === null || node === undefined || node === false) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(textOf).join('')
    if (typeof node.type === 'function') return textOf(node.type(node.props))
    return textOf(node.children)
  }
  assert.match(textOf(tree), /loading/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const key = 'dsh-guide-manager.execution'
async function boot({ marker = null, task = null } = {}) {
  const storage = new Map(marker ? [[key, JSON.stringify(marker)]] : [])
  const timers = [], requests = [], clicks = []
  const guide = { textContent: 'tab', childElementCount: 0, getClientRects: () => [{}], click: () => clicks.push('guide') }
  const document = { body: {}, baseURI: 'http://isolated/', querySelectorAll: (selector) => selector.includes('span') ? [guide] : [] }
  let plugin
  const window = { document, localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) }, setInterval: (fn, ms) => (timers.push({ fn, ms }), timers.length), clearInterval() {},
    __ModuleLoader__: { load: ({ factory }) => { plugin = factory(() => ({ createElement() {} })) } } }
  const state = { profile: { dir: 'current-profile' }, execution: { task } }
  vm.runInNewContext(source, { window, document, URL, AbortSignal, fetch: async (url, options) => { requests.push({ url, method: options.method }); return { ok: true, text: async () => JSON.stringify({ ok: true, value: state }) } } })
  plugin.apply({ locale: { bind: () => (k) => k, register: () => () => {} }, slots: { inject: (_, fn) => fn(), register: () => () => {} }, effect: (fn) => fn() })
  await new Promise(setImmediate)
  return { storage, timers, requests, clicks }
}
const current = () => ({ id: 'current-task', pendingId: 'current-plan', status: 'completed', createdAt: new Date().toISOString(), returnToManager: true })

test('desktop boot reconstructs an unshown result when localStorage was not flushed', async () => {
  const f = await boot({ task: current() })
  assert.equal(JSON.parse(f.storage.get(key)).taskId, 'current-task')
  await f.timers.find((t) => t.ms === 500).fn()
  assert.deepEqual(f.clicks, ['guide'])
  assert.ok(f.requests.every((r) => r.method === 'GET'))
})

test('durable current task replaces a stale marker from a previous restart', async () => {
  const f = await boot({ marker: { profile: 'current-profile', taskId: 'previous-task', pendingId: 'previous-plan', startedAt: Date.now() }, task: current() })
  assert.equal(JSON.parse(f.storage.get(key)).taskId, 'current-task')
  await f.timers.find((t) => t.ms === 500).fn()
  assert.deepEqual(f.clicks, ['guide'])
})

test('already displayed results clear stale local intent and ordinary boot does not navigate', async () => {
  const f = await boot({ marker: { profile: 'current-profile', taskId: 'current-task' }, task: { ...current(), returnToManager: false } })
  assert.equal(f.storage.has(key), false)
  const idle = await boot()
  await idle.timers.find((t) => t.ms === 500).fn()
  assert.deepEqual(idle.clicks, [])
  assert.equal(idle.storage.size, 0)
})

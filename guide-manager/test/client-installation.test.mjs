import assert from 'node:assert/strict'
import test from 'node:test'
import { COMPONENTS } from '../core.js'

let currentFrame
let cursor = 0
let frames = new Map()
let snapshot
let component
const requests = []
const storage = new Map()
const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState(initial) {
    const index = cursor++
    const values = frames.get(currentFrame) ?? []
    if (!frames.has(currentFrame)) frames.set(currentFrame, values)
    if (!(index in values)) values[index] = currentFrame === 'ManagerTab' && index === 0 ? snapshot : typeof initial === 'function' ? initial() : initial
    return [values[index], (next) => { values[index] = typeof next === 'function' ? next(values[index]) : next }]
  },
  useEffect() {},
}
globalThis.window = {
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
  document: { baseURI: 'http://isolated/' },
  __ModuleLoader__: { load({ factory }) {
    const plugin = factory(() => react)
    plugin.apply({
      locale: { bind: () => (key) => key, register: () => () => {} },
      slots: { inject: (_name, callback) => callback(), register: (_options, body) => { component = body; return () => {} } },
      effect: (callback) => callback(),
    })
  } },
}
await import('../client.js')

function render(node) {
  if (!node || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(render)
  if (typeof node.type === 'function') {
    const oldFrame = currentFrame
    const oldCursor = cursor
    currentFrame = node.type.name
    cursor = 0
    const result = render(node.type(node.props))
    currentFrame = oldFrame
    cursor = oldCursor
    return result
  }
  return { ...node, children: node.children.map(render) }
}
const tree = () => render(component())
const text = (node) => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.children) : node == null || node === false ? '' : String(node)
const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.children)] : []
const button = (label) => nodes(tree()).find((node) => node.type === 'button' && text(node) === label)
function reset({ available = true } = {}) {
  frames = new Map()
  requests.length = 0
  storage.clear()
  snapshot = {
    manager: { mode: 'ready' }, host: {},
    components: COMPONENTS.map((item) => ({ ...item, status: 'missing', version: null })),
    installation: { catalog: { available }, pending: null, result: null, helperCommand: "& 'install-guide-manager.cmd' -Profile 'isolated'" },
  }
}

test('manager-only page explains missing release configuration and never initiates an installation on render', () => {
  reset({ available: false })
  assert.match(text(tree()), /installCatalogMissing/)
  assert.equal(button('installSelected'), undefined)
  assert.equal(requests.length, 0)
})

test('installation preview lists exact versions and confirmation sends the preview fingerprint', async () => {
  reset()
  const plan = { id: 'confirmed-plan', requested: ['panel'], blockers: [], warnings: [], entries: [{ key: 'panel', package: '@local/dsh-guide-panel', version: '1.1.0', action: 'install' }] }
  globalThis.fetch = async (url, options) => {
    requests.push({ url, payload: JSON.parse(options.body) })
    return { ok: true, json: async () => ({ ok: true, value: url.endsWith('/plan') ? plan : { application: 'pending-restart' } }) }
  }
  await button('installRecommended').props.onClick()
  assert.match(requests[0].url, /\/install\/plan$/)
  assert.equal(requests[0].payload.components.length, 6)
  assert.match(text(tree()), /@local\/dsh-guide-panel@1\.1\.0/)
  await button('installConfirm').props.onClick()
  assert.deepEqual(requests[1].payload, { components: ['panel'], planId: 'confirmed-plan', confirm: true })
  snapshot.installation.pending = { id: plan.id, entries: plan.entries }
  assert.match(text(tree()), /installPending/)
  assert.match(text(tree()), /-Profile 'isolated'/)
  await button('installCancel').props.onClick()
  assert.deepEqual(requests[2].payload, { planId: 'confirmed-plan', confirm: true })
})

test('blocked previews cannot be confirmed and server errors remain visible', async () => {
  reset()
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, value: { id: 'blocked', requested: ['panel'], entries: [{ key: 'panel', package: '@local/dsh-guide-panel', version: '1.1.0', action: 'install' }], blockers: ['unsupported-install-host'] } }) })
  await button('installSelected').props.onClick()
  assert.equal(button('installConfirm').props.disabled, true)
  assert.match(text(tree()), /unsupported-install-host/)
  globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({ ok: false, error: { message: 'stale-install-plan' } }) })
  await button('installSelected').props.onClick()
  assert.match(text(tree()), /stale-install-plan/)
})

test('package UI submits selected versions and confirms the exact upgrade plan', async () => {
  reset()
  snapshot.components.forEach((item) => { item.installed = true; item.version = '1.1.0' })
  snapshot.packageManagement = { catalog: { available: true, components: COMPONENTS.map((item) => ({ key: item.key, versions: item.key === 'panel' ? ['1.1.0', '1.1.1'] : ['1.1.0'] })) }, transactions: [] }
  const plan = { id: 'upgrade-plan', kind: 'package-upgrade', targets: [{ key: 'panel', version: '1.1.1' }], blockers: [], entries: [{ key: 'panel', package: '@local/dsh-guide-panel', version: '1.1.1', previous: { version: '1.1.0' }, action: 'upgrade' }] }
  globalThis.fetch = async (url, options) => { requests.push({ url, payload: JSON.parse(options.body) }); return { ok: true, json: async () => ({ ok: true, value: url.endsWith('/plan') ? plan : { application: 'pending-restart' } }) } }
  nodes(tree()).find((node) => node.type === 'select' && node.props['aria-label'] === 'target-version-panel').props.onChange({ target: { value: '1.1.1' } })
  await button('packagePreview').props.onClick()
  assert.deepEqual(requests[0].payload.targets, [{ key: 'panel', version: '1.1.1' }])
  assert.match(text(tree()), /1\.1\.0 → 1\.1\.1/)
  await button('packageConfirm').props.onClick()
  assert.deepEqual(requests[1].payload, { kind: 'package-upgrade', targets: plan.targets, planId: plan.id, confirm: true })
})

test('package recovery remains available without the original release catalog', async () => {
  reset()
  snapshot.packageManagement = { catalog: { available: false }, transactions: [{ id: 'retained-backup', entries: [] }] }
  const plan = { id: 'restore-plan', kind: 'package-restore', transactionId: 'retained-backup', blockers: [], entries: [] }
  globalThis.fetch = async (url, options) => { requests.push({ url, payload: JSON.parse(options.body) }); return { ok: true, json: async () => ({ ok: true, value: url.endsWith('/restore-plan') ? plan : { application: 'pending-restart' } }) } }
  await button('packageRestorePreview · retained-backup').props.onClick()
  assert.match(requests[0].url, /packages\/restore-plan$/)
  await button('packageRestoreConfirm').props.onClick()
  assert.deepEqual(requests[1].payload, { kind: 'package-restore', transactionId: 'retained-backup', planId: plan.id, confirm: true })
})

test('maintenance UI previews a dependency-blocked uninstall and cannot confirm it', async () => {
  reset()
  snapshot.components.forEach((item) => { item.installed = true; item.version = '1.1.0' })
  snapshot.maintenance = { catalog: { versions: [] } }
  const plan = { id: 'blocked-uninstall', kind: 'uninstall', components: ['shield'], entries: [], blockers: ['dependent-remains:panel->shield'] }
  globalThis.fetch = async (url, options) => { requests.push({ url, payload: JSON.parse(options.body) }); return { ok: true, json: async () => ({ ok: true, value: plan }) } }
  nodes(tree()).find((node) => node.props['data-guide-maintenance-key'] === 'shield').props.onChange()
  await button('maintenanceUninstall').props.onClick()
  assert.match(requests[0].url, /maintenance\/plan$/)
  assert.deepEqual(requests[0].payload, { kind: 'uninstall', components: ['shield'] })
  assert.equal(button('maintenanceConfirm').props.disabled, true)
  assert.match(text(tree()), /dependent-remains:panel->shield/)
})

test('manager preview confirms its exact target and pending UI exposes external recovery before restart', async () => {
  reset()
  snapshot.maintenance = { catalog: { versions: ['1.1.1'] } }
  const plan = { id: 'manager-plan', kind: 'manager-upgrade', components: ['manager'], target: { version: '1.1.1' }, entries: [], blockers: [] }
  globalThis.fetch = async (url, options) => { requests.push({ url, payload: JSON.parse(options.body) }); return { ok: true, json: async () => ({ ok: true, value: url.endsWith('/plan') ? plan : {} }) } }
  nodes(tree()).find((node) => node.props['aria-label'] === 'manager-target-version').props.onChange({ target: { value: '1.1.1' } })
  await button('maintenanceManager').props.onClick()
  await button('maintenanceConfirm').props.onClick()
  assert.deepEqual(requests[1].payload, { kind: 'manager-upgrade', components: ['manager'], version: '1.1.1', planId: 'manager-plan', confirm: true })
  snapshot.maintenance.pending = { id: 'manager-plan' }
  snapshot.maintenance.helperCommand = 'external-helper -Profile isolated'
  snapshot.maintenance.recoveryCommand = 'external-recovery -Profile isolated'
  assert.match(text(tree()), /external-helper/)
  assert.match(text(tree()), /external-recovery/)
  await button('maintenanceCancel').props.onClick()
  assert.deepEqual(requests[2].payload, { planId: 'manager-plan', confirm: true })
})

function sourceSnapshot(task = null) {
  reset()
  snapshot.distribution = { configured: true, repository: { owner: 'fixture', repo: 'guide' }, task,
    catalog: { snapshotId: 'snapshot', release: { tag: 'guide-test' }, versions: [
      ...COMPONENTS.flatMap((c) => ['1.1.0', '1.1.1'].map((version) => ({ key: c.key, version }))), { key: 'manager', version: '1.1.1' },
    ] } }
  globalThis.fetch = async (url, options) => {
    requests.push({ url, payload: JSON.parse(options.body) })
    return { ok: true, json: async () => ({ ok: true, value: { taskId: 'new-task' } }) }
  }
}
const sourceSelect = (name, value) => nodes(tree()).find((node) => node.props['aria-label'] === name).props.onChange({ target: { value } })

test('source UI is passive until check, explains missing configuration and retains local controls', async () => {
  sourceSnapshot()
  snapshot.distribution = { configured: false }
  assert.match(text(tree()), /sourceMissing/)
  assert.ok(button('installSelected'))
  assert.equal(button('sourceCheck'), undefined)
  assert.equal(requests.length, 0)
  snapshot.distribution = { configured: true, repository: { owner: 'fixture', repo: 'guide' }, task: null, catalog: null }
  await button('sourceCheck').props.onClick()
  assert.match(requests[0].url, /source\/check$/)
  assert.deepEqual(requests[0].payload, {})
})

test('source selectors send component keys and exact versions without credentials or paths', async () => {
  sourceSnapshot()
  await button('sourcePrepare').props.onClick()
  assert.deepEqual(requests[0].payload, { kind: 'install', snapshotId: 'snapshot', components: COMPONENTS.map((c) => c.key) })
  snapshot.components.forEach((c) => { c.installed = true; c.version = '1.1.0' })
  sourceSelect('source-operation', 'upgrade')
  assert.equal(button('sourcePrepare').props.disabled, true)
  sourceSelect('source-target-panel', '1.1.1')
  await button('sourcePrepare').props.onClick()
  assert.deepEqual(requests[1].payload, { kind: 'upgrade', snapshotId: 'snapshot', targets: [{ key: 'panel', version: '1.1.1' }] })
  sourceSelect('source-operation', 'manager-upgrade')
  sourceSelect('source-manager-version', '1.1.1')
  await button('sourcePrepare').props.onClick()
  assert.deepEqual(requests[2].payload, { kind: 'manager-upgrade', snapshotId: 'snapshot', version: '1.1.1' })
})

test('restored running tasks show progress, disable competing preparation and can be cancelled', async () => {
  sourceSnapshot({ id: 'running', kind: 'prepare', status: 'running', progress: { total: 4, completed: 1, bytes: 2048 } })
  assert.match(text(tree()), /sourceDownloading 1\/4 · 2 KB/)
  assert.equal(button('sourceCheck').props.disabled, true)
  assert.equal(button('sourcePrepare').props.disabled, true)
  await button('sourceCancel').props.onClick()
  assert.deepEqual(requests[0].payload, { taskId: 'running' })
  assert.match(requests[0].url, /source\/cancel$/)
})

test('ready preparation requires plan preview and explicit fingerprint confirmation; refresh shows helper', async () => {
  sourceSnapshot({ id: 'prepared', kind: 'prepare', status: 'ready' })
  assert.match(text(tree()), /sourceReady/)
  assert.equal(button('sourceConfirm'), undefined)
  globalThis.fetch = async (url, options) => {
    requests.push({ url, payload: JSON.parse(options.body) })
    return { ok: true, json: async () => ({ ok: true, value: { id: 'fingerprint', entries: [{ key: 'goal', package: '@local/dsh-guide-goal-adapter', version: '1.1.0' }], blockers: [] } }) }
  }
  await button('sourcePlan').props.onClick()
  assert.match(text(tree()), /@local\/dsh-guide-goal-adapter: 1\.1\.0/)
  await button('sourceConfirm').props.onClick()
  assert.deepEqual(requests[1].payload, { taskId: 'prepared', planId: 'fingerprint', confirm: true })
  snapshot.distribution.task.status = 'staged'
  snapshot.installation.pending = { id: 'fingerprint' }
  assert.match(text(tree()), /sourceStaged/)
  assert.match(text(tree()), /install-guide-manager.cmd/)
  assert.equal(button('sourcePlan'), undefined)
  assert.equal(button('sourceCheck').props.disabled, true)
})

test('source errors are localized, retries retain original options and link blockers prevent confirmation', async () => {
  const payload = { kind: 'install', snapshotId: 'original', components: ['goal'] }
  sourceSnapshot({ id: 'failed', kind: 'prepare', status: 'failed', error: 'github-http-401', payload })
  assert.match(text(tree()), /sourceAuth/)
  await button('sourceRetry').props.onClick()
  assert.deepEqual(requests[0].payload, payload)
  snapshot.distribution.task = { id: 'ready', kind: 'prepare', status: 'ready' }
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, value: { id: 'blocked', entries: [], blockers: ['source-not-pinned:panel'] } }) })
  await button('sourcePlan').props.onClick()
  assert.equal(button('sourceConfirm').props.disabled, true)
  assert.match(text(tree()), /sourceLink/)
})

test('one-click confirmation binds stage, execution plan, detached start and acknowledgement', async () => {
  sourceSnapshot({ id: 'prepared', kind: 'prepare', status: 'ready' })
  snapshot.profile = { dir: 'isolated-profile' }
  snapshot.execution = { available: true, active: false, task: null }
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body)
    requests.push({ url, payload })
    const value = url.endsWith('/source/plan') ? { id: 'package-plan', entries: [], blockers: [] }
      : url.endsWith('/source/stage') ? { planId: 'package-plan', application: 'pending-restart' }
        : url.endsWith('/execution/plan') ? { id: 'execution-fingerprint', pendingId: 'package-plan', blockers: [], entries: [] }
          : url.endsWith('/execution/start') ? { taskId: 'independent-worker' } : { application: 'restarting' }
    return { ok: true, json: async () => ({ ok: true, value }) }
  }
  await button('sourcePlan').props.onClick()
  assert.match(text(tree()), /executeWarning/)
  assert.equal(requests.length, 1)
  await button('executeConfirm').props.onClick()
  assert.deepEqual(requests.slice(1).map((r) => [r.url.split('/').slice(-2).join('/'), r.payload]), [
    ['source/stage', { taskId: 'prepared', planId: 'package-plan', confirm: true }],
    ['execution/plan', { pendingId: 'package-plan' }],
    ['execution/start', { planId: 'execution-fingerprint', confirm: true }],
    ['execution/ack', { taskId: 'independent-worker', confirm: true }],
  ])
  assert.equal(JSON.parse(storage.get('dsh-guide-manager.execution')).taskId, 'independent-worker')
  assert.match(text(tree()), /executeConnecting/)
  assert.ok(nodes(tree()).some((n) => n.type === 'fieldset' && n.props.disabled))
})

test('execution refusal leaves a staged plan without an automatic retry on render', async () => {
  sourceSnapshot({ id: 'prepared', kind: 'prepare', status: 'ready' })
  snapshot.profile = { dir: 'isolated-profile' }
  snapshot.execution = { available: true, active: false, task: null }
  globalThis.fetch = async (url, options) => {
    requests.push({ url, payload: JSON.parse(options.body) })
    if (url.endsWith('/execution/start')) return { ok: false, json: async () => ({ ok: false, error: { message: 'execution-launch-failed' } }) }
    const value = url.endsWith('/source/plan') ? { id: 'plan', entries: [], blockers: [] } : url.endsWith('/source/stage') ? { planId: 'plan' } : { id: 'execute-plan', pendingId: 'plan', entries: [], blockers: [] }
    return { ok: true, json: async () => ({ ok: true, value }) }
  }
  await button('sourcePlan').props.onClick()
  await button('executeConfirm').props.onClick()
  assert.equal(storage.size, 0)
  assert.match(text(tree()), /executeFailed/)
  assert.ok(!requests.some((r) => r.url.endsWith('/execution/ack')))
  const count = requests.length
  tree(); tree()
  assert.equal(requests.length, count)
})

test('pending-operation execution confirms the previewed execution fingerprint', async () => {
  reset()
  snapshot.profile = { dir: 'isolated-profile' }
  snapshot.execution = { available: true, active: false, task: null }
  snapshot.installation.pending = { id: 'existing-pending' }
  globalThis.fetch = async (url, options) => {
    requests.push({ url, payload: JSON.parse(options.body) })
    return { ok: true, json: async () => ({ ok: true, value: url.endsWith('/plan') ? { id: 'previewed', pendingId: 'existing-pending', entries: [], blockers: [] } : { taskId: 'worker' } }) }
  }
  await button('executeStart').props.onClick()
  await button('executeConfirm').props.onClick()
  assert.equal(requests.filter((r) => r.url.endsWith('/plan')).length, 1)
  assert.deepEqual(requests[1].payload, { planId: 'previewed', confirm: true })
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTaskRegistry, taskSnapshot, createTaskListView, sessionFacade } from '../core.js'

const guideFilter = (entry, summary) => (entry?.label ?? summary?.displayTitle ?? '').startsWith('指导: ')
function fixture() {
  const byId = Object.freeze({
    root: { id: 'root', origin: 'user' },
    guide: { id: 'guide', origin: 'subagent', parentId: 'root', displayTitle: '指导: question' },
    nested: { id: 'nested', origin: 'subagent', parentId: 'guide', displayTitle: 'work under guide' },
    worker: { id: 'worker', origin: 'subagent', parentId: 'root', displayTitle: 'work' },
  })
  const catalog = [{ id: 'guide', label: '指导: question' }, { id: 'worker', label: 'work' }]
  return Object.freeze({ byId, projectionsBySession: { root: { state: 'ready', values: { subagentCatalog: catalog, metrics: { tokens: 12 } } } } })
}
test('task enumeration hides guidance branches while direct session lookups remain valid', () => {
  const registry = createTaskRegistry(), source = fixture()
  registry.registerTaskFilter(guideFilter)
  const view = taskSnapshot(source, registry)
  assert.deepEqual(Object.keys(view.byId), ['root', 'worker'])
  assert.equal(view.byId.guide, source.byId.guide)
  assert.equal(view.byId.nested, source.byId.nested)
  assert.deepEqual(view.projectionsBySession.root.values.subagentCatalog.map(row => row.id), ['worker'])
  assert.equal(view.projectionsBySession.root.values.metrics, source.projectionsBySession.root.values.metrics)
  assert.equal(source.projectionsBySession.root.values.subagentCatalog.length, 2)
  assert.throws(() => { view.byId.root = null }, /read-only/)
})
test('registry changes notify once, refresh stable snapshots, and dispose cleanly', () => {
  const registry = createTaskRegistry(), source = fixture()
  let sourceListener, notifications = 0
  const store = { getSnapshot: () => source, subscribe(fn) { sourceListener = fn; return () => { sourceListener = undefined } } }
  const view = createTaskListView(store, registry)
  const off = view.subscribe(() => notifications++)
  assert.equal(view.getSnapshot(), source)
  const filterOff = registry.registerTaskFilter(guideFilter)
  const first = view.getSnapshot()
  assert.equal(view.getSnapshot(), first); assert.equal(notifications, 1)
  filterOff(); assert.equal(view.getSnapshot(), source); assert.equal(notifications, 2)
  off(); assert.equal(sourceListener, undefined)
  registry.registerTaskFilter(guideFilter); assert.equal(notifications, 2)
})
test('unknown or broken classifiers preserve ordinary tasks and cycles terminate', () => {
  const registry = createTaskRegistry()
  registry.registerTaskFilter(() => { throw new Error('bad consumer') })
  const source = fixture()
  assert.equal(taskSnapshot(source, registry), source)
  registry.registerTaskFilter(guideFilter)
  source.byId.root.parentId = 'worker'
  assert.equal(Object.keys(taskSnapshot(source, registry).byId).length, 2)
})
test('sections preserve order/identity and session methods retain their receiver', () => {
  const registry = createTaskRegistry()
  const off = registry.registerTaskSection({ id: 'a', order: 20, component() {} })
  registry.registerTaskSection({ id: 'b', order: 10, component() {} })
  assert.deepEqual(registry.getTaskSections().map(row => row.id), ['b', 'a'])
  assert.throws(() => registry.registerTaskSection({ id: 'a', component() {} }), /already/)
  off(); assert.deepEqual(registry.getTaskSections().map(row => row.id), ['b'])
  const sessions = { value: 7, list: { getSnapshot: fixture, subscribe: () => () => {} }, method() { return this.value } }
  assert.equal(sessionFacade(sessions, registry).method(), 7)
})


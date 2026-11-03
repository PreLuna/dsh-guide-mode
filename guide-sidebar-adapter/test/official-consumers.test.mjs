import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTaskRegistry, taskSnapshot } from '../core.js'
import * as official from '../../evidence/LI-stage2-2026-11-02/official/package/src/client/subagent-detect.ts'

test('actual stock auto-open and count consumers read the private filtered view', () => {
  const registry = createTaskRegistry()
  registry.registerTaskFilter((entry, summary) => (entry?.label ?? summary?.displayTitle ?? '').startsWith('指导: '))
  const root = { id: 'root', origin: 'user', displayTitle: 'Root' }
  const guide = { id: 'guide', parentId: 'root', origin: 'subagent', displayTitle: '指导: Example' }
  const worker = { id: 'work', parentId: 'root', origin: 'subagent', displayTitle: 'Work' }
  const empty = { byId: { root } }, onlyGuidance = { byId: { root, guide } }, all = { byId: { root, guide, worker } }
  const before = taskSnapshot(empty, registry), afterGuide = taskSnapshot(onlyGuidance, registry)
  assert.equal(official.detectNewDirectSubagent(before, afterGuide, 'root'), false)
  assert.equal(official.directSubagentCount(taskSnapshot(all, registry).byId, 'root'), 1)
  assert.equal(official.detectNewDirectSubagent(afterGuide, taskSnapshot(all, registry), 'root'), true)
  assert.equal(official.countSubagentDescendants(taskSnapshot(all, registry).byId, 'root').count, 1)
})

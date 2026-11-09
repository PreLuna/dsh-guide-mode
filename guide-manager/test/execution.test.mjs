import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createExecutionController } from '../execution.js'
import { createInstallPlan, profileSnapshot, readCatalog, readJson, stageInstall, writeJson } from '../install.js'
import { COMPONENTS } from '../core.js'
import { prepareRemoteRelease } from '../../scripts/lib/release-bundle.mjs'
import { baselineSource } from './baseline-source.mjs'

test('execution preview, confirmed handoff and fresh-Host reconciliation', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'guide-execution-'))
  t.after(() => { assert.ok(!relative(tmpdir(), root).startsWith('..')); rmSync(root, { recursive: true, force: true }) })
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), managerRoot = join(workspace, 'guide-manager')
  const bundle = prepareRemoteRelease({ development: true, sourceRoot: baselineSource(join(root, 'source'), workspace), repository: { owner: 'PreLuna', repo: 'dsh-guide-mode' }, tag: 'execution-test', output: join(root, 'bundle') })
  const catalogPath = join(root, 'install.json')
  writeJson(catalogPath, { schema: 1, product: 'dsh-guide-mode', components: bundle.catalog.artifacts.filter((a) => a.key !== 'manager').map((a) => ({ ...a, file: join(bundle.directory, a.source.asset) })) })
  let count = 0
  const fixture = (options = {}) => {
    const profile = { dir: join(root, `profile-${++count}`), name: 'execution', installAnchor: 'isolated' }
    mkdirSync(profile.dir)
    writeJson(join(profile.dir, 'package.json'), { private: true, dependencies: {}, dsh: { profile: { bundles: [] } } })
    const state = { profile, host: { verified: true, dsh: { match: true }, cordis: { match: true }, artifacts: { verified: true } }, components: COMPONENTS.map((c) => ({ ...c, installed: false, version: null, expectedVersion: '1.1.0', expectedContract: 1 })) }
    const catalog = readCatalog(catalogPath), preview = createInstallPlan(state, catalog, ['goal'])
    stageInstall(state, catalog, ['goal'], preview.id)
    const calls = [], host = { pid: process.pid, executable: join(root, 'DeepSeek Harness.exe'), startedAt: new Date(Date.now() - 5000).toISOString() }
    const launch = async (request) => { calls.push(request); if (options.fail) throw Error('execution-launch-failed'); return { pid: process.pid, createdAt: host.startedAt } }
    const settings = { profile, managerRoot, host, platform: 'win32', launch }
    return { profile, state, preview, calls, settings, execution: createExecutionController(settings) }
  }
  await t.test('read-only exact preview and explicit ack precede any shutdown', async () => {
    const f = fixture(), before = profileSnapshot(f.profile.dir)
    const plan = f.execution.plan(f.state, f.preview.id)
    assert.deepEqual(plan.blockers, [])
    assert.deepEqual(plan.entries.map((e) => e.key), ['goal'])
    assert.equal(existsSync(join(f.profile.dir, '.guide-manager/controllers')), false)
    assert.equal(f.calls.length, 0)
    const job = await f.execution.start(f.state, plan.id)
    assert.equal(f.calls.length, 1)
    assert.throws(() => f.execution.seen(job.taskId), /execution-result-not-ready/)
    const request = f.calls[0]
    assert.equal(existsSync(join(dirname(request.path), 'ready.json')), false)
    assert.ok(existsSync(join(request.controller, 'helper/run-execution.ps1')))
    assert.ok(existsSync(join(dirname(request.path), 'recovery.txt')))
    assert.deepEqual(profileSnapshot(f.profile.dir), before)
    await assert.rejects(() => f.execution.start(f.state, plan.id), /execution-busy/)
    f.execution.acknowledge(f.state, job.taskId)()
    assert.equal(readJson(join(dirname(request.path), 'ready.json')).planId, plan.id)
  })
  await t.test('profile or pending drift before start/ack refuses the handoff', async () => {
    const f = fixture(), plan = f.execution.plan(f.state)
    writeFileSync(join(f.profile.dir, 'pnpm-workspace.yaml'), 'changed')
    await assert.rejects(() => f.execution.start(f.state, plan.id), /stale|changed/)
    assert.equal(f.calls.length, 0)
    const g = fixture(), p = g.execution.plan(g.state), job = await g.execution.start(g.state, p.id)
    const file = join(g.profile.dir, '.guide-manager/install-pending.json')
    writeFileSync(file, readFileSync(file, 'utf8').replace('pending-restart', 'tampered'))
    assert.throws(() => g.execution.acknowledge(g.state, job.taskId), /invalid|stale|changed/)
    assert.equal(existsSync(join(dirname(g.calls[0].path), 'ready.json')), false)
  })
  await t.test('launch failure retains the plan and releases execution lock', async () => {
    const f = fixture({ fail: true }), plan = f.execution.plan(f.state), before = profileSnapshot(f.profile.dir)
    await assert.rejects(() => f.execution.start(f.state, plan.id), /execution-launch-failed/)
    assert.equal(f.execution.busy(), false)
    assert.equal(f.execution.view(f.state).task.status, 'failed')
    assert.ok(existsSync(join(f.profile.dir, '.guide-manager/install-pending.json')))
    assert.deepEqual(profileSnapshot(f.profile.dir), before)
  })
  await t.test('completed means a fresh Host verified this exact consumed plan', async () => {
    const f = fixture(), plan = f.execution.plan(f.state), job = await f.execution.start(f.state, plan.id)
    writeJson(join(dirname(f.calls[0].path), 'status.json'), { id: job.taskId, pendingId: f.preview.id, status: 'awaiting-verification' })
    unlinkSync(join(f.profile.dir, '.guide-manager/execution/operation.lock'))
    const next = createExecutionController({ ...f.settings, host: { ...f.settings.host, startedAt: new Date(Date.now() + 1000).toISOString() } })
    f.state.installation = { verification: 'verified-running', result: { planId: 'other' } }
    assert.equal(next.view(f.state).task.status, 'awaiting-verification')
    unlinkSync(join(f.profile.dir, '.guide-manager/install-pending.json'))
    assert.equal(next.view(f.state).task.status, 'awaiting-verification')
    f.state.installation.result.planId = f.preview.id
    assert.equal(next.view(f.state).task.status, 'completed')
    assert.equal(next.view(f.state).task.returnToManager, true)
    next.seen(job.taskId)
    assert.equal(next.view(f.state).task.returnToManager, false)
  })
})

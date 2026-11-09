import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENTS } from '../core.js'
import { cacheArtifact, cachePath, fingerprint, profileSnapshot, readJson, writeJson } from '../install.js'
import { artifactInventory } from '../artifacts.js'
import { validateInstallPlan } from '../helper/apply-install.mjs'
import { createRemoteManager } from '../remote.js'
import { prepareRemoteRelease } from '../../scripts/lib/release-bundle.mjs'

test('consumer query, preparation and offline installer bridge', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'guide-remote-'))
  t.after(() => { assert.ok(!relative(tmpdir(), root).startsWith('..')); rmSync(root, { recursive: true, force: true }) })
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const host = readJson(join(workspace, 'guide-manager/package.json')).dshGuide.host
  const bundle = prepareRemoteRelease({ development: true, sourceRoot: workspace, repository: { owner: 'PreLuna', repo: 'dsh-guide-mode' }, tag: 'guide-test', output: join(root, 'bundle') })
  const catalog = structuredClone(bundle.catalog)
  catalog.release = { tag: 'guide-test', commit: 'a'.repeat(40), channel: 'stable', source: 'git-commit' }
  catalog.artifacts.forEach((a) => { a.source.commit = catalog.release.commit })
  let count = 0
  const fixture = (options = {}) => {
    const profile = { dir: join(root, `profile-${++count}`), name: 'test', installAnchor: 'isolated' }
    mkdirSync(profile.dir)
    writeJson(join(profile.dir, 'package.json'), { private: true, dependencies: {}, dsh: { profile: { bundles: [] } } })
    writeFileSync(join(profile.dir, 'cordis.patch.yml'), '[]\n')
    const config = { schema: 1, provider: 'github', owner: 'PreLuna', repo: 'dsh-guide-mode', channel: 'stable', tokenEnv: 'DSH_GUIDE_GITHUB_TOKEN' }
    const state = { profile, pending: { present: false }, host: { verified: true, dsh: { match: true }, cordis: { match: true }, betterSidebar: { match: true }, artifacts: { verified: true } }, components: COMPONENTS.map((c) => ({ ...c, expectedVersion: '1.1.0', expectedContract: 1, installed: false, version: null })) }
    const calls = [], assets = [{ id: 1, name: 'guide-release.json', size: Buffer.byteLength(JSON.stringify(catalog)), state: 'uploaded' },
      ...catalog.artifacts.map((a, i) => ({ id: i + 2, name: a.source.asset, size: a.bytes, state: 'uploaded' }))]
    const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers })
    const fetchImpl = async (address, request) => {
      const path = new URL(address).pathname.replace('/repos/PreLuna/dsh-guide-mode', '')
      calls.push(path)
      assert.equal(request.headers.Authorization, 'Bearer test-secret-token')
      if (options.auth) return json({}, 403, { 'x-ratelimit-remaining': options.rate ? '0' : '10' })
      if (path === '') return json({ id: 1 })
      if (path === '/releases') return json(options.fullHistory ? Array.from({ length: 50 }, (_, i) => ({ id: i + 10, draft: false, prerelease: true })) : options.empty ? [] : [{ id: 5, tag_name: 'guide-test', draft: false, prerelease: false, published_at: '2026-11-09T00:00:00Z' }])
      if (path === '/releases/5/assets') return json(assets)
      if (path.startsWith('/releases/tags/')) return json({ id: 5, tag_name: 'guide-test', draft: false })
      if (path.startsWith('/git/ref/tags/')) return json({ object: { type: 'commit', sha: catalog.release.commit } })
      if (path === '/releases/assets/1') return new Response(JSON.stringify(catalog))
      if (path.startsWith('/releases/assets/')) {
        if (options.hang) return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(Error('secret must not escape')), { once: true }))
        if (options.retry && !options.retried) { options.retried = true; throw Error('network secret') }
        const entry = catalog.artifacts[Number(path.split('/').at(-1)) - 2]
        return new Response(options.corrupt ? Buffer.alloc(entry.bytes) : readFileSync(join(bundle.directory, entry.source.asset)))
      }
      throw Error('unhandled')
    }
    const settings = { profile, sourceConfig: config, host, managerRoot: join(workspace, 'guide-manager'), fetchImpl, env: { DSH_GUIDE_GITHUB_TOKEN: 'test-secret-token' } }
    const remote = createRemoteManager(settings)
    const check = async () => { const job = remote.check(); const task = await remote.wait(job.taskId); assert.equal(task.status, 'ready', JSON.stringify(task)); return task.result.snapshotId }
    return { profile, state, remote, calls, check, config, settings }
  }
  await t.test('metadata query fetches no packages; optional goal prepares only one package and stages offline', async () => {
    const f = fixture(), before = profileSnapshot(f.profile.dir)
    const snapshotId = await f.check()
    assert.equal(f.calls.filter((p) => /assets\/[2-9]/.test(p)).length, 0)
    const job = f.remote.prepare({ kind: 'install', snapshotId, components: ['goal'] }, f.state)
    const task = await f.remote.wait(job.taskId)
    assert.equal(task.status, 'ready', JSON.stringify(task))
    assert.equal(task.progress.total, 1)
    assert.deepEqual(profileSnapshot(f.profile.dir), before)
    const prepared = f.remote.plan(job.taskId, f.state)
    assert.deepEqual(prepared.blockers, [])
    f.remote.stage(job.taskId, prepared.id, f.state)
    const pending = join(f.profile.dir, '.guide-manager/install-pending.json')
    assert.equal(validateInstallPlan(readJson(pending), pending).id, prepared.id)
    assert.deepEqual(profileSnapshot(f.profile.dir), before)
  })
  await t.test('dependency closure downloads four packages; cached preparation reuses all bytes', async () => {
    const f = fixture(), snapshotId = await f.check()
    const request = { kind: 'install', snapshotId, components: ['panel'] }
    const first = await f.remote.wait(f.remote.prepare(request, f.state).taskId)
    assert.equal(first.status, 'ready', JSON.stringify(first)); assert.equal(first.progress.total, 4)
    const downloads = f.calls.filter((p) => /assets\/[2-9]/.test(p)).length
    const second = await f.remote.wait(f.remote.prepare(request, f.state).taskId)
    assert.equal(second.status, 'ready'); assert.equal(f.calls.filter((p) => /assets\/[2-9]/.test(p)).length, downloads)
  })
  await t.test('wrong bytes fail without changing configuration or committing corrupt cache', async () => {
    const f = fixture({ corrupt: true }), before = profileSnapshot(f.profile.dir), snapshotId = await f.check()
    const task = await f.remote.wait(f.remote.prepare({ kind: 'install', snapshotId, components: ['goal'] }, f.state).taskId)
    assert.equal(task.status, 'failed'); assert.equal(task.error, 'source-integrity-mismatch')
    assert.deepEqual(profileSnapshot(f.profile.dir), before)
    assert.equal(existsSync(cachePath(f.profile.dir, catalog.artifacts.find((a) => a.key === 'goal').sha256)), false)
  })
  await t.test('cancel stops active download, releases lock, persists state and never leaks credentials', async () => {
    const f = fixture({ hang: true }), snapshotId = await f.check()
    const job = f.remote.prepare({ kind: 'install', snapshotId, components: ['goal'] }, f.state)
    while (!f.calls.some((p) => /assets\/[2-9]/.test(p))) await new Promise((r) => setTimeout(r, 1))
    const other = createRemoteManager(f.settings)
    assert.throws(() => other.check(), /busy/)
    f.remote.cancel(job.taskId)
    assert.equal((await f.remote.wait(job.taskId)).status, 'cancelled')
    assert.doesNotMatch(JSON.stringify(f.remote.view()), /test-secret-token|Authorization/)
    assert.equal(other.view().task.status, 'cancelled')
  })
  await t.test('bounded network retry succeeds; configuration drift invalidates prepared plans', async () => {
    const f = fixture({ retry: true }), snapshotId = await f.check()
    const job = f.remote.prepare({ kind: 'install', snapshotId, components: ['goal'] }, f.state)
    assert.equal((await f.remote.wait(job.taskId)).status, 'ready')
    f.config.repo = 'another'
    assert.throws(() => f.remote.plan(job.taskId, f.state), /stale/)
  })
  await t.test('auth and rate-limit failures are distinct from a genuinely empty channel', async () => {
    for (const [options, error] of [[{ auth: true }, 'github-http-403'], [{ auth: true, rate: true }, 'github-rate-limited']]) {
      const f = fixture(options), task = await f.remote.wait(f.remote.check().taskId)
      assert.equal(task.status, 'failed'); assert.equal(task.error, error)
    }
    const f = fixture({ empty: true }), task = await f.remote.wait(f.remote.check().taskId)
    assert.deepEqual(task.result, { available: false })
    const limited = fixture({ fullHistory: true }), limitTask = await limited.remote.wait(limited.remote.check().taskId)
    assert.equal(limitTask.error, 'source-history-limit')
  })
  await t.test('profile drift and unknown transport inputs cannot bypass a prepared plan', async () => {
    const f = fixture(), snapshotId = await f.check()
    assert.throws(() => f.remote.prepare({ kind: 'install', snapshotId, components: ['goal'], url: 'https://invalid' }, f.state), /invalid/)
    const job = f.remote.prepare({ kind: 'install', snapshotId, components: ['goal'] }, f.state)
    await f.remote.wait(job.taskId)
    writeFileSync(join(f.profile.dir, 'cordis.patch.yml'), '# user edit\n[]\n')
    assert.throws(() => f.remote.plan(job.taskId, f.state), /stale/)
  })
  await t.test('upgrade bridge verifies a chosen complete combination and retains pinned prior versions', async () => {
    const f = fixture(), doc = readJson(join(f.profile.dir, 'package.json'))
    for (const entry of catalog.artifacts.filter((a) => a.key !== 'manager')) {
      const file = cacheArtifact(f.profile.dir, { ...entry, file: join(bundle.directory, entry.source.asset) })
      doc.dependencies[entry.package] = `file:${file}`
      doc.dsh.profile.bundles.push(entry.package)
      writeJson(join(f.profile.dir, 'node_modules', ...entry.package.split('/'), 'package.json'), artifactInventory(file, entry.sha256).manifest)
      Object.assign(f.state.components.find((c) => c.key === entry.key), { installed: true, enabled: true, version: entry.version, contract: 1 })
    }
    writeJson(join(f.profile.dir, 'package.json'), doc)
    const snapshotId = await f.check()
    const job = f.remote.prepare({ kind: 'upgrade', snapshotId, targets: [{ key: 'panel', version: '1.1.0' }] }, f.state)
    const task = await f.remote.wait(job.taskId)
    assert.equal(task.status, 'ready', JSON.stringify(task))
    assert.equal(f.remote.plan(job.taskId, f.state).entries.length, 6)
    assert.equal(f.calls.filter((p) => /assets\/[2-9]/.test(p)).length, 0)
  })
  await t.test('manager preparation yields a strictly verified schema 3 directory', async () => {
    const f = fixture(), snapshotId = await f.check()
    const task = await f.remote.wait(f.remote.prepare({ kind: 'manager-upgrade', snapshotId, version: '1.1.0' }, f.state).taskId)
    assert.equal(task.status, 'ready', JSON.stringify(task))
    assert.equal(readJson(task.result.catalogPath).schema, 3)
    assert.equal(task.progress.total, 1)
  })
  await t.test('restart marks abandoned task interrupted and permits retry after dead owner', async () => {
    const f = fixture()
    const id = '11111111-1111-4111-8111-111111111111', root = join(f.profile.dir, '.guide-manager/remote')
    writeJson(join(root, `${id}.json`), { schema: 1, id, kind: 'check', status: 'running' })
    writeJson(join(root, 'latest.json'), { id })
    // A non-existent PID, not a live PID reused by this test.
    writeJson(join(root, 'operation.lock'), { id, pid: 2147483647 })
    assert.equal(f.remote.view().task.status, 'interrupted')
    await f.check()
    assert.equal(f.remote.view().task.status, 'ready')
  })
})

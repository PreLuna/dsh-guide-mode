import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../index.js'
import { profileSnapshot, writeJson } from '../install.js'
import { prepareRemoteRelease } from '../../scripts/lib/release-bundle.mjs'

function call(route, action, payload = {}, { method = 'POST', raw } = {}) {
  const req = Object.assign(new EventEmitter(), { url: `/guide-manager/api/${action}`, method, destroy() {} })
  return new Promise((resolveResult) => {
    const res = { statusCode: 200, setHeader() {}, end(text) { resolveResult({ status: this.statusCode, body: JSON.parse(text) }) } }
    route.handler(req, res)
    queueMicrotask(() => { req.emit('data', Buffer.from(raw ?? JSON.stringify(payload))); req.emit('end') })
  })
}

test('source HTTP uses async tasks, guarded payloads and the existing offline staging path', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'guide-source-http-'))
  const originalFetch = globalThis.fetch
  const previousToken = process.env.DSH_GUIDE_GITHUB_TOKEN
  t.after(() => {
    globalThis.fetch = originalFetch
    if (previousToken === undefined) delete process.env.DSH_GUIDE_GITHUB_TOKEN
    else process.env.DSH_GUIDE_GITHUB_TOKEN = previousToken
    assert.ok(!relative(tmpdir(), root).startsWith('..'))
    rmSync(root, { recursive: true, force: true })
  })
  process.env.DSH_GUIDE_GITHUB_TOKEN = 'fixture-secret-never-render'
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const bundle = prepareRemoteRelease({ development: true, sourceRoot: workspace, repository: { owner: 'fixture', repo: 'guide' }, tag: 'guide-http-test', output: join(root, 'bundle') })
  const catalog = structuredClone(bundle.catalog)
  catalog.release = { tag: 'guide-http-test', commit: 'b'.repeat(40), channel: 'stable', source: 'git-commit' }
  catalog.artifacts.forEach((a) => { a.source.commit = catalog.release.commit })
  const assets = [{ id: 1, name: 'guide-release.json', size: Buffer.byteLength(JSON.stringify(catalog)), state: 'uploaded' },
    ...catalog.artifacts.map((a, i) => ({ id: i + 2, name: a.source.asset, size: a.bytes, state: 'uploaded' }))]
  const calls = []
  let hang = false, deny = false, serial = 0
  globalThis.fetch = async (address, request) => {
    const path = new URL(address).pathname.replace('/repos/fixture/guide', '')
    calls.push(path)
    assert.equal(request.headers.Authorization, 'Bearer fixture-secret-never-render')
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
    if (deny) return json({ message: 'remote-private-body' }, 401)
    if (!path) return json({ id: 1 })
    if (path === '/releases') return json([{ id: 5, tag_name: catalog.release.tag, draft: false, prerelease: false, published_at: '2026-11-09T00:00:00Z' }])
    if (path === '/releases/5/assets') return json(assets)
    if (path.startsWith('/releases/tags/')) return json({ id: 5, tag_name: catalog.release.tag, draft: false })
    if (path.startsWith('/git/ref/tags/')) return json({ object: { type: 'commit', sha: catalog.release.commit } })
    if (path === '/releases/assets/1') return new Response(JSON.stringify(catalog))
    if (path.startsWith('/releases/assets/')) {
      if (hang) return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(Error('remote-private-body')), { once: true }))
      const entry = catalog.artifacts[Number(path.split('/').at(-1)) - 2]
      return new Response(readFileSync(join(bundle.directory, entry.source.asset)))
    }
    throw Error('unexpected fixture request')
  }
  const fixture = async ({ reject = false } = {}) => {
    const profile = join(root, `profile-${++serial}`)
    mkdirSync(profile)
    writeJson(join(profile, 'package.json'), { private: true, dependencies: { '@local/dsh-guide-manager': `link:${join(workspace, 'guide-manager')}` }, dsh: { profile: { bundles: ['@local/dsh-guide-manager'] } } })
    let route
    const store = new Map([
      ['profileContext', { dir: profile, name: 'source-http', home: root, installAnchor: join(root, 'install.json') }],
      ['clientModules', { release: { version: '0.2.1-rc.3', commit: 'be72761' } }],
      ['pluginPackages', { packageOf(name) { return name === '@deepseek-ai/cordis' ? { version: '4.0.5' } : undefined } }],
      ['pluginManager', { listPlugins: async () => [], listBundles: () => [] }],
      ['webServer', { register(options) { route = options; return () => {} } }],
      ['connection', { requestRejection: () => reject ? 403 : undefined }],
    ])
    const ctx = { get: (key) => store.get(key), provide: (key, value) => store.set(key, value), effect: (fn) => fn(), inject: (_names, cb) => cb(ctx) }
    await apply(ctx, { checkArtifacts: false, source: { schema: 1, provider: 'github', owner: 'fixture', repo: 'guide', channel: 'stable', tokenEnv: 'DSH_GUIDE_GITHUB_TOKEN' } })
    const service = store.get('guideManager')
    const check = async () => {
      const response = await call(route, 'source/check')
      assert.equal(response.status, 200)
      const task = await service.sourceTask(response.body.value.taskId)
      assert.equal(task.status, 'ready', JSON.stringify(task))
      return task.result.snapshotId
    }
    return { profile, service, route, check }
  }
  await t.test('all source endpoints honor the connection fence before reading or fetching', async () => {
    const f = await fixture({ reject: true }), before = calls.length
    for (const action of ['check', 'prepare', 'task', 'cancel', 'plan', 'stage']) assert.equal((await call(f.route, `source/${action}`)).status, 403)
    assert.equal(calls.length, before)
  })
  await t.test('method, route, JSON, size and payload allowlists reject unintended input', async () => {
    const f = await fixture(), before = calls.length
    assert.equal((await call(f.route, 'source/check', {}, { method: 'GET' })).status, 405)
    assert.equal((await call(f.route, 'source/toString')).status, 404)
    assert.equal((await call(f.route, 'source/nested/check')).status, 404)
    for (const raw of ['[1]', 'null', '{broken', JSON.stringify({ ignored: 'x'.repeat(17_000) })]) {
      assert.equal((await call(f.route, 'source/check', {}, { raw })).status, 400)
    }
    for (const action of ['check', 'prepare', 'task', 'cancel', 'plan', 'stage']) {
      const r = await call(f.route, `source/${action}`, { token: 'secret', url: 'http://untrusted', file: 'arbitrary', owner: 'other' })
      assert.equal(r.status, 400)
      assert.equal(r.body.error.code, 'source-invalid-request')
    }
    assert.equal(calls.length, before)
  })
  await t.test('check, reload, prepare, plan and confirm preserve profile bytes and persist pending', async () => {
    const f = await fixture(), before = profileSnapshot(f.profile)
    const snapshotId = await f.check()
    const checked = (await call(f.route, 'state', {}, { method: 'GET' })).body.value
    assert.equal(checked.distribution.catalog.snapshotId, snapshotId)
    assert.equal(checked.distribution.catalog.release.tag, catalog.release.tag)
    assert.equal(calls.filter((path) => /^\/releases\/assets\/[2-9]/.test(path)).length, 0)
    const response = await call(f.route, 'source/prepare', { kind: 'install', snapshotId, components: ['goal'] })
    assert.equal(response.status, 200, JSON.stringify(response.body))
    const taskId = response.body.value.taskId
    assert.equal((await f.service.sourceTask(taskId)).status, 'ready')
    assert.equal((await call(f.route, 'source/task', { taskId })).body.value.status, 'ready')
    const state = await f.service.getState()
    assert.equal(state.distribution.catalog.snapshotId, snapshotId)
    assert.equal(state.distribution.task.id, taskId)
    const plan = (await call(f.route, 'source/plan', { taskId })).body.value
    assert.deepEqual(plan.blockers, [])
    assert.equal((await call(f.route, 'source/stage', { taskId, planId: plan.id })).body.error.code, 'confirmation-required')
    assert.equal((await call(f.route, 'source/stage', { taskId, planId: 'stale', confirm: true })).body.error.code, 'source-plan-changed')
    assert.deepEqual(profileSnapshot(f.profile), before)
    const staged = await call(f.route, 'source/stage', { taskId, planId: plan.id, confirm: true })
    assert.equal(staged.status, 200, JSON.stringify(staged.body))
    assert.equal(staged.body.value.application, 'pending-restart')
    const refreshed = await f.service.getState()
    assert.equal(refreshed.distribution.task.status, 'staged')
    assert.equal(refreshed.installation.pending.id, plan.id)
    assert.match(refreshed.installation.helperCommand, /-Profile/)
    assert.deepEqual(profileSnapshot(f.profile), before)
    assert.doesNotMatch(JSON.stringify(refreshed.distribution), /fixture-secret-never-render|remote-private-body/)
    assert.equal((await call(f.route, 'source/plan', { taskId })).status, 409)
  })
  await t.test('running task polling never waits for download, cancellation and retry are explicit', async () => {
    const f = await fixture(), before = profileSnapshot(f.profile), snapshotId = await f.check()
    hang = true
    const payload = { kind: 'install', snapshotId, components: ['goal'] }
    const response = await call(f.route, 'source/prepare', payload), taskId = response.body.value.taskId
    assert.equal((await call(f.route, 'source/task', { taskId })).body.value.status, 'running')
    assert.equal((await call(f.route, 'source/prepare', payload)).status, 409)
    assert.equal((await call(f.route, 'source/cancel', { taskId })).body.value.status, 'cancelling')
    assert.equal((await f.service.sourceTask(taskId)).status, 'cancelled')
    hang = false
    const retry = await call(f.route, 'source/prepare', payload)
    assert.equal((await f.service.sourceTask(retry.body.value.taskId)).status, 'ready')
    assert.deepEqual(profileSnapshot(f.profile), before)
  })
  await t.test('upstream failures remain coded and private bodies never enter HTTP state', async () => {
    const f = await fixture()
    deny = true
    const response = await call(f.route, 'source/check')
    assert.equal(response.status, 200)
    const task = (await call(f.route, 'source/task', { taskId: response.body.value.taskId })).body.value
    const finished = task.status === 'running' ? await f.service.sourceTask(task.id) : task
    assert.equal(finished.error, 'github-http-401')
    assert.doesNotMatch(JSON.stringify(finished), /fixture-secret-never-render|remote-private-body/)
    deny = false
  })
})

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../index.js'
import { COMPONENTS } from '../core.js'
import { createInstallPlan, digest, installView, profileSnapshot, readCatalog, readJson, stageInstall, writeJson } from '../install.js'
import { applyInstall } from '../helper/apply-install.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'guide-install-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const profile = join(root, 'profile')
  mkdirSync(profile)
  writeJson(join(profile, 'package.json'), { name: 'isolated', private: true, dependencies: { '@local/dsh-guide-manager': 'link:manager' }, dsh: { profile: { bundles: ['@local/dsh-guide-manager'] } } })
  writeFileSync(join(profile, 'cordis.patch.yml'), '# retained comment\n[]\n')
  const components = COMPONENTS.map((entry) => {
    const file = join(root, `${entry.key}.tgz`)
    writeFileSync(file, `tarball:${entry.key}`)
    return { key: entry.key, package: entry.package, version: '1.1.0', contract: 1, file, sha256: digest(readFileSync(file)) }
  })
  const catalogPath = join(root, 'catalog.json')
  writeJson(catalogPath, { schema: 1, product: 'dsh-guide-mode', components })
  const state = {
    profile: { dir: profile, name: 'isolated', installAnchor: join(root, 'install.json') },
    pending: { present: false },
    host: { verified: true, dsh: { match: true }, cordis: { match: true }, betterSidebar: { match: true }, artifacts: { verified: true } },
    skills: { status: 'missing' },
    components: components.map((item) => ({ ...item, installed: false, version: null, expectedVersion: '1.1.0', expectedContract: 1, contract: null })),
  }
  return { root, profile, state, catalogPath, release: () => readCatalog(catalogPath) }
}

function prepare(data, requested = ['panel']) {
  const release = data.release()
  const plan = createInstallPlan(data.state, release, requested)
  const result = stageInstall(data.state, release, requested, plan.id)
  return { plan, path: result.pendingPath }
}

function fakeRuntime(data, { failInstall = false, failRepair = false, failPatch = false, changeUnrelated = false } = {}) {
  const calls = []
  const runtime = {
    async withLock(path, callback) { calls.push(['lock', path]); return callback() },
    async run(context, args) {
      calls.push(['run', ...args])
      if (args[0] === 'install') return { exitCode: failRepair ? 1 : 0 }
      const manifest = readJson(join(context.dir, 'package.json'))
      for (const spec of args.filter((arg) => arg.endsWith('.tgz'))) {
        const entry = data.release().catalog.components.find((item) => item.sha256 === digest(readFileSync(spec)))
        manifest.dependencies[entry.package] = `file:${spec}`
        writeJson(join(context.dir, 'node_modules', ...entry.package.split('/'), 'package.json'), {
          name: entry.package, version: entry.version, dshGuide: { contract: entry.contract }, dsh: { bundle: { patch: './cordis.patch.yml' } },
        })
      }
      if (changeUnrelated) manifest.unrelated = true
      writeJson(join(context.dir, 'package.json'), manifest)
      writeFileSync(join(context.dir, 'pnpm-lock.yaml'), 'changed-lock')
      return { exitCode: failInstall ? 1 : 0, logPath: 'isolated-pnpm.log' }
    },
    async saveManifest(profile, manifest) { calls.push(['select']); writeJson(join(profile, 'package.json'), manifest) },
    async writePluginEnabled(profile, id, moduleName, enabled) {
      calls.push(['patch', id, moduleName, enabled])
      writeFileSync(profile.patchPath, 'mutated-patch')
      if (failPatch) throw new Error('patch-write-failed')
    },
    checkManifest() {},
    checkHost() {},
    checkConfiguration() {},
  }
  return { runtime, calls }
}

test('panel plan expands its dependency closure; preview never edits the profile', (t) => {
  const data = fixture(t)
  const before = profileSnapshot(data.profile)
  const plan = createInstallPlan(data.state, data.release(), ['panel'])
  assert.deepEqual(plan.entries.map((item) => item.key), ['preset', 'shield', 'admission', 'panel'])
  assert.deepEqual(plan.blockers, [])
  assert.ok(plan.warnings.includes('guide-skill-not-ready'))
  assert.deepEqual(profileSnapshot(data.profile), before)
  assert.equal(installView(data.profile).pending, null)
  assert.throws(() => createInstallPlan(data.state, data.release(), ['arbitrary-package']), /unknown-component/)
  assert.throws(() => createInstallPlan(data.state, data.release(), []), /select-one/)
})

test('existing link packages are retained and mismatched versions require a separate upgrade', (t) => {
  const data = fixture(t)
  const manifest = readJson(join(data.profile, 'package.json'))
  manifest.dependencies['@local/dsh-guide-shield'] = 'link:shield'
  manifest.dsh.profile.bundles.push('@local/dsh-guide-shield')
  writeJson(join(data.profile, 'package.json'), manifest)
  Object.assign(data.state.components.find((item) => item.key === 'shield'), { installed: true, version: '1.1.0', enabled: true, contract: 1 })
  const plan = createInstallPlan(data.state, data.release(), ['panel'])
  assert.equal(plan.entries.find((item) => item.key === 'shield').action, 'retain')
  assert.deepEqual(plan.blockers, [])
  data.state.components.find((item) => item.key === 'shield').version = '1.0.0'
  assert.ok(createInstallPlan(data.state, data.release(), ['panel']).blockers.includes('requires-version-upgrade:shield'))
})

test('unpublished or tampered sources and unvalidated releases cannot be installed', (t) => {
  const data = fixture(t)
  assert.throws(() => readCatalog(null), /release-catalog-unavailable/)
  writeFileSync(join(data.root, 'panel.tgz'), 'changed')
  assert.throws(data.release, /integrity-mismatch:panel/)
  const catalog = readJson(data.catalogPath)
  catalog.components.find((item) => item.key === 'panel').sha256 = digest('changed')
  catalog.components.find((item) => item.key === 'panel').version = '1.2.0'
  writeJson(data.catalogPath, catalog)
  assert.ok(createInstallPlan(data.state, data.release(), ['panel']).blockers.includes('release-not-validated:panel'))
})

test('staging binds confirmation to current profile files; a second pending plan is refused', (t) => {
  const data = fixture(t)
  const plan = createInstallPlan(data.state, data.release(), ['panel'])
  writeFileSync(join(data.profile, 'cordis.patch.yml'), '[]\n')
  assert.throws(() => stageInstall(data.state, data.release(), ['panel'], plan.id), /stale-install-plan/)
  const prepared = prepare(data)
  assert.equal(readJson(prepared.path).status, 'pending-restart')
  assert.throws(() => stageInstall(data.state, data.release(), ['panel'], prepared.plan.id), /already-pending/)
})

test('cold executor performs one package run, then activation, pairing goal with the original driver', async (t) => {
  const data = fixture(t)
  const { path } = prepare(data, ['panel', 'goal'])
  const { runtime, calls } = fakeRuntime(data)
  const result = await applyInstall(path, runtime)
  assert.equal(result.status, 'installed-awaiting-restart')
  assert.equal(existsSync(path), false)
  assert.equal(calls.filter((item) => item[0] === 'run').length, 1)
  assert.equal(calls[0][0], 'lock')
  assert.ok(calls.find((item) => item[0] === 'run').includes('--ignore-scripts'))
  assert.ok(calls.find((item) => item[0] === 'run').includes('--config.auto-install-peers=false'))
  assert.deepEqual(calls.filter((item) => item[0] === 'patch').slice(-2).map((item) => [item[1], item[3]]), [['guide-goal-adapter', true], ['goal-round-driver', false]])
  assert.equal(readJson(join(data.profile, 'package.json')).dsh.profile.bundles.length, 6)
  assert.equal(installView(data.profile).result.status, 'installed-awaiting-restart')
})

test('partial package failure leaves no activated components and restores original files for retry', async (t) => {
  const data = fixture(t)
  const before = profileSnapshot(data.profile)
  const { path } = prepare(data)
  const { runtime, calls } = fakeRuntime(data, { failInstall: true })
  const result = await applyInstall(path, runtime)
  assert.equal(result.status, 'failed-restored')
  assert.deepEqual(profileSnapshot(data.profile), before)
  assert.equal(existsSync(path), true)
  assert.ok(calls.some((item) => item[0] === 'run' && item[1] === 'install'))
  assert.ok(!calls.some((item) => item[0] === 'patch' || item[0] === 'select'))
  const retry = fakeRuntime(data)
  assert.equal((await applyInstall(path, retry.runtime)).status, 'installed-awaiting-restart')
})

test('activation failure restores configuration and old dependency graph', async (t) => {
  const data = fixture(t)
  const before = profileSnapshot(data.profile)
  const { path } = prepare(data)
  const result = await applyInstall(path, fakeRuntime(data, { failPatch: true }).runtime)
  assert.equal(result.status, 'failed-restored')
  assert.deepEqual(profileSnapshot(data.profile), before)
  assert.match(result.error, /patch-write-failed/)
})

test('unrelated changes trigger recovery; failed recovery is explicit and cannot be retried blindly', async (t) => {
  const data = fixture(t)
  const { path } = prepare(data)
  const result = await applyInstall(path, fakeRuntime(data, { changeUnrelated: true, failRepair: true }).runtime)
  assert.equal(result.status, 'recovery-required')
  assert.match(result.error, /unrelated-profile-change/)
  assert.match(result.recoveryError, /dependency-repair-failed/)
  await assert.rejects(applyInstall(path, fakeRuntime(data).runtime), /install-recovery-required/)
})

test('executor refuses profile drift and changed release bytes before acquiring the package lock', async (t) => {
  const data = fixture(t)
  const { path } = prepare(data)
  const mock = fakeRuntime(data)
  writeFileSync(join(data.profile, 'pnpm-lock.yaml'), 'external-change')
  await assert.rejects(applyInstall(path, mock.runtime), /stale-install-profile/)
  assert.deepEqual(mock.calls, [])
  unlinkSync(join(data.profile, 'pnpm-lock.yaml'))
  writeFileSync(join(data.root, 'panel.tgz'), 'changed')
  await assert.rejects(applyInstall(path, mock.runtime), /integrity-mismatch/)
  assert.deepEqual(mock.calls, [])
})

function managerContext(data, { reject = false } = {}) {
  const store = new Map()
  let route
  store.set('profileContext', { dir: data.profile, name: 'isolated', home: data.root, installAnchor: join(data.root, 'install.json') })
  store.set('clientModules', { release: { version: '0.2.1-rc.3', commit: 'be72761' } })
  store.set('pluginPackages', { packageOf(name) { return name === '@deepseek-ai/cordis' ? { version: '4.0.5' } : undefined } })
  store.set('pluginManager', { listPlugins: async () => [], listBundles: () => [] })
  store.set('webServer', { register(options) { route = options; return () => {} } })
  store.set('connection', { requestRejection: () => reject ? 403 : undefined })
  const ctx = { get: (name) => store.get(name), provide: (name, value) => store.set(name, value), effect: (fn) => fn(), inject: (_names, callback) => callback(ctx) }
  return { ctx, store, route: () => route }
}

async function callRoute(route, action, payload) {
  const req = new EventEmitter()
  Object.assign(req, { url: `/guide-manager/api/install/${action}`, method: 'POST' })
  return new Promise((resolve) => {
    const res = { statusCode: 200, setHeader() {}, end(text) { resolve({ status: this.statusCode, body: JSON.parse(text) }) } }
    route.handler(req, res)
    queueMicrotask(() => { req.emit('data', Buffer.from(JSON.stringify(payload))); req.emit('end') })
  })
}

test('manager-only Host opens with six missing components, previews core installation and stages without importing them', async (t) => {
  const data = fixture(t)
  const context = managerContext(data)
  await apply(context.ctx, { catalogPath: data.catalogPath, checkArtifacts: false })
  const service = context.store.get('guideManager')
  const state = await service.getState()
  assert.ok(state.components.every((item) => item.status === 'missing'))
  assert.equal(state.installation.catalog.available, true)
  assert.equal(state.installation.phase, 'phase-5a')
  const preview = await callRoute(context.route(), 'plan', { components: ['panel'] })
  assert.equal(preview.status, 200)
  assert.deepEqual(preview.body.value.blockers, [])
  const refused = await callRoute(context.route(), 'stage', { components: ['panel'], planId: preview.body.value.id })
  assert.equal(refused.status, 409)
  const staged = await callRoute(context.route(), 'stage', { components: ['panel'], planId: preview.body.value.id, confirm: true })
  assert.equal(staged.status, 200)
  assert.equal(staged.body.value.application, 'pending-restart')
  assert.equal((await service.setComponentEnabled('panel', true)).code, 'install-pending')
  const refreshed = await service.getState()
  assert.equal(refreshed.installation.pending.id, preview.body.value.id)
  assert.match(refreshed.installation.helperCommand, /-Profile/)
  assert.equal((await callRoute(context.route(), 'cancel', { planId: preview.body.value.id, confirm: true })).status, 200)
  assert.equal(installView(data.profile).pending, null)
})

test('installation API retains the existing connection fence', async (t) => {
  const data = fixture(t)
  const context = managerContext(data, { reject: true })
  await apply(context.ctx, { catalogPath: data.catalogPath, checkArtifacts: false })
  const result = await callRoute(context.route(), 'plan', { components: ['panel'] })
  assert.equal(result.status, 403)
  assert.equal(installView(data.profile).pending, null)
})

test('malformed persisted installation data degrades explicitly without breaking manager state', async (t) => {
  const data = fixture(t)
  writeJson(join(data.profile, '.guide-manager', 'install-result.json'), { schema: 1, status: 'installed-awaiting-restart', entries: 'damaged' })
  const context = managerContext(data)
  await apply(context.ctx, { catalogPath: data.catalogPath, checkArtifacts: false })
  const state = await context.store.get('guideManager').getState()
  assert.equal(state.installation.result.status, 'invalid')
  assert.equal(state.components.length, 6)
  const plan = createInstallPlan(data.state, data.release(), ['panel'])
  assert.throws(() => stageInstall(data.state, data.release(), ['panel'], plan.id), /install-recovery-required/)
})

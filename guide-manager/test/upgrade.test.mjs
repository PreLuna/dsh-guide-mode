import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { COMPONENTS } from '../core.js'
import { apply } from '../index.js'
import { cacheArtifact, cachePath, digest, INSTALL_ORDER, profileSnapshot, readJson, writeJson } from '../install.js'
import { createRestorePlan, createUpgradePlan, packageView, readUpgradeCatalog, stagePackagePlan } from '../upgrade.js'
import { applyPackage } from '../helper/apply-package.mjs'

const expectedHost = readJson(new URL('../package.json', import.meta.url)).dshGuide.host

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'guide-upgrade-'))
  assert.equal(resolve(root), root)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const profile = join(root, 'home', 'profiles', 'upgrade')
  mkdirSync(profile, { recursive: true })
  const artifacts = []
  const add = (key, version, requires = {}) => {
    const definition = COMPONENTS.find((item) => item.key === key)
    const file = join(root, `${key}-${version}.tgz`)
    const manifest = { name: definition.package, version, dshGuide: { contract: 1, dataSchema: 1 }, dsh: { bundle: { patch: './cordis.patch.yml' } },
      peerDependencies: Object.fromEntries(Object.entries(requires).map(([peer, versions]) => [COMPONENTS.find((item) => item.key === peer).package, versions[0]])) }
    writeJson(file, manifest)
    const artifact = { key, package: definition.package, version, contract: 1, dataSchema: 1, file, sha256: digest(readFileSync(file)), requires }
    artifacts.push(artifact)
    return artifact
  }
  const base = Object.fromEntries(INSTALL_ORDER.map((key) => [key, '1.1.0']))
  for (const key of INSTALL_ORDER) add(key, '1.1.0', key === 'panel' ? { shield: ['1.1.0'], admission: ['1.1.0'] } : key === 'admission' ? { shield: ['1.1.0'] } : {})
  add('panel', '1.1.1', { shield: ['1.1.0'], admission: ['1.1.0'] })
  add('shield', '1.1.1')
  add('admission', '1.1.1', { shield: ['1.1.1'] })
  add('panel', '1.2.0', { shield: ['1.1.1'], admission: ['1.1.1'] })
  const catalogPath = join(root, 'upgrade-catalog.json')
  writeJson(catalogPath, { schema: 2, product: 'dsh-guide-mode', artifacts, combinations: [
    { id: 'baseline', host: expectedHost, versions: base },
    { id: 'panel-only', host: expectedHost, versions: { ...base, panel: '1.1.1' } },
    { id: 'coupled', host: expectedHost, versions: { ...base, panel: '1.2.0', shield: '1.1.1', admission: '1.1.1' } },
  ] })
  const dependencies = {}
  for (const artifact of artifacts.filter((item) => item.version === '1.1.0')) {
    const cached = cacheArtifact(profile, artifact)
    dependencies[artifact.package] = `file:${cached}`
    writeJson(join(profile, 'node_modules', ...artifact.package.split('/'), 'package.json'), readJson(cached))
  }
  writeJson(join(profile, 'package.json'), { name: 'isolated-upgrade', private: true, dependencies, dsh: { profile: { bundles: Object.keys(dependencies) } } })
  writeFileSync(join(profile, 'pnpm-lock.yaml'), 'original dependency graph\n')
  writeFileSync(join(profile, 'cordis.patch.yml'), '# user configuration preserved\n[]\n')
  writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'autoInstallPeers: false\n')
  const state = { profile: { dir: profile, name: 'upgrade', installAnchor: join(root, 'install.json') }, pending: { present: false },
    host: { dsh: { match: true }, cordis: { match: true }, artifacts: { verified: true } },
    components: COMPONENTS.map((item) => ({ ...item, installed: true, enabled: true, version: '1.1.0', contract: 1 })) }
  return { root, profile, catalogPath, artifacts, state, release: () => readUpgradeCatalog(catalogPath) }
}

function upgrade(data, targets = [{ key: 'panel', version: '1.1.1' }]) {
  return createUpgradePlan(data.state, data.release(), targets, expectedHost)
}
function stage(plan) {
  stagePackagePlan(plan, plan.id)
  return join(plan.profile.dir, '.guide-manager', 'package-pending.json')
}
function runtimeFor(data, { failAdd = false, failInstall = false, failFirstInstall = false, failCheck = false } = {}) {
  const calls = []
  let installs = 0
  let checks = 0
  const runtime = {
    async withLock(path, callback) { calls.push(['lock', path]); return callback() },
    async run(context, args) {
      calls.push(['run', ...args])
      const manifestPath = join(context.dir, 'package.json')
      const manifest = readJson(manifestPath)
      if (args[0] === 'add') {
        for (const file of args.filter((arg) => arg.endsWith('.tgz'))) {
          const pkg = readJson(file)
          manifest.dependencies[pkg.name] = `file:${file}`
        }
        writeJson(manifestPath, manifest)
        writeFileSync(join(context.dir, 'pnpm-lock.yaml'), `updated graph ${JSON.stringify(manifest.dependencies)}`)
      } else installs++
      for (const [name, spec] of Object.entries(manifest.dependencies)) {
        const file = resolve(context.dir, spec.slice(5))
        writeJson(join(context.dir, 'node_modules', ...name.split('/'), 'package.json'), readJson(file))
      }
      return { exitCode: (args[0] === 'add' && failAdd) || (args[0] === 'install' && (failInstall || (failFirstInstall && installs === 1))) ? 1 : 0 }
    },
    checkManifest() {},
    checkPeerGraph(plan) {
      const manifests = plan.entries.map((entry) => readJson(join(data.profile, 'node_modules', ...entry.package.split('/'), 'package.json')))
      for (const manifest of manifests) for (const [name, version] of Object.entries(manifest.peerDependencies)) assert.equal(manifests.find((item) => item.name === name).version, version)
    },
    checkHost() {},
    checkConfiguration() { if (failCheck && checks++ === 0) throw new Error('injected-post-upgrade-check-failure') },
  }
  return { runtime, calls }
}
const version = (data, key = 'panel') => readJson(join(data.profile, 'node_modules', ...COMPONENTS.find((item) => item.key === key).package.split('/'), 'package.json')).version

test('single component upgrade chooses the smallest compatible change set', (t) => {
  const data = fixture(t)
  const plan = upgrade(data)
  assert.equal(plan.combination, 'panel-only')
  assert.deepEqual(plan.entries.filter((item) => item.action === 'upgrade').map((item) => item.key), ['panel'])
  assert.deepEqual(plan.blockers, [])
  assert.equal(existsSync(join(data.profile, '.guide-manager', 'package-pending.json')), false)
})

test('shield upgrade includes required panel/admission releases and conflicting targets are refused', (t) => {
  const data = fixture(t)
  const plan = upgrade(data, [{ key: 'shield', version: '1.1.1' }])
  assert.deepEqual(plan.entries.filter((item) => item.action === 'upgrade').map((item) => item.key), ['shield', 'admission', 'panel'])
  assert.throws(() => upgrade(data, [{ key: 'shield', version: '1.1.1' }, { key: 'panel', version: '1.1.1' }]), /no-compatible/)
  assert.throws(() => upgrade(data, [{ key: 'manager', version: '1.1.1' }]), /invalid-upgrade-targets/)
})

test('development links and unpinned historical installations are never replaced implicitly', (t) => {
  const data = fixture(t)
  const path = join(data.profile, 'package.json')
  const manifest = readJson(path)
  manifest.dependencies['@local/dsh-guide-panel'] = 'link:development'
  writeJson(path, manifest)
  const plan = upgrade(data)
  assert.ok(plan.blockers.includes('source-not-pinned:panel'))
  assert.throws(() => stage(plan), /package-operation-blocked/)
})

test('catalog integrity and incompatible peer declarations fail before any mutation', (t) => {
  const data = fixture(t)
  const catalog = readJson(data.catalogPath)
  catalog.combinations[1].versions.shield = '1.1.1'
  writeJson(data.catalogPath, catalog)
  assert.throws(data.release, /incompatible-version-combination/)
  writeFileSync(data.artifacts[0].file, 'corrupt')
  assert.throws(data.release, /upgrade-artifact-integrity/)
})

test('cold upgrade changes only the requested package, retaining configuration and a recoverable old graph', async (t) => {
  const data = fixture(t)
  const before = profileSnapshot(data.profile)
  const mock = runtimeFor(data)
  const result = await applyPackage(stage(upgrade(data)), mock.runtime)
  assert.equal(result.status, 'upgraded-awaiting-restart')
  assert.equal(version(data), '1.1.1')
  assert.equal(version(data, 'shield'), '1.1.0')
  assert.equal(profileSnapshot(data.profile)['cordis.patch.yml'], before['cordis.patch.yml'])
  assert.equal(packageView(data.profile).transactions.length, 1)
  assert.equal(mock.calls[0][0], 'lock')
  assert.equal(mock.calls.filter((item) => item[0] === 'run' && item[1] === 'add')[0].filter((arg) => arg.endsWith('.tgz')).length, 1)
})

test('explicit recovery succeeds after the release directory and old cache copy are removed', async (t) => {
  const data = fixture(t)
  const before = profileSnapshot(data.profile)
  const mock = runtimeFor(data)
  const result = await applyPackage(stage(upgrade(data)), mock.runtime)
  for (const artifact of data.artifacts) unlinkSync(artifact.file)
  const oldPanel = data.artifacts.find((item) => item.key === 'panel' && item.version === '1.1.0')
  unlinkSync(cachePath(data.profile, oldPanel.sha256))
  const plan = createRestorePlan(data.state, result.transactionId)
  assert.deepEqual(plan.blockers, [])
  const restored = await applyPackage(stage(plan), mock.runtime)
  assert.equal(restored.status, 'restored-awaiting-restart')
  assert.equal(version(data), '1.1.0')
  assert.deepEqual(profileSnapshot(data.profile), before)
  assert.equal(packageView(data.profile).transactions.length, 0)
})

test('upgrade failure repairs the exact prior lockfile, packages and user configuration', async (t) => {
  const data = fixture(t)
  const before = profileSnapshot(data.profile)
  const result = await applyPackage(stage(upgrade(data)), runtimeFor(data, { failCheck: true }).runtime)
  assert.equal(result.status, 'failed-restored')
  assert.equal(version(data), '1.1.0')
  assert.deepEqual(profileSnapshot(data.profile), before)
  assert.match(result.error, /injected-post-upgrade/)
})

test('failed explicit recovery repairs the newer version rather than leaving half an old graph', async (t) => {
  const data = fixture(t)
  const upgraded = await applyPackage(stage(upgrade(data)), runtimeFor(data).runtime)
  const beforeRestore = profileSnapshot(data.profile)
  const plan = createRestorePlan(data.state, upgraded.transactionId)
  const result = await applyPackage(stage(plan), runtimeFor(data, { failFirstInstall: true }).runtime)
  assert.equal(result.status, 'failed-restored')
  assert.equal(version(data), '1.1.1')
  assert.deepEqual(profileSnapshot(data.profile), beforeRestore)
  assert.equal(packageView(data.profile).transactions.length, 1)
})

test('repair failures are explicit and further package operations are blocked', async (t) => {
  const data = fixture(t)
  const path = stage(upgrade(data))
  const result = await applyPackage(path, runtimeFor(data, { failAdd: true, failInstall: true }).runtime)
  assert.equal(result.status, 'recovery-required')
  assert.match(result.recoveryError, /package-repair-failed/)
  await assert.rejects(applyPackage(path, runtimeFor(data).runtime), /package-recovery-required/)
})

test('stale package plans, tampered transaction backups and later user edits cannot be overwritten', async (t) => {
  const data = fixture(t)
  const path = stage(upgrade(data))
  const originalPatch = readFileSync(join(data.profile, 'cordis.patch.yml'))
  writeFileSync(join(data.profile, 'cordis.patch.yml'), '# changed\n[]\n')
  const mock = runtimeFor(data)
  await assert.rejects(applyPackage(path, mock.runtime), /stale-package-profile/)
  assert.deepEqual(mock.calls, [])
  writeFileSync(join(data.profile, 'cordis.patch.yml'), originalPatch)
  const result = await applyPackage(path, mock.runtime)
  writeFileSync(join(data.profile, 'cordis.patch.yml'), '# later user edit\n[]\n')
  const restore = createRestorePlan(data.state, result.transactionId)
  assert.ok(restore.blockers.includes('profile-changed-since-upgrade'))
  assert.throws(() => stage(restore), /package-operation-blocked/)
  assert.throws(() => createRestorePlan(data.state, '../escape'), /invalid-transaction-id/)
  writeFileSync(join(data.profile, '.guide-manager', 'package-transactions', result.transactionId, 'files', 'pnpm-lock.yaml'), 'tampered backup')
  assert.throws(() => createRestorePlan(data.state, result.transactionId), /transaction-backup-integrity/)
})

test('manager service exposes confirmed upgrade preparation and prevents crossing component switches', async (t) => {
  const data = fixture(t)
  const store = new Map([
    ['profileContext', { ...data.state.profile, home: join(data.root, 'home') }],
    ['clientModules', { release: { version: '0.2.1-rc.3', commit: 'be72761' } }],
    ['pluginPackages', { packageOf: (name) => name === '@deepseek-ai/cordis' ? { version: '4.0.5' } : undefined }],
    ['pluginManager', { listPlugins: async () => COMPONENTS.map((item) => ({ moduleName: item.package, enabled: true, entryId: item.key, fiberPhase: 'active' })),
      listBundles: () => COMPONENTS.map((item) => ({ name: item.package, installed: true, enabled: true, version: '1.1.0' })) }],
  ])
  const ctx = { get: (name) => store.get(name), provide: (name, value) => store.set(name, value), inject() {} }
  await apply(ctx, { checkArtifacts: false, upgradeCatalogPath: data.catalogPath })
  const service = store.get('guideManager')
  const plan = await service.planUpgrade({ targets: [{ key: 'panel', version: '1.1.1' }] })
  await assert.rejects(service.preparePackageChange({ kind: plan.kind, targets: plan.targets, planId: plan.id }), /confirmation-required/)
  assert.equal((await service.preparePackageChange({ kind: plan.kind, targets: plan.targets, planId: plan.id, confirm: true })).application, 'pending-restart')
  assert.equal((await service.setComponentEnabled('panel', false)).code, 'package-operation-pending')
  assert.equal((await service.getState()).packageManagement.pending.id, plan.id)
  assert.equal(service.cancelPackageChange({ planId: plan.id, confirm: true }).application, 'pending-cleared')
})

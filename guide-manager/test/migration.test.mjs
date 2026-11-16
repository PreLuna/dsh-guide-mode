import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { artifactInventory } from '../artifacts.js'
import { COMPONENTS } from '../core.js'
import { applyMigration, recoverMigrationTransaction } from '../helper/apply-migration.mjs'
import { createExecutionController } from '../execution.js'
import { apply } from '../index.js'
import { cachePath, digest, INSTALL_ORDER, profileSnapshot, readJson, writeJson } from '../install.js'
import { createMigrationPlan, MIGRATION_KEYS, migrationInventory, migrationView, stageMigration } from '../migration.js'

const expectedHost = readJson(new URL('../package.json', import.meta.url)).dshGuide.host
const managerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const managerPackage = '@local/dsh-guide-manager'
const definition = (key) => key === 'manager' ? { key, package: managerPackage } : COMPONENTS.find((item) => item.key === key)

function call(route, action, payload) {
  const req = Object.assign(new EventEmitter(), { url: `/guide-manager/api/${action}`, method: 'POST', destroy() {} })
  return new Promise((resolveResult) => {
    const res = { statusCode: 200, setHeader() {}, end(text) { resolveResult({ status: this.statusCode, body: JSON.parse(text) }) } }
    route.handler(req, res)
    queueMicrotask(() => { req.emit('data', Buffer.from(JSON.stringify(payload))); req.emit('end') })
  })
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'guide-migration-'))
  assert.equal(resolve(root), root)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const profile = join(root, 'home', 'profiles', 'migration')
  mkdirSync(profile, { recursive: true })
  const sources = {}
  const makeTgz = (key, version, rootDir) => {
    const stage = join(rootDir, 'package')
    mkdirSync(join(stage, 'helper'), { recursive: true })
    const packageName = definition(key).package
    const manifest = key === 'manager'
      ? { name: packageName, version, exports: { '.': './index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } }, dshGuide: { product: 'dsh-guide-mode', controlSchema: 1, dataSchema: 1, contract: 1, host: expectedHost } }
      : { name: packageName, version, exports: { '.': './index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } }, dshGuide: { contract: 1, dataSchema: 1 } }
    writeJson(join(stage, 'package.json'), manifest)
    writeFileSync(join(stage, 'cordis.patch.yml'), `- id: ${key}\n`)
    writeFileSync(join(stage, 'index.js'), `export const key = '${key}'\n`)
    if (key === 'manager') {
      writeFileSync(join(stage, 'helper', 'apply-maintenance.mjs'), 'export {}\n')
      writeFileSync(join(stage, 'helper', 'recover-manager.ps1'), '# recover\n')
      writeFileSync(join(stage, 'helper', 'apply-migration.mjs'), 'export {}\n')
      writeFileSync(join(stage, 'helper', 'recover-migration.mjs'), 'export {}\n')
      writeFileSync(join(stage, 'migration.js'), 'export {}\n')
    }
    const file = join(root, `${key}-${version}.tgz`)
    execFileSync('tar', ['-czf', file, '-C', rootDir, 'package'])
    return { key, package: packageName, version, contract: 1, dataSchema: 1, file, sha256: digest(readFileSync(file)), bytes: readFileSync(file).length,
      files: artifactInventory(file, digest(readFileSync(file))).files }
  }
  for (const key of MIGRATION_KEYS) {
    const source = join(root, 'sources', key)
    mkdirSync(source, { recursive: true })
    const manifest = key === 'manager'
      ? { name: definition(key).package, version: '1.2.0', exports: { '.': './index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } }, dshGuide: { product: 'dsh-guide-mode', controlSchema: 1, dataSchema: 1, contract: 1, host: expectedHost } }
      : { name: definition(key).package, version: '1.1.0', exports: { '.': './index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } }, dshGuide: { contract: 1, dataSchema: 1 } }
    writeJson(join(source, 'package.json'), manifest)
    writeFileSync(join(source, 'cordis.patch.yml'), `- id: ${key}\n`)
    writeFileSync(join(source, 'index.js'), `export const key = '${key}'\n`)
    sources[key] = source
  }
  const components = INSTALL_ORDER.map((key) => makeTgz(key, '1.1.1', join(root, 'stage', key)))
  const manager = makeTgz('manager', '1.2.1', join(root, 'stage', 'manager'))
  const catalogPath = join(root, 'install.json')
  writeJson(catalogPath, { schema: 1, product: 'dsh-guide-mode', components })
  const managerCatalogPath = join(root, 'manager.json')
  writeJson(managerCatalogPath, { schema: 3, product: 'dsh-guide-mode', artifacts: [manager] })
  const dependencies = {}
  for (const key of MIGRATION_KEYS) dependencies[definition(key).package] = `link:${sources[key].replaceAll('\\', '/')}`
  writeJson(join(profile, 'package.json'), { private: true, dependencies, dsh: { profile: { bundles: Object.keys(dependencies) } } })
  writeFileSync(join(profile, 'cordis.patch.yml'), '- insert: []\n')
  writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'autoInstallPeers: false\n')
  writeFileSync(join(profile, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\nimporters:\n  .:\n    dependencies:\n' + Object.keys(dependencies).map((name) => `      ${JSON.stringify(name)}:\n        specifier: ${JSON.stringify(dependencies[name])}\n        version: ${JSON.stringify(dependencies[name])}\n`).join(''))
  const manifest = readJson(join(profile, 'package.json'))
  for (const [name, spec] of Object.entries(manifest.dependencies)) {
    const source = spec.slice(5)
    writeJson(join(profile, 'node_modules', ...name.split('/'), 'package.json'), readJson(join(source, 'package.json')))
  }
  const state = { profile: { dir: profile, name: 'migration', installAnchor: join(root, 'install.json') }, pending: { present: false }, hostStartedAt: Date.now() - 60_000,
    host: { dsh: { match: true }, cordis: { match: true }, artifacts: { verified: true } },
    components: COMPONENTS.map((item) => ({ ...item, installed: true, enabled: true, version: '1.1.0', contract: 1 })) }
  return { root, profile, sources, catalogPath, managerCatalogPath, components, manager, state }
}

function plan(data) {
  return createMigrationPlan(data.state, { catalogPath: data.catalogPath, managerCatalogPath: data.managerCatalogPath }, expectedHost)
}

function fakeRuntime(data, { failAdd = false, failInstall = false, removeSourceOnFail = null } = {}) {
  const calls = []
  const materialize = () => {
    try {
      const manifest = readJson(join(data.profile, 'package.json'))
      for (const [name, spec] of Object.entries(manifest.dependencies)) {
        const source = spec.startsWith('link:') ? spec.slice(5) : null
        if (source !== null) writeJson(join(data.profile, 'node_modules', ...name.split('/'), 'package.json'), readJson(join(source, 'package.json')))
      }
      return true
    } catch { return false }
  }
  return {
    calls,
    async withLock(path, callback) { calls.push(['lock', path]); return callback() },
    removeImporterEntries(profile, names) { calls.push(['removeImporterEntries', ...names]) },
    async run(context, args) {
      calls.push(['run', ...args])
      if (args[0] === 'add') {
        const manifest = readJson(join(context.dir, 'package.json'))
        for (const file of args.filter((arg) => arg.endsWith('.tgz'))) {
          const { manifest: target } = artifactInventory(file, digest(readFileSync(file)))
          manifest.dependencies[target.name] = `file:${file}`
        }
        writeJson(join(context.dir, 'package.json'), manifest)
        if (failAdd && removeSourceOnFail !== null) rmSync(data.sources[removeSourceOnFail], { recursive: true, force: true })
        for (const [name, spec] of Object.entries(manifest.dependencies)) {
          if (!spec.startsWith('file:')) continue
          const { manifest: target } = artifactInventory(spec.slice(5), digest(readFileSync(spec.slice(5))))
          writeJson(join(context.dir, 'node_modules', ...name.split('/'), 'package.json'), target)
        }
        return { exitCode: failAdd ? 1 : 0, logPath: null }
      }
      if (args[0] === 'install') {
        if (failInstall) return { exitCode: 1 }
        return { exitCode: materialize() ? 0 : 1 }
      }
      return { exitCode: 0 }
    },
    checkManifest() {},
    checkPeerGraph() {},
    checkHost() {},
    checkConfiguration() {},
  }
}

test('5E-0 inventories seven links and previews source/target content differences without touching the profile', (t) => {
  const data = fixture(t)
  const before = profileSnapshot(data.profile)
  const inventory = migrationInventory(data.profile, { state: data.state, hostStartedAt: data.state.hostStartedAt })
  assert.equal(inventory.length, MIGRATION_KEYS.length)
  assert.equal(inventory.every((item) => item.migratable), true)
  const planned = plan(data)
  assert.deepEqual(planned.blockers, [])
  assert.equal(planned.entries.length, MIGRATION_KEYS.length)
  assert.equal(planned.entries.every((entry) => entry.diff.available && entry.diff.changed.includes('package.json')), true)
  assert.deepEqual(profileSnapshot(data.profile), before)
})

test('5E-0 rejects source drift and 5E-1 stages only after an exact confirmation', (t) => {
  const data = fixture(t)
  const planned = plan(data)
  writeFileSync(join(data.sources.panel, 'index.js'), 'changed after preview\n')
  assert.throws(() => stageMigration(planned, planned.id), /migration-source-changed:panel/)
  writeFileSync(join(data.sources.panel, 'index.js'), "export const key = 'panel'\n")
  stageMigration(planned, planned.id)
  const pending = join(data.profile, '.guide-manager', 'migration-pending.json')
  assert.equal(existsSync(pending), true)
  assert.equal(readJson(pending).id, planned.id)
  assert.equal(migrationView(data.profile).pending.id, planned.id)
})

test('5E-1 migrates links to the pinned cache and records a recoverable transaction', async (t) => {
  const data = fixture(t)
  const planned = plan(data)
  stageMigration(planned, planned.id)
  const runtime = fakeRuntime(data)
  const receipt = await applyMigration(join(data.profile, '.guide-manager', 'migration-pending.json'), runtime)
  assert.equal(receipt.status, 'migrated-awaiting-restart')
  assert.equal(receipt.entries.length, MIGRATION_KEYS.length)
  assert.equal(existsSync(join(data.profile, '.guide-manager', 'migration-pending.json')), false)
  const manifest = readJson(join(data.profile, 'package.json'))
  for (const entry of planned.entries) {
    assert.equal(manifest.dependencies[entry.package], `file:${cachePath(data.profile, entry.target.sha256)}`)
    assert.equal(readJson(join(data.profile, 'node_modules', ...entry.package.split('/'), 'package.json')).version, entry.target.version)
  }
  assert.equal(runtime.calls.some((call) => call[0] === 'removeImporterEntries'), true)
  const transaction = readJson(join(data.profile, '.guide-manager', 'migration-transactions', receipt.transactionId, 'transaction.json'))
  assert.equal(transaction.status, 'migrated-awaiting-restart')
  assert.equal(transaction.entries.length, MIGRATION_KEYS.length)
  assert.equal(existsSync(join(data.profile, '.guide-manager', 'migration-transactions', receipt.transactionId, 'sources', 'panel', 'package.json')), true)
  assert.equal(receipt.after['cordis.patch.yml'], planned.before['cordis.patch.yml'])
})

test('5E-1 restores the original link graph when the package operation fails', async (t) => {
  const data = fixture(t)
  const planned = plan(data)
  stageMigration(planned, planned.id)
  const runtime = fakeRuntime(data, { failAdd: true })
  const receipt = await applyMigration(join(data.profile, '.guide-manager', 'migration-pending.json'), runtime)
  assert.equal(receipt.status, 'failed-restored')
  assert.equal(readJson(join(data.profile, 'package.json')).dependencies[planned.entries[0].package], planned.entries[0].source.spec)
  assert.equal(readJson(join(data.profile, 'node_modules', ...planned.entries[0].package.split('/'), 'package.json')).version, planned.entries[0].source.version)
})

test('5E-2 execution preview recognizes a migration pending plan', (t) => {
  const data = fixture(t)
  const planned = plan(data)
  stageMigration(planned, planned.id)
  const controller = createExecutionController({
    profile: { dir: data.profile, name: 'migration', installAnchor: join(data.root, 'install.json') },
    managerRoot,
    host: { pid: process.pid, executable: 'C:\\Program Files\\DeepSeek Harness\\DeepSeek Harness.exe', startedAt: new Date(Date.now() - 60_000).toISOString() },
    platform: 'win32',
    launch: async () => ({ pid: 424242, createdAt: new Date().toISOString() }),
  })
  const preview = controller.plan({}, undefined)
  assert.equal(preview.kind, 'migration')
  assert.deepEqual(preview.blockers, [])
  assert.equal(preview.entries.length, MIGRATION_KEYS.length)
  assert.equal(preview.entries.every((entry) => entry.version === planned.entries.find((item) => item.key === entry.key).target.version), true)
})

test('5E-1 recovery restores a transaction when ordinary auto-repair could not', async (t) => {
  const data = fixture(t)
  const planned = plan(data)
  stageMigration(planned, planned.id)
  const failed = await applyMigration(join(data.profile, '.guide-manager', 'migration-pending.json'), fakeRuntime(data, { failAdd: true, failInstall: true }))
  assert.equal(failed.status, 'recovery-required')
  assert.equal(typeof failed.recoveryCommand, 'string')
  const recovered = await recoverMigrationTransaction(data.profile, failed.transactionId, fakeRuntime(data))
  assert.equal(recovered.mode, 'original-link')
  assert.equal(readJson(join(data.profile, 'package.json')).dependencies[planned.entries[0].package], planned.entries[0].source.spec)
})

test('5E-1 recovery rebuilds a missing source from the transaction snapshot', async (t) => {
  const data = fixture(t)
  const planned = plan(data)
  stageMigration(planned, planned.id)
  const failed = await applyMigration(join(data.profile, '.guide-manager', 'migration-pending.json'), fakeRuntime(data, { failAdd: true, failInstall: true, removeSourceOnFail: 'panel' }))
  assert.equal(failed.status, 'recovery-required')
  const recovered = await recoverMigrationTransaction(data.profile, failed.transactionId, fakeRuntime(data))
  assert.equal(recovered.mode, 'snapshot-links')
  assert.match(readJson(join(data.profile, 'package.json')).dependencies[planned.entries.find((entry) => entry.key === 'panel').package], /restored-sources[\\/]panel/)
})

test('5E-2 Host migration API returns the exact plan and stages a guarded pending document', async (t) => {
  const data = fixture(t)
  let route
  const store = new Map([
    ['profileContext', { dir: data.profile, name: 'migration', home: data.root, installAnchor: join(data.root, 'install.json') }],
    ['clientModules', { release: { version: '0.2.1-rc.3', commit: 'be72761ee1a6736ebcdf4f3739363b083ae53c98' } }],
    ['pluginPackages', { packageOf(name) { return name === '@deepseek-ai/cordis' ? { version: '4.0.5' } : undefined } }],
    ['pluginManager', { listPlugins: async () => [], listBundles: () => [] }],
    ['webServer', { register(options) { route = options; return () => {} } }],
    ['connection', { requestRejection: () => undefined }],
  ])
  const ctx = { get: (key) => store.get(key), provide: (key, value) => store.set(key, value), effect: (fn) => fn(), inject: (_names, cb) => cb(ctx) }
  await apply(ctx, { checkArtifacts: false })
  const planned = await call(route, 'migration/plan', { catalogPath: data.catalogPath, managerCatalogPath: data.managerCatalogPath })
  assert.equal(planned.status, 200)
  assert.equal(planned.body.ok, true)
  assert.equal(planned.body.value.entries.length, MIGRATION_KEYS.length)
  const staged = await call(route, 'migration/stage', { catalogPath: data.catalogPath, managerCatalogPath: data.managerCatalogPath, planId: planned.body.value.id, confirm: true })
  assert.equal(staged.status, 200)
  assert.equal(staged.body.value.application, 'pending-restart')
  assert.equal(existsSync(join(data.profile, '.guide-manager', 'migration-pending.json')), true)
})

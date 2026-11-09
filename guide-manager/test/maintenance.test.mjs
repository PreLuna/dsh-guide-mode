import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { COMPONENTS } from '../core.js'
import { artifactInventory } from '../artifacts.js'
import { cacheArtifact, digest, profileSnapshot, readJson, writeJson } from '../install.js'
import { cancelMaintenance, controlPath, createMaintenancePlan, createManagerRestorePlan, maintenanceView, readManagerCatalog, stageMaintenance } from '../maintenance.js'
import { applyMaintenance, validateMaintenance } from '../helper/apply-maintenance.mjs'

const managerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const managerManifest = { ...readJson(join(managerRoot, 'package.json')), version: '1.1.0' }
function archive(files) {
  const chunks = []
  for (const [file, content] of Object.entries(files)) {
    const bytes = Buffer.from(content)
    const header = Buffer.alloc(512)
    header.write(`package/${file}`)
    header.write('0000644\0', 100)
    header.write(`${bytes.length.toString(8).padStart(11, '0')}\0`, 124)
    header.fill(32, 148, 156)
    header.write('0', 156)
    header.write(`${[...header].reduce((a, b) => a + b).toString(8).padStart(6, '0')}\0 `, 148)
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'guide-maintenance-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const profile = join(root, 'home', 'profiles', 'test')
  mkdirSync(profile, { recursive: true })
  const contents = {}
  const dependencies = {}
  const add = (key, manifest, extra = {}) => {
    const files = { 'package.json': JSON.stringify(manifest), 'index.js': 'export const ok = true\n', 'cordis.patch.yml': '[]\n', ...extra }
    const file = join(root, `${key}-${manifest.version}.tgz`)
    writeFileSync(file, archive(files))
    const entry = { key, package: manifest.name, version: manifest.version, file, sha256: digest(readFileSync(file)) }
    contents[manifest.name] = files
    return entry
  }
  for (const component of COMPONENTS) {
    const entry = add(component.key, { name: component.package, version: '1.1.0', dshGuide: { contract: 1 } })
    const file = cacheArtifact(profile, entry)
    dependencies[entry.package] = `file:${file}`
  }
  const manager = add('manager', managerManifest)
  dependencies[manager.package] = `file:${cacheArtifact(profile, manager)}`
  const materialize = (name, files) => {
    for (const [file, bytes] of Object.entries(files)) {
      const target = join(profile, 'node_modules', ...name.split('/'), file)
      mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes)
    }
  }
  for (const [name, files] of Object.entries(contents)) materialize(name, files)
  writeJson(join(profile, 'package.json'), { private: true, dependencies, dsh: { profile: { bundles: Object.keys(dependencies) } } })
  writeFileSync(join(profile, 'pnpm-lock.yaml'), 'baseline\n')
  writeFileSync(join(profile, 'cordis.patch.yml'), '# preserve\n[]\n')
  writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'autoInstallPeers: false\n')
  const state = { profile: { dir: profile, name: 'test', installAnchor: join(root, 'install.json') }, host: { dsh: { match: true }, cordis: { match: true } },
    components: COMPONENTS.map((item) => ({ ...item, installed: true, enabled: true, version: '1.1.0' })) }
  const plan = (request) => createMaintenancePlan(state, request, managerRoot, join(root, 'manager-catalog.json'), managerManifest.dshGuide.host)
  const calls = []
  let fail = false
  const runtime = {
    withLock: async (_, callback) => callback(), saveManifest: async (_, manifest) => writeJson(join(profile, 'package.json'), manifest),
    async run(_, args) {
      calls.push(args)
      if (fail) { fail = false; return { exitCode: 1 } }
      const manifest = readJson(join(profile, 'package.json'))
      if (args[0] === 'remove') for (const entry of args.filter((item) => item.startsWith('@local/'))) { delete manifest.dependencies[entry]; rmSync(join(profile, 'node_modules', ...entry.split('/')), { recursive: true, force: true }) }
      if (args[0] === 'add') for (const file of args.filter((item) => item.endsWith('.tgz'))) {
        const data = artifactInventory(file, digest(readFileSync(file)))
        manifest.dependencies[data.manifest.name] = `file:${file}`
        const files = data.manifest.name === managerManifest.name && data.manifest.version !== '1.1.0' ? targetFiles : contents[data.manifest.name]
        materialize(data.manifest.name, files)
      }
      if (args[0] === 'install') for (const name of Object.keys(manifest.dependencies)) materialize(name, contents[name])
      writeJson(join(profile, 'package.json'), manifest)
      return { exitCode: 0 }
    },
    removeConfiguration() {}, writePluginEnabled() {}, checkRemoved() {}, checkHost() {}, checkManifest() {}, checkConfiguration() {}, enabledEntries: (p) => p.entries,
  }
  let targetFiles
  const target = () => {
    targetFiles = { 'package.json': JSON.stringify({ ...managerManifest, version: '1.1.1' }), 'index.js': 'export const upgraded = true', 'cordis.patch.yml': '[]\n', 'helper/apply-maintenance.mjs': '// controller', 'helper/recover-manager.ps1': '# recovery' }
    const file = join(root, 'manager-target.tgz'); writeFileSync(file, archive(targetFiles))
    writeJson(join(root, 'manager-catalog.json'), { schema: 3, product: 'dsh-guide-mode', artifacts: [{ package: managerManifest.name, version: '1.1.1', file, sha256: digest(readFileSync(file)) }] })
  }
  return { root, profile, state, plan, runtime, calls, target, fail: () => { fail = true }, pending: join(profile, '.guide-manager', 'maintenance-pending.json') }
}

test('uninstall protects preset and refuses incomplete dependency closures', (t) => {
  const f = fixture(t)
  assert.ok(f.plan({ kind: 'uninstall', components: ['preset'] }).blockers.includes('preset-protected-for-session-recovery'))
  assert.ok(f.plan({ kind: 'uninstall', components: ['shield'] }).blockers.includes('dependent-remains:admission->shield'))
  const plan = f.plan({ kind: 'uninstall', components: ['shield', 'admission', 'panel', 'goal', 'sidebar'] })
  assert.deepEqual(plan.blockers, [])
  assert.equal(plan.nativeDriverRestored, true)
})
test('repair inventory survives a missing installed manifest and restores original bytes without changing profile files', async (t) => {
  const f = fixture(t)
  unlinkSync(join(f.profile, 'node_modules/@local/dsh-guide-panel/package.json'))
  writeFileSync(join(f.profile, 'node_modules/@local/dsh-guide-panel/index.js'), 'damaged')
  const before = profileSnapshot(f.profile)
  const plan = f.plan({ kind: 'repair', components: ['panel'] })
  assert.deepEqual(plan.blockers, [])
  stageMaintenance(plan, plan.id, managerRoot)
  const result = await applyMaintenance(f.pending, f.runtime, managerRoot)
  assert.equal(result.status, 'repair-awaiting-restart', JSON.stringify(result))
  assert.deepEqual(profileSnapshot(f.profile), before)
  assert.equal(readJson(join(f.profile, 'node_modules/@local/dsh-guide-panel/package.json')).version, '1.1.0')
})
test('changed package bytes invalidate a repair preview before execution', (t) => {
  const f = fixture(t)
  const plan = f.plan({ kind: 'repair', components: ['panel'] })
  stageMaintenance(plan, plan.id, managerRoot)
  writeFileSync(join(f.profile, 'node_modules/@local/dsh-guide-panel/index.js'), 'drift')
  assert.throws(() => validateMaintenance(readJson(f.pending), f.pending, managerRoot), /stale-maintenance-plan/)
})
test('uninstall removes only selected packages and keeps preset, manager, and unrelated files', async (t) => {
  const f = fixture(t)
  writeFileSync(join(f.profile, 'session-sentinel'), 'keep')
  const plan = f.plan({ kind: 'uninstall', components: ['panel', 'goal'] })
  stageMaintenance(plan, plan.id, managerRoot)
  const result = await applyMaintenance(f.pending, f.runtime, managerRoot)
  assert.equal(result.status, 'uninstall-awaiting-restart', JSON.stringify(result))
  const manifest = readJson(join(f.profile, 'package.json'))
  assert.equal(manifest.dependencies['@local/dsh-guide-panel'], undefined)
  assert.ok(manifest.dependencies['@local/dsh-guide-preset'])
  assert.ok(manifest.dependencies[managerManifest.name])
  assert.equal(readFileSync(join(f.profile, 'session-sentinel'), 'utf8'), 'keep')
})
test('pnpm failure restores original dependency graph and leaves a cancellable receipt', async (t) => {
  const f = fixture(t)
  const before = profileSnapshot(f.profile)
  const plan = f.plan({ kind: 'uninstall', components: ['goal'] })
  stageMaintenance(plan, plan.id, managerRoot); f.fail()
  assert.equal((await applyMaintenance(f.pending, f.runtime, managerRoot)).status, 'failed-restored')
  assert.deepEqual(profileSnapshot(f.profile), before)
  cancelMaintenance(f.profile, plan.id)
  assert.equal(maintenanceView(f.profile).pending, null)
})
test('maintenance rejects stale confirmation, conflicting operations, and modified external controller', (t) => {
  const f = fixture(t)
  const plan = f.plan({ kind: 'repair', components: ['panel'] })
  assert.throws(() => stageMaintenance(plan, 'other', managerRoot), /changed-or-blocked/)
  writeJson(join(f.profile, '.guide-manager', 'package-pending.json'), {})
  assert.throws(() => stageMaintenance(plan, plan.id, managerRoot), /another-operation/)
  unlinkSync(join(f.profile, '.guide-manager', 'package-pending.json'))
  stageMaintenance(plan, plan.id, managerRoot)
  writeFileSync(join(controlPath(f.profile, plan.controllerHash), 'core.js'), 'broken controller')
  assert.throws(() => validateMaintenance(readJson(f.pending), f.pending, managerRoot), /controller-integrity/)
})
test('developer links are explicitly blocked instead of silently replaced', (t) => {
  const f = fixture(t)
  const manifest = readJson(join(f.profile, 'package.json'))
  manifest.dependencies['@local/dsh-guide-panel'] = 'link:D:/development'
  writeJson(join(f.profile, 'package.json'), manifest)
  assert.ok(f.plan({ kind: 'repair', components: ['panel'] }).blockers.includes('managed-tarball-required:panel'))
})
test('manager update and restore use a durable controller and reject later profile drift', async (t) => {
  const f = fixture(t); f.target()
  const plan = f.plan({ kind: 'manager-upgrade', version: '1.1.1' })
  assert.deepEqual(plan.blockers, [])
  stageMaintenance(plan, plan.id, managerRoot)
  const result = await applyMaintenance(f.pending, f.runtime, managerRoot)
  assert.equal(result.status, 'manager-upgrade-awaiting-restart', JSON.stringify(result))
  const originalPatch = readFileSync(join(f.profile, 'cordis.patch.yml'))
  writeFileSync(join(f.profile, 'cordis.patch.yml'), '# later user edit\n[]\n')
  assert.throws(() => createManagerRestorePlan(f.state.profile, result.transactionId, managerRoot), /profile-changed/)
  writeFileSync(join(f.profile, 'cordis.patch.yml'), originalPatch)
  const restore = createManagerRestorePlan(f.state.profile, result.transactionId, managerRoot)
  stageMaintenance(restore, restore.id, managerRoot)
  assert.equal((await applyMaintenance(f.pending, f.runtime, managerRoot)).status, 'manager-restore-awaiting-restart')
  assert.equal(readJson(join(f.profile, 'node_modules/@local/dsh-guide-manager/package.json')).version, '1.1.0')
  assert.throws(() => createManagerRestorePlan(f.state.profile, result.transactionId, managerRoot), /not-restorable/)
})
test('manager catalog rejects host, contract, and artifact tampering', (t) => {
  const f = fixture(t); f.target()
  const path = join(f.root, 'manager-catalog.json')
  assert.equal(readManagerCatalog(path, managerManifest.dshGuide.host).catalog.artifacts.length, 1)
  assert.throws(() => readManagerCatalog(path, {}), /contract-or-host/)
  const catalog = readJson(path)
  writeFileSync(catalog.artifacts[0].file, 'not a tarball')
  assert.throws(() => readManagerCatalog(path, managerManifest.dshGuide.host), /integrity/)
})

test('manager recovery still works after the new version cache and installed entry disappear', async (t) => {
  const f = fixture(t); f.target()
  const plan = f.plan({ kind: 'manager-upgrade', version: '1.1.1' })
  stageMaintenance(plan, plan.id, managerRoot)
  const upgraded = await applyMaintenance(f.pending, f.runtime, managerRoot)
  const current = readJson(join(f.profile, 'package.json')).dependencies[managerManifest.name]
  unlinkSync(current.slice(5))
  unlinkSync(join(f.profile, 'node_modules/@local/dsh-guide-manager/index.js'))
  const restore = createManagerRestorePlan(f.state.profile, upgraded.transactionId, managerRoot)
  stageMaintenance(restore, restore.id, managerRoot)
  const receipt = await applyMaintenance(f.pending, f.runtime, managerRoot)
  assert.equal(receipt.status, 'manager-restore-awaiting-restart', JSON.stringify(receipt))
  assert.equal(readJson(join(f.profile, 'node_modules/@local/dsh-guide-manager/package.json')).version, '1.1.0')
})
test('tar inventory rejects path traversal', () => {
  const root = mkdtempSync(join(tmpdir(), 'guide-tar-'))
  try {
    const file = join(root, 'bad.tgz')
    const bytes = archive({ '../outside': 'bad' }); writeFileSync(file, bytes)
    assert.throws(() => artifactInventory(file, digest(bytes)), /unsafe-tar-path/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('data-only preset tarballs do not require a JavaScript entry', () => {
  const root = mkdtempSync(join(tmpdir(), 'guide-preset-tar-'))
  try {
    const file = join(root, 'preset.tgz')
    const bytes = archive({ 'package.json': JSON.stringify({ name: '@local/dsh-guide-preset', version: '1.1.0' }), 'cordis.patch.yml': '[]\n' })
    writeFileSync(file, bytes)
    assert.equal(artifactInventory(file, digest(bytes)).manifest.name, '@local/dsh-guide-preset')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

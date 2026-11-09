/** Opt-in real pnpm rollback and locking checks; accepts a fresh isolated setup only. */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { COMPONENTS } from '../core.js'
import { artifactInventory, packageInventory } from '../artifacts.js'
import { createInstallPlan, fingerprint, profileSnapshot, readCatalog, readJson, stageInstall, writeJson } from '../install.js'
const setup = readJson(resolve(process.argv[2]))
const profile = setup.profile
const output = join(dirname(resolve(process.argv[2])), 'maintenance-faults')
mkdirSync(output)
process.env.DSH_HOME = setup.home
const managerRoot = setup.managerRoot
const { officialRuntime, applyInstall } = await import(pathToFileURL(join(managerRoot, 'helper/apply-install.mjs')).href)
const { createMaintenancePlan, stageMaintenance, cancelMaintenance } = await import(pathToFileURL(join(managerRoot, 'maintenance.js')).href)
const { applyMaintenance } = await import(pathToFileURL(join(managerRoot, 'helper/apply-maintenance.mjs')).href)
const host = readJson(join(managerRoot, 'package.json')).dshGuide.host
const asar = join(dirname(process.execPath), 'resources/app.asar/dsh')
const state = { profile: { dir: profile, name: setup.profileName, installAnchor: join(asar, 'node_modules/@deepseek-ai/dsh/package.json') },
  host: { dsh: { match: true }, cordis: { match: true }, artifacts: { verified: true }, betterSidebar: { match: true } },
  pending: { present: false }, components: COMPONENTS.map((item) => ({ ...item, installed: false, expectedVersion: '1.1.0', expectedContract: 1 })) }
const runtime = await officialRuntime()
const run = runtime.run
runtime.run = (context, args) => run(context, [...args, '--offline'])
const release = readCatalog(setup.catalogPath)
const install = createInstallPlan(state, release, COMPONENTS.map((item) => item.key))
const intent = stageInstall(state, release, install.requested, install.id)
assert.equal((await applyInstall(intent.pendingPath, runtime)).status, 'installed-awaiting-restart')
state.components.forEach((item) => Object.assign(item, { installed: true, enabled: true, version: '1.1.0' }))
const plan = (kind, components) => createMaintenancePlan(state, { kind, components }, managerRoot, null, host)
const pendingPath = join(profile, '.guide-manager/maintenance-pending.json')
const baseline = profileSnapshot(profile)
const assertions = []

// --force alone does not reliably repair a missing entry with intact package.json.
unlinkSync(join(profile, 'node_modules/@local/dsh-guide-panel/index.js'))
unlinkSync(join(profile, 'node_modules/@local/dsh-guide-preset/cordis.patch.yml'))
const damaged = plan('repair', ['panel', 'preset'])
stageMaintenance(damaged, damaged.id, managerRoot)
const repaired = await applyMaintenance(pendingPath, runtime, managerRoot)
writeJson(join(output, 'entry-only-repair.json'), repaired)
assert.equal(repaired.status, 'repair-awaiting-restart', JSON.stringify(repaired))
assert.deepEqual(profileSnapshot(profile), baseline)
for (const entry of damaged.entries) assert.equal(fingerprint(packageInventory(profile, entry)), fingerprint(entry.files))
assertions.push('real pnpm repairs a missing index with intact manifest and the data-only preset; exact profile bytes unchanged')

// Fail after real removal and native-driver configuration; all packages/config must return.
const uninstall = plan('uninstall', ['panel', 'goal'])
stageMaintenance(uninstall, uninstall.id, managerRoot)
const checkRemoved = runtime.checkRemoved
runtime.checkRemoved = (p) => { checkRemoved(p); throw new Error('injected-post-uninstall-failure') }
const failed = await applyMaintenance(pendingPath, runtime, managerRoot)
writeJson(join(output, 'uninstall-failure.json'), failed)
assert.equal(failed.status, 'failed-restored', JSON.stringify(failed))
assert.deepEqual(profileSnapshot(profile), baseline)
for (const entry of uninstall.entries) assert.equal(fingerprint(packageInventory(profile, entry)), fingerprint(entry.files))
assertions.push('post-removal fault restores exact four profile files and original package bytes')
cancelMaintenance(profile, uninstall.id)
runtime.checkRemoved = checkRemoved

// Failed dependency repair is explicitly recovery-required; a running Host must not be resumed.
const repair = plan('repair', ['panel'])
stageMaintenance(repair, repair.id, managerRoot)
let runs = 0
runtime.run = async (context, args) => { runs++; return { exitCode: 1 } }
const broken = await applyMaintenance(pendingPath, runtime, managerRoot)
writeJson(join(output, 'dependency-recovery-failure.json'), broken)
assert.equal(broken.status, 'recovery-required')
assert.equal(runs, 2)
assert.throws(() => stageMaintenance(repair, repair.id, managerRoot), /pending|recovery/)
assertions.push('failure of operation and its repair produces recovery-required and blocks subsequent writes')
// Explicit isolated operator recovery: verify a real frozen install before clearing the test receipt.
assert.deepEqual(profileSnapshot(profile), baseline)
runtime.run = (context, args) => run(context, [...args, '--offline'])
const recovered = await runtime.run({ dir: profile, profile: setup.profileName, cwd: profile, installAnchor: state.profile.installAnchor }, ['install', '--frozen-lockfile', '--force', '--config.ignore-scripts=true', '--config.auto-install-peers=false'])
assert.equal(recovered.exitCode, 0)
assert.equal(fingerprint(packageInventory(profile, repair.entries[0])), fingerprint(repair.entries[0].files))
unlinkSync(pendingPath)
unlinkSync(join(profile, '.guide-manager/maintenance-result.json'))

// Real lock contention with the same official withFileLock path as Plugins.
const selected = plan('repair', ['panel'])
stageMaintenance(selected, selected.id, managerRoot)
await runtime.withLock(join(profile, 'package.json'), async () => {
  await assert.rejects(() => applyMaintenance(pendingPath, runtime, managerRoot), /lock|timeout|busy/i)
})
assert.deepEqual(profileSnapshot(profile), baseline)
cancelMaintenance(profile, selected.id)
assertions.push('official profile lock contention refuses maintenance without altering files')
writeJson(join(output, 'result.json'), { status: 'passed', assertions, liveProfileTouched: false })
console.log(JSON.stringify({ status: 'passed', assertions: assertions.length }))

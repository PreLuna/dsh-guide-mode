/** Opt-in real official pnpm fault/recovery checks in a freshly bootstrapped profile. */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { COMPONENTS } from '../core.js'
import { cachePath, createInstallPlan, profileSnapshot, readCatalog, readJson, stageInstall, writeJson } from '../install.js'
import { createRestorePlan, createUpgradePlan, readUpgradeCatalog, stagePackagePlan } from '../upgrade.js'

const setupPath = resolve(process.argv[2])
const output = join(dirname(setupPath), 'package-faults')
mkdirSync(output)
const setup = readJson(setupPath)
const managerRoot = setup.managerRoot ?? resolve(import.meta.dirname, '..')
const { applyInstall, officialRuntime } = await import(pathToFileURL(join(managerRoot, 'helper/apply-install.mjs')).href)
const { applyPackage } = await import(pathToFileURL(join(managerRoot, 'helper/apply-package.mjs')).href)
const profile = setup.profile
process.env.DSH_HOME = setup.home
const asar = join(dirname(process.execPath), 'resources', 'app.asar', 'dsh')
const state = { profile: { dir: profile, name: setup.profileName, installAnchor: join(asar, 'node_modules/@deepseek-ai/dsh/package.json') }, pending: { present: false }, skills: { status: 'missing' },
  host: { verified: true, dsh: { match: true }, cordis: { match: true }, betterSidebar: { match: true }, artifacts: { verified: true } },
  components: COMPONENTS.map((entry) => ({ ...entry, installed: false, expectedVersion: '1.1.0', expectedContract: 1 })) }
const runtime = await officialRuntime()
const run = runtime.run
runtime.run = (context, args) => run(context, [...args, '--offline'])
const packageVersion = (key) => readJson(join(profile, 'node_modules', ...COMPONENTS.find((entry) => entry.key === key).package.split('/'), 'package.json')).version
try {
  const release = readCatalog(setup.catalogPath)
  const selection = COMPONENTS.map((entry) => entry.key)
  const install = createInstallPlan(state, release, selection)
  const pending = stageInstall(state, release, selection, install.id)
  assert.equal((await applyInstall(pending.pendingPath, runtime)).status, 'installed-awaiting-restart')
  for (const component of state.components) Object.assign(component, { installed: true, enabled: true, version: packageVersion(component.key), contract: 1 })
  const original = profileSnapshot(profile)
  const catalog = readUpgradeCatalog(join(profile, '.guide-manager', 'upgrade-catalog.json'))
  const expectedHost = readJson(new URL('../package.json', import.meta.url)).dshGuide.host
  const upgrade = createUpgradePlan(state, catalog, [{ key: 'panel', version: '1.1.1' }], expectedHost)
  stagePackagePlan(upgrade, upgrade.id)
  const path = join(profile, '.guide-manager', 'package-pending.json')
  const check = runtime.checkConfiguration
  let injectFailure = true
  runtime.checkConfiguration = (plan) => { check(plan); if (injectFailure) { injectFailure = false; throw new Error('injected-real-pnpm-post-upgrade-failure') } }
  const failed = await applyPackage(path, runtime)
  assert.equal(failed.status, 'failed-restored', JSON.stringify(failed))
  assert.deepEqual(profileSnapshot(profile), original)
  assert.equal(packageVersion('panel'), '1.1.0')
  writeJson(join(output, 'upgrade-failure.json'), failed)
  const succeeded = await applyPackage(path, runtime)
  assert.equal(succeeded.status, 'upgraded-awaiting-restart', JSON.stringify(succeeded))
  assert.equal(packageVersion('panel'), '1.1.1')
  const upgraded = profileSnapshot(profile)
  const restore = createRestorePlan(state, succeeded.transactionId)
  stagePackagePlan(restore, restore.id)
  const actualRun = runtime.run
  let failRestoration = true
  runtime.run = (context, args) => {
    if (args[0] === 'install' && failRestoration) { failRestoration = false; return Promise.resolve({ exitCode: 1, logPath: 'injected-restore-install-refusal' }) }
    return actualRun(context, args)
  }
  const restoreFailed = await applyPackage(path, runtime)
  assert.equal(restoreFailed.status, 'failed-restored', JSON.stringify(restoreFailed))
  assert.deepEqual(profileSnapshot(profile), upgraded)
  assert.equal(packageVersion('panel'), '1.1.1')
  writeJson(join(output, 'restore-failure.json'), restoreFailed)
  // Original release files and a prior cache copy disappear; transaction backup is sufficient.
  for (const artifact of catalog.catalog.artifacts) unlinkSync(artifact.file)
  const oldPanel = catalog.catalog.artifacts.find((entry) => entry.key === 'panel' && entry.version === '1.1.0')
  unlinkSync(cachePath(profile, oldPanel.sha256))
  const restored = await applyPackage(path, runtime)
  assert.equal(restored.status, 'restored-awaiting-restart', JSON.stringify(restored))
  assert.deepEqual(profileSnapshot(profile), original)
  assert.equal(packageVersion('panel'), '1.1.0')
  writeJson(join(output, 'restored.json'), restored)
  writeJson(join(output, 'result.json'), { status: 'passed', realOfficialPnpm: true, upgradeFailureRestored: true, failedRestoreRepairedNewerVersion: true, releaseIndependentRestore: true, exactOriginalProfileFilesRestored: true, liveProfileModified: false, externalModelCalls: 0 })
  console.log(JSON.stringify({ status: 'passed', output }))
} catch (error) {
  writeJson(join(output, 'result.json'), { status: 'failed', error: String(error.stack ?? error), liveProfileModified: false })
  throw error
}

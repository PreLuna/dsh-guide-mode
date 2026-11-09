/** Opt-in: installed Electron, --expose-internals, a freshly packed catalog and a NEW evidence directory. */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createInstallPlan, profileSnapshot, readCatalog, readJson, stageInstall, writeJson } from '../install.js'
import { officialRuntime } from '../helper/apply-install.mjs'

const catalogPath = resolve(process.argv[2])
const output = resolve(process.argv[3])
if (existsSync(output)) throw new Error('use a new evidence directory')
mkdirSync(output, { recursive: true })
const home = join(output, 'isolated-home')
const profile = join(home, 'profiles', 'install-test')
mkdirSync(profile, { recursive: true })
process.env.DSH_HOME = home
const asar = join(dirname(process.execPath), 'resources', 'app.asar', 'dsh')
const installAnchor = join(asar, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
const { catalog } = readCatalog(catalogPath)
const managerArtifact = readJson(join(dirname(catalogPath), 'manifest.json')).artifacts.find((item) => item.key === 'manager')
const sidebarSource = join(process.env.USERPROFILE, '.dsh', 'profiles', 'desktop', 'node_modules', 'dsh-better-sidebar')
assert.equal(readJson(join(sidebarSource, 'package.json')).version, '0.28.2')
writeJson(join(profile, 'package.json'), {
  name: 'isolated-install-test', private: true,
  dependencies: { '@local/dsh-guide-manager': `file:${managerArtifact.file}`, 'dsh-better-sidebar': `link:${sidebarSource}` },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-better-sidebar', '@local/dsh-guide-manager'] } },
})
writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\n')
writeFileSync(join(profile, 'cordis.patch.yml'), '# isolated install test\n[]\n')
const state = {
  profile: { dir: profile, name: 'install-test', installAnchor }, pending: { present: false },
  host: { verified: true, dsh: { match: true }, cordis: { match: true }, betterSidebar: { match: true }, artifacts: { verified: true } },
  skills: { status: 'missing' },
  components: catalog.components.map((item) => ({ key: item.key, installed: false, version: null, expectedVersion: item.version, expectedContract: item.contract })),
}
try {
  // Bootstrap only manager + its existing official sidebar prerequisite.
  const bootstrap = await officialRuntime()
  const context = { dir: profile, profile: 'install-test', cwd: profile, installAnchor }
  const initialInstall = await bootstrap.withLock(join(profile, 'package.json'), () => bootstrap.run(context, ['install', '--offline', '--config.auto-install-peers=false', '--ignore-scripts']))
  assert.equal(initialInstall.exitCode, 0, JSON.stringify(initialInstall))
  const managerRoot = join(profile, 'node_modules', '@local', 'dsh-guide-manager')
  const packedManager = await import(pathToFileURL(join(managerRoot, 'index.js')).href)
  const services = new Map([
    ['profileContext', { ...context, name: 'install-test', home }],
    ['pluginManager', { listPlugins: async () => [], listBundles: () => [] }],
  ])
  const managerContext = { get: (name) => services.get(name), provide: (name, value) => services.set(name, value), inject() {} }
  await packedManager.apply(managerContext, { catalogPath, checkArtifacts: false })
  assert.ok((await services.get('guideManager').getState()).components.every((component) => component.status === 'missing'))
  const packedHelper = await import(pathToFileURL(join(managerRoot, 'helper', 'apply-install.mjs')).href)
  const release = readCatalog(catalogPath)
  const requested = catalog.components.map((item) => item.key)
  const plan = createInstallPlan(state, release, requested)
  assert.deepEqual(plan.blockers, [])
  const pending = stageInstall(state, release, requested, plan.id)
  const before = profileSnapshot(profile)
  const runtime = await packedHelper.officialRuntime()
  const run = runtime.run
  runtime.run = (context, args) => run(context, [...args, '--offline'])
  if (process.argv.includes('--fail-activation')) runtime.writePluginEnabled = async () => { throw new Error('injected-activation-failure') }
  await runtime.withLock(join(profile, 'package.json'), async () => {
    await assert.rejects(packedHelper.applyInstall(pending.pendingPath, runtime))
    assert.deepEqual(profileSnapshot(profile), before)
  })
  const receipt = await packedHelper.applyInstall(pending.pendingPath, runtime)
  writeJson(join(output, 'receipt.json'), receipt)
  if (process.argv.includes('--fail-activation')) {
    assert.equal(receipt.status, 'failed-restored', JSON.stringify(receipt))
    assert.deepEqual(profileSnapshot(profile), before)
    assert.ok(existsSync(pending.pendingPath))
    const restored = readJson(join(profile, 'package.json'))
    assert.ok(catalog.components.every((entry) => restored.dependencies[entry.package] === undefined && !restored.dsh.profile.bundles.includes(entry.package)))
    const retained = readJson(join(profile, 'node_modules', '@local', 'dsh-guide-manager', 'package.json'))
    assert.equal(retained.version, managerArtifact.version)
    assert.ok(catalog.components.every((entry) => !existsSync(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json'))))
    writeJson(join(output, 'result.json'), { status: 'passed', scenario: 'official-activation-failure-restoration', profile, restoredOriginalProfileFiles: true, retainedManager: true, removedNewComponents: true, liveProfileModified: false, externalModelCalls: 0 })
    console.log(JSON.stringify({ status: 'passed', scenario: 'restoration', output }))
    process.exit(0)
  }
  assert.equal(receipt.status, 'installed-awaiting-restart', JSON.stringify(receipt))
  const manifest = readJson(join(profile, 'package.json'))
  for (const entry of catalog.components) {
    const installed = readJson(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json'))
    assert.equal(installed.version, entry.version)
    assert.equal(installed.dshGuide.contract, entry.contract)
    assert.ok(manifest.dsh.profile.bundles.includes(entry.package))
  }
  const boot = await import(pathToFileURL(join(asar, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js')).href)
  const patches = boot.readBundlePatches('dsh', { dir: profile, installAnchor, patchPath: join(profile, 'cordis.patch.yml') })
  const overrides = boot.loadOptionalPatches('dsh', join(profile, 'cordis.patch.yml')) ?? []
  const entries = boot.composeEntries([[...patches, ...overrides]])
  const flatten = (rows) => rows.flatMap((row) => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
  const rows = flatten(entries)
  for (const id of ['preset-guide', 'guide-settlement-shield', 'guide-admission', 'guide-panel', 'guide-sidebar-adapter', 'guide-goal-adapter']) {
    const row = rows.find((item) => item.id === id)
    assert.ok(row && !row.disabled, `missing or disabled:${id}`)
  }
  assert.equal(rows.find((item) => item.id === 'goal-round-driver')?.disabled, true)
  writeJson(join(output, 'result.json'), { status: 'passed', profile, officialPackageOperations: true, packedManagerOnlyStateVerified: true, packedHelperUsed: true, profileLockContentionVerified: true, components: catalog.components.map(({ key, version }) => ({ key, version })), goalPairVerified: true, liveProfileModified: false, externalModelCalls: 0 })
  console.log(JSON.stringify({ status: 'passed', output }))
} catch (error) {
  writeJson(join(output, 'result.json'), { status: 'failed', error: String(error.stack ?? error), liveProfileModified: false })
  throw error
}

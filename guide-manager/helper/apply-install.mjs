/** Cold first-install executor. The wrapper must stop DSH before invoking main(). */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cacheArtifact, fingerprint, INSTALL_ORDER, INSTALL_REQUIRES, INSTALL_ROWS, PROFILE_FILES, profileSnapshot, readCatalog, readJson, writeJson } from '../install.js'
import { ARTIFACT_REQUIREMENTS } from '../core.js'
import { digest } from '../install.js'

export function validateInstallPlan(plan, path) {
  if (plan?.schema !== 1 || plan.kind !== 'first-install' || plan.status !== 'pending-restart') throw new Error('invalid-install-plan')
  if (!isAbsolute(plan.profile?.dir ?? '') || resolve(path) !== join(resolve(plan.profile.dir), '.guide-manager', 'install-pending.json')) throw new Error('invalid-install-profile')
  const { id, status, createdAt, ...body } = plan
  if (fingerprint(body) !== id || plan.blockers?.length !== 0) throw new Error('invalid-install-fingerprint')
  if (fingerprint(profileSnapshot(plan.profile.dir)) !== fingerprint(plan.before)) throw new Error('stale-install-profile')
  const release = readCatalog(plan.catalogPath, { requiredKeys: plan.entries.map((entry) => entry.key) })
  if (release.hash !== plan.catalogHash) throw new Error('stale-install-catalog')
  if (!Array.isArray(plan.entries) || !plan.entries.length || plan.entries.length > 6) throw new Error('invalid-install-entries')
  const keys = plan.entries.map((entry) => entry.key)
  if (JSON.stringify(keys) !== JSON.stringify(INSTALL_ORDER.filter((key) => keys.includes(key)))) throw new Error('invalid-install-order')
  const manifest = readJson(join(plan.profile.dir, 'package.json'))
  if (existsSync(join(plan.profile.dir, '.guide-manager', 'pending.json'))) throw new Error('cold-toggle-pending')
  if (existsSync(join(plan.profile.dir, '.guide-manager', 'maintenance-pending.json'))) throw new Error('maintenance-operation-pending')
  if (existsSync(join(plan.profile.dir, '.guide-manager', 'install-result.json')) && readJson(join(plan.profile.dir, '.guide-manager', 'install-result.json')).status === 'recovery-required') throw new Error('install-recovery-required')
  for (const entry of plan.entries) {
    const known = release.catalog.components.find((item) => item.key === entry.key)
    if (!known || ['package', 'version', 'contract', 'file', 'sha256'].some((name) => known[name] !== entry[name])) throw new Error('invalid-install-source')
    if (!['install', 'retain'].includes(entry.action)) throw new Error('invalid-install-action')
    if (entry.action === 'install' && (manifest.dependencies?.[entry.package] !== undefined || manifest.dsh?.profile?.bundles?.includes(entry.package))) throw new Error('component-already-registered')
    if (entry.action === 'retain' && manifest.dependencies?.[entry.package] !== entry.previousSpec) throw new Error('retained-component-changed')
    if ((INSTALL_REQUIRES[entry.key] ?? []).some((dependency) => !keys.includes(dependency))) throw new Error('missing-install-dependency')
  }
  return plan
}

export async function officialRuntime() {
  const root = process.env.DSH_ASAR_ROOT ?? join(dirname(process.execPath), 'resources', 'app.asar', 'dsh')
  const load = (name, file = 'index.js') => import(pathToFileURL(join(root, 'node_modules', '@deepseek-ai', name, 'lib', file)).href)
  const operations = await load('dsh-plugin-manager', 'types/operations.js')
  const { withFileLock } = await load('dsh-atomic-write')
  const { writePluginEnabled } = await load('dsh-plugin-manager', 'types/patch.js')
  const boot = await load('dsh-app-boot')
  const semver = (await import(pathToFileURL(join(root, 'node_modules', 'semver', 'index.js')).href)).default
  const yaml = await import(pathToFileURL(join(root, 'node_modules', 'yaml', 'dist', 'index.js')).href)
  const configurationRows = (profile) => {
    const patches = boot.readBundlePatches('dsh', profile)
    const overrides = boot.loadOptionalPatches('dsh', profile.patchPath) ?? []
    const flatten = (rows) => rows.flatMap((row) => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
    return flatten(boot.composeEntries([[...patches, ...overrides]]))
  }
  // Match the launcher-owned package-manager environment instead of using a second npm.
  const runtime = resolve(dirname(process.execPath), 'resources', 'runtime', 'primary-runtime', 'dependencies')
  const pnpm = join(runtime, 'pnpm', 'bin', 'pnpm.cjs')
  const node = join(runtime, 'node', 'bin', 'node.exe')
  if (!existsSync(pnpm) || !existsSync(node)) throw new Error('bundled-package-manager-unavailable')
  return {
    withLock: (path, callback) => withFileLock(path, callback, { waitMs: 1000 }),
    run: (context, args) => operations.runProfilePnpm(context, args, {
      command: node, args: [pnpm], execution: 'service', outputBytes: 32768,
      idleTimeoutMs: 60000, activateNewBundles: false,
    }),
    saveManifest: operations.saveManifest,
    writePluginEnabled,
    enabledEntries(plan) {
      const rows = configurationRows({ ...plan.profile, patchPath: join(plan.profile.dir, 'cordis.patch.yml') })
      return plan.entries.map((entry) => ({ ...entry, enabled: rows.some((row) => row.id === INSTALL_ROWS[entry.key]?.[0] && row.disabled !== true) }))
    },
    removeConfiguration(plan) {
      const path = join(plan.profile.dir, 'cordis.patch.yml')
      if (!existsSync(path)) return
      const document = yaml.parseDocument(readFileSync(path, 'utf8'))
      if (document.errors.length) throw new Error('invalid-profile-yaml')
      const removed = new Set(plan.entries.flatMap((entry) => [INSTALL_ROWS[entry.key][0], entry.package]))
      const prune = (sequence) => {
        if (!yaml.isSeq(sequence)) return
        sequence.items = sequence.items.filter((row) => {
          if (!yaml.isMap(row)) return true
          if (removed.has(row.get('id')) || removed.has(row.get('name'))) {
            let anchored = false
            yaml.visit(row, (_, node) => { if (node?.anchor) anchored = true })
            if (anchored) throw new Error('cannot-remove-anchored-component-configuration')
            return false
          }
          prune(row.get('insert', true))
          if (row.get('group')) prune(row.get('config', true))
          return true
        })
      }
      prune(document.contents)
      // Refuse to create dangling YAML aliases.
      document.toJS()
      writeFileSync(path, document.toString())
    },
    checkRemoved(plan) {
      const manifest = readJson(join(plan.profile.dir, 'package.json'))
      const rows = configurationRows({ ...plan.profile, patchPath: join(plan.profile.dir, 'cordis.patch.yml') })
      for (const entry of plan.entries) if (manifest.dependencies?.[entry.package] || manifest.dsh?.profile?.bundles?.includes(entry.package)
        || rows.some((row) => row.id === INSTALL_ROWS[entry.key][0] || row.name === entry.package)) throw new Error(`uninstall-incomplete:${entry.key}`)
      if (plan.entries.some((entry) => entry.key === 'goal') && !rows.some((row) => row.id === 'goal-round-driver' && row.disabled !== true)) throw new Error('native-goal-driver-not-restored')
    },
    checkManifest(manifest) {
      const issue = boot.evaluatePluginCompatibility(manifest, {})
      if (issue) throw new Error(`incompatible-installed-package:${manifest.name}`)
    },
    checkPeerGraph(plan) {
      const manifests = plan.entries.map((entry) => readJson(join(plan.profile.dir, 'node_modules', ...entry.package.split('/'), 'package.json')))
      for (const manifest of manifests) for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
        const peer = manifests.find((item) => item.name === name)
        if (peer && !semver.satisfies(peer.version, range)) throw new Error(`installed-peer-conflict:${manifest.name}->${name}`)
      }
    },
    checkHost(plan) {
      const bom = readJson(new URL('../package.json', import.meta.url)).dshGuide
      const installedDsh = readJson(join(root, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
      const installedCordis = readJson(join(root, 'node_modules', '@deepseek-ai', 'cordis', 'package.json'))
      if (installedDsh.version !== bom.host.dsh || installedCordis.version !== bom.host.cordis) throw new Error('cold-install-host-version-mismatch')
      const required = new Set(plan.entries.flatMap((entry) => ARTIFACT_REQUIREMENTS[entry.key] ?? []))
      for (const name of required) {
        const expected = bom.artifacts[name]
        const dir = boot.resolveBundleDir('dsh', name, plan.profile.installAnchor, plan.profile.dir)
        if (!expected || digest(readFileSync(join(dir, expected.file))) !== expected.sha256) throw new Error(`cold-install-host-artifact-mismatch:${name}`)
      }
      if (plan.entries.some((entry) => entry.key === 'sidebar')) {
        const dir = boot.resolveBundleDir('dsh', 'dsh-better-sidebar', plan.profile.installAnchor, plan.profile.dir)
        if (readJson(join(dir, 'package.json')).version !== bom.host.betterSidebar) throw new Error('cold-install-sidebar-version-mismatch')
      }
    },
    checkConfiguration(plan) {
      const profile = { dir: plan.profile.dir, installAnchor: plan.profile.installAnchor, patchPath: join(plan.profile.dir, 'cordis.patch.yml') }
      const patches = boot.readBundlePatches('dsh', profile)
      const overrides = boot.loadOptionalPatches('dsh', profile.patchPath) ?? []
      const flatten = (rows) => rows.flatMap((row) => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])])
      const rows = flatten(boot.composeEntries([[...patches, ...overrides]]))
      for (const entry of plan.entries) {
        const [id, name] = INSTALL_ROWS[entry.key]
        const row = rows.find((item) => item.id === id)
        if (!row && entry.enabled === false) continue
        if (row?.name !== name || (row.disabled !== true) !== (entry.enabled !== false)) throw new Error(`installed-configuration-mismatch:${entry.key}`)
      }
      if (plan.entries.some((entry) => entry.key === 'goal')) {
        const driver = rows.find((item) => item.id === 'goal-round-driver')
        const goalEnabled = plan.entries.find((entry) => entry.key === 'goal').enabled !== false
        if (driver?.name !== '@deepseek-ai/dsh-goal-round-driver' || (driver.disabled === true) !== goalEnabled) throw new Error('goal-driver-pair-mismatch')
      }
    },
  }
}

export async function applyInstall(path, runtime) {
  const pendingPath = resolve(path)
  const initial = readJson(pendingPath)
  // This validation is repeated inside the official profile lock.
  validateInstallPlan(initial, pendingPath)
  const profile = initial.profile.dir
  const resultPath = join(profile, '.guide-manager', 'install-result.json')
  return runtime.withLock(join(profile, 'package.json'), async () => {
    const plan = validateInstallPlan(readJson(pendingPath), pendingPath)
    const before = Object.fromEntries(PROFILE_FILES.map((name) => [name, existsSync(join(profile, name)) ? readFileSync(join(profile, name)) : null]))
    const backup = join(profile, '.guide-manager', 'install-backups', `${Date.now()}-${plan.id.slice(0, 12)}`)
    mkdirSync(backup, { recursive: true })
    for (const [name, bytes] of Object.entries(before)) if (bytes !== null) writeFileSync(join(backup, name), bytes)
    writeJson(join(backup, 'snapshot.json'), plan.before)
    const context = { dir: profile, profile: plan.profile.name, cwd: profile, installAnchor: plan.profile.installAnchor }
    let receipt = { schema: 1, planId: plan.id, status: 'installing', startedAt: new Date().toISOString(), backup, entries: plan.entries.map(({ key, version, action }) => ({ key, version, action })), error: null }
    writeJson(resultPath, receipt)
    let changedPackages = false
    try {
      const additions = plan.entries.filter((entry) => entry.action === 'install')
      if (!additions.length) throw new Error('nothing-to-install')
      // One pnpm run resolves the whole dependency closure. Never activate a partial set.
      changedPackages = true
      const result = await runtime.run(context, ['add', ...additions.map((entry) => cacheArtifact(profile, entry)), '--save-exact', '--config.auto-install-peers=false', '--ignore-scripts'])
      if (result.exitCode !== 0 || result.timedOut) throw new Error(`package-install-failed:${result.logPath ?? result.output ?? result.exitCode}`)
      const manifest = readJson(join(profile, 'package.json'))
      const oldManifest = JSON.parse(before['package.json'])
      const allowed = new Set(additions.map((entry) => entry.package))
      const unrelated = (doc) => ({ ...doc, dependencies: Object.fromEntries(Object.entries(doc.dependencies ?? {}).filter(([name]) => !allowed.has(name))) })
      if (fingerprint(unrelated(manifest)) !== fingerprint(unrelated(oldManifest))) throw new Error('unrelated-profile-change')
      for (const entry of plan.entries) {
        const installed = readJson(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json'))
        if (installed.name !== entry.package || installed.version !== entry.version || installed.dshGuide?.contract !== entry.contract || !installed.dsh?.bundle?.patch) throw new Error(`installed-package-mismatch:${entry.key}`)
        runtime.checkManifest(installed)
      }
      runtime.checkHost(plan)
      const bundles = manifest.dsh?.profile?.bundles ?? []
      manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...bundles, ...additions.map((entry) => entry.package).filter((name) => !bundles.includes(name))] } }
      await runtime.saveManifest(profile, manifest)
      const patchProfile = { dir: profile, installAnchor: plan.profile.installAnchor, patchPath: join(profile, 'cordis.patch.yml') }
      for (const entry of additions) {
        const [id, moduleName] = INSTALL_ROWS[entry.key]
        await runtime.writePluginEnabled(patchProfile, id, moduleName, true)
        if (entry.key === 'goal') await runtime.writePluginEnabled(patchProfile, 'goal-round-driver', '@deepseek-ai/dsh-goal-round-driver', false)
      }
      runtime.checkConfiguration(plan)
      receipt = { ...receipt, status: 'installed-awaiting-restart', finishedAt: new Date().toISOString(), after: profileSnapshot(profile) }
      writeJson(resultPath, receipt)
      unlinkSync(pendingPath)
      return receipt
    } catch (error) {
      let recoveryError = null
      for (const [name, bytes] of Object.entries(before)) {
        try {
          if (bytes !== null) writeFileSync(join(profile, name), bytes)
          else if (existsSync(join(profile, name))) unlinkSync(join(profile, name))
        } catch (restoreError) { recoveryError = String(restoreError.message ?? restoreError) }
      }
      if (changedPackages && !recoveryError) {
        try {
          const repair = await runtime.run(context, ['install', before['pnpm-lock.yaml'] !== null ? '--frozen-lockfile' : '--config.lockfile=false', '--config.auto-install-peers=false', '--ignore-scripts'])
          if (repair.exitCode !== 0 || repair.timedOut) throw new Error(`dependency-repair-failed:${repair.logPath ?? repair.exitCode}`)
          // Keep the original bytes, including formatting and absence of a lockfile.
          for (const [name, bytes] of Object.entries(before)) {
            if (bytes !== null) writeFileSync(join(profile, name), bytes)
            else if (existsSync(join(profile, name))) unlinkSync(join(profile, name))
          }
        } catch (repairError) { recoveryError = String(repairError.message ?? repairError) }
      }
      receipt = { ...receipt, status: recoveryError ? 'recovery-required' : 'failed-restored', finishedAt: new Date().toISOString(), error: String(error.message ?? error), recoveryError }
      writeJson(resultPath, receipt)
      return receipt
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const receipt = await applyInstall(process.argv[2], await officialRuntime())
    console.log(JSON.stringify(receipt))
    if (receipt.status !== 'installed-awaiting-restart') process.exitCode = receipt.status === 'recovery-required' ? 3 : 1
  } catch (error) {
    console.error(String(error.message ?? error))
    process.exitCode = 1
  }
}

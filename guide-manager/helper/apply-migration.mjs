/** Phase 5E cold link-to-release migration. The wrapper must stop DSH first. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cacheArtifact, cachePath, digest, fingerprint, PROFILE_FILES, profileSnapshot, readCatalog, readJson, writeJson } from '../install.js'
import { readManagerCatalog } from '../maintenance.js'
import { MIGRATION_KEYS, migrationTransactionPath, readLinkSource, readMigrationTransaction } from '../migration.js'
import { officialRuntime } from './apply-install.mjs'

const controllerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function validate(plan, path) {
  if (plan?.schema !== 1 || plan.kind !== 'migration' || plan.status !== 'pending-restart'
    || resolve(path) !== join(resolve(plan.profile?.dir ?? ''), '.guide-manager', 'migration-pending.json')) throw new Error('invalid-migration-plan')
  const { id, status, createdAt, ...body } = plan
  if (id !== fingerprint(body) || plan.blockers?.length !== 0) throw new Error('invalid-migration-plan-fingerprint')
  const profile = plan.profile.dir
  if (fingerprint(profileSnapshot(profile)) !== fingerprint(plan.before)) throw new Error('stale-migration-profile')
  if (!Array.isArray(plan.entries) || plan.entries.length === 0 || plan.entries.length > MIGRATION_KEYS.length) throw new Error('invalid-migration-entries')
  const keys = plan.entries.map((entry) => entry.key)
  if (new Set(keys).size !== keys.length || keys.some((key) => !MIGRATION_KEYS.includes(key))
    || JSON.stringify(keys) !== JSON.stringify(MIGRATION_KEYS.filter((key) => keys.includes(key)))) throw new Error('invalid-migration-order')
  const release = readCatalog(plan.catalogPath)
  if (release.hash !== plan.catalogHash) throw new Error('stale-migration-catalog')
  if (plan.managerCatalogPath) {
    if (!existsSync(plan.managerCatalogPath)) throw new Error('manager-catalog-unavailable')
    readManagerCatalog(plan.managerCatalogPath, readJson(new URL('../package.json', import.meta.url)).dshGuide.host)
  }
  const manifest = readJson(join(profile, 'package.json'))
  for (const entry of plan.entries) {
    if (entry.action !== 'migrate' || entry.source?.spec !== manifest.dependencies?.[entry.package]) throw new Error(`stale-migration-source:${entry.key}`)
    const source = readLinkSource(profile, entry.key, entry.source.spec)
    if (source.filesHash !== plan.sourceHashes?.[entry.key] || source.version !== entry.source.version
      || source.filesHash !== entry.source.filesHash) throw new Error(`migration-source-changed:${entry.key}`)
    const installed = digest(readFileSync(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json')))
    if (installed !== plan.packageHashes?.[entry.key]) throw new Error(`stale-migration-package:${entry.key}`)
    if (!entry.target || entry.target.package !== entry.package || !/^[a-f0-9]{64}$/.test(entry.target.sha256 ?? '')
      || !existsSync(entry.target.file) || digest(readFileSync(entry.target.file)) !== entry.target.sha256) throw new Error(`migration-target-integrity:${entry.key}`)
    if (entry.key === 'manager') {
      if (entry.target.contract !== 1) throw new Error('unsupported-manager-contract')
    } else {
      const known = release.catalog.components.find((item) => item.key === entry.key)
      const same = known && ['package', 'version', 'contract', 'dataSchema', 'file', 'sha256'].every((name) => {
        const expected = name === 'dataSchema' ? (known.dataSchema ?? 1) : known[name]
        const actual = name === 'dataSchema' ? (entry.target.dataSchema ?? 1) : entry.target[name]
        return expected === actual
      })
      if (!same) throw new Error(`migration-target-not-catalogued:${entry.key}`)
    }
  }
  for (const name of ['pending.json', 'install-pending.json', 'package-pending.json', 'maintenance-pending.json']) {
    if (existsSync(join(profile, '.guide-manager', name))) throw new Error('another-operation-pending')
  }
  const resultPath = join(profile, '.guide-manager', 'migration-result.json')
  if (existsSync(resultPath) && ['migrating', 'recovery-required'].includes(readJson(resultPath).status)) throw new Error('migration-recovery-required')
  return plan
}

export { validate as validateMigration }

function copySource(entry, sourceRoot) {
  const destination = join(sourceRoot, entry.key)
  for (const [name, hash] of Object.entries(entry.source.files)) {
    const source = join(entry.source.path, ...name.split('/'))
    if (!existsSync(source) || digest(readFileSync(source)) !== hash) throw new Error(`migration-source-changed:${entry.key}:${name}`)
    const target = join(destination, ...name.split('/'))
    mkdirSync(resolve(target, '..'), { recursive: true })
    copyFileSync(source, target)
  }
}

function saveBackup(profile, plan) {
  const id = `${Date.now()}-${plan.id.slice(0, 12)}`
  const directory = migrationTransactionPath(profile, id)
  mkdirSync(join(directory, 'files'), { recursive: true })
  const before = plan.before
  for (const name of PROFILE_FILES) {
    if (before[name] !== null) copyFileSync(join(profile, name), join(directory, 'files', name))
  }
  for (const entry of plan.entries) copySource(entry, join(directory, 'sources'))
  const transaction = { schema: 1, kind: 'migration', id, profile, profileName: plan.profile.name ?? null, installAnchor: plan.profile.installAnchor ?? null,
    planId: plan.id, createdAt: new Date().toISOString(), status: 'prepared', before, entries: plan.entries }
  writeJson(join(directory, 'transaction.json'), transaction)
  return { directory, transaction }
}

function restoreFiles(profile, directory, transaction) {
  for (const name of PROFILE_FILES) {
    const saved = join(directory, 'files', name)
    const target = join(profile, name)
    if (transaction.before[name] === null) {
      if (existsSync(target)) unlinkSync(target)
    } else {
      if (!existsSync(saved) || digest(readFileSync(saved)) !== transaction.before[name]) throw new Error('migration-backup-integrity-mismatch')
      writeFileSync(target, readFileSync(saved))
    }
  }
}

function verifyInstalled(profile, entries, runtime) {
  for (const entry of entries) {
    const manifest = readJson(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json'))
    if (manifest.name !== entry.package || (entry.key === 'manager' ? manifest.dshGuide?.product !== 'dsh-guide-mode' : manifest.version !== entry.source.version)) {
      throw new Error(`migration-restore-mismatch:${entry.key}`)
    }
    if (entry.key !== 'manager') runtime.checkManifest(manifest)
  }
}

async function restoreOriginal(profile, directory, transaction, plan, runtime) {
  restoreFiles(profile, directory, transaction)
  const context = { dir: profile, profile: plan.profile.name, cwd: profile, installAnchor: plan.profile.installAnchor }
  let result = await runtime.run(context, ['install', '--frozen-lockfile', '--config.auto-install-peers=false', '--ignore-scripts'])
  if (result.exitCode === 0 && !result.timedOut) {
    // pnpm may reformat the lockfile; restore the exact pre-operation bytes
    // before comparing the snapshot, as the other cold transactions do.
    restoreFiles(profile, directory, transaction)
    if (fingerprint(profileSnapshot(profile)) === fingerprint(transaction.before)) {
      verifyInstalled(profile, plan.entries, runtime)
      return { mode: 'original-link', restoredSources: [] }
    }
  }
  // The original link path disappeared after the preview. Rebuild runnable old
  // packages in the transaction and point only those links at the snapshot.
  const missing = plan.entries.filter((entry) => !existsSync(entry.source.path))
  if (missing.length === 0) throw new Error(`migration-restore-failed:${result.exitCode ?? 'profile-mismatch'}`)
  restoreFiles(profile, directory, transaction)
  const manifest = readJson(join(profile, 'package.json'))
  const restoredSources = []
  for (const entry of missing) {
    const source = join(directory, 'sources', entry.key)
    const target = join(directory, 'restored-sources', entry.key)
    mkdirSync(target, { recursive: true })
    for (const name of Object.keys(entry.source.files)) {
      const file = join(source, ...name.split('/'))
      const destination = join(target, ...name.split('/'))
      mkdirSync(resolve(destination, '..'), { recursive: true })
      copyFileSync(file, destination)
    }
    manifest.dependencies[entry.package] = `link:${target}`
    restoredSources.push({ key: entry.key, path: target })
  }
  writeJson(join(profile, 'package.json'), manifest)
  runtime.removeImporterEntries({ dir: profile }, missing.map((entry) => entry.package))
  result = await runtime.run(context, ['install', '--config.lockfile=false', '--config.auto-install-peers=false', '--ignore-scripts'])
  if (result.exitCode !== 0 || result.timedOut) throw new Error(`migration-snapshot-repair-failed:${result.exitCode ?? 'unknown'}`)
  for (const entry of missing) {
    const installed = readJson(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json'))
    if (installed.name !== entry.package || installed.version !== entry.source.version) throw new Error(`migration-snapshot-mismatch:${entry.key}`)
  }
  return { mode: 'snapshot-links', restoredSources }
}

export async function recoverMigrationTransaction(profile, transactionId, runtime) {
  const directory = migrationTransactionPath(profile, transactionId)
  const transaction = readMigrationTransaction(profile, transactionId)
  const plan = { profile: { dir: profile, name: transaction.profileName ?? null, installAnchor: transaction.installAnchor ?? null }, entries: transaction.entries }
  return restoreOriginal(profile, directory, transaction, plan, runtime)
}

export async function applyMigration(path, runtime, host = null) {
  const pendingPath = resolve(path)
  const initial = validate(readJson(pendingPath), pendingPath)
  const profile = initial.profile.dir
  return runtime.withLock(join(profile, 'package.json'), async () => {
    const plan = validate(readJson(pendingPath), pendingPath)
    const resultPath = join(profile, '.guide-manager', 'migration-result.json')
    const backup = saveBackup(profile, plan)
    let receipt = { schema: 1, kind: 'migration', planId: plan.id, transactionId: backup.transaction.id, status: 'migrating', startedAt: new Date().toISOString(),
      entries: plan.entries.map(({ key, package: name, source, target, enabled }) => ({ key, package: name, fromVersion: source.version, version: target.version, enabled: enabled !== false, action: 'migrate' })), error: null }
    writeJson(resultPath, receipt)
    const context = { dir: profile, profile: plan.profile.name, cwd: profile, installAnchor: plan.profile.installAnchor }
    try {
      runtime.removeImporterEntries({ dir: profile }, plan.entries.map((entry) => entry.package))
      const result = await runtime.run(context, ['add', ...plan.entries.map((entry) => cacheArtifact(profile, entry.target)), '--save-exact', '--config.auto-install-peers=false', '--ignore-scripts'])
      if (result.exitCode !== 0 || result.timedOut) throw new Error(`migration-package-operation-failed:${result.logPath ?? result.exitCode}`)
      const manifest = readJson(join(profile, 'package.json'))
      const beforeManifest = readJson(join(backup.directory, 'files', 'package.json'))
      const migrated = new Set(plan.entries.map((entry) => entry.package))
      const unrelated = (doc) => ({ ...doc, dependencies: Object.fromEntries(Object.entries(doc.dependencies ?? {}).filter(([name]) => !migrated.has(name))) })
      if (fingerprint(unrelated(manifest)) !== fingerprint(unrelated(beforeManifest))) throw new Error('unrelated-migration-profile-change')
      for (const entry of plan.entries) {
        const spec = manifest.dependencies?.[entry.package]
        if (!spec?.startsWith('file:') || resolve(profile, spec.slice(5)) !== cachePath(profile, entry.target.sha256)) throw new Error(`migration-not-pinned:${entry.key}`)
        const installed = readJson(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json'))
        if (installed.name !== entry.package || installed.version !== entry.target.version) throw new Error(`migration-version-mismatch:${entry.key}`)
        if (entry.key === 'manager') {
          if (installed.dshGuide?.product !== 'dsh-guide-mode' || (installed.dshGuide?.controlSchema ?? 1) !== 1) throw new Error('migration-manager-contract-mismatch')
        } else {
          if (installed.dshGuide?.contract !== entry.target.contract || (installed.dshGuide?.dataSchema ?? 1) !== 1) throw new Error(`migration-contract-mismatch:${entry.key}`)
          runtime.checkManifest(installed)
        }
        if (!manifest.dsh?.profile?.bundles?.includes(entry.package)) throw new Error(`migration-bundle-missing:${entry.key}`)
      }
      const componentEntries = plan.entries.filter((entry) => entry.key !== 'manager')
      if (componentEntries.length > 0) {
        runtime.checkPeerGraph({ ...plan, entries: componentEntries })
        runtime.checkHost({ ...plan, entries: componentEntries })
        runtime.checkConfiguration({ ...plan, entries: componentEntries })
      }
      if (profileSnapshot(profile)['cordis.patch.yml'] !== backup.transaction.before['cordis.patch.yml']
        || profileSnapshot(profile)['pnpm-workspace.yaml'] !== backup.transaction.before['pnpm-workspace.yaml']) throw new Error('migration-config-changed')
      receipt = { ...receipt, status: 'migrated-awaiting-restart', finishedAt: new Date().toISOString(), after: profileSnapshot(profile) }
      backup.transaction.status = receipt.status
      backup.transaction.after = receipt.after
      writeJson(join(backup.directory, 'transaction.json'), backup.transaction)
      writeJson(resultPath, receipt)
      unlinkSync(pendingPath)
      return receipt
    } catch (error) {
      let recovery = null
      try { recovery = await restoreOriginal(profile, backup.directory, backup.transaction, plan, runtime) }
      catch (restoreError) { recovery = { mode: 'failed', error: String(restoreError.message ?? restoreError) } }
      const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
      receipt = { ...receipt, status: recovery?.mode === 'failed' ? 'recovery-required' : 'failed-restored', finishedAt: new Date().toISOString(),
        error: String(error.message ?? error), recoveryError: recovery?.mode === 'failed' ? recovery.error : null, recovery: recovery?.mode ?? null, restoredSources: recovery?.restoredSources ?? [],
        recoveryCommand: `& ${quote(powershell)} -NoProfile -ExecutionPolicy Bypass -File ${quote(join(controllerRoot, 'helper', 'restart-guide-manager.ps1'))} -Profile ${quote(profile)} -RecoverMigration -TransactionId ${quote(backup.transaction.id)}` }
      backup.transaction.status = receipt.status
      backup.transaction.error = receipt.error
      writeJson(join(backup.directory, 'transaction.json'), backup.transaction)
      writeJson(resultPath, receipt)
      return receipt
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const receipt = await applyMigration(process.argv[2], await officialRuntime())
    console.log(JSON.stringify(receipt))
    if (receipt.status !== 'migrated-awaiting-restart') process.exitCode = receipt.status === 'recovery-required' ? 3 : 1
  } catch (error) { console.error(String(error.message ?? error)); process.exitCode = 1 }
}

/** Runs from a durable controller copy, outside the package being replaced. */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { artifactInventory, packageInventory } from '../artifacts.js'
import { cacheArtifact, cachePath, digest, fingerprint, PROFILE_FILES, profileSnapshot, readJson, writeJson } from '../install.js'
import { assertMaintenanceIdle, createMaintenancePlan, createManagerRestorePlan, maintenanceTransactionPath, readMaintenanceTransaction, stageMaintenance, verifyControl } from '../maintenance.js'
import { officialRuntime } from './apply-install.mjs'

const controllerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function validateMaintenance(plan, pendingPath, root = controllerRoot) {
  if (plan?.schema !== 1 || plan.status !== 'pending-restart' || resolve(pendingPath) !== join(resolve(plan.profile.dir), '.guide-manager', 'maintenance-pending.json')) throw new Error('invalid-maintenance-plan')
  const { id, status, createdAt, ...body } = plan
  if (id !== fingerprint(body) || plan.blockers?.length !== 0) throw new Error('invalid-maintenance-fingerprint')
  assertMaintenanceIdle(plan.profile.dir, 'maintenance-pending.json')
  if (fingerprint(profileSnapshot(plan.profile.dir)) !== fingerprint(plan.before)) throw new Error('stale-maintenance-profile')
  verifyControl(plan.profile.dir, plan.controllerHash)
  const state = { profile: plan.profile, components: plan.entries.map((entry) => ({ key: entry.key, enabled: entry.enabled })), host: { dsh: { match: true }, cordis: { match: true } } }
  const fresh = createMaintenancePlan(state, { kind: plan.kind, components: plan.components, version: plan.target?.version, transactionId: plan.transactionId }, root, plan.managerCatalogPath, readJson(join(root, 'package.json')).dshGuide.host)
  if (fresh.id !== id) throw new Error('stale-maintenance-plan')
  return plan
}

function backup(plan) {
  const profile = plan.profile.dir
  const transactionId = `${Date.now()}-${plan.id.slice(0, 12)}`
  const root = maintenanceTransactionPath(profile, transactionId)
  mkdirSync(join(root, 'files'), { recursive: true })
  for (const name of PROFILE_FILES) if (plan.before[name] !== null) copyFileSync(join(profile, name), join(root, 'files', name))
  let currentSourceError = null
  let entries = plan.entries
  if (plan.kind === 'manager-restore') {
    try { entries = [readCurrentManager(profile)] }
    catch (error) {
      // Recovery must remain possible when the failed new manager/cache is gone.
      // If restoring the old manager also fails, keep the Host stopped.
      entries = []
      currentSourceError = String(error.message ?? error)
    }
  }
  for (const entry of entries) {
    if (digest(readFileSync(entry.file)) !== entry.sha256) throw new Error('maintenance-source-changed')
    copyFileSync(entry.file, join(root, `${entry.key}.tgz`))
  }
  const transaction = { ...plan, transactionId, entries, currentSourceError, status: 'prepared' }
  writeJson(join(root, 'transaction.json'), transaction)
  return { root, transaction }
}

function readCurrentManager(profile) {
  const spec = readJson(join(profile, 'package.json')).dependencies['@local/dsh-guide-manager']
  const file = resolve(profile, spec.slice(5))
  const sha256 = digest(readFileSync(file))
  const { manifest, files } = artifactInventory(file, sha256)
  return { key: 'manager', package: manifest.name, version: manifest.version, spec, file, sha256, files }
}

function restoreFiles(profile, saved) {
  for (const name of PROFILE_FILES) {
    const path = join(profile, name)
    if (saved.transaction.before[name] === null) { if (existsSync(path)) unlinkSync(path) }
    else {
      const bytes = readFileSync(join(saved.root, 'files', name))
      if (digest(bytes) !== saved.transaction.before[name]) throw new Error('backup-file-corrupt')
      writeFileSync(path, bytes)
    }
  }
  for (const entry of saved.transaction.entries) cacheArtifact(profile, { ...entry, file: join(saved.root, `${entry.key}.tgz`) })
}

const verify = (profile, entries) => {
  for (const entry of entries) if (fingerprint(packageInventory(profile, entry)) !== fingerprint(entry.files)) throw new Error(`package-files-damaged:${entry.key}`)
}

function quarantinePackages(profile, entries, backupRoot) {
  const modules = resolve(profile, 'node_modules')
  const paths = entries.map((entry) => {
    const path = join(modules, ...entry.package.split('/'))
    // Move only code owned by this profile. Never move an external linked source/store.
    if (!existsSync(path)) return null
    const actual = realpathSync(path)
    const within = relative(modules, actual)
    if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error(`repair-package-outside-profile:${entry.key}`)
    return { key: entry.key, path, actual, linked: lstatSync(path).isSymbolicLink() }
  }).filter(Boolean)
  mkdirSync(join(backupRoot, 'quarantined-packages'), { recursive: true })
  for (const item of paths) {
    if (item.linked) renameSync(item.path, join(backupRoot, 'quarantined-packages', `${item.key}.link`))
    renameSync(item.actual, join(backupRoot, 'quarantined-packages', item.key))
  }
}

export async function applyMaintenance(path, runtime, root = controllerRoot) {
  const pendingPath = resolve(path)
  const initial = validateMaintenance(readJson(pendingPath), pendingPath, root)
  const profile = initial.profile.dir
  return runtime.withLock(join(profile, 'package.json'), async () => {
    const plan = validateMaintenance(readJson(pendingPath), pendingPath, root)
    const saved = backup(plan)
    const resultPath = join(profile, '.guide-manager', 'maintenance-result.json')
    let receipt = { schema: 1, kind: plan.kind, planId: plan.id, transactionId: saved.transaction.transactionId, controllerHash: plan.controllerHash,
      status: 'applying', startedAt: new Date().toISOString(), entries: plan.entries.map(({ key, version, enabled }) => ({ key, version, enabled })), error: null }
    writeJson(resultPath, receipt)
    const context = { dir: profile, profile: plan.profile.name, cwd: profile, installAnchor: plan.profile.installAnchor }
    const run = async (args) => {
      const result = await runtime.run(context, [...args, '--config.auto-install-peers=false', '--config.ignore-scripts=true'])
      if (result.exitCode !== 0 || result.timedOut) throw new Error(`maintenance-pnpm-failed:${result.logPath ?? result.exitCode}`)
    }
    try {
      if (plan.kind === 'uninstall') {
        // Deselect bundles before pnpm removes their patch files.
        const manifest = readJson(join(profile, 'package.json'))
        manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((name) => !plan.entries.some((entry) => entry.package === name))
        await runtime.saveManifest(profile, manifest)
        runtime.removeConfiguration(plan)
        if (plan.nativeDriverRestored) await runtime.writePluginEnabled({ ...plan.profile, patchPath: join(profile, 'cordis.patch.yml') }, 'goal-round-driver', '@deepseek-ai/dsh-goal-round-driver', true)
        await run(['remove', ...plan.entries.map((entry) => entry.package)])
        runtime.checkRemoved(plan)
      } else if (plan.kind === 'repair') {
        // pnpm --force can report "already up to date" when only index.js is
        // missing. Quarantine the bounded installed package before re-importing.
        // Keep it as evidence; do not recursively delete user or shared-store paths.
        quarantinePackages(profile, plan.entries, saved.root)
        await run(['add', ...plan.entries.map((entry) => cacheArtifact(profile, entry)), '--save-exact', '--force'])
        verify(profile, plan.entries)
        if (fingerprint(profileSnapshot(profile)) !== fingerprint(plan.before)) throw new Error('repair-changed-profile-configuration')
        runtime.checkHost(plan)
        const entries = runtime.enabledEntries(plan)
        runtime.checkConfiguration({ ...plan, entries })
        receipt.entries = entries.map(({ key, version, enabled }) => ({ key, version, enabled }))
      } else {
        let target = plan.target
        if (plan.kind === 'manager-restore') {
          const previous = readMaintenanceTransaction(profile, plan.transactionId)
          restoreFiles(profile, previous)
          target = { ...previous.transaction.entries[0], file: join(previous.root, 'manager.tgz') }
        }
        await run(['add', cacheArtifact(profile, target), '--save-exact'])
        verify(profile, [target])
        runtime.checkManifest(readJson(join(profile, 'node_modules', ...target.package.split('/'), 'package.json')))
        receipt.entries = [{ key: 'manager', version: target.version, enabled: true }]
      }
      // A package operation may change only its dependencies, bundle selection and owned patches.
      const beforeManifest = readJson(join(saved.root, 'files', 'package.json'))
      const actual = readJson(join(profile, 'package.json'))
      const allowed = new Set(plan.entries.map((entry) => entry.package))
      const unrelated = (doc) => ({ ...doc, dependencies: Object.fromEntries(Object.entries(doc.dependencies ?? {}).filter(([name]) => !allowed.has(name))),
        dsh: { ...doc.dsh, profile: { ...doc.dsh?.profile, bundles: (doc.dsh?.profile?.bundles ?? []).filter((name) => !allowed.has(name)) } } })
      if (fingerprint(unrelated(actual)) !== fingerprint(unrelated(beforeManifest))) throw new Error('unrelated-maintenance-manifest-change')
      if (profileSnapshot(profile)['pnpm-workspace.yaml'] !== plan.before['pnpm-workspace.yaml']) throw new Error('unrelated-maintenance-workspace-change')
      if (plan.kind.startsWith('manager-') && profileSnapshot(profile)['cordis.patch.yml'] !== plan.before['cordis.patch.yml']) throw new Error('unrelated-manager-patch-change')
      receipt = { ...receipt, status: `${plan.kind}-awaiting-restart`, finishedAt: new Date().toISOString() }
      writeJson(join(saved.root, 'transaction.json'), { ...saved.transaction, status: receipt.status, after: profileSnapshot(profile) })
      if (plan.kind === 'manager-restore') {
        const old = readMaintenanceTransaction(profile, plan.transactionId)
        writeJson(join(old.root, 'transaction.json'), { ...old.transaction, restoredAt: receipt.finishedAt })
      }
      writeJson(resultPath, receipt)
      unlinkSync(pendingPath)
      return receipt
    } catch (error) {
      let recoveryError = null
      try {
        restoreFiles(profile, saved)
        if (plan.kind.startsWith('manager-')) await run(['add', cachePath(profile, saved.transaction.entries[0].sha256), '--save-exact'])
        else await run(['install', '--frozen-lockfile', '--force'])
        verify(profile, saved.transaction.entries)
        if (!plan.kind.startsWith('manager-') && fingerprint(profileSnapshot(profile)) !== fingerprint(plan.before)) throw new Error('maintenance-recovery-profile-mismatch')
      } catch (failure) { recoveryError = String(failure.message ?? failure) }
      receipt = { ...receipt, status: recoveryError ? 'recovery-required' : 'failed-restored', finishedAt: new Date().toISOString(), error: String(error.message ?? error), recoveryError }
      writeJson(resultPath, receipt)
      writeJson(join(saved.root, 'transaction.json'), { ...saved.transaction, status: receipt.status, error: receipt.error })
      return receipt
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--prepare-component-repair') {
      const profile = resolve(process.argv[3])
      if (dirname(dirname(profile)) === profile || dirname(profile).split(/[\\/]/).at(-1) !== 'profiles') throw new Error('invalid-repair-profile')
      const state = { profile: { dir: profile, name: profile.split(/[\\/]/).at(-1), installAnchor: join(dirname(process.execPath), 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json') },
        components: [], host: { dsh: { match: true }, cordis: { match: true } } }
      const plan = createMaintenancePlan(state, { kind: 'repair', components: (process.argv[4] ?? '').split(',') }, controllerRoot, null, readJson(join(controllerRoot, 'package.json')).dshGuide.host)
      stageMaintenance(plan, plan.id, controllerRoot)
      console.log(JSON.stringify({ status: 'component-repair-prepared', components: plan.components }))
    } else if (process.argv[2] === '--prepare-manager-recovery') {
      const profile = resolve(process.argv[3])
      const id = process.argv[4] || readdirSync(join(profile, '.guide-manager', 'maintenance-transactions')).filter((name) => /^\d{13}-[a-f0-9]{12}$/.test(name)).sort().reverse().find((name) => {
        const { transaction } = readMaintenanceTransaction(profile, name)
        return transaction.kind === 'manager-upgrade' && transaction.status === 'manager-upgrade-awaiting-restart' && !transaction.restoredAt
      })
      const previous = readMaintenanceTransaction(profile, id)
      const plan = createManagerRestorePlan(previous.transaction.profile, id, controllerRoot)
      stageMaintenance(plan, plan.id, controllerRoot)
      console.log(JSON.stringify({ status: 'recovery-prepared', transactionId: id }))
    } else {
      const receipt = await applyMaintenance(process.argv[2], await officialRuntime())
      console.log(JSON.stringify(receipt))
      if (!receipt.status.endsWith('-awaiting-restart')) process.exitCode = receipt.status === 'recovery-required' ? 3 : 1
    }
  } catch (error) { console.error(String(error.message ?? error)); process.exitCode = 1 }
}

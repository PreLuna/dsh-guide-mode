/** Cold, profile-locked package upgrade and exact lockfile recovery. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cacheArtifact, cachePath, digest, fingerprint, PROFILE_FILES, profileSnapshot, readJson, writeJson } from '../install.js'
import { createRestorePlan, installedPackageHashes, readTransaction, readUpgradeCatalog, transactionPath } from '../upgrade.js'
import { officialRuntime } from './apply-install.mjs'

function validate(plan, path) {
  if (plan?.schema !== 1 || !['package-upgrade', 'package-restore'].includes(plan.kind) || plan.status !== 'pending-restart'
    || resolve(path) !== join(resolve(plan.profile.dir), '.guide-manager', 'package-pending.json')) throw new Error('invalid-package-plan')
  const { id, status, createdAt, ...body } = plan
  if (id !== fingerprint(body) || plan.blockers?.length !== 0 || !Array.isArray(plan.entries) || !plan.entries.length) throw new Error('invalid-package-plan-fingerprint')
  const profile = plan.profile.dir
  if (fingerprint(profileSnapshot(profile)) !== fingerprint(plan.before) || fingerprint(installedPackageHashes(profile, plan.entries)) !== fingerprint(plan.packageHashes)) throw new Error('stale-package-profile')
  for (const name of ['pending.json', 'install-pending.json', 'maintenance-pending.json']) if (existsSync(join(profile, '.guide-manager', name))) throw new Error('another-operation-pending')
  const resultPath = join(profile, '.guide-manager', 'package-result.json')
  if (existsSync(resultPath) && readJson(resultPath).status === 'recovery-required') throw new Error('package-recovery-required')
  if (plan.kind === 'package-restore') {
    if (createRestorePlan({ profile: plan.profile }, plan.transactionId).id !== plan.id) throw new Error('stale-restoration-plan')
  } else {
    const release = readUpgradeCatalog(plan.catalogPath)
    if (release.hash !== plan.catalogHash) throw new Error('stale-upgrade-catalog')
    const combo = release.catalog.combinations.find((item) => item.id === plan.combination)
    const manifest = readJson(join(profile, 'package.json'))
    const keys = new Set()
    for (const entry of plan.entries) {
      const source = release.catalog.artifacts.find((item) => item.key === entry.key && item.version === entry.version)
      if (keys.has(entry.key) || combo?.versions[entry.key] !== entry.version || !source || ['package', 'version', 'contract', 'dataSchema', 'file', 'sha256'].some((key) => entry[key] !== source[key])) throw new Error('invalid-upgrade-source')
      keys.add(entry.key)
      if (manifest.dependencies?.[entry.package] !== entry.previous.spec || resolve(profile, entry.previous.spec.slice(5)) !== cachePath(profile, entry.previous.sha256)
        || digest(readFileSync(entry.previous.file)) !== entry.previous.sha256) throw new Error('previous-package-not-pinned')
      const actual = readJson(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json'))
      if (actual.version !== entry.previous.version || (actual.dshGuide?.dataSchema ?? 1) !== 1) throw new Error('previous-package-version-or-schema-mismatch')
    }
  }
  return plan
}

function saveBackup(profile, plan, previousEntries) {
  const id = `${Date.now()}-${plan.id.slice(0, 12)}`
  const directory = transactionPath(profile, id)
  mkdirSync(join(directory, 'files'), { recursive: true })
  mkdirSync(join(directory, 'artifacts'))
  const before = profileSnapshot(profile)
  for (const name of PROFILE_FILES) if (before[name] !== null) copyFileSync(join(profile, name), join(directory, 'files', name))
  for (const entry of previousEntries) {
    if (digest(readFileSync(entry.previous.file)) !== entry.previous.sha256) throw new Error('backup-package-integrity-mismatch')
    copyFileSync(entry.previous.file, join(directory, 'artifacts', `${entry.key}-${entry.previous.sha256}.tgz`))
  }
  const transaction = { schema: 1, id, kind: plan.kind, profile, createdAt: new Date().toISOString(), status: 'prepared', before, entries: previousEntries, planId: plan.id }
  writeJson(join(directory, 'transaction.json'), transaction)
  return { directory, transaction }
}

function restoreFiles(profile, directory, transaction) {
  for (const name of PROFILE_FILES) {
    const saved = join(directory, 'files', name)
    const target = join(profile, name)
    if (transaction.before[name] === null) { if (existsSync(target)) unlinkSync(target) }
    else {
      if (digest(readFileSync(saved)) !== transaction.before[name]) throw new Error('backup-file-integrity-mismatch')
      writeFileSync(target, readFileSync(saved))
    }
  }
  for (const entry of transaction.entries) {
    const previous = entry.previous
    const saved = join(directory, 'artifacts', `${entry.key}-${previous.sha256}.tgz`)
    if (digest(readFileSync(saved)) !== previous.sha256) throw new Error('backup-artifact-integrity-mismatch')
    const target = cachePath(profile, previous.sha256)
    mkdirSync(resolve(target, '..'), { recursive: true })
    copyFileSync(saved, target)
  }
}

function verifyVersions(profile, entries, runtime) {
  for (const entry of entries) {
    const manifest = readJson(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json'))
    if (manifest.name !== entry.package || manifest.version !== entry.version || manifest.dshGuide?.contract !== entry.contract || (manifest.dshGuide?.dataSchema ?? 1) !== 1) throw new Error(`package-version-or-schema-mismatch:${entry.key}`)
    runtime.checkManifest(manifest)
  }
  runtime.checkPeerGraph({ profile: { dir: profile }, entries })
}

export async function applyPackage(path, runtime) {
  const pendingPath = resolve(path)
  const initial = validate(readJson(pendingPath), pendingPath)
  const profile = initial.profile.dir
  return runtime.withLock(join(profile, 'package.json'), async () => {
    const plan = validate(readJson(pendingPath), pendingPath)
    const resultPath = join(profile, '.guide-manager', 'package-result.json')
    const restoreTarget = plan.kind === 'package-restore' ? readTransaction(profile, plan.transactionId) : null
    const beforeEntries = restoreTarget ? restoreTarget.entries.map((entry) => ({ ...entry, previous: { version: entry.version, file: cachePath(profile, entry.sha256), sha256: entry.sha256,
      spec: readJson(join(profile, 'package.json')).dependencies[entry.package], contract: entry.contract, enabled: entry.enabled } })) : plan.entries
    const backup = saveBackup(profile, plan, beforeEntries)
    let receipt = { schema: 1, kind: plan.kind, planId: plan.id, transactionId: backup.transaction.id, status: restoreTarget ? 'restoring' : 'upgrading', startedAt: new Date().toISOString(),
      entries: plan.entries.map(({ key, version, contract, enabled }) => ({ key, version, contract, enabled })), error: null }
    writeJson(resultPath, receipt)
    const context = { dir: profile, profile: plan.profile.name, cwd: profile, installAnchor: plan.profile.installAnchor }
    try {
      let result
      if (restoreTarget) {
        restoreFiles(profile, transactionPath(profile, plan.transactionId), restoreTarget)
        result = await runtime.run(context, ['install', '--frozen-lockfile', '--config.auto-install-peers=false', '--ignore-scripts'])
      } else {
        const changed = plan.entries.filter((entry) => entry.action === 'upgrade')
        if (!changed.length) throw new Error('nothing-to-upgrade')
        result = await runtime.run(context, ['add', ...changed.map((entry) => cacheArtifact(profile, entry)), '--save-exact', '--config.auto-install-peers=false', '--ignore-scripts'])
        const beforeManifest = readJson(join(backup.directory, 'files', 'package.json'))
        const actual = readJson(join(profile, 'package.json'))
        const allowed = new Set(changed.map((entry) => entry.package))
        const unrelated = (doc) => ({ ...doc, dependencies: Object.fromEntries(Object.entries(doc.dependencies ?? {}).filter(([name]) => !allowed.has(name))) })
        if (fingerprint(unrelated(beforeManifest)) !== fingerprint(unrelated(actual))) throw new Error('unrelated-upgrade-profile-change')
        for (const name of PROFILE_FILES.filter((file) => !['package.json', 'pnpm-lock.yaml'].includes(file))) if (profileSnapshot(profile)[name] !== backup.transaction.before[name]) throw new Error('unrelated-upgrade-config-change')
      }
      if (result.exitCode !== 0 || result.timedOut) throw new Error(`package-operation-failed:${result.logPath ?? result.exitCode}`)
      verifyVersions(profile, plan.entries, runtime)
      runtime.checkHost(plan)
      runtime.checkConfiguration(plan)
      if (restoreTarget && fingerprint(profileSnapshot(profile)) !== fingerprint(restoreTarget.before)) throw new Error('restored-profile-does-not-match-snapshot')
      const status = restoreTarget ? 'restored-awaiting-restart' : 'upgraded-awaiting-restart'
      receipt = { ...receipt, status, finishedAt: new Date().toISOString() }
      backup.transaction.status = status
      backup.transaction.after = profileSnapshot(profile)
      writeJson(join(backup.directory, 'transaction.json'), backup.transaction)
      if (restoreTarget) writeJson(join(transactionPath(profile, plan.transactionId), 'transaction.json'), { ...restoreTarget, restoredAt: receipt.finishedAt })
      writeJson(resultPath, receipt)
      unlinkSync(pendingPath)
      return receipt
    } catch (error) {
      let recoveryError = null
      try {
        restoreFiles(profile, backup.directory, backup.transaction)
        const repaired = await runtime.run(context, ['install', '--frozen-lockfile', '--config.auto-install-peers=false', '--ignore-scripts'])
        if (repaired.exitCode !== 0 || repaired.timedOut) throw new Error(`package-repair-failed:${repaired.logPath ?? repaired.exitCode}`)
        verifyVersions(profile, beforeEntries.map((entry) => ({ ...entry, version: entry.previous.version, contract: entry.previous.contract })), runtime)
        if (fingerprint(profileSnapshot(profile)) !== fingerprint(backup.transaction.before)) throw new Error('package-repair-profile-mismatch')
      } catch (failure) { recoveryError = String(failure.message ?? failure) }
      receipt = { ...receipt, status: recoveryError ? 'recovery-required' : 'failed-restored', finishedAt: new Date().toISOString(), error: String(error.message ?? error), recoveryError }
      writeJson(resultPath, receipt)
      writeJson(join(backup.directory, 'transaction.json'), { ...backup.transaction, status: receipt.status, error: receipt.error })
      return receipt
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const receipt = await applyPackage(process.argv[2], await officialRuntime())
    console.log(JSON.stringify(receipt))
    if (!['upgraded-awaiting-restart', 'restored-awaiting-restart'].includes(receipt.status)) process.exitCode = receipt.status === 'recovery-required' ? 3 : 1
  } catch (error) { console.error(String(error.message ?? error)); process.exitCode = 1 }
}

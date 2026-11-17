/** Explicit hard-interrupt recovery. Run with DSH stopped; never runs inside the failed Host. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cachePath, digest, PROFILE_FILES, readJson, writeJson } from '../install.js'
import { readTransaction } from '../upgrade.js'
import { readMaintenanceTransaction } from '../maintenance.js'
import { officialRuntime } from './apply-install.mjs'
import { diagnoseRecovery } from '../recovery.js'

const ROOT = '.guide-manager'
const RESULT = join(ROOT, 'hard-interrupt-result.json')
const read = (path) => readJson(path)
const exists = (path) => existsSync(path)

function restoreFour(profile, directory, expected, subdirectory = 'files') {
  for (const name of PROFILE_FILES) {
    if (expected[name] === null) {
      if (existsSync(join(profile, name))) unlinkSync(join(profile, name))
      continue
    }
    const source = join(directory, subdirectory, name)
    const bytes = readFileSync(source)
    if (digest(bytes) !== expected[name]) throw new Error(`recovery-backup-file-integrity-mismatch:${name}`)
    writeFileSync(join(profile, name), bytes)
  }
}

function restoreInstallBackup(profile, backupId) {
  const directory = join(profile, ROOT, 'install-backups', backupId)
  const snapshot = read(join(directory, 'snapshot.json'))
  if (!snapshot || typeof snapshot !== 'object') throw new Error('recovery-install-snapshot-missing')
  restoreFour(profile, directory, snapshot, '')
  return { before: snapshot, entries: [] }
}

function restoreTransactionFiles(profile, directory, transaction) {
  restoreFour(profile, directory, transaction.before)
  for (const entry of transaction.entries) {
    if (transaction.kind.startsWith('package') && entry.previous) {
      const sha256 = entry.previous.sha256
      const source = join(directory, 'artifacts', `${entry.key}-${sha256}.tgz`)
      if (digest(readFileSync(source)) !== sha256) throw new Error(`recovery-package-integrity-mismatch:${entry.key}`)
      const target = cachePath(profile, sha256)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(source, target)
    } else {
      const source = join(directory, `${entry.key}.tgz`)
      if (digest(readFileSync(source)) !== entry.sha256) throw new Error(`recovery-maintenance-integrity-mismatch:${entry.key}`)
      const target = cachePath(profile, entry.sha256)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(source, target)
    }
  }
}

async function installGraph(profile, runtime, installAnchor) {
  const context = { dir: profile, profile: basename(profile), cwd: profile, installAnchor }
  const lock = join(profile, 'pnpm-lock.yaml')
  const args = existsSync(lock) ? ['install', '--frozen-lockfile', '--config.auto-install-peers=false', '--ignore-scripts'] : ['install', '--config.lockfile=false', '--config.auto-install-peers=false', '--ignore-scripts']
  const result = await runtime.run(context, args)
  if (result.exitCode !== 0 || result.timedOut) throw new Error(`recovery-pnpm-failed:${result.logPath ?? result.exitCode}`)
}

function verifyEntries(profile, entries) {
  for (const entry of entries) {
    const manifest = read(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json'))
    if (manifest.version !== entry.version) throw new Error(`recovery-installed-version-mismatch:${entry.key}`)
  }
  for (const entry of read(join(profile, 'package.json')).dependencies ? Object.values(read(join(profile, 'package.json')).dependencies) : []) {
    if (typeof entry === 'string' && entry.startsWith('file:') && entry.includes('.guide-manager/package-cache/')) {
      const file = resolve(profile, entry.slice(5))
      const expected = basename(file).replace(/\.tgz$/, '')
      if (digest(readFileSync(file)) !== expected) throw new Error('recovery-cache-integrity-mismatch')
    }
  }
}

function removeMatchingPending(profile, kind, transaction) {
  const names = { install: ['install-pending.json'], package: ['package-pending.json'], maintenance: ['maintenance-pending.json'] }[kind] ?? []
  for (const name of names) {
    const path = join(profile, ROOT, name)
    if (!existsSync(path)) continue
    const pending = read(path)
    const expected = transaction?.planId ?? transaction?.id
    if (!expected || pending?.planId === expected || pending?.id === expected) unlinkSync(path)
  }
}

function updateReceipt(profile, kind, transactionId, status, error = null) {
  const path = join(profile, ROOT, `${kind}-result.json`)
  if (!existsSync(path)) return
  const receipt = read(path)
  writeJson(path, { ...receipt, status, transactionId: transactionId ?? receipt.transactionId, recovery: 'hard-interrupt', recoveredAt: new Date().toISOString(), recoveryError: error })
}

function requireInterrupted(profile, kind, statuses) {
  const receipt = read(join(profile, ROOT, `${kind}-result.json`))
  if (!receipt || !statuses.includes(receipt.status)) throw new Error(`recovery-${kind}-not-interrupted`)
  return receipt
}

async function recoverInstall(profile, runtime, id) {
  requireInterrupted(profile, 'install', ['installing', 'recovery-required', 'invalid'])
  const backups = existsSync(join(profile, ROOT, 'install-backups')) ? readdirSync(join(profile, ROOT, 'install-backups')) : []
  const backupId = id || backups.sort().reverse().find((name) => existsSync(join(profile, ROOT, 'install-backups', name, 'snapshot.json')))
  if (!backupId) throw new Error('recovery-install-backup-missing')
  const { before } = restoreInstallBackup(profile, backupId)
  await installGraph(profile, runtime, resolve(dirname(process.execPath), 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json'))
  // pnpm may rewrite the lockfile; keep the exact pre-interruption bytes.
  for (const name of PROFILE_FILES) {
    if (before[name] === null) { if (existsSync(join(profile, name))) unlinkSync(join(profile, name)) }
    else writeFileSync(join(profile, name), readFileSync(join(profile, ROOT, 'install-backups', backupId, name)))
  }
  const transaction = { planId: null }
  removeMatchingPending(profile, 'install', transaction)
  updateReceipt(profile, 'install', null, 'failed-restored')
  return { kind: 'install-restore', backupId, transactionId: null }
}

function readPackageBackup(profile, id) {
  try { return readTransaction(profile, id) } catch (error) {
    const raw = read(join(profile, ROOT, 'package-transactions', id, 'transaction.json'))
    if (raw?.schema !== 1 || raw.kind !== 'package-restore' || raw.profile !== profile || !Array.isArray(raw.entries)) throw error
    return raw
  }
}

async function recoverPackageOrMaintenance(profile, runtime, kind, id) {
  if (!/^\d{13}-[a-f0-9]{12}$/.test(id ?? '')) throw new Error(`recovery-${kind}-transaction-required`)
  const receipt = kind === 'maintenance'
    ? requireInterrupted(profile, 'maintenance', ['applying', 'recovery-required', 'invalid'])
    : requireInterrupted(profile, 'package', ['upgrading', 'restoring', 'recovery-required', 'invalid'])
  if (receipt.transactionId && receipt.transactionId !== id) throw new Error(`recovery-${kind}-transaction-mismatch`)
  const directory = join(profile, ROOT, kind === 'maintenance' ? 'maintenance-transactions' : 'package-transactions', id)
  const transaction = kind === 'maintenance' ? readMaintenanceTransaction(profile, id).transaction : readPackageBackup(profile, id)
  restoreTransactionFiles(profile, directory, transaction)
  await installGraph(profile, runtime, resolve(dirname(process.execPath), 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json'))
  // Keep the exact restored four files even if pnpm touched formatting/lock metadata.
  restoreFour(profile, directory, transaction.before)
  verifyEntries(profile, transaction.entries.map((entry) => ({ ...entry, version: entry.previous?.version ?? entry.version })))
  removeMatchingPending(profile, kind, transaction)
  updateReceipt(profile, kind, id, 'failed-restored')
  return { kind: kind === 'maintenance' ? 'maintenance-restore' : 'package-restore', transactionId: id }
}

export async function recoverHardInterrupt(profile, action, id, runtime) {
  if (!isAbsolute(profile)) throw new Error('recovery-profile-required')
  if (!['install-restore', 'package-restore', 'maintenance-restore', 'manager-restore', 'migration-recover'].includes(action)) throw new Error('recovery-action-unavailable')
  if (action === 'migration-recover') throw new Error('use-recover-migration.mjs')
  const result = await runtime.withLock(join(profile, 'package.json'), async () => {
    if (action === 'install-restore') return recoverInstall(profile, runtime, id)
    if (action === 'package-restore') return recoverPackageOrMaintenance(profile, runtime, 'package', id)
    return recoverPackageOrMaintenance(profile, runtime, 'maintenance', id)
  })
  const receipt = { schema: 1, status: 'restored-awaiting-restart', ...result, finishedAt: new Date().toISOString() }
  writeJson(join(profile, RESULT), receipt)
  return receipt
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    let profile = null, action = null, id = null
    for (let index = 0; index < args.length; index++) {
      const name = args[index]
      if (['--profile', '--action', '--id'].includes(name)) {
        if (!args[index + 1]) throw new Error(`missing-${name.slice(2)}`)
        if (name === '--profile') profile = resolve(args[++index])
        else if (name === '--action') action = args[++index]
        else id = args[++index]
      } else throw new Error('usage: recover-hard-interrupt.mjs --profile <dir> [--action <action> --id <id>]')
    }
    if (!profile) throw new Error('recovery-profile-required')
    if (!action) {
      console.log(JSON.stringify(diagnoseRecovery({ dir: profile }), null, 2))
    } else {
      console.log(JSON.stringify(await recoverHardInterrupt(profile, action, id, await officialRuntime()), null, 2))
    }
  } catch (error) {
    console.error(String(error.message ?? error))
    process.exitCode = 1
  }
}

/** Read-only diagnosis of interrupted manager transactions. Recovery is explicit. */
import { existsSync, readdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { readJson } from './install.js'

const ROOT = '.guide-manager'
const TRANSACTIONS = { package: 'package-transactions', maintenance: 'maintenance-transactions', migration: 'migration-transactions' }
const INSTALL_BACKUP = 'install-backups'
const PENDING = ['pending.json', 'install-pending.json', 'package-pending.json', 'maintenance-pending.json', 'migration-pending.json']

const read = (path) => { try { return existsSync(path) ? readJson(path) : null } catch (error) { return { status: 'invalid', error: String(error.message ?? error) } } }
const idOf = (name) => /^\d{13}-[a-f0-9]{12}$/.test(name ?? '')

function transactions(profile, kind) {
  const directory = join(profile.dir, ROOT, TRANSACTIONS[kind])
  if (!existsSync(directory)) return []
  return readdirSync(directory).filter(idOf).sort().reverse().map((id) => {
    const raw = read(join(directory, id, 'transaction.json'))
    return { kind, id, status: raw?.status ?? 'invalid', transaction: raw }
  })
}

function installBackups(profile) {
  const directory = join(profile.dir, ROOT, INSTALL_BACKUP)
  if (!existsSync(directory)) return []
  return readdirSync(directory).sort().reverse().map((id) => {
    const snapshot = read(join(directory, id, 'snapshot.json'))
    return { id, status: snapshot ? 'available' : 'invalid', snapshot }
  })
}

export function diagnoseRecovery(profile) {
  if (!profile?.dir || !isAbsolute(profile.dir)) return { schema: 1, issues: [], pending: [], receipts: {}, transactions: [], installBackups: [] }
  const root = join(profile.dir, ROOT)
  const receipts = Object.fromEntries(['install', 'package', 'maintenance', 'migration'].map((name) => [name, read(join(root, `${name}-result.json`))]))
  const pending = PENDING.filter((name) => existsSync(join(root, name))).map((name) => ({ name, data: read(join(root, name)) }))
  const packages = transactions(profile, 'package')
  const maintenance = transactions(profile, 'maintenance')
  const migrations = transactions(profile, 'migration')
  const backups = installBackups(profile)
  const issues = []
  const push = (issue) => issues.push({ schema: 1, recoverable: false, ...issue })
  if (['installing', 'recovery-required', 'invalid'].includes(receipts.install?.status)) {
    const backup = receipts.install?.backup
    const found = backups.find((item) => item.id === (backup ? backup.split(/[\\/]/).at(-1) : null))
    push({ kind: 'install', id: found?.id ?? null, status: receipts.install.status, recoverable: Boolean(found),
      action: found ? 'install-restore' : null, reason: found ? 'first-install backup is available' : 'install backup is missing',
      error: receipts.install.error ?? receipts.install.recoveryError ?? null })
  }
  if (['upgrading', 'restoring', 'recovery-required', 'invalid'].includes(receipts.package?.status)) {
    const tx = packages.find((item) => item.id === receipts.package.transactionId)
    push({ kind: 'package', id: tx?.id ?? receipts.package.transactionId ?? null, status: receipts.package.status, recoverable: Boolean(tx),
      action: tx ? 'package-restore' : null, reason: tx ? 'package transaction backup is available' : 'package transaction is missing',
      error: receipts.package.error ?? receipts.package.recoveryError ?? null })
  }
  if (['applying', 'recovery-required', 'invalid'].includes(receipts.maintenance?.status)) {
    const tx = maintenance.find((item) => item.id === receipts.maintenance.transactionId)
    const manager = receipts.maintenance.kind === 'manager-upgrade' || tx?.transaction?.kind === 'manager-upgrade'
    push({ kind: 'maintenance', id: tx?.id ?? receipts.maintenance.transactionId ?? null, status: receipts.maintenance.status, recoverable: Boolean(tx),
      action: manager ? 'manager-restore' : 'maintenance-restore', reason: tx ? 'maintenance transaction backup is available' : 'maintenance transaction is missing',
      error: receipts.maintenance.error ?? receipts.maintenance.recoveryError ?? null })
  }
  if (['migrating', 'recovery-required', 'invalid'].includes(receipts.migration?.status)) {
    const tx = migrations.find((item) => item.id === receipts.migration.transactionId)
    push({ kind: 'migration', id: tx?.id ?? receipts.migration.transactionId ?? null, status: receipts.migration.status, recoverable: Boolean(tx),
      action: 'migration-recover', reason: tx ? 'migration transaction backup is available' : 'migration transaction is missing',
      error: receipts.migration.error ?? receipts.migration.recoveryError ?? null })
  }
  if (pending.some((item) => item.name.endsWith('-pending.json') && !issues.some((issue) => issue.kind === item.name.split('-')[0]))) {
    push({ kind: 'pending', id: pending.map((item) => item.name).join(','), status: 'interrupted', recoverable: false,
      action: null, reason: 'pending intent has no recoverable receipt; inspect before deleting it' })
  }
  return { schema: 1, profile: profile.dir, issues, pending, receipts, transactions: [...packages, ...maintenance, ...migrations], installBackups: backups, checkedAt: new Date().toISOString() }
}

export function recoveryView(profile) {
  try { return diagnoseRecovery(profile) }
  catch (error) { return { schema: 1, profile: profile?.dir ?? null, issues: [], pending: [], receipts: {}, transactions: [], installBackups: [], error: String(error.message ?? error) } }
}

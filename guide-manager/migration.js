/** Phase 5E: read-only link-source inventory, content diff and migration plans. */
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { artifactInventory } from './artifacts.js'
import { COMPONENTS, dependencySource } from './core.js'
import { digest, fingerprint, INSTALL_ORDER, profileSnapshot, readCatalog, readJson, writeJson } from './install.js'
import { readManagerCatalog } from './maintenance.js'

export const MANAGER_PACKAGE = '@local/dsh-guide-manager'
export const MIGRATION_KEYS = [...INSTALL_ORDER, 'manager']
const SOURCE_EXCLUDES = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', '.npm-cache', 'coverage'])
const MAX_SOURCE_FILES = 2000
const MAX_SOURCE_BYTES = 16 * 1024 * 1024
const MAX_DIFF_ROWS = 40

const definition = (key) => key === 'manager'
  ? { key, package: MANAGER_PACKAGE }
  : COMPONENTS.find((item) => item.key === key)

function walkSource(root) {
  const files = {}
  let bytes = 0
  let latestMtime = 0
  const visit = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SOURCE_EXCLUDES.has(entry.name)) continue
      const path = join(directory, entry.name)
      const name = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isSymbolicLink()) throw new Error(`source-symlink-unsupported:${name}`)
      if (entry.isDirectory()) { visit(path, name); continue }
      if (!entry.isFile()) continue
      if (Object.keys(files).length >= MAX_SOURCE_FILES) throw new Error('source-too-many-files')
      const stat = statSync(path)
      bytes += stat.size
      if (bytes > MAX_SOURCE_BYTES) throw new Error('source-too-large')
      files[name] = digest(readFileSync(path))
      latestMtime = Math.max(latestMtime, stat.mtimeMs)
    }
  }
  visit(root, '')
  return { files, bytes, latestMtime }
}

function sourceEntry(profile, key, spec, hostStartedAt) {
  const target = definition(key)
  const source = dependencySource(spec)
  if (source.kind !== 'link' || source.path === null || source.path === '') throw new Error(`link-source-required:${key}`)
  const path = resolve(profile, source.path)
  if (!existsSync(path)) throw new Error(`source-missing:${key}`)
  const manifestPath = join(path, 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`source-manifest-missing:${key}`)
  const manifest = readJson(manifestPath)
  if (manifest.name !== target.package || !/^\d+\.\d+\.\d+$/.test(manifest.version ?? '')) throw new Error(`source-package-mismatch:${key}`)
  if ((manifest.dshGuide?.dataSchema ?? 1) !== 1) throw new Error(`unsupported-source-schema:${key}`)
  if (key !== 'manager' && manifest.dshGuide?.contract !== 1) throw new Error(`unsupported-source-contract:${key}`)
  const inventory = walkSource(path)
  return {
    key,
    package: manifest.name,
    version: manifest.version,
    contract: manifest.dshGuide?.contract ?? null,
    dataSchema: manifest.dshGuide?.dataSchema ?? 1,
    spec,
    path,
    files: inventory.files,
    filesHash: fingerprint(inventory.files),
    bytes: inventory.bytes,
    sourceChanged: Number.isFinite(hostStartedAt) && inventory.latestMtime > hostStartedAt + 1000,
  }
}

export function readLinkSource(profile, key, spec) {
  return sourceEntry(profile, key, spec, null)
}

function installedEnabled(state, key) {
  return state?.components?.find((item) => item.key === key)?.enabled === true
}

/** Read-only inventory of the seven owned profile dependencies. */
export function migrationInventory(profile, { state = null, hostStartedAt = null } = {}) {
  if (typeof profile !== 'string' || profile === '') throw new Error('profile-unavailable')
  const manifest = readJson(join(profile, 'package.json'))
  return MIGRATION_KEYS.map((key) => {
    const target = definition(key)
    const spec = manifest.dependencies?.[target.package]
    if (spec === undefined) return { key, package: target.package, installed: false, enabled: false, sourceKind: null, migratable: false }
    const source = dependencySource(spec)
    const base = { key, package: target.package, installed: true, enabled: installedEnabled(state, key), spec, sourceKind: source.kind }
    if (source.kind !== 'link') return { ...base, migratable: false }
    try {
      const entry = sourceEntry(profile, key, spec, hostStartedAt)
      return { ...base, migratable: true, source: entry, error: null }
    } catch (error) {
      return { ...base, migratable: false, error: String(error.message ?? error) }
    }
  })
}

function inventoryOf(files, hash) {
  if (files !== null && typeof files === 'object' && !Array.isArray(files)) {
    return Object.entries(files).every(([, value]) => /^[a-f0-9]{64}$/.test(value ?? '')) ? files : null
  }
  return null
}

function targetInventory(file, sha256, declared) {
  const known = inventoryOf(declared, sha256)
  if (known !== null) return known
  try { return artifactInventory(file, sha256).files }
  catch { return null }
}

function diffSources(sourceFiles, targetFiles) {
  if (targetFiles === null) return { available: false, contentMatches: null, changed: [], missing: [], extra: [], changedCount: 0, missingCount: 0, extraCount: 0 }
  const changed = []
  const missing = []
  const extra = []
  for (const [name, hash] of Object.entries(targetFiles).sort(([a], [b]) => a.localeCompare(b))) {
    if (!Object.hasOwn(sourceFiles, name)) missing.push(name)
    else if (sourceFiles[name] !== hash) changed.push(name)
  }
  for (const name of Object.keys(sourceFiles).sort()) if (!Object.hasOwn(targetFiles, name)) extra.push(name)
  const trim = (list) => list.slice(0, MAX_DIFF_ROWS)
  return {
    available: true,
    contentMatches: changed.length === 0 && missing.length === 0,
    changed: trim(changed),
    missing: trim(missing),
    extra: trim(extra),
    changedCount: changed.length,
    missingCount: missing.length,
    extraCount: extra.length,
  }
}

function targetVersionOfManager(catalog, requested) {
  const versions = catalog.artifacts.map((item) => item.version)
  if (requested !== undefined) {
    if (!versions.includes(requested)) throw new Error('manager-target-unavailable')
    return requested
  }
  const numeric = (version) => version.split('.').map((part) => Number(part))
  const compare = (a, b) => {
    const left = numeric(a)
    const right = numeric(b)
    for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index] - right[index]
    return 0
  }
  return [...versions].sort(compare).at(-1)
}

function assertNoMigrationPending(profile) {
  const state = join(profile, '.guide-manager')
  for (const name of ['pending.json', 'install-pending.json', 'package-pending.json', 'maintenance-pending.json', 'migration-pending.json']) {
    if (existsSync(join(state, name))) throw new Error(`another-operation-pending:${name}`)
  }
  for (const [name, statuses] of [
    ['migration', ['migrating', 'recovery-required', 'invalid']],
    ['install', ['installing', 'recovery-required', 'invalid']],
    ['package', ['upgrading', 'restoring', 'recovery-required', 'invalid']],
    ['maintenance', ['applying', 'recovery-required', 'invalid']],
  ]) {
    const path = join(state, `${name}-result.json`)
    if (existsSync(path) && statuses.includes(readJson(path)?.status)) throw new Error(`${name}-recovery-required`)
  }
}

export function createMigrationPlan(state, { catalogPath, managerCatalogPath, components, managerVersion } = {}, host = null) {
  const profile = state?.profile?.dir
  if (typeof profile !== 'string' || profile === '') throw new Error('profile-unavailable')
  const release = readCatalog(catalogPath)
  const inventory = migrationInventory(profile, { state, hostStartedAt: state?.hostStartedAt ?? null })
  const byKey = new Map(inventory.map((item) => [item.key, item]))
  const requested = components === undefined ? inventory.filter((item) => item.migratable).map((item) => item.key) : components
  if (!Array.isArray(requested) || requested.length === 0 || requested.length > MIGRATION_KEYS.length
    || new Set(requested).size !== requested.length || requested.some((key) => !MIGRATION_KEYS.includes(key))) throw new Error('invalid-migration-components')
  const blockers = []
  if (state.host?.dsh?.match !== true || state.host?.cordis?.match !== true) blockers.push('unsupported-migration-host')
  let manager = null
  if (requested.includes('manager')) {
    try { manager = readManagerCatalog(managerCatalogPath, host) }
    catch (error) { blockers.push(String(error.message ?? error)) }
  }
  const managerTargetVersion = manager === null ? null : (() => {
    try { return targetVersionOfManager(manager.catalog, managerVersion) }
    catch (error) { blockers.push(String(error.message ?? error)); return null }
  })()
  const entries = []
  for (const key of MIGRATION_KEYS.filter((item) => requested.includes(item))) {
    const found = byKey.get(key)
    if (!found?.installed) { blockers.push(`migration-component-not-installed:${key}`); continue }
    if (found.sourceKind !== 'link') { blockers.push(`migration-source-not-link:${key}`); continue }
    if (found.error) { blockers.push(found.error); continue }
    const target = key === 'manager'
      ? manager?.catalog.artifacts.find((item) => item.version === managerTargetVersion)
      : release.catalog.components.find((item) => item.key === key)
    if (!target) { blockers.push(`migration-target-unavailable:${key}`); continue }
    const targetFiles = targetInventory(target.file, target.sha256, target.files)
    if (targetFiles === null) blockers.push(`migration-target-inventory-unavailable:${key}`)
    if (key === 'manager' && targetFiles !== null
      && !['migration.js', 'helper/apply-migration.mjs', 'helper/recover-migration.mjs'].every((name) => Object.hasOwn(targetFiles, name))) blockers.push('manager-target-lacks-migration')
    entries.push({
      key,
      package: found.package,
      enabled: key === 'manager' ? true : found.enabled,
      action: 'migrate',
      source: {
        spec: found.source.spec,
        path: found.source.path,
        version: found.source.version,
        contract: found.source.contract,
        dataSchema: found.source.dataSchema,
        files: found.source.files,
        filesHash: found.source.filesHash,
        bytes: found.source.bytes,
        sourceChanged: found.source.sourceChanged,
      },
      target: {
        key,
        package: target.package,
        version: target.version,
        contract: target.contract ?? 1,
        dataSchema: target.dataSchema ?? 1,
        file: target.file,
        sha256: target.sha256,
        bytes: target.bytes ?? null,
        files: targetFiles,
      },
      diff: diffSources(found.source.files, targetFiles),
    })
  }
  if (!entries.length) blockers.push('no-migratable-components')
  const body = {
    schema: 1,
    kind: 'migration',
    profile: { dir: profile, name: state.profile?.name ?? null, installAnchor: state.profile?.installAnchor ?? null },
    catalogPath: release.path,
    catalogHash: release.hash,
    managerCatalogPath: manager?.path ?? null,
    managerCatalogHash: manager?.hash ?? null,
    managerVersion: managerTargetVersion,
    entries,
    before: profileSnapshot(profile),
    packageHashes: Object.fromEntries(entries.map((entry) => [entry.key, digest(readFileSync(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json')))])),
    sourceHashes: Object.fromEntries(entries.map((entry) => [entry.key, entry.source.filesHash])),
    blockers: [...new Set(blockers)],
    restartRequired: true,
  }
  return { ...body, id: fingerprint(body) }
}

export function stageMigration(plan, expectedId) {
  if (plan?.schema !== 1 || plan.kind !== 'migration' || plan.blockers?.length) throw new Error('migration-plan-blocked')
  if (plan.id !== expectedId) throw new Error('stale-migration-plan')
  const profile = plan.profile?.dir
  if (fingerprint(profileSnapshot(profile)) !== fingerprint(plan.before)) throw new Error('stale-migration-profile')
  for (const entry of plan.entries) {
    const actual = digest(readFileSync(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json')))
    if (actual !== plan.packageHashes[entry.key]) throw new Error(`stale-migration-package:${entry.key}`)
    const source = sourceEntry(profile, entry.key, entry.source.spec, null)
    if (source.filesHash !== plan.sourceHashes[entry.key]) throw new Error(`migration-source-changed:${entry.key}`)
  }
  assertNoMigrationPending(profile)
  writeJson(join(profile, '.guide-manager', 'migration-pending.json'), { ...plan, status: 'pending-restart', createdAt: new Date().toISOString() })
  return { application: 'pending-restart', planId: plan.id }
}

export function cancelMigration(profile, planId) {
  const pendingPath = join(profile, '.guide-manager', 'migration-pending.json')
  if (!existsSync(pendingPath)) throw new Error('migration-not-cancellable')
  const pending = readJson(pendingPath)
  if (pending.id !== planId) throw new Error('migration-not-cancellable')
  const resultPath = join(profile, '.guide-manager', 'migration-result.json')
  if (existsSync(resultPath) && ['migrating', 'recovery-required'].includes(readJson(resultPath)?.status)) throw new Error('migration-not-cancellable')
  unlinkSync(pendingPath)
  return { application: 'pending-cleared' }
}

export function migrationView(profile) {
  if (!profile) return { pending: null, result: null, transactions: [] }
  const state = join(profile, '.guide-manager')
  try {
    const read = (name) => existsSync(join(state, name)) ? readJson(join(state, name)) : null
    const valid = (value) => value === null || (value.schema === 1 && value.kind === 'migration' && Array.isArray(value.entries)
      && value.entries.length > 0 && value.entries.every((entry) => MIGRATION_KEYS.includes(entry?.key) && typeof entry.package === 'string'))
    const pending = read('migration-pending.json')
    const result = read('migration-result.json')
    if (!valid(pending) || !valid(result)) throw new Error('invalid-migration-state')
    return { pending, result, transactions: [] }
  } catch (error) {
    return { pending: null, result: { status: 'invalid', error: String(error.message ?? error), entries: [] }, transactions: [] }
  }
}

export function migrationTransactionPath(profile, id) {
  if (!/^\d{13}-[a-f0-9]{12}$/.test(id ?? '')) throw new Error('invalid-migration-transaction')
  return join(profile, '.guide-manager', 'migration-transactions', id)
}

export function readMigrationTransaction(profile, id) {
  const root = migrationTransactionPath(profile, id)
  const transaction = readJson(join(root, 'transaction.json'))
  if (transaction.schema !== 1 || transaction.kind !== 'migration' || transaction.profile !== profile || !Array.isArray(transaction.entries)) throw new Error('invalid-migration-transaction')
  for (const name of ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'pnpm-workspace.yaml']) {
    const path = join(root, 'files', name)
    const actual = existsSync(path) ? digest(readFileSync(path)) : null
    if (actual !== transaction.before[name]) throw new Error('migration-backup-integrity-mismatch')
  }
  return transaction
}

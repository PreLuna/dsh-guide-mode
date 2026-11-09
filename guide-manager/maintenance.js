/** Phase 5C: bounded uninstall/repair plans and independently recoverable manager updates. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { COMPONENTS } from './core.js'
import { artifactInventory, packageInventory } from './artifacts.js'
import { cachePath, digest, fingerprint, INSTALL_ORDER, INSTALL_REQUIRES, PROFILE_FILES, profileSnapshot, readJson, writeJson } from './install.js'

export const MANAGER_PACKAGE = '@local/dsh-guide-manager'
export const MAINTENANCE_BUSY = ['applying', 'recovery-required', 'invalid']
const exact = (value) => /^\d+\.\d+\.\d+$/.test(value ?? '')
const definition = (key) => key === 'manager' ? { key, package: MANAGER_PACKAGE } : COMPONENTS.find((item) => item.key === key)

export function readManagerCatalog(path, host) {
  if (!isAbsolute(path ?? '')) throw new Error('manager-catalog-unavailable')
  const catalog = readJson(path)
  if (catalog.schema !== 3 || catalog.product !== 'dsh-guide-mode' || !Array.isArray(catalog.artifacts) || !catalog.artifacts.length || catalog.artifacts.length > 20) throw new Error('invalid-manager-catalog')
  const versions = new Set()
  for (const entry of catalog.artifacts) {
    if (entry.package !== MANAGER_PACKAGE || !exact(entry.version) || versions.has(entry.version) || !isAbsolute(entry.file ?? '') || !/\.tgz$/i.test(entry.file)) throw new Error('invalid-manager-artifact')
    versions.add(entry.version)
    const { manifest, files } = artifactInventory(entry.file, entry.sha256)
    if (manifest.name !== MANAGER_PACKAGE || manifest.version !== entry.version || manifest.dshGuide?.product !== 'dsh-guide-mode'
      || (manifest.dshGuide.controlSchema ?? 1) !== 1 || (manifest.dshGuide.dataSchema ?? 1) !== 1
      || fingerprint(manifest.dshGuide.host) !== fingerprint(host)
      || !files['helper/apply-maintenance.mjs'] || !files['helper/recover-manager.ps1']) throw new Error('unsupported-manager-contract-or-host')
  }
  return { path: resolve(path), hash: fingerprint(catalog), catalog }
}

export function managerCatalogView(path, host) {
  try { return { available: true, versions: readManagerCatalog(path, host).catalog.artifacts.map((item) => item.version), error: null } }
  catch (error) { return { available: false, versions: [], error: String(error.message ?? error) } }
}

function sourceEntry(profile, key, spec) {
  const component = definition(key)
  if (typeof spec !== 'string' || !spec.startsWith('file:') || !/\.tgz$/i.test(spec)) throw new Error(`managed-tarball-required:${key}`)
  const file = resolve(profile, spec.slice(5))
  // Component packages must retain the SHA-pinned source created by 5A/5B.
  const sha256 = key === 'manager' ? digest(readFileSync(file)) : file.match(/([a-f0-9]{64})\.tgz$/)?.[1]
  if (!sha256 || (key !== 'manager' && file !== cachePath(profile, sha256))) throw new Error(`source-not-pinned:${key}`)
  const inventory = artifactInventory(file, sha256)
  const manifest = inventory.manifest
  if (manifest.name !== component.package || !exact(manifest.version) || (manifest.dshGuide?.dataSchema ?? 1) !== 1
    || (key !== 'manager' && manifest.dshGuide?.contract !== 1)) throw new Error(`invalid-pinned-package:${key}`)
  return { key, package: component.package, version: manifest.version, contract: manifest.dshGuide?.contract ?? 1,
    spec, file, sha256, files: inventory.files }
}

export function controlInventory(root) {
  const manifest = readJson(join(root, 'package.json'))
  const names = ['package.json', ...manifest.files.filter((name) => /\.(?:js|mjs|ps1|cmd|yml)$/.test(name))]
  if (names.some((name) => name.includes('..') || isAbsolute(name))) throw new Error('invalid-controller-files')
  return Object.fromEntries([...new Set(names)].sort().map((name) => [name, digest(readFileSync(join(root, name)))]))
}

export function controlPath(profile, hash) {
  if (!/^[a-f0-9]{64}$/.test(hash ?? '')) throw new Error('invalid-controller-hash')
  return join(profile, '.guide-manager', 'controllers', hash)
}

export function verifyControl(profile, hash) {
  const root = controlPath(profile, hash)
  if (fingerprint(controlInventory(root)) !== hash) throw new Error('controller-integrity-mismatch')
  return root
}

export function createMaintenancePlan(state, request, managerRoot, managerCatalogPath, host) {
  const profile = state.profile?.dir
  if (!isAbsolute(profile ?? '')) throw new Error('profile-unavailable')
  const kind = request.kind
  if (!['uninstall', 'repair', 'manager-upgrade', 'manager-restore'].includes(kind)) throw new Error('invalid-maintenance-kind')
  if (kind === 'manager-restore') return createManagerRestorePlan(state.profile, request.transactionId, managerRoot)
  const keys = kind === 'manager-upgrade' ? ['manager'] : request.components
  if (!Array.isArray(keys) || !keys.length || keys.length > 6 || new Set(keys).size !== keys.length || keys.some((key) => !INSTALL_ORDER.includes(key) && !(kind === 'manager-upgrade' && key === 'manager'))) throw new Error('invalid-maintenance-components')
  keys.sort()
  const manifest = readJson(join(profile, 'package.json'))
  const blockers = []
  const entries = []
  for (const key of keys) {
    if (kind === 'uninstall' && key === 'preset') blockers.push('preset-protected-for-session-recovery')
    try {
      const entry = sourceEntry(profile, key, manifest.dependencies?.[definition(key).package])
      entries.push({ ...entry, enabled: state.components?.find((item) => item.key === key)?.enabled === true })
    } catch (error) { blockers.push(String(error.message ?? error)) }
  }
  if (kind === 'uninstall') {
    const removed = new Set(keys.map((key) => definition(key).package))
    for (const component of COMPONENTS) if (manifest.dependencies?.[component.package] && !keys.includes(component.key)) {
      for (const dependency of INSTALL_REQUIRES[component.key] ?? []) if (keys.includes(dependency)) blockers.push(`dependent-remains:${component.key}->${dependency}`)
    }
    // Respect declared dependencies of other profile-owned packages, too.
    for (const name of Object.keys(manifest.dependencies ?? {})) if (!removed.has(name)) {
      const path = join(profile, 'node_modules', ...name.split('/'), 'package.json')
      if (!existsSync(path)) { if (name !== MANAGER_PACKAGE) blockers.push(`dependent-inventory-unavailable:${name}`); continue }
      const other = readJson(path)
      for (const dependency of Object.keys({ ...other.dependencies, ...other.peerDependencies })) if (removed.has(dependency) && other.peerDependenciesMeta?.[dependency]?.optional !== true) blockers.push(`dependent-remains:${name}->${dependency}`)
    }
  }
  let target = null
  let catalogHash = null
  if (kind === 'manager-upgrade') {
    const release = readManagerCatalog(managerCatalogPath, host)
    catalogHash = release.hash
    const artifact = release.catalog.artifacts.find((item) => item.version === request.version)
    if (!artifact) throw new Error('manager-target-unavailable')
    const inventory = artifactInventory(artifact.file, artifact.sha256)
    target = { ...artifact, key: 'manager', files: inventory.files }
    if (entries[0]?.version === target.version) blockers.push('manager-already-at-target')
  }
  if (state.host?.dsh?.match !== true || state.host?.cordis?.match !== true) blockers.push('unsupported-maintenance-host')
  const controllerHash = fingerprint(controlInventory(managerRoot))
  const body = { schema: 1, kind, profile: state.profile, components: [...keys].sort(), entries, target,
    managerCatalogPath: kind === 'manager-upgrade' ? managerCatalogPath : null, catalogHash,
    controllerHash, before: profileSnapshot(profile), packageHashes: Object.fromEntries(entries.map((entry) => [entry.key, packageInventory(profile, entry)])),
    blockers: [...new Set(blockers)], restartRequired: true, nativeDriverRestored: kind === 'uninstall' && keys.includes('goal'),
    managerSourcePinnedOnRestore: kind === 'manager-upgrade' }
  return { ...body, id: fingerprint(body) }
}

export function maintenanceTransactionPath(profile, id) {
  if (!/^\d{13}-[a-f0-9]{12}$/.test(id ?? '')) throw new Error('invalid-maintenance-transaction')
  return join(profile, '.guide-manager', 'maintenance-transactions', id)
}

export function readMaintenanceTransaction(profile, id) {
  const root = maintenanceTransactionPath(profile, id)
  const transaction = readJson(join(root, 'transaction.json'))
  if (transaction.schema !== 1 || transaction.profile.dir !== profile || transaction.transactionId !== id || !['uninstall', 'repair', 'manager-upgrade', 'manager-restore'].includes(transaction.kind)) throw new Error('invalid-maintenance-backup')
  for (const name of PROFILE_FILES) if (transaction.before[name] !== null && digest(readFileSync(join(root, 'files', name))) !== transaction.before[name]) throw new Error('maintenance-backup-integrity-mismatch')
  for (const entry of transaction.entries) if (!definition(entry.key) || definition(entry.key).package !== entry.package
    || digest(readFileSync(join(root, `${entry.key}.tgz`))) !== entry.sha256) throw new Error('maintenance-backup-artifact-mismatch')
  return { transaction, root }
}

export function createManagerRestorePlan(profile, transactionId, managerRoot) {
  const { transaction } = readMaintenanceTransaction(profile.dir, transactionId)
  if (transaction.kind !== 'manager-upgrade' || transaction.status !== 'manager-upgrade-awaiting-restart' || transaction.restoredAt) throw new Error('manager-backup-not-restorable')
  if (fingerprint(profileSnapshot(profile.dir)) !== fingerprint(transaction.after)) throw new Error('profile-changed-since-manager-upgrade')
  const body = { schema: 1, kind: 'manager-restore', profile, components: ['manager'], entries: transaction.entries,
    target: null, transactionId, transactionHash: fingerprint(transaction), controllerHash: fingerprint(controlInventory(managerRoot)),
    before: profileSnapshot(profile.dir), packageHashes: {}, blockers: [], restartRequired: true, nativeDriverRestored: false, managerSourcePinnedOnRestore: true }
  return { ...body, id: fingerprint(body) }
}

export function assertMaintenanceIdle(profile, allowed = '') {
  for (const name of ['pending.json', 'install-pending.json', 'package-pending.json', 'maintenance-pending.json']) if (name !== allowed && existsSync(join(profile, '.guide-manager', name))) throw new Error(`another-operation-pending:${name}`)
  for (const [name, statuses] of [['maintenance', MAINTENANCE_BUSY], ['install', ['installing', 'recovery-required', 'invalid']], ['package', ['upgrading', 'restoring', 'recovery-required', 'invalid']]]) {
    const path = join(profile, '.guide-manager', `${name}-result.json`)
    if (existsSync(path) && statuses.includes(readJson(path).status)) throw new Error(`${name}-recovery-required`)
  }
}

export function stageMaintenance(plan, expectedId, managerRoot) {
  const profile = plan.profile.dir
  assertMaintenanceIdle(profile)
  if (plan.id !== expectedId || plan.blockers.length) throw new Error('maintenance-plan-changed-or-blocked')
  if (fingerprint(profileSnapshot(profile)) !== fingerprint(plan.before)) throw new Error('stale-maintenance-profile')
  const files = controlInventory(managerRoot)
  if (fingerprint(files) !== plan.controllerHash) throw new Error('controller-changed')
  const root = controlPath(profile, plan.controllerHash)
  for (const name of Object.keys(files)) {
    const destination = join(root, name)
    mkdirSync(dirname(destination), { recursive: true })
    if (resolve(managerRoot) !== resolve(root)) copyFileSync(join(managerRoot, name), destination)
  }
  verifyControl(profile, plan.controllerHash)
  writeJson(join(profile, '.guide-manager', 'maintenance-pending.json'), { ...plan, status: 'pending-restart', createdAt: new Date().toISOString() })
  return { application: 'pending-restart', planId: plan.id, helper: join(root, 'helper', 'maintain-guide-manager.cmd'), recovery: join(root, 'helper', 'recover-manager.ps1') }
}

export function maintenanceView(profile) {
  try {
    const state = join(profile, '.guide-manager')
    const read = (name) => existsSync(join(state, name)) ? readJson(join(state, name)) : null
    const pending = read('maintenance-pending.json')
    const result = read('maintenance-result.json')
    const validEntries = (entries) => Array.isArray(entries) && entries.length <= 6 && entries.every((entry) => definition(entry?.key) && exact(entry.version))
    if ((pending && (pending.schema !== 1 || !Array.isArray(pending.entries) || !/^[a-f0-9]{64}$/.test(pending.controllerHash ?? '')))
      || (pending && !validEntries(pending.entries))
      || (result && (result.schema !== 1 || !validEntries(result.entries) || !['applying', 'recovery-required', 'failed-restored', 'uninstall-awaiting-restart', 'repair-awaiting-restart', 'manager-upgrade-awaiting-restart', 'manager-restore-awaiting-restart'].includes(result.status)))) throw new Error('invalid-maintenance-state')
    const hash = pending?.controllerHash ?? result?.controllerHash
    return { pending, result, helper: hash ? join(controlPath(profile, hash), 'helper', 'maintain-guide-manager.cmd') : null,
      recovery: hash ? join(controlPath(profile, hash), 'helper', 'recover-manager.ps1') : null }
  } catch (error) { return { pending: null, result: { status: 'invalid', error: String(error.message ?? error), entries: [] } } }
}

export function cancelMaintenance(profile, planId) {
  const view = maintenanceView(profile)
  if (view.pending?.id !== planId || MAINTENANCE_BUSY.includes(view.result?.status)) throw new Error('maintenance-not-cancellable')
  unlinkSync(join(profile, '.guide-manager', 'maintenance-pending.json'))
  return { application: 'pending-cleared' }
}

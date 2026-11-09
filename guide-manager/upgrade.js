/** Trusted version combinations, cold upgrade plans and bounded transaction recovery. */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { COMPONENTS } from './core.js'
import { cachePath, digest, fingerprint, INSTALL_ORDER, INSTALL_REQUIRES, PROFILE_FILES, profileSnapshot, readJson, writeJson } from './install.js'

const exact = (version) => typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version)
const definition = (key) => COMPONENTS.find((item) => item.key === key)
const artifactOf = (catalog, key, version) => catalog.artifacts.find((item) => item.key === key && item.version === version)

export function readUpgradeCatalog(path) {
  if (!isAbsolute(path ?? '')) throw new Error('upgrade-catalog-unavailable')
  const catalog = readJson(path)
  if (catalog.schema !== 2 || catalog.product !== 'dsh-guide-mode' || !Array.isArray(catalog.artifacts) || !Array.isArray(catalog.combinations)
    || catalog.artifacts.length > 60 || !catalog.combinations.length || catalog.combinations.length > 32) throw new Error('invalid-upgrade-catalog')
  const seen = new Set()
  for (const item of catalog.artifacts) {
    const key = `${item.key}@${item.version}`
    if (!definition(item.key) || definition(item.key).package !== item.package || !exact(item.version) || item.contract !== 1 || item.dataSchema !== 1 || seen.has(key)) throw new Error('invalid-upgrade-artifact')
    seen.add(key)
    if (!isAbsolute(item.file ?? '') || !/\.tgz$/i.test(item.file) || !/^[a-f0-9]{64}$/.test(item.sha256 ?? '') || digest(readFileSync(item.file)) !== item.sha256) throw new Error(`upgrade-artifact-integrity:${key}`)
    if (!item.requires || typeof item.requires !== 'object' || Array.isArray(item.requires)) throw new Error('invalid-upgrade-requirements')
    for (const [peer, versions] of Object.entries(item.requires)) if (!definition(peer) || !Array.isArray(versions) || !versions.length || versions.some((version) => !exact(version))) throw new Error('invalid-upgrade-peer')
  }
  const ids = new Set()
  for (const combo of catalog.combinations) {
    if (typeof combo.id !== 'string' || !/^[a-z0-9._-]{1,80}$/i.test(combo.id) || ids.has(combo.id)) throw new Error('invalid-combination-id')
    ids.add(combo.id)
    if (!combo.host || typeof combo.host !== 'object' || !exact(combo.host.cordis) || typeof combo.host.dsh !== 'string') throw new Error('invalid-combination-host')
    if (Object.keys(combo.versions ?? {}).length !== 6) throw new Error('incomplete-version-combination')
    for (const key of INSTALL_ORDER) {
      const artifact = artifactOf(catalog, key, combo.versions[key])
      if (!artifact) throw new Error('combination-artifact-unavailable')
      for (const [peer, versions] of Object.entries(artifact.requires)) if (!versions.includes(combo.versions[peer])) throw new Error(`incompatible-version-combination:${key}->${peer}`)
    }
  }
  return { path: resolve(path), hash: fingerprint(catalog), catalog }
}

export function installedPackageHashes(profile, entries) {
  return Object.fromEntries(entries.map((entry) => [entry.key, digest(readFileSync(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json')))]))
}

function assertNoPending(profile) {
  for (const name of ['pending.json', 'install-pending.json', 'package-pending.json', 'maintenance-pending.json']) if (existsSync(join(profile, '.guide-manager', name))) throw new Error(`another-operation-pending:${name}`)
  const maintenance = join(profile, '.guide-manager', 'maintenance-result.json')
  if (existsSync(maintenance) && ['applying', 'recovery-required', 'invalid'].includes(readJson(maintenance).status)) throw new Error('maintenance-recovery-required')
  const result = packageView(profile).result
  if (['upgrading', 'restoring', 'recovery-required', 'invalid'].includes(result?.status)) throw new Error('package-recovery-required')
}

export function createUpgradePlan(state, release, targets, expectedHost) {
  if (!Array.isArray(targets) || !targets.length || targets.length > 6 || targets.some((item) => !definition(item?.key) || !exact(item.version)) || new Set(targets.map((item) => item.key)).size !== targets.length) throw new Error('invalid-upgrade-targets')
  const profile = state.profile?.dir
  if (!isAbsolute(profile ?? '')) throw new Error('profile-unavailable')
  const manifest = readJson(join(profile, 'package.json'))
  const installed = state.components.filter((item) => manifest.dependencies?.[item.package] !== undefined)
  if (targets.some((item) => !installed.some((component) => component.key === item.key))) throw new Error('upgrade-target-not-installed')
  const choices = release.catalog.combinations.filter((combo) => fingerprint(combo.host) === fingerprint(expectedHost)
    && targets.every((item) => combo.versions[item.key] === item.version))
    .map((combo) => ({ combo, changes: installed.filter((item) => combo.versions[item.key] !== item.version).length }))
    .sort((a, b) => a.changes - b.changes || a.combo.id.localeCompare(b.combo.id))
  if (!choices.length) throw new Error('no-compatible-upgrade-combination')
  const combo = choices[0].combo
  const blockers = []
  if (state.host?.dsh?.match !== true || state.host?.cordis?.match !== true || state.host?.artifacts?.verified === false) blockers.push('unsupported-upgrade-host')
  if (state.pending?.present || state.pending?.error) blockers.push('cold-toggle-pending')
  const entries = INSTALL_ORDER.filter((key) => installed.some((item) => item.key === key)).map((key) => {
    const component = installed.find((item) => item.key === key)
    const source = artifactOf(release.catalog, key, combo.versions[key])
    const old = artifactOf(release.catalog, key, component.version)
    const spec = manifest.dependencies[component.package]
    if (!old || component.contract !== 1) { blockers.push(`previous-artifact-unavailable:${key}`); return null }
    const pinned = cachePath(profile, old.sha256)
    if (!spec.startsWith('file:') || resolve(profile, spec.slice(5)) !== pinned) blockers.push(`source-not-pinned:${key}`)
    if (!existsSync(pinned) || digest(readFileSync(pinned)) !== old.sha256) blockers.push(`previous-cache-unavailable:${key}`)
    for (const dependency of INSTALL_REQUIRES[key] ?? []) if (!installed.some((item) => item.key === dependency)) blockers.push(`missing-upgrade-peer:${dependency}`)
    for (const [peer, versions] of Object.entries(source.requires)) {
      if (!installed.some((item) => item.key === peer) || !versions.includes(combo.versions[peer])) blockers.push(`incompatible-upgrade-peer:${key}->${peer}`)
    }
    return { key, package: component.package, version: source.version, contract: source.contract, dataSchema: source.dataSchema,
      file: source.file, sha256: source.sha256, enabled: component.enabled === true,
      action: component.version === source.version ? 'retain' : 'upgrade',
      previous: { version: component.version, file: pinned, sha256: old.sha256, spec, contract: component.contract, enabled: component.enabled === true } }
  }).filter(Boolean)
  const body = { schema: 1, kind: 'package-upgrade', profile: state.profile, targets: [...targets].sort((a, b) => a.key.localeCompare(b.key)),
    combination: combo.id, catalogPath: release.path, catalogHash: release.hash, entries,
    before: profileSnapshot(profile), packageHashes: installedPackageHashes(profile, entries), blockers: [...new Set(blockers)], restartRequired: true }
  return { ...body, id: fingerprint(body) }
}

export function transactionPath(profile, id) {
  if (!/^\d{13}-[a-f0-9]{12}$/.test(id ?? '')) throw new Error('invalid-transaction-id')
  return join(profile, '.guide-manager', 'package-transactions', id)
}

export function readTransaction(profile, id) {
  const root = transactionPath(profile, id)
  const transaction = readJson(join(root, 'transaction.json'))
  if (transaction.schema !== 1 || transaction.kind !== 'package-upgrade' || transaction.profile !== profile || !Array.isArray(transaction.entries)) throw new Error('invalid-package-transaction')
  for (const name of PROFILE_FILES) {
    const path = join(root, 'files', name)
    const actual = existsSync(path) ? digest(readFileSync(path)) : null
    if (actual !== transaction.before[name]) throw new Error('transaction-backup-integrity-mismatch')
  }
  for (const entry of transaction.entries) {
    if (!definition(entry.key) || definition(entry.key).package !== entry.package || !exact(entry.previous?.version)
      || !/^[a-f0-9]{64}$/.test(entry.previous?.sha256 ?? '') || entry.previous.contract !== 1) throw new Error('invalid-transaction-component')
    const artifact = join(root, 'artifacts', `${entry.key}-${entry.previous.sha256}.tgz`)
    if (digest(readFileSync(artifact)) !== entry.previous.sha256) throw new Error('transaction-artifact-integrity-mismatch')
  }
  return transaction
}

export function createRestorePlan(state, transactionId) {
  const profile = state.profile.dir
  const transaction = readTransaction(profile, transactionId)
  if (transaction.status !== 'upgraded-awaiting-restart' || transaction.restoredAt) throw new Error('transaction-not-restorable')
  const blockers = fingerprint(profileSnapshot(profile)) === fingerprint(transaction.after) ? [] : ['profile-changed-since-upgrade']
  const entries = transaction.entries.map((entry) => ({ key: entry.key, package: entry.package, version: entry.previous.version, contract: entry.previous.contract,
    file: join(transactionPath(profile, transactionId), 'artifacts', `${entry.key}-${entry.previous.sha256}.tgz`), sha256: entry.previous.sha256,
    enabled: entry.previous.enabled, action: 'restore' }))
  const body = { schema: 1, kind: 'package-restore', profile: state.profile, transactionId, transactionHash: fingerprint(transaction), entries,
    before: profileSnapshot(profile), packageHashes: installedPackageHashes(profile, entries), blockers, restartRequired: true }
  return { ...body, id: fingerprint(body) }
}

export function stagePackagePlan(plan, expectedId) {
  if (plan.id !== expectedId) throw new Error('stale-package-plan')
  if (fingerprint(profileSnapshot(plan.profile.dir)) !== fingerprint(plan.before)
    || fingerprint(installedPackageHashes(plan.profile.dir, plan.entries)) !== fingerprint(plan.packageHashes)) throw new Error('stale-package-plan')
  if (plan.blockers.length) throw new Error(`package-operation-blocked:${plan.blockers.join(',')}`)
  if (plan.kind === 'package-upgrade' && !plan.entries.some((item) => item.action === 'upgrade')) throw new Error('nothing-to-upgrade')
  assertNoPending(plan.profile.dir)
  writeJson(join(plan.profile.dir, '.guide-manager', 'package-pending.json'), { ...plan, status: 'pending-restart', createdAt: new Date().toISOString() })
  return { application: 'pending-restart', planId: plan.id }
}

export function packageView(profile) {
  if (!profile) return { pending: null, result: null, transactions: [] }
  const root = join(profile, '.guide-manager')
  const read = (name) => {
    try {
      if (!existsSync(join(root, name))) return null
      const data = readJson(join(root, name))
      if (data?.schema !== 1 || !Array.isArray(data.entries) || data.entries.some((entry) => !entry || !definition(entry.key) || !exact(entry.version))) throw new Error('invalid-package-record')
      return data
    } catch { return { status: 'invalid', entries: [], error: `unreadable-${name}` } }
  }
  const directory = join(root, 'package-transactions')
  const transactions = existsSync(directory) ? readdirSync(directory).filter((id) => /^\d{13}-[a-f0-9]{12}$/.test(id)).sort().reverse().slice(0, 20).flatMap((id) => {
    try {
      const tx = readJson(join(directory, id, 'transaction.json'))
      return tx.kind === 'package-upgrade' && tx.status === 'upgraded-awaiting-restart' && !tx.restoredAt ? [{ id, createdAt: tx.createdAt, entries: tx.entries.map((item) => ({ key: item.key, version: item.version, previousVersion: item.previous.version })) }] : []
    } catch { return [] }
  }) : []
  return { pending: read('package-pending.json'), result: read('package-result.json'), transactions }
}

export function upgradeCatalogView(path) {
  try {
    const { catalog } = readUpgradeCatalog(path)
    return { available: true, components: INSTALL_ORDER.map((key) => ({ key, versions: [...new Set(catalog.artifacts.filter((item) => item.key === key).map((item) => item.version))] })), error: null }
  } catch (error) { return { available: false, components: [], error: String(error.message ?? error) } }
}

/** Phase 5A: trusted local releases, first-install plans and cold-install intents. */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { COMPONENTS } from './core.js'

export const INSTALL_ORDER = ['preset', 'shield', 'admission', 'panel', 'sidebar', 'goal']
export const INSTALL_REQUIRES = { admission: ['shield'], panel: ['preset', 'shield', 'admission'] }
export const PROFILE_FILES = ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'pnpm-workspace.yaml']
export const INSTALL_ROWS = {
  preset: ['preset-guide', '@deepseek-ai/dsh-agent-preset'],
  shield: ['guide-settlement-shield', '@local/dsh-guide-shield'],
  admission: ['guide-admission', '@local/dsh-guide-admission'],
  panel: ['guide-panel', '@local/dsh-guide-panel'],
  sidebar: ['guide-sidebar-adapter', '@local/dsh-guide-sidebar-adapter'],
  goal: ['guide-goal-adapter', '@local/dsh-guide-goal-adapter'],
}
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const fingerprint = (value) => {
  const canonical = (item) => Array.isArray(item) ? item.map(canonical)
    : item !== null && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonical(item[key])])) : item
  return digest(JSON.stringify(canonical(value)))
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function writeJson(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, path)
}

export function profileSnapshot(profile) {
  return Object.fromEntries(PROFILE_FILES.map((name) => {
    const path = join(profile, name)
    return [name, existsSync(path) ? digest(readFileSync(path)) : null]
  }))
}

export function cachePath(profile, sha256) {
  if (!/^[a-f0-9]{64}$/.test(sha256 ?? '')) throw new Error('invalid-artifact-hash')
  return join(profile, '.guide-manager', 'package-cache', `${sha256}.tgz`)
}

export function cacheArtifact(profile, source) {
  if (digest(readFileSync(source.file)) !== source.sha256) throw new Error('artifact-integrity-mismatch')
  const destination = cachePath(profile, source.sha256)
  mkdirSync(resolve(destination, '..'), { recursive: true })
  if (existsSync(destination)) {
    if (digest(readFileSync(destination)) !== source.sha256) throw new Error('cached-artifact-integrity-mismatch')
  } else {
    const temporary = `${destination}.${process.pid}.tmp`
    copyFileSync(source.file, temporary)
    renameSync(temporary, destination)
  }
  return destination
}

export function readCatalog(path, { requiredKeys = INSTALL_ORDER } = {}) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('release-catalog-unavailable: configure an absolute catalogPath on guide-manager')
  const catalog = readJson(path)
  if (catalog.schema !== 1 || catalog.product !== 'dsh-guide-mode' || !Array.isArray(catalog.components)) throw new Error('invalid-release-catalog')
  if (catalog.components.length !== COMPONENTS.length) throw new Error('incomplete-release-catalog')
  const seen = new Set()
  for (const entry of catalog.components) {
    const definition = COMPONENTS.find((item) => item.key === entry.key)
    if (!definition || entry.package !== definition.package || seen.has(entry.key)) throw new Error('invalid-catalog-component')
    seen.add(entry.key)
    if (!/^\d+\.\d+\.\d+$/.test(entry.version) || entry.contract !== 1) throw new Error('unsupported-catalog-version-or-contract')
    if (!isAbsolute(entry.file ?? '') || !/\.tgz$/i.test(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')) throw new Error('invalid-catalog-source')
    if (requiredKeys.includes(entry.key) && digest(readFileSync(entry.file)) !== entry.sha256) throw new Error(`release-integrity-mismatch:${entry.key}`)
  }
  return { catalog, hash: fingerprint(catalog), path: resolve(path) }
}

export function selectedKeys(requested) {
  if (!Array.isArray(requested) || requested.length === 0 || requested.length > 6) throw new Error('select-one-to-six-components')
  const keys = new Set()
  const add = (key) => {
    if (!INSTALL_ORDER.includes(key)) throw new Error(`unknown-component:${String(key)}`)
    if (keys.has(key)) return
    keys.add(key)
    for (const dependency of INSTALL_REQUIRES[key] ?? []) add(dependency)
  }
  requested.forEach(add)
  return INSTALL_ORDER.filter((key) => keys.has(key))
}

export function createInstallPlan(state, release, requested) {
  const keys = selectedKeys(requested)
  const blockers = []
  const warnings = []
  if (!state.profile?.dir || !isAbsolute(state.profile.dir)) throw new Error('profile-unavailable')
  if (state.pending?.present || state.pending?.error) blockers.push('cold-toggle-pending')
  if (state.host?.dsh?.match !== true || state.host?.cordis?.match !== true) blockers.push('unsupported-install-host')
  if (state.host?.artifacts?.verified === false) blockers.push('host-artifact-mismatch')
  if (state.host?.verified !== true || state.host?.artifacts?.verified !== true) warnings.push('host-not-fully-verified')
  if (state.skills?.status !== 'ready') warnings.push('guide-skill-not-ready')
  const profile = readJson(join(state.profile.dir, 'package.json'))
  const selectedBundles = profile.dsh?.profile?.bundles ?? []
  const entries = keys.map((key) => {
    const source = release.catalog.components.find((item) => item.key === key)
    const installed = state.components.find((item) => item.key === key)
    if (source.version !== installed?.expectedVersion || source.contract !== installed?.expectedContract) blockers.push(`release-not-validated:${key}`)
    const spec = profile.dependencies?.[source.package]
    if (spec !== undefined && installed?.version !== source.version) blockers.push(`requires-version-upgrade:${key}`)
    if (installed?.installed && spec === undefined) blockers.push(`not-profile-owned:${key}`)
    if (spec !== undefined && (!selectedBundles.includes(source.package) || installed?.enabled !== true)) blockers.push(`existing-component-disabled:${key}`)
    if (spec !== undefined && installed?.contract !== source.contract) blockers.push(`contract-mismatch:${key}`)
    if (key === 'sidebar' && state.host?.betterSidebar?.match !== true) blockers.push('sidebar-host-unavailable')
    return { key, package: source.package, version: source.version, contract: source.contract, file: source.file, sha256: source.sha256, action: spec === undefined ? 'install' : 'retain', previousSpec: spec ?? null }
  })
  const body = {
    schema: 1,
    kind: 'first-install',
    profile: { dir: resolve(state.profile.dir), name: state.profile.name, installAnchor: state.profile.installAnchor },
    requested: [...new Set(requested)].sort(),
    catalogPath: release.path,
    catalogHash: release.hash,
    before: profileSnapshot(state.profile.dir),
    entries,
    restartRequired: true,
    blockers: [...new Set(blockers)],
    warnings,
  }
  return { ...body, id: fingerprint(body) }
}

export function catalogView(path) {
  try {
    const { catalog, hash } = readCatalog(path)
    return { available: true, hash, release: catalog.release ?? null, components: catalog.components.map(({ key, version }) => ({ key, version })), error: null }
  } catch (error) {
    return { available: false, components: [], error: String(error.message ?? error) }
  }
}

export function installView(profile) {
  const root = profile ? join(profile, '.guide-manager') : null
  const read = (name) => {
    try {
      if (!root || !existsSync(join(root, name))) return null
      const value = readJson(join(root, name))
      if (value?.schema !== 1 || !Array.isArray(value.entries)
        || value.entries.some((entry) => !entry || !INSTALL_ORDER.includes(entry.key) || typeof entry.version !== 'string')) throw new Error('invalid-install-record')
      return value
    } catch { return { status: 'invalid', entries: [], error: `unreadable-${name}` } }
  }
  return { pending: read('install-pending.json'), result: read('install-result.json') }
}

export function stageInstall(state, release, requested, expectedId) {
  if (existsSync(join(state.profile.dir, '.guide-manager', 'maintenance-pending.json'))) throw new Error('maintenance-operation-pending')
  const maintenanceResult = join(state.profile.dir, '.guide-manager', 'maintenance-result.json')
  if (existsSync(maintenanceResult) && ['applying', 'recovery-required', 'invalid'].includes(readJson(maintenanceResult).status)) throw new Error('maintenance-recovery-required')
  if (existsSync(join(state.profile.dir, '.guide-manager', 'package-pending.json'))) throw new Error('package-operation-pending')
  const plan = createInstallPlan(state, release, requested)
  if (plan.id !== expectedId) throw new Error('stale-install-plan: preview again')
  if (plan.blockers.length) throw new Error(`install-blocked:${plan.blockers.join(',')}`)
  if (!plan.entries.some((entry) => entry.action === 'install')) throw new Error('nothing-to-install')
  const path = join(plan.profile.dir, '.guide-manager', 'install-pending.json')
  const current = installView(plan.profile.dir)
  if (current.pending) throw new Error('install-already-pending: cancel or apply the existing plan')
  if (['recovery-required', 'installing', 'invalid'].includes(current.result?.status)) throw new Error('install-recovery-required')
  writeJson(path, { ...plan, status: 'pending-restart', createdAt: new Date().toISOString() })
  return { application: 'pending-restart', planId: plan.id, pendingPath: path }
}

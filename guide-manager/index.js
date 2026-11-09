import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  COMPONENTS,
  ARTIFACT_REQUIREMENTS,
  MANAGER_ACTION,
  actionForComponent,
  buildEdges,
  coldIntent,
  componentStatus,
  dependencySource,
  hostStatus,
  normalizeActionResult,
  readSkillsState,
  sourceChangedSince,
  updateModeFor,
} from './core.js'
import { catalogView, createInstallPlan, installView, readCatalog, stageInstall } from './install.js'
import { createRestorePlan, createUpgradePlan, packageView, readUpgradeCatalog, stagePackagePlan, upgradeCatalogView } from './upgrade.js'
import { cancelMaintenance, createMaintenancePlan, maintenanceView, managerCatalogView, stageMaintenance } from './maintenance.js'
import { createRemoteManager } from './remote.js'
import { createExecutionController } from './execution.js'
const remoteManagers = new WeakMap()
const executionManagers = new WeakMap()

/**
 * Host state, component switches and Phase 5A cold installation planning.
 *
 * It deliberately imports none of the components it reports on: a disabled or
 * broken panel must not take the manager down with it. The only package facts
 * it trusts are the installed manifests, the official `pluginManager` snapshot,
 * the components' own optional state services, and the user-level skill files.
 * Only manager-owned intents are written here. Package/profile mutations run
 * in the independent cold helper with the official profile write lock.
 */

const ROUTE_PREFIX = '/guide-manager/api'
const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = resolve(PACKAGE_DIR, '..')
const HELPER_PATH = join(PACKAGE_DIR, 'helper', 'restart-guide-manager.cmd')
const HELPER_PS1 = join(PACKAGE_DIR, 'helper', 'restart-guide-manager.ps1')
const HELPER_APPLY = join(PACKAGE_DIR, 'helper', 'apply-pending.mjs')
const HELPER_RELOAD = join(PACKAGE_DIR, 'helper', 'reload-guide-manager.cmd')
const HELPER_ROLLBACK = join(PACKAGE_DIR, 'helper', 'rollback-guide-manager.cmd')
const HELPER_INSTALL = join(PACKAGE_DIR, 'helper', 'install-guide-manager.cmd')
const HELPER_PACKAGE = join(PACKAGE_DIR, 'helper', 'update-guide-manager.cmd')
const PENDING_VERSION = 1
const HOST_STARTED_AT = Date.now() - Math.round(process.uptime() * 1000)

function serviceOf(ctx, name) {
  try {
    return ctx.get(name)
  } catch {
    return undefined
  }
}

function readBom() {
  try {
    const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
    return { manifest, guide: manifest.dshGuide ?? {} }
  } catch {
    return { manifest: { version: null }, guide: {} }
  }
}

function anchorOf(profileContext) {
  return profileContext?.dir === undefined
    ? import.meta.url
    : pathToFileURL(join(profileContext.dir, 'package.json')).href
}

function readProfileManifest(profileContext) {
  if (profileContext?.dir === undefined) return null
  try {
    return JSON.parse(readFileSync(join(profileContext.dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

function readInstallManifest(profileContext) {
  if (typeof profileContext?.installAnchor !== 'string') return null
  try {
    return JSON.parse(readFileSync(profileContext.installAnchor, 'utf8'))
  } catch {
    return null
  }
}

function readPackageManifest(ctx, name, profileContext) {
  const packages = serviceOf(ctx, 'pluginPackages')
  const anchor = anchorOf(profileContext)
  let located
  try {
    located = packages?.packageOf?.(name, anchor)
  } catch {
    located = undefined
  }
  const fallback = profileContext?.dir === undefined
    ? undefined
    : join(profileContext.dir, 'node_modules', ...name.split('/'), 'package.json')
  const path = located?.manifestPath ?? fallback
  if (path === undefined || !existsSync(path)) return null
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    return { path, version: manifest.version ?? located?.version ?? null, manifest }
  } catch {
    return null
  }
}

async function readPluginData(ctx, profileContext) {
  const manager = serviceOf(ctx, 'pluginManager')
  if (manager !== undefined && typeof manager.listPlugins === 'function' && typeof manager.listBundles === 'function') {
    try {
      const [rows, bundles] = await Promise.all([manager.listPlugins(), Promise.resolve(manager.listBundles())])
      return {
        mode: 'plugin-manager',
        rows: Array.isArray(rows) ? rows : [],
        bundles: Array.isArray(bundles) ? bundles : [],
        error: null,
      }
    } catch (error) {
      return { mode: 'error', rows: [], bundles: [], error: String(error.message ?? error) }
    }
  }
  const manifest = readProfileManifest(profileContext)
  if (manifest === null) return { mode: 'unavailable', rows: [], bundles: [], error: 'profile-manifest-unavailable' }
  const dependencies = manifest.dependencies ?? {}
  const selected = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : []
  const bundles = COMPONENTS.map((component) => {
    const info = readPackageManifest(ctx, component.package, profileContext)
    return {
      name: component.package,
      installed: dependencies[component.package] !== undefined || info !== null,
      enabled: selected.includes(component.package),
      version: info?.version ?? null,
      rows: [],
    }
  })
  return { mode: 'profile-fallback', rows: [], bundles, error: null }
}

function readServiceState(ctx, component) {
  if (component.service === null) return null
  const service = serviceOf(ctx, component.service)
  if (service === undefined) return { name: component.service, available: false, state: null, error: null }
  const method = component.state === 'state' ? service.state : service.getState
  if (typeof method !== 'function') return { name: component.service, available: true, state: null, error: 'method-unavailable' }
  try {
    const state = component.state === 'state' ? method.call(service, {}) : method.call(service)
    return { name: component.service, available: true, state: state ?? null, error: null }
  } catch (error) {
    return { name: component.service, available: true, state: null, error: String(error.message ?? error) }
  }
}

function readHostState(ctx, profileContext, expected) {
  const release = serviceOf(ctx, 'clientModules')?.release
  const install = readInstallManifest(profileContext)
  const packages = serviceOf(ctx, 'pluginPackages')
  const anchor = anchorOf(profileContext)
  const packageVersion = (name) => {
    try {
      return packages?.packageOf?.(name, anchor)?.version ?? null
    } catch {
      return null
    }
  }
  const sidebar = readPackageManifest(ctx, 'dsh-better-sidebar', profileContext)
  const actual = {
    dsh: {
      version: release?.version ?? install?.version ?? null,
      commit: release?.commit ?? null,
    },
    cordis: packageVersion('@deepseek-ai/cordis') ?? install?.dependencies?.['@deepseek-ai/cordis'] ?? null,
    betterSidebar: packageVersion('dsh-better-sidebar') ?? sidebar?.version ?? null,
  }
  return hostStatus(actual, expected ?? {})
}

function packageDirOf(ctx, name, profileContext) {
  const packages = serviceOf(ctx, 'pluginPackages')
  const anchor = anchorOf(profileContext)
  try {
    const located = packages?.packageOf?.(name, anchor)
    if (typeof located?.dir === 'string' && existsSync(located.dir)) return located.dir
  } catch {
    // Fall through to the profile node_modules spelling.
  }
  if (profileContext?.dir !== undefined) {
    const fallback = join(profileContext.dir, 'node_modules', ...name.split('/'))
    if (existsSync(fallback)) return fallback
  }
  return null
}

function readArtifactState(ctx, profileContext, artifacts) {
  const entries = artifacts !== null && typeof artifacts === 'object' ? Object.entries(artifacts) : []
  if (entries.length === 0) return { checked: false, verified: null, items: [] }
  const items = []
  for (const [name, spec] of entries) {
    const file = spec?.file
    const expected = spec?.sha256 ?? null
    const dir = packageDirOf(ctx, name, profileContext)
    if (dir === null || typeof file !== 'string') {
      items.push({ name, file, expected, actual: null, match: null, error: 'package-unavailable' })
      continue
    }
    const path = join(dir, file)
    if (!existsSync(path)) {
      items.push({ name, file, expected, actual: null, match: null, error: 'file-unavailable' })
      continue
    }
    try {
      const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
      items.push({ name, file, expected, actual, match: actual === expected, error: null })
    } catch (error) {
      items.push({ name, file, expected, actual: null, match: null, error: String(error.message ?? error) })
    }
  }
  const known = items.filter((item) => item.match !== null)
  const verified = items.some((item) => item.match === false)
    ? false
    : known.length === items.length && items.length > 0 ? true : null
  return { checked: true, verified, items }
}

function latestMtime(directory) {
  if (typeof directory !== 'string' || !existsSync(directory)) return null
  let latest = null
  let seen = 0
  const walk = (current) => {
    if (seen >= 200) return
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (seen >= 200) return
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.guide-manager') continue
      if (entry.isSymbolicLink()) continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      try {
        const mtime = statSync(path).mtimeMs
        latest = latest === null ? mtime : Math.max(latest, mtime)
        seen += 1
      } catch {
        // A file disappearing during the scan does not invalidate the rest.
      }
    }
  }
  walk(directory)
  return latest
}

function readBackups(profileContext) {
  const directory = profileContext?.dir === undefined ? null : join(profileContext.dir, '.guide-manager', 'backups')
  if (directory === null || !existsSync(directory)) return { count: 0, latest: null }
  let names
  try {
    names = readdirSync(directory).filter((name) => name.startsWith('cordis.patch.yml.') && name.endsWith('.bak'))
  } catch {
    return { count: 0, latest: null }
  }
  const items = []
  for (const name of names) {
    const path = join(directory, name)
    try {
      items.push({ name, path, at: statSync(path).mtime.toISOString() })
    } catch {
      // Ignore a backup that disappeared while listing.
    }
  }
  items.sort((left, right) => right.at.localeCompare(left.at))
  return { count: items.length, latest: items[0] ?? null }
}

function collectComponents(ctx, pluginData, guide, profileContext, host, pendingByComponent = new Map(), dependencies = {}, skills = null) {
  const definitions = guide.components ?? {}
  const components = [...COMPONENTS].sort((a, b) => a.order - b.order).map((component) => {
    const bundle = pluginData.bundles.find((item) => item.name === component.package) ?? null
    const rows = pluginData.rows
      .filter((row) => row.moduleName === component.package)
      .map((row) => ({
        entryId: row.entryId ?? null,
        enabled: row.enabled === true,
        fiberPhase: row.fiberPhase ?? null,
        readOnlyReason: row.readOnlyReason ?? null,
      }))
    const info = readPackageManifest(ctx, component.package, profileContext)
    const meta = info?.manifest?.dshGuide ?? {}
    const expected = definitions[component.package] ?? {}
    const installed = bundle?.installed === true || info !== null || rows.length > 0
    const actualVersion = bundle?.version ?? info?.version ?? null
    const enabled = bundle?.enabled === false
      ? false
      : rows.length > 0 ? rows.some((row) => row.enabled === true) : bundle?.enabled === true
    const service = readServiceState(ctx, component)
    const spec = typeof dependencies[component.package] === 'string' ? dependencies[component.package] : null
    const source = dependencySource(spec)
    const mode = updateModeFor(source.kind)
    const localPath = mode === 'source-reload' && source.path !== null && profileContext?.dir !== undefined
      ? resolve(profileContext.dir, source.path)
      : null
    const latest = localPath === null ? null : latestMtime(localPath)
    const changed = sourceChangedSince(latest, HOST_STARTED_AT)
    const status = componentStatus({
      installed,
      bundleError: bundle?.error ?? null,
      bundleEnabled: bundle === null ? null : bundle.enabled === true,
      rows,
      service,
      expectedVersion: expected.version ?? null,
      actualVersion,
      expectedContract: expected.contract ?? null,
      actualContract: meta.contract ?? null,
      hostVerified: host.verified,
    })
    return {
      key: component.key,
      package: component.package,
      order: component.order,
      installed,
      version: actualVersion,
      expectedVersion: expected.version ?? null,
      contract: meta.contract ?? null,
      expectedContract: expected.contract ?? null,
      enabled,
      bundleEnabled: bundle === null ? null : bundle.enabled === true,
      bundleError: bundle?.error ?? null,
      rows,
      service,
      manifestPath: info?.path ?? null,
      update: {
        spec,
        kind: source.kind,
        mode,
        path: localPath,
        latestMtime: latest,
        hostStartedAt: HOST_STARTED_AT,
        sourceChanged: changed,
        official: mode === 'package-manager',
        reason: mode === 'unavailable'
          ? 'dependency-spec-unknown'
          : mode === 'package-manager' ? 'use-official-plugins-page' : null,
      },
      status: status.status,
      reason: status.reason,
      versionMatch: status.versionMatch,
      contractMatch: status.contractMatch,
    }
  })
  for (const component of components) {
    component.action = actionForComponent(component, components, host, skills)
    component.pending = pendingByComponent.get(component.key) ?? null
  }
  return components
}

function checkManager(ctx) {
  const missing = []
  const manager = serviceOf(ctx, 'pluginManager')
  if (manager === undefined) missing.push('pluginManager')
  else for (const method of ['listPlugins', 'listBundles']) {
    if (typeof manager[method] !== 'function') missing.push(`pluginManager.${method}`)
  }
  const webServer = serviceOf(ctx, 'webServer')
  if (typeof webServer?.register !== 'function') missing.push('webServer.register')
  const connection = serviceOf(ctx, 'connection')
  if (typeof connection?.requestRejection !== 'function') missing.push('connection.requestRejection')
  const profileContext = serviceOf(ctx, 'profileContext')
  if (profileContext === undefined) missing.push('profileContext')
  const route = typeof webServer?.register === 'function' && typeof connection?.requestRejection === 'function'
  if (manager === undefined && route && profileContext !== undefined) {
    return { mode: 'fallback', reason: 'plugin-manager-unavailable', missing, route, pluginManager: false }
  }
  if (missing.length > 0) return { mode: 'unsupported', reason: 'missing-host-contract', missing, route, pluginManager: manager !== undefined }
  return { mode: 'ready', reason: null, missing, route, pluginManager: true }
}

function buildWarnings(state) {
  const warnings = []
  if (state.manager.mode !== 'ready') warnings.push(`manager:${state.manager.mode}:${state.manager.reason ?? 'unknown'}`)
  if (state.host.verified !== true) warnings.push('host:unverified-build')
  for (const component of state.components) {
    if (component.status !== 'ready' && component.status !== 'ready-unverified') {
      warnings.push(`${component.key}:${component.status}:${component.reason ?? 'unknown'}`)
    }
  }
  for (const edge of state.edges) {
    if (edge.status === 'conflict' || edge.status === 'blocked' || edge.status === 'degraded') {
      warnings.push(`edge:${edge.from}->${edge.to}:${edge.status}:${edge.reason ?? 'unknown'}`)
    }
  }
  if (state.skills.status !== 'ready') warnings.push(`skills:${state.skills.status}:${state.skills.reason ?? 'unknown'}`)
  if (state.pending?.error) warnings.push(`pending:${state.pending.error}`)
  if (state.host.artifacts?.checked === true && state.host.artifacts.verified === false) warnings.push('host:artifact-mismatch')
  if (state.dataSource === 'profile-fallback') warnings.push('data:profile-fallback')
  return [...new Set(warnings)]
}

function pendingDirOf(profileContext) {
  return profileContext?.dir === undefined ? null : join(profileContext.dir, '.guide-manager')
}

function readPending(profileContext) {
  const dir = pendingDirOf(profileContext)
  if (dir === null) return { present: false, path: null, createdAt: null, intents: [], error: 'profile-unavailable' }
  const path = join(dir, 'pending.json')
  if (!existsSync(path)) return { present: false, path, createdAt: null, intents: [], error: null }
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    if (data?.version !== PENDING_VERSION || !Array.isArray(data.intents)) {
      return { present: false, path, createdAt: null, intents: [], error: 'invalid-pending-file' }
    }
    const intents = data.intents.filter((intent) => intent !== null && typeof intent === 'object' && typeof intent.component === 'string' && typeof intent.enabled === 'boolean' && Array.isArray(intent.patches))
    return { present: true, path, createdAt: data.createdAt ?? null, intents, error: null }
  } catch (error) {
    return { present: false, path, createdAt: null, intents: [], error: String(error.message ?? error) }
  }
}

function writePending(profileContext, intents) {
  const dir = pendingDirOf(profileContext)
  if (dir === null) throw new Error('profile context is unavailable')
  const path = join(dir, 'pending.json')
  if (intents.length === 0) {
    if (existsSync(path)) unlinkSync(path)
    return null
  }
  const data = {
    version: PENDING_VERSION,
    createdAt: new Date().toISOString(),
    profile: profileContext.dir,
    installAnchor: profileContext.installAnchor ?? null,
    workspace: WORKSPACE_ROOT,
    intents,
  }
  mkdirSync(dir, { recursive: true })
  const temporary = join(dir, `pending.json.${process.pid}.tmp`)
  writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n')
  renameSync(temporary, path)
  return data
}

function pendingView(profileContext) {
  const read = readPending(profileContext)
  const byComponent = new Map(read.intents.map((intent) => [intent.component, { enabled: intent.enabled, createdAt: read.createdAt }]))
  return {
    present: read.present,
    path: read.path,
    createdAt: read.createdAt,
    intents: read.intents.map((intent) => ({ component: intent.component, enabled: intent.enabled })),
    error: read.error,
    helper: HELPER_PATH,
    helperPs1: HELPER_PS1,
    applyScript: HELPER_APPLY,
    helperExists: existsSync(HELPER_PATH),
    byComponent,
  }
}

async function collectState(ctx, config = {}) {
  const bom = readBom()
  const profileContext = serviceOf(ctx, 'profileContext')
  const profileManifest = readProfileManifest(profileContext)
  const host = readHostState(ctx, profileContext, bom.guide.host ?? {})
  host.artifacts = config?.checkArtifacts === false
    ? { checked: false, verified: null, items: [] }
    : readArtifactState(ctx, profileContext, bom.guide.artifacts ?? {})
  const pluginData = await readPluginData(ctx, profileContext)
  const pending = pendingView(profileContext)
  const skills = readSkillsState(profileContext?.home)
  const skillsManagerName = '@michengai/dsh-skills-manager'
  const skillsManagerInfo = readPackageManifest(ctx, skillsManagerName, profileContext)
  const skillsManagerSpec = typeof profileManifest?.dependencies?.[skillsManagerName] === 'string'
    ? profileManifest.dependencies[skillsManagerName]
    : null
  skills.manager = {
    name: skillsManagerName,
    spec: skillsManagerSpec,
    installed: skillsManagerSpec !== null || skillsManagerInfo !== null,
    version: skillsManagerInfo?.version ?? null,
    path: skillsManagerInfo?.path ?? null,
  }
  const components = collectComponents(ctx, pluginData, bom.guide, profileContext, host, pending.byComponent, profileManifest?.dependencies ?? {}, skills)
  const edges = buildEdges(components, bom.guide.edges ?? [], pluginData.rows)
  const manager = checkManager(ctx)
  const backups = readBackups(profileContext)
  const state = {
    product: bom.guide.product ?? 'dsh-guide-mode',
    release: bom.guide.release ?? bom.manifest.version ?? null,
    readOnly: false,
    actionScope: 'phase-4',
    manager: { ...manager, version: bom.manifest.version ?? null, action: MANAGER_ACTION },
    profile: {
      name: profileContext?.name ?? null,
      dir: profileContext?.dir ?? null,
      installAnchor: profileContext?.installAnchor ?? null,
    },
    host,
    components,
    edges,
    skills,
    pending: {
      present: pending.present,
      path: pending.path,
      createdAt: pending.createdAt,
      intents: pending.intents,
      error: pending.error,
      helper: pending.helper,
      helperPs1: pending.helperPs1,
      applyScript: pending.applyScript,
      helperExists: pending.helperExists,
    },
    helper: {
      pending: HELPER_PATH,
      reload: HELPER_RELOAD,
      rollback: HELPER_ROLLBACK,
      ps1: HELPER_PS1,
      applyScript: HELPER_APPLY,
      reloadExists: existsSync(HELPER_RELOAD),
      rollbackExists: existsSync(HELPER_ROLLBACK),
    },
    backups,
    dataSource: pluginData.mode,
    dataError: pluginData.error,
    generatedAt: new Date().toISOString(),
  }
  const installation = installView(profileContext?.dir)
  const receipt = installation.result
  const restarted = receipt?.finishedAt && HOST_STARTED_AT > Date.parse(receipt.finishedAt)
  const running = Array.isArray(receipt?.entries) && receipt.entries.length > 0 && receipt.entries.every((entry) => {
    const component = components.find((item) => item.key === entry.key)
    return component?.version === entry.version && component?.enabled === true && ['ready', 'ready-unverified'].includes(component?.status)
  }) && host.dsh.match === true && host.cordis.match === true
    && [...new Set(receipt.entries.flatMap((entry) => ARTIFACT_REQUIREMENTS[entry.key] ?? []))].every((name) => host.artifacts.items?.some((item) => item.name === name && item.match === true))
    && !edges.some((edge) => receipt.entries.some((entry) => entry.key === edge.from) && ['blocked', 'conflict'].includes(edge.status))
  state.installation = {
    phase: 'phase-5a',
    catalog: catalogView(catalogPathOf(ctx, config)),
    ...installation,
    verification: receipt?.status === 'installed-awaiting-restart'
      ? restarted ? running ? 'verified-running' : 'restart-health-check-failed' : 'awaiting-restart'
      : receipt?.status === 'installing' && HOST_STARTED_AT > Date.parse(receipt.startedAt) ? 'interrupted' : null,
    helper: HELPER_INSTALL,
    helperCommand: profileContext?.dir ? `& '${HELPER_INSTALL.replaceAll("'", "''")}' -Profile '${profileContext.dir.replaceAll("'", "''")}'` : null,
  }
  const packages = packageView(profileContext?.dir)
  const packageReceipt = packages.result
  const packageRestarted = packageReceipt?.finishedAt && HOST_STARTED_AT > Date.parse(packageReceipt.finishedAt)
  const packageRunning = Array.isArray(packageReceipt?.entries) && packageReceipt.entries.length > 0 && packageReceipt.entries.every((entry) => {
    const component = components.find((item) => item.key === entry?.key)
    return component?.version === entry.version && component?.contract === entry.contract && component?.enabled === (entry.enabled !== false)
      && (entry.enabled === false ? component?.status === 'disabled' : ['ready', 'ready-unverified'].includes(component?.status))
  }) && host.dsh.match === true && host.cordis.match === true
    && [...new Set(packageReceipt.entries.flatMap((entry) => ARTIFACT_REQUIREMENTS[entry.key] ?? []))].every((name) => host.artifacts.items?.some((item) => item.name === name && item.match === true))
    && !edges.some((edge) => packageReceipt.entries.some((entry) => entry.key === edge.from) && ['blocked', 'conflict'].includes(edge.status))
  state.packageManagement = {
    phase: 'phase-5b', ...packages,
    catalog: upgradeCatalogView(upgradePathOf(ctx, config)),
    verification: ['upgraded-awaiting-restart', 'restored-awaiting-restart'].includes(packageReceipt?.status)
      ? packageRestarted ? packageRunning ? 'verified-running' : 'restart-health-check-failed' : 'awaiting-restart'
      : ['upgrading', 'restoring'].includes(packageReceipt?.status) && HOST_STARTED_AT > Date.parse(packageReceipt.startedAt) ? 'interrupted' : null,
    helperCommand: profileContext?.dir ? `& '${HELPER_PACKAGE.replaceAll("'", "''")}' -Profile '${profileContext.dir.replaceAll("'", "''")}'` : null,
  }
  if (packageReceipt?.startedAt && Date.parse(packageReceipt.startedAt) > Date.parse(receipt?.finishedAt ?? '')) state.installation.verification = 'superseded'
  const maintenance = profileContext?.dir ? maintenanceView(profileContext.dir) : { pending: null, result: null }
  const maintenanceReceipt = maintenance.result
  const maintenanceRestarted = maintenanceReceipt?.finishedAt && HOST_STARTED_AT > Date.parse(maintenanceReceipt.finishedAt)
  const maintenanceHealthy = maintenanceReceipt?.entries?.every((entry) => {
    if (entry.key === 'manager') return state.manager.version === entry.version && state.manager.mode === 'ready'
    const component = components.find((item) => item.key === entry.key)
    if (maintenanceReceipt.kind === 'uninstall') return component?.installed === false
    return component?.version === entry.version && component?.enabled === entry.enabled && (entry.enabled ? ['ready', 'ready-unverified'].includes(component?.status) : component?.status === 'disabled')
  }) && host.dsh.match && host.cordis.match
  const quote = (value) => `'${value.replaceAll("'", "''")}'`
  state.maintenance = { phase: 'phase-5c', ...maintenance,
    catalog: managerCatalogView(managerCatalogPathOf(ctx, config), bom.guide.host),
    helperCommand: maintenance.helper ? `& ${quote(maintenance.helper)} -Profile ${quote(profileContext.dir)}` : null,
    externalRepairCommand: profileContext?.dir ? `& ${quote(join(PACKAGE_DIR, 'helper', 'repair-components.ps1'))} -Profile ${quote(profileContext.dir)} -Components panel` : null,
    recoveryCommand: maintenance.recovery && (maintenance.pending?.kind === 'manager-upgrade' || maintenanceReceipt?.kind === 'manager-upgrade')
      ? `& ${quote(maintenance.recovery)} -Profile ${quote(profileContext.dir)}${maintenance.pending ? '' : ` -TransactionId ${quote(maintenanceReceipt.transactionId)}`}` : null,
    verification: maintenanceReceipt?.status?.endsWith('-awaiting-restart')
      ? maintenanceRestarted ? maintenanceHealthy ? 'verified-running' : 'restart-health-check-failed' : 'awaiting-restart'
      : maintenanceReceipt?.status === 'applying' && HOST_STARTED_AT > Date.parse(maintenanceReceipt.startedAt) ? 'interrupted' : null,
    external: [
      { key: 'guide-skill', owner: 'skills-manager', installed: skills.status !== 'missing', route: '/settings/skills' },
      { key: 'skills-manager', owner: 'official-plugins', installed: skills.manager?.installed === true },
      { key: 'better-sidebar', owner: 'official-plugins', installed: host.betterSidebar?.actual != null, version: host.betterSidebar?.actual ?? null },
    ],
  }
  const supersededBy = (own, others) => own?.finishedAt && others.some((other) => Date.parse(other?.startedAt ?? '') > Date.parse(own.finishedAt))
  if (supersededBy(receipt, [packageReceipt, maintenanceReceipt])) state.installation.verification = 'superseded'
  if (supersededBy(packageReceipt, [receipt, maintenanceReceipt])) state.packageManagement.verification = 'superseded'
  if (supersededBy(maintenanceReceipt, [receipt, packageReceipt])) state.maintenance.verification = 'superseded'
  state.distribution = remoteManagers.get(ctx)?.view() ?? { configured: false }
  state.execution = executionManagers.get(ctx)?.view(state) ?? { available: false, active: false }
  state.warnings = buildWarnings(state)
  return state
}

async function stageCold(ctx, key, enabled, component) {
  const profileContext = serviceOf(ctx, 'profileContext')
  if (profileContext?.dir === undefined) return { ok: false, code: 'profile-unavailable', message: 'profile context is unavailable' }
  const intent = coldIntent(key, enabled)
  if (intent === null) return { ok: false, code: 'no-cold-intent', message: `no cold intent for ${key}` }
  const current = readPending(profileContext)
  const intents = current.intents.filter((item) => item.component !== key)
  const clearing = component.enabled === enabled
  if (!clearing) intents.push(intent)
  try {
    const data = writePending(profileContext, intents)
    return {
      ok: true,
      value: {
        component: key,
        enabled,
        application: clearing ? 'pending-cleared' : 'pending-restart',
        patches: clearing ? [] : intent.patches,
        pendingPath: data === null ? null : join(profileContext.dir, '.guide-manager', 'pending.json'),
        helperPath: HELPER_PATH,
        createdAt: data?.createdAt ?? null,
        error: null,
      },
    }
  } catch (error) {
    return { ok: false, code: 'pending-write-failed', message: String(error.message ?? error) }
  }
}

/**
 * Phase 1A/1B action: hot components use the official pluginManager; cold
 * components only stage a pending intent for the restart helper. The manager
 * never edits the profile itself.
 */
async function setComponentEnabled(ctx, key, enabled, config = {}) {
  const maintenance = maintenanceView(serviceOf(ctx, 'profileContext')?.dir)
  if (maintenance.pending || ['applying', 'recovery-required', 'invalid'].includes(maintenance.result?.status)) return { ok: false, code: 'maintenance-operation-pending', message: 'apply or cancel maintenance before switching components' }
  if (packageView(serviceOf(ctx, 'profileContext')?.dir).pending) return { ok: false, code: 'package-operation-pending', message: 'cancel or apply the prepared package operation first' }
  if (installView(serviceOf(ctx, 'profileContext')?.dir).pending) return { ok: false, code: 'install-pending', message: 'cancel or apply the prepared installation before toggling components' }
  if (key === 'manager') return { ok: false, code: 'locked', message: 'the manager is protected and has no switch' }
  const definition = COMPONENTS.find((item) => item.key === key)
  if (definition === undefined) return { ok: false, code: 'unknown-component', message: `Unknown component: ${key}` }
  let state
  try {
    state = await collectState(ctx, config)
  } catch (error) {
    return { ok: false, code: 'state-unavailable', message: String(error.message ?? error) }
  }
  const component = state.components.find((item) => item.key === key)
  if (component === undefined) return { ok: false, code: 'unknown-component', message: `Unknown component: ${key}` }
  const action = component.action ?? { policy: 'locked', reason: 'missing-action-policy', canToggle: false, kind: 'locked', blockers: [] }
  if (action.kind !== 'hot' && action.kind !== 'cold') {
    return { ok: false, code: action.policy, message: action.reason ?? 'component is not switchable' }
  }
  const clearingPending = action.kind === 'cold' && component.pending !== null && component.pending !== undefined && component.enabled === enabled
  if (action.canToggle !== true && !clearingPending) {
    return {
      ok: false,
      code: action.reason ?? 'not-toggleable',
      message: action.reason ?? 'component cannot be toggled in this state',
      blockers: action.blockers ?? [],
    }
  }
  if (action.kind === 'cold') return stageCold(ctx, key, enabled, component)
  if (component.enabled === enabled) {
    return { ok: true, value: { component: key, enabled, application: 'applied', changed: false, noop: true, error: null } }
  }
  const manager = serviceOf(ctx, 'pluginManager')
  if (manager === undefined || typeof manager.setPluginEnabled !== 'function') {
    return { ok: false, code: 'plugin-manager-unavailable', message: 'official pluginManager.setPluginEnabled is unavailable' }
  }
  let rows
  try {
    rows = await manager.listPlugins()
  } catch (error) {
    return { ok: false, code: 'plugin-manager-error', message: String(error.message ?? error) }
  }
  const targetRows = rows.filter((row) => row.moduleName === definition.package)
  if (targetRows.length !== 1) {
    return { ok: false, code: 'entry-not-unique', message: `expected one Loader row for ${definition.package}, found ${targetRows.length}` }
  }
  const row = targetRows[0]
  if (row.readOnlyReason !== undefined) {
    return { ok: false, code: row.readOnlyReason, message: `row is read-only: ${row.readOnlyReason}` }
  }
  try {
    const result = await manager.setPluginEnabled(row.entryId, enabled)
    return { ok: true, value: normalizeActionResult(result, key, enabled) }
  } catch (error) {
    return { ok: false, code: error.code ?? 'operation-error', message: String(error.message ?? error) }
  }
}

const MAX_BODY_BYTES = 16 * 1024

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        fail(new Error('request body is too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('request body is not valid JSON'))
      }
    })
    req.on('error', (error) => fail(error))
  })
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

function catalogPathOf(ctx, config) {
  const profile = serviceOf(ctx, 'profileContext')
  return config.catalogPath ?? (profile?.dir ? join(profile.dir, '.guide-manager', 'release-catalog.json') : null)
}

function upgradePathOf(ctx, config) {
  const profile = serviceOf(ctx, 'profileContext')
  return config.upgradeCatalogPath ?? (profile?.dir ? join(profile.dir, '.guide-manager', 'upgrade-catalog.json') : null)
}

function managerCatalogPathOf(ctx, config) {
  const profile = serviceOf(ctx, 'profileContext')
  return config.managerCatalogPath ?? (profile?.dir ? join(profile.dir, '.guide-manager', 'manager-catalog.json') : null)
}

async function maintenancePlan(ctx, config, payload) {
  return createMaintenancePlan(await collectState(ctx, config), payload, PACKAGE_DIR, managerCatalogPathOf(ctx, config), readBom().guide.host)
}

async function packagePlan(ctx, config, payload) {
  const state = await collectState(ctx, config)
  if (payload.kind === 'package-restore') return createRestorePlan(state, payload.transactionId)
  return createUpgradePlan(state, readUpgradeCatalog(upgradePathOf(ctx, config)), payload.targets, readBom().guide.host)
}

async function preparePackage(ctx, config, payload) {
  if (payload.confirm !== true) throw new Error('confirmation-required')
  const result = stagePackagePlan(await packagePlan(ctx, config, payload), payload.planId)
  return { ...result, helperPath: HELPER_PACKAGE }
}

function cancelPackage(ctx, payload) {
  if (payload.confirm !== true) throw new Error('confirmation-required')
  const profile = serviceOf(ctx, 'profileContext')
  const view = packageView(profile?.dir)
  if (!view.pending || view.pending.id !== payload.planId || ['upgrading', 'restoring'].includes(view.result?.status)) throw new Error('package-operation-not-cancellable')
  unlinkSync(join(profile.dir, '.guide-manager', 'package-pending.json'))
  return { application: 'pending-cleared' }
}

async function planInstallation(ctx, config, requested) {
  const state = await collectState(ctx, config)
  return createInstallPlan(state, readCatalog(catalogPathOf(ctx, config)), requested)
}

async function prepareInstallation(ctx, config, payload) {
  if (payload.confirm !== true) throw new Error('confirmation-required')
  const state = await collectState(ctx, config)
  const value = stageInstall(state, readCatalog(catalogPathOf(ctx, config)), payload.components, payload.planId)
  return { ...value, helperPath: HELPER_INSTALL }
}

function cancelInstallation(ctx, payload) {
  if (payload.confirm !== true) throw new Error('confirmation-required')
  const profile = serviceOf(ctx, 'profileContext')
  const view = installView(profile?.dir)
  if (!view.pending || view.pending.id !== payload.planId || view.result?.status === 'installing') throw new Error('install-not-cancellable')
  unlinkSync(join(profile.dir, '.guide-manager', 'install-pending.json'))
  return { application: 'pending-cleared' }
}

async function handle(injected, getState, setEnabled, installActions, packageActions, maintenanceActions, sourceActions, executionActions, req, res) {
  const connection = serviceOf(injected, 'connection')
  const rejection = typeof connection?.requestRejection === 'function' ? connection.requestRejection(req) : undefined
  if (rejection !== undefined) {
    writeJson(res, typeof rejection === 'number' ? rejection : 403, { ok: false, error: { message: 'forbidden' } })
    return
  }
  const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
  if (pathname.startsWith(`${ROUTE_PREFIX}/execution/`)) {
    if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { message: 'method not allowed' } }); return }
    const action = pathname.slice(`${ROUTE_PREFIX}/execution/`.length)
    if (!['plan', 'start', 'ack', 'seen'].includes(action)) { writeJson(res, 404, { ok: false, error: { message: 'not found' } }); return }
    try {
      const value = await executionActions[action](await readJsonBody(req))
      if (action === 'ack') {
        if (typeof res.once === 'function') res.once('finish', () => { try { value() } catch {} })
        writeJson(res, 200, { ok: true, value: { application: 'restarting' } })
        if (typeof res.once !== 'function') value()
      } else writeJson(res, 200, { ok: true, value })
    } catch (error) {
      const code = /^execution-[a-z-]+$/.test(error.message) ? error.message : 'execution-refused'
      writeJson(res, code === 'execution-invalid-request' ? 400 : 409, { ok: false, error: { code, message: code } })
    }
    return
  }
  if (req.method === 'POST' && executionActions.busy()) {
    writeJson(res, 409, { ok: false, error: { code: 'execution-busy', message: 'execution-busy' } })
    return
  }
  if (pathname.startsWith(`${ROUTE_PREFIX}/source/`)) {
    if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'method not allowed' } }); return }
    const action = pathname.slice(`${ROUTE_PREFIX}/source/`.length)
    if (!Object.hasOwn(sourceActions, action)) { writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'not found' } }); return }
    try {
      const value = await sourceActions[action](await readJsonBody(req))
      writeJson(res, 200, { ok: true, value })
    } catch (error) {
      const message = String(error.message ?? '')
      const code = /^(source-[a-z-]+|github-[a-z0-9-]+|confirmation-required)$/.test(message) ? message
        : /request body/.test(message) ? 'source-invalid-request' : 'source-operation-refused'
      writeJson(res, code === 'source-invalid-request' ? 400 : 409, { ok: false, error: { code, message: code } })
    }
    return
  }
  if (pathname.startsWith(`${ROUTE_PREFIX}/install/`) || pathname.startsWith(`${ROUTE_PREFIX}/packages/`) || pathname.startsWith(`${ROUTE_PREFIX}/maintenance/`)) {
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: { message: 'method not allowed' } })
      return
    }
    try {
      const payload = await readJsonBody(req)
      const actions = pathname.startsWith(`${ROUTE_PREFIX}/install/`) ? installActions : pathname.startsWith(`${ROUTE_PREFIX}/packages/`) ? packageActions : maintenanceActions
      const action = pathname.slice(pathname.lastIndexOf('/') + 1)
      if (!Object.hasOwn(actions, action)) {
        writeJson(res, 404, { ok: false, error: { message: 'not found' } })
        return
      }
      const value = await actions[action](payload)
      writeJson(res, 200, { ok: true, value })
    } catch (error) {
      writeJson(res, 409, { ok: false, error: { code: 'install-refused', message: String(error.message ?? error) } })
    }
    return
  }
  if (pathname === `${ROUTE_PREFIX}/action`) {
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: { message: 'method not allowed' } })
      return
    }
    try {
      const payload = await readJsonBody(req)
      if (payload?.action !== 'set-component-enabled') {
        writeJson(res, 400, { ok: false, error: { code: 'invalid-action', message: 'unsupported action' } })
        return
      }
      if (payload.confirm !== true) {
        writeJson(res, 400, { ok: false, error: { code: 'confirmation-required', message: 'explicit confirmation is required' } })
        return
      }
      if (typeof payload.component !== 'string' || typeof payload.enabled !== 'boolean') {
        writeJson(res, 400, { ok: false, error: { code: 'invalid-action', message: 'component and enabled are required' } })
        return
      }
      const result = await setEnabled(payload.component, payload.enabled)
      if (result.ok !== true) {
        writeJson(res, 409, {
          ok: false,
          error: {
            code: result.code ?? 'action-refused',
            message: result.message ?? 'action refused',
            ...(Array.isArray(result.blockers) && result.blockers.length > 0 ? { blockers: result.blockers } : {}),
          },
        })
        return
      }
      writeJson(res, 200, { ok: true, value: result.value })
    } catch (error) {
      writeJson(res, 400, { ok: false, error: { code: 'invalid-request', message: String(error.message ?? error) } })
    }
    return
  }
  if (req.method !== 'GET') {
    writeJson(res, 405, { ok: false, error: { message: 'method not allowed' } })
    return
  }
  if (pathname === `${ROUTE_PREFIX}/ping`) {
    writeJson(res, 200, { ok: true, value: { service: 'guide-manager', readOnly: false, actionScope: 'phase-4' } })
    return
  }
  if (pathname !== `${ROUTE_PREFIX}/state`) {
    writeJson(res, 404, { ok: false, error: { message: 'not found' } })
    return
  }
  try {
    writeJson(res, 200, { ok: true, value: await getState() })
  } catch (error) {
    writeJson(res, 500, { ok: false, error: { message: String(error.message ?? error) } })
  }
}

export const name = 'guide-manager'

export async function apply(ctx, config = {}) {
  const remote = createRemoteManager({ profile: serviceOf(ctx, 'profileContext'), sourceConfig: config.source, sourcePath: config.sourcePath,
    host: readBom().guide.host, managerRoot: PACKAGE_DIR })
  remoteManagers.set(ctx, remote)
  const execution = createExecutionController({ profile: serviceOf(ctx, 'profileContext'), managerRoot: PACKAGE_DIR })
  executionManagers.set(ctx, execution)
  if (typeof ctx.effect === 'function') ctx.effect(() => () => { remote.dispose(); remoteManagers.delete(ctx); executionManagers.delete(ctx) })
  const getState = () => collectState(ctx, config)
  const setEnabled = async (key, enabled) => (await getState()).execution.active ? { ok: false, code: 'execution-busy', message: 'execution-busy' } : setComponentEnabled(ctx, key, enabled, config)
  const executionPayload = (p, keys) => {
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some((key) => !keys.includes(key))) throw Error('execution-invalid-request')
  }
  const executionActions = {
    plan: async (p) => { executionPayload(p, ['pendingId']); return execution.plan(await getState(), p.pendingId) },
    start: async (p) => { executionPayload(p, ['planId', 'confirm']); if (p.confirm !== true) throw Error('execution-confirmation-required'); return execution.start(await getState(), p.planId) },
    ack: async (p) => { executionPayload(p, ['taskId', 'confirm']); if (p.confirm !== true) throw Error('execution-confirmation-required'); return execution.acknowledge(await getState(), p.taskId) },
    seen: async (p) => { executionPayload(p, ['taskId', 'confirm']); if (p.confirm !== true) throw Error('execution-confirmation-required'); return execution.seen(p.taskId) },
    busy: () => execution.busy(),
  }
  const installActions = {
    plan: (payload) => planInstallation(ctx, config, payload.components),
    stage: (payload) => prepareInstallation(ctx, config, payload),
    cancel: (payload) => cancelInstallation(ctx, payload),
  }
  const packageActions = {
    plan: (payload) => packagePlan(ctx, config, { ...payload, kind: 'package-upgrade' }),
    'restore-plan': (payload) => packagePlan(ctx, config, { ...payload, kind: 'package-restore' }),
    stage: (payload) => preparePackage(ctx, config, payload),
    cancel: (payload) => cancelPackage(ctx, payload),
  }
  const maintenanceActions = {
    plan: (payload) => maintenancePlan(ctx, config, payload),
    stage: async (payload) => {
      if (payload.confirm !== true) throw new Error('confirmation-required')
      return stageMaintenance(await maintenancePlan(ctx, config, payload), payload.planId, PACKAGE_DIR)
    },
    cancel: (payload) => {
      if (payload.confirm !== true) throw new Error('confirmation-required')
      return cancelMaintenance(serviceOf(ctx, 'profileContext')?.dir, payload.planId)
    },
  }
  const sourcePayload = (payload, keys) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some((key) => !keys.includes(key))) throw new Error('source-invalid-request')
    return payload
  }
  const sourceActions = {
    check: (p) => { sourcePayload(p, []); return remote.check() },
    prepare: async (p) => { sourcePayload(p, ['kind', 'snapshotId', 'components', 'targets', 'version']); return remote.prepare(p, await getState()) },
    task: (p) => { sourcePayload(p, ['taskId']); return remote.task(p.taskId) },
    cancel: (p) => { sourcePayload(p, ['taskId']); return remote.cancel(p.taskId) },
    plan: async (p) => { sourcePayload(p, ['taskId']); return remote.plan(p.taskId, await getState()) },
    stage: async (p) => {
      sourcePayload(p, ['taskId', 'planId', 'confirm'])
      if (p.confirm !== true) throw new Error('confirmation-required')
      return remote.stage(p.taskId, p.planId, await getState())
    },
  }
  ctx.provide('guideManager', { getState, setComponentEnabled: setEnabled, planInstallation: installActions.plan, prepareInstallation: installActions.stage, cancelInstallation: installActions.cancel,
    planExecution: executionActions.plan, startExecution: executionActions.start, acknowledgeExecution: executionActions.ack,
    checkSource: remote.check, prepareSource: async (payload) => remote.prepare(payload, await getState()),
    sourceTask: remote.wait, cancelSourceTask: remote.cancel,
    planPreparedSource: async (id) => remote.plan(id, await getState()),
    stagePreparedSource: async (payload) => { if (payload.confirm !== true) throw new Error('confirmation-required'); return remote.stage(payload.taskId, payload.planId, await getState()) },
    planUpgrade: packageActions.plan, planPackageRestore: packageActions['restore-plan'], preparePackageChange: packageActions.stage, cancelPackageChange: packageActions.cancel,
    planMaintenance: maintenanceActions.plan, prepareMaintenance: maintenanceActions.stage, cancelMaintenance: maintenanceActions.cancel,
    readOnly: false, actionScope: 'phase-4', packageActionScope: 'phase-5b' })
  ctx.inject(['webServer', 'connection'], (injected) => {
    const webServer = serviceOf(injected, 'webServer')
    const connection = serviceOf(injected, 'connection')
    if (typeof webServer?.register !== 'function' || typeof connection?.requestRejection !== 'function') return
    injected.effect(() => webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: (req, res) => {
        void handle(injected, getState, setEnabled, installActions, packageActions, maintenanceActions, sourceActions, executionActions, req, res)
      },
    }), 'guide-manager: status and phase-4 action route')
  })
}

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  COMPONENTS,
  MANAGER_ACTION,
  actionForComponent,
  buildEdges,
  coldIntent,
  componentStatus,
  hostStatus,
  normalizeActionResult,
  readSkillsState,
} from './core.js'

/**
 * Read-only Host half of the guidance manager.
 *
 * It deliberately imports none of the components it reports on: a disabled or
 * broken panel must not take the manager down with it. The only package facts
 * it trusts are the installed manifests, the official `pluginManager` snapshot,
 * the components' own optional state services, and the user-level skill files.
 * No method in this file writes a profile, a package, or a skill.
 */

const ROUTE_PREFIX = '/guide-manager/api'
const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = resolve(PACKAGE_DIR, '..')
const HELPER_PATH = join(PACKAGE_DIR, 'helper', 'restart-guide-manager.cmd')
const HELPER_PS1 = join(PACKAGE_DIR, 'helper', 'restart-guide-manager.ps1')
const HELPER_APPLY = join(PACKAGE_DIR, 'helper', 'apply-pending.mjs')
const PENDING_VERSION = 1

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

function collectComponents(ctx, pluginData, guide, profileContext, host, pendingByComponent = new Map()) {
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
      status: status.status,
      reason: status.reason,
      versionMatch: status.versionMatch,
      contractMatch: status.contractMatch,
    }
  })
  for (const component of components) {
    component.action = actionForComponent(component, components, host)
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
  const host = readHostState(ctx, profileContext, bom.guide.host ?? {})
  host.artifacts = config?.checkArtifacts === false
    ? { checked: false, verified: null, items: [] }
    : readArtifactState(ctx, profileContext, bom.guide.artifacts ?? {})
  const pluginData = await readPluginData(ctx, profileContext)
  const pending = pendingView(profileContext)
  const components = collectComponents(ctx, pluginData, bom.guide, profileContext, host, pending.byComponent)
  const edges = buildEdges(components, bom.guide.edges ?? [], pluginData.rows)
  const skills = readSkillsState(profileContext?.home)
  const manager = checkManager(ctx)
  const state = {
    product: bom.guide.product ?? 'dsh-guide-mode',
    release: bom.guide.release ?? bom.manifest.version ?? null,
    readOnly: false,
    actionScope: 'phase-2',
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
    dataSource: pluginData.mode,
    dataError: pluginData.error,
    generatedAt: new Date().toISOString(),
  }
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

async function handle(injected, getState, setEnabled, req, res) {
  const connection = serviceOf(injected, 'connection')
  const rejection = typeof connection?.requestRejection === 'function' ? connection.requestRejection(req) : undefined
  if (rejection !== undefined) {
    writeJson(res, typeof rejection === 'number' ? rejection : 403, { ok: false, error: { message: 'forbidden' } })
    return
  }
  const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
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
    writeJson(res, 200, { ok: true, value: { service: 'guide-manager', readOnly: false, actionScope: 'phase-2' } })
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
  const getState = () => collectState(ctx, config)
  const setEnabled = (key, enabled) => setComponentEnabled(ctx, key, enabled, config)
  ctx.provide('guideManager', { getState, setComponentEnabled: setEnabled, readOnly: false, actionScope: 'phase-2' })
  ctx.inject(['webServer', 'connection'], (injected) => {
    const webServer = serviceOf(injected, 'webServer')
    const connection = serviceOf(injected, 'connection')
    if (typeof webServer?.register !== 'function' || typeof connection?.requestRejection !== 'function') return
    injected.effect(() => webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: (req, res) => {
        void handle(injected, getState, setEnabled, req, res)
      },
    }), 'guide-manager: status and phase-2 action route')
  })
}

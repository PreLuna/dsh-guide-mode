import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { COMPONENTS, buildEdges, componentStatus, hostStatus, readSkillsState } from './core.js'

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

function collectComponents(ctx, pluginData, guide, profileContext, hostVerified) {
  const definitions = guide.components ?? {}
  return [...COMPONENTS].sort((a, b) => a.order - b.order).map((component) => {
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
      hostVerified,
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
  if (state.dataSource === 'profile-fallback') warnings.push('data:profile-fallback')
  return [...new Set(warnings)]
}

async function collectState(ctx) {
  const bom = readBom()
  const profileContext = serviceOf(ctx, 'profileContext')
  const host = readHostState(ctx, profileContext, bom.guide.host ?? {})
  const pluginData = await readPluginData(ctx, profileContext)
  const components = collectComponents(ctx, pluginData, bom.guide, profileContext, host.verified)
  const edges = buildEdges(components, bom.guide.edges ?? [], pluginData.rows)
  const skills = readSkillsState(profileContext?.home)
  const manager = checkManager(ctx)
  const state = {
    product: bom.guide.product ?? 'dsh-guide-mode',
    release: bom.guide.release ?? bom.manifest.version ?? null,
    readOnly: true,
    manager: { ...manager, version: bom.manifest.version ?? null },
    profile: {
      name: profileContext?.name ?? null,
      dir: profileContext?.dir ?? null,
      installAnchor: profileContext?.installAnchor ?? null,
    },
    host,
    components,
    edges,
    skills,
    dataSource: pluginData.mode,
    dataError: pluginData.error,
    generatedAt: new Date().toISOString(),
  }
  state.warnings = buildWarnings(state)
  return state
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

async function handle(injected, getState, req, res) {
  const connection = serviceOf(injected, 'connection')
  const rejection = typeof connection?.requestRejection === 'function' ? connection.requestRejection(req) : undefined
  if (rejection !== undefined) {
    writeJson(res, typeof rejection === 'number' ? rejection : 403, { ok: false, error: { message: 'forbidden' } })
    return
  }
  if (req.method !== 'GET') {
    writeJson(res, 405, { ok: false, error: { message: 'method not allowed' } })
    return
  }
  const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
  if (pathname === `${ROUTE_PREFIX}/ping`) {
    writeJson(res, 200, { ok: true, value: { service: 'guide-manager', readOnly: true } })
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

export async function apply(ctx) {
  const getState = () => collectState(ctx)
  ctx.provide('guideManager', { getState, readOnly: true })
  ctx.inject(['webServer', 'connection'], (injected) => {
    const webServer = serviceOf(injected, 'webServer')
    const connection = serviceOf(injected, 'connection')
    if (typeof webServer?.register !== 'function' || typeof connection?.requestRejection !== 'function') return
    injected.effect(() => webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: (req, res) => {
        void handle(injected, getState, req, res)
      },
    }), 'guide-manager: read-only status route')
  })
}

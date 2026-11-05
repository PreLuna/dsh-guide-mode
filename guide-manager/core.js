import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Pure status model for the read-only manager. Nothing in this file starts a
 * plugin, writes a file, or imports a managed component: tests can exercise it
 * with plain fixtures, and the Host half can keep reporting when one of the
 * components it describes is disabled or broken.
 */

export const COMPONENTS = [
  { key: 'panel', package: '@local/dsh-guide-panel', service: 'guidePanelCompatibility', state: 'getState', order: 10 },
  { key: 'admission', package: '@local/dsh-guide-admission', service: 'guideAdmission', state: 'state', order: 20 },
  { key: 'shield', package: '@local/dsh-guide-shield', service: 'guideSettlementShield', state: 'getState', order: 30 },
  { key: 'preset', package: '@local/dsh-guide-preset', service: null, state: null, order: 40 },
  { key: 'sidebar', package: '@local/dsh-guide-sidebar-adapter', service: 'guideSidebarHost', state: 'getState', order: 50 },
  { key: 'goal', package: '@local/dsh-guide-goal-adapter', service: 'guideGoalAdapter', state: 'getState', order: 60 },
]

const READY = new Set(['ready', 'ready-unverified'])

/**
 * Action policy. Phase 1A keeps panel/sidebar hot; Phase 1B stages the cold
 * core and the goal pair as pending intents that a restart helper applies while
 * the Host is stopped. The preset stays locked because it affects session
 * recovery, and the manager is always protected.
 */
export const ACTION_POLICIES = {
  panel: { policy: 'hot', reason: null },
  sidebar: { policy: 'hot', reason: null },
  admission: { policy: 'restart-required', reason: 'cold-core' },
  shield: { policy: 'restart-required', reason: 'cold-core' },
  goal: { policy: 'paired-restart', reason: 'goal-driver-exclusion' },
  preset: { policy: 'locked', reason: 'session-recovery' },
}

export const MANAGER_ACTION = { policy: 'locked', reason: 'self-protection', canToggle: false, kind: 'locked', blockers: [] }

export const PANEL_REQUIREMENTS = ['preset', 'admission', 'shield']

/**
 * Profile patch rows for the cold intents. The goal pair is atomic: enabling
 * the adapter disables the original driver, and disabling the adapter restores
 * it, so the two can never both be disabled or both enabled.
 */
export const COLD_PATCHES = {
  admission: [
    { patchId: 'guide-admission', moduleName: '@local/dsh-guide-admission', opposite: false },
  ],
  shield: [
    { patchId: 'guide-settlement-shield', moduleName: '@local/dsh-guide-shield', opposite: false },
  ],
  goal: [
    { patchId: 'guide-goal-adapter', moduleName: '@local/dsh-guide-goal-adapter', opposite: false },
    { patchId: 'goal-round-driver', moduleName: '@deepseek-ai/dsh-goal-round-driver', opposite: true },
  ],
}

/** Build the pending patch list for a cold component toggle. */
export function coldIntent(component, enabled) {
  const specs = COLD_PATCHES[component]
  if (specs === undefined) return null
  return {
    component,
    enabled,
    patches: specs.map((spec) => ({
      patchId: spec.patchId,
      moduleName: spec.moduleName,
      enabled: spec.opposite ? !enabled : enabled,
    })),
  }
}

const HARD_BLOCKING = new Set(['missing', 'disabled', 'incompatible', 'failed'])

/** Artifacts whose exact bytes the action gate must verify for each component. */
export const ARTIFACT_REQUIREMENTS = {
  panel: ['@deepseek-ai/dsh-subagent', '@deepseek-ai/cordis'],
  admission: ['@deepseek-ai/dsh-subagent', '@deepseek-ai/cordis'],
  shield: ['@deepseek-ai/dsh-subagent', '@deepseek-ai/cordis'],
  preset: ['@deepseek-ai/dsh-subagent', '@deepseek-ai/cordis'],
  sidebar: ['dsh-better-sidebar', '@deepseek-ai/dsh-client-modules'],
  goal: ['@deepseek-ai/dsh-goal-round-driver', '@deepseek-ai/dsh-subagent', '@deepseek-ai/cordis'],
}

/** Required components that would make enabling the panel a broken mount. */
export function dependencyBlockers(component, components = []) {
  if (component?.key !== 'panel') return []
  const byKey = new Map(components.map((item) => [item.key, item]))
  const blockers = []
  for (const key of PANEL_REQUIREMENTS) {
    const target = byKey.get(key)
    if (target === undefined) {
      blockers.push({ key, status: 'unknown', reason: 'requirement-missing' })
      continue
    }
    if (HARD_BLOCKING.has(target.status)) blockers.push({ key, status: target.status, reason: target.reason ?? null })
  }
  return blockers
}

/**
 * Pre-action compatibility gate. Enabling is blocked by missing contracts,
 * failed components, panel dependency conflicts and known artifact mismatches;
 * disabling stays available for recovery. Version/build/version drift are
 * warnings unless a required artifact is known to be wrong.
 */
export function actionGate(component, components = [], host = null, enabled = false, skills = null) {
  const blockers = []
  const warnings = []
  if (enabled) {
    if (!component.installed) blockers.push({ code: 'not-installed' })
    if (component.bundleEnabled === null) blockers.push({ code: 'enablement-unknown' })
    if (component.bundleError) blockers.push({ code: 'bundle-error', reason: component.bundleError.code ?? component.bundleError.reason ?? 'bundle-error' })
    if (component.contractMatch === false) blockers.push({ code: 'contract-mismatch' })
    if (component.status === 'unsupported' || component.status === 'failed' || component.status === 'incompatible') {
      blockers.push({ code: 'component-unsupported', reason: component.reason ?? component.status })
    }
    if (component.key === 'panel') {
      for (const dep of dependencyBlockers(component, components)) {
        blockers.push({ code: 'dependency', key: dep.key, status: dep.status, reason: dep.reason })
      }
    }
    if (component.key === 'sidebar' && host?.betterSidebar?.match === false) {
      blockers.push({ code: 'sidebar-host-mismatch' })
    }
    if (host?.artifacts?.checked === true) {
      for (const name of ARTIFACT_REQUIREMENTS[component.key] ?? []) {
        const item = host.artifacts.items?.find((entry) => entry.name === name)
        if (item === undefined || item.match === null) warnings.push({ code: 'artifact-unknown', name })
        else if (item.match === false) blockers.push({ code: 'artifact-mismatch', name })
      }
    }
    if (host?.verified === false) warnings.push({ code: 'host-version-unverified' })
    if (component.versionMatch === false) warnings.push({ code: 'version-drift' })
    if (component.contractMatch === null) warnings.push({ code: 'contract-unknown' })
    if (component.status === 'degraded') warnings.push({ code: 'component-degraded' })
    if (skills !== null && skills?.status !== 'ready') {
      warnings.push({ code: 'skill-not-ready', status: skills?.status ?? 'unknown', reason: skills?.reason ?? null })
    }
  } else if (host?.artifacts?.checked === true && host.artifacts.verified === false) {
    warnings.push({ code: 'host-artifacts-unverified' })
  }
  return { allowed: blockers.length === 0, blockers, warnings }
}

/**
 * Derive one component's action affordance from its runtime status and the
 * cross-component requirements. `canToggle` is the final gate the Host checks
 * again before it calls the official pluginManager.
 */
export function actionForComponent(component, components = [], host = null, skills = null) {
  const base = ACTION_POLICIES[component?.key] ?? { policy: 'locked', reason: 'unknown-component' }
  const enabled = typeof component?.enabled === 'boolean' ? component.enabled : component?.bundleEnabled === true
  const hot = base.policy === 'hot'
  const cold = base.policy === 'restart-required' || base.policy === 'paired-restart'
  const gate = {
    enable: actionGate(component, components, host, true, skills),
    disable: actionGate(component, components, host, false, skills),
  }
  if (!hot && !cold) {
    return { ...base, enabled, canToggle: false, kind: 'locked', gate, blockers: [{ code: 'locked' }], warnings: [] }
  }
  if (!component.installed) {
    return { ...base, enabled: false, canToggle: false, kind: cold ? 'cold' : 'hot', gate, blockers: gate.enable.blockers, warnings: [], reason: 'not-installed' }
  }
  const direction = enabled ? gate.disable : gate.enable
  const first = direction.blockers[0]
  const reason = first === undefined
    ? null
    : first.code === 'dependency'
      ? 'dependency-conflict'
      : first.code === 'sidebar-host-mismatch'
        ? 'unsupported-sidebar-host'
        : first.code
  return {
    ...base,
    enabled,
    canToggle: direction.allowed,
    kind: cold ? 'cold' : 'hot',
    gate,
    blockers: direction.blockers,
    warnings: direction.warnings,
    reason,
  }
}

/** Normalize the official pluginManager action result for the client. */
export function normalizeActionResult(result, component, enabled) {
  const application = typeof result === 'string' ? result : result?.application ?? 'unknown'
  const rawError = typeof result === 'object' && result !== null ? result.error : undefined
  const error = rawError === undefined || rawError === null
    ? null
    : { code: rawError.code ?? null, message: rawError.diagnostic ?? rawError.message ?? null }
  return {
    component,
    enabled: typeof result === 'object' && result !== null && typeof result.enabled === 'boolean' ? result.enabled : enabled,
    application,
    restartReason: typeof result === 'object' && result !== null ? result.restartReason ?? null : null,
    changed: typeof result === 'object' && result !== null && result.changed === true,
    error,
  }
}

/** Classify a profile dependency spec into an update source. */
export function dependencySource(spec) {
  const value = typeof spec === 'string' ? spec.trim() : ''
  if (value === '') return { kind: 'unknown', path: null }
  if (value.startsWith('link:')) return { kind: 'link', path: value.slice(5) }
  if (value.startsWith('file:')) return { kind: 'file', path: value.slice(5) }
  if (value.startsWith('workspace:')) return { kind: 'workspace', path: null }
  if (/\.(tgz|tar\.gz)(\?.*)?$/i.test(value)) return { kind: 'tarball', path: null }
  if (/^(git\+|git:|github:|https?:\/\/)/i.test(value)) return { kind: 'git', path: null }
  return { kind: 'registry', path: null }
}

/** Local sources reload from disk; package sources are handled by the official Plugins page. */
export function updateModeFor(kind) {
  if (kind === 'link' || kind === 'file' || kind === 'workspace') return 'source-reload'
  if (kind === 'registry' || kind === 'git' || kind === 'tarball') return 'package-manager'
  return 'unavailable'
}

/** Whether a local package file was written after this Host started. */
export function sourceChangedSince(latestMtime, hostStartedAt) {
  if (!Number.isFinite(latestMtime) || !Number.isFinite(hostStartedAt)) return null
  return latestMtime > hostStartedAt + 1000
}

/** SHA-256 of a UTF-8 string, used for the skill file fingerprint. */
export function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

/**
 * Derive one component's status from installed/bundle/row/service facts.
 * Version drift and an unverified host build are warnings, not failures: the
 * user may run a technically compatible combination whose exact versions are
 * outside the verified set.
 */
export function componentStatus({
  installed = false,
  bundleError = null,
  bundleEnabled = false,
  rows = [],
  service = null,
  expectedVersion = null,
  actualVersion = null,
  expectedContract = null,
  actualContract = null,
  hostVerified = null,
} = {}) {
  const versionMatch = expectedVersion == null ? null : actualVersion === expectedVersion
  const contractMatch = expectedContract == null ? null : actualContract === expectedContract
  const base = { versionMatch, contractMatch }
  const at = (status, reason = null, extra = {}) => ({ status, reason, ...base, ...extra })

  if (!installed) return at('missing', 'not-installed')
  if (bundleError) return at('incompatible', bundleError.code ?? bundleError.reason ?? 'bundle-error', { bundleError })
  if (bundleEnabled === null) return at('unknown', 'enablement-unknown')
  if (bundleEnabled !== true) return at('disabled', 'bundle-disabled')
  if (rows.length > 0 && !rows.some((row) => row.enabled === true)) return at('disabled', 'row-disabled')
  if (rows.some((row) => row.fiberPhase === 'failed')) return at('failed', 'fiber-failed')

  if (service !== null) {
    if (service.available === false) return at('degraded', 'service-unavailable')
    if (service.error) return at('degraded', 'service-error', { serviceError: service.error })
    const state = service.state
    if (state === null || state === undefined) return at('degraded', 'service-state-unavailable')
    if (state.supported === false || state.mode === 'unsupported') return at('unsupported', state.reason ?? 'service-unsupported')
    if (state.mode === 'partial' || state.mode === 'degraded' || state.mode === 'off' || state.writable === false) {
      return at('degraded', state.reason ?? `service-${state.mode}`)
    }
    if (state.mode === 'native') return at('degraded', state.reason ?? 'native-fallback')
    if (state.mode === 'starting' || state.mode === 'reconciling') return at('unknown', state.reason ?? `service-${state.mode}`)
  }

  const reasons = []
  if (versionMatch === false) reasons.push('installed-version-differs')
  if (contractMatch === false) reasons.push(actualContract == null ? 'contract-undeclared' : 'contract-version-differs')
  if (hostVerified === false) reasons.push('host-build-unverified')
  if (reasons.length > 0) return at('ready-unverified', reasons.join(','))
  return at('ready')
}

/** Compare the running host identity with the manager's verified host set. */
export function hostStatus(actual = {}, expected = {}) {
  const field = (value) => {
    if (typeof value === 'string') return { version: value, commit: null }
    if (value !== null && typeof value === 'object') return { version: value.version ?? null, commit: value.commit ?? null }
    return { version: null, commit: null }
  }
  const dsh = field(actual.dsh)
  const cordis = field(actual.cordis)
  const betterSidebar = field(actual.betterSidebar)
  const dshMatch = expected.dsh == null ? null : dsh.version === expected.dsh
  const buildMatch = expected.build == null ? null : dsh.commit == null ? null : dsh.commit.startsWith(expected.build)
  const cordisMatch = expected.cordis == null ? null : cordis.version === expected.cordis
  const sidebarMatch = expected.betterSidebar == null ? null : betterSidebar.version === expected.betterSidebar
  const checked = [dshMatch, cordisMatch, sidebarMatch].filter((value) => value !== null)
  const buildChecked = expected.build == null ? [] : [buildMatch === true]
  const verified = checked.length === 0 && buildChecked.length === 0
    ? null
    : [...checked, ...buildChecked].every((value) => value === true)
  return {
    dsh: { expected: expected.dsh ?? null, actual: dsh.version, commit: dsh.commit, match: dshMatch, buildExpected: expected.build ?? null, buildMatch },
    cordis: { expected: expected.cordis ?? null, actual: cordis.version, match: cordisMatch },
    betterSidebar: { expected: expected.betterSidebar ?? null, actual: betterSidebar.version, match: sidebarMatch },
    verified,
  }
}

/** Derive the cross-component edges. The goal edge is a mutual exclusion. */
export function buildEdges(components = [], edgeDefs = [], rows = []) {
  const byKey = new Map(components.map((component) => [component.key, component]))
  return edgeDefs.map((edge) => {
    const base = { from: edge.from, to: edge.to, optional: edge.optional === true }
    const from = byKey.get(edge.from)
    if (from === undefined || !READY.has(from.status)) {
      return { ...base, status: 'inactive', reason: `source-${from?.status ?? 'unknown'}` }
    }
    if (typeof edge.to === 'string' && edge.to.startsWith('@')) {
      const driverRows = rows.filter((row) => row.moduleName === edge.to)
      const driverEnabled = driverRows.some((row) => row.enabled === true)
      const adapterEnabled = from.rows?.length
        ? from.rows.some((row) => row.enabled === true)
        : from.bundleEnabled === true
      if (adapterEnabled && driverEnabled) return { ...base, status: 'conflict', reason: 'both-driver-and-adapter-enabled' }
      if (adapterEnabled && !driverEnabled) return { ...base, status: 'ready', reason: 'adapter-owns-driver' }
      if (!adapterEnabled && driverEnabled) return { ...base, status: 'native', reason: 'original-driver-enabled' }
      return { ...base, status: 'blocked', reason: 'neither-driver-nor-adapter-enabled' }
    }
    const to = byKey.get(edge.to)
    if (to === undefined) return { ...base, status: 'unknown', reason: 'target-unknown' }
    if (to.status === 'missing' || to.status === 'disabled') {
      return { ...base, status: edge.optional === true ? 'optional-absent' : 'degraded', reason: `target-${to.status}` }
    }
    if (to.status === 'unsupported' || to.status === 'failed' || to.status === 'incompatible') {
      return { ...base, status: 'degraded', reason: `target-${to.status}` }
    }
    return { ...base, status: 'ready', reason: to.status === 'ready-unverified' ? 'target-unverified' : null }
  })
}

function walkFiles(directory, result) {
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (result.files >= 1000) return
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walkFiles(path, result)
    else if (entry.isFile()) {
      result.files += 1
      try {
        result.bytes += statSync(path).size
      } catch {
        // A file that disappears during the read still counts as seen.
      }
    }
  }
}

function readSkillsData(home) {
  const directory = join(home, 'skills-guide')
  const exists = existsSync(directory)
  const result = { path: directory, present: exists, files: 0, bytes: 0, routes: existsSync(join(directory, '02-routes.md')) }
  if (exists) walkFiles(directory, result)
  return result
}

function readSkillsManagerState(path) {
  if (!existsSync(path)) return null
  try {
    const doc = JSON.parse(readFileSync(path, 'utf8'))
    const disabledList = doc?.disabledSkills?.dsh
    return { disabled: Array.isArray(disabledList) && disabledList.includes('guide'), sources: doc?.sources ?? null }
  } catch (error) {
    return { disabled: null, error: String(error.message ?? error) }
  }
}

/** Parse the small YAML frontmatter block used by SKILL.md files. */
export function parseSkillFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (match === null) return {}
  const result = {}
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (key !== '') result[key] = value
  }
  return result
}

/** Read the human version line from the guide skill body, when present. */
export function skillVersion(text) {
  const match = /(?:^|\n)>\s*版本[:：]\s*(v?[0-9][^\s·]*)/.exec(text)
    ?? /版本[:：]\s*(v?[0-9][^\s·]*)/.exec(text)
  return match?.[1] ?? null
}

/**
 * Read the guide skill and the local routing data it depends on. The skill is
 * user-level ($DSH_HOME/skills), not profile-level, and the skills manager owns
 * its disable state; this only reports facts and never writes them.
 */
export function readSkillsState(home) {
  if (typeof home !== 'string' || home === '') {
    return { status: 'unknown', reason: 'home-unavailable', present: false, disabled: null, data: null }
  }
  const path = join(home, 'skills', 'guide', 'SKILL.md')
  const statePath = join(home, 'skills-manager', 'state.json')
  const present = existsSync(path)
  let text = null
  let error = null
  if (present) {
    try {
      text = readFileSync(path, 'utf8')
    } catch (reason) {
      error = String(reason.message ?? reason)
    }
  }
  const data = readSkillsData(home)
  const state = readSkillsManagerState(statePath)
  const disabled = state?.disabled ?? null
  let status = 'ready'
  let reason = null
  if (!present) {
    status = 'missing'
    reason = 'skill-file-missing'
  } else if (error !== null) {
    status = 'degraded'
    reason = 'skill-file-unreadable'
  } else if (disabled === true) {
    status = 'disabled'
    reason = 'disabled-by-skills-manager'
  } else if (!data.present || !data.routes) {
    status = 'degraded'
    reason = data.present ? 'missing-02-routes' : 'missing-skills-guide-data'
  }
  return {
    status,
    reason,
    present,
    path,
    error,
    version: text === null ? null : skillVersion(text),
    hash: text === null ? null : sha256(text),
    frontmatter: text === null ? null : parseSkillFrontmatter(text),
    disabled,
    data,
    statePath,
    statePresent: state !== null,
    state,
  }
}

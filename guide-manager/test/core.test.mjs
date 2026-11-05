import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  ACTION_POLICIES,
  ARTIFACT_REQUIREMENTS,
  COMPONENTS,
  MANAGER_ACTION,
  actionForComponent,
  actionGate,
  buildEdges,
  coldIntent,
  componentStatus,
  dependencyBlockers,
  dependencySource,
  hostStatus,
  normalizeActionResult,
  parseSkillFrontmatter,
  readSkillsState,
  skillVersion,
  sourceChangedSince,
  updateModeFor,
} from '../core.js'

const readyService = { available: true, state: { mode: 'ready' }, error: null }

function component(key, status, extra = {}) {
  return { key, status, bundleEnabled: true, rows: [], ...extra }
}

test('component order is the product order', () => {
  assert.deepEqual(COMPONENTS.map((item) => item.key), ['panel', 'admission', 'shield', 'preset', 'sidebar', 'goal'])
  assert.ok(COMPONENTS.every((item) => item.package.startsWith('@local/dsh-guide-')))
})

test('missing, incompatible, disabled and failed are distinct states', () => {
  assert.equal(componentStatus().status, 'missing')
  assert.equal(componentStatus({ installed: true, bundleError: { code: 'incompatible-version' }, bundleEnabled: true }).status, 'incompatible')
  assert.equal(componentStatus({ installed: true, bundleEnabled: false }).status, 'disabled')
  assert.equal(componentStatus({
    installed: true,
    bundleEnabled: true,
    rows: [{ enabled: false, fiberPhase: 'pending' }],
  }).status, 'disabled')
  assert.equal(componentStatus({
    installed: true,
    bundleEnabled: true,
    rows: [{ enabled: true, fiberPhase: 'failed' }],
  }).status, 'failed')
})

test('service unsupported and degraded states win over version checks', () => {
  const base = { installed: true, bundleEnabled: true, rows: [{ enabled: true, fiberPhase: 'active' }] }
  assert.equal(componentStatus({
    ...base,
    service: { available: true, state: { supported: false, reason: 'unsupported-build' }, error: null },
  }).status, 'unsupported')
  assert.equal(componentStatus({
    ...base,
    service: { available: true, state: { mode: 'partial', reason: 'partial-wrap' }, error: null },
  }).status, 'degraded')
  assert.equal(componentStatus({
    ...base,
    service: { available: true, state: { mode: 'native', reason: 'unsupported-driver' }, error: null },
  }).status, 'degraded')
  assert.equal(componentStatus({
    ...base,
    service: { available: false, state: null, error: null },
  }).status, 'degraded')
  assert.equal(componentStatus({
    ...base,
    service: { available: true, state: { mode: 'starting' }, error: null },
  }).status, 'unknown')
})

test('unknown enablement is not reported as disabled', () => {
  assert.equal(componentStatus({ installed: true, bundleEnabled: null }).status, 'unknown')
})

test('version and contract drift are unverified, not incompatible', () => {
  const base = {
    installed: true,
    bundleEnabled: true,
    rows: [{ enabled: true, fiberPhase: 'active' }],
    service: readyService,
    expectedVersion: '1.1.0',
    expectedContract: 1,
    hostVerified: true,
  }
  const clean = componentStatus({ ...base, actualVersion: '1.1.0', actualContract: 1 })
  assert.equal(clean.status, 'ready')
  assert.equal(clean.versionMatch, true)
  assert.equal(clean.contractMatch, true)

  const newer = componentStatus({ ...base, actualVersion: '1.2.0', actualContract: 1 })
  assert.equal(newer.status, 'ready-unverified')
  assert.equal(newer.reason, 'installed-version-differs')

  const contract = componentStatus({ ...base, actualVersion: '1.1.0', actualContract: 2 })
  assert.equal(contract.status, 'ready-unverified')
  assert.equal(contract.reason, 'contract-version-differs')

  const undeclared = componentStatus({ ...base, actualVersion: '1.1.0', actualContract: null })
  assert.equal(undeclared.status, 'ready-unverified')
  assert.equal(undeclared.reason, 'contract-undeclared')

  const host = componentStatus({ ...base, actualVersion: '1.1.0', actualContract: 1, hostVerified: false })
  assert.equal(host.status, 'ready-unverified')
  assert.equal(host.reason, 'host-build-unverified')
})

test('host comparison distinguishes version and build drift', () => {
  const expected = { dsh: '0.2.1-rc.3', build: 'be72761', cordis: '4.0.5', betterSidebar: '0.28.2' }
  const matching = hostStatus({
    dsh: { version: '0.2.1-rc.3', commit: 'be72761ee1a6736ebcdf4f3739363b083ae53c98' },
    cordis: '4.0.5',
    betterSidebar: '0.28.2',
  }, expected)
  assert.equal(matching.verified, true)
  assert.equal(matching.dsh.buildMatch, true)

  const noCommit = hostStatus({ dsh: { version: '0.2.1-rc.3', commit: null }, cordis: '4.0.5', betterSidebar: '0.28.2' }, expected)
  assert.equal(noCommit.verified, false)

  const wrongDsh = hostStatus({ dsh: { version: '0.2.2', commit: 'abc' }, cordis: '4.0.5', betterSidebar: '0.28.2' }, expected)
  assert.equal(wrongDsh.verified, false)
  assert.equal(wrongDsh.dsh.match, false)
})

test('goal edge reports adapter ownership, conflicts and a missing driver', () => {
  const goal = component('goal', 'ready', { rows: [{ enabled: true }] })
  const driver = '@deepseek-ai/dsh-goal-round-driver'
  const edge = [{ from: 'goal', to: driver }]

  assert.equal(buildEdges([goal], edge, [{ moduleName: driver, enabled: false }])[0].status, 'ready')
  assert.equal(buildEdges([goal], edge, [{ moduleName: driver, enabled: true }])[0].status, 'conflict')
  assert.equal(buildEdges([goal], edge, [])[0].status, 'ready')

  const nativeGoal = component('goal', 'ready', { rows: [{ enabled: false }] })
  assert.equal(buildEdges([nativeGoal], edge, [{ moduleName: driver, enabled: true }])[0].status, 'native')
  assert.equal(buildEdges([nativeGoal], edge, [{ moduleName: driver, enabled: false }])[0].status, 'blocked')
})

test('optional sidebar absence is not a degraded panel', () => {
  const panel = component('panel', 'ready')
  const sidebar = component('sidebar', 'missing', { bundleEnabled: false })
  const [edge] = buildEdges([panel, sidebar], [{ from: 'panel', to: 'sidebar', optional: true }], [])
  assert.equal(edge.status, 'optional-absent')
  const [required] = buildEdges([panel, sidebar], [{ from: 'panel', to: 'sidebar', optional: false }], [])
  assert.equal(required.status, 'degraded')
})

test('frontmatter and version parsing stay tolerant of real SKILL.md files', () => {
  const text = `---\nname: guide\ndescription: "Route the user to one skill"\nargument-hint: where are you?\n---\n\n# Guide\n\n> 版本：v2.1 · 2026-10-30\n`
  assert.deepEqual(parseSkillFrontmatter(text), {
    name: 'guide',
    description: 'Route the user to one skill',
    'argument-hint': 'where are you?',
  })
  assert.equal(skillVersion(text), 'v2.1')
  assert.deepEqual(parseSkillFrontmatter('no frontmatter'), {})
})

test('skill state distinguishes missing, disabled and incomplete data', () => {
  const root = mkdtempSync(join(tmpdir(), 'guide-manager-skills-'))
  try {
    assert.equal(readSkillsState(root).status, 'missing')
    assert.equal(readSkillsState('').status, 'unknown')

    mkdirSync(join(root, 'skills', 'guide'), { recursive: true })
    writeFileSync(join(root, 'skills', 'guide', 'SKILL.md'), '---\nname: guide\n---\n\n> 版本：v1.0\n')
    assert.equal(readSkillsState(root).status, 'degraded')
    assert.equal(readSkillsState(root).reason, 'missing-skills-guide-data')

    mkdirSync(join(root, 'skills-guide'), { recursive: true })
    writeFileSync(join(root, 'skills-guide', '02-routes.md'), 'routes')
    writeFileSync(join(root, 'skills-guide', '01-mechanics.md'), 'mechanics')
    assert.equal(readSkillsState(root).status, 'ready')

    mkdirSync(join(root, 'skills-manager'), { recursive: true })
    writeFileSync(join(root, 'skills-manager', 'state.json'), JSON.stringify({ disabledSkills: { dsh: ['guide'] } }))
    const disabled = readSkillsState(root)
    assert.equal(disabled.status, 'disabled')
    assert.equal(disabled.disabled, true)
    assert.equal(disabled.data.files, 2)
    assert.equal(disabled.data.routes, true)
    assert.equal(disabled.version, 'v1.0')
    assert.match(disabled.hash, /^[0-9a-f]{64}$/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('action policy keeps panel/sidebar hot and cold components staged', () => {
  assert.equal(ACTION_POLICIES.panel.policy, 'hot')
  assert.equal(ACTION_POLICIES.sidebar.policy, 'hot')
  assert.equal(ACTION_POLICIES.admission.policy, 'restart-required')
  assert.equal(ACTION_POLICIES.shield.policy, 'restart-required')
  assert.equal(ACTION_POLICIES.goal.policy, 'paired-restart')
  assert.equal(ACTION_POLICIES.preset.policy, 'locked')
  assert.equal(MANAGER_ACTION.policy, 'locked')
})

test('action affordances enforce panel dependencies and sidebar host checks', () => {
  const panel = component('panel', 'disabled', { bundleEnabled: false, installed: true })
  const admission = component('admission', 'ready')
  const shield = component('shield', 'ready')
  const preset = component('preset', 'ready')
  const clean = actionForComponent(panel, [panel, admission, shield, preset], { betterSidebar: { match: true } })
  assert.equal(clean.policy, 'hot')
  assert.equal(clean.canToggle, true)

  const blocked = actionForComponent(panel, [panel, admission, shield, component('preset', 'missing')], { betterSidebar: { match: true } })
  assert.equal(blocked.canToggle, false)
  assert.equal(blocked.reason, 'dependency-conflict')
  assert.deepEqual(blocked.blockers.map((item) => item.key), ['preset'])

  const sidebar = component('sidebar', 'disabled', { bundleEnabled: false, installed: true })
  const unsupported = actionForComponent(sidebar, [sidebar], { betterSidebar: { match: false } })
  assert.equal(unsupported.canToggle, false)
  assert.equal(unsupported.reason, 'unsupported-sidebar-host')

  const cold = actionForComponent(component('admission', 'ready', { installed: true }), [], {})
  assert.equal(cold.policy, 'restart-required')
  assert.equal(cold.kind, 'cold')
  assert.equal(cold.canToggle, true)

  const coldMissing = actionForComponent(component('admission', 'missing', { installed: false }), [], {})
  assert.equal(coldMissing.canToggle, false)

  const rowDisabled = component('panel', 'disabled', {
    bundleEnabled: true,
    enabled: false,
    installed: true,
    rows: [{ enabled: false, fiberPhase: 'pending' }],
  })
  const rowAction = actionForComponent(rowDisabled, [rowDisabled, admission, shield, preset], { betterSidebar: { match: true } })
  assert.equal(rowAction.enabled, false)
  assert.equal(rowAction.canToggle, true)
})

test('dependencyBlockers only looks at the panel requirements', () => {
  const panel = component('panel', 'disabled')
  const admission = component('admission', 'disabled')
  const shield = component('shield', 'ready')
  const preset = component('preset', 'ready')
  assert.deepEqual(dependencyBlockers(panel, [panel, admission, shield, preset]), [
    { key: 'admission', status: 'disabled', reason: null },
  ])
  assert.deepEqual(dependencyBlockers(component('sidebar', 'disabled'), [admission]), [])
})

test('official action results are normalized without claiming success', () => {
  assert.deepEqual(normalizeActionResult({ application: 'applied', enabled: false, changed: true }, 'panel', false), {
    component: 'panel',
    enabled: false,
    application: 'applied',
    restartReason: null,
    changed: true,
    error: null,
  })
  const failed = normalizeActionResult({ application: 'failed', error: { code: 'unknown-plugin', diagnostic: 'nope' } }, 'panel', true)
  assert.equal(failed.application, 'failed')
  assert.deepEqual(failed.error, { code: 'unknown-plugin', message: 'nope' })
  assert.equal(normalizeActionResult('overridden', 'panel', true).application, 'overridden')
  assert.equal(normalizeActionResult(undefined, 'panel', true).application, 'unknown')
})

test('cold intents map components to their profile patch rows', () => {
  assert.deepEqual(coldIntent('admission', false), {
    component: 'admission',
    enabled: false,
    patches: [{ patchId: 'guide-admission', moduleName: '@local/dsh-guide-admission', enabled: false }],
  })
  assert.deepEqual(coldIntent('shield', true), {
    component: 'shield',
    enabled: true,
    patches: [{ patchId: 'guide-settlement-shield', moduleName: '@local/dsh-guide-shield', enabled: true }],
  })
  assert.deepEqual(coldIntent('goal', true).patches, [
    { patchId: 'guide-goal-adapter', moduleName: '@local/dsh-guide-goal-adapter', enabled: true },
    { patchId: 'goal-round-driver', moduleName: '@deepseek-ai/dsh-goal-round-driver', enabled: false },
  ])
  assert.deepEqual(coldIntent('goal', false).patches, [
    { patchId: 'guide-goal-adapter', moduleName: '@local/dsh-guide-goal-adapter', enabled: false },
    { patchId: 'goal-round-driver', moduleName: '@deepseek-ai/dsh-goal-round-driver', enabled: true },
  ])
  assert.equal(coldIntent('preset', false), null)
})

test('action gate blocks hard incompatibilities but allows disabling for recovery', () => {
  const admission = component('admission', 'ready', { installed: true, contractMatch: true, versionMatch: true })
  const brokenArtifacts = {
    verified: false,
    artifacts: {
      checked: true,
      verified: false,
      items: [{ name: '@deepseek-ai/dsh-subagent', match: false }],
    },
  }
  const enable = actionGate(admission, [admission], brokenArtifacts, true)
  assert.equal(enable.allowed, false)
  assert.ok(enable.blockers.some((item) => item.code === 'artifact-mismatch' && item.name === '@deepseek-ai/dsh-subagent'))
  assert.ok(enable.warnings.some((item) => item.code === 'host-version-unverified'))

  const disable = actionGate(admission, [admission], brokenArtifacts, false)
  assert.equal(disable.allowed, true)
  assert.ok(disable.warnings.some((item) => item.code === 'host-artifacts-unverified'))

  const contract = actionGate(component('admission', 'ready', { installed: true, contractMatch: false }), [admission], {}, true)
  assert.equal(contract.allowed, false)
  assert.ok(contract.blockers.some((item) => item.code === 'contract-mismatch'))

  const warningOnly = actionGate(admission, [admission], { verified: false, artifacts: { checked: false, verified: null, items: [] } }, true)
  assert.equal(warningOnly.allowed, true)
  assert.ok(warningOnly.warnings.some((item) => item.code === 'host-version-unverified'))
  assert.ok(ARTIFACT_REQUIREMENTS.goal.includes('@deepseek-ai/dsh-goal-round-driver'))
})

test('dependency sources select local reload or the official package manager', () => {
  assert.deepEqual(dependencySource('link:D:/work/guide-panel'), { kind: 'link', path: 'D:/work/guide-panel' })
  assert.deepEqual(dependencySource('file:./pkg.tgz'), { kind: 'file', path: './pkg.tgz' })
  assert.deepEqual(dependencySource('workspace:*'), { kind: 'workspace', path: null })
  assert.equal(dependencySource('0.2.1-rc.3').kind, 'registry')
  assert.equal(dependencySource('git+https://example.test/repo.git').kind, 'git')
  assert.equal(dependencySource('https://example.test/pkg.tgz').kind, 'tarball')
  assert.equal(dependencySource('').kind, 'unknown')
  assert.equal(updateModeFor('link'), 'source-reload')
  assert.equal(updateModeFor('workspace'), 'source-reload')
  assert.equal(updateModeFor('registry'), 'package-manager')
  assert.equal(updateModeFor('unknown'), 'unavailable')
  assert.equal(sourceChangedSince(3000, 1000), true)
  assert.equal(sourceChangedSince(1000, 2000), false)
  assert.equal(sourceChangedSince(null, 1000), null)
})

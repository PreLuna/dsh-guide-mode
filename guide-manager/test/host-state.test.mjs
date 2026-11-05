import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../index.js'
import { COMPONENTS } from '../core.js'

const PACKAGES = COMPONENTS.map((component) => component.package)

function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2))
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'guide-manager-host-'))
  const home = join(root, 'home')
  const profile = join(root, 'profile')
  const install = join(root, 'install')
  mkdirSync(join(home, 'skills', 'guide'), { recursive: true })
  mkdirSync(join(home, 'skills-guide'), { recursive: true })
  mkdirSync(join(home, 'skills-manager'), { recursive: true })
  writeFileSync(join(home, 'skills', 'guide', 'SKILL.md'), '---\nname: guide\ndescription: test\n---\n\n> 版本：v2.1\n')
  writeFileSync(join(home, 'skills-guide', '02-routes.md'), 'routes')
  writeFileSync(join(home, 'skills-manager', 'state.json'), JSON.stringify({ disabledSkills: { dsh: [] } }))
  writeJson(join(profile, 'package.json'), {
    name: 'test-profile',
    private: true,
    dependencies: Object.fromEntries(PACKAGES.map((name) => [name, `link:${join(root, name)}`])),
    dsh: { profile: { bundles: [...PACKAGES] } },
  })
  for (const name of PACKAGES) {
    writeJson(join(profile, 'node_modules', ...name.split('/'), 'package.json'), {
      name,
      version: '1.1.0',
      dshGuide: { component: name.slice('@local/dsh-guide-'.length), contract: 1 },
    })
  }
  writeJson(join(install, 'package.json'), {
    name: '@deepseek-ai/dsh-desktop-runtime',
    version: '0.2.1-rc.3',
    dependencies: { '@deepseek-ai/cordis': '4.0.5' },
  })
  return { root, home, profile, install }
}

function makeCtx(data, { manager = true, bundles, rows, services = {}, setPluginEnabled } = {}) {
  const store = new Map()
  const calls = []
  store.set('profileContext', {
    name: 'test-profile',
    dir: data.profile,
    home: data.home,
    installAnchor: join(data.install, 'package.json'),
  })
  store.set('webServer', { register() {} })
  store.set('connection', { requestRejection() {} })
  store.set('clientModules', { release: { version: '0.2.1-rc.3', commit: 'be72761ee1a6736ebcdf4f3739363b083ae53c98' } })
  store.set('pluginPackages', {
    packageOf(name) {
      if (name === '@deepseek-ai/cordis') return { version: '4.0.5' }
      if (name === 'dsh-better-sidebar') return { version: '0.28.2' }
      if (PACKAGES.includes(name)) return { version: '1.1.0', manifestPath: join(data.profile, 'node_modules', ...name.split('/'), 'package.json') }
      return undefined
    },
  })
  if (manager) {
    store.set('pluginManager', {
      async listPlugins() {
        return rows ?? [
          ...PACKAGES.map((name) => ({ entryId: `entry:${name}`, moduleName: name, enabled: true, fiberPhase: 'active' })),
          { entryId: 'entry:driver', moduleName: '@deepseek-ai/dsh-goal-round-driver', enabled: false, fiberPhase: 'active' },
        ]
      },
      listBundles() {
        return bundles ?? PACKAGES.map((name) => ({ name, installed: true, enabled: true, version: '1.1.0', rows: [] }))
      },
      async setPluginEnabled(id, enabled) {
        calls.push([id, enabled])
        return setPluginEnabled === undefined
          ? { application: 'applied', enabled, changed: true }
          : setPluginEnabled(id, enabled)
      },
    })
  }
  for (const [name, value] of Object.entries(services)) store.set(name, value)
  const ctx = {
    get: (name) => store.get(name),
    provide: (name, value) => store.set(name, value),
    effect: (fn) => {
      const value = fn()
      return typeof value === 'function' ? value : () => {}
    },
    inject: (names, callback) => {
      if (names.every((name) => store.has(name))) callback(ctx)
      return () => {}
    },
    logger: { info() {}, warn() {}, error() {} },
  }
  return { ctx, store, calls }
}

const componentServices = {
  guidePanelCompatibility: { getState: () => ({ mode: 'ready', writable: true }) },
  guideAdmission: { state: () => ({ mode: 'active', capacity: 8, reserve: 2, maxGuides: 4 }) },
  guideSettlementShield: { getState: () => ({ mode: 'active', inject: true }) },
  guideGoalAdapter: { getState: () => ({ mode: 'ready' }) },
  guideSidebarHost: { getState: () => ({ supported: true, version: '0.28.2' }) },
}

test('host state reports six ready components, edges and the skill', async () => {
  const data = fixture()
  try {
    const { ctx, store } = makeCtx(data, { services: componentServices })
    await apply(ctx, { checkArtifacts: false })
    const state = await store.get('guideManager').getState()
    assert.equal(state.readOnly, false)
    assert.equal(state.actionScope, 'phase-4')
    assert.equal(state.manager.mode, 'ready')
    assert.equal(state.manager.action.policy, 'locked')
    assert.equal(state.pending.present, false)
    assert.match(state.pending.helper, /restart-guide-manager\.cmd$/)
    const panel = state.components.find((item) => item.key === 'panel')
    assert.equal(panel.update.mode, 'source-reload')
    assert.match(panel.update.spec, /^link:/)
    assert.equal(panel.update.sourceChanged, null)
    assert.equal(state.backups.count, 0)
    assert.match(state.helper.reload, /reload-guide-manager\.cmd$/)
    assert.match(state.helper.rollback, /rollback-guide-manager\.cmd$/)
    assert.equal(state.skills.manager.installed, false)
    assert.equal(state.skills.manager.name, '@michengai/dsh-skills-manager')
    assert.equal(state.dataSource, 'plugin-manager')
    assert.equal(state.components.length, 6)
    assert.ok(state.components.every((component) => component.status === 'ready'), JSON.stringify(state.components, null, 2))
    assert.equal(state.components.find((component) => component.key === 'panel').action.policy, 'hot')
    assert.equal(state.components.find((component) => component.key === 'admission').action.policy, 'restart-required')
    assert.equal(state.components.find((component) => component.key === 'preset').action.policy, 'locked')
    assert.equal(state.host.verified, true)
    assert.equal(state.skills.status, 'ready')
    assert.equal(state.edges.find((edge) => edge.to === 'admission').status, 'ready')
    assert.equal(state.edges.find((edge) => edge.to === '@deepseek-ai/dsh-goal-round-driver').status, 'ready')
    assert.deepEqual(state.warnings, [])
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
})

test('host state falls back to the profile manifest without pluginManager', async () => {
  const data = fixture()
  try {
    const { ctx, store } = makeCtx(data, { manager: false })
    await apply(ctx, { checkArtifacts: false })
    const state = await store.get('guideManager').getState()
    assert.equal(state.manager.mode, 'fallback')
    assert.equal(state.dataSource, 'profile-fallback')
    assert.equal(state.components.length, 6)
    assert.ok(state.components.every((component) => component.installed && component.bundleEnabled))
    assert.equal(state.skills.status, 'ready')
    assert.ok(state.warnings.includes('data:profile-fallback'))
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
})

test('a disabled panel is reported as disabled and its outgoing edges inactive', async () => {
  const data = fixture()
  try {
    const bundles = PACKAGES.map((name) => ({ name, installed: true, enabled: name !== '@local/dsh-guide-panel', version: '1.1.0', rows: [] }))
    const { ctx, store } = makeCtx(data, { bundles })
    await apply(ctx, { checkArtifacts: false })
    const state = await store.get('guideManager').getState()
    const panel = state.components.find((component) => component.key === 'panel')
    assert.equal(panel.status, 'disabled')
    assert.ok(state.edges.filter((edge) => edge.from === 'panel').every((edge) => edge.status === 'inactive'))
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
})

test('phase 1A routes panel and sidebar toggles through the official manager', async () => {
  const data = fixture()
  try {
    const { ctx, store, calls } = makeCtx(data, { services: componentServices })
    await apply(ctx, { checkArtifacts: false })
    const service = store.get('guideManager')
    const panel = await service.setComponentEnabled('panel', false)
    assert.equal(panel.ok, true)
    assert.equal(panel.value.application, 'applied')
    assert.deepEqual(calls, [['entry:@local/dsh-guide-panel', false]])
    const sidebar = await service.setComponentEnabled('sidebar', false)
    assert.equal(sidebar.ok, true)
    assert.deepEqual(calls, [['entry:@local/dsh-guide-panel', false], ['entry:@local/dsh-guide-sidebar-adapter', false]])
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
})

test('phase 1B stages and clears a cold admission intent without touching the profile', async () => {
  const data = fixture()
  try {
    const { ctx, store, calls } = makeCtx(data, { services: componentServices })
    await apply(ctx, { checkArtifacts: false })
    const service = store.get('guideManager')
    const staged = await service.setComponentEnabled('admission', false)
    assert.equal(staged.ok, true)
    assert.equal(staged.value.application, 'pending-restart')
    assert.deepEqual(staged.value.patches, [{ patchId: 'guide-admission', moduleName: '@local/dsh-guide-admission', enabled: false }])
    assert.deepEqual(calls, [])
    const pendingPath = join(data.profile, '.guide-manager', 'pending.json')
    assert.equal(existsSync(pendingPath), true)
    const pending = JSON.parse(readFileSync(pendingPath, 'utf8'))
    assert.equal(pending.version, 1)
    assert.equal(pending.intents[0].component, 'admission')
    const shield = await service.setComponentEnabled('shield', false)
    assert.equal(shield.ok, true)
    const merged = JSON.parse(readFileSync(pendingPath, 'utf8'))
    assert.deepEqual(merged.intents.map((intent) => intent.component).sort(), ['admission', 'shield'])
    const state = await service.getState()
    assert.equal(state.pending.present, true)
    assert.equal(state.components.find((item) => item.key === 'admission').pending.enabled, false)

    const cleared = await service.setComponentEnabled('admission', true)
    assert.equal(cleared.ok, true)
    assert.equal(cleared.value.application, 'pending-cleared')
    const remaining = JSON.parse(readFileSync(pendingPath, 'utf8'))
    assert.deepEqual(remaining.intents.map((intent) => intent.component), ['shield'])
    assert.deepEqual(calls, [])
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
})

test('phase 1B stages the goal pair and refuses manager/blocked panel actions', async () => {
  const data = fixture()
  try {
    const { ctx, store, calls } = makeCtx(data, { services: componentServices })
    await apply(ctx, { checkArtifacts: false })
    const service = store.get('guideManager')
    assert.equal((await service.setComponentEnabled('manager', false)).code, 'locked')
    const goal = await service.setComponentEnabled('goal', false)
    assert.equal(goal.ok, true)
    assert.equal(goal.value.application, 'pending-restart')
    assert.deepEqual(goal.value.patches, [
      { patchId: 'guide-goal-adapter', moduleName: '@local/dsh-guide-goal-adapter', enabled: false },
      { patchId: 'goal-round-driver', moduleName: '@deepseek-ai/dsh-goal-round-driver', enabled: true },
    ])
    assert.deepEqual(calls, [])
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }

  const blockedData = fixture()
  try {
    const bundles = PACKAGES.map((name) => ({
      name,
      installed: true,
      enabled: name !== '@local/dsh-guide-panel' && name !== '@local/dsh-guide-admission',
      version: '1.1.0',
      rows: [],
    }))
    const { ctx, store, calls } = makeCtx(blockedData, { bundles, services: componentServices })
    await apply(ctx, { checkArtifacts: false })
    const blocked = await store.get('guideManager').setComponentEnabled('panel', true)
    assert.equal(blocked.ok, false)
    assert.equal(blocked.code, 'dependency-conflict')
    assert.ok(blocked.blockers.some((item) => item.key === 'admission'))
    assert.deepEqual(calls, [])
  } finally {
    rmSync(blockedData.root, { recursive: true, force: true })
  }
})

test('hot action failures are surfaced without claiming success', async () => {
  const data = fixture()
  try {
    const { ctx, store } = makeCtx(data, {
      services: componentServices,
      setPluginEnabled: () => ({ application: 'failed', error: { code: 'operation-error', diagnostic: 'boom' } }),
    })
    await apply(ctx, { checkArtifacts: false })
    const result = await store.get('guideManager').setComponentEnabled('panel', false)
    assert.equal(result.ok, true)
    assert.equal(result.value.application, 'failed')
    assert.deepEqual(result.value.error, { code: 'operation-error', message: 'boom' })
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
})

test('local link source changes and cold backups are reported', async () => {
  const data = fixture()
  try {
    const source = join(data.root, '@local', 'dsh-guide-panel')
    mkdirSync(source, { recursive: true })
    const file = join(source, 'index.js')
    writeFileSync(file, 'export {}\n')
    const future = new Date(Date.now() + 3_600_000)
    utimesSync(file, future, future)
    const backupDir = join(data.profile, '.guide-manager', 'backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'cordis.patch.yml.2026-11-05.bak'), '[]\n')

    const { ctx, store } = makeCtx(data, { services: componentServices })
    await apply(ctx, { checkArtifacts: false })
    const state = await store.get('guideManager').getState()
    const panel = state.components.find((item) => item.key === 'panel')
    assert.equal(panel.update.mode, 'source-reload')
    assert.equal(panel.update.sourceChanged, true)
    assert.equal(state.backups.count, 1)
    assert.match(state.backups.latest.name, /\.bak$/)
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
})

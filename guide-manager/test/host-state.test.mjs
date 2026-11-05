import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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

function makeCtx(data, { manager = true, bundles, rows, services = {} } = {}) {
  const store = new Map()
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
  return { ctx, store }
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
    await apply(ctx)
    const state = await store.get('guideManager').getState()
    assert.equal(state.readOnly, true)
    assert.equal(state.manager.mode, 'ready')
    assert.equal(state.dataSource, 'plugin-manager')
    assert.equal(state.components.length, 6)
    assert.ok(state.components.every((component) => component.status === 'ready'), JSON.stringify(state.components, null, 2))
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
    await apply(ctx)
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
    await apply(ctx)
    const state = await store.get('guideManager').getState()
    const panel = state.components.find((component) => component.key === 'panel')
    assert.equal(panel.status, 'disabled')
    assert.ok(state.edges.filter((edge) => edge.from === 'panel').every((edge) => edge.status === 'inactive'))
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
})

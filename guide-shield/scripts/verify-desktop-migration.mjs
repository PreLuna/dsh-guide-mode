/** Run with installed Electron/ELECTRON_RUN_AS_NODE; metadata only, no session writes. */
import { readFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { isDeepStrictEqual } from 'node:util'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = join(workspace, 'evidence/O2-R6-desktop-migration-2026-11-03')
const plan = JSON.parse(readFileSync(join(output, 'plan.json'), 'utf8'))
const profile = plan.profile
const name = '@local/dsh-guide-shield'
const YAML = createRequire(join(profile, 'package.json'))('yaml')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const baseline = JSON.parse(readFileSync(join(workspace, 'evidence/O2-R6-2026-11-02/verification.json'), 'utf8'))
const { foldSubagentDescriptor } = await import(pathToFileURL(join(dirname(process.execPath),
  'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-subagent/lib/index.js')).href)
function check(value, label) { if (!value) throw new Error(label) }
function readLog(path) {
  const bytes = readFileSync(path), rows = []
  let offset = 0
  while (offset < bytes.length) {
    const part = zstdDecompressSync(bytes.subarray(offset), { info: true })
    if (!part.engine.bytesWritten) throw new Error('Invalid compressed frame boundary')
    offset += part.engine.bytesWritten
    for (const line of part.buffer.toString('utf8').split('\n')) if (line.trim()) rows.push(JSON.parse(line))
  }
  return { bytes, rows }
}
const sessionRoot = join(process.env.USERPROFILE, '.dsh/sessions/--D-files-Project-~6307~5BFC~6A21~5F0F--')
const guideId = '1dd07adc-1093-4a1e-89ce-d3b7eb320348'
const guidePath = join(sessionRoot, guideId, 'session.v4.jsonl.zstd')
check(existsSync(guidePath), 'The existing M3 guidance log is unavailable')
const guide = readLog(guidePath)
const header = guide.rows[0]
const boundary = guide.rows.findIndex(row => row.type === 'session/end-seed')
check(header.type === 'session' && header.id === guideId && header.origin === 'subagent' && boundary > 0, 'Invalid existing guidance header/seed boundary')
const descriptor = foldSubagentDescriptor(guide.rows.slice(boundary + 1))
check(descriptor?.mode === 'continuable' && descriptor.provider === 'guide-fork', 'Existing guidance own descriptor is not recognized by the official fold')
const parentPath = join(sessionRoot, header.parentSession, 'session.v4.jsonl.zstd')
check(existsSync(parentPath), 'The existing guidance parent log is unavailable')
const sessionState = { guideId, parentId: header.parentSession, provider: descriptor.provider, mode: descriptor.mode,
  guidePath, parentPath, guideSha256: hash(guide.bytes), parentSha256: hash(readFileSync(parentPath)) }
if (process.argv.includes('--capture')) {
  writeFileSync(join(output, 'existing-guidance-before.json'), JSON.stringify(sessionState, null, 2) + '\n')
  console.log(JSON.stringify({ status: 'captured', guideRecognized: true, guideId, parentId: header.parentSession }))
} else {
  const beforeSession = JSON.parse(readFileSync(join(output, 'existing-guidance-before.json'), 'utf8'))
  check(isDeepStrictEqual(sessionState, beforeSession), 'Existing parent or guide log changed during the desktop cold startup')
  for (const file of plan.files) check(hash(readFileSync(join(profile, file.relative))) === file.afterSha256, `Installed file differs: ${file.relative}`)
  for (const [relative, expected] of Object.entries(plan.unchangedHashes)) check(hash(readFileSync(join(profile, relative))) === expected, `Unrelated profile file changed: ${relative}`)
  check(realpathSync(plan.link).toLowerCase() === realpathSync(plan.source).toLowerCase(), 'Wrong shield link target')
  const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
  const beforeManifest = JSON.parse(readFileSync(join(output, 'desktop-before/package.json'), 'utf8'))
  const bundles = manifest.dsh.profile.bundles
  check(bundles.filter(item => item === name).length === 1 && bundles.indexOf(name) < bundles.indexOf('@local/dsh-guide-panel'), 'Shield bundle selection/order is incorrect')
  const stripManifest = value => {
    value = structuredClone(value); delete value.dependencies[name]
    value.dsh.profile.bundles = value.dsh.profile.bundles.filter(item => item !== name)
    return value
  }
  check(isDeepStrictEqual(stripManifest(manifest), stripManifest(beforeManifest)), 'Other dependencies or bundle choices changed')
  for (const relative of ['pnpm-lock.yaml', 'node_modules/.pnpm/lock.yaml']) {
    const before = YAML.parse(readFileSync(join(output, 'desktop-before', relative), 'utf8'))
    const after = YAML.parse(readFileSync(join(profile, relative), 'utf8'))
    delete before.importers['.'].dependencies[name]
    delete after.importers['.'].dependencies[name]
    check(isDeepStrictEqual(before, after), 'Unrelated lock graph changed')
  }
  const sources = Object.entries(baseline.sourceSha256).filter(([path]) => !path.includes('/test/') && !path.includes('/scripts/'))
  for (const [path, expected] of sources) check(hash(readFileSync(join(workspace, path))) === expected, `Production source differs from accepted lifecycle baseline: ${path}`)
  const mounted = JSON.parse(readFileSync(join(output, 'desktop-mount-result.json'), 'utf8'))
  const state = mounted.state.value
  check(mounted.status === 'passed' && state.settlementShield.mode === 'active' && state.settlementShield.inject === true, 'Actual desktop shield is not active')
  check(['ready', 'filtered'].includes(state.goalAdapter.mode) && mounted.sidebarState.value.supported === true, 'Existing adapters did not activate')
  check(['active', 'idle'].includes(state.modelProjection.mode) && state.modelProjection.diagnostics.wrapperRecords > 0, 'O6 projection did not load')
  const liveUi = JSON.parse(readFileSync(join(output, 'live-desktop-ui.json'), 'utf8'))
  check(liveUi.package === name && liveUi.component === 'guide-settlement-shield' && liveUi.status === '运行中', 'Normal desktop UI did not report the shield component running')
  const result = { status: 'passed', date: '2026-11-03', profile, desktopColdStartup: true,
    settlementShield: state.settlementShield, goalAdapter: state.goalAdapter.mode,
    modelProjection: { mode: state.modelProjection.mode, reason: state.modelProjection.reason, ...state.modelProjection.diagnostics },
    sidebarSupported: mounted.sidebarState.value.supported, existingGuidanceRecognized: true,
    existingGuideAndParentUnchanged: true, unrelatedProfileFilesUnchanged: true, registryGraphsUnchanged: true,
    sourceBaselineMatched: sources.length, normalDesktopAppRunning: true, liveUiComponentStatus: liveUi.status,
    probeSessionsCreated: 0, probeModelRequests: 0, probeMessagesSent: 0,
    guideId, parentId: header.parentSession }
  writeFileSync(join(output, 'verification.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
}

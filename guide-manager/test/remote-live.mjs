/** Opt-in actual GitHub read acceptance; never publishes or uses a live profile. */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRemoteManager } from '../remote.js'
import { COMPONENTS } from '../core.js'
import { fingerprint, profileSnapshot, readJson, writeJson } from '../install.js'
const output = resolve(process.argv[2] ?? '')
if (!process.argv[2] || existsSync(output)) throw Error('new-output-directory-required')
if (!process.env.DSH_GUIDE_GITHUB_TOKEN) throw Error('read-credential-required')
mkdirSync(output, { recursive: true })
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const managerRoot = join(root, 'guide-manager'), host = readJson(join(managerRoot, 'package.json')).dshGuide.host
const sourceConfig = { schema: 1, provider: 'github', owner: 'PreLuna', repo: 'dsh-guide-mode', channel: 'stable', tokenEnv: 'DSH_GUIDE_GITHUB_TOKEN' }
const profile = { dir: join(output, 'profile'), name: 'remote-read', installAnchor: 'isolated-not-executed' }
writeJson(join(profile.dir, 'package.json'), { private: true, dependencies: {}, dsh: { profile: { bundles: [] } } })
const state = { profile, pending: { present: false }, host: { verified: true, dsh: { match: true }, cordis: { match: true }, betterSidebar: { match: true }, artifacts: { verified: true } }, components: COMPONENTS.map((c) => ({ ...c, installed: false, version: null, expectedVersion: '1.1.0', expectedContract: 1 })) }
const calls = [], assertions = []
const fetchImpl = async (address, options) => {
  const url = new URL(address)
  if (url.hostname !== 'api.github.com') assert.equal(options.headers.Authorization, undefined)
  const response = await fetch(address, options)
  calls.push({ host: url.hostname, path: url.hostname === 'api.github.com' ? url.pathname : '(asset-cdn)', status: response.status, authorization: Boolean(options.headers.Authorization) })
  return response
}
const remote = createRemoteManager({ profile, sourceConfig, host, managerRoot, fetchImpl })
const before = profileSnapshot(profile.dir)
const resultPath = join(output, 'result.json')
try {
  const job = remote.check()
  assert.throws(() => remote.check(), /source-busy/)
  const checked = await remote.wait(job.taskId)
  assert.equal(checked.status, 'ready', JSON.stringify(checked))
  assert.equal(checked.result.available, true)
  const snapshotId = checked.result.snapshotId
  assert.equal(calls.filter((c) => /\/releases\/assets\//.test(c.path)).length, 1)
  assertions.push('actual private stable metadata check downloads only the release catalog; concurrent checks refused')
  const ready = await remote.wait(remote.prepare({ kind: 'install', snapshotId, components: ['goal'] }, state).taskId)
  assert.equal(ready.status, 'ready', JSON.stringify(ready))
  assert.equal(ready.progress.total, 1)
  const plan = remote.plan(ready.id, state)
  assert.deepEqual(plan.blockers, [])
  assert.deepEqual(plan.entries.map((e) => e.key), ['goal'])
  assert.deepEqual(profileSnapshot(profile.dir), before)
  assertions.push('actual private goal asset passes length/SHA/tar checks and creates an exact offline plan without changing profile files')
  const downloads = calls.filter((c) => /\/releases\/assets\//.test(c.path)).length
  const again = await remote.wait(remote.prepare({ kind: 'install', snapshotId, components: ['goal'] }, state).taskId)
  assert.equal(again.status, 'ready')
  assert.equal(calls.filter((c) => /\/releases\/assets\//.test(c.path)).length, downloads)
  assert.equal(remote.view().catalog.snapshotId, snapshotId)
  assertions.push('verified cache reused with no new asset download; persistent task and catalog can be read')
  const workspacePath = join(profile.dir, 'pnpm-workspace.yaml')
  writeJson(workspacePath, { drift: true })
  assert.throws(() => remote.plan(again.id, state), /source-preparation-stale/)
  unlinkSync(workspacePath)
  assert.equal(fingerprint(profileSnapshot(profile.dir)), fingerprint(before))
  assertions.push('profile drift invalidates the prepared plan')
  const failures = []
  for (const [name, token] of [['absent', undefined], ['invalid', 'invalid-live-acceptance-credential']]) {
    const deniedProfile = { ...profile, dir: join(output, name) }
    writeJson(join(deniedProfile.dir, 'package.json'), { private: true, dependencies: {} })
    const denied = createRemoteManager({ profile: deniedProfile, sourceConfig, host, managerRoot, fetchImpl, env: { DSH_GUIDE_GITHUB_TOKEN: token } })
    const task = await denied.wait(denied.check().taskId)
    assert.equal(task.status, 'failed')
    assert.match(task.error, /^github-http-(401|403|404)$/)
    failures.push({ credential: name, error: task.error })
  }
  assertions.push('actual absent/invalid private credentials fail explicitly; CDN requests never receive Authorization')
  writeJson(resultPath, { status: 'passed', repository: sourceConfig.owner + '/' + sourceConfig.repo, release: checked.result.release, snapshotId, assertions, failures, calls, profileUnchanged: true, remoteWrites: 0 })
  console.log(JSON.stringify({ status: 'passed', assertions: assertions.length, output }))
} catch (error) {
  writeJson(resultPath, { status: 'failed', error: /^([a-z0-9-]+)$/.test(error.message) ? error.message : 'assertion-failed', assertions, calls })
  console.error('live-source-acceptance-failed; inspect retained result')
  process.exitCode = 1
} finally { remote.dispose() }

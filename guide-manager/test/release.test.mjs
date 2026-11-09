import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest, fingerprint, readJson, writeJson } from '../install.js'
import { RELEASE_KEYS, RELEASE_PACKAGES, validateRemoteRelease, validateSourceConfig } from '../release.js'
import { prepareRemoteRelease, verifyReleaseBundle } from '../../scripts/lib/release-bundle.mjs'
import { exportLatestHistory, GitHubReleaseClient, publishGitHubDraft, stageGitHubDraft } from '../../scripts/lib/github-release.mjs'
import { baselineSource } from './baseline-source.mjs'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repository = { owner: 'PreLuna', repo: 'dsh-guide-mode' }
const token = 'test-only-DO-NOT-LOG-release-token'
const npmCli = process.env.npm_execpath
const clone = structuredClone

function mockGitHub(seed, { failUpload = false, redirect = false, badRedirect = false, badTag = false, annotated = false } = {}) {
  const releases = []
  const tags = new Map()
  const blobs = new Map()
  const calls = []
  let nextAsset = 100
  const seedRelease = (bundle, published = true) => {
    const release = { id: releases.length + 1, tag_name: bundle.plan.tag, target_commitish: bundle.plan.commit,
      draft: !published, prerelease: bundle.plan.channel === 'prerelease', published_at: '2026-11-08T01:00:00Z', assets: [] }
    releases.unshift(release)
    tags.set(release.tag_name, bundle.plan.commit)
    for (const asset of bundle.plan.assets) {
      const bytes = readFileSync(join(bundle.directory, asset.name))
      const row = { id: nextAsset++, name: asset.name, size: bytes.length, state: 'uploaded', digest: `sha256:${digest(bytes)}` }
      release.assets.push(row); blobs.set(row.id, bytes)
    }
    return release
  }
  if (seed) seedRelease(seed)
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
  const fetchImpl = async (address, options) => {
    const url = new URL(address)
    const method = options.method
    calls.push({ host: url.hostname, path: url.pathname, method, headers: options.headers })
    if (url.hostname === 'release-assets.githubusercontent.com') {
      assert.equal(options.headers.Authorization, undefined)
      const id = Number(url.pathname.split('/').at(-1))
      return new Response(blobs.get(id))
    }
    assert.equal(options.headers.Authorization, `Bearer ${token}`)
    const path = url.pathname.replace('/repos/PreLuna/dsh-guide-mode', '')
    if (path.startsWith('/commits/')) return json({ sha: path.split('/').at(-1) })
    if (path.startsWith('/git/ref/tags/')) {
      const tag = decodeURIComponent(path.split('/').at(-1))
      if (!tags.has(tag)) return json({}, 404)
      return json({ object: { type: annotated ? 'tag' : 'commit', sha: badTag ? 'f'.repeat(40) : annotated ? 'a'.repeat(40) : tags.get(tag) } })
    }
    if (path.startsWith('/git/tags/')) return json({ object: { type: 'commit', sha: tags.values().next().value } })
    if (path.startsWith('/releases/tags/')) return releases.find((row) => row.tag_name === decodeURIComponent(path.split('/').at(-1))) ? json(releases.find((row) => row.tag_name === decodeURIComponent(path.split('/').at(-1)))) : json({}, 404)
    if (path === '/releases' && method === 'GET') return json(releases.map(({ assets, ...row }) => row))
    if (path === '/releases' && method === 'POST') {
      const body = JSON.parse(options.body)
      const row = { ...body, id: releases.length + 1, assets: [], published_at: null }
      releases.unshift(row); tags.set(row.tag_name, row.target_commitish)
      return json(row, 201)
    }
    if (/^\/releases\/assets\/\d+$/.test(path)) {
      const id = Number(path.split('/').at(-1))
      if (redirect) return new Response(null, { status: 302, headers: { Location: `${badRedirect ? 'https://untrusted.invalid' : 'https://release-assets.githubusercontent.com'}/asset/${id}?temporary=secret` } })
      return new Response(blobs.get(id))
    }
    const match = path.match(/^\/releases\/(\d+)(\/assets)?$/)
    if (match) {
      const release = releases.find((row) => row.id === Number(match[1]))
      if (method === 'PATCH') { Object.assign(release, JSON.parse(options.body)); release.published_at = '2026-11-08T02:00:00Z'; return json(release) }
      if (method === 'GET') return json(release.assets)
      if (method === 'POST') {
        if (failUpload && release.assets.length === 2) { failUpload = false; return json({ message: token }, 500) }
        const bytes = Buffer.from(options.body)
        const asset = { id: nextAsset++, name: url.searchParams.get('name'), size: bytes.length, state: 'uploaded', digest: `sha256:${digest(bytes)}` }
        release.assets.push(asset); blobs.set(asset.id, bytes)
        return json(asset, 201)
      }
    }
    throw new Error(`unhandled-mock-path:${path}`)
  }
  return { client: new GitHubReleaseClient({ repository, token, fetchImpl }), releases, tags, blobs, calls, seedRelease }
}

test('remote release contract, fixed-commit build and explicit GitHub draft lifecycle', async (t) => {
  assert.ok(npmCli, 'run release tests through npm test (npm_execpath required)')
  const root = mkdtempSync(join(tmpdir(), 'guide-release-'))
  t.after(() => {
    const within = relative(resolve(tmpdir()), resolve(root))
    assert.ok(within && !within.startsWith('..') && basename(root).startsWith('guide-release-'))
    rmSync(root, { recursive: true, force: true })
  })
  const source = baselineSource(join(root, 'repository'), workspace)
  writeFileSync(join(source, '.gitattributes'), '* text=auto eol=lf\n')
  writeFileSync(join(source, '.gitignore'), 'dist/\n')
  cpSync(join(workspace, 'package.json'), join(source, 'package.json'))
  mkdirSync(join(source, 'scripts/lib'), { recursive: true })
  cpSync(join(workspace, 'scripts/package-local.mjs'), join(source, 'scripts/package-local.mjs'))
  cpSync(join(workspace, 'scripts/lib/package-artifacts.mjs'), join(source, 'scripts/lib/package-artifacts.mjs'))
  const git = (args) => execFileSync('git', args, { cwd: source, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=Guide release fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Isolated release fixture']); return git(['rev-parse', 'HEAD']) }
  git(['init', '-q', '--initial-branch=main'])
  const first = commit()
  const build = (name, options = {}) => prepareRemoteRelease({ repositoryRoot: source, commit: first, repository, tag: 'guide-v1.1.0', output: join(root, name), npmCli, ...options })
  const baseline = build('baseline')
  const metadata = baseline.catalog
  const mutate = (callback) => { const value = clone(metadata); callback(value); return value }
  const rejects = (value, expression) => assert.throws(() => validateRemoteRelease(value), expression)

  await t.test('production bundle contains seven verified packages, portable metadata and no token values', () => {
    assert.equal(baseline.plan.publishable, true)
    assert.equal(baseline.plan.assets.length, 11)
    assert.equal(metadata.artifacts.length, 7)
    assert.equal(metadata.release.commit, first)
    assert.equal(metadata.release.source, 'git-commit')
    assert.doesNotMatch(JSON.stringify(metadata), /file:|link:|[A-Z]:\\|https:|Authorization|token/i)
    assert.equal(validateSourceConfig(readJson(join(baseline.directory, 'source-config.example.json'))).tokenEnv, 'DSH_GUIDE_GITHUB_TOKEN')
    assert.doesNotMatch(readFileSync(join(baseline.directory, 'publish-plan.json'), 'utf8'), new RegExp(token))
  })
  await t.test('reject unknown schemas, package identities, duplicate versions and unsupported contracts', () => {
    rejects(mutate((v) => { v.schema = 9 }), /unsupported/)
    rejects(mutate((v) => { v.artifacts[0].package = '@other/package' }), /artifact/)
    rejects(mutate((v) => { v.artifacts.push(clone(v.artifacts[0])) }), /artifact/)
    rejects(mutate((v) => { v.artifacts[0].dataSchema = 2 }), /artifact/)
    rejects(mutate((v) => { v.artifacts.find((e) => e.key === 'manager').controlSchema = 2 }), /contract/)
  })
  await t.test('reject secret/absolute path fields, invalid hashes, sizes and source references', () => {
    rejects(mutate((v) => { v.token = token }), /fields/)
    rejects(mutate((v) => { v.artifacts[0].file = 'D:/private/package.tgz' }), /fields/)
    rejects(mutate((v) => { v.artifacts[0].sha256 = 'invalid' }), /integrity/)
    rejects(mutate((v) => { v.artifacts[0].bytes = 9 * 1024 * 1024 }), /integrity/)
    rejects(mutate((v) => { v.artifacts[0].source.asset = '../package.tgz' }), /source/)
    rejects(mutate((v) => { v.artifacts[0].source.commit = 'f'.repeat(40) }), /commit/)
    assert.throws(() => validateSourceConfig({ ...readJson(join(baseline.directory, 'source-config.example.json')), token }), /fields/)
    assert.throws(() => validateRemoteRelease(metadata, { repository: { owner: 'someone', repo: 'elsewhere' } }), /repository/)
  })
  await t.test('reject incomplete dependencies, incompatible combinations and invalid recommendations', () => {
    rejects(mutate((v) => { delete v.artifacts.find((e) => e.key === 'panel').requires.preset }), /edge/)
    rejects(mutate((v) => { v.artifacts.find((e) => e.key === 'panel').requires.shield = ['9.0.0'] }), /unavailable/)
    rejects(mutate((v) => { v.combinations[0].versions.panel = '9.0.0' }), /unavailable/)
    rejects(mutate((v) => { v.recommendedManager = '9.0.0' }), /recommendation/)
  })
  await t.test('rebuilding the same commit is byte-identical and ignores uncommitted edits', () => {
    const path = join(source, 'guide-panel/index.js')
    const original = readFileSync(path)
    writeFileSync(path, `${original}\n// uncommitted; must never be released\n`)
    const rebuilt = build('rebuilt')
    assert.deepEqual(rebuilt.plan.assets, baseline.plan.assets)
    writeFileSync(path, original)
    assert.throws(() => build('baseline'), /already-exists/)
  })
  await t.test('legacy committed snapshot CLI still packages seven components and preserves a clean source tree', () => {
    const result = JSON.parse(execFileSync(process.execPath, [join(source, 'scripts/package-local.mjs')], { cwd: source, encoding: 'utf8', windowsHide: true, env: { ...process.env, npm_execpath: npmCli } }))
    assert.equal(result.packages, 7)
    assert.equal(result.commit, first)
    assert.equal(readJson(join(result.output, 'manifest.json')).artifacts.filter((row) => row.name).length, 7)
    assert.equal(git(['status', '--porcelain']), '')
  })
  let updated
  await t.test('independent panel release retains old packages and manager install baseline', () => {
    const path = join(source, 'guide-panel/package.json')
    writeJson(path, { ...readJson(path), version: '1.1.1' })
    const second = commit()
    updated = build('updated', { commit: second, tag: 'guide-v1.1.1', previous: [baseline.directory] })
    assert.equal(updated.catalog.artifacts.length, 8)
    assert.equal(updated.catalog.combinations.length, 2)
    assert.equal(updated.catalog.artifacts.find((e) => e.key === 'manager').sha256, metadata.artifacts.find((e) => e.key === 'manager').sha256)
    const install = updated.catalog.combinations.find((c) => c.id === updated.catalog.recommendedCombination)
    assert.equal(install.versions.panel, '1.1.0')
    assert.ok(updated.catalog.combinations.some((c) => c.versions.panel === '1.1.1'))
    assert.ok(updated.catalog.artifacts.find((e) => e.key === 'panel' && e.version === '1.1.0').source.tag === 'guide-v1.1.0')
  })
  await t.test('same version with changed source is rejected rather than replacing history', () => {
    const path = join(source, 'guide-panel/index.js')
    const original = readFileSync(path)
    writeFileSync(path, `${original}\n// changed without a version bump\n`)
    const bad = commit()
    assert.throws(() => build('conflict', { commit: bad, tag: 'guide-v1.1.2', previous: [updated.directory] }), /same-version-different-bytes/)
    writeFileSync(path, original)
  })
  await t.test('missing runtime files and malformed package metadata fail before a publish plan exists', () => {
    const broken = join(root, 'broken-source')
    cpSync(join(baseline.directory, 'verification/source'), broken, { recursive: true })
    rmSync(join(broken, 'guide-manager/helper/apply-maintenance.mjs'))
    assert.throws(() => build('broken', { commit: undefined, development: true, sourceRoot: broken, tag: 'fixture-broken' }), /runtime/)
    assert.equal(existsSync(join(root, 'broken/publish-plan.json')), false)
  })
  await t.test('explicit development snapshots cannot enter draft upload', async () => {
    const development = build('development', { commit: undefined, development: true, sourceRoot: join(baseline.directory, 'verification/source'), tag: 'fixture-development' })
    assert.equal(development.plan.publishable, false)
    rejects(development.catalog, /provenance/)
    const api = mockGitHub()
    await assert.rejects(() => stageGitHubDraft(development.directory, api.client), /provenance/)
    assert.equal(api.calls.length, 0)
  })
  await t.test('published asset tampering fails local verification and commit verification binds code', () => {
    const copy = join(root, 'tampered')
    cpSync(baseline.directory, copy, { recursive: true })
    const asset = baseline.plan.assets.find((e) => e.name.endsWith('.tgz'))
    writeFileSync(join(copy, asset.name), 'tampered')
    assert.throws(() => verifyReleaseBundle(copy), /integrity/)
  })
  await t.test('draft upload reads back all eleven assets and never publishes implicitly', async () => {
    const api = mockGitHub()
    const receipt = await stageGitHubDraft(baseline.directory, api.client, { repositoryRoot: source })
    assert.equal(receipt.status, 'draft-verified')
    assert.equal(receipt.assets.length, 11)
    assert.equal(api.releases[0].draft, true)
    assert.equal(api.calls.filter((c) => c.method === 'PATCH').length, 0)
    assert.doesNotMatch(JSON.stringify(receipt), new RegExp(token))
    const posts = api.calls.filter((c) => c.method === 'POST').length
    await stageGitHubDraft(baseline.directory, api.client)
    assert.equal(api.calls.filter((c) => c.method === 'POST').length, posts)
    assert.equal((await publishGitHubDraft(baseline.directory, api.client)).status, 'published')
    assert.equal(api.releases[0].draft, false)
    await assert.rejects(() => stageGitHubDraft(baseline.directory, api.client), /immutable/)
  })
  await t.test('interrupted upload leaves a draft and resumes without deleting or overwriting assets', async () => {
    const api = mockGitHub(undefined, { failUpload: true })
    await assert.rejects(() => stageGitHubDraft(baseline.directory, api.client), (error) => error.message === 'github-http-500' && !error.message.includes(token))
    assert.equal(api.releases[0].draft, true)
    assert.equal(api.releases[0].assets.length, 2)
    await stageGitHubDraft(baseline.directory, api.client)
    assert.equal(api.releases[0].assets.length, 11)
    assert.ok(!api.calls.some((c) => c.method === 'DELETE' || c.method === 'PATCH'))
  })
  await t.test('remote partial/extra/corrupt assets cannot be published', async () => {
    for (const kind of ['missing', 'extra', 'corrupt']) {
      const api = mockGitHub()
      await stageGitHubDraft(baseline.directory, api.client)
      if (kind === 'missing') api.releases[0].assets.pop()
      if (kind === 'extra') api.releases[0].assets.push({ id: 999, name: 'unexpected.txt', size: 1, state: 'uploaded' })
      if (kind === 'corrupt') api.blobs.set(api.releases[0].assets[0].id, Buffer.from('corrupt'))
      await assert.rejects(() => publishGitHubDraft(baseline.directory, api.client), /assets|length|digest|integrity/)
      assert.equal(api.releases[0].draft, true)
      assert.ok(!api.calls.some((c) => c.method === 'PATCH'))
    }
  })
  await t.test('wrong bytes under an existing asset name are not overwritten', async () => {
    const api = mockGitHub()
    await stageGitHubDraft(baseline.directory, api.client)
    const asset = api.releases[0].assets[0]
    api.blobs.set(asset.id, Buffer.alloc(asset.size, 1))
    asset.digest = `sha256:${digest(api.blobs.get(asset.id))}`
    const writes = api.calls.filter((c) => c.method !== 'GET').length
    await assert.rejects(() => stageGitHubDraft(baseline.directory, api.client), /conflict/)
    assert.equal(api.calls.filter((c) => c.method !== 'GET').length, writes)
  })
  await t.test('remote tag collision and omitted stable history block all writes', async () => {
    const wrong = mockGitHub(undefined, { badTag: true })
    wrong.tags.set(baseline.plan.tag, baseline.plan.commit)
    await assert.rejects(() => stageGitHubDraft(baseline.directory, wrong.client), /tag-commit/)
    assert.ok(wrong.calls.every((c) => c.method === 'GET'))
    const prior = mockGitHub(updated)
    await assert.rejects(() => stageGitHubDraft(baseline.directory, prior.client), /history-omitted/)
    assert.ok(prior.calls.every((c) => c.method === 'GET'))
    const annotated = mockGitHub(undefined, { annotated: true })
    annotated.tags.set(baseline.plan.tag, baseline.plan.commit)
    await stageGitHubDraft(baseline.directory, annotated.client)
  })
  await t.test('download redirect does not forward credentials and unknown hosts are rejected', async () => {
    const api = mockGitHub(undefined, { redirect: true })
    await stageGitHubDraft(baseline.directory, api.client)
    assert.ok(api.calls.some((c) => c.host === 'release-assets.githubusercontent.com'))
    const bad = mockGitHub(undefined, { redirect: true, badRedirect: true })
    await assert.rejects(() => stageGitHubDraft(baseline.directory, bad.client), /untrusted/)
    assert.ok(!bad.calls.some((c) => c.host === 'untrusted.invalid'))
  })
  await t.test('response bounds, truncation and auth failures do not expose server text or credentials', async () => {
    const client = new GitHubReleaseClient({ repository, token, fetchImpl: async () => new Response(token, { status: 403 }) })
    await assert.rejects(() => client.catalogs(), (error) => error.message === 'github-http-403' && !error.message.includes(token))
    const large = new GitHubReleaseClient({ repository, token, fetchImpl: async () => new Response('x', { headers: { 'content-length': String(16 * 1024 * 1024) } }) })
    await assert.rejects(() => large.assetBytes({ id: 1, size: 1, state: 'uploaded' }), /too-large/)
    const truncated = new GitHubReleaseClient({ repository, token, fetchImpl: async () => new Response('x') })
    await assert.rejects(() => truncated.assetBytes({ id: 1, size: 4, state: 'uploaded' }), /length-mismatch/)
  })
  await t.test('verified remote history can rebuild an independent update bundle', async () => {
    const api = mockGitHub(baseline)
    const directory = join(root, 'downloaded-history')
    assert.equal((await exportLatestHistory(directory, api.client)).artifacts, 7)
    const rebuilt = build('updated-from-remote', { commit: updated.plan.commit, tag: updated.plan.tag, previous: [directory] })
    assert.deepEqual(rebuilt.catalog, updated.catalog)
    const draft = await stageGitHubDraft(rebuilt.directory, api.client)
    assert.equal(draft.status, 'draft-verified')
    const empty = join(root, 'empty-history')
    assert.equal((await exportLatestHistory(empty, mockGitHub().client)).status, 'no-history')
    assert.equal(readJson(join(empty, 'history-status.json')).empty, true)
  })
  await t.test('workflow is tag/manual only and formal publication requires explicit manual choice', () => {
    const workflow = readFileSync(join(workspace, '.github/workflows/release.yml'), 'utf8')
    assert.match(workflow, /push:\s*\n\s+tags: \['guide-\*'\]/)
    assert.doesNotMatch(workflow, /pull_request|branches:/)
    assert.match(workflow, /default: prepare/)
    assert.match(workflow, /if: github\.event_name == 'workflow_dispatch' && inputs\.operation == 'publish'/)
    assert.match(workflow, /permissions:\s*\n\s+contents: read/)
    assert.match(workflow, /upload:\s*\n[\s\S]*?permissions:\s*\n\s+contents: write/)
    assert.match(readFileSync(join(workspace, '.github/workflows/test.yml'), 'utf8'), /contents: read/)
  })
})

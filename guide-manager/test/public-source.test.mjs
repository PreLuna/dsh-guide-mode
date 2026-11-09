import test from 'node:test'
import assert from 'node:assert/strict'
import { advertisedTags, PublicGitHubReleaseClient } from '../github-public.js'
import { digest } from '../install.js'
import { prepareRemoteRelease } from '../../scripts/lib/release-bundle.mjs'
import { baselineSource } from './baseline-source.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
const packet = (line) => { const bytes = Buffer.from(line); return Buffer.concat([Buffer.from((bytes.length + 4).toString(16).padStart(4, '0')), bytes]) }
const advertisement = (rows) => Buffer.concat([packet('# service=git-upload-pack\n'), Buffer.from('0000'), ...rows.map(packet), Buffer.from('0000')])

test('Git advertisement parses regular and peeled tags and rejects malformed packets', () => {
  const tags = advertisedTags(advertisement([`${'a'.repeat(40)} refs/tags/guide-test\0capabilities\n`, `${'b'.repeat(40)} refs/tags/guide-annotated\n`, `${'c'.repeat(40)} refs/tags/guide-annotated^{}\n`]))
  assert.equal(tags.get('guide-test'), 'a'.repeat(40))
  assert.equal(tags.get('guide-annotated^{}'), 'c'.repeat(40))
  for (const bytes of [Buffer.from('bad'), Buffer.from('fffftruncated'), packet('version 2\n'), advertisement([`${'a'.repeat(40)} refs/tags/../invalid\n`]), advertisement([`${'a'.repeat(40)} refs/tags/duplicate\n`, `${'a'.repeat(40)} refs/tags/duplicate\n`])]) assert.throws(() => advertisedTags(bytes), /source-invalid-tags/)
})

test('public release check, historic assets and tag verification use no REST API or credentials', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'guide-public-'))
  t.after(() => { assert.ok(!relative(tmpdir(), root).startsWith('..')); rmSync(root, { recursive: true, force: true }) })
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const bundle = prepareRemoteRelease({ development: true, sourceRoot: baselineSource(join(root, 'source'), workspace), repository: { owner: 'PreLuna', repo: 'dsh-guide-mode' }, tag: 'guide-test', output: join(root, 'bundle') })
  const catalog = structuredClone(bundle.catalog)
  catalog.release = { tag: 'guide-test', commit: 'a'.repeat(40), channel: 'stable', source: 'git-commit' }
  catalog.artifacts.forEach((a) => { a.source.commit = catalog.release.commit })
  const calls = []
  let wrongBytes = false
  const fetchImpl = async (address, options) => {
    const url = new URL(address)
    calls.push(url.pathname)
    assert.equal(options.headers.Authorization, undefined)
    assert.equal(url.hostname, 'github.com')
    if (url.pathname.endsWith('/info/refs')) return new Response(advertisement([`${catalog.release.commit} refs/tags/guide-test\n`]))
    if (url.pathname.endsWith('/guide-release.json')) return new Response(JSON.stringify(catalog))
    const entry = catalog.artifacts.find((a) => url.pathname.endsWith('/' + a.source.asset))
    assert.ok(entry)
    return new Response(wrongBytes ? Buffer.alloc(entry.bytes) : readFileSync(join(bundle.directory, entry.source.asset)))
  }
  const client = new PublicGitHubReleaseClient({ repository: catalog.repository, token: 'must-never-be-used', fetchImpl })
  assert.equal((await client.latestCatalog()).release.tag, 'guide-test')
  await client.verifyTag('guide-test', catalog.release.commit)
  await client.verifyTag('guide-test', catalog.release.commit)
  await assert.rejects(() => client.verifyTag('guide-test', 'b'.repeat(40)), /tag-commit-mismatch/)
  assert.equal(calls.filter((path) => path.endsWith('/info/refs')).length, 1)
  assert.equal(calls.filter((path) => path.endsWith('.tgz')).length, 0)
  const release = await client.getRelease('guide-test')
  const asset = (await client.assets(release.id)).find((a) => a.name.includes('goal-adapter'))
  assert.equal('sha256:' + digest(await client.assetBytes(asset)), asset.digest)
  wrongBytes = true
  await assert.rejects(() => client.assetBytes(asset), /integrity-mismatch/)
  await assert.rejects(() => client.assetBytes({ ...asset, id: 'unbound', name: '../other.tgz' }), /asset-unavailable/)
  const historical = new PublicGitHubReleaseClient({ repository: catalog.repository, fetchImpl })
  assert.equal((await historical.getRelease('guide-test')).tag_name, 'guide-test')
  const missing = new PublicGitHubReleaseClient({ repository: catalog.repository, fetchImpl: async () => new Response('', { status: 404 }) })
  await assert.rejects(() => missing.latestCatalog(), /public-release-unavailable/)
  assert.equal(await missing.getRelease('missing'), null)
})

import { GitHubReleaseClient as GitHubSource } from '../../guide-manager/github-source.js'
/** Maintainer-side release API. Network runs only when explicitly called. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { digest, fingerprint, writeJson } from '../../guide-manager/install.js'
import { MAX_PACKAGE_BYTES, MAX_RELEASE_BYTES, parseRemoteRelease, RELEASE_FILE, releaseTag, sameRepository, validateRepository } from '../../guide-manager/release.js'
import { inspectArtifact, verifyReleaseBundle } from './release-bundle.mjs'

const MAX_RELEASES = 100
const encoded = (value) => encodeURIComponent(String(value))
const identity = (entry) => `${entry.key}@${entry.version}`

export class GitHubReleaseClient extends GitHubSource {
  async catalogs() {
    const catalogs = []
    let examined = 0
    for (let page = 1; page <= 2; page++) {
      const rows = await this.json(`/releases?per_page=100&page=${page}`)
      if (!Array.isArray(rows)) throw new Error('invalid-github-releases')
      for (const release of rows) {
        if (++examined > MAX_RELEASES) throw new Error('release-history-limit-exceeded')
        if (release.draft) continue
        const assets = await this.assets(release.id)
        const asset = assets.find((item) => item.name === RELEASE_FILE)
        if (!asset) continue
        const catalog = parseRemoteRelease(await this.assetBytes(asset, MAX_RELEASE_BYTES), { repository: this.repository })
        if (catalog.release.tag !== release.tag_name || (catalog.release.channel === 'prerelease') !== release.prerelease) throw new Error('published-release-identity-mismatch')
        catalogs.push({ release, catalog, assets })
      }
      if (rows.length < 100) return catalogs.sort((a, b) => Date.parse(b.release.published_at) - Date.parse(a.release.published_at) || b.release.id - a.release.id)
    }
    throw new Error('release-history-limit-exceeded')
  }
}

function assertHistory(candidate, published) {
  const known = new Map()
  for (const { catalog, release } of published) {
    for (const entry of catalog.artifacts) {
      const id = identity(entry)
      if (known.has(id) && known.get(id) !== entry.sha256) throw new Error('published-history-version-conflict')
      known.set(id, entry.sha256)
      const current = candidate.artifacts.find((item) => identity(item) === id)
      if (current && current.sha256 !== entry.sha256) throw new Error(`published-version-conflict:${id}`)
      if (!release.prerelease && !current) throw new Error(`stable-history-omitted:${id}`)
    }
    if (!release.prerelease) for (const combo of catalog.combinations) {
      const match = candidate.combinations.find((item) => fingerprint(item.versions) === fingerprint(combo.versions) && fingerprint(item.host) === fingerprint(combo.host))
      if (!match) throw new Error('stable-history-combination-omitted')
    }
  }
}

async function beforeWrite(client, bundle) {
  if (!bundle.plan.publishable || bundle.plan.commit === null || !sameRepository(bundle.plan.repository, client.repository)) throw new Error('bundle-not-publishable')
  const commit = await client.json(`/commits/${bundle.plan.commit}`)
  if (commit.sha !== bundle.plan.commit) throw new Error('source-commit-unavailable-remotely')
  await client.verifyTag(bundle.plan.tag, bundle.plan.commit, { allowMissing: true })
  assertHistory(bundle.catalog, await client.catalogs())
}

async function audit(client, bundle, release) {
  if (release.tag_name !== bundle.plan.tag) throw new Error('draft-tag-mismatch')
  await client.verifyTag(bundle.plan.tag, bundle.plan.commit)
  const assets = await client.assets(release.id)
  if (fingerprint(assets.map((item) => item.name).sort()) !== fingerprint(bundle.plan.assets.map((item) => item.name).sort())) throw new Error('remote-release-incomplete-or-extra-assets')
  const checked = []
  for (const expected of bundle.plan.assets) {
    const asset = assets.find((item) => item.name === expected.name)
    if (asset.size !== expected.bytes) throw new Error('remote-asset-size-mismatch')
    const bytes = await client.assetBytes(asset)
    if (digest(bytes) !== expected.sha256) throw new Error('remote-asset-integrity-mismatch')
    checked.push({ id: asset.id, name: expected.name, sha256: expected.sha256, bytes: expected.bytes })
  }
  return checked
}

export async function stageGitHubDraft(directory, client, { repositoryRoot } = {}) {
  const bundle = verifyReleaseBundle(directory, { repositoryRoot })
  await beforeWrite(client, bundle)
  let release = await client.getRelease(bundle.plan.tag)
  if (release && !release.draft) throw new Error('published-release-is-immutable')
  if (!release) {
    release = await client.json('/releases', { method: 'POST', body: { tag_name: bundle.plan.tag, target_commitish: bundle.plan.commit,
      name: bundle.plan.tag, body: readFileSync(join(directory, 'release-notes.md'), 'utf8'), draft: true, prerelease: bundle.plan.channel === 'prerelease', make_latest: 'false' } })
  }
  await client.verifyTag(bundle.plan.tag, bundle.plan.commit)
  const existing = await client.assets(release.id)
  if (existing.some((item) => !bundle.plan.assets.some((expected) => expected.name === item.name))) throw new Error('draft-has-unexpected-assets')
  for (const expected of bundle.plan.assets) {
    const old = existing.find((item) => item.name === expected.name)
    if (old) {
      if (old.size !== expected.bytes || digest(await client.assetBytes(old)) !== expected.sha256) throw new Error('draft-asset-conflict')
      continue // An identical interrupted draft is resumable; never delete/overwrite.
    }
    await client.response(`https://uploads.github.com${client.prefix}/releases/${release.id}/assets?name=${encoded(expected.name)}`, {
      method: 'POST', body: readFileSync(join(directory, expected.name)), contentType: 'application/octet-stream',
    })
  }
  const assets = await audit(client, bundle, release)
  const receipt = { schema: 1, status: 'draft-verified', repository: bundle.plan.repository, tag: bundle.plan.tag, commit: bundle.plan.commit,
    releaseId: release.id, catalogHash: bundle.plan.catalogHash, assets }
  writeJson(join(directory, 'draft-receipt.json'), receipt)
  return receipt
}

export async function publishGitHubDraft(directory, client, { repositoryRoot } = {}) {
  const bundle = verifyReleaseBundle(directory, { repositoryRoot })
  await beforeWrite(client, bundle)
  const release = await client.getRelease(bundle.plan.tag)
  if (!release?.draft) throw new Error('verified-draft-required')
  const assets = await audit(client, bundle, release)
  const published = await client.json(`/releases/${release.id}`, { method: 'PATCH', body: { draft: false,
    prerelease: bundle.plan.channel === 'prerelease', make_latest: bundle.plan.channel === 'stable' ? 'true' : 'false' } })
  if (published.draft !== false || published.tag_name !== bundle.plan.tag) throw new Error('release-publish-not-confirmed')
  const receipt = { schema: 1, status: 'published', repository: bundle.plan.repository, tag: bundle.plan.tag,
    commit: bundle.plan.commit, releaseId: release.id, catalogHash: bundle.plan.catalogHash, assets }
  writeJson(join(directory, 'published-receipt.json'), receipt)
  return receipt
}

export async function exportLatestHistory(output, client) {
  output = resolve(output)
  if (existsSync(output)) throw new Error('history-output-already-exists')
  const published = await client.catalogs()
  const selected = published.find(({ release }) => !release.prerelease)
  mkdirSync(output, { recursive: true })
  if (!selected) { writeJson(join(output, 'history-status.json'), { schema: 1, empty: true }); return { status: 'no-history' } }
  assertHistory(selected.catalog, published.filter(({ release }) => !release.prerelease))
  mkdirSync(join(output, 'artifacts'))
  const releases = new Map(published.map(({ release, assets }) => [release.tag_name, { release, assets }]))
  for (const entry of selected.catalog.artifacts) {
    let source = releases.get(entry.source.tag)
    if (!source) {
      const release = await client.getRelease(entry.source.tag)
      if (!release || release.draft) throw new Error('history-release-unavailable')
      source = { release, assets: await client.assets(release.id) }
      releases.set(entry.source.tag, source)
    }
    const asset = source.assets.find((item) => item.name === entry.source.asset)
    if (!asset || asset.size !== entry.bytes) throw new Error('history-asset-unavailable')
    const bytes = await client.assetBytes(asset)
    if (digest(bytes) !== entry.sha256) throw new Error('history-asset-integrity-mismatch')
    const path = join(output, 'artifacts', `${entry.sha256}.tgz`)
    writeFileSync(path, bytes)
    inspectArtifact(entry, path)
  }
  writeJson(join(output, RELEASE_FILE), selected.catalog)
  writeJson(join(output, 'history-status.json'), { schema: 1, empty: false, tag: selected.catalog.release.tag })
  return { status: 'history-exported', tag: selected.catalog.release.tag, artifacts: selected.catalog.artifacts.length }
}

/** Anonymous public Release transport; no REST API quota or local Git dependency. */
import { GitHubReleaseClient } from './github-source.js'
import { parseRemoteRelease, RELEASE_FILE, MAX_RELEASE_BYTES, MAX_PACKAGE_BYTES, releaseTag, commitSha } from './release.js'
import { digest } from './install.js'

export function advertisedTags(bytes) {
  const tags = new Map()
  let offset = 0, service = false
  while (offset < bytes.length) {
    const header = bytes.subarray(offset, offset + 4).toString('ascii')
    if (!/^[a-f0-9]{4}$/.test(header)) throw Error('source-invalid-tags')
    const length = parseInt(header, 16)
    offset += 4
    if (length === 0) continue
    if (length < 4 || offset + length - 4 > bytes.length) throw Error('source-invalid-tags')
    const line = bytes.subarray(offset, offset + length - 4).toString('utf8').split('\0')[0].replace(/\n$/, '')
    offset += length - 4
    if (!service) { if (line !== '# service=git-upload-pack') throw Error('source-invalid-tags'); service = true; continue }
    const match = /^([a-f0-9]{40}|[a-f0-9]{64}) refs\/tags\/(.+)$/.exec(line)
    if (match) {
      const key = match[2], tag = key.endsWith('^{}') ? key.slice(0, -3) : key
      if (!releaseTag(tag) || tags.has(key)) throw Error('source-invalid-tags')
      tags.set(key, match[1])
    }
  }
  if (!service) throw Error('source-invalid-tags')
  return tags
}

export class PublicGitHubReleaseClient extends GitHubReleaseClient {
  constructor(options) {
    super({ ...options, token: undefined })
    this.base = `https://github.com/${encodeURIComponent(this.repository.owner)}/${encodeURIComponent(this.repository.repo)}`
    this.catalogs = new Map()
    this.tagPromise = null
  }
  async latestCatalog() {
    const bytes = await this.response(`${this.base}/releases/latest/download/${RELEASE_FILE}`, { binary: true, maximum: MAX_RELEASE_BYTES, allow404: true })
    if (bytes === null) throw Error('source-public-release-unavailable')
    const catalog = parseRemoteRelease(bytes, { repository: this.repository })
    if (catalog.release.channel !== 'stable') throw Error('source-release-mismatch')
    this.catalogs.set(catalog.release.tag, catalog)
    return catalog
  }
  async getRelease(tag) {
    if (!releaseTag(tag)) throw Error('invalid-release-tag')
    if (!this.catalogs.has(tag)) {
      const bytes = await this.response(`${this.base}/releases/download/${encodeURIComponent(tag)}/${RELEASE_FILE}`, { binary: true, maximum: MAX_RELEASE_BYTES, allow404: true })
      if (bytes === null) return null
      const catalog = parseRemoteRelease(bytes, { repository: this.repository })
      if (catalog.release.tag !== tag) throw Error('source-release-mismatch')
      this.catalogs.set(tag, catalog)
    }
    return { id: tag, tag_name: tag, draft: false }
  }
  async assets(tag) {
    const catalog = this.catalogs.get(tag)
    if (!catalog) throw Error('source-release-unavailable')
    return catalog.artifacts.filter((entry) => entry.source.tag === tag).map((entry) => ({
      id: `${tag}/${entry.source.asset}`, tag, name: entry.source.asset, size: entry.bytes, state: 'uploaded', digest: `sha256:${entry.sha256}`,
    }))
  }
  async assetBytes(asset, maximum = MAX_PACKAGE_BYTES) {
    const known = (await this.assets(asset.tag)).find((entry) => entry.id === asset.id)
    if (!known || known.name !== asset.name || known.size !== asset.size || known.size > maximum) throw Error('source-asset-unavailable')
    const bytes = await this.response(`${this.base}/releases/download/${encodeURIComponent(known.tag)}/${encodeURIComponent(known.name)}`, { binary: true, maximum })
    if (bytes.length !== known.size || `sha256:${digest(bytes)}` !== known.digest) throw Error('source-integrity-mismatch')
    return bytes
  }
  async verifyTag(tag, commit) {
    if (!releaseTag(tag) || !commitSha(commit)) throw Error('source-invalid-tags')
    this.tagPromise ??= this.response(`${this.base}.git/info/refs?service=git-upload-pack`, { binary: true, maximum: 2 * 1024 * 1024 }).then(advertisedTags)
      .catch((error) => { this.tagPromise = null; throw error })
    const tags = await this.tagPromise
    if ((tags.get(`${tag}^{}`) ?? tags.get(tag)) !== commit) throw Error('remote-tag-commit-mismatch')
  }
}

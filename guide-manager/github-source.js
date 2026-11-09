/** Read-only GitHub transport shared by the manager and maintainer tools. */
import { digest } from './install.js'
import { MAX_PACKAGE_BYTES, validateRepository, releaseTag } from './release.js'
const MAX_API_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 4
const CDN_HOSTS = new Set(['release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github.com'])
const encoded = (value) => encodeURIComponent(String(value))
export class GitHubReleaseClient {
  constructor({ repository, token, fetchImpl = globalThis.fetch, signal, onProgress = () => {} }) {
    this.repository = validateRepository(repository)
    this.token = token
    this.fetch = fetchImpl
    this.signal = signal
    this.onProgress = onProgress
    this.prefix = `/repos/${encoded(repository.owner)}/${encoded(repository.repo)}`
  }
  async bytes(response, maximum) {
    if (Number(response.headers.get('content-length')) > maximum) { await response.body?.cancel(); throw new Error('github-response-too-large') }
    const chunks = []
    let length = 0
    try {
      for await (const chunk of response.body ?? []) {
        length += chunk.length
        if (length > maximum) throw new Error('github-response-too-large')
        chunks.push(Buffer.from(chunk))
        this.onProgress(length)
      }
    } catch (error) {
      if (error.message === 'github-response-too-large') throw error
      throw new Error('github-download-interrupted')
    }
    return Buffer.concat(chunks)
  }
  async response(url, { method = 'GET', body, accept = 'application/vnd.github+json', contentType = 'application/json', allow404 = false, binary = false, maximum = MAX_API_BYTES } = {}) {
    let address = new URL(url)
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const api = address.hostname === 'api.github.com'
      const upload = address.hostname === 'uploads.github.com'
      if (address.protocol !== 'https:' || address.username || address.password || address.port
        || (!api && !upload && !(binary && CDN_HOSTS.has(address.hostname)))) throw new Error('untrusted-github-address')
      const headers = { Accept: accept, 'User-Agent': 'dsh-guide-release', 'X-GitHub-Api-Version': '2022-11-28' }
      if ((api || upload) && this.token) headers.Authorization = `Bearer ${this.token}`
      if (body !== undefined) headers['Content-Type'] = contentType
      let result
      try {
        const timeout = AbortSignal.timeout(60000)
        result = await this.fetch(address.href, { method, headers, body, redirect: 'manual', signal: this.signal ? AbortSignal.any([this.signal, timeout]) : timeout })
      } catch { throw new Error(this.signal?.aborted ? 'source-cancelled' : 'github-network-or-timeout') }
      if (allow404 && result.status === 404) { await result.body?.cancel(); return null }
      if ([301, 302, 303, 307, 308].includes(result.status)) {
        if (!binary || method !== 'GET' || redirects === MAX_REDIRECTS) throw new Error('unexpected-github-redirect')
        const location = result.headers.get('location')
        if (!location) throw new Error('invalid-github-redirect')
        await result.body?.cancel()
        address = new URL(location, address)
        continue
      }
      if (!result.ok) {
        await result.body?.cancel()
        const limited = result.status === 429 || result.status === 403 && result.headers.get('x-ratelimit-remaining') === '0'
        const error = new Error(limited ? 'github-rate-limited' : `github-http-${result.status}`)
        error.status = result.status
        throw error // Never include response bodies, signed URLs or auth values.
      }
      return this.bytes(result, maximum)
    }
    throw new Error('too-many-github-redirects')
  }
  async json(path, options = {}) {
    const bytes = await this.response(`https://api.github.com${this.prefix}${path}`, {
      ...options, body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    if (bytes === null) return null
    try { return JSON.parse(bytes.toString('utf8')) } catch { throw new Error('invalid-github-json') }
  }
  async assets(releaseId) {
    if (!Number.isSafeInteger(releaseId) || releaseId <= 0) throw new Error('invalid-release-id')
    const assets = []
    for (let page = 1; page <= 4; page++) {
      const rows = await this.json(`/releases/${releaseId}/assets?per_page=100&page=${page}`)
      if (!Array.isArray(rows)) throw new Error('invalid-github-assets')
      assets.push(...rows)
      if (rows.length < 100) {
        if (new Set(assets.map((row) => row.name)).size !== assets.length) throw new Error('duplicate-github-asset')
        return assets
      }
    }
    throw new Error('too-many-release-assets')
  }
  async assetBytes(asset, maximum = MAX_PACKAGE_BYTES) {
    if (!Number.isSafeInteger(asset.id) || asset.id <= 0 || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > maximum || asset.state !== 'uploaded') throw new Error('invalid-github-asset')
    const bytes = await this.response(`https://api.github.com${this.prefix}/releases/assets/${asset.id}`, { binary: true, accept: 'application/octet-stream', maximum })
    if (bytes.length !== asset.size) throw new Error('github-asset-length-mismatch')
    if (asset.digest != null && asset.digest !== `sha256:${digest(bytes)}`) throw new Error('github-asset-digest-mismatch')
    return bytes
  }
  async getRelease(tag) {
    if (!releaseTag(tag)) throw new Error('invalid-release-tag')
    return this.json(`/releases/tags/${encoded(tag)}`, { allow404: true })
  }
  async verifyTag(tag, commit, { allowMissing = false } = {}) {
    const ref = await this.json(`/git/ref/tags/${encoded(tag)}`, { allow404: true })
    if (!ref) { if (allowMissing) return; throw new Error('release-tag-not-found') }
    let object = ref.object
    for (let depth = 0; object?.type === 'tag' && depth < 4; depth++) {
      if (!/^[a-f0-9]{40,64}$/.test(object.sha)) throw new Error('invalid-github-tag-object')
      object = (await this.json(`/git/tags/${object.sha}`)).object
    }
    if (object?.type !== 'commit' || object.sha !== commit) throw new Error('remote-tag-commit-mismatch')
  }
}

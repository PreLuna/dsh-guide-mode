/** Phase 5D-0 transport contract. Metadata only: no network, credentials or file IO. */
import { COMPONENTS } from './core.js'
import { fingerprint, INSTALL_ORDER, INSTALL_REQUIRES } from './install.js'

export const RELEASE_FILE = 'guide-release.json'
export const RELEASE_KEYS = [...INSTALL_ORDER, 'manager']
export const RELEASE_PACKAGES = Object.freeze(Object.fromEntries([...COMPONENTS.map(({ key, package: name }) => [key, name]), ['manager', '@local/dsh-guide-manager']]))
export const MAX_PACKAGE_BYTES = 8 * 1024 * 1024
export const MAX_RELEASE_BYTES = 1024 * 1024
const exact = (value) => typeof value === 'string' && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value)
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export const commitSha = (value) => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)
export const releaseTag = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value) && !value.includes('..') && !value.endsWith('.')
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
function fields(value, required, optional = []) {
  if (!object(value) || required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) throw new Error('invalid-release-fields')
}
export function validateRepository(value) {
  fields(value, ['owner', 'repo'])
  if (typeof value.owner !== 'string' || typeof value.repo !== 'string' || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(value.owner ?? '')
    || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value.repo ?? '') || value.repo.includes('..') || value.repo.endsWith('.git') || value.repo.endsWith('.')) throw new Error('invalid-release-repository')
  return value
}
export const sameRepository = (a, b) => a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase()
export function packageAsset(key, version) {
  if (!RELEASE_PACKAGES[key] || !exact(version)) throw new Error('invalid-package-identity')
  return `${RELEASE_PACKAGES[key].replace('@', '').replace('/', '-')}-${version}.tgz`
}
function host(value) {
  fields(value, ['dsh', 'build', 'cordis', 'betterSidebar'])
  if (typeof value.dsh !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value.dsh) || !exact(value.cordis) || !exact(value.betterSidebar)
    || typeof value.build !== 'string' || !/^[a-f0-9]{7,64}$/.test(value.build)) throw new Error('invalid-release-host')
}

export function validateSourceConfig(value) {
  fields(value, ['schema', 'provider', 'owner', 'repo', 'channel', 'tokenEnv'])
  validateRepository({ owner: value.owner, repo: value.repo })
  if (value.schema !== 1 || value.provider !== 'github' || value.channel !== 'stable'
    || !/^DSH_GUIDE_[A-Z0-9_]*TOKEN$/.test(value.tokenEnv ?? '')) throw new Error('invalid-source-config')
  return value
}

export function validateRemoteRelease(value, { repository, allowDevelopment = false } = {}) {
  if (Buffer.byteLength(JSON.stringify(value) ?? '') > MAX_RELEASE_BYTES) throw new Error('release-metadata-too-large')
  fields(value, ['schema', 'product', 'repository', 'release', 'artifacts', 'combinations', 'recommendedCombination', 'recommendedManager'])
  if (value.schema !== 4 || value.product !== 'dsh-guide-mode') throw new Error('unsupported-remote-release')
  validateRepository(value.repository)
  if (repository && !sameRepository(validateRepository(repository), value.repository)) throw new Error('release-repository-mismatch')
  fields(value.release, ['tag', 'commit', 'channel', 'source'])
  if (!releaseTag(value.release.tag) || !['stable', 'prerelease', 'development'].includes(value.release.channel)) throw new Error('invalid-release-identity')
  const development = value.release.source === 'development-snapshot'
  if (development ? !allowDevelopment || value.release.commit !== null || value.release.channel !== 'development'
    : value.release.source !== 'git-commit' || !commitSha(value.release.commit) || value.release.channel === 'development') throw new Error('invalid-release-provenance')
  if (!Array.isArray(value.artifacts) || value.artifacts.length < 7 || value.artifacts.length > 80 || !Array.isArray(value.combinations) || !value.combinations.length || value.combinations.length > 32) throw new Error('invalid-release-size')
  const identities = new Set()
  const sources = new Map()
  for (const entry of value.artifacts) {
    fields(entry, ['key', 'package', 'version', 'contract', 'dataSchema', 'sha256', 'bytes', 'source', 'requires'], entry.key === 'manager' ? ['controlSchema', 'host'] : [])
    const id = `${entry.key}@${entry.version}`
    if (!RELEASE_KEYS.includes(entry.key) || entry.package !== RELEASE_PACKAGES[entry.key] || !exact(entry.version) || entry.contract !== 1 || entry.dataSchema !== 1 || identities.has(id)) throw new Error('invalid-release-artifact')
    identities.add(id)
    if (!sha(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > MAX_PACKAGE_BYTES) throw new Error('invalid-release-integrity')
    fields(entry.source, ['tag', 'asset', 'commit'])
    if (!releaseTag(entry.source.tag) || entry.source.asset !== packageAsset(entry.key, entry.version)
      || !(commitSha(entry.source.commit) || development && entry.source.commit === null)) throw new Error('invalid-release-asset-source')
    if (entry.source.tag === value.release.tag && entry.source.commit !== value.release.commit) throw new Error('release-commit-mismatch')
    const sourceId = `${entry.source.tag}/${entry.source.asset}`
    if (sources.has(sourceId) && sources.get(sourceId) !== entry.sha256) throw new Error('release-asset-conflict')
    sources.set(sourceId, entry.sha256)
    if (!object(entry.requires) || Object.keys(entry.requires).some((key) => !INSTALL_ORDER.includes(key))) throw new Error('invalid-release-requirements')
    for (const versions of Object.values(entry.requires)) if (!Array.isArray(versions) || !versions.length || versions.length > 60 || new Set(versions).size !== versions.length || versions.some((version) => !exact(version))) throw new Error('invalid-release-peer')
    if (entry.key === 'manager') {
      if (entry.controlSchema !== 1 || Object.keys(entry.requires).length) throw new Error('unsupported-manager-contract')
      host(entry.host)
    }
  }
  const artifact = (key, version) => value.artifacts.find((entry) => entry.key === key && entry.version === version)
  for (const entry of value.artifacts) for (const [key, versions] of Object.entries(entry.requires)) if (versions.some((version) => !artifact(key, version))) throw new Error('release-peer-artifact-unavailable')
  const combinations = new Set()
  for (const combo of value.combinations) {
    fields(combo, ['id', 'host', 'versions', 'validation'])
    host(combo.host)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(combo.id ?? '') || combinations.has(combo.id) || combo.validation !== 'maintainer-declared') throw new Error('invalid-release-combination')
    combinations.add(combo.id)
    fields(combo.versions, INSTALL_ORDER)
    for (const key of INSTALL_ORDER) {
      const entry = artifact(key, combo.versions[key])
      if (!entry) throw new Error('release-combination-artifact-unavailable')
      for (const required of INSTALL_REQUIRES[key] ?? []) if (!Object.hasOwn(entry.requires, required)) throw new Error('release-required-edge-missing')
      for (const [peer, versions] of Object.entries(entry.requires)) if (!versions.includes(combo.versions[peer])) throw new Error('incompatible-release-combination')
    }
  }
  const recommended = value.combinations.find((combo) => combo.id === value.recommendedCombination)
  const manager = artifact('manager', value.recommendedManager)
  if (!recommended || !manager || fingerprint(recommended.host) !== fingerprint(manager.host)) throw new Error('invalid-release-recommendation')
  return value
}

export function parseRemoteRelease(bytes, options) {
  if (typeof bytes !== 'string' && !Buffer.isBuffer(bytes)) throw new Error('invalid-release-input')
  if (Buffer.byteLength(bytes) > MAX_RELEASE_BYTES) throw new Error('release-metadata-too-large')
  return validateRemoteRelease(JSON.parse(bytes.toString()), options)
}

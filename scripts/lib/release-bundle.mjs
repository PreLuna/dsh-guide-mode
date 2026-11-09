/** Compile portable GitHub release bundles, preserving verified historical artifacts. */
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { artifactInventory } from '../../guide-manager/artifacts.js'
import { digest, fingerprint, INSTALL_ORDER, INSTALL_REQUIRES, readJson, writeJson } from '../../guide-manager/install.js'
import { packageAsset, RELEASE_FILE, RELEASE_KEYS, RELEASE_PACKAGES, releaseTag, validateRemoteRelease, validateRepository, validateSourceConfig } from '../../guide-manager/release.js'
import { materializeCommit, packPackages, resolveNpmCli, verifyPackageCommit } from './package-artifacts.mjs'

export const AUXILIARY_ASSETS = [RELEASE_FILE, 'release-notes.md', 'source-config.example.json', 'SHA256SUMS.txt']
const identity = (entry) => `${entry.key}@${entry.version}`
const emit = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)

export function localArtifactFile(directory, entry) {
  const root = join(directory, entry.source.asset)
  const path = existsSync(root) ? root : join(directory, 'artifacts', `${entry.sha256}.tgz`)
  if (statSync(path).size !== entry.bytes || digest(readFileSync(path)) !== entry.sha256) throw new Error('history-artifact-integrity-mismatch')
  return path
}

export function inspectArtifact(entry, file) {
  const inventory = artifactInventory(file, entry.sha256)
  const { manifest } = inventory
  if (manifest.name !== entry.package || manifest.version !== entry.version || manifest.private !== true || manifest.license !== 'UNLICENSED'
    || (manifest.dshGuide?.dataSchema ?? 1) !== 1 || (entry.key !== 'manager' && manifest.dshGuide?.contract !== 1)) throw new Error('artifact-manifest-mismatch')
  if (entry.key === 'manager' && (manifest.dshGuide?.product !== 'dsh-guide-mode' || (manifest.dshGuide.controlSchema ?? 1) !== 1 || fingerprint(manifest.dshGuide.host) !== fingerprint(entry.host))) throw new Error('manager-artifact-mismatch')
  return inventory
}

function peerRequirements(records, npmCli) {
  const semver = createRequire(resolveNpmCli(npmCli))('semver')
  for (const record of records) {
    const ranges = Object.entries({ ...record.manifest.dependencies, ...record.manifest.peerDependencies })
      .flatMap(([name, range]) => { const key = RELEASE_KEYS.find((item) => RELEASE_PACKAGES[item] === name); return key ? [[key, range]] : [] })
    if (ranges.some(([key]) => key === 'manager') || (record.entry.key === 'manager' && ranges.length)) throw new Error('invalid-internal-manager-dependency')
    const requirements = {}
    for (const [key, range] of ranges) {
      if (!semver.validRange(range)) throw new Error('invalid-internal-peer-range')
      requirements[key] = records.filter(({ entry }) => entry.key === key && semver.satisfies(entry.version, range)).map(({ entry }) => entry.version).sort(semver.compare)
      if (!requirements[key].length) throw new Error(`missing-compatible-peer:${record.entry.key}->${key}`)
    }
    // The panel consumes the data-only preset via its provider, not an npm import.
    if (record.entry.key === 'panel' && !requirements.preset) requirements.preset = records.filter(({ entry }) => entry.key === 'preset').map(({ entry }) => entry.version).sort(semver.compare)
    for (const key of INSTALL_REQUIRES[record.entry.key] ?? []) if (!requirements[key]?.length) throw new Error('missing-required-component-edge')
    record.entry.requires = Object.fromEntries(Object.entries(requirements).sort(([a], [b]) => a.localeCompare(b)))
  }
}

export function prepareRemoteRelease({ repositoryRoot, commit, sourceRoot, development = false, tag, repository, channel = 'stable', previous = [], output, npmCli = process.env.npm_execpath }) {
  validateRepository(repository)
  if (!releaseTag(tag) || !['stable', 'prerelease'].includes(channel)) throw new Error('invalid-release-options')
  if (!npmCli || !existsSync(npmCli)) throw new Error('run-through-npm')
  if (development ? !sourceRoot || commit !== undefined : sourceRoot !== undefined || !commit) throw new Error('select-commit-or-explicit-development-source')
  output = resolve(output)
  if (existsSync(output)) throw new Error('release-output-already-exists')
  mkdirSync(output, { recursive: true })
  let sourceCommit = null
  if (!development) {
    const materialized = materializeCommit(resolve(repositoryRoot), commit, join(output, 'verification'))
    sourceRoot = materialized.sourceRoot
    sourceCommit = materialized.commit
  } else sourceRoot = resolve(sourceRoot)

  const records = new Map()
  const combinations = new Map()
  for (const directory of previous.map((value) => resolve(value))) {
    // Optional workflow history can explicitly record that no product release exists.
    const catalog = validateRemoteRelease(readJson(join(directory, RELEASE_FILE)), { repository, allowDevelopment: development })
    if (catalog.release.tag === tag) throw new Error('release-tag-already-in-history')
    for (const entry of catalog.artifacts) {
      const id = identity(entry)
      if (records.has(id) && records.get(id).entry.sha256 !== entry.sha256) throw new Error(`same-version-different-bytes:${id}`)
      const file = localArtifactFile(directory, entry)
      const inventory = inspectArtifact(entry, file)
      records.set(id, { entry: structuredClone(entry), file, ...inventory })
    }
    for (const combo of catalog.combinations) {
      if (combinations.has(combo.id) && fingerprint(combinations.get(combo.id)) !== fingerprint(combo)) throw new Error('history-combination-conflict')
      combinations.set(combo.id, structuredClone(combo))
    }
  }

  const packed = packPackages({ sourceRoot, output, npmCli, cacheRoot: join(output, 'verification', 'npm-cache') })
  const manager = packed.find((entry) => entry.key === 'manager')
  for (const required of ['install.js', 'upgrade.js', 'maintenance.js', 'helper/apply-install.mjs', 'helper/apply-package.mjs', 'helper/apply-maintenance.mjs', 'helper/recover-manager.ps1']) {
    if (!manager.fileHashes[required]) throw new Error('manager-does-not-contain-phase5-runtime')
  }
  const currentVersions = {}
  for (const item of packed) {
    const entry = { key: item.key, package: item.package, version: item.version, contract: 1, dataSchema: 1, sha256: item.sha256, bytes: item.bytes,
      source: { tag, asset: packageAsset(item.key, item.version), commit: sourceCommit }, requires: {},
      ...(item.key === 'manager' ? { controlSchema: 1, host: manager.manifest.dshGuide.host } : {}) }
    const old = records.get(identity(entry))
    if (old && old.entry.sha256 !== entry.sha256) {
      if (fingerprint(old.files) !== fingerprint(item.fileHashes)) throw new Error(`same-version-different-bytes:${identity(entry)}`)
      // Identical package contents may be repacked differently. Reuse the original
      // verified archive bytes, preserving the immutable version identity.
      copyFileSync(old.file, item.file)
      entry.sha256 = old.entry.sha256
      entry.bytes = old.entry.bytes
    }
    records.set(identity(entry), { entry, file: item.file, manifest: item.manifest, files: item.fileHashes })
    if (item.key !== 'manager') currentVersions[item.key] = item.version
  }
  const current = { id: `combo-${fingerprint({ host: manager.manifest.dshGuide.host, versions: currentVersions }).slice(0, 20)}`,
    host: manager.manifest.dshGuide.host, versions: currentVersions, validation: 'maintainer-declared' }
  combinations.set(current.id, current)
  const all = [...records.values()].sort((a, b) => identity(a.entry).localeCompare(identity(b.entry)))
  peerRequirements(all, npmCli)
  const installVersions = Object.fromEntries(INSTALL_ORDER.map((key) => [key, manager.manifest.dshGuide.components?.[RELEASE_PACKAGES[key]]?.version]))
  const recommended = [...combinations.values()].find((combo) => fingerprint(combo.host) === fingerprint(current.host) && fingerprint(combo.versions) === fingerprint(installVersions))
  if (!recommended) throw new Error('no-install-baseline-for-manager-bom')
  const catalog = validateRemoteRelease({ schema: 4, product: 'dsh-guide-mode', repository,
    release: { tag, commit: sourceCommit, channel: development ? 'development' : channel, source: development ? 'development-snapshot' : 'git-commit' },
    artifacts: all.map(({ entry }) => entry), combinations: [...combinations.values()].sort((a, b) => a.id.localeCompare(b.id)),
    recommendedCombination: recommended.id, recommendedManager: manager.version }, { repository, allowDevelopment: development })
  mkdirSync(join(output, 'artifacts'))
  for (const record of all) copyFileSync(record.file, join(output, 'artifacts', `${record.entry.sha256}.tgz`))
  emit(join(output, RELEASE_FILE), catalog)
  const config = validateSourceConfig({ schema: 1, provider: 'github', ...repository, channel: 'stable', tokenEnv: 'DSH_GUIDE_GITHUB_TOKEN',
    ...(manager.manifest.dshGuide.source?.access === 'public' ? { access: 'public' } : {}) })
  emit(join(output, 'source-config.example.json'), config)
  const notes = [`# ${tag}`, '', `Source: ${sourceCommit ?? 'DEVELOPMENT SNAPSHOT — NOT PUBLISHABLE'}`, '',
    ...packed.map((entry) => `- ${entry.package}: ${entry.version}`), '',
    'Compatibility combinations are maintainer-declared; complete host/UI acceptance is recorded separately.',
    'Install the manager tarball through official Plugins, then configure the release source. Remote UI integration is delivered in Phase 5D-2/3.', ''].join('\n')
  writeFileSync(join(output, 'release-notes.md'), notes)
  const names = [...packed.map((entry) => packageAsset(entry.key, entry.version)), ...AUXILIARY_ASSETS.filter((name) => name !== 'SHA256SUMS.txt')].sort()
  writeFileSync(join(output, 'SHA256SUMS.txt'), names.map((name) => `${digest(readFileSync(join(output, name)))}  ${name}`).join('\n') + '\n')
  const assets = [...names, 'SHA256SUMS.txt'].sort().map((name) => ({ name, sha256: digest(readFileSync(join(output, name))), bytes: statSync(join(output, name)).size }))
  emit(join(output, 'publish-plan.json'), { schema: 1, kind: 'github-guide-release', publishable: !development, repository,
    tag, commit: sourceCommit, channel: catalog.release.channel, catalogHash: digest(readFileSync(join(output, RELEASE_FILE))), assets })
  return verifyReleaseBundle(output, { repositoryRoot: development ? undefined : repositoryRoot, allowDevelopment: development })
}

export function verifyReleaseBundle(directory, { repositoryRoot, allowDevelopment = false } = {}) {
  directory = resolve(directory)
  const plan = readJson(join(directory, 'publish-plan.json'))
  const catalog = validateRemoteRelease(readJson(join(directory, RELEASE_FILE)), { allowDevelopment })
  const current = catalog.artifacts.filter((entry) => entry.source.tag === catalog.release.tag)
  if (plan.schema !== 1 || plan.kind !== 'github-guide-release' || plan.publishable !== (catalog.release.source === 'git-commit')
    || fingerprint(plan.repository) !== fingerprint(catalog.repository) || plan.tag !== catalog.release.tag || plan.commit !== catalog.release.commit || plan.channel !== catalog.release.channel
    || plan.catalogHash !== digest(readFileSync(join(directory, RELEASE_FILE))) || current.length !== 7 || new Set(current.map((entry) => entry.key)).size !== 7) throw new Error('invalid-publish-plan')
  const names = [...current.map((entry) => entry.source.asset), ...AUXILIARY_ASSETS].sort()
  if (!Array.isArray(plan.assets) || fingerprint(plan.assets.map((entry) => entry.name).sort()) !== fingerprint(names)) throw new Error('invalid-publish-assets')
  for (const entry of plan.assets) if (statSync(join(directory, entry.name)).size !== entry.bytes || digest(readFileSync(join(directory, entry.name))) !== entry.sha256) throw new Error('publish-asset-integrity-mismatch')
  const checksums = names.filter((name) => name !== 'SHA256SUMS.txt').map((name) => `${digest(readFileSync(join(directory, name)))}  ${name}`).join('\n') + '\n'
  if (readFileSync(join(directory, 'SHA256SUMS.txt'), 'utf8') !== checksums) throw new Error('invalid-publish-checksums')
  const config = validateSourceConfig(readJson(join(directory, 'source-config.example.json')))
  if (config.owner !== catalog.repository.owner || config.repo !== catalog.repository.repo) throw new Error('source-config-repository-mismatch')
  const verified = []
  for (const entry of catalog.artifacts) {
    const file = localArtifactFile(directory, entry)
    const inventory = inspectArtifact(entry, file)
    verified.push({ entry: structuredClone(entry), ...inventory })
    if (repositoryRoot && entry.source.tag === plan.tag) verifyPackageCommit(repositoryRoot, plan.commit, entry.key, inventory.files)
  }
  peerRequirements(verified)
  for (const record of verified) {
    const declared = catalog.artifacts.find((entry) => identity(entry) === identity(record.entry))
    if (fingerprint(declared.requires) !== fingerprint(record.entry.requires)) throw new Error('release-peer-metadata-mismatch')
  }
  const manager = verified.find(({ entry }) => entry.key === 'manager' && entry.version === catalog.recommendedManager)
  const expectedVersions = Object.fromEntries(INSTALL_ORDER.map((key) => [key, manager.manifest.dshGuide.components?.[RELEASE_PACKAGES[key]]?.version]))
  if (fingerprint(expectedVersions) !== fingerprint(catalog.combinations.find((combo) => combo.id === catalog.recommendedCombination).versions)) throw new Error('release-install-baseline-mismatch')
  return { directory, plan, catalog }
}

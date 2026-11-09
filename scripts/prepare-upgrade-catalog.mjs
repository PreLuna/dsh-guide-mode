/** Compile finite compatible version combinations from explicit local release directories. */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { COMPONENTS } from '../guide-manager/core.js'
import { digest, fingerprint, INSTALL_ORDER, readJson } from '../guide-manager/install.js'
import { readUpgradeCatalog } from '../guide-manager/upgrade.js'

const args = process.argv.slice(2)
const releases = args.flatMap((arg, index) => arg === '--release' ? [resolve(args[index + 1])] : [])
const outputIndex = args.indexOf('--output')
if (!releases.length || outputIndex < 0) throw new Error('npm run manager:upgrade-catalog -- --release <directory> [--release <directory>] --output <new-file>')
const output = resolve(args[outputIndex + 1])
if (existsSync(output)) throw new Error('output already exists')
if (!process.env.npm_execpath) throw new Error('run through npm')
const semver = createRequire(process.env.npm_execpath)('semver')
const artifacts = new Map()
const combinations = []
for (const [ordinal, directory] of releases.entries()) {
  const release = readJson(join(directory, 'manifest.json'))
  const manager = release.artifacts.find((item) => item.key === 'manager')
  const managerManifest = JSON.parse(execFileSync('tar', ['-xOf', manager.file, 'package/package.json'], { encoding: 'utf8', windowsHide: true }))
  const versions = {}
  for (const item of release.artifacts.filter((entry) => entry.key !== 'manager')) {
    if (COMPONENTS.find((entry) => entry.key === item.key)?.package !== item.package || digest(readFileSync(item.file)) !== item.sha256) throw new Error('release-integrity-mismatch')
    const manifest = JSON.parse(execFileSync('tar', ['-xOf', item.file, 'package/package.json'], { encoding: 'utf8', windowsHide: true }))
    if (manifest.name !== item.package || manifest.version !== item.version || manifest.dshGuide?.contract !== 1 || (manifest.dshGuide?.dataSchema ?? 1) !== 1) throw new Error('upgrade-manifest-mismatch')
    const key = `${item.key}@${item.version}`
    if (artifacts.has(key) && artifacts.get(key).sha256 !== item.sha256) throw new Error(`same-version-different-bytes:${key}`)
    if (!artifacts.has(key)) artifacts.set(key, { key: item.key, package: item.package, version: item.version, contract: 1, dataSchema: 1, file: item.file, sha256: item.sha256, peers: manifest.peerDependencies ?? {} })
    versions[item.key] = item.version
  }
  if (INSTALL_ORDER.some((key) => !versions[key])) throw new Error('incomplete-release')
  combinations.push({ id: `local-${ordinal + 1}-${fingerprint(versions).slice(0, 10)}`, host: managerManifest.dshGuide.host, versions, validation: 'maintainer-declared-local-combination' })
}
const compiled = [...artifacts.values()].map(({ peers, ...artifact }) => ({ ...artifact, requires: Object.fromEntries(Object.entries(peers).flatMap(([name, range]) => {
  const definition = COMPONENTS.find((entry) => entry.package === name)
  if (!definition) return []
  const versions = [...artifacts.values()].filter((item) => item.key === definition.key && semver.satisfies(item.version, range)).map((item) => item.version)
  if (!versions.length) throw new Error(`no-compatible-peer:${artifact.key}->${definition.key}`)
  return [[definition.key, versions]]
})) }))
const catalog = { schema: 2, product: 'dsh-guide-mode', artifacts: compiled, combinations }
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(catalog, null, 2)}\n`)
readUpgradeCatalog(output)
console.log(JSON.stringify({ status: 'compiled', output, artifacts: compiled.length, combinations: combinations.length, published: false }))

/** Read-only cache inventory and SHA-pinned rebuild plans. Never changes profile config. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { digest, fingerprint, readJson } from './install.js'

const SHA = /^[a-f0-9]{64}$/
const RECEIPT = 'cache-result.json'

export function cacheDirectory(profile) {
  return join(profile.dir, '.guide-manager', 'package-cache')
}

export function cacheEntries(profile) {
  if (!profile?.dir || !isAbsolute(profile.dir)) return []
  const manifest = readJson(join(profile.dir, 'package.json'))
  const root = cacheDirectory(profile)
  return Object.entries(manifest.dependencies ?? {}).flatMap(([name, spec]) => {
    if (typeof spec !== 'string' || !spec.startsWith('file:')) return []
    const file = resolve(profile.dir, spec.slice(5))
    const within = relative(root, file)
    if (!within || within.startsWith('..') || isAbsolute(within)) return []
    const match = basename(file).match(/^([a-f0-9]{64})\.tgz$/)
    if (!match) return []
    const expected = match[1]
    if (!existsSync(file)) return [{ name, spec, file, sha256: expected, status: 'missing', bytes: 0 }]
    const actual = digest(readFileSync(file))
    return [{ name, spec, file, sha256: expected, actual, status: actual === expected ? 'ready' : 'corrupt', bytes: statSync(file).size }]
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export function cacheView(profile) {
  if (!profile?.dir) return { entries: [], issues: [], healthy: false, reason: 'profile-unavailable' }
  try {
    const entries = cacheEntries(profile)
    const issues = entries.filter((entry) => entry.status !== 'ready')
    return { entries, issues, healthy: issues.length === 0, checkedAt: new Date().toISOString() }
  } catch (error) {
    return { entries: [], issues: [], healthy: false, reason: String(error.message ?? error) }
  }
}

export function readCacheCatalog(path) {
  if (!path || !existsSync(path)) return null
  const document = readJson(path)
  const artifacts = Array.isArray(document) ? document : document.artifacts ?? document.components ?? []
  if (!Array.isArray(artifacts)) return null
  return { path, hash: fingerprint(document), artifacts }
}

function catalogArtifact(entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.package !== 'string' || typeof entry.version !== 'string' || !SHA.test(entry.sha256 ?? '')) return null
  if (!entry.file || !isAbsolute(entry.file) || !existsSync(entry.file)) return null
  return entry
}

export function createCacheRebuildPlan(profile, catalogPaths) {
  const entries = cacheEntries(profile)
  const issues = entries.filter((entry) => entry.status !== 'ready')
  const catalogs = [...new Set((catalogPaths ?? []).filter(Boolean))].map(readCacheCatalog).filter(Boolean)
  const blockers = []
  const targets = []
  for (const issue of issues) {
    const candidates = catalogs.flatMap((catalog) => catalog.artifacts).filter((entry) => entry?.sha256 === issue.sha256 && entry.package === issue.name)
    const source = candidates.find(catalogArtifact)
    if (!source) { blockers.push(`cache-source-unavailable:${issue.name}`); continue }
    targets.push({ key: issue.name, package: issue.name, version: source.version, sha256: issue.sha256, file: source.file, bytes: statSync(source.file).size })
  }
  const body = { schema: 1, kind: 'cache-rebuild', profile: { dir: profile.dir }, targets, blockers: [...new Set(blockers)], before: fingerprint(entries) }
  return { ...body, id: fingerprint(body) }
}

export function cachePlanView(profile, catalogPaths) {
  try { return createCacheRebuildPlan(profile, catalogPaths) }
  catch (error) { return { schema: 1, kind: 'cache-rebuild', profile: { dir: profile?.dir ?? null }, targets: [], blockers: [String(error.message ?? error)] } }
}

export function writeCacheArtifact(profile, source) {
  if (!source?.sha256 || !source.file) throw new Error('invalid-cache-source')
  if (digest(readFileSync(source.file)) !== source.sha256) throw new Error('cache-source-integrity-mismatch')
  const destination = cachePathFor(profile, source.sha256)
  mkdirSync(dirname(destination), { recursive: true })
  const temporary = join(dirname(destination), `.${basename(destination)}.${process.pid}.tmp`)
  try {
    copyFileSync(source.file, temporary)
    if (digest(readFileSync(temporary)) !== source.sha256) throw new Error('cache-copy-integrity-mismatch')
    if (existsSync(destination)) unlinkSync(destination)
    renameSync(temporary, destination)
  } finally { if (existsSync(temporary)) unlinkSync(temporary) }
  return destination
}

function cachePathFor(profile, sha256) {
  return join(cacheDirectory(profile), `${sha256}.tgz`)
}

export function applyCacheRebuildPlan(plan) {
  if (plan?.schema !== 1 || plan.kind !== 'cache-rebuild' || !Array.isArray(plan.targets) || plan.blockers?.length) throw new Error('invalid-cache-plan')
  const { id, ...body } = plan
  if (fingerprint(body) !== id) throw new Error('invalid-cache-plan-fingerprint')
  const profile = plan.profile.dir
  const entries = cacheEntries({ dir: profile })
  if (fingerprint(entries) !== plan.before) throw new Error('stale-cache-plan')
  const written = []
  for (const target of plan.targets) {
    const issue = entries.find((entry) => entry.name === target.package)
    if (!issue || issue.sha256 !== target.sha256) throw new Error(`cache-target-changed:${target.package}`)
    if (issue.status === 'ready') continue
    if (digest(readFileSync(target.file)) !== target.sha256) throw new Error(`cache-source-integrity-mismatch:${target.package}`)
    writeCacheArtifact({ dir: profile }, { file: target.file, sha256: target.sha256 })
    written.push({ key: target.package, version: target.version, sha256: target.sha256 })
  }
  const receipt = { schema: 1, status: 'cache-rebuilt', planId: plan.id, entries: written, finishedAt: new Date().toISOString() }
  writeFileSync(join(profile, '.guide-manager', RECEIPT), `${JSON.stringify(receipt, null, 2)}\n`)
  return receipt
}

export function readCacheReceipt(profile) {
  const path = join(profile.dir, '.guide-manager', RECEIPT)
  return existsSync(path) ? readJson(path) : null
}

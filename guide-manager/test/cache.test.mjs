import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { applyCacheRebuildPlan, cacheEntries, cachePlanView, cacheView } from '../cache.js'
import { digest, readJson, writeJson } from '../install.js'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'guide-cache-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const profile = join(root, 'home', 'profiles', 'desktop')
  const cache = join(profile, '.guide-manager', 'package-cache')
  mkdirSync(cache, { recursive: true })
  const make = (name, bytes, target = cache) => {
    const sha256 = digest(bytes)
    const file = join(target, `${sha256}.tgz`)
    writeFileSync(file, bytes)
    return { name, sha256, file, bytes, spec: `file:${file.replaceAll('\\', '/')}` }
  }
  const good = make('@local/good', Buffer.from('good package bytes'))
  const missing = make('@local/missing', Buffer.from('missing package bytes'))
  const corrupt = make('@local/corrupt', Buffer.from('corrupt old bytes'))
  rmSync(missing.file)
  writeFileSync(corrupt.file, Buffer.from('corrupted bytes'))
  const missingSource = join(root, 'missing-source.tgz')
  writeFileSync(missingSource, missing.bytes)
  const corruptSource = join(root, 'corrupt-source.tgz')
  writeFileSync(corruptSource, corrupt.bytes)
  writeJson(join(profile, 'package.json'), { private: true, dependencies: {
    '@local/good': good.spec, '@local/missing': missing.spec, '@local/corrupt': corrupt.spec,
    'external-package': '^1.0.0',
  } })
  for (const name of ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'pnpm-workspace.yaml']) {
    if (name !== 'package.json') writeFileSync(join(profile, name), `# ${name}\n`)
  }
  const catalog = join(root, 'release.json')
  writeJson(catalog, { schema: 4, product: 'dsh-guide-mode', artifacts: [
    { key: 'good', package: '@local/good', version: '1.0.0', sha256: good.sha256, file: good.file },
    { key: 'missing', package: '@local/missing', version: '1.0.0', sha256: missing.sha256, file: missingSource },
    { key: 'corrupt', package: '@local/corrupt', version: '1.0.0', sha256: corrupt.sha256, file: corruptSource },
  ] })
  return { root, profile, cache, good, missing, corrupt, missingSource, corruptSource, catalog }
}

test('cache inventory ignores unrelated specs and classifies missing/corrupt', (t) => {
  const f = fixture(t)
  const entries = cacheEntries({ dir: f.profile })
  assert.deepEqual(entries.map((entry) => entry.name).sort(), ['@local/corrupt', '@local/good', '@local/missing'])
  assert.equal(entries.find((entry) => entry.name === '@local/good').status, 'ready')
  assert.equal(entries.find((entry) => entry.name === '@local/missing').status, 'missing')
  assert.equal(entries.find((entry) => entry.name === '@local/corrupt').status, 'corrupt')
  const view = cacheView({ dir: f.profile })
  assert.equal(view.healthy, false)
  assert.equal(view.issues.length, 2)
})

test('cache plan reconstructs only missing/corrupt entries and verifies SHA', (t) => {
  const f = fixture(t)
  const beforeGood = readFileSync(f.good.file)
  const plan = cachePlanView({ dir: f.profile }, [f.catalog])
  assert.deepEqual(plan.blockers, [])
  assert.deepEqual(plan.targets.map((entry) => entry.package).sort(), ['@local/corrupt', '@local/missing'])
  const receipt = applyCacheRebuildPlan(plan)
  assert.equal(receipt.status, 'cache-rebuilt')
  assert.equal(receipt.entries.length, 2)
  assert.deepEqual(readFileSync(f.good.file), beforeGood)
  assert.equal(digest(readFileSync(f.missing.file)), f.missing.sha256)
  assert.equal(digest(readFileSync(f.corrupt.file)), f.corrupt.sha256)
  assert.equal(cacheView({ dir: f.profile }).healthy, true)
})

test('cache plan blocks when a trusted source is absent', (t) => {
  const f = fixture(t)
  writeJson(f.catalog, { schema: 4, product: 'dsh-guide-mode', artifacts: [] })
  const plan = cachePlanView({ dir: f.profile }, [f.catalog])
  assert.ok(plan.blockers.some((item) => item.startsWith('cache-source-unavailable:')))
  assert.deepEqual(plan.targets, [])
})

test('cache plan rejects a source whose bytes do not match its SHA', (t) => {
  const f = fixture(t)
  writeFileSync(f.missingSource, Buffer.from('tampered bytes'))
  const plan = cachePlanView({ dir: f.profile }, [f.catalog])
  assert.deepEqual(plan.blockers, [])
  // The plan is built by SHA; the executor must still verify the source bytes.
  assert.throws(() => applyCacheRebuildPlan(plan), /cache-source-integrity-mismatch/)
})

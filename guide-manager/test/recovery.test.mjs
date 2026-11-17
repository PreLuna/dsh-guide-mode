import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { digest, profileSnapshot, readJson, writeJson } from '../install.js'
import { diagnoseRecovery, recoveryView } from '../recovery.js'
import { recoverHardInterrupt } from '../helper/recover-hard-interrupt.mjs'

const files = ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'pnpm-workspace.yaml']

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'guide-recovery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const profile = join(root, 'home', 'profiles', 'desktop')
  mkdirSync(join(profile, '.guide-manager'), { recursive: true })
  writeJson(join(profile, 'package.json'), { private: true, dependencies: {} })
  for (const name of files.filter((name) => name !== 'package.json')) writeFileSync(join(profile, name), `old ${name}\n`)
  return { root, profile, manager: join(profile, '.guide-manager') }
}

function runtimeFor(profile, entries = []) {
  return {
    withLock: async (_path, callback) => callback(),
    run: async () => {
      for (const entry of entries) {
        const directory = join(profile, 'node_modules', ...entry.package.split('/'))
        mkdirSync(directory, { recursive: true })
        writeJson(join(directory, 'package.json'), { name: entry.package, version: entry.version })
      }
      return { exitCode: 0, timedOut: false }
    },
  }
}

test('diagnoses an interrupted first-install backup as recoverable', (t) => {
  const f = fixture(t)
  const backup = join(f.manager, 'install-backups', '1750000000000-abcdef123456')
  mkdirSync(backup, { recursive: true })
  for (const name of files) writeFileSync(join(backup, name), readFileSync(join(f.profile, name)))
  writeJson(join(backup, 'snapshot.json'), profileSnapshot(f.profile))
  writeJson(join(f.manager, 'install-result.json'), { schema: 1, status: 'installing', backup, entries: [] })
  const view = recoveryView({ dir: f.profile })
  assert.equal(view.issues.length, 1)
  assert.equal(view.issues[0].action, 'install-restore')
  assert.equal(view.issues[0].recoverable, true)
})

test('restores the exact four-file snapshot for an interrupted first install', async (t) => {
  const f = fixture(t)
  const backup = join(f.manager, 'install-backups', '1750000000000-abcdef123456')
  mkdirSync(backup, { recursive: true })
  for (const name of files) {
    writeFileSync(join(backup, name), readFileSync(join(f.profile, name)))
  }
  writeJson(join(backup, 'snapshot.json'), profileSnapshot(f.profile))
  writeFileSync(join(f.profile, 'package.json'), 'partial new package\n')
  writeJson(join(f.manager, 'install-result.json'), { schema: 1, status: 'installing', backup, entries: [] })
  const receipt = await recoverHardInterrupt(f.profile, 'install-restore', '1750000000000-abcdef123456', runtimeFor(f.profile))
  assert.equal(receipt.status, 'restored-awaiting-restart')
  assert.deepEqual(readJson(join(f.profile, 'package.json')).dependencies, {})
  assert.equal(readJson(join(f.manager, 'install-result.json')).status, 'failed-restored')
})

test('diagnoses and restores an interrupted package transaction', async (t) => {
  const f = fixture(t)
  const id = '1750000000000-abcdef123456'
  const directory = join(f.manager, 'package-transactions', id)
  mkdirSync(join(directory, 'artifacts'), { recursive: true })
  mkdirSync(join(directory, 'files'), { recursive: true })
  const before = profileSnapshot(f.profile)
  for (const name of files) copyFileSync(join(f.profile, name), join(directory, 'files', name))
  const previousBytes = Buffer.from('old panel package')
  const previousSha = digest(previousBytes)
  writeFileSync(join(directory, 'artifacts', `panel-${previousSha}.tgz`), previousBytes)
  const transaction = { schema: 1, id, kind: 'package-upgrade', profile: f.profile, status: 'upgrading', before,
    entries: [{ key: 'panel', package: '@local/dsh-guide-panel', version: '1.1.1', previous: { version: '1.1.0', sha256: previousSha, contract: 1, enabled: true } }] }
  writeJson(join(directory, 'transaction.json'), transaction)
  writeFileSync(join(f.profile, 'package.json'), 'new partial package\n')
  writeJson(join(f.manager, 'package-result.json'), { schema: 1, kind: 'package-upgrade', status: 'upgrading', transactionId: id, entries: [] })
  const view = diagnoseRecovery({ dir: f.profile })
  assert.equal(view.issues.length, 1)
  assert.equal(view.issues[0].action, 'package-restore')
  const receipt = await recoverHardInterrupt(f.profile, 'package-restore', id,
    runtimeFor(f.profile, [{ package: '@local/dsh-guide-panel', version: '1.1.0' }]))
  assert.equal(receipt.status, 'restored-awaiting-restart')
  assert.deepEqual(readJson(join(f.profile, 'package.json')).dependencies, {})
  assert.equal(readJson(join(f.manager, 'package-result.json')).status, 'failed-restored')
})

test('restores an interrupted uninstall/maintenance transaction graph', async (t) => {
  const f = fixture(t)
  const id = '1750000000000-abcdef123456'
  const directory = join(f.manager, 'maintenance-transactions', id)
  mkdirSync(join(directory, 'files'), { recursive: true })
  const before = profileSnapshot(f.profile)
  for (const name of files) copyFileSync(join(f.profile, name), join(directory, 'files', name))
  const oldBytes = Buffer.from('old maintenance package')
  const sha = digest(oldBytes)
  writeFileSync(join(directory, 'panel.tgz'), oldBytes)
  const transaction = { schema: 1, id: `plan-${id}`, transactionId: id, kind: 'uninstall', profile: { dir: f.profile, name: 'desktop' },
    status: 'applying', before, entries: [{ key: 'panel', package: '@local/dsh-guide-panel', version: '1.1.0', sha256: sha, contract: 1, enabled: true, files: {} }] }
  writeJson(join(directory, 'transaction.json'), transaction)
  writeFileSync(join(f.profile, 'package.json'), 'half removed package\n')
  writeJson(join(f.manager, 'maintenance-result.json'), { schema: 1, kind: 'uninstall', status: 'applying', transactionId: id, entries: [] })
  const view = diagnoseRecovery({ dir: f.profile })
  assert.equal(view.issues[0].action, 'maintenance-restore')
  const receipt = await recoverHardInterrupt(f.profile, 'maintenance-restore', id,
    runtimeFor(f.profile, [{ package: '@local/dsh-guide-panel', version: '1.1.0' }]))
  assert.equal(receipt.status, 'restored-awaiting-restart')
  assert.deepEqual(readJson(join(f.profile, 'package.json')).dependencies, {})
  assert.equal(readJson(join(f.manager, 'maintenance-result.json')).status, 'failed-restored')
})

test('does not claim a recoverable action when the install backup is gone', (t) => {
  const f = fixture(t)
  writeJson(join(f.manager, 'install-result.json'), { schema: 1, status: 'recovery-required', backup: join(f.manager, 'install-backups', 'missing'), entries: [] })
  const view = recoveryView({ dir: f.profile })
  assert.equal(view.issues.length, 1)
  assert.equal(view.issues[0].action, null)
  assert.equal(view.issues[0].recoverable, false)
})

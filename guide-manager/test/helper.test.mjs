import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { applyPending, validatePending } from '../helper/apply-pending.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'guide-manager-helper-'))
  const profile = join(root, 'profile')
  const stateDir = join(profile, '.guide-manager')
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(join(profile, 'cordis.patch.yml'), '[]\n')
  const pendingPath = join(stateDir, 'pending.json')
  const pending = {
    version: 1,
    profile,
    workspace: root,
    intents: [{
      component: 'goal',
      enabled: false,
      patches: [
        { patchId: 'guide-goal-adapter', moduleName: '@local/dsh-guide-goal-adapter', enabled: false },
        { patchId: 'goal-round-driver', moduleName: '@deepseek-ai/dsh-goal-round-driver', enabled: true },
      ],
    }],
  }
  writeFileSync(pendingPath, JSON.stringify(pending))
  return { root, profile, pendingPath, pending }
}

test('pending validation rejects malformed documents', () => {
  assert.throws(() => validatePending(null))
  assert.throws(() => validatePending({ version: 2, profile: 'C:\\x', intents: [] }))
  assert.throws(() => validatePending({ version: 1, profile: 'C:\\x', intents: [] }))
  assert.throws(() => validatePending({ version: 1, profile: 'C:\\x', intents: [{ component: 'admission', enabled: false, patches: [] }] }))
})

test('applyPending writes every patch, records the backup and removes pending', async () => {
  const data = fixture()
  try {
    const calls = []
    const receipt = await applyPending(data.pendingPath, {
      writer: async (profile, patchId, moduleName, enabled) => {
        calls.push({ dir: profile.dir, patchId, moduleName, enabled })
      },
    })
    assert.equal(receipt.status, 'applied')
    assert.equal(receipt.applied.length, 2)
    assert.deepEqual(calls.map((call) => call.patchId), ['guide-goal-adapter', 'goal-round-driver'])
    assert.equal(calls[0].dir, data.profile)
    assert.equal(existsSync(data.pendingPath), false)
    assert.equal(existsSync(join(data.profile, 'cordis.patch.yml')), true)
    assert.equal(JSON.parse(readFileSync(join(data.profile, '.guide-manager', 'last-apply-result.json'), 'utf8')).status, 'applied')
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
})

test('applyPending restores the patch and keeps pending on failure', async () => {
  const data = fixture()
  try {
    await assert.rejects(applyPending(data.pendingPath, {
      writer: async (_profile, patchId) => {
        if (patchId === 'goal-round-driver') throw new Error('boom')
      },
    }), /boom/)
    assert.equal(existsSync(data.pendingPath), true)
    assert.equal(readFileSync(join(data.profile, 'cordis.patch.yml'), 'utf8'), '[]\n')
    assert.equal(JSON.parse(readFileSync(join(data.profile, '.guide-manager', 'last-apply-result.json'), 'utf8')).status, 'failed')
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
})

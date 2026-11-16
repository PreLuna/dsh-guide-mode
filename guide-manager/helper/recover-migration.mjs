/** Independent recovery for one migration transaction; invoked by the controller copy. */
import { existsSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJson, writeJson } from '../install.js'
import { recoverMigrationTransaction } from './apply-migration.mjs'
import { officialRuntime } from './apply-install.mjs'

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const profile = resolve(process.argv[2] ?? '')
    const transactionId = process.argv[3]
    if (!/^\d{13}-[a-f0-9]{12}$/.test(transactionId ?? '')) throw new Error('invalid-migration-transaction')
    const transaction = readJson(join(profile, '.guide-manager', 'migration-transactions', transactionId, 'transaction.json'))
    const result = await recoverMigrationTransaction(profile, transactionId, await officialRuntime())
    const receipt = { schema: 1, kind: 'migration-recovery', transactionId, status: result.mode === 'failed' ? 'recovery-required' : 'recovered', mode: result.mode,
      restoredSources: result.restoredSources ?? [], finishedAt: new Date().toISOString() }
    writeJson(join(profile, '.guide-manager', 'migration-recovery-result.json'), receipt)
    if (receipt.status === 'recovered') {
      const pendingPath = join(profile, '.guide-manager', 'migration-pending.json')
      if (existsSync(pendingPath) && readJson(pendingPath).id === transaction.planId) unlinkSync(pendingPath)
      const resultPath = join(profile, '.guide-manager', 'migration-result.json')
      if (existsSync(resultPath)) {
        const prior = readJson(resultPath)
        writeJson(resultPath, { ...prior, status: 'failed-restored', recovery: 'external', recoveryMode: result.mode,
          restoredSources: result.restoredSources ?? [], recoveredAt: receipt.finishedAt, recoveryError: null })
      }
    }
    console.log(JSON.stringify(receipt))
    if (receipt.status !== 'recovered') process.exitCode = 1
  } catch (error) {
    console.error(String(error.message ?? error))
    process.exitCode = 1
  }
}

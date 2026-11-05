/**
 * Apply a guide-manager pending intent while DSH is stopped.
 *
 * This script is launched by restart-guide-manager.ps1 through the installed
 * Electron Node (`ELECTRON_RUN_AS_NODE=1`), so it can import the official
 * profile patch writer from the app.asar. It never starts or stops DSH; the
 * PowerShell wrapper owns the restart.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PENDING_VERSION = 1
const MAX_INTENTS = 8
const MAX_PATCHES = 4

export function validatePending(data) {
  if (data === null || typeof data !== 'object') throw new Error('pending document is not an object')
  if (data.version !== PENDING_VERSION) throw new Error(`unsupported pending version: ${String(data.version)}`)
  if (typeof data.profile !== 'string' || !isAbsolute(data.profile) || !existsSync(data.profile)) throw new Error('pending profile path is missing or not absolute')
  if (!Array.isArray(data.intents) || data.intents.length === 0) throw new Error('pending document has no intents')
  if (data.intents.length > MAX_INTENTS) throw new Error('pending document has too many intents')
  for (const intent of data.intents) {
    if (intent === null || typeof intent !== 'object') throw new Error('pending intent is not an object')
    if (typeof intent.component !== 'string' || typeof intent.enabled !== 'boolean') throw new Error('pending intent missing component/enabled')
    if (!Array.isArray(intent.patches) || intent.patches.length === 0 || intent.patches.length > MAX_PATCHES) throw new Error(`pending intent ${intent.component} has an invalid patch list`)
    for (const patch of intent.patches) {
      if (patch === null || typeof patch !== 'object') throw new Error(`pending intent ${intent.component} has an invalid patch`)
      if (typeof patch.patchId !== 'string' || typeof patch.moduleName !== 'string' || typeof patch.enabled !== 'boolean') throw new Error(`pending intent ${intent.component} is missing patchId/moduleName/enabled`)
    }
  }
  return data
}

async function defaultWriter() {
  const asarRoot = process.env.DSH_ASAR_ROOT
    ?? join(dirname(process.execPath), 'resources', 'app.asar', 'dsh')
  const patchFile = join(asarRoot, 'node_modules', '@deepseek-ai', 'dsh-plugin-manager', 'lib', 'types', 'patch.js')
  if (!existsSync(patchFile)) throw new Error(`official patch writer not found: ${patchFile}`)
  const module = await import(pathToFileURL(patchFile).href)
  if (typeof module.writePluginEnabled !== 'function') throw new Error('official patch writer does not export writePluginEnabled')
  return module.writePluginEnabled
}

export async function applyPending(pendingPath, { writer } = {}) {
  const absolutePending = resolve(pendingPath)
  const data = validatePending(JSON.parse(readFileSync(absolutePending, 'utf8')))
  const profileDir = resolve(data.profile)
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const stateDir = join(profileDir, '.guide-manager')
  const backupDir = join(stateDir, 'backups')
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(backupDir, `cordis.patch.yml.${stamp}.bak`)
  const existed = existsSync(patchPath)
  if (existed) copyFileSync(patchPath, backupPath)
  const receiptPath = join(stateDir, 'last-apply-result.json')
  const profile = {
    dir: profileDir,
    installAnchor: typeof data.installAnchor === 'string' && isAbsolute(data.installAnchor) && existsSync(data.installAnchor)
      ? data.installAnchor
      : undefined,
    patchPath,
  }
  const applied = []
  try {
    const writePluginEnabled = writer ?? await defaultWriter()
    for (const intent of data.intents) {
      for (const patch of intent.patches) {
        await writePluginEnabled(profile, patch.patchId, patch.moduleName, patch.enabled)
        applied.push({ component: intent.component, patchId: patch.patchId, moduleName: patch.moduleName, enabled: patch.enabled })
      }
    }
    const receipt = {
      status: 'applied',
      at: new Date().toISOString(),
      profile: profileDir,
      pending: absolutePending,
      backup: existed ? backupPath : null,
      applied,
    }
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n')
    unlinkSync(absolutePending)
    return receipt
  } catch (error) {
    if (existed) {
      copyFileSync(backupPath, patchPath)
    } else if (existsSync(patchPath)) {
      unlinkSync(patchPath)
    }
    const receipt = {
      status: 'failed',
      at: new Date().toISOString(),
      profile: profileDir,
      pending: absolutePending,
      backup: existed ? backupPath : null,
      applied,
      error: String(error.message ?? error),
    }
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n')
    throw error
  }
}

async function main() {
  const pendingPath = process.argv[2]
  if (pendingPath === undefined) {
    console.error('usage: apply-pending.mjs <pending.json>')
    process.exitCode = 2
    return
  }
  try {
    const receipt = await applyPending(pendingPath)
    console.log(JSON.stringify({ ok: true, receipt }, null, 2))
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error.message ?? error) }, null, 2))
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()

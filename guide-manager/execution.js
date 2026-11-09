/** Confirmed handoff to a profile-owned controller which survives the Host. */
import { copyFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { digest, fingerprint, profileSnapshot, readJson, writeJson } from './install.js'
import { controlInventory, controlPath, verifyControl } from './maintenance.js'
import { validateInstallPlan } from './helper/apply-install.mjs'
import { validatePackage } from './helper/apply-package.mjs'
import { validateMaintenance } from './helper/apply-maintenance.mjs'
import { validatePending } from './helper/apply-pending.mjs'
import { coldIntent } from './core.js'
import { artifactInventory } from './artifacts.js'

const FILES = { install: 'install-pending.json', package: 'package-pending.json', maintenance: 'maintenance-pending.json', toggle: 'pending.json' }
const ACTIVE = new Set(['waiting-ack', 'executing', 'awaiting-verification'])
const alive = (pid) => { try { process.kill(pid, 0); return true } catch (error) { return error.code !== 'ESRCH' } }
const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString()
export function createExecutionController({ profile, managerRoot, host = { pid: process.pid, executable: process.execPath, startedAt }, platform = process.platform, launch } = {}) {
  const root = profile?.dir && isAbsolute(profile.dir) ? join(profile.dir, '.guide-manager', 'execution') : null
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const available = Boolean(root && platform === 'win32' && /^DeepSeek Harness\.exe$/i.test(basename(host.executable)) && (launch || existsSync(powershell)))
  const taskRoot = (id) => { if (!/^[a-f0-9-]{36}$/.test(id ?? '') || !root) throw Error('execution-invalid-task'); return join(root, id) }
  const latest = () => root && existsSync(join(root, 'latest.json')) ? readJson(join(root, 'latest.json')).id : null
  const load = (id) => readJson(join(taskRoot(id), 'status.json'))
  const save = (id, value) => writeJson(join(taskRoot(id), 'status.json'), value)
  const lockPath = root && join(root, 'operation.lock')
  const busy = () => {
    if (!root || !existsSync(lockPath)) return false
    const owner = readJson(lockPath)
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || alive(owner.pid)) return true
    const task = load(owner.id)
    if (ACTIVE.has(task.status) && task.status !== 'awaiting-verification') save(owner.id, { ...task, status: 'interrupted', error: 'execution-interrupted' })
    unlinkSync(lockPath)
    return false
  }
  const pending = () => {
    if (!root) throw Error('execution-profile-unavailable')
    const found = Object.entries(FILES).filter(([, name]) => existsSync(join(profile.dir, '.guide-manager', name)))
    if (found.length !== 1) throw Error(found.length ? 'execution-conflicting-pending' : 'execution-no-pending')
    const [kind, name] = found[0], path = join(profile.dir, '.guide-manager', name), bytes = readFileSync(path), data = JSON.parse(bytes)
    if ((kind === 'toggle' ? data.profile : data.profile?.dir) !== profile.dir) throw Error('execution-profile-mismatch')
    if (kind === 'install') validateInstallPlan(data, path)
    if (kind === 'package') validatePackage(data, path)
    if (kind === 'maintenance') validateMaintenance(data, path, managerRoot)
    if (kind === 'toggle') {
      validatePending(data)
      for (const intent of data.intents) if (fingerprint(coldIntent(intent.component, intent.enabled)?.patches) !== fingerprint(intent.patches)) throw Error('execution-invalid-toggle')
    }
    return { kind, path, hash: digest(bytes), data }
  }
  const plan = (state, expectedPendingId) => {
    const current = pending(), files = controlInventory(managerRoot), controllerHash = fingerprint(files)
    const pendingId = current.data.id ?? current.hash
    if (expectedPendingId !== undefined && expectedPendingId !== pendingId) throw Error('execution-plan-changed')
    const blockers = []
    if (!available) blockers.push('execution-unavailable')
    if (busy()) blockers.push('execution-busy')
    if (current.kind === 'maintenance' && current.data.kind === 'manager-upgrade') {
      // Older managers cannot report execution status or restore the page automatically.
      const manifest = artifactInventory(current.data.target.file, current.data.target.sha256).manifest
      if (!current.data.target?.files?.['execution.js'] || manifest.dshGuide?.executionSchema !== 1) blockers.push('execution-target-manual-only')
    }
    const entries = current.kind === 'toggle' ? current.data.intents.map((i) => ({ key: i.component, enabled: i.enabled }))
      : current.data.kind === 'manager-upgrade' ? [{ key: 'manager', package: current.data.target.package, version: current.data.target.version }]
        : current.data.entries.map(({ key, package: name, version, action }) => ({ key, package: name, version, action }))
    const body = { schema: 1, kind: current.kind, pendingId, profile: { dir: profile.dir, name: profile.name }, pendingPath: current.path,
      pendingHash: current.hash, before: profileSnapshot(profile.dir), controllerHash, host, entries, blockers }
    return { ...body, id: fingerprint(body) }
  }
  const defaultLaunch = (request) => new Promise((resolveResult, reject) => {
    const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(request.controller, 'helper', 'start-execution.ps1'), '-Request', request.path], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    const timer = setTimeout(() => { child.kill(); reject(Error('execution-launch-timeout')) }, 15_000)
    child.stdout.on('data', (b) => { if (stdout.length < 32768) stdout += b })
    child.stderr.on('data', (b) => { if (stderr.length < 32768) stderr += b })
    child.on('error', () => { clearTimeout(timer); reject(Error('execution-launch-failed')) })
    child.on('exit', (code) => {
      clearTimeout(timer)
      try { if (code !== 0) throw Error(); const result = JSON.parse(stdout.replace(/^\uFEFF/, '').trim()); if (!Number.isSafeInteger(result.pid) || result.pid <= 0) throw Error(); resolveResult(result) }
      catch { reject(Error('execution-launch-failed')) }
    })
  })
  return { plan, busy,
    async start(state, expectedId) {
      const current = plan(state)
      if (current.id !== expectedId || current.blockers.length) throw Error(current.blockers[0] ?? 'execution-plan-changed')
      mkdirSync(root, { recursive: true })
      const fd = openSync(lockPath, 'wx'), id = randomUUID()
      try { writeFileSync(fd, JSON.stringify({ id, pid: host.pid })) } finally { closeSync(fd) }
      try {
        const files = controlInventory(managerRoot), controller = controlPath(profile.dir, current.controllerHash)
        for (const name of Object.keys(files)) { const target = join(controller, name); mkdirSync(dirname(target), { recursive: true }); copyFileSync(join(managerRoot, name), target) }
        verifyControl(profile.dir, current.controllerHash)
        const quote = (value) => `'${value.replaceAll("'", "''")}'`
        const mode = { install: '-Install', package: '-PackageChange', maintenance: '-Maintenance', toggle: '' }[current.kind]
        const recoveryScript = pending().data.kind === 'manager-upgrade' ? 'recover-manager.ps1' : 'restart-guide-manager.ps1'
        const recoveryCommand = `& ${quote(powershell)} -NoProfile -ExecutionPolicy Bypass -File ${quote(join(controller, 'helper', recoveryScript))} -Profile ${quote(profile.dir)}${recoveryScript === 'restart-guide-manager.ps1' && mode ? ' ' + mode : ''}`
        const request = { schema: 1, id, plan: current, files, controller, executable: host.executable, path: join(taskRoot(id), 'request.json'), recoveryCommand, createdAt: new Date().toISOString() }
        writeJson(request.path, request)
        writeFileSync(join(taskRoot(id), 'recovery.txt'), `Guide manager recovery\r\n${recoveryCommand}\r\nLog: ${join(taskRoot(id), 'execution.log')}\r\n`, 'utf8')
        save(id, { id, kind: current.kind, pendingId: current.pendingId, status: 'waiting-ack', createdAt: request.createdAt })
        writeJson(join(root, 'latest.json'), { id })
        const worker = await (launch ?? defaultLaunch)(request)
        writeJson(join(taskRoot(id), 'launch.json'), worker)
        writeJson(lockPath, { id, pid: worker.pid, createdAt: worker.createdAt })
        return { taskId: id, application: 'waiting-ack' }
      } catch (error) {
        save(id, { id, kind: current.kind, pendingId: current.pendingId, status: 'failed', error: /^execution-/.test(error.message) ? error.message : 'execution-launch-failed' })
        if (existsSync(lockPath) && readJson(lockPath).id === id) unlinkSync(lockPath)
        throw Error(/^execution-/.test(error.message) ? error.message : 'execution-launch-failed')
      }
    },
    acknowledge(state, id) {
      if (latest() !== id || load(id).status !== 'waiting-ack') throw Error('execution-not-awaiting-ack')
      const request = readJson(join(taskRoot(id), 'request.json')), current = plan(state)
      // The operation's own lock is expected; all other fingerprints must still match.
      const { blockers, id: currentId, ...body } = current
      const original = { ...body, blockers: request.plan.blockers }
      if (fingerprint(original) !== request.plan.id || current.blockers.some((b) => b !== 'execution-busy')) throw Error('execution-plan-changed')
      return () => writeJson(join(taskRoot(id), 'ready.json'), { id, planId: request.plan.id })
    },
    seen(id) {
      if (latest() !== id || ACTIVE.has(load(id).status)) throw Error('execution-result-not-ready')
      writeJson(join(taskRoot(id), 'returned.json'), { id, at: new Date().toISOString() })
      return { application: 'result-seen' }
    },
    view(state) {
      try {
        busy()
        const id = latest()
        let task = id ? load(id) : null
        if (task) {
          const request = readJson(join(taskRoot(id), 'request.json'))
          task = { ...task, recoveryCommand: request.recoveryCommand, logPath: join(taskRoot(id), 'execution.log') }
        }
        if (task?.status === 'awaiting-verification') {
          const request = readJson(join(taskRoot(id), 'request.json'))
          if (Date.parse(host.startedAt) > Date.parse(request.createdAt)) {
            const group = state[request.plan.kind === 'install' ? 'installation' : request.plan.kind === 'package' ? 'packageManagement' : 'maintenance']
            const verification = existsSync(request.plan.pendingPath) ? null : request.plan.kind === 'toggle'
              ? request.plan.entries.every((i) => state.components.some((c) => c.key === i.key && c.enabled === i.enabled && (i.enabled ? ['ready', 'ready-unverified'].includes(c.status) : c.status === 'disabled'))) ? 'verified-running' : 'restart-health-check-failed'
              : group?.result?.planId === request.plan.pendingId ? group.verification : null
            if (verification === 'verified-running' || verification === 'restart-health-check-failed') {
              task = { ...task, status: verification === 'verified-running' ? 'completed' : 'failed', error: verification === 'verified-running' ? null : 'execution-health-check-failed', finishedAt: new Date().toISOString() }
              save(id, task)
            }
          }
        }
        if (task) task.returnToManager = !existsSync(join(taskRoot(id), 'returned.json'))
        return { available, active: Boolean(task && ACTIVE.has(task.status)), task }
      } catch { return { available: false, active: false, error: 'execution-state-unavailable' } }
    },
  }
}

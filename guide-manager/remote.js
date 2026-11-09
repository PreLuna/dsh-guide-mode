/** Consumer-side async preparation. Never modifies profile configuration or runs pnpm. */
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { GitHubReleaseClient } from './github-source.js'
import { parseRemoteRelease, RELEASE_FILE, validateSourceConfig } from './release.js'
import { artifactInventory } from './artifacts.js'
import { cacheArtifact, cachePath, createInstallPlan, digest, fingerprint, INSTALL_ORDER, profileSnapshot, readCatalog, readJson, selectedKeys, stageInstall, writeJson } from './install.js'
import { createUpgradePlan, readUpgradeCatalog, stagePackagePlan } from './upgrade.js'
import { assertMaintenanceIdle, createMaintenancePlan, readManagerCatalog, stageMaintenance } from './maintenance.js'

const safeError = (error) => /^(github-[a-z0-9-]+|source-[a-z0-9-]+)$/.test(error?.message ?? '') ? error.message : 'source-validation-failed'
const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code !== 'ESRCH' } }
export function createRemoteManager({ profile, sourceConfig, sourcePath, host, managerRoot, fetchImpl, env = process.env }) {
  const root = profile?.dir && isAbsolute(profile.dir) ? join(profile.dir, '.guide-manager', 'remote') : null
  let active = null
  const config = () => validateSourceConfig(sourceConfig ?? readJson(sourcePath ?? join(profile.dir, '.guide-manager', 'source.json')))
  const configHash = () => fingerprint(config())
  const taskPath = (id) => {
    if (!/^[a-f0-9-]{36}$/.test(id ?? '') || !root) throw new Error('source-invalid-task')
    return join(root, `${id}.json`)
  }
  const loadTask = (id) => readJson(taskPath(id))
  const save = (task) => writeJson(taskPath(task.id), task)
  const acquire = (id) => {
    mkdirSync(root, { recursive: true })
    const path = join(root, 'operation.lock')
    if (existsSync(path)) {
      let owner
      try { owner = readJson(path) } catch { throw new Error('source-lock-needs-inspection') }
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || alive(owner.pid)) throw new Error('source-busy')
      if (owner.id) {
        const interrupted = loadTask(owner.id)
        if (interrupted.status === 'running') save({ ...interrupted, status: 'interrupted', error: 'source-interrupted' })
      }
      unlinkSync(path)
    }
    const fd = openSync(path, 'wx')
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid, id })) } finally { closeSync(fd) }
    return () => { if (existsSync(path) && readJson(path).id === id) unlinkSync(path) }
  }
  const start = (kind, payload, work) => {
    if (active) throw new Error('source-busy')
    if (!root) throw new Error('source-profile-unavailable')
    const settings = config()
    const task = { schema: 1, id: randomUUID(), kind, status: 'running', configHash: fingerprint(settings), createdAt: new Date().toISOString(), progress: { completed: 0, total: 0, bytes: 0 }, payload }
    const release = acquire(task.id)
    save(task)
    writeJson(join(root, 'latest.json'), { id: task.id })
    const abort = new AbortController()
    let progressSaved = 0
    const client = new GitHubReleaseClient({ repository: { owner: settings.owner, repo: settings.repo }, token: env[settings.tokenEnv], fetchImpl,
      signal: abort.signal, onProgress: (bytes) => { task.progress.bytes = bytes; if (Date.now() - progressSaved > 100) { save(task); progressSaved = Date.now() } } })
    const record = { id: task.id, abort, promise: null }
    active = record
    const retry = async (operation) => {
      for (let attempt = 0; ; attempt++) {
        abort.signal.throwIfAborted()
        try { return await operation() } catch (error) {
          if (abort.signal.aborted || attempt >= 2 || !/^github-(network-or-timeout|download-interrupted|http-5\d\d)$/.test(error.message)) throw error
        }
      }
    }
    record.promise = Promise.resolve().then(async () => {
      try {
        task.result = await work(task, client, retry, abort.signal)
        abort.signal.throwIfAborted()
        if (configHash() !== task.configHash) throw new Error('source-config-changed')
        task.status = 'ready'
      } catch (error) { task.status = abort.signal.aborted ? 'cancelled' : 'failed'; task.error = abort.signal.aborted ? 'source-cancelled' : safeError(error) }
      finally { task.finishedAt = new Date().toISOString(); save(task); release(); if (active === record) active = null }
      return task
    })
    return { taskId: task.id, status: task.status }
  }
  const clientRelease = async (client, tag) => {
    const release = await client.getRelease(tag)
    if (!release || release.draft) throw new Error('source-release-unavailable')
    return release
  }
  const check = () => start('check', {}, async (task, client, retry) => {
    // Explicit access probe: an auth-hidden 404 is never treated as an empty channel.
    await retry(() => client.json(''))
    let selected, exhausted = false
    for (let page = 1; page <= 2 && !selected; page++) {
      const releases = await retry(() => client.json(`/releases?per_page=50&page=${page}`))
      if (!Array.isArray(releases)) throw new Error('source-invalid-response')
      for (const release of releases.filter((r) => r.draft === false && r.prerelease === false).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))) {
        const assets = await retry(() => client.assets(release.id))
        const entry = assets.find((a) => a.name === RELEASE_FILE)
        if (!entry) continue
        const bytes = await retry(() => client.assetBytes(entry, 1024 * 1024))
        const catalog = parseRemoteRelease(bytes, { repository: client.repository })
        if (catalog.release.tag !== release.tag_name || catalog.release.channel !== 'stable') throw new Error('source-release-mismatch')
        await retry(() => client.verifyTag(release.tag_name, catalog.release.commit))
        selected = { catalog, releaseId: release.id, assetId: entry.id, catalogHash: fingerprint(catalog) }; break
      }
      if (releases.length < 50) { exhausted = true; break }
    }
    if (!selected) { if (!exhausted) throw new Error('source-history-limit'); return { available: false } }
    const path = join(root, 'catalogs', `${selected.catalogHash}.json`)
    writeJson(path, selected)
    return { available: true, snapshotId: selected.catalogHash, release: selected.catalog.release, versions: selected.catalog.artifacts.map(({ key, version }) => ({ key, version })) }
  })
  const snapshot = (id) => {
    if (!/^[a-f0-9]{64}$/.test(id ?? '')) throw new Error('source-invalid-snapshot')
    const saved = readJson(join(root, 'catalogs', `${id}.json`))
    parseRemoteRelease(JSON.stringify(saved.catalog), { repository: { owner: config().owner, repo: config().repo } })
    if (fingerprint(saved.catalog) !== id) throw new Error('source-snapshot-corrupt')
    return saved
  }
  const prepare = (request, state) => {
    if (!['install', 'upgrade', 'manager-upgrade'].includes(request?.kind) || Object.keys(request).some((k) => !['kind', 'snapshotId', 'components', 'targets', 'version'].includes(k))) throw new Error('source-invalid-request')
    const saved = snapshot(request.snapshotId)
    const allowed = request.kind === 'install' ? ['kind', 'snapshotId', 'components'] : request.kind === 'upgrade' ? ['kind', 'snapshotId', 'targets'] : ['kind', 'snapshotId', 'version']
    if (Object.keys(request).some((key) => !allowed.includes(key)) || request.targets?.some((target) => !target || Object.keys(target).some((key) => !['key', 'version'].includes(key)))) throw new Error('source-invalid-request')
    const catalog = saved.catalog
    let combo, keys
    const installed = state.components.filter((c) => readJson(join(profile.dir, 'package.json')).dependencies?.[c.package])
    if (request.kind === 'install') { keys = selectedKeys(request.components); combo = catalog.combinations.find((c) => c.id === catalog.recommendedCombination) }
    else if (request.kind === 'upgrade') {
      if (!Array.isArray(request.targets) || !request.targets.length || request.targets.some((t) => !installed.some((i) => i.key === t.key)) || new Set(request.targets.map((t) => t.key)).size !== request.targets.length) throw new Error('source-invalid-targets')
      combo = catalog.combinations.filter((c) => fingerprint(c.host) === fingerprint(host) && request.targets.every((t) => c.versions[t.key] === t.version))
        .sort((a, b) => installed.filter((i) => a.versions[i.key] !== i.version).length - installed.filter((i) => b.versions[i.key] !== i.version).length || a.id.localeCompare(b.id))[0]
      keys = INSTALL_ORDER // existing cold upgrade validator verifies the complete chosen combination
    }
    const chosen = request.kind === 'manager-upgrade' ? catalog.artifacts.filter((a) => a.key === 'manager' && a.version === request.version)
      : combo ? catalog.artifacts.filter((a) => keys.includes(a.key) && a.version === combo.versions[a.key]) : []
    if (!chosen.length || request.kind !== 'manager-upgrade' && fingerprint(combo.host) !== fingerprint(host)) throw new Error('source-no-compatible-target')
    const before = profileSnapshot(profile.dir)
    return start('prepare', structuredClone(request), async (task, client, retry, signal) => {
      assertMaintenanceIdle(profile.dir)
      task.before = before
      const old = request.kind === 'upgrade' ? installed.map((i) => catalog.artifacts.find((a) => a.key === i.key && a.version === i.version)) : []
      if (old.some((a) => !a)) throw new Error('source-previous-version-unavailable')
      const needed = [...new Map([...chosen, ...old].map((a) => [`${a.key}@${a.version}`, a])).values()]
      task.progress.total = needed.length; save(task)
      const releases = new Map()
      for (const entry of needed) {
        signal.throwIfAborted()
        const path = cachePath(profile.dir, entry.sha256)
        if (!existsSync(path)) {
          let source = releases.get(entry.source.tag)
          if (!source) {
            const release = await retry(() => clientRelease(client, entry.source.tag))
            await retry(() => client.verifyTag(entry.source.tag, entry.source.commit))
            source = { release, assets: await retry(() => client.assets(release.id)) }; releases.set(entry.source.tag, source)
          }
          const asset = source.assets.find((a) => a.name === entry.source.asset)
          if (!asset || asset.size !== entry.bytes) throw new Error('source-asset-unavailable')
          const bytes = await retry(() => client.assetBytes(asset))
          signal.throwIfAborted()
          if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw new Error('source-integrity-mismatch')
          const temporary = join(root, `${task.id}.tgz`)
          try { writeFileSync(temporary, bytes); verify(entry, temporary); cacheArtifact(profile.dir, { ...entry, file: temporary }) }
          finally { if (existsSync(temporary)) unlinkSync(temporary) }
        }
        verify(entry, path)
        task.progress.completed++; save(task)
      }
      signal.throwIfAborted()
      if (fingerprint(profileSnapshot(profile.dir)) !== fingerprint(before)) throw new Error('source-profile-changed')
      const directory = join(root, 'prepared', task.id)
      const local = (a) => ({ ...a, file: cachePath(profile.dir, a.sha256) })
      let catalogPath
      if (request.kind === 'install') {
        catalogPath = join(directory, 'install.json')
        writeJson(catalogPath, { schema: 1, product: 'dsh-guide-mode', release: catalog.release.tag,
          components: INSTALL_ORDER.map((key) => local(catalog.artifacts.find((a) => a.key === key && a.version === combo.versions[key]))) })
        readCatalog(catalogPath, { requiredKeys: keys })
      } else if (request.kind === 'upgrade') {
        catalogPath = join(directory, 'upgrade.json')
        writeJson(catalogPath, { schema: 2, product: 'dsh-guide-mode', artifacts: needed.map(local), combinations: [combo] })
        readUpgradeCatalog(catalogPath)
      } else {
        catalogPath = join(directory, 'manager.json')
        writeJson(catalogPath, { schema: 3, product: 'dsh-guide-mode', artifacts: chosen.map(local) })
        readManagerCatalog(catalogPath, host)
      }
      return { catalogPath, catalogHash: digest(readFileSync(catalogPath)), snapshotId: request.snapshotId }
    })
  }
  const verify = (entry, file) => {
    if (statSync(file).size !== entry.bytes) throw new Error('source-integrity-mismatch')
    const { manifest } = artifactInventory(file, entry.sha256)
    if (manifest.name !== entry.package || manifest.version !== entry.version || (manifest.dshGuide?.dataSchema ?? 1) !== 1 ||
      (entry.key === 'manager' ? manifest.dshGuide?.product !== 'dsh-guide-mode' || (manifest.dshGuide.controlSchema ?? 1) !== 1 || fingerprint(manifest.dshGuide.host) !== fingerprint(host) : manifest.dshGuide?.contract !== 1)) throw new Error('source-package-mismatch')
  }
  const plan = (id, state) => {
    const task = loadTask(id)
    if (task.kind !== 'prepare' || task.status !== 'ready' || task.configHash !== configHash() || fingerprint(task.before) !== fingerprint(profileSnapshot(profile.dir))
      || digest(readFileSync(task.result.catalogPath)) !== task.result.catalogHash) throw new Error('source-preparation-stale')
    const request = task.payload
    if (request.kind === 'install') return createInstallPlan(state, readCatalog(task.result.catalogPath, { requiredKeys: selectedKeys(request.components) }), request.components)
    if (request.kind === 'upgrade') return createUpgradePlan(state, readUpgradeCatalog(task.result.catalogPath), request.targets, host)
    return createMaintenancePlan(state, { kind: 'manager-upgrade', version: request.version }, managerRoot, task.result.catalogPath, host)
  }
  return { check, prepare, plan,
    task: loadTask,
    stage(id, expectedId, state) {
      const current = plan(id, state), task = loadTask(id)
      if (current.id !== expectedId) throw new Error('source-plan-changed')
      const result = task.payload.kind === 'install'
        ? stageInstall(state, readCatalog(task.result.catalogPath, { requiredKeys: selectedKeys(task.payload.components) }), task.payload.components, expectedId)
        : task.payload.kind === 'upgrade' ? stagePackagePlan(current, expectedId) : stageMaintenance(current, expectedId, managerRoot)
      save({ ...task, status: 'staged', stagedPlanId: expectedId })
      return result
    },
    cancel(id) { if (active?.id !== id) throw new Error('source-task-not-running'); active.abort.abort(); return { status: 'cancelling' } },
    async wait(id) { if (active?.id === id) await active.promise; return loadTask(id) },
    dispose() { active?.abort.abort() },
    view() {
      try {
        const settings = config()
        let task = existsSync(join(root, 'latest.json')) ? loadTask(readJson(join(root, 'latest.json')).id) : null
        if (task?.status === 'running' && active?.id !== task.id) {
          const owner = existsSync(join(root, 'operation.lock')) ? readJson(join(root, 'operation.lock')) : null
          if (!owner || !alive(owner.pid)) { task = { ...task, status: 'interrupted', error: 'source-interrupted' }; save(task) }
        }
        const snapshotId = task?.payload?.snapshotId ?? task?.result?.snapshotId
        const saved = snapshotId ? snapshot(snapshotId) : null
        const catalog = saved ? { snapshotId, release: saved.catalog.release,
          versions: saved.catalog.artifacts.map(({ key, version }) => ({ key, version })),
          recommended: saved.catalog.combinations.find((c) => c.id === saved.catalog.recommendedCombination).versions,
          recommendedManager: saved.catalog.recommendedManager } : null
        return { configured: true, repository: { owner: settings.owner, repo: settings.repo }, task, catalog }
      } catch { return { configured: false, error: 'source-config-unavailable' } }
    },
  }
}

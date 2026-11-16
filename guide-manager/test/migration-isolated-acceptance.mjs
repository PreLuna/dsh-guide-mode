/** Opt-in isolated real-pnpm 5E acceptance. Run under installed Electron Node. */
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyMigration } from '../helper/apply-migration.mjs'
import { officialRuntime } from '../helper/apply-install.mjs'
import { COMPONENTS } from '../core.js'
import { INSTALL_ORDER, readJson, writeJson } from '../install.js'
import { createMigrationPlan, stageMigration } from '../migration.js'

const output = resolve(process.argv[2] ?? '')
if (!output || !existsSync(output)) throw new Error('use an existing isolated acceptance directory')
const setup = readJson(join(output, 'setup.json'))
const profile = setup.profile
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const catalogs = join(dirname(output), 'catalogs')
const catalogPath = process.argv[3] ?? join(catalogs, 'release-catalog.json')
const managerCatalogPath = process.argv[4] ?? join(catalogs, 'manager-catalog.json')
const sourceRoot = join(workspace, 'guide-manager/package.json')
if (!existsSync(sourceRoot)) throw new Error('workspace manager package missing')
const runtime = await officialRuntime()
const asar = join(dirname(process.execPath), 'resources', 'app.asar', 'dsh')
const context = { dir: profile, profile: setup.profileName, cwd: profile, installAnchor: join(asar, 'node_modules/@deepseek-ai/dsh/package.json') }
const manifestPath = join(profile, 'package.json')
const manifest = readJson(manifestPath)
for (const key of INSTALL_ORDER) {
  const component = COMPONENTS.find((item) => item.key === key)
  manifest.dependencies[component.package] = `link:${join(workspace, `guide-${key === 'sidebar' ? 'sidebar-adapter' : key === 'goal' ? 'goal-adapter' : key}`).replaceAll('\\', '/')}`
  if (!manifest.dsh.profile.bundles.includes(component.package)) manifest.dsh.profile.bundles.push(component.package)
}
writeJson(manifestPath, manifest)
const installed = await runtime.withLock(join(profile, 'package.json'), () => runtime.run(context, ['install', '--offline', '--config.auto-install-peers=false', '--ignore-scripts']))
if (installed.exitCode !== 0) throw new Error(`isolated source install failed: ${JSON.stringify(installed)}`)
const components = COMPONENTS.map((component) => ({ ...component, installed: true, enabled: true,
  version: readJson(join(profile, 'node_modules', ...component.package.split('/'), 'package.json')).version, contract: 1 }))
const state = { profile: { dir: profile, name: setup.profileName, installAnchor: context.installAnchor }, pending: { present: false },
  host: { dsh: { match: true }, cordis: { match: true }, artifacts: { verified: true } }, components }
const plan = createMigrationPlan(state, { catalogPath, managerCatalogPath }, readJson(join(workspace, 'guide-manager/package.json')).dshGuide.host)
if (plan.blockers.length) throw new Error(`migration plan blocked: ${plan.blockers.join(',')}`)
stageMigration(plan, plan.id)
const receipt = await applyMigration(join(profile, '.guide-manager', 'migration-pending.json'), runtime)
const finalManifest = readJson(manifestPath)
const entries = plan.entries.map((entry) => {
  const installedManifest = readJson(join(profile, 'node_modules', ...entry.package.split('/'), 'package.json'))
  return { key: entry.key, version: installedManifest.version, spec: finalManifest.dependencies[entry.package],
    file: entry.target.file, sha256: entry.target.sha256, sourceVersion: entry.source.version, sourcePath: entry.source.path }
})
const result = { schema: 1, status: receipt.status, planId: plan.id, transactionId: receipt.transactionId,
  version: readJson(join(workspace, 'guide-manager/package.json')).version,
  entries, verified: receipt.status === 'migrated-awaiting-restart'
    && entries.every((entry) => entry.spec.startsWith('file:') && entry.version === entry.sourceVersion) }
writeJson(join(output, 'migration-acceptance-result.json'), result)
console.log(JSON.stringify(result))
if (result.verified !== true) process.exitCode = 1

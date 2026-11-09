/** Opt-in isolated profile bootstrap. Run under installed Electron Node. */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { officialRuntime } from '../helper/apply-install.mjs'
import { readJson, writeJson } from '../install.js'

const output = resolve(process.argv[2])
const catalogPath = resolve(process.argv[3])
const profileName = process.argv[4] ?? 'acceptance'
if (existsSync(output)) throw new Error('use a new acceptance directory')
const home = join(output, 'home')
const profile = join(home, 'profiles', profileName)
mkdirSync(profile, { recursive: true })
process.env.DSH_HOME = home
const asar = join(dirname(process.execPath), 'resources', 'app.asar', 'dsh')
const manager = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packedManager = process.argv[6] ? resolve(process.argv[6]) : null
const sidebar = join(process.env.USERPROFILE, '.dsh/profiles/desktop/node_modules/dsh-better-sidebar')
if (readJson(join(sidebar, 'package.json')).version !== '0.28.2') throw new Error('expected official sidebar baseline')
writeJson(join(profile, 'package.json'), { name: `guide-${profileName}-acceptance`, private: true, dependencies: {
  '@local/dsh-guide-manager': packedManager ? `file:${packedManager}` : `link:${manager}`, 'dsh-better-sidebar': `link:${sidebar}`,
}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-better-sidebar', '@local/dsh-guide-manager'] } } })
writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\n')
writeFileSync(join(profile, 'cordis.patch.yml'), `- id: guide-manager\n  name: '@local/dsh-guide-manager'\n  config:\n    catalogPath: ${JSON.stringify(catalogPath)}\n`)
if (process.argv[5]) {
  const catalog = readJson(resolve(process.argv[5]))
  mkdirSync(join(output, 'releases'))
  for (const artifact of catalog.artifacts) {
    const destination = join(output, 'releases', `${artifact.key}-${artifact.version}.tgz`)
    copyFileSync(artifact.file, destination)
    artifact.file = destination
  }
  writeJson(join(profile, '.guide-manager', 'upgrade-catalog.json'), catalog)
}
if (process.argv[7]) {
  const catalog = readJson(resolve(process.argv[7]))
  mkdirSync(join(output, 'manager-releases'), { recursive: true })
  for (const artifact of catalog.artifacts) {
    const destination = join(output, 'manager-releases', `manager-${artifact.version}.tgz`)
    copyFileSync(artifact.file, destination)
    artifact.file = destination
  }
  writeJson(join(profile, '.guide-manager', 'manager-catalog.json'), catalog)
}
const runtime = await officialRuntime()
const context = { dir: profile, profile: profileName, cwd: profile, installAnchor: join(asar, 'node_modules/@deepseek-ai/dsh/package.json') }
const result = await runtime.withLock(join(profile, 'package.json'), () => runtime.run(context, ['install', '--offline', '--config.auto-install-peers=false', '--ignore-scripts']))
if (result.exitCode !== 0) throw new Error(JSON.stringify(result))
const managerRoot = packedManager ? join(profile, 'node_modules/@local/dsh-guide-manager') : manager
writeJson(join(output, 'setup.json'), { home, profile, profileName, executable: process.execPath, catalogPath, managerRoot, packedManager: Boolean(packedManager), helper: join(managerRoot, 'helper/restart-guide-manager.ps1') })
console.log(JSON.stringify({ status: 'ready', output }))

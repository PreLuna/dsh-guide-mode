/** Opt-in: turn the six owned components of an isolated profile into workspace links. */
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { officialRuntime } from '../helper/apply-install.mjs'
import { COMPONENTS } from '../core.js'
import { INSTALL_ORDER, readJson, writeJson } from '../install.js'

const output = resolve(process.argv[2] ?? '')
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
if (!existsSync(join(output, 'setup.json'))) throw new Error('isolated setup.json missing')
const setup = readJson(join(output, 'setup.json'))
const profile = setup.profile
const manifest = readJson(join(profile, 'package.json'))
for (const key of INSTALL_ORDER) {
  const component = COMPONENTS.find((item) => item.key === key)
  const directory = key === 'sidebar' ? 'guide-sidebar-adapter' : key === 'goal' ? 'guide-goal-adapter' : `guide-${key}`
  manifest.dependencies[component.package] = `link:${join(workspace, directory).replaceAll('\\', '/')}`
  if (!manifest.dsh.profile.bundles.includes(component.package)) manifest.dsh.profile.bundles.push(component.package)
}
writeJson(join(profile, 'package.json'), manifest)
const asar = join(dirname(process.execPath), 'resources', 'app.asar', 'dsh')
const context = { dir: profile, profile: setup.profileName, cwd: profile, installAnchor: join(asar, 'node_modules/@deepseek-ai/dsh/package.json') }
const runtime = await officialRuntime()
const result = await runtime.withLock(join(profile, 'package.json'), () => runtime.run(context, ['install', '--offline', '--config.auto-install-peers=false', '--ignore-scripts']))
if (result.exitCode !== 0) throw new Error(`isolated link install failed: ${JSON.stringify(result)}`)
const dependencies = Object.fromEntries(INSTALL_ORDER.map((key) => {
  const packageName = COMPONENTS.find((item) => item.key === key).package
  return [key, readJson(join(profile, 'node_modules', ...packageName.split('/'), 'package.json')).version]
}))
writeJson(join(output, 'migration-sources.json'), { profile, links: dependencies })
console.log(JSON.stringify({ status: 'ready', profile, links: dependencies }))

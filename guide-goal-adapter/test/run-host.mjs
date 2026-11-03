/** Launch with the installed Electron binary, ELECTRON_RUN_AS_NODE=1, --expose-internals. */
import { join, dirname, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const runtime = process.env.DSH_RUNTIME_DIR ?? join(dirname(process.execPath), 'resources', 'app.asar', 'dsh')
const hostImport = name => import(pathToFileURL(join(runtime, 'node_modules', '@deepseek-ai', name, 'lib', 'index.js')).href)
const { Context } = await hostImport('cordis')
const { createRuntimeResolution, PluginPackages } = await hostImport('dsh-app-boot')
const originalDriver = await hostImport('dsh-goal-round-driver')
const { foldSubagentDescriptor, snapshotSubagentDescriptor } = await hostImport('dsh-subagent')
const root = new Context()
const baseline = await createRuntimeResolution({ installAnchor: join(runtime, 'node_modules/@deepseek-ai/dsh/package.json') })
const adapterDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const resolution = { ...baseline, linkedRoots: [
  { name: '@local/dsh-guide-goal-adapter', realPath: adapterDir },
  { name: 'dsh-better-sidebar', realPath: resolve(adapterDir, '../evidence/LI-stage2-2026-11-02/official/package') },
] }
await root.plugin(PluginPackages, { resolution })
const source = readFileSync(join(runtime, 'node_modules/@deepseek-ai/dsh-subagent/lib/index.js'), 'utf8')
const from = source.indexOf('\tasync waitForChildren(parent) {')
const to = source.indexOf('\n\t/**', from)
if (from < 0 || to < 0) throw new Error('Installed join changed; update the test harness after review')
const rawJoin = vm.runInNewContext(`({${source.slice(from, to)}}).waitForChildren`, {
  activationAgent: item => item.kind === 'local' ? item.handle.agent : undefined,
})
globalThis.hostTest = { Context, originalDriver, foldSubagentDescriptor, snapshotSubagentDescriptor, rawJoin }
try {
  // Import the actual production entry through DSH's runtime resolution.
  const entry = await import('../index.js')
  if (entry.name !== 'guide-goal-adapter') throw new Error('Production entry did not load')
  if (process.argv.includes('--sidebar-core')) {
    await import('../../guide-sidebar-adapter/test/core.test.mjs')
    await import('../../guide-sidebar-adapter/test/official-consumers.test.mjs')
  } else await import('./adapter.test.mjs')
} finally { await root.fiber.dispose() }

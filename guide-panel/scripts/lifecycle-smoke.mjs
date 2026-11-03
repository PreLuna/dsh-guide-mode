/** Two separate real Host processes over one isolated persisted profile. */
import { mkdirSync, copyFileSync, existsSync, symlinkSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = process.env.DSH_O2_OUTPUT ? resolve(workspace, process.env.DSH_O2_OUTPUT) : join(workspace, 'evidence/O2-R6-2026-11-02')
const panelCopy = join(output, 'panel-host')
mkdirSync(output, { recursive: true })
function copyPanel(source, target) {
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (['test', 'scripts', 'node_modules', '.git'].includes(entry.name)) continue
    const from = join(source, entry.name), to = join(target, entry.name)
    if (entry.isDirectory()) copyPanel(from, to)
    else writeFileSync(to, readFileSync(from))
  }
}
copyPanel(join(workspace, 'guide-panel'), panelCopy)
mkdirSync(join(panelCopy, 'node_modules/@local'), { recursive: true })
const shieldLink = join(panelCopy, 'node_modules/@local/dsh-guide-shield')
if (!existsSync(shieldLink)) symlinkSync(join(workspace, 'guide-shield'), shieldLink, 'junction')
for (const phase of ['prepare', 'restart']) {
  const child = spawn(process.execPath, [join(workspace, 'guide-goal-adapter/scripts/smoke.mjs'), '--integration'], {
    cwd: workspace, windowsHide: true, stdio: 'inherit', env: { ...process.env,
      DSH_SMOKE_OUTPUT: join(output, 'matrix-host'), DSH_SMOKE_PANEL_SOURCE: panelCopy,
      DSH_O2_STATE: join(output, 'restart-state.json'), DSH_O2_PHASE: phase, DSH_SMOKE_DEBUG: '1',
      DSH_O2_PANEL_COPY: panelCopy,
    },
  })
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  copyFileSync(join(output, 'matrix-host/host.log'), join(output, `${phase}-host.log`))
  if (code !== 0) process.exit(code ?? 1)
  copyFileSync(join(output, 'matrix-host/runtime-result.json'), join(output, `${phase}-result.json`))
}
console.log('O2/R6: two-process Host lifecycle matrix passed')

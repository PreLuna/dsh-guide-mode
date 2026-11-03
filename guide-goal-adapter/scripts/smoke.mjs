/** Isolated real-profile mount. Never uses or changes the desktop profile. */
import { mkdirSync, writeFileSync, existsSync, realpathSync, symlinkSync, readFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sidebar = process.argv.includes('--sidebar')
const smokeRoot = process.env.DSH_SMOKE_OUTPUT ? resolve(workspace, process.env.DSH_SMOKE_OUTPUT)
  : join(workspace, sidebar ? 'evidence/LI-stage2-2026-11-02' : 'evidence/LI-stage1-2026-11-02')
mkdirSync(smokeRoot, { recursive: true })
const desktop = process.argv.includes('--desktop')
const expectOriginal = process.argv.includes('--expect-original')
const home = desktop ? join(process.env.USERPROFILE, '.dsh') : join(smokeRoot, 'isolated-home')
const profile = join(home, 'profiles', desktop ? 'desktop' : 'goal-smoke')
const packages = ['guide-goal-adapter', 'guide-preset', 'guide-shield', 'guide-admission', 'guide-panel']
if (sidebar) packages.push('guide-sidebar-adapter', 'evidence/LI-stage2-2026-11-02/official/package', 'guide-sidebar-adapter/test/browser-fixture')
if (sidebar) {
  const deps = join(workspace, 'evidence/LI-stage2-2026-11-02/official/package/node_modules')
  if (!existsSync(deps)) symlinkSync(join(process.env.USERPROFILE, '.dsh/profiles/desktop/node_modules'), deps, 'junction')
}
const integration = process.argv.includes('--integration')
const combination = process.argv.includes('--combination')
if (desktop && integration) throw new Error('Runtime fixtures are never mounted into the desktop profile')
if (!desktop) {
mkdirSync(join(profile, 'node_modules/@local'), { recursive: true })
const dependencies = {}
for (const name of packages) {
  const source = name === 'guide-panel' && process.env.DSH_SMOKE_PANEL_SOURCE
    ? resolve(workspace, process.env.DSH_SMOKE_PANEL_SOURCE) : join(workspace, name)
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
  const target = join(profile, 'node_modules', manifest.name)
  if (existsSync(target)) {
    if (realpathSync(target).toLowerCase() !== realpathSync(source).toLowerCase()) throw new Error(`Unexpected link target: ${target}`)
  } else symlinkSync(source, target, 'junction')
  dependencies[manifest.name] = `link:${source.replaceAll('\\', '/')}`
}
let combinationBundles
if (combination) {
  const actualProfile=join(process.env.USERPROFILE,'.dsh/profiles/desktop')
  const actual=JSON.parse(readFileSync(join(actualProfile,'package.json'),'utf8'))
  for(const name of Object.keys(actual.dependencies)) {
    if(dependencies[name])continue
    const source=realpathSync(join(actualProfile,'node_modules',name)),target=join(profile,'node_modules',name)
    mkdirSync(dirname(target),{recursive:true})
    if(!existsSync(target))symlinkSync(source,target,'junction')
    dependencies[name]=`link:${source.replaceAll('\\','/')}`
  }
  combinationBundles=[...actual.dsh.profile.bundles,'@local/dsh-guide-browser-fixture']
}
writeFileSync(join(profile, 'package.json'), JSON.stringify({
  name: 'dsh-guide-adapter-isolated-smoke', private: true, dependencies,
  dsh: { profile: { bundles: combinationBundles ?? ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...Object.keys(dependencies)] } },
}, null, 2) + '\n')
writeFileSync(join(profile, 'cordis.yml'), '[]\n')
writeFileSync(join(profile, 'cordis.patch.yml'), integration ? JSON.stringify([{ insert: [{
  id: 'li-runtime-fixture', name: join(workspace, 'guide-goal-adapter/test/host-fixture.mjs').replaceAll('\\', '/'),
}] }], null, 2) : '[]\n')
}

const executable = process.env.DSH_ELECTRON ?? 'C:/Users/wang/AppData/Local/Programs/DeepSeek Harness/DeepSeek Harness.exe'
const cli = join(dirname(executable), 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js')
const runtimeDir = join(dirname(executable), 'resources/app.asar/dsh')
const desktopHost = join(runtimeDir, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js')
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
if (desktop) env.DSH_CLIENT_VERSION = '0.2.1-rc.3'
const logs = []
let baseUrl
let entryUrl
let cookie
let passed = false
let lastProbeError
const redact = text => text.replace(/([?&]token=)[^\s"'<>]+/g, '$1[redacted]')
const args = desktop ? ['--expose-internals', desktopHost, runtimeDir, profile, join(dirname(executable), 'resources/runtime/primary-runtime')]
  : ['--expose-internals', cli, '--profile', 'goal-smoke', '--no-open', '--host', '127.0.0.1', '--port', '0']
const child = spawn(executable, args, {
  cwd: workspace, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', ...(desktop ? ['ipc'] : [])],
})
if (desktop) child.on('message', message => {
  if (message?.type === 'ready') { entryUrl = message.url; baseUrl = new URL(message.url).origin }
  if (message?.type === 'fatal') logs.push(`Desktop startup failed: ${message.message}\n`)
})
const completion = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
const output = chunk => {
  const text = chunk.toString(); logs.push(text)
  if (process.env.DSH_SMOKE_DEBUG === '1') process.stderr.write(redact(text))
  const matches = logs.join('').match(/http:\/\/127\.0\.0\.1:\d+/g)
  if (matches?.length) baseUrl = matches.at(-1)
  const entries = logs.join('').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/g)
  if (entries?.length) entryUrl = entries.at(-1)
}
child.stdout.on('data', output); child.stderr.on('data', output)
child.once('error', error => logs.push(String(error)))
try {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Isolated Host exited (${child.exitCode})`)
    if (baseUrl) {
      try {
        if (entryUrl && !cookie) {
          const login = await fetch(entryUrl, { redirect: 'manual', signal: AbortSignal.timeout(1000) })
          cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
        }
        const response = await fetch(`${baseUrl}/guide/api/state`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', origin: baseUrl, cookie: cookie ?? '' }, signal: AbortSignal.timeout(1000) })
        if (!response.ok) lastProbeError = `guide state HTTP ${response.status}: ${(await response.text()).slice(0, 800)}`
        if (response.ok) {
          const state = await response.json()
          const data = state.value ?? state.data ?? state
          let runtime
          if (integration) {
            const runtimeResponse = await fetch(`${baseUrl}/li-runtime`, { headers: { cookie, origin: baseUrl }, signal: AbortSignal.timeout(1000) })
            if (!runtimeResponse.ok) throw new Error(`Runtime fixture route: ${runtimeResponse.status}`)
            runtime = await runtimeResponse.json()
            if (runtime.status === 'failed') throw new Error(`Runtime fixture failed: ${JSON.stringify({ runtime, modelProjection: data.modelProjection, panelCompat:data.panelCompat })}`)
            if (runtime.status !== 'passed') {
              lastProbeError = `Runtime ${runtime.status}; last assertions: ${JSON.stringify(runtime.assertions?.slice(-5))}`
              await new Promise(resolve => setTimeout(resolve, 50)); continue
            }
            if (runtime.o8?.status !== 'passed') throw new Error(`O8 runtime probe failed: ${JSON.stringify(runtime.o8 ?? runtime)}`)
            if (runtime.o6?.status !== 'passed') throw new Error(`O6 runtime probe failed: ${JSON.stringify(runtime.o6 ?? runtime)}`)
            if (['list', 'send', 'interrupt'].some(name => runtime.o6.native?.[name] !== 'passed')) {
              throw new Error(`O6 native probe failed: ${JSON.stringify(runtime.o6.native)}`)
            }
            if (['list', 'send', 'interrupt'].some(name => runtime.o6.ptc?.[name] !== 'passed')) {
              throw new Error(`O6 PTC probe failed: ${JSON.stringify(runtime.o6.ptc)}`)
            }
            if (data.modelProjection?.mode !== 'active') throw new Error(`O6 model projection not active: ${JSON.stringify(data.modelProjection)}`)
          }
          if (!(expectOriginal ? ['absent'] : ['ready', 'filtered']).includes(data.goalAdapter?.mode)) throw new Error(`Unexpected adapter mode: ${JSON.stringify(state)}`)
          if (data.settlementShield?.mode !== 'active' || data.settlementShield?.inject !== true) {
            throw new Error(`O8 settlement shield not active: ${JSON.stringify(data.settlementShield)}`)
          }
          if (process.env.DSH_EXPECT_ADMISSION === '1' && (data.admission?.mode !== 'active' || data.admission?.enforcement !== 'native-materialize'
            || data.admission?.capacity !== 8 || data.admission?.reserve !== 2 || data.admission?.maxGuides !== 4)) {
            throw new Error(`Admission deployment is not active with Host 8 / reserve 2 / global 4: ${JSON.stringify(data.admission)}`)
          }
          let panelStart
          if (integration && runtime.o6?.parent !== undefined) {
            const startResponse = await fetch(`${baseUrl}/guide/api/start`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', origin: baseUrl, cookie: cookie ?? '' },
              body: JSON.stringify({ sessionId: runtime.o6.parent, question: 'LI panel start probe' }),
              signal: AbortSignal.timeout(3000),
            })
            const startBody = await startResponse.json()
            if (!startResponse.ok || typeof startBody?.value?.childId !== 'string') {
              throw new Error(`O6 panel start failed: ${startResponse.status} ${JSON.stringify(startBody)}`)
            }
            panelStart = { childId: startBody.value.childId }
          }
          let sidebarState
          if (sidebar) {
            const check = await fetch(`${baseUrl}/guide-sidebar/api/state`, { headers: { cookie, origin: baseUrl }, signal: AbortSignal.timeout(1000) })
            sidebarState = check.ok ? await check.json() : { status: check.status }
            if (!check.ok || sidebarState.value?.supported !== true) throw new Error(`Runtime fixture sidebar compatibility failed: ${JSON.stringify(sidebarState)}`)
          }
          if (sidebar && integration) {
            const browser = spawn('python', [join(workspace, 'guide-sidebar-adapter/test/browser_test.py')], { cwd: workspace, env: { ...process.env, PYTHONUTF8: '1' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
            browser.stdin.end(JSON.stringify({ entryUrl, parent: runtime.parent, autoParent: runtime.autoParent, output: smokeRoot }))
            let browserOutput = ''
            browser.stdout.on('data', text => { browserOutput += text })
            browser.stderr.on('data', text => { browserOutput += text })
            const code = await new Promise(resolve => browser.on('exit', resolve))
            if (code !== 0) throw new Error(`Runtime fixture browser check failed: ${redact(browserOutput).slice(-2500)}`)
            console.log(browserOutput.trim())
          }
          if(combination){
            const browser=spawn('python',[join(workspace,'scripts/r5-browser.py')],{cwd:workspace,env:{...process.env,PYTHONUTF8:'1'},windowsHide:true,stdio:['pipe','pipe','pipe']})
            browser.stdin.end(JSON.stringify({entryUrl,output:smokeRoot}))
            let output='';browser.stdout.on('data',chunk=>output+=chunk);browser.stderr.on('data',chunk=>output+=chunk)
            const code=await new Promise(resolve=>browser.on('exit',resolve))
            if(code!==0)throw Error(`Combination browser probe failed: ${redact(output).slice(-2500)}`)
            console.log(output.trim())
          }
          writeFileSync(join(smokeRoot, desktop ? expectOriginal ? 'desktop-restore-result.json' : 'desktop-mount-result.json' : integration ? 'runtime-result.json' : 'smoke-result.json'), JSON.stringify({ status: 'passed', home, baseUrl, state, runtime, panelStart, sidebarState, scope: desktop ? 'actual desktop profile cold Host startup and fenced guidance API; no test agents or model requests' : integration ? 'real isolated Host, agent loop, goal, subagent runtime, native tool-call and actual PTC run_code; deterministic in-process model; no external model request' : 'real isolated keyless Host startup and fenced guidance API; no model request' }, null, 2) + '\n')
          console.log(JSON.stringify({ status: 'passed', baseUrl, goalAdapter: data.goalAdapter }))
          passed = true
          break
        }
      } catch (error) {
        lastProbeError = `${String(error)}${error?.cause ? ` (${String(error.cause)})` : ''}`
        if (/Unexpected adapter|Runtime fixture/.test(String(error))) throw error
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!passed) throw new Error(`Isolated Host did not become ready within 60s; last probe: ${lastProbeError}`)
} catch (error) {
  console.error(redact(String(error))); console.error(redact(logs.join('').slice(-6000))); process.exitCode = 1
} finally {
  if (desktop && child.connected) child.send({ type: 'shutdown' })
  else child.kill('SIGTERM')
  await Promise.race([completion, new Promise(resolve => setTimeout(resolve, 2500))])
  if (child.exitCode === null) child.kill('SIGTERM')
  writeFileSync(join(smokeRoot, desktop ? 'desktop-host.log' : 'host.log'), redact(logs.join('')))
}

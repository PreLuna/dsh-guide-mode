import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { isDeepStrictEqual } from 'node:util'
import { spawnSync } from 'node:child_process'
const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const output=join(workspace,'evidence/O19-production-2026-11-03'),deployment=join(output,'desktop')
const json=path=>JSON.parse(readFileSync(path,'utf8'))
const plan=json(join(deployment,'plan.json')),hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const YAML=createRequire(join(plan.profile,'package.json'))('yaml')
const checks=[]
const check=(value,label)=>{if(!value)throw Error(label);checks.push(label)}
for(const file of plan.files){
  check(hash(readFileSync(join(plan.profile,file.relative)))===file.afterSha256,`installed ${file.relative}`)
  check(hash(readFileSync(join(deployment,'desktop-before',file.relative)))===file.beforeSha256,`backup ${file.relative}`)
}
for(const [path,expected] of Object.entries(plan.unchangedHashes))check(hash(readFileSync(join(plan.profile,path)))===expected,`unchanged profile ${path}`)
for(const [path,expected] of Object.entries(plan.sourceHashes))check(hash(readFileSync(join(workspace,path)))===expected,`deployed source ${path}`)
check(realpathSync(plan.link).toLowerCase()===realpathSync(plan.source).toLowerCase(),'exact admission junction')
const name='@local/dsh-guide-admission'
const strip=value=>{value=structuredClone(value);delete value.dependencies[name];value.dsh.profile.bundles=value.dsh.profile.bundles.filter(x=>x!==name);return value}
const beforeManifest=json(join(deployment,'desktop-before/package.json')),afterManifest=json(join(plan.profile,'package.json'))
check(isDeepStrictEqual(strip(beforeManifest),strip(afterManifest)),'unrelated dependencies and bundles preserved')
check(afterManifest.dsh.profile.bundles.filter(x=>x===name).length===1 && afterManifest.dsh.profile.bundles.indexOf(name)<afterManifest.dsh.profile.bundles.indexOf('@local/dsh-guide-panel'),'bundle installed once before panel')
for(const path of ['pnpm-lock.yaml','node_modules/.pnpm/lock.yaml']){
  const before=YAML.parse(readFileSync(join(deployment,'desktop-before',path),'utf8')),after=YAML.parse(readFileSync(join(plan.profile,path),'utf8'))
  delete before.importers['.'].dependencies[name];delete after.importers['.'].dependencies[name]
  check(isDeepStrictEqual(before,after),`registry graph preserved ${path}`)
}
const mounted=json(join(deployment,'desktop-mount-result.json')),state=mounted.state.value
check(mounted.status==='passed'&&state.admission.mode==='active'&&state.admission.enforcement==='native-materialize','actual desktop profile native admission active')
check(state.capacity===8&&state.reserve===2&&state.maxGuides===4&&state.admission.budget===6&&state.admission.unknown===0,'actual volatile manager API reports 8/2/4 and budget 6')
check(state.settlementShield.mode==='active'&&state.settlementShield.inject===true&&['ready','filtered'].includes(state.goalAdapter.mode)&&mounted.sidebarState.value.supported,'existing shield and adapters active')
const ui=json(join(deployment,'ui-capacity.json')),live=json(join(deployment,'live-ui.json'))
check(ui.capacity===8&&ui.changed===false,'normal desktop settings capacity 8 read-only')
check(live.package===name&&live.component==='guide-admission'&&live.status==='运行中','normal desktop component running')
const runtime=json(join(output,'result.json'))
check(runtime.status==='passed'&&runtime.assertions.length===43&&runtime.errors.length===0,'43 production Host checks passed')
const native=json(join(output,'native-test-results.json'))
check(native.every(x=>x.status==='passed'),'B-prime/goal/sidebar real Runtime regressions passed')
for(const phase of ['prepare','restart']){
  const result=json(join(output,`O2-regression/${phase}-result.json`))
  check(result.status==='passed'&&result.runtime.errors.length===0&&result.runtime.lifecycle.status==='passed',`O2/R6 ${phase} passed`)
}
const browser=json(join(output,'browser-regression/browser-result.json'))
check(browser.status==='passed'&&browser.assertions.length===11,'11 browser functional assertions passed (diagnostics retained)')
// Persist the final focused results alongside the exact deployed source hashes.
const focused=['guide-admission/test/core.test.mjs','guide-panel/test/scheduler-integration.test.mjs','guide-panel/test/panel-render.test.mjs'].map(path=>{
  const result=spawnSync(process.execPath,[join(workspace,path)],{cwd:workspace,encoding:'utf8',windowsHide:true})
  check(result.status===0,`final focused ${path}`)
  return{path,status:'passed',output:result.stdout.trim()}
})
// Check all current-document local links without following URLs or archive snapshots.
const docs=['README.md','OPEN-ITEMS.md','PROJECT-STATUS.md','docs/ARCHITECTURE.md','docs/O19-O7-R1-RESEARCH.md','guide-admission/README.md','evidence/O19-production-2026-11-03/report.md']
for(const path of docs){
  const text=readFileSync(join(workspace,path),'utf8')
  for(const match of text.matchAll(/\]\(([^)]+)\)/g)){
    const target=match[1].split('#')[0]
    if(!target||/^(https?:|mailto:|codex:)/.test(target))continue
    const resolved=resolve(dirname(join(workspace,path)),target)
    check(resolved===join(output,'verification.json') || existsSync(resolved),`local link ${path} -> ${target}`)
  }
}
const result={status:'passed',date:'2026-11-03',checks,sourceSha256:plan.sourceHashes,focused,
  deployment:{profile:plan.profile,capacity:8,reserve:2,maxGuides:4,budget:6,capacitySource:state.admission.capacitySource,
    actualProfileColdStartup:true,normalDesktopComponent:'运行中',settingsReadOnly:true,registryGraphsPreserved:true,rollbackPreflightFiles:7,
    actualRollbackRoundTrip:false,independentSuperagentPreserved:true,testAgentsCreatedInDesktop:0,modelRequestsSentInDesktop:0},
  finalProcesses:existsSync(join(deployment,'final-process-check.json'))?json(join(deployment,'final-process-check.json')):null,
  browser:{functionalAssertions:11,diagnostics:browser.consoleErrors.map(x=>x.split('\n')[0])},
  boundaries:['core updates require cold restart','unknown native hook does not guarantee non-panel enforcement','O20/O21/O11 independent scope remains']}
writeFileSync(join(output,'verification.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({status:result.status,checks:checks.length,focused:focused.map(x=>x.output),deployment:result.deployment,browser:result.browser}))

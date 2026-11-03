import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync, realpathSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const output=join(workspace,'evidence/O19-production-2026-11-03/desktop')
const profile=join(process.env.USERPROFILE,'.dsh/profiles/desktop'),source=join(workspace,'guide-admission')
const name='@local/dsh-guide-admission',specifier=`link:${source.replaceAll('\\','/')}`
const YAML=createRequire(join(profile,'package.json'))('yaml'),hash=b=>createHash('sha256').update(b).digest('hex')
if(existsSync(join(output,'applied.json'))){
  const previous=JSON.parse(readFileSync(join(output,'plan.json'),'utf8'))
  for(const file of previous.files)if(hash(readFileSync(join(profile,file.relative)))!==file.afterSha256)throw Error('Installed profile changed; use a new migration evidence directory')
  for(const [path,expected] of Object.entries(previous.sourceHashes))if(hash(readFileSync(join(workspace,path)))!==expected)throw Error('Production source changed; use a new upgrade evidence directory')
  console.log(JSON.stringify({status:'already-deployed',originalPlanPreserved:true}));process.exit(0)
}
mkdirSync(output,{recursive:true})
const files=[]
function propose(relative,candidate,transform){
  const before=readFileSync(join(profile,relative)),after=Buffer.from(transform(before.toString('utf8')))
  writeFileSync(join(output,candidate),after)
  files.push({relative,candidate,beforeSha256:hash(before),afterSha256:hash(after),changed:!before.equals(after)})
}
const manifest=JSON.parse(readFileSync(join(profile,'package.json'),'utf8'))
if(manifest.dependencies['@local/dsh-guide-panel']!==`link:${join(workspace,'guide-panel').replaceAll('\\','/')}`)throw Error('Unexpected panel installation')
// Detect old overrides without exposing unrelated configuration or secrets.
for(const path of [join(process.env.USERPROFILE,'.dsh/cordis.patch.yml'),join(profile,'cordis.patch.yml')]){
  if(!existsSync(path))continue
  const doc=YAML.parseDocument(readFileSync(path,'utf8'));if(doc.errors.length)throw doc.errors[0]
  function visit(value){
    if(!value||typeof value!=='object')return
    if((value.id==='guide-panel'||value.name==='@local/dsh-guide-panel')&&['capacity','reserve','maxGuides'].some(k=>k in (value.config??{})))throw Error(`Legacy panel capacity override requires migration: ${path}`)
    Object.values(value).forEach(visit)
  }
  visit(doc.toJS())
}
propose('package.json','package.next.json',text=>{
  const value=JSON.parse(text)
  if(value.dependencies[name]&&value.dependencies[name]!==specifier)throw Error('Conflicting admission dependency')
  value.dependencies[name]=specifier
  const bundles=value.dsh.profile.bundles.filter(x=>x!==name),index=bundles.indexOf('@local/dsh-guide-panel')
  if(index<0||!bundles.includes('@local/dsh-guide-shield'))throw Error('Existing panel/shield selection missing')
  bundles.splice(index,0,name);value.dsh.profile.bundles=bundles
  const strip=v=>{v=structuredClone(v);delete v.dependencies[name];v.dsh.profile.bundles=v.dsh.profile.bundles.filter(x=>x!==name);return v}
  if(!isDeepStrictEqual(strip(value),strip(manifest)))throw Error('Unrelated manifest change')
  return JSON.stringify(value,null,2)+'\n'
})
for(const [relative,candidate] of [['pnpm-lock.yaml','pnpm-lock.next.yaml'],['node_modules/.pnpm/lock.yaml','installed-lock.next.yaml']]){
  propose(relative,candidate,text=>{
    const doc=YAML.parseDocument(text);if(doc.errors.length)throw doc.errors[0]
    const before=doc.toJS(),dependencies=doc.getIn(['importers','.','dependencies'],true)
    if(String(before.lockfileVersion)!=='9.0'||!dependencies?.range)throw Error('Unsupported lock layout')
    const entry=before.importers['.'].dependencies[name]
    if(entry){if(!isDeepStrictEqual(entry,{specifier,version:specifier}))throw Error('Conflicting lock entry');return text}
    const block=YAML.stringify({[name]:{specifier,version:specifier}}).trimEnd().split('\n').map(line=>`      ${line}`).join('\n')+'\n'
    const position=dependencies.range[1],next=text.slice(0,position)+block+text.slice(position)
    const after=YAML.parse(next);delete after.importers['.'].dependencies[name]
    if(!isDeepStrictEqual(before,after))throw Error('Registry graph changed')
    return next
  })
}
const link=join(profile,'node_modules',name)
let linkExists=false
try{const stat=lstatSync(link);if(!stat.isSymbolicLink()||realpathSync(link).toLowerCase()!==realpathSync(source).toLowerCase())throw Error('Unexpected link');linkExists=true}catch(error){if(error.code!=='ENOENT')throw error}
const sourcePaths=['guide-admission/index.js','guide-admission/core.js','guide-admission/cordis.patch.yml','guide-panel/index.js','guide-panel/client.js','guide-panel/cordis.patch.yml','guide-panel/package.json']
const plan={profile,source,link,linkExists,files,date:'2026-11-03',policy:{reserve:2,maxGuides:4,capacitySource:'Host'},
  sourceHashes:Object.fromEntries(sourcePaths.map(path=>[path,hash(readFileSync(join(workspace,path)))])),
  unchangedHashes:Object.fromEntries(['cordis.patch.yml','cordis.yml','pnpm-workspace.yaml','node_modules/.modules.yaml'].map(path=>[path,hash(readFileSync(join(profile,path)))]))}
writeFileSync(join(output,'plan.json'),JSON.stringify(plan,null,2)+'\n')
console.log(JSON.stringify({status:'prepared',profile,files:files.map(f=>({relative:f.relative,changed:f.changed})),policy:plan.policy,legacyOverrides:0}))

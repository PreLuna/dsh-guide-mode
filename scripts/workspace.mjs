import { readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,realpathSync } from 'node:fs'
import { join,resolve,dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const packages=['guide-preset','guide-shield','guide-admission','guide-panel','guide-sidebar-adapter','guide-goal-adapter','guide-manager']
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]}
const command=args[0]??'doctor'
const userHome=process.env.USERPROFILE??process.env.HOME
const profile=resolve(option('--profile')??join(userHome,'.dsh/profiles/desktop'))
const names=Object.fromEntries(packages.map(dir=>[dir,JSON.parse(readFileSync(join(root,dir,'package.json'),'utf8')).name]))
if(command==='doctor'){
  const skillRoot=option('--skills')??join(process.env.DSH_HOME??join(userHome,'.dsh'),'skills')
  const skill=existsSync(join(skillRoot,'guide/SKILL.md'))
  const results=packages.map(directory=>{const manifest=JSON.parse(readFileSync(join(root,directory,'package.json'),'utf8'));return{directory,name:manifest.name,version:manifest.version,private:manifest.private,license:manifest.license}})
  if(results.some(item=>item.version!=='1.1.0'||item.private!==true||item.license!=='UNLICENSED'))throw Error('Inconsistent local release metadata')
  console.log(JSON.stringify({status:'passed',distribution:'private-github',packages:results,guideSkill:{available:skill,fallback:'explicit unavailable note and general advice'},profile},null,2))
}else if(command==='prepare'){
  const outputArg=option('--output');if(!outputArg)throw Error('--output is required; use a new evidence directory for every operation')
  const output=resolve(outputArg),mode=option('--mode')??'install'
  if(!['install','uninstall'].includes(mode))throw Error('Unsupported mode')
  if(existsSync(join(output,'plan.json')))throw Error('Preserve the existing plan; choose a new output directory')
  const YAML=createRequire(join(profile,'package.json'))('yaml')
  const manifests=JSON.parse(readFileSync(join(profile,'package.json'),'utf8'))
  const owned=new Set(Object.values(names)),files=[],links=[]
  const strip=value=>{value=structuredClone(value);for(const name of owned)delete value.dependencies?.[name];value.dsh.profile.bundles=value.dsh.profile.bundles.filter(name=>!owned.has(name));return value}
  const after=structuredClone(manifests)
  after.dependencies??={}
  after.dsh.profile.bundles=after.dsh.profile.bundles.filter(name=>!owned.has(name))
  for(const directory of packages){
    const name=names[directory],source=join(root,directory),specifier=`link:${source.replaceAll('\\','/')}`,path=join(profile,'node_modules',name)
    if(manifests.dependencies?.[name]&&manifests.dependencies[name]!==specifier)throw Error(`Conflicting installed ${name}; preserve it before switching`)
    let existed=false
    try{const stat=lstatSync(path);if(!stat.isSymbolicLink()||realpathSync(path).toLowerCase()!==realpathSync(source).toLowerCase())throw Error(`Unexpected installation path ${name}`);existed=true}catch(error){if(error.code!=='ENOENT')throw error}
    links.push({path,source,existed})
    if(mode==='install'){after.dependencies[name]=specifier;after.dsh.profile.bundles.push(name)}else delete after.dependencies[name]
  }
  if(!isDeepStrictEqual(strip(manifests),strip(after)))throw Error('Unrelated manifest change')
  mkdirSync(output,{recursive:true})
  function candidate(relative,text){
    const before=readFileSync(join(profile,relative)),name=`candidate-${files.length}.txt`,bytes=Buffer.from(text)
    writeFileSync(join(output,name),bytes);files.push({relative,candidate:name,beforeSha256:hash(before),afterSha256:hash(bytes)})
  }
  candidate('package.json',JSON.stringify(after,null,2)+'\n')
  for(const path of ['pnpm-lock.yaml','node_modules/.pnpm/lock.yaml']){
    const doc=YAML.parseDocument(readFileSync(join(profile,path),'utf8'));if(doc.errors.length)throw doc.errors[0]
    const before=doc.toJS()
    if(String(before.lockfileVersion)!=='9.0')throw Error('Unsupported lockfile')
    for(const [directory,name] of Object.entries(names)){
      if(mode==='uninstall')doc.deleteIn(['importers','.','dependencies',name])
      else{const specifier=`link:${join(root,directory).replaceAll('\\','/')}`;doc.setIn(['importers','.','dependencies',name],{specifier,version:specifier})}
    }
    const next=doc.toString(),stripLock=value=>{for(const name of owned)delete value.importers['.'].dependencies[name];return value}
    if(!isDeepStrictEqual(stripLock(structuredClone(before)),stripLock(YAML.parse(next))))throw Error('Registry graph changed')
    candidate(path,next)
  }
  // Owned overrides need explicit migration; never silently leave active orphan entries.
  for(const path of ['cordis.patch.yml']){
    const full=join(profile,path);if(!existsSync(full))continue
    const doc=YAML.parseDocument(readFileSync(full,'utf8'));if(doc.errors.length)throw doc.errors[0]
    const text=JSON.stringify(doc.toJS())
    if(mode==='uninstall'&&[...owned].some(name=>text.includes(name)))throw Error('Owned profile overrides require an explicit removal plan; no profile write performed')
  }
  const plan={mode,profile,workspace:root,date:'2026-11-03',files,links,unrelatedRegistryGraphsPreserved:true,
    unchangedHashes:Object.fromEntries(['cordis.patch.yml','cordis.yml','pnpm-workspace.yaml','node_modules/.modules.yaml'].filter(path=>existsSync(join(profile,path))).map(path=>[path,hash(readFileSync(join(profile,path)))]))}
  writeFileSync(join(output,'plan.json'),JSON.stringify(plan,null,2)+'\n')
  console.log(JSON.stringify({status:'prepared',mode,output,files:files.length,packages:links.length}))
}else throw Error('Use doctor or prepare --mode install|uninstall --output <new directory> [--profile <path>]')

import { readdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const paths=['guide-sidebar-adapter/scripts/build.mjs --check']
for(const dir of ['guide-panel','guide-admission','guide-sidebar-adapter','guide-manager'])for(const name of readdirSync(resolve(root,dir,'test'))){
  if(!name.endsWith('.test.mjs')||['projection-runtime.test.mjs','official-consumers.test.mjs'].includes(name))continue
  paths.push(`${dir}/test/${name}`)
}
const results=await Promise.all(paths.map(path=>new Promise(resolveResult=>{
  const child=spawn(process.execPath,path.split(' '),{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']})
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c)
  child.on('error',error=>resolveResult({path,passed:false,output:String(error)}))
  child.on('exit',code=>resolveResult({path,passed:code===0,output}))
})))
for(const result of results)console.log(JSON.stringify(result))
if(process.env.GUIDE_TEST_RESULTS)writeFileSync(process.env.GUIDE_TEST_RESULTS,JSON.stringify(results,null,2)+'\n')
if(results.some(result=>!result.passed))process.exitCode=1

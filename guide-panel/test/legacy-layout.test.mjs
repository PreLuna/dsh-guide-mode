import assert from 'node:assert/strict'
let plugin
globalThis.window={__ModuleLoader__:{load({factory}){plugin=factory(()=>({}))}}}
await import('../client.js')
const {isLegacyGuideTab,cleanLegacyTabs}=plugin.__internals
const old={id:'old',kind:'guide',title:'指导',contentId:'sidebar://guide'}
const start={id:'start',kind:'guide',title:'开始',contentId:'sidebar://guide'}
const file={id:'file',kind:'file',title:'指导',contentId:'dsh-resource://file/session/a/guide.md'}
const modern={id:'new',kind:'guide-panel',title:'指导',contentId:'sidebar://guide-panel'}
assert.equal(isLegacyGuideTab(old),true)
for(const tab of [start,file,modern,{...old,contentId:'sidebar://unknown'}])assert.equal(isLegacyGuideTab(tab),false)
let tabs=[old,start,file,modern],closed=[]
const right={tabsIn:seat=>seat==='a'?tabs:[],closeIn(seat,id){closed.push([seat,id]);tabs=tabs.filter(tab=>tab.id!==id)}}
assert.deepEqual(await cleanLegacyTabs(right,'a'),{closed:1,failed:0})
assert.deepEqual(closed,[['a','old']])
assert.deepEqual(tabs,[start,file,modern])
assert.deepEqual(await cleanLegacyTabs(right,'a'),{closed:0,failed:0})
tabs=[old,start]
assert.deepEqual(await cleanLegacyTabs({...right,closeIn(){throw Error('fail')}},'a'),{closed:0,failed:1})
assert.deepEqual(tabs,[old,start])
assert.deepEqual(await cleanLegacyTabs({tabsIn:()=>[old],close(){throw Error('wrong seat')}},'a'),{closed:0,failed:1})
console.log('O12: legacy detection, scoped removal, unrelated tabs, failures and repeat cleanup passed')

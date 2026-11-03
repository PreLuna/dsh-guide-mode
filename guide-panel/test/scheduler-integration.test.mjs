import assert from 'node:assert'

// ── fake browser ─────────────────────────────────────────────────────────
let tick, clock = 100000, state, requests = 0, fail = false, archiveFail = false, openMain, rightTabs = []
const archives = [], archived = new Set()
const originalNow = Date.now
Date.now = () => clock
globalThis.fetch = async (_url, options) => {
  requests++
  if (fail) throw Error('query failed')
  const body = JSON.parse(options.body)
  if (_url.includes('auto-archive')) {
    if (archiveFail) throw Error('archive refused')
    archives.push(body.id); archived.add(body.id)
    return {status:200,ok:true,text:async()=>JSON.stringify({ok:true,value:{archived:true}})}
  }
  return { status: 200, ok: true, text: async () => JSON.stringify({ok:true,value:{ panelCompat:{writable:true},archiveCandidates:Object.fromEntries((body.candidates??[]).map(item=>[item.id,{status:'idle',parentSessionId:item.parentSessionId}])), archive:{lowDelayMs:600,midDelayMs:180,highDelayMs:30,holdMs:120},admission:{
    ...state, sampledAt:clock, enforcement:'native-materialize',unknown:0,busyIds:state.busyIds??[],
  }}}) }
}
const storage = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
  },
  setTimeout: () => 0,
  setInterval: fn => { tick = fn; return 1 },
  clearInterval() {},
  document: { baseURI: 'http://local/' },
  __ModuleLoader__: undefined,
}
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async () => {} } },
    configurable: true,
  })
} catch {
  // Node's built-in navigator is read-only on some versions; copy never runs here.
}

// ── fake React ───────────────────────────────────────────────────────────
const fakeReact = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat() }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useEffect() {},
  useRef(initial) { return { current: initial } },
  useMemo(factory) { return factory() },
  useCallback(fn) { return fn },
  useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot() },
}

let plugin = null
window.__ModuleLoader__ = {
  load({ factory }) {
    plugin = factory((id) => (id === 'react' ? fakeReact : {}))
  },
}

// ── fake host ────────────────────────────────────────────────────────────
let descriptor = null
let body = null
let listSnapshot = { byId: {}, projectionsBySession: {} }
const services = {
  sessions: {
    list: {
      getSnapshot: () => listSnapshot,
      subscribe: () => () => {},
    },
  },
  workspaces: {
    list: { getSnapshot: () => ({ archivedSessionIds: [...archived] }), subscribe: () => () => {} },
  },
  sidebarRight: { openTabs: { getSnapshot: () => [], subscribe: () => () => {} }, openResource: () => {}, tabsIn: () => rightTabs, close: () => {} },
  sidebarRightTabs: {
    register: (value) => { descriptor = value; return () => {} },
    get: () => ({}),
  },
  slots: {
    inject: (_key, callback) => callback(),
    register: (options, component) => { body = { options, component }; return () => {} },
  },
  uiWorkspace: { openSession() {}, selection:{getSnapshot:()=>({sessionId:openMain})}, archiveSession: async id => { archives.push(id); archived.add(id) }, unarchiveSession: async () => {} },
}
const ctx = {
  locale: { register: () => () => {}, bind: () => (key) => key },
  effect: (fn) => fn(),
  inject: (_deps, callback) => callback(ctx),
  sidebarRightTabs: services.sidebarRightTabs,
  slots: services.slots,
  get: (name) => services[name],
}


function pool(id, used) { return {poolId:id,used,capacity:8,unknown:0} }
function threads(a='ga',b='gb') {
  listSnapshot={byId:{[a]:{id:a,origin:'subagent',running:false},[b]:{id:b,origin:'subagent',running:false}},
    projectionsBySession:{a:{values:{subagentCatalog:[{id:a,label:'指导: a'}]}},b:{values:{subagentCatalog:[{id:b,label:'指导: b'}]}}}}
}
state={poolsBySession:{a:pool('A',6),b:pool('B',2)}}
threads()
await import('../client.js')
plugin.apply(ctx)
await new Promise(resolve=>setImmediate(resolve))
assert.ok(tick)
clock+=31; await tick()
assert.deepEqual(archives,['ga'],'A high pressure must not accelerate B low pressure')
threads('ga2','gb2'); clock+=1; await tick()
state.poolsBySession.a.used=2; clock+=1; await tick()
clock+=31; await tick()
assert.deepEqual(archives,['ga','ga2'],'peak hold is kept independently per pool')
state.busyIds=['gb2'];clock+=1000;await tick()
assert.equal(archives.includes('gb2'),false,'native resident idle/parked guide is never archived')
state.busyIds=[];state.poolsBySession.b={...pool('B',6),unknown:1};clock+=1000;await tick()
assert.equal(archives.includes('gb2'),false,'unknown pool never archives')
state.poolsBySession.b=pool('B-new-epoch',2);clock+=1;await tick()
fail=true;clock+=1000;await tick()
assert.equal(archives.includes('gb2'),false,'query failures skip archival')
fail=false;clock+=1;await tick()
// A known record is discoverable even without its parent's projection.
storage.set('dsh-guide-panel.threads.v1',JSON.stringify({'cached':{parentSessionId:'b',createdAt:1,label:'指导: cached'}}))
listSnapshot={byId:{cached:{id:'cached',running:false}},projectionsBySession:{}}
state.poolsBySession={b:pool('B',6)};clock+=1;await tick()
openMain='cached';clock+=100;await tick()
assert.equal(archives.includes('cached'),false,'main-view fallback protects an open guide')
openMain=undefined;clock+=1;await tick()
archiveFail=true;clock+=31;await tick();await new Promise(resolve=>setImmediate(resolve))
assert.equal(archives.includes('cached'),false,'failed archive is not marked archived')
archiveFail=false;clock+=1;await tick();clock+=31;await tick();await new Promise(resolve=>setImmediate(resolve))
assert.equal(archives.filter(id=>id==='cached').length,1,'retry succeeds once')
clock+=100;await tick()
assert.equal(archives.filter(id=>id==='cached').length,1,'repeated scan does not rearchive')
const many=Object.fromEntries(Array.from({length:130},(_,i)=>[`batch-${i}`,{parentSessionId:'b',label:'指导: batch',createdAt:1}]))
storage.set('dsh-guide-panel.threads.v1',JSON.stringify(many))
listSnapshot={byId:{},projectionsBySession:{}}
for(let i=0;i<5;i++){clock+=31;await tick();await new Promise(resolve=>setImmediate(resolve))}
assert.equal(archives.filter(id=>id.startsWith('batch-')).length,130,'rotating batches eventually visit every known guide and retain idle history')
assert.ok(requests>=8)
Date.now=originalNow
console.log('guide-panel scheduler integration: per-pool pressure/hold, busy, unknown and query failures passed')

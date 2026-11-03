import assert from 'node:assert/strict'
let plugin,service
globalThis.window={__ModuleLoader__:{load({factory}){plugin=factory(name=>name==='react'?{Component:class{}}:{})}}}
await import('../client.js')
assert.equal(typeof plugin.apply,'function')
await plugin.apply({modules:{},provide:(name,value)=>service=value})
assert.equal(service.getState().mode,'native')
assert.equal(service.getState().reason,'unsupported-client-runtime')
const dispose=service.registerTaskFilter(entry=>entry.label==='指导')
assert.equal(typeof dispose,'function');dispose()
console.log('Generated sidebar client loaded; embedded registry and unsupported-runtime path passed')

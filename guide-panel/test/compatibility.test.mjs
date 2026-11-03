import assert from 'node:assert/strict'
import {panelCompatibility} from '../compatibility.js'
import {apply as applyShield} from '../../guide-shield/core.js'
const keys={webServer:['register'],connection:['requestRejection'],agents:['get'],sessions:['get'],sessionQuery:['observeSession'],subagents:['startActivation','registerProvider'],guideAdmission:['state','assertAvailable'],workspaceRegistry:['archiveSession'],sessionTitle:['rename']}
const services=Object.fromEntries(Object.entries(keys).map(([key,methods])=>[key,Object.fromEntries(methods.map(name=>[name,()=>{}]))]))
const ctx={get:key=>services[key]}
assert.equal(panelCompatibility(ctx,{supported:true}).mode,'ready')
for(const [key,methods] of Object.entries(keys))for(const method of methods){
  const original=services[key][method];delete services[key][method]
  const status=panelCompatibility(ctx,{supported:true})
  assert.equal(status.writable,false);assert.ok(status.missing.includes(`${key}.${method}`))
  services[key][method]=original
}
assert.equal(panelCompatibility(ctx,{supported:false,reason:'unknown-version'}).reason,'unknown-version')
let shield
applyShield({get:key=>services[key],provide:(_name,value)=>shield=value},{},undefined,{supported:false,reason:'unknown-version'})
assert.equal(shield.getState().mode,'unsupported');assert.equal(shield.getState().inject,false)
console.log('O21: required Host contracts, unknown source and unsupported shield fail explicitly without partial mount')

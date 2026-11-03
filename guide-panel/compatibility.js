const read=(ctx,key)=>{try{return ctx.get(key)}catch{return undefined}}
const required={webServer:['register'],connection:['requestRejection'],agents:['get'],sessions:['get'],sessionQuery:['observeSession'],
  subagents:['startActivation','registerProvider'],guideAdmission:['state','assertAvailable'],workspaceRegistry:['archiveSession'],sessionTitle:['rename']}
export function panelCompatibility(ctx,proof) {
  const missing=[]
  for(const [key,methods] of Object.entries(required))for(const method of methods)if(typeof read(ctx,key)?.[method]!=='function')missing.push(`${key}.${method}`)
  const reason=proof?.supported!==true?(proof?.reason??'source-unverified'):missing.length?'missing-host-contract':null
  return{mode:reason?'unsupported':'ready',reason,writable:!reason,missing,recovery:'restart-or-restore-supported-version',coreUpdate:'cold-restart',identityRead:proof?.identityRead??'unverified'}
}

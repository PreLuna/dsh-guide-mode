import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'guide-sidebar-adapter'
const REVIEWED_CLIENT = 'dd93b4563f6fe3d384c0e8270fcf76656398ae358d18316a91aae4046bdf2432'
const REVIEWED_MODULES = '426084f8672c26a469566a3f43c91a9b0d1dd73d0834028e553a6d0fa9cffa44'

export function apply(ctx) {
  function readState() {
    let state = { supported: false, reason: 'package-unavailable' }
    try {
      const packages = ctx.get('pluginPackages')
      // Unlike the installation-owned core driver, a profile-local package
      // may resolve natively only from the profile. Ask its owning resolver.
      const profileDir = ctx.get('profileContext')?.dir ?? packages?.resolution?.profileDir
      const anchor = profileDir ? pathToFileURL(join(profileDir, 'package.json')).href : import.meta.url
      const pkg = packages?.packageOf('dsh-better-sidebar', anchor)
      if (!pkg) throw new Error('Official sidebar package is not registered in the profile')
      const manifest = JSON.parse(readFileSync(pkg.manifestPath, 'utf8'))
      const clientHash = createHash('sha256').update(readFileSync(join(pkg.dir, 'lib/client.js'))).digest('hex')
      const modules = packages.packageOf('@deepseek-ai/dsh-client-modules', anchor)
      const modulesHash = createHash('sha256').update(readFileSync(join(modules.dir, 'lib/client.js'))).digest('hex')
      const cordis = packages.packageOf('@deepseek-ai/cordis', anchor)
      const supportedRuntime = modulesHash === REVIEWED_MODULES && cordis?.version === '4.0.5'
      state = { supported: manifest.version === '0.28.2' && clientHash === REVIEWED_CLIENT && supportedRuntime,
        version: manifest.version, clientHash, modulesHash, cordisVersion: cordis?.version,
        reason: manifest.version !== '0.28.2' ? 'unsupported-sidebar-version'
          : clientHash !== REVIEWED_CLIENT ? 'unsupported-sidebar-build' : !supportedRuntime ? 'unsupported-client-runtime' : null }
    } catch (error) { state = { ...state, diagnostic: String(error.message ?? error) } }
    return state
  }
  ctx.provide('guideSidebarHost', { getState: readState })
  ctx.inject(['webServer'], host => {
    host.effect(() => host.webServer.register({ kind: 'prefix', path: '/guide-sidebar/api', handler(req, res) {
      const rejection = host.get('connection')?.requestRejection(req)
      const valid = req.method === 'GET' && new URL(req.url, 'http://dsh.internal').pathname === '/guide-sidebar/api/state'
      res.writeHead(rejection ?? (valid ? 200 : 404), { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(rejection ? { ok: false, error: 'forbidden' } : valid ? { ok: true, value: readState() } : { ok: false, error: 'not found' }))
    } }), 'guide-sidebar-adapter: compatibility state')
  })
}

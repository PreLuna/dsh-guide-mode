const { loadHostContracts } = await import('@local/dsh-guide-shield/contracts').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  return import('../guide-shield/contracts.js')
})
import { panelCompatibility } from './compatibility.js'
import { inspectCandidates, autoArchive } from './archive.js'
/**
 * Host half of the guidance panel bundle.
 *
 * A guidance conversation is a CHILD session of the conversation on screen,
 * created through a provider this plugin registers itself:
 *
 * - `prepareContinuable()` returns the parent's completed-turn prefix as the
 *   child's seed (the same cut the built-in `fork` provider makes), so the
 *   advisor has already read everything the user has done;
 * - the provider declares `capabilities.agentPreset`, so `startActivation`
 *   may ALSO carry `agentPreset: 'guide'`. The runtime's materialization
 *   mounts that preset on the child's context and then creates the session
 *   with the seed, which is how the stricter guidance persona/tool assembly
 *   and the inherited history coexist (the built-in `fork` provider refuses
 *   the preset, and `spawn` has no seed).
 *
 * The child stays a regular runtime subagent: DSH's own right-sidebar
 * conversation tab (`subagentchat`) renders and continues it, and the
 * archived-session gate keeps it from running after an archive. The Tasks
 * page lists it as an ordinary child unless the installed better-sidebar
 * exposes the plugin seams the client registers (filter + section). Nothing
 * in this file renders UI.
 */

import { createIdentity } from './identity.js'
import { createModelProjection, loadModelProjectionSource } from './model-projection.js'

/** JSON API prefix served to the panel. */
const ROUTE_PREFIX = '/guide/api'

/** Refuse request bodies larger than this (a question, not a document). */
const MAX_BODY_BYTES = 64 * 1024

/**
 * Durable thread-label prefix. It rides the child's subagent descriptor, so
 * the parent's `subagentCatalog` projection carries it back to the panel
 * (and DSH's own subagent list shows the thread as a healthy child row).
 * Kept locale-independent on purpose: it is DATA, not UI copy.
 */
export const GUIDE_LABEL_PREFIX = '指导: '

/** The registered provider name (`subagents.registerProvider` is a registry). */
export const GUIDE_PROVIDER = 'guide-fork'

/** The agent preset the guidance child is composed with. */
export const GUIDE_PRESET = 'guide'

/** Idle-archive delays per pressure band (10 min / 3 min / 30 s). */
const DEFAULT_ARCHIVE = { lowDelayMs: 600_000, midDelayMs: 180_000, highDelayMs: 30_000 }

/** How long a dropped pressure band stays in force (peak hold). */
const DEFAULT_HOLD_MS = 120_000

/** Coerce one config value to a non-negative integer. */
function countOf(value, fallback) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback
}

/** The capacity/archive policy this activation serves. */
export function resolveLimits(config) {
  const archive = config !== null && typeof config === 'object' && config.archive !== null && typeof config.archive === 'object'
    ? config.archive
    : {}
  return {
    archive: {
      // O5: keep the scheduler available but require an explicit opt-in.
      auto: archive.auto === true,
      lowDelayMs: countOf(archive.lowDelayMs, DEFAULT_ARCHIVE.lowDelayMs),
      midDelayMs: countOf(archive.midDelayMs, DEFAULT_ARCHIVE.midDelayMs),
      highDelayMs: countOf(archive.highDelayMs, DEFAULT_ARCHIVE.highDelayMs),
      holdMs: countOf(archive.holdMs, DEFAULT_HOLD_MS),
    },
  }
}

/** Truncated question length kept in the durable label. */
const LABEL_QUESTION_MAX = 40

/** Hard cap on child creation; the first prompt is accepted well before it. */
const CREATE_TIMEOUT_MS = 120_000

/**
 * The first user message of every guidance child. The inherited parent
 * history precedes it; the boundary between the two is this text, so the
 * model must not treat the inherited turns as its own task.
 */
const GUIDE_PREAMBLE = `The guidance conversation starts here.

Everything before this message is the inherited history of the parent conversation: what the user asked, what the coding agent did, and what is still open. Treat it as reference context, not as your task.

The user's question:`;

/** Structural, defensive reads: the services may be absent on other hosts. */
function serviceOf(ctx, name) {
  try {
    return ctx.get(name)
  } catch {
    return undefined
  }
}

/**
 * The official descriptor fold is preferred: it validates the versioned
 * payload and is the same rule the host uses. A standalone test (or a host
 * that resolves plugins differently) may not expose the package; identity only
 * needs the already-validated `mode`/`provider`, so a read-only fallback keeps
 * the panel usable without a second copy of the descriptor schema.
 */
async function loadFoldDescriptor() {
  try {
    const module = await import('@deepseek-ai/dsh-subagent')
    if (typeof module.foldSubagentDescriptor === 'function') return module.foldSubagentDescriptor
  } catch {
    // Plain Node tests and non-profile hosts do not resolve the host package.
  }
  return function minimalFoldDescriptor(events) {
    const event = Array.isArray(events)
      ? events.find(candidate => candidate?.type === 'subagent/descriptor')
      : undefined
    const data = event?.data
    if (data === null || typeof data !== 'object') return undefined
    if (data.mode !== 'continuable' && data.mode !== 'one-shot') return undefined
    if (typeof data.provider !== 'string') return undefined
    return { mode: data.mode, provider: data.provider }
  }
}

/**
 * Minimal host capability probe for the planned O6/O8 hooks.
 *
 * This only reads service shapes; it registers nothing and changes no
 * behaviour. Callers treat a missing service as "unsupported", not as a
 * reason to register a partial hook.
 * @param ctx - host plugin context.
 * @returns booleans for the services the hooks need.
 */
export function hostCompatibility(ctx) {
  const has = (name, method) => {
    const service = serviceOf(ctx, name)
    return service !== undefined && (method === undefined || typeof service[method] === 'function')
  }
  return {
    tools: has('tools'),
    sessions: has('sessions', 'get'),
    agents: has('agents', 'get'),
    sessionQuery: has('sessionQuery', 'observeSession'),
    subagents: has('subagents', 'startActivation'),
  }
}

/** One request-scoped body reader with a hard size cap. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        fail(new Error('request body is too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('request body is not valid JSON'))
      }
    })
    req.on('error', (error) => fail(error))
  })
}

/** Write one JSON response (headers once, no keep-alive games). */
function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

function writeOk(res, value) {
  writeJson(res, 200, { ok: true, value })
}

function writeError(res, status, message) {
  writeJson(res, status, { ok: false, error: { message } })
}

/**
 * The provider that gives a guidance child BOTH the parent's history and the
 * guidance preset.
 *
 * `prepareContinuable` mirrors the built-in fork provider: the seed is the
 * parent's log up to and including its last completed turn (an in-flight turn
 * is unbalanced and cannot be replayed as a valid child session). The two
 * capability flags are what let `startActivation` also carry an independent
 * `agentPreset`:
 *
 * - `capabilities.agentPreset` must be true (we support it);
 * - `inheritsParentContext` must be false — the service reads that flag ONLY
 *   to refuse an independent preset for a provider that composes its child
 *   from the parent context. This provider deliberately combines the two, so
 *   the flag is false while the seed is still supplied.
 */
export class GuideForkProvider {
  /** Registered provider name, resolved by `startActivation({ provider })`. */
  name

  /** Every start-time capability; only the preset flag is gated by the service. */
  capabilities = { agentOptions: true, agentPreset: true, outputSchema: true, depthLimit: true }

  /** See the class comment: the service only uses this for the preset gate. */
  inheritsParentContext = false

  constructor(name = GUIDE_PROVIDER) {
    this.name = name
  }

  /**
   * The balanced completed-turn prefix of the parent's live log.
   * @param request - `{ parent, sessionId, cwd, signal }` from the runtime.
   * @returns `{ seed }`, or `{}` before the parent has completed any turn.
   */
  prepareContinuable(request) {
    const events = request?.parent?.session?.snapshotEvents?.()
    if (!Array.isArray(events) || events.length === 0) return Promise.resolve({})
    let lastEnd = -1
    for (let index = 0; index < events.length; index++) {
      if (events[index]?.type === 'turn/end') lastEnd = index
    }
    return Promise.resolve(lastEnd >= 0 ? { seed: events.slice(0, lastEnd + 1) } : {})
  }
}

/** Durable label of one thread: the truncated question, prefixed. */
function guideLabel(question) {
  const flat = question.replace(/\s+/g, ' ').trim()
  const slice = flat.length > LABEL_QUESTION_MAX ? `${flat.slice(0, LABEL_QUESTION_MAX)}…` : flat
  return `${GUIDE_LABEL_PREFIX}${slice}`
}

// ── advisory-only enforcement ─────────────────────────────────────────────
// A guidance conversation is a RUNTIME subagent, so the runtime's settlement
// notices are addressed to the parent conversation. The first activation is
// ours (`delivery: 'caller'`, no notice), but once it settles the activation is
// released and the next follow-up cold-resumes with `delivery: 'parent'` — the
// settle then injects a "Background subagent …" message into the main
// conversation (or `inject`s it while the parent is closing). The parent is
// therefore shielded from exactly those notices; everything else is forwarded.
// The identity predicate lives in identity.js; the wrappers live in shield.js.

/**
 * Create one guidance child of `sessionId` and deliver its first prompt.
 * @param ctx - host plugin context.
 * @param presetId - agent preset the child is composed with.
 * @param payload - `{ sessionId, question }` from the panel.
 * @returns the child id the client opens in the right sidebar.
 */
async function startThread(ctx, presetId, limits, shield, identity, payload) {
  const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : ''
  const question = typeof payload?.question === 'string' ? payload.question.trim() : ''
  if (sessionId === '') throw new Error('缺少会话 id：无法确定要继承哪一个会话的上下文')
  if (question === '') throw new Error('缺少问题：请先写下你想让指导对话判断什么')
  const agents = serviceOf(ctx, 'agents')
  if (typeof agents?.get !== 'function') throw new Error('会话服务不可用，暂时无法创建指导对话')
  const parent = agents.get(sessionId)
  if (parent === undefined || parent === null) {
    throw new Error('当前会话不在运行状态：先在主对话里发一条消息，再创建指导对话')
  }
  const subagents = serviceOf(ctx, 'subagents')
  if (typeof subagents?.startActivation !== 'function') {
    throw new Error('子会话服务不可用：当前部署没有挂载 subagent runtime')
  }
  const admission = serviceOf(ctx, 'guideAdmission')
  if (typeof admission?.assertAvailable !== 'function') throw new Error('名额服务不可用，暂时无法启动指导')
  // Advisory early rejection only; the Host service rechecks at native reserve.
  admission.assertAvailable(parent)
  let started
  try {
    const label = guideLabel(question)
    started = await subagents.startActivation({
      // Our own provider: parent seed + independent preset in one child.
      provider: GUIDE_PROVIDER,
      label,
      request: {
        parent,
        agentPreset: presetId,
        prompt: [{ type: 'text', text: `${GUIDE_PREAMBLE}\n${question}` }],
      },
      signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
      // The guidance conversation is not a task the parent waits for: no
      // completion notice is delivered into the main conversation.
      delivery: 'caller',
    })
  } catch (error) {
    if (error?.admissionReason) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (/preset/iu.test(message)) {
      throw new Error(`指导 preset「${presetId}」无法挂载：${message}`)
    }
    if (/subagent limit reached|active child limit/iu.test(message)) {
      throw new Error(`子代理名额已满（上限 ${serviceOf(ctx, 'guideAdmission')?.state()?.capacity ?? '未知'}）：先等一个子代理结束再试`)
    }
    throw error
  }
  const label = guideLabel(question)
  // Never let the settled activation surface as an unhandled rejection; the
  // child stays resident and is reached through the subagent prompt route.
  if (typeof started?.result?.catch === 'function') started.result.catch(() => {})
  if (typeof started?.childId !== 'string' || started.childId === '') {
    throw new Error('子会话创建失败：宿主没有返回 childId')
  }
  // Register the child BEFORE anything can settle: the guard keys off this
  // set, and the parent must already be shielded when the first cold-resumed
  // continuation finishes.
  identity.remember(started.childId, sessionId)
  shield.shieldParent(parent, started.childId)
  // Pin the durable session title to the same label the descriptor carries.
  // The panel reads the label off the parent's subagent catalog, while other
  // surfaces (the session list, the tab chip) read the title — one label for
  // both keeps the thread recognisable everywhere.
  try {
    const child = agents.get(started.childId)
    const titles = serviceOf(ctx, 'sessionTitle')
    if (child?.session !== undefined && typeof titles?.rename === 'function') {
      titles.rename(child.session, label)
    }
  } catch {
    // A host without the title service keeps the auto-generated title.
  }
  return { childId: started.childId, label, parentSessionId: sessionId }
}

/** Dispatch one POST under the API prefix. */
async function dispatch(ctx, presetId, limits, shield, identity, projection, foldDescriptor, compatibility, req, res) {
  const connection = serviceOf(ctx, 'connection')
  const rejection = typeof connection?.requestRejection === 'function'
    ? connection.requestRejection(req)
    : undefined
  if (rejection !== undefined) {
    writeError(res, typeof rejection === 'number' ? rejection : 403, 'forbidden')
    return
  }
  if (req.method !== 'POST') {
    writeError(res, 405, 'method not allowed')
    return
  }
  const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
  if (!pathname.startsWith(`${ROUTE_PREFIX}/`)) {
    writeError(res, 404, 'unknown method')
    return
  }
  const method = pathname.slice(ROUTE_PREFIX.length + 1)
  if (method.includes('/')) {
    writeError(res, 404, 'unknown method')
    return
  }
  try {
    const payload = await readJsonBody(req)
    if (method === 'ping') {
      // Health check for the panel: proves THIS host half is loaded and
      // reachable before the user types a question.
      writeOk(res, { service: 'guide-panel', version: 2, panelCompat: compatibility() })
      return
    }
    if (method === 'state') {
      // Capacity, archive policy, O6 projection and O8 shield status for the
      // client. `modelProjection` is `unsupported` until the tools hook is
      // registered on a host that carries the tools service.
      const adapter = serviceOf(ctx, 'guideGoalAdapter')
      let goalAdapter = { mode: 'absent', reason: null }
      try { goalAdapter = adapter?.getState?.() ?? goalAdapter } catch {}
      const archiveCandidates = compatibility().writable ? await inspectCandidates(ctx, payload?.candidates, foldDescriptor) : {}
      const admission = serviceOf(ctx, 'guideAdmission')
      let capacityState = { mode: 'unsupported', reason: 'admission-service-unavailable', allowed: false, capacity: null }
      try { capacityState = admission?.state(payload) ?? capacityState } catch { capacityState.reason = 'admission-state-failed' }
      writeOk(res, {
        ...limits,
        capacity: capacityState.capacity,
        reserve: capacityState.reserve,
        maxGuides: capacityState.maxGuides,
        admission: capacityState,
        archiveCandidates,
        panelCompat: compatibility(),
        goalAdapter,
        settlementShield: shield.getState(),
        modelProjection: projection.getState(),
      })
      return
    }
    if ((method === 'start' || method === 'auto-archive') && !compatibility().writable) {
      writeError(res, 503, '指导面板暂不可用，请重启宿主或恢复支持的版本')
      return
    }
    if (method === 'auto-archive') {
      writeOk(res, await autoArchive(ctx, payload, foldDescriptor))
      return
    }
    if (method === 'start') {
      writeOk(res, await startThread(ctx, presetId, limits, shield, identity, payload))
      return
    }
    writeError(res, 404, `unknown method "${method}"`)
  } catch (error) {
    writeError(res, 400, error instanceof Error ? error.message : String(error))
  }
}

/** Host plugin body: the subagent provider plus one fenced JSON route. */
export async function apply(ctx, config = {}, sourceProof) {
  const proof = sourceProof ?? await loadHostContracts({ client: true })
  const foldDescriptor = proof.foldDescriptor ?? await loadFoldDescriptor()
  let compatibilityContext = ctx
  const compatibility = () => panelCompatibility(compatibilityContext, proof)
  ctx.provide('guidePanelCompatibility', { getState: compatibility })
  const hideGuidance = config?.model?.hideGuidance !== false
  let projectionSource
  let projectionSourceError
  if (hideGuidance) {
    try {
      projectionSource = await loadModelProjectionSource()
    } catch (error) {
      projectionSourceError = error
    }
  }
  const presetId = typeof config?.agentPreset === 'string' && config.agentPreset !== ''
    ? config.agentPreset
    : GUIDE_PRESET
  const limits = resolveLimits(config)
  // The identity reader lazily resolves services so a late-mounted sessions /
  // sessionQuery service is picked up without rebuilding the activation.
  const identity = createIdentity({
    sessions: { get: (id) => serviceOf(ctx, 'sessions')?.get?.(id) },
    agents: { get: (id) => serviceOf(ctx, 'agents')?.get?.(id) },
    sessionQuery: {
      observeSession: (id, options) => serviceOf(ctx, 'sessionQuery')?.observeSession?.(id, options),
    },
    foldDescriptor,
  })
  // O8 belongs to a separate Host fiber. Panel/provider HMR only replaces
  // this facade; it never retires the service's parent wrappers.
  const shield = {
    shieldParent: (parent, childId) => {
      const hostShield = serviceOf(ctx, 'guideSettlementShield')
      if (typeof childId === 'string') hostShield?.rememberChild(childId, parent)
      else hostShield?.shieldParent(parent)
    },
    getState: () => serviceOf(ctx, 'guideSettlementShield')?.getState()
      ?? { mode: 'off', reason: 'host-service-unavailable', inject: false },
  }
  ctx.effect(() => () => identity.clear(), 'guide-panel: projection identity')
  // O6 decorates the original model-facing tool definitions before they enter
  // the registry. The observer is installed only after the tools and agents
  // services exist; without the verified first-party source the state is
  // `unsupported`, never a silent "active".
  const projection = createModelProjection({
    identity,
    source: projectionSource,
    sourceError: projectionSourceError,
    hideGuidance,
    blockControl: config?.model?.blockControl !== false,
    logger: ctx.logger,
  })
  ctx.inject(['tools', 'agents'], (injected) => {
    if (serviceOf(injected, 'tools') === undefined || serviceOf(injected, 'agents') === undefined) return
    injected.effect(() => projection.start(injected), 'guide-panel: model projection')
    if (typeof injected.logger?.info === 'function') {
      injected.logger.info(`guide-panel: model projection ${projection.getState().mode}`)
    }
  })
  if (limits.archive.holdMs < limits.archive.highDelayMs && typeof ctx.logger?.warn === 'function') {
    ctx.logger.warn(`guide-panel: archive.holdMs ${limits.archive.holdMs} is below highDelayMs ${limits.archive.highDelayMs}; the high band will not hold after pressure drops`)
  }
  // The provider must exist before the route serves a start request; both are
  // owned by this plugin's effect scope, so an unload removes them together.
  ctx.inject(['subagents', 'agents', 'sessions', 'sessionQuery', 'guideAdmission', 'workspaceRegistry', 'connection', 'webServer', 'sessionTitle'], (injected) => {
    compatibilityContext = injected
    if (!compatibility().writable) { injected.logger?.warn?.(`guide-panel preflight: ${JSON.stringify(compatibility())}`); return }
    const subagents = serviceOf(injected, 'subagents')
    if (typeof subagents?.registerProvider !== 'function') return
    injected.effect(() => {
      try {
        return subagents.registerProvider(new GuideForkProvider())
      } catch (error) {
        // A hot-reloaded fiber can briefly overlap the previous one. The name
        // is this plugin's own, so the surviving registration is the same
        // provider and reusing it is safe.
        if (String(error instanceof Error ? error.message : error).includes('already registered')) {
          if (typeof injected.logger?.warn === 'function') {
            injected.logger.warn(`guide-panel: subagent provider "${GUIDE_PROVIDER}" is already registered; reusing it`)
          }
          return () => {}
        }
        throw error
      }
    }, 'guide-panel: fork provider with an independent preset')
    if (typeof injected.logger?.info === 'function') {
      injected.logger.info(`guide-panel: subagent provider "${GUIDE_PROVIDER}" registered (preset "${presetId}")`)
    }
  })
  ctx.inject(['webServer', 'connection'], (injected) => {
    const webServer = serviceOf(injected, 'webServer')
    if (typeof webServer?.register !== 'function' || typeof serviceOf(injected, 'connection')?.requestRejection !== 'function') return
    injected.effect(() => webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: (req, res) => {
        void dispatch(injected, presetId, limits, shield, identity, projection, foldDescriptor, compatibility, req, res)
      },
    }), 'guide-panel: /guide/api routes')
    if (typeof injected.logger?.info === 'function') {
      injected.logger.info(`guide-panel: ${ROUTE_PREFIX} routes registered`)
    }
  })
}

// Runs only inside the isolated deterministic Host fixture.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createIdentity } from '../identity.js'

export async function runLifecycleMatrix(ctx, h) {
  console.error('[O2 matrix] entered')
  const { rootAgent, gates, entered, until, assert, controller, handles } = h
  const checks = []
  const check = (value, label) => { assert(value, `O2: ${label}`); checks.push(label) }
  const manager = ctx.subagents.manager
  const notices = [], edges = []
  const originalNotify = manager.notifySettlement
  manager.notifySettlement = function (activation, terminal) {
    try {
      notices.push({ child: activation.childId, delivery: activation.delivery,
        exactParent: ctx.get('agents').get(activation.parent.id) === activation.parent,
        closing: this.closingTeardownFor(activation.parent) !== undefined,
        childLive: ctx.get('agents').get(activation.childId) !== undefined,
        sessionLive: ctx.get('sessions').get(activation.childId) !== undefined })
    } catch (error) { notices.push({ child: activation.childId, inspectionError: String(error) }) }
    return originalNotify.call(this, activation, terminal)
  }
  const unlisten = ctx.on('agent/disposed', ({ agent }) => edges.push({ type: 'disposed', id: agent.id }), { global: true })
  function sources(value, sender) {
    if (!value || typeof value !== 'object') return false
    if (value.kind === 'subagent-settled' && value.senderSessionId === sender) return true
    return Object.values(value).some(item => sources(item, sender))
  }
  const hasNotice = (parent, id) => sources(parent.session.snapshotEvents(), id)
  async function stable(parent) {
    await until(() => parent.status === 'idle', `O2 parent idle: ${parent.id}`)
    await new Promise(resolve => setImmediate(resolve))
    await ctx.sessions.flush(parent.session)
  }
  async function start(parent, provider = 'guide-fork', delivery = 'parent', hold = true) {
    entered.delete('o8'); gates.set('o8', Promise.withResolvers())
    const receipt = await ctx.subagents.startActivation({ provider, delivery,
      label: provider === 'guide-fork' ? '指导: O2 lifecycle' : 'O2 ordinary work', signal: controller.signal,
      request: { parent, prompt: [{ type: 'text', text: hold ? 'LI_O8_HOLD' : 'O2 immediate completion' }],
        cwd: process.cwd(), maxDepth: 1, agentOptions: { provider: 'li-deterministic', model: 'mock' },
        ...(provider === 'guide-fork' ? { agentPreset: 'guide' } : {}) } })
    if (hold) await until(() => entered.has('o8'), 'O2 child entered deterministic model')
    return receipt
  }
  async function finish(parent, receipt, method) {
    const seq = parent.session.seq
    gates.get('o8').resolve()
    await Promise.race([receipt.result, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`O2 child result timeout; notices=${JSON.stringify(notices.slice(-3))}; child=${ctx.agents.get(receipt.childId)?.status}; parent=${parent.status}`)), 7000)
      receipt.result.finally(() => clearTimeout(timer)).catch(() => {})
    })])
    console.error(`[O2 matrix] ${method}: child result received`)
    await stable(parent)
    const notice = notices.findLast(item => item.child === receipt.childId)
    check(notice?.delivery === 'parent' && notice.exactParent, `${method}: real notifySettlement reached`)
    check(notice.childLive === false && notice.sessionLive === false, `${method}: child and Session detached before notification`)
    check(edges.some(item => item.id === receipt.childId), `${method}: disposal edge observed`)
    check(!hasNotice(parent, receipt.childId) && parent.session.seq === seq && !parent.inbox.hasPending,
      `${method}: no parent history or inbox pollution`)
    const observation = await ctx.sessionQuery.observeSession(parent.id)
    try { check(!sources(observation.events, receipt.childId), `${method}: persisted observation has no guide notice`) }
    finally { observation[Symbol.dispose]() }
  }
  const methods = []
  function watch(parent) {
    for (const method of ['followup', 'steer', 'inject']) {
      const previous = parent[method]
      parent[method] = function (input) {
        if (input?.source?.kind === 'subagent-settled') methods.push({ method, child: input.source.senderSessionId })
        return Reflect.apply(previous, this, arguments)
      }
    }
  }
  const statePath = process.env.DSH_O2_STATE
  try {
    if (process.env.DSH_O2_PHASE === 'restart') {
      const stored = JSON.parse(readFileSync(statePath, 'utf8'))
      const restored = await ctx.agents.resume({ resumeSessionId: stored.parent,
        agentOptions: { provider: 'li-deterministic', model: 'mock' },
        setup: async childCtx => { await ctx.agentPresets.mount(childCtx, 'guide') } })
      handles.add(restored)
      const parent = restored.agent
      check(parent.id === stored.parent, 'Host restart restores the persisted parent')
      const before = parent.session.seq
      await ctx.subagents.prompt({ parentSessionId: parent.id, childSessionId: stored.guide,
        mode: 'continuable', requestId: `o2-restart-${Date.now()}`, delivery: 'queue',
        content: [{ type: 'text', text: 'O2 immediate cold completion' }] }, controller.signal)
      await until(() => notices.some(item => item.child === stored.guide), 'O2 restart cold settlement')
      await stable(parent)
      check(parent.session.seq === before && !hasNotice(parent, stored.guide) && !parent.inbox.hasPending,
        'Host restart: immediate cold guide settlement is shielded')
      await finish(parent, await start(parent, 'guide-fork', 'parent', false), 'Host restart new guidance')
      const work = await start(parent, 'spawn', 'parent', false)
      gates.get('o8').resolve(); await work.result; await stable(parent)
      check(hasNotice(parent, work.childId), 'Host restart: ordinary work still enters history')
      return { status: 'passed', checks, notices, methods }
    }

    console.error('[O2 matrix] creating parent')
    const root = await rootAgent(), parent = root.agent
    console.error('[O2 matrix] starting guide')
    let guide = await start(parent)
    const retiredActivation = manager.resident.get(guide.childId)
    console.error('[O2 matrix] finishing idle guide')
    watch(parent)
    await finish(parent, guide, 'idle followup')
    check(methods.some(item => item.child === guide.childId && item.method === 'followup'), 'idle notification uses followup')

    // Force the persistence observation path: no live Session or hint supplied.
    const { foldSubagentDescriptor } = await import(pathToFileURL(join(dirname(process.execPath),
      'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-subagent/lib/index.js')).href)
    let observed = 0, released = 0
    const query = { async observeSession(id, options) {
      observed++
      const lease = await ctx.get('sessionQuery').observeSession(id, options)
      return { header: lease.header, inheritedEventCount: lease.inheritedEventCount, events: lease.events,
        [Symbol.dispose]() { released++; lease[Symbol.dispose]() } }
    } }
    const reader = createIdentity({ foldDescriptor: foldSubagentDescriptor, sessionQuery: query })
    check(ctx.sessions.get(guide.childId) === undefined && await reader.isGuideId(guide.childId) === true,
      'persisted guide is identified through real asynchronous observation')
    check(observed === 1 && released === 1, 'real observation lease is released exactly once')
    const parentReader = createIdentity({ foldDescriptor: foldSubagentDescriptor, sessionQuery: query })
    check(await parentReader.parentOf(guide.childId) === parent.id && observed === 2 && released === 2,
      'parentOf uses and releases a real persisted observation')
    reader.clear(); parentReader.clear()

    const work = await start(parent, 'spawn')
    gates.get('o8').resolve(); await work.result; await stable(parent)
    check(hasNotice(parent, work.childId), 'ordinary idle sibling settlement enters parent history')

    guide = await start(parent)
    entered.delete('parent'); gates.set('parent', Promise.withResolvers())
    parent.followup({ id: `o2-busy-${Date.now()}`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'LI_PARENT_HOLD' }] })
    await until(() => entered.has('parent'), 'O2 busy parent entered')
    gates.get('o8').resolve(); await guide.result
    check(methods.some(item => item.child === guide.childId && item.method === 'steer'), 'busy notification uses steer')
    check(!parent.inbox.hasPending && !hasNotice(parent, guide.childId), 'busy guide notification is shielded')
    gates.get('parent').resolve(); await stable(parent)

    // New parent, actual runtime scoped teardown, guide and ordinary positive control.
    const closingRoot = await rootAgent(), closingParent = closingRoot.agent
    const closingGuide = await start(closingParent)
    watch(closingParent)
    // Keep both children on the same unresolved model gate.
    const closingWork = await ctx.subagents.startActivation({ provider: 'spawn', delivery: 'parent', label: 'O2 closing work',
      signal: controller.signal, request: { parent: closingParent, prompt: [{ type: 'text', text: 'LI_O8_HOLD' }],
        cwd: process.cwd(), maxDepth: 1, agentOptions: { provider: 'li-deterministic', model: 'mock' } } })
    await ctx.subagents.drainDescendants([closingParent])
    await Promise.all([closingGuide.result, closingWork.result])
    check(notices.some(item => item.child === closingGuide.childId && item.closing && !item.childLive && !item.sessionLive),
      'real closing teardown reaches notifySettlement after child removal')
    check(methods.some(item => item.child === closingGuide.childId && item.method === 'inject'), 'real closing chooses inject')
    check(!hasNotice(closingParent, closingGuide.childId)
      && !sources([closingParent.inbox.nextTurn, closingParent.inbox.nextStep], closingGuide.childId), 'closing guide stays out of history and inbox')
    check(sources([closingParent.inbox.nextTurn, closingParent.inbox.nextStep], closingWork.childId), 'closing ordinary sibling is retained in inbox')
    gates.get('o8').resolve()
    await closingRoot.dispose(); handles.delete(closingRoot)

    // Run the installed HMR transaction over a disposable copy of panel code.
    // The injected async apply pause opens the actual old-unload/new-apply gap.
    const hmrRoot = await rootAgent(), hmrParent = hmrRoot.agent
    const hmrGuide = await start(hmrParent)
    const hostShield = ctx.get('guideSettlementShield')
    const parentWrapper = hmrParent.inject
    const panelEntry = [...ctx.get('loader').entries()].find(entry => entry.options.name === '@local/dsh-guide-panel')
    const oldFiber = panelEntry.fiber
    const filename = join(process.env.DSH_O2_PANEL_COPY, 'index.js')
    const originalSource = readFileSync(filename, 'utf8')
    const marker = join(process.env.DSH_O2_PANEL_COPY, `hmr-gap-${Date.now()}.txt`)
    const releaseMarker = `${marker}.release`
    const pausedSource = originalSource.replace('export async function apply(ctx, config = {}) {',
      `export async function apply(ctx, config = {}) {\n  const o2Fs = await import('node:fs');\n  o2Fs.writeFileSync(${JSON.stringify(marker)}, 'new-apply');\n  const o2Deadline = Date.now() + 15000;\n  while (!o2Fs.existsSync(${JSON.stringify(releaseMarker)})) {\n    if (Date.now() > o2Deadline) throw new Error('O2 HMR gate timeout');\n    await new Promise(resolve => setTimeout(resolve, 10));\n  }`)
    let reloadError
    let removeReloadListener
    try {
      writeFileSync(filename, pausedSource)
      const hmr = ctx.get('hmr')
      let reloadEvent = false
      removeReloadListener = ctx.on('hmr/reload', () => { reloadEvent = true }, { global: true })
      const reload = hmr.runReload(async () => {
        hmr.stashed.add(pathToFileURL(filename).href)
        await hmr.partialReload()
      }).catch(error => { reloadError = error })
      await until(() => existsSync(marker) || reloadError, 'O2 HMR enters new async apply', 15000)
      if (reloadError) throw reloadError
      check(panelEntry.fiber !== oldFiber && ctx.get('guideSettlementShield') === hostShield,
        'real panel HMR replaces panel fiber while Host shield stays mounted')
      await finish(hmrParent, hmrGuide, 'settlement during real HMR apply gap')
      check(!existsSync(releaseMarker), 'guide settled before the new panel apply was allowed to complete')
      writeFileSync(releaseMarker, 'continue')
      await reload
      if (reloadError) throw reloadError
      check(reloadEvent && hmrParent.inject === parentWrapper, 'HMR completed without replacing the Host-owned wrapper')
      await finish(hmrParent, await start(hmrParent), 'new guidance after HMR')
    } finally {
      removeReloadListener?.()
      writeFileSync(releaseMarker, 'continue')
      writeFileSync(filename, originalSource)
    }

    // Dispose and restore the exact durable parent; resume its existing guide.
    await stable(parent)
    const oldParent = parent
    await root.dispose(); handles.delete(root)
    const rebuilt = await ctx.agents.resume({ resumeSessionId: oldParent.id,
      agentOptions: { provider: 'li-deterministic', model: 'mock' },
      setup: async childCtx => { await ctx.agentPresets.mount(childCtx, 'guide') } })
    handles.add(rebuilt)
    check(rebuilt.agent !== oldParent && rebuilt.agent.id === oldParent.id, 'parent rebuild creates a new object with the same durable ID')
    manager.notifySettlement(retiredActivation, { output: [], stopReason: 'end_turn' })
    check(notices.at(-1).exactParent === false && !rebuilt.agent.inbox.hasPending,
      'real Runtime exact-parent guard drops a retired activation after parent rebuild')
    const before = rebuilt.agent.session.seq
    const previousCount = notices.filter(item => item.child === guide.childId).length
    await ctx.subagents.prompt({ parentSessionId: rebuilt.agent.id, childSessionId: guide.childId,
      mode: 'continuable', requestId: `o2-rebuild-${Date.now()}`, delivery: 'queue',
      content: [{ type: 'text', text: 'O2 immediate cold completion' }] }, controller.signal)
    await until(() => notices.filter(item => item.child === guide.childId).length > previousCount, 'O2 rebuilt parent cold settlement')
    await stable(rebuilt.agent)
    check(rebuilt.agent.session.seq === before && !hasNotice(rebuilt.agent, guide.childId) && !rebuilt.agent.inbox.hasPending,
      'rebuilt parent: immediate cold guide settlement is shielded')
    const prepared = await start(rebuilt.agent, 'guide-fork', 'caller', false)
    await prepared.result
    await stable(rebuilt.agent)
    writeFileSync(statePath, JSON.stringify({ parent: rebuilt.agent.id, guide: prepared.childId }, null, 2))
    return { status: 'passed', checks, notices, methods, restartState: JSON.parse(readFileSync(statePath, 'utf8')) }
  } finally {
    manager.notifySettlement = originalNotify
    unlisten()
  }
}

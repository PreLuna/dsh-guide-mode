// Installed only in the isolated smoke profile. No external model or user data.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
export const name = 'guide-goal-real-runtime-fixture'
export const inject = ['llm', 'agents', 'sessions', 'sessionQuery', 'goals', 'subagents', 'agentPresets', 'webServer', 'connection', 'workspaceRegistry', 'tools']

export function apply(ctx) {
  let state = { status: 'starting', assertions: [] }
  let restoreCompatibility
  const gates = new Map()
  const entered = new Set()
  const controller = new AbortController()
  const rounds = new Map()
  const lastRoundSource = new Map()
  const humanMessages = new Set()
  const guideSettlements = []
  const errors = []
  const handles = new Set()
  const toolNotifications = new Map()
  ctx.on('tools/result', (exec, result) => {
    const previous = toolNotifications.get(exec.callId) ?? []
    previous.push({ name: exec.name, agentId: exec.agent?.id, result })
    toolNotifications.set(exec.callId, previous)
  }, { global: true })
  const adapterState = () => ctx.get('guideGoalAdapter')?.getState() ?? { mode: 'absent' }
  ctx.on('agent/error', ({ error }) => errors.push(String(error?.message ?? error)))
  ctx.on('session/event', (session, event) => {
    const message = event.data.message ?? event.data
    if (event.type === 'user/message' && message.source?.kind === 'goal') {
      rounds.set(session.id, (rounds.get(session.id) ?? 0) + 1)
      lastRoundSource.set(session.id, message.source)
    }
    if (event.type === 'user/message' && message.id?.startsWith('li-human-')) humanMessages.add(message.id)
    if (event.type === 'user/message' && message.source?.kind === 'subagent-settled') {
      guideSettlements.push({ session: session.id, sender: message.source.senderSessionId })
    }
  })
  const adapter = {
    providerInfo: id => ({ id, name: 'Isolated deterministic model' }),
    providerRetryPolicy() {},
    listModels: async () => [{ id: 'mock', name: 'mock' }],
    resolveModel: async (provider, id) => ({ provider, id, name: id }),
    async prepareCall(provider, id) { return { model: await this.resolveModel(provider, id), stream: options => this.stream(options) } },
    async *stream(options) {
      const text = options.messages.flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')
      const nativePattern = /LI_O6_NATIVE_(LIST|SEND|INTERRUPT)(?: ([0-9a-f-]{36}))?/
      const nativeUser = [...options.messages].reverse().find(message => {
        if (message.role !== 'user' || !Array.isArray(message.content)) return false
        return message.content.some(block => block.type === 'text' && nativePattern.test(block.text))
      })
      const nativeText = Array.isArray(nativeUser?.content)
        ? nativeUser.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
        : ''
      const native = nativePattern.exec(nativeText)
      if (native) {
        const lastUserIndex = options.messages.lastIndexOf(nativeUser)
        const afterUser = options.messages.slice(lastUserIndex + 1)
        const hasToolResult = afterUser.some(message => message.role === 'tool')
        if (!hasToolResult) {
          const kind = native[1]
          const callId = `li-native-${kind.toLowerCase()}-${Date.now()}`
          const name = kind === 'LIST' ? 'list_agents' : kind === 'SEND' ? 'send_message' : 'interrupt_agent'
          const args = kind === 'LIST'
            ? { scope: 'children' }
            : kind === 'SEND' ? { agent_id: native[2], message: 'native O6 probe' } : { agent_id: native[2] }
          yield { type: 'block-start', index: 0, blockType: 'tool-call' }
          yield { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: JSON.stringify(args) }
          yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) } }
          yield { type: 'finish', reason: { kind: 'stop' } }
          return
        }
        yield { type: 'text-delta', index: 0, text: 'Native O6 turn complete.' }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      const ptcPattern = /LI_O6_PTC_(LIST|SEND|INTERRUPT)(?: ([0-9a-f-]{36}))?/
      const ptcUser = [...options.messages].reverse().find(message => {
        if (message.role !== 'user' || !Array.isArray(message.content)) return false
        return message.content.some(block => block.type === 'text' && ptcPattern.test(block.text))
      })
      const ptcText = Array.isArray(ptcUser?.content)
        ? ptcUser.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
        : ''
      const ptc = ptcPattern.exec(ptcText)
      if (ptc) {
        const lastPtcIndex = options.messages.lastIndexOf(ptcUser)
        const afterPtc = options.messages.slice(lastPtcIndex + 1)
        if (!afterPtc.some(message => message.role === 'tool')) {
          const kind = ptc[1]
          const callId = `li-ptc-${kind.toLowerCase()}-${Date.now()}`
          const code = kind === 'LIST'
            ? "const rows = await tools.list_agents({ scope: 'children' })\nreturn rows"
            : `try {
  await tools.${kind === 'SEND' ? 'send_message' : 'interrupt_agent'}({ agent_id: '${ptc[2]}'${kind === 'SEND' ? ", message: 'PTC O6 probe'" : ''} })
  return { sent: true }
} catch (error) {
  return { denied: String(error && error.message) }
}`
          const args = { code, description: kind === 'LIST' ? 'List subagents through PTC' : 'Probe guidance control through PTC' }
          yield { type: 'block-start', index: 0, blockType: 'tool-call' }
          yield { type: 'tool-call-delta', index: 0, id: callId, name: 'run_code', argumentsDelta: JSON.stringify(args) }
          yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name: 'run_code', arguments: JSON.stringify(args) } }
          yield { type: 'finish', reason: { kind: 'stop' } }
          return
        }
        yield { type: 'text-delta', index: 0, text: 'PTC O6 turn complete.' }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      const tag = text.includes('LI_PARENT_HOLD') ? 'parent' : text.includes('LI_WORK_HOLD') ? 'worker' : text.includes('LI_GUIDE_HOLD') ? 'guide' : text.includes('LI_O8_HOLD') ? 'o8' : text.includes('LI_O6WORK_HOLD') ? 'o6work' : text.includes('LI_O6GUIDEWORK_HOLD') ? 'o6guidework' : text.includes('LI_O6_HOLD') ? 'o6' : text.includes('LI_PTCGUIDE_HOLD') ? 'ptcguide' : text.includes('LI_PTCWORK_HOLD') ? 'ptcwork' : undefined
      if (tag && gates.has(tag)) {
        entered.add(tag)
        await Promise.race([gates.get(tag).promise, new Promise((_, reject) => {
          if (options.signal?.aborted) return reject(options.signal.reason)
          options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true })
        })])
      }
      yield { type: 'text-delta', index: 0, text: 'Isolated runtime check complete.' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  ctx.llm.registerAdapter(['li-deterministic'], adapter)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: '/li-runtime', handler(req, res) {
      const rejection = ctx.connection.requestRejection(req)
      const command = new URL(req.url, 'http://li.test').pathname.split('/').at(-1)
      if (!rejection && req.method === 'POST' && ['compat-disable','compat-restore'].includes(command)) {
        req.resume()
        if(command==='compat-disable') {
          const target=ctx.subagents[Symbol.for('cordis.original')]??ctx.subagents
          const descriptor=Object.getOwnPropertyDescriptor(target,'startActivation')
          restoreCompatibility=()=>{if(descriptor)Object.defineProperty(target,'startActivation',descriptor);else delete target.startActivation}
          target.startActivation=undefined
        } else {restoreCompatibility?.();restoreCompatibility=undefined}
        res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true}));return
      }
      if (!rejection && req.method === 'POST' && ['add-guide', 'auto-guide', 'auto-work'].includes(command)) {
        req.resume()
        const parent = ctx.agents.get(command === 'add-guide' ? state.parent : state.autoParent)
        child(parent, command === 'auto-work' ? 'spawn' : 'guide-fork', command === 'auto-work' ? 'work' : 'guide')
          .then(receipt => {
            receipt.result.catch(() => {})
            res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ childId: receipt.childId }))
          }, error => { res.writeHead(400); res.end(JSON.stringify({ error: String(error) })) })
        return
      }
      res.writeHead(rejection ?? 200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(rejection ? { error: rejection } : { ...state, errors, adapter: adapterState() }))
    },
  }))
  async function until(predicate, label, timeout = 7000) {
    const deadline = Date.now() + timeout
    while (!predicate()) {
      controller.signal.throwIfAborted()
      if (Date.now() > deadline) throw new Error(`${label}: timeout; ${JSON.stringify({ errors, rounds: [...rounds] })}`)
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }
  const assert = (condition, label) => {
    if (!condition) throw new Error(label)
    state.assertions.push(label)
    if (process.env.DSH_O2_STATE && label.startsWith('O2:')) console.error(`[O2 fixture] ${label}`)
  }
  async function rootAgent({ ptc = false, workspaceCwd = process.cwd() } = {}) {
    const handle = await ctx.agents.create({
      sessionId: `li-runtime-parent-${Date.now()}`,
      agentOptions: { provider: 'li-deterministic', model: 'mock' },
      meta: { cwd: workspaceCwd },
      setup: async child => {
        await ctx.agentPresets.mount(child, 'guide')
        if (ptc) child.tools.presentAs('ptc')
      },
    })
    const workspace = await ctx.workspaceRegistry.create(workspaceCwd, 'Local injection tests')
    await workspace.attachSession(handle.agent.id)
    handles.add(handle)
    return handle
  }

  async function presetTimingProbe() {
    const id = `bp-fixed-custom-${Date.now()}`
    const unregister = await ctx.agentPresets.register({ id, name: id, plugins: [
      { id: 'list', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' },
      { id: 'control', name: '@deepseek-ai/dsh-tool-subagent-control' },
    ] })
    const targeted = new Set(), observations = []
    const inspect = (agent, phase) => {
      const names = ['list_agents', 'send_message', 'interrupt_agent']
      const functions = names.map(name => ctx.tools.get(name, agent)?.execute?.name)
      assert(functions[0] === 'listProjection' && functions.slice(1).every(name => name === 'controlProjection'),
        `B′ timing: ${phase} retains all registered wrappers`)
      observations.push({ phase, functions })
    }
    const unlisten = ctx.on('agent/created', async ({ agent }) => {
      if (!targeted.has(agent.id)) return
      inspect(agent, 'early-prepend-created')
      const result = await ctx.tools.execute({ name: 'list_agents', arguments: {}, agent,
        callId: `bp-fixed-first-${agent.id}`, signal: controller.signal })
      assert(result.isError !== true, 'B′ timing: early creation listener first tool call succeeds')
    }, { global: true, prepend: true })
    try {
      const presets = [...new Set([ctx.agentPresets.defaultId, 'guide', id])]
      for (const preset of presets) {
        let current
        try {
          current = await ctx.agents.create({ sessionId: `bp-fixed-${Date.now()}-${Math.random()}`,
            meta: { cwd: process.cwd() }, agentOptions: { provider: 'li-deterministic', model: 'mock' },
            setup: async (child, agent) => {
              targeted.add(agent.id)
              await ctx.agentPresets.mount(child, preset)
              for (let i = 0; i < 4; i++) await Promise.resolve()
              inspect(agent, `${preset}: setup-after-microtasks`)
            } })
          inspect(current.agent, `${preset}: after-create`)
        } finally { await current?.dispose() }
      }
      return { status: 'passed', presets, observations }
    } finally { unlisten(); unregister() }
  }
  async function child(parent, provider, tag, { maxDepth = 1 } = {}) {
    return ctx.subagents.startActivation({ provider, delivery: 'caller', label: provider === 'guide-fork' ? `指导: LI ${tag}` : `LI ${tag}`, signal: controller.signal,
      request: { parent, prompt: [{ type: 'text', text: `LI_${tag.toUpperCase()}_HOLD` }], cwd: process.cwd(),
        maxDepth, agentOptions: { provider: 'li-deterministic', model: 'mock' },
        ...(provider === 'guide-fork' ? { agentPreset: 'guide' } : {}) },
    })
  }

  async function nativeTurn(parent, text) {
    const before = parent.session.seq
    const id = `li-native-user-${Date.now()}-${Math.random().toString(16).slice(2)}`
    parent.followup({ id, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] })
    await until(() => parent.session.snapshotEvents().slice(before).some(event => event.type === 'turn/end')
      && parent.status === 'idle', `native turn: ${text}`, 15_000)
    return parent.session.snapshotEvents().slice(before)
  }

  function toolResultOf(events) {
    const event = events.filter(candidate => candidate.type === 'tool/result').at(-1)
    const message = event?.data?.message ?? event?.data
    const content = Array.isArray(message?.content)
      ? message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
      : ''
    const call = events.filter(candidate => candidate.type === 'tool/call').at(-1)
    const notifications = toolNotifications.get(call?.data?.callId) ?? []
    assert(notifications.length === 1, 'O6 pipeline: one tools/result notification per model call')
    assert(JSON.stringify(notifications[0]?.result?.content) === JSON.stringify(message?.content)
      && notifications[0]?.result?.isError === message?.isError,
    'O6 pipeline: notification content/error matches persisted session result')
    return { event, message, content }
  }

  /** Native model -> real tool-call -> session tool/result, including control denial. */
  async function nativeProbe(parent, guide, worker) {
    const guideAgent = ctx.agents.get(guide.childId)
    const pendingBefore = guideAgent?.inbox.hasPending

    const listEvents = await nativeTurn(parent, 'LI_O6_NATIVE_LIST')
    const listCall = listEvents.find(event => event.type === 'tool/call')
    const list = toolResultOf(listEvents)
    assert(listCall?.data?.name === 'list_agents', 'native O6: model emitted a real list_agents call')
    assert(list.message?.isError !== true, 'native O6: list_agents result is not an error')
    assert(!list.content.includes(guide.childId), 'native O6: session tool/result hides guidance')
    assert(list.content.includes(worker.childId), 'native O6: session tool/result keeps ordinary work')

    const sendEvents = await nativeTurn(parent, `LI_O6_NATIVE_SEND ${guide.childId}`)
    const sendCall = sendEvents.find(event => event.type === 'tool/call')
    const send = toolResultOf(sendEvents)
    assert(sendCall?.data?.name === 'send_message', 'native O6: model emitted a real send_message call')
    assert(send.message?.isError === true, 'native O6: control denial is a tool error')
    assert(send.content.includes('Guidance conversations'), 'native O6: control denial reaches the model')
    if (guideAgent !== undefined) {
      assert(guideAgent.inbox.hasPending === pendingBefore, 'native O6: denied send has no inbox side effect')
    }
    const interruptEvents = await nativeTurn(parent, `LI_O6_NATIVE_INTERRUPT ${guide.childId}`)
    const interruptCall = interruptEvents.find(event => event.type === 'tool/call')
    const interrupt = toolResultOf(interruptEvents)
    assert(interruptCall?.data?.name === 'interrupt_agent', 'native O6: model emitted a real interrupt_agent call')
    assert(interrupt.message?.isError === true && interrupt.content.includes('Guidance conversations'),
      'native O6: interrupt denial reaches the persisted model result')
    return { list: 'passed', send: 'passed', interrupt: 'passed' }
  }

  /** Actual PTC runtime: model -> run_code -> scheduler -> original definitions. */
  async function ptcProbe() {
    const ptcWorkspace = mkdtempSync(join(tmpdir(), 'dsh-ptc-o6-'))
    const handle = await rootAgent({ ptc: true, workspaceCwd: ptcWorkspace })
    const parent = handle.agent
    gates.set('ptcguide', Promise.withResolvers())
    gates.set('ptcwork', Promise.withResolvers())
    const guide = await child(parent, 'guide-fork', 'ptcguide')
    await until(() => entered.has('ptcguide'), 'PTC guide entered mock model')
    const worker = await child(parent, 'spawn', 'ptcwork')
    await until(() => entered.has('ptcwork'), 'PTC worker entered mock model')
    const guideAgent = ctx.agents.get(guide.childId)
    const pendingBefore = guideAgent?.inbox.hasPending
    for (const tag of ['ptcguide', 'ptcwork']) gates.get(tag).resolve()
    await Promise.allSettled([guide.result, worker.result])

    const listEvents = await nativeTurn(parent, 'LI_O6_PTC_LIST')
    const listCall = listEvents.find(event => event.type === 'tool/call')
    const list = toolResultOf(listEvents)
    assert(listCall?.data?.name === 'run_code', 'PTC O6: model emitted a real run_code call')
    assert(list.message?.isError !== true, 'PTC O6: run_code result is not an error')
    assert(!list.content.includes(guide.childId), 'PTC O6: run_code result hides guidance')
    assert(list.content.includes(worker.childId), 'PTC O6: run_code result keeps ordinary work')
    const nestedList = [...toolNotifications.values()].flat().filter(item => item.name === 'list_agents' && item.agentId === parent.id)
    assert(nestedList.length === 1, 'PTC O6: nested list has exactly one result notification')
    assert(Array.isArray(nestedList[0]?.result.value)
      && nestedList[0].result.value.some(row => row.id === worker.childId)
      && !nestedList[0].result.value.some(row => row.id === guide.childId),
    'PTC O6: nested list value agrees with filtered program/session content')

    const sendEvents = await nativeTurn(parent, `LI_O6_PTC_SEND ${guide.childId}`)
    const sendCall = sendEvents.find(event => event.type === 'tool/call')
    const send = toolResultOf(sendEvents)
    assert(sendCall?.data?.name === 'run_code', 'PTC O6: model emitted a real run_code control call')
    assert(send.message?.isError !== true, 'PTC O6: the program caught the nested control error')
    assert(send.content.includes('Guidance conversations'), 'PTC O6: nested control denial reaches the model')
    if (guideAgent !== undefined) {
      assert(guideAgent.inbox.hasPending === pendingBefore, 'PTC O6: denied nested send has no inbox side effect')
    }
    const interruptEvents = await nativeTurn(parent, `LI_O6_PTC_INTERRUPT ${guide.childId}`)
    const interruptCall = interruptEvents.find(event => event.type === 'tool/call')
    const interrupt = toolResultOf(interruptEvents)
    assert(interruptCall?.data?.name === 'run_code', 'PTC O6: model emitted a real run_code interrupt call')
    assert(interrupt.message?.isError !== true && interrupt.content.includes('Guidance conversations'),
      'PTC O6: nested interrupt denial reaches the persisted model result')
    return { list: 'passed', send: 'passed', interrupt: 'passed' }
  }

  /**
   * O8 real-Host probe: async panel apply, real Agent `inject` wrapper, and
   * unwrap/reload. It uses a dedicated parent/guide so the goal assertions
   * above stay independent.
   */
  async function o8Probe() {
    const SHIELD = Symbol.for('dsh-guide-panel.shield')
    const entries = [...ctx.get('loader').entries()]
    const panel = entries.find(entry => entry.options.name === '@local/dsh-guide-panel')
    if (panel === undefined) {
      throw new Error(`guide-panel loader entry not found: ${entries.map(entry => entry.options.name).join(', ')}`)
    }
    const handle = await rootAgent()
    const parent = handle.agent
    handles.add(handle)
    gates.set('o8', Promise.withResolvers())
    const guide = await child(parent, 'guide-fork', 'o8')
    await until(() => entered.has('o8'), 'O8 guidance entered mock model')
    await until(() => parent.followup?.[SHIELD] === true || parent.inject?.[SHIELD] === true, 'parent settlement shield installed')

    const settlement = {
      source: { kind: 'subagent-settled', form: 'notice', senderSessionId: guide.childId },
      content: [{ type: 'text', text: `Background subagent ${guide.childId} finished.` }],
    }
    parent.inject(settlement)
    assert(parent.inbox.hasPending === false, 'O8: guide settlement is swallowed on inject')
    parent.inject({ content: [{ type: 'text', text: 'ordinary inject' }] })
    assert(parent.inbox.hasPending === true, 'O8: ordinary inject is forwarded')
    parent.inbox.clear()
    assert(parent.inbox.hasPending === false, 'O8: inbox cleared after ordinary probe')

    await panel.update({ disabled: true })
    await panel.fiber?.await()
    assert(parent.inject?.[SHIELD] === true, 'O8: independent shield survives panel unload')
    parent.inject(settlement)
    assert(parent.inbox.hasPending === false, 'O8: inject remains shielded during panel unload')

    parent.inbox.clear()
    await panel.update({ disabled: false })
    await panel.fiber?.await()
    await until(() => parent.inject?.[SHIELD] === true, 'shield reattached after panel reload')
    parent.inject(settlement)
    assert(parent.inbox.hasPending === false, 'O8: inject swallowed after reload')

    const hostShield = entries.find(entry => entry.options.name === '@local/dsh-guide-shield')
    assert(hostShield !== undefined, 'O8: independent Host shield is installed')
    const retained = parent.inject
    const foreign = function () { return Reflect.apply(retained, this, arguments) }
    parent.inject = foreign
    await hostShield.update({ disabled: true }); await hostShield.fiber?.await()
    assert(parent.inject === foreign, 'O8: service unload preserves a third-party outer wrapper')
    parent.inject(settlement)
    assert(parent.inbox.hasPending === true, 'O8: service unload restores original delivery')
    parent.inbox.clear()
    await hostShield.update({ disabled: false }); await hostShield.fiber?.await()
    await until(() => parent.inject?.[SHIELD] === true, 'shield reattached after service reload')

    gates.get('o8').resolve()
    await guide.result.catch(() => {})
    await handle.dispose()
    handles.delete(handle)
    return { status: 'passed', panel: panel.options.name }
  }
  /**
   * O6 real-Host probe: call the actual model tools, not the service methods.
   * The parent stays online so smoke can also exercise `/guide/api/start`.
   */
  async function o6Probe() {
    const handle = await rootAgent()
    const parent = handle.agent
    handles.add(handle)
    gates.set('o6', Promise.withResolvers())
    gates.set('o6work', Promise.withResolvers())
    gates.set('o6guidework', Promise.withResolvers())
    const guide = await child(parent, 'guide-fork', 'o6')
    await until(() => entered.has('o6'), 'O6 guidance entered mock model')
    const guideAgent = ctx.agents.get(guide.childId)
    const worker = await child(parent, 'spawn', 'o6work')
    await until(() => entered.has('o6work'), 'O6 worker entered mock model')
    const guideWorker = await child(guideAgent, 'spawn', 'o6guidework', { maxDepth: 2 })
    await until(() => entered.has('o6guidework'), 'O6 guide worker entered mock model')

    const callTool = async (name, args, agent) => ctx.tools.execute({
      name,
      arguments: args,
      agent,
      callId: `li-o6-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      signal: controller.signal,
    })
    const ids = result => Array.isArray(result.value) ? result.value.map(entry => entry.id) : []

    const children = await callTool('list_agents', { scope: 'children' }, parent)
    assert(children.isError !== true, 'O6: list_agents children succeeds')
    const childIds = ids(children)
    const shieldMark = parent.followup?.[Symbol.for('dsh-guide-panel.shield')] === true
    const hookCount = ctx.events?._hooks?.['tools/post-execute']?.length
    assert(!childIds.includes(guide.childId), `O6: children hides guidance; got=${JSON.stringify(children.value)} guide=${guide.childId} shield=${shieldMark} postHooks=${hookCount}`)
    assert(childIds.includes(worker.childId), 'O6: children keeps ordinary work')

    const descendants = await callTool('list_agents', { scope: 'descendants' }, parent)
    assert(descendants.isError !== true, 'O6: list_agents descendants succeeds')
    assert(!ids(descendants).includes(guide.childId), 'O6: descendants hides guidance')
    assert(!ids(descendants).includes(guideWorker.childId), 'O6: descendants hides the guidance branch')
    assert(ids(descendants).includes(worker.childId), 'O6: descendants keeps ordinary work')

    const serviceRows = await ctx.subagents.listChildren(parent.id)
    assert(serviceRows.some(row => row.id === guide.childId), 'O6: the subagents service still sees guidance')

    const sendGuide = await callTool('send_message', { agent_id: guide.childId, message: 'O6 probe' }, parent)
    assert(sendGuide.isError === true, 'O6: send_message to guidance is denied')
    const sendWorker = await callTool('send_message', { agent_id: worker.childId, message: 'O6 probe' }, parent)
    assert(sendWorker.isError !== true, 'O6: send_message to ordinary work succeeds')

    const interruptGuide = await callTool('interrupt_agent', { agent_id: guide.childId }, parent)
    assert(interruptGuide.isError === true, 'O6: interrupt_agent on guidance is denied')
    const interruptGuideWorker = await callTool('interrupt_agent', { agent_id: guideWorker.childId }, parent)
    assert(interruptGuideWorker.isError === true, 'O6: interrupt_agent on a guidance descendant is denied')

    for (const tag of ['o6', 'o6work', 'o6guidework']) gates.get(tag).resolve()
    await Promise.allSettled([guide.result, worker.result, guideWorker.result])
    const native = await nativeProbe(parent, guide, worker)
    const ptc = await ptcProbe()
    const panel = [...ctx.get('loader').entries()].find(entry => entry.options.name === '@local/dsh-guide-panel')
    const originalConfig = panel.options.config
    try {
      for (const model of [{ hideGuidance: false, blockControl: true },
        { hideGuidance: true, blockControl: false }, { hideGuidance: true, blockControl: true }]) {
        await panel.update({ config: { ...originalConfig, model } }); await panel.fiber?.await()
        await until(() => ctx.tools.get('list_agents', parent)?.execute?.name
          === (model.hideGuidance ? 'listProjection' : 'execute'), 'O6 config activation settled')
        const result = await callTool('list_agents', { scope: 'children' }, parent)
        assert(result.isError !== true && ids(result).includes(guide.childId) === !model.hideGuidance,
          `O6 real config: list matches hideGuidance=${model.hideGuidance}`)
        for (const name of ['send_message', 'interrupt_agent']) {
          assert(ctx.tools.get(name, parent)?.execute?.name
            === (model.hideGuidance && model.blockControl ? 'controlProjection' : 'execute'),
          `O6 real config: ${name} matches master/control switches`)
        }
      }
    } finally { await panel.update({ config: originalConfig }); await panel.fiber?.await() }
    return { status: 'passed', parent: parent.id, native, ptc, configuration: 'passed' }
  }

  let task
  ctx.effect(() => {
    task = (async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      await until(() => adapterState().mode !== 'absent', 'goal adapter became available')
      const timing = await presetTimingProbe()
      gates.set('guide', Promise.withResolvers()); gates.set('worker', Promise.withResolvers())
      const handle = await rootAgent(), parent = handle.agent
      const guide = await child(parent, 'guide-fork', 'guide')
      await until(() => entered.has('guide'), 'guidance entered mock model')
      const work = await child(parent, 'spawn', 'work')
      // The worker marker intentionally maps LI_WORK_HOLD to the worker gate.
      await until(() => entered.has('worker'), 'work entered mock model')
      const goal = ctx.goals.create(parent, { objective: 'Run isolated continuation checks', maxGoalRounds: 3 })
      await new Promise(resolve => setTimeout(resolve, 150))
      assert((rounds.get(parent.id) ?? 0) === 0, 'goal waits while ordinary child is running')
      gates.get('worker').resolve(); await work.result
      await until(() => (rounds.get(parent.id) ?? 0) >= 2, 'goal continues during guidance')
      assert(ctx.agents.get(guide.childId)?.status === 'running', 'goal admitted multiple rounds before guidance finished')
      assert(adapterState().mode === 'filtered', 'real manager fingerprint enables filtered mode')
      await until(() => ctx.goals.get(parent)?.phase === 'blocked', 'round limit')
      assert(ctx.goals.get(parent).blockedReason?.code === 'round-limit', 'upstream round-limit behavior preserved')
      gates.get('guide').resolve(); await guide.result
      await until(() => !ctx.subagents.manager.resident.has(guide.childId), 'first guidance settlement')
      entered.delete('guide'); gates.set('guide', Promise.withResolvers())
      await ctx.subagents.prompt({ parentSessionId: parent.id, childSessionId: guide.childId, mode: 'continuable',
        requestId: `li-resume-${Date.now()}`, delivery: 'queue', content: [{ type: 'text', text: 'LI_GUIDE_HOLD cold resume' }],
      }, controller.signal)
      await until(() => entered.has('guide'), 'cold-resumed guidance entered')
      const coldList = await ctx.tools.execute({ name: 'list_agents', arguments: { scope: 'children' }, agent: parent,
        callId: 'li-o6-cold-list', signal: controller.signal })
      assert(coldList.isError !== true && !coldList.value.some(row => row.id === guide.childId),
        'O6 cold restore: list hides the restored guidance session')
      for (const name of ['send_message', 'interrupt_agent']) {
        const coldControl = await ctx.tools.execute({ name, arguments: { agent_id: guide.childId, message: 'cold probe' },
          agent: parent, callId: `li-o6-cold-${name}`, signal: controller.signal })
        assert(coldControl.isError === true && JSON.stringify(coldControl.content).includes('Guidance conversations'),
          `O6 cold restore: ${name} is denied before its original body`)
      }
      const edited = ctx.goals.edit(parent, ctx.goals.get(parent), { maxGoalRounds: 5 })
      ctx.goals.resume(parent, edited)
      await until(() => (rounds.get(parent.id) ?? 0) >= 4, 'goal during cold guidance')
      assert(ctx.agents.get(guide.childId)?.status === 'running', 'cold-resumed guidance identity is recognized without creation-time ids')
      await until(() => ctx.goals.get(parent)?.phase === 'blocked', 'second round limit')
      gates.get('guide').resolve()
      await until(() => !ctx.subagents.manager.resident.has(guide.childId), 'cold guidance settlement')
      assert(!guideSettlements.some(item => item.session === parent.id && item.sender === guide.childId),
        'O8: guidance settlement never enters parent history')
      // Keep this root online for the optional browser scene, without model work.
      const second = await rootAgent(), stoppable = second.agent
      gates.set('parent', Promise.withResolvers()); entered.delete('parent')
      const pauseGoal = ctx.goals.create(stoppable, { objective: 'LI_PARENT_HOLD cancellation test', maxGoalRounds: 3 })
      await until(() => entered.has('parent'), 'parent model entered')
      ctx.goals.pause(stoppable, pauseGoal)
      await until(() => stoppable.status === 'idle', 'paused model cancellation')
      assert(ctx.goals.get(stoppable).phase === 'paused', 'host pause cancels an actual running model call')
      gates.get('parent').resolve()
      const humanId = `li-human-${Date.now()}`
      stoppable.followup({ id: humanId, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Human message during paused goal' }] })
      await until(() => humanMessages.has(humanId) && stoppable.status === 'idle', 'human turn completed')
      assert(ctx.goals.get(stoppable).phase === 'paused', 'ordinary human messages do not re-arm a paused goal')
      const next = ctx.goals.edit(stoppable, ctx.goals.get(stoppable), { objective: 'Resumed revision test' })
      const resumed = ctx.goals.resume(stoppable, next)
      await until(() => ctx.goals.get(stoppable)?.phase === 'blocked', 'resumed revision reaches limit')
      assert(lastRoundSource.get(stoppable.id)?.revision === resumed.revision, 'new goal rounds use the resumed edited revision')
      await second.dispose()
      handles.delete(second)
      const unload = await rootAgent(), unloadingAgent = unload.agent
      entered.delete('parent'); gates.set('parent', Promise.withResolvers())
      ctx.goals.create(unloadingAgent, { objective: 'LI_PARENT_HOLD unload check', maxGoalRounds: 3 })
      await until(() => entered.has('parent'), 'model entered before adapter unload')
      const driverEntry = [...ctx.get('loader').entries()].find(entry => entry.options.name === '@local/dsh-guide-goal-adapter')
      await driverEntry.update({ disabled: true }); await driverEntry.fiber?.await()
      await until(() => unloadingAgent.status === 'idle', 'running model cancelled by adapter unload')
      assert(ctx.goals.get(unloadingAgent).activation === 'disarmed', 'adapter unload disarms a real running goal')
      const countBefore = rounds.get(unloadingAgent.id)
      await new Promise(resolve => setTimeout(resolve, 120))
      assert(rounds.get(unloadingAgent.id) === countBefore, 'unloaded adapter schedules no further round')
      gates.get('parent').resolve()
      await driverEntry.update({ disabled: false }); await driverEntry.fiber?.await()
      assert(adapterState().mode !== 'absent', 'goal adapter reactivates after full unload')
      await unload.dispose(); handles.delete(unload)
      const o8 = await o8Probe()
      const o6 = await o6Probe()
      const lifecycle = process.env.DSH_O2_STATE
        ? await (await import('../../guide-panel/test/host-lifecycle-matrix.mjs')).runLifecycleMatrix(ctx,
          { rootAgent, gates, entered, until, assert, controller, handles })
        : undefined
      const automatic = await rootAgent()
      state = { ...state, status: 'passed', parent: parent.id, autoParent: automatic.agent.id, goal: goal.id, goalRounds: rounds.get(parent.id), timing, o8, o6, lifecycle }
    })().catch(error => { state = { ...state, status: 'failed', error: String(error), stack: error.stack } })
    return async () => {
      controller.abort(); for (const gate of gates.values()) gate.resolve()
      await task
      await Promise.allSettled([...handles].map(handle => handle.dispose()))
    }
  }, 'guide-goal runtime fixture')
}

import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

export const terminalNames = ['terminal_open', 'terminal_send', 'terminal_read', 'terminal_signal', 'terminal_close', 'terminal_list']

export function toolInventory(ctx, agent) {
  return terminalNames.map(name => {
    let def
    try { def = ctx.tools.get(name, agent) } catch {}
    return { name, found: !!def, parameters: def?.parameters ?? null }
  })
}

/** Deterministic model -> native tools -> real, guide-owned persistent PTY. */
export function createPtyFixture(ctx, { child, rootAgent, nativeTurn, until, controller }) {
  const probes = new Map()
  let run = { status: 'idle', probes: [] }
  const calls = new Map()
  const valueOf = result => result?.value
  const alive = pid => {
    if (!Number.isInteger(pid) || pid <= 0) return null
    try { process.kill(pid, 0); return true } catch (error) {
      if (error.code === 'ESRCH') return false
      throw error
    }
  }
  const snapshot = () => ({ ...run, probes: [...probes.values()].map(({ gate, receipt, agent, ...probe }) =>
    ({ ...probe, liveNow: alive(probe.shellPid) })) })

  ctx.on('tools/result', (exec, result) => {
    const probe = calls.get(exec.callId)
    if (!probe) return
    const call = probe.calls.find(row => row.callId === exec.callId)
    if (call) Object.assign(call, { ownerId: exec.agent?.id, result })
    if (result?.isError) {
      probe.status = 'failed'
      probe.error = result
    }
    if (exec.name === 'terminal_open' && !result?.isError) {
      probe.terminalSessionId = valueOf(result)?.sessionId
      probe.pid = valueOf(result)?.pid
    }
  }, { global: true })

  function stream(options) {
    const latest = [...options.messages].reverse().find(message => message.role === 'user'
      && message.content?.some(block => block.type === 'text' && /LI_PT6 [a-f0-9-]+/.test(block.text)))
    const text = latest?.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? ''
    const match = /LI_PT6 ([a-f0-9-]+)/.exec(text)
    const probe = match && probes.get(match[1])
    if (!probe) return undefined
    return (async function* () {
      const rawTools = options.tools
      probe.modelTools = Array.isArray(rawTools) ? rawTools.map(tool => tool.name ?? tool.function?.name).filter(Boolean)
        : Object.keys(rawTools ?? {})
      const id = probe.terminalSessionId
      const steps = [
        ['terminal_open', { type: 'shell', name: `pt6-${probe.token}` }],
        ['terminal_send', { sessionId: id, text: `$env:PT6_TOKEN = '${probe.token}'; Set-Location -LiteralPath '${probe.cwd.replaceAll("'", "''")}'; Write-Output ('PT6_INIT_PID=' + $PID)` }],
        ['terminal_send', { sessionId: id, text: "Write-Output ('PT6_RESULT=' + $env:PT6_TOKEN); Write-Output ('PT6_PID=' + $PID); Write-Output ('PT6_CWD=' + (Get-Location).Path)" }],
        ['terminal_list', {}],
        ['terminal_read', { sessionId: id, count: 100 }],
      ]
      if (probe.status !== 'failed' && probe.calls.length < steps.length) {
        const [name, args] = steps[probe.calls.length]
        if (name !== 'terminal_open' && name !== 'terminal_list' && !id) {
          probe.status = 'failed'; probe.error = 'terminal_open returned no structured terminal session id'
        } else {
          const callId = `li-pt6-${probe.token}-${probe.calls.length}`
          probe.calls.push({ callId, name, arguments: args })
          calls.set(callId, probe)
          yield { type: 'block-start', index: 0, blockType: 'tool-call' }
          yield { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: JSON.stringify(args) }
          yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) } }
          yield { type: 'finish', reason: { kind: 'stop' } }
          return
        }
      }
      if (probe.status !== 'failed') probe.status = 'ready'
      yield { type: 'text-delta', index: 0, text: `PT-6 terminal ${id ?? 'unavailable'}; inspect the tool results for output and status.` }
      // Keep the exact owning Agent alive while the browser inspects its results.
      await Promise.race([probe.gate.promise, new Promise((_, reject) => {
        if (options.signal?.aborted) return reject(options.signal.reason)
        options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      })])
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  }

  async function start() {
    if (run.status !== 'idle') return snapshot()
    const workspaceCwd = mkdtempSync(join(tmpdir(), 'dsh-pt6-'))
    const { agent: parent } = await rootAgent({ workspaceCwd })
    if (process.env.DSH_PT6_UNSANDBOXED === '1') {
      parent.session.append('sandbox/mode', { mode: 'danger-full-access' })
      await nativeTurn(parent, 'PT6 isolated diagnostic: fixed terminal commands only')
    }
    const parentSessionId = parent.id
    run = { status: 'running', parentSessionId, workspaceCwd,
      mode: ctx.get('sandboxPolicy').resolve({ session: parent.session }).mode,
      parentTools: toolInventory(ctx, parent), startedAt: new Date().toISOString(), transports: [] }
    // Observe the test PTY transport without consuming/replacing its output.
    const subprocess = ctx.get('subprocess')
    const target = subprocess[Symbol.for('cordis.original')] ?? subprocess
    ctx.effect(() => {
      const descriptor = Object.getOwnPropertyDescriptor(target, 'spawnTerminal')
      const original = target.spawnTerminal
      target.spawnTerminal = async function (spec) {
        const handle = await original.call(this, spec)
        if (spec.env?.DSH_PTY_SESSION_ID) {
          const transport = { terminalSessionId: spec.env.DSH_PTY_SESSION_ID, argv: spec.argv, cwd: spec.cwd,
            hostElectronRunAsNode: process.env.ELECTRON_RUN_AS_NODE, pid: handle.pid, output: '' }
          run.transports.push(transport)
          handle.output.on('data', chunk => { transport.output = (transport.output + String(chunk)).slice(-16000) })
          handle.done.then(outcome => { transport.outcome = outcome }, error => { transport.error = String(error) })
        }
        return handle
      }
      return () => { if (descriptor) Object.defineProperty(target, 'spawnTerminal', descriptor); else delete target.spawnTerminal }
    })
    try {
      for (let index = 0; index < 2; index++) {
        const token = randomUUID()
        const probe = { token, status: 'starting', calls: [], gate: Promise.withResolvers(), parentSessionId, cwd: workspaceCwd }
        probes.set(token, probe)
        probe.receipt = await child(parent, 'guide-fork', `pt6-${index}`, { prompt: `LI_PT6 ${token}`, cwd: workspaceCwd })
        probe.receipt.result.catch(error => { probe.status = 'failed'; probe.error = String(error) })
        probe.guideSessionId = probe.receipt.childId
        probe.agent = ctx.agents.get(probe.guideSessionId)
        probe.identity = { header: probe.agent?.session?.header,
          descriptor: probe.agent?.session?.snapshotEvents(probe.agent.session.inheritedEventCount)
            .find(event => event.type === 'subagent/descriptor')?.data }
        probe.guideTools = toolInventory(ctx, probe.agent)
        probe.mode = ctx.get('sandboxPolicy').resolve({ session: probe.agent.session }).mode
        if (probe.guideTools.some(tool => !tool.found)) {
          probe.status = 'blocked'; run.status = 'blocked'; run.reason = 'missing-guide-terminal-tools'
          return snapshot()
        }
        await until(() => ['ready', 'failed'].includes(probe.status), 'PT-6 native terminal sequence', 45_000)
        if (probe.status === 'failed') throw Error(`PT-6 guide failed: ${JSON.stringify(probe.error)}`)
        const read = probe.calls.find(row => row.name === 'terminal_read')?.result?.value
        const listed = probe.calls.find(row => row.name === 'terminal_list')?.result?.value
        probe.output = read
        probe.listed = listed
        probe.events = probe.agent.session.snapshotEvents(probe.agent.session.inheritedEventCount)
          .filter(event => ['tool/call', 'tool/result'].includes(event.type))
        probe.shellPid = Number(/^PT6_PID=(\d+)\r?$/m.exec(read?.text ?? '')?.[1]) || null
        probe.liveBeforeCleanup = alive(probe.shellPid)
        probe.foreignRead = await ctx.tools.execute({ name: 'terminal_read', arguments: { sessionId: probe.terminalSessionId },
          agent: parent, callId: `pt6-foreign-${token}`, signal: controller.signal })
        probe.unknownRead = await ctx.tools.execute({ name: 'terminal_read', arguments: { sessionId: `missing-${token}` },
          agent: probe.agent, callId: `pt6-missing-${token}`, signal: controller.signal })
      }
      run.status = 'ready'
    } catch (error) {
      run.status = 'failed'; run.error = String(error); run.stack = error.stack
      const transport = run.transports.at(-1)
      if (transport?.argv.includes('--workspace')) {
        const separator = transport.argv.indexOf('--')
        const args = [...transport.argv.slice(1, separator + 2), '-NoLogo', '-NoProfile', '-Command', "Write-Output 'PT6_SANDBOX_DIAG'"]
        try {
          run.pipeDiagnostic = { output: execFileSync(transport.argv[0], args,
            { cwd: workspaceCwd, windowsHide: true, timeout: 15_000, encoding: 'utf8', env: {
              ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|PASSWORD|SECRET|TOKEN/i.test(key) && !key.toUpperCase().startsWith('DSH_'))),
              ELECTRON_RUN_AS_NODE: '1',
            } }) }
        } catch (diagnosticError) {
          run.pipeDiagnostic = { error: String(diagnosticError), status: diagnosticError.status,
            stdout: String(diagnosticError.stdout ?? ''), stderr: String(diagnosticError.stderr ?? '') }
        }
      }
    }
    return snapshot()
  }

  async function cleanup() {
    for (const probe of probes.values()) {
      if (probe.terminalSessionId && !probe.cleanup) {
        probe.cleanup = await ctx.tools.execute({ name: 'terminal_close', arguments: { sessionId: probe.terminalSessionId },
          agent: probe.agent, callId: `pt6-close-${probe.token}`, signal: controller.signal })
        if (!probe.cleanup?.isError && Number.isInteger(probe.shellPid)) {
          await until(() => alive(probe.shellPid) === false, 'PT-6 process exited', 10_000)
        }
        probe.liveAfterCleanup = alive(probe.shellPid)
      }
      probe.gate.resolve()
      await probe.receipt?.result.catch(() => {})
      probe.ownerAfterCleanup = ctx.agents.get(probe.guideSessionId)?.status ?? 'unloaded'
    }
    run.cleanupTransportSettled = run.transports?.every(transport => transport.outcome !== undefined || transport.error !== undefined) ?? true
    run.cleanedAt = new Date().toISOString()
    return snapshot()
  }
  return { stream, start, snapshot, cleanup }
}

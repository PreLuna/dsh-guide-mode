"""Bounded observation of real app streams across pages/reloads/client remounts."""
import asyncio
import json
import time
import traceback


async def run_r5_extended(page, config, output):
    started = time.monotonic()
    result = {'scenario': 'r5-extended', 'status': 'running', 'samples': [], 'connections': [],
              'events': [], 'remounts': [], 'errors': [], 'scope': 'isolated combination; real app streams, no artificial SSE saturation'}
    browser = page.context.browser
    pages = [page]
    extra_context = None
    monitors = []
    scene = await page.evaluate("async () => (await fetch('./li-runtime/residual-setup', {method:'POST'})).json()")

    async def attach(target, label):
        cdp = await target.context.new_cdp_session(target)
        await cdp.send('Network.enable')
        monitor = {'page': label, 'requests': {}, 'sse': {}, 'ws': set(), 'closed': False}
        monitors.append(monitor)

        def request(event):
            monitor['requests'][event['requestId']] = {'path': event['request']['url'].split('?')[0], 'at': time.monotonic()}

        def response(event):
            r = event['response']
            headers = {k.lower(): v for k, v in r.get('headers', {}).items()}
            path = r['url'].split('?')[0]
            if 'text/event-stream' in str(headers.get('content-type', '')) or event.get('type') == 'EventSource':
                monitor['sse'][event['requestId']] = path
                result['events'].append({'type': 'sse-open', 'page': label, 'path': path, 'protocol': r.get('protocol'), 'at': time.monotonic()-started})
            if '/guide/api/' in path:
                result['events'].append({'type': 'api-response', 'page': label, 'protocol': r.get('protocol'), 'timing': r.get('timing'), 'at': time.monotonic()-started})

        def finished(event):
            identifier = event['requestId']
            if identifier in monitor['sse']:
                result['events'].append({'type': 'sse-closed', 'page': label, 'path': monitor['sse'][identifier], 'at': time.monotonic()-started})
            monitor['sse'].pop(identifier, None)
            monitor['requests'].pop(identifier, None)

        def ws_created(event):
            monitor['ws'].add(event['requestId'])

        def ws_closed(event):
            monitor['ws'].discard(event['requestId'])

        def reset_connections(reason):
            # CDP can omit close/fail events when the old document is destroyed.
            # Counts describe the current page, not every document ever loaded.
            result['events'].append({'type': 'connection-inventory-reset', 'page': label,
                'reason': reason, 'at': time.monotonic()-started})
            monitor['sse'].clear()
            monitor['ws'].clear()
            monitor['requests'].clear()

        def navigated(frame):
            if frame == target.main_frame:
                reset_connections('main-frame-navigation')

        def closed():
            monitor['closed'] = True
            reset_connections('page-closed')

        cdp.on('Network.requestWillBeSent', request)
        cdp.on('Network.responseReceived', response)
        cdp.on('Network.loadingFinished', finished)
        cdp.on('Network.loadingFailed', finished)
        cdp.on('Network.webSocketCreated', ws_created)
        cdp.on('Network.webSocketClosed', ws_closed)
        target.on('pageerror', lambda error: result['events'].append({'type': 'page-error', 'page': label, 'error': str(error)}))
        target.on('framenavigated', navigated)
        target.on('close', closed)

    async def surface(target, navigate=True):
        if navigate:
            await target.goto(config['entryUrl'], wait_until='domcontentloaded', timeout=20000)
        await target.wait_for_function('window.__liFixture !== undefined', timeout=20000)
        await target.wait_for_function("window.__liFixture.ctx.get('guideSidebarAdapter')?.getState().mode === 'active'", timeout=15000)
        await target.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=scene['parent'], timeout=20000)
        await target.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', scene['parent'])
        await target.wait_for_function('(id) => window.__liFixture.ctx.sidebarRight.mounted.getSnapshot() === id', arg=scene['parent'], timeout=20000)
        await target.evaluate("""({parent,child}) => {
          const ctx = window.__liFixture.ctx
          ctx.get('betterSidebar').openTab({type:'subagent',title:'Tasks'}, {sessionId:parent})
          ctx.sidebarRight.openResource(`dsh-resource://subagentchat/session/${encodeURIComponent(child)}?parent=${encodeURIComponent(parent)}&mode=continuable`, {kind:'subagentchat',preferNewPane:true})
        }""", {'parent': scene['parent'], 'child': scene['dual']})
        await target.wait_for_timeout(600)
        welcome = target.get_by_role('button', name='继续', exact=True)
        if await welcome.is_visible():
            await welcome.click()

    async def sample(label, rounds=2):
        for _ in range(rounds):
            for index, target in enumerate(pages):
                if target.is_closed():
                    continue
                begin = time.monotonic()
                value = await target.evaluate("""async () => {
                  try {
                    const r = await fetch('./guide/api/state', {method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(2500)})
                    const j = await r.json()
                    return {status:r.status,mode:j.value?.panelCompat?.mode}
                  } catch(e) { return {error:e.name} }
                }""")
                result['samples'].append({'phase': label, 'page': index, 'at': round(time.monotonic()-started, 3),
                    'elapsedMs': round((time.monotonic()-begin)*1000), 'result': value})
        try:
            host = await page.evaluate("async () => (await fetch('./li-runtime/residual-resources', {signal:AbortSignal.timeout(2500)})).json()")
        except Exception as error:
            host = {'error': str(error)}
        result['connections'].append({'phase': label, 'at': round(time.monotonic()-started, 3), 'host': host,
            'pages': [{'page': m['page'], 'closed': m['closed'], 'activeSse': len(m['sse']), 'activeWs': len(m['ws'])}
                      for m in monitors]})

    try:
        await attach(page, 'page-0')
        await surface(page)
        await sample('single-page', 3)
        for index in range(1, 4):
            target = await page.context.new_page(); pages.append(target)
            await attach(target, 'page-' + str(index)); await surface(target)
            await sample(str(index + 1) + '-same-context-pages')
        extra_context = await browser.new_context(viewport={'width': 1440, 'height': 1000})
        other = await extra_context.new_page(); pages.append(other)
        await attach(other, 'separate-context-page'); await surface(other)
        await sample('four-pages-plus-separate-context', 3)
        for cycle in range(6):
            await page.reload(wait_until='domcontentloaded', timeout=20000)
            await surface(page, navigate=False)
            await sample('reload-' + str(cycle))
        for cycle in range(6):
            state = await page.evaluate("""async () => {
              const ctx = window.__liFixture.ctx
              const entry = [...ctx.get('loader').entries()].find(e => e.options.name === '@local/dsh-guide-sidebar-adapter')
              if (!entry) return {error:'adapter entry unavailable'}
              let removed
              try {
                await entry.update({disabled:true}); await entry.fiber?.await()
                removed = !ctx.get('guideSidebarAdapter')
              } finally { await entry.update({disabled:false}); await entry.fiber?.await() }
              return {removed,mode:ctx.get('guideSidebarAdapter')?.getState().mode,
                sections:ctx.get('guideSidebarAdapter')?.getTaskSections().length}
            }""")
            result['remounts'].append(state)
            await page.wait_for_timeout(500)
            await sample('adapter-remount-' + str(cycle))
        while time.monotonic()-started < 120:
            await sample('steady-five-pages')
            await page.wait_for_timeout(2000)
        for target in pages[1:]:
            await target.close()
        if extra_context:
            await extra_context.close(); extra_context = None
        await page.wait_for_timeout(2500)
        await sample('back-to-one-page', 4)
        await page.screenshot(path=str(output / 'r5-back-to-one-page.png'), full_page=True)
    except Exception as error:
        result['errors'].append({'error': str(error), 'traceback': traceback.format_exc()})
    finally:
        for target in pages[1:]:
            if not target.is_closed():
                await target.close()
        if extra_context:
            await extra_context.close()
        failures = [s for s in result['samples'] if s['result'].get('status') != 200]
        result['failedSamples'] = failures
        result['elapsedSeconds'] = round(time.monotonic()-started, 3)
        result['status'] = 'failed' if failures or result['errors'] or len(result['remounts']) != 6 or any(
            s.get('mode') != 'active' or s.get('removed') is not True or s.get('sections') != 1 for s in result['remounts']) else 'passed'
        result['reproduction'] = 'not-reproduced-in-bounded-run' if result['status'] == 'passed' else 'inspect-failures'
        result['limitations'] = ['browser pages and separate context approximate multiple windows; no native multi-window GUI test',
            'adapter remount is an unload/reload check, not arbitrary source-edit HMR',
            '120-second target is a bounded observation, not a long-time leak proof; Host TCP resources include non-UI connections']
        (output / 'r5-extended-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
        print(json.dumps({'scenario':'r5-extended','status':result['status'],'samples':len(result['samples']),
                          'failedSamples':len(failures),'seconds':result['elapsedSeconds']}))
    return result

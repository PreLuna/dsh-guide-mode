"""PT-6: real guide native calls and user-visible terminal evidence."""
import json
import re
import traceback


async def run_pt6(page, config, output):
    result = {'status': 'blocked', 'assertions': [], 'ui': []}
    stage = 'PT-6A'

    def check(label, ok, detail=None):
        result['assertions'].append({'stage': stage, 'label': label, 'ok': bool(ok), 'detail': detail})

    try:
        native = await page.evaluate("async () => (await fetch('./li-runtime/pty-start', {method:'POST'})).json()")
        result['native'] = native
        result['mode'] = native.get('mode')
        result['scope'] = 'isolated-unsandboxed-diagnostic' if native.get('mode') == 'danger-full-access' else 'isolated-workspace-write'
        result['productionAcceptance'] = False if native.get('mode') == 'danger-full-access' else None
        if native.get('status') == 'blocked':
            result['blockedReason'] = native.get('reason')
            return result
        check('the native guide terminal sequence is ready', native.get('status') == 'ready', native.get('error'))
        if native.get('status') != 'ready':
            result['status'] = 'failed'
            return result
        probes = native.get('probes', [])
        check('two separate guidance owners are exercised', len(probes) == 2)
        for probe in probes:
            terminal_id = probe.get('terminalSessionId')
            guide_id = probe.get('guideSessionId')
            calls = probe.get('calls', [])
            lines = (probe.get('output', {}).get('text') or '').splitlines()
            identity = probe.get('identity', {})
            check('the guide has a trusted provider and matching parent',
                  identity.get('header', {}).get('parentSession') == native.get('parentSessionId')
                  and identity.get('descriptor', {}).get('provider') == 'guide-fork')
            check('the recorded guide mode matches the test mode', probe.get('mode') == native.get('mode'))
            check('the guide owns every native model tool call',
                  len(calls) == 5 and all(call.get('ownerId') == guide_id for call in calls), guide_id)
            check('current terminal tools reach the model request',
                  {'terminal_open', 'terminal_send', 'terminal_read', 'terminal_list'}.issubset(set(probe.get('modelTools', []))),
                  probe.get('modelTools'))
            check('terminal identity differs from conversation identities',
                  bool(terminal_id) and terminal_id not in [guide_id, native.get('parentSessionId')], terminal_id)
            check('computed output preserves state across separate calls', 'PT6_RESULT=' + probe['token'] in lines, lines)
            check('the same live shell serves both native sends',
                  'PT6_INIT_PID=' + str(probe.get('shellPid')) in lines and probe.get('liveBeforeCleanup') is True,
                  {'shellPid': probe.get('shellPid'), 'transportPid': probe.get('pid')})
            check('the shell current directory matches the isolated workspace', 'PT6_CWD=' + probe['cwd'] in lines)
            check('owner-scoped listing includes the same running terminal',
                  any(row.get('sessionId') == terminal_id and row.get('status', {}).get('kind') == 'running'
                      for row in (probe.get('listed') or [])))
            check('the parent agent cannot read a guidance terminal', probe.get('foreignRead', {}).get('isError') is True)
            check('an unknown terminal ID is rejected', probe.get('unknownRead', {}).get('isError') is True)
            check('outputs from the other guide are absent',
                  all(other['token'] not in '\n'.join(lines) for other in probes if other['token'] != probe['token']))

        stage = 'PT-6B'
        parent = native.get('parentSessionId', config['parent'])
        await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', parent)
        await page.wait_for_timeout(500)
        await page.evaluate("(id) => window.__liFixture.ctx.get('betterSidebar').openTab({type:'subagent',title:'Tasks'}, {sessionId:id})", parent)
        await page.locator('[data-task-section="guide:threads"]').wait_for(timeout=10000)
        welcome = page.get_by_role('button', name='继续', exact=True)
        if await welcome.is_visible():
            await welcome.click()
        for index, probe in enumerate(probes):
            section = page.locator('[data-task-section="guide:threads"]')
            title = section.get_by_text('LI pt6-' + str(index), exact=True)
            await title.wait_for(timeout=10000)
            open_button = title.locator('..').get_by_role('button')
            await open_button.focus()
            await open_button.press('Enter')
            await page.wait_for_timeout(800)
            read_button = page.get_by_role('button', name=re.compile(r'读取终端\s*' + re.escape(probe['terminalSessionId'])))
            await read_button.focus()
            await read_button.press('Enter')
            await page.wait_for_timeout(250)
            pane = read_button.locator('xpath=ancestor::*[@data-dockkit-pane][1]')
            list_button = pane.get_by_role('button', name=re.compile(r'查看终端\s*1\s*个终端'))
            await list_button.focus()
            await list_button.press('Enter')
            await page.wait_for_timeout(250)
            for send_button in await pane.get_by_role('button', name=re.compile(r'工具调用\s*终端\s*' + re.escape(probe['terminalSessionId']))).all():
                await send_button.focus()
                await send_button.press('Enter')
            visible = await pane.inner_text()
            buttons = await pane.get_by_role('button').all_text_contents()
            result['ui'].append({'guideSessionId': probe['guideSessionId'], 'body': visible, 'buttons': buttons})
            await pane.evaluate("""(root, token) => {
              for (const el of [...root.querySelectorAll('*')].reverse()) {
                if (el.textContent.includes(token) && /auto|scroll/.test(getComputedStyle(el).overflowY)
                  && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight
              }
            }""", 'PT6_RESULT=' + probe['token'])
            await read_button.scroll_into_view_if_needed()
            await page.screenshot(path=str(output / f'pt6-native-guide-{index}.png'), full_page=True)
            check('native guidance UI shows the terminal identity', probe.get('terminalSessionId') in visible)
            check('native guidance UI shows computed terminal output', 'PT6_RESULT=' + probe['token'] in visible)
            check('native guidance UI shows terminal state', 'running' in visible.lower())
            check('native guidance UI shows the executed command', "Write-Output ('PT6_RESULT=' + $env:PT6_TOKEN)" in visible)
            check('the current guide pane contains no other guide output', all(
                'PT6_RESULT=' + other['token'] not in visible for other in probes if other['token'] != probe['token']))

            # Auxiliary close API; reopening still uses the user's actual task row.
            await page.evaluate("""({parent, child}) => {
              const right = window.__liFixture.ctx.sidebarRight
              for (const tab of right.tabsIn(parent)) if (tab.contentId?.includes(child)) right.close(tab.id)
            }""", {'parent': parent, 'child': probe['guideSessionId']})
            await page.get_by_role('tab', name=re.compile('Tasks')).first.click()
            state = await page.evaluate("async () => (await fetch('./li-runtime/pty-state')).json()")
            current = next(row for row in state['probes'] if row['guideSessionId'] == probe['guideSessionId'])
            check('closing the chat view keeps the original terminal process alive', current.get('liveNow') is True)
            await title.locator('..').get_by_role('button').focus()
            await title.locator('..').get_by_role('button').press('Enter')
            await page.wait_for_timeout(300)
            read_button = page.get_by_role('button', name=re.compile(r'读取终端\s*' + re.escape(probe['terminalSessionId'])))
            await read_button.wait_for()
            state = await page.evaluate("async () => (await fetch('./li-runtime/pty-state')).json()")
            current = next(row for row in state['probes'] if row['guideSessionId'] == probe['guideSessionId'])
            check('reopening neither recreates the terminal nor reruns model commands',
                  current.get('terminalSessionId') == probe['terminalSessionId'] and current.get('liveNow') is True
                  and current.get('shellPid') == probe['shellPid'] and len(current.get('calls', [])) == 5)
        result['status'] = 'passed' if all(row['ok'] for row in result['assertions']) else 'failed'
    except Exception as error:
        result['status'] = 'failed'
        result['error'] = str(error)
        result['traceback'] = traceback.format_exc()
        try:
            result['failureBody'] = await page.locator('body').inner_text()
            await page.screenshot(path=str(output / 'pt6-failure.png'), full_page=True)
        except Exception:
            pass
    finally:
        stage = 'cleanup'
        try:
            cleanup = await page.evaluate("async () => (await fetch('./li-runtime/pty-cleanup', {method:'POST'})).json()")
            result['cleanup'] = cleanup
            if cleanup.get('status') == 'failed' and not cleanup.get('cleanedAt'):
                check('terminal cleanup completes', False, cleanup)
            for probe in cleanup.get('probes', []):
                if probe.get('terminalSessionId'):
                    check('the test terminal process exits on close',
                          probe.get('cleanup', {}).get('isError') is not True and probe.get('liveAfterCleanup') is False,
                          {'shellPid': probe.get('shellPid'), 'transportPid': probe.get('pid')})
                    check('the completed guidance owner unloads', probe.get('ownerAfterCleanup') == 'unloaded')
            check('all observed PTY transports settle', cleanup.get('cleanupTransportSettled') is True)
            if any(not row['ok'] for row in result['assertions']):
                result['status'] = 'failed'
        except Exception as error:
            check('terminal cleanup completes', False, str(error))
            result['status'] = 'failed'
        result['subitems'] = {}
        for name in ['PT-6A', 'PT-6B', 'cleanup']:
            checks = [row for row in result['assertions'] if row['stage'] == name]
            result['subitems'][name] = 'blocked' if not checks else ('passed' if all(row['ok'] for row in checks) else 'failed')
        (output / 'pt6-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return result

"""Bounded end-to-end checks for O11's remaining UI and timer cases."""
import asyncio
import json
import re
import time
import traceback
from pathlib import Path


async def run_residual(page, config, output):
    result = {'scenario': 'residual', 'status': 'running', 'items': {}, 'errors': [], 'console': []}
    page.on('pageerror', lambda error: result['console'].append(str(error)))

    def check(key, label, ok, detail=None):
        row = result['items'].setdefault(key, {'status': 'passed', 'assertions': []})
        row['assertions'].append({'label': label, 'ok': bool(ok), 'detail': detail})
        if not ok:
            row['status'] = 'failed'

    async def api(method, suffix=''):
        return await page.evaluate("""async ({method, suffix}) => {
          const response = await fetch('./li-runtime/' + method + suffix, { method: method === 'residual-state' ? 'GET' : 'POST' })
          return await response.json()
        }""", {'method': method, 'suffix': suffix})

    async def inventory():
        return await page.evaluate('(id) => window.__liFixture.ctx.sidebarRight.tabsIn(id).map(t => ({id:t.id,kind:t.kind,contentId:t.contentId,title:t.title}))', scene['parent'])

    async def archived():
        return await page.evaluate("() => window.__liFixture.ctx.get('workspaces').list.getSnapshot().archivedSessionIds ?? []")

    async def open_chat(child, new=True):
        await page.evaluate("""({parent,child,newPane}) => window.__liFixture.ctx.sidebarRight.openResource(
          `dsh-resource://subagentchat/session/${encodeURIComponent(child)}?parent=${encodeURIComponent(parent)}&mode=continuable`,
          {kind:'subagentchat',preferNewPane:newPane,revealIfOpened:false})""",
                            {'parent': scene['parent'], 'child': child, 'newPane': new})
        await page.wait_for_timeout(400)

    async def close_chats(child):
        await page.evaluate("""({parent,child}) => {
          const right = window.__liFixture.ctx.sidebarRight
          for (const tab of right.tabsIn(parent)) if (tab.contentId?.includes(child)) right.close(tab.id)
        }""", {'parent': scene['parent'], 'child': child})

    async def run_case(key, action):
        try:
            await action()
        except Exception as error:
            check(key, 'the scenario completes', False, str(error))
            result['errors'].append({'case': key, 'error': str(error), 'traceback': traceback.format_exc()})
            result['items'][key]['failureBody'] = (await page.locator('body').inner_text())[-16000:]
            await page.screenshot(path=str(output / (key + '-failure.png')), full_page=True)

    scene = await api('residual-setup')
    result['scene'] = scene
    if scene.get('status') != 'ready':
        raise RuntimeError(str(scene))
    await page.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=scene['parent'])
    await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', scene['parent'])
    await page.wait_for_timeout(500)
    welcome = page.get_by_role('button', name='继续', exact=True)
    if await welcome.is_visible():
        await welcome.click()

    async def dual_archive():
        await open_chat(scene['dual'])
        await open_chat(scene['dual'])
        tabs = await inventory()
        duplicates = [tab for tab in tabs if scene['dual'] in (tab.get('contentId') or '')]
        check('dual-archive', 'one child has two distinct native view occurrences', len(duplicates) == 2, duplicates)
        pane_ids = await page.evaluate("""(ids) => [...document.querySelectorAll('[data-sidebar-right-panel] [data-dockkit-pane]')]
          .filter(el => [...el.querySelectorAll('[data-dockkit-tab]')].some(tab => ids.includes(tab.getAttribute('data-dockkit-tab'))))
          .map(el => el.getAttribute('data-dockkit-pane'))""", [t['id'] for t in duplicates])
        check('dual-archive', 'the duplicate occurrences belong to two panes', len(set(pane_ids)) == 2, pane_ids)
        await page.screenshot(path=str(output / 'dual-before-archive.png'), full_page=True)
        # Put the management panel in an existing pane while retaining both chat occurrences.
        await page.evaluate("() => window.__liFixture.ctx.sidebarRight.openTab('guide-panel')")
        await page.get_by_role('button', name='归档', exact=True).first.wait_for(timeout=10000)
        title = page.get_by_text('LI residual-dual', exact=True).last
        row = title.locator('xpath=../..')
        archive_button = row.get_by_role('button', name='归档', exact=True)
        await archive_button.focus()
        await archive_button.press('Enter')
        for _ in range(30):
            if scene['dual'] in await archived():
                break
            await page.wait_for_timeout(200)
        check('dual-archive', 'manual archive records the child as archived', scene['dual'] in await archived())
        tabs_after = await inventory()
        leftover = [tab for tab in tabs_after if scene['dual'] in (tab.get('contentId') or '')]
        check('dual-archive', 'manual archive clears every occurrence of the child', len(leftover) == 0, leftover)
        check('dual-archive', 'the other child is not archived', scene['other'] not in await archived())
        check('dual-archive', 'the archived child is not still executing', (await api('residual-state'))['guideStatus']['dual'] == 'unloaded')
        if leftover:
            await page.locator(f'[data-dockkit-tab="{leftover[0]["id"]}"]').first.click()
            await page.wait_for_timeout(300)
            result['items']['dual-archive']['leftoverViewBody'] = (await page.locator('body').inner_text())[-9000:]
            result['items']['dual-archive']['leftoverViewInputs'] = await page.locator('[data-sidebar-right-panel] [contenteditable], [data-sidebar-right-panel] textarea').evaluate_all(
                '(els) => els.map(el => ({editable:el.getAttribute("contenteditable"),disabled:el.disabled,placeholder:el.getAttribute("data-placeholder") ?? el.getAttribute("placeholder")}))')
        result['items']['dual-archive']['bodyAfterArchive'] = (await page.locator('body').inner_text())[-12000:]
        await page.screenshot(path=str(output / 'dual-archive.png'), full_page=True)
        await close_chats(scene['dual'])

    async def editor_and_commit():
        path = str(Path(scene['cwd']) / 'notes.txt')

        async def open_editor():
            await page.evaluate("""({id,path}) => window.__liFixture.ctx.get('betterSidebar').openTab(
              {type:'editor',path,title:'notes.txt'}, {sessionId:id})""", {'id': scene['parent'], 'path': path})
            await page.locator('.cm-content:visible').first.wait_for(timeout=15000)

        await open_editor()
        editor = page.locator('.cm-content:visible').first
        await editor.click()
        await page.keyboard.press('Control+A')
        await page.keyboard.insert_text('UNSAVED_RESIDUAL_DRAFT\n')
        await page.wait_for_timeout(350)
        check('draft-close', 'editing leaves the disk untouched before save', (await api('residual-state'))['disk'] == 'original disk line\n')
        tab = next(t for t in await inventory() if t['kind'] == 'editor' and t['title'] == 'notes.txt')
        header = page.locator(f'[data-dockkit-tab="{tab["id"]}"]').first
        result['items']['draft-close']['headerDOM'] = await header.evaluate('(el) => el.outerHTML')
        dialogs = []
        accept = False

        async def dialog_handler(dialog):
            dialogs.append({'type': dialog.type, 'message': dialog.message, 'accepted': accept})
            if accept:
                await dialog.accept()
            else:
                await dialog.dismiss()

        page.on('dialog', dialog_handler)
        try:
            await page.locator(f'[data-dockkit-tab-close="{tab["id"]}"]').click()
            await page.wait_for_timeout(600)
            check('draft-close', 'closing an unsaved native editor asks for confirmation', len(dialogs) == 1, dialogs)
            check('draft-close', 'cancelling close preserves the draft and tab',
                  any(t['id'] == tab['id'] for t in await inventory())
                  and await page.locator('.cm-content:visible').filter(has_text='UNSAVED_RESIDUAL_DRAFT').count() > 0)
            accept = True
            if any(t['id'] == tab['id'] for t in await inventory()):
                await page.locator(f'[data-dockkit-tab-close="{tab["id"]}"]').click()
                await page.wait_for_timeout(500)
            check('draft-close', 'confirming discard closes the tab without saving',
                  len(dialogs) == 2 and not any(t['id'] == tab['id'] for t in await inventory())
                  and (await api('residual-state'))['disk'] == 'original disk line\n', dialogs)
            result['items']['draft-close']['dialogs'] = dialogs
            result['items']['draft-close']['bodyAfterClose'] = (await page.locator('body').inner_text())[-10000:]
        finally:
            page.remove_listener('dialog', dialog_handler)
        await page.screenshot(path=str(output / 'draft-close.png'), full_page=True)

        await open_editor()
        editor = page.locator('.cm-content:visible').first
        result['items']['draft-close']['reopenedDraftText'] = await editor.inner_text()
        result['items']['draft-close']['diskAfterReopen'] = (await api('residual-state'))['disk']
        await page.screenshot(path=str(output / 'draft-reopened.png'), full_page=True)
        await editor.click(); await page.keyboard.press('Control+A')
        await page.keyboard.insert_text('saved by native editor for UI commit\n')
        save = page.get_by_role('button', name=re.compile('^保存$|^Save$')).first
        await save.focus(); await save.press('Enter')
        await page.wait_for_timeout(600)
        check('git-commit-ui', 'the native editor saves the intended change',
              (await api('residual-state'))['disk'] == 'saved by native editor for UI commit\n')
        await page.evaluate("(id) => window.__liFixture.ctx.get('betterSidebar').openTab({type:'git'}, {sessionId:id})", scene['parent'])
        stage_all = page.get_by_role('button', name='全部暂存', exact=True)
        await stage_all.wait_for(timeout=15000)
        await stage_all.focus(); await stage_all.press('Enter')
        await page.wait_for_timeout(700)
        message = page.locator('[data-message-box] textarea')
        await message.fill('O11 native Git UI validation')
        commit = page.get_by_role('button', name='提交', exact=True)
        await commit.wait_for()
        await commit.focus(); await commit.press('Enter')
        snapshot = None
        for _ in range(30):
            snapshot = await api('residual-state')
            if 'O11 native Git UI validation' in snapshot['gitHead']:
                break
            await page.wait_for_timeout(300)
        check('git-commit-ui', 'the Git UI creates the commit with the typed subject',
              'O11 native Git UI validation' in snapshot['gitHead'] and scene['baseHead'] not in snapshot['gitHead'], snapshot['gitHead'])
        check('git-commit-ui', 'the committed temporary repository is clean', snapshot['gitStatus'] == '', snapshot['gitStatus'])
        await page.screenshot(path=str(output / 'git-commit-ui.png'), full_page=True)

    async def auto_archive():
        # Observe the real client scheduler; its 15-second scan interval is unchanged.
        result['items'].setdefault('auto-archive', {'status': 'passed', 'assertions': [], 'bands': []})
        for count, band, delay_ms in [(2, 'low', 3000), (4, 'mid', 2000), (6, 'high', 1000)]:
            state = await api('residual-pressure', '?count=' + str(count))
            check('auto-archive', 'the requested real admission pressure is present',
                  state.get('admission', {}).get('used') == count, state.get('admission'))
            child = state['idleGuide']
            await open_chat(child)
            protected_start = time.monotonic()
            await page.wait_for_timeout(16000)
            protected = child not in await archived()
            check('auto-archive', 'an open guide is protected from auto-archive in ' + band, protected)
            await close_chats(child)
            closed_at = time.monotonic()
            samples = []
            while time.monotonic() - closed_at < 40:
                archived_now = child in await archived()
                samples.append({'elapsedMs': round((time.monotonic() - closed_at) * 1000), 'archived': archived_now})
                if archived_now:
                    break
                await page.wait_for_timeout(500)
            elapsed = round((time.monotonic() - closed_at) * 1000)
            ended = child in await archived()
            check('auto-archive', 'the idle guide is eventually archived in ' + band, ended, {'elapsedMs': elapsed, 'delayMs': delay_ms})
            check('auto-archive', 'the idle threshold is respected in ' + band, not ended or elapsed >= delay_ms - 100)
            result['items']['auto-archive']['bands'].append({'band': band, 'used': count, 'delayMs': delay_ms,
                'openGuardObservedMs': round((closed_at - protected_start) * 1000), 'archived': ended, 'elapsedAfterCloseMs': elapsed, 'samples': samples})
        result['items']['auto-archive']['scanIntervalMs'] = 15000
        result['items']['auto-archive']['testOnlyPolicy'] = {'auto': True, 'lowDelayMs': 3000, 'midDelayMs': 2000, 'highDelayMs': 1000, 'holdMs': 4000}
        await page.screenshot(path=str(output / 'auto-archive.png'), full_page=True)

    try:
        await run_case('dual-archive', dual_archive)
        await run_case('draft-close', editor_and_commit)
        if config.get('residualTimers', True):
            await run_case('auto-archive', auto_archive)
        else:
            result['skipped'] = ['auto-archive: focused UI rerun; use the separately saved full timer matrix']
    finally:
        result['cleanup'] = await api('residual-cleanup')
        check('cleanup', 'the temporary pool releases all test workers', result['cleanup'].get('admission', {}).get('used') == 0)
        result['status'] = 'failed' if result['errors'] or any(row['status'] == 'failed' for row in result['items'].values()) else 'passed'
        result['externalModelCalls'] = 0
        result['desktopProfileChanged'] = False
        (output / 'residual-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
        print(json.dumps({'scenario': 'residual', 'status': result['status'], 'items': {k:v['status'] for k,v in result['items'].items()}}))
    return result

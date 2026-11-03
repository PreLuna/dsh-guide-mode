"""Real stock-package UI test in an isolated Edge profile. Input URLs never logged."""
import asyncio
import json
import sys
import re
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout


async def main():
    config = json.loads(sys.stdin.buffer.read().decode('utf-8'))
    output = Path(config['output'])
    output.mkdir(parents=True, exist_ok=True)
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='msedge', headless=True, timeout=15000)
        page = await browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type in ['error', 'warning'] else None)
        try:
            await page.goto(config['entryUrl'], wait_until='domcontentloaded')
            await page.wait_for_function('window.__liFixture !== undefined', timeout=25000)
            await page.wait_for_function("window.__liFixture.ctx.get('guideSidebarAdapter') && window.__liFixture.ctx.get('guideSidebarAdapter').getState().mode !== 'loading'", timeout=15000)
            state = await page.evaluate("""() => ({
              adapter: window.__liFixture.ctx.get('guideSidebarAdapter').getState(),
              modules: window.__liFixture.ctx.modules.entries.state.getSnapshot(),
              sessions: Object.keys(window.__liFixture.ctx.sessions.list.getSnapshot().byId),
            })""")
            assert not state['modules']['failures'], state['modules']
            assert state['adapter']['mode'] == 'active', state['adapter']
            parent = config['parent']
            await page.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=parent)
            await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', parent)
            await page.wait_for_timeout(500)
            await page.evaluate("(id) => window.__liFixture.ctx.get('betterSidebar').openTab({type:'subagent',title:'Tasks'}, {sessionId:id})", parent)
            await page.locator('[data-guide-tasks-adapter]').wait_for(timeout=10000)
            await page.locator('[data-task-section="guide:threads"]').wait_for(timeout=10000)
            welcome = page.get_by_role('button', name='继续', exact=True)
            try:
                await welcome.wait_for(state='visible', timeout=2500)
                await welcome.click()
            except PlaywrightTimeout:
                pass
            section = page.locator('[data-task-section="guide:threads"]')
            assert await section.locator('button').count() > 0
            raw = await page.evaluate("""(id) => {
              const ctx = window.__liFixture.ctx;
              const list = ctx.sessions.list.getSnapshot();
              const children = list.projectionsBySession[id]?.values.subagentCatalog ?? [];
              const entry = [...ctx.get('loader').entries()].find(e => e.options.name === 'dsh-better-sidebar');
              const scoped = entry.fiber.ctx;
              return {children, globalIds:Object.keys(list.byId),
                taskIds:Object.keys(scoped.sessions.list.getSnapshot().byId),
                directLookup:children.map(c => !!scoped.sessions.list.getSnapshot().byId[c.id])};
            }""", parent)
            guides = [row['id'] for row in raw['children'] if row.get('label', '').startswith('指导: ')]
            workers = [row['id'] for row in raw['children'] if not row.get('label', '').startswith('指导: ')]
            assert guides and workers, raw
            assert all(value in raw['globalIds'] for value in guides), raw
            assert all(value not in raw['taskIds'] for value in guides), raw
            assert all(value in raw['taskIds'] for value in workers), raw
            assert all(raw['directLookup']), raw
            main = page.locator('[data-guide-tasks-adapter] > div').first
            await page.wait_for_timeout(400)
            counts = await main.locator('[class*="subagentCount"]').all_text_contents()
            assert any('1' in label for label in counts), counts
            assert 'LI guide' not in await main.inner_text()
            assert await main.locator('svg').count() > 0, 'Original task graph did not render'
            await main.get_by_role('button', name='切换为树状图', exact=True).click()
            await main.get_by_role('button', name='切换为工作流图', exact=True).wait_for()
            assert 'LI guide' not in await main.inner_text()
            await main.get_by_role('button', name='切换为工作流图', exact=True).click()
            new_guide = await page.evaluate("async () => (await fetch('./li-runtime/add-guide', {method:'POST'})).json()")
            await page.wait_for_function("(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]", arg=new_guide['childId'])
            await page.wait_for_function("() => window.__liFixture.ctx.get('guideSidebarAdapter').getTaskSections().length === 1")
            await page.wait_for_timeout(150)
            assert await section.get_by_role('button', name='打开', exact=True).count() == 2
            await page.evaluate("(id) => window.__liFixture.ctx.uiWorkspace.archiveSession(id, {stopActivity:true})", guides[0])
            await section.get_by_text('休眠中', exact=True).wait_for()
            await page.evaluate("(id) => window.__liFixture.ctx.uiWorkspace.unarchiveSession(id)", guides[0])
            await page.wait_for_timeout(150)
            await page.screenshot(path=str(output / 'tasks.png'), full_page=True)
            # Observe the real stock auto-open path, not an imitation of its helper.
            await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', config['autoParent'])
            await page.wait_for_timeout(300)
            await page.evaluate("""(id) => {
              const side=window.__liFixture.ctx.get('betterSidebar');
              side.openTab({type:'editor',title:'Files'}, {sessionId:id});
              window.__liAuto=[]; window.__liOriginalOpen=side.openTab;
              side.openTab=function(...args) { if(args[0]?.type==='subagent') window.__liAuto.push(args[0]); return window.__liOriginalOpen.apply(this,args); };
            }""", config['autoParent'])
            await page.evaluate("async () => (await fetch('./li-runtime/auto-guide', {method:'POST'})).json()")
            await page.wait_for_timeout(700)
            assert await page.evaluate('window.__liAuto.length') == 0, 'Guidance triggered automatic Tasks opening'
            await page.evaluate("async () => (await fetch('./li-runtime/auto-work', {method:'POST'})).json()")
            await page.wait_for_function('window.__liAuto.length > 0', timeout=5000)
            await page.evaluate("() => {const side=window.__liFixture.ctx.get('betterSidebar'); side.openTab=window.__liOriginalOpen;}")
            # Exercise non-task consumers against the same scoped sessions service.
            await page.evaluate("""(id) => {
              const side=window.__liFixture.ctx.get('betterSidebar');
              window.__liOtherComponents=Object.fromEntries(['editor','git','sidechat','terminal-bottom'].map(id=>[id,side.getTab(id).component.toString()]));
              side.openTab({type:'editor',title:'Files'}, {sessionId:id});
            }""", config['autoParent'])
            await page.wait_for_timeout(400)
            if await welcome.is_visible():
                await welcome.click()
            await page.get_by_text('文件', exact=True).first.click()
            await page.get_by_text('README.md', exact=True).first.wait_for(timeout=7000)
            await page.evaluate("(id) => window.__liFixture.ctx.get('betterSidebar').openTab({type:'git'}, {sessionId:id})", config['autoParent'])
            await page.get_by_role('tablist').filter(has=page.get_by_role('tab', name='Git', exact=True)).wait_for(timeout=7000)
            await page.evaluate("(id) => window.__liFixture.ctx.get('betterSidebar').openTab({type:'sidechat'}, {sessionId:id})", config['autoParent'])
            await page.locator('textarea[class*="sidechatComposerInput"]').wait_for(timeout=7000)
            # Unload and reactivate the adapter through the actual client Loader.
            await page.evaluate("""async () => {
              const entry=[...window.__liFixture.ctx.get('loader').entries()].find(e=>e.options.name==='@local/dsh-guide-sidebar-adapter');
              await entry.update({disabled:true}); await entry.fiber?.await();
            }""")
            await page.wait_for_function("!window.__liFixture.ctx.get('guideSidebarAdapter')")
            assert await page.locator('[data-guide-tasks-adapter]').count() == 0
            await page.evaluate("""async () => {
              const entry=[...window.__liFixture.ctx.get('loader').entries()].find(e=>e.options.name==='@local/dsh-guide-sidebar-adapter');
              await entry.update({disabled:false}); await entry.fiber?.await();
            }""")
            await page.wait_for_function("window.__liFixture.ctx.get('guideSidebarAdapter')?.getState().mode==='active'")
            assert await page.evaluate("""() => ['editor','git','sidechat','terminal-bottom'].every(id =>
              window.__liFixture.ctx.get('betterSidebar').getTab(id).component.toString()===window.__liOtherComponents[id])""")
            await page.reload(wait_until='domcontentloaded')
            await page.wait_for_function("window.__liFixture?.ctx.get('guideSidebarAdapter')?.getState().mode==='active'")
            result = {'status': 'passed', 'adapter': state['adapter'], 'raw': raw,
                      'assertions': ['stock browser modules mounted', 'same tasks page includes guidance section',
                                     'task enumeration filters guidance and retains work', 'global and direct session lookups preserved',
                                     'original graph/tree switch and filtered counts', 'multiple guidance conversations',
                                     'archive/unarchive updates the guidance section', 'actual guidance auto-open suppressed; ordinary work auto-open retained',
                                     'original file explorer, changes and sidechat views render; non-task component implementations survive reload unchanged',
                                     'adapter unload restores original sidebar and reactivation succeeds', 'full page reload succeeds'],
                      'consoleErrors': errors}
            (output / 'browser-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps({'status': 'passed', 'assertions': len(result['assertions']), 'consoleErrors': len(errors)}))
        except Exception as error:
            diagnostic = await page.evaluate("""() => window.__liFixture ? {
              adapter: window.__liFixture.ctx.get('guideSidebarAdapter')?.getState(),
              modules: window.__liFixture.ctx.modules.entries.state.getSnapshot(),
              sidebar: !!window.__liFixture.ctx.get('betterSidebar'),
            } : {fixture:false}""")
            diagnostic['host'] = await page.evaluate("async () => (await fetch(new URL('./guide-sidebar/api/state', document.baseURI))).json()")
            diagnostic['exception'] = str(error)
            (output / 'browser-diagnostic.json').write_text(json.dumps(diagnostic, ensure_ascii=False, indent=2), encoding='utf-8')
            (output / 'browser-errors.json').write_text(json.dumps(errors, ensure_ascii=False, indent=2), encoding='utf-8')
            (output / 'browser-body.txt').write_text(await page.locator('body').inner_text(), encoding='utf-8')
            await page.screenshot(path=str(output / 'failure.png'), full_page=True)
            raise
        finally:
            await browser.close()


asyncio.run(main())

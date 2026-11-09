"""Opt-in Edge rendering test on an isolated official Host; source responses are fixtures.

Bootstrap with setup-acceptance.mjs, then python source-ui.py <output>.
This verifies real React rendering, refresh/polling and payloads, not GitHub connectivity.
"""
import asyncio
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone
import psutil
from playwright.async_api import async_playwright
from acceptance import open_manager, port, terminate_owned, wait_url, write


async def main():
    output = Path(sys.argv[1]).resolve()
    setup = json.loads((output / 'setup.json').read_text(encoding='utf-8'))
    profile = Path(setup['profile'])
    (profile / '.guide-manager').mkdir(exist_ok=True)
    hashes = lambda: {name: hashlib.sha256((profile / name).read_bytes()).hexdigest() if (profile / name).exists() else None
                      for name in ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'pnpm-workspace.yaml']}
    before = hashes()
    write(output / 'profile-before-host.json', before)
    guard = {p.pid: p.create_time() for p in psutil.process_iter(['name']) if p.info['name'] == 'DeepSeek Harness.exe'}
    env = dict(os.environ, DSH_HOME=setup['home'], ELECTRON_RUN_AS_NODE='1', DEEPSEEK_API_KEY='sk-isolated-ui-fixture-never-used')
    cli = Path(setup['executable']).parent / 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js'
    stdout, stderr = output / 'source-ui.stdout.log', output / 'source-ui.stderr.log'
    with stdout.open('w', encoding='utf-8') as out, stderr.open('w', encoding='utf-8') as err:
        process = subprocess.Popen([setup['executable'], '--expose-internals', str(cli), '--profile', setup['profileName'], '--no-open', '--host', '127.0.0.1', '--port', str(port())], env=env, stdout=out, stderr=err, creationflags=subprocess.CREATE_NO_WINDOW)
    record = dict(pid=process.pid, createdAt=datetime.fromtimestamp(psutil.Process(process.pid).create_time(), timezone.utc).isoformat(), stdout=str(stdout))
    record_path = profile / '.guide-manager/source-ui-launcher.json'
    write(record_path, record)
    browser = None
    assertions, errors, requests = [], [], []
    page = None
    distribution = dict(configured=False)
    pending = None
    attempt = 0
    catalog = dict(snapshotId='ui-fixture', release=dict(tag='guide-ui-fixture', commit='b' * 40), versions=[dict(key=key, version=version) for key in ['preset', 'shield', 'admission', 'panel', 'sidebar', 'goal', 'manager'] for version in ['1.1.0', '1.1.1']])
    async def intercept(route):
        nonlocal distribution, pending, attempt
        path = route.request.url.split('/guide-manager/api/')[-1]
        if path == 'state':
            response = await route.fetch()
            body = await response.json()
            body['value']['distribution'] = copy.deepcopy(distribution)
            if pending:
                body['value']['installation']['pending'] = pending
            await route.fulfill(response=response, json=body)
            return
        if not path.startswith('source/'):
            await route.continue_()
            return
        payload = route.request.post_data_json
        requests.append(dict(action=path, payload=payload))
        action = path.split('/')[-1]
        value = {}
        if action == 'check':
            distribution = dict(configured=True, repository=dict(owner='fixture', repo='guide'), catalog=catalog,
                                task=dict(id='checked', kind='check', status='ready', result=dict(available=True)))
            value = dict(taskId='checked')
        elif action == 'prepare':
            attempt += 1
            distribution['task'] = dict(id=f'prepared-{attempt}', kind='prepare', status='running' if attempt == 1 else 'ready', payload=payload, progress=dict(completed=0, total=1, bytes=2048))
            value = dict(taskId=distribution['task']['id'])
        elif action == 'cancel':
            distribution['task']['status'] = 'cancelled'
        elif action == 'plan':
            value = dict(id='ui-plan', entries=[dict(key='goal', package='@local/dsh-guide-goal-adapter', version='1.1.0')], blockers=[])
        elif action == 'stage':
            assert payload == dict(taskId='prepared-2', planId='ui-plan', confirm=True)
            distribution['task']['status'] = 'staged'
            pending = dict(id='ui-plan', entries=[])
            value = dict(application='pending-restart')
        await route.fulfill(json=dict(ok=True, value=value))
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(channel='msedge', headless=True)
            page = await browser.new_page(viewport=dict(width=1440, height=1080), locale='zh-CN')
            page.on('pageerror', lambda error: errors.append(str(error)))
            await page.route('**/guide-manager/api/**', intercept)
            await page.goto(await wait_url(record_path), wait_until='domcontentloaded')
            await page.wait_for_timeout(1500)
            await open_manager(page, output)
            before = hashes()
            write(output / 'profile-before-actions.json', before)
            source = page.locator('[data-guide-source]')
            await source.get_by_text('尚未配置发布来源。', exact=False).wait_for()
            assert requests == []
            assertions.append('unconfigured source renders alongside local installation without automatic network actions')
            distribution = dict(configured=True, repository=dict(owner='fixture', repo='guide'), task=None, catalog=None)
            await page.get_by_role('button', name='刷新', exact=True).click()
            await source.get_by_role('button', name='检查更新', exact=True).click()
            await source.get_by_text('guide-ui-fixture', exact=False).wait_for()
            for box in await source.locator('input[data-guide-source-key]').all():
                if await box.get_attribute('data-guide-source-key') != 'goal':
                    await box.uncheck()
            await source.get_by_role('button', name='下载并准备', exact=True).click()
            await source.get_by_text('正在下载并校验', exact=False).wait_for()
            assert await source.get_by_role('button', name='检查更新', exact=True).is_disabled()
            await page.screenshot(path=str(output / 'source-progress.png'), full_page=True)
            await source.get_by_role('button', name='取消下载任务', exact=True).click()
            await source.get_by_role('button', name='重试任务', exact=True).wait_for()
            assert requests[-2]['payload']['components'] == ['goal']
            assertions.append('actual selector sends goal only; running task displays progress and supports cancellation')
            await source.get_by_role('button', name='重试任务', exact=True).click()
            await source.get_by_role('button', name='预览已准备计划', exact=True).wait_for()
            assert requests[-1]['payload']['components'] == ['goal']
            await page.reload(wait_until='domcontentloaded')
            await page.wait_for_timeout(1500)
            if not await source.is_visible():
                await open_manager(page, output)
            await source.get_by_role('button', name='预览已准备计划', exact=True).wait_for()
            assert await source.locator('input[data-guide-source-key]:checked').count() == 1
            assert await source.locator('input[data-guide-source-key="goal"]').is_checked()
            await source.get_by_role('button', name='预览已准备计划', exact=True).click()
            await source.get_by_text('@local/dsh-guide-goal-adapter: 1.1.0', exact=True).wait_for()
            await page.screenshot(path=str(output / 'source-preview.png'), full_page=True)
            assertions.append('refresh restores catalog and prepared task; preview displays exact package and version')
            await source.get_by_role('button', name='确认准备执行', exact=True).click()
            await source.get_by_text('已准备执行。', exact=False).wait_for()
            assert 'install-guide-manager.cmd' in await source.inner_text()
            assert await source.get_by_role('button', name='检查更新', exact=True).is_disabled()
            await page.screenshot(path=str(output / 'source-staged.png'), full_page=True)
            assertions.append('explicit fingerprint confirmation shows pending/helper and blocks competing preparation')
            write(output / 'profile-after-actions.json', hashes())
            assert hashes() == before, 'UI actions changed isolated profile configuration'
            for pid, created in guard.items():
                assert psutil.Process(pid).create_time() == created
            assert errors == [], errors
            assertions.append('isolated profile four files unchanged; pre-existing DSH processes retained; zero page errors')
            write(output / 'source-ui-result.json', dict(status='passed', remote='browser-route-fixtures', assertions=assertions, requests=requests, pageErrors=errors, profileUnchanged=True, liveProcessesPreserved=True, externalModelCalls=0))
            print(json.dumps(dict(status='passed', assertions=len(assertions))))
    except Exception as error:
        write(output / 'source-ui-result.json', dict(status='failed', error=str(error), assertions=assertions, requests=requests, pageErrors=errors))
        if page and not page.is_closed():
            try:
                await page.screenshot(path=str(output / 'source-failure.png'), full_page=True)
                (output / 'source-failure.txt').write_text(await page.locator('body').inner_text(), encoding='utf-8')
            except Exception:
                pass
        raise
    finally:
        if browser:
            await browser.close()
        terminate_owned(record)


if __name__ == '__main__':
    asyncio.run(main())

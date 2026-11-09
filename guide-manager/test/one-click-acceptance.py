"""Opt-in actual panel -> independent worker -> restart -> automatic return.
Only initial Host startup is performed by this harness. No helper is run by it.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
import psutil
from playwright.async_api import async_playwright
from acceptance import open_manager, port, state as raw_state, terminate_owned, wait_url, write


async def state(page):
    return await asyncio.wait_for(raw_state(page), timeout=8)


async def main():
    output = Path(sys.argv[1]).resolve()
    kind = sys.argv[2] if len(sys.argv) > 2 else 'web'
    setup = json.loads((output / 'setup.json').read_text(encoding='utf-8'))
    profile = Path(setup['profile']); state_dir = profile / '.guide-manager'
    state_dir.mkdir(exist_ok=True); record_path = state_dir / 'launcher.json'
    env = dict(os.environ, DSH_HOME=setup['home'], DEEPSEEK_API_KEY='sk-one-click-isolated-no-model-inference')
    for name in ['DSH_GUIDE_GITHUB_TOKEN', 'DSH_GUIDE_RELEASE_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN']:
        env.pop(name, None)
    debug_port, listen_port = port(), port()
    stdout, stderr = output / 'initial.stdout.log', output / 'initial.stderr.log'
    user_data = output / 'electron-user-data'
    if kind == 'web':
        env['ELECTRON_RUN_AS_NODE'] = '1'
        cli = Path(setup['executable']).parent / 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js'
        args = [setup['executable'], '--expose-internals', str(cli), '--profile', setup['profileName'], '--no-open', '--host', '127.0.0.1', '--port', str(listen_port)]
    else:
        env.pop('ELECTRON_RUN_AS_NODE', None)
        args = [setup['executable'], '--user-data-dir=' + str(user_data), '--remote-debugging-port=' + str(debug_port)]
    guard_arg = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--guard-file=')), None)
    guard = json.loads(Path(guard_arg).read_text()) if guard_arg else {str(p.pid): p.create_time() for p in psutil.process_iter(['name']) if p.info['name'] == 'DeepSeek Harness.exe'}
    with stdout.open('w', encoding='utf-8') as out, stderr.open('w', encoding='utf-8') as err:
        process = subprocess.Popen(args, env=env, stdout=out, stderr=err, creationflags=subprocess.CREATE_NO_WINDOW)
    record = dict(schema=1, kind=kind, pid=process.pid, createdAt=datetime.fromtimestamp(psutil.Process(process.pid).create_time(), timezone.utc).isoformat(), executable=setup['executable'], home=setup['home'], profile=setup['profile'], port=listen_port, userData=str(user_data), debugPort=debug_port, stdout=str(stdout), stderr=str(stderr))
    write(record_path, record)
    browser = page = None
    assertions, errors, diagnostics, executions = [], [], [], []
    transitioning = False
    watched = set()
    def watch(target):
        if target in watched: return
        watched.add(target)
        def error(value):
            message = str(value)
            if transitioning and message == 'conversation.input: sessions service unavailable': diagnostics.append(message)
            else: errors.append(message)
        target.on('pageerror', error)
    def hashes():
        return {name: hashlib.sha256((profile / name).read_bytes()).hexdigest() if (profile / name).exists() else None for name in ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'pnpm-workspace.yaml']}
    def latest():
        file = state_dir / 'execution/latest.json'
        return json.loads(file.read_text(encoding='utf-8'))['id'] if file.exists() else None
    async def save(label, value):
        write(output / f'{label}-state.json', value)
        await page.screenshot(path=str(output / f'{label}.png'), full_page=True)
    try:
        async with async_playwright() as playwright:
            async def connect_desktop():
                nonlocal browser, page
                if browser:
                    try: await browser.close()
                    except Exception: pass
                browser = page = None
                for _ in range(160):
                    try:
                        browser = await playwright.chromium.connect_over_cdp(f'http://127.0.0.1:{debug_port}')
                        pages = [p for ctx in browser.contexts for p in ctx.pages if p.url.startswith('dsh-app://app')]
                        if pages: page = pages[0]; watch(page); return
                    except Exception: pass
                    await asyncio.sleep(.5)
                raise RuntimeError('desktop-not-connected')
            if kind == 'web':
                browser = await playwright.chromium.launch(channel='msedge', headless=True)
                page = await browser.new_page(viewport=dict(width=1440, height=1080), locale='zh-CN')
                watch(page)
                await page.goto(await wait_url(record_path), wait_until='domcontentloaded')
            else: await connect_desktop()
            await page.wait_for_timeout(1500)
            await open_manager(page, output)
            initial = await state(page)
            assert initial['execution']['available'], initial['execution']
            assert all(c['status'] == 'missing' for c in initial['components'])
            async def ready(kind=None, previous=None):
                for _ in range(180):
                    value = await state(page)
                    task = value['distribution'].get('task')
                    if task and (kind is None or task['kind'] == kind) and task['id'] != previous and task['status'] != 'running':
                        assert value['distribution']['task']['status'] == 'ready', value['distribution']['task']
                        return value
                    await asyncio.sleep(.5)
                raise RuntimeError('download-timeout')
            async def click_and_wait(confirm, label):
                nonlocal transitioning
                previous = latest(); old_record = json.loads(record_path.read_text(encoding='utf-8-sig'))
                old_tree = {old_record['pid'], *[p.pid for p in psutil.Process(old_record['pid']).children(recursive=True)]}
                if kind == 'web' and not executions and '--derive-web-record' in sys.argv:
                    record_path.unlink()
                transitioning = True
                await confirm.click()
                job = None
                deadline = time.monotonic() + 180
                reattached = kind == 'web'
                while time.monotonic() < deadline:
                    current = latest()
                    if current and current != previous:
                        job = current
                        try:
                            status = json.loads((state_dir / 'execution' / job / 'status.json').read_text(encoding='utf-8'))
                        except (PermissionError, json.JSONDecodeError):
                            # A native writer can briefly hold the Windows replacement handle.
                            await asyncio.sleep(.1)
                            continue
                        if status['status'] in ['failed', 'interrupted']: raise RuntimeError(f'{label}: {status}; inspect retained execution log')
                        if kind == 'desktop' and not reattached:
                            new_record = json.loads(record_path.read_text(encoding='utf-8-sig'))
                            if new_record['pid'] != old_record['pid']:
                                await connect_desktop(); reattached = True
                        if reattached:
                            try:
                                value = await state(page)
                                if value['execution'].get('task', {}).get('id') == job and value['execution']['task']['status'] == 'completed':
                                    # The product, not this test, must return to the Guide tab.
                                    try:
                                        await page.locator('[data-guide-execution]').get_by_text(re.compile('^(执行完成，重启后的版本和运行状态已核对。|Execution complete. Versions and health verified after restart.)$')).wait_for(timeout=20000)
                                    except Exception:
                                        await page.screenshot(path=str(output / (label + '-failure.png')), full_page=True)
                                        (output / (label + '-failure-dom.txt')).write_text(await page.locator('body').inner_text(), encoding='utf-8')
                                        write(output / (label + '-failure-state.json'), value)
                                        write(output / (label + '-failure-ui.json'), dict(url=page.url, marker=await page.evaluate("localStorage.getItem('dsh-guide-manager.execution')")))
                                        raise
                                    launch = json.loads((state_dir / 'execution' / job / 'launch.json').read_text(encoding='utf-8'))
                                    assert launch['parentPid'] not in old_tree
                                    assert launch['shellVersion'].startswith('5.1')
                                    assert await page.evaluate("localStorage.getItem('dsh-guide-manager.execution')") is None
                                    executions.append(dict(label=label, id=job, independentWorker=True, nativePowerShell=launch['shellVersion'], automaticReturn=True))
                                    transitioning = False
                                    await save(label, value)
                                    return value
                            except AssertionError: raise
                            except Exception as error:
                                if 'Timeout' in type(error).__name__ and type(error).__module__.startswith('playwright'): raise
                    await asyncio.sleep(.3)
                raise RuntimeError(label + ': automatic completion timed out')
            source = lambda: page.locator('[data-guide-source]')
            await source().get_by_role('button', name=re.compile('^(检查更新|Check for updates)$')).click()
            await ready('check')
            async def prepare(operation, label, target=None, version=None):
                await source().locator('[aria-label="source-operation"]').select_option(operation)
                if operation == 'upgrade': await source().locator(f'[aria-label="source-target-{target}"]').select_option(version)
                if operation == 'manager-upgrade': await source().locator('[aria-label="source-manager-version"]').select_option(version)
                before = hashes()
                previous_task = (await state(page))['distribution'].get('task', {}).get('id')
                await source().get_by_role('button', name=re.compile('^(下载并准备|Download and prepare)$')).click()
                await ready('prepare', previous_task); assert hashes() == before
                try:
                    await source().get_by_role('button', name=re.compile('^(预览已准备计划|Preview prepared plan)$')).click()
                except Exception:
                    (output / (label + '-prepare-failure-dom.txt')).write_text(await page.locator('body').inner_text(), encoding='utf-8')
                    write(output / (label + '-prepare-failure-state.json'), await state(page))
                    await page.screenshot(path=str(output / (label + '-prepare-failure.png')), full_page=True)
                    raise
                confirm = source().get_by_role('button', name=re.compile('^(确认执行并重启|Confirm execution and restart)$'))
                await confirm.wait_for(); assert await confirm.is_enabled(), await source().inner_text()
                assert re.search('保存工作|Save your work', await source().inner_text())
                return await click_and_wait(confirm, label)
            installed = await prepare('install', 'installed-one-click')
            assert installed['installation']['verification'] == 'verified-running'
            assert all(c['version'] == '1.1.0' and c['enabled'] for c in installed['components'])
            baseline = hashes()
            assertions.append('panel confirms exact install, starts independent native worker and returns automatically after restart')
            single = await prepare('upgrade', 'single-upgraded-one-click', 'panel', '1.1.1')
            assert single['packageManagement']['verification'] == 'verified-running'
            assert next(c for c in single['components'] if c['key']=='panel')['version']=='1.1.1'
            transaction = single['packageManagement']['result']['transactionId']
            await page.get_by_role('button', name=re.compile(r'(预览包版本恢复|Preview package recovery).*' + re.escape(transaction))).click()
            restored = await click_and_wait(page.locator('[data-guide-packages]').get_by_role('button', name=re.compile('^(确认执行并重启|Confirm execution and restart)$')), 'restored-one-click')
            assert all(c['version']=='1.1.0' for c in restored['components'])
            assert hashes()==baseline
            assertions.append('independent upgrade and exact old-graph restore require only panel confirmation; page reconnects automatically')
            if '--smoke' not in sys.argv:
                coupled = await prepare('upgrade', 'coupled-one-click', 'shield', '1.1.1')
                assert {c['key']:c['version'] for c in coupled['components']}['panel']=='1.2.0'
                maintenance = lambda: page.locator('[data-guide-maintenance]')
                async def maintain(keys, button, label):
                    for box in await maintenance().locator('[data-guide-maintenance-key]').all(): await box.set_checked(await box.get_attribute('data-guide-maintenance-key') in keys)
                    await maintenance().get_by_role('button', name=re.compile(button)).click()
                    return await click_and_wait(maintenance().get_by_role('button', name=re.compile('^(确认执行并重启|Confirm execution and restart)$')),label)
                repaired = await maintain(['shield'], '^(预览原版本修复|Preview same-version repair)$', 'repaired-one-click')
                assert repaired['maintenance']['verification']=='verified-running'
                removed = await maintain(['goal'], '^(预览卸载|Preview uninstall)$', 'uninstalled-one-click')
                assert not next(c for c in removed['components'] if c['key']=='goal')['installed']
                reinstalled = await prepare('install', 'reinstalled-one-click')
                assert next(c for c in reinstalled['components'] if c['key']=='goal')['installed']
                assertions.append('coupled upgrade, repair, dependency-aware goal uninstall and reinstall all complete through the panel')
                local_manager = next((arg.split('=', 1)[1] for arg in sys.argv if arg.startswith('--manager-local=')), None)
                if local_manager:
                    await maintenance().locator('[aria-label="manager-target-version"]').select_option(local_manager)
                    await maintenance().get_by_role('button', name=re.compile('^(预览管理器升级|Preview manager upgrade)$')).click()
                    manager = await click_and_wait(maintenance().get_by_role('button', name=re.compile('^(确认执行并重启|Confirm execution and restart)$')), 'manager-upgraded-one-click')
                    assert manager['manager']['version']==local_manager
                    assertions.append('manager replaces itself from an explicit local same-protocol target and automatically returns to the verified Guide page')
                elif setup.get('oneClickManagerTarget'):
                    await source().get_by_role('button', name=re.compile('^(检查更新|Check for updates)$')).click(); await ready()
                    manager = await prepare('manager-upgrade', 'manager-upgraded-one-click', version=setup['oneClickManagerTarget'])
                    assert manager['manager']['version']==setup['oneClickManagerTarget']
                    assertions.append('manager replaces itself through copied controller, reopens the Guide page and verifies target version')
            assert not errors, errors
            for pid, created in guard.items(): assert psutil.Process(int(pid)).create_time()==created
            write(output/'result.json',dict(status='passed',kind=kind,assertions=assertions,executions=executions,pageErrors=errors,knownDiagnostics=diagnostics,externalHelperInvocationsByTest=0,liveProcessesPreserved=True,modelInferenceCalls=0))
            print(json.dumps(dict(status='passed',kind=kind,executions=len(executions))))
    except Exception as error:
        write(output/'result.json',dict(status='failed',kind=kind,error=str(error),assertions=assertions,executions=executions,pageErrors=errors,knownDiagnostics=diagnostics))
        raise
    finally:
        if kind=='web' and browser: await browser.close()
        terminate_owned(json.loads(record_path.read_text(encoding='utf-8-sig')))


if __name__=='__main__': asyncio.run(main())

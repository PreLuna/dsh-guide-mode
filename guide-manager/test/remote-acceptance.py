"""Opt-in real private GitHub -> manager UI -> official cold helpers, Edge/Electron.

Requires a setup-acceptance profile with a packed manager and source.json.
Credentials are inherited from the environment or captured from gh in memory only.
No browser/API responses are mocked. Only the recorded isolated process is stopped.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone
import psutil
from playwright.async_api import async_playwright
from acceptance import open_manager, port, state, terminate_owned, wait_url, write


async def main():
    output = Path(sys.argv[1]).resolve()
    kind = sys.argv[2] if len(sys.argv) > 2 else 'web'
    setup = json.loads((output / 'setup.json').read_text(encoding='utf-8'))
    profile = Path(setup['profile'])
    state_dir = profile / '.guide-manager'
    state_dir.mkdir(exist_ok=True)
    record_path = state_dir / 'launcher.json'
    token = os.environ.get('DSH_GUIDE_GITHUB_TOKEN') or subprocess.check_output(['gh', 'auth', 'token'], text=True, creationflags=subprocess.CREATE_NO_WINDOW).strip()
    env = dict(os.environ, DSH_HOME=setup['home'], DSH_GUIDE_GITHUB_TOKEN=token, DEEPSEEK_API_KEY='sk-isolated-acceptance-not-used-for-inference')
    guard = {p.pid: p.create_time() for p in psutil.process_iter(['name']) if p.info['name'] == 'DeepSeek Harness.exe'}
    debug_port, listen_port = port(), port()
    user_data = output / 'electron-user-data'
    stdout, stderr = output / 'initial.stdout.log', output / 'initial.stderr.log'
    if kind == 'web':
        env['ELECTRON_RUN_AS_NODE'] = '1'
        cli = Path(setup['executable']).parent / 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js'
        args = [setup['executable'], '--expose-internals', str(cli), '--profile', setup['profileName'], '--no-open', '--host', '127.0.0.1', '--port', str(listen_port)]
    else:
        env.pop('ELECTRON_RUN_AS_NODE', None)
        args = [setup['executable'], '--user-data-dir=' + str(user_data), '--remote-debugging-port=' + str(debug_port)]
    with stdout.open('w', encoding='utf-8') as out, stderr.open('w', encoding='utf-8') as err:
        process = subprocess.Popen(args, env=env, stdout=out, stderr=err, creationflags=subprocess.CREATE_NO_WINDOW)
    record = dict(schema=1, kind=kind, pid=process.pid, createdAt=datetime.fromtimestamp(psutil.Process(process.pid).create_time(), timezone.utc).isoformat(), executable=setup['executable'], home=setup['home'], profile=setup['profile'], port=listen_port, userData=str(user_data), debugPort=debug_port, stdout=str(stdout), stderr=str(stderr))
    write(record_path, record)
    page = browser = None
    errors, diagnostics, assertions = [], [], []
    transitioning = False
    watched = set()
    def watch(target):
        if target in watched:
            return
        watched.add(target)
        def error(value):
            message = str(value)
            if transitioning and message == 'conversation.input: sessions service unavailable':
                diagnostics.append(message)
            else:
                errors.append(message)
        target.on('pageerror', error)
    def hashes():
        return {name: hashlib.sha256((profile / name).read_bytes()).hexdigest() if (profile / name).exists() else None for name in ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'pnpm-workspace.yaml']}
    async def save(label, value=None):
        write(output / f'{label}-state.json', value or await state(page))
        await page.screenshot(path=str(output / f'{label}.png'), full_page=True)
    try:
        async with async_playwright() as playwright:
            async def attach(initial=False):
                nonlocal browser, page
                if kind == 'web':
                    if browser is None:
                        browser = await playwright.chromium.launch(channel='msedge', headless=True)
                        page = await browser.new_page(viewport=dict(width=1440, height=1080), locale='zh-CN')
                    await page.goto(await wait_url(record_path), wait_until='domcontentloaded')
                else:
                    if browser:
                        await browser.close()
                    browser = None
                    for _ in range(160):
                        try:
                            browser = await playwright.chromium.connect_over_cdp(f'http://127.0.0.1:{debug_port}')
                            pages = [p for ctx in browser.contexts for p in ctx.pages if p.url.startswith('dsh-app://app')]
                            if pages:
                                page = pages[0]
                                break
                        except Exception:
                            pass
                        await asyncio.sleep(.5)
                    if browser is None or page is None:
                        raise RuntimeError('isolated-desktop-did-not-start')
                watch(page)
                await page.wait_for_timeout(1500 if initial else 500)
                await open_manager(page, output)
            async def task_ready():
                for _ in range(240):
                    value = await state(page)
                    task = value['distribution'].get('task')
                    if task and task['status'] != 'running':
                        assert task['status'] == 'ready', json.dumps(task)
                        return value
                    await asyncio.sleep(.5)
                raise RuntimeError('remote-task-timeout')
            async def prepare(operation, version=None, target=None):
                source = page.locator('[data-guide-source]')
                await source.locator('[aria-label="source-operation"]').select_option(operation)
                if operation == 'upgrade':
                    await source.locator(f'[aria-label="source-target-{target}"]').select_option(version)
                elif operation == 'manager-upgrade':
                    await source.locator('[aria-label="source-manager-version"]').select_option(version)
                before = hashes()
                await source.get_by_role('button', name=re.compile('^(下载并准备|Download and prepare)$')).click()
                value = await task_ready()
                assert hashes() == before, 'remote preparation changed profile files'
                await source.get_by_role('button', name=re.compile('^(预览已准备计划|Preview prepared plan)$')).click()
                confirm = source.get_by_role('button', name=re.compile('^(确认准备执行|Confirm execution preparation)$'))
                await confirm.wait_for()
                assert await confirm.is_enabled(), await source.inner_text()
                await confirm.click()
                group = 'installation' if operation == 'install' else 'packageManagement' if operation == 'upgrade' else 'maintenance'
                for _ in range(50):
                    value = await state(page)
                    if value[group]['pending']:
                        return value
                    await asyncio.sleep(.2)
                raise RuntimeError('pending-not-observed')
            async def restart(label, mode, prepared=None, recovery=None):
                nonlocal transitioning
                transitioning = True
                if recovery:
                    command = ['pwsh', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', recovery['script'], '-Profile', setup['profile'], '-TransactionId', recovery['id']]
                else:
                    script = str(Path(prepared['helper']).parent / 'restart-guide-manager.ps1') if prepared else setup['helper']
                    command = ['pwsh', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Profile', setup['profile'], mode]
                with (output / f'{label}.stdout.log').open('w', encoding='utf-8') as out, (output / f'{label}.stderr.log').open('w', encoding='utf-8') as err:
                    worker = subprocess.Popen(command, env=env, stdout=out, stderr=err, creationflags=subprocess.CREATE_NO_WINDOW)
                    code = await asyncio.to_thread(worker.wait, timeout=180)
                assert code == 0, f'{label} helper failed; inspect retained logs'
                await attach()
                transitioning = False
                value = await state(page)
                await save(label, value)
                return value
            await attach(initial=True)
            initial = await state(page)
            assert initial['manager']['version'] == '1.1.0'
            assert all(c['status'] == 'missing' for c in initial['components'])
            assert not initial['installation']['catalog']['available'], 'local catalog must not drive this test'
            before = hashes()
            await page.locator('[data-guide-source]').get_by_role('button', name=re.compile('^(检查更新|Check for updates)$')).click()
            checked = await task_ready()
            assert checked['distribution']['catalog']['release']['tag'] == 'guide-v1.2.0'
            assert not list((state_dir / 'package-cache').glob('*.tgz'))
            assert hashes() == before
            await save('real-source-checked', checked)
            assertions.append('packed manager-only profile checks real private stable metadata without downloading component packages')
            prepared = await prepare('install')
            await page.reload(wait_until='domcontentloaded')
            await open_manager(page, output)
            assert (await state(page))['installation']['pending']['id'] == prepared['installation']['pending']['id']
            await save('real-source-install-pending')
            installed = await restart('real-source-installed', '-Install')
            assert installed['installation']['verification'] == 'verified-running'
            assert all(c['version'] == '1.1.0' and c['enabled'] for c in installed['components'])
            baseline = hashes()
            assertions.append('real private six-package download -> exact UI confirmation -> official pnpm -> cold restart -> verified loaded components')
            single = await prepare('upgrade', '1.1.1', 'panel')
            assert [e['key'] for e in single['packageManagement']['pending']['entries'] if e['action'] == 'upgrade'] == ['panel']
            upgraded = await restart('real-source-single-upgraded', '-PackageChange')
            assert upgraded['packageManagement']['verification'] == 'verified-running'
            assert next(c for c in upgraded['components'] if c['key'] == 'panel')['version'] == '1.1.1'
            single_id = upgraded['packageManagement']['result']['transactionId']
            assertions.append('real remote panel 1.1.1 upgrade changes only panel and passes fresh-Host health check')
            coupled = await prepare('upgrade', '1.1.1', 'shield')
            assert {e['key'] for e in coupled['packageManagement']['pending']['entries'] if e['action'] == 'upgrade'} == {'panel', 'admission', 'shield'}
            coupled = await restart('real-source-coupled-upgraded', '-PackageChange')
            assert coupled['packageManagement']['verification'] == 'verified-running'
            assert next(c for c in coupled['components'] if c['key'] == 'panel')['version'] == '1.2.0'
            coupled_id = coupled['packageManagement']['result']['transactionId']
            assertions.append('real remote shield update previews and loads required panel/admission versions')
            # A newly restarted Host cannot authenticate. Recovery must still use local transactions.
            env['DSH_GUIDE_GITHUB_TOKEN'] = 'invalid-offline-recovery-credential'
            for transaction, label in [(coupled_id, 'real-source-coupled-restored-offline'), (single_id, 'real-source-baseline-restored-offline')]:
                await page.get_by_role('button', name=re.compile(r'(预览包版本恢复|Preview package recovery).*' + re.escape(transaction))).click()
                await page.get_by_role('button', name=re.compile('^(确认准备恢复|Confirm recovery preparation)$')).click()
                restored = await restart(label, '-PackageChange')
                assert restored['packageManagement']['verification'] == 'verified-running'
            assert all(c['version'] == '1.1.0' for c in restored['components'])
            assert hashes() == baseline
            await page.locator('[data-guide-source]').get_by_role('button', name=re.compile('^(检查更新|Check for updates)$')).click()
            for _ in range(120):
                denied = (await state(page))['distribution']['task']
                if denied['status'] != 'running':
                    break
                await asyncio.sleep(.5)
            assert denied['status'] == 'failed' and denied['error'] == 'github-http-401', denied
            write(output / 'offline-source-denied.json', dict(status=denied['status'], error=denied['error']))
            assertions.append('two transaction restores succeed with invalid remote credentials; exact old profile recovered and real source probe confirms access denied')
            # Restore credentials by an owned cold reload, then test independent manager update/recovery.
            env['DSH_GUIDE_GITHUB_TOKEN'] = token
            await restart('real-source-credentials-restored', '-Reload')
            await page.locator('[data-guide-source]').get_by_role('button', name=re.compile('^(检查更新|Check for updates)$')).click()
            await task_ready()
            manager = await prepare('manager-upgrade', '1.1.1')
            maintenance = manager['maintenance']
            assert maintenance['recoveryCommand'], 'external recovery must be shown before manager update'
            await save('real-source-manager-pending', manager)
            manager = await restart('real-source-manager-upgraded', '-Maintenance', maintenance)
            assert manager['manager']['version'] == '1.1.1'
            receipt = manager['maintenance']['result']
            env['DSH_GUIDE_GITHUB_TOKEN'] = 'invalid-offline-recovery-credential'
            recovered = await restart('real-source-manager-recovered-offline', '', recovery=dict(script=maintenance['recovery'], id=receipt['transactionId']))
            assert recovered['manager']['version'] == '1.1.0'
            assertions.append('real remote manager 1.1.1 update and external offline recovery load the expected versions')
            assert not errors, errors
            for pid, created in guard.items():
                assert psutil.Process(pid).create_time() == created, 'pre-existing DSH process affected'
            write(output / 'result.json', dict(status='known-diagnostic' if diagnostics else 'passed', kind=kind, source='actual-private-github', assertions=assertions, pageErrors=errors, knownDiagnostics=diagnostics, liveProcessesPreserved=True, modelInferenceCalls=0))
            print(json.dumps(dict(status='passed', kind=kind, assertions=len(assertions))))
    except Exception as error:
        write(output / 'result.json', dict(status='failed', kind=kind, error=str(error).replace(token, '[redacted]'), assertions=assertions, pageErrors=errors, knownDiagnostics=diagnostics))
        raise
    finally:
        if kind == 'web' and browser:
            await browser.close()
        terminate_owned(json.loads(record_path.read_text(encoding='utf-8-sig')))


if __name__ == '__main__':
    asyncio.run(main())

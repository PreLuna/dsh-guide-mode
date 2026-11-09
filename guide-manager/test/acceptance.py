"""Opt-in real Edge/Electron UI + production cold helper; only owned isolated processes."""
import asyncio
import json
import hashlib
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
import psutil
from playwright.async_api import async_playwright


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def terminate_owned(record):
    try:
        root = psutil.Process(record['pid'])
        if abs(root.create_time() - datetime.fromisoformat(record['createdAt'].replace('Z', '+00:00')).timestamp()) > 2:
            raise RuntimeError('Owned PID was reused')
        children = root.children(recursive=True)
        for child in reversed(children):
            try:
                child.kill()
            except psutil.NoSuchProcess:
                pass
        root.kill()
        psutil.wait_procs(children + [root], timeout=5)
    except psutil.NoSuchProcess:
        pass


async def wait_url(record_path):
    for _ in range(180):
        record = json.loads(record_path.read_text(encoding='utf-8-sig'))
        log = Path(record['stdout'])
        content = log.read_text(encoding='utf-8', errors='replace') if log.exists() else ''
        match = re.search(r'http://127\.0\.0\.1:\d+/\?token=[^\s\x1b]+', content)
        if match:
            return match.group(0)
        await asyncio.sleep(.5)
    raise RuntimeError('Isolated Host did not publish its URL; inspect private stdout/stderr logs')


async def open_manager(page, output):
    notice = page.get_by_role('button', name=re.compile(r'^(继续|Continue)$'))
    if await notice.count() and await notice.first.is_visible():
        await notice.first.click()
    await page.get_by_role('button', name=re.compile(r'^(插件|Plugins)$')).first.click(timeout=20000)
    await page.wait_for_timeout(700)
    (output / 'plugins-body.txt').write_text(await page.locator('body').inner_text(), encoding='utf-8')
    await page.screenshot(path=str(output / 'plugins.png'), full_page=True)
    await page.get_by_text(re.compile(r'^(指导|Guide)$')).first.click(timeout=20000)
    await page.locator('[data-guide-installation]').wait_for(timeout=20000)


async def state(page):
    return await page.evaluate("async () => {const r=await fetch(new URL('./guide-manager/api/state',document.baseURI)); const b=await r.json(); if(!b.ok) throw Error('manager state unavailable'); return b.value}")


async def main():
    output = Path(sys.argv[1]).resolve()
    kind = sys.argv[2] if len(sys.argv) > 2 else 'web'
    setup = json.loads((output / 'setup.json').read_text(encoding='utf-8'))
    profile = Path(setup['profile'])
    record_path = profile / '.guide-manager' / 'launcher.json'
    record_path.parent.mkdir(exist_ok=True)
    guard = {}
    for proc in psutil.process_iter(['name', 'create_time']):
        if proc.info['name'] == 'DeepSeek Harness.exe':
            guard[proc.pid] = proc.info['create_time']
    env = dict(os.environ, DSH_HOME=setup['home'], DEEPSEEK_API_KEY='sk-phase5-isolated-fixture-never-used-for-model-calls')
    stdout = output / 'initial.stdout.log'
    stderr = output / 'initial.stderr.log'
    debug_port = port()
    listen_port = port()
    user_data = output / 'electron-user-data'
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
    browser = None
    page = None
    errors = []
    known_diagnostics = []
    transitioning = False
    watched_pages = set()
    def watch_page(target):
        if target in watched_pages:
            return
        watched_pages.add(target)
        def page_error(error):
            message = str(error)
            if transitioning and message == 'conversation.input: sessions service unavailable':
                known_diagnostics.append(dict(message=message, phase='owned-host-stop-or-reconnect'))
            else:
                errors.append(message)
        target.on('pageerror', page_error)
    assertions = []
    try:
        async with async_playwright() as playwright:
            if kind == 'web':
                url = await wait_url(record_path)
                browser = await playwright.chromium.launch(channel='msedge', headless=True)
                page = await browser.new_page(viewport={'width': 1440, 'height': 1080}, locale='zh-CN')
                await page.goto(url, wait_until='domcontentloaded')
            else:
                for _ in range(100):
                    try:
                        browser = await playwright.chromium.connect_over_cdp(f'http://127.0.0.1:{debug_port}')
                        break
                    except Exception:
                        await asyncio.sleep(.5)
                if browser is None:
                    raise RuntimeError('Isolated desktop CDP did not start')
                for _ in range(120):
                    pages = [p for ctx in browser.contexts for p in ctx.pages if p.url.startswith('dsh-app://app')]
                    if pages:
                        page = pages[0]
                        break
                    await asyncio.sleep(.5)
                if page is None:
                    raise RuntimeError('Desktop workspace did not open; inspect welcome state')
            watch_page(page)
            await page.wait_for_timeout(1500)
            (output / 'initial-body.txt').write_text(await page.locator('body').inner_text(), encoding='utf-8')
            await page.screenshot(path=str(output / 'initial.png'), full_page=True)
            await open_manager(page, output)
            before = await state(page)
            if before['installation']['pending']:
                await page.get_by_role('button', name=re.compile('取消安装准备|Cancel preparation')).click()
                await page.get_by_role('button', name=re.compile('预览推荐组合|Preview recommended set')).wait_for(timeout=10000)
                before = await state(page)
            write(output / 'manager-before.json', before)
            assert all(c['status'] == 'missing' for c in before['components'])
            assertions.append('real manager-only UI opens with six missing components')
            await page.screenshot(path=str(output / 'manager-only.png'), full_page=True)
            await page.get_by_role('button', name=re.compile('预览推荐组合|Preview recommended set')).click()
            await page.get_by_role('button', name=re.compile('确认准备安装|Confirm preparation')).wait_for()
            confirm = page.get_by_role('button', name=re.compile('确认准备安装|Confirm preparation'))
            assert await confirm.is_enabled(), await page.locator('[data-guide-installation]').inner_text()
            await page.screenshot(path=str(output / 'install-preview.png'), full_page=True)
            await confirm.click()
            await page.get_by_role('button', name=re.compile('取消安装准备|Cancel preparation')).wait_for(timeout=12000)
            await page.reload(wait_until='domcontentloaded')
            await open_manager(page, output)
            prepared = await state(page)
            assert prepared['installation']['pending']['status'] == 'pending-restart'
            assertions.append('UI previews and confirms exact dependency plan; refresh retains pending intent')
            await page.screenshot(path=str(output / 'install-pending.png'), full_page=True)
            transitioning = True
            with (output / 'helper.stdout.log').open('w', encoding='utf-8') as helper_out, (output / 'helper.stderr.log').open('w', encoding='utf-8') as helper_err:
                helper_process = subprocess.Popen(['pwsh', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', setup['helper'], '-Profile', setup['profile'], '-Install'], env=env, stdout=helper_out, stderr=helper_err, creationflags=subprocess.CREATE_NO_WINDOW)
                helper_code = await asyncio.to_thread(helper_process.wait, timeout=110)
            assert helper_code == 0, 'production helper failed; inspect helper stdout/stderr'
            assertions.append('production PowerShell helper stops only owned instance, installs and restarts it')
            if kind == 'web':
                await page.goto(await wait_url(record_path), wait_until='domcontentloaded')
            else:
                await browser.close()
                browser = None
                for _ in range(120):
                    try:
                        browser = await playwright.chromium.connect_over_cdp(f'http://127.0.0.1:{debug_port}')
                        pages = [p for ctx in browser.contexts for p in ctx.pages if p.url.startswith('dsh-app://app')]
                        if pages:
                            page = pages[0]
                            break
                    except Exception:
                        pass
                    await asyncio.sleep(.5)
            await open_manager(page, output)
            watch_page(page)
            transitioning = False
            after = None
            for _ in range(45):
                after = await state(page)
                if after['installation']['verification'] == 'verified-running':
                    break
                await asyncio.sleep(.5)
            write(output / 'manager-after.json', after)
            assert after['installation']['verification'] == 'verified-running', 'restart health check failed; inspect manager-after.json'
            assert all(c['version'] == '1.1.0' and c['enabled'] for c in after['components'])
            assertions.append('fresh Host verifies actual loaded versions, services, artifacts and dependency edges')
            await page.screenshot(path=str(output / 'installed.png'), full_page=True)
            if '--packages' in sys.argv:
                def snapshot_files():
                    return {name: hashlib.sha256((profile / name).read_bytes()).hexdigest() if (profile / name).exists() else None for name in ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'pnpm-workspace.yaml']}

                baseline_files = snapshot_files()
                source_catalog = json.loads((profile / '.guide-manager/upgrade-catalog.json').read_text(encoding='utf-8'))

                async def package_restart(label):
                    nonlocal page, browser, transitioning
                    transitioning = True
                    with (output / f'{label}.stdout.log').open('w', encoding='utf-8') as helper_out, (output / f'{label}.stderr.log').open('w', encoding='utf-8') as helper_err:
                        worker = subprocess.Popen(['pwsh', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', setup['helper'], '-Profile', setup['profile'], '-PackageChange'], env=env, stdout=helper_out, stderr=helper_err, creationflags=subprocess.CREATE_NO_WINDOW)
                        code = await asyncio.to_thread(worker.wait, timeout=110)
                    assert code == 0, f'{label} helper failed; inspect its logs'
                    if kind == 'web':
                        await page.goto(await wait_url(record_path), wait_until='domcontentloaded')
                    else:
                        await browser.close()
                        for _ in range(120):
                            try:
                                browser = await playwright.chromium.connect_over_cdp(f'http://127.0.0.1:{debug_port}')
                                pages = [p for ctx in browser.contexts for p in ctx.pages if p.url.startswith('dsh-app://app')]
                                if pages:
                                    page = pages[0]
                                    break
                            except Exception:
                                pass
                            await asyncio.sleep(.5)
                    await open_manager(page, output)
                    watch_page(page)
                    transitioning = False
                    for _ in range(50):
                        value = await state(page)
                        if value['packageManagement']['verification'] == 'verified-running':
                            break
                        await asyncio.sleep(.5)
                    write(output / f'{label}-state.json', value)
                    assert value['packageManagement']['verification'] == 'verified-running', f'{label} restart health check failed'
                    await page.screenshot(path=str(output / f'{label}.png'), full_page=True)
                    return value

                async def preview_upgrade(key, target):
                    await page.locator(f'[data-guide-package-key="{key}"]').select_option(target)
                    await page.get_by_role('button', name=re.compile('预览组件升级|Preview component upgrade')).click()
                    await page.get_by_role('button', name=re.compile('确认准备升级|Confirm upgrade preparation')).wait_for()
                    await page.get_by_role('button', name=re.compile('确认准备升级|Confirm upgrade preparation')).click()
                    await page.get_by_role('button', name=re.compile('取消版本操作准备|Cancel package preparation')).wait_for(timeout=12000)

                await preview_upgrade('panel', '1.1.1')
                await page.reload(wait_until='domcontentloaded')
                await open_manager(page, output)
                pending_upgrade = (await state(page))['packageManagement']['pending']
                assert [e['key'] for e in pending_upgrade['entries'] if e['action'] == 'upgrade'] == ['panel']
                single = await package_restart('panel-upgraded')
                assert next(c for c in single['components'] if c['key'] == 'panel')['version'] == '1.1.1'
                assert all(c['version'] == '1.1.0' for c in single['components'] if c['key'] != 'panel')
                single_transaction = single['packageManagement']['result']['transactionId']
                assertions.append('real UI independently upgrades only panel and verifies loaded 1.1.1 after restart')

                await preview_upgrade('shield', '1.1.1')
                coupled_plan = (await state(page))['packageManagement']['pending']
                assert {e['key'] for e in coupled_plan['entries'] if e['action'] == 'upgrade'} == {'panel', 'admission', 'shield'}
                coupled = await package_restart('coupled-upgraded')
                assert next(c for c in coupled['components'] if c['key'] == 'panel')['version'] == '1.2.0'
                coupled_transaction = coupled['packageManagement']['result']['transactionId']
                assertions.append('shield target shows and applies required panel/admission coupling')

                async def prepare_restore(transaction):
                    await page.get_by_role('button', name=re.compile(r'(预览包版本恢复|Preview package recovery).*' + re.escape(transaction))).click()
                    await page.get_by_role('button', name=re.compile('确认准备恢复|Confirm recovery preparation')).wait_for()
                    await page.get_by_role('button', name=re.compile('确认准备恢复|Confirm recovery preparation')).click()
                    await page.get_by_role('button', name=re.compile('取消版本操作准备|Cancel package preparation')).wait_for(timeout=12000)

                await prepare_restore(coupled_transaction)
                intermediate = await package_restart('coupled-restored')
                assert next(c for c in intermediate['components'] if c['key'] == 'panel')['version'] == '1.1.1'
                assert next(c for c in intermediate['components'] if c['key'] == 'shield')['version'] == '1.1.0'
                for artifact in source_catalog['artifacts']:
                    source = Path(artifact['file']).resolve()
                    assert source.parent == (output / 'releases').resolve()
                    source.unlink()
                old_panel = next(a for a in source_catalog['artifacts'] if a['key'] == 'panel' and a['version'] == '1.1.0')
                (profile / '.guide-manager/package-cache' / (old_panel['sha256'] + '.tgz')).unlink()
                await page.reload(wait_until='domcontentloaded')
                await open_manager(page, output)
                assert not (await state(page))['packageManagement']['catalog']['available']
                await prepare_restore(single_transaction)
                restored = await package_restart('baseline-restored-without-release')
                assert all(c['version'] == '1.1.0' for c in restored['components'])
                assert snapshot_files() == baseline_files
                assertions.append('two package recoveries restore exact old graph/configuration, including after original releases and old cache copy are removed')
            if '--maintenance' in sys.argv:
                maintenance = page.locator('[data-guide-maintenance]')

                async def select_maintenance(keys):
                    for checkbox in await maintenance.locator('[data-guide-maintenance-key]').all():
                        await checkbox.set_checked(await checkbox.get_attribute('data-guide-maintenance-key') in keys)

                async def prepare_maintenance(label):
                    await maintenance.get_by_role('button', name=re.compile(label)).click()
                    confirm = maintenance.get_by_role('button', name=re.compile('确认准备维护|Confirm maintenance preparation'))
                    await confirm.wait_for()
                    assert await confirm.is_enabled(), await maintenance.inner_text()
                    await confirm.click()
                    for _ in range(40):
                        value = (await state(page))['maintenance']
                        if value['pending']:
                            return value
                        await asyncio.sleep(.5)
                    raise AssertionError('maintenance pending not persisted: ' + await maintenance.inner_text())

                async def maintenance_restart(label, prepared=None, recovery=None, broken=False):
                    nonlocal page, browser, maintenance, transitioning
                    transitioning = True
                    if recovery and recovery.get('component'):
                        command = ['pwsh', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', recovery['script'], '-Profile', setup['profile'], '-Components', recovery['component']]
                    elif recovery:
                        command = ['pwsh', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', recovery['script'], '-Profile', setup['profile'], '-TransactionId', recovery['id']]
                    else:
                        controller = Path(prepared['helper']).parent
                        command = ['pwsh', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(controller / 'restart-guide-manager.ps1'), '-Profile', setup['profile'], '-Maintenance']
                    with (output / f'{label}.stdout.log').open('w', encoding='utf-8') as out, (output / f'{label}.stderr.log').open('w', encoding='utf-8') as err:
                        worker = subprocess.Popen(command, env=env, stdout=out, stderr=err, creationflags=subprocess.CREATE_NO_WINDOW)
                        code = await asyncio.to_thread(worker.wait, timeout=160)
                    assert code == 0, f'{label} helper failed; inspect logs'
                    if kind == 'web':
                        await page.goto(await wait_url(record_path), wait_until='domcontentloaded')
                    else:
                        await browser.close()
                        for _ in range(120):
                            try:
                                browser = await playwright.chromium.connect_over_cdp(f'http://127.0.0.1:{debug_port}')
                                pages = [p for ctx in browser.contexts for p in ctx.pages if p.url.startswith('dsh-app://app')]
                                if pages:
                                    page = pages[0]
                                    break
                            except Exception:
                                pass
                            await asyncio.sleep(.5)
                    if broken:
                        watch_page(page)
                        await page.wait_for_timeout(2500)
                        status = await page.evaluate("async () => (await fetch(new URL('./guide-manager/api/state',document.baseURI))).status")
                        assert status != 200, 'injected manager unexpectedly loaded'
                        await page.screenshot(path=str(output / f'{label}.png'), full_page=True)
                        return None
                    await open_manager(page, output)
                    watch_page(page)
                    transitioning = False
                    maintenance = page.locator('[data-guide-maintenance]')
                    for _ in range(60):
                        value = await state(page)
                        if value['maintenance']['verification'] == 'verified-running':
                            break
                        await asyncio.sleep(.5)
                    write(output / f'{label}-state.json', value)
                    assert value['maintenance']['verification'] == 'verified-running', f'{label} health check failed'
                    await maintenance.scroll_into_view_if_needed()
                    await page.screenshot(path=str(output / f'{label}.png'), full_page=True)
                    return value

                await select_maintenance(['preset'])
                await maintenance.get_by_role('button', name=re.compile('预览卸载|Preview uninstall')).click()
                await maintenance.get_by_text('preset-protected-for-session-recovery', exact=False).wait_for()
                assert not await maintenance.get_by_role('button', name=re.compile('确认准备维护|Confirm maintenance preparation')).is_enabled()
                await select_maintenance(['shield'])
                await maintenance.get_by_role('button', name=re.compile('预览卸载|Preview uninstall')).click()
                await maintenance.get_by_text('dependent-remains:admission->shield', exact=False).wait_for()
                assertions.append('real UI blocks preset removal and incomplete dependent uninstall')

                # Unlink before corrupting: never write through a pnpm hardlink into a shared store.
                panel_root = profile / 'node_modules/@local/dsh-guide-panel'
                for name in (['index.js'] if kind == 'desktop' else ['package.json', 'index.js']):
                    (panel_root / name).unlink()
                await page.reload(wait_until='domcontentloaded')
                await open_manager(page, output)
                maintenance = page.locator('[data-guide-maintenance]')
                await select_maintenance(['panel'])
                hashes_before_repair = {name: hashlib.sha256((profile / name).read_bytes()).hexdigest() for name in ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'pnpm-workspace.yaml']}
                prepared = await prepare_maintenance('预览原版本修复|Preview original-version repair')
                repaired = await maintenance_restart('panel-repaired', prepared)
                assert next(c for c in repaired['components'] if c['key'] == 'panel')['status'] in ['ready', 'ready-unverified']
                assert hashes_before_repair == {name: hashlib.sha256((profile / name).read_bytes()).hexdigest() for name in hashes_before_repair}
                assertions.append('manager survives missing panel manifest/index and repairs exact package with all profile files unchanged')

                if kind == 'desktop':
                    # The official desktop concatenates client bundles: a missing package
                    # manifest can prevent the whole UI boot, including an independent manager.
                    # Exercise the non-UI repair route instead of masking that host boundary.
                    repair_script = str(Path(setup['managerRoot']) / 'helper/repair-components.ps1')
                    for name in ['package.json', 'index.js']:
                        (panel_root / name).unlink()
                    await page.reload(wait_until='domcontentloaded')
                    await page.wait_for_timeout(1500)
                    await maintenance_restart('external-component-repair', recovery={'script': repair_script, 'component': 'panel'})
                    assertions.append('external component repair restores a desktop whose missing panel manifest prevents client boot')

                (profile / 'session-data-sentinel').write_text('preserved', encoding='utf-8')
                await select_maintenance(['panel', 'goal'])
                prepared = await prepare_maintenance('预览卸载|Preview uninstall')
                removed = await maintenance_restart('components-uninstalled', prepared)
                assert all(next(c for c in removed['components'] if c['key'] == key)['status'] == 'missing' for key in ['panel', 'goal'])
                assert (profile / 'session-data-sentinel').read_text(encoding='utf-8') == 'preserved'
                assertions.append('panel/goal uninstall preserves other components and data; production executor verifies native driver restoration')

                for target in ['1.1.1', '1.1.2']:
                    await maintenance.get_by_label('manager-target-version').select_option(target)
                    prepared = await prepare_maintenance('预览管理器升级|Preview manager update')
                    recovery_script = prepared['recovery']
                    assert prepared['recoveryCommand'], 'external recovery must be visible BEFORE update'
                    write(output / f'manager-{target}-prepared.json', prepared)
                    upgraded = await maintenance_restart(f'manager-{target}', prepared, broken=target == '1.1.2')
                    receipt = json.loads((profile / '.guide-manager/maintenance-result.json').read_text(encoding='utf-8'))
                    if upgraded:
                        assert upgraded['manager']['version'] == target
                    # Prove recovery does not depend on the original manager tgz or the target's imports.
                    if target == '1.1.2':
                        for source in (output / 'manager-releases').glob('*.tgz'):
                            source.unlink()
                        current_spec = json.loads((profile / 'package.json').read_text(encoding='utf-8'))['dependencies']['@local/dsh-guide-manager']
                        cached = Path(current_spec[5:]).resolve()
                        assert cached.parent == (profile / '.guide-manager/package-cache').resolve()
                        cached.unlink()
                    restored = await maintenance_restart(f'manager-{target}-recovered', recovery={'script': recovery_script, 'id': receipt['transactionId']})
                    assert restored['manager']['version'] == '1.1.0'
                    assertions.append(f'manager {target} update and external recovery pass' + (' despite injected load failure and removed releases' if target == '1.1.2' else ' with fresh Host version check'))
            assert not errors, errors
            for pid, created in guard.items():
                assert psutil.pid_exists(pid) and abs(psutil.Process(pid).create_time() - created) < .01, 'an original DSH process was affected'
            assertions.append('all pre-existing DSH processes retained; no unexpected page runtime errors or model tasks')
            status = 'known-diagnostic' if known_diagnostics else 'passed'
            write(output / 'result.json', dict(status=status, kind=kind, assertions=assertions, pageErrors=errors, knownDiagnostics=known_diagnostics, externalModelCalls=0, liveProcessesPreserved=True))
            print(json.dumps(dict(status=status, kind=kind, assertions=len(assertions))))
    except Exception as error:
        write(output / 'result.json', dict(status='failed', kind=kind, error=str(error), assertions=assertions, pageErrors=errors, knownDiagnostics=known_diagnostics))
        if page and not page.is_closed():
            try:
                (output / 'failure-body.txt').write_text(await page.locator('body').inner_text(), encoding='utf-8')
                await page.screenshot(path=str(output / 'failure.png'), full_page=True)
            except Exception:
                pass
        raise
    finally:
        if kind == 'web' and browser:
            await browser.close()
        terminate_owned(json.loads(record_path.read_text(encoding='utf-8-sig')))


if __name__ == '__main__':
    asyncio.run(main())

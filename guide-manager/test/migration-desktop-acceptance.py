"""Opt-in E-07: real isolated Electron desktop migration through the manager UI."""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import psutil
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from playwright.async_api import async_playwright
from acceptance import open_manager, port, state as raw_state, terminate_owned, write


async def state(page):
    return await asyncio.wait_for(raw_state(page), timeout=10)


def profile_hashes(profile):
    return {name: hashlib.sha256((profile / name).read_bytes()).hexdigest() if (profile / name).exists() else None
            for name in ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'pnpm-workspace.yaml']}


def live_hashes():
    live = Path(os.environ['USERPROFILE']) / '.dsh' / 'profiles' / 'desktop'
    return profile_hashes(live)


def live_processes():
    return {proc.pid: proc.create_time() for proc in psutil.process_iter(['name', 'create_time'])
            if proc.info['name'] == 'DeepSeek Harness.exe'}


async def wait_task(page, kind):
    for _ in range(240):
        value = await state(page)
        task = value.get('distribution', {}).get('task')
        if task and task.get('kind') == kind and task.get('status') != 'running':
            return value
        await asyncio.sleep(.5)
    raise RuntimeError(f'migration {kind} timed out')


async def main():
    output = Path(sys.argv[1]).resolve()
    setup = json.loads((output / 'setup.json').read_text(encoding='utf-8'))
    profile = Path(setup['profile'])
    state_dir = profile / '.guide-manager'
    state_dir.mkdir(exist_ok=True)
    record_path = state_dir / 'launcher.json'
    before_live = live_hashes()
    before_live_processes = live_processes()
    env = dict(os.environ, DSH_HOME=setup['home'], DEEPSEEK_API_KEY='sk-e07-isolated-never-used-for-model-calls')
    for name in ['DSH_GUIDE_GITHUB_TOKEN', 'DSH_GUIDE_RELEASE_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN']:
        env.pop(name, None)
    debug_port, listen_port = port(), port()
    stdout, stderr = output / 'initial.stdout.log', output / 'initial.stderr.log'
    user_data = output / 'electron-user-data'
    env.pop('ELECTRON_RUN_AS_NODE', None)
    args = [setup['executable'], '--user-data-dir=' + str(user_data), '--remote-debugging-port=' + str(debug_port)]
    with stdout.open('w', encoding='utf-8') as out, stderr.open('w', encoding='utf-8') as err:
        process = subprocess.Popen(args, env=env, stdout=out, stderr=err, creationflags=subprocess.CREATE_NO_WINDOW)
    record = dict(schema=1, kind='desktop', pid=process.pid, createdAt=datetime.fromtimestamp(psutil.Process(process.pid).create_time(), timezone.utc).isoformat(),
                  executable=setup['executable'], home=setup['home'], profile=setup['profile'], port=listen_port, userData=str(user_data),
                  debugPort=debug_port, stdout=str(stdout), stderr=str(stderr))
    write(record_path, record)
    browser = page = None
    errors, assertions = [], []
    def watch(target):
        target.on('pageerror', lambda error: errors.append(str(error)))
    async def connect(playwright):
        nonlocal browser, page
        if browser:
            try: await browser.close()
            except Exception: pass
        browser = page = None
        for _ in range(180):
            try:
                browser = await playwright.chromium.connect_over_cdp(f'http://127.0.0.1:{debug_port}')
                pages = [p for ctx in browser.contexts for p in ctx.pages if p.url.startswith('dsh-app://app')]
                if pages:
                    page = pages[0]; watch(page); return
            except Exception:
                pass
            await asyncio.sleep(.5)
        raise RuntimeError('desktop-not-connected')
    try:
        async with async_playwright() as playwright:
            await connect(playwright)
            await page.wait_for_timeout(1500)
            await open_manager(page, output)
            initial = await state(page)
            migration = initial.get('migration', {})
            links = [item for item in migration.get('inventory', []) if item.get('migratable')]
            if len(links) != 6: raise RuntimeError(f'expected six migratable links, got {len(links)}')
            assertions.append('isolated desktop shows six link packages and no live profile change')
            source = page.locator('[data-guide-source]')
            await source.get_by_role('button', name=re.compile('^(检查更新|Check for updates)$')).click()
            checked = await wait_task(page, 'check')
            if not checked['distribution'].get('catalog', {}).get('snapshotId'):
                raise RuntimeError('source check did not produce a snapshot')
            card = page.locator('[data-guide-migration]')
            await card.get_by_role('button', name=re.compile('^(下载并准备迁移|Download and prepare migration)$')).click()
            prepared = await wait_task(page, 'prepare')
            if prepared['distribution']['task'].get('status') != 'ready':
                raise RuntimeError(f"prepare failed: {prepared['distribution']['task']}")
            await card.get_by_role('button', name=re.compile('^(预览迁移计划|Preview migration plan)$')).click()
            confirm = card.get_by_role('button', name=re.compile('^(确认执行并重启|Confirm execution and restart)$'))
            await confirm.wait_for()
            if not await confirm.is_enabled():
                raise RuntimeError(await card.inner_text())
            await confirm.click()
            old_pid = json.loads(record_path.read_text(encoding='utf-8-sig'))['pid']
            deadline = time.monotonic() + 240
            final = None
            while time.monotonic() < deadline:
                await asyncio.sleep(1)
                try:
                    current = json.loads(record_path.read_text(encoding='utf-8-sig'))
                except Exception:
                    continue
                if current.get('pid') == old_pid:
                    continue
                try:
                    await connect(playwright)
                    await open_manager(page, output)
                    value = await state(page)
                    if value.get('execution', {}).get('task', {}).get('status') == 'completed':
                        final = value
                        break
                except Exception as error:
                    if 'desktop-not-connected' not in str(error):
                        errors.append(str(error))
            if final is None:
                raise RuntimeError('desktop migration did not complete and reconnect')
            if final['migration'].get('verification') != 'verified-running':
                raise RuntimeError(f"migration verification={final['migration'].get('verification')}")
            if final.get('execution', {}).get('task', {}).get('status') != 'completed':
                raise RuntimeError('execution did not complete')
            if any(component['version'] != '1.1.0' for component in final['components'] if component['installed']):
                raise RuntimeError('component versions changed unexpectedly')
            if live_hashes() != before_live:
                raise RuntimeError('live profile four files changed during isolated migration')
            for pid, created in before_live_processes.items():
                if psutil.Process(int(pid)).create_time() != created:
                    raise RuntimeError(f'live process {pid} changed')
            assertions.append('migration card prepared the public release, confirmed execution and returned in a fresh isolated desktop')
            assertions.append('migration verification is verified-running with six file-pinned components')
            assertions.append('live profile four files and pre-existing live processes were unchanged')
            write(output / 'result.json', dict(status='passed', kind='desktop', assertions=assertions, pageErrors=errors, modelInferenceCalls=0))
            print(json.dumps(dict(status='passed', kind='desktop', assertions=assertions)))
    except Exception as error:
        write(output / 'result.json', dict(status='failed', kind='desktop', error=str(error), assertions=assertions, pageErrors=errors))
        raise
    finally:
        if browser:
            try: await browser.close()
            except Exception: pass
        try: terminate_owned(json.loads(record_path.read_text(encoding='utf-8-sig')))
        except Exception: pass


if __name__ == '__main__':
    asyncio.run(main())

import asyncio,json,sys,time
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    cfg=json.loads(sys.stdin.buffer.read().decode('utf-8'));out=Path(cfg['output']);events=[];samples=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(channel='msedge',headless=True)
        context=await browser.new_context()
        pages=[]
        for n in range(2):
            page=await context.new_page();pages.append(page)
            cdp=await context.new_cdp_session(page);await cdp.send('Network.enable')
            def response(e):
                r=e['response'];url=r['url'].split('?')[0]
                if '/plugins/events' in url or '/guide/api/' in url:
                    events.append({'type':'response','url':url,'protocol':r.get('protocol'),'timing':r.get('timing'),'at':time.time()})
            cdp.on('Network.responseReceived',response)
            cdp.on('Network.loadingFailed',lambda e:events.append({'type':'failed','error':e.get('errorText'),'at':time.time()}))
            await page.goto(cfg['entryUrl'],wait_until='domcontentloaded')
            await page.wait_for_timeout(1200)
            for i in range(4):
                begin=time.monotonic()
                result=await page.evaluate("""async()=>{try{const r=await fetch('./guide/api/state',{method:'POST',body:'{}',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(2000)});const j=await r.json();return{status:r.status,mode:j.value?.panelCompat?.mode}}catch(e){return{error:e.name}}}""")
                samples.append({'pages':n+1,'elapsedMs':round((time.monotonic()-begin)*1000),'result':result})
                await page.wait_for_timeout(250)
        await pages[0].reload(wait_until='domcontentloaded');await pages[0].wait_for_timeout(1000)
        result=await pages[0].evaluate("""async()=>{try{const r=await fetch('./guide/api/ping',{method:'POST',body:'{}',signal:AbortSignal.timeout(2000)});return{status:r.status}}catch(e){return{error:e.name}}}""")
        samples.append({'scenario':'reload-with-second-tab','result':result})
        await browser.close()
    failed=[s for s in samples if s['result'].get('error') or s['result'].get('status')!=200]
    result={'status':'reproduced' if failed else 'not-reproduced','scope':'isolated current desktop plugin combination; fresh Edge; one/two tabs and reload; no artificial SSE saturation','samples':samples,'events':events}
    (out/'r5-browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'r5':result['status'],'samples':len(samples),'failed':len(failed)}))
asyncio.run(main())

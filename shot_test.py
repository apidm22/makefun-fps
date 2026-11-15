# Smoke test for the Emberline game: loads each ?shot= mode in headless Chromium 2,
# waits for window.__shotReady, collects console errors, and saves a PNG per shot.
# Usage: python3 shot_test.py [shot-name ...]   (default: all four)
import asyncio
import json
import sys

import nodriver as uc

SHOTS = ['start', 'play', 'plant', 'end']
BASE = 'http://127.0.0.1:8000/index.html'


async def main():
    names = sys.argv[1:] or SHOTS
    browser = await uc.start(
        headless=True,
        sandbox=False,
        browser_executable_path='/home/hatch/workspace/tools/chromium2/chrome-linux/chrome',
        browser_args=[
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--ignore-certificate-errors',
            '--proxy-bypass-list=localhost,127.0.0.1',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--window-size=1280,720',
        ],
    )
    page = await browser.get('about:blank')
    # Collect page errors before any game script runs.
    await page.send(uc.cdp.page.add_script_to_evaluate_on_new_document(
        source="window.__errors=[]; window.addEventListener('error', e => window.__errors.push(String(e.message)+' @ '+(e.filename||'')+':'+(e.lineno||'')));"
    ))
    errors = []

    async def on_exception(event):
        try:
            details = event.exception_details
            errors.append(f"exception: {details.text} {details.exception.description if details.exception else ''}")
        except Exception as exc:
            errors.append(f'exception handler error: {exc}')

    try:
        page.add_handler(uc.cdp.runtime.ExceptionThrown, on_exception)
    except Exception as exc:
        print('exception handler unavailable:', exc)

    for name in names:
        errors.clear()
        url = f'{BASE}?shot={name}&seed=42'
        print(f'--- {name}: {url}')
        await page.get(url)
        ready = False
        for _ in range(60):
            await asyncio.sleep(0.5)
            try:
                ready = await page.evaluate('window.__shotReady === true')
            except Exception:
                ready = False
            if ready:
                break
        print(f'    __shotReady: {ready}')
        # Check for a rendered canvas with non-black pixels and any JS errors.
        info = await page.evaluate('''({
            canvas: document.querySelector('#game canvas') ? [document.querySelector('#game canvas').width, document.querySelector('#game canvas').height] : null,
            timer: document.getElementById('timer-value') ? document.getElementById('timer-value').textContent : null,
            bomb: document.getElementById('bomb-status') ? document.getElementById('bomb-status').textContent : null,
            banner: document.getElementById('banner-title') ? document.getElementById('banner-title').textContent : null,
            ammo: document.getElementById('ammo-mag') ? document.getElementById('ammo-mag').textContent : null,
            overlayHidden: document.getElementById('overlay') ? document.getElementById('overlay').hidden : null,
            buyHidden: document.getElementById('buy-menu') ? document.getElementById('buy-menu').hidden : null,
        })''')
        print('    info:', json.dumps(info))
        if errors:
            print('    console:', '\n    '.join(errors[:8]))
        page_errors = await page.evaluate('window.__errors ? window.__errors.join(" | ") : "n/a"')
        if page_errors and page_errors != 'n/a' and page_errors != '':
            print('    window.__errors:', page_errors)
        stage = await page.evaluate('window.__stage || "none"')
        print('    __stage:', stage)
        step_count = await page.evaluate('window.__stepCount || 0')
        print('    __stepCount:', step_count)
        await page.save_screenshot(f'/tmp/fps-shot-{name}.png')
        print(f'    saved /tmp/fps-shot-{name}.png')

    browser.stop()


asyncio.run(main())

import asyncio, sys
from playwright.async_api import async_playwright
import pathlib
URL = (pathlib.Path(__file__).resolve().parent/'kin-and-crown.html').as_uri()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='dark')
        page = await ctx.new_page()
        errs = []
        page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        await page.goto(URL); await page.wait_for_timeout(700)
        await page.screenshot(path='s1_intro.png')
        await page.click('[data-act="begin"]'); await page.wait_for_timeout(400)
        await page.screenshot(path='s2_map.png')
        # tap the player's capital county
        await page.click('[data-act="me"]'); await page.wait_for_timeout(300)
        await page.screenshot(path='s3_me.png')
        await page.click('[data-tab="family"]'); await page.wait_for_timeout(300)
        await page.screenshot(path='s4_family.png')
        await page.click('[data-tab="realm"]'); await page.wait_for_timeout(300)
        await page.screenshot(path='s5_realm.png')
        await page.click('[data-tab="rulers"]'); await page.wait_for_timeout(300)
        await page.screenshot(path='s6_rulers.png')
        await page.click('[data-act="close"]')
        # simulate a few years headlessly and look again
        await page.evaluate("() => { const S = Realm.state(); for (let i = 0; i < 360*6; i++) { Realm.tick(); while (S.queue.length) Realm.resolve(0); } }")
        await page.wait_for_timeout(500)
        await page.screenshot(path='s7_later.png')
        await page.click('[data-tab="war"]'); await page.wait_for_timeout(300)
        await page.screenshot(path='s8_war.png')
        await page.click('[data-tab="chronicle"]'); await page.wait_for_timeout(300)
        await page.screenshot(path='s9_chron.png')
        print('\n'.join(errs) or 'no console errors')
        await b.close()
asyncio.run(main())

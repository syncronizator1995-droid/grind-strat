// @ts-check
// Start-up time: how long until the first map is on screen, in headless Chrome on a phone-size
// screen with the processor slowed down (4x by default), as a stand-in for a mid-range phone.
//   node test/startup.mjs                         the built game, dist/grind-strat.html
//   node test/startup.mjs --file some.html --runs 7 --cpu 4
// The time is read inside the page, on the first animation frame after the map is drawn, so it
// counts from the moment the page started opening. Older builds (M1) have no ready mark; for
// them the "made up" map note showing up is the sign.

import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { quantile } from '../src/ui/map/speedtest.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * @param {string} file the game page
 * @param {{ runs?: number, cpu?: number }} [options]
 * @returns {Promise<{ ms: number[], ownMs: number[], bytes: number, parts: Record<string, number>[] }>}
 */
export async function measureStartup(file, { runs = 5, cpu = 4 } = {}) {
  const browser = await chromium.launch();
  /** @type {number[]} */
  const ms = [];
  /** @type {number[]} */
  const ownMs = [];
  /** @type {Record<string, number>[]} */
  const parts = [];
  try {
    for (let i = 0; i < runs; i++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await context.route('**/*', (route) => (/^(file|data):/.test(route.request().url()) ? route.continue() : route.abort()));
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
      await page.goto(pathToFileURL(file).href, { waitUntil: 'commit' });
      const handle = await page.waitForFunction(() => {
        const own = document.documentElement.dataset.mapOnScreenMs;
        const note = document.querySelector('#mapNote');
        const m1 = note instanceof HTMLElement && !note.hidden;
        return own || m1 ? { at: performance.now(), own: own ? Number(own) : NaN } : null;
      }, undefined, { polling: 'raf', timeout: 60000 });
      const got = /** @type {{ at: number, own: number }} */ (await handle.jsonValue());
      ms.push(got.at);
      if (Number.isFinite(got.own)) {
        ownMs.push(got.own);
        await page.waitForFunction(() => document.documentElement.dataset.startup, undefined, { timeout: 60000 });
        parts.push(JSON.parse(await page.evaluate(() => document.documentElement.dataset.startup ?? '{}')));
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return { ms, ownMs, bytes: (await stat(file)).size, parts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = (/** @type {string} */ name, /** @type {string} */ fallback) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : fallback;
  };
  const file = resolve(opt('--file', join(ROOT, 'dist', 'grind-strat.html')));
  const runs = Number(opt('--runs', '5'));
  const cpu = Number(opt('--cpu', '4'));
  const r = await measureStartup(file, { runs, cpu });
  const fmt = (/** @type {number[]} */ v) => (v.length ? `median ${quantile(v, 0.5).toFixed(0)} ms (runs: ${v.map((x) => x.toFixed(0)).join(', ')})` : 'n/a');
  console.log(`${file}\n  size ${(r.bytes / 1024).toFixed(1)} KB, CPU slowed ${cpu}x, ${runs} runs`);
  console.log(`  first map on screen, seen from outside: ${fmt(r.ms)}`);
  console.log(`  first map on screen, the game's own count: ${fmt(r.ownMs)}`);
  if (r.parts.length) {
    const keys = Object.keys(r.parts[0]);
    console.log(`  medians: ${keys.map((k) => `${k} ${quantile(r.parts.map((p) => p[k]), 0.5)}`).join(', ')}`);
  }
}

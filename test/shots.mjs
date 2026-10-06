// @ts-check
// Phone screenshots and a scripted play session in headless Chrome (npm run shots builds first).
//  1. As a plain file, in light and dark: fresh start, top speed, save and load, new game, reload.
//  2. Served like the website (under /grind-strat/, as GitHub Pages does): the manifest loads, the
//     service worker takes over, and the game still opens with the server switched off, with a
//     signal too weak to answer, after another app on the same address wipes the caches, and
//     after an update.
// Every request that would leave the computer is blocked and reported; any console error fails
// the run. Screenshots go to shots/ (not stored in git): check them for cut-off or overlapping text.
//
// Uses the Chromium that matches the pinned Playwright version. On a new computer, run once:
//   npx playwright install chromium

import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const SHOTS = join(ROOT, 'shots');
const PHONE = { width: 390, height: 844 };
const NARROW = { width: 360, height: 740 };

/** @type {string[]} */
const failures = [];
/** @param {boolean} ok @param {string} message */
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

/**
 * Watches a page for console errors, page errors and blocked requests.
 * @param {import('playwright').Page} page
 * @param {string} label
 */
function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') failures.push(`${label}: console ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => failures.push(`${label}: page error: ${e.message}`));
}

/**
 * Blocks every request except the allowed ones, and reports the rest.
 * @param {import('playwright').BrowserContext} context
 * @param {string} label
 * @param {(url: URL) => boolean} allowed
 */
async function blockOutside(context, label, allowed) {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (allowed(url)) return route.continue();
    failures.push(`${label}: tried to load ${url.href}`);
    return route.abort();
  });
}

/** @param {import('playwright').Page} page */
const dateText = (page) => page.locator('#date').innerText();

/**
 * Waits for the map to be unpacked and drawn (the test map shows its "made up" note).
 * @param {import('playwright').Page} page @param {string} label
 */
async function mapShown(page, label) {
  try {
    await page.locator('#mapNote').waitFor({ state: 'visible', timeout: 20000 });
  } catch {
    failures.push(`${label}: the map did not appear`);
  }
}
/** @param {import('playwright').Page} page */
const statusText = (page) => page.locator('#status').innerText();

/**
 * Text that doesn't fit (cut off or spilling out) and sideways scrolling.
 * @param {import('playwright').Page} page
 */
function layoutProblems(page) {
  return page.evaluate(() => {
    const problems = [];
    if (document.documentElement.scrollWidth > window.innerWidth) problems.push('the page scrolls sideways');
    for (const el of document.querySelectorAll('.brand, .date, .speed button, .btn, .status')) {
      if (!(el instanceof HTMLElement) || el.closest('[hidden]')) continue;
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`text does not fit in ${el.className || el.tagName}: "${el.innerText}"`);
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 0.5 || r.left < -0.5) problems.push(`${el.className || el.tagName} sticks out of the screen`);
    }
    for (const b of document.querySelectorAll('button')) {
      if (b.closest('[hidden]')) continue; // not on screen, e.g. inside a closed panel
      const r = b.getBoundingClientRect();
      if (r.height < 40 || r.width < 40) problems.push(`button "${b.innerText || b.getAttribute('aria-label')}" is too small to tap (${Math.round(r.width)}x${Math.round(r.height)})`);
    }
    return problems;
  });
}

/**
 * @param {import('playwright').Browser} browser
 * @param {'light' | 'dark'} scheme
 */
async function playAsFile(browser, scheme) {
  const label = `file/${scheme}`;
  const context = await browser.newContext({
    viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme,
  });
  await blockOutside(context, label, (url) => url.protocol === 'file:' || url.protocol === 'data:');
  const page = await context.newPage();
  watch(page, label);
  const fileUrl = pathToFileURL(join(DIST, 'grind-strat.html')).href;
  await page.goto(fileUrl);
  await page.evaluate(() => document.fonts.ready);
  await mapShown(page, label);
  check((await dateText(page)) === '1 January 1219', `${label}: does not start on 1 January 1219`);
  check(await page.locator('[data-speed="0"]').getAttribute('aria-pressed') === 'true', `${label}: does not start paused`);
  check(await page.locator('[data-act="install"]').isHidden(), `${label}: Install shows when opened as a plain file`);
  for (const p of await layoutProblems(page)) failures.push(`${label}: ${p}`);
  await page.screenshot({ path: join(SHOTS, `${scheme}-1-start.png`) });

  // Top speed for a moment: years pass, and autosaves happen on the first of a month.
  await page.tap('[data-speed="5"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, `${scheme}-2-fastest.png`) });
  await page.tap('[data-speed="0"]');
  const afterRun = await dateText(page);
  check(afterRun !== '1 January 1219', `${label}: time did not move at top speed`);
  const autosave = await page.evaluate(() => localStorage.getItem('grind-strat/autosave'));
  check(autosave !== null && autosave.includes('"version":1'), `${label}: no autosave after a run at top speed`);

  // Save, play on, load: back to the saved day.
  await page.tap('[data-act="save"]');
  const savedDate = await dateText(page);
  check((await statusText(page)).startsWith(`Saved: ${savedDate}`), `${label}: Save did not report "Saved: ${savedDate}"`);
  await page.tap('[data-speed="3"]');
  await page.waitForTimeout(700);
  await page.tap('[data-speed="0"]');
  check((await dateText(page)) !== savedDate, `${label}: time did not move at speed 3`);
  await page.tap('[data-act="load"]');
  check((await dateText(page)) === savedDate, `${label}: Load did not go back to ${savedDate}`);
  check((await statusText(page)).startsWith(`Loaded: ${savedDate}`), `${label}: Load did not report the date`);
  await page.screenshot({ path: join(SHOTS, `${scheme}-3-loaded.png`) });
  // Leaving straight after Load keeps the loaded game.
  await page.reload();
  check((await dateText(page)) === savedDate, `${label}: reopening after Load did not keep ${savedDate} (got ${await dateText(page)})`);

  // A double tap on New game is one tap, not two.
  await page.dblclick('[data-act="new"]');
  check((await dateText(page)) === savedDate, `${label}: a double tap on New game threw the game away`);
  await page.waitForTimeout(3200); // let it disarm

  // New game needs two separate taps.
  await page.tap('[data-act="new"]');
  check((await dateText(page)) === savedDate, `${label}: one tap on New game threw the game away`);
  check((await page.locator('[data-act="new"]').innerText()) === 'Tap again', `${label}: New game did not ask for a second tap`);
  await page.waitForTimeout(500);
  await page.tap('[data-act="new"]');
  check((await dateText(page)) === '1 January 1219', `${label}: New game did not start on 1 January 1219`);

  // Leaving and coming back continues from the autosave.
  await page.tap('[data-speed="4"]');
  await page.waitForTimeout(600);
  await page.tap('[data-speed="0"]');
  const beforeLeaving = await dateText(page);
  await page.reload();
  check((await dateText(page)) === beforeLeaving, `${label}: reopening did not continue from ${beforeLeaving} (got ${await dateText(page)})`);
  check((await statusText(page)).startsWith('Continued from your autosave'), `${label}: reopening did not say it continued`);

  await page.setViewportSize(NARROW);
  await page.waitForTimeout(100);
  for (const p of await layoutProblems(page)) failures.push(`${label} at 360 px: ${p}`);
  await page.screenshot({ path: join(SHOTS, `${scheme}-4-narrow-360.png`) });

  // The map: drag and pinch-free zoom with the wheel, then the speed test (dark run only).
  await page.setViewportSize(PHONE);
  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, `${scheme}-5-map-zoomed.png`) });
  if (scheme === 'dark') {
    await page.tap('[data-act="speedtest"]');
    await page.locator('#speedSheet').waitFor({ state: 'visible', timeout: 60000 });
    const results = await page.locator('#speedResults').innerText();
    check(/First map on screen: [\d.]+ ms/.test(results) && /Full redraw: median [\d.]+ ms/.test(results) && /frames, \d+% on time/.test(results),
      `${label}: the speed test results are incomplete:\n${results}`);
    for (const p of await layoutProblems(page)) failures.push(`${label} speed test: ${p}`);
    await page.screenshot({ path: join(SHOTS, `${scheme}-6-speed-test.png`) });
    console.log(`speed test in headless Chrome (software drawing, not a phone):\n${results}`);
  }
  await context.close();
}

/**
 * Serves a folder on this computer only, under /grind-strat/ like GitHub Pages. It can be switched
 * off (every connection is cut) or made to hang (a signal too weak to answer).
 * @param {string} dir
 */
async function serveSite(dir) {
  const types = /** @type {Record<string, string>} */ ({
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  });
  /** @type {'up' | 'down' | 'hang'} */
  let mode = 'up';
  /** @type {import('node:http').ServerResponse[]} */
  const hanging = [];
  const server = createServer(async (req, res) => {
    if (mode === 'down') {
      req.socket.destroy();
      return;
    }
    if (mode === 'hang') {
      hanging.push(res);
      return;
    }
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/grind-strat/')) {
      res.writeHead(404).end('not found');
      return;
    }
    const path = decodeURIComponent(url.pathname.slice('/grind-strat'.length));
    const file = normalize(join(dir, path.endsWith('/') ? `${path}index.html` : path));
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      // GitHub Pages lets browsers keep files for 10 minutes; the service worker must see past that.
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'max-age=600' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', () => done(undefined)));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not start');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    base: `http://127.0.0.1:${address.port}/grind-strat/`,
    /** @param {'up' | 'down' | 'hang'} next */
    set(next) {
      mode = next;
      if (next !== 'hang') for (const res of hanging.splice(0)) res.destroy();
    },
    close() {
      for (const res of hanging.splice(0)) res.destroy();
      server.closeAllConnections();
      server.close();
    },
  };
}

/**
 * Reloads with the server in the given mode and checks the game opened, through the worker.
 * @param {import('playwright').Page} page
 * @param {string} label
 */
async function expectGameOpens(page, label) {
  try {
    await page.reload({ timeout: 15000 });
    await page.locator('#date').waitFor({ timeout: 10000 });
  } catch (err) {
    failures.push(`${label}: the game did not open (${err instanceof Error ? err.message.split('\n')[0] : err})`);
    return false;
  }
  const ok = (await page.locator('.brand').innerText()) === 'Grind Strat' && (await dateText(page)).length > 0;
  check(ok, `${label}: the page that opened is not the game`);
  check(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), `${label}: the service worker did not answer`);
  return ok;
}

/** @param {import('playwright').Browser} browser */
async function playAsWebsite(browser) {
  const label = 'web';
  const site = await mkdtemp(join(tmpdir(), 'grind-strat-site-'));
  await cp(DIST, site, { recursive: true });
  const server = await serveSite(site);
  try {
    const context = await browser.newContext({
      viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', serviceWorkers: 'allow',
    });
    await blockOutside(context, label, (url) => url.origin === server.origin || url.protocol === 'data:');
    const page = await context.newPage();
    watch(page, label);
    await page.goto(server.base);
    check((await page.locator('link[rel="manifest"]').count()) === 1, `${label}: no manifest link on the website`);
    const manifest = await page.evaluate(async () => {
      const link = /** @type {HTMLLinkElement} */ (document.querySelector('link[rel="manifest"]'));
      const m = await (await fetch(link.href)).json();
      const icons = await Promise.all(m.icons.map(async (/** @type {{ src: string }} */ i) => (await fetch(new URL(i.src, link.href))).status));
      return { name: m.name, display: m.display, icons };
    });
    check(manifest.name === 'Grind Strat' && manifest.display === 'standalone', `${label}: manifest is wrong: ${JSON.stringify(manifest)}`);
    check(manifest.icons.every((s) => s === 200), `${label}: an icon is missing: ${manifest.icons.join(', ')}`);

    const controlled = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((done) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => done(undefined), { once: true });
          setTimeout(() => done(undefined), 5000);
        });
      }
      return Boolean(navigator.serviceWorker.controller);
    });
    check(controlled, `${label}: the service worker did not take over the page`);

    // 1. No signal at all: the server cuts every connection.
    server.set('down');
    if (await expectGameOpens(page, `${label}/no signal`)) {
      await mapShown(page, `${label}/no signal`);
      await page.screenshot({ path: join(SHOTS, 'web-offline.png') });
    }

    // 2. A signal too weak to answer: the saved copy opens after a few seconds.
    server.set('hang');
    const t0 = Date.now();
    await expectGameOpens(page, `${label}/weak signal`);
    check(Date.now() - t0 < 8000, `${label}/weak signal: took ${Date.now() - t0} ms to open`);

    // 3. Another app on the same github.io address deletes every cache (Campfire and Cal Track do
    //    when they update). The IndexedDB copy still opens the game.
    server.set('up');
    await page.evaluate(async () => {
      for (const key of await caches.keys()) await caches.delete(key);
    });
    server.set('down');
    await expectGameOpens(page, `${label}/caches wiped by another app`);

    // 4. An update ships: the new version shows when online, and is the one kept for offline.
    server.set('up');
    await page.reload();
    const swPath = join(site, 'sw.js');
    await writeFile(swPath, (await readFile(swPath, 'utf8')).replace(/const BUILD = '[^']*';/, "const BUILD = 'update-test';"));
    for (const name of ['index.html', 'grind-strat.html']) {
      const file = join(site, name);
      await writeFile(file, (await readFile(file, 'utf8')).replace('</head>', '<meta name="update-test" content="1">\n</head>'));
    }
    await page.reload();
    check((await page.locator('meta[name="update-test"]').count()) === 1, `${label}/update: the new version did not show straight away`);
    const updated = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
      for (let i = 0; i < 50; i++) {
        if (await caches.has('grind-strat-update-test') && !(reg?.installing || reg?.waiting)) return true;
        await new Promise((done) => setTimeout(done, 100));
      }
      return false;
    });
    check(updated, `${label}/update: the new service worker did not take over`);
    server.set('down');
    if (await expectGameOpens(page, `${label}/update then no signal`)) {
      check((await page.locator('meta[name="update-test"]').count()) === 1, `${label}/update: offline it opened the old version`);
    }
    await context.close();
  } finally {
    server.close();
    await rm(site, { recursive: true, force: true });
  }
}

await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch();
try {
  await playAsFile(browser, 'light');
  await playAsFile(browser, 'dark');
  await playAsWebsite(browser);
} catch (err) {
  failures.push(`the run crashed: ${err instanceof Error ? err.stack : err}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`shots: ${failures.length} problem(s)\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`shots: all checks passed; screenshots in ${SHOTS}`);

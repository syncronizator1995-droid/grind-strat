// @ts-check
// One-off script: draws the home-screen icons (a blackletter "G", Ignas's choice, 6 Oct 2026)
// with the game's own font, using the headless Chrome that Playwright already brings for the
// screenshot tests. Run it again only to change the icons:
//   node tools/make-icons.mjs
// Writes src/ui/icons/icon-192.png, icon-512.png and icon-maskable-512.png.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const font = (await readFile(`${root}src/ui/fonts/grenze-gotisch.woff2`)).toString('base64');

/**
 * The icon page: draws the letter on a canvas and centres its actual ink, not its line box,
 * because blackletter capitals sit low in the line.
 * @param {number} size icon width and height in pixels
 * @param {boolean} maskable Android crops maskable icons to a circle or squircle, so the letter
 *   must stay inside the middle 80%
 */
function page(size, maskable) {
  return `<!doctype html><html><head><style>html, body { margin: 0; background: #17212c; }</style></head>
  <body><canvas id="c" width="${size}" height="${size}"></canvas><script>
  (async () => {
    const face = new FontFace('G', 'url(data:font/woff2;base64,${font})', { weight: '100 900' });
    document.fonts.add(await face.load());
    const size = ${size}, maskable = ${maskable};
    const ctx = document.getElementById('c').getContext('2d');
    ctx.fillStyle = '#17212c';
    ctx.fillRect(0, 0, size, size);
    if (!maskable) {
      const inset = size * 0.06, r = size * 0.16, line = Math.max(2, size * 0.035);
      ctx.strokeStyle = 'rgba(212, 167, 44, .55)';
      ctx.lineWidth = line;
      ctx.beginPath();
      ctx.roundRect(inset + line / 2, inset + line / 2, size - 2 * inset - line, size - 2 * inset - line, r);
      ctx.stroke();
    }
    // Letter height as a share of the icon: inside the ring, or inside Android's safe zone.
    const target = size * (maskable ? 0.46 : 0.56);
    ctx.font = '700 100px G';
    let m = ctx.measureText('G');
    const scale = target / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
    ctx.font = '700 ' + (100 * scale) + 'px G';
    m = ctx.measureText('G');
    const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    ctx.fillStyle = '#d4a72c';
    ctx.fillText('G', (size - inkW) / 2 + m.actualBoundingBoxLeft, (size - inkH) / 2 + m.actualBoundingBoxAscent);
    document.body.dataset.done = '1';
  })();
  </script></body></html>`;
}

const browser = await chromium.launch();
try {
  for (const [name, size, maskable] of /** @type {const} */ ([
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-512.png', 512, true],
  ])) {
    const tab = await browser.newPage({ viewport: { width: size, height: size } });
    await tab.setContent(page(size, maskable));
    await tab.waitForSelector('body[data-done]');
    await tab.locator('#c').screenshot({ path: `${root}src/ui/icons/${name}` });
    await tab.close();
    console.log('wrote', `src/ui/icons/${name}`);
  }
} finally {
  await browser.close();
}

// @ts-check
// The ice-age map engine (M3b): slice.js on a small made-up age (INVENTED, for tests only), the
// banner words and the era edges the BC test link reaches.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ageLabel, bannerText, COVER, hatchRects, oldShore, paintAge, SURFACE, surfaceAt, unpackAge } from '../src/ui/map/slice.js';
import { parseTestLink } from '../src/ui/map/dated.js';

// INVENTED: 6 x 4 one-km cells (10 game units each), row 0 at the south. Water in columns 0-1,
// ice in the top-right corner, "no model yet" (cover 0) in the east of the 2 km cover grid.
const grid = { cols: 6, rows: 4, cell: 10 };
const W = SURFACE.water; const I = SURFACE.ice;
const surface = Uint8Array.from([
  W, W, 0, 0, 0, 0,
  W, W, 0, 0, 0, 0,
  W, W, 0, 0, 0, I,
  W, W, 0, 0, 0, I,
]);
// cover grid is 3 x 2: [pine, mixed, none] on both rows
const cover = Uint8Array.from([COVER.pine, COVER.mixed, COVER.none, COVER.pine, COVER.mixed, COVER.none]);
const entry = { id: 'age-9500bc', year: -9500, stage: 'Invented Sea' };
const slice = () => unpackAge(entry, grid, surface, cover);

describe('slice.js on a made-up age', () => {
  it('unpacks, and refuses layers of the wrong size or unknown values', () => {
    assert.equal(slice().coverCols, 3);
    assert.throws(() => unpackAge(entry, grid, surface.slice(1), cover), /wrong size/);
    assert.throws(() => unpackAge(entry, grid, surface, cover.slice(1)), /wrong size/);
    assert.throws(() => unpackAge(entry, grid, Uint8Array.from(surface, (v, i) => (i === 3 ? 9 : v)), cover), /does not know/);
  });

  it('paints water, ice and land cover; water and ice are never covered by hatching', () => {
    const px = paintAge(slice());
    assert.equal(px.length, 24);
    assert.notEqual(px[0], px[2], 'water differs from land');
    assert.notEqual(px[5 + 12], px[2], 'ice differs from land');
    const rects = hatchRects(slice());
    // cover 0 in cover column 2 = surface columns 4-5, minus the ice cells: rows 0-1 are 2 wide, rows 2-3 only column 4
    const cells = rects.reduce((n, r) => n + (r.w / 10) * (r.h / 10), 0);
    assert.equal(cells, 2 * 2 + 1 * 2);
    for (const r of rects) for (let y = r.y; y < r.y + r.h; y += 10) for (let x = r.x; x < r.x + r.w; x += 10) {
      assert.equal(surfaceAt(slice(), x + 1, y + 1), 'none', 'hatching only where there is no model');
    }
    assert.equal(surfaceAt(slice(), 1, 1), 'water');
    assert.equal(surfaceAt(slice(), 55, 35), 'ice');
    assert.equal(surfaceAt(slice(), 25, 5), 'land');
    assert.equal(surfaceAt(slice(), 600, 5), null);
  });

  it('draws the old shore between the water and the land', () => {
    const lines = oldShore(slice());
    assert.ok(lines.length >= 1);
    for (const l of lines) for (let i = 0; i < l.length; i += 2) assert.ok(Math.abs(l[i] - 20) < 1e-6, `shore at x=20, got ${l[i]}`);
  });
});

describe('the banner words', () => {
  it('counts years ago from 2026, to the nearest 500, with no "BP"', () => {
    assert.equal(bannerText(-9500), 'Rough preview: about 9,500 BC (about 11,500 years ago)');
    assert.equal(ageLabel(-10000), 'about 10,000 BC (about 12,000 years ago)');
    assert.equal(ageLabel(-8500), 'about 8,500 BC (about 10,500 years ago)');
    assert.equal(ageLabel(-7500), 'about 7,500 BC (about 9,500 years ago)');
    assert.equal(ageLabel(-5000), 'about 5,000 BC (about 7,000 years ago)');
    assert.throws(() => ageLabel(1219));
    for (const y of [-10000, -9500, -8500, -7500, -5000]) assert.ok(!/BP/.test(bannerText(y)));
  });
});

describe('the BC test link', () => {
  it('reads BC years, with a camera, and refuses year 0', () => {
    assert.deepEqual(parseTestLink('#date=10000BC'), { year: -10000, view: null });
    for (const y of [9500, 8500, 7500, 5000]) assert.equal(parseTestLink(`#date=${y}BC`)?.year, -y);
    assert.deepEqual(parseTestLink('#date=9500BC&view=5057,10484,0.12'), { year: -9500, view: { cx: 5057, cy: 10484, scale: 0.12 } });
    assert.equal(parseTestLink('#date=0'), null);
    assert.equal(parseTestLink('#date=0BC'), null);
    assert.equal(parseTestLink('#date=12345'), null);
    assert.equal(parseTestLink('#date=1550')?.year, 1550);
  });
});

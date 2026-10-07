// @ts-check
// Tests for placing river and lake names (src/ui/map/labels.js).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { indexWater, labelDiscs, MIN_FONT_PX, Occupancy, placeWaterLabels, straightStretches } from '../src/ui/map/labels.js';

const frame = { cx: 200, cy: 200, width: 400, height: 400 };
/** Text 7 px per letter, like a 12 px italic serif. */
const measure = (/** @type {string} */ text, /** @type {number} */ size) => text.length * size * 0.58;

describe('straight stretches', () => {
  it('finds room along a straight river, nearest the middle first', () => {
    const pts = new Float64Array([20, 100, 100, 100, 180, 100, 260, 100, 340, 100]);
    const found = straightStretches(pts, 120, 4, frame);
    assert.ok(found.length > 0);
    for (let i = 1; i < found.length; i++) assert.ok(found[i - 1].d <= found[i].d);
    assert.ok(Math.hypot(found[0].x1 - found[0].x0, found[0].y1 - found[0].y0) >= 120 * 0.9);
  });

  it('finds no room along a zigzag, or where the stretch would leave the frame', () => {
    const zig = new Float64Array([20, 100, 40, 140, 60, 100, 80, 140, 100, 100, 120, 140, 140, 100]);
    assert.equal(straightStretches(zig, 100, 4, frame).length, 0);
    const off = new Float64Array([-200, 100, 0, 100, 200, 100]);
    assert.equal(straightStretches(off, 380, 4, frame).length, 0);
  });
});

describe('collisions', () => {
  it('lets apart names in and keeps touching names out', () => {
    const occ = new Occupancy(400, 400);
    const a = labelDiscs(100, 100, 0, 80, 12);
    assert.ok(occ.fits(a));
    occ.add(a);
    assert.ok(!occ.fits(labelDiscs(120, 104, 0.3, 80, 12)), 'crossing names collide');
    assert.ok(occ.fits(labelDiscs(100, 160, 0, 80, 12)), 'a name well below is fine');
    occ.keepOut(0, 300, 400, 400);
    assert.ok(!occ.fits(labelDiscs(100, 310, 0, 80, 12)), 'nothing under a button');
    occ.screen = [50, 50, 350, 350];
    assert.ok(!occ.fits(labelDiscs(45, 200, 0, 80, 12)), 'nothing cut in half by the screen edge');
    assert.ok(occ.fits(labelDiscs(200, 200, 0, 80, 12)) && occ.fits(labelDiscs(10, 200, 1.5, 20, 12)), 'wholly on or wholly off the screen is fine');
  });
});

describe('placing names', () => {
  /** A made-up water set: a long straight river, a short one crossing it, and two lakes. */
  const water = {
    rivers: [Int32Array.from([0, 500, 1000, 500, 2000, 500, 3000, 500, 4000, 500]), Int32Array.from([2000, 0, 2000, 1000])],
    riverLevels: new Uint8Array(7),
    riverOf: Uint32Array.from([0, 1]),
    riverInfo: [
      { name: 'Long River', names: {}, wikidata: null, lengthKm: 800 },
      { name: 'Short', names: {}, wikidata: null, lengthKm: 60 },
    ],
    lakes: [Int32Array.from([3000, 3000, 3600, 3000, 3600, 3600, 3000, 3600]), Int32Array.from([200, 2000, 260, 2000, 260, 2060])],
    lakeLevels: new Uint8Array(7),
    lakeOf: Uint32Array.from([0, 1]),
    lakeInfo: [
      { name: 'Big Lake', names: {}, wikidata: null, areaKm2: 3600, at: /** @type {[number, number]} */ ([3300, 3300]) },
      { name: 'Pond', names: {}, wikidata: null, areaKm2: 0.2, at: /** @type {[number, number]} */ ([230, 2030]) },
    ],
  };
  const index = indexWater(water);

  it('names the big ones, upright, readable, and never on top of each other', () => {
    const labels = placeWaterLabels({ water, index, level: 2, scale: 0.1, ox: 0, oy: 400, width: 400, height: 400, measure });
    const texts = labels.map((l) => l.text);
    assert.ok(texts.includes('Long River'));
    assert.ok(texts.includes('Big Lake'));
    assert.ok(!texts.includes('Pond'), 'a lake a few pixels big is not named');
    for (const l of labels) {
      assert.ok(l.size >= MIN_FONT_PX);
      assert.ok(Math.abs(l.angle) <= Math.PI / 2, 'kept upright');
    }
    const occ = new Occupancy(400, 400);
    for (const l of labels) {
      const discs = labelDiscs(l.x, l.y, l.angle, measure(l.text, l.size), l.size);
      assert.ok(occ.fits(discs), `${l.text} overlaps another name`);
      occ.add(discs);
    }
  });

  it('hides small rivers when zoomed far out', () => {
    const labels = placeWaterLabels({ water, index, level: 0, scale: 0.02, ox: 0, oy: 400, width: 400, height: 400, measure });
    assert.ok(!labels.some((l) => l.text === 'Short'));
  });
  it('keeps the biggest names when the time budget is already spent', () => {
    let t = 0;
    const result = { complete: false };
    const labels = placeWaterLabels({ water, index, level: 2, scale: 0.1, ox: 0, oy: 400, width: 400, height: 400, measure, budgetMs: 0, now: () => (t += 50), result });
    const texts = labels.map((l) => l.text);
    assert.ok(texts.includes('Long River') && texts.includes('Big Lake'), `got ${texts.join(', ')}`);
    assert.equal(result.complete, true, 'with fewer than a dozen names, every one was tried');
  });

  it('puts a river\'s name back where it was after a pan, instead of hopping to the new middle', () => {
    // A long straight river with a point every 25 px at this scale.
    const line = Int32Array.from({ length: 66 }, (_, i) => (i % 2 ? 500 : (i / 2) * 250));
    const one = {
      ...water, rivers: [line], riverLevels: new Uint8Array(33), riverOf: Uint32Array.from([0]),
      riverInfo: [water.riverInfo[0]], lakes: [], lakeLevels: new Uint8Array(0), lakeOf: new Uint32Array(0), lakeInfo: [],
    };
    const idx = indexWater(one);
    const at = (/** @type {number} */ ox, /** @type {Map<number, number[]> | undefined} */ previous) => {
      const l = placeWaterLabels({ water: one, index: idx, level: 2, scale: 0.1, ox, oy: 400, width: 400, height: 400, measure, previous })
        .find((x) => x.text === 'Long River');
      assert.ok(l && l.mx !== undefined && l.river === 0);
      return l;
    };
    const first = at(0, undefined);
    const previous = new Map([[0, [/** @type {number} */ (first.mx), /** @type {number} */ (first.my)]]]);
    const panned = at(-100, previous);
    assert.ok(Math.abs(/** @type {number} */ (panned.mx) - /** @type {number} */ (first.mx)) * 0.1 < 30, 'the name stayed on the same stretch of river');
    const fresh = at(-100, undefined);
    assert.ok(Math.abs(/** @type {number} */ (fresh.mx) - /** @type {number} */ (first.mx)) * 0.1 > 60, 'without memory it would have moved');
  });
});

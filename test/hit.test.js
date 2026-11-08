// @ts-check
// Tests for what a tap lands on (src/ui/map/hit.js), on INVENTED squares and lines: not history.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hitWater, pointInRings, RIVER_IN_LAKE_PX, RIVER_PX } from '../src/ui/map/hit.js';
import { indexWater } from '../src/ui/map/labels.js';

const sq = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) => Int32Array.from([x, y, x + s, y, x + s, y + s, x, y + s]);
/** INVENTED: a long river along y = 500; a small one along y = 4000; a big lake (with an island) and a small lake inside it. */
const water = {
  rivers: [Int32Array.from([0, 500, 2000, 500, 4000, 500]), Int32Array.from([0, 4000, 4000, 4000]), Int32Array.from([5000, 7000, 7600, 7000])],
  riverLevels: new Uint8Array(3 + 2 + 2),
  riverOf: Uint32Array.from([0, 1, 2]),
  riverInfo: [
    { name: 'Long', names: {}, wikidata: null, lengthKm: 800 },
    { name: 'Small', names: {}, wikidata: null, lengthKm: 60 },
    { name: 'Through', names: {}, wikidata: null, lengthKm: 800 },
  ],
  lineName: null, lineNames: [''], lineLocal: [''],
  lakes: [sq(5000, 6000, 3000), sq(6000, 7000, 500), sq(1000, 1000, 300)],
  lakeLevels: new Uint8Array(12),
  lakeOf: Uint32Array.from([0, 0, 1]),
  lakeInfo: [
    { name: 'Big', names: {}, wikidata: null, areaKm2: 900, at: /** @type {[number, number]} */ ([6500, 7500]) },
    { name: 'Pond', names: {}, wikidata: null, areaKm2: 9, at: /** @type {[number, number]} */ ([1150, 1150]) },
  ],
};
const index = indexWater(water);
const all = () => true;
/** Hits at a game point with the screen scale 0.1 px per unit, unless changed. @param {number} x @param {number} y @param {object} [more] */
const hit = (x, y, more = {}) => hitWater({ x, y, scale: 0.1, level: 2, water, index, labels: null, fx: 0, fy: 0, lineShown: all, lakeShown: all, ...more });

describe('even-odd rings', () => {
  it('holds a point inside a ring, not one inside a hole', () => {
    assert.equal(pointInRings(5, 5, [sq(0, 0, 10)]), true);
    assert.equal(pointInRings(15, 5, [sq(0, 0, 10)]), false);
    assert.equal(pointInRings(5, 5, [sq(0, 0, 10), sq(2, 2, 6)]), false, 'an island');
    assert.equal(pointInRings(1, 1, [sq(0, 0, 10), sq(2, 2, 6)]), true);
  });
});

describe('what a tap lands on', () => {
  it('a name wins: the last placed one, tested against its width', () => {
    const labels = [
      { text: 'Long', size: 12, x: 100, y: 100, angle: 0, width: 60, river: 0, line: 0 },
      { text: 'Big', size: 12, x: 120, y: 100, angle: 0, width: 60, lake: 0 },
    ];
    assert.deepEqual(hit(0, 0, { labels, fx: 110, fy: 100 }), { kind: 'lake', lake: 0 });
    assert.deepEqual(hit(0, 0, { labels, fx: 75, fy: 100 }), { kind: 'river', river: 0, line: 0 });
    assert.equal(hit(0, 0, { labels, fx: 300, fy: 300 }), null);
  });
  it('a lake: the smallest holding the point; an island is no lake', () => {
    assert.deepEqual(hit(6200, 6200), { kind: 'lake', lake: 0 });
    assert.deepEqual(hit(1100, 1100), { kind: 'lake', lake: 1 });
  });
  it('an island in a lake does not hit', () => {
    const islandWater = { ...water, lakes: [sq(5000, 6000, 3000), sq(6000, 7000, 500)], lakeOf: Uint32Array.from([0, 0]), lakeLevels: new Uint8Array(8), rivers: [], riverLevels: new Uint8Array(0), riverOf: new Uint32Array(0), riverInfo: [] };
    const idx = indexWater(islandWater);
    const r = hitWater({ x: 6250, y: 7250, scale: 0.1, level: 2, water: islandWater, index: idx, labels: null, fx: 0, fy: 0, lineShown: all, lakeShown: all });
    assert.equal(r, null);
  });
  it('a river through a lake wins within 6 px of its line, not beyond', () => {
    // Through runs along y = 7000, 1000 units (100 px at 0.1 px per unit) of it inside Big.
    assert.deepEqual(hit(6800, 7000 + (RIVER_IN_LAKE_PX - 1) / 0.1), { kind: 'river', river: 2, line: 2 });
    assert.deepEqual(hit(6800, 7000 + (RIVER_IN_LAKE_PX + 1) / 0.1), { kind: 'lake', lake: 0 });
  });
  it('a river within 20 px, not 21', () => {
    assert.deepEqual(hit(1000, 500 + (RIVER_PX - 1) / 0.1), { kind: 'river', river: 0, line: 0 });
    assert.equal(hit(1000, 500 + (RIVER_PX + 1) / 0.1), null);
  });
  it('skips a hidden size band, a line not shown and a lake not shown', () => {
    assert.equal(hit(1000, 4000), null, 'small rivers wait until zoomed in');
    assert.deepEqual(hit(1000, 4000, { scale: 0.2 }), { kind: 'river', river: 1, line: 1 });
    assert.equal(hit(1000, 500, { lineShown: (/** @type {number} */ i) => i !== 0 }), null);
    assert.equal(hit(1100, 1100, { lakeShown: (/** @type {number} */ k) => k !== 1 }), null);
  });
  it('a lake drawn only at a finer level is not hit at a coarser one', () => {
    const coarse = { ...water, lakeLevels: new Uint8Array(12).fill(2) };
    const idx = indexWater(coarse);
    assert.equal(hitWater({ x: 1100, y: 1100, scale: 0.1, level: 0, water: coarse, index: idx, labels: null, fx: 0, fy: 0, lineShown: all, lakeShown: all }), null);
  });
  describe('seas', () => {
    const seas = [{ id: 'gulf', ring: [100, 8000, 900, 8000, 900, 9000, 100, 9000] }, { id: 'main', ring: null }];
    const isSea = (/** @type {number} */ x) => x < 3000;
    it('old sea over land, today\'s sea, and land', () => {
      assert.deepEqual(hit(5000, 9000, { seas, oldSea: () => true }), { kind: 'sea', sea: 'main' });
      assert.deepEqual(hit(500, 8500, { seas, sea: isSea }), { kind: 'sea', sea: 'gulf' }, 'a ring wins over the default');
      assert.deepEqual(hit(2000, 9500, { seas, sea: isSea }), { kind: 'sea', sea: 'main' });
      assert.equal(hit(3500, 9500, { seas, sea: isSea }), null, 'land');
      assert.equal(hit(2000, 9500, { sea: isSea }), null, 'no names, no seas');
    });
    it('a river or lake in the sea is tapped before the sea', () => {
      assert.deepEqual(hit(1000, 500, { seas, sea: () => true }), { kind: 'river', river: 0, line: 0 });
    });
  });
});

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

  it('gives a stretch\'s lift: how far the line bulges towards the name above it', () => {
    // An arch bulging up the screen (smaller y), the side a name reading left to right sits on.
    const arch = new Float64Array([20, 100, 70, 92, 120, 88, 170, 92, 220, 100]);
    const [up] = straightStretches(arch, 190, 20, frame, undefined, [], true);
    assert.ok(up && Math.abs(/** @type {number} */ (up.lift) - 12) < 0.01, `lift ${up?.lift}`);
    const dip = new Float64Array([20, 100, 70, 108, 120, 112, 170, 108, 220, 100]);
    assert.equal(straightStretches(dip, 190, 20, frame, undefined, [], true)[0]?.lift, 0, 'a dip away from the name needs no lift');
    assert.equal(straightStretches(arch, 190, 20, frame)[0]?.lift, undefined, 'only when asked');
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
    /** @type {Uint32Array | null} */
    lineName: null,
    lineNames: [''],
    lineLocal: [''],
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

  it('names each stretch of a river by its own local name', () => {
    // The long river in two stretches: the west half "Nemunas", the east half "Nyoman" (Нёман,
    // romanised when the block was packed).
    const two = {
      ...water,
      rivers: [Int32Array.from([0, 500, 1000, 500, 2000, 500]), Int32Array.from([2000, 500, 3000, 500, 4000, 500]), water.rivers[1]],
      riverLevels: new Uint8Array(8), riverOf: Uint32Array.from([0, 0, 1]),
      lineName: Uint32Array.from([1, 2, 0]), lineNames: ['', 'Nemunas', 'Nyoman'], lineLocal: ['', '', 'Нёман'],
    };
    const texts = (/** @type {number} */ ox) => placeWaterLabels({ water: two, index: indexWater(two), level: 2, scale: 0.1, ox, oy: 400, width: 400, height: 400, measure }).map((l) => l.text);
    assert.ok(texts(0).includes('Nemunas') && !texts(0).includes('Nyoman'), texts(0).join(', '));
    assert.ok(texts(-250).includes('Nyoman') && !texts(-250).includes('Nemunas'), texts(-250).join(', '));
    const plain = { ...two, lineName: Uint32Array.from([1, 0, 0]) };
    const east = placeWaterLabels({ water: plain, index: indexWater(plain), level: 2, scale: 0.1, ox: -250, oy: 400, width: 400, height: 400, measure }).map((l) => l.text);
    assert.ok(east.includes('Long River'), 'a stretch without a name of its own carries the river\'s');
  });

  it('lifts a long river\'s name clear of bends too big for a straight name, and only a long river\'s', () => {
    // A sawtooth 10 px high at this scale: too much bend for a straight name in 13 px type
    // (limit 5.2 px), within what a long river may lift its name over (15.6 px).
    const wave = Int32Array.from({ length: 34 }, (_, i) => (i % 2 ? 500 + ((i - 1) / 2 % 2 ? 50 : -50) : (i / 2) * 250));
    /** @param {number} lengthKm */
    const named = (lengthKm) => {
      const one = {
        ...water, rivers: [wave], riverLevels: new Uint8Array(17), riverOf: Uint32Array.from([0]),
        riverInfo: [{ name: 'Zakhodnyaya Dzvina', names: {}, wikidata: null, lengthKm }], lakes: [], lakeLevels: new Uint8Array(0), lakeOf: new Uint32Array(0), lakeInfo: [],
      };
      return placeWaterLabels({ water: one, index: indexWater(one), level: 2, scale: 0.1, ox: 0, oy: 400, width: 400, height: 400, measure });
    };
    const [label] = named(1000);
    assert.ok(label, 'the long river is named');
    // Every point of the river stays clear of the name's band (half its height, and a little).
    const nx = Math.sin(label.angle); const ny = -Math.cos(label.angle);
    for (let i = 0; i < wave.length; i += 2) {
      const px = wave[i] * 0.1; const py = 400 - wave[i + 1] * 0.1;
      const along = (px - label.x) * Math.cos(label.angle) + (py - label.y) * Math.sin(label.angle);
      if (Math.abs(along) > measure(label.text, label.size) / 2) continue;
      assert.ok((label.x - px) * nx + (label.y - py) * ny > label.size / 2, 'the river never runs under the name');
    }
    assert.equal(named(200).length, 0, 'a shorter river keeps the straight rule');
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

describe('names of the time', () => {
  const water = {
    rivers: [Int32Array.from([0, 500, 1000, 500, 2000, 500, 3000, 500, 4000, 500])],
    riverLevels: new Uint8Array(5), riverOf: Uint32Array.from([0]),
    riverInfo: [{ name: 'Long River', names: {}, wikidata: null, lengthKm: 800 }],
    lineName: /** @type {Uint32Array | null} */ (null), lineNames: [''], lineLocal: [''],
    // Two rings of one lake, then a second lake: the rings of a lake sit together.
    lakes: [Int32Array.from([3000, 3000, 3600, 3000, 3600, 3600, 3000, 3600]), Int32Array.from([3100, 3100, 3200, 3100, 3200, 3200]), Int32Array.from([200, 2000, 260, 2000, 260, 2060])],
    lakeLevels: new Uint8Array(13), lakeOf: Uint32Array.from([0, 0, 1]),
    lakeInfo: [
      { name: 'Big Lake', names: {}, wikidata: null, areaKm2: 3600, at: /** @type {[number, number]} */ ([3300, 3300]) },
      { name: 'Pond', names: {}, wikidata: null, areaKm2: 0.2, at: /** @type {[number, number]} */ ([230, 2030]) },
    ],
  };
  const index = indexWater(water);
  const args = { water, index, level: 2, scale: 0.1, ox: 0, oy: 400, width: 400, height: 400, measure };

  it('shows the text of the time instead of today\'s, with the width for taps', () => {
    const labels = placeWaterLabels({ ...args, names: { line: ['Duna'], lake: ['Lacus', 'Pond'] } });
    const texts = labels.map((l) => l.text);
    assert.ok(texts.includes('Duna') && texts.includes('Lacus'));
    assert.ok(!texts.includes('Long River') && !texts.includes('Big Lake'));
    for (const l of labels) assert.equal(l.width, measure(l.text, l.size));
  });
  it('keeps a name where it was when only its text changes', () => {
    const first = placeWaterLabels({ ...args });
    const previous = new Map();
    for (const l of first) if (l.river !== undefined) previous.set(l.river, [l.mx, l.my]);
    const again = placeWaterLabels({ ...args, previous, names: { line: ['Dune'], lake: ['Big Lake', 'Pond'] } });
    const a = first.find((l) => l.river === 0);
    const b = again.find((l) => l.river === 0);
    assert.ok(a && b);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1, 'same place');
    assert.equal(b.text, 'Dune');
  });
  it('indexes each lake\'s rings and box', () => {
    assert.deepEqual([...index.lakeRingStart], [0, 2, 3]);
    assert.deepEqual([...index.lakeBox.subarray(0, 4)], [3000, 3000, 3600, 3600]);
  });
  it('refuses lake rings that are not together', () => {
    assert.throws(() => indexWater({ ...water, lakeOf: Uint32Array.from([1, 0, 1]) }), /lake order/);
  });
});

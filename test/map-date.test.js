// @ts-check
// Tests for the map's date rules (src/sim/map-date.js): the year of a game day, which map data a
// year uses, dated features, and the land of any year from the anchors and change planes. The
// land tests run on a small made-up world, so they need no map data.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayFromDate } from '../src/sim/calendar.js';
import { hash01 } from '../src/sim/grid.js';
import { activeAt, BLOCK_CELLS, createTerrainTimeline, eraOf, FIRST_MAP_YEAR, mapYear, timelineFromBlock } from '../src/sim/map-date.js';
import { changePlane } from '../tools/map/terrain-time.mjs';
import { distanceTo } from '../tools/map/terrain-fields.mjs';

const OPEN = 2; const CONIFER = 3; const MIXED = 4;

describe('mapYear and eraOf', () => {
  it('give the calendar year of a game day, BC years negative and no year 0', () => {
    assert.equal(mapYear(dayFromDate(1219, 1, 1)), 1219);
    assert.equal(mapYear(dayFromDate(1219, 12, 31)), 1219);
    assert.equal(mapYear(dayFromDate(2021, 12, 31)), 2021);
    assert.equal(mapYear(0), 1);
    assert.equal(mapYear(-1), -1, 'the day before 1 January AD 1 is in 1 BC');
    assert.equal(mapYear(dayFromDate(-10000, 6, 1)), -10000);
  });

  it('show the 1219 map for every year before 1219, and say when a year has no map of its own', () => {
    assert.deepEqual(eraOf(1550), { id: 'historic', year: 1550, noData: false });
    assert.deepEqual(eraOf(800), { id: 'historic', year: FIRST_MAP_YEAR, noData: false });
    assert.deepEqual(eraOf(1), { id: 'historic', year: FIRST_MAP_YEAR, noData: false });
    assert.deepEqual(eraOf(-1), { id: 'historic', year: FIRST_MAP_YEAR, noData: true });
    assert.throws(() => eraOf(0), /no year 0/);
    assert.throws(() => eraOf(1.5), /bad year/);
  });
});

describe('activeAt: dated features', () => {
  const entries = [
    { on: /** @type {[number | null, number | null]} */ ([1959, null]) }, // a reservoir filled in 1959
    { on: /** @type {[number | null, number | null]} */ ([null, 1497]) }, // an outlet that closed in 1497
    { on: /** @type {[number | null, number | null]} */ ([1308, 1400]) },
    { on: /** @type {[number | null, number | null]} */ ([-5, 3]) }, // across the BC/AD line
  ];
  it('switch on at their first year and off at their end year', () => {
    assert.deepEqual([...activeAt(entries, 1958)], [0, 0, 0, 0]);
    assert.deepEqual([...activeAt(entries, 1959)], [1, 0, 0, 0]);
    assert.deepEqual([...activeAt(entries, 1496)], [0, 1, 0, 0]);
    assert.deepEqual([...activeAt(entries, 1497)], [0, 0, 0, 0]);
    assert.deepEqual([...activeAt(entries, 1308)], [0, 1, 1, 0]);
    assert.deepEqual([...activeAt(entries, 1399)], [0, 1, 1, 0]);
    assert.deepEqual([...activeAt(entries, 1400)], [0, 1, 0, 0]);
  });
  it('handle BC years, with 1 BC right before AD 1', () => {
    assert.deepEqual([...activeAt(entries, -6)], [0, 1, 0, 0]);
    assert.deepEqual([...activeAt(entries, -5)], [0, 1, 0, 1]);
    assert.deepEqual([...activeAt(entries, -1)], [0, 1, 0, 1]);
    assert.deepEqual([...activeAt(entries, 1)], [0, 1, 0, 1]);
    assert.deepEqual([...activeAt(entries, 2)], [0, 1, 0, 1]);
    assert.deepEqual([...activeAt(entries, 3)], [0, 1, 0, 0]);
    assert.throws(() => activeAt(entries, 0));
  });
});

/**
 * A made-up world, 160 x 128 cells: forest (conifer in the north, mixed in the south) with a few
 * round open clearings. Each later anchor clears a ring further out round them, and the last one
 * lets forest grow back over one area, as a real 20th century did.
 */
function world() {
  const cols = 160; const rows = 128; const n = cols * rows;
  const centres = [[30, 30], [110, 40], [70, 95], [140, 110]];
  const clearing = new Uint8Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [x, y] of centres) if ((c - x) ** 2 + (r - y) ** 2 < 36) clearing[r * cols + c] = 1;
    }
  }
  const dist = distanceTo(clearing, cols, rows);
  /** @param {number} km @param {boolean} [regrow] */
  const anchor = (km, regrow = false) => {
    const g = new Uint8Array(n);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const wobble = 3 * hash01(c >> 3, r >> 3, 5);
        g[i] = dist[i] <= km + wobble ? OPEN : r >= rows / 2 ? CONIFER : MIXED;
        if (regrow && c > 90 && r > 80) g[i] = r >= rows / 2 + 20 ? CONIFER : MIXED;
      }
    }
    return g;
  };
  const anchors = [anchor(0), anchor(6), anchor(14), anchor(20), anchor(24, true)];
  // A swap of conifer and mixed in one corner between the second and third anchors.
  for (let r = 0; r < 30; r++) for (let c = 0; c < 40; c++) if (anchors[2][r * cols + c] === MIXED) { anchors[2][r * cols + c] = CONIFER; anchors[3][r * cols + c] = CONIFER; anchors[4][r * cols + c] = anchors[4][r * cols + c] === MIXED ? CONIFER : anchors[4][r * cols + c]; }
  const years = [1250, 1425, 1725, 1900, 2021];
  const intervals = years.slice(0, -1).map((y0, k) => ({ y0, y1: years[k + 1], plane: changePlane(anchors[k], anchors[k + 1], cols, rows, 1) }));
  return { cols, rows, n, anchors, years, intervals, dist };
}

/** @param {Uint8Array} a @param {Uint8Array} b */
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('the land over time, on a made-up world', () => {
  const w = world();
  const tl = createTerrainTimeline({ cols: w.cols, rows: w.rows, base: w.anchors[0], intervals: w.intervals, seed: 1250 });

  it('shows each anchor exactly in its year, and the 1219 land unchanged up to 1250', () => {
    for (let k = 1; k < w.anchors.length; k++) assert.ok(same(tl.classesAt(w.years[k]), w.anchors[k]), `anchor ${w.years[k]}`);
    for (const y of [1219, 1220, 1249, 1250, 800, -100]) assert.ok(same(tl.classesAt(y), w.anchors[0]), `year ${y}`);
    assert.ok(!same(tl.classesAt(1300), w.anchors[0]), 'by 1300 some land has changed');
    assert.ok(same(tl.classesAt(3000), w.anchors[4]), 'after the last anchor the land stays as it is');
  });

  it('switches each changing cell once, in a year inside its stretch (after y0, up to y1)', () => {
    for (let k = 0; k < w.intervals.length; k++) {
      const { y0, y1, plane } = w.intervals[k];
      const e = tl.switches(k);
      let changing = 0;
      for (const v of plane) if (v & 7) changing++;
      assert.equal(e.cells.length, changing);
      assert.equal(new Set(e.cells).size, changing, 'no cell switches twice');
      for (let j = 0; j < e.cells.length; j++) {
        assert.ok(e.years[j] > y0 && e.years[j] <= y1, `year ${e.years[j]} outside ${y0}-${y1}`);
        assert.equal(e.cls[j], plane[e.cells[j]] & 7);
        if (j) assert.ok(e.years[j] >= e.years[j - 1], 'in year order');
      }
    }
  });

  it('switches cells nearer their new class first, block by block', () => {
    // Inside a block, bands go in order; the blend with the neighbouring blocks (so no block edge
    // shows) and the hashed order inside a band leave the order close to, not exactly, by band.
    let blocks = 0;
    for (let k = 0; k < w.intervals.length; k++) {
      const { plane } = w.intervals[k];
      const e = tl.switches(k);
      /** @type {Map<number, { band: number[], year: number[] }>} */
      const byBlock = new Map();
      for (let j = 0; j < e.cells.length; j++) {
        const i = e.cells[j];
        const c = i % w.cols; const r = (i - c) / w.cols;
        const b = Math.floor(r / BLOCK_CELLS) * 1000 + Math.floor(c / BLOCK_CELLS);
        const entry = byBlock.get(b) ?? { band: [], year: [] };
        entry.band.push(plane[i] >> 3); entry.year.push(e.years[j]);
        byBlock.set(b, entry);
      }
      for (const { band, year } of byBlock.values()) {
        if (band.length < 50 || new Set(band).size < 3) continue;
        const rho = spearman(band, year);
        assert.ok(rho > 0.7, `interval ${k}: band and year correlate only ${rho.toFixed(3)} over ${band.length} cells`);
        blocks++;
      }
    }
    assert.ok(blocks >= 8, `only ${blocks} blocks checked`);
  });

  it('clears outward from the open land: inside each block, switch year follows distance to open land', () => {
    let blocks = 0;
    for (let k = 0; k < w.intervals.length; k++) {
      const open = Uint8Array.from(w.anchors[k], (t) => (t === OPEN ? 1 : 0));
      const dist = distanceTo(open, w.cols, w.rows);
      const e = tl.switches(k);
      /** @type {Map<number, { d: number[], y: number[] }>} */
      const byBlock = new Map();
      for (let j = 0; j < e.cells.length; j++) {
        const i = e.cells[j];
        if (e.cls[j] !== OPEN) continue; // clearings only
        const c = i % w.cols; const r = (i - c) / w.cols;
        const b = Math.floor(r / BLOCK_CELLS) * 1000 + Math.floor(c / BLOCK_CELLS);
        const entry = byBlock.get(b) ?? { d: [], y: [] };
        entry.d.push(dist[i]); entry.y.push(e.years[j]);
        byBlock.set(b, entry);
      }
      // Inside a 2 km band the order is hashed, so a block with few bands correlates less.
      const rhos = [];
      for (const { d, y } of byBlock.values()) {
        if (d.length < 50 || new Set(d.map((v) => Math.floor(v / 2))).size < 3) continue;
        const rho = spearman(d, y);
        assert.ok(rho > 0.6, `interval ${k}: rank correlation ${rho.toFixed(3)} over ${d.length} clearings`);
        rhos.push(rho);
      }
      if (rhos.length) assert.ok(rhos.reduce((a, b) => a + b, 0) / rhos.length > 0.8, `interval ${k}: mean rank correlation ${rhos}`);
      blocks += rhos.length;
    }
    assert.ok(blocks >= 8, `only ${blocks} blocks checked`);
  });

  it('changes at a steady pace through the stretch: the whole map closely, each block roughly', () => {
    for (let k = 0; k < w.intervals.length; k++) {
      const { y0, y1 } = w.intervals[k];
      const e = tl.switches(k);
      /** @type {Map<number, number[]>} */
      const byBlock = new Map();
      for (let j = 0; j < e.cells.length; j++) {
        const i = e.cells[j];
        const c = i % w.cols; const r = (i - c) / w.cols;
        const b = Math.floor(r / BLOCK_CELLS) * 1000 + Math.floor(c / BLOCK_CELLS);
        byBlock.set(b, [...(byBlock.get(b) ?? []), e.years[j]]);
      }
      /** @type {number[]} */ const off = [];
      for (const q of [0.25, 0.5, 0.75]) {
        const at = y0 + Math.round(q * (y1 - y0));
        const done = Array.from(e.years).filter((t) => t <= at).length / e.years.length;
        assert.ok(Math.abs(done - q) <= 0.06, `interval ${k}: ${done} of the map done by ${at}, expected about ${q}`);
        for (const years of byBlock.values()) if (years.length >= 50) off.push(Math.abs(years.filter((t) => t <= at).length / years.length - q));
      }
      off.sort((a, b) => a - b);
      assert.ok(off[off.length >> 1] <= 0.12, `interval ${k}: blocks are ${off[off.length >> 1]} off a steady pace (median)`);
    }
  });

  it('moves forward with advance() to exactly what classesAt() says, touching only cells that switch', () => {
    const grid = tl.classesAt(1219);
    let year = 1219;
    let seed = 7;
    while (year < 2030) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const step = 1 + (seed % 37);
      /** @type {Map<number, number>} */ const touched = new Map();
      let calls = 0;
      const before = grid.slice();
      const n = tl.advance(grid, year, year + step, (cell, cls) => { calls++; touched.set(cell, cls); assert.equal(grid[cell], cls); });
      year += step;
      assert.ok(same(grid, tl.classesAt(year)), `advance to ${year}`);
      assert.equal(n, calls);
      // A step across an anchor may change a cell twice (cleared, then grown back); the last
      // report is what it shows. Every cell that differs was reported.
      for (let i = 0; i < grid.length; i++) if (grid[i] !== before[i]) assert.equal(touched.get(i), grid[i]);
      for (const [cell, cls] of touched) assert.equal(grid[cell], cls);
    }
  });

  it('rebuilds on a jump back (an earlier save loaded)', () => {
    const grid = tl.classesAt(1950);
    const n = tl.advance(grid, 1950, 1400);
    assert.ok(n > 0);
    assert.ok(same(grid, tl.classesAt(1400)));
  });

  it('is right either side of every anchor year', () => {
    for (let k = 0; k < w.intervals.length; k++) {
      const { y0, y1 } = w.intervals[k];
      const before = tl.classesAt(y0);
      const after = tl.classesAt(y0 + 1);
      const e = tl.switches(k);
      const first = e.cells.filter((_, j) => e.years[j] === y0 + 1);
      let differs = 0;
      for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) differs++;
      assert.equal(differs, first.length, `only the cells due in ${y0 + 1} change from ${y0}`);
      assert.ok(same(tl.classesAt(y1), w.anchors[k + 1]));
      if (k + 1 < w.intervals.length) assert.ok(!same(tl.classesAt(y1 + 1), w.anchors[k + 1]) || tl.switches(k + 1).years[0] > y1 + 1);
      else assert.ok(same(tl.classesAt(y1 + 1), w.anchors[k + 1]));
    }
  });

  it('gives the same bytes from the same inputs, and other switch years from another seed', () => {
    const again = createTerrainTimeline({ cols: w.cols, rows: w.rows, base: w.anchors[0], intervals: w.intervals, seed: 1250 });
    const other = createTerrainTimeline({ cols: w.cols, rows: w.rows, base: w.anchors[0], intervals: w.intervals, seed: 99 });
    for (const y of [1300, 1600, 1800, 1950]) assert.ok(same(tl.classesAt(y), again.classesAt(y)), `year ${y}`);
    assert.ok(!same(tl.classesAt(1600), other.classesAt(1600)));
    assert.ok(same(tl.classesAt(1725), other.classesAt(1725)), 'the anchors do not depend on the seed');
  });

  it('reads the shipped block\'s layout (timelineFromBlock)', () => {
    /** @type {Record<string, Uint8Array>} */ const layers = {};
    const intervals = w.intervals.map(({ y0, y1, plane }) => { layers[`p${y0}`] = plane; return { y0, y1, layer: `p${y0}` }; });
    const fromBlock = timelineFromBlock({ meta: { grid: { cols: w.cols, rows: w.rows }, intervals, seed: 1250, blockCells: BLOCK_CELLS }, layers, base: w.anchors[0] });
    assert.ok(same(fromBlock.classesAt(1555), tl.classesAt(1555)));
    assert.throws(() => timelineFromBlock({ meta: { grid: { cols: w.cols, rows: w.rows }, intervals: [{ y0: 1250, y1: 1425, layer: 'gone' }], seed: 1, blockCells: 32 }, layers, base: w.anchors[0] }), /no layer gone/);
  });

  it('refuses intervals that overlap or run backwards, and planes of the wrong size', () => {
    const plane = w.intervals[0].plane;
    assert.throws(() => createTerrainTimeline({ cols: w.cols, rows: w.rows, base: w.anchors[0], intervals: [{ y0: 1425, y1: 1250, plane }], seed: 1 }), /does not move forward/);
    assert.throws(() => createTerrainTimeline({ cols: w.cols, rows: w.rows, base: w.anchors[0], intervals: [{ y0: 1250, y1: 1425, plane }, { y0: 1400, y1: 1500, plane }], seed: 1 }), /starts before/);
    assert.throws(() => createTerrainTimeline({ cols: w.cols, rows: w.rows, base: w.anchors[0], intervals: [{ y0: 1250, y1: 1425, plane: plane.subarray(1) }], seed: 1 }), /plane has/);
  });
});

describe('the land over time across the BC/AD line', () => {
  const cols = 64; const rows = 32; const n = cols * rows;
  const base = new Uint8Array(n).fill(MIXED);
  const later = base.slice();
  for (let i = 0; i < n; i += 3) later[i] = OPEN;
  const plane = changePlane(base, later, cols, rows, 1);
  const tl = createTerrainTimeline({ cols, rows, base, intervals: [{ y0: -3, y1: 3, plane }], seed: 4 });

  it('never uses a year 0, and spreads the change over the five years -2, -1, 1, 2, 3', () => {
    const e = tl.switches(0);
    const years = new Set(e.years);
    assert.ok(!years.has(0));
    for (const y of years) assert.ok([-2, -1, 1, 2, 3].includes(y), `year ${y}`);
    assert.equal(years.size, 5, 'every one of the five years is used');
  });

  it('agrees between advance() and classesAt() over 1 BC to AD 1', () => {
    const grid = tl.classesAt(-1);
    tl.advance(grid, -1, 1);
    assert.ok(same(grid, tl.classesAt(1)));
    assert.ok(same(tl.classesAt(-3), base));
    assert.ok(same(tl.classesAt(3), later));
    assert.throws(() => tl.classesAt(0), /no year 0/);
  });
});

describe('overrides: cells with a class of their own for part of the time', () => {
  const w = world();
  // A "marsh" (class 5) over some cells until it is diked in waves between 1308 and 1400, and a
  // patch that turns heath (class 6) from a year between 1600 and 1650.
  /** @type {number[]} */ const marshCells = [];
  /** @type {number[]} */ const heathCells = [];
  for (let r = 60; r < 80; r++) for (let c = 20; c < 60; c++) marshCells.push(r * w.cols + c);
  for (let r = 10; r < 20; r++) for (let c = 120; c < 140; c++) heathCells.push(r * w.cols + c);
  const overrides = [
    { cells: marshCells, cls: 5, from: 1308, to: 1400, bands: marshCells.map((i) => Math.min(31, (i % w.cols) - 20)) },
    { cells: heathCells, cls: 6, from: 1600, to: 1650, hold: /** @type {'after'} */ ('after') },
  ];
  const tl = createTerrainTimeline({ cols: w.cols, rows: w.rows, base: w.anchors[0], intervals: w.intervals, overrides, seed: 1250 });
  const plain = createTerrainTimeline({ cols: w.cols, rows: w.rows, base: w.anchors[0], intervals: w.intervals, seed: 1250 });

  it('hold their class until each cell\'s own year inside the span, then show the anchors', () => {
    for (const i of marshCells) assert.equal(tl.classesAt(1307)[i], 5);
    const at1400 = tl.classesAt(1400);
    const plain1400 = plain.classesAt(1400);
    for (const i of marshCells) assert.equal(at1400[i], plain1400[i]);
    const mid = tl.classesAt(1354);
    const still = marshCells.filter((i) => mid[i] === 5).length;
    assert.ok(still > 0 && still < marshCells.length, `${still} of ${marshCells.length} still marsh in 1354`);
    // Waves: lower bands (west) are diked first.
    const west = marshCells.filter((i) => i % w.cols < 30 && mid[i] === 5).length;
    const east = marshCells.filter((i) => i % w.cols >= 50 && mid[i] === 5).length;
    assert.ok(west < east, `west ${west} still marsh, east ${east}`);
  });

  it('can switch the other way: the anchors until the cell\'s year, the override class after', () => {
    for (const i of heathCells) assert.equal(tl.classesAt(1599)[i], plain.classesAt(1599)[i]);
    for (const i of heathCells) assert.equal(tl.classesAt(1650)[i], 6);
    for (const i of heathCells) assert.equal(tl.classesAt(2021)[i], 6);
  });

  it('leave every other cell as the anchors say, and advance() still equals classesAt()', () => {
    const inOverride = new Set([...marshCells, ...heathCells]);
    for (const y of [1219, 1350, 1625, 2021]) {
      const a = tl.classesAt(y); const b = plain.classesAt(y);
      for (let i = 0; i < a.length; i++) if (!inOverride.has(i)) assert.equal(a[i], b[i]);
    }
    const grid = tl.classesAt(1219);
    let year = 1219;
    for (const step of [50, 40, 3, 7, 90, 150, 211, 300, 10]) {
      tl.advance(grid, year, year + step);
      year += step;
      assert.ok(same(grid, tl.classesAt(year)), `advance to ${year}`);
    }
  });

  it('refuse a cell in two overrides', () => {
    assert.throws(() => createTerrainTimeline({ cols: w.cols, rows: w.rows, base: w.anchors[0], intervals: w.intervals, seed: 1, overrides: [overrides[0], { cells: [marshCells[0]], cls: 6, from: 1500, to: 1500 }] }), /two overrides/);
  });
});

/** Spearman rank correlation. @param {number[]} a @param {number[]} b */
function spearman(a, b) {
  const rank = (/** @type {number[]} */ v) => {
    const order = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = new Float64Array(v.length);
    for (let k = 0; k < order.length;) {
      let m = k;
      while (m + 1 < order.length && order[m + 1][0] === order[k][0]) m++;
      for (let j = k; j <= m; j++) r[order[j][1]] = (k + m) / 2;
      k = m + 1;
    }
    return r;
  };
  const ra = rank(a); const rb = rank(b);
  const mean = (ra.length - 1) / 2;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < ra.length; i++) { num += (ra[i] - mean) * (rb[i] - mean); da += (ra[i] - mean) ** 2; db += (rb[i] - mean) ** 2; }
  return num / Math.sqrt(da * db);
}

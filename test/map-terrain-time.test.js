// @ts-check
// Tests for the land over time: the rules that cut the later forest anchors (tools/map/terrain-time.mjs)
// on a made-up world, and the shipped terrain-time block (src/data/by-sa/terrain-time.json) read
// through the game's own date engine. Neither needs data/raw/; where the build's own record is
// there (data/raw/derived/terrain-time-1km.u8.json), it is checked too.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { hash01 } from '../src/sim/grid.js';
import { timelineFromBlock } from '../src/sim/map-date.js';
import { unbundleBlocks } from '../src/ui/map/codec.js';
import { TERRAIN_SOURCES } from '../tools/map/build-terrain-1219.mjs';
import { OUT_NAME, TIME_SOURCES } from '../tools/map/build-terrain-time.mjs';
import { TIME_BLOCK } from '../tools/map/pack-terrain-time.mjs';
import { MAP } from '../tools/map/projection.mjs';
import { DERIVED } from '../tools/map/resample.mjs';
import { buildTerrain1219, CLASS, cutTerrain, prepareTerrain, terrainParamsSha256 } from '../tools/map/terrain-1219.mjs';
import { againstTheFlow, ANCHORS, anchorSquares, changePlane, cutLaterAnchors, TIME_PARAMS, timeParamsSha256, worldCoverTarget } from '../tools/map/terrain-time.mjs';
import { syntheticInput } from './terrain-synthetic.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (/** @type {string} */ p) => readFileSync(join(ROOT, p), 'utf8');
/** @param {Uint8Array} b */
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
/** @param {Uint8Array} a @param {Uint8Array} b */
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const isForest = (/** @type {number} */ t) => t === CLASS.conifer || t === CLASS.mixed;

/** The terrain-1219 block as M2b shipped it: splitting the rules must not move a byte. */
const SHIPPED_1219_SHA256 = '1128faab669f84d500782bb0bc380716bb149299e6b59de48db4dd3a0fb298b9';
/** The made-up world's 1219 grid from the rules before they were split into prepare and cut. */
const SYNTHETIC_1219_SHA256 = '11542ba9d1c63518d25a059ca1d822e321d62c82905ce52339e4abfdefa84ac6';

describe('the 1219 grid stays as it was', () => {
  it('the split rules give the made-up world the same grid as before the split', () => {
    assert.equal(sha256(buildTerrain1219(syntheticInput()).terrain), SYNTHETIC_1219_SHA256);
    const input = syntheticInput();
    assert.ok(same(cutTerrain(prepareTerrain(input), input).terrain, buildTerrain1219(input).terrain));
  });

  it('the shipped terrain-1219 block is byte for byte the one M2b shipped', () => {
    assert.equal(createHash('sha256').update(read('src/data/by-sa/terrain-1219.json')).digest('hex'), SHIPPED_1219_SHA256);
    assert.equal(JSON.parse(read('src/data/fingerprints.json'))['src/data/by-sa/terrain-1219.json'], SHIPPED_1219_SHA256);
  });
});

describe('later anchors: rules on made-up inputs', () => {
  const input = syntheticInput();
  const prep = prepareTerrain(input);
  const built = cutTerrain(prep, input);
  const L = prep.lattice;
  /** Made-up later windows: forest falls three times, conifer moves both ways. @param {number} f @param {number} c */
  const scaled = (f, c) => ({ forest: L.forest.map((v) => v * f), coniferShare: L.coniferShare.map((v) => Math.min(1, v * c)) });
  const tw1 = scaled(0.6, 0.9);
  const targets = [scaled(0.85, 1.1), scaled(0.7, 1.2), tw1, worldCoverTarget(input.cover.tree, prep, tw1.coniferShare)];
  const later = cutLaterAnchors(prep, built, input, targets);
  const grids = [built.terrain, ...later.map((a) => a.terrain)];

  it('meets every square\'s forest and conifer share to within 3 points at every anchor', () => {
    for (let k = 0; k < later.length; k++) {
      const sq = anchorSquares(later[k].forest, later[k].conifer, targets[k], L, 0);
      assert.equal(sq.rows.length, 9);
      assert.deepEqual(sq.capped, []);
      assert.ok(sq.worstForest <= 0.03, `anchor ${k}: forest off by ${sq.worstForest}`);
      assert.ok(sq.worstConifer <= 0.03, `anchor ${k}: conifer off by ${sq.worstConifer}`);
    }
  });

  it('today\'s conifer share is the 1850-1950 pollen window\'s, square by square', () => {
    const sq = anchorSquares(later[3].forest, later[3].conifer, targets[3], L, 0);
    for (const r of sq.rows) assert.ok(Math.abs(r.conifer - tw1.coniferShare[Math.round(r.lat - L.lat0) * L.w + Math.round(r.lon - L.lon0)]) <= 0.03, `${r.lon},${r.lat}`);
  });

  it('nests every anchor in the one before: no cell goes against its square (forest or conifer)', () => {
    for (let k = 0; k < later.length; k++) {
      assert.deepEqual(againstTheFlow(grids[k], grids[k + 1], later[k].forest, later[k].conifer, prep.places), { forestWrong: 0, coniferWrong: 0 }, `anchor ${k}`);
    }
  });

  it('changes only forest and conifer: sea, marsh and heath stay where they were', () => {
    for (let k = 1; k < grids.length; k++) {
      for (let i = 0; i < grids[0].length; i++) {
        if (prep.waterToday[i]) continue;
        const t0 = grids[0][i]; const t = grids[k][i];
        if (t0 === CLASS.sea || t0 === CLASS.marsh || t0 === CLASS.heath) assert.equal(t, t0, `cell ${i} at anchor ${k}`);
      }
    }
  });

  it('turns into change planes that the date engine plays back to every anchor exactly', () => {
    const years = [1250, 1425, 1725, 1900, 2021];
    const planes = later.map((_, k) => changePlane(grids[k], grids[k + 1], input.cols, input.rows, input.cellKm));
    /** @type {Record<string, Uint8Array>} */ const layers = {};
    const intervals = planes.map((plane, k) => { layers[`p${years[k]}`] = plane; return { y0: years[k], y1: years[k + 1], layer: `p${years[k]}` }; });
    const tl = timelineFromBlock({ meta: { grid: { cols: input.cols, rows: input.rows }, intervals, seed: TIME_PARAMS.seed, blockCells: TIME_PARAMS.blockCells }, layers, base: built.terrain });
    for (let k = 0; k < grids.length; k++) assert.ok(same(tl.classesAt(years[k]), grids[k]), `anchor ${years[k]}`);
    assert.ok(same(tl.classesAt(1219), built.terrain));
    // No cell flips back and forth inside a stretch: what changes, changes once, to its anchor's class.
    for (let k = 0; k < planes.length; k++) {
      for (let i = 0; i < planes[k].length; i++) {
        if (!planes[k][i]) assert.equal(grids[k][i], grids[k + 1][i]);
        else assert.equal(planes[k][i] & 7, grids[k + 1][i]);
      }
    }
  });

  it('bands clearings by their distance from open land', () => {
    const plane = changePlane(grids[0], grids[1], input.cols, input.rows, input.cellKm);
    const open = Uint8Array.from(grids[0], (t) => (t === CLASS.open ? 1 : 0));
    for (let i = 0; i < plane.length; i++) {
      if ((plane[i] & 7) !== CLASS.open || i % 7) continue; // the search is slow: one clearing in seven
      const c = i % input.cols; const r = (i - c) / input.cols;
      // The nearest open land lies inside the band's 2 km ring.
      const band = plane[i] >> 3;
      let nearest = Infinity;
      for (let dr = -70; dr <= 70; dr++) {
        for (let dc = -70; dc <= 70; dc++) {
          const rr = r + dr; const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= input.rows || cc >= input.cols || !open[rr * input.cols + cc]) continue;
          nearest = Math.min(nearest, Math.hypot(dr, dc));
        }
      }
      // The distances are chamfer steps (1 and 1.414), up to 8% over the straight line.
      if (band < TIME_PARAMS.bands - 1) assert.ok(nearest < (band + 1) * TIME_PARAMS.bandKm && nearest >= (band * TIME_PARAMS.bandKm) / 1.09, `cell ${i}: band ${band}, nearest open ${nearest}`);
    }
  });

  it('refuses a plane that would turn land into sea', () => {
    const to = grids[0].slice();
    const i = grids[0].findIndex((t) => t === CLASS.open);
    to[i] = CLASS.sea;
    assert.throws(() => changePlane(grids[0], to, input.cols, input.rows, 1), /class 0/);
  });
});

describe('the shipped terrain-time block', () => {
  const block = JSON.parse(read(TIME_BLOCK));
  const layers = unbundleBlocks(new Uint8Array(inflateSync(Buffer.from(block.bundle, 'base64'))));
  const t1219 = JSON.parse(read('src/data/by-sa/terrain-1219.json'));
  const base = unbundleBlocks(new Uint8Array(inflateSync(Buffer.from(t1219.bundle, 'base64')))).terrain;
  const tl = timelineFromBlock({ meta: block.meta, layers, base });
  const { cols, rows, cell } = block.meta.grid;

  it('is share-alike, names the pollen windows it uses, and was built with today\'s rules on today\'s 1219 grid', () => {
    assert.equal(block.kind, 'terrain-time');
    assert.equal(block.licence, 'CC-BY-SA-4.0');
    assert.deepEqual(block.sources, [...TIME_SOURCES]);
    for (const id of [...TERRAIN_SOURCES, 'spatiocompo-tw3', 'spatiocompo-tw2', 'spatiocompo-tw1']) assert.ok(block.sources.includes(id), id);
    assert.equal(block.meta.built.paramsSha256, timeParamsSha256(), 'ANCHORS or TIME_PARAMS changed: run npm run map:terrain-time');
    assert.equal(block.meta.built.terrainParamsSha256, terrainParamsSha256());
    assert.equal(block.meta.base.sha256, sha256(base), 'built on another 1219 grid than the one shipped');
    assert.deepEqual(block.meta.anchors.map((/** @type {{ year: number }} */ a) => a.year), ANCHORS.map((a) => a.year));
    assert.deepEqual(block.meta.intervals.map((/** @type {{ y0: number, y1: number }} */ iv) => [iv.y0, iv.y1]), [[1250, 1425], [1425, 1725], [1725, 1900], [1900, 2021]]);
    assert.ok(Buffer.byteLength(read(TIME_BLOCK)) < 1.2 * 1048576, 'the block stays near 0.7 MB');
  });

  it('holds only classes the game knows, and changes nothing before 1250', () => {
    for (const { layer } of block.meta.intervals) {
      assert.equal(layers[layer].length, cols * rows);
      for (const v of layers[layer]) assert.ok([0, 2, 3, 4, 5, 6].includes(v & 7), `class ${v & 7}`);
    }
    for (const y of [1219, 1230, 1250]) assert.ok(same(tl.classesAt(y), base), `year ${y}`);
    assert.ok(!same(tl.classesAt(1251), base));
  });

  it('plays from 1219 to 2021 a year at a time and ends at today\'s anchor', () => {
    const grid = tl.classesAt(1219);
    for (let y = 1219; y < 2021; y++) tl.advance(grid, y, y + 1);
    assert.ok(same(grid, tl.classesAt(2021)));
  });

  it('never moves a cell against its 1 degree square: forest only falls where the square\'s falls', () => {
    const square = new Int32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const [lon, lat] = MAP.toDegrees((c + 0.5) * cell, (r + 0.5) * cell);
        square[r * cols + c] = Math.floor(lat) * 1000 + Math.floor(lon);
      }
    }
    const years = [1250, 1425, 1725, 1900, 2021];
    for (let k = 0; k + 1 < years.length; k++) {
      const a = tl.classesAt(years[k]); const b = tl.classesAt(years[k + 1]);
      /** @type {Map<number, number>} */ const delta = new Map();
      for (let i = 0; i < a.length; i++) if (isForest(a[i]) !== isForest(b[i])) delta.set(square[i], (delta.get(square[i]) ?? 0) + (isForest(b[i]) ? 1 : -1));
      let wrong = 0;
      for (let i = 0; i < a.length; i++) {
        if (isForest(a[i]) === isForest(b[i])) continue;
        if (isForest(b[i]) !== /** @type {number} */ (delta.get(square[i])) > 0) wrong++;
      }
      assert.equal(wrong, 0, `${years[k]}-${years[k + 1]}`);
    }
  });

  it('shows no 32 km block edges mid-stretch, where a ranking block by block would', () => {
    const k = 1; // 1425-1725, the biggest stretch of clearing
    const { y0, y1, layer } = block.meta.intervals[k];
    const plane = layers[layer];
    const mid = Math.round((y0 + y1) / 2);
    const e = tl.switches(k);
    const engine = new Int16Array(cols * rows);
    for (let j = 0; j < e.cells.length; j++) engine[e.cells[j]] = e.years[j];
    // The control: the same bands ranked block by block, with no blend between blocks.
    const B = block.meta.blockCells;
    const bx = Math.ceil(cols / B);
    const count = new Int32Array(bx * Math.ceil(rows / B) * 32);
    const total = new Int32Array(bx * Math.ceil(rows / B));
    const blockOf = (/** @type {number} */ i) => Math.floor(Math.floor(i / cols) / B) * bx + Math.floor((i % cols) / B);
    for (let i = 0; i < plane.length; i++) if (plane[i] & 7) { count[blockOf(i) * 32 + (plane[i] >> 3)]++; total[blockOf(i)]++; }
    const blocky = new Int16Array(cols * rows);
    for (let i = 0; i < plane.length; i++) {
      if (!(plane[i] & 7)) continue;
      const b = blockOf(i); const band = plane[i] >> 3;
      let cum = 0;
      for (let q = 0; q < band; q++) cum += count[b * 32 + q];
      const f = (cum + hash01(i % cols, Math.floor(i / cols), 3) * count[b * 32 + band]) / total[b];
      blocky[i] = y0 + 1 + Math.min(y1 - y0 - 1, Math.floor(f * (y1 - y0)));
    }
    const engineSeam = seamRatio(engine, mid, cols, rows, B);
    const blockySeam = seamRatio(blocky, mid, cols, rows, B);
    assert.ok(blockySeam > 1.15, `the control should show block edges: ratio ${blockySeam}`);
    assert.ok(engineSeam < 1.07, `block edges show mid-stretch: ratio ${engineSeam}`);
  });

  const sidecar = join(DERIVED, `${OUT_NAME}.json`);
  it('matches the build\'s own checks: quotas within 3 points at every anchor, nothing against the flow', { skip: !existsSync(sidecar) && 'no data/raw/derived/terrain-time-1km.u8.json here' }, () => {
    const meta = JSON.parse(readFileSync(sidecar, 'utf8'));
    assert.equal(meta.paramsSha256, block.meta.built.paramsSha256, 'the planes on disk are not the shipped ones: run npm run map:terrain-time');
    assert.equal(meta.checks.anchors.length, 4);
    for (const c of meta.checks.anchors) {
      assert.ok(c.worstForestMiss <= 0.03, `${c.anchor}: forest ${c.worstForestMiss}`);
      assert.ok(c.worstConiferMiss <= 0.03, `${c.anchor}: conifer ${c.worstConiferMiss}`);
      assert.deepEqual(c.againstTheFlow, { forestWrong: 0, coniferWrong: 0 });
    }
  });
});

/**
 * How often two side-by-side changing cells disagree on "switched by this year" across the lines
 * between blocks, over how often across lines half a block from them (1 when no edge shows).
 * @param {Int16Array} yearOf switch year per cell, 0 for none @param {number} year
 * @param {number} cols @param {number} rows @param {number} B block side
 */
function seamRatio(yearOf, year, cols, rows, B) {
  const rate = (/** @type {number} */ offset) => {
    let pairs = 0; let differ = 0;
    /** @param {number} a @param {number} b */
    const pair = (a, b) => {
      if (!yearOf[a] || !yearOf[b]) return;
      pairs++;
      if ((yearOf[a] <= year) !== (yearOf[b] <= year)) differ++;
    };
    for (let r = 0; r < rows; r++) for (let c = offset || B; c < cols; c += B) pair(r * cols + c - 1, r * cols + c);
    for (let r = offset || B; r < rows; r += B) for (let c = 0; c < cols; c++) pair((r - 1) * cols + c, r * cols + c);
    return differ / pairs;
  };
  return rate(0) / rate(B / 2);
}

describe('the land over time: licence separation', () => {
  const OSM = /\bosm\b|osm-|-osm|overpass|openstreetmap\.org|\.osm\.|\.pbf\b|overture/i;

  /** A tool and every local module it imports, directly or not. @param {string} start */
  function importGraph(start) {
    const seen = new Set();
    const todo = [join(ROOT, start)];
    while (todo.length) {
      const file = /** @type {string} */ (todo.pop());
      if (seen.has(file)) continue;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'([^']+)'/gm)) {
        if (m[1].startsWith('.')) todo.push(resolve(dirname(file), m[1]));
      }
    }
    return [...seen];
  }

  it('builds and packs without reading OpenStreetMap data, directly or through what it imports', () => {
    for (const start of ['tools/map/build-terrain-time.mjs', 'tools/map/pack-terrain-time.mjs', 'src/sim/map-date.js']) {
      const files = importGraph(start);
      for (const file of files) {
        const src = readFileSync(file, 'utf8');
        for (const m of src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'([^']+)'/gm)) assert.doesNotMatch(m[1], OSM, `${file} imports ${m[1]}`);
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
        for (const m of code.matchAll(/'([^'\n]*)'|`([^`]*)`/g)) assert.doesNotMatch(m[1] ?? m[2], OSM, `${file}: ${m[0]}`);
        for (const m of code.matchAll(/readRaw\('([^']+)'/g)) assert.ok(['ne-land', 'ne-rivers', 'ne-lakes'].includes(m[1]), `${file} reads raw source ${m[1]}`);
      }
    }
  });

  it('lists only sources whose licence was read, none of them ODbL', () => {
    const sources = JSON.parse(read('tools/map/sources.json')).sources;
    for (const id of TIME_SOURCES) {
      const s = sources.find((/** @type {{ id: string }} */ x) => x.id === id);
      assert.ok(s, `${id} missing from sources.json`);
      assert.equal(s.licenceStatus, 'read', `${id}: licence not read`);
      assert.doesNotMatch(s.licence, /ODbL/i, id);
    }
  });
});

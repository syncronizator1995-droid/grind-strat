// @ts-check
// Tests for the AD 1 map (M3b, PR 1): the lead-in of the land (AD 1 to 1219), the AD 1 coast, the
// antiquity names and the hidden #date=1 link. Run on the shipped blocks in Node, and on a made-up
// world for the engine. Where the build's own record is on this computer (data/raw/derived/), it
// is checked too.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { inflateSync } from 'node:zlib';
import { COAST_CODE, coastLevel, createCoast, LEAD, leadFromMain, leadLevel } from '../src/sim/coast-date.js';
import { createTerrainTimeline, eraOf, FIRST_LEAD_YEAR, timelineFromBlock } from '../src/sim/map-date.js';
import { createDateLayer, mapYearOfDay, parseTestLink } from '../src/ui/map/dated.js';
import { unbundleBlocks } from '../src/ui/map/codec.js';
import { loadDated, loadMap, loadNames, loadWater, noTimes } from '../src/ui/map/load.js';
import { linkNames, nameAt, panelInfo } from '../src/ui/map/names.js';
import { ad1ParamsSha256, AD1_PARAMS, LOW_QUALITY_FROM_LON, LOW_QUALITY_LABEL } from '../tools/map/terrain-ad1.mjs';
import { extendToSea, holdCut, leadCodeOfYear, leadOwnCodes, lineCells, agreeAtHandOver } from '../tools/map/coast-ad1.mjs';
import { fillRings } from '../tools/map/geo.mjs';
import { MAP } from '../tools/map/projection.mjs';
import { DERIVED } from '../tools/map/resample.mjs';
import { terrainParamsSha256 } from '../tools/map/terrain-1219.mjs';
import { shippedBlockFiles } from '../tools/map/block.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
/** @param {string} path */
const block = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
/** @param {{ bundle: string }} b */
const layersOf = (b) => unbundleBlocks(new Uint8Array(inflateSync(Buffer.from(b.bundle, 'base64'))));
/** @param {Uint8Array} b */
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
/** @param {Uint8Array} a @param {Uint8Array} b */
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('the lead-in engine on a made-up world', () => {
  // 8 x 8 cells: the 1219 grid is open (2) with a forest (3) corner; AD 1 differs in 20 cells.
  const cols = 8; const rows = 8; const n = cols * rows;
  const base = new Uint8Array(n).fill(2);
  for (let i = 0; i < 16; i++) base[i] = 3;
  const ad1 = base.slice();
  const plane = new Uint8Array(n);
  for (let i = 10; i < 30; i++) { ad1[i] = ad1[i] === 3 ? 2 : 3; plane[i] = ((i % 7) << 3) | ad1[i]; }
  const iv = { y0: 1250, y1: 1400, plane: (() => { const p = new Uint8Array(n); p[50] = (2 << 3) | 4; p[51] = 3; return p; })() };
  const tl = createTerrainTimeline({ cols, rows, base, intervals: [iv], seed: 7, block: 4, leadIn: { y0: 1, y1: 1219, plane } });

  it('gives the AD 1 grid at AD 1 (and for a BC year) and the 1219 grid from 1219', () => {
    assert.ok(same(tl.classesAt(1), ad1));
    assert.ok(same(tl.classesAt(-5), ad1));
    assert.ok(same(tl.classesAt(1219), base));
    assert.ok(same(tl.classesAt(1250), base));
  });

  it('switches each changing cell exactly once, between AD 2 and 1219', () => {
    const e = /** @type {NonNullable<ReturnType<typeof tl.leadSwitches>>} */ (tl.leadSwitches());
    assert.equal(e.cells.length, 20);
    assert.equal(new Set(e.cells).size, 20);
    for (let j = 0; j < e.cells.length; j++) {
      assert.ok(e.years[j] >= 2 && e.years[j] <= 1219, String(e.years[j]));
      assert.equal(e.cls[j], base[e.cells[j]]);
    }
    // And at every year a cell shows either its AD 1 class or its 1219 class, switching only once.
    const seen = new Int32Array(n);
    let prev = tl.classesAt(1);
    for (let y = 2; y <= 1219; y++) {
      const now = tl.classesAt(y);
      for (let i = 0; i < n; i++) if (now[i] !== prev[i]) seen[i]++;
      prev = now;
    }
    for (let i = 0; i < n; i++) assert.ok(seen[i] <= 1, `cell ${i} changed ${seen[i]} times`);
  });

  it('advance equals classesAt year by year across AD 1 to 1450, and in one jump', () => {
    const grid = tl.classesAt(1);
    for (let y = 1; y < 1450; y++) {
      tl.advance(grid, y, y + 1);
      if (y % 50 === 0 || y > 1210) assert.ok(same(grid, tl.classesAt(y + 1)), `year ${y + 1}`);
    }
    const jump = tl.classesAt(1);
    tl.advance(jump, 1, 1450);
    assert.ok(same(jump, tl.classesAt(1450)));
    const back = tl.classesAt(1450);
    tl.advance(back, 1450, 600);
    assert.ok(same(back, tl.classesAt(600)));
  });

  it('refuses a lead-in that ends after the first interval starts, or has the wrong size', () => {
    assert.throws(() => createTerrainTimeline({ cols, rows, base, intervals: [iv], seed: 7, leadIn: { y0: 1, y1: 1300, plane } }), /ends after/);
    assert.throws(() => createTerrainTimeline({ cols, rows, base, intervals: [], seed: 7, leadIn: { y0: 1, y1: 1219, plane: new Uint8Array(3) } }), /plane has/);
  });

  it('is the old engine, untouched, without a lead-in', () => {
    const plain = createTerrainTimeline({ cols, rows, base, intervals: [iv], seed: 7, block: 4 });
    for (const y of [1219, 1300, 1399, 1400, 1500]) assert.ok(same(plain.classesAt(y), tl.classesAt(y)), String(y));
    assert.equal(plain.leadIn, null);
    assert.equal(plain.leadSwitches(), null);
  });

  it('years: AD 1 is the first map year, a BC year shows it with noData', () => {
    assert.equal(FIRST_LEAD_YEAR, 1);
    assert.deepEqual(eraOf(1), { id: 'historic', year: 1, noData: false });
    assert.deepEqual(eraOf(-300), { id: 'historic', year: 1, noData: true });
    assert.throws(() => eraOf(0), /no year 0/);
  });
});

describe('the shipped terrain-ad1 block', () => {
  const b = block('src/data/by-sa/terrain-ad1.json');
  const layers = layersOf(b);
  const t1219 = block('src/data/by-sa/terrain-1219.json');
  const base = layersOf(t1219).terrain;
  const time = block('src/data/by-sa/terrain-time.json');
  const timeLayers = layersOf(time);
  const lead = { meta: b.meta, layers };
  const tl = timelineFromBlock({ meta: time.meta, layers: timeLayers, base, lead });
  const plain = timelineFromBlock({ meta: time.meta, layers: timeLayers, base });

  it('is share-alike (pollen), late, built with today\'s rules on today\'s 1219 grid, never from OpenStreetMap', () => {
    assert.equal(b.kind, 'terrain-ad1');
    assert.equal(b.licence, 'CC-BY-SA-4.0');
    assert.ok(b.sources.includes('spatiocompo-tw6'));
    assert.ok(!b.sources.some((/** @type {string} */ s) => /osm/.test(s)));
    assert.equal(b.meta.built.paramsSha256, ad1ParamsSha256(), 'AD1 or its parameters changed: run npm run map:terrain-ad1');
    assert.equal(b.meta.built.terrainParamsSha256, terrainParamsSha256());
    assert.equal(b.meta.base.sha256, sha256(base), 'built on another 1219 grid than the one shipped');
    assert.deepEqual(b.meta.leadIn, { y0: 1, y1: 1219, layer: 'lead' });
    assert.ok(shippedBlockFiles().some((f) => f.kind === 'terrain-ad1'));
    assert.ok(Buffer.byteLength(readFileSync(join(ROOT, 'src/data/by-sa/terrain-ad1.json'))) < 0.3 * 1048576, 'the block stays near 0.16 MB');
  });

  it('marks the eastern squares "model-filled, lower quality"', () => {
    assert.equal(b.meta.lowQuality.label, LOW_QUALITY_LABEL);
    assert.equal(b.meta.lowQuality.label, 'model-filled, lower quality');
    assert.equal(b.meta.lowQuality.fromLon, LOW_QUALITY_FROM_LON);
    assert.ok(b.meta.lowQuality.squares.length > 20);
    for (const [lon] of b.meta.lowQuality.squares) assert.ok(lon >= LOW_QUALITY_FROM_LON);
    assert.match(b.meta.labels.quality, /lower quality/);
    assert.equal(b.meta.built.params.lowQualityFromLon, AD1_PARAMS.lowQualityFromLon);
  });

  it('is the AD 1 cut at AD 1 and the 1219 grid at 1219 (and the whole land from 1219 on is unchanged)', () => {
    assert.equal(sha256(tl.classesAt(1)), b.meta.ad1.sha256, 'AD 1 is not the cut the build recorded');
    assert.ok(!same(tl.classesAt(1), base));
    assert.ok(same(tl.classesAt(1219), base));
    for (const y of [1219, 1250, 1251, 1425, 1500, 1725, 1900, 2021]) assert.ok(same(tl.classesAt(y), plain.classesAt(y)), `year ${y}`);
  });

  it('holds only classes the game knows, each changing cell switches once, between AD 2 and 1219', () => {
    const plane = layers.lead;
    for (const v of plane) assert.ok([0, 2, 3, 4, 5, 6].includes(v & 7), `class ${v & 7}`);
    const e = /** @type {NonNullable<ReturnType<typeof tl.leadSwitches>>} */ (tl.leadSwitches());
    let changing = 0;
    for (const v of plane) if (v & 7) changing++;
    assert.equal(e.cells.length, changing);
    assert.equal(new Set(e.cells).size, changing, 'a cell switches twice');
    assert.ok(e.years[0] >= 2 && e.years[e.years.length - 1] <= 1219);
    for (let j = 0; j < e.cells.length; j++) assert.notEqual(plane[e.cells[j]] & 7, base[e.cells[j]]);
  });

  it('plays from AD 1 to 2021 a year at a time and ends on today\'s anchor, equal to classesAt at every check', () => {
    const grid = tl.classesAt(1);
    const marks = new Set([100, 600, 1000, 1218, 1219, 1250, 1425, 1900]);
    for (let y = 1; y < 2021; y++) {
      tl.advance(grid, y, y + 1);
      if (marks.has(y + 1)) assert.ok(same(grid, tl.classesAt(y + 1)), `year ${y + 1}`);
    }
    assert.ok(same(grid, plain.classesAt(2021)));
  });

  it('shows more forest at AD 1 than in 1219, Lithuania\'s box about 71%', () => {
    const lt = b.meta.checks.lithuaniaForestPercent;
    assert.ok(lt.ad1 > 69 && lt.ad1 < 73, `Lithuania AD 1: ${lt.ad1}`);
    assert.ok(lt.y1219 > 62 && lt.y1219 < 66, `Lithuania 1219: ${lt.y1219}`);
  });

  it('keeps every 1 degree square within 3 points of the pollen at AD 1', () => {
    assert.ok(b.meta.checks.worstForestMiss <= 0.03, `forest ${b.meta.checks.worstForestMiss}`);
    assert.ok(b.meta.checks.worstConiferMiss <= 0.03, `conifer ${b.meta.checks.worstConiferMiss}`);
    assert.ok(b.meta.checks.squares.length > 100, 'the squares are listed');
    const sidecar = join(DERIVED, 'terrain-ad1-1km.u8.json');
    if (!existsSync(sidecar)) return;
    const meta = JSON.parse(readFileSync(sidecar, 'utf8'));
    assert.equal(meta.paramsSha256, b.meta.built.paramsSha256);
    assert.equal(meta.checks.againstTheFlow.forestWrong, 0);
    assert.equal(meta.checks.againstTheFlow.coniferWrong, 0);
  });

  it('never moves a cell against its square: changed cells follow the same direction per 1 degree square', () => {
    const { cols, rows, cell } = b.meta.grid;
    const a = tl.classesAt(1);
    const isForest = (/** @type {number} */ t) => t === 3 || t === 4;
    /** @type {Map<number, number>} */ const delta = new Map();
    const square = (/** @type {number} */ i) => { const c = i % cols; const r = (i - c) / cols; const [lon, lat] = MAP.toDegrees((c + 0.5) * cell, (r + 0.5) * cell); return Math.floor(lat) * 1000 + Math.floor(lon); };
    for (let i = 0; i < a.length; i++) if (isForest(a[i]) !== isForest(base[i])) delta.set(square(i), (delta.get(square(i)) ?? 0) + (isForest(base[i]) ? 1 : -1));
    let wrong = 0;
    for (let i = 0; i < a.length; i++) if (isForest(a[i]) !== isForest(base[i]) && (isForest(base[i]) !== /** @type {number} */ (delta.get(square(i))) > 0)) wrong++;
    assert.equal(wrong, 0);
    assert.ok(rows > 0);
  });
});

describe('the shipped coast-ad1 block', () => {
  const b = block('src/data/by/coast-ad1.json');
  const main = block('src/data/by/coast.json');
  const lead = layersOf(b).lead;
  const codes = layersOf(main).coast;
  const box = main.meta.coast;
  const coast = createCoast({ box, codes, lead });
  const { cols, rows, cell } = box;

  it('is CC BY, late, over the same box as the 1219 coast, built with today\'s settings; SGU not used (blocked)', () => {
    assert.equal(b.kind, 'coast-ad1');
    assert.equal(b.licence, 'CC-BY-4.0');
    assert.deepEqual(b.meta.coast, main.meta.coast);
    assert.equal(b.meta.built.mainParamsSha256, main.meta.built.paramsSha256, 'built over another 1219 coast: run npm run map:coast-ad1');
    assert.equal(b.meta.sgu.used, false);
    assert.ok(!b.sources.includes('sgu-shore'));
    assert.ok(b.sources.every((/** @type {string} */ s) => ['nkg-rf17vel', 'gebco-2026', 'ne-land', 'ne-lakes'].includes(s)));
    assert.equal(lead.length, codes.length);
    for (const k of lead) assert.ok(k <= LEAD.last || k === COAST_CODE.sea);
    assert.ok(Buffer.byteLength(readFileSync(join(ROOT, 'src/data/by/coast-ad1.json'))) < 0.2 * 1048576);
  });

  it('has no jump at 1219: the same cells are sea just before it as in the 1219 field', () => {
    assert.equal(leadLevel(1218), 152);
    for (let i = 0; i < codes.length; i++) assert.equal(coast.seaAtCell(i, 1218), coast.seaAtCell(i, 1219), `cell ${i}`);
    const full = /** @type {Uint8Array} */ (coast.lead);
    for (let i = 0; i < codes.length; i++) assert.equal(full[i] > 152, codes[i] >= 1, `cell ${i}`);
    // the block leaves the cells still sea in 1219 at 0; the game puts them back from the 1219 field
    for (let i = 0; i < codes.length; i++) if (codes[i] >= 1 && codes[i] <= COAST_CODE.last) { assert.equal(lead[i], 0); assert.equal(full[i], leadFromMain(codes[i])); }
    assert.ok(full.some((v, i) => v !== lead[i]));
    // and at the level of the old sea's picture: nothing but the field changes
    coast.step(1218);
    assert.equal(coast.onLead, true);
    coast.step(1219);
    assert.equal(coast.onLead, false);
    assert.equal(coast.level, coastLevel(1219));
  });

  it('never turns land back into sea, and the shore moves out steadily (every level has cells, none more than a few % of all)', () => {
    let total = 0; const count = new Int32Array(256);
    for (const k of lead) if (k >= 1 && k <= 152) { count[k]++; total++; }
    assert.ok(total > 10000);
    for (let k = 1; k <= 152; k++) assert.ok(count[k] / total < 0.05, `step ${k}: ${count[k] / total}`);
    // seaAt is monotone in time for every cell
    for (let i = 0; i < lead.length; i += 7) {
      let was = coast.seaAtCell(i, 1);
      for (let y = 9; y <= 1219; y += 70) { const now = coast.seaAtCell(i, y); assert.ok(was || !now, `cell ${i} turned to sea in ${y}`); was = now; }
    }
  });

  it('changes nothing south of 56N: the same land and sea at AD 1 as in 1219', () => {
    let south = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const [, lat] = MAP.toDegrees((c + 0.5 + box.col0) * cell, (r + 0.5 + box.row0) * cell);
        if (lat >= 55.9) continue;
        const i = r * cols + c;
        south++;
        assert.equal(lead[i] === COAST_CODE.sea, codes[i] === COAST_CODE.sea, `cell ${i}`);
        assert.ok(lead[i] === 0 || lead[i] === COAST_CODE.sea, `cell ${i} is sea at AD 1 in the south`);
      }
    }
    assert.ok(south > 1000, `only ${south} cells south of 56N in the box`);
  });

  it('puts the sea at about 14 m over north Uppland and 5 to 6 m over Stockholm at AD 1', () => {
    const at = (/** @type {string} */ name) => b.meta.report.find((/** @type {{ place: string }} */ p) => p.place.startsWith(name));
    const up = at('North Uppland').seaAboveTodayAtAd1M;
    assert.ok(up > 13.5 && up < 15.5, `north Uppland ${up}`);
    assert.ok(at('Stockholm').seaAboveTodayAtAd1M > 4.5 && at('Stockholm').seaAboveTodayAtAd1M < 7);
    assert.ok(at('Stockholm').seaAboveTodayAtAd1M > at('Stockholm').seaAboveTodayIn1219M);
    const fit = b.meta.fitted.find((/** @type {{ group: string }} */ g) => g.group === 'uppland-north');
    assert.ok(fit && fit.k > 1 && fit.k < 1.2);
    for (const c of b.meta.checks.filter((/** @type {{ use: string }} */ x) => x.use === 'value')) assert.ok(c.ok, c.id);
  });

  it('makes Kopli an island at AD 1 and joins it to the mainland about AD 150', () => {
    const land = new Uint8Array(cols * rows);
    const ox = box.col0 * cell; const oy = box.row0 * cell;
    const baseBlock = block('src/data/map/base.json');
    return loadMap(baseBlock, block('src/data/by-sa/terrain-1219.json')).then(({ map }) => {
      fillRings(land, cols, rows, cell, map.land.map((r) => Array.from(r, (v, j) => v - (j % 2 ? oy : ox))), 1);
      const idx = (/** @type {number} */ lon, /** @type {number} */ lat) => { const [x, y] = MAP.toUnits(lon, lat); return (Math.floor(y / cell) - box.row0) * cols + Math.floor(x / cell) - box.col0; };
      const pen = idx(24.675, 59.455); const main_ = idx(24.745, 59.437);
      const connected = (/** @type {number} */ year) => {
        const dry = (/** @type {number} */ i) => land[i] && !coast.seaAtCell(i, year);
        if (!dry(pen) || !dry(main_)) return false;
        const seen = new Set([pen]); const q = [pen];
        while (q.length) {
          const i = /** @type {number} */ (q.pop());
          if (i === main_) return true;
          for (const j of [i - 1, i + 1, i - cols, i + cols]) if (!seen.has(j) && dry(j)) { seen.add(j); q.push(j); }
        }
        return false;
      };
      assert.ok(land[pen] && land[main_]);
      assert.equal(connected(1), false, 'Kopli is an island at AD 1');
      assert.equal(connected(120), false, 'and still one in AD 120');
      assert.equal(connected(170), true, 'joined by AD 170');
      assert.equal(connected(1219), true);
    });
  });
});

describe('the AD 1 coast rules on a made-up shore', () => {
  it('a straight rise: a cell lower than the AD 1 sea is sea until the year the line reaches it', () => {
    const land = Uint8Array.from([0, 1, 1, 1, 1]);
    const heights = Float32Array.from([0, 1, 4, 8, 20]);
    const fall = Float32Array.from([0, 2, 2, 2, 2]); // 1219's sea: 2 mm a year x 802 years = 1.6 m
    const fall1 = Float32Array.from([0, 4, 4, 4, 4]); // AD 1's sea: 4 x 2020 / 1000 = 8.08 m
    const main = Uint8Array.from([254, 0, 0, 0, 0]);
    const own = leadOwnCodes({ land, heights, fall, fall1, main });
    assert.equal(own[0], 254);
    assert.ok(own[1] >= 1 && own[1] <= 152 && own[2] >= 1);
    assert.ok(own[1] > own[2], 'the lower cell stays sea longer');
    assert.equal(own[4], 0, 'above the AD 1 sea');
    assert.ok(leadCodeOfYear(1223) === 153 && leadCodeOfYear(1) === 0 && leadCodeOfYear(9) === 1);
    for (let k = 1; k <= COAST_CODE.last; k++) assert.equal(leadFromMain(k), leadCodeOfYear(1219 + 4 * k), `code ${k}`);
  });

  it('cells still sea in 1219 keep the 1219 field\'s years, in 8-year steps from 153', () => {
    const land = Uint8Array.from([1, 1, 1]);
    const own = leadOwnCodes({ land, heights: new Float32Array(3), fall: new Float32Array(3), fall1: new Float32Array(3), main: Uint8Array.from([1, 2, 201]) });
    assert.deepEqual([...own], [153, leadCodeOfYear(1227), 253]);
    const lead = Uint8Array.from([5, 5, 5, 100]);
    agreeAtHandOver(lead, Uint8Array.from([0, 3, 254, 0]));
    assert.deepEqual([...lead], [5, 153, 254, 100]);
  });

  it('a hand-drawn cut holds its cells under the sea until its year, and reaches the water on both sides', () => {
    const cols = 12; const rows = 5; const cell = 5;
    const land = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 2; c < 9; c++) land[r * cols + c] = 1;
    const [a, b] = extendToSea([30, 12], [40, 12], land, cols, rows, cell);
    assert.ok(a[0] < 12 && b[0] > 44, 'the line was carried to the sea on each side');
    const cells = lineCells(a, b, cols, rows, cell);
    const own = new Uint8Array(cols * rows);
    assert.equal(holdCut(own, land, cells, 150), 7);
    assert.equal(own[2 * cols + 5], leadCodeOfYear(150));
  });
});

describe('the names at AD 1', () => {
  it('shows the Vistula and the Borysthenes in Latin at AD 1, today\'s names after 200, and 1219 as before', async () => {
    const info = await loadNames(block('src/data/own/names.json'), noTimes());
    const water = await loadWater(block('src/data/odbl/water.json'), noTimes());
    const link = linkNames(info, water);
    const group = (/** @type {string} */ id) => link.groups.findIndex((g) => info.features[g.feature].wikidata === id);
    const vis = group('Q548'); const dn = group('Q40855');
    assert.equal(nameAt(link, vis, 1).name, 'Vistula');
    assert.equal(nameAt(link, vis, 1).why, 'record');
    assert.equal(nameAt(link, vis, 1).later, true, 'Mela wrote in 43: later than AD 1 by more than 25 years');
    assert.equal(nameAt(link, dn, 1).name, 'Borysthenes');
    assert.equal(nameAt(link, vis, 600).why, 'stand-in');
    assert.equal(nameAt(link, vis, 1219).name, 'Wisela');
    assert.equal(nameAt(link, dn, 1219).name, 'Dnepr');
    // Lithuania keeps today's names at every year, AD 1 too
    const nem = group('Q5622');
    assert.equal(nameAt(link, nem, 1).why, 'today-rule');
  });

  it('shows no medieval record at AD 1: only Mela, Pliny and Tacitus count before 200 (Duna, Oddara, Prigora are not AD 1 names)', async () => {
    const info = await loadNames(block('src/data/own/names.json'), noTimes());
    const water = await loadWater(block('src/data/odbl/water.json'), noTimes());
    const link = linkNames(info, water);
    for (const y of [1, 100, 199]) {
      link.groups.forEach((g, i) => {
        const r = nameAt(link, i, y);
        if (r.why === 'record') assert.ok(['mela', 'pliny', 'tacitus'].includes(/** @type {any} */ (r.entry).source), `${g.today} in ${y}: ${r.name} from ${r.entry?.source}`);
      });
    }
    const daugava = link.groups.findIndex((g) => g.today === 'Daugava');
    assert.ok(daugava >= 0);
    assert.equal(nameAt(link, daugava, 1).name, 'Daugava');
    assert.equal(nameAt(link, daugava, 1219).name, 'Duna');
  });

  it('keeps Codanus sinus and Ptolemy\'s four rivers off the map, in the panel with "?"', async () => {
    const info = await loadNames(block('src/data/own/names.json'), noTimes());
    const baltic = info.seas.find((s) => s.id === 'baltic');
    const cod = baltic?.names.filter((n) => n.name === 'Codanus sinus') ?? [];
    assert.equal(cod.length, 2);
    for (const e of cod) { assert.equal(e.map, false); assert.ok(e.marks?.includes('disputed')); }
    assert.ok(baltic?.names.some((n) => n.name === 'Suebicum mare' && n.source === 'tacitus'));
    const ptolemy = info.features.flatMap((f) => f.names).filter((e) => e.source === 'ptolemy');
    assert.equal(new Set(ptolemy.map((e) => e.name)).size >= 4, true);
    for (const e of ptolemy) { assert.equal(e.map, false); assert.ok(e.marks?.includes('disputed')); }
    const water = await loadWater(block('src/data/odbl/water.json'), noTimes());
    const link = linkNames(info, water);
    const sea = panelInfo({ link, water, hit: { kind: 'sea', sea: 'baltic' }, year: 1, dated: null });
    const rows = sea.over.flatMap((o) => o.rows).filter((r) => r.name.startsWith('Codanus'));
    assert.equal(rows.length, 2);
    for (const r of rows) assert.ok(r.name.endsWith('?'), r.name);
  });
});

describe('the hidden test link and what a 1219 game reads', () => {
  it('#date=1 shows AD 1, #date=0 is refused, BC years are not taken yet', () => {
    assert.deepEqual(parseTestLink('#date=1'), { year: 1, view: null });
    assert.deepEqual(parseTestLink('#date=600&view=5057,10484,0.12'), { year: 600, view: { cx: 5057, cy: 10484, scale: 0.12 } });
    assert.equal(parseTestLink('#date=0'), null);
    assert.equal(parseTestLink('#date=0&view=1,2,3'), null);
  });

  it('a game keeps the map at 1219 or later, whatever its day', () => {
    assert.equal(mapYearOfDay(0), 1219);
    assert.equal(mapYearOfDay(100000), 1219);
  });

  it('the date layer reads the AD 1 coast and land before 1219, 1219 as before, and moves between them', async () => {
    const { map } = await loadMap(block('src/data/map/base.json'), block('src/data/by-sa/terrain-1219.json'));
    const t = map.terrain.data.slice();
    const blocks = { terrainTime: block('src/data/by-sa/terrain-time.json'), coast: block('src/data/by/coast.json'), changes: block('src/data/own/changes.json') };
    const plain = await loadDated(blocks, t, noTimes());
    assert.equal(plain.timeline.leadIn, null);
    assert.equal(plain.coast.lead, null);
    const withLead = await loadDated({ ...blocks, terrainAd1: block('src/data/by-sa/terrain-ad1.json'), coastAd1: block('src/data/by/coast-ad1.json') }, t, noTimes());
    assert.ok(withLead.timeline.leadIn && withLead.coast.lead);
    const grid = withLead.timeline.classesAt(1);
    const layer = createDateLayer(withLead, grid, 1);
    layer.sync(() => {});
    assert.equal(layer.year, 1);
    assert.equal(layer.coastLead, true);
    const moved = layer.goTo(1219, () => {});
    assert.equal(moved.coast, true, 'the coast changes field at 1219');
    assert.equal(layer.coastLead, false);
    assert.ok(same(grid, withLead.timeline.classesAt(1219)));
    assert.equal(layer.goTo(2021, () => {}).coast, true);
    layer.goTo(1, () => {});
    assert.equal(layer.coastLead, true);
    assert.ok(same(grid, withLead.timeline.classesAt(1)));
  });

  it('only a date before 1219 makes the game read the new blocks (main.js)', () => {
    const src = readFileSync(join(ROOT, 'src/ui/main.js'), 'utf8');
    const uses = [...src.matchAll(/readBlock\('(terrain-ad1|coast-ad1)'\)/g)];
    assert.equal(uses.length, 2);
    assert.match(src, /beforeFirstGrid \? \{ \.\.\.blocks, terrainAd1: readBlock\('terrain-ad1'\), coastAd1: readBlock\('coast-ad1'\) \} : blocks/);
    assert.match(src, /datedBlocks\(year < FIRST_MAP_YEAR\)/);
    assert.match(src, /datedBlocks\(\)/, 'the later load of a 1219 game passes nothing');
  });
});

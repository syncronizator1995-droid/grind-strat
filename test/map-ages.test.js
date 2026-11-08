// @ts-check
// Tests for the five ice-age maps (M3b, PR 3): the rules (tools/map/ages.mjs) on small made-up
// inputs, the readers (shapefile, zip), and the shipped block src/data/by-sa/ages.json on known
// places. Where the build's own record is on this computer (data/raw/derived/) it is checked too.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { inflateSync } from 'node:zlib';
import { AGES } from '../src/sim/map-date.js';
import { decodeGrid16, unbundleBlocks } from '../src/ui/map/codec.js';
import { loadAges, noTimes } from '../src/ui/map/load.js';
import { COVER, hatchRects, oldShore, paintAge, SURFACE, surfaceAt, unpackAge } from '../src/ui/map/slice.js';
import { dataElements, lateElements, LATE_KINDS, licenceProblems } from '../tools/build.mjs';
import {
  AGE_BUILDS, AGES_PARAMS, bodies, coverClass, datedRingToUnits, eastOfModel, fillPolygon, floodEast, paramsSha256, SGU_DOMAIN, sguRingToUnits,
} from '../tools/map/ages.mjs';
import { AGES_SOURCES, DATED1_PINS } from '../tools/map/build-ages.mjs';
import { POLLEN_WINDOWS } from '../tools/map/build-grids.mjs';
import { crc32 } from '../tools/map/png.mjs';
import { MAP, northPolarLaeaInverse } from '../tools/map/projection.mjs';
import { DERIVED, GRID_1KM } from '../tools/map/resample.mjs';
import { parseDbf, parseShp } from '../tools/map/shp.mjs';
import { zipFiles } from '../tools/map/zip.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
/** @param {string} path */
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const sources = JSON.parse(read('tools/map/sources.json')).sources;
const blockText = read('src/data/by-sa/ages.json');
const block = JSON.parse(blockText);
const layers = unbundleBlocks(new Uint8Array(inflateSync(Buffer.from(block.bundle, 'base64'))));
const slices = new Map(block.meta.ages.map((/** @type {any} */ e) => [e.id, unpackAge(e, block.meta.grid, layers[`${e.id}/surface`], layers[`${e.id}/cover`])]));
/** @param {string} id */
const slice = (id) => /** @type {import('../src/ui/map/slice.js').AgeSlice} */ (slices.get(id));
/** What a place is in an age: water, ice, land or none. @param {string} id @param {number} lon @param {number} lat */
const at = (id, lon, lat) => { const [x, y] = MAP.toUnits(lon, lat); return surfaceAt(slice(id), x, y); };
/** @param {Uint8Array} b */
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

describe('the rules on made-up inputs', () => {
  it('fills a polygon with its holes, row by row, by cell centres', () => {
    const grid = new Uint8Array(8 * 8);
    // A 6 x 6 square (game units, 10 per cell) with a 2 x 2 hole in the middle: cells 1-6 x 1-6, minus 3-4 x 3-4.
    const outer = [10, 10, 70, 10, 70, 70, 10, 70];
    const hole = [30, 30, 50, 30, 50, 50, 30, 50];
    fillPolygon(grid, 8, 8, 10, [outer, hole], 1);
    assert.equal(grid.reduce((n, v) => n + v, 0), 36 - 4);
    assert.equal(grid[3 * 8 + 3], 0, 'the hole stays empty');
    assert.equal(grid[1 * 8 + 1], 1);
    assert.equal(grid[0], 0);
  });

  it('turns pollen shares into the four classes by the written rule', () => {
    const P = AGES_PARAMS;
    assert.equal(coverClass(0.1, 0.3, 0.6, 'birch'), COVER.tundra, 'open land from 45% is tundra');
    assert.equal(coverClass(0.2, 0.3, P.openTundra, 'birch'), COVER.tundra, 'at the line');
    assert.equal(coverClass(0.1, 0.3, 0.6, 'mixed', false), COVER.mixed, 'later ages have no tundra');
    assert.equal(coverClass(0.4, 0.2, 0.4, 'birch'), COVER.pine, 'a conifer share of 60% or more is pine');
    assert.equal(coverClass(0.12, 0.48, 0.4, 'birch'), COVER.birch, 'a conifer share of 40% or less is birch where broadleaf means birch');
    assert.equal(coverClass(0.12, 0.48, 0.4, 'mixed'), COVER.mixed, 'and mixed forest where it means forest trees');
    assert.equal(coverClass(0.25, 0.25, 0.5, 'mixed', false), COVER.mixed);
    assert.equal(coverClass(0, 0, 1, 'mixed', false), COVER.mixed, 'no forest at all does not divide by zero');
  });

  it('finds the bodies of a mask (8 neighbours) and sizes them', () => {
    // 5 x 3: a body of 3 (a diagonal joins), a lone cell, and a body of 2.
    const mask = Uint8Array.from([1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1]);
    const { sizes, label } = bodies(mask, 5, 3);
    assert.deepEqual(sizes.slice().sort(), [1, 1, 3]);
    assert.equal(label[0], label[6], 'the diagonal joins cells 0 and 6');
    assert.equal(label[6], label[12]);
    assert.notEqual(label[0], label[4]);
    assert.equal(label[1], 0, 'cells outside the mask have no body');
  });

  it('carries the sea east at the old level read from the Estonian shore, only as far as the reach', () => {
    // 10 x 4 cells, row 0 south; sea (1) in the top rows on the west half; the "Estonian shore" is row 1.
    const cols = 10; const rows = 4;
    const surface = new Uint8Array(cols * rows);
    for (let c = 0; c < 5; c++) { surface[2 * cols + c] = SURFACE.water; surface[3 * cols + c] = SURFACE.water; }
    const east = new Uint8Array(cols * rows); const gulf = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 5; c < 8; c++) east[r * cols + c] = 1; // the reach stops at column 7
    for (let c = 2; c < 5; c++) gulf[1 * cols + c] = 1;
    // Heights: the shore land (row 1, columns 2-4) stands at 12 m; east of the edge it is 5 m in rows 2-3, 20 m in row 1.
    const height = (/** @type {number} */ c, /** @type {number} */ r) => (c < 5 ? (r === 1 ? 12 : 0) : r >= 2 ? 5 : 20);
    const out = floodEast({ cols, rows, surface, east, gulf, height });
    assert.equal(out.level, 12);
    assert.equal(out.samples, 3);
    assert.equal(out.flooded, 6, 'rows 2 and 3, columns 5-7');
    assert.equal(surface[2 * cols + 7], SURFACE.water);
    assert.equal(surface[2 * cols + 8], SURFACE.land, 'beyond the reach it stays land');
    assert.equal(surface[1 * cols + 5], SURFACE.land, 'higher than the old level stays land');
  });

  it('knows which side of the model\'s east edge a place is on', () => {
    assert.ok(eastOfModel(28.2, 59.38), 'Narva');
    assert.ok(eastOfModel(30.3, 59.93), 'St Petersburg');
    assert.ok(eastOfModel(27.6, 55.5), 'Belarus');
    assert.ok(!eastOfModel(24.75, 59.44), 'Tallinn');
    assert.ok(!eastOfModel(24.1, 56.95), 'Riga');
    assert.ok(!eastOfModel(25.28, 54.69), 'Vilnius');
    assert.ok(!eastOfModel(26.0, 59.0), 'west of the line at 59N (27.5E is the line)');
    assert.ok(eastOfModel(27.9, 59.0));
  });

  it('moves SGU\'s SWEREF polygons and DATED-1\'s polar rings onto the game grid', () => {
    // Stockholm in SWEREF 99 TM (Lantmäteriet's published value for the old town is near 674000, 6580000).
    const [x, y] = sguRingToUnits([674000, 6580000]);
    const [lon, lat] = MAP.toDegrees(x, y);
    assert.ok(Math.abs(lon - 18.07) < 0.05 && Math.abs(lat - 59.33) < 0.05, `${lon}, ${lat}`);
    // The polar projection inverse: Stockholm and a point on the central meridian.
    const A = 6378137; const E2 = 0.00669438002290; const E = Math.sqrt(E2);
    const q = (/** @type {number} */ s) => (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)));
    const rho = A * Math.sqrt(q(1) - q(Math.sin((59.33 * Math.PI) / 180)));
    const l = (18.07 * Math.PI) / 180;
    const [lo, la] = northPolarLaeaInverse(rho * Math.sin(l), -rho * Math.cos(l));
    assert.ok(Math.abs(lo - 18.07) < 1e-6 && Math.abs(la - 59.33) < 1e-6);
    // A ring cut into pieces keeps its corners.
    const ring = datedRingToUnits([0, -3000000, 400000, -3000000, 400000, -2600000, 0, -2600000], 50000);
    assert.ok(ring.length > 8 * 2, 'long edges are cut into pieces');
  });

  it('reads a shapefile and its table', () => {
    // One polygon record, one ring of 5 points (a square, clockwise), written by hand.
    const pts = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
    const content = 4 + 32 + 8 + 4 + 5 * 16;
    const total = 100 + 8 + content;
    const b = new Uint8Array(total);
    const dv = new DataView(b.buffer);
    dv.setInt32(0, 9994, false); dv.setInt32(24, total / 2, false); dv.setInt32(28, 1000, true); dv.setInt32(32, 5, true);
    dv.setInt32(100, 1, false); dv.setInt32(104, content / 2, false);
    dv.setInt32(108, 5, true);
    [0, 0, 10, 10].forEach((v, k) => dv.setFloat64(112 + k * 8, v, true));
    dv.setInt32(144, 1, true); dv.setInt32(148, 5, true); dv.setInt32(152, 0, true);
    pts.forEach(([x, y], k) => { dv.setFloat64(156 + k * 16, x, true); dv.setFloat64(164 + k * 16, y, true); });
    const recs = parseShp(b);
    assert.equal(recs.length, 1);
    assert.deepEqual(recs[0].rings, [[0, 0, 0, 10, 10, 10, 10, 0, 0, 0]]);
    assert.deepEqual(recs[0].box, [0, 0, 10, 10]);
    assert.throws(() => parseShp(b.subarray(0, 90)), /not a shapefile/);
    const bad = b.slice(); new DataView(bad.buffer).setInt32(108, 1, true);
    assert.throws(() => parseShp(bad), /not a polygon/);
    // A table with one field AV_Time, one row.
    const dbf = new Uint8Array(32 + 32 + 1 + 1 + 4);
    const dd = new DataView(dbf.buffer);
    dd.setUint32(4, 1, true); dd.setUint16(8, 65, true); dd.setUint16(10, 5, true);
    dbf.set(new TextEncoder().encode('AV_Time'), 32); dbf[32 + 16] = 4; dbf[64] = 0x0d;
    dbf.set(new TextEncoder().encode(' 12 '), 66);
    assert.deepEqual(parseDbf(dbf), { names: ['AV_Time'], rows: [['12']] });
  });

  it('reads files out of a zip', () => {
    const name = new TextEncoder().encode('dir/TS12_mc.prj');
    const data = new TextEncoder().encode('PROJCS["x"]');
    const local = new Uint8Array(30 + name.length + data.length);
    const ld = new DataView(local.buffer);
    ld.setUint32(0, 0x04034b50, true); ld.setUint32(18, data.length, true); ld.setUint32(22, data.length, true); ld.setUint16(26, name.length, true);
    local.set(name, 30); local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cd = new DataView(central.buffer);
    cd.setUint32(0, 0x02014b50, true); cd.setUint32(16, crc32(data), true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, 0, true); central.set(name, 46);
    const end = new Uint8Array(22);
    const ed = new DataView(end.buffer);
    ed.setUint32(0, 0x06054b50, true); ed.setUint16(10, 1, true); ed.setUint32(12, central.length, true); ed.setUint32(16, local.length, true);
    const zip = new Uint8Array([...local, ...central, ...end]);
    const files = zipFiles(zip);
    assert.deepEqual([...files.keys()], ['dir/TS12_mc.prj']);
    assert.equal(new TextDecoder().decode(/** @type {() => Uint8Array} */ (files.get('dir/TS12_mc.prj'))()), 'PROJCS["x"]');
    assert.throws(() => zipFiles(new Uint8Array(40)), /not a zip/);
  });
});

describe('the ages block', () => {
  it('is the late CC BY-SA block of the five ages, in the format slice.js reads', () => {
    assert.equal(block.kind, 'ages');
    assert.equal(block.licence, 'CC-BY-SA-4.0');
    assert.deepEqual(block.sources, [...AGES_SOURCES]);
    assert.deepEqual(block.meta.ages.map((/** @type {any} */ a) => [a.id, a.year]), AGES.map((a) => [a.id, a.year]));
    assert.deepEqual(block.meta.ages.map((/** @type {any} */ a) => a.stage), AGE_BUILDS.map((a) => a.stage));
    assert.deepEqual(block.meta.grid, { cols: GRID_1KM.cols, rows: GRID_1KM.rows, cell: 10 });
    assert.equal(Object.keys(layers).length, 10);
    for (const a of AGES) {
      const s = slice(a.id);
      assert.equal(s.surface.length, 1573 * 1328);
      assert.equal(s.cover.length, 787 * 664);
    }
    assert.ok(blockText.length < 250 * 1024, `the block is ${blockText.length} bytes`);
    assert.ok(!/https?:|\/\//.test(blockText.replace(block.bundle, '')), 'no web addresses in a block');
    assert.ok(LATE_KINDS.includes('ages'));
  });

  it('loads through the game\'s own loader', async () => {
    const loaded = await loadAges(block, noTimes());
    assert.deepEqual([...loaded.keys()], AGES.map((a) => a.id));
  });

  it('keeps ice and water apart, and has ice only where the ages had it', () => {
    const counts = AGES.map((a) => {
      const s = slice(a.id);
      let ice = 0; let water = 0;
      for (const v of s.surface) { if (v === SURFACE.ice) ice++; else if (v === SURFACE.water) water++; else assert.equal(v, SURFACE.land); }
      return { ice, water };
    });
    assert.ok(counts[0].ice > 200000 && counts[1].ice > 200000, 'ice sheet over the north at 10,000 and 9,500 BC');
    assert.ok(counts[2].ice > 0 && counts[2].ice < 20000, 'a little ice on the Scandes at 8,500 BC');
    assert.equal(counts[3].ice, 0);
    assert.equal(counts[4].ice, 0);
    for (const c of counts) assert.ok(c.water > 300000 && c.water < 500000, `water ${c.water}`);
    // Dry sea floor is land: much of today's sea (the base block's heights below 0) is dry at 10,000 BC
    // (the south-west Baltic floor and the Danish straits), far less at 5,000 BC.
    const base = JSON.parse(read('src/data/map/base.json'));
    const heights = decodeGrid16(unbundleBlocks(new Uint8Array(inflateSync(Buffer.from(base.bundle, 'base64')))).heights);
    const drySea = (/** @type {string} */ id) => { const s = slice(id); let n = 0; for (let r = 0; r < heights.rows; r++) for (let c = 0; c < heights.cols; c++) if (heights.data[r * heights.cols + c] < 0 && s.surface[(2 * r) * s.cols + 2 * c] === SURFACE.land) n++; return n; };
    assert.ok(drySea('age-10000bc') > 2000, `dry sea floor at 10,000 BC: ${drySea('age-10000bc')} cells of 4 km2`);
    assert.ok(drySea('age-5000bc') < drySea('age-10000bc') / 5, `${drySea('age-5000bc')} dry cells at 5,000 BC`);
    assert.ok(drySea('age-9500bc') > drySea('age-10000bc'), 'the sea stood lower after the ice lake drained');
  });

  it('shows the water as one basin, with no stray pools', () => {
    const points = { Stockholm: [18.3, 58.9], Baltic: [19.5, 57.5], Gdansk: [19.3, 54.9], GulfFinland: [25.0, 59.8], Riga: [23.5, 57.8] };
    const skagerrak = [10.5, 58.0];
    for (const a of AGES) {
      const s = slice(a.id);
      const { sizes, label } = bodies(s.surface.map((v) => (v === SURFACE.water ? 1 : 0)), s.cols, s.rows);
      const total = sizes.reduce((x, y) => x + y, 0);
      const sorted = sizes.slice().sort((x, y) => y - x);
      const lab = (/** @type {number[]} */ p) => { const [x, y] = MAP.toUnits(p[0], p[1]); return label[Math.floor(y / s.cell) * s.cols + Math.floor(x / s.cell)]; };
      const basin = lab(points.Baltic);
      assert.ok(basin > 0, `${a.id}: the Baltic is water`);
      for (const [name, p] of Object.entries(points)) assert.equal(lab(p), basin, `${a.id}: ${name} is not in the basin`);
      assert.equal(sizes[basin - 1], sorted[0], `${a.id}: the basin is the biggest body`);
      assert.ok(sorted[0] / total > 0.8, `${a.id}: the basin holds ${(100 * sorted[0] / total).toFixed(1)}% of the water`);
      assert.ok((sorted[0] + sorted[1] + (sorted[2] ?? 0)) / total > 0.985, `${a.id}: the three biggest bodies hold less than 98.5%`);
      const small = sizes.filter((n) => n < 100).reduce((x, y) => x + y, 0);
      assert.ok(small / total < 0.006, `${a.id}: ${(100 * small / total).toFixed(2)}% of the water is in pools under 100 km2`);
      // The open sea in the west (Skagerrak) joins the basin only when the Danish straits are open.
      assert.equal(lab(skagerrak) === basin, a.id === 'age-5000bc', `${a.id}: the Danish straits`);
    }
    // The Oresund: a land barrier across its southern half until 7,500 BC, a strip of water from end to end at 5,000 BC.
    for (const id of ['age-9500bc', 'age-8500bc', 'age-7500bc']) assert.equal(at(id, 12.75, 55.55), 'land', `${id}: the Oresund`);
    assert.equal(at('age-5000bc', 12.75, 55.55), 'water');
    assert.equal(at('age-5000bc', 12.7, 55.95), 'water', 'Helsingor');
  });

  it('puts known places where the data and the sources say', () => {
    // Stockholm: under the ice sheet at 10,000 BC (DATED-1 and SGU agree) and still at 9,500 BC (SGU), then water.
    assert.equal(at('age-10000bc', 18.07, 59.33), 'ice');
    assert.equal(at('age-9500bc', 18.07, 59.33), 'ice');
    for (const id of ['age-8500bc', 'age-7500bc', 'age-5000bc']) assert.equal(at(id, 18.07, 59.33), 'water');
    // Tallinn: under the ice lake at 10,000 BC. At 9,500 and 8,500 BC the study of the Tallinn shore
    // has it mostly under water but SGU's coarse model shows it mostly dry, and the notes say so.
    const share = (/** @type {string} */ id) => { let w = 0; let t = 0; for (let la = 59.34; la <= 59.43; la += 0.005) for (let lo = 24.6; lo <= 24.9; lo += 0.01) { t++; if (at(id, lo, la) === 'water') w++; } return w / t; };
    assert.ok(share('age-10000bc') > 0.95, 'Tallinn is under the ice lake');
    assert.ok(share('age-9500bc') < 0.5, `SGU has Tallinn mostly dry at 9,500 BC (${share('age-9500bc')})`);
    assert.ok(share('age-8500bc') < 0.2);
    const notes = JSON.parse(read('tools/map/age-notes.json'));
    const sentences = (/** @type {string} */ id) => notes.ages.find((/** @type {any} */ a) => a.id === id).sentences.map((/** @type {any} */ s) => s.text).join(' ');
    assert.match(sentences('age-9500bc'), /shows more of the Tallinn area dry than this study does/);
    assert.match(sentences('age-8500bc'), /shows the Tallinn area mostly dry/);
    // Riga, Vilnius, Gdansk and Klaipeda are land in every age; Helsinki is under the ice lake or sea.
    for (const a of AGES) for (const [lon, lat] of [[24.1, 56.95], [25.28, 54.69], [18.65, 54.35], [21.13, 55.7]]) assert.equal(at(a.id, lon, lat), 'land', `${a.id} ${lon},${lat}`);
    // Ahrensburgian islands: Ruegen, Usedom and Wolin joined by dry land at 10,000 BC; Bornholm is a separate island in SGU's model, and the notes say so.
    assert.equal(at('age-10000bc', 13.4, 54.45), 'land');
    assert.equal(at('age-10000bc', 14.9, 55.1), 'land');
    assert.match(sentences('age-10000bc'), /leaves a strait between Bornholm and the mainland/);
    // The Baltic is a lake at 8,500 and 7,500 BC and the sea from 5,000 BC: the western sea is a different body (tested above).
    assert.equal(at('age-7500bc', 19.5, 57.5), 'water');
  });

  it('hatches only the land east of SGU\'s model, for the four oldest ages, and not at 5,000 BC', () => {
    const cc = Math.ceil(GRID_1KM.cols / 2); const cr = Math.ceil(GRID_1KM.rows / 2);
    let east = 0; let eastAndOut = 0; let iceEast = 0;
    for (let r = 0; r < cr; r++) for (let c = 0; c < cc; c++) {
      const [lon, lat] = MAP.toDegrees((c + 0.5) * 20, (r + 0.5) * 20);
      const isEast = eastOfModel(lon, lat);
      if (isEast) east++;
      for (const a of AGE_BUILDS) {
        const none = slice(a.id).cover[r * cc + c] === COVER.none;
        assert.equal(none, a.hatchEast && isEast, `${a.id} cover cell ${c},${r} (${lon.toFixed(2)}E ${lat.toFixed(2)}N)`);
      }
      if (isEast) eastAndOut++;
      if (isEast && slice('age-10000bc').surface[2 * r * GRID_1KM.cols + 2 * c] === SURFACE.ice) iceEast++;
    }
    assert.ok(east > 150000 && eastAndOut === east, `${east} cover cells lie east of the model`);
    for (const a of AGE_BUILDS.slice(0, 4)) {
      const rects = hatchRects(slice(a.id));
      assert.ok(rects.length > 0 && rects.length < 3000, `${a.id}: ${rects.length} hatch rectangles`);
    }
    assert.equal(hatchRects(slice('age-5000bc')).length, 0);
    // Ice is painted wherever it stands, hatched land or not: DATED-1's ice reaches past the model at 10,000 BC.
    assert.ok(iceEast > 100 && iceEast < 1000, `${iceEast} cover cells of ice east of the model at 10,000 BC`);
    assert.equal(at('age-10000bc', 28.2, 59.38), 'none');
  });

  it('draws the five covers the way the rule says', () => {
    const count = (/** @type {string} */ id) => { const c = [0, 0, 0, 0, 0]; for (const v of slice(id).cover) c[v]++; return c; };
    const c10 = count('age-10000bc'); const c95 = count('age-9500bc'); const c85 = count('age-8500bc'); const c75 = count('age-7500bc'); const c50 = count('age-5000bc');
    assert.equal(c10[COVER.birch] + c10[COVER.pine] + c10[COVER.mixed], 0, '10,000 BC is painted as tundra');
    assert.ok(c10[COVER.tundra] > 300000);
    assert.ok(c95[COVER.tundra] > 100000 && c95[COVER.mixed] > 50000);
    assert.ok(c85[COVER.birch] > 50000, 'birch woodland at 8,500 BC');
    assert.equal(c75[COVER.tundra] + c75[COVER.birch], 0, 'no tundra or birch class after 8,500 BC');
    assert.equal(c50[COVER.tundra] + c50[COVER.birch] + c50[COVER.none], 0);
    for (const c of [c10, c95, c85, c75, c50]) assert.equal(c.reduce((a, b) => a + b, 0), 787 * 664);
    assert.equal(block.meta.labels.cover10000.startsWith('Painted by a rule'), true);
  });

  it('carries the sea east of the model as a rough estimate at 5,000 BC, from the Gulf of Finland only', () => {
    const est = block.meta.built['age-5000bc'].estimateEast;
    assert.ok(est.level > 5 && est.level < 40 && est.flooded > 1000 && est.samples > 20, JSON.stringify(est));
    assert.equal(at('age-5000bc', 28.0, 59.7), 'water', 'the Gulf still open just east of the edge');
    assert.equal(at('age-5000bc', 28.2, 59.38), 'land', 'Narva stands dry (south of the carried sea)');
    assert.equal(at('age-5000bc', 32.0, 59.9), 'land', 'no sea beyond the reach, and no Ladoga');
    assert.match(block.meta.labels.east5000, /TO CHECK/);
    for (const a of AGE_BUILDS.slice(0, 4)) assert.equal(block.meta.built[a.id].estimateEast, null);
  });

  it('is fingerprinted, pinned and licensed', () => {
    assert.equal(block.meta.paramsSha256, paramsSha256(), 'the rules changed after the block was made: npm run map:ages');
    assert.equal(JSON.stringify(block.meta.params), JSON.stringify(AGES_PARAMS));
    const prints = JSON.parse(read('src/data/fingerprints.json'));
    assert.equal(prints['src/data/by-sa/ages.json'], sha256(new TextEncoder().encode(blockText)));
    // DATED-1: the zip from PANGAEA and the three files read from it, pinned (8 November 2026).
    assert.deepEqual(DATED1_PINS, {
      zip: 'a916de31ff31b0bb63863b82d61a6be02659ecfe36a7cab0fdf00034b38be1f1',
      'TS12_mc.shp': '3c942f9afed730e1feb984f113d394a9b2ba158e01a718db6d6dc53a64c828d2',
      'TS12_mc.dbf': '7324e718d474d2925a8f62fd33df759c496e17a1f33658b823a0085db7e585f4',
      'TS12_mc.prj': 'c6b1c62133cea8a8d3af29cd3eebf3141d057b1e0e9c40609e34948521c5d601',
    });
    assert.equal(block.meta.dated1.zipSha256, DATED1_PINS.zip);
    assert.deepEqual(block.meta.dated1.files, { 'TS12_mc.shp': DATED1_PINS['TS12_mc.shp'], 'TS12_mc.dbf': DATED1_PINS['TS12_mc.dbf'], 'TS12_mc.prj': DATED1_PINS['TS12_mc.prj'] });
    // SGU's four files, by hash, one per table's file.
    for (const a of AGE_BUILDS) assert.match(block.meta.built[a.id].sguSha256, /^[0-9a-f]{64}$/);
    assert.equal(block.meta.built['age-10000bc'].sguSha256, block.meta.built['age-9500bc'].sguSha256, 'two ages read the one 11000-11900 file');
    // The sources: every id there, licences read and quoted, the right licence names.
    for (const id of AGES_SOURCES) {
      const s = sources.find((/** @type {any} */ x) => x.id === id);
      assert.ok(s, `${id} is in sources.json`);
      assert.equal(s.licenceStatus, 'read', `${id}: licence not read`);
      assert.ok(s.licenceQuote && s.licenceReadAt, `${id}: no quote or place`);
    }
    const byId = (/** @type {string} */ id) => sources.find((/** @type {any} */ x) => x.id === id);
    assert.match(byId('sgu-shore-ages').licence, /^CC0/);
    assert.match(byId('sgu-shore-ages').licenceQuote, /CC0/);
    assert.match(byId('dated1-ts12').licence, /CC BY 3\.0/);
    assert.ok(byId('dated1-ts12').what.includes('identical'), 'the third-party copy was compared with the original');
    for (const w of ['spatiocompo-tw25', 'spatiocompo-tw23', 'spatiocompo-tw21', 'spatiocompo-tw16']) {
      assert.ok(w in POLLEN_WINDOWS);
      assert.match(byId(w).url, /commit|894d44d58f66bb5c273491d98c3ec23a35e6a796/);
      assert.equal(byId(w).credit.licenceName, 'CC BY-SA 4.0');
    }
  });

  it('reads no OpenStreetMap data: no import of its modules, and none of its sources', () => {
    /** @type {Set<string>} */
    const seen = new Set();
    /** @param {string} file */
    const walk = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const m of readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)) { const next = resolve(dirname(file), m[1]); if (existsSync(next)) walk(next); }
    };
    for (const f of ['ages.mjs', 'build-ages.mjs', 'pack-ages.mjs']) walk(join(ROOT, 'tools/map', f));
    const names = [...seen].map((f) => f.slice(ROOT.length));
    assert.ok(names.length > 10, 'the walk reached the tools');
    for (const n of names) assert.ok(!/osm|overture|parquet|water|names-of-the-time/.test(n), `${n} is imported by the ice-age build`);
    for (const id of AGES_SOURCES) assert.notEqual(sources.find((/** @type {any} */ s) => s.id === id)?.collection, 'osm');
  });

  it('passes the licence guard, and the guard stops it with a wrong licence or an unread source', () => {
    const blocks = [{ kind: 'ages', text: blockText }];
    assert.deepEqual(licenceProblems(blocks, sources), []);
    const wrong = [{ kind: 'ages', text: JSON.stringify({ ...block, licence: 'CC-BY-4.0' }) }];
    assert.ok(licenceProblems(wrong, sources).some((p) => /share-alike|SA|BY-SA/i.test(p)), 'a BY-SA input needs a BY-SA block');
    const unread = sources.map((/** @type {any} */ s) => (s.id === 'sgu-shore-ages' ? { ...s, licenceStatus: 'unverified' } : s));
    assert.ok(licenceProblems(blocks, unread).some((p) => /sgu-shore-ages/.test(p)));
  });

  it('is a late block: a 1219 game never reads it, and the first map is built without it', () => {
    const early = dataElements([{ kind: 'ages', text: blockText }].filter((b) => !LATE_KINDS.includes(b.kind)));
    assert.equal(early, '', 'no ages element before the code');
    const late = lateElements([{ kind: 'ages', text: blockText }]);
    assert.ok(late.startsWith('<!--gs:ages\n') && late.endsWith('\n-->') && !late.slice(5, -3).includes('-->'));
    const main = read('src/ui/main.js');
    assert.equal((main.match(/readOptionalBlock\('ages'\)/g) ?? []).length, 1);
    const fn = main.slice(main.indexOf('async function loadAgeMaps'), main.indexOf('function onAgeChange'));
    assert.match(fn, /readOptionalBlock\('ages'\)/);
    assert.equal((main.match(/loadAgeMaps\(/g) ?? []).length, 2, 'declared once, called once (from onAgeChange)');
    assert.match(main.slice(main.indexOf('function onAgeChange')), /void loadAgeMaps\(\)/);
    const showMap = main.slice(main.indexOf('function showMap'), main.indexOf('function showMap') + 4000);
    assert.ok(!/ages|loadAges|loadAgeMaps/.test(showMap));
  });

  it('draws an age in a time the phone can bear (loose bound in Node; the real numbers are in the notes)', () => {
    const s = slice('age-9500bc');
    const t0 = performance.now(); paintAge(s, null); const t1 = performance.now();
    const shore = oldShore(s); const t2 = performance.now();
    const rects = hatchRects(s); const t3 = performance.now();
    assert.ok(shore.length > 100 && rects.length > 0);
    const total = t3 - t0;
    console.log(`# age drawing on the real 9,500 BC block: paintAge ${(t1 - t0).toFixed(0)} ms, oldShore ${(t2 - t1).toFixed(0)} ms (${shore.length} lines), hatchRects ${(t3 - t2).toFixed(0)} ms, total ${total.toFixed(0)} ms`);
    assert.ok(total < 4000, `the age takes ${total.toFixed(0)} ms to prepare in Node`);
  });

  const built = join(DERIVED, 'ages-summary.json');
  it('matches the build\'s own record, when it is on this computer', { skip: !existsSync(built) }, () => {
    const summary = JSON.parse(readFileSync(built, 'utf8'));
    assert.equal(summary.paramsSha256, block.meta.paramsSha256);
    for (const a of AGE_BUILDS) {
      assert.equal(sha256(layers[`${a.id}/surface`]), summary.ages[a.id].surfaceSha256, `${a.id}: surface`);
      assert.equal(sha256(layers[`${a.id}/cover`]), summary.ages[a.id].coverSha256, `${a.id}: cover`);
    }
    assert.deepEqual(summary.sguPolygonExtent && Object.keys(summary.sguPolygonExtent).sort(), ['maxX', 'maxY', 'minX', 'minY']);
    for (const k of /** @type {const} */ (['minX', 'maxX', 'minY', 'maxY'])) assert.ok(Math.abs(summary.sguPolygonExtent[k] - SGU_DOMAIN[k]) <= 1, `SGU's polygons stop at ${k}`);
  });
});

describe('the other blocks are untouched', () => {
  it('has the fingerprints the first map was shipped with', () => {
    const prints = JSON.parse(read('src/data/fingerprints.json'));
    for (const [path, want] of Object.entries({
      'src/data/map/base.json': '95bc3254b70f8cd810172e5f03b2a214b7283a58be7843cfa49c78e2e3ffbb25',
      'src/data/by-sa/terrain-1219.json': '1128faab669f84d500782bb0bc380716bb149299e6b59de48db4dd3a0fb298b9',
      'src/data/odbl/water.json': 'b6f75cfaa19a0f0c6d09a188bb9bfd9ddd5bf7b7525b7fd7eb02cc6de393eb6b',
      'src/data/by-sa/terrain-time.json': '75dffb3a1552f0972a542d9b6f0ea7bd23265ce732297f84070a01c2a12f66c2',
      'src/data/by-sa/terrain-ad1.json': '5622c9055a48fbdcea0d27d2d57324e32a84e5920a16b5d4b702e957bef347f2',
      'src/data/by/coast.json': 'd762935450e9e1bdc772a043f41e9e519f4fd5f74854d1568ca9f1f8ffc267df',
      'src/data/by/coast-ad1.json': 'de8abd6df5610e123cd640f4578767dd476b9db25244a53ace6da001813a0807',
      'src/data/own/names.json': 'dea162bead9b5a031038dc9170e58db9ca73d22a425d25f42dbc2bb1cea38e72',
      'src/data/own/changes.json': '4ccf5f716c08a94c33d34cc9c9a1ea462e38dd3dd1bd64c5b515e33e9988c619',
    })) assert.equal(prints[path], want, `${path} changed in PR 3`);
  });
});

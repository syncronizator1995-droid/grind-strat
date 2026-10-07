// @ts-check
// Tests for the 1219 terrain rules (tools/map/terrain-1219.mjs and its helpers) on made-up
// inputs: quotas met per 1 degree cell, no visible squares, the same grid from the same inputs,
// the class codes, and a check that the build never reads OpenStreetMap data. No network and no
// data/raw files (CI has neither).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DERIVED_INPUTS, NE_INPUTS, PREVIEW_COLOURS, TERRAIN_SOURCES } from '../tools/map/build-terrain-1219.mjs';
import { blendAll, latticePlaces, pollenLattice } from '../tools/map/pollen-field.mjs';
import { solveQuota } from '../tools/map/quota.mjs';
import { lakeListSha256 } from '../tools/map/ne-water-1219.mjs';
import { staleReasons } from '../tools/map/pack-terrain.mjs';
import { buildTerrain1219, CLASS, CLASS_NAMES, TERRAIN_PARAMS, terrainParamsSha256 } from '../tools/map/terrain-1219.mjs';
import { cappedGaps, classTotals, seamTest, speckleTest, squareChecks, SPECKLE_LIMITS } from '../tools/map/terrain-checks.mjs';
import { distanceTo, hash01, maskedBlur, upsample, valueNoise } from '../tools/map/terrain-fields.mjs';
import { absorbSmallPatches, edgeScore } from '../tools/map/tidy.mjs';
import { TERRAIN } from '../src/ui/map/terrain.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * A made-up 3 x 3 degree world on a flat lon/lat grid, 40 cells per degree: a strip of sea in the
 * west, today's land cover from hashed blobs, a marsh patch, a dune strip, a lake today, and a
 * pollen map whose forest share changes a lot from square to square.
 */
function syntheticInput() {
  const per = 40;
  const cols = 3 * per;
  const rows = 3 * per;
  const n = cols * rows;
  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  const land = new Uint8Array(n);
  const mk = () => new Uint8Array(n);
  const cover = { tree: mk(), crop: mk(), built: mk(), bare: mk(), moss: mk(), water: mk() };
  const marsh = mk();
  const marshRaw = mk();
  const rivers = mk();
  const lakes = mk();
  const height = new Float32Array(n);
  const rough = new Float32Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      lon[i] = 20 + (c + 0.5) / per;
      lat[i] = 54 + (r + 0.5) / per;
      land[i] = c >= 6 ? 1 : 0;
      // Round blobs (smooth value noise), so any seam the test finds comes from the rules, not
      // from the made-up inputs. Square blobs would not do: their straight edges fell one cell
      // from the 1 degree lines, and once the rules smooth the score, they show.
      const blob = valueNoise(c + 3, r + 5, 7, 7);
      cover.tree[i] = Math.round(100 * blob * hash01(c, r, 1));
      cover.crop[i] = Math.round((100 - cover.tree[i]) * hash01(c, r, 2));
      if (c >= 6 && c < 8) cover.bare[i] = 60; // a dune strip on the coast
      if (c >= 60 && c < 70 && r >= 60 && r < 70) marsh[i] = 80;
      if (c >= 90 && c < 100 && r >= 20 && r < 30) cover.water[i] = 100; // a lake today
      marshRaw[i] = Math.round(30 * hash01(c, r, 3));
      height[i] = 200 * valueNoise(c + 5, r + 2, 13, 4);
      rough[i] = 20 * valueNoise(c + 5, r + 2, 13, 5);
      if (r === 75) rivers[i] = 1;
    }
  }
  /** @type {import('../tools/map/pollen-field.mjs').PollenCell[]} */
  const pollen = [];
  const forest = [[0.35, 0.8, 0.55], [0.7, 0.45, 0.8], [0.5, 0.65, 0.4]];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const f = forest[y][x];
      const k = 0.2 + 0.2 * ((x + y) % 3);
      pollen.push({ lon: 20.5 + x, lat: 54.5 + y, conifer: f * k, broadleaf: f * (1 - k), open: 1 - f });
    }
  }
  return { cols, rows, cellKm: 1, lon, lat, land, rivers, lakes, cover, marsh, marshRaw, height, rough, pollen };
}

describe('1219 terrain: class codes', () => {
  it('uses M1\'s codes, never 1 (lakes come from the separate water block)', () => {
    for (const [name, code] of Object.entries(CLASS)) assert.equal(code, TERRAIN[/** @type {keyof typeof TERRAIN} */ (name)], name);
    assert.deepEqual(CLASS_NAMES, { 0: 'sea', 2: 'open', 3: 'conifer', 4: 'mixed', 5: 'marsh', 6: 'heath' });
    assert.ok(!(/** @type {number[]} */ (Object.values(CLASS))).includes(TERRAIN.lake));
  });

  it('previews in the same colours as the game paints (src/ui/map/terrain.js)', () => {
    const src = readFileSync(join(ROOT, 'src', 'ui', 'map', 'terrain.js'), 'utf8');
    const block = /const COLOURS = \[([\s\S]*?)\n\];/.exec(src);
    assert.ok(block, 'COLOURS not found in terrain.js');
    const colours = [...block[1].matchAll(/\[(\d+), (\d+), (\d+)\]/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
    assert.deepEqual(PREVIEW_COLOURS, colours);
  });
});

describe('1219 terrain: rules on made-up inputs', () => {
  const input = syntheticInput();
  const built = buildTerrain1219(input);

  it('meets every square\'s pollen forest and conifer share to within 3 points', () => {
    const sq = squareChecks(built);
    assert.equal(sq.count, 9);
    assert.deepEqual(sq.capped, []);
    for (const r of sq.rows) {
      assert.ok(Math.abs(r.forest - r.forestTarget) <= 0.03, `forest ${r.lon},${r.lat}: ${r.forest} vs ${r.forestTarget}`);
      assert.ok(Math.abs(r.conifer - r.coniferTarget) <= 0.03, `conifer ${r.lon},${r.lat}: ${r.conifer} vs ${r.coniferTarget}`);
    }
  });

  it('shows no square edges: the class changes as often across them as across lines beside them', () => {
    const s = seamTest(built, input);
    assert.ok(s.edgePairs > 400 && s.controlPairs > 1600);
    assert.ok(s.ratio < 1.25, `seam ratio ${s.ratio}: ${JSON.stringify(s)}`);
  });

  it('would catch squares: a square-by-square pick of the same shares fails the seam test', () => {
    // The naive way: in each square, the cells with most tree cover around them today become
    // forest (smoothed, as the rules smooth their score).
    const tree = maskedBlur(input.cover.tree, input.land, input.cols, input.rows, 3);
    const blocky = built.terrain.slice();
    /** @type {Map<number, number[]>} */
    const bySquare = new Map();
    for (let i = 0; i < blocky.length; i++) {
      if (!built.domain[i] || blocky[i] === CLASS.marsh || blocky[i] === CLASS.heath) continue;
      blocky[i] = CLASS.open;
      const g = built.places.group[i];
      bySquare.set(g, [...(bySquare.get(g) ?? []), i]);
    }
    for (const [g, cells] of bySquare) {
      cells.sort((a, b) => tree[b] - tree[a] || a - b);
      const want = Math.round(built.lattice.forest[g] * built.forest.domainCount[g]);
      for (const i of cells.slice(0, want)) blocky[i] = CLASS.mixed;
    }
    const s = seamTest({ terrain: blocky, domain: built.domain }, input);
    assert.ok(s.ratio > 1.25, `seam ratio ${s.ratio}`);
  });

  it('paints coherent patches, not salt and pepper', () => {
    const s = speckleTest(built.terrain, input.cols, input.rows);
    for (const [key, limit] of Object.entries(SPECKLE_LIMITS)) assert.ok(s[/** @type {keyof typeof SPECKLE_LIMITS} */ (key)] <= limit, `${key} ${JSON.stringify(s)}`);
    assert.ok(s.meanPatch >= 100, `patches of ${s.meanPatch} cells`);
  });

  it('would catch salt and pepper: the same rules without smoothing or tidying fail the speckle test', () => {
    const p = { ...TERRAIN_PARAMS, minPatch: 0, forest: { ...TERRAIN_PARAMS.forest, smoothKm: 0 }, conifer: { ...TERRAIN_PARAMS.conifer, smoothKm: 0 } };
    // The tuned numbers are frozen literals in their type; these are deliberately different.
    const rough = buildTerrain1219(input, /** @type {typeof TERRAIN_PARAMS} */ (/** @type {unknown} */ (p)));
    const s = speckleTest(rough.terrain, input.cols, input.rows);
    assert.ok(s.lone > SPECKLE_LIMITS.lone && s.smallPatch > SPECKLE_LIMITS.smallPatch, JSON.stringify(s));
  });

  it('keeps the sea, puts marsh first, dunes as heath, and fills today\'s water from its shores', () => {
    const { terrain } = built;
    for (let i = 0; i < terrain.length; i++) {
      assert.equal(terrain[i] === CLASS.sea, !input.land[i], `cell ${i}`);
      if (input.marsh[i] >= 50) assert.equal(terrain[i], CLASS.marsh);
      else if (input.cover.bare[i] >= 20 && input.land[i]) assert.equal(terrain[i], CLASS.heath);
      assert.ok(terrain[i] in CLASS_NAMES, `unknown class ${terrain[i]}`);
    }
    assert.equal(built.water.cells, 100);
    assert.equal(built.water.interior, 16); // a 10 x 10 lake less its 3-cell shore band leaves 4 x 4
    const totals = classTotals(terrain);
    assert.equal(Object.values(totals).reduce((a, b) => a + b, 0), terrain.length);
    assert.equal(totals.unknown, undefined);
  });

  it('gives the same grid from the same inputs, byte for byte', () => {
    const again = buildTerrain1219(syntheticInput());
    assert.deepEqual(again.terrain, built.terrain);
  });
});

describe('1219 terrain: helpers', () => {
  it('blends the pollen field smoothly, filling missing centres from the nearest one', () => {
    const L = pollenLattice([{ lon: 20.5, lat: 54.5, conifer: 0.2, broadleaf: 0.2, open: 0.6 }, { lon: 21.5, lat: 54.5, conifer: 0.4, broadleaf: 0.4, open: 0.2 }], { west: 20, east: 22, south: 54, north: 55 });
    const lon = Float64Array.from([20.5, 21, 21.5, 21.5]);
    const lat = Float64Array.from([54.5, 54.5, 54.5, 54.9]);
    const f = blendAll(L.forest, latticePlaces(lon, lat, L));
    assert.ok(Math.abs(f[0] - 0.4) < 1e-6 && Math.abs(f[1] - 0.6) < 1e-6 && Math.abs(f[2] - 0.8) < 1e-6, `${f}`);
    assert.ok(Math.abs(f[3] - 0.8) < 1e-6, 'the missing row to the north borrows its nearest value');
  });

  it('solves a quota per square with a smooth threshold', () => {
    const per = 30;
    const cols = 2 * per; const rows = per;
    const lon = new Float64Array(cols * rows); const lat = new Float64Array(cols * rows);
    const score = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        lon[r * cols + c] = 10 + (c + 0.5) / per; lat[r * cols + c] = 50 + (r + 0.5) / per;
        score[r * cols + c] = hash01(c, r, 9);
      }
    }
    const L = pollenLattice([{ lon: 10.5, lat: 50.5, conifer: 0.1, broadleaf: 0.1, open: 0.8 }, { lon: 11.5, lat: 50.5, conifer: 0.45, broadleaf: 0.45, open: 0.1 }], { west: 10, east: 12, south: 50, north: 51 });
    const all = new Uint8Array(cols * rows).fill(1);
    const res = solveQuota({ score, eligible: all, domain: all, places: latticePlaces(lon, lat, L), target: L.forest });
    const g0 = Math.round(10.5 - L.lon0) + Math.round(50.5 - L.lat0) * L.w;
    assert.ok(Math.abs(res.chosenCount[g0] / res.domainCount[g0] - 0.2) <= 0.01);
    assert.ok(Math.abs(res.chosenCount[g0 + 1] / res.domainCount[g0 + 1] - 0.9) <= 0.01);
  });

  it('measures distance, blurs within a mask and upsamples without steps', () => {
    const src = new Uint8Array(25); src[12] = 1;
    const d = distanceTo(src, 5, 5);
    assert.equal(d[12], 0); assert.equal(d[13], 1); assert.ok(Math.abs(d[18] - Math.SQRT2) < 1e-6); assert.equal(d[14], 2);
    const mask = Uint8Array.from([1, 1, 0, 0]);
    const b = maskedBlur([10, 20, 99, 99], mask, 4, 1, 1);
    assert.equal(b[0], 15); assert.equal(b[2], 20);
    const up = upsample([0, 10, 0, 10], 2, 2, 4, 4, 2);
    assert.deepEqual([...up.subarray(0, 4)], [0, 2.5, 7.5, 10]);
  });

  it('joins small islands to their surroundings, but not islets walled in by bog', () => {
    // 7 x 5 cells: a forest field with a lone open cell, a 2-cell clearing, and a forest cell
    // walled in by cells that take no part (bog).
    const cols = 7; const rows = 5;
    const chosen = new Uint8Array(cols * rows).fill(1);
    const eligible = new Uint8Array(cols * rows).fill(1);
    chosen[1 * cols + 1] = 0;
    chosen[3 * cols + 3] = 0; chosen[3 * cols + 4] = 0;
    for (const i of [1 * cols + 4, 1 * cols + 6, 0 * cols + 5, 2 * cols + 5]) eligible[i] = 0;
    chosen[1 * cols + 5] = 0; // inside the bog ring: nothing to join
    const r = absorbSmallPatches(chosen, eligible, cols, rows, 3);
    assert.deepEqual(r, { islands: 2, cells: 3 });
    assert.equal(chosen[1 * cols + 1], 1);
    assert.equal(chosen[3 * cols + 3] + chosen[3 * cols + 4], 2);
    assert.equal(chosen[1 * cols + 5], 0);
  });

  it('ranks cells by depth inside their patch, so a quota moves edges, not cells deep inside', () => {
    const cols = 6; const rows = 1;
    const chosen = Uint8Array.from([1, 1, 1, 0, 0, 0]);
    const all = new Uint8Array(cols).fill(1);
    const e = edgeScore(chosen, all, new Float32Array(cols), cols, rows);
    assert.deepEqual([...e].map((v) => Math.round(v * 2) / 2), [2.5, 1.5, 0.5, -0.5, -1.5, -2.5]);
  });

  it('hashes the same way every time', () => {
    assert.equal(hash01(3, 4, 5), hash01(3, 4, 5));
    assert.notEqual(hash01(3, 4, 5), hash01(4, 3, 5));
  });
});

describe('1219 terrain: the shipped block is current', () => {
  const block = JSON.parse(readFileSync(join(ROOT, 'src/data/by-sa/terrain-1219.json'), 'utf8'));
  const review = JSON.parse(readFileSync(join(ROOT, 'tools/map/ne-water-1219.json'), 'utf8'));

  it('was built from today\'s lake list and TERRAIN_PARAMS (else: npm run map:terrain, then npm run map:pack)', () => {
    assert.equal(block.meta.built?.lakesSha256, lakeListSha256(review), 'the lakes in tools/map/ne-water-1219.json changed since the grid was built');
    assert.equal(block.meta.built?.paramsSha256, terrainParamsSha256(), 'TERRAIN_PARAMS changed since the grid was built');
  });

  it('falls short of the pollen forest share in no more squares than it did when reviewed', () => {
    // Where marsh is above the pollen's open share, the square gets less forest (see the README in
    // src/data/by-sa/). Reviewed on 7 October 2026: 25 squares, 12,482 forest cells short. A rule
    // change that makes this worse must be seen, not slip in: raise these only on purpose.
    const capped = block.meta.built?.capped;
    assert.ok(capped, 'the block records the capped squares');
    assert.ok(capped.squares <= 25, `${capped.squares} capped squares`);
    assert.ok(capped.missingForestCells <= 12482, `${capped.missingForestCells} forest cells short`);
    assert.ok(capped.worstGapPoints <= 32.1, `worst square ${capped.worstGapPoints} points short`);
  });

  it('refuses to pack a grid built from another lake list or other settings', () => {
    const fresh = { inputs: [{ file: 'tools/map/ne-water-1219.json', lakesSha256: lakeListSha256(review) }], params: JSON.parse(JSON.stringify(TERRAIN_PARAMS)) };
    assert.deepEqual(staleReasons(fresh, review), []);
    const lakeDropped = { ...review, lakes: review.lakes.map((/** @type {any} */ e, /** @type {number} */ k) => (k === 0 ? { ...e, keep: false } : e)) };
    assert.match(staleReasons(fresh, lakeDropped).join(), /lakes in tools\/map\/ne-water-1219\.json changed/);
    const retuned = { ...fresh, params: { ...fresh.params, minPatch: 40 } };
    assert.match(staleReasons(retuned, review).join(), /TERRAIN_PARAMS .* changed/);
    const riverRenamed = { ...review, riverNames: [] };
    assert.deepEqual(staleReasons(fresh, riverRenamed), [], 'river names don\'t touch the terrain');
  });

  it('reports how far the capped squares fall short, the worst among squares with enough land', () => {
    const g = cappedGaps([
      { lon: 30.5, lat: 60.5, land: 1000, forestTarget: 0.8, forest: 0.5 },
      { lon: 36.5, lat: 56.5, land: 2, forestTarget: 0.75, forest: 0 },
    ]);
    assert.equal(g.squares, 2);
    assert.equal(g.missingForestCells, 302);
    assert.equal(g.worstGapPoints, 30);
  });
});

describe('1219 terrain: licence separation', () => {
  const OSM = /\bosm\b|osm-|-osm|overpass|openstreetmap\.org|\.osm\.|\.pbf\b/i;

  /** The build script and every local module it imports, directly or not. */
  function importGraph() {
    const start = join(ROOT, 'tools', 'map', 'build-terrain-1219.mjs');
    const seen = new Set();
    const todo = [start];
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

  it('never reads OpenStreetMap data, directly or through what it imports', () => {
    const files = importGraph();
    assert.ok(files.length >= 10, `only ${files.length} files found`);
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'([^']+)'/gm)) assert.doesNotMatch(m[1], OSM, `${file} imports ${m[1]}`);
      // Every string in the code (not the comments) that could name a file, URL or source id.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
      for (const m of code.matchAll(/'([^'\n]*)'|`([^`]*)`/g)) assert.doesNotMatch(m[1] ?? m[2], OSM, `${file}: ${m[0]}`);
      for (const m of code.matchAll(/readRaw\('([^']+)'/g)) assert.ok(NE_INPUTS.includes(m[1]), `${file} reads raw source ${m[1]}`);
    }
  });

  it('lists only the CC BY-SA, CC BY and public-domain inputs', () => {
    assert.deepEqual([...NE_INPUTS], ['ne-land', 'ne-rivers', 'ne-lakes']);
    for (const name of [...DERIVED_INPUTS, ...TERRAIN_SOURCES]) assert.doesNotMatch(name, OSM);
    const sources = JSON.parse(readFileSync(join(ROOT, 'tools', 'map', 'sources.json'), 'utf8')).sources;
    for (const id of TERRAIN_SOURCES) {
      const s = sources.find((/** @type {{ id: string }} */ x) => x.id === id);
      assert.ok(s, `${id} missing from sources.json`);
      assert.equal(s.licenceStatus, 'read', `${id}: licence not read`);
      assert.doesNotMatch(s.licence, /ODbL/i, id);
    }
  });
});

// @ts-check
// Builds data/raw/derived/coast-500m.u8: the northern coast over time, one byte per 500 m cell
// over a box of the north of the map (codes in src/sim/coast-date.js), with a .json sidecar of
// its box, sources, settings, control-point checks and a report. The rules live in
// tools/map/coast.mjs; tools/map/pack-coast.mjs packs the result into src/data/by/coast.json.
//   node tools/map/build-coast.mjs              (npm run map:coast; needs the GEBCO cache of
//                                                npm run map:grids and node tools/map/fetch.mjs)
//   node tools/map/build-coast.mjs --fetch-sgu  also fetch SGU's shore model (resource.sgu.se
//                                                must be allowed first)
//
// LICENCE: the field is CC BY 4.0 (NKG_RF17vel, and SGU's model when used, are CC BY 4.0; GEBCO
// and Natural Earth are public domain). It must never read OpenStreetMap data, which would make
// it ODbL: it reads only the inputs named in COAST_SOURCES.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COAST_BASE_YEAR, COAST_CODE, coastLevel } from '../../src/sim/coast-date.js';
import { MARGIN } from './build-grids.mjs';
import {
  chamferDistance, COAST_PARAMS, coastParamsSha256, codesFromCenturies, fillUnknownHeights, fitGroups, floodCodes, kField,
  openOutlet, ownCodes, seaAbove, seaFall, spreadIntoSea,
} from './coast.mjs';
import { ensureProxy, fetchWhole, loadManifest, RAW, sha256 } from './fetch-grids.mjs';
import { rawSources, readRaw } from './fetch.mjs';
import { featuresIn, fillRings, openRing, project } from './geo.mjs';
import { openGeoPackage } from './gpkg.mjs';
import { openGebco } from './grid-heights.mjs';
import { inputRecord, readBox } from './grid-sources.mjs';
import { neLand } from './ne-layers.mjs';
import { MAP, SWEREF99TM } from './projection.mjs';
import { areaAverage, bilinear, cornerLattice, DERIVED, mapGrid, mapWindow, writeGrid } from './resample.mjs';
import { bandIndex, memorySource, openTiff } from './tiff.mjs';

export const OUT_NAME = 'coast-500m.u8';
export const ANCHORS_FILE = 'tools/map/coast-anchors.json';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** The sources that can end up in the field. sgu-shore only when its files were read. */
export const COAST_SOURCES = Object.freeze(['nkg-rf17vel', 'gebco-2026', 'ne-land', 'ne-lakes']);
/** SGU's file for 1-900 cal BP (AD 1050-1950). */
const SGU_FILE_KEY = 'sgu-shore';

/** Places to report on: [name, lon, lat]. Town centres, approximate: only for the report. */
const REPORT_PLACES = /** @type {const} */ ([
  ['Stockholm', 18.07, 59.33], ['Turku', 22.27, 60.45], ['Mariehamn (Åland)', 19.94, 60.1], ['Haapsalu', 23.54, 58.94], ['Pärnu', 24.5, 58.385],
  ['Helsinki', 24.94, 60.17], ['Tallinn', 24.75, 59.44], ['Forsmark', 18.2, 60.37],
]);
/** A point inside Lake Mälaren (Västerås basin), to report when it is cut off from the sea. */
const MALAREN = /** @type {const} */ ([16.9, 59.5]);

/** The up_velocity band of NKG_RF17vel as a lon/lat raster. */
async function readUplift() {
  const { data } = await readRaw('nkg-rf17vel');
  const tiff = await openTiff(memorySource(new Uint8Array(data)));
  const image = tiff.images[0];
  if (!image.geo) throw new Error('NKG_RF17vel has no GeoTIFF grid');
  const values = await tiff.readWindow(image, 0, 0, image.width, image.height, { band: bandIndex(image, 'up_velocity') });
  const raster = { values, width: image.width, height: image.height, west: image.geo.west, north: image.geo.north, dx: image.geo.dx, dy: -image.geo.dy, noData: image.noData };
  return { at: bilinear(raster), image };
}

/** @param {number} lon @param {number} lat */
const unitsOf = (lon, lat) => MAP.toUnits(lon, lat);

/** Natural Earth's lakes as rings in game units, by name. */
async function neLakesByName() {
  const geojson = JSON.parse((await readRaw('ne-lakes')).data.toString('utf8'));
  /** @type {Map<string, number[][]>} */
  const out = new Map();
  for (const f of featuresIn(geojson, 'polygon')) {
    const name = String(f.props.name ?? '');
    const rings = out.get(name) ?? [];
    for (const part of f.parts) rings.push(openRing(project(part)));
    out.set(name, rings);
  }
  return out;
}

/**
 * The box of 500 m cells where the sea fell at least minFallM since 1219, found on a 5 km scan
 * and widened by 10 km, inside the map.
 * @param {(x: number, y: number) => number} fallAt mm a year at game units
 */
function findBox(fallAt) {
  const fine = mapGrid(COAST_PARAMS.cell);
  const step = 50; // 5 km
  const span = (COAST_PARAMS.today - COAST_BASE_YEAR) / 1000;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let y = step / 2; y < MAP.height; y += step) {
    for (let x = step / 2; x < MAP.width; x += step) {
      if (fallAt(x, y) * span < COAST_PARAMS.minFallM) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  const pad = 100 + step;
  const cell = COAST_PARAMS.cell;
  const col0 = Math.max(0, Math.floor((x0 - pad) / cell));
  const row0 = Math.max(0, Math.floor((y0 - pad) / cell));
  const colEnd = Math.min(fine.cols, Math.ceil((x1 + pad) / cell));
  const rowEnd = Math.min(fine.rows, Math.ceil((y1 + pad) / cell));
  return { col0, row0, cols: colEnd - col0, rows: rowEnd - row0, cell };
}

/**
 * SGU's per-century sea maps on the box, or null (with the reason) when the files are not here.
 * @param {{ col0: number, row0: number, cols: number, rows: number, cell: number }} box
 * @param {boolean} fetchIt
 */
async function readSgu(box, fetchIt) {
  const source = (await rawSources()).find((s) => s.id === SGU_FILE_KEY);
  if (!source) return { centuries: null, reason: 'sgu-shore is not in tools/map/sources.json' };
  const path = join(RAW, source.file);
  if (fetchIt) await fetchWhole(SGU_FILE_KEY, source.url, source.file);
  const known = (await loadManifest())[SGU_FILE_KEY];
  if (!existsSync(path) || !known?.sha256) {
    return { centuries: null, reason: 'SGU\'s shore model is not here: resource.sgu.se is not allowed yet (run with --fetch-sgu once it is). Sweden uses the estimate, bent to fit Stockholm.' };
  }
  if (sha256(new Uint8Array(await readFile(path))) !== known.sha256) throw new Error(`${source.file} changed since it was fetched: fetch it again`);
  if (source.licenceStatus !== 'read') {
    return { centuries: null, reason: 'SGU\'s files are here, but their licence has not been read on resource.sgu.se yet (sources.json): not used.' };
  }
  const gpkg = await openGeoPackage(path);
  try {
    /** @type {{ year: number, sea: Uint8Array }[]} */
    const centuries = [];
    for (const t of gpkg.tables()) {
      const m = /^issjohav_(\d+)$/i.exec(t.name);
      if (!m) continue;
      const year = 1950 - Number(m[1]);
      if (year < COAST_BASE_YEAR - 100) continue;
      if (t.srsId !== 3006) throw new Error(`${t.name} is in SRS ${t.srsId}, not SWEREF 99 TM (3006)`);
      const codeColumn = ['Code', 'code', 'CODE'].find((c) => { try { gpkg.features(t.name, [c]); return true; } catch { return false; } });
      if (!codeColumn) throw new Error(`${t.name} has no Code column`);
      const sea = new Uint8Array(box.cols * box.rows);
      const rings = [];
      for (const f of gpkg.features(t.name, [codeColumn])) {
        if (Number(f.properties[codeColumn]) !== 1) continue; // 1 = sea
        for (const poly of f.polygons) for (const ring of poly) rings.push(toBoxUnits(ring, box));
      }
      fillRings(sea, box.cols, box.rows, box.cell, rings, 1);
      centuries.push({ year, sea });
    }
    centuries.sort((a, b) => a.year - b.year);
    if (!centuries.length) return { centuries: null, reason: 'SGU\'s file holds no issjohav tables for the game\'s years' };
    return { centuries, reason: `SGU's shore model used in Sweden: ${centuries.length} century maps, ${centuries.map((c) => c.year).join(', ')}` };
  } finally {
    gpkg.close();
  }
}

/**
 * A ring in SWEREF 99 TM metres to game units relative to the box's corner.
 * @param {number[]} ring @param {{ col0: number, row0: number, cell: number }} box
 */
function toBoxUnits(ring, box) {
  const out = new Array(ring.length);
  for (let i = 0; i < ring.length; i += 2) {
    const [lon, lat] = SWEREF99TM.inverse(ring[i], ring[i + 1]);
    const [x, y] = MAP.toUnits(lon, lat);
    out[i] = x - box.col0 * box.cell;
    out[i + 1] = y - box.row0 * box.cell;
  }
  return out;
}

/**
 * Cells inside a lon/lat ring (the SGU domain), as a mask over the box.
 * @param {number[][]} ring [[lon, lat], ...] @param {{ col0: number, row0: number, cols: number, rows: number, cell: number }} box
 */
function domainMask(ring, box) {
  // Densify the edges so the projected outline follows the meridians and parallels.
  const flat = [];
  for (let k = 0; k < ring.length; k++) {
    const [a, b] = [ring[k], ring[(k + 1) % ring.length]];
    for (let s = 0; s < 20; s++) {
      const t = s / 20;
      const [x, y] = MAP.toUnits(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]));
      flat.push(x - box.col0 * box.cell, y - box.row0 * box.cell);
    }
  }
  const mask = new Uint8Array(box.cols * box.rows);
  fillRings(mask, box.cols, box.rows, box.cell, [flat], 1);
  return mask;
}

/**
 * Reads the inputs and makes the field (no writing).
 * @param {{ fetchSgu?: boolean }} [opts]
 */
export async function makeCoastField({ fetchSgu = false } = {}) {
  const started = Date.now();
  const anchorsText = await readFile(join(ROOT, ANCHORS_FILE), 'utf8');
  const anchors = JSON.parse(anchorsText);
  const uplift = await readUplift();

  // 1. k at the control places, and the fall rate everywhere.
  /** @param {{ lon: number, lat: number }} p */
  const at = (p) => { const [x, y] = unitsOf(p.lon, p.lat); return { up: uplift.at(p.lon, p.lat), x, y }; };
  const groups = fitGroups(anchors.points, at);
  const kAt = kField(groups);
  /** @param {number} x @param {number} y */
  const fallAt = (x, y) => { const [lon, lat] = MAP.toDegrees(x, y); return seaFall(uplift.at(lon, lat), kAt(x, y)); };
  const box = findBox(fallAt);
  const { cols, rows, cell } = box;
  const n = cols * rows;
  console.log(`box: ${cols} x ${rows} cells of 500 m from cell ${box.col0}, ${box.row0} (${(n / 1e6).toFixed(2)} M cells)`);
  const ox = box.col0 * cell; const oy = box.row0 * cell;
  /** @type {(ux: number, uy: number) => [number, number]} */
  const toDegrees = (ux, uy) => MAP.toDegrees(ux + ox, uy + oy);
  const lattice = cornerLattice({ cols, rows, cell }, toDegrees);

  // 2. Heights: GEBCO over the same window the 2 km heights read (so its cached pieces serve).
  // Only GEBCO's land (above 0 m) is averaged: its sea depths would drag the shore cells below
  // the sea and make them all come out of it in one year.
  const { key, tiff } = await openGebco();
  const raster = await readBox(tiff, tiff.images[0], mapWindow(MARGIN));
  const NO_LAND = -32768;
  const landValues = Int16Array.from(raster.values, (v) => (v > 0 ? v : NO_LAND));
  const heights = Float32Array.from(areaAverage(lattice, COAST_PARAMS.samples, bilinear({ ...raster, values: landValues, noData: NO_LAND })));
  console.log(`heights read (${((Date.now() - started) / 1000).toFixed(1)} s)`);

  // 3. Fall rate and k at each cell centre; today's land from Natural Earth (the game's coast).
  const fall = new Float32Array(n);
  const kCell = new Float32Array(n);
  const upCell = new Float32Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = (c + 0.5) * cell + ox; const y = (r + 0.5) * cell + oy;
      const [lon, lat] = MAP.toDegrees(x, y);
      upCell[i] = uplift.at(lon, lat);
      kCell[i] = kAt(x, y);
      fall[i] = seaFall(upCell[i], kCell[i]);
    }
  }
  const land = new Uint8Array(n);
  fillRings(land, cols, rows, cell, (await neLand()).map((ring) => ring.map((v, j) => v - (j % 2 ? oy : ox))), 1);
  const unknownHeights = fillUnknownHeights(heights, land, cols, rows);

  // 4. Each cell's own code; SGU's century maps over it in Sweden, when we have them.
  const own = ownCodes({ land, heights, fall });
  const sgu = await readSgu(box, fetchSgu);
  console.log(sgu.reason);
  const sources = [...COAST_SOURCES];
  if (sgu.centuries) {
    const fromSgu = codesFromCenturies(sgu.centuries, land, cols, rows);
    const domain = domainMask(anchors.sguDomain.ring, box);
    for (let i = 0; i < n; i++) if (domain[i] && land[i]) own[i] = fromSgu[i];
    sources.push('sgu-shore');
  }
  // Lakes that were bays (Mälaren): open until their outlet closed.
  const lakes = await neLakesByName();
  /** @type {{ id: string, channelCells: number, lakeCells: number, closedYear: number }[]} */
  const outlets = [];
  /** Cells of those lakes, left out of the shore report (their change is reported on its own). */
  const lakeCells = new Uint8Array(n);
  for (const l of anchors.lakes ?? []) {
    const rings = lakes.get(l.neName);
    if (!rings) throw new Error(`${l.id}: Natural Earth has no lake called ${l.neName}`);
    const mask = new Uint8Array(n);
    fillRings(mask, cols, rows, cell, rings.map((ring) => ring.map((v, j) => v - (j % 2 ? oy : ox))), 1);
    for (let i = 0; i < n; i++) if (mask[i]) lakeCells[i] = 1;
    const [x, y] = unitsOf(l.outlet.lon, l.outlet.lat);
    const oc = Math.floor(x / cell) - box.col0; const or = Math.floor(y / cell) - box.row0;
    if (!inBox(oc, or, cols, rows)) throw new Error(`${l.id}: its outlet is outside the coast box`);
    const channel = openOutlet(own, mask, land, cols, rows, or * cols + oc, l.outlet.closedYear);
    outlets.push({ id: l.id, channelCells: channel.length, lakeCells: mask.reduce((a, b) => a + b, 0), closedYear: l.outlet.closedYear });
  }

  // 5. The flood from the sea, then the spread into today's sea.
  const codes = floodCodes(own, cols, rows);
  spreadIntoSea(codes, land, cols, rows, COAST_PARAMS.spreadCells);
  console.log(`field made (${((Date.now() - started) / 1000).toFixed(1)} s)`);

  return { anchors, anchorsText, uplift, groups, kAt, box, heights, fall, land, own, codes, sgu, sources, key, at, started, unknownHeights, outlets, lakeCells };
}

async function main() {
  ensureProxy();
  const made = await makeCoastField({ fetchSgu: process.argv.includes('--fetch-sgu') });
  const { anchors, anchorsText, groups, kAt, box, heights, fall, land, codes, sgu, sources, key, at, started, unknownHeights, outlets, lakeCells } = made;
  const { cols, rows, cell } = box;
  const n = cols * rows;

  // 6. Checks and the report.
  const checks = anchorChecks(anchors.points, at, kAt);
  // The shore reports count today's land outside the bays that became lakes.
  const dry = land.map((v, i) => (v && !lakeCells[i] ? 1 : 0));
  const report = placeReport({ codes, land, dry, box, fall });
  const malaren = cellReport(codes, box, MALAREN[0], MALAREN[1]);
  const steps = jumpReport({ codes, land: dry, box });
  const seam = seamReport({ heights, land, fall, box });
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < n; i++) if (dry[i]) histogram[codes[i]]++;
  // Every code from 1 up is sea in 1219 and land today.
  const changing = histogram.slice(1, COAST_CODE.last + 1).reduce((a, b) => a + b, 0);

  printReport({ groups, checks, report, malaren, steps, seam, changing });
  await writeGrid(OUT_NAME, codes, {
    cols, rows, cell, col0: box.col0, row0: box.row0, rowOrder: 'south-first', type: 'uint8',
    unit: `code: 0 land before ${COAST_BASE_YEAR}; k = 1-${COAST_CODE.last} sea until ${COAST_BASE_YEAR} + 4k; 254 sea all game (src/sim/coast-date.js)`,
    licence: 'CC-BY-4.0',
    sources,
    inputs: [await inputRecord('nkg-rf17vel'), await inputRecord(key), await inputRecord('ne-land'), await inputRecord('ne-lakes')],
    params: COAST_PARAMS,
    paramsSha256: coastParamsSha256(anchorsText),
    anchorsFile: ANCHORS_FILE,
    gebcoKey: key,
    sgu: { used: !!sgu.centuries, note: sgu.reason },
    fitted: groups.map((g) => ({ group: g.group, k: round(g.k, 3), points: g.points })),
    checks,
    report,
    malaren,
    steps,
    seam,
    cells: { land: land.reduce((a, b) => a + b, 0), dryLandChangingSince1219: changing, unknownHeights },
    outlets,
    notes: 'An estimate. Relative sea fall = k x (NKG_RF17vel uplift - 0.5) mm a year, k fitted at the control points of tools/map/coast-anchors.json and blended by inverse distance (1 beyond 150 km); a cell of today\'s land at GEBCO height h (GEBCO\'s land only, at least 0.5 m; where GEBCO has no land, half its neighbours\' mean, 0.5 to 1 m) was sea until 2021 - 1000 h / fall, unless a higher sill cut it off sooner (widest-path flood from the sea, 4 neighbours). Lake Mälaren is a bay until its outlet at Stockholm closed (about 1300, given by hand). Cells of today\'s sea within 2 cells of the land take the smallest code of that land.',
  });
  console.log(`wrote ${join(DERIVED, OUT_NAME)} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}

/** @param {number} v @param {number} d */
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * The modelled sea at each control point against the study's figure.
 * @param {import('./coast.mjs').ControlPoint[]} points
 * @param {(p: import('./coast.mjs').ControlPoint) => { up: number, x: number, y: number }} at
 * @param {(x: number, y: number) => number} kAt
 */
function anchorChecks(points, at, kAt) {
  return points.map((p) => {
    const { up, x, y } = at(p);
    const model = seaAbove(up, kAt(x, y), p.year);
    const ok = p.use === 'below' ? model <= p.rslM + p.toleranceM
      : p.use === 'above' ? model >= p.rslM - p.toleranceM
        : Math.abs(model - p.rslM) <= p.toleranceM;
    return { id: p.id, use: p.use, year: p.year, observedM: p.rslM, toleranceM: p.toleranceM, modelM: round(model, 2), upliftMmYr: round(up, 2), k: round(kAt(x, y), 3), ok };
  });
}

/**
 * How far the 1219 shore lies inland of today's near each report place: within 15 km, the land
 * cells that were sea in 1219, and their distance from today's sea (cells and km).
 * @param {{ codes: Uint8Array, land: Uint8Array, dry: Uint8Array, box: any, fall: Float32Array }} g
 *   land: today's land; dry: the land cells to count (not lakes that were bays)
 */
function placeReport({ codes, land, dry, box, fall }) {
  const { cols, rows, cell } = box;
  const sea = land.map((v) => (v ? 0 : 1));
  const dist = chamferDistance(sea, cols, rows);
  const km = cell / 10;
  return REPORT_PLACES.map(([name, lon, lat]) => {
    const [x, y] = unitsOf(lon, lat);
    const c0 = Math.floor(x / cell) - box.col0; const r0 = Math.floor(y / cell) - box.row0;
    const radius = Math.round(15 / km);
    let cells = 0; let far = 0; /** @type {number[]} */ const ds = [];
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= cols || r >= rows || Math.hypot(c - c0, r - r0) > radius) continue;
        const i = r * cols + c;
        if (!dry[i] || codes[i] === COAST_CODE.land) continue;
        cells++; ds.push(dist[i]); far = Math.max(far, dist[i]);
      }
    }
    ds.sort((a, b) => a - b);
    const p90 = ds.length ? ds[Math.floor(ds.length * 0.9)] : 0;
    const i0 = r0 * cols + c0;
    const span = (COAST_PARAMS.today - COAST_BASE_YEAR) / 1000;
    return {
      place: name, landCellsSeaIn1219: cells, areaKm2: round(cells * km * km, 1),
      inlandCellsMax: round(far, 1), inlandKmMax: round(far * km, 1), inlandCells90: round(p90, 1), inlandKm90: round(p90 * km, 1),
      seaAboveTodayIn1219M: inBox(c0, r0, cols, rows) ? round(fall[i0] * span, 2) : null,
    };
  });
}

/** @param {number} c @param {number} r @param {number} cols @param {number} rows */
const inBox = (c, r, cols, rows) => c >= 0 && r >= 0 && c < cols && r < rows;

/**
 * The code at a place (e.g. Lake Mälaren: the year it is cut off from the sea).
 * @param {Uint8Array} codes @param {any} box @param {number} lon @param {number} lat
 */
function cellReport(codes, box, lon, lat) {
  const [x, y] = unitsOf(lon, lat);
  const c = Math.floor(x / box.cell) - box.col0; const r = Math.floor(y / box.cell) - box.row0;
  if (!inBox(c, r, box.cols, box.rows)) return { lon, lat, code: null, seaUntil: null };
  const code = codes[r * box.cols + c];
  return { lon, lat, code, landFrom: code === COAST_CODE.land ? `before ${COAST_BASE_YEAR}` : code === COAST_CODE.sea ? 'never' : COAST_BASE_YEAR + 4 * code };
}

/**
 * Jumps: how unevenly the land comes out of the sea. For each region (a 40 km square round a
 * report place), the biggest share of its changing cells that switch in one 4-year step, and in
 * one 20-year span. GEBCO's whole-metre heights make cells of one height switch together.
 * @param {{ codes: Uint8Array, land: Uint8Array, box: any }} g
 */
function jumpReport({ codes, land, box }) {
  const { cols, rows, cell } = box;
  return REPORT_PLACES.map(([name, lon, lat]) => {
    const [x, y] = unitsOf(lon, lat);
    const c0 = Math.floor(x / cell) - box.col0; const r0 = Math.floor(y / cell) - box.row0;
    const half = 40;
    const count = new Array(COAST_CODE.last + 1).fill(0);
    let total = 0;
    for (let r = r0 - half; r <= r0 + half; r++) {
      for (let c = c0 - half; c <= c0 + half; c++) {
        if (!inBox(c, r, cols, rows)) continue;
        const k = codes[r * cols + c];
        if (!land[r * cols + c] || k === COAST_CODE.land || k === COAST_CODE.sea) continue;
        count[k]++; total++;
      }
    }
    let worst = 0; let worstAt = 0; let worst20 = 0;
    for (let k = 1; k <= COAST_CODE.last; k++) {
      if (count[k] > worst) { worst = count[k]; worstAt = k; }
      let s = 0; for (let j = k; j < k + 5 && j <= COAST_CODE.last; j++) s += count[j];
      worst20 = Math.max(worst20, s);
    }
    return { place: name, changingCells: total, biggestStepShare: total ? round(worst / total, 3) : 0, biggestStepYear: COAST_BASE_YEAR + 4 * worstAt, biggest20YearShare: total ? round(worst20 / total, 3) : 0 };
  });
}

/**
 * GEBCO's 60°N seam: GMTED2010 land north of it, SRTM15+ south. Compares the low land (under 6 m)
 * in two bands 30 km either side, over the uplift zone: share of cells per whole metre, and how
 * many cells come out of the sea per century.
 * @param {{ heights: Float32Array, land: Uint8Array, fall: Float32Array, box: any }} g
 */
function seamReport({ heights, land, fall, box }) {
  const { cols, rows, cell } = box;
  const bands = { north: { lo: 60.0, hi: 60.27 }, south: { lo: 59.73, hi: 60.0 } };
  /** @type {Record<string, { cells: number, byMetre: number[], fractionalShare: number }>} */
  const out = {};
  for (const [name, b] of Object.entries(bands)) {
    const byMetre = new Array(6).fill(0); let cells = 0; let fractional = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (!land[i] || fall[i] <= 0) continue;
        const [lon, lat] = MAP.toDegrees((c + 0.5 + box.col0) * cell, (r + 0.5 + box.row0) * cell);
        if (lat < b.lo || lat >= b.hi || lon < 19 || lon > 24) continue;
        const h = heights[i];
        if (h >= 6) continue;
        cells++;
        byMetre[Math.max(0, Math.floor(h))]++;
        // How far the averaged height sits from a whole metre: low when GEBCO's land is flat steps.
        if (Math.abs(h - Math.round(h)) > 0.15) fractional++;
      }
    }
    out[name] = { cells, byMetre: byMetre.map((v) => (cells ? round(v / cells, 3) : 0)), fractionalShare: cells ? round(fractional / cells, 3) : 0 };
  }
  return out;
}

/**
 * @param {{ groups: import('./coast.mjs').FittedGroup[], checks: any[], report: any[], malaren: any, steps: any[], seam: any, changing: number }} r
 */
function printReport({ groups, checks, report, malaren, steps, seam, changing }) {
  console.log('\nFitted k per control place:');
  for (const g of groups) console.log(`  ${g.group.padEnd(14)} k = ${g.k.toFixed(3)} (${g.points.join(', ')})`);
  console.log('\nControl points (modelled sea above today, against the study):');
  for (const c of checks) console.log(`  ${c.ok ? 'ok ' : 'OFF'} ${c.id.padEnd(16)} ${c.use.padEnd(5)} AD ${c.year}: model ${c.modelM.toFixed(2)} m, study ${c.observedM} m ±${c.toleranceM} (uplift ${c.upliftMmYr}, k ${c.k})`);
  console.log('\nThe 1219 shore near each place (land cells that were sea in 1219, within 15 km):');
  for (const p of report) console.log(`  ${p.place.padEnd(18)} sea +${p.seaAboveTodayIn1219M} m; ${String(p.landCellsSeaIn1219).padStart(5)} cells (${p.areaKm2} km²); shore inland up to ${p.inlandKmMax} km (${p.inlandCellsMax} cells), 90% within ${p.inlandKm90} km (${p.inlandCells90} cells)`);
  console.log(`\nLake Mälaren (${malaren.lon}E ${malaren.lat}N): code ${malaren.code}, land or lake from ${malaren.landFrom}`);
  console.log('\nJumps (within 40 km of each place: the biggest share of its changing cells in one 4-year step, and in 20 years):');
  for (const s of steps) console.log(`  ${s.place.padEnd(18)} ${s.changingCells} cells; one step ${(s.biggestStepShare * 100).toFixed(1)}% (in ${s.biggestStepYear}); 20 years ${(s.biggest20YearShare * 100).toFixed(1)}%`);
  console.log(`\nGEBCO's 60N seam (low land under 6 m, 19-24E): north ${JSON.stringify(seam.north)}; south ${JSON.stringify(seam.south)}`);
  console.log(`\n${changing} cells of today's dry land (lakes that were bays left out) change between 1219 and today.`);
  console.log(`Level check: 1219 is level ${coastLevel(1219)}, 2021 is level ${coastLevel(2021)}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

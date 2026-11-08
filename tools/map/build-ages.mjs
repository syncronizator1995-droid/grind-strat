// @ts-check
// Builds the five ice-age maps (M3b PR 3) on the game's 1 km grid: data/raw/derived/ages-<id>.surface.u8
// (0 land, 1 water, 2 ice) and ages-<id>.cover.u8 (2 km: 0 no model yet, 1 tundra, 2 birch woodland,
// 3 pine, 4 mixed forest), and a sidecar ages-summary.json with the inputs' fingerprints, the rules'
// parameters and the checks. The rules live in tools/map/ages.mjs; tools/map/pack-ages.mjs packs the
// result into the block src/data/by-sa/ages.json.
//   node tools/map/build-ages.mjs [--fetch] [preview-dir]
//   --fetch   download SGU's four GeoPackages, DATED-1's zip and the pollen windows first (about 1.5 GB)
//
// LICENCE: CC BY-SA 4.0 (SpatioCompo's cover). It reads SGU (CC0), DATED-1 (CC BY 3.0), SpatioCompo
// (CC BY-SA 4.0) and the shipped base block's heights (public domain); never OpenStreetMap data
// (test/map-ages.test.js walks this file's imports to check).

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { decodeGrid16, unbundleBlocks } from '../../src/ui/map/codec.js';
import { AGE_BUILDS, AGES_PARAMS, bodies, COVER, coverClass, datedRingToUnits, eastOfModel, fillPolygon, floodEast, paramsSha256, SGU_CODE, SGU_DOMAIN, SURFACE, sguRingToUnits } from './ages.mjs';
import { ensureProxy, fetchWhole, loadManifest, RAW, saveManifest } from './fetch-grids.mjs';
import { rawSources } from './fetch.mjs';
import { buildPollen, MARGIN } from './build-grids.mjs';
import { encodePng } from './png.mjs';
import { openGeoPackage } from './gpkg.mjs';
import { latticePlaces, blendAll, pollenLattice } from './pollen-field.mjs';
import { DERIVED, GRID_1KM, GRID_2KM, mapWindow, writeGrid } from './resample.mjs';
import { MAP, SWEREF99TM } from './projection.mjs';
import { parseDbf, parseShp } from './shp.mjs';
import { zipFiles } from './zip.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const SUMMARY_NAME = 'ages-summary.json';
export const surfaceName = (/** @type {string} */ id) => `ages-${id}.surface.u8`;
export const coverName = (/** @type {string} */ id) => `ages-${id}.cover.u8`;

/** The source ids that end up in the block. */
export const AGES_SOURCES = Object.freeze(['sgu-shore-ages', 'dated1-ts12', 'spatiocompo-tw25', 'spatiocompo-tw23', 'spatiocompo-tw21', 'spatiocompo-tw16']);

/** The file of SGU's model that sources.json gives as the source's own url. */
const SGU_MAIN_FILE = 'strandforskjutning_11000_11900.gpkg';

/** DATED-1's TS12_mc, as read from PANGAEA's zip, and the zip itself: pinned (8 November 2026). */
export const DATED1_PINS = Object.freeze({
  zip: 'a916de31ff31b0bb63863b82d61a6be02659ecfe36a7cab0fdf00034b38be1f1',
  'TS12_mc.shp': '3c942f9afed730e1feb984f113d394a9b2ba158e01a718db6d6dc53a64c828d2',
  'TS12_mc.dbf': '7324e718d474d2925a8f62fd33df759c496e17a1f33658b823a0085db7e585f4',
  'TS12_mc.prj': 'c6b1c62133cea8a8d3af29cd3eebf3141d057b1e0e9c40609e34948521c5d601',
});

/** The ice-age labels the game shows, and the cover rules in plain words (put in the block's meta). */
export const LABELS = Object.freeze({
  water: 'Water: SGU\'s shore-displacement model (Påsse and Daniels 2015), the table nearest each age, moved onto 1 km cells. Its small modelled lakes are left out. The 100-year tables can be off by up to about 500 years.',
  ice10000: 'Ice at about 10,000 BC: DATED-1\'s most-credible ice margin at 12 thousand years ago (Hughes and others 2016), a reconstruction, not a measurement.',
  iceSgu: 'Ice at the later ages: the ice sheet of SGU\'s model, a simplified model of the melting.',
  cover10000: 'Painted by a rule, not from a pollen map: open herb and grass land with birch, juniper and willow (Stančikaitė 2006), shown as tundra.',
  cover: 'Land cover from the pollen map (SpatioCompo, gap-filled REVEALS, 1 degree cells blended smoothly) turned into four classes by a rule of ours: open land above 45% is tundra; otherwise forest, where a conifer share of 60% or more is pine; below that, where the pollen map\'s broadleaf trees are birch (9,500 and 8,500 BC), a conifer share of 35% or less is birch woodland and the rest is mixed (birch and pine); later (7,500 and 5,000 BC) broadleaf means broad-leaved forest trees and the rest is mixed forest.',
  hatch: 'Hatched "no model yet": land east of SGU\'s model for the four oldest ages (the model\'s east edge runs from about 26.2E at 55N to about 27.5E at 59N).',
  east5000: 'East of the model at about 5,000 BC the sea is a rough estimate: the Gulf of Finland carried on east at the old sea level read from SGU\'s shore (TO CHECK, error maybe 4 m). Lakes there are not drawn.',
});

/** @param {Uint8Array} bytes */
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * The SHA-256 of a big file, streamed.
 * @param {string} path
 * @returns {Promise<string>}
 */
function sha256File(path) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

/** Downloads every raw input that is not here yet (the manifest records each one's SHA-256). */
async function fetchInputs() {
  const sources = await rawSources();
  for (const id of AGES_SOURCES) {
    const s = sources.find((x) => x.id === id);
    if (!s) throw new Error(`${id} is not in tools/map/sources.json`);
    await fetchWhole(id, s.url, s.file);
    for (const f of s.files ?? []) await fetchWhole(`${id}/${f.name}`, f.url, f.file);
  }
  await saveManifest();
}

/**
 * Path and fingerprint of a raw file, checked against the manifest.
 * @param {string} key manifest key @param {string} file path under data/raw/
 */
async function checkedFile(key, file) {
  const entry = (await loadManifest())[key];
  if (!entry?.sha256) throw new Error(`${key} has not been fetched: run node tools/map/build-ages.mjs --fetch`);
  const path = join(RAW, file);
  const sum = await sha256File(path);
  if (sum !== entry.sha256) throw new Error(`${file} changed since it was fetched: fetch it again`);
  return { path, sha256: sum, bytes: entry.bytes ?? 0, url: entry.url };
}

/** Today's heights on the 2 km grid, from the shipped base block (public domain). */
async function baseHeights() {
  const block = JSON.parse(await readFile(join(ROOT, 'src/data/map/base.json'), 'utf8'));
  const layers = unbundleBlocks(new Uint8Array(inflateSync(Buffer.from(block.bundle, 'base64'))));
  const { cols, rows, data } = decodeGrid16(layers.heights);
  if (cols !== GRID_2KM.cols || rows !== GRID_2KM.rows) throw new Error('the base block\'s heights are not on the 2 km grid');
  return { cols, rows, data };
}

/** DATED-1's ice rings for 12 ka, in game units, checked against the pinned hashes. */
async function datedIce() {
  const zipFile = await checkedFile('dated1-ts12', 'dated1/DATED-1_TimeSlices_shp.zip');
  if (zipFile.sha256 !== DATED1_PINS.zip) throw new Error('DATED-1\'s zip is not the one pinned in tools/map/build-ages.mjs');
  const files = zipFiles(new Uint8Array(await readFile(zipFile.path)));
  /** @type {Record<string, Uint8Array>} */
  const got = {};
  for (const name of ['TS12_mc.shp', 'TS12_mc.dbf', 'TS12_mc.prj']) {
    const key = [...files.keys()].find((k) => k.endsWith(`/${name}`) || k === name);
    if (!key) throw new Error(`DATED-1's zip has no ${name}`);
    got[name] = /** @type {() => Uint8Array} */ (files.get(key))();
    if (sha256(got[name]) !== DATED1_PINS[/** @type {keyof typeof DATED1_PINS} */ (name)]) throw new Error(`${name} from the zip is not the pinned one`);
  }
  const dbf = parseDbf(got['TS12_mc.dbf']);
  const time = dbf.names.indexOf('AV_Time');
  if (time < 0 || dbf.rows.length === 0 || dbf.rows.some((r) => Number(r[time]) !== 12)) throw new Error('TS12_mc is not the 12 ka slice');
  const prj = new TextDecoder().decode(got['TS12_mc.prj']);
  if (!/Lambert_Azimuthal_Equal_Area/.test(prj) || !/Latitude_Of_Origin",90\.0/.test(prj) || !/Central_Meridian",0\.0/.test(prj)) throw new Error('TS12_mc is not in the north-polar Lambert projection this reader expects');
  return { records: parseShp(got['TS12_mc.shp']), zip: zipFile, hashes: Object.fromEntries(Object.entries(got).map(([k, v]) => [k, sha256(v)])) };
}

/**
 * The surface of one age: water from SGU's codes 1 and 2, ice from DATED-1 or SGU's code 5, ice
 * over water where they meet.
 * @param {import('./ages.mjs').AgeBuild} age
 * @param {{ cols: number, rows: number, cell: number }} grid
 * @param {Awaited<ReturnType<typeof datedIce>>} dated
 * @param {{ extent: { minX: number, maxX: number, minY: number, maxY: number } }} acc collects the extent of the polygons read
 */
async function surfaceOf(age, grid, dated, acc) {
  const { cols, rows, cell } = grid;
  // The first of SGU's four files is the source's main file (manifest key = its id), the others are extra files.
  const file = await checkedFile(age.file === SGU_MAIN_FILE ? 'sgu-shore-ages' : `sgu-shore-ages/${age.file}`, `sgu/${age.file}`);
  const gpkg = await openGeoPackage(file.path);
  const water = new Uint8Array(cols * rows);
  const sguIce = new Uint8Array(cols * rows);
  const counts = { sea: 0, iceLake: 0, lakeLeftOut: 0, ice: 0 };
  try {
    const table = gpkg.tables().find((t) => t.name === age.table);
    if (!table) throw new Error(`${age.file} has no table ${age.table}`);
    if (table.srsId !== 3006) throw new Error(`${age.table} is in SRS ${table.srsId}, not SWEREF 99 TM (3006)`);
    for (const f of gpkg.features(age.table, ['code'])) {
      const code = Number(f.properties.code);
      for (const poly of f.polygons) for (const ring of poly) for (let i = 0; i < ring.length; i += 2) {
        acc.extent.minX = Math.min(acc.extent.minX, ring[i]); acc.extent.maxX = Math.max(acc.extent.maxX, ring[i]);
        acc.extent.minY = Math.min(acc.extent.minY, ring[i + 1]); acc.extent.maxY = Math.max(acc.extent.maxY, ring[i + 1]);
      }
      if (code === SGU_CODE.lake) { counts.lakeLeftOut += f.polygons.length; continue; }
      if (code !== SGU_CODE.sea && code !== SGU_CODE.iceLake && code !== SGU_CODE.ice) throw new Error(`${age.table}: a polygon with code ${code}, which this build does not know`);
      for (const poly of f.polygons) {
        const rings = poly.map(sguRingToUnits);
        if (code === SGU_CODE.ice) { fillPolygon(sguIce, cols, rows, cell, rings, 1); counts.ice++; } else { fillPolygon(water, cols, rows, cell, rings, 1); if (code === SGU_CODE.sea) counts.sea++; else counts.iceLake++; }
      }
    }
  } finally {
    gpkg.close();
  }
  /** @type {Uint8Array} */
  let ice = sguIce;
  if (age.ice === 'dated1') {
    ice = new Uint8Array(cols * rows);
    for (const rec of dated.records) fillPolygon(ice, cols, rows, cell, rec.rings.map((r) => datedRingToUnits(r)), 1);
  }
  const surface = new Uint8Array(cols * rows);
  let overlap = 0;
  for (let i = 0; i < surface.length; i++) {
    if (ice[i]) { surface[i] = SURFACE.ice; if (water[i]) overlap++; } else if (water[i]) surface[i] = SURFACE.water;
  }
  return { surface, sguIce, counts, overlap, sguFile: file };
}

/**
 * Cover classes on the 2 km grid for one age.
 * @param {import('./ages.mjs').AgeBuild} age @param {Float64Array} lon @param {Float64Array} lat the 2 km cell centres
 * @param {Uint8Array} east 1 when the cell is east of the model
 */
async function coverOf(age, lon, lat, east) {
  const n = lon.length;
  const cover = new Uint8Array(n);
  if (age.cover === 'painted') {
    cover.fill(COVER.tundra);
  } else {
    const cells = await buildPollen(mapWindow(MARGIN), /** @type {any} */ (age.cover));
    let west = Infinity; let eastB = -Infinity; let south = Infinity; let north = -Infinity;
    for (let i = 0; i < n; i++) { west = Math.min(west, lon[i]); eastB = Math.max(eastB, lon[i]); south = Math.min(south, lat[i]); north = Math.max(north, lat[i]); }
    const L = pollenLattice(cells, { west, east: eastB, south, north });
    const P = latticePlaces(lon, lat, L);
    const forest = blendAll(L.forest, P);
    const share = blendAll(L.coniferShare, P);
    for (let i = 0; i < n; i++) cover[i] = coverClass(forest[i] * share[i], forest[i] * (1 - share[i]), 1 - forest[i], age.broadleaf, age.tundra);
  }
  if (age.hatchEast) for (let i = 0; i < n; i++) if (east[i]) cover[i] = COVER.none;
  return cover;
}

/** Colours of a preview (not the game's own painting). */
const PREVIEW = { ice: [244, 247, 250], water: [58, 104, 130], cover: [[120, 120, 120], [186, 184, 150], [150, 170, 104], [78, 104, 70], [108, 136, 82]] };

/**
 * A picture of one age, north up, with the hatched land striped.
 * @param {Uint8Array} surface @param {Uint8Array} cover
 */
function preview(surface, cover) {
  const { cols, rows } = GRID_1KM;
  const cc = Math.ceil(cols / 2);
  const rgb = new Uint8Array(cols * rows * 3);
  for (let r = 0; r < rows; r++) {
    const y = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const s = surface[r * cols + c];
      let col = PREVIEW.cover[cover[Math.floor(r / 2) * cc + Math.floor(c / 2)]];
      if (col === PREVIEW.cover[0] && (c + r) % 8 < 3) col = [200, 200, 200];
      if (s === SURFACE.water) col = PREVIEW.water;
      if (s === SURFACE.ice) col = PREVIEW.ice;
      rgb.set(col, (y * cols + c) * 3);
    }
  }
  return encodePng(cols, rows, rgb);
}

async function main() {
  ensureProxy();
  const args = process.argv.slice(2);
  if (args.includes('--fetch')) await fetchInputs();
  const previews = args.find((a) => !a.startsWith('--')) ?? join(DERIVED, 'previews');
  const started = Date.now();
  const lap = (/** @type {string} */ what) => console.log(`${what} at ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const grid = GRID_1KM;
  const { cols, rows } = grid;
  const cCols = Math.ceil(cols / 2); const cRows = Math.ceil(rows / 2);
  const heights = await baseHeights();
  const dated = await datedIce();
  lap('inputs checked');

  // Where each 1 km and 2 km cell is: east of the model or not.
  const east1 = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const [lon, lat] = MAP.toDegrees((c + 0.5) * grid.cell, (r + 0.5) * grid.cell); east1[r * cols + c] = eastOfModel(lon, lat) ? 1 : 0; }
  const lon2 = new Float64Array(cCols * cRows); const lat2 = new Float64Array(cCols * cRows); const east2 = new Uint8Array(cCols * cRows);
  for (let r = 0; r < cRows; r++) for (let c = 0; c < cCols; c++) {
    const [lon, lat] = MAP.toDegrees((c + 0.5) * grid.cell * 2, (r + 0.5) * grid.cell * 2);
    lon2[r * cCols + c] = lon; lat2[r * cCols + c] = lat; east2[r * cCols + c] = eastOfModel(lon, lat) ? 1 : 0;
  }
  const heightAt = (/** @type {number} */ c, /** @type {number} */ r) => heights.data[Math.min(heights.rows - 1, r >> 1) * heights.cols + Math.min(heights.cols - 1, c >> 1)];
  lap('cell positions');

  await mkdir(previews, { recursive: true });
  const acc = { extent: { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity } };
  /** @type {Record<string, any>} */
  const ages = {};
  for (const age of AGE_BUILDS) {
    const { surface, sguIce, counts, overlap, sguFile } = await surfaceOf(age, grid, dated, acc);
    /** @type {Record<string, unknown> | null} */
    let estimate = null;
    if (!age.hatchEast) {
      // The Gulf of Finland within eastShoreBandKm of the model's edge: its south shore sets the old
      // sea level; the sea is carried east no further than eastReachKm.
      const gulf = new Uint8Array(cols * rows);
      const reach = new Uint8Array(cols * rows);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const [lon, lat] = MAP.toDegrees((c + 0.5) * grid.cell, (r + 0.5) * grid.cell);
        const away = SWEREF99TM.forward(lon, lat)[0] - SGU_DOMAIN.maxX; // metres east of the edge (negative: inside)
        if (lat > 58.5 && away < 0 && -away < AGES_PARAMS.eastShoreBandKm * 1000) gulf[r * cols + c] = 1;
        if (away > 0 && away < AGES_PARAMS.eastReachKm * 1000) reach[r * cols + c] = 1;
      }
      estimate = floodEast({ cols, rows, surface, east: reach, gulf, height: heightAt });
    }
    const cover = await coverOf(age, lon2, lat2, east2);
    let water = 0; let ice = 0; let hatched = 0;
    for (let i = 0; i < surface.length; i++) { if (surface[i] === SURFACE.water) water++; else if (surface[i] === SURFACE.ice) ice++; }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (surface[r * cols + c] === SURFACE.land && cover[(r >> 1) * cCols + (c >> 1)] === COVER.none) hatched++;
    const coverCounts = [0, 0, 0, 0, 0];
    for (const v of cover) coverCounts[v]++;
    const wb = bodies(surface.map((v) => (v === SURFACE.water ? 1 : 0)), cols, rows);
    let sguIceNotDated = 0;
    if (age.ice === 'dated1') for (let i = 0; i < surface.length; i++) if (sguIce[i] && surface[i] !== SURFACE.ice) sguIceNotDated++;
    await writeGrid(surfaceName(age.id), surface, { type: 'u8 cols x rows, row 0 south: 0 land, 1 water, 2 ice', cols, rows, cell: grid.cell, age: age.id });
    await writeGrid(coverName(age.id), cover, { type: 'u8 ceil(cols/2) x ceil(rows/2), row 0 south: 0 no model yet, 1 tundra, 2 birch woodland, 3 pine, 4 mixed forest', cols: cCols, rows: cRows, cell: grid.cell * 2, age: age.id });
    await writeFile(join(previews, `ages-${age.id}.png`), preview(surface, cover));
    ages[age.id] = {
      year: age.year, stage: age.stage, table: age.table, file: age.file, calBp: age.calBp, ice: age.ice, cover: age.cover,
      sgu: { sha256: sguFile.sha256, bytes: sguFile.bytes, url: sguFile.url, polygons: counts },
      cells: { water, ice, land: surface.length - water - ice, hatchedLand: hatched },
      coverCells: { none: coverCounts[0], tundra: coverCounts[1], birch: coverCounts[2], pine: coverCounts[3], mixed: coverCounts[4] },
      iceOverWater: overlap, sguIceWithoutDatedIce: sguIceNotDated,
      waterBodies: { count: wb.sizes.length, largest: [...wb.sizes].sort((a, b) => b - a).slice(0, 6) },
      estimateEast: estimate,
      surfaceSha256: sha256(surface), coverSha256: sha256(cover),
    };
    lap(`${age.id}: water ${water}, ice ${ice}, hatched land ${hatched}${estimate ? `, east sea level ${estimate.level} m, flooded ${estimate.flooded}` : ''}`);
  }
  const e = acc.extent;
  const off = Math.max(Math.abs(e.minX - SGU_DOMAIN.minX), Math.abs(e.maxX - SGU_DOMAIN.maxX), Math.abs(e.minY - SGU_DOMAIN.minY), Math.abs(e.maxY - SGU_DOMAIN.maxY));
  if (off > 1) throw new Error(`SGU's polygons no longer stop at the model rectangle in ages.mjs (off by ${off.toFixed(2)} m): ${JSON.stringify(e)}`);
  const summary = {
    about: 'Derived by tools/map/build-ages.mjs (the five ice-age maps of M3b PR 3).',
    grid: { cols, rows, cell: grid.cell }, params: AGES_PARAMS, paramsSha256: paramsSha256(),
    sources: [...AGES_SOURCES],
    dated1: { zipSha256: dated.zip.sha256, zipUrl: dated.zip.url, files: dated.hashes, slice: 'TS12_mc (12 ka, most credible)' },
    sguDomain: SGU_DOMAIN, sguPolygonExtent: e,
    pollen: Object.fromEntries(await Promise.all(AGE_BUILDS.filter((a) => a.cover !== 'painted').map(async (a) => [a.cover, (await loadManifest())[a.cover]?.sha256]))),
    ages,
  };
  await writeFile(join(DERIVED, SUMMARY_NAME), `${JSON.stringify(summary, null, 2)}\n`);
  lap('done');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => { console.error(err instanceof Error ? err.stack : err); process.exit(1); });
}

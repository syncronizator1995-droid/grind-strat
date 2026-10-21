// @ts-check
// Builds the derived data grids that the 1219 map is made from, into data/raw/derived/ (git
// ignores it; the next map steps read them):
//   heights-2km.i16      GEBCO_2026 heights and depths, 2 km cells          (grid-heights.mjs)
//   worldcover-1km.u8    ESA WorldCover 2021 class shares, 1 km cells        (grid-cover.mjs)
//   marsh-raw-1km.u8     GLWD v2 marsh and bog share, 1 km cells             (grid-cover.mjs)
//   marsh-1km.u8         marsh around 1219, "bogs stand out", 1 km cells     (grid-cover.mjs)
//   spatiocompo-tw4.json pollen-based forest shares about AD 750-1250, 1 degree cells
//   spatiocompo-tw3/2/1.json  the same for about AD 1250-1600, 1600-1850 and 1850-1950 (M3a)
// Each has a .json sidecar saying what it is and where it came from. Remote rasters are read by
// range and cached in data/raw/cache/, so a second run downloads nothing.
//   node tools/map/build-grids.mjs                 build everything
//   node tools/map/build-grids.mjs heights marsh   only some (marsh needs worldcover built)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureProxy, saveManifest, traffic } from './fetch-grids.mjs';
import { readRaw } from './fetch.mjs';
import { buildMarsh, buildWorldCover, marshChecks } from './grid-cover.mjs';
import { buildHeights, heightChecks } from './grid-heights.mjs';
import { inputRecord } from './grid-sources.mjs';
import { cornerLattice, DERIVED, GRID_1KM, GRID_2KM, mapWindow } from './resample.mjs';

/** Degrees of margin round the map rectangle, so edge cells have data on every side. */
export const MARGIN = 0.3;

/**
 * The pollen map's time windows the game uses, by source id (tools/map/sources.json names each
 * one's CSV). The windows are Githumbi et al. (2022)'s: present-100, 100-350, 350-700 and
 * 700-1200 years BP (BP = AD 1950); see data/sources.md.
 */
export const POLLEN_WINDOWS = Object.freeze({
  'spatiocompo-tw4': Object.freeze({ timeWindow: 4, years: 'about AD 750-1250 (700-1200 BP)' }),
  'spatiocompo-tw3': Object.freeze({ timeWindow: 3, years: 'about AD 1250-1600 (350-700 BP)' }),
  'spatiocompo-tw2': Object.freeze({ timeWindow: 2, years: 'about AD 1600-1850 (100-350 BP)' }),
  'spatiocompo-tw1': Object.freeze({ timeWindow: 1, years: 'about AD 1850-1950 (0-100 BP)' }),
});

/**
 * <id>.json: every 1 degree cell of one window of the pollen map that touches the map window,
 * as it is.
 * @param {import('./grid-sources.mjs').Box} window
 * @param {keyof typeof POLLEN_WINDOWS} [id] which time window (default: the 1219 one)
 */
export async function buildPollen(window, id = 'spatiocompo-tw4') {
  const tw = POLLEN_WINDOWS[id];
  if (!tw) throw new Error(`unknown pollen window ${id}: choose from ${Object.keys(POLLEN_WINDOWS).join(', ')}`);
  const raw = await readRaw(id);
  const csvName = raw.source.file.split('/').pop();
  const csv = raw.data.toString('utf8');
  const { header, cells } = parsePollenCsv(csv);
  const inWindow = cells.filter((c) => c.lon + 0.5 > window.west && c.lon - 0.5 < window.east && c.lat + 0.5 > window.south && c.lat - 0.5 < window.north);
  // Which 1 degree cells inside the window the map has no value for (sea, or beyond its reach).
  const have = new Set(inWindow.map((c) => `${c.lon},${c.lat}`));
  const absent = [];
  for (let lat = Math.floor(window.south) + 0.5; lat < window.north; lat++) {
    for (let lon = Math.floor(window.west) + 0.5; lon < window.east; lon++) if (!have.has(`${lon},${lat}`)) absent.push([lon, lat]);
  }
  await mkdir(DERIVED, { recursive: true });
  const commit = /\/([0-9a-f]{40})\//.exec(raw.source.url)?.[1];
  await writeFile(join(DERIVED, `${id}.json`), `${JSON.stringify(inWindow)}\n`);
  await writeFile(join(DERIVED, `${id}.json.json`), `${JSON.stringify({
    file: `${id}.json`,
    type: 'json: [{ lon, lat, conifer, broadleaf, open }], one per 1 degree cell; lon/lat is the cell centre',
    unit: 'fractions 0-1 of the cell (the CSV\'s own units), conifer + broadleaf + open = 1',
    columns: { lon: header[0], lat: header[1], conifer: header[2], broadleaf: header[3], open: header[4] },
    sources: [id],
    commit,
    inputs: [await inputRecord(id), await inputRecord(`${id}/README.md`), await inputRecord(`${id}/LICENSE`)],
    params: { timeWindow: tw.timeWindow, years: tw.years, csv: csvName, blended: false, window },
    notes: `${inWindow.length} cells touch the window. No value for ${absent.length} cells inside it (mostly sea): ${absent.map(([a, b]) => `${a},${b}`).join(' ')}`,
  }, null, 2)}\n`);
  return inWindow;
}

/**
 * Reads the SpatioCompo CSV: Lon, Lat, then the conifer (C_), broadleaf (B_) and unforested (U_)
 * columns.
 * @param {string} csv
 */
export function parsePollenCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(',').map((s) => s.replace(/"/g, '').trim());
  const col = (/** @type {string} */ prefix) => {
    const k = header.findIndex((h) => h.startsWith(prefix));
    if (k < 0) throw new Error(`pollen CSV has no ${prefix} column: ${header.join(', ')}`);
    return k;
  };
  const k = [col('Lon'), col('Lat'), col('C_'), col('B_'), col('U_')];
  const cells = lines.slice(1).map((line) => {
    const v = line.split(',').map((s) => Number(s.replace(/"/g, '')));
    return { lon: v[k[0]], lat: v[k[1]], conifer: v[k[2]], broadleaf: v[k[3]], open: v[k[4]] };
  });
  return { header: k.map((i) => header[i]), cells };
}

async function main() {
  ensureProxy();
  const started = Date.now();
  const all = ['heights', 'worldcover', 'marsh', 'pollen'];
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : all;
  for (const w of wanted) if (!all.includes(w)) throw new Error(`unknown grid ${w}: choose from ${all.join(', ')}`);
  const window = mapWindow(MARGIN);
  console.log(`read window ${window.west.toFixed(2)}-${window.east.toFixed(2)}E, ${window.south.toFixed(2)}-${window.north.toFixed(2)}N`);
  const L1 = cornerLattice(GRID_1KM);

  if (wanted.includes('heights')) {
    const L2 = cornerLattice(GRID_2KM);
    heightChecks(GRID_2KM, await buildHeights(L2, window));
    lap('heights', started);
  }
  /** @type {Uint8Array | null} */
  let cover = null;
  if (wanted.includes('worldcover')) {
    cover = (await buildWorldCover(L1, window)).percent;
    lap('worldcover', started);
  }
  if (wanted.includes('marsh')) {
    cover ??= new Uint8Array(await readFile(join(DERIVED, 'worldcover-1km.u8')));
    const { raw, marsh } = await buildMarsh(L1, window, cover);
    const pass = marshChecks(GRID_1KM, raw, marsh, cover);
    if (!pass) console.log('Some marsh checks did not pass: see the table.');
    lap('marsh', started);
  }
  if (wanted.includes('pollen')) {
    for (const id of /** @type {(keyof typeof POLLEN_WINDOWS)[]} */ (Object.keys(POLLEN_WINDOWS))) {
      const cells = await buildPollen(window, id);
      console.log(`pollen ${id}: ${cells.length} cells`);
    }
  }
  await saveManifest();
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(0)} s; downloaded ${(traffic.bytes / 1048576).toFixed(1)} MB in ${traffic.requests} requests this run.`);
}

/** @param {string} what @param {number} since */
function lap(what, since) {
  console.log(`${what} done at ${((Date.now() - since) / 1000).toFixed(0)} s, ${(traffic.bytes / 1048576).toFixed(1)} MB downloaded so far`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

// @ts-check
// The 1 km land-cover grids:
//   worldcover-1km.u8   today's land cover (ESA WorldCover 2021), the share of each class per cell
//   marsh-raw-1km.u8    GLWD v2 marsh and bog share, area-averaged
//   marsh-1km.u8        marsh around 1219 by the "bogs stand out" rule (marsh.mjs)

import { bestBlock, blockMean, discMean, fmtPlace, table } from './grid-checks.mjs';
import { inputRecord, openRemoteTiff, readBox, sourceEntry } from './grid-sources.mjs';
import { MARSH_CLASSES, MARSH_COVER_PLANES, MARSH_PARAMS, marshShare } from './marsh.mjs';
import { areaAverage, bilinear, cellsCovering, countsToPercent, forEachSample, writeGrid } from './resample.mjs';

/** WorldCover planes, in file order, and the WorldCover classes that go into each. */
export const COVER_PLANES = Object.freeze([
  { name: 'tree', classes: [10] },
  { name: 'shrub', classes: [20] },
  { name: 'grass', classes: [30] },
  { name: 'crop', classes: [40] },
  { name: 'built', classes: [50] },
  { name: 'bare', classes: [60, 70] }, // snow and ice folded into bare
  { name: 'water', classes: [80] },
  { name: 'wetland', classes: [90, 95] }, // herbaceous wetland (mangrove folded in; none here)
  // Moss and lichen. Not Baltic bog: on this map it is almost all mountain tundra in Norway and
  // Sweden (82% of it above 900 m, almost none below 300 m), so the marsh rule leaves it out.
  // Baltic open bogs come in as class 90.
  { name: 'moss', classes: [100] },
]);

/** 10 x 10 samples per 1 km cell (100 m apart): each sample is one percent. */
const COVER_SAMPLES = 10;
/** The WorldCover overview to read: about 74 m pixels (1/1500 degree). */
const COVER_PIXEL_DEG = 1 / 1500;
/** Samples per side for GLWD (167 m apart; GLWD cells are about 460 x 250 m here). */
const MARSH_SAMPLES = 6;

/**
 * A progress line: rewritten in place on a terminal, only the last one in a log.
 * @param {string} text @param {boolean} [done]
 */
function progress(text, done = false) {
  if (process.stdout.isTTY) process.stdout.write(`\r${text}${done ? '\n' : ''}`);
  else if (done) console.log(text);
}

/** @param {number} n @param {number} w */
const pad = (n, w) => String(Math.abs(n)).padStart(w, '0');

/** WorldCover's tile name for the 3 x 3 degree tile whose south-west corner is lat, lon. @param {number} lat @param {number} lon */
export const coverTileName = (lat, lon) => `${lat < 0 ? 'S' : 'N'}${pad(lat, 2)}${lon < 0 ? 'W' : 'E'}${pad(lon, 3)}`;

/**
 * Builds worldcover-1km.u8, reading the tiles one at a time. Every 3 x 3 degree tile in the
 * window exists on ESA's server (55 of 55 in October 2026), so a missing tile means a fetch
 * problem, not open sea: the build stops rather than leave a 3 x 3 degree hole of "no data".
 * @param {import('./resample.mjs').Lattice} L the 1 km lattice @param {import('./grid-sources.mjs').Box} window
 */
export async function buildWorldCover(L, window) {
  const src = await sourceEntry('worldcover-2021');
  const { cols, rows } = L.grid;
  const cells = cols * rows;
  const planes = COVER_PLANES.length;
  const planeOf = new Int8Array(256).fill(-1);
  COVER_PLANES.forEach((p, k) => { for (const c of p.classes) planeOf[c] = k; });
  const counts = new Uint8Array(planes * cells);
  /** @type {string[]} */ const used = [];
  for (let lat = Math.floor(window.south / 3) * 3; lat < window.north; lat += 3) {
    for (let lon = Math.floor(window.west / 3) * 3; lon < window.east; lon += 3) {
      const name = coverTileName(lat, lon);
      const remote = await openRemoteTiff(`worldcover-2021/${name}`, src.url.replace('{tile}', name));
      if (!remote) throw new Error(`WorldCover tile ${name} is not on the server (HTTP 404). Every tile in the window existed when this was written: check the url in sources.json.`);
      used.push(name);
      const tile = { west: lon, east: lon + 3, south: lat, north: lat + 3 };
      await countTile(L, remote.tiff, tile, window, counts, planeOf);
      progress(`worldcover: ${used.length} tiles read`);
    }
  }
  progress(`worldcover: ${used.length} tiles read`, true);
  const percent = countsToPercent(counts, planes, cells);
  let noData = 0;
  for (let i = 0; i < cells; i++) {
    let s = 0;
    for (let p = 0; p < planes; p++) s += percent[p * cells + i];
    if (!s) noData++;
  }
  await writeGrid('worldcover-1km.u8', percent, {
    cols, rows, cell: L.grid.cell, rowOrder: 'south-first', type: 'uint8', unit: 'percent of the cell',
    layout: 'planar: plane p of cell i is at p * cols * rows + i',
    planes: COVER_PLANES.map((p) => ({ name: p.name, worldcoverClasses: p.classes })),
    sources: ['worldcover-2021'],
    inputs: await Promise.all(used.map((n) => inputRecord(`worldcover-2021/${n}`))),
    params: { overviewPixelDegrees: COVER_PIXEL_DEG, samplesPerCell: COVER_SAMPLES * COVER_SAMPLES, sampling: 'nearest pixel', tilesRead: used },
    notes: `Each cell's planes add up to exactly 100 where WorldCover has data. ${noData} cells have no WorldCover data at all (open sea that the tiles leave as no data); all their planes are 0. Every tile in the window was read. Cells only partly covered are shares of the covered part.`,
  });
  return { percent, noData, used };
}

/**
 * Adds one tile's samples to the counts. Each sample point belongs to exactly one tile (west
 * and south edges inclusive), so no sample is counted twice.
 * @param {import('./resample.mjs').Lattice} L @param {Awaited<ReturnType<typeof import('./tiff.mjs').openTiff>>} tiff
 * @param {import('./grid-sources.mjs').Box} tile @param {import('./grid-sources.mjs').Box} window
 * @param {Uint8Array} counts @param {Int8Array} planeOf
 */
async function countTile(L, tiff, tile, window, counts, planeOf) {
  const image = tiff.images.reduce((a, b) => (Math.abs((b.geo?.dx ?? 1) - COVER_PIXEL_DEG) < Math.abs((a.geo?.dx ?? 1) - COVER_PIXEL_DEG) ? b : a));
  const box = { west: Math.max(tile.west, window.west), east: Math.min(tile.east, window.east), south: Math.max(tile.south, window.south), north: Math.min(tile.north, window.north) };
  const R = await readBox(tiff, image, box, 0);
  const { values, width, height, west, north, dx, dy } = R;
  const { cols, rows } = L.grid;
  const cells = cols * rows;
  const range = cellsCovering(L.grid, box);
  let cellIndex = 0;
  const visit = (/** @type {number} */ lon, /** @type {number} */ lat) => {
    if (lon < tile.west || lon >= tile.east || lat < tile.south || lat >= tile.north) return;
    const x = Math.floor((lon - west) / dx);
    const y = Math.floor((north - lat) / dy);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = planeOf[values[y * width + x]];
    if (p >= 0) counts[p * cells + cellIndex]++;
  };
  for (let r = range.r0; r <= range.r1; r++) {
    for (let c = range.c0; c <= range.c1; c++) {
      cellIndex = r * cols + c;
      forEachSample(L, c, r, COVER_SAMPLES, visit);
    }
  }
}

/**
 * Today's open wetland share of every cell, as the marsh rule counts it: the sum of the
 * MARSH_COVER_PLANES (herbaceous wetland only; moss and lichen is mountain tundra here).
 * @param {Uint8Array} cover worldcover-1km planes @param {number} cells cells per plane
 */
export function openWetland(cover, cells) {
  const out = new Uint8Array(cells);
  for (const name of MARSH_COVER_PLANES) {
    const p = COVER_PLANES.findIndex((q) => q.name === name);
    if (p < 0) throw new Error(`marsh: no WorldCover plane called ${name}`);
    for (let i = 0; i < cells; i++) out[i] = Math.min(100, out[i] + cover[p * cells + i]);
  }
  return out;
}

/**
 * Builds marsh-raw-1km.u8 (GLWD) and marsh-1km.u8 (the 1219 rule).
 * @param {import('./resample.mjs').Lattice} L the 1 km lattice @param {import('./grid-sources.mjs').Box} window
 * @param {Uint8Array} cover worldcover-1km planes
 */
export async function buildMarsh(L, window, cover) {
  const src = await sourceEntry('glwd-v2');
  const { cols, rows, cell } = L.grid;
  const cells = cols * rows;
  /** @type {Uint16Array | null} */ let sum = null;
  /** @type {Omit<import('./resample.mjs').Raster, 'values'> | null} */ let frame = null;
  const keys = [];
  for (const cls of MARSH_CLASSES) {
    const nn = String(cls).padStart(2, '0');
    const key = `glwd-v2/GLWD_v2_0_class_${nn}_pct.tif`;
    const remote = await openRemoteTiff(key, src.url.replace('{NN}', nn));
    if (!remote) throw new Error(`GLWD class ${nn} is missing on the server`);
    keys.push(key);
    const R = await readBox(remote.tiff, remote.tiff.images[0], window);
    if (!sum || !frame) {
      sum = new Uint16Array(R.width * R.height);
      frame = { width: R.width, height: R.height, west: R.west, north: R.north, dx: R.dx, dy: R.dy };
    } else if (R.width !== frame.width || R.height !== frame.height || Math.abs(R.west - frame.west) > 1e-9 || Math.abs(R.north - frame.north) > 1e-9) {
      throw new Error(`GLWD class ${nn} is on a different grid from class 08`);
    }
    // 255 is GLWD's no data (the sea): no marsh there.
    for (let i = 0; i < sum.length; i++) { const v = R.values[i]; if (v <= 100) sum[i] += v; }
    progress(`glwd: class ${nn} read`);
  }
  progress(`glwd: ${keys.length} classes read`, true);
  if (!sum || !frame) throw new Error('no GLWD classes');
  const capped = new Uint8Array(sum.length);
  for (let i = 0; i < sum.length; i++) capped[i] = Math.min(100, sum[i]);
  const avg = areaAverage(L, MARSH_SAMPLES, bilinear({ ...frame, values: capped, noData: null }));
  const raw = new Uint8Array(cells);
  for (let i = 0; i < cells; i++) raw[i] = Math.round(avg[i] === avg[i] ? avg[i] : 0);

  const open = openWetland(cover, cells);
  const marsh = new Uint8Array(cells);
  for (let i = 0; i < cells; i++) marsh[i] = marshShare(raw[i], open[i]);

  const inputs = await Promise.all(keys.map((k) => inputRecord(k)));
  const base = { cols, rows, cell, rowOrder: 'south-first', type: 'uint8', unit: 'percent of the cell' };
  await writeGrid('marsh-raw-1km.u8', raw, {
    ...base, sources: ['glwd-v2'], inputs,
    params: { glwdClasses: MARSH_CLASSES, samplesPerCell: MARSH_SAMPLES * MARSH_SAMPLES, interpolation: 'bilinear', window },
    notes: 'GLWD v2 share of each 15 arc-second cell in the listed classes, added up and capped at 100, then averaged over each 1 km cell. GLWD no data (255, the sea) counts as 0. Derived data only: raw GLWD is never committed.',
  });
  await writeGrid('marsh-1km.u8', marsh, {
    ...base, sources: ['glwd-v2', 'worldcover-2021'], inputs: [...inputs, { derivedFrom: `worldcover-1km.u8 (plane ${MARSH_COVER_PLANES.join(' + ')}: WorldCover class 90)` }],
    params: { rule: 'max(stretch(marshRaw), worldcoverWetland)', worldcoverPlanes: MARSH_COVER_PLANES, worldcoverLeftOut: 'moss (class 100): mountain tundra on this map, not bog', stretch: 'raw <= floor: 0; else min(100, (raw - floor) / (full - floor) * 100)', ...MARSH_PARAMS },
    notes: '"Bogs stand out" (Ignas, 6 October 2026): the thin GLWD background is dropped, bog cores stretched towards 100, and today\'s open herbaceous wetland from WorldCover (class 90, which certainly existed in 1219) is kept wherever it is larger. WorldCover moss and lichen (class 100) is left out: here it is mountain tundra, not bog.',
  });
  return { raw, marsh };
}

/** Famous bogs that must read as mostly marsh, and old farmland that must read near 0. */
const BOGS = /** @type {const} */ ([
  ['Cepkeliai', 24.50, 54.00, ''],
  ['Great Kemeri Bog', 23.47, 56.95, ''],
  ['Soomaa', 25.03, 58.43, ''],
  ['Teici', 26.40, 56.62, ''],
  ['Endla', 26.18, 58.87, ''],
  ['Yelnia', 27.88, 55.55, ''],
  ['Biebrza marshes', 22.65, 53.50, ''],
  ['Kurtuvenai/Tytuvenai bogs', 23.20, 55.60, 'coords TO CHECK'],
  ['Lake Lubans wetlands', 26.90, 56.80, ''],
]);
const FARMLAND = /** @type {const} */ ([
  ['Zemgale plain (Bauska)', 24.20, 56.40],
  ['Kuyavia plain', 18.40, 52.70],
  ['Uppland', 17.60, 59.85],
  ['Nevezis plain (Panevezys)', 24.35, 55.73],
]);

/**
 * Prints the bog and farmland table and says whether each passes.
 * @param {import('./resample.mjs').Grid} grid @param {Uint8Array} raw @param {Uint8Array} marsh @param {Uint8Array} cover
 */
export function marshChecks(grid, raw, marsh, cover) {
  const cells = grid.cols * grid.rows;
  const open = openWetland(cover, cells);
  const at = (/** @type {Uint8Array} */ v, /** @type {{ c: number, r: number }} */ b) => Math.round(blockMean(grid, v, b.c, b.r, 3));
  const rows = [];
  let pass = true;
  for (const [name, lon, lat, note] of BOGS) {
    const b = bestBlock(grid, marsh, lon, lat, 10, 3, 'max');
    const ok = b.value >= 60;
    pass &&= ok;
    rows.push([name, fmtPlace(lat, lon), `${fmtPlace(b.lat, b.lon)} (${b.km.toFixed(0)} km)`, at(raw, b), at(open, b), Math.round(b.value), ok ? 'ok (>= 60)' : 'LOW', note]);
  }
  for (const [name, lon, lat] of FARMLAND) {
    const b = bestBlock(grid, marsh, lon, lat, 0, 3, 'max'); // the block on the point itself
    const disc = discMean(grid, marsh, lon, lat, 10);
    const ok = b.value <= 5 && disc <= 10;
    pass &&= ok;
    rows.push([name, fmtPlace(lat, lon), `on the point; 10 km disc mean ${disc.toFixed(1)}`, at(raw, b), at(open, b), Math.round(b.value), ok ? 'ok (near 0)' : 'HIGH', '']);
  }
  console.log(`\nMarsh checks (1 km cells; bogs: the best 3 x 3 km block within 10 km of the given point; farmland: the 3 x 3 km block on the point, and the mean of all cells within 10 km):\n${table(['place', 'given at', 'block used', 'GLWD raw %', 'WorldCover wetland (class 90) %', 'marsh %', 'check', 'note'], rows)}`);
  return pass;
}


// @ts-check
// heights-2km.i16: GEBCO_2026 heights and sea depths, area-averaged over the 2 km cells.
// Metres above sea level; sea depth is negative; lakes keep their surface height (GEBCO has no
// lake floors here).

import { bestBlock, cellAt, cellCentre, discMean, floodFill, fmtPlace, table } from './grid-checks.mjs';
import { inputRecord, int16Hash, openRemoteTiff, readBox, sourceEntry } from './grid-sources.mjs';
import { areaAverage, bilinear, writeGrid } from './resample.mjs';

/** Samples per side of each 2 km cell: 250 m apart, finer than GEBCO's 460 x 250 m cells. */
const SAMPLES = 8;

/**
 * The manifest key (and cache folder) of a GEBCO file: its file name, without any query.
 * @param {string} url
 */
export const gebcoKey = (url) => `gebco-2026/${new URL(url).pathname.split('/').pop()}`;

/**
 * Opens the official GEBCO tile, or the fallback copy if the official one is gone (404). The
 * two were compared cell by cell over the map window (compare-gebco.mjs) and agree.
 */
async function openGebco() {
  const src = await sourceEntry('gebco-2026');
  const official = await openRemoteTiff(gebcoKey(src.url), src.url, { maxChunk: src.maxRangeBytes });
  if (official) return official;
  if (!src.fallback) throw new Error(`GEBCO is missing at ${src.url}`);
  console.log(`GEBCO is missing at ${src.url}: reading the fallback copy`);
  const copy = await openRemoteTiff(gebcoKey(src.fallback.url), src.fallback.url, { maxChunk: src.fallback.maxRangeBytes });
  if (!copy) throw new Error(`GEBCO is missing at ${src.url} and at ${src.fallback.url}`);
  return copy;
}

/**
 * @param {import('./resample.mjs').Lattice} L the 2 km lattice
 * @param {import('./grid-sources.mjs').Box} window
 */
export async function buildHeights(L, window) {
  const { key, tiff } = await openGebco();
  const image = tiff.images[0]; // full 15 arc-second resolution
  const raster = await readBox(tiff, image, window);
  const avg = areaAverage(L, SAMPLES, bilinear(raster));
  const { cols, rows, cell } = L.grid;
  const heights = new Int16Array(cols * rows);
  let empty = 0;
  for (let i = 0; i < avg.length; i++) {
    if (!(avg[i] === avg[i])) empty++;
    heights[i] = Math.round(avg[i]);
  }
  if (empty) throw new Error(`heights: ${empty} cells got no GEBCO data: the read window is too small`);
  await writeGrid('heights-2km.i16', heights, {
    cols, rows, cell, rowOrder: 'south-first', type: 'int16', unit: 'metres above sea level (sea depth negative)',
    sources: ['gebco-2026'],
    inputs: [await inputRecord(key)],
    params: { image: 'full resolution (15 arc-seconds)', samplesPerCell: SAMPLES * SAMPLES, interpolation: 'bilinear', window, readPixels: [raster.width, raster.height],
      readPixelsSha256: raster.values instanceof Int16Array ? int16Hash(raster.values) : null },
    notes: 'Each 2 km cell is the mean of an 8 x 8 lattice of bilinear GEBCO reads spread evenly over the cell (an equal-area average). Lakes hold their surface height, as in GEBCO.',
  });
  return heights;
}

/** Places to check heights against: [name, lon, lat, search radius km, 'max' or 'min', what to expect]. */
const SPOTS = /** @type {const} */ ([
  ['Sniezka, Sudetes', 15.74, 50.74, 10, 'max', 'several hundred to about 1500 m (peak 1603 m)'],
  ['Suur Munamagi', 27.07, 57.71, 6, 'max', 'peak 318 m'],
  ['Gaizinkalns', 25.97, 56.87, 6, 'max', 'peak 312 m'],
  ['Landsort Deep', 18.07, 58.63, 25, 'min', 'about -400 m (deepest point -459 m)'],
  ['Gotland Deep', 20.08, 57.30, 30, 'min', 'about -230 m (deepest point -249 m)'],
]);

/** Lakes: GEBCO should hold their surface height. [name, lon, lat, surface m]. */
const LAKES = /** @type {const} */ ([
  ['Lake Peipus', 27.5, 58.7, 30],
  ['Lake Ladoga', 31.5, 60.8, 5],
  ['Lake Vanern', 13.3, 58.9, 44],
  ['Lake Vattern', 14.55, 58.3, 88],
]);

/**
 * Prints the height checks.
 * @param {import('./resample.mjs').Grid} grid @param {Int16Array} h
 */
export function heightChecks(grid, h) {
  const rows = SPOTS.map(([name, lon, lat, km, mode, expect]) => {
    const b = bestBlock(grid, h, lon, lat, km, 1, mode);
    return [name, fmtPlace(lat, lon), `${mode} within ${km} km`, `${Math.round(b.value)} m`, `${fmtPlace(b.lat, b.lon)} (${b.km.toFixed(0)} km off)`, expect];
  });
  for (const [name, lon, lat, surface] of LAKES) {
    rows.push([name, fmtPlace(lat, lon), 'mean within 5 km', `${Math.round(discMean(grid, h, lon, lat, 5))} m`, '', `surface about ${surface} m`]);
  }
  const baltic = balticMeanDepth(grid, h);
  rows.push(['Baltic Sea mean depth', '', `${baltic.cells} sea cells`, `${baltic.mean.toFixed(1)} m`, '', 'about -55 m (incl. Kattegat)']);
  console.log(`\nHeights (2 km cells, GEBCO_2026):\n${table(['place', 'given at', 'search', 'grid', 'best cell', 'expect'], rows)}`);
}

/**
 * The mean of Baltic sea cells: every sea cell joined by sea to the Gotland Deep, stopping at
 * the Skagerrak (the line from Skagen) so the North Sea is not counted.
 * @param {import('./resample.mjs').Grid} grid @param {Int16Array} h
 */
function balticMeanDepth(grid, h) {
  const { c, r } = cellAt(grid, 20.08, 57.30);
  const reached = floodFill(grid, r * grid.cols + c, (i) => {
    if (h[i] >= 0) return false;
    const [lon, lat] = cellCentre(grid, i % grid.cols, Math.floor(i / grid.cols));
    return !(lat > 57.3 && lon < 10.6) && lon > 9.2; // west of Skagen, or west of Jutland: North Sea
  });
  let s = 0; let n = 0;
  for (let i = 0; i < h.length; i++) if (reached[i]) { s += h[i]; n++; }
  return { mean: s / n, cells: n };
}

// @ts-check
// Sanity checks on the derived grids against places whose heights, depths or wetness are known:
// printed as tables after a build, so a person can see at a glance whether the data is right.
// Coordinates of the places are approximate, so each check searches a small neighbourhood.

import { MAP } from './projection.mjs';

/** @typedef {import('./resample.mjs').Grid} Grid */

/**
 * The cell holding a lon/lat.
 * @param {Grid} grid @param {number} lon @param {number} lat
 */
export function cellAt(grid, lon, lat) {
  const [ux, uy] = MAP.toUnits(lon, lat);
  return { c: Math.floor(ux / grid.cell), r: Math.floor(uy / grid.cell) };
}

/** The lon/lat of a cell's centre. @param {Grid} grid @param {number} c @param {number} r */
export function cellCentre(grid, c, r) {
  return MAP.toDegrees((c + 0.5) * grid.cell, (r + 0.5) * grid.cell);
}

/**
 * The mean of a block of size x size cells centred on (c, r), or NaN if it leaves the grid.
 * @param {Grid} grid @param {ArrayLike<number>} v @param {number} c @param {number} r @param {number} size
 */
export function blockMean(grid, v, c, r, size) {
  const h = Math.floor(size / 2);
  if (c - h < 0 || r - h < 0 || c + h >= grid.cols || r + h >= grid.rows) return NaN;
  let s = 0;
  for (let y = r - h; y <= r + h; y++) for (let x = c - h; x <= c + h; x++) s += v[y * grid.cols + x];
  return s / (size * size);
}

/**
 * The best block within `radiusKm` of a place: the size x size block whose mean is highest
 * ('max') or lowest ('min').
 * @param {Grid} grid @param {ArrayLike<number>} v @param {number} lon @param {number} lat
 * @param {number} radiusKm @param {number} size @param {'max' | 'min'} mode
 */
export function bestBlock(grid, v, lon, lat, radiusKm, size, mode) {
  const { c: c0, r: r0 } = cellAt(grid, lon, lat);
  const cellKm = grid.cell / 10;
  const reach = Math.ceil(radiusKm / cellKm);
  let best = { value: NaN, c: c0, r: r0, km: 0 };
  for (let r = r0 - reach; r <= r0 + reach; r++) {
    for (let c = c0 - reach; c <= c0 + reach; c++) {
      const km = Math.hypot(c - c0, r - r0) * cellKm;
      if (km > radiusKm) continue;
      const m = blockMean(grid, v, c, r, size);
      if (!(m === m)) continue;
      if (best.value !== best.value || (mode === 'max' ? m > best.value : m < best.value)) best = { value: m, c, r, km };
    }
  }
  const [blon, blat] = cellCentre(grid, best.c, best.r);
  return { ...best, lon: blon, lat: blat };
}

/**
 * The mean over every cell within radiusKm of a place.
 * @param {Grid} grid @param {ArrayLike<number>} v @param {number} lon @param {number} lat @param {number} radiusKm
 */
export function discMean(grid, v, lon, lat, radiusKm) {
  const { c: c0, r: r0 } = cellAt(grid, lon, lat);
  const cellKm = grid.cell / 10;
  const reach = Math.ceil(radiusKm / cellKm);
  let s = 0; let n = 0;
  for (let r = Math.max(0, r0 - reach); r <= Math.min(grid.rows - 1, r0 + reach); r++) {
    for (let c = Math.max(0, c0 - reach); c <= Math.min(grid.cols - 1, c0 + reach); c++) {
      if (Math.hypot(c - c0, r - r0) * cellKm > radiusKm) continue;
      s += v[r * grid.cols + c]; n++;
    }
  }
  return n ? s / n : NaN;
}

/**
 * Cells reachable from a start cell through cells that pass `inside` (4-neighbour flood fill).
 * @param {Grid} grid @param {number} start cell index @param {(i: number) => boolean} inside
 * @returns {Uint8Array} 1 for reached cells
 */
export function floodFill(grid, start, inside) {
  const seen = new Uint8Array(grid.cols * grid.rows);
  if (!inside(start)) return seen;
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = /** @type {number} */ (stack.pop());
    const c = i % grid.cols; const r = (i - c) / grid.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c + dc; const y = r + dr;
      if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) continue;
      const j = y * grid.cols + x;
      if (!seen[j] && inside(j)) { seen[j] = 1; stack.push(j); }
    }
  }
  return seen;
}

/**
 * Formats rows as a plain fixed-width table.
 * @param {string[]} head @param {(string | number)[][]} rows
 */
export function table(head, rows) {
  const cells = [head, ...rows.map((r) => r.map(String))];
  const widths = head.map((_, k) => Math.max(...cells.map((r) => r[k].length)));
  const line = (/** @type {string[]} */ r) => r.map((x, k) => x.padEnd(widths[k])).join('  ').trimEnd();
  return [line(head), widths.map((w) => '-'.repeat(w)).join('  '), ...cells.slice(1).map(line)].join('\n');
}

/** @param {number} lat @param {number} lon */
export const fmtPlace = (lat, lon) => `${lat.toFixed(2)}N ${lon.toFixed(2)}E`;

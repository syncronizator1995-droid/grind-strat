// @ts-check
// Moves lon/lat rasters (GEBCO, GLWD, WorldCover) onto the game's equal-area grids. Each game
// cell is covered by an n x n lattice of sample points; a cell's value is the mean of its
// samples (continuous data, read with bilinear interpolation) or the share of samples in each
// class (categories, read by nearest pixel). Because the projection is equal-area, evenly spaced
// samples weigh every part of a cell by its true ground area: an area average, not a point read.
//
// Grids follow the M1 test map exactly (tools/map/build-test-map.mjs): cell c, r covers game
// units [c*cell, (c+1)*cell) x [r*cell, (r+1)*cell), row 0 at the south, and there are
// ceil(MAP.width / cell) columns and ceil(MAP.height / cell) rows.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RAW } from './fetch-grids.mjs';
import { MAP } from './projection.mjs';

export const DERIVED = join(RAW, 'derived');

/**
 * @typedef {{ cols: number, rows: number, cell: number }} Grid
 * @typedef {(ux: number, uy: number) => [number, number]} ToDegrees game units to lon/lat
 */

/** A grid of square cells `cell` game units wide over the whole map. @param {number} cell @returns {Grid} */
export const mapGrid = (cell) => ({ cols: Math.ceil(MAP.width / cell), rows: Math.ceil(MAP.height / cell), cell });

/** The 1 km grid (terrain, marsh, land cover) and the 2 km grid (heights), as in M1. */
export const GRID_1KM = mapGrid(10);
export const GRID_2KM = mapGrid(20);

/**
 * The lon/lat box that holds the whole map rectangle, found by walking its edges (the rectangle's
 * corners stick out of the nominal 12-34E, 50-61.5N box), plus a margin so that interpolation
 * near the edges has data on both sides.
 * @param {number} margin degrees
 * @param {Grid} [grid] walk this grid's full extent (its last row and column may pass the map edge)
 * @param {ToDegrees} [toDegrees]
 */
export function mapWindow(margin, grid = GRID_1KM, toDegrees = MAP.toDegrees) {
  const w = grid.cols * grid.cell;
  const h = grid.rows * grid.cell;
  let west = Infinity; let east = -Infinity; let south = Infinity; let north = -Infinity;
  const steps = 400;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    for (const [ux, uy] of [[t * w, 0], [t * w, h], [0, t * h], [w, t * h]]) {
      const [lon, lat] = toDegrees(ux, uy);
      west = Math.min(west, lon); east = Math.max(east, lon); south = Math.min(south, lat); north = Math.max(north, lat);
    }
  }
  return { west: west - margin, east: east + margin, south: south - margin, north: north + margin };
}

/**
 * The lon/lat of every cell corner, so sample points inside a cell can be placed by bilinear
 * interpolation instead of running the projection for each one (over 1-2 km the projection is
 * flat to well under a metre).
 * @param {Grid} grid @param {ToDegrees} [toDegrees]
 */
export function cornerLattice(grid, toDegrees = MAP.toDegrees) {
  const stride = grid.cols + 1;
  const lon = new Float64Array(stride * (grid.rows + 1));
  const lat = new Float64Array(stride * (grid.rows + 1));
  for (let r = 0; r <= grid.rows; r++) {
    for (let c = 0; c <= grid.cols; c++) {
      const [x, y] = toDegrees(c * grid.cell, r * grid.cell);
      lon[r * stride + c] = x;
      lat[r * stride + c] = y;
    }
  }
  return { grid, stride, lon, lat };
}

/** @typedef {ReturnType<typeof cornerLattice>} Lattice */

/**
 * Calls visit(lon, lat) for the n x n sample points of cell (c, r): the centres of an even
 * n x n split of the cell.
 * @param {Lattice} L @param {number} c @param {number} r @param {number} n
 * @param {(lon: number, lat: number) => void} visit
 */
export function forEachSample(L, c, r, n, visit) {
  const i00 = r * L.stride + c;
  const i10 = i00 + 1;
  const i01 = i00 + L.stride;
  const i11 = i01 + 1;
  const { lon, lat } = L;
  for (let j = 0; j < n; j++) {
    const v = (j + 0.5) / n;
    // Left and right edges of this row of samples, then step across.
    const lonL = lon[i00] + (lon[i01] - lon[i00]) * v; const lonR = lon[i10] + (lon[i11] - lon[i10]) * v;
    const latL = lat[i00] + (lat[i01] - lat[i00]) * v; const latR = lat[i10] + (lat[i11] - lat[i10]) * v;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      visit(lonL + (lonR - lonL) * u, latL + (latR - latL) * u);
    }
  }
}

/**
 * Area average of a continuous field over every cell: the mean of the n x n samples that give
 * a number (NaN samples, i.e. no data, are left out; a cell with none is NaN).
 * @param {Lattice} L @param {number} n @param {(lon: number, lat: number) => number} sample
 * @returns {Float64Array} row 0 at the south
 */
export function areaAverage(L, n, sample) {
  const { cols, rows } = L.grid;
  const out = new Float64Array(cols * rows);
  let sum = 0; let count = 0;
  const add = (/** @type {number} */ lon, /** @type {number} */ lat) => {
    const v = sample(lon, lat);
    if (v === v) { sum += v; count++; } // skips NaN
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      sum = 0; count = 0;
      forEachSample(L, c, r, n, add);
      out[r * cols + c] = count ? sum / count : NaN;
    }
  }
  return out;
}

/**
 * @typedef {object} Raster a lon/lat raster window, row 0 at the north
 * @property {ArrayLike<number>} values
 * @property {number} width
 * @property {number} height
 * @property {number} west   west edge of column 0
 * @property {number} north  north edge of row 0
 * @property {number} dx     degrees per column
 * @property {number} dy     degrees per row (positive: rows go south)
 * @property {number | null} [noData]
 */

/**
 * Reads a raster at any lon/lat by bilinear interpolation between the four nearest pixel
 * centres. No-data pixels are left out of the blend; outside the raster, or with no valid
 * neighbour, it gives NaN.
 * @param {Raster} R @returns {(lon: number, lat: number) => number}
 */
export function bilinear(R) {
  const { values, width, height, west, north, dx, dy } = R;
  const nd = R.noData ?? NaN;
  return (lon, lat) => {
    const fx = (lon - west) / dx - 0.5;
    const fy = (north - lat) / dy - 0.5;
    if (fx < -0.5 || fy < -0.5 || fx > width - 0.5 || fy > height - 0.5) return NaN;
    const x0 = Math.max(0, Math.min(width - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(height - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - x0));
    const ty = Math.max(0, Math.min(1, fy - y0));
    const i = y0 * width + x0;
    let s = 0; let w = 0;
    const take = (/** @type {number} */ v, /** @type {number} */ wt) => { if (v !== nd && wt > 0) { s += v * wt; w += wt; } };
    take(values[i], (1 - tx) * (1 - ty));
    take(values[i + 1], tx * (1 - ty));
    take(values[i + width], (1 - tx) * ty);
    take(values[i + width + 1], tx * ty);
    return w > 0 ? s / w : NaN;
  };
}

/**
 * Reads a raster at a lon/lat by its nearest pixel (for categories), or -1 outside it.
 * @param {Raster} R @returns {(lon: number, lat: number) => number}
 */
export function nearest(R) {
  const { values, width, height, west, north, dx, dy } = R;
  return (lon, lat) => {
    const x = Math.floor((lon - west) / dx);
    const y = Math.floor((north - lat) / dy);
    if (x < 0 || y < 0 || x >= width || y >= height) return -1;
    return values[y * width + x];
  };
}

/**
 * The range of cells whose samples could fall inside a lon/lat box (found by walking the box's
 * edges through the projection), clamped to the grid.
 * @param {Grid} grid @param {{ west: number, east: number, south: number, north: number }} box
 */
export function cellsCovering(grid, box) {
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const lon = box.west + t * (box.east - box.west);
    const lat = box.south + t * (box.north - box.south);
    for (const [a, b] of [[lon, box.south], [lon, box.north], [box.west, lat], [box.east, lat]]) {
      const [ux, uy] = MAP.toUnits(a, b);
      x0 = Math.min(x0, ux); x1 = Math.max(x1, ux); y0 = Math.min(y0, uy); y1 = Math.max(y1, uy);
    }
  }
  return {
    c0: Math.max(0, Math.floor(x0 / grid.cell) - 1), c1: Math.min(grid.cols - 1, Math.floor(x1 / grid.cell) + 1),
    r0: Math.max(0, Math.floor(y0 / grid.cell) - 1), r1: Math.min(grid.rows - 1, Math.floor(y1 / grid.cell) + 1),
  };
}

/**
 * Turns per-cell sample counts into whole percentages that add up to exactly 100 (largest
 * remainder), or all zeros for a cell with no samples.
 * @param {Uint8Array | Uint16Array} counts planes * cells, plane-major (plane p of cell i at p * cells + i)
 * @param {number} planes @param {number} cells
 * @returns {Uint8Array} same layout
 */
export function countsToPercent(counts, planes, cells) {
  const out = new Uint8Array(planes * cells);
  const rem = new Float64Array(planes);
  for (let i = 0; i < cells; i++) {
    let total = 0;
    for (let p = 0; p < planes; p++) total += counts[p * cells + i];
    if (!total) continue;
    let given = 0;
    for (let p = 0; p < planes; p++) {
      const exact = (counts[p * cells + i] * 100) / total;
      const whole = Math.floor(exact);
      out[p * cells + i] = whole;
      rem[p] = exact - whole;
      given += whole;
    }
    // Hand the missing points to the biggest remainders (ties to the lower plane, to stay stable).
    for (; given < 100; given++) {
      let best = 0;
      for (let p = 1; p < planes; p++) if (rem[p] > rem[best]) best = p;
      out[best * cells + i]++;
      rem[best] = -1;
    }
  }
  return out;
}

/**
 * Writes a derived grid: the raw little-endian values, plus a .json sidecar saying what they are.
 * @param {string} name file name under data/raw/derived/, e.g. "heights-2km.i16"
 * @param {Int16Array | Uint8Array} values
 * @param {Record<string, unknown>} meta
 */
export async function writeGrid(name, values, meta) {
  await mkdir(DERIVED, { recursive: true });
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  // Typed arrays use the machine's byte order; every machine we build on is little-endian.
  if (new Uint8Array(Uint16Array.of(1).buffer)[0] !== 1) throw new Error('big-endian machine: grids would be written the wrong way round');
  await writeFile(join(DERIVED, name), bytes);
  await writeFile(join(DERIVED, `${name}.json`), `${JSON.stringify({ file: name, ...meta }, null, 2)}\n`);
}

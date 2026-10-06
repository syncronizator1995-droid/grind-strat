// @ts-check
// Build-time geometry helpers for the map pipeline: read GeoJSON, project into game units, clip
// to the map, simplify, and fill polygons into grids. Plain Node, no dependencies.

import { simplify } from '../../src/ui/map/geometry.js';
import { MAP } from './projection.mjs';

export { simplify };

/** @typedef {number[]} Flat flat [x0, y0, x1, y1, ...] */

/** Generous lon/lat window: features outside it can't touch the map. */
const WINDOW = { west: 6, east: 40, south: 46, north: 65 };

/**
 * Rings (polygons) or lines from GeoJSON features, in lon/lat, that might touch the map.
 * @param {any} geojson a FeatureCollection
 * @param {'polygon' | 'line'} kind
 * @returns {{ props: any, parts: number[][][] }[]} each part is a list of [lon, lat]
 */
export function featuresIn(geojson, kind) {
  const out = [];
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    /** @type {number[][][]} */
    let parts = [];
    if (kind === 'polygon' && g.type === 'Polygon') parts = g.coordinates;
    else if (kind === 'polygon' && g.type === 'MultiPolygon') parts = g.coordinates.flat();
    else if (kind === 'line' && g.type === 'LineString') parts = [g.coordinates];
    else if (kind === 'line' && g.type === 'MultiLineString') parts = g.coordinates;
    parts = parts.filter((p) => p.some(([lon, lat]) => lon >= WINDOW.west && lon <= WINDOW.east && lat >= WINDOW.south && lat <= WINDOW.north));
    if (parts.length) out.push({ props: f.properties ?? {}, parts });
  }
  return out;
}

/**
 * Projects a lon/lat part into game units, adding points along long steps so straight lon/lat
 * edges bend properly once projected.
 * @param {number[][]} part
 * @returns {Flat}
 */
export function project(part) {
  /** @type {Flat} */
  const out = [];
  for (let i = 0; i < part.length; i++) {
    const [lon, lat] = part[i];
    if (i > 0) {
      const [plon, plat] = part[i - 1];
      const steps = Math.ceil(Math.max(Math.abs(lon - plon), Math.abs(lat - plat)) / 0.25);
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        out.push(...MAP.toUnits(plon + (lon - plon) * t, plat + (lat - plat) * t));
      }
    }
    out.push(...MAP.toUnits(lon, lat));
  }
  return out;
}

/**
 * Clips a ring to the map rectangle (Sutherland-Hodgman). The result may run along the edge.
 * @param {Flat} ring
 * @param {number} [width] @param {number} [height]
 * @returns {Flat}
 */
export function clipRing(ring, width = MAP.width, height = MAP.height) {
  /** @type {[(x: number, y: number) => boolean, (ax: number, ay: number, bx: number, by: number) => [number, number]][]} */
  const edges = [
    [(x) => x >= 0, (ax, ay, bx, by) => [0, ay + ((by - ay) * (0 - ax)) / (bx - ax)]],
    [(x) => x <= width, (ax, ay, bx, by) => [width, ay + ((by - ay) * (width - ax)) / (bx - ax)]],
    [(_x, y) => y >= 0, (ax, ay, bx, by) => [ax + ((bx - ax) * (0 - ay)) / (by - ay), 0]],
    [(_x, y) => y <= height, (ax, ay, bx, by) => [ax + ((bx - ax) * (height - ay)) / (by - ay), height]],
  ];
  let pts = ring;
  for (const [inside, cross] of edges) {
    if (pts.length < 6) return [];
    /** @type {Flat} */
    const next = [];
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = pts[((i + n - 1) % n) * 2];
      const ay = pts[((i + n - 1) % n) * 2 + 1];
      const bx = pts[i * 2];
      const by = pts[i * 2 + 1];
      const ain = inside(ax, ay);
      const bin = inside(bx, by);
      if (bin) {
        if (!ain) next.push(...cross(ax, ay, bx, by).map(Math.round));
        next.push(bx, by);
      } else if (ain) {
        next.push(...cross(ax, ay, bx, by).map(Math.round));
      }
    }
    pts = next;
  }
  return pts.length >= 6 ? pts : [];
}

/**
 * Clips a line to the map rectangle; a line that leaves and re-enters becomes several lines.
 * @param {Flat} line
 * @param {number} [width] @param {number} [height]
 * @returns {Flat[]}
 */
export function clipLine(line, width = MAP.width, height = MAP.height) {
  const inside = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && x <= width && y >= 0 && y <= height;
  /** @type {Flat[]} */
  const parts = [];
  /** @type {Flat} */
  let current = [];
  for (let i = 0; i < line.length; i += 2) {
    const x = line[i];
    const y = line[i + 1];
    if (inside(x, y)) {
      current.push(x, y);
    } else if (current.length) {
      if (current.length >= 4) parts.push(current);
      current = [];
    }
  }
  if (current.length >= 4) parts.push(current);
  return parts;
}

/**
 * Simplifies a closed ring: splits it at its two farthest-apart points so both halves keep their
 * ends, then drops consecutive duplicates. Rings that shrink below a triangle are dropped.
 * @param {Flat} ring (without repeating the first point at the end)
 * @param {number} tolerance
 * @returns {Flat}
 */
export function simplifyRing(ring, tolerance) {
  const n = ring.length / 2;
  if (n < 4) return n >= 3 ? ring.slice() : [];
  let far = 0;
  let farD = -1;
  for (let i = 1; i < n; i++) {
    const d = (ring[i * 2] - ring[0]) ** 2 + (ring[i * 2 + 1] - ring[1]) ** 2;
    if (d > farD) { farD = d; far = i; }
  }
  const first = simplify(ring.slice(0, far * 2 + 2), tolerance);
  const second = simplify([...ring.slice(far * 2), ring[0], ring[1]], tolerance);
  const joined = [...first, ...second.slice(2, -2)];
  /** @type {Flat} */
  const out = [];
  for (let i = 0; i < joined.length; i += 2) {
    if (out.length && out[out.length - 2] === joined[i] && out[out.length - 1] === joined[i + 1]) continue;
    out.push(joined[i], joined[i + 1]);
  }
  return out.length >= 6 ? out : [];
}

/** Drops a repeated closing point, if the ring has one. @param {Flat} ring */
export function openRing(ring) {
  const n = ring.length;
  return n >= 4 && ring[0] === ring[n - 2] && ring[1] === ring[n - 1] ? ring.slice(0, -2) : ring;
}

/** Twice the signed area of a ring (positive when counter-clockwise). @param {Flat} ring */
export function ringArea2(ring) {
  let a = 0;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
  return a;
}

/**
 * Fills rings into a grid with the even-odd rule, testing each cell's centre: cells inside are
 * set to `value`. Holes come out right when a polygon's rings are filled together.
 * @param {Uint8Array} grid row 0 is the southern edge
 * @param {number} cols @param {number} rows
 * @param {number} cell game units per cell
 * @param {Flat[]} rings
 * @param {number} value
 */
export function fillRings(grid, cols, rows, cell, rings, value) {
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * cell;
    /** @type {number[]} */
    const xs = [];
    for (const ring of rings) {
      const n = ring.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = ring[i * 2 + 1];
        const yj = ring[j * 2 + 1];
        if ((yi > y) !== (yj > y)) {
          xs.push(ring[i * 2] + ((y - yi) * (ring[j * 2] - ring[i * 2])) / (yj - yi));
        }
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] / cell - 0.5));
      const c1 = Math.min(cols - 1, Math.floor(xs[k + 1] / cell - 0.5));
      for (let c = c0; c <= c1; c++) grid[r * cols + c] = value;
    }
  }
}

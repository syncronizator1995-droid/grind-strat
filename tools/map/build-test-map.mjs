// @ts-check
// Builds src/data/map/test-map.json: the M1 speed-test map (step 2a). The coast, lakes and rivers
// are real (Natural Earth, public domain). The provinces, borders, points, terrain and heights
// are MADE UP, only to load the phone the way the real map will. The game labels it so.
//   node tools/map/build-test-map.mjs        (needs node tools/map/fetch.mjs first)

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { nextFloat, seedRng } from '../../src/sim/random.js';
import { bundleBlocks, encodePoints, encodeShapes } from '../../src/ui/map/codec.js';
import { readRaw } from './fetch.mjs';
import { clipLine, clipRing, featuresIn, fillRings, openRing, project, ringArea2, simplifyRing, simplify } from './geo.mjs';
import { MAP } from './projection.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = join(ROOT, 'src', 'data', 'map');

/** Grid cell for terrain: 1 km = 10 game units (Ignas: a 1 km terrain map). */
export const CELL = 10;
const HEIGHT_CELL = 20; // 2 km

/** Terrain classes stored in the grid. */
export const TERRAIN = Object.freeze({ sea: 0, lake: 1, open: 2, conifer: 3, mixed: 4, marsh: 5, heath: 6 });

/** @param {Uint8Array} bytes */
const pack = (bytes) => deflateSync(bytes, { level: 9 }).toString('base64');

/**
 * Smooth value noise from the seeded generator, for made-up terrain.
 * @param {number} seed @param {number} gridSize
 */
function makeNoise(seed, gridSize) {
  const rng = seedRng(seed);
  const size = gridSize + 1;
  const values = new Float64Array(size * size);
  for (let i = 0; i < values.length; i++) values[i] = nextFloat(rng);
  const smooth = (/** @type {number} */ t) => t * t * (3 - 2 * t);
  /** @param {number} u 0..1 @param {number} v 0..1 */
  return (u, v) => {
    const x = Math.min(u * gridSize, gridSize - 1e-9);
    const y = Math.min(v * gridSize, gridSize - 1e-9);
    const x0 = Math.floor(x); const y0 = Math.floor(y);
    const fx = smooth(x - x0); const fy = smooth(y - y0);
    const a = values[y0 * size + x0]; const b = values[y0 * size + x0 + 1];
    const c = values[(y0 + 1) * size + x0]; const d = values[(y0 + 1) * size + x0 + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/**
 * Several octaves of noise added together.
 * @param {number} seed @param {number} base
 */
function fractal(seed, base) {
  const layers = [makeNoise(seed, base), makeNoise(seed + 1, base * 3), makeNoise(seed + 2, base * 9)];
  return (/** @type {number} */ u, /** @type {number} */ v) => 0.6 * layers[0](u, v) + 0.28 * layers[1](u, v) + 0.12 * layers[2](u, v);
}

async function realLayers() {
  const land = JSON.parse((await readRaw('ne-land')).data.toString('utf8'));
  const lakes = JSON.parse((await readRaw('ne-lakes')).data.toString('utf8'));
  const rivers = JSON.parse((await readRaw('ne-rivers')).data.toString('utf8'));

  /** @type {number[][]} */ const landRings = [];
  /** @type {number[][]} */ const coastLines = [];
  for (const f of featuresIn(land, 'polygon')) {
    for (const part of f.parts) {
      const ring = simplifyRing(openRing(project(part)), 1.5);
      if (Math.abs(ringArea2(ring)) < 2 * 40) continue; // drop islets under about 0.4 km²
      const clipped = clipRing(ring);
      if (clipped.length) landRings.push(clipped);
      coastLines.push(...clipLine([...ring, ring[0], ring[1]]));
    }
  }
  /** @type {number[][]} */ const lakeRings = [];
  for (const f of featuresIn(lakes, 'polygon')) {
    if (String(f.props.featurecla).toLowerCase().includes('reservoir')) continue; // not there in 1219
    for (const part of f.parts) {
      const ring = simplifyRing(openRing(project(part)), 1.5);
      if (Math.abs(ringArea2(ring)) < 2 * 40) continue;
      const clipped = clipRing(ring);
      if (clipped.length) lakeRings.push(clipped);
    }
  }
  /** @type {number[][]} */ const riverLines = [];
  /** @type {{ name: string, weight: number }[]} */ const riverInfo = [];
  for (const f of featuresIn(rivers, 'line')) {
    for (const part of f.parts) {
      for (const line of clipLine(simplify(project(part), 2))) {
        if (line.length < 4) continue;
        riverLines.push(line);
        riverInfo.push({ name: String(f.props.name ?? ''), weight: Number(f.props.strokeweig ?? 1) || 1 });
      }
    }
  }
  return { landRings, coastLines, lakeRings, riverLines, riverInfo };
}

/**
 * Made-up provinces: Voronoi cells around seeds spread over the land, with wobbly borders that
 * both neighbours share exactly.
 * @param {Uint8Array} terrain @param {number} cols @param {number} rows
 */
function inventProvinces(terrain, cols, rows) {
  const rng = seedRng(2196);
  const spacing = 560; // game units between seeds
  /** @type {[number, number][]} */
  const seeds = [];
  for (let tries = 0; tries < 200000 && seeds.length < 400; tries++) {
    const c = Math.floor(nextFloat(rng) * cols);
    const r = Math.floor(nextFloat(rng) * rows);
    const t = terrain[r * cols + c];
    if (t === TERRAIN.sea || t === TERRAIN.lake) continue;
    const x = (c + 0.5) * CELL; const y = (r + 0.5) * CELL;
    if (seeds.every(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2 > spacing * spacing)) seeds.push([x, y]);
  }

  /** @param {number[][]} poly @param {number} ax @param {number} ay @param {number} bx @param {number} by */
  const clipHalf = (poly, ax, ay, bx, by) => {
    // keep points nearer to a than to b
    const nx = bx - ax; const ny = by - ay;
    const k = (bx * bx + by * by - ax * ax - ay * ay) / 2;
    const inside = (/** @type {number[]} */ p) => p[0] * nx + p[1] * ny <= k;
    /** @type {number[][]} */ const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[(i + poly.length - 1) % poly.length];
      const q = poly[i];
      const pin = inside(p); const qin = inside(q);
      if (pin !== qin) {
        const dp = p[0] * nx + p[1] * ny - k; const dq = q[0] * nx + q[1] * ny - k;
        const t = dp / (dp - dq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
      if (qin) out.push(q);
    }
    return out;
  };

  const W = MAP.width; const H = MAP.height;
  const cells = seeds.map(([sx, sy], i) => {
    let poly = [[0, 0], [W, 0], [W, H], [0, H]];
    for (let j = 0; j < seeds.length; j++) {
      if (j === i) continue;
      const [tx, ty] = seeds[j];
      if ((tx - sx) ** 2 + (ty - sy) ** 2 > (spacing * 6) ** 2) continue;
      poly = clipHalf(poly, sx, sy, tx, ty);
    }
    return poly;
  });

  /** Which neighbour shares the edge from a to b (or -1 for the map edge). */
  const neighbourOf = (/** @type {number} */ i, /** @type {number[]} */ a, /** @type {number[]} */ b) => {
    const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2;
    const [sx, sy] = seeds[i];
    const di = (mx - sx) ** 2 + (my - sy) ** 2;
    let best = -1; let bestErr = Infinity;
    for (let j = 0; j < seeds.length; j++) {
      if (j === i) continue;
      const err = Math.abs((mx - seeds[j][0]) ** 2 + (my - seeds[j][1]) ** 2 - di);
      if (err < bestErr) { bestErr = err; best = j; }
    }
    return bestErr < Math.max(1, di * 1e-6) ? best : -1;
  };

  /** The wobbly line for the border between seeds i and j, from a to b. */
  const wobble = (/** @type {number} */ i, /** @type {number} */ j, /** @type {number[]} */ a, /** @type {number[]} */ b) => {
    const flip = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
    const [p, q] = flip ? [b, a] : [a, b];
    const lo = Math.min(i, j); const hi = Math.max(i, j);
    const r = seedRng(lo * 7919 + hi);
    const f1 = 1 + Math.floor(nextFloat(r) * 3); const f2 = 3 + Math.floor(nextFloat(r) * 4);
    const p1 = nextFloat(r) * 6.283; const p2 = nextFloat(r) * 6.283;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const steps = Math.max(1, Math.round(len / 25));
    const amp = Math.min(60, len * 0.12);
    const ux = (q[0] - p[0]) / (len || 1); const uy = (q[1] - p[1]) / (len || 1);
    /** @type {number[]} */ const pts = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const off = amp * Math.sin(Math.PI * t) * (0.7 * Math.sin(6.283 * f1 * t + p1) + 0.3 * Math.sin(6.283 * f2 * t + p2));
      pts.push(Math.round(p[0] + (q[0] - p[0]) * t - uy * off), Math.round(p[1] + (q[1] - p[1]) * t + ux * off));
    }
    if (!flip) return pts;
    /** @type {number[]} */ const rev = [];
    for (let k = pts.length - 2; k >= 0; k -= 2) rev.push(pts[k], pts[k + 1]);
    return rev;
  };

  /** @type {number[][]} */ const rings = [];
  /** @type {number[][]} */ const borders = [];
  /** @type {number[]} */ const borderKinds = [];
  const rngKind = seedRng(77);
  cells.forEach((poly, i) => {
    /** @type {number[]} */ const ring = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k]; const b = poly[(k + 1) % poly.length];
      const j = neighbourOf(i, a, b);
      const line = j >= 0 ? wobble(i, j, a, b) : [Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1])];
      ring.push(...line.slice(0, -2));
      if (j > i) {
        borders.push(line);
        borderKinds.push(nextFloat(rngKind) < 0.5 ? 0 : 1); // made up: half sourced, half guessed
      }
    }
    rings.push(ring);
  });
  return { seeds, rings, borders, borderKinds };
}

async function main() {
  const { landRings, coastLines, lakeRings, riverLines, riverInfo } = await realLayers();

  const cols = Math.ceil(MAP.width / CELL);
  const rows = Math.ceil(MAP.height / CELL);
  const terrain = new Uint8Array(cols * rows); // sea everywhere to start
  fillRings(terrain, cols, rows, CELL, landRings, TERRAIN.open);
  fillRings(terrain, cols, rows, CELL, lakeRings, TERRAIN.lake);

  // Made-up land cover and heights.
  const forest = fractal(11, 9);
  const wet = fractal(23, 14);
  const relief = fractal(37, 7);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (terrain[i] !== TERRAIN.open) continue;
      const u = c / cols; const v = r / rows;
      const w = wet(u, v); const f = forest(u, v);
      terrain[i] = w > 0.66 ? TERRAIN.marsh : f > 0.62 ? TERRAIN.conifer : f > 0.45 ? TERRAIN.mixed : f < 0.3 && w < 0.35 ? TERRAIN.heath : TERRAIN.open;
    }
  }
  const hCols = Math.ceil(MAP.width / HEIGHT_CELL);
  const hRows = Math.ceil(MAP.height / HEIGHT_CELL);
  const height = new Uint8Array(hCols * hRows);
  for (let r = 0; r < hRows; r++) {
    for (let c = 0; c < hCols; c++) {
      const t = terrain[Math.min(rows - 1, r * 2) * cols + Math.min(cols - 1, c * 2)];
      if (t === TERRAIN.sea) continue;
      height[r * hCols + c] = Math.round(Math.max(0, relief(c / hCols, r / hRows) - 0.3) * 360);
    }
  }

  const { seeds, rings, borders, borderKinds } = inventProvinces(terrain, cols, rows);

  // Made-up holdings: 3,000 points on land, four kinds.
  const rngPts = seedRng(3000);
  /** @type {number[]} */ const points = [];
  /** @type {number[]} */ const pointKinds = [];
  while (points.length < 6000) {
    const x = Math.floor(nextFloat(rngPts) * MAP.width);
    const y = Math.floor(nextFloat(rngPts) * MAP.height);
    const t = terrain[Math.floor(y / CELL) * cols + Math.floor(x / CELL)];
    if (t === TERRAIN.sea || t === TERRAIN.lake) continue;
    points.push(x, y);
    pointKinds.push(Math.floor(nextFloat(rngPts) * 4));
  }

  // The fog-of-war test: provinces within about 250 km of Vilnius are "seen".
  const [vx, vy] = MAP.toUnits(25.28, 54.69);
  const seen = seeds.map(([x, y], i) => ((x - vx) ** 2 + (y - vy) ** 2 < 2500 ** 2 ? i : -1)).filter((i) => i >= 0);

  /** @type {Record<string, Uint8Array>} */
  const blocks = {
    land: encodeShapes(landRings),
    coast: encodeShapes(coastLines),
    lakes: encodeShapes(lakeRings),
    rivers: encodeShapes(riverLines),
    provinces: encodeShapes(rings),
    borders: encodeShapes(borders),
    borderKinds: Uint8Array.from(borderKinds),
    points: encodePoints(points),
    pointKinds: Uint8Array.from(pointKinds),
    terrain,
    height,
  };
  const data = {
    kind: 'test-map',
    invented: 'Provinces, borders, points, terrain and heights are made up for the M1 speed test. Coast, lakes and rivers are real (Natural Earth).',
    meta: MAP.meta(),
    sources: ['ne'],
    riverInfo,
    seen,
    terrain: { cols, rows, cell: CELL },
    height: { cols: hCols, rows: hRows, cell: HEIGHT_CELL },
    bundle: pack(bundleBlocks(blocks)),
  };
  const json = `${JSON.stringify(data)}\n`;
  await writeFile(join(OUT, 'test-map.json'), json);
  await recordFingerprint('test-map.json', json);
  const kb = (/** @type {number} */ n) => `${Math.round(n / 1024)} KB`;
  const sizes = Object.entries(blocks).map(([k, v]) => `${k} ${kb(deflateSync(v, { level: 9 }).length)}`).join(', ');
  console.log(`test-map.json ${kb(json.length)} (one bundle). Compressed alone: ${sizes}. ${rings.length} provinces, ${borders.length} borders, ${points.length / 2} points, terrain ${cols}x${rows}.`);
}

/** Records the SHA-256 of a built map file, so tests can tell it hasn't been edited by hand. */
export async function recordFingerprint(/** @type {string} */ name, /** @type {string} */ text) {
  const path = join(OUT, 'fingerprints.json');
  /** @type {Record<string, string>} */
  let prints = {};
  try { prints = JSON.parse(await readFile(path, 'utf8')); } catch { /* first one */ }
  prints[name] = createHash('sha256').update(text).digest('hex');
  await writeFile(path, `${JSON.stringify(Object.fromEntries(Object.entries(prints).sort()), null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

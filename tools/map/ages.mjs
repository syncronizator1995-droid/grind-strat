// @ts-check
// The rules of the ice-age maps (M3b PR 3): which input stands behind each age, how polygons from
// SGU's shore model and DATED-1's ice margins become the 1 km surface layer, how the pollen
// shares become the four land-cover classes, and which land is hatched "no model yet". Build time
// only (tools/map/build-ages.mjs runs them); the game only ever sees the finished layers
// (src/ui/map/slice.js).
//
// LICENCE: the block is CC BY-SA 4.0 because the cover comes from SpatioCompo. This file reads
// SGU (CC0), DATED-1 (CC BY 3.0) and SpatioCompo (CC BY-SA 4.0) only; never OpenStreetMap data
// (test/map-ages.test.js walks the imports of the build files to check).

import { createHash } from 'node:crypto';
import { MAP, northPolarLaeaInverse, SWEREF99TM } from './projection.mjs';

/** The bytes of the surface layer (src/ui/map/slice.js SURFACE). */
export const SURFACE = Object.freeze({ land: 0, water: 1, ice: 2 });
/** The bytes of the cover layer (src/ui/map/slice.js COVER). */
export const COVER = Object.freeze({ none: 0, tundra: 1, birch: 2, pine: 3, mixed: 4 });

/** What SGU's `code` column means (product description 2.0, 2024-06-09, and the column's own text). */
export const SGU_CODE = Object.freeze({ sea: 1, iceLake: 2, lake: 4, ice: 5 });

/**
 * The five ages and what stands behind each. `table` is the SGU table (years before 1950) nearest
 * to the age; SGU's own warning is that its 100-year tables can be off by up to about 500 years,
 * so these are stages, not exact years. `stage` is the name of the water, as the age notes use it.
 *
 * - ice 'dated1': the ice sheet is DATED-1's most-credible margin of the 12 ka slice (about
 *   10,050 BC), because the Baltic Ice Lake map is the age whose ice edge matters most; 'sgu': SGU's
 *   code 5 polygon ("a simplified model of the ice sheet's melting", the description says).
 * - cover 'painted': a rule, not a pollen map (the oldest pollen window is 9,750 to 9,250 BC).
 *   Otherwise the SpatioCompo source id of the window that holds the age.
 * - broadleaf: what the pollen map's "broadleaf" share means in this age: 'birch' (the early
 *   woods are birch and pine; hazel reaches north-west Estonia only about 8,500 BC) or 'mixed'
 *   (birch with hazel and elm; elm spreads in Estonia from about 8,250 BC, Saarse and Veski
 *   2001, 9000 to 7800 radiocarbon years, converted by us).
 * - tundra: whether open land can be tundra in this age (the three cold ones; later, open land is
 *   forest-steppe and light woodland, which the four classes do not name, so it takes the forest
 *   class the conifer share gives).
 * - hatchEast: the land east of the model is hatched "no model yet" (Ignas, 2 November 2026).
 * @typedef {{ id: string, year: number, stage: string, file: string, table: string, calBp: number,
 *   ice: 'dated1' | 'sgu', cover: string, broadleaf: 'birch' | 'mixed', tundra: boolean, hatchEast: boolean }} AgeBuild
 */
/** @type {readonly AgeBuild[]} */
export const AGE_BUILDS = Object.freeze([
  { id: 'age-10000bc', year: -10000, stage: 'Baltic Ice Lake', file: 'strandforskjutning_11000_11900.gpkg', table: 'issjohav_11900', calBp: 11900, ice: 'dated1', cover: 'painted', broadleaf: 'birch', tundra: true, hatchEast: true },
  { id: 'age-9500bc', year: -9500, stage: 'Yoldia Sea', file: 'strandforskjutning_11000_11900.gpkg', table: 'issjohav_11400', calBp: 11400, ice: 'sgu', cover: 'spatiocompo-tw25', broadleaf: 'birch', tundra: true, hatchEast: true },
  { id: 'age-8500bc', year: -8500, stage: 'Ancylus Lake', file: 'strandforskjutning_10000_10900.gpkg', table: 'issjohav_10400', calBp: 10400, ice: 'sgu', cover: 'spatiocompo-tw23', broadleaf: 'birch', tundra: true, hatchEast: true },
  { id: 'age-7500bc', year: -7500, stage: 'late Ancylus Lake (the sources disagree)', file: 'strandforskjutning_9000_9900.gpkg', table: 'issjohav_9400', calBp: 9400, ice: 'sgu', cover: 'spatiocompo-tw21', broadleaf: 'mixed', tundra: false, hatchEast: true },
  { id: 'age-5000bc', year: -5000, stage: 'Litorina Sea', file: 'strandforskjutning_6000_6900.gpkg', table: 'issjohav_6900', calBp: 6900, ice: 'sgu', cover: 'spatiocompo-tw16', broadleaf: 'mixed', tundra: false, hatchEast: false },
]);

/** Every parameter of the build, fingerprinted so a stale build is refused (pack-ages.mjs). */
export const AGES_PARAMS = Object.freeze({
  /** Cover classes from the blended pollen shares (see coverClass): open land that is the larger part of the land is tundra, conifers that are the larger part of the forest are pine, birch woodland needs birch at 60% of the forest or more. */
  openTundra: 0.5,
  coniferPine: 0.5,
  coniferBirch: 0.4,
  /**
   * The estimate east of the model at 5,000 BC: the old sea level there (metres above today's sea),
   * from the Narva-Luga study (Rosentau et al. 2013: the Litorina Sea's highest shore, about
   * 5,350 BC, is now found 6 to 14 m up there; 10 m is its middle, so about 4 m either way); the
   * sea is carried east at most `eastReachKm`. `eastShoreBandKm` is only a check: the Estonian
   * shore's median height within that band of the edge is reported beside it.
   */
  eastSeaLevelM: 10,
  eastShoreBandKm: 40,
  eastReachKm: 150,
});

/** @param {unknown} value */
export const paramsSha256 = (value = { AGE_BUILDS, AGES_PARAMS }) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * The land cover class of one place from the blended pollen shares.
 *
 * What the shares are (SpatioCompo's README; Githumbi et al. 2022): REVEALS estimates of the cover
 * of coniferous forest, broadleaved forest and open land. REVEALS corrects each tree's pollen for
 * how much pollen it makes and how far it flies (pine makes more than birch, so raw pollen
 * percentages, which most pollen diagrams show, overstate pine), and birch, a summer-green tree,
 * counts as broadleaved. So these shares show less pine than the "pine forest" of pollen diagrams.
 *
 * THE RULE (ours, from shares; not a historical map): open land that is at least `openTundra` of the
 * place (the larger part) is tundra: open herb and grass land with scattered trees, only in the
 * ages with `tundra`. Otherwise it is forest, and the conifer share of the forest decides: at or
 * above `coniferPine` (conifers are the larger part) it is pine, the class the game has for conifer
 * forest. Below that, in the ages where the pollen map's broadleaf trees
 * are birch, a conifer share at or below `coniferBirch` (birch 60% of the forest or more) is birch
 * woodland and the middle is mixed (birch and pine); in the later ages broadleaf means birch with
 * hazel and elm, and later lime and oak, so anything not pine is mixed forest.
 * @param {number} conifer @param {number} broadleaf @param {number} open shares 0-1
 * @param {'birch' | 'mixed'} broadleafMeans
 * @param {boolean} [tundra] whether open land can be tundra (the cold ages)
 * @param {typeof AGES_PARAMS} [p]
 */
export function coverClass(conifer, broadleaf, open, broadleafMeans, tundra = true, p = AGES_PARAMS) {
  if (tundra && open >= p.openTundra) return COVER.tundra;
  const forest = conifer + broadleaf;
  if (!(forest > 0)) return COVER.mixed; // no forest share at all (open land in a warm age): no tree wins
  const share = conifer / forest;
  if (share >= p.coniferPine) return COVER.pine;
  if (broadleafMeans === 'birch' && share <= p.coniferBirch) return COVER.birch;
  return COVER.mixed;
}

/**
 * A ring from SGU (SWEREF 99 TM metres) in game units, as floats.
 * @param {number[]} ring
 */
export function sguRingToUnits(ring) {
  const out = new Array(ring.length);
  for (let i = 0; i < ring.length; i += 2) {
    const [lon, lat] = SWEREF99TM.inverse(ring[i], ring[i + 1]);
    const [x, y] = MAP.toUnits(lon, lat);
    out[i] = x; out[i + 1] = y;
  }
  return out;
}

/**
 * A ring from DATED-1 (north-polar LAEA metres) in game units. Long edges are cut into pieces
 * (a straight edge in one projection is a curve in another).
 * @param {number[]} ring @param {number} [maxStep] metres
 */
export function datedRingToUnits(ring, maxStep = 5000) {
  /** @type {number[]} */
  const out = [];
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = ring[j * 2] - ring[i * 2];
    const dy = ring[j * 2 + 1] - ring[i * 2 + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / maxStep));
    for (let s = 0; s < steps; s++) {
      const [lon, lat] = northPolarLaeaInverse(ring[i * 2] + (dx * s) / steps, ring[i * 2 + 1] + (dy * s) / steps);
      const [x, y] = MAP.toUnits(lon, lat);
      out.push(x, y);
    }
  }
  return out;
}

/**
 * Fills one polygon (its outer ring and holes together, even-odd) into a grid: the cells whose
 * centre lies inside get `value`. Only the rows the polygon touches are visited.
 * @param {Uint8Array} grid @param {number} cols @param {number} rows @param {number} cell game units per cell
 * @param {number[][]} rings flat [x0, y0, ...] in game units @param {number} value
 */
export function fillPolygon(grid, cols, rows, cell, rings, value) {
  let minY = Infinity; let maxY = -Infinity;
  for (const ring of rings) for (let i = 1; i < ring.length; i += 2) { if (ring[i] < minY) minY = ring[i]; if (ring[i] > maxY) maxY = ring[i]; }
  const r0 = Math.max(0, Math.ceil(minY / cell - 0.5));
  const r1 = Math.min(rows - 1, Math.floor(maxY / cell - 0.5));
  /** @type {number[]} */
  const xs = [];
  for (let r = r0; r <= r1; r++) {
    const y = (r + 0.5) * cell;
    xs.length = 0;
    for (const ring of rings) {
      const n = ring.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = ring[i * 2 + 1]; const yj = ring[j * 2 + 1];
        if ((yi > y) !== (yj > y)) xs.push(ring[i * 2] + ((y - yi) * (ring[j * 2] - ring[i * 2])) / (yj - yi));
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

/**
 * SGU's model stops at a rectangle in SWEREF 99 TM: every polygon of every table ends at these
 * bounds (checked on the polygons themselves by build-ages.mjs, to a metre). Land outside it is
 * not "no water": it is a place SGU did not model. Only its east side is hatched (see
 * eastOfModel); south of the model (below about 52.8N: Silesia, Lesser Poland, Saxony) no sea or
 * ice stands in any of the five ages, so it is plain land there.
 */
export const SGU_DOMAIN = Object.freeze({ minX: -113500.83, maxX: 1214604.83, minY: 5857496.28, maxY: 7965502.83 });

/**
 * Whether a point lies east of SGU's model: its SWEREF easting is past the model's east edge. That
 * edge is a straight line in SWEREF 99 TM, a slanted one on our map (from about 26.2E at 55N to
 * about 27.5E at 59N).
 * @param {number} lon @param {number} lat
 */
export function eastOfModel(lon, lat) {
  return SWEREF99TM.forward(lon, lat)[0] > SGU_DOMAIN.maxX;
}

/**
 * The rough estimate of the sea east of SGU's model at 5,000 BC (Ignas's choice, 2 November 2026;
 * the plan put its error at about 4 m). The model's sea is cut off by a straight line across the
 * Gulf of Finland, so the sea is carried on east by a rule: from the cells that touch the edge, it
 * floods every cell east of the edge, no further than `eastReachKm`, whose height today is at or
 * below the old sea level `level`, cell by cell (8 neighbours). The level is the Narva-Luga study's
 * (AGES_PARAMS.eastSeaLevelM), not read from the map: the median of today's heights on the Estonian
 * shore just west of the edge (the land cells with SGU's sea to their north, in `gulf`) is only
 * reported beside it as a check, because the 2 km heights there average the Baltic Klint into the
 * shore (it read 19 m, against 6 to 14 m in the study). The land further east has risen less, so
 * one level for the whole east is rough. Inland lakes (Peipus, Ladoga) are not drawn in the east.
 * @param {{ cols: number, rows: number, surface: Uint8Array, east: Uint8Array, gulf: Uint8Array,
 *   height: (c: number, r: number) => number, level: number }} g `east` marks cells east of the
 *   model, already cut to the reach; `gulf` the cells (inside the model) whose south shore is read
 *   for the check; `height` is today's height in metres; `level` the old sea level in metres
 * @returns {{ level: number, shore: { median: number | null, quartiles: number[], samples: number }, flooded: number }}
 *   and floods `surface` in place
 */
export function floodEast(g) {
  const { cols, rows, surface, east, gulf } = g;
  const near = (/** @type {number} */ c, /** @type {number} */ r, /** @type {(i: number) => boolean} */ test) => {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const cc = c + dc; const rr = r + dr;
      if ((dc || dr) && cc >= 0 && rr >= 0 && cc < cols && rr < rows && test(rr * cols + cc)) return true;
    }
    return false;
  };
  /** @type {number[]} */
  const samples = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    // South shore: land with SGU's sea in the row above (north).
    if (gulf[i] && surface[i] === SURFACE.land && r + 1 < rows && [c - 1, c, c + 1].some((cc) => cc >= 0 && cc < cols && surface[(r + 1) * cols + cc] === SURFACE.water)) samples.push(g.height(c, r));
  }
  samples.sort((a, b) => a - b);
  const q = (/** @type {number} */ f) => samples[Math.min(samples.length - 1, Math.floor(f * samples.length))];
  const shore = samples.length ? { median: q(0.5), quartiles: [q(0.25), q(0.5), q(0.75)], samples: samples.length } : { median: null, quartiles: [], samples: 0 };
  const { level } = g;
  /** @type {number[]} */
  const queue = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (east[i] && surface[i] === SURFACE.land && g.height(c, r) <= level && near(c, r, (j) => !east[j] && surface[j] === SURFACE.water)) { surface[i] = SURFACE.water; queue.push(i); }
  }
  let flooded = queue.length;
  while (queue.length) {
    const i = /** @type {number} */ (queue.pop());
    const c = i % cols; const r = (i - c) / cols;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const cc = c + dc; const rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      const j = rr * cols + cc;
      if (east[j] && surface[j] === SURFACE.land && g.height(cc, rr) <= level) { surface[j] = SURFACE.water; queue.push(j); flooded++; }
    }
  }
  return { level, shore, flooded };
}

/**
 * Connected bodies of a mask (8 neighbours), by size, biggest first.
 * @param {Uint8Array} mask @param {number} cols @param {number} rows
 * @returns {{ sizes: number[], label: Int32Array }} `label` is the 1-based body of each cell (0: not in the mask), in discovery order
 */
export function bodies(mask, cols, rows) {
  const label = new Int32Array(mask.length);
  /** @type {number[]} */
  const sizes = [];
  /** @type {number[]} */
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    const id = sizes.length + 1;
    let size = 0;
    stack.push(s); label[s] = id;
    while (stack.length) {
      const i = /** @type {number} */ (stack.pop());
      size++;
      const c = i % cols; const r = (i - c) / cols;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc; const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
        const j = rr * cols + cc;
        if (mask[j] && !label[j]) { label[j] = id; stack.push(j); }
      }
    }
    sizes.push(size);
  }
  return { sizes, label };
}

// @ts-check
// The rules for the northern coast over time (tools/map/build-coast.mjs reads the inputs and
// writes the field; src/sim/coast-date.js reads it in the game). Pure functions, tested in Node.
//
// Since 1219 the land of Sweden, Åland, Finland and Estonia has risen out of the sea. Our estimate:
//   relative sea fall (mm a year) = k x (land uplift - 0.5)
// where the uplift is the NKG_RF17vel up rate, 0.5 mm a year stands for the rise of the sea
// itself (our own fit to dated shores, not a published figure: research notes, 11 October 2026),
// and k bends the rule to local studies (tools/map/coast-anchors.json): fitted at each control
// place, blended by inverse distance, and back to 1 within 150 km of every control place.
//
// A cell of today's land at height h (GEBCO) was under the sea until the year
//   today - 1000 h / fall
// unless something higher stood between it and the sea: a basin behind a sill stays sea only
// while the sill is under water. So each cell's year is the best route to the open sea, where a
// route is only as good as its highest point (a "widest path" flood from the sea).

import { createHash } from 'node:crypto';
import { COAST_BASE_YEAR, COAST_CODE, COAST_STEP } from '../../src/sim/coast-date.js';

export const COAST_PARAMS = Object.freeze({
  /** The year today's heights and coast stand for (the game's last forest anchor too). */
  today: 2021,
  /** mm a year: the sea's own rise, taken off the land's uplift. */
  seaRise: 0.5,
  /** Control places pull k towards their fit out to this distance, then k is 1. */
  radiusKm: 150,
  /** Where the sea fell less than this since 1219 nothing changes: whole-metre heights cannot show it. */
  minFallM: 0.5,
  /**
   * Nothing changes south of this latitude either: east Zealand, Bornholm and the coasts from
   * Pomerania to Lithuania, where the sea has moved less than 1 m since AD 1 (Lampe et al. 2010;
   * the HOLSEA points at Puck and on the German coast) and the coast changed by sand and by
   * people, which hand-drawn fixes show instead.
   */
  southLimitLat: 56.0,
  /** Today's land is read at least this high: GEBCO rounds to whole metres, and its coast is not ours. */
  minLandM: 0.5,
  /**
   * Where GEBCO has no land in a cell of today's land (its coast lies inland of Natural Earth's,
   * or a strait is too narrow for Natural Earth), the height is unknown. It is taken between
   * minLandM and this, higher where the land beside it is higher: low, but not all alike, so such
   * cells do not all come out of the sea in one year.
   */
  unknownMaxM: 1.0,
  /** Cell size in game units (500 m). */
  cell: 5,
  /** GEBCO samples per side of a cell, averaged (light smoothing). */
  samples: 3,
  /** Cells of today's sea that take the code of the land beside them. */
  spreadCells: 2,
  /** Control points older than this are not fitted (the uplift rate was faster then). */
  oldestFitYear: 800,
  /** The sea joins cell to cell across edges only (4 neighbours), never across a corner. */
  neighbours: 4,
});

/** The last code today's land can have: land by `today` at the latest. */
export const LAST_LAND_CODE = Math.floor((COAST_PARAMS.today - COAST_BASE_YEAR) / COAST_STEP);

/**
 * A fingerprint of the rules' settings and the control points, so a stale field is caught.
 * @param {string} anchorsText the text of tools/map/coast-anchors.json
 */
export function coastParamsSha256(anchorsText) {
  return createHash('sha256').update(JSON.stringify(COAST_PARAMS)).update('\n').update(anchorsText).digest('hex');
}

/**
 * The relative sea fall in mm a year.
 * @param {number} up land uplift, mm a year @param {number} k
 */
export const seaFall = (up, k) => k * (up - COAST_PARAMS.seaRise);

/**
 * The year a place at height h stopped being under the sea, on its own (ignoring sills).
 * -Infinity where the sea does not fall.
 * @param {number} h metres @param {number} fall mm a year
 */
export function ownYear(h, fall) {
  if (!(fall > 0)) return -Infinity;
  return COAST_PARAMS.today - (1000 * h) / fall;
}

/**
 * The code of a year: 0 by 1219, then one code per 4 years (a cell is land from 1219 + 4 x code).
 * Today's land never passes LAST_LAND_CODE.
 * @param {number} year
 */
export function codeOfYear(year) {
  if (!(year > COAST_BASE_YEAR)) return COAST_CODE.land;
  return Math.min(LAST_LAND_CODE, Math.ceil((year - COAST_BASE_YEAR) / COAST_STEP));
}

/**
 * @typedef {object} ControlPoint one entry of coast-anchors.json's points
 * @property {string} id @property {string} group @property {'value' | 'check' | 'below' | 'above'} use
 * @property {string} place @property {number} lon @property {number} lat @property {number} year
 * @property {number} rslM metres above today's sea @property {number} toleranceM
 */

/**
 * @typedef {object} FittedGroup
 * @property {string} group @property {number} k @property {number} x @property {number} y game units (the mean of its value points)
 * @property {string[]} points ids
 */

/**
 * Fits k for each group of 'value' points: least squares of rsl = k x rate x years, through zero.
 * @param {ControlPoint[]} points
 * @param {(p: ControlPoint) => { up: number, x: number, y: number }} at uplift and game units of a point
 * @returns {FittedGroup[]}
 */
export function fitGroups(points, at) {
  /** @type {Map<string, { sxy: number, sxx: number, x: number, y: number, ids: string[] }>} */
  const groups = new Map();
  for (const p of points) {
    if (p.use !== 'value') continue;
    if (p.year < COAST_PARAMS.oldestFitYear) throw new Error(`${p.id}: AD ${p.year} is older than the rule is fitted to`);
    const { up, x, y } = at(p);
    const unit = (seaFall(up, 1) * (COAST_PARAMS.today - p.year)) / 1000; // metres for k = 1
    if (!(unit > 0)) throw new Error(`${p.id}: the land does not rise there (uplift ${up.toFixed(2)} mm a year)`);
    const g = groups.get(p.group) ?? { sxy: 0, sxx: 0, x: 0, y: 0, ids: [] };
    g.sxy += unit * p.rslM; g.sxx += unit * unit; g.x += x; g.y += y; g.ids.push(p.id);
    groups.set(p.group, g);
  }
  return [...groups].map(([group, g]) => ({ group, k: g.sxy / g.sxx, x: g.x / g.ids.length, y: g.y / g.ids.length, points: g.ids }));
}

/**
 * k at a place: 1 plus each group's pull (k_i - 1), weighted by inverse distance squared and faded
 * to nothing at radiusKm, so it is exactly k_i at a control place and 1 far from all of them.
 * @param {FittedGroup[]} groups @param {number} unitKm km per game unit
 * @returns {(x: number, y: number) => number}
 */
export function kField(groups, unitKm = 0.1) {
  const R = COAST_PARAMS.radiusKm;
  return (x, y) => {
    let sw = 0; let swk = 0; let fade = 0;
    for (const g of groups) {
      const d = Math.hypot(x - g.x, y - g.y) * unitKm;
      if (d < 1e-6) return g.k;
      if (d >= R) continue;
      const w = 1 / (d * d);
      const f = (1 - (d / R) ** 2) ** 2;
      sw += w; swk += w * (g.k - 1);
      fade = Math.max(fade, f);
    }
    return sw > 0 ? 1 + (swk / sw) * fade : 1;
  };
}

/**
 * The modelled height of the sea above today's at a place and year, in metres.
 * @param {number} up @param {number} k @param {number} year
 */
export const seaAbove = (up, k, year) => (seaFall(up, k) * (COAST_PARAMS.today - year)) / 1000;

/**
 * Each cell's own code from its height and fall (sea cells 254). Land below minLandM reads as
 * minLandM; where the sea fell less than minFallM since 1219, nothing changes (code 0).
 * @param {{ land: Uint8Array, heights: Float32Array, fall: Float32Array }} g
 * @returns {Uint8Array}
 */
export function ownCodes({ land, heights, fall }) {
  const out = new Uint8Array(land.length);
  const span = (COAST_PARAMS.today - COAST_BASE_YEAR) / 1000;
  for (let i = 0; i < land.length; i++) {
    if (!land[i]) { out[i] = COAST_CODE.sea; continue; }
    if (!(fall[i] * span >= COAST_PARAMS.minFallM)) { out[i] = COAST_CODE.land; continue; }
    const h = Math.max(COAST_PARAMS.minLandM, heights[i]);
    out[i] = codeOfYear(ownYear(h, fall[i]));
  }
  return out;
}

/**
 * The widest-path flood: each cell's code is the best, over all routes from the open sea (code
 * 254), of the lowest own code on the route (its highest sill), and never above its own. A
 * bucket queue over the 255 codes makes it one pass. Cells the sea never reaches stay 0.
 * @param {Uint8Array} own @param {number} cols @param {number} rows
 * @returns {Uint8Array}
 */
export function floodCodes(own, cols, rows) {
  const out = new Uint8Array(own.length);
  /** @type {number[][]} */
  const buckets = Array.from({ length: 256 }, () => []);
  for (let i = 0; i < own.length; i++) if (own[i] === COAST_CODE.sea) { out[i] = COAST_CODE.sea; buckets[COAST_CODE.sea].push(i); }
  const done = new Uint8Array(own.length);
  for (let v = 255; v >= 1; v--) {
    const bucket = buckets[v];
    // The bucket can grow while it is read: cells reached at the same value join it.
    for (let b = 0; b < bucket.length; b++) {
      const i = bucket[b];
      if (done[i] || out[i] !== v) continue;
      done[i] = 1;
      const c = i % cols;
      const r = (i - c) / cols;
      for (let q = 0; q < 4; q++) {
        const nc = q === 0 ? c - 1 : q === 1 ? c + 1 : c;
        const nr = q === 2 ? r - 1 : q === 3 ? r + 1 : r;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const n = nr * cols + nc;
        if (done[n]) continue;
        const cand = Math.min(own[n], v);
        if (cand > out[n]) { out[n] = cand; buckets[cand].push(n); }
      }
    }
    buckets[v] = [];
  }
  return out;
}

/**
 * Cells of today's sea within `radius` cells of the land (a square around each) take the
 * smallest code of that land: so the old shore, drawn by interpolating between cell centres, ends
 * on today's coast instead of leaving a sliver of old sea on today's land.
 * @param {Uint8Array} codes changed in place @param {Uint8Array} land 1 for today's land
 * @param {number} cols @param {number} rows @param {number} radius
 */
export function spreadIntoSea(codes, land, cols, rows, radius) {
  const NONE = 255;
  const a = new Uint8Array(codes.length).fill(NONE);
  for (let i = 0; i < codes.length; i++) if (land[i]) a[i] = codes[i];
  const b = new Uint8Array(codes.length);
  // A square minimum filter, rows then columns.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let m = NONE;
      for (let d = -radius; d <= radius; d++) { const cc = c + d; if (cc >= 0 && cc < cols) m = Math.min(m, a[r * cols + cc]); }
      b[r * cols + c] = m;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (land[i]) continue;
      let m = NONE;
      for (let d = -radius; d <= radius; d++) { const rr = r + d; if (rr >= 0 && rr < rows) m = Math.min(m, b[rr * cols + c]); }
      if (m !== NONE) codes[i] = m;
    }
  }
  return codes;
}

/**
 * Chamfer distance (in cells, 3-4 weights / 3) from every cell to the nearest cell where `from` is
 * set. Two passes.
 * @param {Uint8Array} from @param {number} cols @param {number} rows
 * @returns {Float32Array}
 */
export function chamferDistance(from, cols, rows) {
  const BIG = 1e9;
  const d = new Float32Array(from.length);
  for (let i = 0; i < d.length; i++) d[i] = from[i] ? 0 : BIG;
  const relax = (/** @type {number} */ i, /** @type {number} */ j, /** @type {number} */ w) => { if (d[j] + w < d[i]) d[i] = d[j] + w; };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c > 0) relax(i, i - 1, 3);
      if (r > 0) {
        relax(i, i - cols, 3);
        if (c > 0) relax(i, i - cols - 1, 4);
        if (c + 1 < cols) relax(i, i - cols + 1, 4);
      }
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      if (c + 1 < cols) relax(i, i + 1, 3);
      if (r + 1 < rows) {
        relax(i, i + cols, 3);
        if (c + 1 < cols) relax(i, i + cols + 1, 4);
        if (c > 0) relax(i, i + cols - 1, 4);
      }
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/**
 * Emergence codes from per-century sea maps (SGU's model): a cell that is sea in one century's
 * map and not in the next emerged between the two; within the century it is placed by its
 * distance from the older shore against its distance to the newer one, so the shore moves
 * steadily across the century. Lakes count as not sea, so a bay cut off by a sill becomes a lake
 * in the century SGU says. Cells already not sea in the oldest map read as land before 1219.
 * Cells still sea in the newest map but land today emerged between it and today.
 * @param {{ year: number, sea: Uint8Array }[]} centuries oldest first; sea: 1 where sea
 * @param {Uint8Array} land today's land @param {number} cols @param {number} rows
 * @returns {Uint8Array} codes for today's land (254 elsewhere)
 */
export function codesFromCenturies(centuries, land, cols, rows) {
  if (!centuries.length) throw new Error('no century maps');
  const maps = [...centuries, { year: COAST_PARAMS.today, sea: new Uint8Array(land.length).map((_, i) => (land[i] ? 0 : 1)) }];
  const out = new Uint8Array(land.length).fill(COAST_CODE.sea);
  for (let i = 0; i < land.length; i++) if (land[i] && !maps[0].sea[i]) out[i] = COAST_CODE.land;
  for (let m = 0; m + 1 < maps.length; m++) {
    const older = maps[m]; const newer = maps[m + 1];
    const notSeaOld = older.sea.map((v) => (v ? 0 : 1));
    const dOld = chamferDistance(notSeaOld, cols, rows);
    const dNew = chamferDistance(newer.sea, cols, rows);
    for (let i = 0; i < land.length; i++) {
      if (!land[i] || !older.sea[i] || newer.sea[i]) continue;
      const f = dOld[i] / Math.max(1e-6, dOld[i] + dNew[i]);
      out[i] = codeOfYear(older.year + f * (newer.year - older.year));
    }
  }
  return out;
}

/**
 * Fills the heights of today's land cells where GEBCO has no land (NaN): from the mean height m
 * of their known land neighbours (8 around), minLandM + (unknownMaxM - minLandM) x m / (m + 2),
 * so 0.75 m beside land of 2 m and close to 1 m beside high land; minLandM with no known
 * neighbour. Sea cells are left as they are.
 * @param {Float32Array} heights changed in place @param {Uint8Array} land @param {number} cols @param {number} rows
 * @returns {number} how many cells were filled
 */
export function fillUnknownHeights(heights, land, cols, rows) {
  const { minLandM, unknownMaxM } = COAST_PARAMS;
  const known = heights.slice();
  let filled = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!land[i] || known[i] === known[i]) continue;
      let s = 0; let k = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr; const cc = c + dc;
          if ((dr || dc) && rr >= 0 && cc >= 0 && rr < rows && cc < cols) {
            const v = known[rr * cols + cc];
            if (v === v && land[rr * cols + cc]) { s += v; k++; }
          }
        }
      }
      const m = k ? Math.max(0, s / k) : 0;
      heights[i] = minLandM + ((unknownMaxM - minLandM) * m) / (m + 2);
      filled++;
    }
  }
  return filled;
}

/**
 * A lake that was a bay of the sea until its outlet rose (Lake Mälaren): its cells stay sea for as
 * long as the sea reaches them, and a channel from the lake to today's sea, along the shortest
 * route from a point at the outlet, stays open until the year the outlet closed. The flood then
 * makes the whole lake a bay until that year, and a lake after.
 * @param {Uint8Array} own changed in place @param {Uint8Array} lake 1 inside the lake
 * @param {Uint8Array} land today's land @param {number} cols @param {number} rows
 * @param {number} outletCell a cell at the outlet @param {number} closedYear
 * @returns {number[]} the channel's cells
 */
export function openOutlet(own, lake, land, cols, rows, outletCell, closedYear) {
  const code = codeOfYear(closedYear);
  for (let i = 0; i < own.length; i++) if (lake[i] && land[i]) own[i] = LAST_LAND_CODE;
  // Where the lake's own outline already meets today's sea (Natural Earth draws Mälaren out to
  // Strömmen), those lake cells are the mouth: they close in the same year.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!lake[i] || !land[i]) continue;
      if ((c > 0 && !land[i - 1]) || (c + 1 < cols && !land[i + 1]) || (r > 0 && !land[i - cols]) || (r + 1 < rows && !land[i + cols])) own[i] = code;
    }
  }
  // Breadth-first from the outlet to the nearest cell of today's sea.
  const prev = new Int32Array(own.length).fill(-1);
  prev[outletCell] = outletCell;
  const queue = [outletCell];
  let reached = -1;
  for (let q = 0; q < queue.length && reached < 0; q++) {
    const i = queue[q];
    const c = i % cols; const r = (i - c) / cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc; const rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      const n = rr * cols + cc;
      if (prev[n] >= 0) continue;
      prev[n] = i;
      if (!land[n]) { reached = n; break; }
      queue.push(n);
    }
  }
  if (reached < 0) throw new Error('no route from the outlet to the sea');
  const channel = [];
  for (let i = prev[reached]; i !== outletCell; i = prev[i]) {
    if (!lake[i]) { own[i] = code; channel.push(i); }
  }
  if (!lake[outletCell]) { own[outletCell] = code; channel.push(outletCell); }
  return channel;
}

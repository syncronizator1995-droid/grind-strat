// @ts-check
// The old sea and its shore, as geometry: what the map draws over today's land where the sea
// stood higher in the game's year (src/sim/coast-date.js has the field and its codes). Pure: no
// canvas here, so it is tested in Node; the view turns the rings and lines into Path2D objects.
//
// The field's cell centres are the corners of "squares". At a year's level L a corner is sea
// when its code is above L, so the shore is the line where the field crosses L + 0.5, found by
// marching squares with linear interpolation along each square's edges: the shore slides
// smoothly between cells as the years pass instead of jumping a whole 500 m cell at a time.
//
// Only squares that can hold old sea over today's land are kept: not those with every corner 0
// (land all game), and not those with any corner 254 (today's open sea). The field carries the
// land's codes two cells out into today's sea, so a square with a 254 corner lies wholly over
// today's sea, where the map draws the sea already; leaving it out also means no old shore is
// ever drawn along a coast that does not change. The kept squares are sorted by their highest
// corner, so a year visits only the squares that are still partly sea (the list's tail), and
// that tail shrinks as the land rises.
//
// What comes out, in game units (row 0 at the south, so counter-clockwise rings):
//   fill   rings of old sea in one flat array: whole squares merged into runs along each row,
//          plus the sea part of each mixed square. All counter-clockwise: filled together as one
//          path with the nonzero rule they leave no seams.
//   lines  the old shore, as polylines (a closed loop repeats its first point).

import { COAST_CODE } from '../../sim/coast-date.js';

/**
 * @typedef {object} ShoreSquares the squares of a field, built once
 * @property {import('../../sim/coast-date.js').CoastBox} box
 * @property {Uint8Array} codes
 * @property {Int32Array} squares each kept square (r * cols + c of its south-west corner), in row order
 * @property {Uint8Array} lowest its lowest corner
 * @property {Int32Array} byHighest kept squares (positions in `squares`) sorted by their highest corner
 * @property {Uint8Array} highest the highest corner of each, ascending
 * @property {{ xy: Float64Array, on: Uint8Array, segEdge: Int32Array, segXY: Float64Array }} scratch reused by shoreAt
 */

/**
 * @typedef {object} Rings rings in one flat array: ring k is xy[2 * ends[k - 1] .. 2 * ends[k])
 * @property {Float64Array} xy flat [x0, y0, x1, y1, ...] in game units
 * @property {Int32Array} ends where each ring ends, in points
 */

/**
 * Lists the squares that can hold old sea over today's land, sorted by their highest corner.
 * @param {import('../../sim/coast-date.js').CoastBox} box @param {Uint8Array} codes
 * @returns {ShoreSquares}
 */
export function shoreSquares(box, codes) {
  const { cols, rows } = box;
  const SEA = COAST_CODE.sea;
  let n = 0;
  const keep = new Int32Array(Math.max(0, (cols - 1) * (rows - 1)));
  const lo = new Uint8Array(keep.length);
  const hi = new Uint8Array(keep.length);
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const i = r * cols + c;
      const a = codes[i]; const b = codes[i + 1]; const d = codes[i + cols]; const e = codes[i + cols + 1];
      if ((a | b | d | e) === 0) continue;
      if (a === SEA || b === SEA || d === SEA || e === SEA) continue;
      keep[n] = i;
      lo[n] = Math.min(a, b, d, e);
      hi[n] = Math.max(a, b, d, e);
      n++;
    }
  }
  const squares = keep.slice(0, n);
  const lowest = lo.slice(0, n);
  // Counting sort by highest corner (stable: squares of one value stay in row order).
  const start = new Int32Array(257);
  for (let k = 0; k < n; k++) start[hi[k] + 1]++;
  for (let v = 0; v < 256; v++) start[v + 1] += start[v];
  const byHighest = new Int32Array(n);
  const highest = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const at = start[hi[k]]++;
    byHighest[at] = k;
    highest[at] = hi[k];
  }
  return { box, codes, squares, lowest, byHighest, highest, scratch: { xy: new Float64Array(1024), on: new Uint8Array(n), segEdge: new Int32Array(256), segXY: new Float64Array(512) } };
}

/**
 * The first listed square whose highest corner is above the level (binary search).
 * @param {Uint8Array} highest @param {number} level
 */
function firstAbove(highest, level) {
  let lo = 0; let hi = highest.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (highest[mid] > level) hi = mid; else lo = mid + 1;
  }
  return lo;
}

/**
 * The old sea and its shore at a level (see coastLevel in src/sim/coast-date.js). The fill's
 * arrays are views into a buffer the next call reuses: copy them (or build the path) first.
 * `within` limits the work to the squares that touch a rectangle of game units (the part of the
 * map on screen, say): the cost then follows the view, not the whole north.
 * @param {ShoreSquares} s @param {number} level
 * @param {{ within?: { x0: number, y0: number, x1: number, y1: number } }} [opts]
 * @returns {{ fill: Rings, lines: number[][], squares: number }} squares: how many were still partly sea
 */
export function shoreAt(s, level, opts = {}) {
  const { box, codes, squares, lowest, byHighest, highest, scratch } = s;
  const { cols, col0, row0, cell } = box;
  const iso = level + 0.5;
  const from = firstAbove(highest, level);
  const active = highest.length - from;
  // Mark the squares still partly sea, then walk them in row order, so whole squares next to
  // each other along a row merge into one rectangle without sorting.
  const on = scratch.on;
  on.fill(0);
  for (let k = from; k < byHighest.length; k++) on[byHighest[k]] = 1;
  // At most 6 points per square (a saddle's two triangles), 4 per run.
  if (scratch.xy.length < active * 12 + 16) scratch.xy = new Float64Array(active * 16 + 1024);
  const xy = scratch.xy;
  /** @type {number[]} */
  const ends = [];
  let p = 0; // floats written

  // Shore segments: the two edges each one joins, and the two crossing points.
  if (scratch.segEdge.length < active * 4) { scratch.segEdge = new Int32Array(active * 4 + 256); scratch.segXY = new Float64Array(active * 8 + 512); }
  const segEdge = scratch.segEdge; const segXY = scratch.segXY;
  let nSeg = 0;

  const x0 = (col0 + 0.5) * cell; const y0 = (row0 + 0.5) * cell;
  // Squares (by their south-west corner's column and row) that touch the `within` rectangle.
  const w = opts.within;
  const cMin = w ? Math.floor((w.x0 - x0) / cell) : -Infinity; const cMax = w ? Math.floor((w.x1 - x0) / cell) : Infinity;
  const rMin = w ? Math.floor((w.y0 - y0) / cell) : -Infinity; const rMax = w ? Math.floor((w.y1 - y0) / cell) : Infinity;
  let runStart = -1; let runEnd = -1; // square indices of the current run of whole squares
  const flushRun = () => {
    if (runStart < 0) return;
    const c = runStart % cols; const r = (runStart - c) / cols;
    const c1 = runEnd % cols + 1;
    const xa = x0 + c * cell; const xb = x0 + c1 * cell; const ya = y0 + r * cell; const yb = ya + cell;
    xy[p++] = xa; xy[p++] = ya; xy[p++] = xb; xy[p++] = ya; xy[p++] = xb; xy[p++] = yb; xy[p++] = xa; xy[p++] = yb;
    ends.push(p >> 1);
    runStart = -1;
  };

  // Corner values and positions of the square being worked on, counter-clockwise from the
  // south-west; reused, so the loop allocates nothing per square.
  const v = [0, 0, 0, 0]; const cx = [0, 0, 0, 0]; const cy = [0, 0, 0, 0];
  const sea = [false, false, false, false]; const edge = [0, 0, 0, 0];
  let qx = 0; let qy = 0; // the last crossing found
  /**
   * Where the shore crosses edge q of the square, into qx, qy. Computed from the edge's own two
   * corners in a fixed direction (west to east, south to north), so both squares that share an
   * edge get exactly the same point.
   * @param {number} q
   */
  const cross = (q) => {
    // Edge q runs from corner q to corner q + 1; edges 0 and 1 run east and north, 2 and 3 back.
    const a = q < 2 ? q : (q + 1) % 4; const b = q < 2 ? q + 1 : q;
    const t = (iso - v[a]) / (v[b] - v[a]);
    qx = cx[a] + t * (cx[b] - cx[a]); qy = cy[a] + t * (cy[b] - cy[a]);
  };
  /** Records a shore segment between the crossings on edges qa and qb. @param {number} qa @param {number} qb */
  const addSegment = (qa, qb) => {
    segEdge[2 * nSeg] = edge[qa]; segEdge[2 * nSeg + 1] = edge[qb];
    cross(qa); segXY[4 * nSeg] = qx; segXY[4 * nSeg + 1] = qy;
    cross(qb); segXY[4 * nSeg + 2] = qx; segXY[4 * nSeg + 3] = qy;
    nSeg++;
  };

  for (let k = 0; k < squares.length; k++) {
    if (!on[k]) continue;
    const i = squares[k];
    if (w) {
      const c = i % cols; const r = (i - c) / cols;
      if (c < cMin || c > cMax || r < rMin || r > rMax) continue;
    }
    if (lowest[k] > level) {
      // Whole square under the sea: extend the run, or start one.
      if (runStart >= 0 && i === runEnd + 1 && i % cols !== 0) runEnd = i;
      else { flushRun(); runStart = i; runEnd = i; }
      continue;
    }
    flushRun();
    const c = i % cols; const r = (i - c) / cols;
    const xa = x0 + c * cell; const xb = x0 + (c + 1) * cell; const ya = y0 + r * cell; const yb = y0 + (r + 1) * cell;
    v[0] = codes[i]; v[1] = codes[i + 1]; v[2] = codes[i + cols + 1]; v[3] = codes[i + cols];
    cx[0] = xa; cx[1] = xb; cx[2] = xb; cx[3] = xa;
    cy[0] = ya; cy[1] = ya; cy[2] = yb; cy[3] = yb;
    edge[0] = 2 * i; edge[1] = 2 * (i + 1) + 1; edge[2] = 2 * (i + cols); edge[3] = 2 * i + 1;
    let n = 0;
    for (let q = 0; q < 4; q++) { sea[q] = v[q] > level; if (sea[q]) n++; }
    // A saddle (sea at two opposite corners only): the centre decides whether the sea joins.
    const saddle = n === 2 && sea[0] === sea[2];
    const joined = saddle && (v[0] + v[1] + v[2] + v[3]) / 4 > iso;
    if (saddle && !joined) {
      // Two triangles, one round each sea corner: [crossing before it, the corner, crossing after].
      for (let q = 0; q < 4; q++) {
        if (!sea[q]) continue;
        cross((q + 3) % 4); xy[p++] = qx; xy[p++] = qy;
        xy[p++] = cx[q]; xy[p++] = cy[q];
        cross(q); xy[p++] = qx; xy[p++] = qy;
        ends.push(p >> 1);
      }
    } else {
      // One ring: walk the corners, taking the sea ones and every crossing.
      for (let q = 0; q < 4; q++) {
        if (sea[q]) { xy[p++] = cx[q]; xy[p++] = cy[q]; }
        if (sea[q] !== sea[(q + 1) % 4]) { cross(q); xy[p++] = qx; xy[p++] = qy; }
      }
      ends.push(p >> 1);
    }
    // The shore: pair the edges the walk crosses, sea-to-land with the next land-to-sea.
    if (n === 2 && saddle) {
      const pairs = sea[0] === joined ? [0, 1, 2, 3] : [1, 2, 3, 0];
      for (let m = 0; m < 4; m += 2) addSegment(pairs[m], pairs[m + 1]);
    } else {
      let a = -1;
      for (let q = 0; q < 4; q++) {
        if (sea[q] === sea[(q + 1) % 4]) continue;
        if (a < 0) a = q; else addSegment(a, q);
      }
    }
  }
  flushRun();
  const lines = joinSegments(segEdge, segXY, nSeg);
  return { fill: { xy: xy.subarray(0, p), ends: Int32Array.from(ends) }, lines, squares: active };
}

/**
 * The rings of a Rings set as separate arrays (for tests and tools; the view reads xy directly).
 * @param {Rings} rings
 * @returns {number[][]}
 */
export function ringList(rings) {
  const out = [];
  let a = 0;
  for (const e of rings.ends) { out.push(Array.from(rings.xy.subarray(2 * a, 2 * e))); a = e; }
  return out;
}

/**
 * Joins segments that share an edge into polylines (a closed loop repeats its first point). An
 * edge is shared by at most two segments (one from each square beside it), found through a small
 * hash table of edge ids.
 * @param {Int32Array} segEdge the two edge ids of each segment
 * @param {Float64Array} segXY the two end points of each segment, in the same order
 * @param {number} n how many segments
 * @returns {number[][]}
 */
function joinSegments(segEdge, segXY, n) {
  let size = 16;
  while (size < n * 4) size *= 2;
  const mask = size - 1;
  const keys = new Int32Array(size).fill(-1);
  const first = new Int32Array(size).fill(-1);
  const second = new Int32Array(size).fill(-1);
  /** The table slot of an edge id, found or new. @param {number} id */
  const slot = (id) => {
    let h = Math.imul(id, 0x9e3779b1) & mask;
    while (keys[h] !== -1 && keys[h] !== id) h = (h + 1) & mask;
    return h;
  };
  for (let s = 0; s < 2 * n; s++) {
    const h = slot(segEdge[s]);
    keys[h] = segEdge[s];
    if (first[h] < 0) first[h] = s >> 1; else second[h] = s >> 1;
  }
  const used = new Uint8Array(n);
  /** The other unused segment at end e (0 or 1) of segment s, or -1. @param {number} s @param {number} e */
  const nextAt = (s, e) => {
    const h = slot(segEdge[2 * s + e]);
    const t = first[h] === s ? second[h] : first[h];
    return t >= 0 && !used[t] ? t : -1;
  };
  /** @type {number[][]} */
  const lines = [];
  /** @param {boolean} openOnly */
  const walkAll = (openOnly) => {
    for (let s0 = 0; s0 < n; s0++) {
      if (used[s0]) continue;
      // First pass: start only at open ends, so open lines come out whole; then the loops.
      const open0 = nextAt(s0, 0) < 0; const open1 = nextAt(s0, 1) < 0;
      if (openOnly && !open0 && !open1) continue;
      used[s0] = 1;
      // Walk from the open end (end 0 unless only end 1 is open).
      const startEnd = open0 || !open1 ? 0 : 1;
      const line = [segXY[4 * s0 + 2 * startEnd], segXY[4 * s0 + 2 * startEnd + 1], segXY[4 * s0 + 2 * (1 - startEnd)], segXY[4 * s0 + 2 * (1 - startEnd) + 1]];
      let s = s0; let tipEdge = segEdge[2 * s0 + 1 - startEnd];
      for (;;) {
        const e = segEdge[2 * s] === tipEdge ? 0 : 1;
        const t = nextAt(s, e);
        if (t < 0) break;
        used[t] = 1;
        const te = segEdge[2 * t] === tipEdge ? 1 : 0; // the far end of t
        line.push(segXY[4 * t + 2 * te], segXY[4 * t + 2 * te + 1]);
        tipEdge = segEdge[2 * t + te];
        s = t;
      }
      lines.push(line);
    }
  };
  walkAll(true);
  walkAll(false);
  return lines;
}

/**
 * The field at a coarser cell (`factor` cells a side become one), for the zoomed-out map, where a
 * 500 m cell is far below a pixel and the full field's shore would cost a phone tens of
 * milliseconds a step. A coarse cell takes the highest code among its cells that are not open
 * sea (254 only when all are), so the old sea along a coast is kept rather than dropped.
 * @param {import('../../sim/coast-date.js').CoastBox} box @param {Uint8Array} codes @param {number} factor
 * @returns {{ box: import('../../sim/coast-date.js').CoastBox, codes: Uint8Array }}
 */
export function coarseField(box, codes, factor) {
  const cols = Math.ceil(box.cols / factor);
  const rows = Math.ceil(box.rows / factor);
  const out = new Uint8Array(cols * rows).fill(COAST_CODE.sea);
  const seen = new Uint8Array(cols * rows);
  for (let r = 0; r < box.rows; r++) {
    const at = Math.floor(r / factor) * cols;
    for (let c = 0; c < box.cols; c++) {
      const v = codes[r * box.cols + c];
      if (v === COAST_CODE.sea) continue;
      const k = at + Math.floor(c / factor);
      if (!seen[k] || v > out[k]) { out[k] = v; seen[k] = 1; }
    }
  }
  return { box: { col0: box.col0 / factor, row0: box.row0 / factor, cols, rows, cell: box.cell * factor }, codes: out };
}

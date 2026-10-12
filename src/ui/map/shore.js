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
// Only squares that can hold old sea over today's land are kept: not those with every corner
// 254 (today's open sea, drawn already), not those with every corner 0 (land all game). They
// are sorted by their highest corner, so a year only visits the squares that are still partly sea
// (the list's tail), and that tail shrinks as the land rises.
//
// What comes out, in game units (row 0 at the south, so counter-clockwise rings):
//   fill   rings of old sea: whole squares merged into runs along each row, plus the sea part
//          of each mixed square. All counter-clockwise: filled together as one path with the
//          nonzero rule they leave no seams.
//   lines  the old shore, as polylines, only in squares with no 254 corner: where a corner is
//          today's open sea the shore is today's coast, which the map draws already.

import { COAST_CODE } from '../../sim/coast-date.js';

/**
 * @typedef {object} ShoreSquares the squares of a field, built once
 * @property {import('../../sim/coast-date.js').CoastBox} box
 * @property {Uint8Array} codes
 * @property {Int32Array} squares square index (r * cols + c of its south-west corner), by highest corner
 * @property {Uint8Array} highest each listed square's highest corner, ascending
 */

/**
 * Lists the squares that can hold old sea over today's land, sorted by their highest corner.
 * @param {import('../../sim/coast-date.js').CoastBox} box @param {Uint8Array} codes
 * @returns {ShoreSquares}
 */
export function shoreSquares(box, codes) {
  const { cols, rows } = box;
  const count = new Int32Array(256);
  const keep = [];
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const i = r * cols + c;
      const a = codes[i]; const b = codes[i + 1]; const d = codes[i + cols]; const e = codes[i + cols + 1];
      const hi = Math.max(a, b, d, e);
      if (hi === COAST_CODE.land) continue;
      if (a === COAST_CODE.sea && b === COAST_CODE.sea && d === COAST_CODE.sea && e === COAST_CODE.sea) continue;
      keep.push(i);
      count[hi]++;
    }
  }
  // Counting sort by highest corner (stable, so squares of one value stay in row order).
  const startAt = new Int32Array(257);
  for (let v = 0; v < 256; v++) startAt[v + 1] = startAt[v] + count[v];
  const squares = new Int32Array(keep.length);
  const highest = new Uint8Array(keep.length);
  const at = startAt.slice();
  for (const i of keep) {
    const hi = Math.max(codes[i], codes[i + 1], codes[i + cols], codes[i + cols + 1]);
    const k = at[hi]++;
    squares[k] = i;
    highest[k] = hi;
  }
  return { box, codes, squares, highest };
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
 * The old sea and its shore at a level (see coastLevel in src/sim/coast-date.js).
 * @param {ShoreSquares} s @param {number} level
 * @returns {{ fill: number[][], lines: number[][], squares: number }} squares: how many were visited
 */
export function shoreAt(s, level) {
  const { box, codes, squares, highest } = s;
  const { cols, col0, row0, cell } = box;
  const iso = level + 0.5;
  /** @type {number[][]} */
  const fill = [];
  /** @type {number[]} whole-sea squares, to merge into runs */
  const whole = [];
  /** @type {number[]} shore segments, as the two edges each one joins: flat [edgeA, edgeB, ...] */
  const segments = [];
  /** @type {Map<number, [number, number]>} crossing point of each edge, computed once */
  const points = new Map();
  const from = firstAbove(highest, level);

  /** Game-unit x of corner column c. @param {number} c */
  const gx = (c) => (col0 + c + 0.5) * cell;
  /** @param {number} r */
  const gy = (r) => (row0 + r + 0.5) * cell;

  /**
   * Where the shore crosses an edge. Edge ids: 2i for the edge from corner i east to i + 1, 2i + 1
   * for the edge from corner i north to i + cols. Computed from the edge's own two corners in a
   * fixed direction, so both squares that share an edge get exactly the same point.
   * @param {number} id
   * @returns {[number, number]}
   */
  const crossing = (id) => {
    let p = points.get(id);
    if (p) return p;
    const i = id >> 1;
    const j = id & 1 ? i + cols : i + 1;
    const va = codes[i]; const vb = codes[j];
    const t = (iso - va) / (vb - va);
    const c = i % cols; const r = (i - c) / cols;
    p = id & 1 ? [gx(c), gy(r) + t * cell] : [gx(c) + t * cell, gy(r)];
    points.set(id, p);
    return p;
  };

  for (let k = from; k < squares.length; k++) {
    const i = squares[k];
    // Corners counter-clockwise from the south-west, with the edge that follows each one.
    const corner = [i, i + 1, i + cols + 1, i + cols];
    const edge = [2 * i, 2 * (i + 1) + 1, 2 * (i + cols), 2 * i + 1];
    const v = corner.map((q) => codes[q]);
    const sea = v.map((x) => x > level);
    const n = sea.filter(Boolean).length;
    if (n === 4) { whole.push(i); continue; }
    const c = i % cols; const r = (i - c) / cols;
    const xy = [[gx(c), gy(r)], [gx(c + 1), gy(r)], [gx(c + 1), gy(r + 1)], [gx(c), gy(r + 1)]];
    // A saddle (sea at two opposite corners only): the centre decides whether the sea joins.
    const saddle = n === 2 && sea[0] === sea[2];
    const joined = saddle && (v[0] + v[1] + v[2] + v[3]) / 4 > iso;
    /** @type {number[][]} */
    const pieces = [];
    /** @type {number[]} */
    let ring = [];
    for (let q = 0; q < 4; q++) {
      if (sea[q]) ring.push(xy[q][0], xy[q][1]);
      if (sea[q] !== sea[(q + 1) % 4]) {
        const [x, y] = crossing(edge[q]);
        ring.push(x, y);
        // In a saddle that does not join, each sea corner is a piece of its own: close the ring
        // when the walk leaves the sea.
        if (saddle && !joined && sea[q]) { pieces.push(ring); ring = []; }
      }
    }
    if (ring.length) {
      // A saddle walk that began in the sea closed its first piece before reaching the edge the
      // piece starts on: that edge's point, left over at the end, goes in front of it.
      if (pieces.length && sea[0]) pieces[0] = [...ring, ...pieces[0]];
      else pieces.push(ring);
    }
    for (const p of pieces) if (p.length >= 6) fill.push(p);
    // The shore: pair the edges the walk crosses, sea-to-land with the next land-to-sea.
    const anyOpenSea = v.some((x) => x === COAST_CODE.sea);
    if (anyOpenSea) continue;
    /** @type {number[]} */
    const crossed = [];
    for (let q = 0; q < 4; q++) if (sea[q] !== sea[(q + 1) % 4]) crossed.push(q);
    // Two crossings: one segment. Four (a saddle): pair them so the segments go around the sea
    // corners when the sea does not join, around the land corners when it does.
    const pairs = crossed.length === 2 ? [[crossed[0], crossed[1]]]
      : (sea[0] === joined) ? [[0, 1], [2, 3]] : [[1, 2], [3, 0]];
    for (const [a, b] of pairs) {
      const ea = edge[a]; const eb = edge[b];
      segments.push(ea, eb);
      crossing(ea); crossing(eb);
    }
  }

  // Whole-sea squares: merge each row's neighbours into one rectangle.
  whole.sort((a, b) => a - b);
  for (let k = 0; k < whole.length;) {
    const i = whole[k];
    let j = k;
    while (j + 1 < whole.length && whole[j + 1] === whole[j] + 1 && (whole[j + 1] % cols) !== 0) j++;
    const c = i % cols; const r = (i - c) / cols;
    const c1 = c + (j - k) + 1;
    fill.push([gx(c), gy(r), gx(c1), gy(r), gx(c1), gy(r + 1), gx(c), gy(r + 1)]);
    k = j + 1;
  }

  const lines = joinSegments(segments, (id) => /** @type {[number, number]} */ (points.get(id)));
  return { fill, lines, squares: squares.length - from };
}

/**
 * Joins segments that share an edge into polylines (a closed loop repeats its first point).
 * @param {number[]} segments flat pairs of edge ids
 * @param {(id: number) => [number, number]} pointOf
 * @returns {number[][]}
 */
function joinSegments(segments, pointOf) {
  /** @type {Map<number, number[]>} edge id -> the segments that touch it (at most two) */
  const links = new Map();
  const n = segments.length / 2;
  for (let s = 0; s < n; s++) {
    for (const id of [segments[2 * s], segments[2 * s + 1]]) {
      const l = links.get(id);
      if (l) l.push(s); else links.set(id, [s]);
    }
  }
  const used = new Uint8Array(n);
  /** The segment at this edge other than s, not used yet, or -1. @param {number} id @param {number} s */
  const nextAt = (id, s) => {
    for (const t of links.get(id) ?? []) if (t !== s && !used[t]) return t;
    return -1;
  };
  /** @type {number[][]} */
  const lines = [];
  // Start from open ends first, so open lines come out whole; then the loops.
  const order = [];
  for (let s = 0; s < n; s++) {
    const open = (links.get(segments[2 * s])?.length ?? 0) < 2 || (links.get(segments[2 * s + 1])?.length ?? 0) < 2;
    if (open) order.push(s);
  }
  for (let s = 0; s < n; s++) order.push(s);
  for (const s0 of order) {
    if (used[s0]) continue;
    used[s0] = 1;
    // Walk away from the end with no neighbour, if there is one.
    let a = segments[2 * s0]; let b = segments[2 * s0 + 1];
    if (nextAt(b, s0) < 0) [a, b] = [b, a];
    const ids = [a, b];
    let s = s0; let tip = b;
    for (;;) {
      const t = nextAt(tip, s);
      if (t < 0) break;
      used[t] = 1;
      tip = segments[2 * t] === tip ? segments[2 * t + 1] : segments[2 * t];
      ids.push(tip);
      s = t;
    }
    const line = [];
    for (const id of ids) { const [x, y] = pointOf(id); line.push(x, y); }
    lines.push(line);
  }
  return lines;
}

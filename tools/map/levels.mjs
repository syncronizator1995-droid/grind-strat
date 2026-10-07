// @ts-check
// Levels of detail for lines and rings, worked out once at build time. Each point gets the
// coarsest zoom level that still needs it (0 = overview, 1 = middle, 2 = close up), so one copy
// of the points serves all three levels: the game draws level k from the points with level <= k.
// The levels nest (every point kept at level 0 is also kept at 1 and 2), which a plain
// simplification at three tolerances does not promise.

/** Tolerances in game units for levels 0 and 1; level 2 keeps every point. */
export const LEVEL_TOLERANCES = Object.freeze([12, 2.4]);
/** How many levels the view uses. */
export const LEVEL_COUNT = LEVEL_TOLERANCES.length + 1;

/**
 * Douglas-Peucker between two kept points, marking the points it keeps with `level`.
 * @param {ArrayLike<number>} pts flat [x0, y0, ...]
 * @param {number} a @param {number} b point indexes, both already kept
 * @param {number} tolerance
 * @param {Uint8Array} lvl
 * @param {number} level
 */
function refine(pts, a, b, tolerance, lvl, level) {
  const t2 = tolerance * tolerance;
  /** @type {[number, number][]} */
  const stack = [[a, b]];
  while (stack.length) {
    const [i0, i1] = /** @type {[number, number]} */ (stack.pop());
    const ax = pts[i0 * 2]; const ay = pts[i0 * 2 + 1];
    const dx = pts[i1 * 2] - ax; const dy = pts[i1 * 2 + 1] - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD = t2;
    for (let i = i0 + 1; i < i1; i++) {
      const px = pts[i * 2] - ax; const py = pts[i * 2 + 1] - ay;
      let d2;
      if (len2 === 0) d2 = px * px + py * py;
      else {
        const cross = px * dy - py * dx;
        d2 = (cross * cross) / len2;
      }
      if (d2 > worstD) { worstD = d2; worst = i; }
    }
    if (worst >= 0) {
      lvl[worst] = Math.min(lvl[worst], level);
      stack.push([i0, worst], [worst, i1]);
    }
  }
}

/**
 * Levels for every point of an open line (closed = false) or a ring (closed = true; the first
 * point is not repeated at the end).
 * @param {ArrayLike<number>} pts flat [x0, y0, ...]
 * @param {boolean} closed
 * @param {{ tolerances?: readonly number[], pin?: (x: number, y: number) => boolean, minLevel?: number }} [options]
 *   pin: points that every level keeps (for example, points on the map edge); minLevel: the
 *   shape is left out of coarser levels altogether (for example, small islands at the overview)
 * @returns {Uint8Array}
 */
export function pointLevels(pts, closed, { tolerances = LEVEL_TOLERANCES, pin, minLevel = 0 } = {}) {
  const n = pts.length / 2;
  const top = tolerances.length;
  const lvl = new Uint8Array(n).fill(top);
  if (n === 0) return lvl;
  // Work on an open line: a ring is cut at its first point and at the point farthest from it, so
  // both halves keep their ends, and the first point is repeated at the end while refining.
  const line = closed ? [...Array.from(pts), pts[0], pts[1]] : pts;
  const m = line.length / 2;
  /** @type {number[]} */
  const anchors = [0, m - 1];
  if (closed) {
    let far = 0;
    let farD = -1;
    for (let i = 1; i < n; i++) {
      const d = (pts[i * 2] - pts[0]) ** 2 + (pts[i * 2 + 1] - pts[1]) ** 2;
      if (d > farD) { farD = d; far = i; }
    }
    anchors.splice(1, 0, far);
  }
  const all = new Uint8Array(m).fill(top);
  for (const a of anchors) all[a] = 0;
  if (pin) for (let i = 0; i < m; i++) if (pin(line[i * 2], line[i * 2 + 1])) all[i] = 0;
  for (let level = 0; level < top; level++) {
    const kept = [];
    for (let i = 0; i < m; i++) if (all[i] <= level) kept.push(i);
    for (let k = 0; k + 1 < kept.length; k++) refine(line, kept[k], kept[k + 1], tolerances[level], all, level);
  }
  for (let i = 0; i < n; i++) lvl[i] = Math.max(all[i], Math.min(minLevel, top));
  return lvl;
}

/**
 * The points of a shape kept at `level`.
 * @param {ArrayLike<number>} pts @param {ArrayLike<number>} lvl @param {number} level
 * @returns {number[]}
 */
export function atLevel(pts, lvl, level) {
  /** @type {number[]} */
  const out = [];
  for (let i = 0; i < lvl.length; i++) if (lvl[i] <= level) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

/**
 * Joins per-shape levels into the one byte list a layer carries (one byte per point, in order).
 * @param {Uint8Array[]} perShape
 */
export function joinLevels(perShape) {
  const total = perShape.reduce((s, l) => s + l.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const l of perShape) {
    out.set(l, at);
    at += l.length;
  }
  return out;
}

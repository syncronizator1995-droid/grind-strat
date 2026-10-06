// @ts-check
// Geometry shared by the map tools (build time) and the game (to draw simpler outlines when
// zoomed out).

/**
 * Douglas-Peucker simplification, keeping the first and last points.
 * @param {ArrayLike<number>} pts flat [x0, y0, x1, y1, ...]
 * @param {number} tolerance in the same units
 * @returns {number[]}
 */
export function simplify(pts, tolerance) {
  const n = pts.length / 2;
  if (n <= 2) return Array.from(pts);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  /** @type {[number, number][]} */
  const stack = [[0, n - 1]];
  const t2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = /** @type {[number, number]} */ (stack.pop());
    const ax = pts[a * 2]; const ay = pts[a * 2 + 1];
    const dx = pts[b * 2] - ax; const dy = pts[b * 2 + 1] - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD = t2;
    for (let i = a + 1; i < b; i++) {
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
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  /** @type {number[]} */
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

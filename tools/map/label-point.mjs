// @ts-check
// Where a lake's name goes: the point inside the lake farthest from its shores (islands count as
// shore), found by a coarse search refined twice. Close enough for a label; worked out once at
// build time.

/**
 * Is (x, y) inside the rings (even-odd, so islands are outside)?
 * @param {number[][]} rings @param {number} x @param {number} y
 */
function inside(rings, x, y) {
  let c = false;
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = r[i * 2 + 1]; const yj = r[j * 2 + 1];
      if ((yi > y) !== (yj > y) && x < r[i * 2] + ((y - yi) * (r[j * 2] - r[i * 2])) / (yj - yi)) c = !c;
    }
  }
  return c;
}

/**
 * Squared distance from (x, y) to the nearest edge of any ring.
 * @param {number[][]} rings @param {number} x @param {number} y
 */
function shoreDistance2(rings, x, y) {
  let best = Infinity;
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = r[j * 2]; const ay = r[j * 2 + 1];
      const dx = r[i * 2] - ax; const dy = r[i * 2 + 1] - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - x; const ey = ay + t * dy - y;
      const d = ex * ex + ey * ey;
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * The label point of a lake, in whole game units.
 * @param {number[][]} rings outer rings and holes
 * @returns {[number, number]}
 */
export function labelPoint(rings) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      minX = Math.min(minX, r[i]); maxX = Math.max(maxX, r[i]);
      minY = Math.min(minY, r[i + 1]); maxY = Math.max(maxY, r[i + 1]);
    }
  }
  let best = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, d: -1 };
  let span = { w: maxX - minX, h: maxY - minY };
  let centre = { x: best.x, y: best.y };
  const N = 16;
  for (let round = 0; round < 3; round++) {
    for (let a = 0; a <= N; a++) {
      for (let b = 0; b <= N; b++) {
        const x = centre.x - span.w / 2 + (span.w * a) / N;
        const y = centre.y - span.h / 2 + (span.h * b) / N;
        if (!inside(rings, x, y)) continue;
        const d = shoreDistance2(rings, x, y);
        if (d > best.d) best = { x, y, d };
      }
    }
    centre = { x: best.x, y: best.y };
    span = { w: (span.w * 2.5) / N, h: (span.h * 2.5) / N };
  }
  if (best.d < 0) {
    // A sliver the search missed: the middle of the first edge is on the lake at least.
    const r = rings[0];
    return [Math.round((r[0] + r[2]) / 2), Math.round((r[1] + r[3]) / 2)];
  }
  return [Math.round(best.x), Math.round(best.y)];
}

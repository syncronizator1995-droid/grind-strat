// @ts-check
// What a tap on the map lands on: a name, a lake, a river or a sea. Pure (no DOM), so it runs in
// Node for tests. The view passes in what is drawn and shown; this file only measures.
// Also the tap tracker: a tap is a short touch that hardly moves; anything else is a pan.

import { bandShown, CHUNK, labelDiscs, nameLevel, riverBand } from './labels.js';

/** @typedef {{ kind: 'river', river: number, line: number } | { kind: 'lake', lake: number } | { kind: 'sea', sea: string }} WaterHit */

/** A tap lasts less than this long (ms)... */
export const TAP_MS = 600;
/** ...and moves less than this far (CSS px). Within it the map does not pan. */
export const TAP_SLOP_PX = 10;
/** A river counts as tapped within this many CSS px of its line. */
export const RIVER_PX = 20;
/** Inside a lake, a river within this many CSS px is preferred to the lake. */
export const RIVER_IN_LAKE_PX = 6;

/**
 * Is a point inside rings, by the even-odd rule (a ring inside a ring is a hole)?
 * @param {number} x @param {number} y @param {ArrayLike<number>[]} rings flat [x0, y0, ...]
 */
export function pointInRings(x, y, rings) {
  let inside = false;
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = r[i * 2]; const yi = r[i * 2 + 1]; const xj = r[j * 2]; const yj = r[j * 2 + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * Squared distance from a point to a segment.
 * @param {number} px @param {number} py @param {number} ax @param {number} ay @param {number} bx @param {number} by
 */
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax; const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
}

/**
 * The nearest shown river line within `maxPx` of a point.
 * @param {number} x @param {number} y game units
 * @param {number} maxPx @param {number} scale @param {number} level
 * @param {import('./load.js').WaterData} water @param {import('./labels.js').WaterIndex} index
 * @param {(line: number) => boolean} lineShown
 * @returns {{ river: number, line: number } | null}
 */
function nearestRiver(x, y, maxPx, scale, level, water, index, lineShown) {
  const tol = maxPx / scale;
  const lvl = nameLevel(level);
  let best = (tol) ** 2;
  /** @type {{ river: number, line: number } | null} */
  let found = null;
  const near = (/** @type {ArrayLike<number>} */ b, /** @type {number} */ at) => x >= b[at] - tol && x <= b[at + 2] + tol && y >= b[at + 1] - tol && y <= b[at + 3] + tol;
  water.riverInfo.forEach((info, k) => {
    if (!bandShown(riverBand(info.lengthKm), scale) || !near(index.riverBox, k * 4)) return;
    for (const i of index.linesOf[k]) {
      if (!near(index.lineBox, i * 4) || !lineShown(i)) continue;
      const line = index.levelLines[lvl][i];
      const chunks = index.chunkBox[lvl][i];
      const m = line.length / 2;
      for (let c = 0; c * 4 < chunks.length; c++) {
        if (!near(chunks, c * 4)) continue;
        for (let p = c * CHUNK, end = Math.min(m - 1, (c + 1) * CHUNK); p < end; p++) {
          const d = segDist2(x, y, line[p * 2], line[p * 2 + 1], line[p * 2 + 2], line[p * 2 + 3]);
          if (d <= best) { best = d; found = { river: k, line: i }; }
        }
      }
    }
  });
  return found;
}

/**
 * The sea a point belongs to: the first sea whose ring holds it, else the one without a ring.
 * @param {number} x @param {number} y @param {{ id: string, ring: number[] | null }[]} seas
 */
function seaOf(x, y, seas) {
  const ringed = seas.find((s) => s.ring && s.ring.length >= 6 && pointInRings(x, y, [s.ring]));
  return (ringed ?? seas.find((s) => !s.ring))?.id ?? null;
}

/**
 * What lies under a tap, first match of: a name, the old sea, a lake (unless a river runs close),
 * a river, today's sea.
 * @param {object} p
 * @param {number} p.x @param {number} p.y the tap, game units
 * @param {number} p.scale CSS px per game unit @param {number} p.level detail level drawn
 * @param {import('./load.js').WaterData} p.water @param {import('./labels.js').WaterIndex} p.index
 * @param {import('./labels.js').Label[] | null} p.labels the names on the kept frame (null mid-zoom)
 * @param {number} p.fx @param {number} p.fy the tap in the kept frame, CSS px
 * @param {(line: number) => boolean} p.lineShown @param {(lake: number) => boolean} p.lakeShown
 * @param {((x: number, y: number) => boolean) | undefined} [p.oldSea] is the point under the old sea?
 * @param {((x: number, y: number) => boolean) | undefined} [p.sea] is the point in today's sea?
 * @param {{ id: string, ring: number[] | null }[]} [p.seas]
 * @returns {WaterHit | null}
 */
export function hitWater({ x, y, scale, level, water, index, labels, fx, fy, lineShown, lakeShown, oldSea, sea, seas = [] }) {
  if (labels) {
    for (let i = labels.length - 1; i >= 0; i--) {
      const l = labels[i];
      if (l.width === undefined) continue;
      if (!labelDiscs(l.x, l.y, l.angle, l.width, l.size).some(([cx, cy, r]) => (cx - fx) ** 2 + (cy - fy) ** 2 <= r * r)) continue;
      if (l.river !== undefined && l.line !== undefined) return { kind: 'river', river: l.river, line: l.line };
      if (l.lake !== undefined) return { kind: 'lake', lake: l.lake };
    }
  }
  if (seas.length && oldSea?.(x, y)) {
    const id = seaOf(x, y, seas);
    if (id) return { kind: 'sea', sea: id };
  }
  const lake = lakeAt(x, y, level, water, index, lakeShown);
  if (lake >= 0) {
    const r = nearestRiver(x, y, RIVER_IN_LAKE_PX, scale, level, water, index, lineShown);
    return r ? { kind: 'river', ...r } : { kind: 'lake', lake };
  }
  const r = nearestRiver(x, y, RIVER_PX, scale, level, water, index, lineShown);
  if (r) return { kind: 'river', ...r };
  if (seas.length && sea?.(x, y)) {
    const id = seaOf(x, y, seas);
    if (id) return { kind: 'sea', sea: id };
  }
  return null;
}

/**
 * The smallest shown, drawn lake that holds a point (islands are holes), or -1.
 * @param {number} x @param {number} y @param {number} level
 * @param {import('./load.js').WaterData} water @param {import('./labels.js').WaterIndex} index
 * @param {(lake: number) => boolean} lakeShown
 */
function lakeAt(x, y, level, water, index, lakeShown) {
  let best = -1;
  for (let k = 0; k < water.lakeInfo.length; k++) {
    const b = index.lakeBox;
    if (index.lakeLevel[k] > level || x < b[k * 4] || x > b[k * 4 + 2] || y < b[k * 4 + 1] || y > b[k * 4 + 3] || !lakeShown(k)) continue;
    if (best >= 0 && water.lakeInfo[k].areaKm2 >= water.lakeInfo[best].areaKm2) continue;
    if (pointInRings(x, y, water.lakes.slice(index.lakeRingStart[k], index.lakeRingStart[k + 1]))) best = k;
  }
  return best;
}

/**
 * A touch is a tap when it is a single primary-button pointer that goes up soon and close to
 * where it went down. Until it moves TAP_SLOP_PX the map does not pan ('hold'); then it says
 * 'release' once (pan by the whole distance from `start`), and 'free' after. A second finger or
 * cancel() drops the tap.
 * @typedef {{ pointerId: number, x: number, y: number, time: number, button?: number, isPrimary?: boolean }} TapEvent
 */
export function createTapTracker() {
  /** @type {{ id: number, x: number, y: number, time: number, released: boolean } | null} */
  let candidate = null;
  return {
    /** Where the candidate went down, or null. */
    get start() { return candidate ? { x: candidate.x, y: candidate.y } : null; },
    /** @param {TapEvent} e @param {number} count pointers down, this one included */
    down(e, count) {
      candidate = count === 1 && (e.button ?? 0) === 0 && e.isPrimary !== false
        ? { id: e.pointerId, x: e.x, y: e.y, time: e.time, released: false }
        : null;
    },
    /** @param {TapEvent} e @returns {'hold' | 'release' | 'free'} */
    move(e) {
      if (!candidate || candidate.id !== e.pointerId || candidate.released) return 'free';
      if (Math.hypot(e.x - candidate.x, e.y - candidate.y) < TAP_SLOP_PX) return 'hold';
      candidate.released = true;
      return 'release';
    },
    /** Is this pointer going up a tap? @param {TapEvent} e */
    up(e) {
      const c = candidate;
      if (!c || c.id !== e.pointerId) return false;
      candidate = null;
      return !c.released && e.time - c.time < TAP_MS && Math.hypot(e.x - c.x, e.y - c.y) < TAP_SLOP_PX;
    },
    cancel() { candidate = null; },
  };
}

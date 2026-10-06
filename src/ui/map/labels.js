// @ts-check
// River and lake names on the map. Placed once per full redraw (in the kept frame, never per
// pan frame): biggest rivers and lakes first, each only where it doesn't touch a name already
// placed, so more names appear as you zoom in. A river's name follows a straight-ish stretch of
// the river, turned to run along it and kept upright; a lake's name sits at its middle.
// No DOM here: the caller passes a text measurer, so this runs in Node for tests.

/** Below this many CSS pixels a name is hard to read on a phone. */
export const MIN_FONT_PX = 11;
/** At most this many names in one frame: beyond it the map gets busy and slow. */
const MAX_LABELS = 70;
/** Two names of one river are at least this far apart (CSS px). */
const REPEAT_PX = 520;
/** A river carries at most this many copies of its name in one frame. */
const MAX_REPEATS = 3;
/** A lake is named when it covers at least this many square CSS pixels on screen. */
const LAKE_MIN_PX2 = 150;
/** River names steeper than this (radians from level) are hard to read and are not placed. */
const MAX_TILT = 1.05;

/** River size bands by length in km: small, middle, big, great. */
const BAND_KM = [120, 300, 700];
/** Line width per band, CSS px, and the scale (CSS px per game unit) from which it shows. */
const BAND_WIDTH = [0.8, 1.1, 1.5, 2.1];
const BAND_FROM = [0.05, 0.03, 0, 0];
/** Zoomed out further than this, rivers are drawn thinner. */
const THIN_BELOW = 0.04;

/** @param {number} lengthKm */
export const riverBand = (lengthKm) => BAND_KM.filter((km) => lengthKm >= km).length;
/** @param {number} band @param {number} scale */
export const bandShown = (band, scale) => scale >= BAND_FROM[band];
/** @param {number} band @param {number} scale */
export const bandWidth = (band, scale) => BAND_WIDTH[band] * (scale < THIN_BELOW ? 0.8 : 1);
export const BANDS = BAND_WIDTH.length;

/** @param {number} lengthKm */
const riverFont = (lengthKm) => (lengthKm >= 700 ? 13 : 12);
/** @param {number} areaKm2 */
const lakeFont = (areaKm2) => (areaKm2 >= 1000 ? 14 : areaKm2 >= 100 ? 13 : 12);
/** @param {number} size */
export const labelFont = (size) => `italic ${Math.max(MIN_FONT_PX, size)}px Georgia, 'Times New Roman', serif`;

/**
 * @typedef {object} Label
 * @property {string} text @property {number} size font size, CSS px
 * @property {number} x @property {number} y centre, CSS px in the frame
 * @property {number} angle radians, clockwise on screen, kept between -90 and 90 degrees
 */

/**
 * Remembers where names are, on a coarse grid of the frame, as discs along each name.
 */
export class Occupancy {
  /** @param {number} width @param {number} height @param {number} [cell] */
  constructor(width, height, cell = 32) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(width / cell));
    this.rows = Math.max(1, Math.ceil(height / cell));
    /** @type {number[][][]} the discs [x, y, r] touching each grid cell */
    this.grid = Array.from({ length: this.cols * this.rows }, () => []);
    /** @type {number[][]} areas no name may touch, [left, top, right, bottom] */
    this.rects = [];
  }

  /**
   * Keeps names out of an area (where buttons sit over the map).
   * @param {number} left @param {number} top @param {number} right @param {number} bottom
   */
  keepOut(left, top, right, bottom) {
    this.rects.push([left, top, right, bottom]);
  }

  /** @param {number[][]} discs @param {(i: number, d: number[]) => void} visit */
  each(discs, visit) {
    for (const d of discs) {
      const c0 = Math.max(0, Math.floor((d[0] - d[2]) / this.cell));
      const c1 = Math.min(this.cols - 1, Math.floor((d[0] + d[2]) / this.cell));
      const r0 = Math.max(0, Math.floor((d[1] - d[2]) / this.cell));
      const r1 = Math.min(this.rows - 1, Math.floor((d[1] + d[2]) / this.cell));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) visit(r * this.cols + c, d);
    }
  }

  /** @param {number[][]} discs */
  fits(discs) {
    for (const [l, t, r, b] of this.rects) {
      for (const [x, y, rad] of discs) if (x + rad > l && x - rad < r && y + rad > t && y - rad < b) return false;
    }
    let ok = true;
    this.each(discs, (i, d) => {
      if (!ok) return;
      for (const o of this.grid[i]) {
        if ((o[0] - d[0]) ** 2 + (o[1] - d[1]) ** 2 < (o[2] + d[2]) ** 2) { ok = false; return; }
      }
    });
    return ok;
  }

  /** @param {number[][]} discs */
  add(discs) {
    this.each(discs, (i, d) => this.grid[i].push(d));
  }
}

/**
 * Discs covering a name: a row of circles along its baseline.
 * @param {number} x @param {number} y @param {number} angle @param {number} width @param {number} size
 */
export function labelDiscs(x, y, angle, width, size) {
  const r = size * 0.62 + 2;
  const n = Math.max(1, Math.ceil(width / (size * 0.9)));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  /** @type {number[][]} */
  const discs = [];
  for (let k = 0; k <= n; k++) {
    const t = -width / 2 + (width * k) / n;
    discs.push([x + t * cos, y + t * sin, r]);
  }
  return discs;
}

/**
 * Straight-ish stretches of a line (screen points) at least `length` long, as candidate places for
 * a name: the chord from start to end, with the line never straying more than `maxDev` from it.
 * Returned nearest to (cx, cy) first.
 * @param {Float64Array} pts flat screen points [x0, y0, ...]
 * @param {number} length CSS px @param {number} maxDev CSS px
 * @param {{ cx: number, cy: number, width: number, height: number }} frame
 * @returns {{ x0: number, y0: number, x1: number, y1: number, d: number }[]}
 */
export function straightStretches(pts, length, maxDev, frame) {
  const n = pts.length / 2;
  /** @type {{ x0: number, y0: number, x1: number, y1: number, d: number }[]} */
  const out = [];
  let j = 0;
  let arc = 0; // length from i to j along the line
  for (let i = 0; i < n - 1; i++) {
    if (j < i) { j = i; arc = 0; }
    while (j < n - 1 && arc < length) {
      arc += Math.hypot(pts[(j + 1) * 2] - pts[j * 2], pts[(j + 1) * 2 + 1] - pts[j * 2 + 1]);
      j++;
    }
    if (arc < length) break;
    const x0 = pts[i * 2]; const y0 = pts[i * 2 + 1]; const x1 = pts[j * 2]; const y1 = pts[j * 2 + 1];
    const chord = Math.hypot(x1 - x0, y1 - y0);
    if (chord >= length * 0.9 && within(frame, x0, y0) && within(frame, x1, y1)) {
      let worst = 0;
      for (let k = i + 1; k < j && worst <= maxDev; k++) {
        worst = Math.max(worst, Math.abs((pts[k * 2] - x0) * (y1 - y0) - (pts[k * 2 + 1] - y0) * (x1 - x0)) / chord);
      }
      if (worst <= maxDev) out.push({ x0, y0, x1, y1, d: Math.hypot((x0 + x1) / 2 - frame.cx, (y0 + y1) / 2 - frame.cy) });
    }
    arc -= Math.hypot(pts[(i + 1) * 2] - x0, pts[(i + 1) * 2 + 1] - y0);
  }
  return out.sort((a, b) => a.d - b.d);
}

/** @param {{ width: number, height: number }} f @param {number} x @param {number} y */
function within(f, x, y) {
  return x >= 4 && y >= 4 && x <= f.width - 4 && y <= f.height - 4;
}

/**
 * @typedef {object} WaterIndex worked out once per map, for placing names quickly
 * @property {number[][]} linesOf river index -> its line indexes
 * @property {Int32Array} lineStart first point of each line in the levels list
 * @property {Float64Array} lineBox [minX, minY, maxX, maxY] per line, game units
 * @property {Uint8Array} lakeLevel coarsest level at which each lake is drawn
 */

/**
 * @param {import('./load.js').WaterData} water
 * @returns {WaterIndex}
 */
export function indexWater(water) {
  /** @type {number[][]} */
  const linesOf = water.riverInfo.map(() => []);
  const lineStart = new Int32Array(water.rivers.length);
  const lineBox = new Float64Array(water.rivers.length * 4);
  let at = 0;
  water.rivers.forEach((line, i) => {
    linesOf[water.riverOf[i]]?.push(i);
    lineStart[i] = at;
    at += line.length / 2;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (let k = 0; k < line.length; k += 2) {
      if (line[k] < minX) minX = line[k];
      if (line[k] > maxX) maxX = line[k];
      if (line[k + 1] < minY) minY = line[k + 1];
      if (line[k + 1] > maxY) maxY = line[k + 1];
    }
    lineBox.set([minX, minY, maxX, maxY], i * 4);
  });
  const lakeLevel = new Uint8Array(water.lakeInfo.length).fill(255);
  at = 0;
  water.lakes.forEach((ring, i) => {
    const k = water.lakeOf[i];
    for (let p = 0; p < ring.length / 2; p++) lakeLevel[k] = Math.min(lakeLevel[k], water.lakeLevels[at + p]);
    at += ring.length / 2;
  });
  return { linesOf, lineStart, lineBox, lakeLevel };
}

/**
 * Chooses where the names go for one frame.
 * @param {object} p
 * @param {import('./load.js').WaterData} p.water
 * @param {WaterIndex} p.index
 * @param {number} p.level detail level being drawn (0 to 2)
 * @param {number} p.scale CSS px per game unit
 * @param {number} p.ox @param {number} p.oy where game point (0, 0) is in the frame, CSS px
 * @param {number} p.width @param {number} p.height the frame, CSS px
 * @param {(text: string, size: number) => number} p.measure text width in CSS px
 * @param {number[][]} [p.keepOut] areas of the frame no name may touch, [left, top, right, bottom]
 * @returns {Label[]}
 */
export function placeWaterLabels({ water, index, level, scale, ox, oy, width, height, measure, keepOut = [] }) {
  const occupied = new Occupancy(width, height);
  for (const [l, t, r, b] of keepOut) occupied.keepOut(l, t, r, b);
  const frame = { cx: width / 2, cy: height / 2, width, height };
  /** @type {{ priority: number, kind: 'lake' | 'river', k: number }[]} */
  const candidates = [];
  water.lakeInfo.forEach((lake, k) => {
    if (!lake.name || index.lakeLevel[k] > level || lake.areaKm2 * 100 * scale * scale < LAKE_MIN_PX2) return;
    const x = ox + lake.at[0] * scale;
    const y = oy - lake.at[1] * scale;
    if (within(frame, x, y)) candidates.push({ priority: Math.sqrt(lake.areaKm2) * 25, kind: 'lake', k });
  });
  water.riverInfo.forEach((river, k) => {
    if (river.name && bandShown(riverBand(river.lengthKm), scale)) candidates.push({ priority: river.lengthKm, kind: 'river', k });
  });
  candidates.sort((a, b) => b.priority - a.priority || a.k - b.k);

  /** @type {Label[]} */
  const labels = [];
  for (const c of candidates) {
    if (labels.length >= MAX_LABELS) break;
    if (c.kind === 'lake') {
      const lake = water.lakeInfo[c.k];
      const size = lakeFont(lake.areaKm2);
      const label = { text: lake.name, size, x: ox + lake.at[0] * scale, y: oy - lake.at[1] * scale, angle: 0 };
      const discs = labelDiscs(label.x, label.y, 0, measure(lake.name, size), size);
      if (occupied.fits(discs)) {
        occupied.add(discs);
        labels.push(label);
      }
    } else {
      for (const label of placeRiver(water, index, c.k, level, scale, ox, oy, frame, measure, occupied)) labels.push(label);
    }
  }
  return labels;
}

/**
 * Names for one river: the best straight-ish stretches that are free, a few apart.
 * @param {import('./load.js').WaterData} water @param {WaterIndex} index @param {number} k
 * @param {number} level @param {number} scale @param {number} ox @param {number} oy
 * @param {{ cx: number, cy: number, width: number, height: number }} frame
 * @param {(text: string, size: number) => number} measure
 * @param {Occupancy} occupied
 * @returns {Label[]}
 */
function placeRiver(water, index, k, level, scale, ox, oy, frame, measure, occupied) {
  const river = water.riverInfo[k];
  const size = riverFont(river.lengthKm);
  const textWidth = measure(river.name, size);
  const offset = size * 0.7 + bandWidth(riverBand(river.lengthKm), scale);
  // Game-unit window of the frame, to skip lines that are off screen.
  const minX = -ox / scale; const maxX = (frame.width - ox) / scale;
  const minY = (oy - frame.height) / scale; const maxY = oy / scale;
  /** @type {{ x0: number, y0: number, x1: number, y1: number, d: number }[]} */
  let stretches = [];
  for (const i of index.linesOf[k] ?? []) {
    const b = index.lineBox.subarray(i * 4, i * 4 + 4);
    if (b[2] < minX || b[0] > maxX || b[3] < minY || b[1] > maxY) continue;
    const line = water.rivers[i];
    const start = index.lineStart[i];
    const pts = [];
    for (let p = 0; p < line.length / 2; p++) {
      if (water.riverLevels[start + p] <= level) pts.push(ox + line[p * 2] * scale, oy - line[p * 2 + 1] * scale);
    }
    // Zoomed far out every river wiggles at the scale of a word: allow a little more bend there.
    const bend = size * (scale < THIN_BELOW ? 0.6 : 0.4);
    if (pts.length >= 4) stretches = stretches.concat(straightStretches(Float64Array.from(pts), textWidth + size, bend, frame));
  }
  stretches.sort((a, b) => a.d - b.d);
  /** @type {Label[]} */
  const placed = [];
  for (const s of stretches) {
    if (placed.length >= MAX_REPEATS) break;
    let angle = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
    if (angle > Math.PI / 2) angle -= Math.PI;
    else if (angle < -Math.PI / 2) angle += Math.PI;
    if (Math.abs(angle) > MAX_TILT) continue;
    // Beside the river, on the side that is up for the text, so the name doesn't hide the water.
    const x = (s.x0 + s.x1) / 2 + Math.sin(angle) * offset;
    const y = (s.y0 + s.y1) / 2 - Math.cos(angle) * offset;
    if (placed.some((l) => Math.hypot(l.x - x, l.y - y) < REPEAT_PX)) continue;
    const discs = labelDiscs(x, y, angle, textWidth, size);
    if (!occupied.fits(discs)) continue;
    occupied.add(discs);
    placed.push({ text: river.name, size, x, y, angle });
  }
  return placed;
}

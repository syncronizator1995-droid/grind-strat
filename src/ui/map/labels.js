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
    /** @type {number[] | null} the screen within the frame: names sit wholly on it or wholly off it */
    this.screen = null;
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
    if (this.screen && straddles(discs, this.screen)) return false;
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
 * Does a name cross the screen's edge (part on screen, part off)? Such a name shows cut in half.
 * @param {number[][]} discs @param {number[]} screen [left, top, right, bottom]
 */
function straddles(discs, screen) {
  let inside = false;
  let outside = false;
  for (const [x, y, r] of discs) {
    if (x - r >= screen[0] && x + r <= screen[2] && y - r >= screen[1] && y + r <= screen[3]) inside = true;
    else if (x + r <= screen[0] || x - r >= screen[2] || y + r <= screen[1] || y - r >= screen[3]) outside = true;
    else return true;
  }
  return inside && outside;
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
 * @typedef {{ x0: number, y0: number, x1: number, y1: number, d: number }} Stretch
 */

/** Scratch space for the arc lengths along a line, reused so placing names makes no garbage. */
let arcs = new Float64Array(1024);
/** Scratch space for a line's points on screen. */
let buffer = new Float64Array(4096);

/**
 * Straight-ish stretches of a line (screen points) at least `length` long, as candidate places for
 * a name: the chord from start to end, with the line never straying more than `maxDev` from it.
 * Every point is tried as a start (trying fewer missed good places where a bend sits at the
 * start). Returned nearest to the frame's middle first.
 * @param {Float64Array} pts flat screen points [x0, y0, ...], all inside the frame
 * @param {number} length CSS px @param {number} maxDev CSS px
 * @param {{ cx: number, cy: number, width: number, height: number }} frame
 * @param {number} [count] how many points of `pts` to use
 * @param {Stretch[]} [out] added to
 * @returns {Stretch[]}
 */
export function straightStretches(pts, length, maxDev, frame, count = pts.length / 2, out = []) {
  const n = count;
  if (arcs.length < n) arcs = new Float64Array(n * 2);
  arcs[0] = 0;
  for (let i = 1; i < n; i++) arcs[i] = arcs[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (j < i) j = i;
    while (j < n - 1 && arcs[j] - arcs[i] < length) j++;
    if (arcs[j] - arcs[i] < length) break;
    const x0 = pts[i * 2]; const y0 = pts[i * 2 + 1]; const x1 = pts[j * 2]; const y1 = pts[j * 2 + 1];
    const chord = Math.hypot(x1 - x0, y1 - y0);
    if (chord >= length * 0.9 && within(frame, x0, y0) && within(frame, x1, y1)) {
      let worst = 0;
      for (let k = i + 1; k < j && worst <= maxDev; k++) {
        worst = Math.max(worst, Math.abs((pts[k * 2] - x0) * (y1 - y0) - (pts[k * 2 + 1] - y0) * (x1 - x0)) / chord);
      }
      if (worst <= maxDev) out.push({ x0, y0, x1, y1, d: Math.hypot((x0 + x1) / 2 - frame.cx, (y0 + y1) / 2 - frame.cy) });
    }
  }
  return out.sort((p, q) => p.d - q.d);
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
 * @property {Float64Array[]} chunkBox per line, the box of every CHUNK points, so only the parts
 *   of a long river near the screen are looked at
 * @property {Uint8Array} lakeLevel coarsest level at which each lake is drawn
 */

/** Points per chunk of a river line. */
const CHUNK = 64;

/**
 * [minX, minY, maxX, maxY] of points from..to (inclusive) of a flat line, into out at `at`.
 * @param {ArrayLike<number>} line @param {number} from @param {number} to
 * @param {Float64Array} out @param {number} at
 */
function boxOf(line, from, to, out, at) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (let p = from; p <= to; p++) {
    const x = line[p * 2]; const y = line[p * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  out[at] = minX; out[at + 1] = minY; out[at + 2] = maxX; out[at + 3] = maxY;
}

/**
 * @param {import('./load.js').WaterData} water
 * @returns {WaterIndex}
 */
export function indexWater(water) {
  /** @type {number[][]} */
  const linesOf = water.riverInfo.map(() => []);
  const lineStart = new Int32Array(water.rivers.length);
  const lineBox = new Float64Array(water.rivers.length * 4);
  /** @type {Float64Array[]} */
  const chunkBox = [];
  let at = 0;
  water.rivers.forEach((line, i) => {
    linesOf[water.riverOf[i]]?.push(i);
    lineStart[i] = at;
    const n = line.length / 2;
    at += n;
    boxOf(line, 0, n - 1, lineBox, i * 4);
    // Chunk c covers points c*CHUNK to (c+1)*CHUNK: neighbouring chunks share a point.
    const chunks = new Float64Array(Math.max(1, Math.ceil((n - 1) / CHUNK)) * 4);
    for (let c = 0; c * 4 < chunks.length; c++) boxOf(line, c * CHUNK, Math.min(n - 1, (c + 1) * CHUNK), chunks, c * 4);
    chunkBox.push(chunks);
  });
  const lakeLevel = new Uint8Array(water.lakeInfo.length).fill(255);
  at = 0;
  water.lakes.forEach((ring, i) => {
    const k = water.lakeOf[i];
    for (let p = 0; p < ring.length / 2; p++) lakeLevel[k] = Math.min(lakeLevel[k], water.lakeLevels[at + p]);
    at += ring.length / 2;
  });
  return { linesOf, lineStart, lineBox, chunkBox, lakeLevel };
}

/**
 * Chooses where the names go for one frame. The water's rivers and lakes must come biggest
 * first, as the packed data has them.
 * @param {object} p
 * @param {import('./load.js').WaterData} p.water
 * @param {WaterIndex} p.index
 * @param {number} p.level detail level being drawn (0 to 2)
 * @param {number} p.scale CSS px per game unit
 * @param {number} p.ox @param {number} p.oy where game point (0, 0) is in the frame, CSS px
 * @param {number} p.width @param {number} p.height the frame, CSS px
 * @param {(text: string, size: number) => number} p.measure text width in CSS px
 * @param {number[][]} [p.keepOut] areas of the frame no name may touch, [left, top, right, bottom]
 * @param {number[]} [p.screen] the part of the frame on screen, [left, top, right, bottom]: no name
 *   is placed across its edge
 * @param {number} [p.budgetMs] stop placing names after this long: the biggest are placed first,
 *   so a slow phone shows fewer small names rather than a slow map
 * @param {() => number} [p.now] the clock, in ms
 * @returns {Label[]}
 */
export function placeWaterLabels({ water, index, level, scale, ox, oy, width, height, measure, keepOut = [], screen, budgetMs = Infinity, now = () => 0 }) {
  const deadline = now() + budgetMs;
  const occupied = new Occupancy(width, height);
  occupied.screen = screen ?? null;
  for (const [l, t, r, b] of keepOut) occupied.keepOut(l, t, r, b);
  const frame = { cx: width / 2, cy: height / 2, width, height };
  const lakes = water.lakeInfo;
  const rivers = water.riverInfo;
  // Both lists come biggest first (tools/map/pack-water.mjs sorts them), so the two are merged
  // as they go, and each stops at the first one too small to show: everything after it is smaller.
  const lakePriority = (/** @type {number} */ k) => Math.sqrt(lakes[k].areaKm2) * 25;
  let li = 0;
  let ri = 0;
  /** @type {Label[]} */
  const labels = [];
  while (labels.length < MAX_LABELS && now() <= deadline) {
    const lakeLeft = li < lakes.length && lakes[li].areaKm2 * 100 * scale * scale >= LAKE_MIN_PX2;
    const riverLeft = ri < rivers.length && bandShown(riverBand(rivers[ri].lengthKm), scale);
    if (!lakeLeft && !riverLeft) break;
    if (lakeLeft && (!riverLeft || lakePriority(li) >= rivers[ri].lengthKm)) {
      const label = placeLake(lakes[li], index.lakeLevel[li] <= level, scale, ox, oy, frame, measure, occupied);
      if (label) labels.push(label);
      li++;
    } else {
      if (rivers[ri].name) for (const label of placeRiver(water, index, ri, level, scale, ox, oy, frame, measure, occupied)) labels.push(label);
      ri++;
    }
  }
  return labels;
}

/**
 * A lake's name at its middle, if the lake is drawn, on screen, and the place is free.
 * @param {import('./load.js').LakeInfo} lake @param {boolean} drawn @param {number} scale
 * @param {number} ox @param {number} oy @param {{ cx: number, cy: number, width: number, height: number }} frame
 * @param {(text: string, size: number) => number} measure @param {Occupancy} occupied
 * @returns {Label | null}
 */
function placeLake(lake, drawn, scale, ox, oy, frame, measure, occupied) {
  if (!lake.name || !drawn) return null;
  const x = ox + lake.at[0] * scale;
  const y = oy - lake.at[1] * scale;
  if (!within(frame, x, y)) return null;
  const size = lakeFont(lake.areaKm2);
  const discs = labelDiscs(x, y, 0, measure(lake.name, size), size);
  if (!occupied.fits(discs)) return null;
  occupied.add(discs);
  return { text: lake.name, size, x, y, angle: 0 };
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
  // Zoomed far out every river wiggles at the scale of a word: allow a little more bend there.
  const bend = size * (scale < THIN_BELOW ? 0.6 : 0.4);
  const length = textWidth + size;
  /** @type {Stretch[]} */
  const stretches = [];
  for (const i of index.linesOf[k] ?? []) {
    const b = index.lineBox.subarray(i * 4, i * 4 + 4);
    if (b[2] < minX || b[0] > maxX || b[3] < minY || b[1] > maxY) continue;
    // A line whose whole extent on screen is shorter than the name can't carry it.
    if (Math.max(b[2] - b[0], b[3] - b[1]) * scale < length * 0.9) continue;
    const line = water.rivers[i];
    const start = index.lineStart[i];
    const n = line.length / 2;
    const chunks = index.chunkBox[i];
    if (buffer.length < line.length) buffer = new Float64Array(line.length * 2);
    // Only the runs of the line inside the frame (a name must fit on screen anyway), looking only
    // at chunks of the line near it.
    let count = 0;
    const flush = () => {
      if (count >= 2) straightStretches(buffer, length, bend, frame, count, stretches);
      count = 0;
    };
    for (let c = 0; c * 4 < chunks.length; c++) {
      if (chunks[c * 4 + 2] < minX || chunks[c * 4] > maxX || chunks[c * 4 + 3] < minY || chunks[c * 4 + 1] > maxY) {
        flush();
        continue;
      }
      // Each chunk's first point is the last point of the chunk before; take it only when a new
      // run starts here.
      for (let p = c * CHUNK + (count ? 1 : 0), end = Math.min(n - 1, (c + 1) * CHUNK); p <= end; p++) {
        if (water.riverLevels[start + p] > level) continue;
        const x = ox + line[p * 2] * scale;
        const y = oy - line[p * 2 + 1] * scale;
        if (x >= 0 && y >= 0 && x <= frame.width && y <= frame.height) {
          buffer[count * 2] = x;
          buffer[count * 2 + 1] = y;
          count++;
        } else {
          flush();
        }
      }
    }
    flush();
  }
  stretches.sort((p, q) => p.d - q.d);
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

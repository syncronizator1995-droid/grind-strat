// @ts-check
// The map's date rules: which year the map shows for a game day, and what the land looks like in
// that year. Plain data in, plain data out: no DOM, no clock, no Math.random. The map view uses
// it now; the game rules can use it later (forest slowing armies, villages doing the clearing).
// Nothing here is saved: the map for a date is always worked out again from the shipped data.
//
// The land changes between ANCHORS: whole grids for given years (1219 held to 1250, then 1425,
// 1725, 1900 and 2021; tools/map/terrain-time.mjs says where each comes from). Between two
// anchors, each cell that differs gets ONE switch year inside the interval. The shipped data
// carries, per interval, one byte per cell: (band << 3) | newClass, where newClass 0 means "no
// change" and band (0-31) is how far the cell sat from its new class at the start of the
// interval, in 2 km steps. Cells nearer their new class switch first, so a clearing spreads out
// from open land and new forest grows out from old; and each 32 x 32 cell block changes at a
// steady pace through the interval, so the map moves smoothly instead of jumping at the anchors.
//
// The switch year of a changing cell, inside its block:
//   t = y0 + 1 + floor(((cum[band] + hash01(c, r, seed) * count[band]) / blockCount) * (y1 - y0))
// where count[band] is how many of the block's changing cells sit in that band, cum[band] how
// many sit in nearer bands, and blockCount all the block's changing cells. That puts t in
// (y0, y1], nearer bands first, and one counting pass works it out for every cell: no sorting
// and no distance maths on the phone.
//
// Years: BC years are negative and there is no year 0 (1 BC comes right before AD 1), as in
// src/sim/calendar.js. Year spans are counted on "year indexes" (AD 1 is 0, 1 BC is -1), so a
// span across the BC/AD line is one year shorter than plain subtraction would say.

import { dateFromDay } from './calendar.js';
import { hash01 } from './grid.js';

/** The game starts in 1219: the earliest year the historic map shows. */
export const FIRST_MAP_YEAR = 1219;
/** Cells per side of the blocks in which change runs at a steady pace (32 km on the 1 km grid). */
export const BLOCK_CELLS = 32;
/** Distance bands in a plane byte (5 bits). */
export const BANDS = 32;
/** The low 3 bits of a plane byte: the new class, 0 for no change. */
export const CLASS_BITS = 3;

/**
 * The year the map shows on a game day: the calendar year (negative for BC, never 0).
 * @param {number} day days since 1 January AD 1, as the game stores its date
 */
export function mapYear(day) {
  return dateFromDay(day).year;
}

/**
 * Which set of map data a year uses. M3a has one, 'historic' (1219 to today), built for every
 * year from AD 1 on, with years before 1219 showing 1219. M3b adds AD 1 and the ice-age slices,
 * each with its own grids; until then a BC year shows the 1219 map and says so (noData).
 * @param {number} year never 0
 * @returns {{ id: 'historic', year: number, noData: boolean }} year: the year to draw
 */
export function eraOf(year) {
  checkYear(year);
  return { id: 'historic', year: Math.max(FIRST_MAP_YEAR, year), noData: year < 1 };
}

/**
 * Which dated features are on in a year. Each entry has `on: [from, to]`: on from the year
 * `from` (null: always was) up to but not including the year `to` (null: still is).
 * @param {readonly { on: readonly [number | null, number | null] }[]} entries
 * @param {number} year never 0
 * @returns {Uint8Array} 1 where the entry is on
 */
export function activeAt(entries, year) {
  checkYear(year);
  const out = new Uint8Array(entries.length);
  for (let k = 0; k < entries.length; k++) {
    const [from, to] = entries[k].on;
    if ((from === null || year >= from) && (to === null || year < to)) out[k] = 1;
  }
  return out;
}

/** @param {number} year */
function checkYear(year) {
  if (!Number.isInteger(year) || year === 0) throw new RangeError(`bad year: ${year} (BC years are negative; there is no year 0)`);
}

/** AD 1 is 0, 1 BC is -1: years as a plain number line. @param {number} year */
const yearIndex = (year) => (year > 0 ? year - 1 : year);
/** @param {number} index */
const indexYear = (index) => (index >= 0 ? index + 1 : index);

/**
 * @typedef {object} Interval one stretch between two anchors
 * @property {number} y0 the anchor the stretch starts from (its grid holds at y0)
 * @property {number} y1 the next anchor (its grid holds from y1)
 * @property {Uint8Array} plane one byte per cell: (band << 3) | newClass, newClass 0 = no change
 *
 * @typedef {object} Override cells that keep a class of their own for part of the time, on top
 *   of the anchors (Żuławy's marsh until it was diked, for example)
 * @property {ArrayLike<number>} cells cell indexes; a cell may be in one override only
 * @property {number} cls the override's class
 * @property {number} from @property {number} to each cell switches in a year inside [from, to]
 * @property {'before' | 'after'} [hold] 'before' (the default): the cells show `cls` until their
 *   switch year, then whatever the anchors say. 'after': the anchors until then, `cls` from then on.
 * @property {ArrayLike<number>} [bands] per cell (0-31), lower switches earlier; default all 0
 *
 * @typedef {object} Events the changes of one interval, in year order
 * @property {Int32Array} cells @property {Int16Array} years @property {Uint8Array} cls
 */

/**
 * Switch years for cells grouped in blocks and bands, by the rule at the top of this file:
 * inside each block, nearer bands first, spread evenly over `span` years from `first`.
 * @param {number} cols @param {number} rows
 * @param {ArrayLike<number>} cells changing cells @param {ArrayLike<number>} bands their bands
 * @param {number} first year index of the first possible year @param {number} span years
 * @param {number} seed @param {number} block cells per block side
 * @returns {Int32Array} year index of each cell's switch, in [first, first + span)
 */
function spreadYears(cols, rows, cells, bands, first, span, seed, block) {
  const bx = Math.ceil(cols / block);
  const blocks = bx * Math.ceil(rows / block);
  const count = new Int32Array(blocks * BANDS);
  const total = new Int32Array(blocks);
  const where = new Int32Array(cells.length);
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k];
    const c = i % cols;
    const r = (i - c) / cols;
    const b = Math.floor(r / block) * bx + Math.floor(c / block);
    const band = bands[k];
    if (!(band >= 0 && band < BANDS)) throw new RangeError(`band ${band} out of range`);
    where[k] = b * BANDS + band;
    count[where[k]]++;
    total[b]++;
  }
  // cum[b * BANDS + band]: the block's changing cells in nearer bands.
  const cum = new Int32Array(blocks * BANDS);
  for (let b = 0; b < blocks; b++) {
    let s = 0;
    for (let band = 0; band < BANDS; band++) { cum[b * BANDS + band] = s; s += count[b * BANDS + band]; }
  }
  const out = new Int32Array(cells.length);
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k];
    const c = i % cols;
    const r = (i - c) / cols;
    const w = where[k];
    const b = (w - (w % BANDS)) / BANDS;
    const frac = (cum[w] + hash01(c, r, seed) * count[w]) / total[b];
    out[k] = first + Math.min(span - 1, Math.floor(frac * span));
  }
  return out;
}

/**
 * The land over time, from a base grid, the change planes between anchors and any overrides.
 * classesAt(year) gives the whole grid for any year; advance(grid, from, to, onCell) moves a grid
 * forward by touching only the cells that switch, which is what the map does while the game runs.
 * Each interval's switch years are worked out the first time a year past its start is asked for.
 * @param {{ cols: number, rows: number, base: Uint8Array, intervals: Interval[], overrides?: Override[],
 *   seed: number, block?: number }} spec base: the grid at the first anchor, held until intervals[0].y0
 */
export function createTerrainTimeline({ cols, rows, base, intervals, overrides = [], seed, block = BLOCK_CELLS }) {
  const n = cols * rows;
  if (base.length !== n) throw new Error(`base grid has ${base.length} cells, not ${cols} x ${rows}`);
  for (let k = 0; k < intervals.length; k++) {
    const { y0, y1, plane } = intervals[k];
    checkYear(y0); checkYear(y1);
    if (!(y1 > y0)) throw new Error(`interval ${k}: ${y0} to ${y1} does not move forward`);
    if (k && y0 < intervals[k - 1].y1) throw new Error(`interval ${k} starts before interval ${k - 1} ends`);
    if (plane.length !== n) throw new Error(`interval ${k}: plane has ${plane.length} cells, not ${n}`);
  }

  /** @type {(Events | null)[]} */
  const events = intervals.map(() => null);

  // Overrides: each override cell's slot, its switch year, and (per interval, once prepared) the
  // anchors' own switch for that cell, so its anchor class in any year is a short lookup.
  /** @type {Map<number, number>} */
  const slotOf = new Map();
  /** @type {{ cell: number, cls: number, hold: 'before' | 'after', year: number }[]} */
  const slots = [];
  for (const o of overrides) {
    checkYear(o.from); checkYear(o.to);
    if (o.to < o.from) throw new Error(`override ${o.from}-${o.to} runs backwards`);
    const first = yearIndex(o.from);
    const years = spreadYears(cols, rows, o.cells, o.bands ?? new Uint8Array(o.cells.length), first, yearIndex(o.to) - first + 1, seed + 7919, block);
    for (let k = 0; k < o.cells.length; k++) {
      const i = o.cells[k];
      if (!(i >= 0 && i < n)) throw new RangeError(`override cell ${i} is off the grid`);
      if (slotOf.has(i)) throw new Error(`cell ${i} is in two overrides`);
      slotOf.set(i, slots.length);
      slots.push({ cell: i, cls: o.cls, hold: o.hold ?? 'before', year: indexYear(years[k]) });
    }
  }
  /** Per interval: per slot, the anchors' switch year for that cell (0 = none) and new class. */
  /** @type {({ years: Int16Array, cls: Uint8Array } | null)[]} */
  const slotAnchor = intervals.map(() => null);
  // Override switches in year order, for advance().
  const byYear = slots.map((_, s) => s).sort((a, b) => slots[a].year - slots[b].year || a - b);
  const ovCells = Int32Array.from(byYear, (s) => slots[s].cell);
  const ovYears = Int16Array.from(byYear, (s) => slots[s].year);

  /** The changes of interval k, worked out once. @param {number} k */
  function prepare(k) {
    const ready = events[k];
    if (ready) return ready;
    const { y0, y1, plane } = intervals[k];
    let m = 0;
    for (let i = 0; i < n; i++) if (plane[i] & 7) m++;
    const cells = new Int32Array(m);
    const bands = new Uint8Array(m);
    m = 0;
    for (let i = 0; i < n; i++) if (plane[i] & 7) { cells[m] = i; bands[m++] = plane[i] >> CLASS_BITS; }
    const first = yearIndex(y0) + 1;
    const span = yearIndex(y1) - yearIndex(y0);
    const years = spreadYears(cols, rows, cells, bands, first, span, seed + 31 * k, block);
    // A counting sort by year, so a span of years is one slice of the list.
    const start = new Int32Array(span + 1);
    for (let k2 = 0; k2 < m; k2++) start[years[k2] - first + 1]++;
    for (let y = 0; y < span; y++) start[y + 1] += start[y];
    const out = { cells: new Int32Array(m), years: new Int16Array(m), cls: new Uint8Array(m) };
    for (let k2 = 0; k2 < m; k2++) {
      const at = start[years[k2] - first]++;
      out.cells[at] = cells[k2];
      out.years[at] = indexYear(years[k2]);
      out.cls[at] = plane[cells[k2]] & 7;
    }
    if (slots.length) {
      const sa = { years: new Int16Array(slots.length), cls: new Uint8Array(slots.length) };
      for (let j = 0; j < m; j++) {
        const s = slotOf.get(out.cells[j]);
        if (s !== undefined) { sa.years[s] = out.years[j]; sa.cls[s] = out.cls[j]; }
      }
      slotAnchor[k] = sa;
    }
    events[k] = out;
    return out;
  }

  /** The anchors' class for an override cell in a year. @param {number} s @param {number} year */
  function anchorClassAt(s, year) {
    let c = base[slots[s].cell];
    for (let k = 0; k < intervals.length && intervals[k].y0 < year; k++) {
      prepare(k);
      const sa = /** @type {{ years: Int16Array, cls: Uint8Array }} */ (slotAnchor[k]);
      if (sa.cls[s] && sa.years[s] <= year) c = sa.cls[s];
    }
    return c;
  }

  /** What an override cell shows in a year. @param {number} s @param {number} year */
  function shownAt(s, year) {
    const o = slots[s];
    const held = o.hold === 'before' ? year < o.year : year >= o.year;
    return held ? o.cls : anchorClassAt(s, year);
  }

  /** First index in a sorted Int16Array whose year is above `year`. @param {Int16Array} years @param {number} year */
  function after(years, year) {
    let lo = 0; let hi = years.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (years[mid] <= year) lo = mid + 1; else hi = mid; }
    return lo;
  }

  /**
   * The whole grid in a year.
   * @param {number} year never 0
   * @returns {Uint8Array} a new grid
   */
  function classesAt(year) {
    checkYear(year);
    const grid = base.slice();
    for (let k = 0; k < intervals.length && intervals[k].y0 < year; k++) {
      const e = prepare(k);
      const end = after(e.years, year);
      for (let j = 0; j < end; j++) grid[e.cells[j]] = e.cls[j];
    }
    for (let s = 0; s < slots.length; s++) grid[slots[s].cell] = shownAt(s, year);
    return grid;
  }

  /**
   * Moves a grid that shows fromYear to toYear. Forward, it touches only the cells that switch in
   * between; backward (an earlier save loaded), it rebuilds the grid and reports what differs.
   * @param {Uint8Array} grid changed in place
   * @param {number} fromYear @param {number} toYear never 0
   * @param {(cell: number, cls: number) => void} [onCell] called for each cell whose class changed
   * @returns {number} how many cells changed
   */
  function advance(grid, fromYear, toYear, onCell) {
    checkYear(fromYear); checkYear(toYear);
    let changed = 0;
    /** @param {number} i @param {number} c */
    const put = (i, c) => {
      if (grid[i] === c) return;
      grid[i] = c;
      changed++;
      onCell?.(i, c);
    };
    if (toYear < fromYear) {
      const now = classesAt(toYear);
      for (let i = 0; i < n; i++) if (grid[i] !== now[i]) put(i, now[i]);
      return changed;
    }
    for (let k = 0; k < intervals.length; k++) {
      const { y0, y1 } = intervals[k];
      if (y1 <= fromYear || y0 >= toYear) continue;
      const e = prepare(k);
      const end = after(e.years, toYear);
      for (let j = after(e.years, fromYear); j < end; j++) {
        const i = e.cells[j];
        const s = slots.length ? slotOf.get(i) : undefined;
        put(i, s === undefined ? e.cls[j] : shownAt(s, toYear));
      }
    }
    if (slots.length) {
      const end = after(ovYears, toYear);
      for (let j = after(ovYears, fromYear); j < end; j++) put(ovCells[j], shownAt(/** @type {number} */ (slotOf.get(ovCells[j])), toYear));
    }
    return changed;
  }

  /**
   * Every switch of interval k, in year order (for tests and previews).
   * @param {number} k
   */
  const switches = (k) => prepare(k);

  return { cols, rows, intervals, classesAt, advance, switches };
}

/** @typedef {ReturnType<typeof createTerrainTimeline>} TerrainTimeline */

/**
 * The timeline from the shipped terrain-time block (src/data/by-sa/terrain-time.json, unpacked)
 * and the 1219 terrain it grows from. The block's layers are its change planes; its meta says
 * which stretch each one covers and the seed and block size the switch years use.
 * @param {{ meta: { grid: { cols: number, rows: number }, intervals: { y0: number, y1: number, layer: string }[],
 *   seed: number, blockCells: number }, layers: Record<string, Uint8Array>, base: Uint8Array, overrides?: Override[] }} spec
 */
export function timelineFromBlock({ meta, layers, base, overrides = [] }) {
  const intervals = meta.intervals.map(({ y0, y1, layer }) => {
    const plane = layers[layer];
    if (!plane) throw new Error(`the terrain-time block has no layer ${layer}`);
    return { y0, y1, plane };
  });
  return createTerrainTimeline({ cols: meta.grid.cols, rows: meta.grid.rows, base, intervals, overrides, seed: meta.seed, block: meta.blockCells });
}

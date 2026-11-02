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
// The switch year of a changing cell. Inside one block, a cell in a given band sits at
//   f = (cum[band] + hash01(c, r, seed) * count[band]) / blockCount
// of the way through the interval, where count[band] is how many of the block's changing cells
// sit in that band, cum[band] how many sit in nearer bands, and blockCount all the block's
// changing cells: nearer bands first, and the block's changes spread evenly over the years. Used
// as it is, that would draw the block edges mid-interval (a band can come early in one block and
// late in the next), so each cell blends f from the four block centres round it, weighted by
// nearness, as the quota thresholds are blended between square centres. Then
//   t = y0 + 1 + floor(f * (y1 - y0)),  in (y0, y1].
// One counting pass works it out for every cell: no sorting and no distance maths on the phone.
//
// The lead-in (M3b): before the 1219 grid, AD 1 to 1219. A lead-in is one more stretch, run
// BACKWARDS in what it stores: its plane keeps, per cell, (band << 3) | the AD 1 class (0: the
// cell is the same at AD 1), and the cell shows that class until its switch year, then the
// 1219 grid's. The switch years come from the same rule (bands, blocks, hash) over the years
// AD 2..1219. So at AD 1 the map is the AD 1 cut, from 1219 on it is exactly what it always was,
// and in between each cell changes once. A game that starts in 1219 never loads a lead-in.

// Years: BC years are negative and there is no year 0 (1 BC comes right before AD 1), as in
// src/sim/calendar.js. Year spans are counted on "year indexes" (AD 1 is 0, 1 BC is -1), so a
// span across the BC/AD line is one year shorter than plain subtraction would say.

import { dateFromDay } from './calendar.js';
import { hash01 } from './grid.js';

/** The game starts in 1219: the earliest year the historic map shows. */
export const FIRST_MAP_YEAR = 1219;
/** The first year of the lead-in: AD 1 (the AD 1 map; BC years show it too until M3b's ages). */
export const FIRST_LEAD_YEAR = 1;
/** Added to the timeline's seed for the lead-in's order inside a band (the stretches use 31 x k). */
export const LEAD_SEED_OFFSET = 1031;
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
 * Which set of map data a year uses. One, 'historic' (AD 1 to today; M3b adds the ice-age ages),
 * and a year before AD 1 shows AD 1 and says so (noData). Whether the data for AD 1 to 1219 (the
 * lead-in) is loaded is the view's business: without it the map floors at 1219.
 * @param {number} year never 0
 * @returns {{ id: 'historic', year: number, noData: boolean }} year: the year to draw
 */
export function eraOf(year) {
  checkYear(year);
  return { id: 'historic', year: Math.max(FIRST_LEAD_YEAR, year), noData: year < 1 };
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
 * @typedef {object} LeadIn the stretch before the first grid: AD 1 up to y1 (the 1219 grid)
 * @property {number} y0 the year its AD 1 grid holds at (AD 1) @property {number} y1 the year the base grid holds from (1219)
 * @property {Uint8Array} plane one byte per cell: (band << 3) | the class at y0, 0 = the same as the base
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
 * The pace of change, block by block: counts of changing cells per block and band, then each
 * cell's share of the way through the stretch by the rule at the top of this file (nearer bands
 * first, spread evenly in each block, blended between block centres so no block edge shows).
 * Cells are counted with count(), then finish() once, then fraction() per cell.
 * @param {number} cols @param {number} rows @param {number} block cells per block side
 */
function pacer(cols, rows, block) {
  const bx = Math.ceil(cols / block);
  const by = Math.ceil(rows / block);
  const blocks = bx * by;
  const counts = new Int32Array(blocks * BANDS);
  const total = new Int32Array(blocks);
  // start[b * BANDS + band] and width[...]: where the band's cells begin in the block, and how
  // much of the block they take, both as shares of the block's changes.
  const start = new Float64Array(blocks * BANDS);
  const width = new Float64Array(blocks * BANDS);
  /** The four block centres round each column (or row), and how near the cell is to each. @param {number} n @param {number} nb */
  const near = (n, nb) => {
    const lo = new Int32Array(n); const hi = new Int32Array(n); const t = new Float64Array(n);
    for (let x = 0; x < n; x++) {
      const f = (x + 0.5) / block - 0.5;
      lo[x] = Math.max(0, Math.min(nb - 1, Math.floor(f)));
      hi[x] = Math.min(nb - 1, lo[x] + 1);
      t[x] = Math.max(0, Math.min(1, f - lo[x]));
    }
    return { lo, hi, t };
  };
  /** @type {ReturnType<typeof near>} */ let X;
  /** @type {ReturnType<typeof near>} */ let Y;
  return {
    /** @param {number} c @param {number} r @param {number} band */
    count(c, r, band) {
      if (!(band >= 0 && band < BANDS)) throw new RangeError(`band ${band} out of range`);
      const b = Math.floor(r / block) * bx + Math.floor(c / block);
      counts[b * BANDS + band]++;
      total[b]++;
    },
    finish() {
      for (let b = 0; b < blocks; b++) {
        if (!total[b]) continue;
        let s = 0;
        for (let band = 0; band < BANDS; band++) {
          const at = b * BANDS + band;
          start[at] = s / total[b];
          width[at] = counts[at] / total[b];
          s += counts[at];
        }
      }
      X = near(cols, bx);
      Y = near(rows, by);
    },
    /**
     * How far through the stretch a counted cell switches, in [0, 1].
     * @param {number} c @param {number} r @param {number} band @param {number} h the cell's hash
     */
    fraction(c, r, band, h) {
      const tx = X.t[c]; const ty = Y.t[r];
      const row0 = Y.lo[r] * bx; const row1 = Y.hi[r] * bx;
      let sum = 0; let weight = 0;
      // The four block centres round the cell, written out (this runs for every changing cell).
      // A block with no changes has no pace of its own: it takes no part.
      let b = row0 + X.lo[c]; let w = (1 - tx) * (1 - ty);
      if (total[b] && w > 0) { const at = b * BANDS + band; sum += w * (start[at] + h * width[at]); weight += w; }
      b = row0 + X.hi[c]; w = tx * (1 - ty);
      if (total[b] && w > 0) { const at = b * BANDS + band; sum += w * (start[at] + h * width[at]); weight += w; }
      b = row1 + X.lo[c]; w = (1 - tx) * ty;
      if (total[b] && w > 0) { const at = b * BANDS + band; sum += w * (start[at] + h * width[at]); weight += w; }
      b = row1 + X.hi[c]; w = tx * ty;
      if (total[b] && w > 0) { const at = b * BANDS + band; sum += w * (start[at] + h * width[at]); weight += w; }
      if (weight > 1e-9) return sum / weight;
      // The cell's own block always has changes (this cell), but at the far edge of the blend its
      // weight may be 0 and its neighbours' empty: then it goes by its own block alone.
      const at = (Math.floor(r / block) * bx + Math.floor(c / block)) * BANDS + band;
      return start[at] + h * width[at];
    },
  };
}

/** The year index a share of the way through a stretch falls in. @param {number} f @param {number} first @param {number} span */
const yearAt = (f, first, span) => first + Math.min(span - 1, Math.max(0, Math.floor(f * span)));

/**
 * Switch years for cells grouped in blocks and bands (see pacer).
 * @param {number} cols @param {number} rows
 * @param {ArrayLike<number>} cells changing cells @param {ArrayLike<number>} bands their bands
 * @param {number} first year index of the first possible year @param {number} span years
 * @param {number} seed @param {number} block cells per block side
 * @returns {Int32Array} year index of each cell's switch, in [first, first + span)
 */
function spreadYears(cols, rows, cells, bands, first, span, seed, block) {
  const pace = pacer(cols, rows, block);
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k] % cols;
    pace.count(c, (cells[k] - c) / cols, bands[k]);
  }
  pace.finish();
  const out = new Int32Array(cells.length);
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k] % cols;
    const r = (cells[k] - c) / cols;
    out[k] = yearAt(pace.fraction(c, r, bands[k], hash01(c, r, seed)), first, span);
  }
  return out;
}

/** Cells per piece of preparing work: about 0.5 ms in Node, a few ms on a mid-range phone. */
const STEP_CELLS = 1 << 14;

/** The years Int16Array can hold (BC years go down to the ice age). */
const MAX_YEAR = 32767;

/**
 * The land over time, from a base grid, the change planes between anchors and any overrides.
 * classesAt(year) gives the whole grid for any year; advance(grid, from, to, onCell) moves a grid
 * forward by touching only the cells that switch, which is what the map does while the game runs.
 *
 * Working out an interval's switch years takes a pass over its whole plane (tens of
 * milliseconds on a phone), so it is done only for a stretch the year is inside of: a year past a
 * stretch's end just takes every change of the stretch, which needs no switch years. And it can
 * be done ahead, in small pieces: the map calls prepareStep(year) in spare frame time, so the
 * game never stops for it when the date runs into a new stretch. Whatever is not prepared ahead
 * is prepared when it is needed; either way the answers are the same.
 * @param {{ cols: number, rows: number, base: Uint8Array, intervals: Interval[], overrides?: Override[],
 *   seed: number, block?: number, leadIn?: LeadIn | null }} spec base: the grid at the first anchor, held until
 *   intervals[0].y0; leadIn: the stretch before it (see the top of the file), or null
 */
export function createTerrainTimeline({ cols, rows, base, intervals, overrides = [], seed, block = BLOCK_CELLS, leadIn = null }) {
  const n = cols * rows;
  if (base.length !== n) throw new Error(`base grid has ${base.length} cells, not ${cols} x ${rows}`);
  for (let k = 0; k < intervals.length; k++) {
    const { y0, y1, plane } = intervals[k];
    checkYear(y0); checkYear(y1); checkRange(y0); checkRange(y1);
    if (!(y1 > y0)) throw new Error(`interval ${k}: ${y0} to ${y1} does not move forward`);
    if (k && y0 < intervals[k - 1].y1) throw new Error(`interval ${k} starts before interval ${k - 1} ends`);
    if (plane.length !== n) throw new Error(`interval ${k}: plane has ${plane.length} cells, not ${n}`);
  }
  if (leadIn) {
    checkYear(leadIn.y0); checkYear(leadIn.y1); checkRange(leadIn.y0); checkRange(leadIn.y1);
    if (!(leadIn.y1 > leadIn.y0)) throw new Error(`the lead-in ${leadIn.y0} to ${leadIn.y1} does not move forward`);
    if (intervals.length && leadIn.y1 > intervals[0].y0) throw new Error('the lead-in ends after the first interval starts');
    if (leadIn.plane.length !== n) throw new Error(`the lead-in plane has ${leadIn.plane.length} cells, not ${n}`);
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
    checkYear(o.from); checkYear(o.to); checkRange(o.from); checkRange(o.to);
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

  /**
   * The work of preparing interval k, in pieces: count the changing cells per block and band,
   * then give each its switch year, then sort them by year. Each step() call does one piece
   * of about STEP_CELLS cells and says whether work is left.
   * @param {number} k
   */
  function job(k) {
    return jobOf(intervals[k], seed + 31 * k, false, (out) => done(k, out));
  }

  /**
   * The same work for any stretch. A lead-in's plane keeps the class BEFORE the switch, so what a
   * cell becomes is the base grid's.
   * @param {{ y0: number, y1: number, plane: Uint8Array }} iv @param {number} s the seed
   * @param {boolean} lead @param {(out: Events) => void} finish
   */
  function jobOf({ y0, y1, plane }, s, lead, finish) {
    const first = yearIndex(y0) + 1;
    const span = yearIndex(y1) - yearIndex(y0);
    const stepRows = Math.max(1, Math.floor(STEP_CELLS / Math.max(1, cols)));
    const pace = pacer(cols, rows, block);
    let phase = 0; let row = 0; let m = 0; let j = 0;
    /** @type {Int32Array} */ let cells = new Int32Array(0);
    /** @type {Int32Array} */ let years = new Int32Array(0);
    /** @type {Int32Array} */ let start = new Int32Array(0);
    /** @type {Events} */ let out = { cells: new Int32Array(0), years: new Int16Array(0), cls: new Uint8Array(0) };
    return function step() {
      if (phase === 0) { // count, a few rows at a time
        const end = Math.min(rows, row + stepRows);
        for (let r = row; r < end; r++) {
          for (let c = 0, i = r * cols; c < cols; c++, i++) {
            const v = plane[i];
            if (v & 7) { pace.count(c, r, v >> CLASS_BITS); m++; }
          }
        }
        row = end;
        if (row === rows) {
          pace.finish();
          cells = new Int32Array(m); years = new Int32Array(m); start = new Int32Array(span + 1);
          phase = 1; row = 0; j = 0;
        }
        return true;
      }
      if (phase === 1) { // each changing cell's switch year, and how many switch in each year
        const end = Math.min(rows, row + stepRows);
        for (let r = row; r < end; r++) {
          for (let c = 0, i = r * cols; c < cols; c++, i++) {
            const v = plane[i];
            if (!(v & 7)) continue;
            const y = yearAt(pace.fraction(c, r, v >> CLASS_BITS, hash01(c, r, s)), first, span);
            cells[j] = i; years[j++] = y;
            start[y - first + 1]++;
          }
        }
        row = end;
        if (row === rows) {
          for (let y = 0; y < span; y++) start[y + 1] += start[y];
          out = { cells: new Int32Array(m), years: new Int16Array(m), cls: new Uint8Array(m) };
          phase = 2; j = 0;
        }
        return true;
      }
      // A counting sort by year (stable, so cells of one year stay in grid order): a span of
      // years is then one slice of the list.
      const end = Math.min(m, j + STEP_CELLS);
      for (; j < end; j++) {
        const at = start[years[j] - first]++;
        out.cells[at] = cells[j];
        out.years[at] = indexYear(years[j]);
        out.cls[at] = lead ? base[cells[j]] : plane[cells[j]] & 7;
      }
      if (j < m) return true;
      finish(out);
      return false;
    };
  }

  /** @type {((() => boolean) | null)[]} */
  const jobs = intervals.map(() => null);
  // The lead-in's switches (null until worked out) and, per override cell, its lead-in switch.
  /** @type {Events | null} */
  let leadEvents = null;
  /** @type {(() => boolean) | null} */
  let leadJob = null;
  const leadSlotYear = new Int16Array(slots.length);

  /** Stores interval k's finished switches. @param {number} k @param {Events} out */
  function done(k, out) {
    if (slots.length) {
      const sa = { years: new Int16Array(slots.length), cls: new Uint8Array(slots.length) };
      for (let j = 0; j < out.cells.length; j++) {
        const s = slotOf.get(out.cells[j]);
        if (s !== undefined) { sa.years[s] = out.years[j]; sa.cls[s] = out.cls[j]; }
      }
      slotAnchor[k] = sa;
    }
    events[k] = out;
    jobs[k] = null;
  }

  /** The changes of interval k, worked out once (finishing any work done ahead). @param {number} k */
  function prepare(k) {
    const ready = events[k];
    if (ready) return ready;
    const step = jobs[k] ?? job(k);
    jobs[k] = step;
    while (step());
    return /** @type {Events} */ (events[k]);
  }

  /** The lead-in's switches, worked out once (finishing any work done ahead). */
  function prepareLead() {
    if (leadEvents) return leadEvents;
    const step = leadJob ?? (leadJob = leadStep());
    while (step());
    return /** @type {Events} */ (/** @type {unknown} */ (leadEvents));
  }

  function leadStep() {
    return jobOf(/** @type {LeadIn} */ (leadIn), seed + LEAD_SEED_OFFSET, true, (out) => {
      for (let j = 0; j < out.cells.length && slots.length; j++) {
        const s = slotOf.get(out.cells[j]);
        if (s !== undefined) leadSlotYear[s] = out.years[j];
      }
      leadEvents = out;
      leadJob = null;
    });
  }

  /**
   * One small piece of preparing work, for the stretch `year` is in (or the next one), then for
   * the later ones, then the earlier ones. For spare frame time: call it until it returns false
   * or the frame's budget is spent. Nothing it does changes any answer, only when the work is done.
   * @param {number} year the year the map shows now, never 0
   * @returns {boolean} true while work is left
   */
  function prepareStep(year) {
    checkYear(year);
    if (leadIn && !leadEvents && year < leadIn.y1) { // before 1219 the lead-in comes first
      leadJob ??= leadStep();
      leadJob();
      return true;
    }
    let k = -1;
    for (let q = 0; q < intervals.length; q++) if (!events[q] && intervals[q].y1 > year) { k = q; break; }
    if (k < 0) k = events.findIndex((e) => !e);
    if (k < 0) {
      if (!leadIn || leadEvents) return false;
      leadJob ??= leadStep();
      leadJob();
      return Boolean(!leadEvents);
    }
    const step = jobs[k] ?? job(k);
    jobs[k] = step;
    step();
    return events.some((e) => !e) || Boolean(leadIn && !leadEvents);
  }

  /** Whether interval k's switch years are worked out (-1: the lead-in's). @param {number} k */
  const isPrepared = (k) => (k < 0 ? Boolean(leadEvents) : Boolean(events[k]));

  /**
   * Every change of interval k at once, for a year past its end: from the switches if they are
   * ready, else straight from the plane (each changing cell once, so the order does not matter).
   * @param {number} k @param {(cell: number, cls: number) => void} use
   */
  function eachChange(k, use) {
    const e = events[k];
    if (e) {
      for (let j = 0; j < e.cells.length; j++) use(e.cells[j], e.cls[j]);
      return;
    }
    const plane = intervals[k].plane;
    for (let i = 0; i < n; i++) { const v = plane[i] & 7; if (v) use(i, v); }
  }

  /** The anchors' class for an override cell in a year. @param {number} s @param {number} year */
  function anchorClassAt(s, year) {
    const cell = slots[s].cell;
    let c = base[cell];
    if (leadIn && year < leadIn.y1) { // before 1219: the AD 1 class until the cell's lead-in switch
      const before = leadIn.plane[cell] & 7;
      if (before) { prepareLead(); if (year < leadSlotYear[s]) c = before; }
      return c;
    }
    for (let k = 0; k < intervals.length && intervals[k].y0 < year; k++) {
      if (year >= intervals[k].y1) {
        const v = intervals[k].plane[cell] & 7;
        if (v) c = v;
        continue;
      }
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
   * The whole grid in a year. Only the stretch the year is inside of needs its switch years; the
   * stretches before it are taken whole.
   * @param {number} year never 0
   * @returns {Uint8Array} a new grid
   */
  function classesAt(year) {
    checkYear(year);
    const grid = base.slice();
    if (leadIn && year < leadIn.y1) { // the AD 1 grid, then the cells that have switched to 1219's
      const plane = leadIn.plane;
      for (let i = 0; i < n; i++) { const v = plane[i] & 7; if (v) grid[i] = v; }
      const e = prepareLead();
      const end = after(e.years, year);
      for (let j = 0; j < end; j++) grid[e.cells[j]] = e.cls[j];
    }
    for (let k = 0; k < intervals.length && intervals[k].y0 < year; k++) {
      if (year >= intervals[k].y1) { eachChange(k, (i, c) => { grid[i] = c; }); continue; }
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
    /** @param {number} i @param {number} c */
    const putShown = (i, c) => {
      const s = slots.length ? slotOf.get(i) : undefined;
      put(i, s === undefined ? c : shownAt(s, toYear));
    };
    if (toYear < fromYear) {
      const now = classesAt(toYear);
      for (let i = 0; i < n; i++) if (grid[i] !== now[i]) put(i, now[i]);
      return changed;
    }
    if (leadIn && fromYear < leadIn.y1) { // the lead-in's cells switch to the base grid's class
      if (fromYear <= leadIn.y0 && toYear >= leadIn.y1) {
        for (let i = 0; i < n; i++) if (leadIn.plane[i] & 7) putShown(i, base[i]);
      } else {
        const e = prepareLead();
        const end = after(e.years, toYear);
        for (let j = after(e.years, fromYear); j < end; j++) putShown(e.cells[j], e.cls[j]);
      }
    }
    for (let k = 0; k < intervals.length; k++) {
      const { y0, y1 } = intervals[k];
      if (y1 <= fromYear || y0 >= toYear) continue;
      // The whole stretch at once (a long jump forward): no switch years needed.
      if (fromYear <= y0 && toYear >= y1) { eachChange(k, putShown); continue; }
      const e = prepare(k);
      const end = after(e.years, toYear);
      for (let j = after(e.years, fromYear); j < end; j++) putShown(e.cells[j], e.cls[j]);
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
  /** The lead-in's switches in year order (for tests and previews); null without a lead-in. */
  const leadSwitches = () => (leadIn ? prepareLead() : null);

  return { cols, rows, intervals, leadIn, classesAt, advance, switches, leadSwitches, prepareStep, isPrepared };
}

/** @param {number} year */
function checkRange(year) {
  if (Math.abs(year) > MAX_YEAR) throw new RangeError(`year ${year} is beyond what the map timeline can hold (${-MAX_YEAR} to ${MAX_YEAR})`);
}

/** @typedef {ReturnType<typeof createTerrainTimeline>} TerrainTimeline */

/**
 * The timeline from the shipped terrain-time block (src/data/by-sa/terrain-time.json, unpacked)
 * and the 1219 terrain it grows from. The block's layers are its change planes; its meta says
 * which stretch each one covers and the seed and block size the switch years use.
 * The lead-in comes from the terrain-ad1 block (src/data/by-sa/terrain-ad1.json), read only for
 * dates before 1219: its meta names the layer and the years.
 * @param {{ meta: { grid: { cols: number, rows: number }, intervals: { y0: number, y1: number, layer: string }[],
 *   seed: number, blockCells: number }, layers: Record<string, Uint8Array>, base: Uint8Array, overrides?: Override[],
 *   lead?: { meta: { leadIn: { y0: number, y1: number, layer: string }, grid: { cols: number, rows: number }, seed: number, blockCells: number },
 *   layers: Record<string, Uint8Array> } | null }} spec
 */
export function timelineFromBlock({ meta, layers, base, overrides = [], lead = null }) {
  const intervals = meta.intervals.map(({ y0, y1, layer }) => {
    const plane = layers[layer];
    if (!plane) throw new Error(`the terrain-time block has no layer ${layer}`);
    return { y0, y1, plane };
  });
  /** @type {LeadIn | null} */
  let leadIn = null;
  if (lead) {
    const { y0, y1, layer } = lead.meta.leadIn;
    const plane = lead.layers[layer];
    if (!plane) throw new Error(`the terrain-ad1 block has no layer ${layer}`);
    if (lead.meta.grid.cols !== meta.grid.cols || lead.meta.grid.rows !== meta.grid.rows) throw new Error('the AD 1 land and the land over time use different grids');
    if (lead.meta.seed !== meta.seed || lead.meta.blockCells !== meta.blockCells) throw new Error('the AD 1 land and the land over time use different settings');
    leadIn = { y0, y1, plane };
  }
  return createTerrainTimeline({ cols: meta.grid.cols, rows: meta.grid.rows, base, intervals, overrides, seed: meta.seed, block: meta.blockCells, leadIn });
}

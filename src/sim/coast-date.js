// @ts-check
// The northern coast over time: where the sea stood in a given year, from the coast field that
// tools/map/build-coast.mjs makes (shipped in src/data/by/coast.json). Plain data in, plain data
// out, so the game rules can ask it later (a harbour that falls dry, a ford that opens).
//
// The field covers a box of 500 m cells over the north of the map, where the land has risen
// since 1219 (Sweden, Åland, Finland, Estonia). One byte per cell:
//   0          land before 1219 (or a stable shore: nothing changes here)
//   1 to 201   was sea, and is land (or lake) from the year 1219 + 4 x code
//   254        sea all game
// Codes run in steps of four years, so a cell with code k is sea up to 1219 + 4k - 1 and land
// from 1219 + 4k on. Years before 1219 read as 1219 unless a lead-in field is given (M3b, below).
//
// The lead-in (M3b, the AD 1 coast): a second field over the same box, read only for years before
// 1219 (the game loads it only for those dates). One byte per cell, in steps of 8 years from AD 1:
//   0          land at AD 1 (or a stable shore)
//   1 to 253   was sea, and is land from the year 1 + 8 x code (codes 153 and up: after 1219, the
//              same cells as the 1219 field's codes 1 to 201, so the two fields agree at 1219)
//   254        sea all game
// Before 1219 a cell is sea when its lead code is above leadLevel(year); from 1219 on the 1219
// field above is used, so nothing jumps at the hand-over: the sea cells are the same set.
//
// Cells of today's sea within two cells of the land carry the code of the land beside them
// (the smallest one), so the old shore drawn from this field never leaves a sliver of old sea on
// today's land. So a place is sea in a year when it is outside today's land (map.land) OR
// seaAt says so; seaAt alone is not today's sea. Outside the box the coast never changes.

export const COAST_BASE_YEAR = 1219;
export const COAST_STEP = 4;
/** The lead-in field (AD 1 to 1219): its first year, step and the year the 1219 field takes over. */
export const LEAD = Object.freeze({ baseYear: 1, step: 8, last: 253, handOver: COAST_BASE_YEAR });
/** The codes of the field. */
export const COAST_CODE = Object.freeze({ land: 0, first: 1, last: 201, sea: 254 });

/**
 * Where the field lies: cell (c, r) of the box covers game units
 * [(col0 + c) * cell, (col0 + c + 1) * cell) x [(row0 + r) * cell, (row0 + r + 1) * cell), row 0 at
 * the south.
 * @typedef {{ col0: number, row0: number, cols: number, rows: number, cell: number }} CoastBox
 */

/**
 * How many 4-year steps of the coast have passed by a year: a cell with code k is land in that
 * year when k <= level(year). 0 up to 1222, 201 from 2023 on.
 * @param {number} year
 */
export function coastLevel(year) {
  const steps = Math.floor((year - COAST_BASE_YEAR) / COAST_STEP);
  return Math.max(0, Math.min(COAST_CODE.last, steps));
}

/**
 * How many 8-year steps of the lead-in field have passed by a year before 1219: a cell with lead
 * code k is land in that year when k <= leadLevel(year). 0 up to AD 8, 152 in 1218.
 * @param {number} year
 */
export function leadLevel(year) {
  const steps = Math.floor((year - LEAD.baseYear) / LEAD.step);
  return Math.max(0, Math.min(Math.floor((LEAD.handOver - 1 - LEAD.baseYear) / LEAD.step), steps));
}

/**
 * The first year a cell is no longer sea: -Infinity for land before 1219, Infinity for sea all game.
 * @param {number} code
 */
export function emergedYearOf(code) {
  if (code === COAST_CODE.land) return -Infinity;
  if (code === COAST_CODE.sea) return Infinity;
  if (code >= COAST_CODE.first && code <= COAST_CODE.last) return COAST_BASE_YEAR + COAST_STEP * code;
  throw new RangeError(`not a coast code: ${code}`);
}

/**
 * Is a cell with this code sea at this level? (254 always, 0 never.)
 * @param {number} code @param {number} level
 */
export const seaAtLevel = (code, level) => code > level;

/**
 * Cells sorted by code (a counting sort): start[k] is where the cells of code k begin in the order.
 * @param {Uint8Array} codes @param {number} last the highest code that changes
 */
function sortedByCode(codes, last) {
  const count = new Int32Array(256);
  for (let i = 0; i < codes.length; i++) count[codes[i]]++;
  for (let k = last + 1; k < 256; k++) if (count[k] && k !== COAST_CODE.sea) throw new Error(`coast field: unknown code ${k}`);
  const start = new Int32Array(last + 2);
  for (let k = 1; k <= last; k++) start[k + 1] = count[k];
  for (let k = 1; k <= last + 1; k++) start[k] += start[k - 1];
  const order = new Int32Array(start[last + 1]);
  const fill = start.slice();
  for (let i = 0; i < codes.length; i++) {
    const k = codes[i];
    if (k >= 1 && k <= last) order[fill[k]++] = i;
  }
  return { start, order };
}

/**
 * @param {{ box: CoastBox, codes: Uint8Array, lead?: Uint8Array | null }} field lead: the AD 1 to 1219
 *   field over the same box (see the top of the file), or null
 */
export function createCoast({ box, codes, lead = null }) {
  const { col0, row0, cols, rows, cell } = box;
  if (codes.length !== cols * rows) throw new Error(`coast field: ${codes.length} cells for a box of ${cols} x ${rows}`);
  if (lead && lead.length !== codes.length) throw new Error(`coast lead-in field: ${lead.length} cells for a box of ${cols} x ${rows}`);
  const leadSorted = lead ? sortedByCode(lead, LEAD.last) : null;
  /** Is a year before the hand-over, with a lead-in field to answer for it? @param {number} year */
  const inLead = (year) => Boolean(lead) && year < LEAD.handOver;

  // The cells that change, sorted by code (a counting sort), so the cells that change between two
  // years are one stretch of this list: start[k] is where the cells of code k begin.
  const count = new Int32Array(256);
  for (let i = 0; i < codes.length; i++) count[codes[i]]++;
  for (let k = COAST_CODE.last + 1; k < 256; k++) if (count[k] && k !== COAST_CODE.sea) throw new Error(`coast field: unknown code ${k}`);
  const start = new Int32Array(COAST_CODE.last + 2);
  for (let k = COAST_CODE.first; k <= COAST_CODE.last; k++) start[k + 1] = count[k];
  for (let k = 1; k <= COAST_CODE.last + 1; k++) start[k] += start[k - 1];
  const order = new Int32Array(start[COAST_CODE.last + 1]);
  const fill = start.slice();
  for (let i = 0; i < codes.length; i++) {
    const k = codes[i];
    if (k >= COAST_CODE.first && k <= COAST_CODE.last) order[fill[k]++] = i;
  }
  let level = 0;
  let onLead = false;

  /** The cell index under a point in game units, or -1 outside the box. @param {number} x @param {number} y */
  const cellAt = (x, y) => {
    const c = Math.floor(x / cell) - col0;
    const r = Math.floor(y / cell) - row0;
    return c >= 0 && r >= 0 && c < cols && r < rows ? r * cols + c : -1;
  };

  return {
    box,
    codes,
    /** The lead-in field (AD 1 to 1219), or null. */
    lead,
    cellAt,
    /** The year a cell stops being sea (see emergedYearOf). @param {number} i cell index */
    emergedYear: (i) => emergedYearOf(codes[i]),
    /**
     * Is the old sea here in this year? false outside the box (nothing changes there).
     * @param {number} x @param {number} y game units @param {number} year
     */
    seaAt(x, y, year) {
      const i = cellAt(x, y);
      return i >= 0 && (inLead(year) ? seaAtLevel(/** @type {Uint8Array} */ (lead)[i], leadLevel(year)) : seaAtLevel(codes[i], coastLevel(year)));
    },
    /** The same for a cell index. @param {number} i @param {number} year */
    seaAtCell: (i, year) => (inLead(year) ? seaAtLevel(/** @type {Uint8Array} */ (lead)[i], leadLevel(year)) : seaAtLevel(codes[i], coastLevel(year))),
    /** The level the coast was last stepped to (in the lead-in field's steps while `onLead`). */
    get level() { return level; },
    /** True while the coast stands at a year before 1219 and so reads the lead-in field. */
    get onLead() { return onLead; },
    /** Changes whenever the picture of the coast changes: the level, told apart by field. */
    get key() { return onLead ? -1 - level : level; },
    /** The field the old shore is drawn from at the current step. */
    get field() { return onLead ? /** @type {Uint8Array} */ (lead) : codes; },
    /**
     * Moves the coast to a year and returns the cells that changed since the last step: from sea to
     * land going forward in time, from land to sea going back. The list is a view into a shared
     * array: read it before the next step. Across the hand-over at 1219 (a different field takes
     * over) no cells are listed: the whole picture changes together, and the two fields agree.
     * @param {number} year
     * @returns {{ cells: Int32Array, toLand: boolean, level: number }}
     */
    step(year) {
      if (inLead(year) || onLead) {
        const was = onLead; const wasLevel = level;
        onLead = inLead(year);
        level = onLead ? leadLevel(year) : coastLevel(year);
        if (was !== onLead || !leadSorted) return { cells: new Int32Array(0), toLand: level >= wasLevel, level };
        const lo = Math.min(wasLevel, level); const hi = Math.max(wasLevel, level);
        return { cells: leadSorted.order.subarray(leadSorted.start[lo + 1], leadSorted.start[hi + 1]), toLand: level >= wasLevel, level };
      }
      const next = coastLevel(year);
      const lo = Math.min(level, next);
      const hi = Math.max(level, next);
      const toLand = next >= level;
      level = next;
      // Cells with codes in (lo, hi] change.
      return { cells: order.subarray(start[lo + 1], start[hi + 1]), toLand, level };
    },
  };
}

/** @typedef {ReturnType<typeof createCoast>} Coast */

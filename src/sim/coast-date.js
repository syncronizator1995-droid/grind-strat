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
// from 1219 + 4k on. Years before 1219 read as 1219: older slices (M3b) bring their own fields.
//
// Cells of today's sea within two cells of the land carry the code of the land beside them
// (the smallest one), so the old shore drawn from this field never leaves a sliver of old sea on
// today's land. So a place is sea in a year when it is outside today's land (map.land) OR
// seaAt says so; seaAt alone is not today's sea. Outside the box the coast never changes.

export const COAST_BASE_YEAR = 1219;
export const COAST_STEP = 4;
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
 * @param {{ box: CoastBox, codes: Uint8Array }} field
 */
export function createCoast({ box, codes }) {
  const { col0, row0, cols, rows, cell } = box;
  if (codes.length !== cols * rows) throw new Error(`coast field: ${codes.length} cells for a box of ${cols} x ${rows}`);
  for (const k of codes) if (k > COAST_CODE.last && k !== COAST_CODE.sea) throw new Error(`coast field: unknown code ${k}`);

  // The cells that change, sorted by code (a counting sort), so the cells that change between two
  // years are one stretch of this list: start[k] is where the cells of code k begin.
  const start = new Int32Array(COAST_CODE.last + 2);
  for (const k of codes) if (k >= COAST_CODE.first && k <= COAST_CODE.last) start[k + 1]++;
  for (let k = 1; k <= COAST_CODE.last + 1; k++) start[k] += start[k - 1];
  const order = new Int32Array(start[COAST_CODE.last + 1]);
  const fill = start.slice();
  for (let i = 0; i < codes.length; i++) {
    const k = codes[i];
    if (k >= COAST_CODE.first && k <= COAST_CODE.last) order[fill[k]++] = i;
  }
  let level = 0;

  /** The cell index under a point in game units, or -1 outside the box. @param {number} x @param {number} y */
  const cellAt = (x, y) => {
    const c = Math.floor(x / cell) - col0;
    const r = Math.floor(y / cell) - row0;
    return c >= 0 && r >= 0 && c < cols && r < rows ? r * cols + c : -1;
  };

  return {
    box,
    codes,
    cellAt,
    /** The year a cell stops being sea (see emergedYearOf). @param {number} i cell index */
    emergedYear: (i) => emergedYearOf(codes[i]),
    /**
     * Is the old sea here in this year? false outside the box (nothing changes there).
     * @param {number} x @param {number} y game units @param {number} year
     */
    seaAt(x, y, year) {
      const i = cellAt(x, y);
      return i >= 0 && seaAtLevel(codes[i], coastLevel(year));
    },
    /** The same for a cell index. @param {number} i @param {number} year */
    seaAtCell: (i, year) => seaAtLevel(codes[i], coastLevel(year)),
    /** The level the coast was last stepped to. */
    get level() { return level; },
    /**
     * Moves the coast to a year and returns the cells that changed since the last step: from sea to
     * land going forward in time, from land to sea going back. The list is a view into a shared
     * array: read it before the next step.
     * @param {number} year
     * @returns {{ cells: Int32Array, toLand: boolean, level: number }}
     */
    step(year) {
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

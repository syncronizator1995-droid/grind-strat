// @ts-check
// The map's date, for the view: which year the map shows, and what changes when that year moves
// (the land, the dated rivers and lakes, our drawn shapes, the northern coast). No DOM here, so
// it runs in Node for tests; the view draws what it says. Nothing here is saved: the map for a
// date is always worked out again from the shipped data (src/sim/map-date.js, coast-date.js).

import { activeAt, eraOf, FIRST_MAP_YEAR, mapYear } from '../../sim/map-date.js';
import { tagsOnAt } from './water-tiles.js';

/**
 * The year the map draws for a game day: the calendar year, and 1219 for anything earlier (the
 * ice-age and AD 1 maps come in M3b).
 * @param {number} day days since 1 January AD 1, as the game stores its date
 */
export const mapYearOfDay = (day) => eraOf(mapYear(day)).year;

/**
 * The hidden test link: #date=1550 shows the map of 1550, and #date=1550&view=5057,10484,0.12
 * also puts the camera there (game units, CSS px per unit), for the screenshot checks. AD years
 * only for now. Null when the link asks for neither.
 * @param {string} hash location.hash
 * @returns {{ year: number, view: { cx: number, cy: number, scale: number } | null } | null}
 */
export function parseTestLink(hash) {
  const m = /^#date=(\d{1,4})(?:&view=(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?))?$/.exec(hash);
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 1) return null;
  const view = m[2] ? { cx: Number(m[2]), cy: Number(m[3]), scale: Number(m[4]) } : null;
  return { year, view: view && view.scale > 0 ? view : null };
}

/**
 * The year the hidden test link asks for, or null.
 * @param {string} hash location.hash
 */
export const yearFromHash = (hash) => parseTestLink(hash)?.year ?? null;

/**
 * @typedef {object} DateChanges what moving to a year changed
 * @property {number} cells terrain cells that changed class
 * @property {boolean} tags a dated river or lake came or went
 * @property {boolean} shapes one of our drawn shapes came or went
 * @property {boolean} coast the northern coast moved
 */

/**
 * The map's date over the unpacked data. The terrain grid is the one the view paints, changed in
 * place; `year` is the year it shows now (1219 for the shipped grid).
 * @param {import('./load.js').DatedData} data
 * @param {Uint8Array} grid
 * @param {number} [year]
 */
export function createDateLayer(data, grid, year = FIRST_MAP_YEAR) {
  const { timeline, coast, entries, shapes } = data;
  // Each drawn shape follows the dated entry of the same id; the terrain shapes are not drawn.
  const shapeEntry = shapes.map((s) => (s.type === 'terrain' ? null : entries.find((e) => e.id === s.id && e.on) ?? null));
  const shapeWindows = shapeEntry.map((e) => ({ on: e?.on ?? /** @type {[number | null, number | null]} */ ([1, 1]) }));
  let shown = year;
  /** @type {string[] | null} */
  let tags = null;
  /** @type {Uint8Array | null} */
  let tagOn = null;
  /** Shapes on in a year; a shape with no entry is never drawn. @param {number} y */
  const shapesAt = (y) => {
    const on = activeAt(shapeWindows, y);
    shapeEntry.forEach((e, k) => { if (!e) on[k] = 0; });
    return on;
  };
  let shapeOn = shapesAt(shown);
  coast.step(shown);
  /** All the land's changes are prepared (no more work appears later). */
  let prepared = false;

  /** @param {Uint8Array} a @param {Uint8Array} b */
  const same = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);

  return {
    /** The year the map shows now. */
    get year() { return shown; },
    /** Per date tag of the water, 1 where it is shown now; null until the water is in. */
    get tagOn() { return tagOn; },
    /** Per drawn shape, 1 where it is shown now. */
    get shapeOn() { return shapeOn; },
    /** How many 4-year steps the northern coast has risen (src/sim/coast-date.js coastLevel). */
    get coastLevel() { return coast.level; },
    /**
     * The water's date tags, once the water is unpacked.
     * @param {string[]} next
     */
    setTags(next) {
      tags = next;
      tagOn = tagsOnAt(tags, entries, shown);
    },
    /**
     * Makes the grid show the current year cell for cell (the shipped grid lacks the overrides,
     * Żuławy's marsh before diking): for the moment the data arrives.
     * @param {(cell: number) => void} onCell called for each cell that changed
     */
    sync(onCell) {
      const now = timeline.classesAt(shown);
      let n = 0;
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] !== now[i]) { grid[i] = now[i]; onCell(i); n++; }
      }
      return n;
    },
    /**
     * Moves the map to a year (forward is cheap; backward rebuilds the grid).
     * @param {number} next never 0
     * @param {(cell: number) => void} onCell called for each terrain cell that changed
     * @returns {DateChanges}
     */
    goTo(next, onCell) {
      const from = shown;
      const cells = next === from ? 0 : timeline.advance(grid, from, next, onCell);
      shown = next;
      const nextShapes = shapesAt(next);
      const shapesMoved = !same(nextShapes, shapeOn);
      shapeOn = nextShapes;
      let tagsMoved = false;
      if (tags) {
        const nextTags = tagsOnAt(tags, entries, next);
        tagsMoved = !tagOn || !same(nextTags, tagOn);
        tagOn = nextTags;
      }
      const level = coast.level;
      const coastMoved = coast.step(next).level !== level;
      return { cells, tags: tagsMoved, shapes: shapesMoved, coast: coastMoved };
    },
    /**
     * Prepares the land's coming changes in small pieces until `until` (performance.now() ms),
     * so the date never stops for it. Returns true while work is left.
     * @param {number} until @param {() => number} [now]
     */
    prepare(until, now = () => performance.now()) {
      while (!prepared && now() < until) prepared = !timeline.prepareStep(shown);
      return !prepared;
    },
    /**
     * Is the old sea here now? (Over today's land, where it stood higher.) Game units.
     * @param {number} x @param {number} y
     */
    seaAt: (x, y) => coast.seaAt(x, y, shown),
  };
}

/** @typedef {ReturnType<typeof createDateLayer>} DateLayer */

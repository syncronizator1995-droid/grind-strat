// @ts-check
// The ice-age maps (M3b), as the view needs them: unpacked from an age block, painted into pixels,
// and turned into the few shapes the view draws on top (the old shore, the "no model yet"
// hatching). Pure: no DOM and no canvas here, so it runs in Node for tests; the view puts the
// pixels on a canvas. Nothing here is saved: the picture is always worked out again from the data.
//
// THE AGE BLOCK (kind "ages", one block for all the ages; written by PR 3 of M3b)
//
//   Licence CC-BY-SA-4.0 (the pollen cover is share-alike; the CC BY inputs may go in). A late
//   block: it sits last in the page as a comment and is read only for a date before AD 1.
//   meta.ages  one entry per age, in year order:
//                { id: 'age-9500bc', year: -9500, stage: 'Yoldia Sea' }
//              id and year are those of AGES in src/sim/map-date.js; stage is the name of the
//              water the age shows (the tap on water says it); one age, one stage name.
//   meta.grid  { cols, rows, cell } of the surface layers: the terrain grid of the game (1 km
//              cells, `cell` game units each, row 0 at the south, row-major).
//   layers     for each age two byte grids (no layers: the age has no data yet):
//     <id>/surface  cols x rows, one byte per 1 km cell:
//                     0 dry land      1 water (lake or sea of that age)      2 ice
//                   Water and ice never share a cell. Land that today is sea (the dry sea floor)
//                   is 0 here, and water over today's land is 1. Ice and water edges are 1 km.
//     <id>/cover    ceil(cols / 2) x ceil(rows / 2), one byte per 2 km cell, row 0 at the south;
//                   the land cover where the surface is 0 (and under water, where it is not read):
//                     0 no model yet   1 tundra   2 birch woodland   3 pine   4 mixed forest
//                   A 1 km land cell with cover 0 is "no model yet" (hatched). Water and ice are
//                   painted wherever the surface says so, model or not.
//
// A block is made with makeBlock (tools/map/block.mjs), the layers deflated together as in every
// other block. Reading it: loadAges in src/ui/map/load.js, then unpackAge below.

import { shoreAt, shoreSquares } from './shore.js';

/** The bytes of the surface layer. */
export const SURFACE = Object.freeze({ land: 0, water: 1, ice: 2 });
/** The bytes of the cover layer. */
export const COVER = Object.freeze({ none: 0, tundra: 1, birch: 2, pine: 3, mixed: 4 });

/** The cover layer is one cell per this many surface cells in each direction (2 km on 1 km). */
export const COVER_STEP = 2;

/** Colours of the age map, [r, g, b]: plain, like the rest of the painted map. */
export const AGE_COLOURS = Object.freeze({
  /** Indexed by COVER. The "no model yet" colour is a flat grey, the view hatches over it. */
  cover: [[150, 148, 140], [186, 184, 150], [150, 170, 104], [78, 104, 70], [108, 136, 82]],
  ice: [244, 247, 250],
  water: [58, 104, 130],
});

/** The year of "today" the banner counts back from (the game's real-world now, Ignas, 2 November 2026). */
export const TODAY_YEAR = 2026;

/**
 * @typedef {object} AgeSlice one age, unpacked
 * @property {string} id @property {number} year @property {string} stage
 * @property {number} cols @property {number} rows @property {number} cell the surface grid
 * @property {Uint8Array} surface cols x rows
 * @property {number} coverCols @property {number} coverRows
 * @property {Uint8Array} cover coverCols x coverRows
 */

/**
 * Checks an age's layers and makes the slice. Plain words in the errors: they reach the player.
 * @param {{ id: string, year: number, stage: string }} entry from meta.ages
 * @param {{ cols: number, rows: number, cell: number }} grid from meta.grid
 * @param {Uint8Array} surface @param {Uint8Array} cover
 * @returns {AgeSlice}
 */
export function unpackAge(entry, grid, surface, cover) {
  const { cols, rows, cell } = grid;
  const coverCols = Math.ceil(cols / COVER_STEP);
  const coverRows = Math.ceil(rows / COVER_STEP);
  if (surface.length !== cols * rows) throw new Error(`the ${entry.id} map's land and water are the wrong size`);
  if (cover.length !== coverCols * coverRows) throw new Error(`the ${entry.id} map's land cover is the wrong size`);
  for (let i = 0; i < surface.length; i++) if (surface[i] > SURFACE.ice) throw new Error(`the ${entry.id} map has a land or water value it does not know`);
  for (let i = 0; i < cover.length; i++) if (cover[i] > COVER.mixed) throw new Error(`the ${entry.id} map has a land cover it does not know`);
  return { id: entry.id, year: entry.year, stage: entry.stage, cols, rows, cell, surface, coverCols, coverRows, cover };
}

/** The cover class of the 1 km cell (c, r). @param {AgeSlice} s @param {number} c @param {number} r */
const coverAt = (s, c, r) => s.cover[Math.floor(r / COVER_STEP) * s.coverCols + Math.floor(c / COVER_STEP)];

/**
 * What a point of the map is in this age: 'water', 'ice', 'land' (modelled) or 'none' (land with
 * no model yet). Null outside the grid. Game units.
 * @param {AgeSlice} s @param {number} x @param {number} y
 * @returns {'water' | 'ice' | 'land' | 'none' | null}
 */
export function surfaceAt(s, x, y) {
  const c = Math.floor(x / s.cell);
  const r = Math.floor(y / s.cell);
  if (c < 0 || r < 0 || c >= s.cols || r >= s.rows) return null;
  const v = s.surface[r * s.cols + c];
  if (v === SURFACE.water) return 'water';
  if (v === SURFACE.ice) return 'ice';
  return coverAt(s, c, r) === COVER.none ? 'none' : 'land';
}

/**
 * The pixels of the age map, one per 1 km cell, row 0 at the south (like the terrain tiles), as
 * 0xAABBGGRR words ready for an ImageData. Hill shading, when given, brightens or darkens the land
 * only: one factor around 1 per cover cell (the same grid as the cover layer).
 * @param {AgeSlice} s
 * @param {Float32Array | null} [shade]
 * @returns {Uint32Array}
 */
export function paintAge(s, shade = null) {
  const { cols, rows, surface } = s;
  const out = new Uint32Array(cols * rows);
  const pack = (/** @type {number[]} */ rgb, /** @type {number} */ f = 1) =>
    (255 << 24) | (Math.min(255, Math.round(rgb[2] * f)) << 16) | (Math.min(255, Math.round(rgb[1] * f)) << 8) | Math.min(255, Math.round(rgb[0] * f));
  const ice = pack(AGE_COLOURS.ice);
  const water = pack(AGE_COLOURS.water);
  for (let r = 0; r < rows; r++) {
    const coverRow = Math.floor(r / COVER_STEP) * s.coverCols;
    for (let c = 0; c < cols; c++) {
      const v = surface[r * cols + c];
      if (v === SURFACE.ice) { out[r * cols + c] = ice; continue; }
      if (v === SURFACE.water) { out[r * cols + c] = water; continue; }
      const at = coverRow + Math.floor(c / COVER_STEP);
      const k = s.cover[at];
      out[r * cols + c] = pack(AGE_COLOURS.cover[k], k === COVER.none || !shade ? 1 : shade[at]);
    }
  }
  return out;
}

/**
 * The "no model yet" area as rectangles to hatch: land cells with cover 0. Runs along a row are
 * joined, and a run with the same ends as the one below it grows into one taller rectangle.
 * Game units.
 * @param {AgeSlice} s
 * @returns {{ x: number, y: number, w: number, h: number }[]}
 */
export function hatchRects(s) {
  const { cols, rows, cell, surface } = s;
  /** @type {{ x: number, y: number, w: number, h: number }[]} */
  const done = [];
  /** Rectangles still growing, by their first column and width. @type {Map<string, { c0: number, c1: number, r0: number, r1: number }>} */
  let open = new Map();
  for (let r = 0; r < rows; r++) {
    /** @type {Map<string, { c0: number, c1: number, r0: number, r1: number }>} */
    const next = new Map();
    let c = 0;
    while (c < cols) {
      if (!(surface[r * cols + c] === SURFACE.land && coverAt(s, c, r) === COVER.none)) { c++; continue; }
      const c0 = c;
      while (c < cols && surface[r * cols + c] === SURFACE.land && coverAt(s, c, r) === COVER.none) c++;
      const key = `${c0}:${c}`;
      const grown = open.get(key);
      if (grown) { grown.r1 = r + 1; next.set(key, grown); open.delete(key); } else next.set(key, { c0, c1: c, r0: r, r1: r + 1 });
    }
    for (const rect of open.values()) done.push({ x: rect.c0 * cell, y: rect.r0 * cell, w: (rect.c1 - rect.c0) * cell, h: (rect.r1 - rect.r0) * cell });
    open = next;
  }
  for (const rect of open.values()) done.push({ x: rect.c0 * cell, y: rect.r0 * cell, w: (rect.c1 - rect.c0) * cell, h: (rect.r1 - rect.r0) * cell });
  return done;
}

/**
 * The old shore: the line round the water of the age, from marching squares on a plain water mask
 * (src/ui/map/shore.js, the same code as the northern coast's old sea). The shore slides half way
 * between a water cell's centre and its dry neighbour's. Polylines in game units; a closed loop
 * repeats its first point. Not drawn where the grid ends.
 * @param {AgeSlice} s
 * @returns {number[][]}
 */
export function oldShore(s) {
  const { cols, rows, cell, surface } = s;
  const mask = new Uint8Array(cols * rows);
  for (let i = 0; i < mask.length; i++) mask[i] = surface[i] === SURFACE.water ? 1 : 0;
  const squares = shoreSquares({ col0: 0, row0: 0, cols, rows, cell }, mask);
  return shoreAt(squares, 0).lines;
}

/** @param {number} n 9500 gives "9,500" */
const withCommas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * How the age is named for the player: "about 9,500 BC (about 11,500 years ago)". Years ago are
 * counted from today's year (2026) and rounded to the nearest 500; the words "BP" are never used.
 * @param {number} year the age's year, negative for BC
 */
export function ageLabel(year) {
  if (!(year < 0) || !Number.isInteger(year)) throw new RangeError(`not a BC year: ${year}`);
  // 1 BC is one year before AD 1, so years ago is today's year plus the BC number minus 1; the
  // rounding to 500 swallows that one year.
  const ago = Math.round((TODAY_YEAR - year - 1) / 500) * 500;
  return `about ${withCommas(-year)} BC (about ${withCommas(ago)} years ago)`;
}

/** The banner over the map. @param {number} year */
export const bannerText = (year) => `Rough preview: ${ageLabel(year)}`;

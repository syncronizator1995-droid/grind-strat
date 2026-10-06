// @ts-check
// Marsh and bog around 1219, the "bogs stand out" rule Ignas chose (6 October 2026).
//
// GLWD v2 smears a thin 1-10% of peat classes over most of the land, which would make every
// field look a little boggy; and it misses some famous open bogs (Soomaa, the Great Kemeri Bog).
// So: drop the thin background, stretch the rest so real bog cores read as mostly marsh, and
// take the larger of that and today's open wetland from ESA WorldCover (herbaceous wetland and
// moss), because a bog that is still open today certainly was in 1219.

/** GLWD v2 classes that count as marsh or bog (see the legend, GLWD_Legend_v2_0.csv). */
export const MARSH_CLASSES = Object.freeze([
  8, 9, // lacustrine (lake-edge) wetland, forested and not
  10, 11, 12, 13, 14, 15, // riverine wetland
  16, 17, 18, 19, // palustrine (marsh) wetland
  22, 23, 24, 25, // arctic/boreal and temperate peatland
  29, 30, 31, // saltmarsh, large river delta, other coastal wetland
]);
// Left out: 1-7 open water (comes from the lake and river layers), 20-21 ephemeral wetland (dry
// most years), 26-28 tropical, 32 salt pans, 33 rice paddies.

/**
 * The tuned numbers. floor: GLWD shares at or below this are background, read as 0. full: the
 * GLWD share that reads as 100% marsh; shares between are stretched in a straight line.
 */
export const MARSH_PARAMS = Object.freeze({ floor: 15, full: 55 });

/**
 * The stretched GLWD marsh share, 0-100.
 * @param {number} raw GLWD marsh share of the cell, 0-100
 * @param {{ floor: number, full: number }} [p]
 */
export function stretchMarsh(raw, p = MARSH_PARAMS) {
  if (!(raw > p.floor)) return 0; // also catches NaN
  return Math.min(100, Math.round(((raw - p.floor) / (p.full - p.floor)) * 100));
}

/**
 * The marsh share of a cell in 1219, 0-100.
 * @param {number} raw GLWD marsh share, 0-100
 * @param {number} openWetland today's open wetland share from WorldCover (classes 90 and 100), 0-100
 * @param {{ floor: number, full: number }} [p]
 */
export function marshShare(raw, openWetland, p = MARSH_PARAMS) {
  const wc = openWetland > 0 ? Math.min(100, Math.round(openWetland)) : 0;
  return Math.max(stretchMarsh(raw, p), wc);
}

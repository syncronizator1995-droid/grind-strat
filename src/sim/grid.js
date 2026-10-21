// @ts-check
// Small helpers for the game's cell grids, shared by the game rules (src/sim/), the drawing code
// and the map build tools (tools/map/). Plain numbers in and out: no DOM, no clock, no
// Math.random, so the same inputs give the same answer on every machine.

/**
 * A hash of three integers to a number in [0, 1). Deterministic and the same on every machine:
 * the terrain must come out identical from the same inputs, so Math.random is never used.
 * (Moved here from tools/map/terrain-fields.mjs, which re-exports it, so the map date engine in
 * src/sim/map-date.js can use the same hash; the code is unchanged, so the 1219 grid is too.)
 * @param {number} x @param {number} y @param {number} seed
 */
export function hash01(x, y, seed) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

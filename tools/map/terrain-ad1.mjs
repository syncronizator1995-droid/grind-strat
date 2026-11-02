// @ts-check
// The land of AD 1 (M3b): the rules that cut the AD 1 forest from the SAME scores as the 1219 grid
// and turn the pair (AD 1, 1219) into the lead-in plane src/sim/map-date.js reads. Plain arrays in
// and out; tools/map/build-terrain-ad1.mjs does the reading and writing.
//
// What is evidence and what is a rule (the same two labels as the 1219 grid):
//   Evidence: how much of each 1 degree square is forest, and how much of that forest is conifer,
//   from the pollen map's time window 6 (SpatioCompo, 250 BC to AD 250).
//   Rule: WHICH 1 km cells are forest at AD 1, and in which year between AD 1 and 1219 a cell
//   changes. Nobody mapped that. The AD 1 cut uses the 1219 rule on purpose (Ignas, 2 November
//   2026: one method for every age, so differences come from history, not method): today's tree
//   cover, height, rivers and wetness pull the forest, today's farmland pulls the clearings.
//
// The cut is NESTED with the 1219 grid (tools/map/terrain-time.mjs nestedCut), exactly as the 1425
// anchor is nested with 1219, only the other way in time: where a square's forest falls from AD 1
// to 1219, only AD 1 forest cells may stay; where it rises, all AD 1 forest stays. So between AD 1
// and 1219 no square both gains and loses forest, and no cell changes twice.
//
// Licence: built from the pollen map (CC BY-SA 4.0), so CC BY-SA 4.0 like the 1219 grid; never
// from OpenStreetMap.

import { createHash } from 'node:crypto';
import { LEAD_SEED_OFFSET } from '../../src/sim/map-date.js';
import { CLASS } from './terrain-1219.mjs';
import { changePlane, cutLaterAnchors, TIME_PARAMS } from './terrain-time.mjs';

/** The AD 1 anchor, and the stretch it leads in: AD 1 holds at AD 1, the 1219 grid from 1219. */
export const AD1 = Object.freeze({
  year: 1,
  until: 1219,
  source: 'spatiocompo-tw6',
  window: '250 BC to AD 250 (1700-2200 BP)',
  note: 'Forest and conifer shares from pollen window 6; AD 1 is the middle of the window.',
});

/**
 * Pollen squares whose centre lies at or east of this longitude are "model-filled, lower
 * quality": the paper says the north-eastern and south-eastern parts of its map, with few or no
 * pollen records, are of considerably lower quality (Githumbi et al. 2022, section 4.1). The CSV
 * has no per-square flag, so this line is OUR reading of "eastern" (TO CHECK against the paper's
 * site map): it takes in Belarus east of Minsk, Pskov and Novgorod, and Ukraine east of 28E.
 */
export const LOW_QUALITY_FROM_LON = 28;

/** The words the block's meta carries for the eastern squares. */
export const LOW_QUALITY_LABEL = 'model-filled, lower quality';

/** The numbers that shape the lead-in, stored in the block so a stale one is caught. */
export const AD1_PARAMS = Object.freeze({
  seedOffset: LEAD_SEED_OFFSET, // the order inside a band (src/sim/map-date.js)
  bandKm: TIME_PARAMS.bandKm,
  bands: TIME_PARAMS.bands,
  blockCells: TIME_PARAMS.blockCells,
  lowQualityFromLon: LOW_QUALITY_FROM_LON,
});

/** A fingerprint of the anchor and the parameters, for the block and the stale checks. */
export const ad1ParamsSha256 = () => createHash('sha256').update(JSON.stringify({ AD1, AD1_PARAMS, TIME_PARAMS })).digest('hex');

/**
 * The AD 1 grid, nested with the 1219 grid.
 * @param {import('./terrain-1219.mjs').PreparedTerrain} prep
 * @param {ReturnType<typeof import('./terrain-1219.mjs').cutTerrain>} built the 1219 grid
 * @param {import('./terrain-1219.mjs').TerrainInput} input
 * @param {import('./terrain-time.mjs').AnchorTarget} target the AD 1 pollen shares
 */
export function cutAd1(prep, built, input, target) {
  return cutLaterAnchors(prep, built, input, [target])[0];
}

/**
 * The lead-in plane: per cell (band << 3) | the AD 1 class, 0 where AD 1 and 1219 agree. The band
 * is the distance, in bandKm steps at AD 1, from the cell to the nearest cell that already has
 * what it becomes by 1219 (changePlane's rule), so clearings spread from open land and forest
 * from old forest.
 * @param {Uint8Array} ad1 @param {Uint8Array} grid1219
 * @param {number} cols @param {number} rows @param {number} cellKm
 */
export function leadPlane(ad1, grid1219, cols, rows, cellKm) {
  const toward = changePlane(ad1, grid1219, cols, rows, cellKm); // (band << 3) | the 1219 class
  const plane = new Uint8Array(toward.length);
  for (let i = 0; i < plane.length; i++) {
    if (!toward[i]) continue;
    const cls = ad1[i];
    if (cls === CLASS.sea || cls === 1 || cls > 7) throw new Error(`leadPlane: cell ${i} is class ${cls} at AD 1, which a plane cannot hold`);
    plane[i] = (toward[i] & ~7) | cls;
  }
  return plane;
}

/**
 * The squares (1 degree centres) that are "model-filled, lower quality", from a pollen lattice.
 * @param {{ lon0: number, lat0: number, w: number, h: number, measured: Uint8Array }} L
 * @returns {[number, number][]} [lon, lat] of each square's centre where the pollen map has a value
 */
export function lowQualitySquares(L) {
  /** @type {[number, number][]} */
  const out = [];
  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      const lon = L.lon0 + x;
      if (lon >= LOW_QUALITY_FROM_LON && L.measured[y * L.w + x]) out.push([lon, L.lat0 + y]);
    }
  }
  return out;
}

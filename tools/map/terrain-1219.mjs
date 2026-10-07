// @ts-check
// The rules that turn today's land cover, the terrain and the pollen map into the 1219 terrain
// grid. Plain arrays in, a Uint8Array of classes out: no files, so the tests can run it on
// made-up inputs and tools/map/build-terrain-1219.mjs does the reading and writing.
//
// What is evidence and what is a rule (the game shows both labels):
//   "Forest share: estimated from pollen (REVEALS, AD 750-1250, 1 degree cells; gaps filled by a
//    statistical model)" - how much of each 1 degree cell is forest, and how much of that forest
//    is conifer, comes from SpatioCompo and is met cell by cell.
//   "Exact forest edges: placed by a rule from today's land cover, terrain and rivers; not a
//    historical map" - WHICH 1 km cells inside a 1 degree cell are forest, and which forest is
//    conifer, is decided by the scores below. Nobody mapped the forest edges of 1219. The scores
//    are smoothed over a few km and tiny islands are tidied away (tools/map/tidy.mjs), so the
//    rule paints forest blocks and clearings, not single cells.
//
// Licence: the pollen map is CC BY-SA 4.0, so this grid is too. It may also use CC BY inputs
// (WorldCover, GLWD) and public-domain ones (GEBCO, Natural Earth), but never OpenStreetMap
// (ODbL), which cannot be mixed with CC BY-SA. Lakes are therefore not a class here: the game
// draws them from the separate OpenStreetMap block.

import { blendAll, latticePlaces, pollenLattice } from './pollen-field.mjs';
import { solveQuota } from './quota.mjs';
import { cellNoise, distanceTo, maskedBlur } from './terrain-fields.mjs';
import { absorbSmallPatches, edgeScore } from './tidy.mjs';

/** Class codes, as M1's map stores them (src/ui/map/terrain.js). 1 (lake) is not used here. */
export const CLASS = Object.freeze({ sea: 0, open: 2, conifer: 3, mixed: 4, marsh: 5, heath: 6 });
export const CLASS_NAMES = Object.freeze({ 0: 'sea', 2: 'open', 3: 'conifer', 4: 'mixed', 5: 'marsh', 6: 'heath' });

/** The tuned numbers, stored in the sidecar so a grid can be traced back to them. */
export const TERRAIN_PARAMS = Object.freeze({
  marshAt: 50, // marsh-1km share (0-100) from which a cell is marsh
  duneBare: 20, // WorldCover bare share for a coastal dune...
  duneSeaKm: 3, // ...within this distance of the sea
  heathBareMoss: 40, // bare + moss share for open rocky or tundra ground...
  heathMinHeight: 300, // ...in the hills (metres), or...
  heathMoss: 10, // ...with this much moss and lichen: so modern open-cast mines (Lusatia, Belchatow,
  // Most), which WorldCover also calls bare, do not become heath in 1219
  waterToday: 50, // WorldCover water share above which a land cell is water today
  waterVoteKm: 3, // a water-today cell takes the majority class of land within this distance
  riverMarshKm: 2, // ...and favours marsh when this close to a Natural Earth river
  riverMarshVote: 3, // how much a marsh neighbour's vote counts there
  tolerance: 0.005, // the quota solver aims for every square within half a point
  minPatch: 8, // forest, clearings, and pine or broadleaf stands smaller than this many cells
  // join what surrounds them; each square then gets its share back by moving patch edges
  forest: Object.freeze({
    tree: 3, // today's tree cover: strong. Old forest that survives today was surely forest then.
    crop: -1.5, // today's cropland: the best soils, cleared first and longest
    built: -2, // towns grew where people already were
    height: 0.4, // per 250 m: uplands and hills were cleared later
    rough: 0.4, // per 25 m of local relief: broken ground is hard to plough
    riverFar: 0.6, // per 10 km from a river or lake: settlement followed the water
    wet: 0.5, // marsh-raw share: wet ground under trees (swamp forest), moderately
    pollen: 1, // the blended pollen forest share itself: leans towards the neighbouring squares
    noise: 0.25, // soft blobs where nothing else tells cells apart (smoothing leaves few ties)
    blurKm: 2, // tree and crop are read over a 5 x 5 km window as well as the cell itself
    smoothKm: 3, // the whole score is then smoothed (two box passes of this radius, near a
    // Gaussian of this width), so the quota cuts out coherent blocks, not single cells
    seed: 1219,
  }),
  conifer: Object.freeze({
    // A RULE, NOT EVIDENCE. WorldCover does not tell conifer from broadleaf, so pine and spruce go
    // where foresters expect them: poor sandy ground (low, flat coastal plains and outwash away
    // from the rivers), wet ground (bog pine and spruce swamps), and the north.
    sandy: 1,
    wet: 0.8,
    north: 0.3, // per 6 degrees of latitude above 54N
    pollen: 1, // the blended pollen conifer share
    noise: 0.25,
    smoothKm: 3, // as for the forest score: pine stands and oak woods, not single cells
    lowM: 120, // "low" means under about this many metres
    seaKm: 40, // "coastal plain" means within this distance of the sea
    riverFarKm: 15, // "outwash away from rivers" means this far from one
    seed: 1220,
  }),
});

/**
 * @typedef {object} TerrainInput everything per 1 km cell, row 0 in the south
 * @property {number} cols @property {number} rows
 * @property {number} cellKm ground size of one cell
 * @property {Float64Array} lon @property {Float64Array} lat cell centres in degrees
 * @property {Uint8Array} land 1 for land (Natural Earth), 0 for sea
 * @property {Uint8Array} rivers 1 where a Natural Earth river centre line crosses the cell
 * @property {Uint8Array} lakes 1 where a Natural Earth lake (not a reservoir) touches the cell
 * @property {Record<'tree' | 'crop' | 'built' | 'bare' | 'moss' | 'water', Uint8Array>} cover WorldCover 2021 shares, 0-100
 * @property {Uint8Array} marsh marsh-1km, 0-100
 * @property {Uint8Array} marshRaw marsh-raw-1km (GLWD), 0-100
 * @property {Float32Array} height metres
 * @property {Float32Array} rough metres of local relief
 * @property {import('./pollen-field.mjs').PollenCell[]} pollen
 */

/**
 * @param {TerrainInput} input
 * @param {typeof TERRAIN_PARAMS} [p]
 * @param {(what: string, round: number, worst: number) => void} [onRound] for tuning the solver
 */
export function buildTerrain1219(input, p = TERRAIN_PARAMS, onRound = undefined) {
  const { cols, rows, land, cover } = input;
  const n = cols * rows;
  const km = input.cellKm;

  // Pollen: the lattice of 1 degree centres, where each cell sits on it, and the blended fields.
  const lattice = pollenLattice(input.pollen, boxOf(input.lon, input.lat));
  const places = latticePlaces(input.lon, input.lat, lattice);
  const forestField = blendAll(lattice.forest, places);
  const coniferField = blendAll(lattice.coniferShare, places);

  const seaDist = scale(distanceTo(not(land), cols, rows), km);
  // Distance from rivers and lakes (for the forest score), and from rivers alone (for marsh
  // along rivers when filling today's water: a lake shore is not a flood plain).
  const waterDist = scale(distanceTo(or(input.rivers, input.lakes), cols, rows), km);
  const riverDist = scale(distanceTo(input.rivers, cols, rows), km);

  const terrain = new Uint8Array(n); // 0 = sea everywhere to start
  // Water today (lakes, reservoirs, wide rivers): left out of the quotas, filled at the end.
  const waterToday = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!land[i]) continue;
    if (cover.water[i] >= p.waterToday) { waterToday[i] = 1; continue; }
    terrain[i] = firstPass(input, i, seaDist[i], p);
  }

  // Forest. The pollen map's "open" share includes bog and heath, so marsh and heath cells
  // count in each square's total but are never chosen: they come out of the open share.
  const domain = new Uint8Array(n);
  const eligible = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!land[i] || waterToday[i]) continue;
    domain[i] = 1;
    if (terrain[i] === CLASS.open) eligible[i] = 1;
  }
  const forestScore = forestScores(input, eligible, forestField, waterDist, p.forest);
  const forestCut = solveQuota({ score: forestScore, eligible, domain, places, target: lattice.forest, tolerance: p.tolerance, onRound: onRound && ((r, w) => onRound('forest', r, w)) });
  const forestIslands = absorbSmallPatches(forestCut.chosen, eligible, cols, rows, p.minPatch);
  const forest = solveQuota({ score: edgeScore(forestCut.chosen, eligible, forestScore, cols, rows), eligible, domain, places, target: lattice.forest, tolerance: p.tolerance, onRound: onRound && ((r, w) => onRound('forest edges', r, w)) });

  // Conifer or mixed, among the forest just chosen, to each square's conifer share.
  const coniferScore = coniferScores(input, forest.chosen, coniferField, seaDist, waterDist, p.conifer);
  const coniferCut = solveQuota({ score: coniferScore, eligible: forest.chosen, domain: forest.chosen, places, target: lattice.coniferShare, tolerance: p.tolerance, onRound: onRound && ((r, w) => onRound('conifer', r, w)) });
  const coniferIslands = absorbSmallPatches(coniferCut.chosen, forest.chosen, cols, rows, p.minPatch);
  const conifer = solveQuota({ score: edgeScore(coniferCut.chosen, forest.chosen, coniferScore, cols, rows), eligible: forest.chosen, domain: forest.chosen, places, target: lattice.coniferShare, tolerance: p.tolerance, onRound: onRound && ((r, w) => onRound('conifer edges', r, w)) });
  for (let i = 0; i < n; i++) {
    if (forest.chosen[i]) terrain[i] = conifer.chosen[i] ? CLASS.conifer : CLASS.mixed;
  }

  const water = fillWaterToday(terrain, waterToday, riverDist, cols, rows, km, p);
  const tidy = { forest: tidyStats(forestCut, forestIslands, forest), conifer: tidyStats(coniferCut, coniferIslands, conifer) };
  return { terrain, waterToday, domain, lattice, places, forestField, coniferField, forest, conifer, tidy, water };
}

/**
 * What the tidy step did, for the checks: the first cut's solver rounds, the islands joined,
 * and how many cells the edge re-solve then changed.
 * @param {ReturnType<typeof solveQuota>} cut @param {{ islands: number, cells: number }} islands
 * @param {ReturnType<typeof solveQuota>} final
 */
function tidyStats(cut, islands, final) {
  let changed = 0;
  // cut.chosen was changed in place by absorbSmallPatches, so it holds the cut with the islands
  // joined: the difference from the final choice is the edge cells moved to meet the quotas.
  for (let i = 0; i < final.chosen.length; i++) if (cut.chosen[i] !== final.chosen[i]) changed++;
  return { cutRounds: cut.rounds, islands: islands.islands, islandCells: islands.cells, edgeCells: changed };
}

/**
 * Marsh, heath or (for now) open, in that order.
 * Marsh first: GLWD bog cores and today's open wetland were wet in 1219 too.
 * Heath: coastal dunes (bare sand near the sea: the Curonian and Vistula Spits, the Leba dunes)
 * and open bare or tundra ground (mostly the fells in the far north-west). Low bare ground away
 * from the sea is left to the forest rule: it is mostly today's quarries and open-cast mines.
 * @param {TerrainInput} input @param {number} i @param {number} seaKm @param {typeof TERRAIN_PARAMS} p
 */
function firstPass(input, i, seaKm, p) {
  const { cover } = input;
  if (input.marsh[i] >= p.marshAt) return CLASS.marsh;
  if (cover.bare[i] >= p.duneBare && seaKm <= p.duneSeaKm) return CLASS.heath;
  if (cover.bare[i] + cover.moss[i] >= p.heathBareMoss && (input.height[i] >= p.heathMinHeight || cover.moss[i] >= p.heathMoss)) return CLASS.heath;
  return CLASS.open;
}

/**
 * How likely a cell was forest in 1219, by a rule (not evidence; see the top of the file).
 * Only the order of the scores inside each area matters: the quota decides how many.
 * @param {TerrainInput} input @param {Uint8Array} eligible @param {Float32Array} pollenForest
 * @param {Float32Array} riverKm @param {typeof TERRAIN_PARAMS.forest} w
 */
function forestScores(input, eligible, pollenForest, riverKm, w) {
  const { cols, rows, cover, land } = input;
  const radius = Math.round(w.blurKm / input.cellKm);
  const treeBlur = maskedBlur(cover.tree, land, cols, rows, radius);
  const cropBlur = maskedBlur(cover.crop, land, cols, rows, radius);
  const score = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!eligible[i]) continue;
      // Half the cell itself, half its surroundings: forests come in blocks, not single cells.
      const tree = (cover.tree[i] + treeBlur[i]) / 200;
      const crop = (cover.crop[i] + cropBlur[i]) / 200;
      score[i] = w.tree * tree
        + w.crop * crop
        + w.built * (cover.built[i] / 100)
        + w.height * clamp01(input.height[i] / 250)
        + w.rough * clamp01(input.rough[i] / 25)
        + w.riverFar * clamp01(riverKm[i] / 10)
        + w.wet * (input.marshRaw[i] / 100)
        + w.pollen * pollenForest[i];
    }
  }
  return smoothThenNoise(score, eligible, cols, rows, Math.round(w.smoothKm / input.cellKm), w.noise, w.seed);
}

/**
 * Smooths a score over the cells where `mask` is set, then adds the noise. Today's land cover
 * changes from one 1 km cell to the next (a field, a wood lot, a village), and cutting a raw
 * score at a threshold turns that into salt and pepper. Smoothed, the same cut follows the lie
 * of the land and leaves forest blocks and clearings a few km across.
 * Smoothing also narrows the spread of the scores. The narrower it is, the more the quota
 * threshold (one value per square, blended between square centres) decides where the edges go
 * instead of the land, and the more the squares' pattern could show. So the smoothed score is
 * stretched back to the raw score's spread (same mean, same standard deviation).
 * The noise is added after, because it is already smooth; its small per-cell part only breaks ties.
 * @param {Float32Array} score changed in place @param {Uint8Array} mask
 * @param {number} cols @param {number} rows @param {number} radius cells; 0 leaves it as it is
 * @param {number} noise weight @param {number} seed
 */
function smoothThenNoise(score, mask, cols, rows, radius, noise, seed) {
  if (radius > 0) {
    const smooth = maskedBlur(maskedBlur(score, mask, cols, rows, radius), mask, cols, rows, radius);
    const raw = spread(score, mask);
    const now = spread(smooth, mask);
    const k = now.sd > 0 ? raw.sd / now.sd : 1;
    for (let i = 0; i < score.length; i++) if (mask[i]) score[i] = raw.mean + (smooth[i] - now.mean) * k;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      score[i] = mask[i] ? score[i] + noise * cellNoise(c, r, seed) : 0;
    }
  }
  return score;
}

/** Mean and standard deviation over the masked cells. @param {Float32Array} v @param {Uint8Array} mask */
function spread(v, mask) {
  let n = 0; let s = 0; let s2 = 0;
  for (let i = 0; i < v.length; i++) if (mask[i]) { n++; s += v[i]; s2 += v[i] * v[i]; }
  const mean = n ? s / n : 0;
  return { mean, sd: n ? Math.sqrt(Math.max(0, s2 / n - mean * mean)) : 0 };
}

/**
 * How likely a forest cell was conifer (pine, spruce) rather than broadleaf or mixed. A RULE, NOT
 * EVIDENCE: see TERRAIN_PARAMS.conifer.
 * @param {TerrainInput} input @param {Uint8Array} forest @param {Float32Array} pollenConifer
 * @param {Float32Array} seaKm @param {Float32Array} riverKm @param {typeof TERRAIN_PARAMS.conifer} w
 */
function coniferScores(input, forest, pollenConifer, seaKm, riverKm, w) {
  const { cols, rows } = input;
  const score = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!forest[i]) continue;
      const low = clamp01(1 - input.height[i] / w.lowM);
      const flat = clamp01(1 - input.rough[i] / 15);
      const coastal = clamp01(1 - seaKm[i] / w.seaKm);
      const outwash = clamp01(riverKm[i] / w.riverFarKm);
      const sandy = low * flat * Math.max(coastal, outwash);
      score[i] = w.sandy * sandy
        + w.wet * (input.marshRaw[i] / 100)
        + w.north * clamp01((input.lat[i] - 54) / 6)
        + w.pollen * pollenConifer[i];
    }
  }
  return smoothThenNoise(score, forest, cols, rows, Math.round(w.smoothKm / input.cellKm), w.noise, w.seed);
}

/**
 * Cells that are water today but land on the Natural Earth coast: modern reservoirs, lakes and
 * wide rivers. Cells near the shore (within waterVoteKm) take the class most of their dry
 * neighbours within that distance have; along rivers a marsh neighbour's vote counts extra,
 * because river edges were wet meadow before dams and drainage. Cells further out, inside big
 * lakes, all take the class most common on that water body's shore band: spreading neighbours
 * inwards cell by cell would draw star-shaped streaks across a lake like Ladoga. Natural lakes
 * are drawn over this by the water block's lakes anyway.
 * @param {Uint8Array} terrain changed in place @param {Uint8Array} waterToday
 * @param {Float32Array} riverKm @param {number} cols @param {number} rows @param {number} km
 * @param {typeof TERRAIN_PARAMS} p
 */
function fillWaterToday(terrain, waterToday, riverKm, cols, rows, km, p) {
  const dry = new Uint8Array(terrain.length);
  for (let i = 0; i < terrain.length; i++) dry[i] = terrain[i] !== CLASS.sea && !waterToday[i] ? 1 : 0;
  const dist = distanceTo(dry, cols, rows);
  const R = Math.max(1, Math.round(p.waterVoteKm / km));
  const body = waterBodies(waterToday, cols);
  const bodyVotes = new Float64Array((body.count + 1) * 7);
  /** @type {Record<number, number>} */
  const byClass = {};
  let nearRiverMarsh = 0;
  let interior = 0;
  const votes = new Float64Array(7);
  for (let i = 0; i < terrain.length; i++) {
    if (!waterToday[i] || dist[i] > R) continue;
    const c = i % cols;
    const r = (i - c) / cols;
    votes.fill(0);
    const riverBonus = riverKm[i] <= p.riverMarshKm ? p.riverMarshVote : 1;
    for (let dr = -R; dr <= R; dr++) {
      const rr = r + dr;
      if (rr < 0 || rr >= rows) continue;
      for (let dc = -R; dc <= R; dc++) {
        const cc = c + dc;
        if (cc < 0 || cc >= cols || dc * dc + dr * dr > R * R) continue;
        const j = rr * cols + cc;
        if (!dry[j]) continue;
        const t = terrain[j];
        votes[t] += t === CLASS.marsh ? riverBonus : 1;
      }
    }
    const best = majority(votes, 0);
    terrain[i] = best;
    bodyVotes[body.label[i] * 7 + best]++;
    byClass[best] = (byClass[best] ?? 0) + 1;
    if (best === CLASS.marsh && riverBonus > 1) nearRiverMarsh++;
  }
  for (let i = 0; i < terrain.length; i++) {
    if (!waterToday[i] || dist[i] <= R) continue;
    const best = majority(bodyVotes, body.label[i] * 7);
    terrain[i] = best;
    byClass[best] = (byClass[best] ?? 0) + 1;
    interior++;
  }
  let cells = 0;
  for (const w of waterToday) cells += w;
  return { cells, interior, byClass, nearRiverMarsh };
}

/**
 * The class with most votes in votes[at .. at + 6], in a fixed order for ties (marsh, open,
 * mixed, conifer, heath) so the result never depends on anything but the data. Open if no votes.
 * @param {Float64Array} votes @param {number} at
 */
function majority(votes, at) {
  /** @type {number} */ let best = CLASS.open;
  for (const t of [CLASS.marsh, CLASS.open, CLASS.mixed, CLASS.conifer, CLASS.heath]) if (votes[at + t] > votes[at + best]) best = t;
  return best;
}

/**
 * Connected water bodies (side by side, not corner to corner), numbered from 1.
 * @param {Uint8Array} water @param {number} cols
 */
function waterBodies(water, cols) {
  const label = new Int32Array(water.length);
  const stack = new Int32Array(water.length);
  let count = 0;
  for (let s = 0; s < water.length; s++) {
    if (!water[s] || label[s]) continue;
    label[s] = ++count;
    let top = 0;
    stack[top++] = s;
    while (top) {
      const i = stack[--top];
      const c = i % cols;
      for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i >= cols ? i - cols : -1, i + cols < water.length ? i + cols : -1]) {
        if (j >= 0 && water[j] && !label[j]) { label[j] = count; stack[top++] = j; }
      }
    }
  }
  return { label, count };
}

/** The lon/lat box of a set of points. @param {Float64Array} lon @param {Float64Array} lat */
function boxOf(lon, lat) {
  let west = Infinity; let east = -Infinity; let south = Infinity; let north = -Infinity;
  for (let i = 0; i < lon.length; i++) {
    west = Math.min(west, lon[i]); east = Math.max(east, lon[i]);
    south = Math.min(south, lat[i]); north = Math.max(north, lat[i]);
  }
  return { west, east, south, north };
}

/** @param {Uint8Array} a */
function not(a) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ? 0 : 1;
  return out;
}

/** @param {Uint8Array} a @param {Uint8Array} b */
function or(a, b) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] || b[i] ? 1 : 0;
  return out;
}

/** Cells to km, in place. @param {Float32Array} d @param {number} km */
function scale(d, km) {
  for (let i = 0; i < d.length; i++) d[i] *= km;
  return d;
}

/** @param {number} x */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// @ts-check
// The land over time: the rules that cut the later forest anchors (1425, 1725, 1900, 2021) from
// the same scores as the 1219 grid, and turn each pair of anchors into a change plane for the
// game. Plain arrays in and out, so the tests can run it on made-up inputs;
// tools/map/build-terrain-time.mjs does the reading and writing.
//
// What is evidence and what is a rule (the same two labels as the 1219 grid):
//   Evidence: how much of each 1 degree square is forest, and how much of that forest is conifer,
//   at each anchor: the pollen map's time windows 3, 2 and 1 (SpatioCompo), and for today ESA
//   WorldCover 2021's tree cover.
//   Rule: WHICH 1 km cells are forest at each anchor, and in which year between two anchors a cell
//   changes. Nobody mapped that.
//
// The anchors are NESTED, square by square. Where a square's forest share falls, only cells that
// were forest at the previous anchor may stay forest (clearings grow out of open land; no new
// forest appears elsewhere at the same time). Where it rises, all the old forest stays and only
// open cells are added (forest grows out from old forest). The same for conifer within the
// forest. So between two anchors no square both gains and loses forest, and no cell has to
// change twice. The quotas, the tidy step (no islands under minPatch cells) and the edge re-solve
// are the 1219 rules (tools/map/quota.mjs, tools/map/tidy.mjs), run inside those limits.
//
// Licence: built from the pollen map (CC BY-SA 4.0), so CC BY-SA 4.0 like the 1219 grid; never
// from OpenStreetMap.

import { createHash } from 'node:crypto';
import { pollenLattice } from './pollen-field.mjs';
import { solveQuota } from './quota.mjs';
import { boxOf, CLASS, coniferScores, fillWaterToday, TERRAIN_PARAMS } from './terrain-1219.mjs';
import { distanceTo } from './terrain-fields.mjs';
import { absorbSmallPatches, edgeScore } from './tidy.mjs';

/**
 * The anchors, in order. The pollen windows are Githumbi et al. (2022)'s (BP = before AD 1950);
 * each later pollen anchor sits in the middle of its window. See data/sources.md.
 * @type {readonly Readonly<{ year: number, holdUntil?: number, source: string, window: string, note: string }>[]}
 */
export const ANCHORS = Object.freeze([
  Object.freeze({
    year: 1219, holdUntil: 1250, source: 'spatiocompo-tw4', window: 'AD 750-1250 (700-1200 BP)',
    note: 'The 1219 grid (src/data/by-sa/terrain-1219.json), unchanged. It holds until 1250, the end of its pollen window.',
  }),
  Object.freeze({
    year: 1425, source: 'spatiocompo-tw3', window: 'AD 1250-1600 (350-700 BP)',
    note: 'Forest and conifer shares from pollen window 3; 1425 is the middle of the window.',
  }),
  Object.freeze({
    year: 1725, source: 'spatiocompo-tw2', window: 'AD 1600-1850 (100-350 BP)',
    note: 'Forest and conifer shares from pollen window 2; 1725 is the middle of the window.',
  }),
  Object.freeze({
    year: 1900, source: 'spatiocompo-tw1', window: 'AD 1850-1950 (0-100 BP)',
    note: 'Forest and conifer shares from pollen window 1; 1900 is the middle of the window.',
  }),
  Object.freeze({
    year: 2021, source: 'worldcover-2021', window: '2021',
    note: 'Forest share per 1 degree square from ESA WorldCover 2021 tree cover, over the cells that may be forest. Conifer share from pollen window 1 (AD 1850-1950): WorldCover has no conifer class, and the satellite conifer maps tried would show Lithuania\'s conifer collapsing, which it did not.',
  }),
]);

/** The numbers that shape the change, stored in the block so a stale one is caught. */
export const TIME_PARAMS = Object.freeze({
  bandKm: 2, // distance bands to the new class, this wide: nearer cells switch first
  bands: 32, // band 31 holds everything 62 km away or more (5 bits of a byte)
  blockCells: 32, // each 32 x 32 km block of the 1 km grid changes at a steady pace
  seed: 1250, // for the order inside a band (src/sim/map-date.js)
  minPatch: TERRAIN_PARAMS.minPatch, // the 1219 tidy rule
  tolerance: TERRAIN_PARAMS.tolerance, // the 1219 solver target
  maxRounds: 200, // nested cuts settle more slowly than 1219's (see nestedCut)
  conifer: TERRAIN_PARAMS.conifer, // the 1219 conifer score weights, over all later forest
});

/** A fingerprint of the anchors and the parameters, for the block and the stale checks. */
export const timeParamsSha256 = () => createHash('sha256').update(JSON.stringify({ ANCHORS, TIME_PARAMS })).digest('hex');

/**
 * @typedef {object} AnchorTarget the shares one later anchor must meet, per lattice node
 * @property {Float64Array} forest share of each square's domain cells that is forest
 * @property {Float64Array} coniferShare share of each square's forest that is conifer
 *
 * @typedef {object} NestedCut
 * @property {Uint8Array} chosen 1 where the class is, after the cut
 * @property {Uint8Array} rising per node: 1 where the square's count rose (old cells all kept)
 * @property {Int32Array} domainCount @property {Int32Array} chosenCount @property {Int32Array} wantCount per node
 * @property {Uint8Array} capped per node: 1 where the square could not reach its target
 * @property {{ islands: number, islandCells: number }} tidy
 * @property {number[]} rounds the solver's rounds: first cut (falling, rising), edge re-solve (the same)
 * @property {number} worst the solver's worst miss, as a share of a square, beyond one cell
 */

/**
 * The pollen lattice of a later window, on the 1219 lattice's nodes.
 * @param {import('./pollen-field.mjs').PollenCell[]} cells
 * @param {import('./terrain-1219.mjs').TerrainInput} input
 * @param {import('./pollen-field.mjs').Lattice} like the 1219 lattice
 * @returns {AnchorTarget}
 */
export function pollenTarget(cells, input, like) {
  const L = pollenLattice(cells, boxOf(input.lon, input.lat));
  if (L.lon0 !== like.lon0 || L.lat0 !== like.lat0 || L.w !== like.w || L.h !== like.h) throw new Error('a pollen window has another lattice than the 1219 one');
  return { forest: L.forest, coniferShare: L.coniferShare };
}

/**
 * Today's target: per square, the WorldCover tree share summed over the cells that may be forest,
 * over all the square's domain cells (so trees on bogs, which the 1219 rules keep as marsh, do
 * not over-fill the rest). Conifer from pollen window 1.
 * @param {Uint8Array} tree WorldCover tree share 0-100
 * @param {import('./terrain-1219.mjs').PreparedTerrain} prep
 * @param {Float64Array} coniferShare pollen window 1's
 * @returns {AnchorTarget}
 */
export function worldCoverTarget(tree, prep, coniferShare) {
  const nodes = prep.lattice.w * prep.lattice.h;
  const sum = new Float64Array(nodes);
  const count = new Float64Array(nodes);
  for (let i = 0; i < tree.length; i++) {
    const g = prep.places.group[i];
    if (g < 0 || !prep.domain[i]) continue;
    count[g]++;
    if (prep.eligible[i]) sum[g] += tree[i] / 100;
  }
  const forest = new Float64Array(nodes);
  for (let g = 0; g < nodes; g++) forest[g] = count[g] ? sum[g] / count[g] : 0;
  return { forest, coniferShare };
}

/**
 * One nested quota cut (see the top of the file): cells of `base` are chosen to each square's
 * target share of its `domain`, keeping to `prev` where the square falls and keeping all of
 * `prev` where it rises; then tidied and re-solved on the patch edges, as in 1219.
 * @param {{ score: Float32Array, base: Uint8Array, prev: Uint8Array, domain: Uint8Array,
 *   places: import('./pollen-field.mjs').Places, target: Float64Array, cols: number, rows: number,
 *   minPatch: number, tolerance: number, maxRounds?: number }} q
 * @returns {NestedCut}
 */
export function nestedCut({ score, base, prev, domain, places, target, cols, rows, minPatch, tolerance, maxRounds = 60 }) {
  const n = score.length;
  const nodes = places.w * places.h;
  const domainCount = new Int32Array(nodes);
  const prevCount = new Int32Array(nodes);
  const baseCount = new Int32Array(nodes);
  for (let i = 0; i < n; i++) {
    const g = places.group[i];
    if (g < 0) continue;
    if (domain[i]) domainCount[g]++;
    if (base[i]) { baseCount[g]++; if (prev[i]) prevCount[g]++; }
  }
  const rising = new Uint8Array(nodes);
  const capped = new Uint8Array(nodes);
  const wantCount = new Int32Array(nodes);
  const share = new Float64Array(nodes); // what the solver is asked for, per square
  for (let g = 0; g < nodes; g++) {
    const t = Number.isFinite(target[g]) ? target[g] : 0;
    const asked = Math.round(t * domainCount[g]);
    const want = Math.min(asked, baseCount[g]);
    if (want < asked) capped[g] = 1;
    wantCount[g] = want;
    if (want > prevCount[g]) {
      rising[g] = 1;
      share[g] = domainCount[g] ? (want - prevCount[g]) / domainCount[g] : 0;
    } else {
      share[g] = domainCount[g] ? want / domainCount[g] : 0;
    }
  }
  // Falling squares choose among the old cells; rising ones add from the others, and keep the old.
  const eligible = new Uint8Array(n);
  const kept = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!base[i]) continue;
    const g = places.group[i];
    if (g < 0) { kept[i] = prev[i]; continue; }
    if (rising[g]) { if (prev[i]) kept[i] = 1; else eligible[i] = 1; } else if (prev[i]) eligible[i] = 1;
  }
  // Falling and rising squares are solved apart. Their thresholds sit in different parts of the
  // score range (one cuts into old forest, the other into open land), and blended across a
  // shared edge they pull each other back and forth; apart, each kind sees only its own kind,
  // and the other squares just carry their neighbours' mean, as empty squares do in 1219.
  /** @param {Float32Array} s */
  const solveApart = (s) => {
    const chosen = new Uint8Array(n);
    /** @type {number[]} */ const rounds = [];
    let worst = 0;
    for (const dir of [0, 1]) {
      const mine = new Uint8Array(n);
      let any = false;
      for (let i = 0; i < n; i++) if (eligible[i] && rising[places.group[i]] === dir) { mine[i] = 1; any = true; }
      if (!any) continue;
      const r = solveQuota({ score: s, eligible: mine, domain, places, target: share, tolerance, maxRounds });
      for (let i = 0; i < n; i++) if (r.chosen[i]) chosen[i] = 1;
      rounds.push(r.rounds);
      worst = Math.max(worst, r.worst);
    }
    return { chosen, rounds, worst };
  };
  const first = solveApart(score);
  const whole = first.chosen;
  for (let i = 0; i < n; i++) if (kept[i]) whole[i] = 1;
  const islands = absorbSmallPatches(whole, base, cols, rows, minPatch);
  // The tidy step looks at the whole picture, so it may break the nesting: put it back.
  for (let i = 0; i < n; i++) {
    if (kept[i]) whole[i] = 1;
    else if (!eligible[i]) whole[i] = 0;
  }
  const final = solveApart(edgeScore(whole, base, score, cols, rows));
  const chosen = final.chosen;
  const chosenCount = new Int32Array(nodes);
  for (let i = 0; i < n; i++) {
    if (kept[i]) chosen[i] = 1;
    const g = places.group[i];
    if (chosen[i] && g >= 0) chosenCount[g]++;
  }
  return { chosen, rising, domainCount, chosenCount, wantCount, capped, rounds: [...first.rounds, ...final.rounds], worst: Math.max(first.worst, final.worst), tidy: { islands: islands.islands, islandCells: islands.cells } };
}

/**
 * The later anchors' grids, from the prepared 1219 scores and the 1219 result.
 * @param {import('./terrain-1219.mjs').PreparedTerrain} prep
 * @param {ReturnType<typeof import('./terrain-1219.mjs').cutTerrain>} built the 1219 grid
 * @param {import('./terrain-1219.mjs').TerrainInput} input
 * @param {AnchorTarget[]} targets one per later anchor, in order
 * @param {typeof TIME_PARAMS} [p]
 */
export function cutLaterAnchors(prep, built, input, targets, p = TIME_PARAMS) {
  const { cols, rows } = input;
  const n = cols * rows;
  const common = { domain: prep.domain, places: prep.places, cols, rows, minPatch: p.minPatch, tolerance: p.tolerance, maxRounds: p.maxRounds };

  // Forest first, anchor after anchor, each nested in the one before.
  /** @type {NestedCut[]} */
  const forests = [];
  let prev = built.forest.chosen;
  for (const t of targets) {
    const cut = nestedCut({ ...common, score: prep.forestScore, base: prep.eligible, prev, target: t.forest });
    forests.push(cut);
    prev = cut.chosen;
  }

  // One conifer score over every cell that is forest at some later anchor. The 1219 score covers
  // only the 1219 forest (its smoothing runs inside it), so regrown forest would have none; and
  // one score for all later anchors keeps pine stands from moving about between them.
  const union = new Uint8Array(n);
  for (const f of forests) for (let i = 0; i < n; i++) if (f.chosen[i]) union[i] = 1;
  const coniferScore = coniferScores(input, union, prep.coniferField, prep.seaDist, prep.waterDist, p.conifer);

  /** @type {{ terrain: Uint8Array, forest: NestedCut, conifer: NestedCut, water: ReturnType<typeof fillWaterToday> & { heldBack: number } }[]} */
  const anchors = [];
  let prevConifer = built.conifer.chosen;
  let prevTerrain = built.terrain;
  for (let k = 0; k < targets.length; k++) {
    const forest = forests[k].chosen;
    const was = new Uint8Array(n);
    for (let i = 0; i < n; i++) was[i] = prevConifer[i] && forest[i] ? 1 : 0;
    const conifer = nestedCut({ ...common, domain: forest, score: coniferScore, base: forest, prev: was, target: targets[k].coniferShare });
    const terrain = prep.fixed.slice();
    for (let i = 0; i < n; i++) if (forest[i]) terrain[i] = conifer.chosen[i] ? CLASS.conifer : CLASS.mixed;
    const filled = fillWaterToday(terrain, prep.waterToday, prep.riverDist, cols, rows, input.cellKm, TERRAIN_PARAMS);
    const heldBack = holdWaterToTheFlow(terrain, prevTerrain, prep.waterToday, prep.places, forests[k].rising, conifer.rising);
    anchors.push({ terrain, forest: forests[k], conifer, water: { ...filled, heldBack } });
    prevConifer = conifer.chosen;
    prevTerrain = terrain;
  }
  return anchors;
}

/**
 * Cells that are water today take the class of their shores at each anchor (fillWaterToday), by
 * a vote that knows nothing of the nesting, so now and then one would gain forest in a square
 * that loses it. Those keep their class from the anchor before instead: then no cell anywhere
 * goes against its square, which matters under reservoirs, whose ground shows until they fill.
 * @param {Uint8Array} terrain changed in place @param {Uint8Array} before the previous anchor
 * @param {Uint8Array} waterToday @param {import('./pollen-field.mjs').Places} places
 * @param {Uint8Array} forestRising @param {Uint8Array} coniferRising per node, from the cuts
 * @returns {number} how many cells were held back
 */
function holdWaterToTheFlow(terrain, before, waterToday, places, forestRising, coniferRising) {
  const isForest = (/** @type {number} */ t) => t === CLASS.conifer || t === CLASS.mixed;
  let held = 0;
  for (let i = 0; i < terrain.length; i++) {
    const g = places.group[i];
    if (!waterToday[i] || terrain[i] === before[i]) continue;
    const a = isForest(before[i]); const b = isForest(terrain[i]);
    const wrongForest = g < 0 || (a !== b && (b ? !forestRising[g] : forestRising[g]));
    const wrongConifer = a && b && (terrain[i] === CLASS.conifer ? !coniferRising[g] : coniferRising[g]);
    if (wrongForest || wrongConifer) { terrain[i] = before[i]; held++; }
  }
  return held;
}

/**
 * The change plane between two anchor grids, as src/sim/map-date.js reads it: one byte per cell,
 * (band << 3) | newClass, 0 where nothing changes. The band is the distance, in bandKm steps, from
 * the cell to the nearest cell that already has what it is about to become: open land for a
 * clearing, any forest for new forest, and the same kind for conifer turning mixed or back.
 * @param {Uint8Array} from @param {Uint8Array} to
 * @param {number} cols @param {number} rows @param {number} cellKm
 * @param {{ bandKm: number, bands: number }} [p]
 */
export function changePlane(from, to, cols, rows, cellKm, p = TIME_PARAMS) {
  const n = cols * rows;
  if (from.length !== n || to.length !== n) throw new Error('changePlane: grids of another size');
  const isForest = (/** @type {number} */ t) => t === CLASS.conifer || t === CLASS.mixed;
  /** @type {Map<string, Float32Array>} */
  const dist = new Map();
  /** @param {string} key @param {(t: number) => boolean} test */
  const distTo = (key, test) => {
    let d = dist.get(key);
    if (!d) {
      const mask = new Uint8Array(n);
      for (let i = 0; i < n; i++) if (test(from[i])) mask[i] = 1;
      d = distanceTo(mask, cols, rows);
      dist.set(key, d);
    }
    return d;
  };
  const plane = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = from[i];
    const b = to[i];
    if (a === b) continue;
    if (b === CLASS.sea || b > 7) throw new Error(`changePlane: cell ${i} turns into class ${b}, which a plane cannot hold`);
    const d = isForest(b) && !isForest(a) ? distTo('forest', isForest) : distTo(String(b), (t) => t === b);
    const band = Math.min(p.bands - 1, Math.floor((d[i] * cellKm) / p.bandKm));
    plane[i] = (band << 3) | b;
  }
  return plane;
}

/**
 * The shares each square reached at one anchor, next to its targets, for the checks.
 * @param {NestedCut} forest @param {NestedCut} conifer @param {AnchorTarget} target
 * @param {import('./pollen-field.mjs').Lattice} L @param {number} [small] squares with fewer
 *   domain cells are listed but left out of the worst miss
 */
export function anchorSquares(forest, conifer, target, L, small = 50) {
  const rows = [];
  let worstForest = 0; let worstConifer = 0;
  for (let g = 0; g < L.w * L.h; g++) {
    const land = forest.domainCount[g];
    if (!land) continue;
    const x = g % L.w;
    const y = (g - x) / L.w;
    const f = forest.chosenCount[g];
    const row = {
      lon: L.lon0 + x, lat: L.lat0 + y, land,
      forestTarget: round4(target.forest[g]), forest: round4(f / land),
      coniferTarget: round4(target.coniferShare[g]), conifer: f ? round4(conifer.chosenCount[g] / f) : 0,
      falling: !forest.rising[g], capped: Boolean(forest.capped[g]),
    };
    rows.push(row);
    if (land >= small && !row.capped) worstForest = Math.max(worstForest, Math.abs(row.forest - row.forestTarget));
    if (f >= small && !conifer.capped[g]) worstConifer = Math.max(worstConifer, Math.abs(row.conifer - row.coniferTarget));
  }
  return { rows, worstForest: round4(worstForest), worstConifer: round4(worstConifer), capped: rows.filter((r) => r.capped).map((r) => `${r.lon},${r.lat}`) };
}

/**
 * Cells whose change between two anchors goes against their square's direction: forest gained
 * where the forest share fell, or lost where it rose (and the same for conifer within forest that
 * stays). The nesting makes this zero, for water-today cells too (holdWaterToTheFlow); the checks
 * and tests prove it.
 * @param {Uint8Array} from @param {Uint8Array} to
 * @param {NestedCut} forest @param {NestedCut} conifer the cuts that made `to`
 * @param {import('./pollen-field.mjs').Places} places
 */
export function againstTheFlow(from, to, forest, conifer, places) {
  const isForest = (/** @type {number} */ t) => t === CLASS.conifer || t === CLASS.mixed;
  let forestWrong = 0; let coniferWrong = 0;
  for (let i = 0; i < from.length; i++) {
    const g = places.group[i];
    if (g < 0 || from[i] === to[i]) continue;
    const a = isForest(from[i]); const b = isForest(to[i]);
    if (a !== b && (b ? !forest.rising[g] : forest.rising[g])) forestWrong++;
    if (a && b && from[i] !== to[i]) {
      const nowConifer = to[i] === CLASS.conifer;
      if (nowConifer ? !conifer.rising[g] : conifer.rising[g]) coniferWrong++;
    }
  }
  return { forestWrong, coniferWrong };
}

/** @param {number} x */
const round4 = (x) => Math.round(x * 1e4) / 1e4;

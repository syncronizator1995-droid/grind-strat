// @ts-check
// Checks on a built 1219 terrain grid, printed by the build and stored in its sidecar: class
// totals, how well each 1 degree cell meets the pollen shares, forest shares for rough country
// boxes, and a seam test that would catch 1 degree squares showing on the map.

import { CLASS, CLASS_NAMES } from './terrain-1219.mjs';

/** Squares with fewer land cells than this are listed, but left out of the error summary:
 * a few coastal cells cannot meet a share to within a few points. */
export const SMALL_SQUARE = 50;

/**
 * Rough boxes for comparing with the pollen numbers. NOT borders: plain lon/lat rectangles that
 * hold most of each land, and some of its neighbours.
 */
export const COUNTRY_BOXES = Object.freeze([
  { name: 'Lithuania', south: 53.9, north: 56.45, west: 21, east: 26.8 },
  { name: 'Latvia', south: 55.7, north: 58.1, west: 21, east: 28.2 },
  { name: 'Estonia', south: 57.5, north: 59.7, west: 21.8, east: 28.2 },
  { name: 'Prussia (Kaliningrad)', south: 54.3, north: 55.3, west: 19.6, east: 22.9 },
  { name: 'Masovia', south: 51.5, north: 53.5, west: 19.5, east: 22.5 },
]);

/**
 * @param {ReturnType<typeof import('./terrain-1219.mjs').buildTerrain1219>} built
 * @param {{ cols: number, rows: number, lon: Float64Array, lat: Float64Array }} grid
 */
export function terrainChecks(built, grid) {
  return {
    classTotals: classTotals(built.terrain),
    waterToday: built.water,
    squares: squareChecks(built),
    solver: { forestRounds: built.forest.rounds, forestWorst: round(built.forest.worst, 4), coniferRounds: built.conifer.rounds, coniferWorst: round(built.conifer.worst, 4) },
    tidy: built.tidy,
    boxes: boxChecks(built, grid),
    seams: seamTest(built, grid),
    speckle: speckleTest(built.terrain, grid.cols, grid.rows),
  };
}

/** Cells per class, by name. @param {Uint8Array} terrain */
export function classTotals(terrain) {
  /** @type {Record<string, number>} */
  const out = {};
  const counts = new Int32Array(256);
  for (const t of terrain) counts[t]++;
  for (const [code, name] of Object.entries(CLASS_NAMES)) out[name] = counts[Number(code)];
  const unknown = counts.reduce((s, v, k) => s + (k in CLASS_NAMES ? 0 : v), 0);
  if (unknown) out.unknown = unknown;
  return out;
}

/**
 * Target and achieved forest and conifer shares for every 1 degree square with land.
 * @param {ReturnType<typeof import('./terrain-1219.mjs').buildTerrain1219>} built
 */
export function squareChecks(built) {
  const { lattice: L, forest, conifer } = built;
  /** @type {{ lon: number, lat: number, land: number, measured: boolean, forestTarget: number, forest: number, coniferTarget: number, conifer: number, capped: boolean }[]} */
  const rows = [];
  for (let g = 0; g < L.w * L.h; g++) {
    const land = forest.domainCount[g];
    if (!land) continue;
    const x = g % L.w;
    const y = (g - x) / L.w;
    const forestCells = forest.chosenCount[g];
    rows.push({
      lon: L.lon0 + x,
      lat: L.lat0 + y,
      land,
      measured: !!L.measured[g],
      forestTarget: round(L.forest[g], 4),
      forest: round(forestCells / land, 4),
      coniferTarget: round(L.coniferShare[g], 4),
      conifer: forestCells ? round(conifer.chosenCount[g] / forestCells, 4) : 0,
      capped: forest.wantCount[g] < Math.round(L.forest[g] * land),
    });
  }
  const big = rows.filter((r) => r.land >= SMALL_SQUARE && !r.capped);
  const err = (/** @type {number[]} */ e) => ({ max: round(Math.max(0, ...e), 4), mean: round(e.reduce((s, v) => s + v, 0) / (e.length || 1), 4) });
  const bigForest = big.filter((r) => r.forest * r.land >= SMALL_SQUARE);
  const capped = rows.filter((r) => r.capped);
  return {
    count: rows.length,
    summarised: big.length,
    smallLeftOut: rows.filter((r) => r.land < SMALL_SQUARE).length,
    capped: capped.map((r) => `${r.lon},${r.lat}`),
    cappedGaps: cappedGaps(capped),
    unmeasuredWithLand: rows.filter((r) => !r.measured).map((r) => `${r.lon},${r.lat}`),
    forestError: err(big.map((r) => Math.abs(r.forest - r.forestTarget))),
    coniferError: err(bigForest.map((r) => Math.abs(r.conifer - r.coniferTarget))),
    rows,
  };
}

/**
 * How far the capped squares fall short of the pollen forest share. They are left out of the
 * error summary (which would otherwise only measure the marsh), so this says what they miss:
 * where today's wetland maps hold more marsh than the pollen's open share, marsh wins and the
 * square has less forest than the pollen says, and no open land.
 * @param {{ lon: number, lat: number, land: number, forestTarget: number, forest: number }[]} capped
 */
export function cappedGaps(capped) {
  const gaps = capped.map((r) => ({ at: `${r.lon},${r.lat}`, land: r.land, gapPoints: round((r.forestTarget - r.forest) * 100, 1), missingForest: Math.round((r.forestTarget - r.forest) * r.land) }))
    .sort((a, b) => b.gapPoints - a.gapPoints);
  return {
    squares: gaps.length,
    landCells: gaps.reduce((s, g) => s + g.land, 0),
    missingForestCells: gaps.reduce((s, g) => s + Math.max(0, g.missingForest), 0),
    // The worst among squares with enough land to count (a square with 2 land cells can't hold a share).
    worstGapPoints: gaps.find((g) => g.land >= SMALL_SQUARE)?.gapPoints ?? 0,
    squaresList: gaps,
  };
}

/**
 * How much of the map the noise decides: the grid next to one built with no noise. Forest/not:
 * share of land cells that change; conifer/mixed: share of cells forest in both that change.
 * @param {{ terrain: Uint8Array, domain: Uint8Array }} built @param {{ terrain: Uint8Array }} quiet
 */
export function noiseShare(built, quiet) {
  const forestOf = (/** @type {number} */ t) => t === CLASS.conifer || t === CLASS.mixed;
  let land = 0; let forestChanged = 0; let bothForest = 0; let coniferChanged = 0;
  for (let i = 0; i < built.terrain.length; i++) {
    if (!built.domain[i]) continue;
    land++;
    const a = built.terrain[i]; const b = quiet.terrain[i];
    if (forestOf(a) !== forestOf(b)) forestChanged++;
    else if (forestOf(a)) {
      bothForest++;
      if (a !== b) coniferChanged++;
    }
  }
  return { forestOrNot: round(forestChanged / (land || 1), 4), coniferOrMixed: round(coniferChanged / (bothForest || 1), 4) };
}

/**
 * Forest share in each country box, next to the pollen numbers for the same cells.
 * @param {ReturnType<typeof import('./terrain-1219.mjs').buildTerrain1219>} built
 * @param {{ lon: Float64Array, lat: Float64Array }} grid
 */
export function boxChecks(built, grid) {
  return COUNTRY_BOXES.map((b) => {
    let land = 0; let forest = 0; let conifer = 0; let pollenForest = 0; let pollenConiferCells = 0; let marsh = 0;
    let squareForest = 0;
    for (let i = 0; i < built.terrain.length; i++) {
      if (!built.domain[i]) continue;
      const lon = grid.lon[i]; const lat = grid.lat[i];
      if (lon < b.west || lon > b.east || lat < b.south || lat > b.north) continue;
      land++;
      const t = built.terrain[i];
      if (t === CLASS.conifer || t === CLASS.mixed) forest++;
      if (t === CLASS.conifer) conifer++;
      if (t === CLASS.marsh) marsh++;
      pollenForest += built.forestField[i];
      pollenConiferCells += built.forestField[i] * built.coniferField[i];
      const g = built.places.group[i];
      squareForest += g >= 0 ? built.lattice.forest[g] : 0;
    }
    return {
      name: b.name,
      box: `${b.south}-${b.north}N ${b.west}-${b.east}E`,
      landCells: land,
      forest: round(forest / (land || 1), 3),
      pollenSquares: round(squareForest / (land || 1), 3),
      pollenBlended: round(pollenForest / (land || 1), 3),
      coniferOfForest: round(conifer / (forest || 1), 3),
      pollenConiferOfForest: round(pollenConiferCells / (pollenForest || 1), 3),
      marsh: round(marsh / (land || 1), 3),
    };
  });
}

/** Offsets, in degrees, of the control lines the seam test compares the 1 degree lines with. */
export const SEAM_CONTROLS = Object.freeze([-0.1, -0.05, 0.05, 0.1]);

/**
 * Seam test: how often the class changes between side-by-side land cells that straddle a whole
 * degree of longitude or latitude (the pollen squares' edges), against pairs that straddle
 * control lines a few km to either side. A visible square edge would make the first rate jump
 * above the second. (Comparing with pairs deep inside squares instead would be unfair: where two
 * neighbouring squares have very different forest shares, the land near their shared edge is
 * near half forest, and half-and-half land changes class more often than mostly-one land.)
 * @param {{ terrain: Uint8Array, domain: Uint8Array }} built
 * @param {{ cols: number, rows: number, lon: Float64Array, lat: Float64Array }} grid
 */
export function seamTest(built, grid) {
  const { terrain, domain } = built;
  const { cols, rows, lon, lat } = grid;
  const forestOf = (/** @type {number} */ t) => (t === CLASS.conifer || t === CLASS.mixed ? 1 : 0);
  const offsets = [0, ...SEAM_CONTROLS];
  const pairs = new Float64Array(offsets.length);
  const changes = new Float64Array(offsets.length);
  const forestChanges = new Float64Array(offsets.length);
  let insidePairs = 0; let insideChanges = 0;
  /** @param {number} i @param {number} j */
  const pair = (i, j) => {
    if (!domain[i] || !domain[j]) return;
    const change = terrain[i] !== terrain[j] ? 1 : 0;
    const fchange = forestOf(terrain[i]) !== forestOf(terrain[j]) ? 1 : 0;
    let crossesAny = false;
    for (let k = 0; k < offsets.length; k++) {
      const o = offsets[k];
      if (Math.floor(lon[i] - o) === Math.floor(lon[j] - o) && Math.floor(lat[i] - o) === Math.floor(lat[j] - o)) continue;
      crossesAny = true;
      pairs[k]++; changes[k] += change; forestChanges[k] += fchange;
    }
    if (!crossesAny) { insidePairs++; insideChanges += change; }
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c + 1 < cols) pair(i, i + 1);
      if (r + 1 < rows) pair(i, i + cols);
    }
  }
  const rate = (/** @type {number} */ a, /** @type {number} */ n) => round(a / (n || 1), 4);
  const sum = (/** @type {Float64Array} */ v) => v.reduce((x, y, k) => x + (k ? y : 0), 0);
  const edge = rate(changes[0], pairs[0]);
  const control = rate(sum(changes), sum(pairs));
  return {
    edgePairs: pairs[0],
    controlPairs: sum(pairs),
    edgeChangeRate: edge,
    controlChangeRate: control,
    ratio: round(edge / (control || 1), 3),
    edgeForestChangeRate: rate(forestChanges[0], pairs[0]),
    controlForestChangeRate: rate(sum(forestChanges), sum(pairs)),
    insidePairs,
    insideChangeRate: rate(insideChanges, insidePairs),
  };
}

/**
 * The most speckle a 1219 terrain grid may show (see speckleTest). The first real grid, cut cell
 * by cell from today's land cover, had 2.7%, 1.3% and 5.7%: it looked like camouflage.
 */
export const SPECKLE_LIMITS = Object.freeze({ lone: 0.01, loneForest: 0.006, smallPatch: 0.02 });

/**
 * Speckle test: how much of the land looks like salt and pepper rather than coherent patches.
 *   lone:       share of land cells whose class differs from every side-by-side land neighbour
 *   loneForest: the same for forest against not forest (the speckle the eye sees most)
 *   smallPatch: share of land cells in a patch (side-by-side cells of one class) under 5 cells
 *   meanPatch:  land cells per patch
 * Sea cells are not land and have no class to match; a land cell with no land neighbour at all
 * (a lone islet) is not counted.
 * @param {Uint8Array} terrain @param {number} cols @param {number} rows
 */
export function speckleTest(terrain, cols, rows) {
  const forestOf = (/** @type {number} */ t) => (t === CLASS.conifer || t === CLASS.mixed ? 1 : 0);
  let land = 0; let lone = 0; let loneForest = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const t = terrain[i];
      if (t === CLASS.sea) continue;
      let near = 0; let same = 0; let sameForest = 0;
      for (const j of sideNeighbours(i, c, r, cols, rows)) {
        if (j < 0 || terrain[j] === CLASS.sea) continue;
        near++;
        if (terrain[j] === t) same++;
        if (forestOf(terrain[j]) === forestOf(t)) sameForest++;
      }
      if (!near) continue;
      land++;
      if (!same) lone++;
      if (!sameForest) loneForest++;
    }
  }
  const { count, small } = patchSizes(terrain, cols, rows, 5);
  return {
    land,
    lone: round(lone / (land || 1), 4),
    loneForest: round(loneForest / (land || 1), 4),
    smallPatch: round(small / (land || 1), 4),
    meanPatch: round(land / (count || 1), 1),
  };
}

/** The four side-by-side neighbours of cell i, -1 off the grid. @param {number} i @param {number} c @param {number} r @param {number} cols @param {number} rows */
function sideNeighbours(i, c, r, cols, rows) {
  return [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1];
}

/**
 * Patches of side-by-side land cells of one class: how many, and how many cells sit in patches
 * smaller than `under` cells.
 * @param {Uint8Array} terrain @param {number} cols @param {number} rows @param {number} under
 */
function patchSizes(terrain, cols, rows, under) {
  const seen = new Uint8Array(terrain.length);
  const stack = new Int32Array(terrain.length);
  let count = 0; let small = 0;
  for (let s = 0; s < terrain.length; s++) {
    if (seen[s] || terrain[s] === CLASS.sea) continue;
    const t = terrain[s];
    seen[s] = 1;
    let top = 0; let size = 0;
    stack[top++] = s;
    while (top) {
      const i = stack[--top];
      size++;
      const c = i % cols;
      for (const j of sideNeighbours(i, c, (i - c) / cols, cols, rows)) {
        if (j >= 0 && !seen[j] && terrain[j] === t) { seen[j] = 1; stack[top++] = j; }
      }
    }
    count++;
    if (size < under) small += size;
  }
  return { count, small };
}

/** @param {number} x @param {number} digits */
const round = (x, digits) => Math.round(x * 10 ** digits) / 10 ** digits;

/**
 * The checks as lines for the console.
 * @param {ReturnType<typeof terrainChecks>} k
 */
export function formatChecks(k) {
  const pc = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
  const lines = [];
  const total = Object.values(k.classTotals).reduce((s, v) => s + v, 0);
  lines.push(`classes: ${Object.entries(k.classTotals).map(([name, v]) => `${name} ${v} (${pc(v / total)})`).join(', ')}`);
  lines.push(`water today filled: ${k.waterToday.cells} cells, ${k.waterToday.interior} of them lake interiors (${Object.entries(k.waterToday.byClass).map(([c, v]) => `${CLASS_NAMES[/** @type {keyof typeof CLASS_NAMES} */ (Number(c))]} ${v}`).join(', ')}); marsh by a river: ${k.waterToday.nearRiverMarsh}`);
  const q = k.squares;
  lines.push(`1 degree squares with land: ${q.count}; summarised ${q.summarised} (left out: ${q.smallLeftOut} with under ${SMALL_SQUARE} land cells, ${q.capped.length} capped${q.capped.length ? `: ${q.capped.join(' ')}` : ''})`);
  lines.push(`  forest share error: max ${pc(q.forestError.max)}, mean ${pc(q.forestError.mean)}; conifer share error: max ${pc(q.coniferError.max)}, mean ${pc(q.coniferError.mean)} (capped squares left out)`);
  const g = q.cappedGaps;
  if (g.squares) {
    lines.push(`  capped squares (marsh above the pollen open share, so less forest and no open land): ${g.squares}, ${g.landCells} land cells, ${g.missingForestCells} forest cells short; worst ${g.worstGapPoints} points short`);
    lines.push(`    ${g.squaresList.map((x) => `${x.at} ${x.gapPoints}`).join(', ')}`);
  }
  lines.push(`  squares with land but no pollen value (filled from the nearest): ${q.unmeasuredWithLand.join(' ') || 'none'}`);
  lines.push(`solver rounds: forest ${k.solver.forestRounds} (worst ${pc(k.solver.forestWorst)}), conifer ${k.solver.coniferRounds} (worst ${pc(k.solver.coniferWorst)})`);
  const td = k.tidy;
  lines.push(`tidy: forest/open ${td.forest.islands} islands (${td.forest.islandCells} cells) joined their surroundings, ${td.forest.edgeCells} edge cells moved back to quota; conifer/mixed ${td.conifer.islands} (${td.conifer.islandCells} cells), ${td.conifer.edgeCells} edge cells`);
  lines.push('rough boxes (forest | pollen squares | pollen blended | conifer of forest | pollen conifer | marsh):');
  for (const b of k.boxes) lines.push(`  ${b.name.padEnd(22)} ${pc(b.forest).padStart(6)} | ${pc(b.pollenSquares).padStart(6)} | ${pc(b.pollenBlended).padStart(6)} | ${pc(b.coniferOfForest).padStart(6)} | ${pc(b.pollenConiferOfForest).padStart(6)} | ${pc(b.marsh).padStart(6)}   (${b.box}, ${b.landCells} cells)`);
  const s = k.seams;
  lines.push(`seam test: class changes ${pc(s.edgeChangeRate)} across 1 degree lines vs ${pc(s.controlChangeRate)} across control lines 0.05-0.1 degree away (ratio ${s.ratio}; ${pc(s.insideChangeRate)} deep inside squares); forest/not ${pc(s.edgeForestChangeRate)} vs ${pc(s.controlForestChangeRate)}`);
  if ('noise' in k && k.noise) {
    const nz = /** @type {{ forestOrNot: number, coniferOrMixed: number }} */ (k.noise);
    lines.push(`noise: built again without it, forest/not changes on ${pc(nz.forestOrNot)} of land, conifer/mixed on ${pc(nz.coniferOrMixed)} of forest`);
  }
  const sp = k.speckle;
  lines.push(`speckle: ${pc(sp.lone)} of land cells differ from every neighbour (forest/not ${pc(sp.loneForest)}); ${pc(sp.smallPatch)} in patches under 5 cells; ${sp.meanPatch} cells per patch`);
  return lines;
}

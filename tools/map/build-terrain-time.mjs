// @ts-check
// Builds data/raw/derived/terrain-time-1km.u8: how the land changes from 1219 to today on the
// game's 1 km grid. It holds four change planes, one per stretch between anchors (1250-1425,
// 1425-1725, 1725-1900, 1900-2021), one byte per cell each, as src/sim/map-date.js reads them,
// with a .json sidecar of the anchors, sources, licence, parameters and checks. The rules live in
// tools/map/terrain-time.mjs; this file reads the inputs, runs them, checks the result and draws
// preview pictures at 1219, 1425, 1600, 1725, 1900 and 2021.
//   node tools/map/build-terrain-time.mjs [preview-dir]   (needs npm run map:grids and map:terrain)
//
// LICENCE: CC BY-SA 4.0, like the 1219 grid it grows from. It reads only the inputs of
// tools/map/build-terrain-1219.mjs plus the later pollen windows; never OpenStreetMap data
// (test/map-terrain-time.test.js walks this file's imports to check).

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTerrainTimeline } from '../../src/sim/map-date.js';
import { loadInputs, OUT_NAME as GRID_1219, PREVIEW_COLOURS, TERRAIN_SOURCES } from './build-terrain-1219.mjs';
import { encodePng } from './png.mjs';
import { crop } from './preview-grids.mjs';
import { DERIVED, GRID_1KM, writeGrid } from './resample.mjs';
import { CLASS, CLASS_NAMES, cutTerrain, prepareTerrain, terrainParamsSha256 } from './terrain-1219.mjs';
import { againstTheFlow, ANCHORS, anchorSquares, changePlane, cutLaterAnchors, pollenTarget, TIME_PARAMS, timeParamsSha256, worldCoverTarget } from './terrain-time.mjs';

export const OUT_NAME = 'terrain-time-1km.u8';
/** The later pollen windows this build may read (made by tools/map/build-grids.mjs). */
export const POLLEN_INPUTS = Object.freeze(['spatiocompo-tw3.json', 'spatiocompo-tw2.json', 'spatiocompo-tw1.json']);
/** Every source id that ends up in the change planes. */
export const TIME_SOURCES = Object.freeze([...TERRAIN_SOURCES, 'spatiocompo-tw3', 'spatiocompo-tw2', 'spatiocompo-tw1']);

/** The two labels the game shows for this layer, as for the 1219 grid. */
export const LABELS = Object.freeze({
  forestShare: 'Forest share: estimated from pollen (REVEALS; 1 degree cells; gaps filled by a statistical model) for AD 1250-1600, 1600-1850 and 1850-1950, and from satellite land cover (ESA WorldCover) for 2021',
  forestEdges: 'Which places were cleared or grew back, and in which year: placed by a rule (clearings spread out from open land), not a historical map',
});

/** A rough box over Lithuania (21-27E, 54-56N), for the plain-words check of the shares. */
const LITHUANIA = Object.freeze({ west: 21, east: 27, south: 54, north: 56 });

/** Reads one of the allowed later pollen windows. @param {string} name */
async function readPollen(name) {
  if (!POLLEN_INPUTS.includes(name)) throw new Error(`build-terrain-time may not read ${name}`);
  return JSON.parse(await readFile(join(DERIVED, name), 'utf8'));
}

/** @param {Uint8Array} bytes */
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * The forest share of the domain cells inside a lon/lat box.
 * @param {Uint8Array} terrain @param {Uint8Array} domain @param {import('./terrain-1219.mjs').TerrainInput} input
 * @param {{ west: number, east: number, south: number, north: number }} box
 */
function forestShareIn(terrain, domain, input, box) {
  let land = 0; let forest = 0;
  for (let i = 0; i < terrain.length; i++) {
    if (!domain[i] || input.lon[i] < box.west || input.lon[i] >= box.east || input.lat[i] < box.south || input.lat[i] >= box.north) continue;
    land++;
    if (terrain[i] === CLASS.conifer || terrain[i] === CLASS.mixed) forest++;
  }
  return Math.round((1000 * forest) / (land || 1)) / 10;
}

/** Paints a class grid in M1's colours, north up. @param {Uint8Array} terrain */
function paint(terrain) {
  const { cols, rows } = GRID_1KM;
  const rgb = new Uint8Array(cols * rows * 3);
  for (let r = 0; r < rows; r++) {
    const y = rows - 1 - r;
    for (let c = 0; c < cols; c++) rgb.set(PREVIEW_COLOURS[terrain[r * cols + c]], (y * cols + c) * 3);
  }
  return { width: cols, height: rows, rgb };
}

async function main() {
  const previews = process.argv[2] ?? join(DERIVED, 'previews');
  const started = Date.now();
  const lap = (/** @type {string} */ what) => console.log(`${what} at ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const input = await loadInputs();
  const { cols, rows } = input;
  lap('inputs read');
  const prep = prepareTerrain(input);
  const built = cutTerrain(prep, input);
  // The base must be the 1219 grid the game ships (npm run map:terrain wrote it); if the rules
  // or inputs moved since, both must be rebuilt together.
  const base1219 = new Uint8Array(await readFile(join(DERIVED, GRID_1219)));
  if (sha256(base1219) !== sha256(built.terrain)) throw new Error(`the 1219 rules no longer give ${GRID_1219}: run npm run map:terrain first`);
  lap('1219 grid rebuilt, the same as the shipped one');

  const tw1 = pollenTarget(await readPollen('spatiocompo-tw1.json'), input, prep.lattice);
  const targets = [
    pollenTarget(await readPollen('spatiocompo-tw3.json'), input, prep.lattice),
    pollenTarget(await readPollen('spatiocompo-tw2.json'), input, prep.lattice),
    tw1,
    worldCoverTarget(input.cover.tree, prep, tw1.coniferShare),
  ];
  const later = cutLaterAnchors(prep, built, input, targets);
  lap('later anchors cut');

  const grids = [built.terrain, ...later.map((a) => a.terrain)];
  const intervals = [];
  const checks = [];
  for (let k = 0; k < later.length; k++) {
    const y0 = k === 0 ? ANCHORS[0].holdUntil ?? ANCHORS[0].year : ANCHORS[k].year;
    const y1 = ANCHORS[k + 1].year;
    const plane = changePlane(grids[k], grids[k + 1], cols, rows, input.cellKm);
    intervals.push({ y0, y1, plane });
    let changed = 0; let toForest = 0; let toOpen = 0; let swaps = 0;
    const bands = new Int32Array(TIME_PARAMS.bands);
    const isForest = (/** @type {number} */ t) => t === CLASS.conifer || t === CLASS.mixed;
    for (let i = 0; i < plane.length; i++) {
      if (!plane[i]) continue;
      changed++;
      bands[plane[i] >> 3]++;
      const a = grids[k][i]; const b = grids[k + 1][i];
      if (isForest(b) && !isForest(a)) toForest++;
      else if (isForest(a) && !isForest(b)) toOpen++;
      else if (isForest(a) && isForest(b)) swaps++;
    }
    const sq = anchorSquares(later[k].forest, later[k].conifer, targets[k], prep.lattice);
    checks.push({
      anchor: ANCHORS[k + 1].year,
      interval: `${y0}-${y1}`,
      changedCells: changed, toForest, toOpen, coniferMixedSwaps: swaps,
      bands: [...bands],
      worstForestMiss: sq.worstForest, worstConiferMiss: sq.worstConifer, capped: sq.capped,
      againstTheFlow: againstTheFlow(grids[k], grids[k + 1], later[k].forest, later[k].conifer, prep.places),
      tidy: { forest: later[k].forest.tidy, conifer: later[k].conifer.tidy },
      waterTodayFilled: later[k].water.byClass, waterTodayHeldBack: later[k].water.heldBack,
      lithuaniaForestPercent: forestShareIn(grids[k + 1], prep.domain, input, LITHUANIA),
    });
  }
  const lithuania1219 = forestShareIn(grids[0], prep.domain, input, LITHUANIA);
  for (const c of checks) {
    console.log(`${c.interval}: ${c.changedCells} cells change (${c.toOpen} cleared, ${c.toForest} grow back, ${c.coniferMixedSwaps} conifer/mixed); worst square miss ${(100 * c.worstForestMiss).toFixed(1)} points forest, ${(100 * c.worstConiferMiss).toFixed(1)} conifer; ${c.capped.length} capped; against the flow ${JSON.stringify(c.againstTheFlow)}; Lithuania ${c.lithuaniaForestPercent}% forest`);
  }
  console.log(`Lithuania box 1219: ${lithuania1219}% forest`);

  // The engine must give back every anchor exactly.
  const timeline = createTerrainTimeline({ cols, rows, base: built.terrain, intervals, seed: TIME_PARAMS.seed, block: TIME_PARAMS.blockCells });
  for (let k = 0; k < later.length; k++) {
    const year = ANCHORS[k + 1].year;
    if (sha256(timeline.classesAt(year)) !== sha256(grids[k + 1])) throw new Error(`the timeline does not give back the ${year} anchor`);
  }
  lap('timeline checked against every anchor');

  const bytes = new Uint8Array(intervals.length * cols * rows);
  intervals.forEach((iv, k) => bytes.set(iv.plane, k * cols * rows));
  await writeGrid(OUT_NAME, bytes, {
    cols, rows, cell: GRID_1KM.cell, rowOrder: 'south-first', type: 'uint8',
    planes: intervals.map((iv, k) => ({ y0: iv.y0, y1: iv.y1, offset: k * cols * rows })),
    unit: '(band << 3) | newClass per cell: newClass 0 means no change in that stretch; band 0-31 is the distance to the new class at the stretch\'s start, in bandKm steps',
    classes: CLASS_NAMES,
    base: { file: `data/raw/derived/${GRID_1219}`, sha256: sha256(built.terrain), paramsSha256: terrainParamsSha256() },
    anchors: ANCHORS,
    sources: TIME_SOURCES,
    licence: 'CC-BY-SA-4.0',
    licenceNote: 'Share-alike because the forest shares come from SpatioCompo (CC BY-SA 4.0). Also uses CC BY 4.0 (ESA WorldCover, GLWD v2) and public-domain (GEBCO, Natural Earth) inputs. No OpenStreetMap data.',
    labels: LABELS,
    inputs: [
      ...POLLEN_INPUTS.map((name) => ({ file: `data/raw/derived/${name}` })),
      { file: `data/raw/derived/${GRID_1219}`, what: 'the 1219 grid, rebuilt here and checked byte for byte' },
    ],
    params: TIME_PARAMS,
    paramsSha256: timeParamsSha256(),
    checks: { lithuania1219ForestPercent: lithuania1219, anchors: checks },
    notes: 'Built by tools/map/build-terrain-time.mjs. Each anchor\'s forest and conifer share per 1 degree square is the pollen map\'s (WorldCover\'s for 2021); which 1 km cells change, and when, is a rule (tools/map/terrain-time.mjs, src/sim/map-date.js), not a historical map. Marsh and heath do not change; cells that are water today follow their dry neighbours at each anchor.',
  });
  console.log(`wrote ${join(DERIVED, OUT_NAME)} in ${((Date.now() - started) / 1000).toFixed(1)} s`);

  await mkdir(previews, { recursive: true });
  for (const year of [1219, 1425, 1600, 1725, 1900, 2021]) {
    const pic = paint(timeline.classesAt(year));
    for (const [name, p] of /** @type {[string, { width: number, height: number, rgb: Uint8Array }][]} */ ([[`terrain-time-${year}.png`, pic], [`terrain-time-${year}-lithuania.png`, crop(pic, 23.9, 55.2, 480, 2)]])) {
      await writeFile(join(previews, name), encodePng(p.width, p.height, p.rgb));
      console.log(join(previews, name));
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

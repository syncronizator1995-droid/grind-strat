// @ts-check
// Builds data/raw/derived/terrain-ad1-1km.u8: the lead-in of the land, AD 1 to 1219, on the game's
// 1 km grid. One plane, one byte per cell, as src/sim/map-date.js reads it: (band << 3) | the AD 1
// class, 0 where AD 1 and 1219 agree. Next to it a .json sidecar of the anchor, sources, licence,
// parameters and checks. The rules live in tools/map/terrain-ad1.mjs; this file reads the inputs,
// runs them, checks the result and draws preview pictures at AD 1, 600 and 1219.
//   node tools/map/build-terrain-ad1.mjs [preview-dir]   (needs npm run map:grids and map:terrain)
//
// LICENCE: CC BY-SA 4.0, like the 1219 grid it leads in to. It reads only the inputs of
// tools/map/build-terrain-1219.mjs plus pollen window 6; never OpenStreetMap data
// (test/map-terrain-ad1.test.js walks this file's imports to check).

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTerrainTimeline, LEAD_SEED_OFFSET } from '../../src/sim/map-date.js';
import { loadInputs, OUT_NAME as GRID_1219, PREVIEW_COLOURS, TERRAIN_SOURCES } from './build-terrain-1219.mjs';
import { encodePng } from './png.mjs';
import { crop } from './preview-grids.mjs';
import { DERIVED, GRID_1KM, writeGrid } from './resample.mjs';
import { CLASS, CLASS_NAMES, cutTerrain, prepareTerrain, terrainParamsSha256 } from './terrain-1219.mjs';
import { AD1, AD1_PARAMS, ad1ParamsSha256, cutAd1, LOW_QUALITY_LABEL, leadPlane, lowQualitySquares } from './terrain-ad1.mjs';
import { anchorSquares, pollenTarget, TIME_PARAMS } from './terrain-time.mjs';

export const OUT_NAME = 'terrain-ad1-1km.u8';
/** The pollen window this build may read (made by tools/map/build-grids.mjs). */
export const POLLEN_INPUT = 'spatiocompo-tw6.json';
/** Every source id that ends up in the lead-in plane. */
export const AD1_SOURCES = Object.freeze([...TERRAIN_SOURCES, AD1.source]);

/** The two labels the game shows for this layer, as for the 1219 grid. */
export const LABELS = Object.freeze({
  forestShare: 'Forest share: estimated from pollen (REVEALS; 1 degree cells; gaps filled by a statistical model) for about 250 BC to AD 250',
  forestEdges: 'Which places were forest at AD 1, and in which year before 1219 they changed: placed by a rule (the 1219 rule), not a historical map',
  quality: `Squares in the east (Belarus, north-west Russia, Ukraine) are ${LOW_QUALITY_LABEL}: the paper says the north-eastern and south-eastern parts of its map have few or no pollen records and are of considerably lower quality (Githumbi et al. 2022).`,
});

/** A rough box over Lithuania (21-27E, 54-56N), for the plain-words check of the shares. */
const LITHUANIA = Object.freeze({ west: 21, east: 27, south: 54, north: 56 });

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
  const base1219 = new Uint8Array(await readFile(join(DERIVED, GRID_1219)));
  if (sha256(base1219) !== sha256(built.terrain)) throw new Error(`the 1219 rules no longer give ${GRID_1219}: run npm run map:terrain first`);
  lap('1219 grid rebuilt, the same as the shipped one');

  const pollen = JSON.parse(await readFile(join(DERIVED, POLLEN_INPUT), 'utf8'));
  const target = pollenTarget(pollen, input, prep.lattice);
  const ad1 = cutAd1(prep, built, input, target);
  lap('AD 1 cut');

  const plane = leadPlane(ad1.terrain, built.terrain, cols, rows, input.cellKm);
  const bands = new Int32Array(TIME_PARAMS.bands);
  const isForest = (/** @type {number} */ t) => t === CLASS.conifer || t === CLASS.mixed;
  let changed = 0; let toForest = 0; let toOpen = 0; let swaps = 0;
  for (let i = 0; i < plane.length; i++) {
    if (!plane[i]) continue;
    changed++;
    bands[plane[i] >> 3]++;
    const a = ad1.terrain[i]; const b = built.terrain[i];
    if (isForest(b) && !isForest(a)) toForest++;
    else if (isForest(a) && !isForest(b)) toOpen++;
    else if (isForest(a) && isForest(b)) swaps++;
  }
  const sq = anchorSquares(ad1.forest, ad1.conifer, target, prep.lattice);
  const lithuania = { ad1: forestShareIn(ad1.terrain, prep.domain, input, LITHUANIA), y1219: forestShareIn(built.terrain, prep.domain, input, LITHUANIA) };
  // tools/map/terrain-time.mjs's againstTheFlow reads the cuts that made the LATER grid; here the
  // cut made the earlier one, so the same check is written the other way round.
  const toward = againstTowardFlow(ad1.terrain, built.terrain, ad1.forest, ad1.conifer, prep.places);
  console.log(`AD 1 to 1219: ${changed} cells change (${toOpen} cleared, ${toForest} grow, ${swaps} conifer/mixed); worst square miss at AD 1 ${(100 * sq.worstForest).toFixed(1)} points forest, ${(100 * sq.worstConifer).toFixed(1)} conifer; ${sq.capped.length} capped; against the flow ${JSON.stringify(toward)}`);
  console.log(`Lithuania box: AD 1 ${lithuania.ad1}% forest, 1219 ${lithuania.y1219}%`);

  // The engine must give back both ends exactly.
  const timeline = createTerrainTimeline({
    cols, rows, base: built.terrain, intervals: [], seed: TIME_PARAMS.seed, block: TIME_PARAMS.blockCells,
    leadIn: { y0: AD1.year, y1: AD1.until, plane },
  });
  if (sha256(timeline.classesAt(1)) !== sha256(ad1.terrain)) throw new Error('the lead-in does not give back the AD 1 cut at AD 1');
  if (sha256(timeline.classesAt(AD1.until)) !== sha256(built.terrain)) throw new Error('the lead-in does not give back the 1219 grid at 1219');
  lap('lead-in checked against both ends');

  const low = lowQualitySquares(prep.lattice);
  await writeGrid(OUT_NAME, plane, {
    cols, rows, cell: GRID_1KM.cell, rowOrder: 'south-first', type: 'uint8',
    leadIn: { y0: AD1.year, y1: AD1.until, offset: 0 },
    unit: '(band << 3) | the AD 1 class per cell: 0 means AD 1 and 1219 agree; the cell shows that class until its switch year, then the 1219 grid\'s; band 0-31 is the distance to what it becomes, at AD 1, in bandKm steps',
    classes: CLASS_NAMES,
    base: { file: `data/raw/derived/${GRID_1219}`, sha256: sha256(built.terrain), paramsSha256: terrainParamsSha256() },
    ad1: { sha256: sha256(ad1.terrain) },
    anchor: AD1,
    sources: AD1_SOURCES,
    licence: 'CC-BY-SA-4.0',
    licenceNote: 'Share-alike because the forest shares come from SpatioCompo (CC BY-SA 4.0). Also uses CC BY 4.0 (ESA WorldCover, GLWD v2) and public-domain (GEBCO, Natural Earth) inputs. No OpenStreetMap data.',
    labels: LABELS,
    inputs: [
      { file: `data/raw/derived/${POLLEN_INPUT}` },
      { file: `data/raw/derived/${GRID_1219}`, what: 'the 1219 grid, rebuilt here and checked byte for byte' },
    ],
    params: { ...AD1_PARAMS, time: TIME_PARAMS, leadSeed: TIME_PARAMS.seed + LEAD_SEED_OFFSET },
    paramsSha256: ad1ParamsSha256(),
    lowQuality: { label: LOW_QUALITY_LABEL, fromLon: AD1_PARAMS.lowQualityFromLon, squares: low },
    checks: {
      changedCells: changed, toForest, toOpen, coniferMixedSwaps: swaps, bands: [...bands],
      worstForestMiss: sq.worstForest, worstConiferMiss: sq.worstConifer, capped: sq.capped,
      againstTheFlow: toward,
      tidy: { forest: ad1.forest.tidy, conifer: ad1.conifer.tidy },
      waterTodayFilled: ad1.water.byClass, waterTodayHeldBack: ad1.water.heldBack,
      lithuaniaForestPercent: lithuania,
      squares: sq.rows.map((r) => [r.lon, r.lat, r.land, r.forestTarget, r.forest, r.coniferTarget, r.conifer]),
    },
    notes: 'Built by tools/map/build-terrain-ad1.mjs. The AD 1 forest and conifer share per 1 degree square is the pollen map\'s (window 6); which 1 km cells are forest at AD 1, and in which year before 1219 each changes, is a rule (tools/map/terrain-ad1.mjs, tools/map/terrain-time.mjs, src/sim/map-date.js), not a historical map. Marsh and heath do not change; cells that are water today follow their dry neighbours.',
  });
  console.log(`wrote ${join(DERIVED, OUT_NAME)} in ${((Date.now() - started) / 1000).toFixed(1)} s`);

  await mkdir(previews, { recursive: true });
  for (const year of [1, 600, 1219]) {
    const pic = paint(timeline.classesAt(year));
    for (const [name, p] of /** @type {[string, { width: number, height: number, rgb: Uint8Array }][]} */ ([[`terrain-lead-${year}.png`, pic], [`terrain-lead-${year}-lithuania.png`, crop(pic, 23.9, 55.2, 480, 2)]])) {
      await writeFile(join(previews, name), encodePng(p.width, p.height, p.rgb));
      console.log(join(previews, name));
    }
  }
}

/**
 * Cells whose change from AD 1 to 1219 goes against their square's direction between the two
 * (forest gained where the square's forest fell toward 1219, or lost where it rose; the same for
 * conifer within forest that stays). `forest` and `conifer` are the cuts that made the AD 1 grid,
 * so a square that is "rising" there has MORE forest at AD 1 than at 1219 (forest falls toward 1219).
 * @param {Uint8Array} ad1 @param {Uint8Array} y1219 @param {import('./terrain-time.mjs').NestedCut} forest
 * @param {import('./terrain-time.mjs').NestedCut} conifer @param {import('./pollen-field.mjs').Places} places
 */
function againstTowardFlow(ad1, y1219, forest, conifer, places) {
  const isForest = (/** @type {number} */ t) => t === CLASS.conifer || t === CLASS.mixed;
  let forestWrong = 0; let coniferWrong = 0;
  for (let i = 0; i < ad1.length; i++) {
    const g = places.group[i];
    if (g < 0 || ad1[i] === y1219[i]) continue;
    const a = isForest(ad1[i]); const b = isForest(y1219[i]);
    // Toward 1219 a cell gaining forest (b) is right where AD 1 had LESS forest (not rising).
    if (a !== b && (b ? forest.rising[g] : !forest.rising[g])) forestWrong++;
    if (a && b) {
      const nowConifer = y1219[i] === CLASS.conifer;
      if (nowConifer ? conifer.rising[g] : !conifer.rising[g]) coniferWrong++;
    }
  }
  return { forestWrong, coniferWrong };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

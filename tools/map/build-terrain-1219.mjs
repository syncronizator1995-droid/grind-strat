// @ts-check
// Builds data/raw/derived/terrain-1219-1km.u8: the land around AD 1219 on the game's 1 km grid
// (one class per cell, row 0 in the south), with a .json sidecar of its sources, licence,
// parameters and checks. The rules live in tools/map/terrain-1219.mjs; this file reads the
// inputs, runs them, checks the result and draws preview pictures.
//   node tools/map/build-terrain-1219.mjs [preview-dir]     (needs npm run map:grids first)
//
// LICENCE: this grid is CC BY-SA 4.0, because the pollen map is. It reads ONLY the inputs listed
// in DERIVED_INPUTS and NE_INPUTS below. It must never read OpenStreetMap data (ODbL cannot be
// mixed into CC BY-SA); test/map-terrain.test.js checks this file's imports for that.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRaw } from './fetch.mjs';
import { clipLine, clipRing, featuresIn, fillRings, openRing, project, ringArea2, simplifyRing } from './geo.mjs';
import { inputRecord } from './grid-sources.mjs';
import { encodePng } from './png.mjs';
import { crop } from './preview-grids.mjs';
import { MAP } from './projection.mjs';
import { DERIVED, GRID_1KM, GRID_2KM, writeGrid } from './resample.mjs';
import { buildTerrain1219, CLASS, CLASS_NAMES, TERRAIN_PARAMS } from './terrain-1219.mjs';
import { formatChecks, terrainChecks } from './terrain-checks.mjs';
import { roughness, upsample } from './terrain-fields.mjs';

/** The derived grids this build may read (all made by tools/map/build-grids.mjs). */
export const DERIVED_INPUTS = Object.freeze(['heights-2km.i16', 'worldcover-1km.u8', 'marsh-1km.u8', 'marsh-raw-1km.u8', 'spatiocompo-tw4.json']);
/** The Natural Earth layers this build may read (public domain). */
export const NE_INPUTS = Object.freeze(['ne-land', 'ne-rivers', 'ne-lakes']);
/** Every source id that ends up in the grid, for the sidecar and the credits. */
export const TERRAIN_SOURCES = Object.freeze(['spatiocompo-tw4', 'worldcover-2021', 'glwd-v2', 'gebco-2026', ...NE_INPUTS]);

export const OUT_NAME = 'terrain-1219-1km.u8';

/** The two labels the game shows for this layer (decided with the lead, 6 October 2026). */
export const LABELS = Object.freeze({
  forestShare: 'Forest share: estimated from pollen (REVEALS, AD 750-1250, 1 degree cells; gaps filled by a statistical model)',
  forestEdges: 'Exact forest edges: placed by a rule from today\'s land cover, terrain and rivers; not a historical map',
});

/**
 * M1's terrain colours, copied from src/ui/map/terrain.js (the test checks they still match),
 * so the previews look like the game.
 * @type {[number, number, number][]}
 */
export const PREVIEW_COLOURS = [
  [49, 86, 107], [74, 127, 150], [184, 174, 122], [78, 104, 70], [108, 136, 82], [98, 118, 96], [158, 146, 108],
];

/** Reads one of the allowed derived grids, with its sidecar. @param {string} name */
async function readDerived(name) {
  if (!DERIVED_INPUTS.includes(name)) throw new Error(`build-terrain-1219 may not read ${name}`);
  const data = new Uint8Array(await readFile(join(DERIVED, name)));
  const meta = JSON.parse(await readFile(join(DERIVED, `${name}.json`), 'utf8'));
  return { data, meta };
}

/** Reads one of the allowed Natural Earth layers. @param {string} id */
async function readNe(id) {
  if (!NE_INPUTS.includes(id)) throw new Error(`build-terrain-1219 may not read ${id}`);
  return JSON.parse((await readRaw(id)).data.toString('utf8'));
}

/**
 * Checks a grid's sidecar matches the grid we expect, so a stale or foreign file fails loudly.
 * @param {string} name @param {any} meta @param {{ cols: number, rows: number, cell: number }} grid
 */
function expectGrid(name, meta, grid) {
  if (meta.cols !== grid.cols || meta.rows !== grid.rows || meta.cell !== grid.cell || meta.rowOrder !== 'south-first') {
    throw new Error(`${name}: expected ${grid.cols}x${grid.rows} cells of ${grid.cell}, south first; got ${meta.cols}x${meta.rows} of ${meta.cell}, ${meta.rowOrder}`);
  }
}

/**
 * Natural Earth land at cell centres, exactly as the M1 map did it (tools/map/build-test-map.mjs:
 * the same simplification, the same islet cut, the same fill), so the painted terrain meets the
 * coast that the game draws.
 * @param {any} land GeoJSON
 */
function landMask(land) {
  const { cols, rows, cell } = GRID_1KM;
  /** @type {number[][]} */ const rings = [];
  for (const f of featuresIn(land, 'polygon')) {
    for (const part of f.parts) {
      const ring = simplifyRing(openRing(project(part)), 1.5);
      if (Math.abs(ringArea2(ring)) < 2 * 40) continue; // drop islets under about 0.4 km²
      const clipped = clipRing(ring);
      if (clipped.length) rings.push(clipped);
    }
  }
  const mask = new Uint8Array(cols * rows);
  fillRings(mask, cols, rows, cell, rings, 1);
  return mask;
}

/**
 * Cells touched by Natural Earth river centre lines, and by Natural Earth lakes (reservoirs left
 * out: they were not there in 1219), for "distance from water".
 * @param {any} rivers @param {any} lakes
 */
function waterMasks(rivers, lakes) {
  const { cols, rows, cell } = GRID_1KM;
  let mask = new Uint8Array(cols * rows);
  const mark = (/** @type {number} */ x, /** @type {number} */ y) => {
    const c = Math.floor(x / cell); const r = Math.floor(y / cell);
    if (c >= 0 && r >= 0 && c < cols && r < rows) mask[r * cols + c] = 1;
  };
  /** @param {number[]} line */
  const walk = (line) => {
    for (let k = 0; k + 3 < line.length; k += 2) {
      const [ax, ay, bx, by] = [line[k], line[k + 1], line[k + 2], line[k + 3]];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (cell / 2)));
      for (let s = 0; s <= steps; s++) mark(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
    }
  };
  for (const f of featuresIn(rivers, 'line')) for (const part of f.parts) for (const line of clipLine(project(part))) walk(line);
  const riverCells = mask;
  mask = new Uint8Array(cols * rows);
  /** @type {number[][]} */ const rings = [];
  for (const f of featuresIn(lakes, 'polygon')) {
    if (String(f.props.featurecla).toLowerCase().includes('reservoir')) continue;
    for (const part of f.parts) {
      const ring = openRing(project(part));
      walk([...ring, ring[0], ring[1]]);
      const clipped = clipRing(ring);
      if (clipped.length) rings.push(clipped);
    }
  }
  fillRings(mask, cols, rows, cell, rings, 1);
  return { rivers: riverCells, lakes: mask };
}

/** Lon/lat of every 1 km cell centre. */
function cellCentres() {
  const { cols, rows, cell } = GRID_1KM;
  const lon = new Float64Array(cols * rows);
  const lat = new Float64Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [x, y] = MAP.toDegrees((c + 0.5) * cell, (r + 0.5) * cell);
      lon[r * cols + c] = x;
      lat[r * cols + c] = y;
    }
  }
  return { lon, lat };
}

/** Reads every input and assembles the per-cell arrays the rules need. */
export async function loadInputs() {
  const { cols, rows } = GRID_1KM;
  const cells = cols * rows;
  const heights = await readDerived('heights-2km.i16');
  expectGrid('heights-2km.i16', heights.meta, GRID_2KM);
  const h2 = new Int16Array(heights.data.buffer, heights.data.byteOffset, heights.data.byteLength / 2);
  const cover = await readDerived('worldcover-1km.u8');
  expectGrid('worldcover-1km.u8', cover.meta, GRID_1KM);
  const marsh = await readDerived('marsh-1km.u8');
  expectGrid('marsh-1km.u8', marsh.meta, GRID_1KM);
  // The marsh grid must be the one rebuilt without WorldCover's moss class (100): moss here is
  // mountain tundra, and counting it would turn fells into marsh.
  if (marsh.meta.params?.worldcoverPlanes?.includes('moss') || !marsh.meta.params?.worldcoverLeftOut) {
    throw new Error('marsh-1km.u8 still counts WorldCover moss (class 100): run npm run map:grids -- marsh');
  }
  const marshRaw = await readDerived('marsh-raw-1km.u8');
  expectGrid('marsh-raw-1km.u8', marshRaw.meta, GRID_1KM);
  const pollen = JSON.parse(new TextDecoder().decode((await readDerived('spatiocompo-tw4.json')).data));

  /** @param {string} name */
  const plane = (name) => {
    const k = cover.meta.planes.findIndex((/** @type {{ name: string }} */ p) => p.name === name);
    if (k < 0) throw new Error(`worldcover-1km.u8 has no ${name} plane`);
    return cover.data.subarray(k * cells, (k + 1) * cells);
  };
  const land = landMask(await readNe('ne-land'));
  const { rivers, lakes } = waterMasks(await readNe('ne-rivers'), await readNe('ne-lakes'));
  const height = upsample(h2, GRID_2KM.cols, GRID_2KM.rows, cols, rows, 2);
  for (let i = 0; i < height.length; i++) if (height[i] < 0) height[i] = 0; // land below sea level: polders
  const rough = upsample(roughness(h2, GRID_2KM.cols, GRID_2KM.rows), GRID_2KM.cols, GRID_2KM.rows, cols, rows, 2);
  const { lon, lat } = cellCentres();
  /** @type {import('./terrain-1219.mjs').TerrainInput} */
  const input = {
    cols, rows, cellKm: (GRID_1KM.cell * MAP.unitMetres) / 1000, lon, lat, land, rivers, lakes,
    cover: { tree: plane('tree'), crop: plane('crop'), built: plane('built'), bare: plane('bare'), moss: plane('moss'), water: plane('water') },
    marsh: marsh.data, marshRaw: marshRaw.data, height, rough, pollen,
  };
  return input;
}

/**
 * Paints the class grid in M1's colours, north up.
 * @param {Uint8Array} terrain
 */
function paintClasses(terrain) {
  const { cols, rows } = GRID_1KM;
  const rgb = new Uint8Array(cols * rows * 3);
  for (let r = 0; r < rows; r++) {
    const y = rows - 1 - r;
    for (let c = 0; c < cols; c++) rgb.set(PREVIEW_COLOURS[terrain[r * cols + c]], (y * cols + c) * 3);
  }
  return { width: cols, height: rows, rgb };
}

/**
 * The forest share around each cell (a 21 km window) next to the blended pollen forest share,
 * side by side on one grey scale: the left half should look like a noisier copy of the right.
 * @param {ReturnType<typeof buildTerrain1219>} built
 */
function paintForestShare(built) {
  const { cols, rows } = GRID_1KM;
  const forest = new Float32Array(cols * rows);
  for (let i = 0; i < forest.length; i++) forest[i] = built.terrain[i] === CLASS.conifer || built.terrain[i] === CLASS.mixed ? 1 : 0;
  // A box sum through a summed-area table: fast enough for a 21 x 21 window over 2 million cells.
  const sat = new Float64Array((cols + 1) * (rows + 1));
  const satN = new Float64Array((cols + 1) * (rows + 1));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = (r + 1) * (cols + 1) + c + 1;
      sat[k] = forest[r * cols + c] + sat[k - 1] + sat[k - cols - 1] - sat[k - cols - 2];
      satN[k] = built.domain[r * cols + c] + satN[k - 1] + satN[k - cols - 1] - satN[k - cols - 2];
    }
  }
  const R = 10;
  const w = cols * 2 + 8;
  const rgb = new Uint8Array(w * rows * 3).fill(255);
  const grey = (/** @type {number} */ v) => { const g = Math.round(235 - 200 * Math.max(0, Math.min(1, v))); return [g, g + 10 > 255 ? 255 : g + 10, g]; };
  for (let r = 0; r < rows; r++) {
    const y = rows - 1 - r;
    const r0 = Math.max(0, r - R); const r1 = Math.min(rows, r + R + 1);
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!built.domain[i]) {
        rgb.set([90, 120, 150], (y * w + c) * 3);
        rgb.set([90, 120, 150], (y * w + c + cols + 8) * 3);
        continue;
      }
      const c0 = Math.max(0, c - R); const c1 = Math.min(cols, c + R + 1);
      const box = (/** @type {Float64Array} */ t) => t[r1 * (cols + 1) + c1] - t[r0 * (cols + 1) + c1] - t[r1 * (cols + 1) + c0] + t[r0 * (cols + 1) + c0];
      rgb.set(grey(box(sat) / Math.max(1, box(satN))), (y * w + c) * 3);
      rgb.set(grey(built.forestField[i]), (y * w + c + cols + 8) * 3);
    }
  }
  return { width: w, height: rows, rgb };
}

/** @param {string} dir */
async function writePreviews(dir, /** @type {ReturnType<typeof buildTerrain1219>} */ built) {
  await mkdir(dir, { recursive: true });
  /** @param {string} name @param {{ width: number, height: number, rgb: Uint8Array }} pic */
  const save = async (name, pic) => {
    await writeFile(join(dir, name), encodePng(pic.width, pic.height, pic.rgb));
    console.log(join(dir, name));
  };
  const pic = paintClasses(built.terrain);
  await save('terrain-1219.png', pic);
  await save('terrain-1219-lithuania.png', crop(pic, 23.9, 55.2, 480, 2));
  await save('terrain-1219-curonian-spit.png', crop(pic, 21.0, 55.25, 130, 5));
  await save('terrain-1219-forest-share.png', paintForestShare(built));
}

async function main() {
  const previews = process.argv[2] ?? join(DERIVED, 'previews');
  const started = Date.now();
  const input = await loadInputs();
  console.log(`inputs read in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const built = buildTerrain1219(input);
  const checks = terrainChecks(built, input);
  for (const line of formatChecks(checks)) console.log(line);

  const inputs = [];
  for (const name of DERIVED_INPUTS) {
    const { meta } = await readDerived(name);
    inputs.push({ file: `data/raw/derived/${name}`, sources: meta.sources, sidecarParams: meta.params });
  }
  for (const id of NE_INPUTS) inputs.push({ source: id, ...(await inputRecord(id)) });
  await writeGrid(OUT_NAME, built.terrain, {
    cols: GRID_1KM.cols,
    rows: GRID_1KM.rows,
    cell: GRID_1KM.cell,
    rowOrder: 'south-first',
    type: 'uint8',
    unit: 'terrain class',
    classes: CLASS_NAMES,
    classNotes: 'Class 1 (lake) is not used: the game draws lakes from the separate OpenStreetMap block, which must never be mixed into this CC BY-SA grid. Cells that are water today but land on the Natural Earth coast carry the class of their dry neighbours.',
    sources: TERRAIN_SOURCES,
    licence: 'CC-BY-SA-4.0',
    licenceNote: 'Share-alike because the forest shares come from SpatioCompo (CC BY-SA 4.0). Also uses CC BY 4.0 (ESA WorldCover, GLWD v2) and public-domain (GEBCO, Natural Earth) inputs. No OpenStreetMap data.',
    labels: LABELS,
    inputs,
    params: TERRAIN_PARAMS,
    checks,
    notes: 'Built by tools/map/build-terrain-1219.mjs. The forest share of each 1 degree cell is the pollen map\'s; which 1 km cells are forest, and which forest is conifer, is a rule (see tools/map/terrain-1219.mjs), not a historical map.',
  });
  console.log(`wrote ${join(DERIVED, OUT_NAME)} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  await writePreviews(previews, built);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

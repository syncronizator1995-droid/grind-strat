// @ts-check
// The terrain block (src/data/by-sa/terrain-1219.json, CC BY-SA 4.0): the land around 1219 on the
// 1 km grid, one class per cell. It is CC BY-SA 4.0 because the forest shares come from
// SpatioCompo (CC BY-SA 4.0); it may hold CC BY and public-domain inputs too, but never anything
// from OpenStreetMap (ODbL and CC BY-SA cannot be mixed).
//
// The grid (data/raw/derived/terrain-1219-1km.u8) is built by its own tool (npm run map:terrain).
// Packing refuses a grid built from another lake list or other settings than today's, and the
// block records both fingerprints so a test can catch a stale block without data/raw/.
// A fallback for a computer without that grid: an interim grid made here from today's land cover
// and marsh, marked interim, which the strict build refuses to ship.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeBlock } from './block.mjs';
import { fillRings } from './geo.mjs';
import { neLand } from './ne-layers.mjs';
import { lakeListSha256, readReview, REVIEW_FILE } from './ne-water-1219.mjs';
import { readDerived } from './pack-base.mjs';
import { madeFrom } from './pack-notice.mjs';
import { MAP } from './projection.mjs';
import { DERIVED, GRID_1KM } from './resample.mjs';
import { TERRAIN_PARAMS, terrainParamsSha256 } from './terrain-1219.mjs';

/** Terrain classes, as the grid stores them (1 was lakes in M1; lakes are now vector shapes). */
export const CLASSES = Object.freeze({ sea: 0, open: 2, conifer: 3, mixed: 4, marsh: 5, heath: 6 });
export const REAL_GRID = 'terrain-1219-1km.u8';
/** What the real grid is made from, if its sidecar does not say. */
const REAL_SOURCES = ['spatiocompo-tw4', 'worldcover-2021', 'glwd-v2', 'gebco-2026', 'ne-land'];
const INTERIM_SOURCES = ['spatiocompo-tw4', 'worldcover-2021', 'glwd-v2', 'ne-land'];

/**
 * The interim grid: land from Natural Earth; marsh where today's marsh share (GLWD v2 and
 * WorldCover wetland) is at least half; forest where today's tree cover is at least 40%, conifer
 * or mixed by SpatioCompo's conifer and broadleaf shares around 1219; heath where shrub, bare
 * ground and moss make up at least 40%; open land elsewhere. A stand-in only.
 */
async function interimGrid() {
  const { cols, rows, cell } = GRID_1KM;
  const n = cols * rows;
  const land = new Uint8Array(n);
  fillRings(land, cols, rows, cell, await neLand(), 1);
  const cover = (await readDerived('worldcover-1km.u8')).bytes;
  const marsh = (await readDerived('marsh-1km.u8')).bytes;
  const pollen = JSON.parse(await readFile(join(DERIVED, 'spatiocompo-tw4.json'), 'utf8'));
  /** @type {Map<string, { conifer: number, broadleaf: number }>} */
  const byCell = new Map(pollen.map((/** @type {any} */ p) => [`${p.lon},${p.lat}`, p]));
  const plane = (/** @type {number} */ p, /** @type {number} */ i) => cover[p * n + i];
  const grid = new Uint8Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!land[i]) continue;
      const tree = plane(0, i); const shrub = plane(1, i); const bare = plane(5, i); const moss = plane(8, i);
      if (marsh[i] >= 50) grid[i] = CLASSES.marsh;
      else if (tree >= 40) {
        const [lon, lat] = MAP.toDegrees((c + 0.5) * cell, (r + 0.5) * cell);
        const p = byCell.get(`${Math.floor(lon) + 0.5},${Math.floor(lat) + 0.5}`);
        grid[i] = p && p.conifer > p.broadleaf ? CLASSES.conifer : CLASSES.mixed;
      } else if (shrub + bare + moss >= 40) grid[i] = CLASSES.heath;
      else grid[i] = CLASSES.open;
    }
  }
  return { grid, cols, rows, cell, sources: INTERIM_SOURCES };
}

/**
 * Why a built grid no longer matches today's lake list or settings (none: it is current).
 * @param {any} meta the grid's sidecar
 * @param {import('./ne-water-1219.mjs').Review} review today's reviewed list
 * @returns {string[]}
 */
export function staleReasons(meta, review) {
  const reasons = [];
  const lakes = (meta.inputs ?? []).find((/** @type {any} */ i) => i.file === REVIEW_FILE);
  if (lakes?.lakesSha256 !== lakeListSha256(review)) reasons.push(`the lakes in ${REVIEW_FILE} changed since it was built`);
  if (JSON.stringify(meta.params) !== JSON.stringify(TERRAIN_PARAMS)) reasons.push('TERRAIN_PARAMS in tools/map/terrain-1219.mjs changed since it was built');
  return reasons;
}

async function realGrid() {
  const { meta, bytes } = await readDerived(REAL_GRID);
  const grid = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (grid.length !== meta.cols * meta.rows) throw new Error(`${REAL_GRID} does not match its sidecar`);
  const review = await readReview();
  const stale = staleReasons(meta, review);
  if (stale.length) throw new Error(`the terrain grid is stale (${stale.join('; ')}): run npm run map:terrain`);
  const gaps = meta.checks?.squares?.cappedGaps;
  return {
    grid, cols: meta.cols, rows: meta.rows, cell: meta.cell, sources: meta.sources ?? REAL_SOURCES,
    built: {
      lakesSha256: lakeListSha256(review),
      paramsSha256: terrainParamsSha256(),
      // Squares where marsh is above the pollen's open share, so forest falls short of it.
      capped: gaps ? { squares: gaps.squares, landCells: gaps.landCells, missingForestCells: gaps.missingForestCells, worstGapPoints: gaps.worstGapPoints } : null,
    },
  };
}

export async function packTerrain() {
  const interim = !existsSync(join(DERIVED, REAL_GRID));
  const made = interim ? await interimGrid() : await realGrid();
  const { grid, cols, rows, cell, sources } = made;
  for (const v of grid) if (v === 1 || v > 6) throw new Error(`terrain class ${v} is not one the game knows`);
  const label = interim
    ? 'INTERIM land cover for Grind Strat (a stand-in from today\'s land cover, not yet the land around 1219), 1 km grid.'
    : 'The land around AD 1219 for Grind Strat, 1 km grid: forest share estimated from pollen, edges placed by a rule; marsh from today\'s peat-soil and wetland maps plus today\'s open bogs.';
  return makeBlock({
    kind: 'terrain',
    licence: 'CC-BY-SA-4.0',
    notice: `${label} Shared under CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0/). ${await madeFrom(sources)}`,
    sources,
    interim,
    meta: { terrain: { cols, rows, cell, rowOrder: 'south-first' }, classes: CLASSES, ...('built' in made ? { built: made.built } : {}) },
    // Stored as it is: deflate packs this grid better than any row-to-row change coding tried.
    layers: { terrain: grid },
  });
}

// @ts-check
// The base block (src/data/map/base.json, public domain): Natural Earth land, whose outline is
// also the coast, and GEBCO heights and sea depths in whole metres on the 2 km grid.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encodeGrid, encodeShapes } from '../../src/ui/map/codec.js';
import { makeBlock } from './block.mjs';
import { ringArea2 } from './geo.mjs';
import { joinLevels, LEVEL_TOLERANCES, pointLevels } from './levels.mjs';
import { neLand } from './ne-layers.mjs';
import { madeFrom } from './pack-notice.mjs';
import { MAP } from './projection.mjs';
import { DERIVED } from './resample.mjs';

/** Islands under about 2 km² are left out of the overview. */
const OVERVIEW_MIN_AREA = 200;

/** Reads a derived grid and its sidecar. @param {string} name */
export async function readDerived(name) {
  const meta = JSON.parse(await readFile(join(DERIVED, `${name}.json`), 'utf8'));
  const bytes = await readFile(join(DERIVED, name));
  return { meta, bytes };
}

/** Points on the map's border stay at every level, so the land never pulls away from the edge. */
const onBorder = (/** @type {number} */ x, /** @type {number} */ y) => x === 0 || y === 0 || x === MAP.width || y === MAP.height;

export async function packBase() {
  const land = await neLand();
  const landLevels = joinLevels(land.map((r) => pointLevels(r, true, { pin: onBorder, minLevel: Math.abs(ringArea2(r)) / 2 < OVERVIEW_MIN_AREA ? 1 : 0 })));
  const { meta: hMeta, bytes } = await readDerived('heights-2km.i16');
  const heights = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  if (heights.length !== hMeta.cols * hMeta.rows) throw new Error('heights-2km.i16 does not match its sidecar');
  const sources = ['ne-land', ...hMeta.sources];
  return makeBlock({
    kind: 'base',
    licence: 'public-domain',
    notice: `Land, coast, heights and sea depths for Grind Strat. ${await madeFrom(sources)}`,
    sources,
    meta: {
      width: MAP.width,
      height: MAP.height,
      levels: LEVEL_TOLERANCES,
      heights: { cols: hMeta.cols, rows: hMeta.rows, cell: hMeta.cell, unit: 'metres, sea depth negative' },
    },
    layers: { land: encodeShapes(land), landLevels, heights: encodeGrid(heights, hMeta.cols) },
  });
}

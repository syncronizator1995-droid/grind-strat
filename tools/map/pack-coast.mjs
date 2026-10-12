// @ts-check
// The coast block (src/data/by/coast.json, CC BY 4.0): the northern coast over time, one code per
// 500 m cell over the north of the map (src/sim/coast-date.js reads it; src/ui/map/shore.js
// draws the old sea and shore from it). CC BY 4.0 because NKG_RF17vel (and SGU's model, when
// used) are; the rest is public domain. Nothing from OpenStreetMap.
//
// The field (data/raw/derived/coast-500m.u8) is built by its own tool (npm run map:coast).
// Packing refuses a field built from other settings or control points than today's, and the
// block records the fingerprint, so a test can catch a stale block without data/raw/.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COAST_BASE_YEAR, COAST_CODE, COAST_STEP } from '../../src/sim/coast-date.js';
import { makeBlock, ROOT } from './block.mjs';
import { ANCHORS_FILE, OUT_NAME } from './build-coast.mjs';
import { coastParamsSha256 } from './coast.mjs';
import { readDerived } from './pack-base.mjs';
import { madeFrom } from './pack-notice.mjs';

export const COAST_BLOCK = 'src/data/by/coast.json';

/**
 * Why a built field no longer matches today's settings and control points (none: it is current).
 * @param {any} meta the field's sidecar @param {string} anchorsText
 * @returns {string[]}
 */
export function coastStaleReasons(meta, anchorsText) {
  return meta.paramsSha256 === coastParamsSha256(anchorsText) ? []
    : [`COAST_PARAMS in tools/map/coast.mjs or ${ANCHORS_FILE} changed since it was built`];
}

export async function packCoast() {
  const anchorsText = await readFile(join(ROOT, ANCHORS_FILE), 'utf8');
  let derived;
  try {
    derived = await readDerived(OUT_NAME);
  } catch {
    throw new Error(`no coast field (data/raw/derived/${OUT_NAME}): run npm run map:coast`);
  }
  const { meta, bytes } = derived;
  const codes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (codes.length !== meta.cols * meta.rows) throw new Error(`${OUT_NAME} does not match its sidecar`);
  const stale = coastStaleReasons(meta, anchorsText);
  if (stale.length) throw new Error(`the coast field is stale (${stale.join('; ')}): run npm run map:coast`);
  for (const k of codes) if (k > COAST_CODE.last && k !== COAST_CODE.sea) throw new Error(`coast code ${k} is not one the game knows`);
  const anchors = JSON.parse(anchorsText);
  /** @type {string[]} */
  const sources = meta.sources;
  const label = 'The northern coast over time for Grind Strat (Sweden, Åland, Finland, Estonia): where the sea stood higher against today\'s land since AD 1219, 500 m cells. An estimate: today\'s land uplift (NKG_RF17vel) bent to fit dated shores from local studies, over GEBCO\'s heights.';
  return makeBlock({
    kind: 'coast',
    licence: 'CC-BY-4.0',
    notice: `${label} Shared under CC BY 4.0 (creativecommons.org/licenses/by/4.0/). ${await madeFrom(sources)}`,
    sources,
    meta: {
      coast: { col0: meta.col0, row0: meta.row0, cols: meta.cols, rows: meta.rows, cell: meta.cell, rowOrder: 'south-first' },
      codes: { land: COAST_CODE.land, first: COAST_CODE.first, last: COAST_CODE.last, sea: COAST_CODE.sea, baseYear: COAST_BASE_YEAR, step: COAST_STEP },
      estimate: true,
      sgu: meta.sgu,
      fitted: meta.fitted,
      checks: meta.checks,
      regions: anchors.regions.map((/** @type {{ name: string, error: string }} */ r) => ({ name: r.name, error: r.error })),
      lakes: meta.outlets,
      built: { paramsSha256: meta.paramsSha256 },
    },
    // Stored as it is: mostly runs of 0 and 254, which deflate to almost nothing.
    layers: { coast: codes },
  });
}

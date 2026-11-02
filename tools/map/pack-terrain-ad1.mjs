// @ts-check
// The terrain-ad1 block (src/data/by-sa/terrain-ad1.json, CC BY-SA 4.0): the lead-in of the land,
// AD 1 to 1219, as one plane on the 1 km grid (one byte per cell). src/sim/map-date.js turns it,
// with the 1219 terrain block, into the land of any year from AD 1 (timelineFromBlock, `lead`).
// A late block: the game reads it only for dates before 1219.
//
// The plane (data/raw/derived/terrain-ad1-1km.u8) is built by npm run map:terrain-ad1. Packing
// refuses a plane built with other settings than today's or from another 1219 grid than the one
// the terrain block ships. Without the plane, the committed block is left as it is.
//   node tools/map/pack-terrain-ad1.mjs     (also run by tools/map/pack.mjs)

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockText, makeBlock, writeBlock } from './block.mjs';
import { LABELS, OUT_NAME } from './build-terrain-ad1.mjs';
import { readDerived } from './pack-base.mjs';
import { madeFrom } from './pack-notice.mjs';
import { DERIVED } from './resample.mjs';
import { terrainParamsSha256 } from './terrain-1219.mjs';
import { AD1, AD1_PARAMS, ad1ParamsSha256 } from './terrain-ad1.mjs';
import { TIME_PARAMS } from './terrain-time.mjs';

export const AD1_BLOCK = 'src/data/by-sa/terrain-ad1.json';
const BASE_GRID = 'terrain-1219-1km.u8';

/** @param {Uint8Array} bytes */
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * Why a built plane no longer matches today's rules or the shipped 1219 grid (none: it is current).
 * @param {any} meta the plane's sidecar @param {string} baseSha256 the 1219 grid's fingerprint today
 * @returns {string[]}
 */
export function ad1StaleReasons(meta, baseSha256) {
  const reasons = [];
  if (meta.paramsSha256 !== ad1ParamsSha256()) reasons.push('AD1, AD1_PARAMS or TIME_PARAMS changed since it was built');
  if (meta.base?.paramsSha256 !== terrainParamsSha256()) reasons.push('TERRAIN_PARAMS in tools/map/terrain-1219.mjs changed since it was built');
  if (meta.base?.sha256 !== baseSha256) reasons.push(`it was built on another 1219 grid than data/raw/derived/${BASE_GRID}`);
  return reasons;
}

/** The block, or null when the plane was never built here. */
export async function packTerrainAd1() {
  if (!existsSync(join(DERIVED, OUT_NAME))) return null;
  const { meta, bytes } = await readDerived(OUT_NAME);
  const plane = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (plane.length !== meta.cols * meta.rows) throw new Error(`${OUT_NAME} does not match its sidecar`);
  const base = new Uint8Array(await readFile(join(DERIVED, BASE_GRID)));
  const stale = ad1StaleReasons(meta, sha256(base));
  if (stale.length) throw new Error(`the AD 1 plane is stale (${stale.join('; ')}): run npm run map:terrain-ad1`);
  for (const v of plane) if (v && ((v & 7) === 1 || (v & 7) > 6 || !(v & 7))) throw new Error(`terrain-ad1: class ${v & 7} is not one the game knows`);
  return makeBlock({
    kind: 'terrain-ad1',
    licence: 'CC-BY-SA-4.0',
    notice: `The land around AD 1 for Grind Strat, 1 km grid, and how it changes to 1219: forest shares estimated from pollen (about 250 BC to AD 250), which places were forest and when they changed placed by a rule. Squares in the east are model-filled and of lower quality. Shared under CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0/). ${await madeFrom(meta.sources)}`,
    sources: meta.sources,
    meta: {
      grid: { cols: meta.cols, rows: meta.rows, cell: meta.cell, rowOrder: 'south-first' },
      encoding: '(band << 3) | the AD 1 class per cell; 0 = the same at AD 1 as in 1219',
      leadIn: { y0: AD1.year, y1: AD1.until, layer: 'lead' },
      anchor: AD1,
      seed: TIME_PARAMS.seed,
      blockCells: TIME_PARAMS.blockCells,
      bandKm: TIME_PARAMS.bandKm,
      bands: TIME_PARAMS.bands,
      base: { kind: 'terrain', sha256: meta.base.sha256 },
      ad1: meta.ad1,
      built: { paramsSha256: ad1ParamsSha256(), terrainParamsSha256: terrainParamsSha256(), params: AD1_PARAMS },
      lowQuality: meta.lowQuality,
      labels: LABELS,
      checks: { lithuaniaForestPercent: meta.checks.lithuaniaForestPercent, worstForestMiss: meta.checks.worstForestMiss, worstConiferMiss: meta.checks.worstConiferMiss, squares: meta.checks.squares },
    },
    layers: { lead: plane },
  });
}

async function main() {
  const block = await packTerrainAd1();
  if (!block) {
    console.log(`no data/raw/derived/${OUT_NAME}: ${AD1_BLOCK} left as it is (npm run map:terrain-ad1 builds it)`);
    return;
  }
  const text = await writeBlock(AD1_BLOCK, block);
  console.log(`${AD1_BLOCK}: ${(text.length / 1024).toFixed(1)} KB (${(Buffer.byteLength(blockText(block)) / 1048576).toFixed(2)} MB)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

// @ts-check
// The terrain-time block (src/data/by-sa/terrain-time.json, CC BY-SA 4.0): how the land changes
// from 1219 to today, as four change planes on the 1 km grid, one per stretch between anchors
// (1250-1425, 1425-1725, 1725-1900, 1900-2021), one byte per cell each. src/sim/map-date.js turns
// them, with the 1219 terrain block, into the land of any year (timelineFromBlock).
//
// The planes (data/raw/derived/terrain-time-1km.u8) are built by npm run map:terrain-time.
// Packing refuses planes built with other settings than today's, or from another 1219 grid than
// the one the terrain block ships, and records the fingerprints so a test can catch a stale block
// without data/raw/. Without the planes (a computer that never built them), the committed block is
// left as it is.
//   node tools/map/pack-terrain-time.mjs     (also run by tools/map/pack.mjs)

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { blockText, makeBlock, writeBlock } from './block.mjs';
import { LABELS, OUT_NAME } from './build-terrain-time.mjs';
import { readDerived } from './pack-base.mjs';
import { madeFrom } from './pack-notice.mjs';
import { DERIVED } from './resample.mjs';
import { terrainParamsSha256 } from './terrain-1219.mjs';
import { ANCHORS, TIME_PARAMS, timeParamsSha256 } from './terrain-time.mjs';

export const TIME_BLOCK = 'src/data/by-sa/terrain-time.json';
const BASE_GRID = 'terrain-1219-1km.u8';

/** @param {Uint8Array} bytes */
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * Why built planes no longer match today's rules or the shipped 1219 grid (none: they are current).
 * @param {any} meta the planes' sidecar
 * @param {string} baseSha256 the 1219 grid's fingerprint today
 * @returns {string[]}
 */
export function timeStaleReasons(meta, baseSha256) {
  const reasons = [];
  if (meta.paramsSha256 !== timeParamsSha256()) reasons.push('ANCHORS or TIME_PARAMS in tools/map/terrain-time.mjs changed since they were built');
  if (meta.base?.paramsSha256 !== terrainParamsSha256()) reasons.push('TERRAIN_PARAMS in tools/map/terrain-1219.mjs changed since they were built');
  if (meta.base?.sha256 !== baseSha256) reasons.push(`they were built on another 1219 grid than data/raw/derived/${BASE_GRID}`);
  return reasons;
}

/** The block, or null when the planes were never built here. */
export async function packTerrainTime() {
  if (!existsSync(join(DERIVED, OUT_NAME))) return null;
  const { meta, bytes } = await readDerived(OUT_NAME);
  const planes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cells = meta.cols * meta.rows;
  if (planes.length !== cells * meta.planes.length) throw new Error(`${OUT_NAME} does not match its sidecar`);
  const base = new Uint8Array(await readFile(join(DERIVED, BASE_GRID)));
  const stale = timeStaleReasons(meta, sha256(base));
  if (stale.length) throw new Error(`the terrain-time planes are stale (${stale.join('; ')}): run npm run map:terrain-time`);
  /** @type {Record<string, Uint8Array>} */
  const layers = {};
  const intervals = [];
  for (const p of meta.planes) {
    const layer = `p${p.y0}`;
    const plane = planes.subarray(p.offset, p.offset + cells);
    for (const v of plane) if ((v & 7) === 1 || (v & 7) > 6) throw new Error(`terrain-time: class ${v & 7} is not one the game knows`);
    layers[layer] = plane;
    intervals.push({ y0: p.y0, y1: p.y1, layer });
  }
  const sources = meta.sources;
  return makeBlock({
    kind: 'terrain-time',
    licence: 'CC-BY-SA-4.0',
    notice: `How the land changes from 1219 to 2021 for Grind Strat, 1 km grid: forest shares at 1425, 1725 and 1900 estimated from pollen, at 2021 from satellite land cover; which places change, and when, placed by a rule. Shared under CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0/). ${await madeFrom(sources)}`,
    sources,
    meta: {
      grid: { cols: meta.cols, rows: meta.rows, cell: meta.cell, rowOrder: 'south-first' },
      encoding: '(band << 3) | newClass per cell; newClass 0 = no change in that stretch',
      intervals,
      anchors: ANCHORS,
      seed: TIME_PARAMS.seed,
      blockCells: TIME_PARAMS.blockCells,
      bandKm: TIME_PARAMS.bandKm,
      bands: TIME_PARAMS.bands,
      base: { kind: 'terrain', sha256: meta.base.sha256 },
      built: { paramsSha256: timeParamsSha256(), terrainParamsSha256: terrainParamsSha256() },
      labels: LABELS,
    },
    layers,
  });
}

async function main() {
  const block = await packTerrainTime();
  if (!block) {
    console.log(`no data/raw/derived/${OUT_NAME}: ${TIME_BLOCK} left as it is (npm run map:terrain-time builds it)`);
    return;
  }
  const text = await writeBlock(TIME_BLOCK, block);
  console.log(`${TIME_BLOCK}: ${(text.length / 1024).toFixed(1)} KB (${(Buffer.byteLength(blockText(block)) / 1048576).toFixed(2)} MB)`);
  // Each plane on its own, deflated as the block does, to see where the bytes go.
  const { meta, bytes } = await readDerived(OUT_NAME);
  const cells = meta.cols * meta.rows;
  for (const p of meta.planes) {
    const z = deflateSync(bytes.subarray(p.offset, p.offset + cells), { level: 9 }).length;
    console.log(`  ${p.y0}-${p.y1}: ${(z / 1024).toFixed(0)} KB deflated`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

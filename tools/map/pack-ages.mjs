// @ts-check
// The ages block (src/data/by-sa/ages.json, CC BY-SA 4.0): the five ice-age maps, per age a 1 km
// surface layer and a 2 km cover layer, in the format src/ui/map/slice.js reads (its header
// comment). A late block: the game reads it only when an age shows.
//
// The layers (data/raw/derived/ages-<id>.surface.u8 and .cover.u8, with ages-summary.json) are built
// by npm run map:ages. Packing refuses layers built with other settings than today's. Without them
// the committed block is left as it is.
//   node tools/map/pack-ages.mjs     (also run by tools/map/pack.mjs)

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGE_BUILDS, paramsSha256 } from './ages.mjs';
import { makeBlock, writeBlock } from './block.mjs';
import { AGES_SOURCES, coverName, LABELS, SUMMARY_NAME, surfaceName } from './build-ages.mjs';
import { madeFrom } from './pack-notice.mjs';
import { DERIVED } from './resample.mjs';

export const AGES_BLOCK = 'src/data/by-sa/ages.json';

/** The block, or null when the layers were never built here. */
export async function packAges() {
  if (!existsSync(join(DERIVED, SUMMARY_NAME))) return null;
  const summary = JSON.parse(await readFile(join(DERIVED, SUMMARY_NAME), 'utf8'));
  if (summary.paramsSha256 !== paramsSha256()) throw new Error('the ice-age layers are stale (AGE_BUILDS or AGES_PARAMS changed since they were built): run npm run map:ages');
  /** @type {Record<string, Uint8Array>} */
  const layers = {};
  for (const a of AGE_BUILDS) {
    layers[`${a.id}/surface`] = new Uint8Array(await readFile(join(DERIVED, surfaceName(a.id))));
    layers[`${a.id}/cover`] = new Uint8Array(await readFile(join(DERIVED, coverName(a.id))));
    if (layers[`${a.id}/surface`].length !== summary.grid.cols * summary.grid.rows) throw new Error(`${a.id}: the surface layer does not match its summary`);
  }
  const built = Object.fromEntries(AGE_BUILDS.map((a) => {
    const s = summary.ages[a.id];
    return [a.id, {
      sguTable: a.table, sguFile: a.file, sguSha256: s.sgu.sha256, ice: a.ice === 'dated1' ? 'DATED-1 TS12_mc' : 'SGU code 5', cover: a.cover === 'painted' ? 'painted by a rule' : a.cover,
      cells: s.cells, coverCells: s.coverCells, waterBodies: s.waterBodies, estimateEast: s.estimateEast,
    }];
  }));
  return makeBlock({
    kind: 'ages',
    licence: 'CC-BY-SA-4.0',
    notice: `The five ice-age maps of Grind Strat (about 10,000, 9,500, 8,500, 7,500 and 5,000 BC): water and ice on a 1 km grid, land cover on a 2 km grid, with the east hatched "no model yet" for the four oldest. Rough previews made by rules from the open data below, not measurements. Shared under CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0/). ${await madeFrom([...AGES_SOURCES])}`,
    sources: [...AGES_SOURCES],
    meta: {
      grid: { cols: summary.grid.cols, rows: summary.grid.rows, cell: summary.grid.cell },
      coverGrid: { cols: Math.ceil(summary.grid.cols / 2), rows: Math.ceil(summary.grid.rows / 2), cell: summary.grid.cell * 2 },
      ages: AGE_BUILDS.map((a) => ({ id: a.id, year: a.year, stage: a.stage })),
      labels: LABELS,
      sguDomain: summary.sguDomain,
      // No web addresses in a block (the game page carries none): hashes and names only.
      dated1: { zipSha256: summary.dated1.zipSha256, files: summary.dated1.files, slice: summary.dated1.slice },
      pollen: summary.pollen,
      built,
      params: summary.params,
      paramsSha256: summary.paramsSha256,
    },
    layers,
  });
}

async function main() {
  const block = await packAges();
  if (!block) { console.log('no ice-age layers here (npm run map:ages): the committed block is left as it is'); return; }
  const text = await writeBlock(AGES_BLOCK, block);
  console.log(`${AGES_BLOCK}: ${(text.length / 1024).toFixed(1)} KB`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => { console.error(err instanceof Error ? err.stack : err); process.exit(1); });
}

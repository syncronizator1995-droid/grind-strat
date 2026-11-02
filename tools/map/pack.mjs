// @ts-check
// Packs the derived map data into the game's committed data blocks, one per licence:
//   src/data/map/base.json            public domain: land and coast, heights and sea depths
//   src/data/by-sa/terrain-1219.json  CC BY-SA 4.0: the land around 1219, from the grid that
//                                     npm run map:terrain builds (refused if it is stale)
//   src/data/by-sa/terrain-time.json  CC BY-SA 4.0: how the land changes from 1219 to 2021, from
//                                     the planes npm run map:terrain-time builds
//   src/data/odbl/water.json          ODbL 1.0: OpenStreetMap rivers and lakes (read through
//                                     Overture), from data/raw/derived/water-osm.json, which
//                                     npm run map:water builds; without it (M2's way),
//   src/data/map/water-ne.json        public domain: Natural Earth rivers and lakes, the lakes of
//                                     1219 from tools/map/ne-water-1219.json. Never both: the
//                                     OSMF asks that OSM's rivers and lakes are not drawn in one
//                                     layer with another source's.
//   src/data/by/coast.json            CC BY 4.0: the northern coast over time, from the field
//                                     that npm run map:coast builds (refused if it is stale)
//   src/data/by-sa/terrain-ad1.json   CC BY-SA 4.0: the land of AD 1 and how it changes to 1219 (M3b), from
//                                     the plane npm run map:terrain-ad1 builds; late, read before 1219 only
//   src/data/by/coast-ad1.json        CC BY 4.0: the AD 1 coast (M3b), from npm run map:coast-ad1; late
//   src/data/own/changes.json         our own work, under the game's own terms: the dated facts and
//                                     drawn shapes of the map over time (tools/map/pack-changes.mjs)
//   src/data/own/names.json           our own work: the names of rivers, lakes and seas over time
//                                     (tools/map/pack-names.mjs; needs the water block above)
//   src/data/own/age-notes.json       our own work: the five notes of the ice-age maps
//                                     (tools/map/pack-age-notes.mjs)
// and records their fingerprints in src/data/fingerprints.json.
//   node tools/map/pack.mjs     (npm run map:pack also rewrites the credits)
// Needs the derived grids (npm run map:grids) and the Natural Earth files (node tools/map/fetch.mjs).

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, writeBlock, writeFingerprints } from './block.mjs';
import { packBase } from './pack-base.mjs';
import { COAST_BLOCK, packCoast } from './pack-coast.mjs';
import { CHANGES_BLOCK, packChanges } from './pack-changes.mjs';
import { COAST_AD1_BLOCK, packCoastAd1 } from './pack-coast-ad1.mjs';
import { AGE_NOTES_BLOCK, packAgeNotes } from './pack-age-notes.mjs';
import { NAMES_BLOCK, packNames } from './pack-names.mjs';
import { packTerrain } from './pack-terrain.mjs';
import { AD1_BLOCK, packTerrainAd1 } from './pack-terrain-ad1.mjs';
import { packTerrainTime, TIME_BLOCK } from './pack-terrain-time.mjs';
import { packWater } from './pack-water.mjs';

/** @param {number} bytes */
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function main() {
  const written = [];
  written.push({ path: 'src/data/map/base.json', text: await writeBlock('src/data/map/base.json', await packBase()) });
  written.push({ path: 'src/data/by-sa/terrain-1219.json', text: await writeBlock('src/data/by-sa/terrain-1219.json', await packTerrain()) });
  const water = await packWater();
  written.push({ path: water.path, text: await writeBlock(water.path, water.block) });
  // Once the OpenStreetMap water is in, the Natural Earth water must not linger next to it.
  if (water.path !== 'src/data/map/water-ne.json') await rm(join(ROOT, 'src/data/map/water-ne.json'), { force: true });
  // The land over time: left as it is where its planes were never built (npm run map:terrain-time).
  const time = await packTerrainTime();
  if (time) written.push({ path: TIME_BLOCK, text: await writeBlock(TIME_BLOCK, time) });
  // M3b's AD 1 lead-in blocks: left as they are where their fields were never built.
  const ad1 = await packTerrainAd1();
  if (ad1) written.push({ path: AD1_BLOCK, text: await writeBlock(AD1_BLOCK, ad1) });
  const coastAd1 = await packCoastAd1();
  if (coastAd1) written.push({ path: COAST_AD1_BLOCK, text: await writeBlock(COAST_AD1_BLOCK, coastAd1) });
  written.push({ path: COAST_BLOCK, text: await writeBlock(COAST_BLOCK, await packCoast()) });
  written.push({ path: CHANGES_BLOCK, text: await writeBlock(CHANGES_BLOCK, await packChanges()) });
  written.push({ path: NAMES_BLOCK, text: await writeBlock(NAMES_BLOCK, await packNames()) });
  written.push({ path: AGE_NOTES_BLOCK, text: await writeBlock(AGE_NOTES_BLOCK, await packAgeNotes()) });
  await writeFingerprints();
  for (const w of written) {
    const block = JSON.parse(w.text);
    console.log(`${w.path}: ${kb(w.text.length)}${block.interim ? ' (INTERIM: the strict build refuses it)' : ''}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

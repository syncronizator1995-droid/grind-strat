// @ts-check
// Packs the derived map data into the game's committed data blocks, one per licence:
//   src/data/map/base.json            public domain: land and coast, heights and sea depths
//   src/data/by-sa/terrain-1219.json  CC BY-SA 4.0: the land around 1219, from the grid that
//                                     npm run map:terrain builds (refused if it is stale)
//   src/data/map/water-ne.json        public domain: Natural Earth rivers and lakes (M2), the
//                                     lakes of 1219 from tools/map/ne-water-1219.json; or, once
//                                     data/raw/derived/water-osm.json exists (next milestone),
//   src/data/odbl/water.json          ODbL 1.0: OpenStreetMap rivers and lakes
// and records their fingerprints in src/data/fingerprints.json.
//   node tools/map/pack.mjs     (npm run map:pack also rewrites the credits)
// Needs the derived grids (npm run map:grids) and the Natural Earth files (node tools/map/fetch.mjs).

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, writeBlock, writeFingerprints } from './block.mjs';
import { packBase } from './pack-base.mjs';
import { packTerrain } from './pack-terrain.mjs';
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

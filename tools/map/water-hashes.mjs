// @ts-check
// Fingerprints of the water the map shows at one date, feature by feature, so a test can say
// "the 1219 rivers and lakes are the same as M2b's, apart from the planned fixes" without
// keeping any OpenStreetMap content outside the ODbL folders: only SHA-256 hashes are stored
// (test/fixtures/water-1219-hashes.json), never names, ids or points.
//
//   node tools/map/water-hashes.mjs <water block> <out.json>   writes the fixture from a block
//
// A feature's key is the hash of what names it (kind, shown name, Wikidata id, size); its value
// is the hash of its shapes at every level and its stretch names. Two features with the same key
// keep a sorted list of values.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { decodeShapes, decodeUints, unbundleBlocks } from '../../src/ui/map/codec.js';

/** @param {string} text */
const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

/**
 * The layers of a packed block, synchronously (Node only: tools and tests).
 * @param {{ bundle: string }} block
 * @returns {Record<string, Uint8Array>}
 */
export function blockLayers(block) {
  return unbundleBlocks(new Uint8Array(inflateSync(Buffer.from(block.bundle, 'base64'))));
}

/**
 * The water of a block, decoded, with its date tags (all 0 for a block made before M3a).
 * @param {{ bundle: string }} block
 */
export function decodeWater(block) {
  const layers = blockLayers(block);
  const info = JSON.parse(new TextDecoder().decode(layers.info));
  const rivers = decodeShapes(layers.rivers);
  const lakes = decodeShapes(layers.lakes);
  const riverOf = decodeUints(layers.riverOf);
  const lakeOf = decodeUints(layers.lakeOf);
  const lineName = layers.riverLineName ? decodeUints(layers.riverLineName) : new Uint32Array(rivers.length);
  return {
    rivers, riverLevels: layers.riverLevels, riverOf, lineName,
    lakes, lakeLevels: layers.lakeLevels, lakeOf,
    /** @type {any[]} */ riverInfo: info.riverInfo,
    /** @type {any[]} */ lakeInfo: info.lakeInfo,
    /** @type {string[]} */ lineNames: info.riverLineNames ?? [''],
    lineTag: layers.riverTag ? decodeUints(layers.riverTag) : new Uint32Array(rivers.length),
    lakeTag: layers.lakeTag ? decodeUints(layers.lakeTag) : new Uint32Array(info.lakeInfo.length),
    /** @type {string[]} */ tags: info.tags ?? [''],
  };
}

/** @typedef {ReturnType<typeof decodeWater>} DecodedWater */

/**
 * The hashes of the features shown when only the tags in `on` are on (tag 0 always is).
 * A river counts with its shown lines only, so a river with a dated stretch changes its hash
 * where that stretch is off; a lake is shown or not as a whole.
 * @param {DecodedWater} w
 * @param {(tag: number) => boolean} [on] default: only tag 0
 * @returns {{ rivers: Record<string, string[]>, lakes: Record<string, string[]>, keyOf: { rivers: string[], lakes: string[] } }}
 */
export function waterHashes(w, on = (t) => t === 0) {
  /** @type {string[][]} */
  const riverParts = w.riverInfo.map(() => []);
  let at = 0;
  w.rivers.forEach((line, k) => {
    const n = line.length / 2;
    if (on(w.lineTag[k])) riverParts[w.riverOf[k]].push(`${w.lineNames[w.lineName[k]] ?? ''}:${line.join(',')}:${w.riverLevels.subarray(at, at + n).join('')}`);
    at += n;
  });
  /** @type {string[][]} */
  const lakeParts = w.lakeInfo.map(() => []);
  at = 0;
  w.lakes.forEach((ring, k) => {
    const n = ring.length / 2;
    lakeParts[w.lakeOf[k]].push(`${ring.join(',')}:${w.lakeLevels.subarray(at, at + n).join('')}`);
    at += n;
  });
  const keyOf = {
    rivers: w.riverInfo.map((r) => sha(`river|${r.name}|${r.wikidata}|${r.lengthKm}`)),
    lakes: w.lakeInfo.map((l) => sha(`lake|${l.name}|${l.wikidata}|${l.areaKm2}`)),
  };
  /** @type {Record<string, string[]>} */ const rivers = {};
  /** @type {Record<string, string[]>} */ const lakes = {};
  riverParts.forEach((parts, k) => {
    if (!parts.length) return;
    (rivers[keyOf.rivers[k]] ??= []).push(sha(parts.join('|')));
  });
  lakeParts.forEach((parts, k) => {
    if (!parts.length || !on(w.lakeTag[k])) return;
    (lakes[keyOf.lakes[k]] ??= []).push(sha(`${w.lakeInfo[k].at.join(',')}|${parts.join('|')}`));
  });
  for (const list of [...Object.values(rivers), ...Object.values(lakes)]) list.sort();
  return { rivers, lakes, keyOf };
}

async function main() {
  const [from, out] = process.argv.slice(2);
  if (!from || !out) throw new Error('usage: node tools/map/water-hashes.mjs <water block> <out.json>');
  const text = await readFile(from, 'utf8');
  const { rivers, lakes } = waterHashes(decodeWater(JSON.parse(text)));
  const fixture = {
    about: 'Fingerprints of the rivers and lakes the map showed at 1219 in M2b (src/data/odbl/water.json before M3a), made by tools/map/water-hashes.mjs. Hashes only, so no OpenStreetMap content leaves the ODbL folders. test/map-changes.test.js compares the 1219 water with them.',
    block: sha(text),
    rivers,
    lakes,
  };
  await writeFile(out, `${JSON.stringify(fixture, null, 0)}\n`);
  console.log(`${out}: ${Object.keys(rivers).length} river keys, ${Object.keys(lakes).length} lake keys`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

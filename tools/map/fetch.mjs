// @ts-check
// Downloads the raw map data listed in tools/map/sources.json into data/raw/ (git ignores it),
// and records in data/raw/manifest.json where each file came from, when, and its SHA-256
// fingerprint. Files already present with the recorded fingerprint are skipped. Big rasters
// (access "range") are not downloaded here: tools/map/build-grids.mjs reads just the parts it
// needs, through tools/map/fetch-grids.mjs. Their small extra files (licences, legends) are.
//   node tools/map/fetch.mjs            fetch everything
//   node tools/map/fetch.mjs ne-land    fetch one source by id

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureProxy, fetchWhole, loadManifest, RAW, sha256 } from './fetch-grids.mjs';

export { RAW };
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * @typedef {object} Credit what the in-game Credits screen shows
 * @property {string} line @property {string} citation @property {string} changes
 * @property {string} licenceName @property {string} licenceUri without "https://"
 * @property {string[]} [notes]
 * @property {string} [groupVersion] @property {string} [groupLine] the version and line of the one entry
 *   that several sources sharing a citation get (SpatioCompo's four time windows); line stays each
 *   source's own, as the blocks' notices quote it
 *
 * @typedef {object} RawSource
 * @property {string} id @property {string} collection @property {string} url @property {string} file
 * @property {string} what @property {string} licence @property {string} licenceUrl
 * @property {'read' | 'unverified'} licenceStatus
 * @property {'whole' | 'range' | 'overpass' | 'overture' | 'gpkg' | 'own'} [access] 'overpass' and 'overture': OpenStreetMap data,
 *   fetched by tools/map/fetch-osm.mjs and tools/map/fetch-overture.mjs; 'gpkg': SGU's shore model, fetched by
 *   tools/map/build-coast.mjs once its host is allowed; 'own': our own work in the repository, nothing to fetch
 * @property {number} [maxRangeBytes] the largest single range request this host takes well
 * @property {{ url: string, what: string, maxRangeBytes?: number }} [fallback] a second copy of the same
 *   file, used only if the main url is gone; tools/map/compare-gebco.mjs checks they agree
 * @property {{ name: string, url: string, file: string }[]} [files]
 * @property {string} [licenceReadAt] @property {string | null} [licenceQuote]
 * @property {string | null} [unofficialCopy] @property {string[]} [toCheck]
 * @property {Credit} credit
 */

/** @returns {Promise<RawSource[]>} */
export async function rawSources() {
  return JSON.parse(await readFile(join(ROOT, 'tools', 'map', 'sources.json'), 'utf8')).sources;
}

/** @returns {Promise<Record<string, { sha256?: string, bytes?: number, fetched: string, url: string }>>} */
export async function readManifest() {
  return loadManifest();
}

/**
 * Reads a fetched raw file, checking it is the one recorded in the manifest.
 * @param {string} id a source id
 * @param {string} [name] one of the source's extra files, instead of its main file
 */
export async function readRaw(id, name) {
  const source = (await rawSources()).find((s) => s.id === id);
  if (!source) throw new Error(`unknown raw source: ${id}`);
  const extra = name ? source.files?.find((f) => f.name === name) : null;
  if (name && !extra) throw new Error(`${id} has no extra file ${name}`);
  const key = extra ? `${id}/${extra.name}` : id;
  const entry = (await readManifest())[key];
  if (!entry) throw new Error(`${key} has not been fetched: run node tools/map/fetch.mjs ${id}`);
  const data = await readFile(join(RAW, extra ? extra.file : source.file));
  if (sha256(data) !== entry.sha256) throw new Error(`${key} changed since it was fetched: fetch it again`);
  return { source, data };
}

async function main() {
  ensureProxy();
  const wanted = process.argv.slice(2);
  const sources = (await rawSources()).filter((s) => !wanted.length || wanted.includes(s.id));
  if (wanted.length && sources.length !== wanted.length) throw new Error(`unknown source id in: ${wanted.join(', ')}`);
  for (const s of sources) {
    if (s.access === 'own') { console.log(`skip  ${s.id}: our own work, in the repository`); continue; }
    // Sources with their own reader (OpenStreetMap water) are fetched by that tool, not here.
    if (s.access && s.access !== 'whole' && s.access !== 'range') { console.log(`skip  ${s.id}: fetched by its own tool`); continue; }
    if (s.access !== 'range') await fetchWhole(s.id, s.url, s.file);
    for (const f of s.files ?? []) await fetchWhole(`${s.id}/${f.name}`, f.url, f.file);
    console.log(`have  ${s.id} (licence ${s.licenceStatus})`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

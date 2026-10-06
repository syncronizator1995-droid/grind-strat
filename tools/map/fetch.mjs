// @ts-check
// Downloads the raw map data listed in tools/map/sources.json into data/raw/ (git ignores it),
// and records in data/raw/manifest.json where each file came from, when, its SHA-256 fingerprint
// and whether its licence has been read. Files already present with the recorded fingerprint are
// skipped.
//   node tools/map/fetch.mjs            fetch everything
//   node tools/map/fetch.mjs ne-land    fetch one source by id

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const RAW = join(ROOT, 'data', 'raw');
const MANIFEST = join(RAW, 'manifest.json');

/**
 * @typedef {{ id: string, collection: string, url: string, file: string, what: string,
 *   licence: string, licenceUrl: string, licenceStatus: 'read' | 'unverified' }} RawSource
 */

/** @returns {Promise<RawSource[]>} */
export async function rawSources() {
  return JSON.parse(await readFile(join(ROOT, 'tools', 'map', 'sources.json'), 'utf8')).sources;
}

/** @returns {Promise<Record<string, { sha256: string, bytes: number, fetched: string, url: string }>>} */
export async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {
    return {};
  }
}

/** @param {Buffer} data */
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/**
 * Reads a fetched raw file, checking it is the one recorded in the manifest.
 * @param {string} id
 */
export async function readRaw(id) {
  const source = (await rawSources()).find((s) => s.id === id);
  if (!source) throw new Error(`unknown raw source: ${id}`);
  const entry = (await readManifest())[id];
  if (!entry) throw new Error(`${id} has not been fetched: run node tools/map/fetch.mjs ${id}`);
  const data = await readFile(join(RAW, source.file));
  if (sha256(data) !== entry.sha256) throw new Error(`${id} changed since it was fetched: fetch it again`);
  return { source, data };
}

async function main() {
  const wanted = process.argv.slice(2);
  const sources = (await rawSources()).filter((s) => !wanted.length || wanted.includes(s.id));
  if (wanted.length && sources.length !== wanted.length) throw new Error(`unknown source id in: ${wanted.join(', ')}`);
  const manifest = await readManifest();
  for (const s of sources) {
    const path = join(RAW, s.file);
    try {
      if (manifest[s.id] && sha256(await readFile(path)) === manifest[s.id].sha256) {
        console.log(`have  ${s.id}`);
        continue;
      }
    } catch {
      // not downloaded yet
    }
    const response = await fetch(s.url);
    if (!response.ok) throw new Error(`${s.id}: ${response.status} ${response.statusText} from ${s.url}`);
    const data = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    manifest[s.id] = { sha256: sha256(data), bytes: data.length, fetched: new Date().toISOString(), url: s.url };
    await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`got   ${s.id} (${(data.length / 1048576).toFixed(1)} MB, licence ${s.licenceStatus})`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

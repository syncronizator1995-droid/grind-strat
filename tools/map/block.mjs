// @ts-check
// The game's data blocks: committed JSON files, one per licence, that the build inlines into the
// game page as <script type="application/json" id="gs-<kind>">. Each block says what licence its
// contents are under and which sources (ids in tools/map/sources.json) it was made from, so the
// build can refuse a block whose licence was never read, and the credits come from one place.
//
//   { kind, format: 1, licence, notice, sources, interim?, meta, ...extra, bundle }
//
// bundle is the base64 text of the deflated bundleBlocks(...) of the block's layers
// (src/ui/map/codec.js). Writing a block is deterministic: the same inputs give the same bytes.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { bundleBlocks } from '../../src/ui/map/codec.js';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const FINGERPRINTS = 'src/data/fingerprints.json';
export const BLOCK_FORMAT = 1;

/**
 * Every block the pack tool can write, by kind, in the order the build inlines them. A kind with
 * several files ships the first one that exists: the OpenStreetMap water once it has been built,
 * until then the interim Natural Earth water.
 */
export const BLOCK_FILES = Object.freeze({
  base: ['src/data/map/base.json'],
  terrain: ['src/data/by-sa/terrain-1219.json'],
  water: ['src/data/odbl/water.json', 'src/data/map/water-ne.json'],
});

/**
 * @typedef {object} Block
 * @property {string} kind @property {number} format @property {string} licence
 * @property {string} notice plain text; addresses without "https://" (the build forbids them)
 * @property {string[]} sources ids in tools/map/sources.json
 * @property {true} [interim] a stand-in the strict build refuses to ship
 * @property {Record<string, unknown>} meta
 * @property {string} bundle
 */

/**
 * Problems with a notice: the game page must not contain web addresses with a scheme or "//".
 * @param {string} text
 * @returns {string[]}
 */
export function noticeProblems(text) {
  return /\/\//.test(text) ? [`the notice contains "//": write addresses like openstreetmap.org/copyright`] : [];
}

/**
 * Makes a block. The layers are bundled and deflated into one base64 text.
 * @param {{ kind: string, licence: string, notice: string, sources: string[], interim?: boolean,
 *   meta: Record<string, unknown>, layers: Record<string, Uint8Array>, extra?: Record<string, unknown> }} spec
 * @returns {Block}
 */
export function makeBlock({ kind, licence, notice, sources, interim = false, meta, layers, extra = {} }) {
  const problems = noticeProblems(notice);
  if (problems.length) throw new Error(`${kind}: ${problems.join('; ')}`);
  const packed = deflateSync(bundleBlocks(layers), { level: 9 }).toString('base64');
  return /** @type {Block} */ ({
    kind, format: BLOCK_FORMAT, licence, notice, sources: [...sources],
    ...(interim ? { interim: true } : {}),
    meta, ...extra, bundle: packed,
  });
}

/** @param {Block} block */
export const blockText = (block) => `${JSON.stringify(block)}\n`;

/** @param {string} text */
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * Writes a block under the repository root.
 * @param {string} path relative to the repository root
 * @param {Block} block
 * @returns {Promise<string>} the text written
 */
export async function writeBlock(path, block) {
  const text = blockText(block);
  await mkdir(dirname(join(ROOT, path)), { recursive: true });
  await writeFile(join(ROOT, path), text);
  return text;
}

/**
 * The block files the game ships, in build order: one per kind, the first that exists.
 * @param {string} [root]
 * @returns {{ kind: string, path: string }[]}
 */
export function shippedBlockFiles(root = ROOT) {
  return Object.entries(BLOCK_FILES).flatMap(([kind, paths]) => {
    const path = paths.find((p) => existsSync(join(root, p)));
    return path ? [{ kind, path }] : [];
  });
}

/**
 * Every block file present, shipped or not (fingerprints cover them all).
 * @param {string} [root]
 */
export function presentBlockFiles(root = ROOT) {
  return Object.values(BLOCK_FILES).flat().filter((p) => existsSync(join(root, p)));
}

/**
 * Records the SHA-256 of every block present, so tests can tell none was edited by hand.
 * @returns {Promise<Record<string, string>>}
 */
export async function writeFingerprints() {
  /** @type {Record<string, string>} */
  const prints = {};
  for (const path of presentBlockFiles().sort()) prints[path] = sha256(await readFile(join(ROOT, path), 'utf8'));
  await writeFile(join(ROOT, FINGERPRINTS), `${JSON.stringify(prints, null, 2)}\n`);
  return prints;
}

// @ts-check
// Shared helpers for the grid builders: open a remote GeoTIFF through the cached range source,
// read the part of it that covers a lon/lat box, and describe what was read for a sidecar.

import { createHash } from 'node:crypto';
import { loadManifest, rangeSource } from './fetch-grids.mjs';
import { rawSources } from './fetch.mjs';
import { openTiff } from './tiff.mjs';

/** @typedef {{ west: number, east: number, south: number, north: number }} Box */

/**
 * The sources.json entry for an id.
 * @param {string} id
 */
export async function sourceEntry(id) {
  const s = (await rawSources()).find((x) => x.id === id);
  if (!s) throw new Error(`unknown raw source: ${id}`);
  return s;
}

/**
 * Opens a remote GeoTIFF read by range, or null if the host has no such file.
 * @param {string} key manifest key @param {string} url
 * @param {{ maxChunk?: number }} [opts] passed on to rangeSource (the largest single request)
 */
export async function openRemoteTiff(key, url, opts) {
  const source = await rangeSource(key, url, opts);
  if (!source) return null;
  return { key, url, tiff: await openTiff(source) };
}

/**
 * Reads the pixels of one image that cover a lon/lat box, with `pad` extra pixels all round so
 * interpolation at the box edge has neighbours. Returns a Raster (see resample.mjs).
 * @param {Awaited<ReturnType<typeof openTiff>>} tiff
 * @param {import('./tiff.mjs').TiffImage} image @param {Box} box @param {number} [pad]
 */
export async function readBox(tiff, image, box, pad = 2) {
  const g = image.geo;
  if (!g) throw new Error('image has no GeoTIFF grid');
  const dy = -g.dy; // degrees per row, going south
  const x0 = Math.max(0, Math.floor((box.west - g.west) / g.dx) - pad);
  const x1 = Math.min(image.width, Math.ceil((box.east - g.west) / g.dx) + pad);
  const y0 = Math.max(0, Math.floor((g.north - box.north) / dy) - pad);
  const y1 = Math.min(image.height, Math.ceil((g.north - box.south) / dy) + pad);
  const values = await tiff.readWindow(image, x0, y0, x1 - x0, y1 - y0);
  return { values, width: x1 - x0, height: y1 - y0, west: g.west + x0 * g.dx, north: g.north - y0 * dy, dx: g.dx, dy, noData: image.noData };
}

/**
 * SHA-256 of int16 samples as little-endian bytes (the same on any machine), so a pixel window
 * read from two differently packed files (tiled and compressed, or plain strips) can be compared.
 * @param {Int16Array} v
 */
export function int16Hash(v) {
  const bytes = new Uint8Array(v.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < v.length; i++) view.setInt16(i * 2, v[i], true);
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * What a sidecar says about one input file: its url, version, and a SHA-256. For a file read by
 * range it is the SHA-256 of the sorted list of its cached windows' SHA-256s (the whole file was
 * never downloaded, so it has no whole-file hash).
 * @param {string} key manifest key
 */
export async function inputRecord(key) {
  const e = (await loadManifest())[key];
  if (!e) throw new Error(`${key} is not in the manifest`);
  if (e.sha256) return { url: e.url, sha256: e.sha256 };
  const list = Object.entries(e.windows ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} ${v}`).join('\n');
  return {
    url: e.url,
    ...(e.versionId ? { versionId: e.versionId } : {}),
    ...(e.etag ? { etag: e.etag } : {}),
    bytes: e.bytes,
    sha256: createHash('sha256').update(list).digest('hex'),
    sha256Of: 'the cached windows (manifest.json lists each one)',
  };
}

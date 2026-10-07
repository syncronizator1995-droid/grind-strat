// @ts-check
// Checks the GEBCO_2026 heights against a second copy, cell by cell, over the window the map
// reads. The official tile on dap.ceda.ac.uk (BODC/CEDA, GEBCO's own distributor) is the source
// of record; the cloud-optimised copy on AWS (Source Cooperative) is the fallback. Run this once
// after either changes: if any cell differs, the fallback must not be used.
//   node tools/map/compare-gebco.mjs
// Both reads go through the window cache, so a second run downloads nothing. Each read's pixel
// window is hashed (SHA-256 of its int16 samples, little-endian) and the hash is kept in
// data/raw/manifest.json under the file's entry ("pixelWindows").

import { fileURLToPath } from 'node:url';
import { MARGIN } from './build-grids.mjs';
import { ensureProxy, loadManifest, saveManifest, traffic } from './fetch-grids.mjs';
import { gebcoKey } from './grid-heights.mjs';
import { int16Hash, openRemoteTiff, readBox, sourceEntry } from './grid-sources.mjs';
import { mapWindow } from './resample.mjs';

/**
 * Reads the map window from one GEBCO file.
 * @param {string} url @param {number} [maxChunk]
 */
async function readCopy(url, maxChunk) {
  const key = gebcoKey(url);
  const remote = await openRemoteTiff(key, url, { maxChunk });
  if (!remote) throw new Error(`GEBCO is missing at ${url}`);
  const image = remote.tiff.images[0];
  const raster = await readBox(remote.tiff, image, mapWindow(MARGIN));
  if (!(raster.values instanceof Int16Array)) throw new Error(`${url}: expected int16 heights`);
  const g = /** @type {import('./tiff.mjs').GeoGrid} */ (image.geo);
  // Which pixels of the file were read: the same lon/lat box gives different pixel numbers in a
  // global file and in a 90 x 90 degree tile.
  const x0 = Math.round((raster.west - g.west) / g.dx);
  const y0 = Math.round((g.north - raster.north) / raster.dy);
  return { key, url, raster, values: raster.values, pixels: { x0, y0, width: raster.width, height: raster.height }, file: image };
}

/**
 * Compares two rasters over the cells they share, matching cells by lon/lat.
 * @param {import('./resample.mjs').Raster} a @param {import('./resample.mjs').Raster} b
 */
export function compareRasters(a, b) {
  if (Math.abs(a.dx - b.dx) > 1e-12 || Math.abs(a.dy - b.dy) > 1e-12) throw new Error('the two copies have different pixel sizes');
  // b's pixel (x, y) is a's pixel (x + ox, y + oy).
  const ox = Math.round((b.west - a.west) / a.dx);
  const oy = Math.round((a.north - b.north) / a.dy);
  let compared = 0; let differing = 0; let maxDiff = 0;
  /** @type {Map<number, number>} */
  const byDiff = new Map();
  /** @type {{ x: number, y: number, a: number, b: number }[]} */
  const examples = [];
  for (let y = 0; y < b.height; y++) {
    const ay = y + oy;
    if (ay < 0 || ay >= a.height) continue;
    for (let x = 0; x < b.width; x++) {
      const ax = x + ox;
      if (ax < 0 || ax >= a.width) continue;
      const va = a.values[ay * a.width + ax];
      const vb = b.values[y * b.width + x];
      compared++;
      if (va === vb) continue;
      differing++;
      const d = Math.abs(va - vb);
      maxDiff = Math.max(maxDiff, d);
      byDiff.set(d, (byDiff.get(d) ?? 0) + 1);
      if (examples.length < 20) examples.push({ x: ax, y: ay, a: va, b: vb });
    }
  }
  return { compared, differing, maxDiff, byDiff: [...byDiff].sort((p, q) => p[0] - q[0]), examples, offset: { ox, oy } };
}

async function main() {
  ensureProxy();
  const src = await sourceEntry('gebco-2026');
  if (!src.fallback) throw new Error('gebco-2026 has no fallback copy to compare with');
  const official = await readCopy(src.url, src.maxRangeBytes);
  const copy = await readCopy(src.fallback.url, src.fallback.maxRangeBytes);
  const result = compareRasters(official.raster, copy.raster);
  const m = await loadManifest();
  for (const c of [official, copy]) {
    const { x0, y0, width, height } = c.pixels;
    const hash = int16Hash(c.values);
    const entry = /** @type {import('./fetch-grids.mjs').ManifestEntry} */ (m[c.key]);
    entry.pixelWindows = { ...entry.pixelWindows, [`x${x0}+y${y0} ${width}x${height}`]: hash };
    console.log(`${c.url}\n  pixels x ${x0}-${x0 + width - 1}, y ${y0}-${y0 + height - 1} (${width} x ${height}); ` +
      `west ${c.raster.west.toFixed(6)}, north ${c.raster.north.toFixed(6)}\n  sha256 of the int16 samples ${hash}`);
  }
  await saveManifest();
  console.log(`\ncompared ${result.compared} cells: ${result.differing} differ, largest difference ${result.maxDiff} m`);
  if (result.differing) {
    console.log(`differences by size (m: cells): ${result.byDiff.map(([d, n]) => `${d}: ${n}`).join(', ')}`);
    for (const e of result.examples) console.log(`  official pixel x ${e.x + official.pixels.x0}, y ${e.y + official.pixels.y0}: official ${e.a} m, copy ${e.b} m`);
  }
  console.log(`downloaded ${(traffic.bytes / 1048576).toFixed(1)} MB in ${traffic.requests} requests this run.`);
  process.exitCode = result.differing ? 2 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

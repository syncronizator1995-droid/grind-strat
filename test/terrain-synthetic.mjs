// @ts-check
// A made-up 3 x 3 degree world for the terrain tests, the same one test/map-terrain.test.js builds:
// test/map-terrain-time.test.js uses it to cut later anchors, and to prove that splitting the
// 1219 rules into prepare and cut left their output byte for byte the same.
import { hash01, valueNoise } from '../tools/map/terrain-fields.mjs';

/**
 * A made-up 3 x 3 degree world on a flat lon/lat grid, 40 cells per degree: a strip of sea in the
 * west, today's land cover from hashed blobs, a marsh patch, a dune strip, a lake today, and a
 * pollen map whose forest share changes a lot from square to square.
 */
export function syntheticInput() {
  const per = 40;
  const cols = 3 * per;
  const rows = 3 * per;
  const n = cols * rows;
  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  const land = new Uint8Array(n);
  const mk = () => new Uint8Array(n);
  const cover = { tree: mk(), crop: mk(), built: mk(), bare: mk(), moss: mk(), water: mk() };
  const marsh = mk();
  const marshRaw = mk();
  const rivers = mk();
  const lakes = mk();
  const height = new Float32Array(n);
  const rough = new Float32Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      lon[i] = 20 + (c + 0.5) / per;
      lat[i] = 54 + (r + 0.5) / per;
      land[i] = c >= 6 ? 1 : 0;
      // Round blobs (smooth value noise), so any seam the test finds comes from the rules, not
      // from the made-up inputs. Square blobs would not do: their straight edges fell one cell
      // from the 1 degree lines, and once the rules smooth the score, they show.
      const blob = valueNoise(c + 3, r + 5, 7, 7);
      cover.tree[i] = Math.round(100 * blob * hash01(c, r, 1));
      cover.crop[i] = Math.round((100 - cover.tree[i]) * hash01(c, r, 2));
      if (c >= 6 && c < 8) cover.bare[i] = 60; // a dune strip on the coast
      if (c >= 60 && c < 70 && r >= 60 && r < 70) marsh[i] = 80;
      if (c >= 90 && c < 100 && r >= 20 && r < 30) cover.water[i] = 100; // a lake today
      marshRaw[i] = Math.round(30 * hash01(c, r, 3));
      height[i] = 200 * valueNoise(c + 5, r + 2, 13, 4);
      rough[i] = 20 * valueNoise(c + 5, r + 2, 13, 5);
      if (r === 75) rivers[i] = 1;
    }
  }
  /** @type {import('../tools/map/pollen-field.mjs').PollenCell[]} */
  const pollen = [];
  const forest = [[0.35, 0.8, 0.55], [0.7, 0.45, 0.8], [0.5, 0.65, 0.4]];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const f = forest[y][x];
      const k = 0.2 + 0.2 * ((x + y) % 3);
      pollen.push({ lon: 20.5 + x, lat: 54.5 + y, conifer: f * k, broadleaf: f * (1 - k), open: 1 - f });
    }
  }
  return { cols, rows, cellKm: 1, lon, lat, land, rivers, lakes, cover, marsh, marshRaw, height, rough, pollen };
}

// @ts-check
// Draws PNG pictures of the derived grids, with the Natural Earth coastline over them, so a
// person can check them by eye: seams, stripes, flipped rows, empty corners, or data that does
// not sit on the coast.
//   node tools/map/preview-grids.mjs [out-dir]     (default data/raw/derived/previews)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRaw } from './fetch.mjs';
import { clipRing, featuresIn, fillRings, openRing, project } from './geo.mjs';
import { COVER_PLANES } from './grid-cover.mjs';
import { encodePng } from './png.mjs';
import { DERIVED, GRID_1KM, GRID_2KM } from './resample.mjs';
import { MAP } from './projection.mjs';

/** @typedef {[number, number, number]} RGB */

/**
 * Natural Earth land (lakes cut out) on the 1 km grid: 1 land, 0 sea or lake.
 * @returns {Promise<Uint8Array>}
 */
async function landMask() {
  const { cols, rows, cell } = GRID_1KM;
  const mask = new Uint8Array(cols * rows);
  for (const [id, value] of /** @type {const} */ ([['ne-land', 1], ['ne-lakes', 0]])) {
    const geo = JSON.parse((await readRaw(id)).data.toString('utf8'));
    /** @type {number[][]} */ const rings = [];
    for (const f of featuresIn(geo, 'polygon')) {
      if (id === 'ne-lakes' && String(f.props.featurecla).toLowerCase().includes('reservoir')) continue;
      for (const part of f.parts) {
        const ring = clipRing(openRing(project(part)), cols * cell, rows * cell);
        if (ring.length) rings.push(ring);
      }
    }
    fillRings(mask, cols, rows, cell, rings, value);
  }
  return mask;
}

/** Cells on the coast: land with water beside it, or water with land beside it. @param {Uint8Array} mask */
function coastOf(mask) {
  const { cols, rows } = GRID_1KM;
  const coast = new Uint8Array(mask.length);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!mask[i]) continue;
      if ((c > 0 && !mask[i - 1]) || (c < cols - 1 && !mask[i + 1]) || (r > 0 && !mask[i - cols]) || (r < rows - 1 && !mask[i + cols])) coast[i] = 1;
    }
  }
  return coast;
}

/**
 * Paints a picture of the 1 km grid: colour(i) for each cell, the coast on top, north up.
 * @param {(i: number) => RGB} colour @param {Uint8Array} coast @param {RGB} [coastColour]
 */
function paint(colour, coast, coastColour = [220, 20, 60]) {
  const { cols, rows } = GRID_1KM;
  const rgb = new Uint8Array(cols * rows * 3);
  for (let r = 0; r < rows; r++) {
    const y = rows - 1 - r; // picture rows go down from the north; grid rows go up from the south
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const px = coast[i] ? coastColour : colour(i);
      rgb.set(px, (y * cols + c) * 3);
    }
  }
  return { width: cols, height: rows, rgb };
}

/** Linear blend between colour stops at positions 0-1. @param {[number, RGB][]} stops @param {number} t @returns {RGB} */
function ramp(stops, t) {
  const x = Math.max(0, Math.min(1, t));
  for (let k = 1; k < stops.length; k++) {
    const [p1, c1] = stops[k];
    const [p0, c0] = stops[k - 1];
    if (x <= p1) {
      const u = (x - p0) / (p1 - p0 || 1);
      return /** @type {RGB} */ ([0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * u)));
    }
  }
  return stops[stops.length - 1][1];
}

const SHARE = /** @type {[number, RGB][]} */ ([[0, [250, 250, 245]], [0.25, [199, 233, 180]], [0.5, [65, 182, 196]], [0.75, [34, 94, 168]], [1, [8, 29, 88]]]);
const LAND = /** @type {[number, RGB][]} */ ([[0, [70, 140, 70]], [0.08, [140, 180, 90]], [0.2, [210, 200, 120]], [0.45, [170, 120, 70]], [0.75, [140, 110, 100]], [1, [250, 250, 250]]]);
const SEA = /** @type {[number, RGB][]} */ ([[0, [190, 225, 245]], [0.15, [110, 170, 220]], [0.5, [40, 90, 170]], [1, [10, 30, 90]]]);

/**
 * Heights with hill shade (light from the north-west) and a depth tint for the sea.
 * @param {Int16Array} h the 2 km grid @param {Uint8Array} coast
 */
function heightsPicture(h, coast) {
  const { cols, rows } = GRID_2KM;
  const at = (/** @type {number} */ c, /** @type {number} */ r) => h[Math.max(0, Math.min(rows - 1, r)) * cols + Math.max(0, Math.min(cols - 1, c))];
  const cellM = GRID_2KM.cell * MAP.unitMetres;
  const exaggerate = 8;
  const light = [-Math.SQRT1_2 * Math.cos(Math.PI / 4), Math.SQRT1_2 * Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)];
  return paint((i) => {
    // The 1 km cell's 2 km parent.
    const c1 = i % GRID_1KM.cols; const r1 = (i - c1) / GRID_1KM.cols;
    const c = Math.min(cols - 1, c1 >> 1); const r = Math.min(rows - 1, r1 >> 1);
    const v = at(c, r);
    if (v < 0) return ramp(SEA, -v / 400);
    const dzdx = ((at(c + 1, r) - at(c - 1, r)) * exaggerate) / (2 * cellM);
    const dzdy = ((at(c, r + 1) - at(c, r - 1)) * exaggerate) / (2 * cellM);
    const n = [-dzdx, -dzdy, 1];
    const len = Math.hypot(...n);
    const shade = Math.max(0.35, (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / len);
    const base = ramp(LAND, Math.sqrt(v / 1600));
    return /** @type {RGB} */ (base.map((x) => Math.round(Math.min(255, x * (0.35 + 0.75 * shade)))));
  }, coast);
}

/**
 * A 0-100 share grid as a picture; cells outside Natural Earth land in light grey when greySea.
 * @param {ArrayLike<number>} v @param {Uint8Array} coast @param {Uint8Array} mask @param {boolean} greySea
 */
function sharePicture(v, coast, mask, greySea) {
  return paint((i) => (greySea && !mask[i] ? [215, 215, 220] : ramp(SHARE, v[i] / 100)), coast);
}

/**
 * The pollen map's 1 degree cells drawn on the game map.
 * @param {{ lon: number, lat: number, conifer: number, broadleaf: number, open: number }[]} cells
 * @param {'conifer' | 'broadleaf'} key @param {Uint8Array} coast
 */
function pollenPicture(cells, key, coast) {
  const byCell = new Map(cells.map((c) => [`${Math.floor(c.lon)},${Math.floor(c.lat)}`, c]));
  const { cols, cell } = GRID_1KM;
  return paint((i) => {
    const c = i % cols; const r = (i - c) / cols;
    const [lon, lat] = MAP.toDegrees((c + 0.5) * cell, (r + 0.5) * cell);
    const p = byCell.get(`${Math.floor(lon)},${Math.floor(lat)}`);
    if (!p) return (c + r) % 8 < 4 ? [200, 200, 200] : [235, 235, 235]; // no value: hatched grey
    return ramp(SHARE, p[key]);
  }, coast);
}

/**
 * A closer look at part of a picture, scaled up, to check that the data sits on the coast.
 * @param {{ width: number, height: number, rgb: Uint8Array }} pic
 * @param {number} lon @param {number} lat centre @param {number} size cells across @param {number} zoom
 */
export function crop(pic, lon, lat, size, zoom) {
  const [ux, uy] = MAP.toUnits(lon, lat);
  const cx = Math.floor(ux / GRID_1KM.cell);
  const cy = pic.height - 1 - Math.floor(uy / GRID_1KM.cell);
  const w = size * zoom;
  const rgb = new Uint8Array(w * w * 3);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.max(0, Math.min(pic.width - 1, cx - (size >> 1) + Math.floor(x / zoom)));
      const sy = Math.max(0, Math.min(pic.height - 1, cy - (size >> 1) + Math.floor(y / zoom)));
      rgb.set(pic.rgb.subarray((sy * pic.width + sx) * 3, (sy * pic.width + sx) * 3 + 3), (y * w + x) * 3);
    }
  }
  return { width: w, height: w, rgb };
}

async function main() {
  const out = process.argv[2] ?? join(DERIVED, 'previews');
  await mkdir(out, { recursive: true });
  const mask = await landMask();
  const coast = coastOf(mask);
  const cells = GRID_1KM.cols * GRID_1KM.rows;
  /** @param {string} name */
  const grid = async (name) => new Uint8Array(await readFile(join(DERIVED, name)));
  /** @param {string} name @param {{ width: number, height: number, rgb: Uint8Array }} pic */
  const save = async (name, pic) => {
    await writeFile(join(out, name), encodePng(pic.width, pic.height, pic.rgb));
    console.log(join(out, name));
  };

  const hBytes = await grid('heights-2km.i16');
  const heights = new Int16Array(hBytes.buffer, hBytes.byteOffset, hBytes.byteLength / 2);
  const hp = heightsPicture(heights, coast);
  await save('heights.png', hp);
  await save('heights-riga-zoom.png', crop(hp, 23.8, 57.3, 300, 3));

  const raw = await grid('marsh-raw-1km.u8');
  const marsh = await grid('marsh-1km.u8');
  await save('marsh-raw.png', sharePicture(raw, coast, mask, true));
  const mp = sharePicture(marsh, coast, mask, true);
  await save('marsh.png', mp);
  await save('marsh-latvia-zoom.png', crop(mp, 25.0, 57.0, 400, 2));

  const cover = await grid('worldcover-1km.u8');
  for (const name of ['tree', 'crop', 'wetland', 'water']) {
    const k = COVER_PLANES.findIndex((p) => p.name === name);
    const pic = sharePicture(cover.subarray(k * cells, (k + 1) * cells), coast, mask, false);
    await save(`worldcover-${name}.png`, pic);
    if (name === 'water') await save('worldcover-water-zoom.png', crop(pic, 21.2, 55.3, 250, 3));
  }

  const pollen = JSON.parse(await readFile(join(DERIVED, 'spatiocompo-tw4.json'), 'utf8'));
  await save('pollen-conifer.png', pollenPicture(pollen, 'conifer', coast));
  await save('pollen-broadleaf.png', pollenPicture(pollen, 'broadleaf', coast));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

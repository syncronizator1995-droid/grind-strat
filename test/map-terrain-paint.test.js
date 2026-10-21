// @ts-check
// The terrain picture kept up to date with the map's date (src/ui/map/terrain.js, M3a): a cell
// written straight into a tile's kept pixels (setCell) must come out exactly as a fresh paint of
// the new grid would, shading, tree marks and the land colour of sea cells beside land included.
// Runs in Node with a stand-in canvas that only holds pixels.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadDated, loadMap, noTimes } from '../src/ui/map/load.js';
import { paintTerrain, TERRAIN } from '../src/ui/map/terrain.js';

/** A canvas stand-in: image data and putImageData, nothing drawn. */
function fakeCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      createImageData: (/** @type {number} */ w, /** @type {number} */ h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
      createPattern: () => ({}),
    }),
  };
  return canvas;
}
/** @type {any} */ (globalThis).document = { createElement: () => fakeCanvas() };

const ROOT = new URL('..', import.meta.url).pathname;
/** @param {string} path */
const block = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const { map } = await loadMap(block('src/data/map/base.json'), block('src/data/by-sa/terrain-1219.json'));
const dated = await loadDated({ terrainTime: block('src/data/by-sa/terrain-time.json'), coast: block('src/data/by/coast.json'), changes: block('src/data/own/changes.json') }, map.terrain.data, noTimes());

/** @param {import('../src/ui/map/terrain.js').Tile[]} tiles */
const pixels = (tiles) => tiles.map((t) => t.px);

describe('terrain picture over time', () => {
  it('repaints changed cells exactly as a fresh paint of the new grid', () => {
    const grid = map.terrain.data.slice();
    const picture = paintTerrain({ ...map.terrain, data: grid }, map.heights);
    const at2021 = dated.timeline.classesAt(2021);
    let changed = 0;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === at2021[i]) continue;
      grid[i] = at2021[i];
      picture.setCell(i);
      changed++;
    }
    assert.ok(changed > 100000, `only ${changed} cells changed`);
    assert.ok(picture.dirtyTiles() > 0);
    const fresh = paintTerrain({ ...map.terrain, data: at2021 }, map.heights);
    const a = pixels(picture.tiles);
    const b = pixels(fresh.tiles);
    for (let t = 0; t < a.length; t++) {
      const bad = a[t].findIndex((v, k) => v !== b[t][k]);
      assert.equal(bad, -1, `tile ${t}: pixel ${bad} differs from a fresh paint`);
    }
    picture.flush(() => true, Infinity);
    assert.equal(picture.dirtyTiles(), 0);
  });

  it('gives a sea cell the colour of land that appears beside it, and clears it when the land goes', () => {
    const { cols, rows } = map.terrain;
    const grid = map.terrain.data.slice();
    // A sea cell with sea all round it, well inside the grid.
    let cell = -1;
    for (let i = cols * 10; i < grid.length - cols * 10 && cell < 0; i++) {
      const c = i % cols;
      if (c < 2 || c > cols - 3) continue;
      if (![0, -1, 1, -2, 2, -cols, cols, -2 * cols, 2 * cols].some((d) => grid[i + d] !== TERRAIN.sea)) cell = i;
    }
    assert.ok(cell > 0 && rows > 20);
    const picture = paintTerrain({ ...map.terrain, data: grid }, map.heights);
    const pxOf = (/** @type {number} */ i) => {
      const c = i % cols; const r = (i - c) / cols;
      const t = /** @type {import('../src/ui/map/terrain.js').Tile} */ (picture.tiles.find((x) => c >= x.col && c < x.col + x.w && r >= x.row && r < x.row + x.h));
      return t.px[(r - t.row) * t.w + (c - t.col)];
    };
    assert.equal(pxOf(cell + 1), 0, 'open sea is left clear');
    grid[cell] = TERRAIN.open;
    picture.setCell(cell);
    assert.notEqual(pxOf(cell), 0);
    assert.notEqual(pxOf(cell + 1), 0, 'the sea cell beside the new land takes its colour');
    grid[cell] = TERRAIN.sea;
    picture.setCell(cell);
    assert.equal(pxOf(cell), 0);
    assert.equal(pxOf(cell + 1), 0, 'and is cleared when the land goes');
  });
});

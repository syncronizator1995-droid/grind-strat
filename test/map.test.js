// @ts-check
// Tests for the map: projection, the packed format, geometry helpers and the built test map.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { deflateSync } from 'node:zlib';
import { clipLine, clipRing, fillRings } from '../tools/map/geo.mjs';
import { EPSG3035, MAP } from '../tools/map/projection.mjs';
import { bundleBlocks, decodePoints, decodeShapes, encodePoints, encodeShapes, inflate, unbundleBlocks } from '../src/ui/map/codec.js';
import { simplify } from '../src/ui/map/geometry.js';
import { loadMap } from '../src/ui/map/load.js';

describe('projection', () => {
  it('matches the official EPSG:3035 test point to the centimetre', () => {
    const [x, y] = EPSG3035.forward(11, 53);
    assert.equal(x.toFixed(2), '4388138.60');
    assert.equal(y.toFixed(2), '3321736.46');
  });

  it('converts there and back to within a centimetre across the map', () => {
    for (let lon = 12; lon <= 34; lon += 2.75) {
      for (let lat = 50; lat <= 61.5; lat += 1.15) {
        const [x, y] = EPSG3035.forward(lon, lat);
        const [lon2, lat2] = EPSG3035.inverse(x, y);
        const [x2, y2] = EPSG3035.forward(lon2, lat2);
        assert.ok(Math.hypot(x2 - x, y2 - y) < 0.01, `${lon}, ${lat}`);
      }
    }
  });

  it('puts known places on the game map, with north up over Lithuania', () => {
    const vilnius = MAP.toUnits(25.28, 54.69);
    const riga = MAP.toUnits(24.11, 56.95);
    for (const [x, y] of [vilnius, riga, MAP.toUnits(31.27, 58.52), MAP.toUnits(18.65, 54.35)]) {
      assert.ok(x > 0 && x < MAP.width && y > 0 && y < MAP.height);
    }
    assert.ok(riga[1] > vilnius[1], 'Riga is north of Vilnius');
    // Game units are 100 m: Vilnius to Riga is about 263 km.
    const km = Math.hypot(riga[0] - vilnius[0], riga[1] - vilnius[1]) / 10;
    assert.ok(km > 255 && km < 270, `${km} km`);
    const [lon, lat] = MAP.toDegrees(...vilnius);
    assert.ok(Math.abs(lon - 25.28) < 0.002 && Math.abs(lat - 54.69) < 0.002);
  });
});

describe('packed map format', () => {
  it('round-trips shapes, including steps back and big numbers', () => {
    const shapes = [[0, 0, 5, -3, 2, 7], [15000, 13000, 14999, 12999], [], [7, 7]];
    const back = decodeShapes(encodeShapes(shapes));
    assert.deepEqual(back.map((s) => [...s]), shapes);
    assert.deepEqual([...decodePoints(encodePoints([1, 2, 3, 4, 400000, 9]))], [1, 2, 3, 4, 400000, 9]);
  });

  it('refuses damaged data instead of reading nonsense', () => {
    const good = encodeShapes([[1, 2, 3, 4]]);
    assert.throws(() => decodeShapes(good.subarray(0, good.length - 1)), /ends too early/);
    assert.throws(() => decodeShapes(Uint8Array.from([...good, 0])), /left over/);
    assert.throws(() => encodeShapes([[1, 2, 3]]), /pairs/);
  });

  it('bundles named blocks and splits them back', () => {
    const blocks = { a: Uint8Array.from([1, 2, 3]), long_name: new Uint8Array(300).fill(9), empty: new Uint8Array(0) };
    const back = unbundleBlocks(bundleBlocks(blocks));
    assert.deepEqual(Object.keys(back), Object.keys(blocks));
    for (const k of Object.keys(blocks)) assert.deepEqual([...back[k]], [...blocks[/** @type {keyof typeof blocks} */ (k)]]);
  });

  it('unpacks zlib data with the built-in decompression the game uses', async () => {
    const raw = new Uint8Array(5000).map((_, i) => i % 7);
    assert.deepEqual([...await inflate(new Uint8Array(deflateSync(raw)))], [...raw]);
  });
});

describe('geometry', () => {
  it('simplifies a straight line to its ends and keeps real bends', () => {
    assert.deepEqual(simplify([0, 0, 1, 0, 2, 0, 3, 0], 0.5), [0, 0, 3, 0]);
    assert.deepEqual(simplify([0, 0, 5, 5, 10, 0], 1), [0, 0, 5, 5, 10, 0]);
  });

  it('clips rings and lines to the map', () => {
    const ring = clipRing([-10, -10, 50, -10, 50, 50, -10, 50], 100, 100);
    for (let i = 0; i < ring.length; i += 2) assert.ok(ring[i] >= 0 && ring[i + 1] >= 0);
    assert.deepEqual(clipRing([200, 200, 300, 200, 300, 300], 100, 100), []);
    assert.deepEqual(clipLine([-5, 5, 5, 5, 10, 5, 150, 5, 20, 20, 30, 30], 100, 100), [[5, 5, 10, 5], [20, 20, 30, 30]]);
  });

  it('fills a ring into a grid, holes included', () => {
    const grid = new Uint8Array(10 * 10);
    fillRings(grid, 10, 10, 1, [[0, 0, 10, 0, 10, 10, 0, 10], [3, 3, 7, 3, 7, 7, 3, 7]], 1);
    assert.equal(grid[0], 1);
    assert.equal(grid[5 * 10 + 5], 0, 'the hole stays empty');
    assert.equal(grid.reduce((a, b) => a + b, 0), 100 - 16);
  });
});

describe('the M1 test map', () => {
  const text = readFileSync(new URL('../src/data/map/test-map.json', import.meta.url), 'utf8');
  const packed = JSON.parse(text);

  it('is the file the map tools built (not edited by hand)', () => {
    const prints = JSON.parse(readFileSync(new URL('../src/data/map/fingerprints.json', import.meta.url), 'utf8'));
    assert.equal(createHash('sha256').update(text).digest('hex'), prints['test-map.json']);
  });

  it('says what is made up', () => {
    assert.match(packed.invented, /made up/);
  });

  it('unpacks into sound layers that stay on the map', async () => {
    const { map } = await loadMap(packed);
    const inBounds = (/** @type {Int32Array[]} */ shapes, /** @type {string} */ name) => {
      for (const s of shapes) {
        for (let i = 0; i < s.length; i += 2) {
          assert.ok(s[i] >= 0 && s[i] <= map.width && s[i + 1] >= 0 && s[i + 1] <= map.height, `${name} leaves the map`);
        }
      }
    };
    for (const name of /** @type {const} */ (['land', 'coast', 'lakes', 'rivers', 'provinces', 'borders'])) {
      assert.ok(map[name].length > 0, `${name} is empty`);
      inBounds(map[name], name);
    }
    assert.equal(map.riverInfo.length, map.rivers.length);
    assert.equal(map.borderKinds.length, map.borders.length);
    assert.equal(map.pointKinds.length, map.points.length / 2);
    assert.equal(map.terrain.data.length, map.terrain.cols * map.terrain.rows);
    assert.equal(map.heights.data.length, map.heights.cols * map.heights.rows);
    assert.ok(map.seen.every((i) => i >= 0 && i < map.provinces.length));
  });
});

// @ts-check
// Tests for the map: projection, the packed format, geometry helpers and levels of detail.
// The committed data blocks are tested in test/map-blocks.test.js.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deflateSync } from 'node:zlib';
import { clipLine, clipRing, fillRings } from '../tools/map/geo.mjs';
import { atLevel, LEVEL_COUNT, pointLevels } from '../tools/map/levels.mjs';
import { EPSG3035, MAP } from '../tools/map/projection.mjs';
import {
  bundleBlocks, decodeGrid16, decodePoints, decodeShapes, decodeUints, encodeGrid, encodePoints, encodeShapes, encodeUints, inflate,
  unbundleBlocks,
} from '../src/ui/map/codec.js';
import { simplify } from '../src/ui/map/geometry.js';

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

  it('round-trips lists of whole numbers', () => {
    assert.deepEqual([...decodeUints(encodeUints([0, 5, 300, 70000, 1]))], [0, 5, 300, 70000, 1]);
    assert.deepEqual([...decodeUints(encodeUints([]))], []);
  });

  it('round-trips height grids exactly, with sea depths, cliffs and edges', () => {
    const cols = 7;
    const rows = 5;
    const values = Array.from({ length: cols * rows }, (_, i) => Math.round(Math.sin(i * 1.7) * 300 - (i % cols === 3 ? 450 : 0)));
    values[0] = -32768;
    values[cols * rows - 1] = 32767;
    const back = decodeGrid16(encodeGrid(values, cols));
    assert.equal(back.cols, cols);
    assert.equal(back.rows, rows);
    assert.deepEqual([...back.data], values);
    assert.throws(() => encodeGrid([1, 2, 3], 2), /whole rows/);
    assert.throws(() => decodeGrid16(encodeGrid(values, cols).subarray(0, 10)), /ends too early/);
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

describe('levels of detail', () => {
  /** A wiggly line and a wiggly ring, as real coasts and rivers are. */
  const wiggle = (/** @type {number} */ n, /** @type {boolean} */ ring) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const r = 400 + 60 * Math.sin(t * 7) + 9 * Math.sin(t * 41) + 2 * Math.sin(t * 97);
      pts.push(ring ? Math.round(1000 + r * Math.cos(t)) : i * 5, ring ? Math.round(1000 + r * Math.sin(t)) : Math.round(r));
    }
    return pts;
  };

  it('keeps the ends always and nests: every point of a coarser level is in the finer ones', () => {
    for (const closed of [false, true]) {
      const pts = wiggle(600, closed);
      const lvl = pointLevels(pts, closed);
      assert.equal(lvl.length, pts.length / 2);
      if (!closed) assert.equal(Math.max(lvl[0], lvl[lvl.length - 1]), 0);
      const counts = [0, 1, 2].map((k) => atLevel(pts, lvl, k).length / 2);
      assert.equal(LEVEL_COUNT, 3);
      assert.ok(counts[0] < counts[1] && counts[1] < counts[2], counts.join(' < '));
      assert.equal(counts[2], pts.length / 2, 'the close-up level keeps every point');
      for (let i = 0; i < lvl.length; i++) assert.ok(lvl[i] <= 2);
    }
  });

  it('pins chosen points and leaves small shapes out of coarse levels', () => {
    const pts = wiggle(200, true);
    const pinned = pointLevels(pts, true, { pin: (x) => x > 1400 });
    for (let i = 0; i < pinned.length; i++) if (pts[i * 2] > 1400) assert.equal(pinned[i], 0);
    const small = pointLevels(pts, true, { minLevel: 2 });
    assert.equal(atLevel(pts, small, 1).length, 0);
    assert.equal(atLevel(pts, small, 2).length, pts.length);
  });
});

// @ts-check
// Tests for the grid pipeline's pure parts: the area-averaging resampler, class shares, the
// marsh rule, range merging, the PNG encoder, and the sources.json schema. No network and no
// data/raw files (CI has neither).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { inflateSync } from 'node:zlib';
import { compareRasters } from '../tools/map/compare-gebco.mjs';
import { checkRangeAnswer, mergeRanges } from '../tools/map/fetch-grids.mjs';
import { int16Hash } from '../tools/map/grid-sources.mjs';
import { COVER_PLANES, coverTileName, openWetland } from '../tools/map/grid-cover.mjs';
import { parsePollenCsv } from '../tools/map/build-grids.mjs';
import { MARSH_CLASSES, MARSH_COVER_PLANES, MARSH_PARAMS, marshShare, stretchMarsh } from '../tools/map/marsh.mjs';
import { crc32, encodePng } from '../tools/map/png.mjs';
import { MAP } from '../tools/map/projection.mjs';
import { areaAverage, bilinear, cornerLattice, countsToPercent, forEachSample, GRID_1KM, GRID_2KM, mapWindow, nearest } from '../tools/map/resample.mjs';

/** A flat test "projection": 1 game unit = 0.01 degree, origin at 10E 50N. @type {import('../tools/map/resample.mjs').ToDegrees} */
const flat = (ux, uy) => [10 + ux / 100, 50 + uy / 100];

describe('grids and window', () => {
  it('match the M1 test map: 1 km and 2 km cells, row 0 at the south', () => {
    assert.deepEqual(GRID_1KM, { cols: Math.ceil(MAP.width / 10), rows: Math.ceil(MAP.height / 10), cell: 10 });
    assert.deepEqual(GRID_2KM, { cols: Math.ceil(MAP.width / 20), rows: Math.ceil(MAP.height / 20), cell: 20 });
  });

  it('reads a window that holds the whole map rectangle, corners included', () => {
    const w = mapWindow(0.3);
    assert.ok(w.west > 7.5 && w.west < 8.5 && w.east > 37.5 && w.east < 38.5, `${w.west} ${w.east}`);
    assert.ok(w.south > 48.8 && w.south < 49.6 && w.north > 61.8 && w.north < 62.6, `${w.south} ${w.north}`);
    const { cols, rows, cell } = GRID_1KM;
    for (const [ux, uy] of [[0, 0], [cols * cell, 0], [0, rows * cell], [cols * cell, rows * cell]]) {
      const [lon, lat] = MAP.toDegrees(ux, uy);
      assert.ok(lon > w.west + 0.29 && lon < w.east - 0.29 && lat > w.south + 0.29 && lat < w.north - 0.29, `corner ${ux},${uy}`);
    }
  });
});

describe('area-averaging resampler', () => {
  const grid = { cols: 4, rows: 3, cell: 10 }; // each cell is 0.1 x 0.1 degree in the flat projection
  const L = cornerLattice(grid, flat);

  it('places n x n samples evenly inside each cell', () => {
    /** @type {number[][]} */ const pts = [];
    forEachSample(L, 1, 2, 2, (lon, lat) => pts.push([+lon.toFixed(6), +lat.toFixed(6)]));
    assert.deepEqual(pts, [[10.125, 50.225], [10.175, 50.225], [10.125, 50.275], [10.175, 50.275]]);
  });

  it('gives the exact mean of a linear field (bilinear reads), cell by cell, south row first', () => {
    // A raster of 0.025 degree pixels whose value is the longitude plus ten times the latitude.
    const width = 40; const height = 20;
    const R = { west: 9.9, north: 50.4, dx: 0.025, dy: 0.025, width, height, values: new Float64Array(width * height) };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) R.values[y * width + x] = (R.west + (x + 0.5) * R.dx) + 10 * (R.north - (y + 0.5) * R.dy);
    const avg = areaAverage(L, 4, bilinear(R));
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const want = 10 + (c + 0.5) * 0.1 + 10 * (50 + (r + 0.5) * 0.1);
        assert.ok(Math.abs(avg[r * grid.cols + c] - want) < 1e-9, `cell ${c},${r}: ${avg[r * grid.cols + c]} vs ${want}`);
      }
    }
  });

  it('averages over the cell\'s area, not a point: a fine checkerboard averages to one half', () => {
    const width = 80; const height = 60;
    const values = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) values[y * width + x] = (x + y) % 2 ? 100 : 0;
    const R = { west: 10, north: 50.3, dx: 0.005, dy: 0.005, width, height, values };
    const avg = areaAverage(L, 20, nearest(R));
    for (const v of avg) assert.ok(Math.abs(v - 50) < 0.01, `${v}`);
  });

  it('leaves no-data out of the blend, and gives NaN where there is no data at all', () => {
    const R = { west: 10, north: 50.3, dx: 0.2, dy: 0.15, width: 2, height: 2, values: [10, 255, 30, 255], noData: 255 };
    const read = bilinear(R);
    assert.equal(read(10.05, 50.225), 10); // on row 0's centres, left of the first: clamped
    assert.equal(read(10.2, 50.225), 10); // half way to a no-data pixel: only the valid one counts
    assert.ok(Number.isNaN(read(12, 50.2)));
    const allMissing = bilinear({ ...R, values: [255, 255, 255, 255] });
    assert.ok(Number.isNaN(allMissing(10.1, 50.2)));
  });
});

describe('class shares', () => {
  it('turn counts into whole percentages that add up to exactly 100, or all 0 with no data', () => {
    // Three cells, three planes, plane-major: thirds, a 100-sample cell, and an empty cell.
    const counts = Uint8Array.from([1, 30, 0, 1, 70, 0, 1, 0, 0]);
    const pct = countsToPercent(counts, 3, 3);
    assert.deepEqual([pct[0], pct[3], pct[6]], [34, 33, 33]);
    assert.deepEqual([pct[1], pct[4], pct[7]], [30, 70, 0]);
    assert.deepEqual([pct[2], pct[5], pct[8]], [0, 0, 0]);
  });

  it('names WorldCover tiles by their south-west corner', () => {
    assert.equal(coverTileName(54, 24), 'N54E024');
    assert.equal(coverTileName(48, 6), 'N48E006');
  });
});

describe('marsh: bogs stand out', () => {
  it('keeps the agreed numbers: floor 15, full 55', () => {
    assert.deepEqual({ ...MARSH_PARAMS }, { floor: 15, full: 55 });
  });

  it('drops the thin background and stretches the rest towards 100', () => {
    assert.equal(stretchMarsh(0), 0);
    assert.equal(stretchMarsh(15), 0); // the floor itself is still background
    assert.equal(stretchMarsh(15.5), 1);
    assert.equal(stretchMarsh(35), 50);
    assert.equal(stretchMarsh(55), 100);
    assert.equal(stretchMarsh(100), 100);
    assert.equal(stretchMarsh(Number.NaN), 0);
    assert.equal(stretchMarsh(30, { floor: 10, full: 50 }), 50);
  });

  it('keeps today\'s open wetland wherever it is larger', () => {
    assert.equal(marshShare(0, 70), 70);
    assert.equal(marshShare(55, 10), 100);
    assert.equal(marshShare(12, 0), 0);
    assert.equal(marshShare(35, 60), 60);
    assert.equal(marshShare(0, 140), 100);
  });

  it('counts WorldCover herbaceous wetland (class 90) as open wetland, but not moss and lichen (100)', () => {
    assert.deepEqual([...MARSH_COVER_PLANES], ['wetland']);
    assert.ok(COVER_PLANES.find((p) => p.name === 'wetland')?.classes.includes(90));
    // Two cells: one all moss and lichen (a Swedish fell), one 40% wetland and 30% moss.
    const cells = 2;
    const cover = new Uint8Array(COVER_PLANES.length * cells);
    const plane = (/** @type {string} */ name) => COVER_PLANES.findIndex((p) => p.name === name);
    cover[plane('moss') * cells + 0] = 100;
    cover[plane('wetland') * cells + 1] = 40;
    cover[plane('moss') * cells + 1] = 30;
    assert.deepEqual([...openWetland(cover, cells)], [0, 40]);
  });

  it('uses the agreed GLWD classes and leaves out open water and ephemeral wetland', () => {
    assert.deepEqual([...MARSH_CLASSES], [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 23, 24, 25, 29, 30, 31]);
  });
});

describe('fetching', () => {
  it('merges nearby byte ranges into few requests, but not past the size limit', () => {
    const merged = mergeRanges([{ offset: 100, length: 10 }, { offset: 0, length: 50 }, { offset: 55, length: 10 }, { offset: 1000, length: 5 }], 10, 1000);
    assert.deepEqual(merged, [{ offset: 0, length: 65 }, { offset: 100, length: 10 }, { offset: 1000, length: 5 }]);
    assert.deepEqual(mergeRanges([{ offset: 0, length: 50 }, { offset: 70, length: 10 }], 20, 1000), [{ offset: 0, length: 80 }]);
    assert.deepEqual(mergeRanges([{ offset: 0, length: 60 }, { offset: 60, length: 60 }], 0, 100), [{ offset: 0, length: 60 }, { offset: 60, length: 60 }]);
  });

  it('accepts only range answers that hold exactly the bytes asked for', () => {
    const r = { offset: 100, length: 50 };
    assert.doesNotThrow(() => checkRangeAnswer('u', r, 'bytes 100-149/1000', 50));
    // At the end of the file the answer is rightly shorter.
    assert.doesNotThrow(() => checkRangeAnswer('u', r, 'bytes 100-119/120', 20));
    // A body cut short, even with an honest header; a header that says less; the wrong place; no header.
    assert.throws(() => checkRangeAnswer('u', r, 'bytes 100-149/1000', 30), /asked for 50 bytes at 100, got 30/);
    assert.throws(() => checkRangeAnswer('u', r, 'bytes 100-129/1000', 30), /got 30/);
    assert.throws(() => checkRangeAnswer('u', r, 'bytes 0-49/1000', 50), /asked for 50 bytes at 100/);
    assert.throws(() => checkRangeAnswer('u', r, null, 50), /Content-Range/);
  });

  it('compares two copies of a raster cell by cell, matched by lon/lat', () => {
    // a: 4 x 2 pixels from 10E; b: the same land, 2 x 2 pixels from 11E (one pixel = 0.5 degree).
    const a = { values: Int16Array.from([1, 2, 3, 4, 5, 6, 7, 8]), width: 4, height: 2, west: 10, north: 60, dx: 0.5, dy: 0.5 };
    const same = { values: Int16Array.from([3, 4, 7, 8]), width: 2, height: 2, west: 11, north: 60, dx: 0.5, dy: 0.5 };
    assert.deepEqual({ ...compareRasters(a, same), byDiff: [], examples: [] }, { compared: 4, differing: 0, maxDiff: 0, byDiff: [], examples: [], offset: { ox: 2, oy: 0 } });
    const off = { ...same, values: Int16Array.from([3, 4, 9, 5]) };
    const r = compareRasters(a, off);
    assert.equal(r.differing, 2);
    assert.equal(r.maxDiff, 3);
    assert.deepEqual(r.byDiff, [[2, 1], [3, 1]]);
    assert.deepEqual(r.examples[0], { x: 2, y: 1, a: 7, b: 9 });
    // The pixel hash depends only on the values, not on how a file packed them.
    assert.equal(int16Hash(Int16Array.from([3, 4])), int16Hash(a.values.subarray(2, 4)));
    assert.notEqual(int16Hash(Int16Array.from([3, 4])), int16Hash(Int16Array.from([4, 3])));
  });

  it('reads the pollen CSV by its column names', () => {
    const { header, cells } = parsePollenCsv('Lon,Lat,C_X,B_X,U_X\n24.5,55.5,0.25,0.25,0.5\n');
    assert.deepEqual(header, ['Lon', 'Lat', 'C_X', 'B_X', 'U_X']);
    assert.deepEqual(cells, [{ lon: 24.5, lat: 55.5, conifer: 0.25, broadleaf: 0.25, open: 0.5 }]);
  });
});

describe('PNG encoder', () => {
  it('writes a valid PNG with the pixels intact', () => {
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926); // the standard check value
    const rgb = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9]);
    const png = encodePng(2, 2, rgb);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const idatLength = new DataView(png.buffer).getUint32(33);
    const raw = inflateSync(png.subarray(41, 41 + idatLength));
    assert.deepEqual([...raw], [0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 9, 9, 9]);
  });
});

describe('sources.json', () => {
  const { sources } = JSON.parse(readFileSync(new URL('../tools/map/sources.json', import.meta.url), 'utf8'));
  const ids = sources.map((/** @type {{ id: string }} */ s) => s.id);

  it('has the four new map sources next to Natural Earth, each id once', () => {
    for (const id of ['ne-land', 'ne-rivers', 'ne-lakes', 'gebco-2026', 'glwd-v2', 'worldcover-2021', 'spatiocompo-tw4']) assert.ok(ids.includes(id), id);
    assert.equal(new Set(ids).size, ids.length);
  });

  for (const s of sources) {
    it(`entry ${s.id} has every required field`, () => {
      for (const k of ['id', 'collection', 'url', 'file', 'what', 'licence', 'licenceUrl', 'licenceReadAt']) {
        assert.equal(typeof s[k], 'string', `${s.id}.${k}`);
        assert.ok(s[k].length > 0, `${s.id}.${k} is empty`);
      }
      assert.ok(['read', 'unverified'].includes(s.licenceStatus), `${s.id}.licenceStatus`);
      assert.ok('licenceQuote' in s && 'unofficialCopy' in s, `${s.id}: licenceQuote and unofficialCopy must be present (null allowed)`);
      assert.ok(Array.isArray(s.toCheck) && s.toCheck.every((/** @type {unknown} */ t) => typeof t === 'string'), `${s.id}.toCheck`);
      if (s.licenceStatus === 'read') assert.ok(typeof s.licenceQuote === 'string' && s.licenceQuote.length > 20, `${s.id}: a read licence needs its quote`);
      if (s.licenceStatus === 'unverified') assert.ok(s.toCheck.length > 0, `${s.id}: an unverified licence must say what to check`);
      assert.ok(['whole', 'range', undefined].includes(s.access), `${s.id}.access`);
      for (const f of s.files ?? []) assert.ok(f.name && f.url.startsWith('https://') && f.file, `${s.id} extra file`);
      assert.ok(s.url.startsWith('https://'), `${s.id}.url`);
      if (s.fallback) assert.ok(s.fallback.url.startsWith('https://') && s.fallback.what.length > 20, `${s.id}.fallback needs a url and a description`);
      for (const m of [s.maxRangeBytes, s.fallback?.maxRangeBytes]) assert.ok(m === undefined || (Number.isInteger(m) && m >= 65536), `${s.id}: maxRangeBytes`);
    });

    it(`entry ${s.id} has a full credit for the Credits screen`, () => {
      const c = s.credit;
      assert.ok(c, `${s.id} has no credit`);
      for (const k of ['line', 'citation', 'changes', 'licenceName', 'licenceUri']) assert.ok(typeof c[k] === 'string' && c[k].length > 0, `${s.id}.credit.${k}`);
      assert.doesNotMatch(c.licenceUri, /^[a-z][a-z0-9+.-]*:/i, `${s.id}.credit.licenceUri must have no scheme`);
      assert.doesNotMatch(c.licenceUri, /^\/\//, `${s.id}.credit.licenceUri must have no scheme`);
    });
  }
});

// @ts-check
// Tests for the northern coast over time: the readers it needs (a band of a planar TIFF, the
// Swedish grid, GeoPackages), the rules that make the field (tools/map/coast.mjs), the field in
// the game (src/sim/coast-date.js) and the old shore drawn from it (src/ui/map/shore.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { inflateSync } from 'node:zlib';
import { licenceProblems } from '../tools/build.mjs';
import { ROOT } from '../tools/map/block.mjs';
import { COAST_SOURCES, readSguCenturies } from '../tools/map/build-coast.mjs';
import { COAST_BLOCK, coastStaleReasons } from '../tools/map/pack-coast.mjs';
import { unbundleBlocks } from '../src/ui/map/codec.js';
import { COAST_BASE_YEAR, COAST_CODE, coastLevel, createCoast, emergedYearOf } from '../src/sim/coast-date.js';
import { ringList, shoreAt, shoreSquares } from '../src/ui/map/shore.js';
import {
  chamferDistance, codeOfYear, codesFromCenturies, COAST_PARAMS, coastParamsSha256, fillUnknownHeights, fitGroups, floodCodes, kField,
  LAST_LAND_CODE, openOutlet, ownCodes, seaAbove, spreadIntoSea,
} from '../tools/map/coast.mjs';
import { gpkgGeometryBlob, openGeoPackage, parseGpkgGeometry, parseWkb } from '../tools/map/gpkg.mjs';
import { MAP, SWEREF99TM, transverseMercator } from '../tools/map/projection.mjs';
import { bandIndex, memorySource, openTiff } from '../tools/map/tiff.mjs';
import { writeTiff } from './tiff-writer.mjs';

describe('reading one band of a TIFF with separate bands (planar configuration 2)', () => {
  // Three float bands of 5 x 4, like NKG_RF17vel's east, north and up velocities.
  const w = 5; const h = 4;
  const band = (/** @type {number} */ k) => Array.from({ length: w * h }, (_, i) => k * 100 + i + 0.25);
  const spec = (/** @type {any} */ more) => ({
    images: [{ width: w, height: h, bits: /** @type {32} */ (32), values: band(0), bands: [band(1), band(2)],
      bandNames: ['east_velocity', 'north_velocity', 'up_velocity'], geo: { west: 0, north: 75, dx: 1 / 6, dy: 1 / 12 }, ...more }],
  });

  for (const [name, more] of /** @type {[string, any][]} */ ([['strips, DEFLATE', { compression: 8, rowsPerStrip: 3 }], ['tiles, none', { tile: [16, 16] }], ['strips, LZW, big-endian', { compression: 5 }]])) {
    it(`reads band 3 by number and by name (${name})`, async () => {
      const bytes = writeTiff({ ...spec(more), littleEndian: !name.includes('big') });
      const tiff = await openTiff(memorySource(bytes));
      const img = tiff.images[0];
      assert.equal(img.samplesPerPixel, 3);
      assert.deepEqual(img.bandNames, ['east_velocity', 'north_velocity', 'up_velocity']);
      assert.equal(bandIndex(img, 'up_velocity'), 2);
      const up = await tiff.readWindow(img, 0, 0, w, h, { band: 2 });
      assert.ok(up instanceof Float32Array);
      assert.deepEqual([...up], band(2));
      // A window inside the image, from another band.
      const part = await tiff.readWindow(img, 1, 1, 3, 2, { band: 1 });
      assert.deepEqual([...part], [106.25, 107.25, 108.25, 111.25, 112.25, 113.25]);
    });
  }

  it('asks which band to read, and refuses a band that is not there or a name it does not have', async () => {
    const tiff = await openTiff(memorySource(writeTiff(spec({}))));
    const img = tiff.images[0];
    await assert.rejects(tiff.readWindow(img, 0, 0, w, h), /3 bands: say which band/);
    await assert.rejects(tiff.readWindow(img, 0, 0, w, h, { band: 3 }), /no band 3/);
    assert.throws(() => bandIndex(img, 'down_velocity'), /no band "down_velocity"/);
  });
});

describe('SWEREF 99 TM (the Swedish grid SGU publishes in)', () => {
  it('matches Lantmäteriet\'s worked example both ways (Gauss conformal projection, Krüger\'s formulas, 2008)', () => {
    // Lantmäteriet's example: a local Transverse Mercator on GRS80, 66°N 24°E.
    const tm = transverseMercator({ lon0: 13 + 35 / 60 + 7.692 / 3600, k0: 1.00000254, fe: 84182.879, fn: -6226307.864 });
    const [e, n] = tm.forward(24, 66);
    assert.ok(Math.abs(n - 1135809.413803) < 0.001, `northing ${n}`);
    assert.ok(Math.abs(e - 555304.016555) < 0.001, `easting ${e}`);
    const [lon, lat] = tm.inverse(555304.016555, 1135809.413803);
    assert.ok(Math.abs(lon - 24) < 1e-9 && Math.abs(lat - 66) < 1e-9, `${lon} ${lat}`);
  });

  it('puts the central meridian at easting 500 000 m, and goes there and back over Sweden', () => {
    const [e, n] = SWEREF99TM.forward(15, 60);
    assert.ok(Math.abs(e - 500000) < 1e-6);
    assert.ok(n > 6650000 && n < 6660000, `northing of 60°N: ${n}`);
    for (const [lon, lat] of [[11.2, 55.4], [18.07, 59.33], [24.1, 65.8], [19.3, 57.9]]) {
      const [x, y] = SWEREF99TM.forward(lon, lat);
      const [lon2, lat2] = SWEREF99TM.inverse(x, y);
      assert.ok(Math.abs(lon2 - lon) < 1e-9 && Math.abs(lat2 - lat) < 1e-9, `${lon} ${lat}`);
    }
  });
});

describe('the GeoPackage reader (on a small GeoPackage the test makes)', () => {
  it('reads polygons and multipolygons, with and without holes and Z values', () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 10, 0, 0];
    const hole = [2, 2, 2, 4, 4, 4, 4, 2, 2, 2];
    const one = parseGpkgGeometry(gpkgGeometryBlob([[square, hole]], 3006));
    assert.equal(one.srsId, 3006);
    assert.deepEqual(one.polygons, [[square, hole]]);
    const two = parseGpkgGeometry(gpkgGeometryBlob([[square], [hole]], 3006));
    assert.equal(two.polygons.length, 2);
    // A polygon Z (ISO code 1003), written by hand: the Z values are dropped.
    const wkb = new Uint8Array(9 + 4 + 3 * 24);
    const dv = new DataView(wkb.buffer);
    dv.setUint8(0, 1); dv.setUint32(1, 1003, true); dv.setUint32(5, 1, true); dv.setUint32(9, 3, true);
    [[1, 2, 9], [3, 4, 9], [1, 2, 9]].forEach(([x, y, z], k) => { dv.setFloat64(13 + k * 24, x, true); dv.setFloat64(21 + k * 24, y, true); dv.setFloat64(29 + k * 24, z, true); });
    assert.deepEqual(parseWkb(wkb), [[[1, 2, 3, 4, 1, 2]]]);
    assert.throws(() => parseWkb(Uint8Array.of(1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)), /not a polygon/);
  });

  it('opens a GeoPackage made with SQLite and reads a table of SGU\'s shape', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'grind-strat-gpkg-'));
    const path = join(dir, 'tiny.gpkg');
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(path);
      db.exec(`PRAGMA application_id = ${0x47504b47};
        CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT NOT NULL);
        CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT, geometry_type_name TEXT, srs_id INTEGER);
        CREATE TABLE issjohav_700 (fid INTEGER PRIMARY KEY, geom BLOB, Bp INTEGER, Year INTEGER, Code INTEGER, Description TEXT);
        INSERT INTO gpkg_contents VALUES ('issjohav_700', 'features');
        INSERT INTO gpkg_geometry_columns VALUES ('issjohav_700', 'geom', 'MULTIPOLYGON', 3006);`);
      const insert = db.prepare('INSERT INTO issjohav_700 (geom, Bp, Year, Code, Description) VALUES (?, 700, 1250, ?, ?)');
      insert.run(gpkgGeometryBlob([[[600000, 6600000, 610000, 6600000, 610000, 6610000, 600000, 6600000]]], 3006), 1, 'Hav');
      insert.run(gpkgGeometryBlob([[[620000, 6600000, 630000, 6600000, 630000, 6610000, 620000, 6600000]]], 3006), 4, 'Sjö');
      db.close();
      const gpkg = await openGeoPackage(path);
      assert.deepEqual(gpkg.tables(), [{ name: 'issjohav_700', geometry: 'geom', type: 'MULTIPOLYGON', srsId: 3006 }]);
      const features = gpkg.features('issjohav_700', ['Code', 'Year']);
      assert.deepEqual(features.map((f) => f.properties.Code), [1, 4]);
      assert.equal(features[0].polygons[0][0][2], 610000);
      assert.throws(() => gpkg.features('issjohav_700', ['Nope']), /no column Nope/);
      gpkg.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('turns SGU-shaped century tables into sea maps on the game\'s grid, and those into codes', async () => {
    // A made-up bay near Stockholm, in SWEREF 99 TM: sea over a 10 km square in 800 cal BP
    // (AD 1150), over its eastern half in 700 cal BP (AD 1250), gone in 100 cal BP; a lake (code 4)
    // that is never sea. Today it is all land.
    const [e0, n0] = SWEREF99TM.forward(18.0, 59.5);
    const sq = (/** @type {number} */ x0, /** @type {number} */ x1) => [[[x0, n0, x1, n0, x1, n0 + 10000, x0, n0 + 10000, x0, n0]]];
    const dir = await mkdtemp(join(tmpdir(), 'grind-strat-sgu-'));
    const path = join(dir, 'strandforskjutning_test.gpkg');
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(path);
      db.exec(`PRAGMA application_id = ${0x47504b47};
        CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT NOT NULL);
        CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT, geometry_type_name TEXT, srs_id INTEGER);`);
      for (const bp of [1200, 800, 700, 100]) {
        db.exec(`CREATE TABLE issjohav_${bp} (fid INTEGER PRIMARY KEY, geom BLOB, Bp INTEGER, Year INTEGER, Code INTEGER);
          INSERT INTO gpkg_contents VALUES ('issjohav_${bp}', 'features');
          INSERT INTO gpkg_geometry_columns VALUES ('issjohav_${bp}', 'geom', 'MULTIPOLYGON', 3006);`);
        const insert = db.prepare(`INSERT INTO issjohav_${bp} (geom, Bp, Year, Code) VALUES (?, ${bp}, ${1950 - bp}, ?)`);
        if (bp >= 800) insert.run(gpkgGeometryBlob(sq(e0, e0 + 10000), 3006), 1);
        if (bp === 700) insert.run(gpkgGeometryBlob(sq(e0 + 5000, e0 + 10000), 3006), 1);
        insert.run(gpkgGeometryBlob(sq(e0 - 8000, e0 - 2000), 3006), 4);
      }
      db.close();
      const [x, y] = MAP.toUnits(18.0, 59.5);
      const box = { col0: Math.floor(x / 5) - 30, row0: Math.floor(y / 5) - 10, cols: 80, rows: 50, cell: 5 };
      const centuries = await readSguCenturies(path, box);
      assert.deepEqual(centuries.map((c) => c.year), [1150, 1250, 1850], 'tables older than 1119 are skipped');
      const count = (/** @type {Uint8Array} */ m) => m.reduce((a, b) => a + b, 0);
      // 10 km x 10 km of 500 m cells is about 400; half of it about 200; none at the end.
      assert.ok(Math.abs(count(centuries[0].sea) - 400) < 40, `${count(centuries[0].sea)}`);
      assert.ok(Math.abs(count(centuries[1].sea) - 200) < 30, `${count(centuries[1].sea)}`);
      assert.equal(count(centuries[2].sea), 0);
      const land = new Uint8Array(box.cols * box.rows).fill(1);
      const codes = codesFromCenturies(centuries, land, box.cols, box.rows);
      let west = 0; let east = 0;
      for (let i = 0; i < codes.length; i++) {
        if (!centuries[0].sea[i]) { assert.equal(codes[i], 0); continue; }
        const year = 1219 + 4 * codes[i];
        if (centuries[1].sea[i]) { east++; assert.ok(year > 1250 && year <= 1851, `${year}`); } else { west++; assert.ok(codes[i] <= codeOfYear(1250), `${year}`); }
      }
      assert.ok(west > 150 && east > 150);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('the coast field in the game (src/sim/coast-date.js)', () => {
  // A strip of 6 cells: land of 1219, three cells that come out of the sea, the open sea.
  const box = { col0: 100, row0: 200, cols: 6, rows: 1, cell: 5 };
  const codes = Uint8Array.of(0, 1, 50, 200, 254, 254);

  it('reads the codes as years (no year 0, nothing before 1219)', () => {
    assert.equal(emergedYearOf(0), -Infinity);
    assert.equal(emergedYearOf(1), 1223);
    assert.equal(emergedYearOf(201), 2023);
    assert.equal(emergedYearOf(254), Infinity);
    assert.throws(() => emergedYearOf(230), /not a coast code/);
    assert.equal(coastLevel(-10000), 0);
    assert.equal(coastLevel(1222), 0);
    assert.equal(coastLevel(1223), 1);
    assert.equal(coastLevel(2021), 200);
    assert.equal(coastLevel(3000), 201);
  });

  it('answers seaAt by place and by cell, and never by guess outside its box', () => {
    const coast = createCoast({ box, codes });
    const x = (/** @type {number} */ c) => (box.col0 + c + 0.5) * box.cell;
    const y = (box.row0 + 0.5) * box.cell;
    assert.equal(coast.seaAt(x(0), y, 1219), false);
    assert.equal(coast.seaAt(x(1), y, 1222), true);
    assert.equal(coast.seaAt(x(1), y, 1223), false);
    assert.equal(coast.seaAt(x(2), y, 1418), true);
    assert.equal(coast.seaAt(x(2), y, 1419), false);
    assert.equal(coast.seaAt(x(4), y, 2500), true);
    assert.equal(coast.seaAt(x(-1), y, 1219), false, 'outside the box nothing changes');
    assert.equal(coast.seaAtCell(3, 2018), true);
    assert.equal(coast.seaAtCell(3, 2019), false);
    assert.equal(coast.emergedYear(2), 1419);
  });

  it('land never turns back into sea as the years go on, and step lists exactly the cells that change', () => {
    const coast = createCoast({ box, codes });
    let before = codes.map(() => 1);
    for (let year = 1100; year <= 2100; year += 3) {
      const { cells, toLand } = coast.step(year);
      const now = codes.map((_, i) => (coast.seaAtCell(i, year) ? 1 : 0));
      for (let i = 0; i < codes.length; i++) assert.ok(now[i] <= before[i], `cell ${i} turned back into sea in ${year}`);
      const changed = [...codes.keys()].filter((i) => now[i] !== before[i] && year !== 1100);
      if (year !== 1100) { assert.deepEqual([...cells].sort(), changed); assert.ok(toLand); }
      before = now;
    }
    // Going back in time lists the same cells, the other way.
    const back = coast.step(1300);
    assert.equal(back.toLand, false);
    assert.deepEqual([...back.cells].sort(), [2, 3]);
  });
});

describe('the rules that make the field (tools/map/coast.mjs)', () => {
  it('fits k to the control points and fades it back to 1 by 150 km', () => {
    const pts = /** @type {import('../tools/map/coast.mjs').ControlPoint[]} */ ([
      { id: 'a', group: 'g', use: 'value', place: 'A', lon: 0, lat: 0, year: 1300, rslM: 2, toleranceM: 0.5 },
      { id: 'b', group: 'g', use: 'value', place: 'B', lon: 0, lat: 0, year: 1000, rslM: 4, toleranceM: 0.5 },
      { id: 'c', group: 'g', use: 'check', place: 'C', lon: 0, lat: 0, year: 1000, rslM: 9, toleranceM: 0.5 },
      { id: 'd', group: 'h', use: 'below', place: 'D', lon: 0, lat: 0, year: 1000, rslM: 9, toleranceM: 0.5 },
    ]);
    const [g] = fitGroups(pts, () => ({ up: 5.5, x: 1000, y: 1000 }));
    // Least squares through zero: k = sum(H u) / sum(u^2), with u the metres at k = 1.
    const u1 = (5 * (2021 - 1300)) / 1000; const u2 = (5 * (2021 - 1000)) / 1000;
    assert.ok(Math.abs(g.k - (2 * u1 + 4 * u2) / (u1 * u1 + u2 * u2)) < 1e-12);
    assert.deepEqual(g.points, ['a', 'b'], 'checks and brackets are never fitted');
    const k = kField([{ ...g, k: 0.5 }]);
    assert.equal(k(1000, 1000), 0.5);
    assert.ok(k(1000 + 500, 1000) > 0.5 && k(1000 + 500, 1000) < 1, 'in between at 50 km');
    assert.equal(k(1000 + 1500, 1000), 1, 'back to 1 at 150 km');
    assert.equal(k(1000, 1000 + 4000), 1);
    assert.throws(() => fitGroups([{ ...pts[0], year: 500 }], () => ({ up: 5, x: 0, y: 0 })), /older than the rule/);
    assert.ok(Math.abs(seaAbove(5.5, 1, 1219) - 4.01) < 1e-9);
  });

  it('turns heights into codes: land below the minimum reads at it, a small fall changes nothing', () => {
    const land = Uint8Array.of(1, 1, 1, 1, 0);
    const heights = Float32Array.of(-3, 1, 10, 1, -20);
    const fall = Float32Array.of(5, 5, 5, 0.5, 5);
    const own = ownCodes({ land, heights, fall });
    assert.equal(own[0], codeOfYear(2021 - (1000 * COAST_PARAMS.minLandM) / 5));
    assert.equal(own[1], codeOfYear(2021 - 1000 / 5));
    assert.equal(own[2], 0, '10 m was land before 1219');
    assert.equal(own[3], 0, 'a fall of 0.4 m since 1219 is too small to show');
    assert.equal(own[4], COAST_CODE.sea);
    assert.equal(codeOfYear(1219), 0);
    assert.equal(codeOfYear(1220), 1);
    assert.equal(codeOfYear(2050), LAST_LAND_CODE, 'today\'s land is land by today');
  });

  it('keeps a basin behind a sill sea until the sill comes out of the water', () => {
    // A row: open sea | shore 120 | sill 30 | basin 150 150 | far shore 60 | high land 0.
    const own = Uint8Array.of(254, 120, 30, 150, 150, 60, 0);
    const codes = floodCodes(own, 7, 1);
    assert.deepEqual([...codes], [254, 120, 30, 30, 30, 30, 0]);
    // A second, lower way out keeps the basin open longer.
    const two = floodCodes(Uint8Array.of(254, 120, 30, 150, 150, 90, 254), 7, 1);
    assert.deepEqual([...two], [254, 120, 30, 90, 90, 90, 254]);
    // The sea joins across edges only: a basin touching the sea at a corner is not reached.
    const grid = Uint8Array.of(
      254, 0, 0,
      0, 150, 0,
      0, 0, 0,
    );
    assert.equal(floodCodes(grid, 3, 3)[4], 0);
    // In time: the basin is sea exactly as long as the sill.
    const coast = createCoast({ box: { col0: 0, row0: 0, cols: 7, rows: 1, cell: 5 }, codes });
    for (const year of [1219, 1300, 1338, 1339, 1340, 1500, 1800]) {
      assert.equal(coast.seaAtCell(3, year), coast.seaAtCell(2, year), `${year}`);
      assert.equal(coast.seaAtCell(4, year), coast.seaAtCell(2, year), `${year}`);
    }
  });

  it('opens a bay\'s outlet until its year, so the whole bay becomes a lake then', () => {
    // 5 x 3: sea on the left column; a lake of 3 cells on the right, behind high land.
    const cols = 5; const rows = 3;
    const land = Uint8Array.of(0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1);
    const lake = Uint8Array.of(0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1);
    const own = Uint8Array.of(254, 0, 0, 0, 0, 254, 0, 0, 0, 0, 254, 0, 0, 0, 0);
    const channel = openOutlet(own, lake, land, cols, rows, 1 * cols + 3, 1300);
    assert.deepEqual(channel.sort((a, b) => a - b), [6, 7]);
    const codes = floodCodes(own, cols, rows);
    for (const i of [4, 8, 9, 14]) assert.equal(codes[i], codeOfYear(1300), `lake cell ${i}`);
    assert.equal(codes[1], 0, 'the high land beside it stays land');
  });

  it('spreads the land\'s smallest code two cells into today\'s sea', () => {
    const cols = 7;
    const land = Uint8Array.of(1, 1, 0, 0, 0, 0, 0);
    const codes = spreadIntoSea(Uint8Array.of(80, 40, 254, 254, 254, 254, 254), land, cols, 1, 2);
    assert.deepEqual([...codes], [80, 40, 40, 40, 254, 254, 254]);
    const stable = spreadIntoSea(Uint8Array.of(0, 40, 254, 254, 254), Uint8Array.of(1, 1, 0, 0, 0), 5, 1, 2);
    assert.deepEqual([...stable], [0, 40, 0, 40, 254]);
  });

  it('fills unknown heights from the neighbours, low but not all alike', () => {
    const land = new Uint8Array(9).fill(1);
    const heights = Float32Array.of(1.6, 1.6, 1.6, 1.6, NaN, 1.6, 1.6, 1.6, 1.6);
    assert.equal(fillUnknownHeights(heights, land, 3, 3), 1);
    assert.ok(Math.abs(heights[4] - (0.5 + (0.5 * 1.6) / 3.6)) < 1e-6);
    const high = Float32Array.of(9, 9, 9, 9, NaN, 9, 9, 9, 9);
    fillUnknownHeights(high, land, 3, 3);
    assert.ok(high[4] > heights[4] && high[4] < COAST_PARAMS.unknownMaxM, 'higher beside higher land, below the cap');
    const alone = Float32Array.of(NaN);
    fillUnknownHeights(alone, Uint8Array.of(1), 1, 1);
    assert.equal(alone[0], COAST_PARAMS.minLandM);
  });

  it('places cells between two century maps by their distance from the two shores', () => {
    // One row, sea from the right: in 1250 sea from cell 2, in 1350 from cell 6, today from cell 8.
    const cols = 10;
    const sea = (/** @type {number} */ from) => new Uint8Array(cols).map((_, i) => (i >= from ? 1 : 0));
    const land = new Uint8Array(cols).map((_, i) => (i < 8 ? 1 : 0));
    const codes = codesFromCenturies([{ year: 1250, sea: sea(2) }, { year: 1350, sea: sea(6) }], land, cols, 1);
    assert.deepEqual([...codes.slice(0, 2)], [0, 0], 'land in the oldest map');
    const years = [...codes.slice(2, 8)].map((k) => 1219 + 4 * k);
    for (let i = 1; i < years.length; i++) assert.ok(years[i] >= years[i - 1], 'further out comes later');
    assert.ok(years[0] > 1250 && years[3] <= 1352, `${years}`);
    assert.ok(years[4] > 1350 && years[5] <= 2021, `${years}`);
    assert.deepEqual([...codes.slice(8)], [254, 254]);
    assert.deepEqual([...chamferDistance(Uint8Array.of(1, 0, 0), 3, 1)], [0, 1, 2]);
  });
});

describe('the old shore (src/ui/map/shore.js)', () => {
  /** A round island rising out of the sea: code grows away from its middle. */
  const island = (/** @type {number} */ cols, /** @type {number} */ rows, /** @type {boolean} */ openSea) => {
    const codes = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = Math.hypot(c - cols / 2, r - rows / 2);
        codes[r * cols + c] = d < 4 ? 0 : openSea && d > cols / 2 - 2 ? 254 : Math.min(200, Math.round((d - 4) * 9));
      }
    }
    return codes;
  };
  const area = (/** @type {number[]} */ ring) => {
    let a = 0;
    for (let i = 0, n = ring.length / 2, j = n - 1; i < n; j = i++) a += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
    return a / 2;
  };

  it('fills as much old sea as the field has sea cells, in counter-clockwise rings', () => {
    const cols = 60; const rows = 60;
    const box = { col0: 3, row0: 7, cols, rows, cell: 5 };
    const codes = island(cols, rows, false);
    const s = shoreSquares(box, codes);
    for (const year of [1219, 1400, 1600, 1800]) {
      const level = coastLevel(year);
      const { fill: rings, lines } = shoreAt(s, level);
      const fill = ringList(rings);
      for (const ring of fill) assert.ok(area(ring) > 0, 'counter-clockwise');
      const filled = fill.reduce((t, r) => t + area(r), 0) / (box.cell * box.cell);
      // Sea cells, counted over the squares' area (cell centres of the inner grid).
      let seaCells = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (codes[r * cols + c] > level) seaCells++;
      const edge = 2 * (cols + rows);
      assert.ok(Math.abs(filled - seaCells) < 0.05 * seaCells + edge, `${year}: filled ${filled.toFixed(0)} against ${seaCells} sea cells`);
      // The shore is one closed loop round the island, inside the box.
      assert.equal(lines.length, 1, `${year}`);
      const l = lines[0];
      assert.deepEqual(l.slice(0, 2), l.slice(-2), 'closed');
      for (let i = 0; i < l.length; i += 2) {
        assert.ok(l[i] > (box.col0) * box.cell && l[i] < (box.col0 + cols) * box.cell);
        assert.ok(l[i + 1] > (box.row0) * box.cell && l[i + 1] < (box.row0 + rows) * box.cell);
      }
    }
    // Once everything has risen there is nothing left to draw.
    const done = shoreAt(s, coastLevel(2021));
    assert.deepEqual([done.fill.ends.length, done.lines.length], [0, 0]);
  });

  it('can work on part of the field only (the view), giving the same shapes there', () => {
    const cols = 60; const rows = 60;
    const box = { col0: 0, row0: 0, cols, rows, cell: 5 };
    const s = shoreSquares(box, island(cols, rows, false));
    const level = coastLevel(1500);
    const all = ringList(shoreAt(s, level).fill);
    const within = { x0: 0, y0: 0, x1: 150, y1: 150 }; // the south-west quarter
    const part = ringList(shoreAt(s, level, { within }).fill);
    assert.ok(part.length > 0 && part.length < all.length / 2, `${part.length} of ${all.length}`);
    const key = (/** @type {number[]} */ r) => r.map((v) => v.toFixed(6)).join(',');
    const keys = new Set(all.map(key));
    // Rings inside the quarter are the same (runs may be cut at its edge, so only pieces count).
    for (const r of part) if (r.length !== 8) assert.ok(keys.has(key(r)), 'a piece the whole field does not have');
  });

  it('visits only the squares still partly sea, fewer as the land rises', () => {
    const box = { col0: 0, row0: 0, cols: 40, rows: 40, cell: 5 };
    const s = shoreSquares(box, island(40, 40, true));
    const counts = [1219, 1500, 1800, 2021].map((y) => shoreAt(s, coastLevel(y)).squares);
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] <= counts[i - 1], `${counts}`);
    assert.ok(counts[2] < counts[0] / 3, `${counts}`);
    assert.equal(counts[3], 0, 'squares with a corner in today\'s open sea are never listed');
  });

  it('draws no shore line along a stable coast (where a corner is today\'s open sea)', () => {
    // Land of 1219 next to the open sea, with the land's code spread two cells out.
    const cols = 12; const rows = 8;
    const land = new Uint8Array(cols * rows).map((_, i) => (i % cols < 5 ? 1 : 0));
    const codes = new Uint8Array(cols * rows).map((_, i) => (land[i] ? 0 : 254));
    spreadIntoSea(codes, land, cols, rows, 2);
    const s = shoreSquares({ col0: 0, row0: 0, cols, rows, cell: 5 }, codes);
    for (const year of [1219, 1500, 2021]) {
      const { lines, fill } = shoreAt(s, coastLevel(year));
      assert.equal(lines.length, 0, `${year}`);
      assert.equal(fill.ends.length, 0, `${year}: no old sea along a coast that does not change`);
    }
  });

  it('handles a saddle both ways: two sea corners joined or apart', () => {
    const box = { col0: 0, row0: 0, cols: 2, rows: 2, cell: 10 };
    // Corners (counter-clockwise from the south-west): sea, land, sea, land.
    const apart = shoreAt(shoreSquares(box, Uint8Array.of(12, 0, 0, 12)), 10);
    const apartRings = ringList(apart.fill);
    assert.equal(apartRings.length, 2, 'two triangles');
    assert.deepEqual(apartRings.map((r) => r.length), [6, 6]);
    assert.equal(apart.lines.length, 2);
    const joined = shoreAt(shoreSquares(box, Uint8Array.of(200, 5, 5, 200)), 10);
    const joinedRings = ringList(joined.fill);
    assert.equal(joinedRings.length, 1, 'one band across the square');
    assert.equal(joined.lines.length, 2);
    for (const f of [...apartRings, ...joinedRings]) assert.ok(area(f) > 0);
    // The triangles sit at the sea corners (south-west and north-east).
    assert.ok(apartRings.some((r) => r.includes(5) && r[2] === 5 && r[3] === 5));
  });
});

describe('the shipped coast block (src/data/by/coast.json)', () => {
  const read = (/** @type {string} */ path) => readFileSync(join(ROOT, path), 'utf8');
  const text = read(COAST_BLOCK);
  const block = JSON.parse(text);
  const anchorsText = read('tools/map/coast-anchors.json');
  const anchors = JSON.parse(anchorsText);
  const codes = unbundleBlocks(new Uint8Array(inflateSync(Buffer.from(block.bundle, 'base64')))).coast;
  const box = block.meta.coast;
  const coast = createCoast({ box, codes });
  /** The lon/lat of a cell's centre. @param {number} i */
  const lonLat = (i) => {
    const c = i % box.cols; const r = (i - c) / box.cols;
    return MAP.toDegrees((box.col0 + c + 0.5) * box.cell, (box.row0 + r + 0.5) * box.cell);
  };

  it('is CC BY 4.0, from CC BY and public-domain sources only, and the licence guard agrees', () => {
    assert.equal(block.kind, 'coast');
    assert.equal(block.licence, 'CC-BY-4.0');
    const sources = JSON.parse(read('tools/map/sources.json')).sources;
    for (const id of block.sources) {
      const src = sources.find((/** @type {{ id: string }} */ x) => x.id === id);
      assert.ok(src, id);
      assert.match(src.credit.licenceName, /^(CC BY 4\.0|Public domain)/, id);
      assert.notEqual(src.collection, 'osm');
    }
    assert.deepEqual(licenceProblems([{ kind: 'coast', text }], sources), []);
    assert.ok(block.meta.estimate, 'marked as an estimate');
  });

  it('was built from today\'s settings and control points', () => {
    assert.equal(block.meta.built.paramsSha256, coastParamsSha256(anchorsText), 'stale: run npm run map:coast, then npm run map:pack');
    assert.deepEqual(coastStaleReasons({ paramsSha256: block.meta.built.paramsSha256 }, anchorsText), []);
    assert.equal(codes.length, box.cols * box.rows);
    assert.equal(box.cell, COAST_PARAMS.cell);
  });

  it('meets every control point within its tolerance, and every bracket', () => {
    const ids = anchors.points.map((/** @type {{ id: string }} */ p) => p.id);
    assert.deepEqual(block.meta.checks.map((/** @type {{ id: string }} */ c) => c.id), ids, 'every control point is checked');
    for (const c of block.meta.checks) {
      assert.ok(c.ok, `${c.id}: model ${c.modelM} m against ${c.observedM} m (${c.use}, ±${c.toleranceM})`);
      const p = anchors.points.find((/** @type {{ id: string }} */ x) => x.id === c.id);
      if (p.use === 'value' || p.use === 'check') assert.ok(Math.abs(c.modelM - p.rslM) <= p.toleranceM, c.id);
      if (p.use === 'below') assert.ok(c.modelM <= p.rslM + p.toleranceM, c.id);
      if (p.use === 'above') assert.ok(c.modelM >= p.rslM - p.toleranceM, c.id);
    }
    // Every control point names its source, and says how far it was read.
    for (const p of anchors.points) assert.ok(p.source && p.url && p.seen && p.quote, p.id);
    for (const r of anchors.regions) assert.ok(r.name && r.error.length > 40, r.name);
  });

  it('changes nothing south of the uplift zone', () => {
    let changing = 0;
    for (let i = 0; i < codes.length; i++) {
      const k = codes[i];
      if (k === COAST_CODE.land || k === COAST_CODE.sea) continue;
      changing++;
      const [, lat] = lonLat(i);
      assert.ok(lat >= COAST_PARAMS.southLimitLat, `cell ${i} at ${lat.toFixed(2)}N changes`);
    }
    assert.ok(changing > 10000, `${changing} cells change`);
    // Riga (0.3 m of fall since 1219) and Klaipėda: no change near them.
    for (const [lon, lat] of [[24.1, 56.95], [21.13, 55.71], [18.65, 54.35]]) {
      const [x, y] = MAP.toUnits(lon, lat);
      for (let dy = -100; dy <= 100; dy += 5) {
        for (let dx = -100; dx <= 100; dx += 5) {
          assert.equal(coast.seaAt(x + dx, y + dy, 1219), coast.seaAt(x + dx, y + dy, 2021), `${lon} ${lat}`);
        }
      }
    }
  });

  it('only ever turns sea into land, and is today\'s coast by today', () => {
    const levels = [1219, 1300, 1500, 1700, 1900, 2021].map(coastLevel);
    for (let i = 0; i < codes.length; i++) {
      const k = codes[i];
      const sea = levels.map((L) => k > L);
      for (let j = 1; j < sea.length; j++) assert.ok(!sea[j] || sea[j - 1], `cell ${i} back to sea`);
      assert.ok(k <= LAST_LAND_CODE || k === COAST_CODE.sea, `cell ${i}: code ${k} is still sea in 2021 though not today's sea`);
    }
  });

  it('keeps Lake Mälaren a bay of the sea in 1219 and makes it a lake when its outlet closed', () => {
    const malaren = anchors.lakes.find((/** @type {{ id: string }} */ l) => l.id === 'malaren');
    const [x, y] = MAP.toUnits(16.9, 59.5); // the Västerås basin
    const closed = malaren.outlet.closedYear;
    assert.equal(coast.seaAt(x, y, 1219), true);
    assert.equal(coast.seaAt(x, y, closed - 5), true);
    assert.equal(coast.seaAt(x, y, closed + 4), false);
    assert.deepEqual(block.meta.lakes.map((/** @type {{ id: string }} */ l) => l.id), ['malaren']);
    if (block.meta.sgu.used) assert.fail('SGU\'s model is used: check Mälaren against SGU\'s own century here');
    assert.match(block.meta.sgu.note, /not/);
  });

  it('draws an old shore near Stockholm, Turku and Tallinn in 1219, and none along the stable south', () => {
    const s = shoreSquares(box, codes);
    const { fill, lines } = shoreAt(s, coastLevel(COAST_BASE_YEAR));
    assert.ok(fill.ends.length > 1000 && lines.length > 100, `${fill.ends.length} rings, ${lines.length} lines`);
    const near = (/** @type {number} */ lon, /** @type {number} */ lat) => {
      const [x, y] = MAP.toUnits(lon, lat);
      return lines.some((l) => { for (let i = 0; i < l.length; i += 2) if (Math.hypot(l[i] - x, l[i + 1] - y) < 200) return true; return false; });
    };
    for (const [lon, lat] of [[18.07, 59.33], [22.27, 60.45], [24.75, 59.44]]) assert.ok(near(lon, lat), `no old shore within 20 km of ${lon} ${lat}`);
    assert.equal(shoreAt(s, coastLevel(2021)).lines.length, 0, 'by today the old shore is today\'s');
  });

  it('is made without OpenStreetMap: the coast tools read only their own sources', () => {
    const OSM = /\bosm\b|osm-|-osm|overpass|openstreetmap\.org|\.osm\.|\.pbf\b/i;
    const seen = new Set();
    const todo = ['build-coast.mjs', 'pack-coast.mjs', 'coast.mjs'].map((f) => join(ROOT, 'tools', 'map', f));
    while (todo.length) {
      const file = /** @type {string} */ (todo.pop());
      if (seen.has(file)) continue;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'([^']+)'/gm)) {
        assert.doesNotMatch(m[1], OSM, `${file} imports ${m[1]}`);
        if (m[1].startsWith('.')) todo.push(resolve(dirname(file), m[1]));
      }
    }
    assert.ok(seen.size >= 10, `${seen.size} files`);
    const build = readFileSync(join(ROOT, 'tools', 'map', 'build-coast.mjs'), 'utf8');
    for (const m of build.matchAll(/readRaw\('([^']+)'/g)) assert.ok(['nkg-rf17vel', 'ne-lakes'].includes(m[1]), `reads ${m[1]}`);
    for (const id of COAST_SOURCES) assert.doesNotMatch(id, OSM);
  });
});

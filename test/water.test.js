// @ts-check
// Tests for the OpenStreetMap water pipeline's pure parts: river grouping and stitching,
// lengths and areas in game units, multipolygon rings, the reservoir filter (with the "marios"
// trap), the reviewed reservoir list, the Overpass queries and the sources.json entry.
// No network and no data/raw files (CI has neither).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { keepLakeBySize, keepRiver, lakeRings } from '../tools/map/build-water.mjs';
import { cacheName, osmWindow, QUERIES, tilesOf } from '../tools/map/fetch-osm.mjs';
import { MAP } from '../tools/map/projection.mjs';
import {
  bboxAreaKm2, classifyLake, groupRivers, lakeCandidateWorthFetching, lengthInside, lineLength, orient,
  reservoirKeywordHits, reviewIndex, ringsArea, ringsFromMembers, signedArea2, stitch, THRESHOLDS,
} from '../tools/map/water-rules.mjs';

/** @typedef {import('../tools/map/water-rules.mjs').RiverWay} RiverWay */

/** A river way from a few points. @param {number} id @param {Record<string, string>} tags @param {number[]} coords */
const way = (id, tags, coords) => /** @type {RiverWay} */ ({ id, tags: { waterway: 'river', ...tags }, coords });

describe('river grouping', () => {
  const ways = new Map([
    [1, way(1, { name: 'Upė' }, [0, 0, 1, 0])],
    [2, way(2, {}, [1, 0, 2, 0])], // unnamed, joins only through the relation
    [3, way(3, { name: 'Upė' }, [2, 0, 3, 0])], // same name, touches way 2's end: joins the relation's river
    [4, way(4, { name: 'Upė', wikidata: 'Q2' }, [3, 0, 4, 0])], // same name but another Wikidata id: a different river
    [5, way(5, { name: 'Kita' }, [10, 0, 11, 0])],
    [6, way(6, { name: 'Kita' }, [11, 0, 12, 0])], // same name, touching: one river
    [7, way(7, { name: 'Kita' }, [50, 50, 51, 50])], // same name, far away: another river
    [8, way(8, { name: 'A', wikidata: 'Q9' }, [20, 0, 21, 0])],
    [9, way(9, { name: 'B', wikidata: 'Q9' }, [30, 0, 31, 0])], // same Wikidata id, apart: one river
  ]);
  const relations = [{ id: 100, tags: { name: 'Upė', wikidata: 'Q1' }, members: [{ type: 'way', ref: 1, role: 'main_stream' }, { type: 'way', ref: 2, role: '' }] }];
  const groups = groupRivers(ways, relations);
  const of = (/** @type {number} */ id) => groups.find((g) => g.ways.includes(id));

  it('puts relation members together, and adds same-name ways that touch them', () => {
    assert.deepEqual(of(1)?.ways, [1, 2, 3]);
    assert.equal(of(1)?.id, 'r100');
    assert.equal(of(1)?.wikidata, 'Q1');
    assert.equal(of(1)?.by, 'relation');
  });

  it('never joins two rivers with different Wikidata ids', () => {
    assert.deepEqual(of(4)?.ways, [4]);
    assert.equal(of(4)?.wikidata, 'Q2');
  });

  it('joins by name only where the ways touch', () => {
    assert.deepEqual(of(5)?.ways, [5, 6]);
    assert.deepEqual(of(7)?.ways, [7]);
    assert.equal(of(5)?.by, 'name');
  });

  it('joins ways with the same Wikidata id even when apart', () => {
    assert.deepEqual(of(8)?.ways, [8, 9]);
    assert.equal(of(8)?.by, 'wikidata');
  });

  it('gives every way exactly one group', () => {
    assert.equal(groups.reduce((n, g) => n + g.ways.length, 0), ways.size);
  });
});

describe('stitching', () => {
  it('joins pieces in any direction into one line', () => {
    const lines = stitch([[2, 0, 3, 0], [1, 0, 0, 0], [1, 0, 2, 0], [4, 1, 3, 0]]);
    assert.equal(lines.length, 1);
    const l = lines[0];
    const ends = [[l[0], l[1]].join(), [l[l.length - 2], l[l.length - 1]].join()].sort();
    assert.deepEqual(ends, ['0,0', '4,1']);
    assert.equal(l.length / 2, 5);
  });

  it('keeps a side arm as a second line', () => {
    const lines = stitch([[0, 0, 10, 0], [10, 0, 20, 0], [10, 0, 10, 5]]);
    assert.equal(lines.length, 2);
    assert.deepEqual(lines.map((l) => l.length / 2).sort(), [2, 3]);
  });
});

describe('lengths and areas in game units', () => {
  it('measures a line: 3-4-5 units', () => {
    assert.equal(lineLength([0, 0, 3, 4]), 5);
    assert.equal(lineLength([0, 0, 3, 4, 3, 10]), 11);
  });

  it('orients outer rings counter-clockwise and holes clockwise, so holes subtract', () => {
    const outer = orient([0, 0, 0, 10, 10, 10, 10, 0], false); // given clockwise
    const hole = orient([2, 2, 4, 2, 4, 4, 2, 4], true); // given counter-clockwise
    assert.ok(signedArea2(outer) > 0);
    assert.ok(signedArea2(hole) < 0);
    assert.equal(ringsArea([outer, hole]), 96); // 100 - 4 square units = 0.96 km²
  });

  it('joins multipolygon member ways into closed rings by role', () => {
    const { rings, open } = ringsFromMembers([
      { role: 'outer', coords: [0, 0, 10, 0, 10, 10] },
      { role: 'outer', coords: [0, 0, 0, 10, 10, 10] },
      { role: 'inner', coords: [2, 2, 4, 2, 4, 4, 2, 4, 2, 2] },
      { role: 'inner', coords: [7, 7, 8, 7] }, // never closes
    ]);
    assert.equal(rings.length, 2);
    assert.equal(rings.filter((r) => r.hole).length, 1);
    assert.equal(open, 1);
  });

  it('projects a real lake and subtracts its island', () => {
    // A 0.1° x 0.05° box near Vilnius with an island of a quarter of its size (by degrees).
    const el = {
      type: 'relation', id: 1, tags: { name: 'Testas', natural: 'water' },
      members: [
        { type: 'way', role: 'outer', geometry: [[25, 54.6], [25.1, 54.6], [25.1, 54.65], [25, 54.65], [25, 54.6]].map(([lon, lat]) => ({ lon, lat })) },
        { type: 'way', role: 'inner', geometry: [[25.025, 54.6125], [25.025, 54.6375], [25.075, 54.6375], [25.075, 54.6125], [25.025, 54.6125]].map(([lon, lat]) => ({ lon, lat })) },
      ],
    };
    const { rings } = lakeRings(el);
    assert.equal(rings.length, 2);
    assert.ok(signedArea2(rings[0]) > 0 && signedArea2(rings[1]) < 0, 'outer first, then its hole');
    assert.ok(rings.flat().every(Number.isInteger));
    const km2 = ringsArea(rings) * 0.01;
    const full = 0.1 * 111.32 * Math.cos(54.625 * Math.PI / 180) * 0.05 * 111.25; // about 35.8 km²
    assert.ok(Math.abs(km2 - full * 0.75) < 0.6, `${km2} vs ${full * 0.75}`);
  });

  it('measures the length of a line inside a polygon', () => {
    const square = orient([0, 0, 10, 0, 10, 10, 0, 10], false);
    assert.equal(lengthInside([-5, 5, 15, 5], [square]), 10);
  });

  it('keeps rivers and lakes by the agreed thresholds', () => {
    assert.ok(keepRiver({ name: 'A', wikidata: null, lengthKm: THRESHOLDS.MIN_RIVER_KM }));
    assert.ok(!keepRiver({ name: 'A', wikidata: null, lengthKm: 49 }));
    assert.ok(keepRiver({ name: 'A', wikidata: 'Q1', lengthKm: 15 }));
    assert.ok(!keepRiver({ name: '', wikidata: 'Q1', lengthKm: 500 }), 'a river needs a name');
    assert.ok(keepLakeBySize({ name: 'A', wikidata: null, areaKm2: 1 }));
    assert.ok(!keepLakeBySize({ name: 'A', wikidata: null, areaKm2: 0.9 }));
    assert.ok(keepLakeBySize({ name: '', wikidata: 'Q1', areaKm2: 0.5 }));
  });

  it('skips lake candidates whose box is too small to hold a kept lake', () => {
    const box = (/** @type {number} */ d) => ({ minlat: 55, minlon: 24, maxlat: 55 + d, maxlon: 24 + d });
    assert.ok(bboxAreaKm2(box(0.01)) < 1 && bboxAreaKm2(box(0.02)) > 1);
    assert.ok(!lakeCandidateWorthFetching({ name: 'A' }, box(0.01)));
    assert.ok(lakeCandidateWorthFetching({ name: 'A' }, box(0.02)));
    assert.ok(lakeCandidateWorthFetching({ wikidata: 'Q1' }, box(0.01)));
  });
});

describe('modern reservoirs', () => {
  const kaunas = { name: 'Kauno marios', natural: 'water', water: 'lake', wikidata: 'Q1007' };
  const curonian = { name: 'Kuršių marios', natural: 'water', water: 'lagoon', wikidata: 'Q2' };
  const review = reviewIndex([
    { name: 'Kauno marios', osmIds: ['relation/10'], wikidata: 'Q1007', decision: 'drop', why: 'modern reservoir' },
    { name: 'Lubāns', osmIds: ['relation/30'], wikidata: null, decision: 'keep', why: 'natural lake, regulated' },
  ]);

  it('always drops what OSM tags as a reservoir', () => {
    assert.equal(classifyLake('way/1', { natural: 'water', water: 'reservoir', name: 'X' }, review).keep, false);
    assert.equal(classifyLake('way/2', { natural: 'water', landuse: 'reservoir', name: 'X' }, review).keep, false);
  });

  it('drops a mis-tagged reservoir by its reviewed OSM id or Wikidata id', () => {
    assert.equal(classifyLake('relation/10', kaunas, review).keep, false);
    assert.equal(classifyLake('way/99', kaunas, review).keep, false, 'another piece with the same Wikidata id');
  });

  it('falls into no "marios" trap: the keyword only flags, the natural lagoon stays', () => {
    const v = classifyLake('relation/20', curonian, review);
    assert.equal(v.keep, true);
    assert.deepEqual(v.flags, ['marios']);
    const unreviewed = classifyLake('relation/11', { ...kaunas, wikidata: 'Q5' }, reviewIndex([]));
    assert.equal(unreviewed.keep, true, 'an unreviewed name match is never dropped automatically');
    assert.deepEqual(unreviewed.flags, ['marios']);
  });

  it('keeps a regulated natural lake that was reviewed as "keep"', () => {
    assert.equal(classifyLake('relation/30', { name: 'Lubāns', natural: 'water', water: 'lake' }, review).keep, true);
  });

  it('finds reservoir words in any language name, and HES only as a word', () => {
    assert.deepEqual(reservoirKeywordHits({ name: 'Вілейскае вадасховішча' }), ['вадасховішча']);
    assert.deepEqual(reservoirKeywordHits({ 'name:ru': 'Плявиньская ГЭС' }), ['ГЭС']);
    assert.deepEqual(reservoirKeywordHits({ name: 'Pļaviņu HES ūdenskrātuve' }), ['ūdenskrātuve', 'HES']);
    assert.deepEqual(reservoirKeywordHits({ name: 'Heskas' }), []);
  });
});

describe('the reviewed reservoir list', () => {
  const file = JSON.parse(readFileSync(new URL('../tools/map/reservoirs-1219.json', import.meta.url), 'utf8'));

  it('has a complete entry for each water body', () => {
    assert.ok(file.reservoirs.length > 10);
    for (const e of file.reservoirs) {
      assert.ok(typeof e.name === 'string' && e.name, JSON.stringify(e));
      assert.ok(Array.isArray(e.osmIds) && e.osmIds.every((/** @type {string} */ i) => /^(node|way|relation)\/\d+$/.test(i)), e.name);
      assert.ok(e.wikidata === null || /^Q\d+$/.test(e.wikidata), e.name);
      assert.ok(['drop', 'keep'].includes(e.decision), e.name);
      assert.ok(typeof e.why === 'string' && e.why.length > 5, e.name);
    }
  });

  it('drops the must-drop reservoirs and keeps the natural lakes', () => {
    const decision = (/** @type {RegExp} */ re) => file.reservoirs.filter((/** @type {{ name: string }} */ e) => re.test(e.name)).map((/** @type {{ decision: string }} */ e) => e.decision);
    for (const re of [/Kauno marios/, /Pļaviņ/, /Ķegum/, /Rīg/, /Narva|Нарвск/, /Vilei|Вілей|Вилей/, /Zasl|Заслаў|Заслав/, /Elektrėn/, /Włocław/, /Zegrz/]) {
      const d = decision(re);
      assert.ok(d.length && d.every((/** @type {string} */ x) => x === 'drop'), `${re}: ${d}`);
    }
    assert.deepEqual(decision(/Lubāns/), ['keep']);
    assert.ok(!decision(/Kuršių marios/).includes('drop'));
  });
});

describe('Overpass queries', () => {
  it('cover the whole map with tiles, corners included', () => {
    const w = osmWindow();
    for (const [ux, uy] of [[0, 0], [MAP.width, 0], [0, MAP.height], [MAP.width, MAP.height]]) {
      const [lon, lat] = MAP.toDegrees(ux, uy);
      assert.ok(lon > w.west && lon < w.east && lat > w.south && lat < w.north);
      assert.ok(tilesOf(w).some((t) => lon >= t.west && lon <= t.east && lat >= t.south && lat <= t.north), `corner ${ux},${uy}`);
    }
    assert.ok(tilesOf(w).length < 120);
  });

  it('ask only for what the build uses, and never for reservoirs as lakes', () => {
    const b = { south: 54, west: 24, north: 56, east: 26 };
    assert.match(QUERIES.riverWays(b), /way\["waterway"="river"\]\["name"\]\(54,24,56,26\);\nout tags geom qt;/);
    const lakes = QUERIES.lakeBoxes(b);
    assert.match(lakes, /out tags bb qt;/);
    assert.doesNotMatch(lakes, /reservoir/);
    assert.match(QUERIES.reservoirs(b), /"water"="reservoir"/);
    assert.match(QUERIES.reservoirs(b), /"landuse"="reservoir"/);
    assert.equal(cacheName('x'), cacheName('x'));
    assert.notEqual(cacheName('x'), cacheName('y'));
  });
});

describe('sources.json: the OpenStreetMap entry', () => {
  const { sources } = JSON.parse(readFileSync(new URL('../tools/map/sources.json', import.meta.url), 'utf8'));
  const osm = sources.find((/** @type {{ id: string }} */ s) => s.id === 'osm-water');

  it('names the ODbL and the Overpass API', () => {
    assert.ok(osm);
    assert.equal(osm.collection, 'osm');
    assert.equal(osm.access, 'overpass');
    assert.equal(osm.url, 'https://overpass-api.de/api/interpreter');
    assert.equal(osm.licence, 'Open Database License (ODbL) 1.0');
    assert.equal(osm.credit.licenceUri, 'opendatacommons.org/licenses/odbl/1-0/');
    assert.match(osm.credit.line, /© OpenStreetMap contributors/);
    assert.match(osm.credit.line, /openstreetmap\.org\/copyright/);
  });

  it('quotes the licence where it was read', () => {
    if (osm.licenceStatus === 'read') {
      assert.match(osm.licenceQuote, /Open Database License/);
      assert.match(osm.licenceReadAt, /openstreetmap-website/);
    } else {
      assert.ok(osm.toCheck.length > 0);
    }
  });
});

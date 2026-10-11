// @ts-check
// Tests for reading OpenStreetMap water through Overture: turning rows into river ways and lake
// candidates, the local name of each stretch of a river, the name a river is known by, lakes
// made after 1219, and the S3 listing and window helpers of the fetcher. No network.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boxKm2, boxOverlaps, newestRelease, parseListing, wantedRow } from '../tools/map/fetch-overture.mjs';
import { lakeCandidate, osmObject, riverWay, rowTags } from '../tools/map/overture-water.mjs';
import {
  classifyLake, isTwoLanguageName, localNames, madeAfter1219, reviewIndex, riverMainName, splitNames,
} from '../tools/map/water-rules.mjs';

/** @typedef {import('../tools/map/fetch-overture.mjs').WaterRow} WaterRow */

/** @param {Partial<WaterRow>} r @returns {WaterRow} */
const row = (r) => ({
  id: 'x', subtype: 'river', class: 'river', name: '', common: {}, wikidata: null, osm: ['w1@1'], tags: {}, bbox: [0, 0, 1, 1],
  geometry: { type: 'LineString', line: [24, 55, 24.1, 55.1] }, ...r,
});

describe('Overture rows', () => {
  it('reads OSM ids from record ids', () => {
    assert.deepEqual(osmObject('w123@4'), { type: 'way', id: 123 });
    assert.deepEqual(osmObject('r7546467@59'), { type: 'relation', id: 7546467 });
    assert.deepEqual(osmObject('n5'), { type: 'node', id: 5 });
    assert.equal(osmObject('something else'), null);
  });

  it('puts the name, the name:xx and the Wikidata id back into OSM tags', () => {
    const tags = rowTags(row({ name: 'Neris', common: { be: 'Вілія', lt: 'Neris' }, wikidata: 'Q207903', tags: { waterway: 'river' } }));
    assert.deepEqual(tags, { waterway: 'river', name: 'Neris', 'name:be': 'Вілія', 'name:lt': 'Neris', wikidata: 'Q207903' });
  });

  it('takes river lines as ways, and leaves out river areas and rows that are not one way', () => {
    assert.equal(riverWay(row({ name: 'Neris', osm: ['w42@3'] }))?.id, 42);
    assert.equal(riverWay(row({ geometry: { type: 'Polygon', rings: [[0, 0, 1, 0, 1, 1, 0, 0]] } })), null);
    assert.equal(riverWay(row({ osm: ['r1@1'] })), null);
    assert.equal(riverWay(row({ class: 'stream' })), null);
  });

  it('takes natural water and reservoirs as lake candidates, and nothing else', () => {
    const poly = { type: 'MultiPolygon', polygons: [[[0, 0, 1, 0, 1, 1, 0, 0], [0.2, 0.2, 0.4, 0.2, 0.4, 0.4, 0.2, 0.2]], [[5, 5, 6, 5, 6, 6, 5, 5]]] };
    const lake = lakeCandidate(row({ subtype: 'lake', class: 'lake', osm: ['r9@1'], tags: { natural: 'water', water: 'lake' }, geometry: poly }));
    assert.equal(lake?.osmId, 'relation/9');
    assert.equal(lake?.polygons.length, 2);
    assert.equal(lake?.polygons[0].holes.length, 1);
    const lagoon = lakeCandidate(row({ subtype: 'lake', class: 'lagoon', osm: ['r2@1'], tags: { natural: 'bay', water: 'lagoon' }, geometry: poly }));
    assert.ok(lagoon, 'a lagoon mapped as natural=bay');
    assert.ok(lakeCandidate(row({ subtype: 'reservoir', class: 'reservoir', tags: { natural: 'water', water: 'reservoir' }, geometry: poly })));
    assert.equal(lakeCandidate(row({ subtype: 'water', class: 'water', tags: { natural: 'water', water: 'harbour' }, geometry: poly })), null, 'a harbour');
    assert.equal(lakeCandidate(row({ subtype: 'water', class: 'fairway', tags: { waterway: 'fairway', area: 'yes' }, geometry: poly })), null, 'a fairway');
    assert.equal(lakeCandidate(row({ subtype: 'lake', class: 'lake', tags: { 'proposed:natural': 'water', water: 'lake' }, geometry: poly })), null, 'only proposed');
  });
});

describe('river names', () => {
  it('knows names that are several names in one', () => {
    for (const n of ['Nemunas / Неман', 'Łyna/Лава', 'Zalew Wiślany - Калининградский залив', 'Neris - Вілія']) assert.ok(isTwoLanguageName(n), n);
    for (const n of ['Peipsi-Pihkva järv', 'Nemunas', 'Skirvytė']) assert.ok(!isTwoLanguageName(n), n);
    assert.deepEqual(splitNames('Šešupė / Шешупе /'), ['Šešupė', 'Шешупе']);
  });

  it('chooses the local name a river is known by', () => {
    assert.equal(riverMainName('Wisła', new Map([['Wisła', 100]])), 'Wisła');
    assert.equal(riverMainName('Dnieper', new Map([['Дняпро', 600], ['Дніпро', 500]])), 'Дняпро', 'not a name for the whole river in another language');
    assert.equal(riverMainName('Нёман / Неман / Nemunas', new Map([['Нёман', 450], ['Nemunas', 400], ['Нёман / Nemunas', 900]])), 'Нёман', 'single names first');
    assert.equal(riverMainName(undefined, new Map([['', 10], ['Upė', 5]])), 'Upė');
  });

  it('names each stretch locally, gives unnamed and garbled stretches a neighbour\'s name', () => {
    /** @param {number} id @param {string} name @param {number[]} coords */
    const w = (id, name, coords) => ({ id, tags: /** @type {Record<string, string>} */ (name ? { name } : {}), coords });
    const ways = [
      w(1, 'Nemunas', [0, 0, 1, 0]), w(2, '', [1, 0, 2, 0]), w(3, 'Россия - Lietuva', [2, 0, 3, 0]),
      w(4, 'Nemunas / Неман', [3, 0, 4, 0]), w(5, 'Неман', [4, 0, 5, 0]),
    ];
    const names = localNames(ways, { name: 'Нёман / Неман / Nemunas' });
    assert.equal(names.get(1), 'Nemunas');
    assert.equal(names.get(2), 'Nemunas', 'unnamed: its neighbour\'s name');
    assert.equal(names.get(3), 'Nemunas', 'not a name of this river: its neighbour\'s name');
    assert.equal(names.get(4), 'Nemunas / Неман', 'a border stretch keeps both names');
    assert.equal(names.get(5), 'Неман');
  });
});

describe('lakes of 1219', () => {
  it('drops lakes that OSM shows were made after 1219', () => {
    assert.match(String(madeAfter1219({ lake: 'quarry' })), /quarry/);
    assert.match(String(madeAfter1219({ 'was:resource': 'lignite' })), /mine/);
    assert.match(String(madeAfter1219({ start_date: '1483' })), /after 1219/);
    assert.equal(madeAfter1219({ start_date: '1100' }), null);
    assert.equal(madeAfter1219({ natural: 'water', water: 'lake' }), null);
    assert.equal(classifyLake('way/1', { natural: 'water', water: 'lake', lake: 'quarry' }, reviewIndex([])).keep, false);
  });

  it('lets a reviewed "keep" overrule a reservoir tag, for a natural lake regulated today', () => {
    const review = reviewIndex([{ name: 'Tyrifjorden', osmIds: ['relation/5081'], wikidata: null, decision: 'keep', why: 'natural lake' }]);
    assert.equal(classifyLake('relation/5081', { natural: 'water', water: 'reservoir' }, review).keep, true);
    assert.equal(classifyLake('relation/5082', { natural: 'water', water: 'reservoir' }, review).keep, false);
  });
});

describe('the Overture fetcher', () => {
  it('finds the newest release', () => {
    assert.equal(newestRelease(['release/2026-08-19.0/', 'release/2026-09-23.1/', 'release/2026-09-23.0/', 'other/']), '2026-09-23.1');
    assert.equal(newestRelease(['release/2026-09-23.2/', 'release/2026-09-23.10/']), '2026-09-23.10');
    assert.throws(() => newestRelease([]), /no releases/);
  });

  it('reads an S3 listing, with its continuation token', () => {
    const xml = '<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>abc&amp;d</NextContinuationToken>'
      + '<Contents><Key>release/x/a.parquet</Key><ETag>&quot;e1-9&quot;</ETag><Size>123</Size></Contents>'
      + '<CommonPrefixes><Prefix>release/2026-09-23.1/</Prefix></CommonPrefixes></ListBucketResult>';
    assert.deepEqual(parseListing(xml), { objects: [{ key: 'release/x/a.parquet', size: 123, etag: 'e1-9' }], prefixes: ['release/2026-09-23.1/'], next: 'abc&d' });
  });

  it('chooses rows by subtype, class, box and size', () => {
    const w = { west: 8, east: 38, south: 49, north: 62.3 };
    const b = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ d) => ({ xmin: x, xmax: x + d, ymin: y, ymax: y + d });
    assert.ok(wantedRow('river', 'river', b(24, 55, 0.001), w), 'any river line, however short');
    assert.ok(!wantedRow('river', 'river', b(5, 55, 1), w), 'outside the window');
    assert.ok(!wantedRow('stream', 'stream', b(24, 55, 1), w));
    assert.ok(wantedRow('lake', 'lake', b(24, 55, 0.02), w));
    assert.ok(!wantedRow('lake', 'lake', b(24, 55, 0.005), w), 'too small to be kept');
    assert.ok(boxKm2(24, 55, 24.02, 55.02) > 0.4 && boxKm2(24, 55, 24.005, 55.005) < 0.4);
    assert.ok(boxOverlaps(b(37.9, 62, 1), w) && !boxOverlaps(b(39, 62, 1), w));
  });
});

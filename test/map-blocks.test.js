// @ts-check
// Tests for the committed map data blocks (tools/map/pack.mjs writes them) and the credits made
// from them (tools/map/attribution.mjs): built by the tools, not edited by hand, sound, kept
// apart by licence, and with credits that are up to date.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { licenceProblems } from '../tools/build.mjs';
import { attributionInputs, creditsText, makeAttribution } from '../tools/map/attribution.mjs';
import { BLOCK_FILES, FINGERPRINTS, presentBlockFiles, ROOT, sha256, shippedBlockFiles } from '../tools/map/block.mjs';
import { loadMap, loadWater, noTimes } from '../src/ui/map/load.js';
import { SPECKLE_LIMITS, speckleTest } from '../tools/map/terrain-checks.mjs';
import { tagsOnAt } from '../src/ui/map/water-tiles.js';
import { blockLayers, decodeWater } from '../tools/map/water-hashes.mjs';

/** @param {string} path */
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
/** @param {string} kind */
const shipped = (kind) => {
  const file = shippedBlockFiles().find((f) => f.kind === kind);
  assert.ok(file, `no ${kind} block: run npm run map:pack`);
  return { path: file.path, block: JSON.parse(read(file.path)) };
};
const sources = JSON.parse(read('tools/map/sources.json')).sources;
/** @param {string} id */
const sourceOf = (id) => sources.find((/** @type {any} */ s) => s.id === id);

describe('the data blocks', () => {
  it('are the files the map tools wrote (fingerprints match, none missing or extra)', () => {
    const prints = JSON.parse(read(FINGERPRINTS));
    const present = presentBlockFiles().sort();
    assert.deepEqual(Object.keys(prints).sort(), present);
    for (const path of present) assert.equal(sha256(read(path)), prints[path], `${path} was changed by hand: run npm run map:pack`);
  });

  it('ship one block of each kind, each saying its licence, sources and notice', () => {
    assert.deepEqual(shippedBlockFiles().map((f) => f.kind), Object.keys(BLOCK_FILES));
    for (const { kind, path } of shippedBlockFiles()) {
      const b = JSON.parse(read(path));
      assert.equal(b.kind, kind);
      assert.equal(b.format, 1);
      assert.ok(b.licence && b.notice && b.sources.length, path);
      assert.ok(!b.notice.includes('//'), `${path}: the notice may not contain "//"`);
      for (const id of b.sources) assert.ok(sourceOf(id), `${path} names unknown source ${id}`);
    }
  });

  it('are all the real data: none is an interim stand-in, and the strict licence guard passes', () => {
    const blocks = shippedBlockFiles().map(({ kind, path }) => ({ kind, text: read(path) }));
    for (const { kind, text } of blocks) assert.ok(!JSON.parse(text).interim, `the ${kind} block is interim`);
    assert.deepEqual(licenceProblems(blocks, sources), []);
  });

  it('keep the licences apart: OpenStreetMap only in the ODbL folder, share-alike in by-sa', () => {
    for (const path of presentBlockFiles()) {
      const b = JSON.parse(read(path));
      const osm = b.sources.filter((/** @type {string} */ id) => sourceOf(id)?.collection === 'osm');
      if (path.startsWith('src/data/odbl/')) {
        assert.equal(b.licence, 'ODbL-1.0');
        assert.equal(osm.length, b.sources.length, `${path} mixes other data into the ODbL block`);
      } else {
        assert.equal(osm.length, 0, `${path} contains OpenStreetMap data outside src/data/odbl/`);
      }
      if (path.startsWith('src/data/by-sa/')) assert.equal(b.licence, 'CC-BY-SA-4.0');
      if (path.startsWith('src/data/by/')) assert.equal(b.licence, 'CC-BY-4.0');
      if (path.startsWith('src/data/map/')) assert.equal(b.licence, 'public-domain');
      const own = b.sources.filter((/** @type {string} */ id) => sourceOf(id)?.collection === 'own');
      if (path.startsWith('src/data/own/')) {
        assert.equal(b.licence, 'grind-strat-own');
        assert.equal(own.length, b.sources.length, `${path} holds data that is not our own`);
      }
    }
  });

  it('unpack into land, heights and terrain that fit the map', async () => {
    const { map } = await loadMap(shipped('base').block, shipped('terrain').block);
    assert.ok(map.land.length > 50);
    let points = 0;
    for (const ring of map.land) {
      points += ring.length / 2;
      for (let i = 0; i < ring.length; i += 2) assert.ok(ring[i] >= 0 && ring[i] <= map.width && ring[i + 1] >= 0 && ring[i + 1] <= map.height);
    }
    assert.equal(map.landLevels.length, points);
    assert.equal(map.heights.data.length, map.heights.cols * map.heights.rows);
    assert.ok(map.heights.cols * map.heights.cell >= map.width && map.heights.rows * map.heights.cell >= map.height);
    let deepest = 0; let highest = 0;
    for (const h of map.heights.data) { deepest = Math.min(deepest, h); highest = Math.max(highest, h); }
    // The Baltic's deepest hole is about 459 m; the map's land rises to a few hundred metres
    // (more in the Scandinavian corner).
    assert.ok(deepest < -200 && deepest > -700, `deepest ${deepest} m`);
    assert.ok(highest > 200 && highest < 2500, `highest ${highest} m`);
    assert.equal(map.terrain.data.length, map.terrain.cols * map.terrain.rows);
    assert.ok(map.terrain.cols * map.terrain.cell >= map.width && map.terrain.rows * map.terrain.cell >= map.height);
    const seen = new Set(map.terrain.data);
    for (const v of seen) assert.ok([0, 2, 3, 4, 5, 6].includes(v), `terrain class ${v}`);
    assert.ok(seen.has(0) && seen.has(3) && seen.has(5), 'sea, conifer forest and marsh are all there');
    assert.deepEqual([map.provinces.length, map.points.length], [0, 0], 'no made-up provinces or points ship');
  });

  it('paint the 1219 land in coherent patches, not salt and pepper', async () => {
    const { map } = await loadMap(shipped('base').block, shipped('terrain').block);
    const s = speckleTest(map.terrain.data, map.terrain.cols, map.terrain.rows);
    for (const [key, limit] of Object.entries(SPECKLE_LIMITS)) assert.ok(s[/** @type {keyof typeof SPECKLE_LIMITS} */ (key)] <= limit, `${key}: ${JSON.stringify(s)}`);
  });

  it('unpack into rivers and lakes with their names and levels', async () => {
    const { block } = shipped('water');
    const water = await loadWater(block, noTimes());
    const count = (/** @type {Int32Array[]} */ shapes) => shapes.reduce((n, s) => n + s.length / 2, 0);
    assert.equal(water.riverLevels.length, count(water.rivers));
    assert.equal(water.lakeLevels.length, count(water.lakes));
    for (const k of water.riverOf) assert.ok(k < water.riverInfo.length);
    for (const k of water.lakeOf) assert.ok(k < water.lakeInfo.length);
    // The names on the map: each river's own, and the local names of its stretches.
    const names = [...water.riverInfo.map((r) => r.name), ...water.lineNames];
    for (const must of [['Daugava'], ['Neman', 'Nemunas'], ['Vistula', 'Wisła'], ['Neris'], ['Nevėžis']]) {
      assert.ok(must.some((n) => names.includes(n)), `no river called ${must.join(' or ')}`);
    }
    for (const r of water.riverInfo) assert.ok(r.name, 'every river has a name');
    for (const l of water.lakeInfo) assert.ok(l.name, 'every lake has a name');
    for (const lake of water.lakeInfo) {
      assert.ok(lake.at[0] >= 0 && lake.at[0] <= 15724 && lake.at[1] >= 0 && lake.at[1] <= 13272, lake.name);
      assert.ok(lake.areaKm2 > 0, lake.name);
    }
    // Lakes around 1219: modern reservoirs out, natural lakes in, whatever Natural Earth's class
    // says. From M3a the reservoirs ship, tagged with their dates: none is shown at 1219.
    const tagged = block.sources.includes('osm-water') ? decodeWater(block) : null;
    const changes = shipped('changes').block;
    const entries = JSON.parse(new TextDecoder().decode(blockLayers(changes).info)).entries;
    const on1219 = tagged ? tagsOnAt(tagged.tags, entries, 1219) : null;
    const lakes = water.lakeInfo.filter((_, k) => !on1219 || on1219[/** @type {any} */ (tagged).lakeTag[k]]).map((l) => l.name);
    for (const gone of ['Kauno marios', 'Kiev Reservoir', 'Kremenchuk Reservoir', 'Київське водосховище', 'Elektrėnų marios', 'Narva veehoidla / Нарвское водохранилище', 'Kyivske vodoskhovyshche', 'Narva veehoidla']) {
      assert.ok(!lakes.includes(gone), `${gone} is a modern reservoir`);
    }
    assert.ok(!lakes.some((n) => /reservoir|vodoskhovyshch|vodokhranilishch|vadaskhovishch|водосховищ|водохранилищ|вадасховішч|zbiornik|ūdenskrātuv|veehoidla|stausee|talsperre/i.test(n)), 'no reservoir by name at 1219');
    if (tagged) {
      const all = water.lakeInfo.map((l) => l.name);
      for (const dated of ['Kauno marios', 'Jeziorsko']) assert.ok(all.includes(dated), `${dated} ships, tagged with its year`);
    }
    if (block.sources.includes('osm-water')) {
      for (const must of ['Lubāns', 'Võrtsjärv', 'Śniardwy', 'Ladoga', 'Ilmen', 'Kuršių marios', 'Zalew Wiślany', 'Drūkšiai', 'Peipsi']) {
        assert.ok(lakes.some((n) => n.includes(must)), `no lake called ${must}`);
      }
      // A lake's label is just its name, without the word for lake (Ignas, 11 October 2026);
      // where the name cannot stand alone, it keeps the word, written out.
      for (const plain of ['Ladoga', 'Ilmen', 'Narach', 'Plateliai', 'Galvė', 'Peipsi-Pihkva', 'Kozhanovskoye ozero', 'Jezioro Mikołajskie', 'Schweriner See (Außensee)']) {
        assert.ok(lakes.includes(plain), `no lake labelled ${plain}`);
      }
      for (const n of lakes) assert.ok(!/(^|\s)(ež|ez|jez|оз|воз)\.(\s|$)/.test(n), `an abbreviated word for lake: ${n}`);
      for (const bare of ['Platelių', 'Rāznas', 'Ozero Ilmen', 'Vozyera Narach', 'Zygmunta Augusta', 'Ilgės', 'Kozie', 'Shchuchye', 'Zaronovo', 'Großer Döllnsee']) {
        assert.ok(!lakes.includes(bare), `never ${bare}`);
      }
      for (const kept of ['Jezioro Zygmunta Augusta', 'Ilgės ežeras', 'Jezioro Kozie', 'Ozero Shchuchye', 'Zaronawskaye vozyera', 'Großdöllner See']) {
        assert.ok(lakes.includes(kept), `no lake labelled ${kept}`);
      }
      assert.ok(water.lineName && water.lineNames.length > 100, 'river stretches carry their local names');
      // Latin letters everywhere on the map (Ignas, 11 October 2026); the original names stay.
      const cyrillic = /[\u0400-\u052F]/;
      for (const n of [...names, ...lakes]) assert.ok(!cyrillic.test(n), `a label in Cyrillic: ${n}`);
      for (const n of [...names, ...lakes]) assert.ok(!/(^|\s)ež\.(\s|$)|\s\/\s/.test(n), `an untidy label: ${n}`);
      const rivers = water.riverInfo.map((r) => r.name);
      for (const main of ['Daugava', 'Nemunas', 'Neris', 'Wisła', 'Dnipro', 'Byarezina', 'Prypiat', 'Velikaya']) assert.ok(rivers.includes(main), `no river called ${main}`);
      assert.ok(!rivers.includes('Zapadnaya Dvina'), 'the Daugava is named at its lower end');
      for (const stretch of ['Nyoman', 'Viliya', 'Zakhodnyaya Dzvina', 'Dnyapro']) assert.ok(water.lineNames.includes(stretch), `no stretch called ${stretch}`);
      const nyoman = water.lineNames.indexOf('Nyoman');
      assert.equal(water.lineLocal[nyoman], 'Нёман', 'the original name stays in the data');
      const daugava = water.riverInfo.find((r) => r.name === 'Daugava');
      assert.equal(daugava?.names.ru, 'Западная Двина');
      assert.ok(water.lakeInfo.some((l) => l.name === 'Drūkšiai' && l.local === 'ež. Drūkšiai / возера Дрысвяты'));
    }
    if (block.sources.includes('ne-lakes')) {
      for (const must of ['Lake Ilmen', 'Mjøsa', 'Vistula Lagoon', 'Lake Peipus', 'Võrtsjärv']) assert.ok(lakes.includes(must), `no lake called ${must}`);
      assert.equal(lakes.filter((n) => n === 'Vistula Lagoon').length, 1, 'the lagoon\'s two halves are one lake');
    }
    // Biggest first: names are placed in this order.
    for (let i = 1; i < water.riverInfo.length; i++) assert.ok(water.riverInfo[i - 1].lengthKm >= water.riverInfo[i].lengthKm);
    for (let i = 1; i < water.lakeInfo.length; i++) assert.ok(water.lakeInfo[i - 1].areaKm2 >= water.lakeInfo[i].areaKm2);
  });
});

describe('the credits', () => {
  it('ATTRIBUTION.md and src/data/credits.json are up to date (npm run attribution)', async () => {
    const { markdown, credits } = makeAttribution(await attributionInputs());
    assert.equal(read('ATTRIBUTION.md'), markdown, 'ATTRIBUTION.md is stale: run npm run attribution');
    assert.equal(read('src/data/credits.json'), creditsText(credits), 'src/data/credits.json is stale: run npm run attribution');
  });

  it('credit every source the blocks use, and carry no web addresses into the game', () => {
    const credits = JSON.parse(read('src/data/credits.json'));
    const text = JSON.stringify(credits);
    assert.ok(!/https?:|\/\//.test(text), 'credits.json goes into the game code: no "https://" or "//"');
    const used = new Set(shippedBlockFiles().flatMap(({ path }) => JSON.parse(read(path)).sources));
    for (const id of used) {
      // Sources sharing a citation (SpatioCompo's four time windows) share one entry and its line.
      const { line, citation } = sourceOf(id).credit;
      assert.ok(credits.datasets.some((/** @type {any} */ d) => d.line === line || d.citation === citation), `${id} is not credited`);
    }
    assert.match(credits.mapLine, /GEBCO/);
    assert.match(credits.mapLine, /more$/);
    if (shippedBlockFiles().some((f) => f.path.startsWith('src/data/odbl/'))) {
      assert.match(credits.mapLine, /^© OpenStreetMap contributors/);
      assert.ok(credits.odblOffer?.includes('src/data/odbl/'));
    } else {
      // The map line names what is shown: no OpenStreetMap while none of its data ships.
      assert.doesNotMatch(credits.mapLine, /OpenStreetMap/);
      assert.equal(credits.odblOffer, null);
    }
    if (shipped('water').block.sources.includes('ne-rivers')) {
      assert.match(credits.mapLine, /Natural Earth/, 'the rivers, lakes and coast shown are Natural Earth\'s');
      assert.ok(credits.about.some((/** @type {string} */ l) => /Natural Earth's simpler set/.test(l) && /OpenStreetMap come next/.test(l)));
    }
    assert.equal(credits.interim.length, 0, 'no interim warning while every block is the real data');
    assert.match(credits.font.licenceName, /Open Font License/);
  });
});

describe('packing the OpenStreetMap water', () => {
  it('makes an ODbL block holding only OpenStreetMap, biggest first, with label points inside the lakes', async () => {
    const { osmWaterBlock, OSM_NOTICE } = await import('../tools/map/pack-water.mjs');
    const square = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ d) => [x, y, x + d, y, x + d, y + d, x, y + d];
    const block = osmWaterBlock({
      source: 'osm',
      licence: 'ODbL-1.0',
      osmBase: '2026-10-06T00:00:00Z',
      rivers: [
        { name: 'Small', names: {}, wikidata: null, lengthKm: 60, lines: [[100, 100, 200, 120, 300, 100]] },
        // Downstream: "Нёман" in Belarus, then "Nemunas" to the sea.
        { name: 'Нёман', names: { en: 'Neman', be: 'Нёман' }, wikidata: 'Q131574', lengthKm: 900, lines: [[0, 0, 500, 40, 1000, 0], [1000, 0, 1500, 30]], lineNames: ['Нёман', 'Nemunas'] },
      ],
      lakes: [
        { name: 'Island lake', names: {}, wikidata: null, areaKm2: 90, rings: [square(2000, 2000, 100), [2040, 2040, 2040, 2060, 2060, 2060, 2060, 2040]] },
      ],
    });
    assert.equal(block.licence, 'ODbL-1.0');
    assert.deepEqual(block.sources, ['osm-water']);
    assert.equal(block.notice, OSM_NOTICE);
    assert.ok(!block.interim);
    const water = await loadWater(/** @type {any} */ (block), noTimes());
    assert.deepEqual(water.riverInfo.map((r) => r.name), ['Nemunas', 'Small'], 'named at the lower end');
    assert.deepEqual(water.riverInfo[0].local, undefined);
    assert.deepEqual(water.lineNames, ['', 'Nyoman'], 'in Latin letters');
    assert.deepEqual(water.lineLocal, ['', 'Нёман'], 'with the original kept');
    assert.deepEqual(water.lineName && [...water.lineName], [1, 0, 0]);
    assert.deepEqual([...water.riverOf], [0, 0, 1]);
    assert.equal(water.lakes.length, 2, 'the island stays a hole in the lake');
    const [x, y] = water.lakeInfo[0].at;
    assert.ok(x > 2000 && x < 2100 && y > 2000 && y < 2100 && !(x > 2040 && x < 2060 && y > 2040 && y < 2060), 'the name sits on the water, not on the island');
  });
});

describe('making the credits', () => {
  const credit = (/** @type {string} */ short, /** @type {boolean} */ onMap) => ({
    owner: 'Someone', version: '1', short, onMap, line: `${short} line`, citation: `${short} citation`, changes: 'Reprojected.',
    licenceName: 'CC BY 4.0', licenceUri: 'creativecommons.org/licenses/by/4.0/',
  });
  const source = (/** @type {string} */ id, /** @type {string} */ collection, /** @type {any} */ c) => ({
    id, collection, url: `https://example.org/${id}`, file: id, what: id, licence: 'x', licenceUrl: 'x', licenceStatus: /** @type {'read'} */ ('read'), credit: c,
  });
  const ofl = 'Copyright 2020 The Grenze Gotisch Project Authors (https://github.com/Omnibus-Type/Grenze-Gotisch)\n';

  it('puts OpenStreetMap first on the map line and offers its data', () => {
    const { credits, markdown } = makeAttribution({
      sources: [source('g', 'gebco', credit('GEBCO', true)), source('o', 'osm', credit('© OpenStreetMap contributors', true))],
      blocks: [{ kind: 'base', path: 'src/data/map/base.json', block: { sources: ['g'], licence: 'public-domain', notice: 'n' } },
        { kind: 'water', path: 'src/data/odbl/water.json', block: { sources: ['o'], licence: 'ODbL-1.0', notice: 'n' } }],
      ofl,
    });
    assert.equal(credits.mapLine, '© OpenStreetMap contributors · GEBCO · more');
    assert.match(credits.odblOffer ?? '', /grind-strat, folder src\/data\/odbl\//);
    assert.ok(!JSON.stringify(credits).includes('https://'), 'the font line loses its scheme');
    assert.match(markdown, /### OpenStreetMap contributors/);
  });

  it('says exactly which credit fields a newly shipped source still needs', () => {
    const bare = { line: 'l', citation: 'c', changes: 'x', licenceName: 'ODbL', licenceUri: 'opendatacommons.org/licenses/odbl/1-0/' };
    assert.throws(() => makeAttribution({
      sources: [source('osm-water', 'osm', bare)],
      blocks: [{ kind: 'water', path: 'src/data/odbl/water.json', block: { sources: ['osm-water'], licence: 'ODbL-1.0', notice: 'n' } }],
      ofl,
    }), /osm-water: credit\.owner[\s\S]*osm-water: credit\.version[\s\S]*osm-water: credit\.short/);
  });
});

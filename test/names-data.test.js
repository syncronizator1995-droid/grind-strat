// @ts-check
// Tests for the names of rivers, lakes and seas over time (M3a, PR 2): the hand file
// (tools/map/names-of-the-time.json), the checks of tools/map/pack-names.mjs (each refuses an
// invented bad case) and our own block (src/data/own/names.json). No network, no data/raw files.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ROOT, blockText } from '../tools/map/block.mjs';
import { NAMES_BLOCK, namesBlock, namesProblems, normaliseOld, shippedInfo, todayTexts } from '../tools/map/pack-names.mjs';
import { romanize } from '../tools/map/romanize.mjs';
import { blockLayers, decodeWater } from '../tools/map/water-hashes.mjs';

/** @param {string} path */
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const hand = JSON.parse(read('tools/map/names-of-the-time.json'));
const water = decodeWater(JSON.parse(read('src/data/odbl/water.json')));
const sourcesMd = read('data/sources.md');
const shipped = JSON.parse(read(NAMES_BLOCK));
const info = JSON.parse(new TextDecoder().decode(blockLayers(shipped).info));
const clone = () => structuredClone(hand);
/** @param {any} h @param {string} wikidata */
const feature = (h, wikidata) => h.features.find((/** @type {any} */ f) => f.wikidata === wikidata);
/** @param {any} h */
const problems = (h) => namesProblems(h, water);
/** @param {RegExp} re @param {string[]} list */
const has = (re, list) => list.some((p) => re.test(p));

describe('the hand file and the shipped block', () => {
  it('has no problems, and the block is exactly what packing the file gives', () => {
    assert.deepEqual(problems(hand), []);
    const again = namesBlock(hand, water);
    assert.equal(blockText(again), read(NAMES_BLOCK), 'run node tools/map/pack-names.mjs');
  });

  it('is an early block of our own, with no addresses, Cyrillic or notes inside', () => {
    assert.equal(shipped.kind, 'names');
    assert.equal(shipped.licence, 'grind-strat-own');
    assert.deepEqual(shipped.sources, ['grind-strat-own']);
    const text = JSON.stringify(info);
    assert.ok(!/\/\/|http/.test(text) && !/[Ѐ-ӿ]/.test(text));
    assert.deepEqual(info, JSON.parse(JSON.stringify(shippedInfo(hand))));
    for (const f of info.features) for (const e of f.names) assert.ok(!('orig' in e) && !('note' in e));
  });

  it('lists every source in data/sources.md, with its link', () => {
    for (const [id, s] of Object.entries(hand.sources)) {
      assert.ok(sourcesMd.includes(`\`${id}\``), `${id} is in data/sources.md`);
      assert.ok(/^https:\/\//.test(s.url) && sourcesMd.includes(s.url), `${id}: its link is in data/sources.md`);
      assert.ok(s.edition && ['READ', 'SNIPPET'].includes(s.seen), id);
    }
    assert.ok(sourcesMd.includes('https://archive.org/details/heinrici-chronicon-livoniae-1955'));
    assert.ok(sourcesMd.includes('Complete_Collection_of_Russian_Chronicles_1923_Vol_2_Hypatian_Chronicle'));
    assert.ok(sourcesMd.includes('Duna, die Düna'));
  });

  it('covers the features of the spec, and honours the corrections', () => {
    const by = new Map(info.features.map((/** @type {any} */ f) => [f.wikidata, f]));
    for (const q of ['Q8197', 'Q207928', 'Q15288', 'Q19253', 'Q5611', 'Q5622']) assert.ok(by.has(q), q);
    assert.equal(info.features.length, 25);
    const names = (/** @type {string} */ q) => by.get(q).names.map((/** @type {any} */ e) => e.name);
    assert.ok(names('Q8197').includes('Duna') && names('Q207928').includes('Coiwa') && names('Q15288').includes('Ladozskoye ozero'));
    assert.ok(names('Q19253').includes('Chudskoye ozero') && names('Q5611').includes('Prigora') && names('Q5622').includes('Memela'));
    // Dusburg's Pregel is Prigore (III 103); Pregor is Pulkava's and Jeroschin's, not his.
    assert.ok(!names('Q5611').includes('Pregor'));
    // Lithuania keeps today's names: its region has the rule and no period.
    assert.equal(info.regions.find((/** @type {any} */ r) => r.id === 'lithuania').rule, 'today');
    assert.equal(info.periods.lithuania, undefined);
    // Mater Aquarum only in the two passages by Tartu; Memela from the river passage only.
    const mater = by.get('Q215378').names.find((/** @type {any} */ e) => e.name === 'Mater Aquarum');
    assert.equal(mater.where, 'XV 7 and XXIV 1');
    assert.equal(mater.gloss, 'Mother of Waters');
    assert.match(by.get('Q5622').names.find((/** @type {any} */ e) => e.name === 'Memela').where, /river only/);
    // The Rhymed Chronicle's Mimele, from its river passage (v. 3847), panel only like Memela.
    for (const n of ['Memela', 'Mimele']) assert.equal(by.get('Q5622').names.find((/** @type {any} */ e) => e.name === n).map, false, n);
    // Nevo is panel only and from the Hypatian copy; the Venta's Winda is panel only.
    const nevo = by.get('Q15288').names.find((/** @type {any} */ e) => e.name === 'Nevo');
    assert.equal(nevo.map, false); assert.equal(nevo.source, 'pvl-hypatian');
    assert.equal(by.get('Q215397').names.find((/** @type {any} */ e) => e.name === 'Winda').map, false);
    // Oddara is the form; Oddora is the scholium's.
    assert.equal(by.get('Q552').names.find((/** @type {any} */ e) => e.name === 'Oddara').map, undefined);
    // Ptolemy's forms are only ever disputed and off the map.
    for (const f of info.features) for (const e of f.names.filter((/** @type {any} */ x) => x.source === 'ptolemy')) {
      assert.deepEqual(e.marks, ['disputed']); assert.equal(e.map, false);
    }
    // No Saxo, no search-snippet forms.
    const all = JSON.stringify(info);
    for (const bad of ['Balticum fretum', 'Düna', 'Embach', 'Pregel', 'saxo']) assert.ok(!all.includes(bad), bad);
    // Ladoga shows the 1228 Novgorod form (attested 1228).
    assert.equal(by.get('Q15288').names.find((/** @type {any} */ e) => e.name === 'Ladozskoye ozero').attested, 1228);
  });

  it('stores no computed marks, and gives every period the later year as TO CHECK when it is 1400', () => {
    assert.ok(!/later source|standing in|stand-in/i.test(JSON.stringify(info)));
    for (const list of Object.values(info.periods)) for (const p of /** @type {any[]} */ (list)) if (p.to === 1400) assert.deepEqual(p.marks, ['TO CHECK']);
    const toCheck = [...info.features.flatMap((/** @type {any} */ f) => f.names), ...info.seas.flatMap((/** @type {any} */ s) => s.names)]
      .filter((/** @type {any} */ e) => e.marks?.includes('TO CHECK')).length
      + Object.values(info.periods).flat().filter((/** @type {any} */ p) => p.marks?.includes('TO CHECK')).length
      + info.seas.filter((/** @type {any} */ s) => s.marks?.includes('TO CHECK')).length;
    console.log(`names: ${toCheck} TO CHECK marks (${info.features.length} features, ${info.seas.length} seas)`);
    assert.ok(toCheck > 0);
  });

  it('keeps the seas: one default, two rings inside the map', () => {
    assert.equal(info.seas.filter((/** @type {any} */ s) => s.ring === null).length, 1);
    assert.equal(info.seas.find((/** @type {any} */ s) => s.ring === null).id, 'baltic');
    const baltic = info.seas.find((/** @type {any} */ s) => s.id === 'baltic').names.map((/** @type {any} */ e) => e.name);
    for (const n of ['Suebicum mare', 'Mare Balticum', 'Mare Barbarum', 'Pelagus Scithicum', 'More Varyazhskoye', 'Eystrasalt', 'Ostersê', 'Mare salsum']) assert.ok(baltic.includes(n), n);
    for (const s of info.seas.filter((/** @type {any} */ x) => x.ring)) assert.ok(s.ring.length >= 6 && s.ring.length % 2 === 0);
  });
});

describe('the checks of pack-names.mjs each refuse a bad invented case', () => {
  it('1: ids, languages, sources, years', () => {
    let h = clone(); h.features[0].names[0].source = 'nobody';
    assert.ok(has(/unknown source nobody/, problems(h)));
    h = clone(); h.features[0].names[0].language = 'xx';
    assert.ok(has(/unknown language xx/, problems(h)));
    h = clone(); h.features[0].names[0].region = 'atlantis';
    assert.ok(has(/unknown region atlantis/, problems(h)));
    h = clone(); h.sources.Bad_Id = h.sources.henry;
    assert.ok(has(/kebab-case/, problems(h)));
    h = clone(); h.features[0].names[0].attested = 0;
    assert.ok(has(/bad year attested 0/, problems(h)));
    h = clone(); h.features[0].names[0].from = 1300; h.features[0].names[0].to = 1200;
    assert.ok(has(/runs on to/, problems(h)));
    h = clone(); h.periods.prussia[0].from = 1.5;
    assert.ok(has(/bad period years/, problems(h)));
  });

  it('2: periods sorted, not overlapping, with sources; a today region has none', () => {
    let h = clone(); h.periods.livonia[1].from = 1280;
    assert.ok(has(/not sorted or they overlap/, problems(h)));
    h = clone(); h.periods.livonia.reverse();
    assert.ok(has(/not sorted or they overlap/, problems(h)));
    h = clone(); h.periods.livonia[0].source = 'nobody';
    assert.ok(has(/unknown source nobody/, problems(h)));
    h = clone(); h.periods.lithuania = [{ from: 1219, to: 1400, language: 'la', source: 'dusburg', marks: ['TO CHECK'] }];
    assert.ok(has(/'today' region has no periods/, problems(h)));
    h = clone(); delete h.periods.rus[0].marks;
    assert.ok(has(/1400 is a game choice/, problems(h)));
  });

  it('3: each key matches exactly one feature; stretches exist; a group has one region', () => {
    let h = clone(); feature(h, 'Q8197').wikidata = 'Q1';
    assert.ok(has(/matches 0 features/, problems(h)));
    // A QID shared by two rivers fails: invent a water with a clone of one river.
    const w2 = { ...water, riverInfo: [...water.riverInfo, { ...water.riverInfo.find((/** @type {any} */ r) => r.wikidata === 'Q8197') }] };
    assert.ok(has(/matches 2 features/, namesProblems(hand, w2)));
    h = clone(); feature(h, 'Q8197').names[0].stretches = ['Nowhere'];
    assert.ok(has(/no stretch text "Nowhere"/, problems(h)));
    h = clone(); feature(h, 'Q207928').names.push({ region: 'prussia', name: 'Other', language: 'la', source: 'dusburg' });
    assert.ok(has(/several regions/, problems(h)));
    h = clone(); feature(h, 'Q15288').names[0].stretches = ['Ladoga'];
    assert.ok(has(/a lake has no stretches/, problems(h)));
    h = clone(); h.features.push(structuredClone(feature(h, 'Q645')));
    assert.ok(has(/listed twice/, problems(h)));
  });

  it('4: windows of forms shown on the map do not overlap, per group and language', () => {
    let h = clone(); feature(h, 'Q207928').names.push({ region: 'livonia', name: 'Goiwa', language: 'la', source: 'henry' });
    assert.ok(has(/share years/, problems(h)));
    // With their own years, or off the map, they are fine.
    h = clone(); const g = feature(h, 'Q207928'); g.names[0].to = 1250; g.names.push({ region: 'livonia', name: 'Goiwa', language: 'la', source: 'henry', from: 1250 });
    assert.deepEqual(problems(h), []);
    h = clone(); feature(h, 'Q207928').names.push({ region: 'livonia', name: 'Goiwa', language: 'la', source: 'henry', map: false });
    assert.deepEqual(problems(h), []);
  });

  it('5: names in Latin letters, with a capital, and Old East Slavic ones checked against the form read', () => {
    let h = clone(); feature(h, 'Q207928').names[0].name = 'Койва';
    assert.ok(has(/Latin letters only/, problems(h)));
    h = clone(); feature(h, 'Q207928').names[0].name = 'coiwa';
    assert.ok(has(/capital letter/, problems(h)));
    h = clone(); feature(h, 'Q645').names[0].name = "Nev'a";
    assert.ok(has(/not the romanisation/, problems(h)));
    h = clone(); feature(h, 'Q645').names[0].name = 'Nyeva';
    assert.ok(has(/not the romanisation/, problems(h)));
    h = clone(); delete feature(h, 'Q645').names[0].orig;
    assert.ok(has(/needs orig/, problems(h)));
    h = clone(); delete h.sources['npl-synodal'].copy;
    assert.ok(has(/names its copy/, problems(h)));
    h = clone(); feature(h, 'Q207928').names[0].orig = 'Коива';
    assert.ok(has(/orig is only for Old East Slavic/, problems(h)));
  });

  it('6: a lake name with a lake word must not be one that loses it on the map', () => {
    let h = clone(); feature(h, 'Q211516').names[0].name = 'Ozero Peipsi';
    assert.ok(has(/lose its lake word/, problems(h)));
    h = clone(); feature(h, 'Q211516').names[0].name = 'Ozero Worcegerwe';
    assert.ok(has(/lose its lake word/, problems(h)));
    assert.deepEqual(problems(clone()), []); // Chudskoye ozero passes: the word comes last
  });

  it('7: marks, disputed forms off the map, years of writing', () => {
    let h = clone(); feature(h, 'Q207928').names[0].marks = ['sure'];
    assert.ok(has(/unknown mark sure/, problems(h)));
    h = clone(); feature(h, 'Q207928').names[0].marks = ['disputed'];
    assert.ok(has(/disputed form is panel only/, problems(h)));
    h = clone(); delete feature(h, 'Q645').names[0].attested;
    assert.ok(has(/needs attested/, problems(h)));
    h = clone(); feature(h, 'Q207928').names[0].map = true;
    assert.ok(has(/only ever false/, problems(h)));
  });

  it('8: no addresses in shipped text; seas have one default, rings inside the map, honest origins', () => {
    let h = clone(); feature(h, 'Q207928').names[0].where = 'see https://example.org';
    assert.ok(has(/web address/, problems(h)));
    h = clone(); feature(h, 'Q207928').names[0].gloss = 'a//b';
    assert.ok(has(/web address/, problems(h)));
    h = clone(); h.seas[1].degrees = undefined;
    assert.ok(has(/exactly one sea has no ring/, problems(h)));
    h = clone(); h.seas[1].degrees = [[22, 57], [23, 58]];
    assert.ok(has(/at least 3 points/, problems(h)));
    h = clone(); h.seas[1].degrees[0] = [5, 57];
    assert.ok(has(/outside the map/, problems(h)));
    h = clone(); h.seas[1].drawnFrom = 'traced from OpenStreetMap water';
    assert.ok(has(/mentions OpenStreetMap/, problems(h)));
    h = clone(); h.seas[1].drawnFrom = '';
    assert.ok(has(/needs drawnFrom/, problems(h)));
    assert.throws(() => namesBlock(h, water), /drawnFrom/);
  });
});

describe('the spelling helper and the stretch rule', () => {
  it('turns old spelling plain, and BGN/PCGN gives the names', () => {
    assert.equal(normaliseOld('Днѣпръ'), 'Днепр');
    assert.equal(normaliseOld('Чюдьское'), 'Чудское');
    assert.equal(normaliseOld('соуд ѿ'), 'суд от');
    assert.equal(normaliseOld('Ѣ ѧ ѡ ѳ і'), 'Е я о ф и');
    assert.equal(romanize(normaliseOld('Чюдьское озеро'), 'ru'), 'Chudskoye ozero');
    assert.equal(romanize(normaliseOld('Ладозьское озѣро'), 'ru'), 'Ladozskoye ozero');
    assert.equal(romanize(normaliseOld('Море Варяжьское'), 'ru'), 'More Varyazhskoye');
  });

  it('knows the stretch texts of the shipped Daugava and its borders', () => {
    const texts = todayTexts(water);
    const ri = water.riverInfo.findIndex((/** @type {any} */ r) => r.wikidata === 'Q8197');
    const set = /** @type {Set<string>} */ (texts.get(ri));
    for (const t of ['Daugava', 'Zapadnaya Dvina', 'Zakhodnyaya Dzvina']) assert.ok(set.has(t), t);
  });
});

// @ts-check
// Tests for a lake's label, just its name without the word for lake (Ignas, 11 October 2026):
// tools/map/lake-names.mjs and its use in tools/map/water-labels.mjs. Names as OpenStreetMap
// writes them, with made-up tags and lists where a rule needs them.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findLakeWord, LAKE_LIST, LAKE_WORDS, lakeName, plainFromData, plainFromList, standsAlone } from '../tools/map/lake-names.mjs';
import { tidyItem, tidyName, waterLabels } from '../tools/map/water-labels.mjs';

/** The label before romanising. @param {string} name @param {Parameters<typeof lakeName>[1]} [data] */
const label = (name, data) => lakeName(name, data).text;
/** How the label was made. @param {string} name @param {Parameters<typeof lakeName>[1]} [data] */
const kind = (name, data) => lakeName(name, data).kind;

describe('the word for lake', () => {
  it('is found as a separate first or last word, in every language on the map', () => {
    for (const [name, word, at] of /** @type {[string, string, string][]} */ ([
      ['озеро Ильмень', 'озеро', 'before'], ['Кожановское озеро', 'озеро', 'after'], ['возера Нарач', 'возера', 'before'],
      ['оз. Неро', 'оз.', 'before'], ['ozero Ilmen', 'ozero', 'before'], ['vozyera Narach', 'vozyera', 'before'],
      ['Jezioro Śniardwy', 'Jezioro', 'before'], ['jez. Wigry', 'jez.', 'before'], ['ež. Drūkšiai', 'ež.', 'before'],
      ['Platelių ežeras', 'ežeras', 'after'], ['Rāznas ezers', 'ezers', 'after'], ['Peipsi järv', 'järv', 'after'],
      ['Schweriner See', 'See', 'after'], ['Tingstäde träsk', 'träsk', 'after'],
    ])) {
      const w = findLakeWord(name);
      assert.equal(w?.word, word, name);
      assert.equal(w?.at, at, name);
    }
  });

  it('is not found inside a compound, alone, or in the middle of a longer name', () => {
    for (const name of ['Vänern', 'Mjøsa', 'Päijänne', 'Võrtsjärv', 'Storsjön', 'Ilmensee', 'Mälaren', 'ežeras', 'Schweriner See (Außensee)', 'Barleber See I']) {
      assert.equal(findLakeWord(name), null, name);
    }
  });

  it('knows each language\'s words, and writes abbreviations out', () => {
    for (const w of ['озеро', 'возера', 'ozero', 'vozyera', 'ozera', 'jezioro', 'ežeras', 'ezers', 'järv', 'see']) assert.ok(LAKE_WORDS[w], w);
    assert.equal(findLakeWord('Platelių ež.')?.full, 'ežeras');
    assert.equal(findLakeWord('Galvės ez.')?.full, 'ezers');
    assert.equal(findLakeWord('Plauer See')?.full, 'See', 'a whole word keeps its capital');
  });
});

describe('can the name stand alone', () => {
  /** @param {string} name */
  const alone = (name) => standsAlone(/** @type {import('../tools/map/lake-names.mjs').LakeWord} */ (findLakeWord(name)));

  it('Russian, Belarusian, Ukrainian: a noun after the word, never an adjective or a name before it', () => {
    assert.deepEqual(alone('озеро Ильмень'), { alone: true });
    assert.deepEqual(alone('возера Нарач'), { alone: true });
    assert.deepEqual(alone('озеро Заозерье'), { alone: true }, 'a noun in -ье');
    assert.deepEqual(alone('Кожановское озеро'), { alone: false, why: 'adjective' });
    assert.deepEqual(alone('озеро Лучанское'), { alone: false, why: 'adjective' });
    assert.deepEqual(alone('возера Белае'), { alone: false, why: 'adjective' });
    assert.deepEqual(alone('Святе озеро'), { alone: false, why: 'adjective' });
  });

  it('Polish: a noun, not a neuter adjective', () => {
    assert.deepEqual(alone('Jezioro Śniardwy'), { alone: true });
    assert.deepEqual(alone('Jezioro Pławniowice'), { alone: true }, 'a plural noun in -ice');
    assert.deepEqual(alone('Jezioro Mikołajskie'), { alone: false, why: 'adjective' });
    assert.deepEqual(alone('Jezioro Białe'), { alone: false, why: 'adjective' });
  });

  it('Lithuanian: a nominative after ež., a genitive before it', () => {
    assert.deepEqual(alone('ež. Drūkšiai'), { alone: true });
    assert.deepEqual(alone('Platelių ež.'), { alone: false, why: 'genitive' });
    assert.deepEqual(alone('Rėkyvos ežeras'), { alone: false, why: 'genitive' });
    assert.deepEqual(alone('ež. Gačionių'), { alone: false, why: 'genitive' }, 'a genitive plural wherever it stands');
    assert.deepEqual(alone('Balandis ež.'), { alone: true }, 'a nominative ending before the word');
  });

  it('Latvian: always a genitive; Estonian: the name itself; German: not an adjective in -er', () => {
    assert.deepEqual(alone('Rāznas ezers'), { alone: false, why: 'genitive' });
    assert.deepEqual(alone('Peipsi järv'), { alone: true });
    assert.deepEqual(alone('Schweriner See'), { alone: false, why: 'adjective' });
    assert.deepEqual(alone('Jabel See'), { alone: true });
  });

  it('Swedish: not an adjective that begins a name, nor a genitive', () => {
    assert.deepEqual(alone('Tingstäde träsk'), { alone: true });
    assert.deepEqual(alone('Stora sjö'), { alone: false, why: 'adjective' });
    assert.deepEqual(alone('Hjälmarens sjö'), { alone: false, why: 'genitive' });
  });
});

describe('a lake\'s label', () => {
  it('drops the word for lake where the name stands alone', () => {
    assert.equal(label('озеро Ильмень'), 'Ильмень');
    assert.equal(label('возера Нарач'), 'Нарач');
    assert.equal(label('ozero Ilmen'), 'Ilmen');
    assert.equal(label('Jezioro Śniardwy'), 'Śniardwy');
    assert.equal(label('Peipsi järv'), 'Peipsi');
    assert.equal(label('ež. Drūkšiai'), 'Drūkšiai');
    assert.equal(kind('Peipsi järv'), 'dropped');
    assert.match(lakeName('Peipsi järv').rule, /"järv" left out/);
  });

  it('leaves a name with no word for lake as it is', () => {
    for (const name of ['Võrtsjärv', 'Lubāns', 'Śniardwy', 'Kuršių marios']) assert.deepEqual(lakeName(name), { text: name, kind: null, rule: '' });
  });

  it('keeps an adjective in full, with a capital and the word written out', () => {
    assert.equal(label('Кожановское озеро', { list: [] }), 'Кожановское озеро');
    assert.equal(label('озеро Лучанское', { list: [] }), 'Озеро Лучанское');
    assert.equal(label('Jezioro Mikołajskie', { list: [] }), 'Jezioro Mikołajskie');
    assert.equal(label('jezioro Wisztynieckie', { list: [] }), 'Jezioro Wisztynieckie');
    assert.equal(label('Schweriner See', { list: [] }), 'Schweriner See');
    assert.equal(kind('Schweriner See', { list: [] }), 'kept');
  });

  it('never leaves a bare genitive nor an abbreviation: the full name, written out', () => {
    assert.equal(label('Platelių ež.', { list: [] }), 'Platelių ežeras');
    assert.equal(label('Rāznas ezers', { list: [] }), 'Rāznas ezers');
    assert.equal(label('ež. Gačionių', { list: [] }), 'Gačionių ežeras', 'a Lithuanian genitive goes before the word');
    assert.equal(label('Kumpinišķu ez.', { list: [] }), 'Kumpinišķu ezers');
  });

  it('takes the plain name from the lake\'s own tags when it is the same name', () => {
    assert.equal(label('Ладожское озеро', { other: { alt_name: 'Ладога' } }), 'Ладога');
    assert.equal(label('Galvės ež.', { other: { alt_name: 'Galvė' } }), 'Galvė');
    assert.equal(label('Cirīša ezers', { other: { alt_name: 'Cirīšs' } }), 'Cirīšs');
    assert.equal(label('Чарсцвяцкае возера', { other: { 'alt_name:be': 'возера Чарсцвяты;возера Чарсцвяды' } }), 'Чарсцвяты', 'a name whose own word for lake drops');
    const l = lakeName('Ладожское озеро', { other: { alt_name: 'Ладога' } });
    assert.equal(l.kind, 'data');
    assert.match(l.rule, /alt_name.*an adjective/);
  });

  it('refuses a name from the tags that is another name, an adjective, a genitive or in another script', () => {
    const none = { list: [] };
    assert.equal(label('Asvejos ež.', { ...none, other: { alt_name: 'Dubingių ež.' } }), 'Asvejos ežeras', 'another name');
    assert.equal(label('Суходольское озеро', { ...none, other: { alt_name: 'Суванто' } }), 'Суходольское озеро', 'another name');
    assert.equal(label('Jezioro Białe', { ...none, other: { alt_name: 'Białe' } }), 'Jezioro Białe', 'no plainer');
    assert.equal(label('Platelių ež.', { ...none, other: { alt_name: 'Platelių' } }), 'Platelių ežeras', 'a genitive itself');
    assert.equal(label('Rėkyvos ež.', { ...none, other: { alt_name: 'Рекивос' } }), 'Rėkyvos ežeras', 'another script');
    const w = /** @type {import('../tools/map/lake-names.mjs').LakeWord} */ (findLakeWord('Rāznas ezers'));
    assert.equal(plainFromData(w, { lv: 'Rāznas ezers' }, {}), null, 'its own name again');
  });

  it('then takes the plain name from the reviewed list, saying when it is TO CHECK', () => {
    const list = [{ lang: /** @type {const} */ ('lt'), name: 'Platelių', plain: 'Plateliai', toCheck: true, why: 'test' }];
    const l = lakeName('Platelių ež.', { list });
    assert.deepEqual([l.text, l.kind], ['Plateliai', 'list']);
    assert.match(l.rule, /reviewed list \(TO CHECK\)/);
    const w = /** @type {import('../tools/map/lake-names.mjs').LakeWord} */ (findLakeWord('Platelių ež.'));
    assert.equal(plainFromList(w, list)?.plain, 'Plateliai');
    assert.equal(plainFromList({ ...w, langs: ['lv'] }, list), null, 'only in its own language');
    assert.equal(label('Galvės ež.', { list: [{ lang: 'lt', name: 'Galvės', plain: 'X', toCheck: true, why: '' }], other: { alt_name: 'Galvė' } }), 'Galvė', 'the data first');
  });

  it('the shipped list: well formed, each entry a name that cannot stand alone', () => {
    assert.ok(LAKE_LIST.length > 0);
    for (const e of LAKE_LIST) {
      assert.equal(typeof e.toCheck, 'boolean', e.name);
      assert.ok(e.plain && e.why, e.name);
      assert.equal(findLakeWord(e.plain), null, `${e.plain} has no word for lake`);
      const word = Object.entries(LAKE_WORDS).find(([, v]) => v.langs[0] === e.lang)?.[0];
      assert.ok(word, `${e.lang} has a word for lake`);
      const w = /** @type {import('../tools/map/lake-names.mjs').LakeWord} */ (findLakeWord(`${e.name} ${word}`));
      assert.equal(standsAlone(w).alone, false, `${e.name} needs the list`);
    }
    assert.equal(label('Platelių ež.'), 'Plateliai');
    assert.equal(label('Rāznas ezers'), 'Rāzna');
  });
});

describe('lake labels on the map', () => {
  it('leave the word for lake to the lake rule, and rivers lose abbreviations as before', () => {
    assert.equal(tidyName('Platelių ež.', {}, { keepLakeWords: true }).text, 'Platelių ež.');
    assert.equal(tidyName('Platelių ež.').text, 'Platelių');
    const t = tidyItem({ name: 'Vištyčio ež. / Виштынецкое озеро', names: {}, x: 0, y: 0, lake: { other: {} } });
    assert.deepEqual([t.text, t.named, t.lake], ['Vištytis', 'Vištyčio ež.', 'list']);
    const river = tidyItem({ name: 'up. Šventoji', names: {}, x: 0, y: 0 });
    assert.deepEqual([river.text, river.lake], ['Šventoji', null]);
  });

  it('are romanised in the language of the full name, and say how they were made', () => {
    const ring = [[0, 0, 10, 0, 10, 10]];
    const labels = waterLabels([], [
      { name: 'возера Нарач', names: {}, rings: ring },
      { name: 'озеро Ильмень', names: {}, rings: ring },
      { name: 'Лукомскае возера', names: {}, rings: ring },
      { name: 'Кожановское озеро', names: {}, rings: ring },
      { name: 'Асвейскае возера', names: {}, otherNames: { 'alt_name:be': 'Асвея' }, rings: ring },
      { name: 'Platelių ež.', names: {}, rings: ring },
      { name: 'Lubāns', names: {}, rings: ring },
    ]).lakes;
    assert.deepEqual(labels.map((l) => [l.text, l.lake]), [
      ['Narach', 'dropped'], ['Ilmen', 'dropped'], ['Lukomskaye vozyera', 'kept'], ['Kozhanovskoye ozero', 'kept'],
      ['Asvyeya', 'data'], ['Plateliai', 'list'], ['Lubāns', null],
    ]);
    assert.deepEqual(labels.slice(0, 2).map((l) => l.lang), ['be', 'ru'], 'возера is Belarusian, even when it is dropped');
    assert.equal(labels[0].local, 'возера Нарач', 'the original stays');
  });
});

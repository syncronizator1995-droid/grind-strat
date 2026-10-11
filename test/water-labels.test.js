// @ts-check
// Tests for the labels of OpenStreetMap's rivers and lakes (tools/map/water-labels.mjs): one name
// per label, abbreviations left out, Latin letters everywhere, the language of a doubtful name
// from the names around it, and a river's main name from its lower end. Made-up data only.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { labelNames, lowerEndName, nearbyLanguage, tidyName, waterLabels } from '../tools/map/water-labels.mjs';

describe('one tidy name per label', () => {
  it('shows one part of a name that joins two languages: the first in Latin letters', () => {
    assert.equal(tidyName('Peipsi-Pihkva järv - Псковско-Чудское озеро').text, 'Peipsi-Pihkva järv');
    assert.equal(tidyName('Neris - Вілія').text, 'Neris');
    assert.equal(tidyName('Nemunas / Немунас').text, 'Nemunas');
    assert.equal(tidyName('Нёман / Nemunas').text, 'Nemunas');
    assert.equal(tidyName('Šešupė / Шешупе /').text, 'Šešupė');
    assert.equal(tidyName('Дняпро / Дніпро').text, 'Дняпро', 'no Latin part: the first');
    assert.match(tidyName('Neris - Вілія').rule, /first in Latin letters/);
  });

  it('leaves out abbreviations such as Lithuanian ež.', () => {
    assert.deepEqual(tidyName('ež. Drūkšiai / возера Дрысвяты'), { text: 'Drūkšiai', rule: 'two names: the first in Latin letters; abbreviation left out' });
    assert.equal(tidyName('Platelių ež.').text, 'Platelių');
    assert.equal(tidyName('ež.').text, 'ež.', 'never down to nothing');
  });

  it('keeps a hyphen inside a word, and one listed name with a spaced dash, as one name', () => {
    assert.equal(tidyName('Peipsi-Pihkva järv').text, 'Peipsi-Pihkva järv');
    assert.equal(tidyName('Jezioro Łódzko - Dymaczewskie').text, 'Jezioro Łódzko-Dymaczewskie');
  });
});

describe('labels in Latin letters', () => {
  it('romanises by the name\'s own tags and keeps the original', () => {
    const [l] = labelNames([{ name: 'Нёман', names: { be: 'Нёман', ru: 'Неман' }, x: 0, y: 0 }]);
    assert.deepEqual(l, { text: 'Nyoman', local: 'Нёман', lang: 'be', rule: 'name:be' });
  });

  it('takes the language of the names around a name whose own tags and letters leave it in doubt', () => {
    /** @type {import('../tools/map/water-labels.mjs').NameItem[]} */
    const items = [
      { name: 'Свіслач', names: {}, x: 0, y: 0 }, // і without и: in doubt (Belarusian or Ukrainian)
      { name: 'Ваўкушанка', names: {}, x: 100, y: 0 }, // ў: surely Belarusian
      { name: 'Нарач', names: { be: 'Нарач' }, x: 0, y: 100 },
      { name: 'Мухавец', names: {}, x: 50, y: 50 }, // no telling letter
      { name: 'Волга', names: {}, x: 90000, y: 0 }, // far from everything: a guess
    ];
    const labels = labelNames(items);
    assert.equal(labels[3].text, 'Mukhavyets');
    assert.match(labels[3].rule, /^names nearby: be \(2 of 2 within 150 km\)$/);
    assert.equal(labels[0].text, 'Svislach');
    assert.equal(labels[4].text, 'Volga');
    assert.match(labels[4].rule, /a guess/);
  });

  it('counts only neighbours in a language the name can be in, and leaves a tie to the letters', () => {
    const known = [{ x: 0, y: 0, lang: /** @type {const} */ ('be') }, { x: 10, y: 0, lang: /** @type {const} */ ('uk') }, { x: 20, y: 0, lang: /** @type {const} */ ('be') }];
    assert.equal(nearbyLanguage(known, 0, 0)?.lang, 'be');
    assert.equal(nearbyLanguage(known, 0, 0, ['ru', 'uk'])?.lang, 'uk', '"Горинь" has и: not Belarusian');
    assert.equal(nearbyLanguage(known.slice(0, 2), 0, 0), null);
    assert.equal(nearbyLanguage(known, 5000, 0), null, 'nothing within 150 km');
  });
});

describe('a river\'s main name: the local name at its lower end', () => {
  // Lines run downstream, as OpenStreetMap draws them. "Заходняя Дзвіна" is not among the
  // river's name tags (name:be is "Дзвіна"), but it carries a quarter of the river's length.
  const dvina = {
    name: 'Западная Двина',
    names: { lv: 'Daugava', be: 'Дзвіна', ru: 'Западная Двина' },
    lines: [[0, 0, 500, 0, 1000, 0], [1000, 0, 1600, 0], [1600, 0, 1800, 0], [1800, 0, 2400, 0], [2400, 0, 2410, 5]],
    lineNames: ['Западная Двина', 'Заходняя Дзвіна', 'Daugava / Заходняя Дзвіна', 'Daugava', 'Gļinovka'],
  };

  it('follows the river under its other names to the sea, not into a short arm with a name of its own', () => {
    const end = lowerEndName(dvina);
    assert.equal(end.name, 'Daugava');
    assert.deepEqual(end.path, ['Западная Двина', 'Заходняя Дзвіна', 'Daugava / Заходняя Дзвіна', 'Daugava']);
  });

  it('stops where the river splits into arms with other names (a delta)', () => {
    const delta = { name: 'Великая', names: {}, lines: [[0, 0, 1000, 0], [1000, 0, 1100, 50], [1000, 0, 1100, -50]], lineNames: ['Великая', 'Гладышная', 'Средняя'] };
    assert.equal(lowerEndName(delta).name, 'Великая');
  });

  it('uses the single name above a two-language end, and the last named stretch above an unnamed one', () => {
    const oder = { name: 'Odra', names: {}, lines: [[0, 0, 1000, 0], [1000, 0, 1300, 0]], lineNames: ['Odra', 'Oder/Odra'] };
    assert.equal(lowerEndName(oder).name, 'Odra');
    const unnamed = { name: 'Upė', names: {}, lines: [[0, 0, 1000, 0], [1000, 0, 1300, 0]], lineNames: ['Upė', ''] };
    assert.equal(lowerEndName(unnamed).name, 'Upė');
  });

  it('labels the whole river: main name, stretches and lakes, all in Latin letters', () => {
    const labels = waterLabels([dvina], [{ name: 'ež. Drūkšiai / возера Дрысвяты', names: {}, rings: [[0, 0, 10, 0, 10, 10]] }]);
    const river = labels.rivers[0];
    assert.equal(river.main.text, 'Daugava');
    assert.equal(river.stretch.get('Западная Двина')?.text, 'Zapadnaya Dvina');
    assert.equal(river.stretch.get('Заходняя Дзвіна')?.text, 'Zakhodnyaya Dzvina');
    assert.equal(river.stretch.get('Daugava / Заходняя Дзвіна')?.text, 'Daugava');
    assert.deepEqual(labels.lakes.map((l) => [l.text, l.local]), [['Drūkšiai', 'ež. Drūkšiai / возера Дрысвяты']]);
  });
});

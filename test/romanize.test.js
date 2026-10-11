// @ts-check
// Tests for writing Russian, Belarusian and Ukrainian names in Latin letters (BGN/PCGN, soft and
// hard signs left out) and for choosing the language of each name: tools/map/romanize.mjs.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chooseLanguage, guessLanguage, hasCyrillic, possibleLanguages, romanize, sureLanguage, toLatin } from '../tools/map/romanize.mjs';

describe('romanising by the BGN/PCGN systems', () => {
  it('writes the examples Ignas agreed', () => {
    /** @type {[string, 'ru' | 'be' | 'uk', string][]} */
    const examples = [
      ['Нёман', 'be', 'Nyoman'], ['Дняпро', 'be', 'Dnyapro'], ['Дніпро', 'uk', 'Dnipro'], ['Днепр', 'ru', 'Dnepr'],
      ['Великая', 'ru', 'Velikaya'], ['Волхов', 'ru', 'Volkhov'], ['Ловать', 'ru', 'Lovat'], ['Прыпяць', 'be', 'Prypyats'],
      ["Прип'ять", 'uk', 'Prypiat'], ['Бярэзіна', 'be', 'Byarezina'], ['Вілія', 'be', 'Viliya'],
      ['Заходняя Дзвіна', 'be', 'Zakhodnyaya Dzvina'], ['Западная Двина', 'ru', 'Zapadnaya Dvina'], ['Нарва', 'ru', 'Narva'],
    ];
    for (const [cyr, lang, latin] of examples) assert.equal(romanize(cyr, lang), latin, `${cyr} (${lang})`);
  });

  it('writes Russian е and ё as ye and yë at the start of a word, after a vowel, й, ъ or ь, else e and ë', () => {
    assert.equal(romanize('Енисей', 'ru'), 'Yenisey');
    assert.equal(romanize('Ёлкино', 'ru'), 'Yëlkino');
    assert.equal(romanize('Нёман', 'ru'), 'Nëman');
    assert.equal(romanize('Подъезд', 'ru'), 'Podyezd', 'ъ left out, е after it is ye');
    assert.equal(romanize('Подолье', 'ru'), 'Podolye', 'ь left out, е after it is ye');
    assert.equal(romanize('Чудское', 'ru'), 'Chudskoye');
    assert.equal(romanize('Щорс', 'ru'), 'Shchors');
    assert.equal(romanize('Ильмень', 'ru'), 'Ilmen');
    assert.equal(romanize('Майский', 'ru'), 'Mayskiy');
  });

  it('writes Belarusian г as h, ў as w, and е, ё, ю, я always with y', () => {
    assert.equal(romanize('Гомель', 'be'), 'Homyel');
    assert.equal(romanize('Магілёў', 'be'), 'Mahilyow');
    assert.equal(romanize('Віцебск', 'be'), 'Vitsyebsk');
    assert.equal(romanize('Брэст', 'be'), 'Brest');
    assert.equal(romanize('Мінск', 'be'), 'Minsk');
  });

  it('writes Ukrainian є, ї, й, ю, я one way at the start of a word and another inside it, and зг as zgh', () => {
    assert.equal(romanize('Київ', 'uk'), 'Kyiv');
    assert.equal(romanize('Їжакевич', 'uk'), 'Yizhakevych');
    assert.equal(romanize('Юрій', 'uk'), 'Yurii');
    assert.equal(romanize('Згорани', 'uk'), 'Zghorany');
    assert.equal(romanize('Знам’янка', 'uk'), 'Znamianka', 'apostrophe left out, я after it inside the word');
    assert.equal(romanize('Припʼять', 'uk'), 'Prypiat', 'the modifier-letter apostrophe too');
    assert.equal(romanize('Єнакієве', 'uk'), 'Yenakiieve');
    assert.equal(romanize('Гусятин', 'uk'), 'Husiatyn');
  });

  it('keeps capitals: only the first letter of a capital, the whole of an all-capitals word', () => {
    assert.equal(romanize('Щара', 'be'), 'Shchara');
    assert.equal(romanize('ЖИЗДРА', 'ru'), 'ZHIZDRA');
    assert.equal(romanize('Чорная Ганча', 'be'), 'Chornaya Hancha');
  });

  it('starts a new word after a space or hyphen, and keeps Latin letters, digits and marks as they are', () => {
    assert.equal(romanize('Псковско-Чудское озеро', 'ru'), 'Pskovsko-Chudskoye ozero');
    assert.equal(romanize('Іршиця ІІ', 'uk'), 'Irshytsia II');
    assert.equal(romanize('Нёман (Nemunas) 2', 'be'), 'Nyoman (Nemunas) 2');
    assert.equal(romanize('Kūdupe / Кудеб', 'ru'), 'Kūdupe / Kudeb');
    assert.equal(romanize("d'Arc", 'uk'), "d'Arc", 'an apostrophe between Latin letters stays');
  });

  it('leaves no Cyrillic letter in any of the three alphabets', () => {
    const ru = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
    const be = 'абвгдеёжзійклмнопрстуўфхцчшыьэюя';
    const uk = 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя';
    for (const [lang, abc] of /** @type {['ru' | 'be' | 'uk', string][]} */ ([['ru', ru], ['be', be], ['uk', uk]])) {
      assert.ok(!hasCyrillic(romanize(abc, lang)), lang);
      assert.ok(!hasCyrillic(romanize(abc.toUpperCase(), lang)), `${lang} capitals`);
    }
  });
});

describe('choosing the language of a name', () => {
  it('trusts the feature\'s own name tags first', () => {
    assert.deepEqual(chooseLanguage('Нёман', { names: { be: 'Нёман', ru: 'Неман' } }), { lang: 'be', rule: 'name:be' });
    assert.deepEqual(chooseLanguage('Прип’ять', { names: { uk: "Прип'ять" } }), { lang: 'uk', rule: 'name:uk' }, 'any apostrophe');
    assert.match(chooseLanguage('Десна', { names: { uk: 'Десна', ru: 'Десна' } }).rule, /^name:uk = name:ru, written alike/, 'written alike: no doubt');
  });

  it('keeps the right language with a name its tags spell alike, for the info panel', () => {
    const names = { uk: 'Нева', ru: 'Нева' };
    const neva = chooseLanguage('Нева', { names, nearby: { lang: 'ru', rule: 'names nearby: ru' } });
    assert.equal(neva.lang, 'ru', 'not the first tag (uk)');
    assert.match(neva.rule, /written alike; names nearby: ru/);
    assert.equal(chooseLanguage('Нева', { names, country: 'RU' }).lang, 'ru');
  });

  it('when two tags fit and the systems differ, decides by the country, then the names nearby', () => {
    const names = { be: 'Ясельда', ru: 'Ясельда' };
    assert.equal(chooseLanguage('Ясельда', { names, country: 'BY' }).lang, 'be');
    assert.equal(chooseLanguage('Ясельда', { names, nearby: { lang: 'be', rule: 'names nearby: be' } }).lang, 'be');
    assert.equal(chooseLanguage('Ясельда', { names, nearby: { lang: 'uk', rule: 'names nearby: uk' } }).lang, 'ru', 'a nearby language that no tag has is not taken');
  });

  it('then letters only one language has', () => {
    assert.equal(sureLanguage('Їжа')?.lang, 'uk');
    assert.equal(sureLanguage('Ваўкушанка')?.lang, 'be');
    assert.equal(sureLanguage('Іршиця')?.lang, 'uk');
    assert.equal(sureLanguage('Прип\'ять')?.lang, 'uk');
    assert.equal(sureLanguage('Выигрыш')?.lang, 'ru');
    assert.equal(sureLanguage('Нарва'), null);
    assert.equal(chooseLanguage('Ваўкушанка', { country: 'RU' }).lang, 'be', 'ў outweighs a country');
  });

  it('never picks a language whose alphabet lacks one of the letters', () => {
    assert.deepEqual(possibleLanguages('Горинь'), ['ru', 'uk'], 'no и in Belarusian');
    assert.deepEqual(possibleLanguages('Бярэзіна'), ['be'], 'і and э: Belarusian only');
    assert.deepEqual(possibleLanguages('Нарва'), ['ru', 'be', 'uk']);
    assert.equal(chooseLanguage('Горинь', { nearby: { lang: 'be', rule: 'names nearby: be' } }).lang, 'ru');
  });

  it('tells the language from the words for lake and river, and Russian adjective endings', () => {
    assert.deepEqual(possibleLanguages('возера Нарач'), ['be']);
    assert.deepEqual(possibleLanguages('озеро Неведро'), ['ru', 'uk'], 'Belarusian writes возера');
    assert.deepEqual(possibleLanguages('Кожановское озеро'), ['ru'], 'Ukrainian writes -ське, Belarusian -скае');
    assert.deepEqual(possibleLanguages('Великая'), ['ru', 'uk'], 'only -ская and -цкая rule out Ukrainian, not any -ая');
    assert.deepEqual(possibleLanguages('Чорнаводская'), ['ru', 'be']);
    assert.equal(toLatin('озеро Неведро', { nearby: { lang: 'be', rule: 'names nearby: be' } }).text, 'ozero Nevedro', 'never the hybrid ozyero Nyevyedro');
    assert.equal(toLatin('Кожановское озеро', { nearby: { lang: 'be', rule: 'names nearby: be' } }).text, 'Kozhanovskoye ozero');
  });

  it('is sure of a name only one alphabet can write, even with no tags or names around (no crash)', () => {
    assert.deepEqual(toLatin('Плющівка'), { text: 'Pliushchivka', lang: 'uk', rule: 'letters and words: only uk fits' });
    assert.equal(toLatin('Щітка').text, 'Shchitka');
    assert.equal(sureLanguage('Бярэзіна')?.lang, 'be');
    for (const name of ['Плющівка', 'Щітка', 'Ӂара', 'Іщ', 'возера Щука']) assert.ok(toLatin(name).lang, name);
  });

  it('guesses from the letters last, and says it is a guess', () => {
    assert.deepEqual(guessLanguage('Вілія'), { lang: 'be', rule: 'letters: і without и (a guess)' });
    assert.equal(guessLanguage('Беседзь').lang, 'be');
    assert.equal(guessLanguage('Волхов').lang, 'ru');
    assert.match(guessLanguage('Волхов').rule, /a guess/);
  });

  it('leaves Latin names alone and says how each was made', () => {
    assert.deepEqual(toLatin('Nemunas'), { text: 'Nemunas', lang: null, rule: 'Latin letters already' });
    assert.deepEqual(toLatin('Нёман', { names: { be: 'Нёман' } }), { text: 'Nyoman', lang: 'be', rule: 'name:be' });
  });
});

// @ts-check
// A lake's label is just its name, without the word for "lake" (Ignas, 11 October 2026): Ilmen,
// not ozero Ilmen; Narach, not vozyera Narach; Plateliai, not Platelių ežeras.
//
// The word for lake is dropped only where what is left is the lake's own name, standing alone:
//   - Russian, Belarusian, Ukrainian: "озеро Ильмень", "возера Нарач" (the word first: the name is
//     a noun). Where the word comes last ("Кожановское озеро") or the name is an adjective
//     ("озеро Лучанское"), the name agrees with the word for lake and cannot stand alone.
//   - Polish: "Jezioro Śniardwy", but not an adjective ("Jezioro Mikołajskie", "Jezioro Białe").
//   - Lithuanian: "ež. Drūkšiai" (the word first: the name is in the nominative). "Platelių ež."
//     is a genitive ("the lake of Plateliai").
//   - Latvian: "Rāznas ezers" is a genitive too ("the lake of Rāzna").
//   - Estonian: "Peipsi järv" gives Peipsi, as the Estonians themselves say.
//   - German: "Schweriner See" is an adjective; a plain "X See" gives X.
//   - Swedish, Norwegian, Finnish and Czech only as a separate word: compounds such as Vänern,
//     Mjøsa, Päijänne, Võrtsjärv, Storsjön or Ladogasee are names already and stay whole.
// Where the name cannot stand alone, its plain form is looked for, in this order:
//   1. in the lake's own OpenStreetMap data: its short_name, alt_name and official_name tags (as
//      Overture keeps them) and its name tag in the same language, when one of them is the same
//      word ("Ладога" for "Ладожское озеро", "Galvė" for "Galvės ež.");
//   2. in a short reviewed list of well-known lakes (tools/map/lake-names.json): "Plateliai" for
//      "Platelių ežeras". Genitives are never turned into nominatives by a rule on endings alone:
//      Lithuanian and Latvian endings are too ambiguous for that.
// Otherwise the full name is kept, with the word for lake written out ("Platelių ežeras", never
// the bare genitive "Platelių" nor the abbreviation "Platelių ež."), its first letter a capital.
// All of this runs before romanising (tools/map/romanize.mjs), on the name as OpenStreetMap has it.

import { readFileSync } from 'node:fs';

/** @typedef {'ru' | 'be' | 'uk' | 'pl' | 'lt' | 'lv' | 'et' | 'de' | 'sv' | 'no' | 'fi' | 'cs'} LakeLang */

/**
 * The words for lake, lower case, as a separate word: the languages each belongs to and, for an
 * abbreviation or a romanised form, the word written out in full. Romanised forms (ozero,
 * vozyera) are there for names that OpenStreetMap already writes in Latin letters.
 * @type {Record<string, { langs: LakeLang[], full?: string }>}
 */
export const LAKE_WORDS = {
  озеро: { langs: ['ru', 'uk'] },
  'оз.': { langs: ['ru', 'uk'], full: 'озеро' },
  озера: { langs: ['ru', 'uk'] },
  возера: { langs: ['be'] },
  'воз.': { langs: ['be'], full: 'возера' },
  ozero: { langs: ['ru', 'uk'] },
  ozera: { langs: ['ru', 'uk'] },
  vozyera: { langs: ['be'] },
  jezioro: { langs: ['pl'] },
  'jez.': { langs: ['pl'], full: 'jezioro' },
  ežeras: { langs: ['lt'] },
  'ež.': { langs: ['lt'], full: 'ežeras' },
  ež: { langs: ['lt'], full: 'ežeras' },
  ezers: { langs: ['lv'] },
  'ez.': { langs: ['lv'], full: 'ezers' },
  järv: { langs: ['et'] },
  see: { langs: ['de'] },
  sjö: { langs: ['sv'] },
  sjön: { langs: ['sv'] },
  träsk: { langs: ['sv'] },
  träsket: { langs: ['sv'] },
  vatnet: { langs: ['no'] },
  vannet: { langs: ['no'] },
  sjøen: { langs: ['no'] },
  järvi: { langs: ['fi'] },
  jezero: { langs: ['cs'] },
};

/**
 * @typedef {object} LakeWord where the word for lake is in a name
 * @property {LakeLang[]} langs @property {'before' | 'after'} at the word before or after the name
 * @property {string} word the word as written @property {string} full the word written out in full
 * @property {string} rest the name without it
 */

/**
 * The word for lake in a name, as its first or last word (a word in the middle, as in
 * "Schweriner See (Außensee)", is part of a longer name and is left alone), or null.
 * @param {string} text
 * @returns {LakeWord | null}
 */
export function findLakeWord(text) {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return null;
  for (const [k, at] of /** @type {[number, 'before' | 'after'][]} */ ([[0, 'before'], [words.length - 1, 'after']])) {
    const entry = LAKE_WORDS[words[k].toLowerCase()];
    if (!entry) continue;
    const rest = words.filter((_, i) => i !== k).join(' ');
    // A whole word keeps its case (German See is a noun, written with a capital); an abbreviation
    // is written out in full, in lower case.
    return { langs: entry.langs, at, word: words[k], full: entry.full ?? words[k], rest };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Can the rest stand alone?

/** The last word that is not in brackets, lower case ("Завидечье (Мануйловское)" gives завидечье). @param {string} rest */
function lastWord(rest) {
  const words = rest.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/);
  return (words[words.length - 1] ?? '').toLowerCase();
}

/**
 * Russian, Belarusian and Ukrainian adjectives that agree with the word for lake: neuter -ое,
 * -ее (Russian), -ае, -яе (Belarusian), the Ukrainian -ське, -цьке, -зьке, plural -ые, -ыя;
 * and their romanised forms. A noun ending in -ье (Заозерье) is not one: "озеро Заозерье" is
 * the lake Zaozerye.
 */
const EAST_SLAVIC_ADJECTIVE = /(?:ое|ее|ае|яе|ые|ыя|ське|цьке|зьке|oye|eye|aye|yaye|yye|skoe)$/u;

/**
 * Polish neuter adjectives, which agree with jezioro: -kie and -gie (Mikołajskie, Długie), -nie
 * (Zachodnie), and -e after a hard consonant (Białe, Borowe, Duże, Czarne, Ciche, Czajcze);
 * but not the plural nouns in -ice and -yce (Pławniowice, Nożyce) nor nouns in -ie after any
 * other letter (Lubie, Wielimie, Pobłędzie).
 */
const POLISH_ADJECTIVE = /(?:[kg]ie|nie|(?:[łlwżnrtpsm]|ch|cz)e)$/u;
/** Lithuanian nominative endings: a name ending so after the word for lake is not a genitive ("Balandis ež."). */
const LITHUANIAN_NOMINATIVE = /(?:as|is|ys|us|ai)$/u;
/** Swedish and Norwegian adjectives that start a lake's name: "Store sjö" is the big lake, not a name. */
const NORDIC_ADJECTIVE = /^(?:stora|store|stor|lilla|lille|lill|norra|nordre|södra|søndre|västra|vestre|östra|østre|övre|øvre|nedre|mellersta)$/u;

/**
 * Whether what is left when the word for lake is dropped is the lake's own name, standing alone,
 * and if not, why not.
 * @param {LakeWord} w
 * @returns {{ alone: true } | { alone: false, why: 'adjective' | 'genitive' | 'not a name' }}
 */
export function standsAlone(w) {
  const { rest, at } = w;
  if (!/^\p{Lu}/u.test(rest)) return { alone: false, why: 'not a name' };
  const last = lastWord(rest);
  const lang = w.langs[0];
  const no = (/** @type {'adjective' | 'genitive'} */ why) => ({ alone: /** @type {false} */ (false), why });
  switch (lang) {
    case 'ru': case 'uk': case 'be':
      return at === 'after' || EAST_SLAVIC_ADJECTIVE.test(last) ? no('adjective') : { alone: true };
    case 'pl':
      return POLISH_ADJECTIVE.test(last) && !/(?:ice|yce)$/u.test(last) ? no('adjective') : { alone: true };
    case 'lt':
      // A genitive plural ends in -ų whatever its place; after the word for lake the name is
      // otherwise in the nominative, before it a genitive unless its ending says nominative.
      if (last.endsWith('ų')) return no('genitive');
      return at === 'before' || LITHUANIAN_NOMINATIVE.test(last) ? { alone: true } : no('genitive');
    case 'lv':
      return no('genitive');
    case 'et':
      return { alone: true };
    case 'de':
      return at === 'after' && last.endsWith('er') ? no('adjective') : { alone: true };
    case 'sv': case 'no':
      if (NORDIC_ADJECTIVE.test(rest.split(/\s+/)[0].toLowerCase())) return no('adjective');
      return last.endsWith('s') ? no('genitive') : { alone: true };
    case 'fi':
      return last.endsWith('n') ? no('genitive') : { alone: true };
    case 'cs':
      return /(?:é|ovo|ino)$/u.test(last) ? no('adjective') : { alone: true };
    default:
      return { alone: true };
  }
}

// ---------------------------------------------------------------------------------------------
// The plain name, from the data or the reviewed list.

/** Lower case, without accents, for comparing stems ("Rėkyvos" and "Rekyva"). @param {string} s */
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** How many letters at the start two words share, after folding. @param {string} a @param {string} b */
function sharedStart(a, b) {
  const x = [...fold(a)]; const y = [...fold(b)];
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
}

/**
 * Whether a name from the data is the same name as the rest: its first word shares at least
 * four letters (or the whole of a shorter word) with the rest's first word. So "Ладога" is the
 * plain name of "Ладожское", "Galvė" of "Galvės"; but "Dubingių ež." (another name for Asvejos
 * ež.) or "Suvanto" (the Finnish name of Суходольское озеро) are not.
 * @param {string} candidate @param {string} rest
 */
function sameName(candidate, rest) {
  const a = candidate.split(/[\s-]+/)[0]; const b = rest.split(/[\s-]+/)[0];
  return sharedStart(a, b) >= Math.min(4, [...a].length, [...b].length);
}

/** Whether two texts are in the same script: both Cyrillic, or both not. @param {string} a @param {string} b */
const sameScript = (a, b) => /\p{Script=Cyrillic}/u.test(a) === /\p{Script=Cyrillic}/u.test(b);

/**
 * The lake's names in the data that might be its plain name, in the order they are tried:
 * short_name, alt_name and official_name in the name's language, then without a language, then
 * its name:xx in the name's language. Tags may hold several names separated by ";".
 * @param {LakeLang[]} langs @param {Record<string, string>} names the name:xx tags
 * @param {Record<string, string>} other the alt_name, short_name and official_name tags
 * @returns {{ name: string, tag: string }[]}
 */
function candidates(langs, names, other) {
  /** @type {{ name: string, tag: string }[]} */
  const out = [];
  const add = (/** @type {string} */ tag, /** @type {string | undefined} */ value) => {
    for (const name of (value ?? '').split(';').map((s) => s.trim()).filter(Boolean)) out.push({ name, tag });
  };
  for (const key of ['short_name', 'alt_name', 'official_name']) {
    for (const l of langs) add(`${key}:${l}`, other[`${key}:${l}`]);
    add(key, other[key]);
  }
  for (const l of langs) add(`name:${l}`, names[l]);
  return out;
}

/**
 * The plain name the data gives for a lake whose name cannot stand alone, or null. A candidate
 * is taken when it is the same name (sameName()) in the same script, and either has no word for
 * lake and could stand alone itself (not an adjective: "Białe" for "Jezioro Białe" is no
 * better), or is a name whose word for lake drops ("возера Чарсцвяты" for "Чарсцвяцкае возера").
 * @param {LakeWord} w @param {Record<string, string>} names @param {Record<string, string>} other
 * @returns {{ text: string, tag: string } | null}
 */
export function plainFromData(w, names, other) {
  for (const c of candidates(w.langs, names, other)) {
    if (!sameScript(c.name, w.rest) || fold(c.name) === fold(w.rest)) continue;
    const inner = findLakeWord(c.name);
    let text = c.name;
    if (inner) {
      if (!inner.langs.some((l) => w.langs.includes(l)) || !standsAlone(inner).alone) continue;
      text = inner.rest;
    } else if (!standsAlone({ ...w, rest: c.name, at: 'before' }).alone && w.langs[0] !== 'lt' && w.langs[0] !== 'lv') {
      // An adjective is no plainer than the name ("Białe", "Бярозавае"). Lithuanian and Latvian
      // names from the data are nominatives already; only a genitive plural is refused below.
      continue;
    }
    if (!/^\p{Lu}/u.test(text) || text.endsWith('ų') || fold(text) === fold(w.rest)) continue;
    if (!sameName(text, w.rest)) continue;
    return { text, tag: c.tag };
  }
  return null;
}

/**
 * The reviewed list (tools/map/lake-names.json): plain names of well-known lakes whose name in
 * the data is a genitive or an adjective, by language and the name without the word for lake.
 * @typedef {{ lang: LakeLang, name: string, plain: string, toCheck: boolean, why: string }} ListedLake
 */
const LIST_FILE = new URL('./lake-names.json', import.meta.url);
/** @type {ListedLake[]} */
export const LAKE_LIST = JSON.parse(readFileSync(LIST_FILE, 'utf8')).entries;

/**
 * The listed plain name for a lake, or null.
 * @param {LakeWord} w @param {ListedLake[]} list
 */
export function plainFromList(w, list) {
  return list.find((e) => w.langs.includes(e.lang) && e.name === w.rest) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Everything at once.

/** @typedef {'dropped' | 'data' | 'list' | 'kept'} LakeRule how a lake's label was made */

/**
 * @typedef {object} LakeName
 * @property {string} text the label before romanising
 * @property {LakeRule | null} kind null: the name has no word for lake, and is kept as it is
 * @property {string} rule how, for the pack report
 * @property {ListedLake} [listed] the list entry used
 */

/** Why a name cannot stand alone, as the pack report says it. */
const WHY = { adjective: 'an adjective', genitive: 'a genitive', 'not a name': 'no name alone' };

/** The full name, with the word for lake written out and a capital first letter. @param {LakeWord} w */
function fullName(w) {
  // A Lithuanian genitive comes before the word for lake ("Gačionių ežeras", not "ežeras Gačionių").
  const genitiveFirst = w.langs[0] === 'lt' && w.at === 'before';
  const text = w.at === 'after' || genitiveFirst ? `${w.rest} ${w.full}` : `${w.full} ${w.rest}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A lake's label, before romanising: just its name where that can stand alone, else its plain
 * name from the data or the reviewed list, else its full name with the word for lake written out.
 * @param {string} text the name (one name: tools/map/water-labels.mjs has already picked one
 *   part of a two-language name)
 * @param {{ names?: Record<string, string>, other?: Record<string, string>, list?: ListedLake[] }} [data]
 *   the lake's name:xx tags, its other name tags, and the reviewed list
 * @returns {LakeName}
 */
export function lakeName(text, data = {}) {
  const w = findLakeWord(text);
  if (!w) return { text, kind: null, rule: '' };
  const alone = standsAlone(w);
  if (alone.alone) return { text: w.rest, kind: 'dropped', rule: `lake: "${w.word}" left out` };
  const fromData = plainFromData(w, data.names ?? {}, data.other ?? {});
  if (fromData) return { text: fromData.text, kind: 'data', rule: `lake: plain name from the data (${fromData.tag}), the name being ${WHY[alone.why]}` };
  const listed = plainFromList(w, data.list ?? LAKE_LIST);
  if (listed) return { text: listed.plain, kind: 'list', rule: `lake: plain name from the reviewed list${listed.toCheck ? ' (TO CHECK)' : ''}`, listed };
  const full = fullName(w);
  return { text: full, kind: 'kept', rule: `lake: full name kept (${alone.why})${full !== text ? ', written out' : ''}` };
}

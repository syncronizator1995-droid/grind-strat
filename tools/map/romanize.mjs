// @ts-check
// Writes Russian, Belarusian and Ukrainian names in Latin letters, so every name on the map is in
// Latin letters (Ignas's choice, 11 October 2026). Used when the water block is packed
// (tools/map/pack-water.mjs), so the labels the game ships are already Latin; the original
// spellings stay in the data for the info panel.
//
// The systems, one per language:
//   Russian     BGN/PCGN 1947
//   Belarusian  BGN/PCGN 1979
//   Ukrainian   BGN/PCGN 2019, the same as Ukraine's own 2010 national system
// with one change, for readability on a small screen: the soft and hard signs (ь, ъ) and the
// apostrophe are left out (the systems write them as ’ and ”). The optional middle dot of the
// Russian system (t·s for тс) is left out too.
//
// Tables TO CHECK against the official BGN/PCGN documents (the gov.uk PCGN pages are not
// reachable from here): they are written from the published systems as known to the author.
//
// Which language a name is in must be decided per name, not guessed from letters alone where
// that is ambiguous: chooseLanguage() looks at the feature's own name:xx tags first, then at
// letters (or words) only one language has, then at the country it lies in (or the language of the names
// around it), and only then guesses from the letters; and it says which rule decided.

/** @typedef {'ru' | 'be' | 'uk'} Lang */
/** @typedef {{ lang: Lang, rule: string }} LangChoice */

/** Any Cyrillic letter. */
export const CYRILLIC = /[Ѐ-ӿԀ-ԯ]/;
/** @param {string} text */
export const hasCyrillic = (text) => CYRILLIC.test(text);
/** Latin letters, with their accents (ā, ė, ł, õ, ž...). */
const LATIN = /[A-Za-zÀ-ɏ]/;

/** Letters the three alphabets share, written alike in all three systems. */
const COMMON = {
  а: 'a', б: 'b', в: 'v', д: 'd', ж: 'zh', з: 'z', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', ь: '', ъ: '',
};

/**
 * Russian, BGN/PCGN 1947. е, ё are ye, yë at the start of a word and after a vowel, й, ъ or ь;
 * e, ë elsewhere (handled in letter()). ъ and ь are left out here (the system: ” and ’).
 * @type {Record<string, string>}
 */
const RU = { ...COMMON, г: 'g', е: 'e', ё: 'ë', и: 'i', й: 'y', щ: 'shch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', і: 'i' };

/**
 * Belarusian, BGN/PCGN 1979: е, ё, ю, я are always ye, yo, yu, ya (Vitsyebsk, Homyel, Mahilyow);
 * г is h and ў is w. ь and the apostrophe are left out here (the system: ’ and ”).
 * @type {Record<string, string>}
 */
const BE = { ...COMMON, г: 'h', ґ: 'g', е: 'ye', ё: 'yo', і: 'i', й: 'y', ў: 'w', ы: 'y', э: 'e', ю: 'yu', я: 'ya', и: 'i', щ: 'shch' };

/**
 * Ukrainian, BGN/PCGN 2019 (Ukraine's 2010 system): є, ї, й, ю, я are ye, yi, y, yu, ya at the
 * start of a word and ie, i, i, iu, ia elsewhere (handled in letter()); зг is zgh, so it is not
 * read as ж. ь and the apostrophe are left out, as the system itself does.
 * @type {Record<string, string>}
 */
const UK = { ...COMMON, г: 'h', ґ: 'g', е: 'e', є: 'ie', и: 'y', і: 'i', ї: 'i', й: 'i', щ: 'shch', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'ë' };
/** Ukrainian letters written differently at the start of a word. */
const UK_INITIAL = /** @type {Record<string, string>} */ ({ є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' });

const TABLES = /** @type {Record<Lang, Record<string, string>>} */ ({ ru: RU, be: BE, uk: UK });

/** Russian vowels, after which (and after й, ъ, ь) е and ё are written ye and yë. */
const RU_YE_AFTER = new Set([...'аеёиоуыэюяйъь']);
/** The apostrophes OpenStreetMap names use inside Ukrainian and Belarusian words. */
const APOSTROPHES = new Set(["'", '’', 'ʼ', '‘', '`']);

/** @param {string} c */
const isLetter = (c) => c !== undefined && /\p{L}/u.test(c);

/**
 * Whether position i starts a word: no letter (or apostrophe inside a word) just before it.
 * A hyphen starts a new word ("Псковско-Чудское").
 * @param {string[]} chars @param {number} i
 */
const wordStart = (chars, i) => i === 0 || !(isLetter(chars[i - 1]) || APOSTROPHES.has(chars[i - 1]));

/**
 * One lower-case letter in Latin letters, by its language and its place in the word.
 * @param {Lang} lang @param {string[]} lower the whole text, lower case @param {number} i
 */
function letter(lang, lower, i) {
  const c = lower[i];
  const start = wordStart(lower, i);
  if (lang === 'ru' && (c === 'е' || c === 'ё')) {
    const y = start || RU_YE_AFTER.has(lower[i - 1]);
    return (y ? 'y' : '') + RU[c];
  }
  if (lang === 'uk') {
    if (start && UK_INITIAL[c]) return UK_INITIAL[c];
    if (c === 'г' && lower[i - 1] === 'з') return 'gh';
  }
  return TABLES[lang][c];
}

/**
 * The text in Latin letters, as written in the given language's system. Latin letters, digits,
 * spaces and punctuation are kept; apostrophes inside Cyrillic words are left out. A Cyrillic
 * letter none of the three tables knows (from another language) is kept as it is, so a caller
 * can see that the text is not done.
 * @param {string} text @param {Lang} lang
 */
export function romanize(text, lang) {
  const chars = [...text];
  const lower = chars.map((c) => c.toLowerCase());
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (APOSTROPHES.has(c) && hasCyrillic(chars[i - 1] ?? '') && hasCyrillic(chars[i + 1] ?? '')) continue;
    if (!hasCyrillic(c)) { out += c; continue; }
    const latin = letter(lang, lower, i);
    if (latin === undefined) { out += c; continue; }
    out += c === lower[i] ? latin : upper(latin, chars, i);
  }
  return out;
}

/**
 * A capital: the whole Latin spelling in capitals where the word is all capitals ("ДНЕПР" to
 * "DNEPR"), else only its first letter ("Щ" to "Shch").
 * @param {string} latin @param {string[]} chars @param {number} i
 */
function upper(latin, chars, i) {
  if (!latin) return latin;
  let from = i;
  while (from > 0 && isLetter(chars[from - 1])) from--;
  let to = i;
  while (to < chars.length - 1 && isLetter(chars[to + 1])) to++;
  const word = chars.slice(from, to + 1);
  const allCaps = word.length > 1 && word.every((c) => c === c.toUpperCase());
  return allCaps ? latin.toUpperCase() : latin[0].toUpperCase() + latin.slice(1);
}

/** The language spoken in each country, for a name whose country is known. */
const COUNTRY_LANG = /** @type {Record<string, Lang>} */ ({ BY: 'be', UA: 'uk', RU: 'ru' });

/**
 * @typedef {object} LangContext what is known about the feature a name belongs to
 * @property {Record<string, string>} [names] its name:xx tags (OpenStreetMap's, through
 *   Overture's names.common), by language code
 * @property {string | null} [country] the country it lies in (BY, UA or RU), when known
 * @property {{ lang: Lang, rule: string } | null} [nearby] the language most names near it are
 *   surely written in (tools/map/water-labels.mjs works it out): in OpenStreetMap a name is
 *   written in the language of the country it lies in, so the neighbours tell the country
 */

/**
 * Which language a Cyrillic name is in, and the rule that decided, in this order:
 *   1. the feature's own name tags: the name is its name:be, name:uk or name:ru;
 *   2. letters (or words) only one of the languages has (sureLanguage());
 *   3. the country it lies in, when known;
 *   4. the language of the names around it (context.nearby);
 *   5. a guess from the letters (guessLanguage()).
 * Where several tags spell the name alike and their systems write it alike too, the Latin text
 * does not depend on the choice, but the language is still kept with the name (for the info
 * panel), so it is picked among the tagged ones by rules 2 to 5 as well: Нева tagged in Russian
 * and Ukrainian, with Russian names around it, is Russian.
 * @param {string} text @param {LangContext} [context]
 * @returns {LangChoice}
 */
export function chooseLanguage(text, context = {}) {
  const tagged = taggedLanguages(text, context.names ?? {});
  if (tagged.length === 1) return { lang: tagged[0], rule: `name:${tagged[0]}` };
  const tags = `name:${tagged.join(' = name:')}`;
  // Several languages spell it the same way: that only matters if the systems write it differently.
  const alike = tagged.length > 1 && new Set(tagged.map((l) => romanize(text, l))).size === 1;
  const possible = possibleLanguages(text);
  /** @param {Lang} l */
  const fits = (l) => possible.includes(l) && (!tagged.length || tagged.includes(l));
  const pick = byEvidence(text, context, fits);
  if (alike) return { lang: pick?.lang ?? tagged[0], rule: `${tags}, written alike${pick ? `; ${pick.rule}` : ''}` };
  if (pick) return pick;
  if (tagged.length) return { lang: tagged[0], rule: `${tags}, first of them` };
  // Only reached when the guess is a language the letters rule out: take one they allow.
  return { lang: possible[0], rule: `letters: ${possible.join(' or ')} (a guess)` };
}

/**
 * Rules 2 to 5 of chooseLanguage(), keeping only a language that fits; null when none does.
 * @param {string} text @param {LangContext} context @param {(l: Lang) => boolean} fits
 * @returns {LangChoice | null}
 */
function byEvidence(text, context, fits) {
  const sure = sureLanguage(text);
  if (sure && fits(sure.lang)) return sure;
  const byCountry = context.country ? COUNTRY_LANG[context.country] : undefined;
  if (byCountry && fits(byCountry)) return { lang: byCountry, rule: `country ${context.country}` };
  if (context.nearby && fits(context.nearby.lang)) return context.nearby;
  const guess = guessLanguage(text);
  return fits(guess.lang) ? guess : null;
}

/**
 * Words that only some of the languages use, as whole words (lower case), and the languages each
 * rules out. The word for lake is озеро in Russian and Ukrainian but возера in Belarusian; for
 * river река (Russian), рака or рэчка (Belarusian), ріка or річка (Ukrainian). An adjective
 * ending in -ское or -цкое is Russian (Belarusian writes -скае, Ukrainian -ське); one in -ская or
 * -цкая is Russian or Belarusian (Ukrainian writes -ська). So "Кожановское озеро" is Russian
 * and "озеро Неведро" is not Belarusian, whatever the names around them.
 * @type {[RegExp, Lang[]][]}
 */
const WORD_RULES = [
  [/^(?:озеро|озера|река|речка|пруд|ручей)$/u, ['be']],
  [/^(?:возера|рака|рэчка|ручай)$/u, ['ru', 'uk']],
  [/^(?:ріка|річка|ставок|струмок)$/u, ['ru', 'be']],
  [/\p{L}{2,}(?:ск|цк)ое$/u, ['be', 'uk']],
  [/\p{L}{2,}(?:ск|цк)ая$/u, ['uk']],
];

/**
 * The languages a name can be in, by the letters each alphabet lacks: Belarusian has no и, щ or
 * ъ; Ukrainian no ы, э, ё or ъ; Russian no і, ї, є, ґ or ў (each list as the alphabet is written
 * today); and by the words only some of them use (WORD_RULES). Never empty: a name that fits
 * none (a mix) can be in any of the three.
 * @param {string} text
 * @returns {Lang[]}
 */
export function possibleLanguages(text) {
  const t = text.toLowerCase();
  /** @type {Set<Lang>} */
  const out = new Set();
  if (!/[їєґў]/.test(t) && !/і/.test(t)) out.add('ru');
  if (!/[ищъїєґ]/.test(t)) out.add('be');
  if (!/[ыэёъў]/.test(t)) out.add('uk');
  for (const word of t.split(/[^\p{L}]+/u)) {
    for (const [re, not] of WORD_RULES) if (re.test(word)) for (const l of not) out.delete(l);
  }
  return out.size ? [...out] : ['ru', 'be', 'uk'];
}

/**
 * The languages whose name tag is exactly this name (apostrophes of any kind count as one).
 * @param {string} text @param {Record<string, string>} names
 * @returns {Lang[]}
 */
export function taggedLanguages(text, names) {
  const t = sameApostrophes(text);
  return /** @type {Lang[]} */ (['be', 'uk', 'ru']).filter((l) => names[l] !== undefined && sameApostrophes(names[l]) === t);
}

/** OpenStreetMap writes the Ukrainian apostrophe several ways: ', ’ and ʼ. @param {string} text */
export const sameApostrophes = (text) => text.replace(/['’ʼ‘`]/g, "'");

/**
 * The language, when the letters leave no doubt: ї, є or ґ only in Ukrainian; ў only in
 * Belarusian; і with и only in Ukrainian (Belarusian has no и, Russian no і); an apostrophe
 * inside a word with и only in Ukrainian (Russian has no such apostrophe); и with ы, э or ъ only
 * in Russian (Ukrainian has none of those three, Belarusian no и). Otherwise, whenever the
 * letters and words leave only one language (possibleLanguages()): щ with і is only Ukrainian
 * (Belarusian has no щ, Russian no і), so "Плющівка" is sure even with no names around it.
 * @param {string} text
 * @returns {LangChoice | null}
 */
export function sureLanguage(text) {
  const t = text.toLowerCase();
  if (/[їєґ]/.test(t)) return { lang: 'uk', rule: 'letters: ї, є or ґ' };
  if (/ў/.test(t)) return { lang: 'be', rule: 'letters: ў' };
  if (/і/.test(t) && /и/.test(t)) return { lang: 'uk', rule: 'letters: і with и' };
  if (/и/.test(t) && /[\u0400-\u04FF]['’ʼ‘`][\u0400-\u04FF]/.test(t)) return { lang: 'uk', rule: 'letters: apostrophe with и' };
  if (/и/.test(t) && /[ыэъ]/.test(t)) return { lang: 'ru', rule: 'letters: и with ы, э or ъ' };
  const possible = possibleLanguages(t);
  if (possible.length === 1) return { lang: possible[0], rule: `letters and words: only ${possible[0]} fits` };
  return null;
}

/**
 * The language a Cyrillic name is in, from its letters alone (the last resort): a sure one if
 * any; else і (without и) is Belarusian; дз, дж or a final ць (Belarusian spellings) without и,
 * щ or ъ is Belarusian; anything else is Russian.
 * @param {string} text
 * @returns {LangChoice}
 */
export function guessLanguage(text) {
  const sure = sureLanguage(text);
  if (sure) return sure;
  const t = text.toLowerCase();
  if (/і/.test(t)) return { lang: 'be', rule: 'letters: і without и (a guess)' };
  if (/дз|дж|ць(?!\p{L})/u.test(t) && !/[ищъ]/.test(t)) return { lang: 'be', rule: 'letters: дз, дж or ць (a guess)' };
  return { lang: 'ru', rule: 'letters: none of the Belarusian or Ukrainian ones (a guess)' };
}

/**
 * A name in Latin letters: as it is when it has no Cyrillic, else romanised in the language
 * chooseLanguage() picks.
 * @param {string} text @param {LangContext} [context]
 * @returns {{ text: string, lang: Lang | null, rule: string }}
 */
export function toLatin(text, context = {}) {
  if (!hasCyrillic(text)) return { text, lang: null, rule: 'Latin letters already' };
  const { lang, rule } = chooseLanguage(text, context);
  return { text: romanize(text, lang), lang, rule };
}

/** Whether a text has a Latin letter (and so is, at least in part, written in Latin letters). @param {string} text */
export const hasLatin = (text) => LATIN.test(text);

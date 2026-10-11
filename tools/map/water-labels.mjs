// @ts-check
// The names the map shows for OpenStreetMap's rivers and lakes, worked out when the water block
// is packed (tools/map/pack-water.mjs), so the game ships labels that are already tidy and in
// Latin letters (Ignas, 11 October 2026). The original OpenStreetMap names stay in the data too.
//
//   - One name per label: a name that joins two languages ("Neris - Вілія", "Nemunas / Немунас")
//     shows one of them. Nothing in the extract says which country a stretch or lake lies in, and
//     most such names are on a border, so the first part in Latin letters is shown (the first
//     part, if none is in Latin letters).
//   - Abbreviations such as Lithuanian "ež." (ežeras, lake) are left out of labels.
//   - Cyrillic names are romanised (tools/map/romanize.mjs). The language is decided per name:
//     its own name:xx tags, letters only one language has, and otherwise the language the names
//     around it are surely written in (in OpenStreetMap a name is in the language of the country
//     it lies in, so its neighbours tell the country).
//   - A river's main name (its info, and its label where a stretch has no name of its own) is the
//     local name at its lower end inside the map: where it meets the sea or a bigger river, or
//     leaves the map. So Daugava, not Zapadnaya Dvina.

import { chooseLanguage, hasCyrillic, hasLatin, possibleLanguages, romanize, sameApostrophes, sureLanguage, taggedLanguages } from './romanize.mjs';
import { isTwoLanguageName, splitNames } from './water-rules.mjs';

/** @typedef {import('./romanize.mjs').Lang} Lang */
/** @typedef {number[]} Flat */

/**
 * @typedef {object} Label what the map shows for one name, and how it was made
 * @property {string} text the label, in Latin letters
 * @property {string} local the name as OpenStreetMap has it
 * @property {Lang | null} lang the language it was romanised from (null: it was already Latin)
 * @property {string} rule how the label was made, for the pack report
 */

/**
 * Abbreviations left out of labels: lake (Lithuanian ež., Latvian ez., Polish jez., Russian and
 * Ukrainian оз., Belarusian воз.), river (Lithuanian up., Russian р.) and reservoir (вдхр.).
 */
export const ABBREVIATIONS = new Set(['ež.', 'ež', 'ez.', 'jez.', 'оз.', 'воз.', 'up.', 'р.', 'вдхр.']);

/**
 * Names written with a spaced dash that are one name in one language, not two names: shown
 * with the dash closed up.
 * @type {Record<string, string>}
 */
export const ONE_NAMES = { 'Jezioro Łódzko - Dymaczewskie': 'Jezioro Łódzko-Dymaczewskie' };

/**
 * The one name a label shows, before romanising: one part of a two-language name, without
 * abbreviations.
 * @param {string} name
 * @returns {{ text: string, rule: string }}
 */
export function tidyName(name) {
  if (ONE_NAMES[name]) return { text: ONE_NAMES[name], rule: 'one name with a spaced dash' };
  let text = name.trim();
  const rules = [];
  if (isTwoLanguageName(text)) {
    const parts = splitNames(text);
    const latin = parts.find((p) => hasLatin(p) && !hasCyrillic(p));
    text = latin ?? parts[0];
    rules.push(latin ? 'two names: the first in Latin letters' : 'two names: the first');
  }
  const words = text.split(/\s+/);
  const kept = words.filter((w) => !ABBREVIATIONS.has(w.toLowerCase()));
  if (kept.length && kept.length < words.length) {
    text = kept.join(' ');
    rules.push('abbreviation left out');
  }
  return { text, rule: rules.join('; ') };
}

// ---------------------------------------------------------------------------------------------
// Which language: the names around.

/** How many surely known names around a name are asked, and how far away they may be (game units: 150 km). */
const NEARBY_COUNT = 15;
const NEARBY_UNITS = 1500;

/**
 * @typedef {object} NameItem one name to label
 * @property {string} name the name as OpenStreetMap has it
 * @property {Record<string, string>} names the feature's name:xx tags
 * @property {number} x @property {number} y where it is, game units
 */

/**
 * The language a name surely is in, from its own tags or its letters, or null.
 * @param {string} text @param {Record<string, string>} names
 * @returns {Lang | null}
 */
function sureOf(text, names) {
  const tagged = taggedLanguages(text, names);
  if (tagged.length === 1) return tagged[0];
  return tagged.length ? null : sureLanguage(text)?.lang ?? null;
}

/**
 * Labels for many names at once, so a name whose language is in doubt can take the language
 * most of the surely known names around it are in.
 * @param {NameItem[]} items
 * @returns {Label[]}
 */
export function labelNames(items) {
  const tidy = items.map((it) => tidyName(it.name));
  const sure = items.map((it, k) => (hasCyrillic(tidy[k].text) ? sureOf(tidy[k].text, it.names) : null));
  /** @type {{ x: number, y: number, lang: Lang }[]} */
  const known = [];
  items.forEach((it, k) => { const lang = sure[k]; if (lang) known.push({ x: it.x, y: it.y, lang }); });
  return items.map((it, k) => {
    const { text, rule } = tidy[k];
    const local = it.name;
    if (!hasCyrillic(text)) return { text, local, lang: null, rule: rule || 'Latin letters already' };
    const nearby = sure[k] ? null : nearbyLanguage(known, it.x, it.y, possibleLanguages(text));
    const choice = chooseLanguage(text, { names: it.names, nearby });
    return { text: romanize(text, choice.lang), local, lang: choice.lang, rule: [rule, choice.rule].filter(Boolean).join('; ') };
  });
}

/**
 * The language most of the nearest surely known names are in (by count, a tie gives none). Near
 * a border between Belarus and Ukraine this is a better guess than the letters, which would say
 * Russian.
 * Only names in a language the name itself can be in count (Belarusian has no и, so "Горинь" is
 * Ukrainian or Russian whatever its Belarusian neighbours).
 * @param {{ x: number, y: number, lang: Lang }[]} known @param {number} x @param {number} y
 * @param {Lang[]} [possible] the languages the name can be in
 * @returns {{ lang: Lang, rule: string } | null}
 */
export function nearbyLanguage(known, x, y, possible = ['ru', 'be', 'uk']) {
  const near = known.filter((n) => possible.includes(n.lang)).map((n) => ({ lang: n.lang, d: Math.hypot(n.x - x, n.y - y) }))
    .filter((n) => n.d <= NEARBY_UNITS).sort((a, b) => a.d - b.d).slice(0, NEARBY_COUNT);
  if (!near.length) return null;
  /** @type {Map<Lang, number>} */
  const votes = new Map();
  for (const n of near) votes.set(n.lang, (votes.get(n.lang) ?? 0) + 1);
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const [lang, count] = ranked[0];
  // A tie (at a corner where countries meet) is left to the letters.
  if (ranked[1] && ranked[1][1] === count) return null;
  return { lang, rule: `names nearby: ${lang} (${count} of ${near.length} within ${NEARBY_UNITS / 10} km)` };
}

// ---------------------------------------------------------------------------------------------
// A river's main name: the local name at its lower end.

/** A name for comparing: lower case, one kind of apostrophe. @param {string} name */
const key = (name) => sameApostrophes(name.toLowerCase().trim());

/**
 * The river's own names: its main name, its name:xx tags, and each part of those.
 * @param {string} name @param {Record<string, string>} names
 */
function knownNames(name, names) {
  const out = new Set();
  for (const n of [name, ...Object.values(names)]) {
    if (!n) continue;
    out.add(key(n));
    for (const p of splitNames(n)) out.add(key(p));
  }
  return out;
}

/** A stretch under another name that carries at least this share of a river's length is the river going on. */
const LONG_SHARE = 0.2;

/** @param {Flat} line */
const lineLength = (line) => {
  let len = 0;
  for (let i = 2; i < line.length; i += 2) len += Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
  return len;
};

/**
 * The name at a river's lower end inside the map. OpenStreetMap draws a river downstream, and
 * build-water stitches each named stretch in the direction of its longest way, so a line's last
 * point is its lower end. From the river's longest line, the walk goes downstream (to the line
 * the last point touches) and stops where nothing follows: the sea, a bigger river or the map's
 * edge. Where the river goes on under another name, the walk follows only if that name is one of
 * the river's own (its name tags, or a part of them) or carries a fifth of the river's length
 * (Zapadnaya Dvina into Zakhodnyaya Dzvina into Daugava), not a short delta arm or side channel
 * with a name of its own (Atmata at the Nemunas's mouth); and it stops where the river splits
 * into several names.
 * When the name at the end is two names in one, the nearest single name upstream that is one of
 * them is used ("Oder/Odra" at the end, "Odra" above it).
 * @param {{ name: string, names: Record<string, string>, lines: Flat[], lineNames?: string[] }} river
 * @returns {{ name: string, path: string[] }} the name ('' when the end has none) and the names walked
 */
export function lowerEndName(river) {
  const lines = river.lines;
  const names = river.lineNames ?? lines.map(() => '');
  if (!lines.length) return { name: '', path: [] };
  /** @type {Map<string, number[]>} which lines pass through each point */
  const through = new Map();
  lines.forEach((l, i) => {
    for (let p = 0; p < l.length; p += 2) {
      const k = `${l[p]},${l[p + 1]}`;
      const list = through.get(k);
      if (!list) through.set(k, [i]); else if (list[list.length - 1] !== i) list.push(i);
    }
  });
  const lengths = lines.map(lineLength);
  const total = lengths.reduce((a, b) => a + b, 0);
  /** @type {Map<string, number>} */
  const lengthOf = new Map();
  names.forEach((n, i) => lengthOf.set(n, (lengthOf.get(n) ?? 0) + lengths[i]));
  const own = knownNames(river.name, river.names);
  /** One of the river's own names, or a long stretch: not a short arm with a name of its own. @param {string} n */
  const goesOn = (n) => own.has(key(n)) || splitNames(n).some((p) => own.has(key(p))) || (lengthOf.get(n) ?? 0) >= total * LONG_SHARE;
  let at = lengths.indexOf(Math.max(...lengths));
  const seen = new Set([at]);
  const path = [names[at]];
  for (;;) {
    const l = lines[at];
    const next = (through.get(`${l[l.length - 2]},${l[l.length - 1]}`) ?? []).filter((j) => !seen.has(j));
    if (!next.length) break;
    const same = next.filter((j) => names[j] === names[at]);
    const other = next.filter((j) => goesOn(names[j]));
    const pick = same.length ? same : new Set(other.map((j) => names[j])).size === 1 ? other : [];
    if (!pick.length) break;
    at = pick.sort((a, b) => lengths[b] - lengths[a] || a - b)[0];
    seen.add(at);
    path.push(names[at]);
  }
  let name = [...path].reverse().find(Boolean) ?? '';
  if (isTwoLanguageName(name)) {
    const parts = new Set(splitNames(name).map(key));
    const single = [...path].reverse().find((n) => n && !isTwoLanguageName(n) && parts.has(key(n)));
    if (single) name = single;
  }
  return { name, path };
}

// ---------------------------------------------------------------------------------------------
// Everything at once.

/**
 * @typedef {{ rivers: { main: Label, lowerEnd: string[], stretch: Map<string, Label> }[], lakes: Label[] }} WaterLabels
 * @typedef {{ name: string, names: Record<string, string>, lines: Flat[], lineNames?: string[] }} RiverIn
 * @typedef {{ name: string, names: Record<string, string>, rings: Flat[] }} LakeIn
 */

/** The middle point of a line. @param {Flat} line @returns {[number, number]} */
const middle = (line) => {
  const p = Math.floor(line.length / 4) * 2;
  return [line[p], line[p + 1]];
};

/** The average of a lake's outer ring's points (where its name is looked up). @param {Flat[]} rings @returns {[number, number]} */
const centre = (rings) => {
  const r = rings[0] ?? [0, 0];
  let x = 0; let y = 0;
  for (let i = 0; i < r.length; i += 2) { x += r[i]; y += r[i + 1]; }
  const n = Math.max(1, r.length / 2);
  return [x / n, y / n];
};

/**
 * The labels of every river, river stretch and lake.
 * @param {RiverIn[]} rivers @param {LakeIn[]} lakes
 * @returns {WaterLabels}
 *   per river: its main name, the names walked to its lower end, and the label of each of its
 *   stretches' names (by the name as OpenStreetMap has it)
 */
export function waterLabels(rivers, lakes) {
  /** @type {NameItem[]} */
  const items = [];
  const riverPlan = rivers.map((r) => {
    const names = r.lineNames ?? r.lines.map(() => '');
    /** @type {Map<string, number>} each stretch name's longest line */
    const longest = new Map();
    r.lines.forEach((l, i) => {
      const n = names[i];
      if (!n) return;
      const best = longest.get(n);
      if (best === undefined || l.length > r.lines[best].length) longest.set(n, i);
    });
    const end = lowerEndName(r);
    const mainName = end.name || r.name;
    /** @type {Map<string, number>} item index by name */
    const itemOf = new Map();
    for (const [n, i] of longest) { itemOf.set(n, items.length); items.push({ name: n, names: r.names, x: middle(r.lines[i])[0], y: middle(r.lines[i])[1] }); }
    if (!itemOf.has(mainName)) {
      const i = longest.get(end.name) ?? r.lines.map((l) => l.length).reduce((b, v, k, all) => (v > all[b] ? k : b), 0);
      itemOf.set(mainName, items.length);
      const [x, y] = r.lines.length ? middle(r.lines[i]) : [0, 0];
      items.push({ name: mainName, names: r.names, x, y });
    }
    return { mainName, path: end.path, itemOf };
  });
  const lakeItem = lakes.map((l) => {
    const [x, y] = centre(l.rings);
    items.push({ name: l.name, names: l.names, x, y });
    return items.length - 1;
  });
  const labels = labelNames(items);
  return {
    rivers: riverPlan.map((p) => ({
      main: labels[/** @type {number} */ (p.itemOf.get(p.mainName))],
      lowerEnd: p.path,
      stretch: new Map([...p.itemOf].map(([n, k]) => [n, labels[k]])),
    })),
    lakes: lakeItem.map((k) => labels[k]),
  };
}

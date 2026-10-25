// @ts-check
// Our own block: src/data/own/names.json, the names of rivers, lakes and seas over time (M3a, PR 2),
// under the game's own terms (not yet chosen by Ignas; see src/data/own/LICENSE.md). It holds only
// our own work: the forms of tools/map/names-of-the-time.json, each with its source named (title,
// place in the text); no web addresses, which stay in that file and in data/sources.md, and no
// Cyrillic (the 'orig' of an Old East Slavic form is read only to check its Latin-letter name).
//
// The water block is read only to check keys: each feature is named by (kind, Wikidata id) and
// must match exactly one river or lake of the shipped water; each 'stretches' text must be the text
// one of that river's lines shows today (lineName, else the river's name).
//
// Layer: info (JSON): { sources, languages, regions, periods, features, seas }.
//
//   node tools/map/pack-names.mjs     (npm run map:pack runs it too)

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, writeBlock, makeBlock, BLOCK_FILES } from './block.mjs';
import { findLakeWord, standsAlone } from './lake-names.mjs';
import { MAP } from './projection.mjs';
import { hasCyrillic, romanize } from './romanize.mjs';
import { decodeWater } from './water-hashes.mjs';

export const NAMES_BLOCK = 'src/data/own/names.json';
export const NAMES_NOTICE = 'Grind Strat\'s own work: the names of rivers, lakes and seas over time, each with its source named. Under the game\'s own terms, not yet chosen. Full source details are in the game\'s source code (data/sources.md).';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MARKS = ['TO CHECK', 'estimate', 'disputed'];

/**
 * @typedef {{ title: string, author: string, written?: number, about?: true, copy?: string, edition?: string, url?: string, seen?: string }} Source
 * @typedef {{ from: number, to: number | null, language: string, source: string, marks?: string[], note?: string }} Period
 * @typedef {{ region?: string, stretches?: string[], from?: number, to?: number, attested?: number, name: string, gloss?: string,
 *   language: string, source: string, where?: string, marks?: string[], map?: false, orig?: string, note?: string }} Entry
 * @typedef {{ kind: 'river' | 'lake', wikidata: string, label?: string, names: Entry[] }} Feature
 * @typedef {{ id: string, name: string, marks?: string[], degrees?: number[][], drawnFrom?: string, names: Entry[] }} Sea
 * @typedef {{ sources: Record<string, Source>, languages: Record<string, string>, regions: { id: string, name: string, rule?: 'today' }[],
 *   periods: Record<string, Period[]>, features: Feature[], seas: Sea[] }} Hand the hand file
 */

/**
 * Old Church Slavonic and Old East Slavic spelling made plain (spelling only, no change of the
 * word), so the BGN/PCGN table can romanise it: ѣ ѥ є to е, ѧ ꙗ to я, ѡ to о, ѿ to от, оу ѹ ꙋ to у,
 * і ї to и, ѳ to ф, ъ and ь dropped, and чю жю шю щю to чу жу шу щу.
 * @param {string} text
 */
export function normaliseOld(text) {
  /** @type {[RegExp, string][]} */
  const rules = [
    [/[ѣѥє]/g, 'е'], [/[ѢѤЄ]/g, 'Е'], [/[ѧꙗ]/g, 'я'], [/[ѦꙖ]/g, 'Я'], [/ѡ/g, 'о'], [/Ѡ/g, 'О'],
    [/ѿ/g, 'от'], [/Ѿ/g, 'От'], [/оу|[ѹꙋ]/g, 'у'], [/Оу|[ѸꙊ]/g, 'У'], [/[іѝї]/g, 'и'], [/[ІЇ]/g, 'И'],
    [/ѳ/g, 'ф'], [/Ѳ/g, 'Ф'], [/[ъь]/g, ''], [/[ЪЬ]/g, ''],
    [/([чжшщЧЖШЩ])ю/g, '$1у'], [/([чжшщЧЖШЩ])Ю/g, '$1У'],
  ];
  return rules.reduce((t, [re, to]) => t.replace(re, to), text);
}

/** @param {string} s */
const capitalise = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The text each line of a river shows today: its stretch name, else the river's own (the same rule
 * as src/ui/map/labels.js).
 * @param {ReturnType<typeof decodeWater>} water @returns {Map<number, Set<string>>} river index to its texts
 */
export function todayTexts(water) {
  /** @type {Map<number, Set<string>>} */
  const out = new Map();
  water.rivers.forEach((_, i) => {
    const ri = water.riverOf[i];
    const text = (water.lineName[i] && water.lineNames[water.lineName[i]]) || water.riverInfo[ri].name;
    if (!out.has(ri)) out.set(ri, new Set());
    /** @type {Set<string>} */ (out.get(ri)).add(text);
  });
  return out;
}

/** The strings of a value, deeply. @param {unknown} v @returns {string[]} */
function strings(v) {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

/** @param {unknown} y */
const badYear = (y) => !Number.isInteger(y) || y === 0;

/**
 * Problems with the hand file, checked against the shipped water: what the build refuses.
 * @param {Hand} hand @param {ReturnType<typeof decodeWater>} water
 * @returns {string[]}
 */
export function namesProblems(hand, water) {
  /** @type {string[]} */
  const problems = [];
  const sourceIds = Object.keys(hand.sources);
  const langIds = Object.keys(hand.languages);
  const regionById = new Map(hand.regions.map((r) => [r.id, r]));
  const used = new Set();

  // 1. ids exist, kebab-case; years are integers, never 0, from < to.
  for (const id of [...sourceIds, ...langIds, ...regionById.keys(), ...hand.seas.map((s) => s.id)]) {
    if (!KEBAB.test(id)) problems.push(`${id}: ids are kebab-case`);
  }
  if (new Set(hand.seas.map((s) => s.id)).size !== hand.seas.length) problems.push('a sea id is used twice');
  if (regionById.size !== hand.regions.length) problems.push('a region id is used twice');
  for (const [id, s] of Object.entries(hand.sources)) {
    if (!s.title || !s.author) problems.push(`source ${id}: needs title and author`);
    if (s.written !== undefined && badYear(s.written)) problems.push(`source ${id}: bad year ${s.written}`);
    if (s.about && s.written === undefined) problems.push(`source ${id}: 'about' without a year`);
  }

  // 2. periods: sorted, not overlapping, each with a source; a 'today' region has none.
  for (const [rid, list] of Object.entries(hand.periods)) {
    const region = regionById.get(rid);
    if (!region) { problems.push(`periods: unknown region ${rid}`); continue; }
    if (region.rule === 'today' && list.length) problems.push(`region ${rid}: a 'today' region has no periods`);
    let end = -Infinity;
    for (const p of list) {
      if (!sourceIds.includes(p.source)) problems.push(`region ${rid}: period from ${p.from} has unknown source ${p.source}`);
      else used.add(p.source);
      if (!langIds.includes(p.language)) problems.push(`region ${rid}: period from ${p.from} has unknown language ${p.language}`);
      if (badYear(p.from) || (p.to !== null && badYear(p.to))) problems.push(`region ${rid}: bad period years ${p.from}, ${p.to}`);
      else if (p.to !== null && p.from >= p.to) problems.push(`region ${rid}: period ${p.from} to ${p.to} runs backwards`);
      if (p.from < end) problems.push(`region ${rid}: periods are not sorted or they overlap at ${p.from}`);
      end = p.to === null ? Infinity : p.to;
      for (const m of p.marks ?? []) if (!MARKS.includes(m)) problems.push(`region ${rid}: unknown mark ${m}`);
      if (p.to === 1400 && !p.marks?.includes('TO CHECK')) problems.push(`region ${rid}: the end year 1400 is a game choice and carries TO CHECK`);
    }
  }

  /** The checks every name entry has, wherever it sits. @param {Entry} e @param {string} where */
  const checkEntry = (e, where) => {
    if (!sourceIds.includes(e.source)) problems.push(`${where}: unknown source ${e.source}`);
    else used.add(e.source);
    if (!langIds.includes(e.language)) problems.push(`${where}: unknown language ${e.language}`);
    for (const k of ['from', 'to', 'attested']) {
      const y = /** @type {any} */ (e)[k];
      if (y !== undefined && badYear(y)) problems.push(`${where}: bad year ${k} ${y}`);
    }
    if (e.from !== undefined && e.to !== undefined && e.from >= e.to) problems.push(`${where}: from ${e.from} runs on to ${e.to}`);
    // 5. names.
    if (!e.name) problems.push(`${where}: no name`);
    else {
      if (hasCyrillic(e.name) || hasCyrillic(e.gloss ?? '') || hasCyrillic(e.where ?? '')) problems.push(`${where}: Latin letters only in what is shipped`);
      if (e.name[0] !== e.name[0].toUpperCase() || e.name[0] === e.name[0].toLowerCase()) problems.push(`${where}: ${e.name} must begin with a capital letter`);
    }
    if (e.language === 'orv') {
      if (!e.orig) problems.push(`${where}: an Old East Slavic form needs orig, as read`);
      else if (e.name !== capitalise(romanize(normaliseOld(e.orig), 'ru'))) {
        problems.push(`${where}: ${e.name} is not the romanisation of ${e.orig} (${capitalise(romanize(normaliseOld(e.orig), 'ru'))})`);
      }
      if (/[’'ʹьъ]/.test(e.name)) problems.push(`${where}: no soft or hard signs or apostrophes in ${e.name}`);
      if (hand.sources[e.source] && !hand.sources[e.source].copy) problems.push(`${where}: an Old East Slavic source names its copy`);
    } else if (e.orig) problems.push(`${where}: orig is only for Old East Slavic`);
    // 7. marks.
    for (const m of e.marks ?? []) if (!MARKS.includes(m)) problems.push(`${where}: unknown mark ${m}`);
    if (e.marks?.includes('disputed') && e.map !== false) problems.push(`${where}: a disputed form is panel only (map: false)`);
    if (e.map !== undefined && e.map !== false) problems.push(`${where}: map is only ever false`);
    const src = hand.sources[e.source];
    if (src && src.written === undefined && e.attested === undefined) problems.push(`${where}: ${e.source} has no year of writing, so the entry needs attested`);
  };

  // 3. keys and stretches; groups with one region; 4. no overlapping windows.
  const seenKeys = new Set();
  for (const f of hand.features) {
    const key = `${f.kind} ${f.wikidata}`;
    if (seenKeys.has(key)) problems.push(`${key}: the feature is listed twice`);
    seenKeys.add(key);
    if (f.kind !== 'river' && f.kind !== 'lake') { problems.push(`${key}: kind is river or lake`); continue; }
    const infos = f.kind === 'river' ? water.riverInfo : water.lakeInfo;
    const hits = infos.map((x, i) => (x.wikidata === f.wikidata ? i : -1)).filter((i) => i >= 0);
    if (hits.length !== 1) { problems.push(`${key} (${f.label ?? ''}): matches ${hits.length} features of the water block, not exactly one`); continue; }
    const texts = f.kind === 'river' ? [...(todayTexts(water).get(hits[0]) ?? [])] : [infos[hits[0]].name];
    const named = new Set(f.names.flatMap((e) => e.stretches ?? []));
    f.names.forEach((e, n) => {
      const where = `${key} ${f.label ?? ''} entry ${n} (${e.name})`;
      checkEntry(e, where);
      if (!e.region || !regionById.has(e.region)) problems.push(`${where}: unknown region ${e.region}`);
      if (f.kind === 'lake' && e.stretches) problems.push(`${where}: a lake has no stretches`);
      for (const s of e.stretches ?? []) if (!texts.includes(s)) problems.push(`${where}: the river has no stretch text "${s}" (it has ${texts.map((t) => `"${t}"`).join(', ')})`);
    });
    // Groups: each stretch text of a river, or the lake.
    for (const text of f.kind === 'river' ? texts : [infos[hits[0]].name]) {
      const covering = f.names.filter((e) => (e.stretches ? e.stretches.includes(text) : !named.has(text)));
      const regions = new Set(covering.map((e) => e.region));
      if (regions.size > 1) problems.push(`${key} ${f.label ?? ''} "${text}": its entries are in several regions (${[...regions].join(', ')})`);
      /** @type {Map<string, Entry[]>} */
      const byLang = new Map();
      for (const e of covering.filter((x) => x.map !== false)) byLang.set(e.language, [...(byLang.get(e.language) ?? []), e]);
      for (const [lang, list] of byLang) {
        const win = list.map((e) => [e.from ?? -Infinity, e.to ?? Infinity, e.name]);
        for (let a = 0; a < win.length; a++) for (let b = a + 1; b < win.length; b++) {
          if (win[a][0] < win[b][1] && win[b][0] < win[a][1]) problems.push(`${key} ${f.label ?? ''} "${text}": two ${lang} forms share years (${win[a][2]}, ${win[b][2]}); the second needs map: false or its own years`);
        }
      }
    }
    // 6. a lake word in a lake's map name must not be droppable.
    if (f.kind === 'lake') {
      for (const e of f.names.filter((x) => x.map !== false)) {
        const w = findLakeWord(e.name);
        if (w && standsAlone(w).alone) problems.push(`${key} ${f.label ?? ''}: ${e.name} would lose its lake word on the map; write the name so it cannot stand alone`);
      }
    }
  }

  // Seas.
  let ringless = 0;
  for (const s of hand.seas) {
    s.names.forEach((e, n) => checkEntry(e, `sea ${s.id} entry ${n} (${e.name})`));
    for (const m of s.marks ?? []) if (!MARKS.includes(m)) problems.push(`sea ${s.id}: unknown mark ${m}`);
    if (!s.degrees) { ringless++; continue; }
    if (s.degrees.length < 3) problems.push(`sea ${s.id}: a ring needs at least 3 points`);
    for (const [lon, lat] of s.degrees) {
      const { west, east, south, north } = MAP.box;
      const [x, y] = MAP.toUnits(lon, lat);
      if (lon < west || lon > east || lat < south || lat > north || x < 0 || y < 0 || x > MAP.width || y > MAP.height) problems.push(`sea ${s.id}: point ${lon}, ${lat} is outside the map`);
    }
    if (!s.drawnFrom) problems.push(`sea ${s.id}: needs drawnFrom`);
    else if (/openstreetmap|\bosm\b/i.test(s.drawnFrom)) problems.push(`sea ${s.id}: drawnFrom mentions OpenStreetMap; it must name only public-domain land and published coordinates`);
  }
  if (ringless !== 1) problems.push(`exactly one sea has no ring (the default), not ${ringless}`);

  for (const id of sourceIds) if (!used.has(id)) problems.push(`source ${id} is never used`);
  for (const r of hand.regions) if (!hand.features.some((f) => f.names.some((e) => e.region === r.id))) problems.push(`region ${r.id} is never used`);

  // 8. no web addresses in what ships.
  const shipped = shippedInfo(hand);
  for (const s of strings(shipped)) if (/\/\/|http/i.test(s)) problems.push(`a shipped text has a web address: ${s.slice(0, 60)}`);
  return problems;
}

/** @param {Entry} e */
function shippedEntry(e) {
  return {
    ...(e.region ? { region: e.region } : {}), ...(e.stretches ? { stretches: e.stretches } : {}),
    ...(e.from !== undefined ? { from: e.from } : {}), ...(e.to !== undefined ? { to: e.to } : {}),
    ...(e.attested !== undefined ? { attested: e.attested } : {}),
    name: e.name, ...(e.gloss ? { gloss: e.gloss } : {}), language: e.language, source: e.source,
    ...(e.where ? { where: e.where } : {}), ...(e.marks?.length ? { marks: e.marks } : {}), ...(e.map === false ? { map: false } : {}),
  };
}

/**
 * What the game reads: no web addresses, no editions, no original Cyrillic, no notes.
 * @param {Hand} hand
 */
export function shippedInfo(hand) {
  return {
    sources: Object.fromEntries(Object.entries(hand.sources).map(([id, s]) => [id, {
      title: s.title, author: s.author, ...(s.written !== undefined ? { written: s.written } : {}), ...(s.about ? { about: true } : {}), ...(s.copy ? { copy: s.copy } : {}),
    }])),
    languages: hand.languages,
    regions: hand.regions.map((r) => ({ id: r.id, name: r.name, ...(r.rule ? { rule: r.rule } : {}) })),
    periods: Object.fromEntries(Object.entries(hand.periods).map(([rid, list]) => [rid, list.map((p) => ({
      from: p.from, to: p.to, language: p.language, source: p.source, ...(p.marks?.length ? { marks: p.marks } : {}),
    }))])),
    features: hand.features.map((f) => ({ kind: f.kind, wikidata: f.wikidata, names: f.names.map(shippedEntry) })),
    seas: hand.seas.map((s) => ({
      id: s.id, name: s.name, ring: s.degrees ? s.degrees.flatMap(([lon, lat]) => MAP.toUnits(lon, lat)) : null,
      ...(s.marks?.length ? { marks: s.marks } : {}), names: s.names.map(shippedEntry),
    })),
  };
}

/**
 * Our block, from the hand file and the decoded shipped water (read only to check).
 * @param {Hand} hand @param {ReturnType<typeof decodeWater>} water
 */
export function namesBlock(hand, water) {
  const problems = namesProblems(hand, water);
  if (problems.length) throw new Error(`tools/map/names-of-the-time.json:\n- ${problems.join('\n- ')}`);
  const info = shippedInfo(hand);
  const entries = info.features.reduce((n, f) => n + f.names.length, 0) + info.seas.reduce((n, s) => n + s.names.length, 0);
  return makeBlock({
    kind: 'names', licence: 'grind-strat-own', notice: NAMES_NOTICE, sources: ['grind-strat-own'],
    meta: { features: info.features.length, entries, seas: info.seas.length },
    layers: { info: new TextEncoder().encode(JSON.stringify(info)) },
  });
}

/** The hand file and the decoded water block from the repository. */
export async function namesInputs() {
  const hand = JSON.parse(await readFile(join(ROOT, 'tools/map/names-of-the-time.json'), 'utf8'));
  let text = null;
  for (const p of BLOCK_FILES.water) { try { text = await readFile(join(ROOT, p), 'utf8'); break; } catch { /* next */ } }
  if (!text) throw new Error('no water block to check the names against (run npm run map:pack for the water first)');
  return { hand, water: decodeWater(JSON.parse(text)) };
}

/** @returns {Promise<import('./block.mjs').Block>} */
export async function packNames() {
  const { hand, water } = await namesInputs();
  return namesBlock(hand, water);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  packNames().then(async (block) => {
    const text = await writeBlock(NAMES_BLOCK, block);
    console.log(`${NAMES_BLOCK}: ${(text.length / 1024).toFixed(1)} KB, ${JSON.stringify(block.meta)}`);
  }).catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

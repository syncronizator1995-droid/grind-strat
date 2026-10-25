// @ts-check
// The names of rivers, lakes and seas over time (src/data/own/names.json, M3a PR 2). Pure: no DOM,
// so it runs in Node for tests. The block says which name each record gives a river, lake or sea;
// this file links that list to the shipped water, says which name the map shows in a given year,
// and writes the text of the tap panel. Nothing here is saved: it is worked out again each time.
//
// One rule decides every name (the "resolver", see nameAt): a group (a lake, or one stretch of a
// river) takes the name its region's records give for the year, in the language that region's
// period uses; otherwise today's name stands in. "Later source" and "standing in" are worked out
// here, never stored in the data.

/**
 * @typedef {{ title: string, author: string, written?: number, about?: true, copy?: string }} NameSource
 *   written may be left out only when every entry citing it has `attested` (an annalistic chronicle).
 * @typedef {{ from: number, to: number | null, language: string, source: string, marks?: string[] }} Period
 *   from inclusive, to exclusive (null: open).
 * @typedef {{ region?: string, stretches?: string[], from?: number, to?: number, attested?: number,
 *   name: string, gloss?: string, language: string, source: string, where?: string,
 *   marks?: ('TO CHECK' | 'estimate' | 'disputed')[], map?: false }} NameEntry
 * @typedef {{ sources: Record<string, NameSource>, languages: Record<string, string>,
 *   regions: { id: string, name: string, rule?: 'today' }[], periods: Record<string, Period[]>,
 *   features: { kind: 'river' | 'lake', wikidata: string, names: NameEntry[] }[],
 *   seas: { id: string, name: string, ring: number[] | null, marks?: string[], names: NameEntry[] }[] }} NamesInfo
 */

/**
 * @typedef {{ feature: number, region: string | null, today: string, entries: NameEntry[] }} NameGroup
 *   feature: index into info.features; today: the stretch's text (or the lake's name) in today's data
 * @typedef {{ info: NamesInfo, groups: NameGroup[], lineGroup: Int32Array, lakeGroup: Int32Array,
 *   todayLine: string[], todayLake: string[], changeYears: number[] }} NameLink
 *   lineGroup/lakeGroup: -1 = the feature is not in the list; every line of a listed feature has a
 *   group (its entries may be empty, so the panel still finds the feature). changeYears: sorted
 *   unique finite from/to years of periods and entries, plus every attested and written year.
 * @typedef {{ epoch: number, line: string[], lake: string[] }} NameView what the map shows in one epoch
 * @typedef {{ years: string, name: string, language: string, source: string, marks: string[], stretch?: string }} NameRow
 * @typedef {{ title: string, kind: 'River' | 'Lake' | 'Sea', now: string, nowMarks: string[],
 *   over: { heading: string, rows: NameRow[] }[], today: string[], facts: string[] }} PanelInfo
 * @typedef {import('./hit.js').WaterHit} WaterHit
 */

/** No names at all: the map then shows today's, and a tap still opens a panel. @type {NamesInfo} */
export const NO_NAMES = Object.freeze({ sources: {}, languages: {}, regions: [], periods: {}, features: [], seas: [] });

/**
 * The text of each line's stretch today: the local name of the stretch where the data has one,
 * otherwise the river's. One rule, shared with the packer and with labels.js.
 * @param {import('./load.js').WaterData} water
 */
export function todayLines(water) {
  return water.rivers.map((_, i) => (water.lineName && water.lineNames[water.lineName[i]]) || water.riverInfo[water.riverOf[i]].name);
}

/**
 * The year a name was written: the entry's own `attested` (an annal's year), else its source's.
 * @param {NamesInfo} info @param {NameEntry} e
 * @returns {number | undefined}
 */
function attestedOf(info, e) {
  return e.attested ?? info.sources[e.source]?.written;
}

/**
 * Index of the one feature of a list whose wikidata is `id`; -1 for none or for several (a
 * shared id cannot say which one is meant).
 * @param {Map<string, number>} byId
 */
const unique = (byId, /** @type {string} */ id) => byId.get(id) ?? -1;

/**
 * @param {(string | null)[]} ids wikidata id per feature
 * @returns {Map<string, number>} id -> index, only for ids that occur once
 */
function uniqueIndex(ids) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  const twice = new Set();
  ids.forEach((id, k) => {
    if (!id) return;
    if (seen.has(id)) twice.add(id);
    else seen.set(id, k);
  });
  for (const id of twice) seen.delete(id);
  return seen;
}

/**
 * Links the list of names to the shipped water. A feature whose key matches nothing is ignored.
 * @param {NamesInfo} info @param {import('./load.js').WaterData} water
 * @returns {NameLink}
 */
export function linkNames(info, water) {
  const todayLine = todayLines(water);
  const todayLake = water.lakeInfo.map((l) => l.name);
  const lineGroup = new Int32Array(water.rivers.length).fill(-1);
  const lakeGroup = new Int32Array(water.lakeInfo.length).fill(-1);
  /** @type {NameGroup[]} */
  const groups = [];
  const riverAt = uniqueIndex(water.riverInfo.map((r) => r.wikidata));
  const lakeAt = uniqueIndex(water.lakeInfo.map((l) => l.wikidata));
  /** @type {number[][]} */
  const linesOf = water.riverInfo.map(() => []);
  water.riverOf.forEach((k, i) => linesOf[k]?.push(i));
  info.features.forEach((f, fi) => {
    if (f.kind === 'lake') {
      const k = unique(lakeAt, f.wikidata);
      if (k < 0) return;
      lakeGroup[k] = groups.length;
      groups.push({ feature: fi, region: f.names[0]?.region ?? null, today: todayLake[k], entries: f.names });
      return;
    }
    const k = unique(riverAt, f.wikidata);
    if (k < 0) return;
    // An entry without `stretches` covers the stretches no other entry names.
    const named = new Set(f.names.flatMap((e) => e.stretches ?? []));
    /** @type {Map<string, number>} */
    const groupOf = new Map();
    for (const i of linesOf[k]) {
      const text = todayLine[i];
      let g = groupOf.get(text);
      if (g === undefined) {
        const entries = f.names.filter((e) => (e.stretches ? e.stretches.includes(text) : !named.has(text)));
        g = groups.length;
        groupOf.set(text, g);
        groups.push({ feature: fi, region: entries[0]?.region ?? null, today: text, entries });
      }
      lineGroup[i] = g;
    }
  });
  return { info, groups, lineGroup, lakeGroup, todayLine, todayLake, changeYears: changeYearsOf(info) };
}

/** @param {NamesInfo} info */
function changeYearsOf(info) {
  const years = new Set();
  const add = (/** @type {number | null | undefined} */ y) => { if (typeof y === 'number' && Number.isFinite(y)) years.add(y); };
  for (const list of Object.values(info.periods)) for (const p of list) { add(p.from); add(p.to); }
  for (const s of Object.values(info.sources)) add(s.written);
  const entries = [...info.features.flatMap((f) => f.names), ...info.seas.flatMap((s) => s.names)];
  for (const e of entries) { add(e.from); add(e.to); add(e.attested); }
  return [...years].sort((a, b) => a - b);
}

/**
 * Which name a group shows in a year, and why. Rule: (1) no entry covers the year: today's text
 * (stand-in); (2) the region keeps today's names: today's text (today-rule); (3) the region's
 * period for the year, none: stand-in; (4) the entry the map may show, in the period's language,
 * covering the year: its name (record), none: stand-in.
 * @param {NameLink} link @param {number} group index into link.groups @param {number} year never 0
 * @returns {{ name: string, entry: NameEntry | null, why: 'record' | 'today-rule' | 'stand-in', later: boolean }}
 */
export function nameAt(link, group, year) {
  const g = link.groups[group];
  const standIn = { name: g.today, entry: null, why: /** @type {'stand-in'} */ ('stand-in'), later: false };
  const covers = (/** @type {NameEntry} */ e) => year >= (e.from ?? -Infinity) && year < (e.to ?? Infinity);
  const covering = g.entries.filter(covers);
  if (!covering.length) return standIn;
  const region = link.info.regions.find((r) => r.id === g.region);
  if (region?.rule === 'today') return { ...standIn, why: 'today-rule' };
  const period = (link.info.periods[g.region ?? ''] ?? []).find((p) => year >= p.from && year < (p.to ?? Infinity));
  if (!period) return standIn;
  const entry = covering.find((e) => e.map !== false && e.language === period.language);
  if (!entry) return standIn;
  const attested = attestedOf(link.info, entry);
  return { name: entry.name, entry, why: 'record', later: attested !== undefined && year < attested };
}

/**
 * How many change years lie at or before a year: the names on the map are the same while it
 * stays the same.
 * @param {NameLink} link @param {number} year
 */
export function epochAt(link, year) {
  const ys = link.changeYears;
  let lo = 0;
  let hi = ys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ys[mid] <= year) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The text the map shows for every line and lake in a year: today's, with the linked groups'
 * names put over it.
 * @param {NameLink} link @param {number} year
 * @returns {NameView}
 */
export function namesAt(link, year) {
  const line = link.todayLine.slice();
  const lake = link.todayLake.slice();
  const names = link.groups.map((_, g) => nameAt(link, g, year).name);
  link.lineGroup.forEach((g, i) => { if (g >= 0) line[i] = names[g]; });
  link.lakeGroup.forEach((g, k) => { if (g >= 0) lake[k] = names[g]; });
  return { epoch: epochAt(link, year), line, lake };
}

// --- the tap panel -------------------------------------------------------------------------

/** @param {number} y a year, BC negative */
const yearText = (y) => (y < 0 ? `${-y} BC` : String(y));

/**
 * When an entry's name was written: "about 1227", "1228" (an annal's year), "43", "44 BC".
 * @param {NamesInfo} info @param {NameEntry} e
 */
function writtenText(info, e) {
  if (e.attested !== undefined) return yearText(e.attested);
  const s = info.sources[e.source];
  if (s?.written === undefined) return '';
  return `${s.about ? 'about ' : ''}${yearText(s.written)}`;
}

/** The source as the panel names it: title, copy and place in it. @param {NamesInfo} info @param {NameEntry} e */
function sourceText(info, e) {
  const s = info.sources[e.source];
  if (!s) return e.source;
  // The author is named unless the title already does ("Henry of Livonia's Chronicle").
  const author = s.author && !s.title.includes(s.author.split(' ')[0]) ? `${s.author}, ` : '';
  return `${author}${s.title}${s.copy ? ` (${s.copy})` : ''}${e.where ? `, ${e.where}` : ''}`;
}

/** @param {NamesInfo} info @param {NameEntry} e @param {string} [stretch] @returns {NameRow} */
function rowOf(info, e, stretch) {
  const disputed = e.marks?.includes('disputed') ?? false;
  const shown = `${e.name}${e.gloss ? ` ('${e.gloss}')` : ''}${disputed ? '?' : ''}`;
  const marks = (e.marks ?? []).map((m) => (m === 'disputed' ? 'identification disputed' : m));
  return {
    years: writtenText(info, e), name: shown, language: info.languages[e.language] ?? e.language,
    source: sourceText(info, e), marks, ...(stretch ? { stretch } : {}),
  };
}

/** Rows sorted by the year written (unknown last), then by name. @param {{ row: NameRow, year: number }[]} list */
const sorted = (list) => list.sort((a, b) => a.year - b.year || a.row.name.localeCompare(b.row.name)).map((x) => x.row);

/**
 * @param {NamesInfo} info @param {NameEntry[]} entries @param {string} [stretch]
 */
function rowsOf(info, entries, stretch) {
  return sorted(entries.map((e) => ({ row: rowOf(info, e, stretch), year: attestedOf(info, e) ?? Infinity })));
}

const OTHER_NAMES = [['en', 'English'], ['lt', 'Lithuanian'], ['lv', 'Latvian'], ['et', 'Estonian'], ['pl', 'Polish'], ['de', 'German'], ['fi', 'Finnish'], ['sv', 'Swedish']];
/** Latin letters (with accents), spaces and the usual marks inside names. */
const LATIN_ONLY = /^[\p{Script=Latin}\p{Script=Common}\p{M}]+$/u;

/**
 * What the panel says about a name today, from the data's own names.
 * @param {string} shown the text on the map today @param {string | undefined} written the data's own spelling
 * @param {Record<string, string>} names the other names by language code
 */
function todayLines_(shown, written, names) {
  const lines = [shown ? `Today's name: ${shown}.` : 'Today\'s data gives it no name.'];
  if (written && written !== shown) lines.push(`Written in the data as: ${written}.`);
  const others = OTHER_NAMES.flatMap(([code, label]) => {
    const n = names[code];
    return n && n !== shown && LATIN_ONLY.test(n) ? [`${label} ${n}`] : [];
  });
  if (others.length) lines.push(`Other names: ${others.join('; ')}.`);
  lines.push('From OpenStreetMap.');
  return lines;
}

/**
 * Dated facts about a river or lake: the changes entry named by its date tag, the rule that
 * covers its tag's prefix, or an entry that is about its wikidata id.
 * @param {{ entries: import('./load.js').DatedEntry[], cites?: Record<string, string> } | null | undefined} dated
 * @param {string} tag @param {string | null} wikidata
 */
function factsOf(dated, tag, wikidata) {
  if (!dated) return [];
  /** @type {string[]} */
  const out = [];
  for (const e of dated.entries) {
    const byTag = Boolean(tag) && e.id === tag;
    const byPrefix = Boolean(tag) && Boolean(e.tagPrefix) && tag.startsWith(/** @type {string} */ (e.tagPrefix));
    const byAbout = Boolean(wikidata) && e.about?.wikidata === wikidata;
    if (!byTag && !byPrefix && !byAbout) continue;
    if (!e.fact) continue;
    const cite = e.source ? dated.cites?.[e.source] : undefined;
    const text = [e.fact, byPrefix ? '(year from OpenStreetMap)' : '', e.toCheck ? `(TO CHECK: ${e.toCheck})` : '', cite ? `Source: ${cite}.` : ''];
    const line = text.filter(Boolean).join(' ');
    if (!out.includes(line)) out.push(line);
  }
  return out;
}

/**
 * The "Name now" text and its marks for a group at a year.
 * @param {NameLink} link @param {NameGroup} group @param {number} year @param {'river' | 'lake'} kind
 */
function nowText(link, group, year, kind) {
  const r = nameAt(link, link.groups.indexOf(group), year);
  const info = link.info;
  if (r.why === 'record' && r.entry) {
    const e = r.entry;
    const lang = info.languages[e.language] ?? e.language;
    const s = info.sources[e.source];
    const when = e.attested !== undefined ? `entry for ${e.attested}` : writtenText(info, e) ? `written ${writtenText(info, e)}` : '';
    const from = `From ${s ? s.title : e.source}${s?.copy ? ` (${s.copy})` : ''}${e.where ? `, ${e.where}` : ''}${when ? `, ${when}` : ''}.`;
    const marks = [];
    if (r.later) {
      const y = attestedOf(info, e);
      const about = e.attested === undefined && s?.about ? 'about ' : '';
      marks.push(`later source (written ${about}${yearText(/** @type {number} */ (y))})`);
    }
    for (const m of e.marks ?? []) if (m !== 'disputed') marks.push(m);
    return { now: `Name now: ${r.name} (${lang}). ${from}`, marks };
  }
  if (r.why === 'today-rule') {
    const region = info.regions.find((x) => x.id === group.region);
    return { now: `Name now: ${r.name}. ${region?.name ?? 'This region'} keeps today's names; older written forms are listed below.`, marks: [] };
  }
  if (!r.name) return { now: `This ${kind} has no name in our data.`, marks: [] };
  return { now: `Name now: ${r.name}. No written form from this time is sourced yet; today's local name stands in.`, marks: ["today's name standing in"] };
}

/**
 * Everything the tap panel says about what was tapped. All text is plain English.
 * @param {object} p
 * @param {NameLink} p.link @param {import('./load.js').WaterData} p.water
 * @param {WaterHit} p.hit @param {number} p.year the map's year
 * @param {{ entries: import('./load.js').DatedEntry[], cites?: Record<string, string> } | null} [p.dated]
 * @returns {PanelInfo}
 */
export function panelInfo({ link, water, hit, year, dated }) {
  const info = link.info;
  if (hit.kind === 'sea') {
    const sea = info.seas.find((s) => s.id === hit.sea);
    const rough = sea?.marks?.includes('TO CHECK') ? ['Where this sea\'s edge lies for a tap is rough (TO CHECK).'] : [];
    return {
      title: sea?.name ?? 'Sea', kind: 'Sea', now: 'Seas are not named on the map.', nowMarks: [],
      over: sea?.names.length ? [{ heading: 'Names over time', rows: rowsOf(info, sea.names) }] : [], today: [], facts: rough,
    };
  }
  if (hit.kind === 'lake') {
    const k = hit.lake;
    const lake = water.lakeInfo[k];
    const g = link.lakeGroup[k];
    const text = link.todayLake[k];
    const shown = g >= 0 ? nowText(link, link.groups[g], year, 'lake') : { now: text ? `Name now: ${text}. No written form from this time is sourced yet; today's local name stands in.` : 'This lake has no name in our data.', marks: text ? ["today's name standing in"] : [] };
    const tag = water.tags?.[water.lakeTag?.[k] ?? 0] ?? '';
    return {
      title: text || 'Unnamed lake', kind: 'Lake', now: shown.now, nowMarks: shown.marks,
      over: g >= 0 && link.groups[g].entries.length ? [{ heading: 'Names over time', rows: rowsOf(info, link.groups[g].entries) }] : [],
      today: todayLines_(text, lake.local, lake.names), facts: factsOf(dated, tag, lake.wikidata),
    };
  }
  const river = water.riverInfo[hit.river];
  const g = link.lineGroup[hit.line];
  const text = link.todayLine[hit.line];
  const shown = g >= 0 ? nowText(link, link.groups[g], year, 'river') : { now: text ? `Name now: ${text}. No written form from this time is sourced yet; today's local name stands in.` : 'This river has no name in our data.', marks: text ? ["today's name standing in"] : [] };
  /** @type {PanelInfo['over']} */
  const over = [];
  if (g >= 0 && link.groups[g].entries.length) over.push({ heading: 'Names over time', rows: rowsOf(info, link.groups[g].entries) });
  if (g >= 0) {
    const rows = link.groups.flatMap((other, o) => (o !== g && other.feature === link.groups[g].feature ? rowsOf(info, other.entries, other.today) : []));
    if (rows.length) over.push({ heading: 'Elsewhere on this river', rows });
  }
  const tag = water.tags?.[water.lineTag?.[hit.line] ?? 0] ?? '';
  const written = water.lineName && water.lineName[hit.line] ? water.lineLocal[water.lineName[hit.line]] : river.local;
  return {
    title: text || 'Unnamed river', kind: 'River', now: shown.now, nowMarks: shown.marks, over,
    today: todayLines_(text, written || undefined, river.names), facts: factsOf(dated, tag, river.wikidata),
  };
}

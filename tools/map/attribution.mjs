// @ts-check
// Credits from one place. Writes ATTRIBUTION.md (repository root) and src/data/credits.json (what
// the game's Credits sheet and map credit line show) from tools/map/sources.json, for the sources
// the shipped data blocks name, plus the display font. A test fails when either file is stale.
//   node tools/map/attribution.mjs     (npm run attribution; npm run map:pack runs it too)
//
// credits.json goes into the game's code, so it holds no web addresses with a scheme and no file
// names (the build's address guard forbids both); ATTRIBUTION.md gives the full addresses.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, shippedBlockFiles } from './block.mjs';
import { rawSources } from './fetch.mjs';

export const REPO = 'github.com/syncronizator1995-droid/grind-strat';
const ATTRIBUTION = 'ATTRIBUTION.md';
const CREDITS = 'src/data/credits.json';

/**
 * What each block is for, in the player's words. Lower case: a dataset used for several lists
 * them after "Used for:" with semicolons, and only the first is capitalised (usedFor).
 */
const USES = /** @type {Record<string, string>} */ ({
  base: 'land, coast, heights and sea depths',
  terrain: 'the land around 1219: forest, open land, marsh and heath',
  water: 'rivers, lakes and their names',
});

/** "Used for: ..." text: the uses joined, the first letter capitalised. @param {string[]} uses */
export const usedFor = (uses) => {
  const text = uses.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * What making a block did to its sources, on top of each source's own changes. Each change
 * starts with what it applies to, as the sources' own changes do ("Rivers: ...").
 */
/** In the game, where the terrain rule is written up; ATTRIBUTION.md names the file instead. */
const TERRAIN_NOTES = 'the notes that come with the terrain data in the game\'s source code';
const BLOCK_CHANGES = /** @type {Record<string, string>} */ ({
  terrain: `Terrain grid: combined with the other terrain sources into one class per 1 km cell by a rule (${TERRAIN_NOTES} say how).`,
});

/** The honest labels: what the map is, and what it is not. */
const ABOUT = [
  'The map shows the land as it was around AD 1219, as far as it can be worked out today.',
  'Forest share: estimated from pollen records (about AD 750 to 1250). The exact forest edges are placed by a rule from today\'s land cover, terrain and rivers; they are not from a historical map.',
  'Marsh: from today\'s peat-soil and wetland maps plus today\'s open bogs. Where those maps show more bog than the pollen allows, bog wins and there is less forest than the pollen share (parts of north-west Russia, south-east Finland and east Estonia).',
  'Under modern reservoirs the land shows flat, at today\'s water level.',
];
/** What the rivers and lakes are, by where the shipped water comes from. */
const ABOUT_WATER = {
  osm: ['Rivers, lakes and the coast are today\'s, with today\'s local names; modern reservoirs are left out. Heights and sea depths are today\'s.'],
  ne: [
    'Rivers and lakes: for now Natural Earth\'s simpler set, with its names: local names for most rivers, English names for some big lakes. Fuller rivers and lakes from OpenStreetMap come next; until then the upper Nemunas (above Kaunas) and smaller lakes such as Drūkšiai are missing, and the map shows land where those lakes are.',
    'Rivers, lakes and the coast are today\'s; modern reservoirs are left out and the bigger natural lakes kept. Heights and sea depths are today\'s.',
  ],
};
const INTERIM = /** @type {Record<string, string>} */ ({
  terrain: 'Interim: the land cover shown is a stand-in made from today\'s land cover, not yet the land around 1219.',
  water: 'Interim: the rivers and lakes are a simpler stand-in (Natural Earth) until the OpenStreetMap ones are ready.',
});

/** Which licence covers which folder of the repository (the ODbL folder only once it ships). */
const ODBL_FOLDER = ['src/data/odbl/', 'Open Database License (ODbL) 1.0: OpenStreetMap rivers and lakes (see its LICENSE.md and README.md). Nothing else is mixed into it.'];
const FOLDERS = [
  ['src/data/by-sa/', 'Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0): the 1219 terrain grid (see its LICENSE.md and README.md).'],
  ['src/data/map/', 'Public domain data: Natural Earth (land, coast, rivers and lakes) and GEBCO (GEBCO asks to be credited; not for navigation).'],
  ['src/ui/fonts/', 'SIL Open Font License 1.1: the Grenze Gotisch font (see OFL.txt there).'],
  ['everything else', 'The code and the rest of the repository are under the repository\'s own licence (see README.md).'],
];

/**
 * @typedef {object} CreditEntry one dataset on the Credits sheet
 * @property {string} title @property {string} owner @property {string} version @property {string[]} uses
 * @property {string} line the notice to show @property {string} citation @property {string[]} changes
 * @property {string} licenceName @property {string} licenceUri without "https://"
 * @property {string[]} notes @property {string | null} unofficialCopy
 *
 * @typedef {object} Credits
 * @property {string[]} about @property {string[]} interim @property {string} mapLine
 * @property {CreditEntry[]} datasets @property {CreditEntry} font
 * @property {string | null} odblOffer where to get the OpenStreetMap-derived data
 */

/**
 * The font's credit, from its licence file.
 * @param {string} ofl the text of src/ui/fonts/OFL.txt
 * @returns {CreditEntry}
 */
function fontCredit(ofl) {
  const copyright = ofl.split('\n')[0].trim().replace(/https?:\/\//g, '');
  return {
    title: 'Grenze Gotisch (font)', owner: 'Omnibus-Type, The Grenze Gotisch Project Authors', version: 'Google Fonts release (variable weight)',
    uses: ['the game\'s title and date'], line: copyright, citation: copyright,
    changes: ['Cut down to Latin and Latin Extended letters and saved in a compact web font format.'],
    licenceName: 'SIL Open Font License 1.1', licenceUri: 'scripts.sil.org/OFL', notes: [], unofficialCopy: null,
  };
}

/**
 * Works out both files' contents.
 * @param {{ sources: import('./fetch.mjs').RawSource[], blocks: { kind: string, path: string, block: any }[], ofl: string }} input
 * @returns {{ markdown: string, credits: Credits }}
 */
export function makeAttribution({ sources, blocks, ofl }) {
  /** @typedef {{ entry: CreditEntry, ids: string[], files: Set<string>, urls: string[], readAt: Set<string> }} Group */
  /** @type {Map<string, Group>} */
  const byCitation = new Map();
  const missing = [];
  for (const { kind, path, block } of blocks) {
    for (const id of block.sources) {
      const s = sources.find((x) => x.id === id);
      if (!s) throw new Error(`the ${kind} block names "${id}", which is not in tools/map/sources.json`);
      const c = /** @type {any} */ (s.credit);
      for (const field of ['owner', 'version', 'short']) if (!c[field]) missing.push(`${id}: credit.${field}`);
      // Layers of one dataset (Natural Earth's land, rivers, lakes) share a citation: one entry.
      const key = c.citation;
      /** @type {Group} */
      const have = byCitation.get(key) ?? {
        entry: {
          title: String(c.short ?? id).replace(/^©\s*/, ''), owner: c.owner ?? '', version: c.version ?? '', uses: [], line: c.line,
          citation: c.citation, changes: [], licenceName: c.licenceName, licenceUri: c.licenceUri, notes: [...(c.notes ?? [])],
          unofficialCopy: s.unofficialCopy ?? null,
        },
        ids: [], files: new Set(), urls: [], readAt: new Set(),
      };
      if (!have.ids.includes(id)) {
        have.ids.push(id);
        have.urls.push(s.url);
        if (s.licenceReadAt) have.readAt.add(s.licenceReadAt);
        if (!have.entry.changes.includes(c.changes)) have.entry.changes.push(c.changes);
      }
      const extra = BLOCK_CHANGES[kind];
      if (extra && !block.interim && !have.entry.changes.includes(extra)) have.entry.changes.push(extra);
      const use = USES[kind] ?? kind;
      if (!have.entry.uses.includes(use)) have.entry.uses.push(use);
      have.files.add(path);
      byCitation.set(key, have);
    }
  }
  if (missing.length) {
    throw new Error(`tools/map/sources.json needs these credit fields for the shipped sources:\n- ${missing.join('\n- ')}\n`
      + '(owner: who made the data; version: which release or snapshot; short: the name on the map\'s credit line, e.g. "© OpenStreetMap contributors"; and onMap: true to keep it on that line)');
  }
  const all = [...byCitation.values()];
  const short = (/** @type {typeof all[number]} */ d) => String(/** @type {any} */ (sources.find((s) => s.id === d.ids[0])?.credit).short);
  const onMap = all.filter((d) => d.ids.some((id) => /** @type {any} */ (sources.find((s) => s.id === id)?.credit).onMap));
  // OpenStreetMap's credit leads the line, as its attribution guidelines ask for a visible credit.
  const isOsm = (/** @type {Group} */ d) => d.ids.some((id) => sources.find((s) => s.id === id)?.collection === 'osm');
  onMap.sort((a, b) => Number(isOsm(b)) - Number(isOsm(a)));
  const odbl = blocks.find((b) => b.block.licence === 'ODbL-1.0');
  const water = blocks.find((b) => b.kind === 'water');
  const osmWater = Boolean(water?.block.sources.some((/** @type {string} */ id) => sources.find((s) => s.id === id)?.collection === 'osm'));
  /** @type {Credits} */
  const credits = {
    about: [...ABOUT, ...(water ? ABOUT_WATER[osmWater ? 'osm' : 'ne'] : [])],
    interim: blocks.filter((b) => b.block.interim).map((b) => INTERIM[b.kind] ?? `Interim: the ${b.kind} data is a stand-in.`),
    mapLine: [...onMap.map(short), 'more'].join(' · '),
    datasets: all.map((d) => d.entry),
    font: fontCredit(ofl),
    odblOffer: odbl ? `${REPO}, folder src/data/odbl/` : null,
  };
  return { markdown: markdownOf(credits, all, blocks), credits };
}

/**
 * @param {Credits} credits
 * @param {{ entry: CreditEntry, ids: string[], files: Set<string>, urls: string[], readAt: Set<string> }[]} all
 * @param {{ kind: string, path: string, block: any }[]} blocks
 */
function markdownOf(credits, all, blocks) {
  const out = [
    '# Attribution',
    '',
    'Grind Strat\'s map is made from the open data below. This file is written by',
    '`tools/map/attribution.mjs` from `tools/map/sources.json` (run `npm run attribution`); do not edit it by',
    'hand. The game shows the same credits on its Credits sheet, and a short credit line on the map.',
    '',
    '## Which licence covers which folder',
    '',
    ...(credits.odblOffer ? [ODBL_FOLDER, ...FOLDERS] : FOLDERS).map(([folder, what]) => `- \`${folder}\`: ${what}`),
    '',
    'The game\'s combined data bundle (the way the blocks are put together in the game file) is also offered',
    ...(credits.odblOffer
      ? ['under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), while the contents of the ODbL block',
        `(\`src/data/odbl/\`) stay under the ODbL 1.0. The OpenStreetMap-derived data is offered at ${credits.odblOffer}.`]
      : ['under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). No OpenStreetMap data ships yet.']),
    '',
    'All data is used as it is, with no warranty. No data provider endorses this game. The GEBCO grid',
    'is not for navigation or any other purpose involving safety at sea.',
    '',
    '## The data blocks in the game',
    '',
    ...blocks.map((b) => `- \`${b.path}\` (${b.block.licence}${b.block.interim ? ', INTERIM: the release build refuses it' : ''}): ${USES[b.kind] ?? b.kind}. Notice: "${b.block.notice}"`),
    '',
    '## Datasets',
  ];
  for (const d of all) {
    const e = d.entry;
    out.push(
      '',
      `### ${e.title}`,
      '',
      `- Owner: ${e.owner}`,
      `- Version: ${e.version}`,
      `- Used for: ${usedFor(e.uses)}`,
      `- Where we got it: ${d.urls.join(', ')}${e.unofficialCopy ? `. This is an unofficial copy: ${e.unofficialCopy}` : ''}`,
      `- Licence: ${e.licenceName}, https://${e.licenceUri}`,
      `- Licence read at: ${[...d.readAt].join(' ')}`,
      `- Notice: ${e.line}`,
      `- Citation: ${e.citation}`,
      ...changesList(e.changes),
      ...(e.notes.length ? [`- Notes: ${e.notes.join(' ')}`] : []),
      `- Held in: ${[...d.files].map((f) => `\`${f}\``).join(', ')}, inlined into the game file \`dist/grind-strat.html\``,
    );
  }
  const f = credits.font;
  out.push(
    '',
    '## Font',
    '',
    `### ${f.title}`,
    '',
    `- Owner: ${f.owner}`,
    `- Used for: ${usedFor(f.uses)}`,
    '- Where we got it: https://github.com/google/fonts/tree/main/ofl/grenzegotisch',
    `- Licence: ${f.licenceName}, https://${f.licenceUri} (full text in \`src/ui/fonts/OFL.txt\`)`,
    `- Notice: ${f.line}`,
    ...changesList(f.changes),
    '- Held in: `src/ui/fonts/grenze-gotisch.woff2`, inlined into the game file `dist/grind-strat.html`',
    '',
  );
  return out.join('\n');
}

/**
 * "Changes we made" in the markdown: one line, or a nested list when a dataset has several
 * (Natural Earth's land, rivers and lakes each say what they are).
 * @param {string[]} changes
 */
function changesList(changes) {
  changes = changes.map((c) => c.replace(`${TERRAIN_NOTES} say how`, '`src/data/by-sa/README.md` says how'));
  return changes.length === 1 ? [`- Changes we made: ${changes[0]}`] : ['- Changes we made:', ...changes.map((c) => `  - ${c}`)];
}

/** Reads everything the two files are made from. */
export async function attributionInputs() {
  const blocks = await Promise.all(shippedBlockFiles().map(async ({ kind, path }) => {
    const block = JSON.parse(await readFile(join(ROOT, path), 'utf8'));
    return { kind, path, block: { ...block, bundle: undefined } };
  }));
  return { sources: await rawSources(), blocks, ofl: await readFile(join(ROOT, 'src', 'ui', 'fonts', 'OFL.txt'), 'utf8') };
}

/** @param {Credits} credits */
export const creditsText = (credits) => `${JSON.stringify(credits, null, 2)}\n`;

async function main() {
  const { markdown, credits } = makeAttribution(await attributionInputs());
  await writeFile(join(ROOT, ATTRIBUTION), markdown);
  await writeFile(join(ROOT, CREDITS), creditsText(credits));
  console.log(`wrote ${ATTRIBUTION} and ${CREDITS}: ${credits.datasets.length} datasets; map line "${credits.mapLine}"`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

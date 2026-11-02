// @ts-check
// Our own block: src/data/own/age-notes.json, the five notes of the ice-age maps (M3b, PR 2), under
// the game's own terms (not yet chosen; see src/data/own/LICENSE.md). Made from the hand file
// tools/map/age-notes.json. The block carries sentences, marks and the sources' authors, years and
// titles; the web links stay in the hand file and in data/sources.md (the game page carries none).
//
// Layer: info (JSON): { sources: { id: { author, year, title } }, ages: [{ id, year, title, stage, sentences }] }.
//
//   node tools/map/pack-age-notes.mjs     (npm run map:pack runs it too)

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, writeBlock, makeBlock } from './block.mjs';

export const AGE_NOTES_BLOCK = 'src/data/own/age-notes.json';
export const AGE_NOTES_NOTICE = 'Grind Strat\'s own work: the notes of the ice-age maps, each sentence with its sources named (author, year, title). Under the game\'s own terms, not yet chosen. Full source details and links are in the game\'s source code (data/sources.md).';
/** The marks a sentence may carry. */
export const NOTE_MARKS = ['TO CHECK', 'not yet confirmed'];
const AGE_IDS = ['age-10000bc', 'age-9500bc', 'age-8500bc', 'age-7500bc', 'age-5000bc'];

/**
 * Problems with the hand file (empty when it is fine).
 * @param {any} hand
 * @returns {string[]}
 */
export function ageNotesProblems(hand) {
  const out = [];
  const sources = hand.sources ?? {};
  for (const [id, s] of Object.entries(sources)) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) out.push(`source id ${id} is not kebab-case`);
    if (!s.author || !s.title || typeof s.year !== 'number' || !/^https:\/\//.test(s.url)) out.push(`source ${id} lacks author, title, year or an https link`);
  }
  const ids = (hand.ages ?? []).map((/** @type {any} */ a) => a.id);
  if (JSON.stringify(ids) !== JSON.stringify(AGE_IDS)) out.push(`the ages must be ${AGE_IDS.join(', ')} in that order`);
  for (const a of hand.ages ?? []) {
    if (!a.stage?.name || !a.stage.sources?.length) out.push(`${a.id}: no stage name with sources`);
    for (const id of a.stage?.sources ?? []) if (!sources[id]) out.push(`${a.id}: stage cites the unknown source ${id}`);
    if (!a.sentences?.length) out.push(`${a.id}: no sentences`);
    for (const s of a.sentences ?? []) {
      if (!s.text || !s.sources?.length) out.push(`${a.id}: a sentence has no text or no source: ${s.text}`);
      for (const id of s.sources ?? []) if (!sources[id]) out.push(`${a.id}: "${String(s.text).slice(0, 30)}" cites the unknown source ${id}`);
      for (const m of s.marks ?? []) if (!NOTE_MARKS.includes(m)) out.push(`${a.id}: unknown mark ${m}`);
    }
  }
  return out;
}

/**
 * The block's info: the hand file without the links.
 * @param {any} hand
 */
export function shippedInfo(hand) {
  /** @type {Record<string, { author: string, year: number, title: string }>} */
  const sources = {};
  for (const [id, s] of Object.entries(hand.sources)) sources[id] = { author: /** @type {any} */ (s).author, year: /** @type {any} */ (s).year, title: /** @type {any} */ (s).title };
  return { sources, ages: hand.ages };
}

/** @param {any} hand @returns {import('./block.mjs').Block} */
export function ageNotesBlock(hand) {
  const problems = ageNotesProblems(hand);
  if (problems.length) throw new Error(`the age notes do not add up:\n  ${problems.join('\n  ')}`);
  const info = shippedInfo(hand);
  return makeBlock({
    kind: 'age-notes', licence: 'grind-strat-own', notice: AGE_NOTES_NOTICE, sources: ['grind-strat-own'],
    meta: { ages: info.ages.length, sources: Object.keys(info.sources).length },
    layers: { info: new TextEncoder().encode(JSON.stringify(info)) },
  });
}

/** @returns {Promise<import('./block.mjs').Block>} */
export async function packAgeNotes() {
  return ageNotesBlock(JSON.parse(await readFile(join(ROOT, 'tools/map/age-notes.json'), 'utf8')));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  packAgeNotes().then(async (block) => {
    const text = await writeBlock(AGE_NOTES_BLOCK, block);
    console.log(`${AGE_NOTES_BLOCK}: ${(text.length / 1024).toFixed(1)} KB, ${JSON.stringify(block.meta)}`);
  }).catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

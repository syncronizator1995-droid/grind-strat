// @ts-check
// The five notes of the ice-age maps (M3b): every sentence cites a source with a link in
// data/sources.md, the wording rules the sceptics asked for, and that a 1219 game never reads them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { AGES } from '../src/sim/map-date.js';
import { followAge, landYearFor } from '../src/ui/map/dated.js';
import { loadAgeNotes, noTimes } from '../src/ui/map/load.js';
import { noteView } from '../src/ui/age-panel.js';
import { ageNotesBlock, ageNotesProblems } from '../tools/map/pack-age-notes.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (/** @type {string} */ p) => readFileSync(join(ROOT, p), 'utf8');
const hand = JSON.parse(read('tools/map/age-notes.json'));
const sourcesMd = read('data/sources.md');
const notes = await loadAgeNotes(JSON.parse(read('src/data/own/age-notes.json')), noTimes());
/** @type {{ age: string, text: string, sources: string[], marks: string[] }[]} */
const sentences = notes.ages.flatMap((a) => a.sentences.map((s) => ({ age: a.id, text: s.text, sources: s.sources, marks: s.marks ?? [] })));
const wholeText = (/** @type {string} */ id) => notes.ages.find((a) => a.id === id)?.sentences.map((s) => s.text).join(' ') ?? '';

describe('the age notes', () => {
  it('has one note for each of the five ages, and the shipped block is the hand file packed', () => {
    assert.deepEqual(notes.ages.map((a) => a.id), AGES.map((a) => a.id));
    assert.deepEqual(notes.ages.map((a) => a.year), AGES.map((a) => a.year));
    assert.deepEqual(ageNotesProblems(hand), []);
    assert.equal(read('src/data/own/age-notes.json'), `${JSON.stringify(ageNotesBlock(hand))}\n`, 'npm run map:pack was not run after the hand file changed');
  });

  it('cites a source for every sentence, and every source has its link in data/sources.md', () => {
    for (const s of sentences) {
      assert.ok(s.sources.length > 0, `${s.age}: "${s.text}" cites no source`);
      for (const id of s.sources) assert.ok(notes.sources[id], `${id} is not a source of the notes`);
    }
    for (const [id, src] of Object.entries(hand.sources)) {
      assert.ok(sourcesMd.includes(`\`${id}\``), `${id} is in data/sources.md`);
      assert.ok(sourcesMd.includes(/** @type {any} */ (src).url), `${id}: its link is in data/sources.md`);
    }
    for (const a of notes.ages) assert.ok(a.stage.sources.length > 0, `${a.id}: the water's name cites a source`);
  });

  it('never says "BP", writes heights as "now found", and is in Latin letters', () => {
    for (const s of sentences) {
      assert.ok(!/\bBP\b/.test(s.text), `BP in "${s.text}"`);
      if (/\d\s*m up\b/.test(s.text)) assert.match(s.text, /now found/, `"${s.text}" gives a height without "now found"`);
      assert.ok(!/\bp?\d+\s*(?:to \d+\s*)?m (?:above|high)\b/.test(s.text), `"${s.text}" writes a height as if the water stood that high`);
      assert.ok(!/[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}]/u.test(s.text), `non-Latin letters in "${s.text}"`);
    }
    for (const a of notes.ages) assert.ok(!/[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}]/u.test(JSON.stringify(a)), `${a.id} has non-Latin letters`);
  });

  it('carries the sceptics\' corrections', () => {
    /** @param {...string} ids */
    const all = (...ids) => ids.map(wholeText).join(' ');
    assert.match(wholeText('age-10000bc'), /old shores are now found 140 to 160 m up/);
    assert.match(wholeText('age-10000bc'), /since about 13,000 years ago/);
    assert.match(wholeText('age-9500bc'), /short spell of slightly salty \(brackish\) water/);
    assert.match(wholeText('age-7500bc'), /one of the largest Stone Age cemeteries in northern Europe/);
    assert.doesNotMatch(all(...AGES.map((a) => a.id)), /longest-used/);
    assert.match(wholeText('age-7500bc'), /Elk is the main game, with beaver and wild boar; bones of red deer and aurochs were used to make tools/);
    assert.match(wholeText('age-8500bc'), /1968-73 and 1975-76/);
    assert.match(wholeText('age-7500bc'), /Ladoga is already a lake of its own/);
    assert.match(wholeText('age-7500bc'), /SGU\) still shows a lake here, while Estonian studies/);
    assert.match(wholeText('age-5000bc'), /first pottery, made by people who still hunted and fished/);
    assert.match(wholeText('age-5000bc'), /Kuyavia.*5,300/);
    assert.doesNotMatch(all(...AGES.map((a) => a.id)), /Zealand/, 'Zealand is not sourced: left out');
    // Late Swiderian hunters cite only the two papers the sceptic left standing (S8, S9).
    const swid = notes.ages.find((a) => a.id === 'age-9500bc')?.sentences.find((s) => /Late Swiderian/.test(s.text));
    assert.deepEqual(swid?.sources.slice().sort(), ['berg-hansen-2019', 'riede-ivanovaite-2018']);
  });

  it('tags converted dates and the reservoir effect, and marks what is not yet checked or confirmed', () => {
    for (const s of sentences) {
      if (/converted by us/.test(s.text)) assert.match(s.text, /converted by us \(IntCal20\)/);
      if (/converted by us/.test(s.text)) assert.ok(s.sources.includes('reimer-2020'), `"${s.text}" cites the curve`);
    }
    assert.match(wholeText('age-7500bc'), /may read too old \(the reservoir effect/);
    assert.match(wholeText('age-5000bc'), /may read too old \(the reservoir effect\)/);
    const mammoth = sentences.find((s) => /mammoth/.test(s.text));
    assert.deepEqual(mammoth?.marks, ['not yet confirmed']);
    assert.equal(mammoth?.age, 'age-10000bc');
    const ahrens = sentences.find((s) => /Ahrensburgian/.test(s.text));
    assert.deepEqual(ahrens?.marks, ['TO CHECK']);
  });

  it('writes the sheet in plain words: marks as "Not yet ...", sources by name, no web addresses', () => {
    for (const a of notes.ages) {
      const v = noteView(a, notes, false);
      assert.ok(v.lead.includes('not built yet'));
      assert.ok(v.sources.length > 0 && v.sources.every((s) => !/https?:|\/\//.test(s)));
      for (const s of v.sentences) assert.ok(s.from.length > 0);
      assert.ok(!/TO CHECK/.test(JSON.stringify(v)), 'TO CHECK is shown as "Not yet checked"');
    }
  });
});

describe('a 1219 game never reads the ice-age blocks', () => {
  it('follows no age for AD years, and leaves the land where it was while an age shows', () => {
    assert.deepEqual(followAge(null, 1219), { age: null, changed: false });
    assert.deepEqual(followAge(null, 1), { age: null, changed: false });
    const enter = followAge(null, -9500);
    assert.deepEqual(enter, { age: { id: 'age-9500bc', year: -9500 }, changed: true });
    assert.equal(followAge(enter.age, -9000).changed, false, 'still the same age');
    assert.equal(followAge(enter.age, -8500).changed, true);
    const back = followAge(enter.age, 1219);
    assert.deepEqual(back, { age: null, changed: true });
    assert.equal(landYearFor(-9500, 1350), 1350, 'the land stays parked in an age');
    assert.equal(landYearFor(1219, 1350), 1219, 'and the way back is the date layer\'s ordinary move');
  });

  it('reads the notes and the ages only from the banner and the BC date, never at start-up', () => {
    const main = read('src/ui/main.js');
    const show = main.slice(main.indexOf('async function showMap()'), main.indexOf('function showTestYear'));
    assert.ok(!/age-notes|'ages'|loadAgeNotes|loadAges|ageNotes\(|loadAgeMaps/.test(show), 'showMap does not touch the ice-age blocks');
    assert.equal((main.match(/readBlock\('age-notes'\)/g) ?? []).length, 1);
    assert.equal((main.match(/readOptionalBlock\('ages'\)/g) ?? []).length, 1);
    assert.ok(/function ageNotes\(\)[\s\S]*?readBlock\('age-notes'\)/.test(main));
    // loadAgeMaps and ageNotes are called only from onAgeChange / openAgeNote, which run for a shown age.
    assert.equal((main.match(/loadAgeMaps\(\)/g) ?? []).length, 2, 'its definition and one call');
    assert.equal((main.match(/ageNotes\(\)/g) ?? []).length, 2, 'its definition and one call');
  });
});

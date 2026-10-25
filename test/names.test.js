// @ts-check
// Tests for the names of rivers, lakes and seas over time (src/ui/map/names.js), on a small
// INVENTED list (test/fixtures/names-invented.js): which name shows when, the marks, the panel.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { epochAt, linkNames, nameAt, namesAt, namesShapeProblem, NO_NAMES, OF_THE_TIME_YEARS, ofTheTimeFrom, panelInfo } from '../src/ui/map/names.js';
import { dated, info, water } from './fixtures/names-invented.js';

const link = linkNames(info, water);
/** Group of a stretch. @param {number} line */
const groupOfLine = (line) => link.lineGroup[line];
const alpha = groupOfLine(0);
const beta = groupOfLine(1);
const gamma = groupOfLine(2);

describe('linking', () => {
  it('gives every line of a listed river a group, and leaves others and unknown keys alone', () => {
    assert.ok(alpha >= 0 && beta >= 0 && gamma >= 0 && alpha !== beta);
    assert.equal(groupOfLine(3), -1, 'Zeta is not in the list');
    assert.equal(link.lakeGroup[2], -1);
    assert.ok(link.lakeGroup[0] >= 0 && link.lakeGroup[1] >= 0);
    assert.equal(link.groups.length, 5, 'the feature with an unknown key adds no group');
    assert.deepEqual(link.todayLine, ['Alpha', 'Beta', 'Gamma', 'Zeta']);
    assert.deepEqual(link.todayLake, ['Delta', 'Epsilon', 'Eta']);
  });
  it('gives an entry without stretches the stretches no entry names', () => {
    assert.equal(link.groups[gamma].entries.length, 3);
    assert.deepEqual(link.groups[alpha].entries.map((e) => e.name), ['Alphus', 'Alphe', 'Alphonse']);
    assert.deepEqual(link.groups[beta].entries.map((e) => e.name), ['Betus']);
  });
  it('lists the change years, sorted and unique, with the years written and when they become of the time', () => {
    assert.deepEqual(link.changeYears, [-69, -44, 18, 43, 1202, 1219, 1227, 1228, 1250, 1253, 1275, 1290, 1300, 1301, 1326, 1400]);
  });
});

describe('the name a group shows in a year', () => {
  /** @param {number} g @param {number} y */
  const at = (g, y) => nameAt(link, g, y);
  it('Alpha: today\'s name before 1219, Latin to 1289, German to 1399, today\'s from 1400', () => {
    for (const y of [1218, 1400, 2026, -10000]) assert.deepEqual([at(alpha, y).name, at(alpha, y).why], ['Alpha', 'stand-in'], String(y));
    for (const y of [1219, 1289]) assert.deepEqual([at(alpha, y).name, at(alpha, y).why], ['Alphus', 'record'], String(y));
    for (const y of [1290, 1325, 1326, 1399]) assert.deepEqual([at(alpha, y).name, at(alpha, y).why], ['Alphe', 'record'], String(y));
  });
  it('marks a later source only when written more than 25 years after the year shown', () => {
    assert.equal(OF_THE_TIME_YEARS, 25);
    assert.equal(at(alpha, 1219).later, false, 'written about 1227: of the time for 1219');
    assert.equal(at(alpha, 1289).later, false);
    assert.equal(at(alpha, 1290).later, true, 'written 1326: 36 years later');
    assert.equal(at(alpha, 1300).later, true);
    assert.equal(at(alpha, 1301).later, false, 'exactly 25 years before');
    assert.equal(at(alpha, 1326).later, false);
  });
  it('counts the 25 years across the start of the era without a year 0', () => {
    assert.equal(ofTheTimeFrom(1227), 1202);
    assert.equal(ofTheTimeFrom(26), 1);
    assert.equal(ofTheTimeFrom(25), -1);
    assert.equal(ofTheTimeFrom(20), -6);
    assert.equal(ofTheTimeFrom(-44), -69);
  });
  it('lets a stretch entry change only its own lines', () => {
    assert.equal(at(beta, 1249).name, 'Beta');
    assert.equal(at(beta, 1250).name, 'Betus');
    assert.equal(at(beta, 1250).later, true, 'attested 1300 beats the source\'s 1227');
    assert.equal(at(beta, 1274).later, true);
    assert.equal(at(beta, 1275).later, false);
    const view = namesAt(link, 1260);
    assert.deepEqual(view.line, ['Alphus', 'Betus', 'Gammus', 'Zeta']);
  });
  it('never shows an entry of a region that keeps today\'s names, or a panel-only or other-language one', () => {
    for (const y of [-10000, 1219, 1300, 1399, 2026]) {
      assert.deepEqual([at(link.lakeGroup[1], y).name, at(link.lakeGroup[1], y).why], ['Epsilon', 'today-rule']);
    }
    assert.equal(at(gamma, 1219).name, 'Gammus', 'not the disputed Greek form, not the Old East Slavic one');
    assert.equal(at(gamma, 1300).name, 'Gamma', 'German period, no German entry: today\'s stands in');
    assert.equal(at(gamma, 1300).why, 'stand-in');
  });
  it('lake: Latin, then German, in the same group', () => {
    assert.equal(at(link.lakeGroup[0], 1219).name, 'Deltus');
    assert.equal(at(link.lakeGroup[0], 1290).name, 'Deltun');
    assert.equal(at(link.lakeGroup[0], 1400).name, 'Delta');
  });
});

describe('epochs and the view', () => {
  it('changes epoch only at the change years', () => {
    let last = epochAt(link, -10000);
    for (let y = -10000; y <= 2026; y++) {
      if (y === 0) continue;
      const e = epochAt(link, y);
      if (link.changeYears.includes(y)) assert.equal(e, last + 1, `at ${y}`);
      else assert.equal(e, last, `at ${y}`);
      last = e;
    }
    assert.equal(epochAt(link, 1218), 5);
    assert.equal(epochAt(link, 1219), 6);
  });
  it('leaves unlinked lines and lakes equal to today\'s, and copies rather than shares', () => {
    const v = namesAt(link, 1219);
    assert.equal(v.line[3], 'Zeta');
    assert.equal(v.lake[2], 'Eta');
    assert.deepEqual(v.line, ['Alphus', 'Beta', 'Gammus', 'Zeta']);
    v.line[0] = 'changed';
    assert.equal(link.todayLine[0], 'Alpha');
    const none = linkNames(NO_NAMES, water);
    assert.deepEqual(namesAt(none, 1300).line, none.todayLine);
    assert.equal(epochAt(none, 1300), 0);
  });
});

describe('the tap panel', () => {
  const hitRiver = (/** @type {number} */ river, /** @type {number} */ line) => /** @type {const} */ ({ kind: 'river', river, line });
  it('says where a name now comes from', () => {
    const p = panelInfo({ link, water, hit: hitRiver(0, 0), year: 1219, dated });
    assert.equal(p.title, 'Alpha');
    assert.equal(p.kind, 'River');
    assert.equal(p.now, 'Name now: Alphus (Latin). From Invented Chronicle A, I 2, written about 1227.');
    assert.deepEqual(p.nowMarks, [], 'about 1227 is of the time for 1219');
    assert.deepEqual(panelInfo({ link, water, hit: hitRiver(0, 0), year: -100, dated }).nowMarks, ['today\'s name standing in']);
    const q = panelInfo({ link, water, hit: hitRiver(0, 0), year: 1300, dated });
    assert.equal(q.now, 'Name now: Alphe (Middle High German). From Invented Rhymed Chronicle B (Invented copy), v. 1, written 1326.');
    assert.deepEqual(q.nowMarks, ['later source (written 1326)']);
    const b = panelInfo({ link, water, hit: hitRiver(0, 1), year: 1260, dated });
    assert.equal(b.now, 'Name now: Betus (Latin). From Invented Chronicle A, entry for 1300.');
    assert.deepEqual(b.nowMarks, ['later source (written 1300)', 'estimate']);
  });
  it('says so when today\'s name stands in, or a region keeps today\'s names', () => {
    const s = panelInfo({ link, water, hit: hitRiver(0, 0), year: 1500, dated });
    assert.equal(s.now, 'Name now: Alpha. No written form from this time is sourced yet; today\'s local name stands in.');
    assert.deepEqual(s.nowMarks, ['today\'s name standing in']);
    const t = panelInfo({ link, water, hit: { kind: 'lake', lake: 1 }, year: 1300, dated });
    assert.equal(t.now, 'Name now: Epsilon. Homeland keeps today\'s names; older written forms are listed below.');
    assert.equal(t.over[0].rows[0].name, 'Epsilonus', 'the panel still lists the form the map never shows');
    const z = panelInfo({ link, water, hit: hitRiver(2, 3), year: 1300, dated });
    assert.equal(z.now, 'Name now: Zeta. No written form from this time is sourced yet; today\'s local name stands in.');
    assert.deepEqual(z.over, []);
  });
  it('lists every name by year, with glosses, disputes, BC years and the rest of the river', () => {
    const p = panelInfo({ link, water, hit: hitRiver(0, 0), year: 1219, dated });
    assert.equal(p.over[0].heading, 'Names over time');
    assert.deepEqual(p.over[0].rows.map((r) => [r.years, r.name]), [['about 44 BC', 'Alphonse'], ['about 1227', 'Alphus'], ['1326', 'Alphe']]);
    assert.equal(p.over[1].heading, 'Elsewhere on this river');
    assert.deepEqual(p.over[1].rows.map((r) => r.name), ['Betus']);
    assert.deepEqual(p.over[1].rows[0].stretches, ['Beta']);
    assert.deepEqual(p.over[1].rows[0].marks, ['estimate']);
    const g = panelInfo({ link, water, hit: hitRiver(1, 2), year: 1219, dated });
    assert.deepEqual(g.over[0].rows.map((r) => [r.years, r.name, r.language, r.marks]), [
      ['43', 'Gamaris?', 'Ancient Greek', ['identification disputed']],
      ['about 1227', 'Gammus', 'Latin', []],
      ['1253', 'Gamma-annal', 'Old East Slavic', []],
    ]);
    const lake = panelInfo({ link, water, hit: { kind: 'lake', lake: 0 }, year: 1219, dated });
    assert.equal(lake.over[0].rows[0].name, "Deltus ('Mother of lakes')");
    assert.equal(lake.over[0].rows[0].source, 'Invented Chronicle A, XV 7');
  });
  it('writes today\'s names: local, written, other languages in Latin letters, and the data\'s source', () => {
    const p = panelInfo({ link, water, hit: hitRiver(0, 1), year: 1219, dated });
    assert.deepEqual(p.today, ['Today\'s name: Beta.', 'Written in the data as: Бэта.', 'Other names: English Alpha River; Latvian Alfa.', 'From OpenStreetMap.'], 'the Cyrillic name is left out');
  });
  it('writes dated facts by tag, by tag prefix and by wikidata id', () => {
    const lake = panelInfo({ link, water, hit: { kind: 'lake', lake: 0 }, year: 2000, dated });
    assert.deepEqual(lake.facts, ['Invented reservoir, filled 1959. (TO CHECK: the year) Source: Invented source one.']);
    const osm = panelInfo({ link, water, hit: { kind: 'lake', lake: 1 }, year: 2000, dated });
    assert.deepEqual(osm.facts, ['Invented man-made lake. (year from OpenStreetMap)']);
    const about = panelInfo({ link, water, hit: hitRiver(1, 2), year: 2000, dated });
    assert.deepEqual(about.facts, ['Invented fact about Gamma.']);
    assert.deepEqual(panelInfo({ link, water, hit: hitRiver(1, 2), year: 2000, dated: null }).facts, []);
  });
  it('writes a sea', () => {
    const p = panelInfo({ link, water, hit: { kind: 'sea', sea: 'main' }, year: 1219, dated });
    assert.equal(p.title, 'Invented Sea');
    assert.equal(p.kind, 'Sea');
    assert.equal(p.now, 'Seas are not named on the map.');
    assert.equal(p.over[0].rows[0].name, "Mare Inventum ('the invented sea')");
    assert.deepEqual(panelInfo({ link, water, hit: { kind: 'sea', sea: 'gulf' }, year: 1219, dated }).over, []);
    assert.equal(panelInfo({ link, water, hit: { kind: 'sea', sea: 'gulf' }, year: 1219, dated }).facts.length, 1);
  });
  it('still opens with today\'s names when there is no list of names', () => {
    const none = linkNames(NO_NAMES, water);
    const p = panelInfo({ link: none, water, hit: hitRiver(0, 0), year: 1219, dated });
    assert.equal(p.title, 'Alpha');
    assert.match(p.now, /today's local name stands in/);
  });
});

describe('the rest of the river', () => {
  // INVENTED: river 0 gets a third stretch, Kappa; one name covers both Beta and Kappa.
  const water3 = {
    ...water,
    rivers: [...water.rivers, Int32Array.from([4000, 500, 5000, 500])],
    riverLevels: new Uint8Array(12),
    riverOf: Uint32Array.from([0, 0, 1, 2, 0]),
    lineName: Uint32Array.from([0, 1, 0, 0, 2]),
    lineNames: ['', 'Beta', 'Kappa'],
    lineLocal: ['', '', ''],
    lineTag: Uint32Array.from([0, 0, 0, 0, 0]),
  };
  const info3 = { ...info, features: [{ kind: /** @type {const} */ ('river'), wikidata: 'Qr1', names: [
    { region: 'west', stretches: ['Alpha'], name: 'Alphus', language: 'la', source: 'src-a' },
    { region: 'west', stretches: ['Beta', 'Kappa'], name: 'Betkap', language: 'la', source: 'src-a' },
  ] }] };
  const l3 = linkNames(info3, water3);
  it('lists a name used on several other stretches once, with all of them', () => {
    const p = panelInfo({ link: l3, water: water3, hit: { kind: 'river', river: 0, line: 0 }, year: 1219, dated: null });
    assert.deepEqual(p.over[1].rows.map((r) => [r.name, r.stretches]), [['Betkap', ['Beta', 'Kappa']]]);
  });
  it('does not repeat a name the tapped stretch already lists', () => {
    const p = panelInfo({ link: l3, water: water3, hit: { kind: 'river', river: 0, line: 1 }, year: 1219, dated: null });
    assert.deepEqual(p.over[0].rows.map((r) => r.name), ['Betkap']);
    assert.deepEqual(p.over[1].rows.map((r) => [r.name, r.stretches]), [['Alphus', ['Alpha']]]);
  });
});

describe('a damaged names block', () => {
  it('passes the invented list and the empty one', () => {
    assert.equal(namesShapeProblem(info), null);
    assert.equal(namesShapeProblem(NO_NAMES), null);
  });
  it('finds a missing part, a feature without names, a bad name or period', () => {
    assert.match(String(namesShapeProblem(null)), /not an object/);
    assert.match(String(namesShapeProblem({ ...info, periods: undefined })), /no periods/);
    assert.match(String(namesShapeProblem({ ...info, features: [{ kind: 'river', wikidata: 'Q1' }] })), /feature/);
    assert.match(String(namesShapeProblem({ ...info, features: [{ kind: 'river', wikidata: 'Q1', names: [{ name: 3 }] }] })), /name of Q1/);
    assert.match(String(namesShapeProblem({ ...info, seas: [{ id: 'x', name: 'X', ring: 'no', names: [] }] })), /sea/);
    assert.match(String(namesShapeProblem({ ...info, periods: { west: [{ from: '1219' }] } })), /period/);
  });
});

describe('on the shipped water', async () => {
  const { readFileSync } = await import('node:fs');
  const { loadWater, noTimes } = await import('../src/ui/map/load.js');
  const { indexWater } = await import('../src/ui/map/labels.js');
  const real = await loadWater(JSON.parse(readFileSync(new URL('../src/data/odbl/water.json', import.meta.url), 'utf8')), noTimes());

  it('keeps every lake\'s rings together', () => {
    const idx = indexWater(real);
    assert.equal(idx.lakeRingStart[real.lakeInfo.length], real.lakes.length);
  });
  it('links an empty list at once, and a list whose keys match nothing leaves today\'s names', () => {
    const t0 = performance.now();
    const none = linkNames(NO_NAMES, real);
    assert.ok(performance.now() - t0 < 50);
    assert.ok(none.lineGroup.every((g) => g === -1));
    const stray = linkNames({ ...info, features: [{ kind: 'river', wikidata: 'Q-invented', names: [] }] }, real);
    assert.deepEqual(namesAt(stray, 1300).line, stray.todayLine);
  });
  it('links the real Daugava (a feature the list may name) with a group per stretch text', () => {
    const k = real.riverInfo.findIndex((r) => r.wikidata === 'Q8197');
    assert.ok(k >= 0);
    const l = linkNames({ ...NO_NAMES, features: [{ kind: 'river', wikidata: 'Q8197', names: [] }] }, real);
    const texts = new Set(l.groups.map((g) => g.today));
    assert.ok(texts.has('Daugava'), [...texts].join(', '));
    assert.ok(real.riverOf.every((r, i) => (r === k) === (l.lineGroup[i] >= 0)));
  });
});

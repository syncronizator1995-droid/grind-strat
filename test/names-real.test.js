// @ts-check
// Checks of the SHIPPED names (src/data/own/names.json) against the SHIPPED water and land: what the
// map shows in 1219, 1290 and 1400, that Lithuania keeps today's names, that a tap on a gulf's ring
// over land is not the sea, and that the label font covers every letter the names use.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { hitWater, pointInRings } from '../src/ui/map/hit.js';
import { indexWater } from '../src/ui/map/labels.js';
import { loadMap, loadNames, loadWater, noTimes } from '../src/ui/map/load.js';
import { linkNames, namesAt, nameAt, panelInfo } from '../src/ui/map/names.js';

const ROOT = new URL('..', import.meta.url).pathname;
/** @param {string} path */
const block = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const { map } = await loadMap(block('src/data/map/base.json'), block('src/data/by-sa/terrain-1219.json'));
const water = await loadWater(block('src/data/odbl/water.json'), noTimes());
const info = await loadNames(block('src/data/own/names.json'), noTimes());
const link = linkNames(info, water);

/** The set of texts that differ from today's, over lines and lakes. @param {number} year */
function changedAt(year) {
  const v = namesAt(link, year);
  const out = new Set();
  v.line.forEach((t, i) => { if (t !== link.todayLine[i]) out.add(t); });
  v.lake.forEach((t, i) => { if (t !== link.todayLake[i]) out.add(t); });
  return out;
}

describe('the shipped names at three dates', () => {
  it('Lithuania keeps today\'s names at every year', () => {
    const groups = link.groups.map((g, i) => ({ g, i })).filter(({ g }) => g.region === 'lithuania');
    assert.ok(groups.length >= 2, 'Nemunas and Neris at least');
    for (let y = -500; y <= 2021; y += y < 1200 ? 50 : 1) {
      if (y === 0) continue;
      for (const { g, i } of groups) assert.equal(nameAt(link, i, y).name, g.today, `${g.today} in ${y}`);
    }
  });

  it('1219 shows the forms of its time', () => {
    const names = changedAt(1219);
    for (const n of ['Duna', 'Coiwa', 'Ilmer', 'Recens mare', 'Mater Aquarum', 'Chudskoye ozero']) assert.ok(names.has(n), n);
    assert.ok(!names.has('Dune'));
  });

  it('1290 shows Dune for the Daugava', () => {
    const names = changedAt(1290);
    assert.ok(names.has('Dune'));
    assert.ok(!names.has('Duna'));
  });

  it('1400 and later show today\'s names everywhere', () => {
    for (const y of [1400, 1700, 2021]) assert.equal(changedAt(y).size, 0, String(y));
  });

  it('linking and the names of one year are quick', () => {
    const t0 = performance.now();
    linkNames(info, water);
    for (let y = 1219; y <= 2021; y += 25) namesAt(link, y);
    assert.ok(performance.now() - t0 < 250);
  });

  it('every feature the list names was found in the water', () => {
    assert.equal(link.groups.length > 0, true);
    const found = info.features.filter((f) => link.groups.some((g) => info.features[g.feature] === f)).length;
    assert.equal(found, info.features.length, 'no feature lost its link');
  });

  it('titles a panel with today\'s name, for a lake with no record and for the open sea', () => {
    // A lake the list does not name (Lithuania's lakes are not in it): today's name, standing in.
    const k = link.lakeGroup.findIndex((g) => g < 0);
    assert.ok(k >= 0);
    const lake = panelInfo({ link, water, hit: { kind: 'lake', lake: k }, year: 1350, dated: null });
    assert.equal(lake.title, link.todayLake[k]);
    assert.match(lake.now, /stands in/);
    // A listed lake whose map name in 1350 is not today's: the title is still today's name.
    const peipus = info.features.findIndex((f) => f.kind === 'lake' && f.wikidata === 'Q19253');
    const kp = link.lakeGroup.findIndex((g) => g >= 0 && link.groups[g].feature === peipus);
    assert.ok(kp >= 0, 'Lake Peipus is linked');
    const p = panelInfo({ link, water, hit: { kind: 'lake', lake: kp }, year: 1350, dated: null });
    assert.equal(p.title, link.todayLake[kp]);
    assert.notEqual(namesAt(link, 1350).lake[kp], p.title, 'the map shows the old name in 1350');
    const sea = panelInfo({ link, water, hit: { kind: 'sea', sea: 'baltic' }, year: 1350, dated: null });
    assert.equal(sea.title, 'Baltic Sea');
    const rows = sea.over.flatMap((o) => o.rows.map((r) => r.name)).join('|');
    for (const n of ['Mare Balticum', 'Ostersê', 'More Varyazhskoye']) assert.ok(rows.includes(n), n);
  });
});

describe('a tap on a gulf is a tap on open sea only', () => {
  const index = indexWater(water);
  const seas = info.seas.map((s) => ({ id: s.id, ring: s.ring }));
  const land = (/** @type {number} */ x, /** @type {number} */ y) => pointInRings(x, y, map.land);
  const sea = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && y >= 0 && x <= map.width && y <= map.height && !land(x, y);
  const hit = (/** @type {number} */ x, /** @type {number} */ y) => hitWater({
    x, y, scale: 0.2, level: 1, water, index, labels: null, fx: 0, fy: 0, lineShown: () => true, lakeShown: () => true, sea, seas,
  });

  it('never picks a gulf on land inside its ring, and picks one on the open water inside it', () => {
    let onLand = 0;
    let onSea = 0;
    for (const s of info.seas.filter((x) => x.ring)) {
      const ring = /** @type {number[]} */ (s.ring);
      const xs = ring.filter((_, i) => i % 2 === 0);
      const ys = ring.filter((_, i) => i % 2 === 1);
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 60) {
        for (let y = Math.min(...ys); y <= Math.max(...ys); y += 60) {
          if (!pointInRings(x, y, [ring])) continue;
          const h = hit(x, y);
          if (land(x, y)) {
            onLand++;
            assert.ok(!(h && h.kind === 'sea'), `land at ${x},${y} is not the sea`);
          } else if (h && h.kind === 'sea') {
            onSea++;
            assert.equal(h.sea, s.id);
          }
        }
      }
    }
    assert.ok(onLand > 50 && onSea > 50, `${onLand} land and ${onSea} sea points tried`);
  });
});

describe('the panel title font covers every title the panel can show', () => {
  // The map's labels use the phone's own serif font (labels.js labelFont), which the browser fills
  // letter by letter. The panel's title uses our display font, Grenze Gotisch, subset by
  // tools/subset-font.py: the title is always today's name (a river, a line, a lake or a sea).
  it('keeps every title inside the ranges the font subset keeps', () => {
    const script = readFileSync(join(ROOT, 'tools/subset-font.py'), 'utf8');
    const ranges = [...script.matchAll(/U\+([0-9A-F]{4})(?:-([0-9A-F]{4}))?/g)].map((m) => [parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)]);
    const titles = [...water.riverInfo.map((r) => r.name), ...(/** @type {string[]} */ (water.lineNames)), ...water.lakeInfo.map((l) => l.name), ...info.seas.map((s) => s.name)];
    // "№" (one Belarusian river) falls back to the next font in the list; harmless.
    const fallback = new Set(['№']);
    const missing = new Set();
    for (const t of titles) for (const ch of t) if (!fallback.has(ch) && !ranges.some(([a, b]) => (ch.codePointAt(0) ?? 0) >= a && (ch.codePointAt(0) ?? 0) <= b)) missing.add(ch);
    assert.deepEqual([...missing], []);
  });
});

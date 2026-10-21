// @ts-check
// Tests for the dated water and our own drawn shapes (M3a): the dated list and its sources, the
// tags in the water block, our own block, the split of the water into date-free tiles and small
// dated sets, and the 1219 water against M2b's (by fingerprints only, so no OpenStreetMap data
// leaves its folder). No network and no data/raw files: only the committed blocks and lists.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ROOT, blockText } from '../tools/map/block.mjs';
import { datedLakes } from '../tools/map/build-water.mjs';
import { CHANGES_BLOCK, changesBlock, changesInputs, changesProblems, shapeEffect } from '../tools/map/pack-changes.mjs';
import { blockLayers, decodeWater, waterHashes } from '../tools/map/water-hashes.mjs';
import { osmStartYear, splitAtMask } from '../tools/map/water-rules.mjs';
import { cutDated, cutWater, tagsOnAt } from '../src/ui/map/water-tiles.js';
import { loadWater, noTimes } from '../src/ui/map/load.js';
import { decodeUints } from '../src/ui/map/codec.js';

/** @param {string} path */
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const list = JSON.parse(read('tools/map/water-changes.json'));
const { shapes } = JSON.parse(read('tools/map/history-shapes.json'));
const waterBlock = JSON.parse(read('src/data/odbl/water.json'));
const water = decodeWater(waterBlock);
const ownBlock = JSON.parse(read(CHANGES_BLOCK));
const own = JSON.parse(new TextDecoder().decode(blockLayers(ownBlock).info));
const fixture = JSON.parse(read('test/fixtures/water-1219-hashes.json'));
const sourcesMd = read('data/sources.md');

describe('the dated list (tools/map/water-changes.json)', () => {
  it('has a source or a TO CHECK for every entry, unique ids, and good years', () => {
    assert.deepEqual(changesProblems(list, shapes), []);
    for (const e of list.entries) assert.ok(e.source || e.toCheck, e.id);
  });

  it('lists every source with its link in data/sources.md, and uses every source it lists', () => {
    for (const [id, s] of Object.entries(list.sources)) {
      assert.ok(sourcesMd.includes(/** @type {any} */ (s).url), `${id}: ${/** @type {any} */ (s).url} is not in data/sources.md`);
      const used = list.entries.some((/** @type {any} */ e) => e.source === id || e.maskSources?.includes(id)) || shapes.some((/** @type {any} */ sh) => sh.sources.includes(id));
      assert.ok(used, `${id} is listed but not used`);
    }
  });

  it('keeps its masks to coarse boxes from published coordinates, never shipped', () => {
    for (const e of list.entries.filter((/** @type {any} */ e) => e.feature?.mask)) {
      assert.ok(e.maskFrom && !/openstreetmap|osm/i.test(e.maskFrom), e.id);
      assert.ok(e.feature.mask.length <= 8, `${e.id}: a mask is a coarse box`);
    }
    assert.ok(!JSON.stringify(own).includes('mask'), 'masks are tools only');
  });
});

describe('the tags in the water block', () => {
  const byId = new Map(list.entries.map((/** @type {any} */ e) => [e.id, e]));
  const rules = list.entries.filter((/** @type {any} */ e) => e.tagPrefix);

  it('give every tag an entry, and every dated OpenStreetMap feature a tag', () => {
    assert.equal(water.tags[0], '');
    for (const t of water.tags.slice(1)) {
      const e = byId.get(t);
      assert.ok((e && e.feature) || rules.some((/** @type {any} */ r) => t.startsWith(r.tagPrefix) && Number(t.slice(r.tagPrefix.length)) > 1219), `tag ${t} has no entry`);
    }
    for (const e of list.entries.filter((/** @type {any} */ e) => e.feature)) assert.ok(water.tags.includes(e.id), `${e.id} tags nothing in the water block`);
    const used = new Set([...water.lineTag, ...water.lakeTag]);
    water.tags.forEach((t, k) => assert.ok(used.has(k), `tag ${t} is on no line or lake`));
  });

  it('carry no years in the ODbL block but OpenStreetMap\'s own start dates', () => {
    for (const t of water.tags.slice(1)) assert.ok(byId.has(t) || /^osm-year-\d{3,4}$/.test(t), t);
    assert.deepEqual(waterBlock.sources, ['osm-water']);
  });

  it('attach every fact-only entry to a river or lake that ships', () => {
    const wd = new Set([...water.riverInfo.map((r) => r.wikidata), ...water.lakeInfo.map((l) => l.wikidata)]);
    for (const e of list.entries.filter((/** @type {any} */ e) => e.about)) assert.ok(wd.has(e.about.wikidata), `${e.id}: ${e.about.wikidata} does not ship`);
  });

  it('ship the 12 big reservoirs and the Rīga reservoir tagged, and none of them on at 1219', () => {
    const on = tagsOnAt(water.tags, own.entries, 1219);
    const reservoirs = list.entries.filter((/** @type {any} */ e) => e.kind === 'reservoir');
    assert.equal(reservoirs.length, 13);
    for (const e of reservoirs) {
      const k = water.tags.indexOf(e.id);
      assert.ok(water.lakeTag.includes(k), `${e.id} ships`);
      assert.equal(on[k], 0, `${e.id} is off at 1219`);
    }
    water.lakeTag.forEach((t, k) => assert.equal(on[t], t === 0 ? 1 : 0, `${water.lakeInfo[k].name}: only undated lakes at 1219`));
  });
});

describe('dates', () => {
  it('switch each tag on exactly inside its years, either side of every boundary and of 1 BC/AD 1', () => {
    for (const e of own.entries.filter((/** @type {any} */ e) => e.on && water.tags.includes(e.id))) {
      const k = water.tags.indexOf(e.id);
      const [from, to] = e.on;
      const years = [-1, 1, 1219, 2026, ...[from, to].filter((y) => y !== null).flatMap((y) => [y - 1, y, y + 1])].filter((y) => y !== 0);
      for (const y of years) {
        const want = (from === null || y >= from) && (to === null || y < to) ? 1 : 0;
        assert.equal(tagsOnAt(water.tags, own.entries, y)[k], want, `${e.id} at ${y}`);
      }
    }
    const k = water.tags.findIndex((t) => t.startsWith('osm-year-'));
    const y = Number(water.tags[k].slice('osm-year-'.length));
    assert.deepEqual([y - 1, y].map((yy) => tagsOnAt(water.tags, own.entries, yy)[k]), [0, 1]);
    assert.throws(() => tagsOnAt(water.tags, own.entries, 0), /bad year/);
    assert.equal(tagsOnAt(['', 'no-entry'], own.entries, 2000)[1], 0, 'a tag with no entry never shows');
  });

  it('handle BC years and the step from 1 BC to AD 1 (no year 0)', () => {
    const entries = [{ id: 'bc', on: /** @type {[number, number]} */ ([-500, 1]) }, { id: 'ad', on: /** @type {[number | null, number | null]} */ ([1, null]) }, { id: 'r', tagPrefix: 'osm-year-' }];
    const tags = ['', 'bc', 'ad', 'osm-year-0'];
    const at = (/** @type {number} */ y) => Array.from(tagsOnAt(tags, entries, y));
    assert.deepEqual(at(-501), [1, 0, 0, 0]);
    assert.deepEqual(at(-500), [1, 1, 0, 0]);
    assert.deepEqual(at(-1), [1, 1, 0, 0]);
    assert.deepEqual(at(1), [1, 0, 1, 0], 'AD 1 follows 1 BC; a year-0 tag never shows');
    assert.throws(() => tagsOnAt(tags, entries, 1.5), /bad year/);
  });
});

describe('the dated river stretches', () => {
  it('join the rest of their river: each tagged piece shares an end with an untagged line of the same river', () => {
    const ends = (/** @type {number} */ k) => {
      const l = water.rivers[k];
      return [`${l[0]},${l[1]}`, `${l[l.length - 2]},${l[l.length - 1]}`];
    };
    for (const e of list.entries.filter((/** @type {any} */ e) => e.feature?.mask)) {
      const tag = water.tags.indexOf(e.id);
      const pieces = [...water.lineTag.keys()].filter((k) => water.lineTag[k] === tag);
      assert.ok(pieces.length > 0, `${e.id} has a stretch`);
      for (const k of pieces) {
        const others = new Set([...water.lineTag.keys()].filter((j) => j !== k && water.riverOf[j] === water.riverOf[k] && water.lineTag[j] === 0).flatMap(ends));
        assert.ok(ends(k).some((p) => others.has(p)), `${e.id}: line ${k} is cut off from its river`);
      }
    }
  });
});

describe('the 1219 water', () => {
  it('equals M2b\'s, apart from the planned fixes (fingerprints only)', () => {
    const on = tagsOnAt(water.tags, own.entries, 1219);
    const now = waterHashes(water, (t) => on[t] === 1);
    // What the fix1219 entries may change: the rivers carrying their tags, and the features
    // their facts are about.
    const fixes = list.entries.filter((/** @type {any} */ e) => e.fix1219);
    const allowed = new Set();
    for (const e of fixes) {
      const k = water.tags.indexOf(e.id);
      if (k > 0) water.lineTag.forEach((t, i) => { if (t === k) allowed.add(now.keyOf.rivers[water.riverOf[i]]); });
      if (e.about) {
        water.riverInfo.forEach((r, i) => { if (r.wikidata === e.about.wikidata) allowed.add(now.keyOf.rivers[i]); });
        water.lakeInfo.forEach((l, i) => { if (l.wikidata === e.about.wikidata) allowed.add(now.keyOf.lakes[i]); });
      }
    }
    const differ = [];
    for (const kind of /** @type {const} */ (['rivers', 'lakes'])) {
      for (const key of new Set([...Object.keys(fixture[kind]), ...Object.keys(now[kind])])) {
        if (JSON.stringify(fixture[kind][key]) !== JSON.stringify(now[kind][key])) differ.push(key);
      }
    }
    for (const key of differ) assert.ok(allowed.has(key), `feature ${key} changed at 1219 without a fix1219 entry`);
    assert.ok(differ.length >= 3, 'the Vistula, the Lielupe and the Buļļupe are the planned changes');
  });
});

describe('cutting the water: date-free tiles plus small dated sets', () => {
  it('hold every point once between them, as the old cut did', async () => {
    const data = await loadWater(waterBlock, noTimes());
    const dated = { ...data, lineTag: decodeUints(blockLayers(waterBlock).riverTag), lakeTag: decodeUints(blockLayers(waterBlock).lakeTag) };
    /** @param {number[][]} shapes */
    const points = (shapes) => shapes.reduce((n, s) => n + s.length / 2, 0);
    for (const level of [0, 1, 2]) {
      const old = cutWater(data, level, () => 0, 1, 15724, 13272);
      const tiles = cutWater(dated, level, () => 0, 1, 15724, 13272);
      const sets = cutDated(dated, level, () => 0, 1);
      const count = (/** @type {{ lakes: number[][], rivers: number[][][] }[]} */ parts) => parts.reduce((n, p) => n + points(p.lakes) + points(p.rivers[0]), 0);
      assert.equal(count(tiles) + count(sets), count(old), `level ${level}`);
      assert.ok(sets.length > 3 && sets.every((s) => s.tag > 0 && s.box[0] <= s.box[2]), `level ${level}`);
    }
  });

  it('keep a lake\'s rings together and its tag\'s set small', () => {
    const w = /** @type {any} */ ({
      rivers: [[0, 0, 10, 0, 20, 0], [0, 5, 10, 5]], riverLevels: Uint8Array.of(0, 0, 0, 0, 0), riverOf: Uint32Array.of(0, 1),
      lakes: [[0, 0, 4, 0, 4, 4], [1, 1, 2, 1, 2, 2], [10, 10, 14, 10, 14, 14]], lakeLevels: new Uint8Array(9), lakeOf: Uint32Array.of(0, 0, 1),
      lineTag: Uint32Array.of(0, 2), lakeTag: Uint32Array.of(1, 0),
    });
    const tiles = cutWater(w, 2, () => 0, 1, 100, 100, 2);
    const sets = cutDated(w, 2, () => 0, 1);
    assert.deepEqual(sets.map((s) => s.tag), [1, 2]);
    assert.equal(sets[0].lakes.length, 2, 'the lake and its island');
    assert.deepEqual(sets[1].rivers[0], [[0, 5, 10, 5]]);
    assert.equal(tiles.reduce((n, t) => n + t.lakes.length, 0), 1);
    assert.equal(tiles.reduce((n, t) => n + t.rivers[0].length, 0), 1);
  });
});

describe('the build\'s rules for dated water', () => {
  it('reads OpenStreetMap\'s start_date years', () => {
    assert.deepEqual(['1956', '1956;1977', '1974-09-22', 'about 1910', '', null, 'x'].map(osmStartYear), [1956, 1956, 1974, 1910, null, null, null]);
  });

  it('splits a line at a mask into pieces that share their ends', () => {
    const mask = [4, -1, 8, -1, 8, 1, 4, 1];
    const s = splitAtMask([[0, 0, 2, 0, 5, 0, 7, 0, 9, 0, 11, 0], [0, 5, 3, 5]], ['A', 'B'], ['', ''], mask, 'cut');
    assert.deepEqual(s.lines, [[0, 0, 2, 0, 5, 0], [5, 0, 7, 0], [7, 0, 9, 0, 11, 0], [0, 5, 3, 5]]);
    assert.deepEqual(s.tags, ['', 'cut', '', '']);
    assert.deepEqual(s.names, ['A', 'A', 'A', 'B']);
    assert.equal(s.points, 2);
    const one = splitAtMask([[0, 0, 5, 0, 10, 0]], [''], [''], mask, 'cut');
    assert.deepEqual(one.lines, [[0, 0, 5, 0], [5, 0, 10, 0]]);
    assert.deepEqual(one.tags, ['', 'cut']);
    assert.equal(splitAtMask([[0, 5, 3, 5]], [''], [''], mask, 'cut').points, 0, 'a mask that misses cuts nothing');
  });

  it('ships a listed reservoir and a dated one, keeps a natural lake inside, and leaves out one with no year', () => {
    const sq = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) => [x, y, x + s, y, x + s, y + s, x, y + s];
    /** @param {string} id @param {number[]} ring @param {string | null} start @param {number} area */
    const lake = (id, ring, start, area) => ({ id, name: id, names: {}, otherNames: {}, wikidata: null, areaKm2: area, rings: [ring], water: '', pieces: [id], why: 'x', start });
    const dropped = [lake('way/1', sq(0, 0, 100), null, 100), lake('way/2', sq(500, 0, 30), '1975', 9), lake('way/3', sq(900, 0, 30), null, 9), lake('way/4', sq(10, 10, 5), '1980', 1.5)];
    const natural = [lake('way/9', sq(20, 20, 10), null, 1)];
    const r = datedLakes([{ id: 'big-reservoir', kind: 'reservoir', feature: { osm: ['way/1'] } }, { id: 'gone', kind: 'reservoir', feature: { osm: ['way/8'] } }], dropped, natural);
    assert.deepEqual(r.lakes.map((l) => [l.id, l.tag]), [['way/1', 'big-reservoir'], ['way/2', 'osm-year-1975']]);
    assert.deepEqual(r.notFound.map((n) => n.id), ['gone']);
    assert.equal(r.counts.osmYearNoYear, 1);
    assert.equal(r.counts.reservoirsInsideReservoirs, 1, 'a reservoir inside a bigger one is left out, as natural lakes are');
  });
});

describe('our own block (src/data/own/changes.json)', () => {
  it('is what tools/map/pack-changes.mjs makes from the lists (deterministic)', async () => {
    const { changes, shapes: sh, base } = await changesInputs();
    const text = blockText(changesBlock(changes, sh, base));
    assert.equal(text, read(CHANGES_BLOCK), 'run node tools/map/pack-changes.mjs');
    assert.equal(blockText(changesBlock(changes, sh, base)), text);
  });

  it('holds only our own work, with no web addresses', () => {
    assert.deepEqual(ownBlock.sources, ['grind-strat-own']);
    assert.equal(ownBlock.licence, 'grind-strat-own');
    assert.ok(!/https?:|\/\//.test(JSON.stringify(own)), 'no web addresses in what the game shows');
    for (const s of shapes) assert.ok(s.marks.includes('reconstructed') && s.drawnFrom && !/openstreetmap|\bosm\b/i.test(s.drawnFrom), s.id);
  });

  it('has shapes that each change something on today\'s base land', async () => {
    const { base } = await changesInputs();
    for (const s of shapes) {
      const { inside, changed } = shapeEffect(s, base.land);
      assert.ok(inside > 0 && changed > 0, `${s.id}: ${changed} of ${inside}`);
      for (const [x, y] of s.ring) assert.ok(x >= 0 && x <= 15724 && y >= 0 && y <= 13272, s.id);
    }
    const strait = shapes.find((/** @type {any} */ s) => s.id === 'pillau-strait');
    assert.equal(strait.type, 'water');
    const pillau = own.entries.find((/** @type {any} */ e) => e.id === 'pillau-strait');
    assert.deepEqual(pillau.on, [1497, null], 'open from 1497 to today');
  });

  it('gives the land engine Żuławy\'s cells in two waves, inside the grid and in one wave each', () => {
    const L = blockLayers(ownBlock);
    const { cols, rows } = own.grid;
    const seen = new Set();
    assert.equal(own.overrides.length, 2);
    for (const o of own.overrides) {
      const cells = decodeUints(L[o.cells]);
      const bands = L[o.bands];
      assert.equal(cells.length, bands.length);
      assert.equal(cells.length, o.count);
      assert.ok(cells.length > 300, o.entry);
      for (const c of cells) {
        assert.ok(c < cols * rows && !seen.has(c), `${o.entry}: cell ${c}`);
        seen.add(c);
      }
      for (const b of bands) assert.ok(b >= 0 && b <= 31);
      const e = own.entries.find((/** @type {any} */ x) => x.id === o.entry);
      assert.deepEqual([o.from, o.to], e.spread);
      assert.equal(o.cls, 5, 'marsh');
      assert.ok(e.on[0] === null && e.on[1] >= o.to && e.fix1219, `${o.entry}: marsh in 1219, gone by the end of its spread`);
    }
    assert.deepEqual(own.overrides.map((/** @type {any} */ o) => o.from), [1308, 1550]);
  });
});

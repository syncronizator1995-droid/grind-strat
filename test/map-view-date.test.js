// @ts-check
// The map following the game's date, as the view uses it (M3a): names at a date, a save opening at
// its own year, the hidden #date= link, and the date's work per frame staying within its budget.
// Runs on the shipped blocks in Node: no browser here (test/shots.mjs photographs the real thing).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { dayFromDate } from '../src/sim/calendar.js';
import { MAX_DAYS_PER_FRAME } from '../src/ui/clock.js';
import { createDateLayer, mapYearOfDay, parseTestLink, yearFromHash } from '../src/ui/map/dated.js';
import { indexWater, placeWaterLabels } from '../src/ui/map/labels.js';
import { loadDated, loadMap, loadWater, noTimes } from '../src/ui/map/load.js';
import { quantile } from '../src/ui/map/speedtest.js';

const ROOT = new URL('..', import.meta.url).pathname;
/** @param {string} path */
const block = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const { map } = await loadMap(block('src/data/map/base.json'), block('src/data/by-sa/terrain-1219.json'));
const shipped1219 = map.terrain.data.slice();
const water = await loadWater(block('src/data/odbl/water.json'), noTimes());
const index = indexWater(water);
const blocks = { terrainTime: block('src/data/by-sa/terrain-time.json'), coast: block('src/data/by/coast.json'), changes: block('src/data/own/changes.json') };
const dated = await loadDated(blocks, shipped1219, noTimes());
const tags = /** @type {string[]} */ (water.tags);
const measure = (/** @type {string} */ text, /** @type {number} */ size) => text.length * size * 0.58;

/** A fresh date layer over a copy of the 1219 grid. @param {number} [year] */
function layerAt(year = 1219) {
  const grid = year === 1219 ? shipped1219.slice() : dated.timeline.classesAt(year);
  const layer = createDateLayer(dated, grid, year);
  layer.setTags(tags);
  layer.sync(() => {});
  return { layer, grid };
}

/**
 * Views of a 390 x 844 phone's frame (with the kept frame's margin): the whole map, Lithuania,
 * close over Kaunas and its reservoir, the Vistula Lagoon, Stockholm and Lake Mälaren, Turku.
 */
const VIEWS = [
  { name: 'overview', cx: 7862, cy: 6636, scale: 0.024, level: 0 },
  { name: 'Lithuania', cx: 8434, cy: 5899, scale: 0.075, level: 1 },
  { name: 'Kaunas', cx: 8557, cy: 5460, scale: 0.3, level: 2 },
  { name: 'Vistula Lagoon', cx: 5852, cy: 4994, scale: 0.2, level: 1 },
  { name: 'Stockholm', cx: 4700, cy: 10550, scale: 0.12, level: 1 },
  { name: 'Turku', cx: 7460, cy: 11632, scale: 0.2, level: 1 },
];

/** The names of one view at the layer's date. @param {typeof VIEWS[number]} v @param {ReturnType<typeof createDateLayer>} layer */
function namesAt(v, layer) {
  const width = 390 * 1.7;
  const height = 844 * 1.7;
  return placeWaterLabels({
    water, index, level: v.level, scale: v.scale, ox: width / 2 - v.cx * v.scale, oy: height / 2 + v.cy * v.scale, width, height, measure,
    tagOn: layer.tagOn, under: layer.seaAt,
  });
}

describe('names at the map\'s date', () => {
  const { layer } = layerAt(1219);
  const on = /** @type {Uint8Array} */ (layer.tagOn);

  it('at 1219, no name lands on a river or lake that is off, nor under the old sea', () => {
    let named = 0;
    for (const v of VIEWS) {
      for (const l of namesAt(v, layer)) {
        named++;
        if (l.lake !== undefined) {
          const tag = water.lakeTag?.[l.lake] ?? 0;
          assert.ok(!tag || on[tag], `${v.name}: "${l.text}" names a lake that is off in 1219 (${tags[tag]})`);
          const [x, y] = water.lakeInfo[l.lake].at;
          assert.ok(!layer.seaAt(x, y), `${v.name}: "${l.text}" sits under the old sea`);
        } else {
          const tag = water.lineTag?.[/** @type {number} */ (l.line)] ?? 0;
          assert.ok(!tag || on[tag], `${v.name}: "${l.text}" sits on a river stretch that is off in 1219 (${tags[tag]})`);
          assert.ok(!layer.seaAt(/** @type {number} */ (l.mx), /** @type {number} */ (l.my)), `${v.name}: "${l.text}" sits under the old sea`);
        }
      }
    }
    assert.ok(named > 60, `only ${named} names in all the views`);
  });

  it('has every reservoir off in 1219 and on by 2021, and names Kaunas\'s once it is filled', () => {
    const today = layerAt(2021).layer;
    const kaunas = tags.indexOf('kaunas-reservoir');
    assert.ok(kaunas > 0);
    assert.equal(on[kaunas], 0);
    assert.equal(/** @type {Uint8Array} */ (today.tagOn)[kaunas], 1);
    const lake = water.lakeInfo.findIndex((_, k) => water.lakeTag?.[k] === kaunas);
    const name = water.lakeInfo[lake].name;
    assert.ok(name, 'the Kaunas reservoir has a name');
    const view = /** @type {typeof VIEWS[number]} */ (VIEWS.find((v) => v.name === 'Kaunas'));
    assert.ok(namesAt(view, today).some((l) => l.text === name), `"${name}" is named in 2021`);
    assert.ok(!namesAt(view, layer).some((l) => l.text === name), `"${name}" is not named in 1219`);
    for (const t of tags.filter((x) => /reservoir$/.test(x))) assert.equal(on[tags.indexOf(t)], 0, `${t} is off in 1219`);
  });

  it('has no old sea over any lake in 2021 (today\'s open sea in the coast field is not old sea)', () => {
    const today = layerAt(2021).layer;
    const under = water.lakeInfo.filter((l) => l.name && today.seaAt(l.at[0], l.at[1])).map((l) => l.name);
    assert.deepEqual(under, []);
  });

  it('keeps Lake Mälaren unnamed while it is a bay of the sea, and names it once it is a lake', () => {
    const view = /** @type {typeof VIEWS[number]} */ (VIEWS.find((v) => v.name === 'Stockholm'));
    assert.ok(!namesAt(view, layer).some((l) => l.text === 'Mälaren'), 'named in 1219');
    assert.ok(namesAt(view, layerAt(1400).layer).some((l) => l.text === 'Mälaren'), 'not named in 1400');
  });
});

describe('a save opens at its own year', () => {
  it('turns a game day into the map\'s year, 1219 for anything earlier', () => {
    assert.equal(mapYearOfDay(dayFromDate(1219, 1, 1)), 1219);
    assert.equal(mapYearOfDay(dayFromDate(1700, 6, 15)), 1700);
    assert.equal(mapYearOfDay(dayFromDate(800, 1, 1)), 1219);
  });

  it('paints a late save\'s year from the start: the grid is moved before the map is drawn, so nothing is left to change', () => {
    for (const year of [1300, 1600, 1950, 2021]) {
      const grid = shipped1219.slice();
      grid.set(dated.timeline.classesAt(year)); // what main.js does before the first picture
      const layer = createDateLayer(dated, grid, year);
      layer.setTags(tags);
      assert.equal(layer.sync(() => {}), 0, `${year}: cells left to change after the first picture`);
      assert.equal(layer.year, year);
      const moved = layer.goTo(year, () => {});
      assert.deepEqual(moved, { cells: 0, tags: false, shapes: false, coast: false }, `${year}`);
    }
  });

  it('goes back to an earlier year (an older save loaded) and forward again to the same picture', () => {
    const { layer, grid } = layerAt(1219);
    layer.goTo(1900, () => {});
    const at1900 = grid.slice();
    layer.goTo(1300, () => {});
    assert.deepEqual(grid, dated.timeline.classesAt(1300));
    layer.goTo(1900, () => {});
    assert.deepEqual(grid, at1900);
  });
});

describe('the hidden test link', () => {
  it('reads #date=1550 and an optional camera, and nothing else', () => {
    assert.equal(yearFromHash('#date=1550'), 1550);
    assert.deepEqual(parseTestLink('#date=1900&view=5057,10484,0.12'), { year: 1900, view: { cx: 5057, cy: 10484, scale: 0.12 } });
    for (const bad of ['', '#date=', '#date=0', '#date=-5', '#date=1550x', '#1550', '#date=1550&view=1,2']) assert.equal(yearFromHash(bad), null, bad);
  });

  it('shows the year it names and leaves the game\'s day alone (the layer only ever reads days)', () => {
    const { layer } = layerAt(1219);
    layer.goTo(1550, () => {});
    assert.equal(layer.year, 1550);
  });
});

describe('the date\'s work per frame', () => {
  it('runs 1219 to 2021 at speed 5 (30 days a frame) within its 3 ms budget, the land prepared ahead', () => {
    const { layer, grid } = layerAt(1219);
    const { timeline } = dated;
    const budget = 3;
    /** @type {number[]} */
    const frameMs = [];
    /** @type {string[]} */
    const unprepared = [];
    let day = dayFromDate(1219, 1, 1);
    let cells = 0;
    for (let year = 1219; year < 2021;) {
      day += MAX_DAYS_PER_FRAME;
      const next = Math.min(2021, mapYearOfDay(day));
      const start = performance.now();
      if (next !== year) {
        timeline.intervals.forEach((iv, k) => { if (year < iv.y1 && next > iv.y0 && !timeline.isPrepared(k)) unprepared.push(`${iv.y0}-${iv.y1} at ${next}`); });
        cells += layer.goTo(next, () => {}).cells;
        year = next;
      }
      layer.prepare(start + budget);
      frameMs.push(performance.now() - start);
    }
    assert.deepEqual(unprepared, [], 'a stretch of the land was needed before it was prepared');
    assert.ok(cells > 100000, `only ${cells} cells changed`);
    assert.deepEqual(grid, timeline.classesAt(2021));
    // The budget is checked before each small piece of work, so a frame runs over by at most one
    // piece (under a millisecond in Node).
    const p95 = quantile(frameMs, 0.95);
    assert.ok(p95 <= budget + 1, `95% of frames under ${p95.toFixed(2)} ms`);
    assert.ok(Math.max(...frameMs) < 25, `worst frame ${Math.max(...frameMs).toFixed(1)} ms`);
  });
});

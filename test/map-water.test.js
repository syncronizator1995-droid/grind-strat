// @ts-check
// Tests for the M2 water: the reviewed list of Natural Earth's lakes for 1219
// (tools/map/ne-water-1219.json and .mjs), on a small made-up map, and the list itself. The
// shipped block is checked in test/map-blocks.test.js. No network and no raw data needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ROOT } from '../tools/map/block.mjs';
import { neWaterFrom } from '../tools/map/ne-layers.mjs';
import { fixRiverNames, lakeAt, reviewLakes } from '../tools/map/ne-water-1219.mjs';

/**
 * A square lake polygon, d degrees a side, from (lon, lat).
 * @param {number} lon @param {number} lat @param {number} [d]
 */
const square = (lon, lat, d = 0.2) => [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]];

/**
 * @param {string | null} name @param {string} featurecla @param {number} lon @param {number} lat
 * @param {Record<string, string>} [more] extra properties
 */
const lake = (name, featurecla, lon, lat, more = {}) => ({
  type: 'Feature', properties: { name, featurecla, ...more }, geometry: { type: 'Polygon', coordinates: square(lon, lat) },
});

/** @param {string} name @param {Record<string, string>} [more] */
const river = (name, more = {}) => ({
  type: 'Feature', properties: { name, ...more }, geometry: { type: 'LineString', coordinates: [[23, 54.5], [23.5, 54.8], [24, 55]] },
});

/** @param {any[]} features */
const collection = (features) => ({ type: 'FeatureCollection', features });

/** @typedef {import('../tools/map/ne-water-1219.mjs').Review} Review */

/** A made-up map: a regulated natural lake called a reservoir, an unnamed reservoir, a lagoon in two halves, and a polygon Natural Earth has twice. */
function sample() {
  const lakes = collection([
    lake('Lake A', 'Reservoir', 24, 55, { name_en: 'A', name_ru: 'Озеро А' }),
    lake(null, 'Lake', 25, 55),
    lake('West half', 'Alkaline Lake', 21, 54.5, { name_en: 'The Lagoon', name_pl: 'Zalew' }),
    lake('East half', 'Alkaline Lake', 21.2, 54.5, { name_en: 'The Lagoon', name_ru: 'Залив' }),
    lake(null, 'Lake', 26, 56),
    lake(null, 'Lake', 26, 56),
    lake('Far away', 'Lake', 60, 30),
  ]);
  /** @type {Review} */
  const review = {
    lakes: [
      { name: 'Lake A', at: [24.1, 55.1], keep: true, why: 'natural lake' },
      { at: [25.1, 55.1], what: 'a reservoir', keep: false, why: 'modern reservoir (20th century), details TO CHECK' },
      { name: 'West half', at: [21.1, 54.6], keep: true, why: 'lagoon', join: 'Lagoon', show: 'The Lagoon', showWhy: 'English name' },
      { name: 'East half', at: [21.3, 54.6], keep: true, why: 'lagoon', join: 'Lagoon', show: 'The Lagoon', showWhy: 'English name' },
      { at: [26.1, 56.1], what: 'a lake listed twice', keep: true, why: 'natural lake', copies: 2 },
    ],
    riverNames: [{ from: 'Gta lv', to: 'Göta älv', why: 'lost letters' }],
  };
  const rivers = collection([river('Gta lv', { name_en: 'Gta lv' }), river('Neman', { name_alt: 'Nemunas', name_en: 'Nemunas' })]);
  return { lakes, rivers, review };
}

describe('the reviewed lakes of 1219', () => {
  it('keeps and drops by the list, whatever Natural Earth\'s own class says', () => {
    const { lakes, review } = sample();
    const kept = reviewLakes(lakes, review);
    assert.deepEqual(kept.map((k) => k.show), ['Lake A', 'The Lagoon', 'The Lagoon', '']);
    assert.equal(kept[0].feature.properties.featurecla, 'Reservoir', 'a lake Natural Earth calls a reservoir can stay');
  });

  it('joins the halves of one lake, uses one copy of a doubled polygon, and keeps the other names', () => {
    const { lakes, rivers, review } = sample();
    const water = neWaterFrom(rivers, lakes, review);
    assert.deepEqual(water.lakes.map((l) => l.name), ['Lake A', 'The Lagoon', '']);
    const lagoon = water.lakes[1];
    assert.equal(lagoon.rings.length, 2);
    assert.deepEqual(lagoon.names, { en: 'The Lagoon', pl: 'Zalew', ru: 'Залив', ne: 'West half|East half' });
    assert.ok(Math.abs(lagoon.areaKm2 - 2 * water.lakes[0].areaKm2) < 0.05 * lagoon.areaKm2, 'both halves count');
    assert.equal(water.lakes[2].rings.length, 1, 'one copy only');
    assert.deepEqual(water.lakes[0].names, { en: 'A', ru: 'Озеро А' });
  });

  it('puts Natural Earth\'s main river name first, repairs lost letters, and keeps the other names', () => {
    const { lakes, rivers, review } = sample();
    const water = neWaterFrom(rivers, lakes, review);
    assert.deepEqual(water.rivers.map((r) => [r.name, r.names]), [['Göta älv', { en: 'Göta älv' }], ['Neman', { en: 'Nemunas' }]]);
    assert.deepEqual(fixRiverNames({ name: 'Gta lv', other: 'Gta lv' }, review.riverNames), { name: 'Göta älv', other: 'Gta lv' });
  });

  it('stops on a lake on the map that nobody reviewed, and on an entry that matches nothing', () => {
    const { lakes, review } = sample();
    lakes.features.push(lake(null, 'Lake', 27, 57));
    assert.throws(() => reviewLakes(lakes, review), /unnamed at 27\.1, 57\.1 \(Natural Earth class "Lake"\) is on the map but not in the list/);
    const stale = { ...review, lakes: [...review.lakes, { at: /** @type {[number, number]} */ ([28, 58]), what: 'gone', keep: true, why: 'x' }] };
    assert.throws(() => reviewLakes(sample().lakes, stale), /unnamed at 28, 58 matches no Natural Earth lake/);
  });

  it('stops when copies are miscounted, or an entry lacks its reasons', () => {
    const { lakes, review } = sample();
    const once = { ...review, lakes: review.lakes.map((e) => ({ ...e, copies: undefined })) };
    assert.throws(() => reviewLakes(lakes, once), /matches 2 polygons, but says copies: 1/);
    const bare = { ...review, lakes: review.lakes.map((e, k) => (k === 1 ? { at: e.at, keep: false, why: '' } : e)) };
    assert.throws(() => reviewLakes(lakes, /** @type {any} */ (bare)), /says no "why"[\s\S]*needs "what"/);
  });

  it('stops on a river-name repair that matches no river', () => {
    const { lakes, rivers, review } = sample();
    assert.throws(() => neWaterFrom(rivers, lakes, { ...review, riverNames: [{ from: 'Nowhere', to: 'x', why: 'y' }] }), /repairs river names that are not on the map: Nowhere/);
  });

  it('keys a polygon by the middle of its bounding box, to 2 decimals', () => {
    assert.deepEqual(lakeAt(lake(null, 'Lake', 24.004, 55.006)), [24.1, 55.11]);
  });
});

describe('the reviewed list itself', () => {
  /** @type {Review} */
  const review = JSON.parse(readFileSync(join(ROOT, 'tools/map/ne-water-1219.json'), 'utf8'));
  /** @param {string} name */
  const entry = (name) => review.lakes.find((e) => e.name === name);

  it('keeps the natural lakes Natural Earth calls reservoirs, and drops the modern reservoirs', () => {
    for (const name of ['Lake Il\'Men\'', 'Mjøsa', 'Zalew Wislany', 'Kaliningradskiy Zaliv']) assert.equal(entry(name)?.keep, true, name);
    for (const name of ['Kauno marios', 'Kiev Reservoir', 'Kremenchuk Reservoir']) assert.equal(entry(name)?.keep, false, name);
    assert.equal(entry('Zalew Wislany')?.show, 'Vistula Lagoon');
    for (const [lon, lat] of [[28.17, 59.26], [31.51, 49.89], [18.87, 49.93], [14.4, 51.63]]) {
      assert.equal(review.lakes.find((e) => !e.name && e.at[0] === lon && e.at[1] === lat)?.keep, false, `${lon}, ${lat}`);
    }
    for (const [lon, lat] of [[26.88, 56.77], [27.43, 56.33], [26.77, 54.86]]) {
      assert.equal(review.lakes.find((e) => !e.name && e.at[0] === lon && e.at[1] === lat)?.keep, true, `${lon}, ${lat}`);
    }
  });

  it('gives a reason for every decision, and states no dam years (they would need a source)', () => {
    for (const e of review.lakes) {
      assert.ok(e.why, JSON.stringify(e));
      if (!e.keep) assert.match(e.why, /reservoir|modern/, JSON.stringify(e));
    }
    const text = JSON.stringify(review.lakes);
    assert.doesNotMatch(text, /\b(1[5-9]|20)\d\d\b/, 'a year in the lake list');
  });
});

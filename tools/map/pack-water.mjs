// @ts-check
// The water block: rivers as lines and lakes as rings with holes, with one level of detail per
// point (tools/map/levels.mjs), which river or lake each shape belongs to, and the river and
// lake info (names, Wikidata id, size, a lake's label point).
//
// The game ships OpenStreetMap's rivers and lakes (read through Overture, built by
// tools/map/build-water.mjs into data/raw/derived/water-osm.json) as src/data/odbl/water.json,
// under the ODbL 1.0 and holding nothing from any other source. M2's Natural Earth block
// (src/data/map/water-ne.json, the lakes of 1219 by tools/map/ne-water-1219.json) is kept as
// code only: it is made when the OpenStreetMap extract is missing, and removed when it exists.

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encodeShapes, encodeUints } from '../../src/ui/map/codec.js';
import { makeBlock } from './block.mjs';
import { ringArea2, simplify, simplifyRing } from './geo.mjs';
import { labelPoint } from './label-point.mjs';
import { joinLevels, pointLevels } from './levels.mjs';
import { mustHaveRiverTable } from './build-water.mjs';
import { neWater } from './ne-layers.mjs';
import { madeFrom } from './pack-notice.mjs';
import { DERIVED } from './resample.mjs';
import { hasCyrillic } from './romanize.mjs';
import { waterLabels } from './water-labels.mjs';

export const OSM_WATER = join(DERIVED, 'water-osm.json');
/** Every label that differs from OpenStreetMap's name, with the rule that made it (git ignores it). */
export const LABEL_REPORT = join(DERIVED, 'water-labels.json');
export const OSM_NOTICE = 'Contains information from OpenStreetMap, openstreetmap.org/copyright, made available under the Open Database License (ODbL) 1.0, opendatacommons.org/licenses/odbl/1-0/';

/** The close-up level keeps detail down to this many game units (150 m: at the closest zoom, 1.2 CSS px). */
const BASE_TOLERANCE = 1.5;
/**
 * Tolerances for the overview and middle levels, game units. Coarser than the land's: the
 * overview is drawn below 0.06 CSS px per unit and the middle level below 0.25, so 20 and 5
 * units stay within about a pixel and a quarter, and thousands of wiggly rivers and lakes
 * draw several times faster than at the land's 12 and 2.4.
 */
export const WATER_TOLERANCES = Object.freeze([20, 5]);

/**
 * Lakes smaller than these (km²) are left out of the overview and the middle level: at those
 * zooms they would be a speck, or a triangle.
 */
const LAKE_MIN_KM2 = [10, 3];

/**
 * @typedef {{ name: string, names: Record<string, string>, wikidata: string | null, lengthKm: number, lines: number[][], lineNames?: string[] }} River
 *   lineNames: the local name of each line, where the data has one (OpenStreetMap)
 * @typedef {{ name: string, names: Record<string, string>, wikidata: string | null, areaKm2: number, rings: number[][] }} Lake
 * @typedef {import('./water-labels.mjs').WaterLabels} Labels
 */

/** @param {number} km2 */
const lakeMinLevel = (km2) => (km2 < LAKE_MIN_KM2[1] ? 2 : km2 < LAKE_MIN_KM2[0] ? 1 : 0);

/** Biggest first, then by name: label priority, and the same order on every run. */
const bySize = (/** @type {number} */ a, /** @type {number} */ b, /** @type {string} */ an, /** @type {string} */ bn) => b - a || (an < bn ? -1 : an > bn ? 1 : 0);

/**
 * The label the map shows for a name, and the name as the data has it when that differs.
 * @param {import('./water-labels.mjs').Label | undefined} label @param {string} name
 */
const shown = (label, name) => (label ? { name: label.text, ...(label.local !== label.text ? { local: label.local } : {}), ...(label.lang ? { lang: label.lang } : {}) } : { name });

/**
 * @param {River[]} rivers @param {Lake[]} lakes
 * @param {Labels} [labels] the labels of OpenStreetMap's names (tools/map/water-labels.mjs), in
 *   the order of rivers and lakes; without them the names are shown as they are (Natural Earth)
 */
function waterLayers(rivers, lakes, labels) {
  const riverOrder = rivers.map((r, k) => ({ r, k, info: shown(labels?.rivers[k].main, r.name) }));
  const lakeOrder = lakes.map((l, k) => ({ l, k, info: shown(labels?.lakes[k], l.name) }));
  riverOrder.sort((a, b) => bySize(a.r.lengthKm, b.r.lengthKm, a.info.name, b.info.name));
  lakeOrder.sort((a, b) => bySize(a.l.areaKm2, b.l.areaKm2, a.info.name, b.info.name));
  /** @type {number[][]} */ const riverLines = [];
  /** @type {Uint8Array[]} */ const riverLevels = [];
  /** @type {number[]} */ const riverOf = [];
  /** @type {number[]} */ const riverLineName = [];
  // Labels of stretches, where a stretch has a name other than the river's own: index 0 is "none".
  // Each label comes with the name as the data has it ('' when the same), so the original stays.
  /** @type {string[]} */ const lineNames = [''];
  /** @type {string[]} */ const lineLocal = [''];
  /** @type {Map<string, number>} */ const nameIndex = new Map([['\u0000', 0]]);
  riverOrder.forEach(({ r: river, k: from }, k) => {
    const main = labels?.rivers[from];
    river.lines.forEach((raw, i) => {
      const line = simplify(raw, BASE_TOLERANCE);
      if (line.length < 4) return;
      riverLines.push(line);
      riverLevels.push(pointLevels(line, false, { tolerances: WATER_TOLERANCES }));
      riverOf.push(k);
      const own = river.lineNames?.[i] ?? '';
      const label = main?.stretch.get(own);
      const isMain = !own || own === (main ? main.main.local : river.name);
      const text = isMain ? '' : label?.text ?? own;
      const local = isMain || !label || label.local === label.text ? '' : label.local;
      const id = `${text}\u0000${local}`;
      if (!nameIndex.has(id)) { nameIndex.set(id, lineNames.length); lineNames.push(text); lineLocal.push(local); }
      riverLineName.push(/** @type {number} */ (nameIndex.get(id)));
    });
  });
  /** @type {number[][]} */ const lakeRings = [];
  /** @type {Uint8Array[]} */ const lakeLevels = [];
  /** @type {number[]} */ const lakeOf = [];
  /** @type {[number, number][]} */ const labelAt = [];
  lakeOrder.forEach(({ l: lake }, k) => {
    const minLevel = lakeMinLevel(lake.areaKm2);
    /** @type {number[][]} */
    const kept = [];
    for (const raw of lake.rings) {
      const ring = simplifyRing(raw, BASE_TOLERANCE);
      if (ring.length < 6) continue;
      // An island in a lake is left out where the lake itself is still shown but the island
      // would be a speck: its own size decides, never less than the lake's.
      const own = lakeMinLevel(Math.abs(ringArea2(ring)) / 2 / 100);
      kept.push(ring);
      lakeRings.push(ring);
      lakeLevels.push(pointLevels(ring, true, { tolerances: WATER_TOLERANCES, minLevel: Math.max(minLevel, own) }));
      lakeOf.push(k);
    }
    labelAt.push(kept.length ? labelPoint(kept) : [0, 0]);
  });
  return {
    layers: {
      rivers: encodeShapes(riverLines),
      riverLevels: joinLevels(riverLevels),
      riverOf: encodeUints(riverOf),
      riverLineName: encodeUints(riverLineName),
      lakes: encodeShapes(lakeRings),
      lakeLevels: joinLevels(lakeLevels),
      lakeOf: encodeUints(lakeOf),
      // The names and facts too, inside the compressed bundle: as plain JSON in the page they
      // would be most of its size (thousands of lakes, names in up to twelve languages).
      info: new TextEncoder().encode(JSON.stringify({
        riverInfo: riverOrder.map(({ r, info }) => ({ ...info, names: r.names, wikidata: r.wikidata, lengthKm: r.lengthKm })),
        riverLineNames: lineNames,
        ...(lineLocal.some(Boolean) ? { riverLineLocal: lineLocal } : {}),
        lakeInfo: lakeOrder.map(({ l, info }, k) => ({ ...info, names: l.names, wikidata: l.wikidata, areaKm2: l.areaKm2, at: labelAt[k] })),
      })),
    },
    counts: { rivers: rivers.length, lakes: lakes.length },
  };
}

/**
 * Stops on a label that is not all in Latin letters (every name on the map is: Ignas, 11 October 2026).
 * @param {Labels} labels
 */
function checkLatin(labels) {
  const all = [...labels.rivers.flatMap((r) => [r.main, ...r.stretch.values()]), ...labels.lakes];
  const bad = all.filter((l) => hasCyrillic(l.text)).map((l) => `${l.local} -> ${l.text}`);
  if (bad.length) throw new Error(`labels still in Cyrillic: ${bad.slice(0, 10).join('; ')}${bad.length > 10 ? ` and ${bad.length - 10} more` : ''}`);
}

/**
 * The OpenStreetMap water block, from the parsed extract. Its labels are tidied and in Latin
 * letters (tools/map/water-labels.mjs); OpenStreetMap's own names stay in the info.
 * @param {{ source: string, licence: string, osmBase?: string | null, overture?: { release: string }, rivers: River[], lakes: Lake[] }} osm
 * @param {Labels} [labels] worked out here when not given
 */
export function osmWaterBlock(osm, labels = waterLabels(osm.rivers, osm.lakes)) {
  if (osm.licence !== 'ODbL-1.0' || osm.source !== 'osm') throw new Error('water-osm.json is not the OpenStreetMap extract');
  checkLatin(labels);
  const { layers, counts } = waterLayers(osm.rivers, osm.lakes, labels);
  return makeBlock({
    kind: 'water',
    licence: 'ODbL-1.0',
    notice: OSM_NOTICE,
    sources: ['osm-water'],
    meta: { levels: WATER_TOLERANCES, osmBase: osm.osmBase ?? null, overture: osm.overture?.release ?? null, ...counts },
    layers,
  });
}

export const NE_SOURCES = Object.freeze(['ne-rivers', 'ne-lakes']);

/** The Natural Earth water block, the one M2 ships. */
export async function neWaterBlock() {
  const { rivers, lakes } = await neWater();
  const { layers, counts } = waterLayers(rivers, lakes);
  return makeBlock({
    kind: 'water',
    licence: 'public-domain',
    notice: 'Rivers and lakes for Grind Strat around AD 1219: Natural Earth\'s 1:10m set, with modern reservoirs left out and natural lakes kept, by a reviewed list. '
      + await madeFrom([...NE_SOURCES]),
    sources: [...NE_SOURCES],
    meta: { levels: WATER_TOLERANCES, ...counts },
    layers,
  });
}

/** @returns {Promise<{ path: string, block: import('./block.mjs').Block }>} */
export async function packWater() {
  if (!existsSync(OSM_WATER)) return { path: 'src/data/map/water-ne.json', block: await neWaterBlock() };
  const osm = JSON.parse(await readFile(OSM_WATER, 'utf8'));
  const labels = waterLabels(osm.rivers, osm.lakes);
  await reportLabels(osm, labels);
  return { path: 'src/data/odbl/water.json', block: osmWaterBlock(osm, labels) };
}

/**
 * Prints how the labels were made and the must-have rivers as the map names them, and writes
 * every label that differs from OpenStreetMap's name to LABEL_REPORT, for checking by eye.
 * @param {{ rivers: (River & { id: string })[], lakes: Lake[], checks?: any }} osm @param {Labels} labels
 */
async function reportLabels(osm, labels) {
  /** @type {{ kind: string, local: string, label: string, lang: string | null, rule: string, of?: string }[]} */
  const rows = [];
  labels.rivers.forEach((l) => {
    rows.push({ kind: 'river', local: l.main.local, label: l.main.text, lang: l.main.lang, rule: l.main.rule });
    for (const [name, s] of l.stretch) if (name !== l.main.local) rows.push({ kind: 'stretch', local: name, label: s.text, lang: s.lang, rule: s.rule, of: l.main.text });
  });
  osm.lakes.forEach((_, k) => { const l = labels.lakes[k]; rows.push({ kind: 'lake', local: l.local, label: l.text, lang: l.lang, rule: l.rule }); });
  const changed = rows.filter((r) => r.label !== r.local);
  /** @type {Map<string, number>} */
  const byRule = new Map();
  for (const r of changed) {
    const rule = r.rule.replace(/ \(\d+ of \d+ within \d+ km\)/, '');
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
  }
  await writeFile(LABEL_REPORT, `${JSON.stringify({ labels: changed }, null, 1)}\n`);
  console.log(`water labels: ${changed.length} differ from OpenStreetMap's names (${changed.filter((r) => r.lang).length} romanised); all in ${LABEL_REPORT}`);
  for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${rule}`);
  if (osm.checks?.mustHaveRivers) {
    console.log('must-have rivers, as the map names them:');
    for (const line of mustHaveRiverTable(osm.rivers, labels, osm.checks.mustHaveRivers)) console.log(line);
  }
}

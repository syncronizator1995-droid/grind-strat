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
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encodeShapes, encodeUints } from '../../src/ui/map/codec.js';
import { makeBlock } from './block.mjs';
import { ringArea2, simplify, simplifyRing } from './geo.mjs';
import { labelPoint } from './label-point.mjs';
import { joinLevels, pointLevels } from './levels.mjs';
import { neWater } from './ne-layers.mjs';
import { madeFrom } from './pack-notice.mjs';
import { DERIVED } from './resample.mjs';

export const OSM_WATER = join(DERIVED, 'water-osm.json');
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
 */

/** @param {number} km2 */
const lakeMinLevel = (km2) => (km2 < LAKE_MIN_KM2[1] ? 2 : km2 < LAKE_MIN_KM2[0] ? 1 : 0);

/** Biggest first, then by name: label priority, and the same order on every run. */
const bySize = (/** @type {number} */ a, /** @type {number} */ b, /** @type {string} */ an, /** @type {string} */ bn) => b - a || (an < bn ? -1 : an > bn ? 1 : 0);

/**
 * @param {River[]} rivers @param {Lake[]} lakes
 */
function waterLayers(rivers, lakes) {
  const rs = [...rivers].sort((a, b) => bySize(a.lengthKm, b.lengthKm, a.name, b.name));
  const ls = [...lakes].sort((a, b) => bySize(a.areaKm2, b.areaKm2, a.name, b.name));
  /** @type {number[][]} */ const riverLines = [];
  /** @type {Uint8Array[]} */ const riverLevels = [];
  /** @type {number[]} */ const riverOf = [];
  /** @type {number[]} */ const riverLineName = [];
  // Local names of stretches, where they differ from the river's own name: index 0 is "none".
  /** @type {string[]} */ const lineNames = [''];
  /** @type {Map<string, number>} */ const nameIndex = new Map([['', 0]]);
  rs.forEach((river, k) => {
    river.lines.forEach((raw, i) => {
      const line = simplify(raw, BASE_TOLERANCE);
      if (line.length < 4) return;
      riverLines.push(line);
      riverLevels.push(pointLevels(line, false, { tolerances: WATER_TOLERANCES }));
      riverOf.push(k);
      const own = river.lineNames?.[i] ?? '';
      const local = own === river.name ? '' : own;
      if (!nameIndex.has(local)) { nameIndex.set(local, lineNames.length); lineNames.push(local); }
      riverLineName.push(/** @type {number} */ (nameIndex.get(local)));
    });
  });
  /** @type {number[][]} */ const lakeRings = [];
  /** @type {Uint8Array[]} */ const lakeLevels = [];
  /** @type {number[]} */ const lakeOf = [];
  /** @type {[number, number][]} */ const labelAt = [];
  ls.forEach((lake, k) => {
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
        riverInfo: rs.map((r) => ({ name: r.name, names: r.names, wikidata: r.wikidata, lengthKm: r.lengthKm })),
        riverLineNames: lineNames,
        lakeInfo: ls.map((l, k) => ({ name: l.name, names: l.names, wikidata: l.wikidata, areaKm2: l.areaKm2, at: labelAt[k] })),
      })),
    },
    counts: { rivers: rs.length, lakes: ls.length },
  };
}

/**
 * The OpenStreetMap water block, from the parsed extract.
 * @param {{ source: string, licence: string, osmBase?: string | null, overture?: { release: string }, rivers: River[], lakes: Lake[] }} osm
 */
export function osmWaterBlock(osm) {
  if (osm.licence !== 'ODbL-1.0' || osm.source !== 'osm') throw new Error('water-osm.json is not the OpenStreetMap extract');
  const { layers, counts } = waterLayers(osm.rivers, osm.lakes);
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
  if (existsSync(OSM_WATER)) return { path: 'src/data/odbl/water.json', block: osmWaterBlock(JSON.parse(await readFile(OSM_WATER, 'utf8'))) };
  return { path: 'src/data/map/water-ne.json', block: await neWaterBlock() };
}

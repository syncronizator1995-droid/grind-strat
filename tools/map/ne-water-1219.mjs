// @ts-check
// Applies the reviewed list in tools/map/ne-water-1219.json to Natural Earth's lakes and river
// names: which lake polygons the map around 1219 keeps (modern reservoirs out, natural lakes in,
// whatever Natural Earth's own class says), which name each shows, and the few river names whose
// letters Natural Earth lost. The water block, the 1219 terrain grid and the previews all read
// lakes through here, so they agree on what was water in 1219.
//
// The list must cover the data exactly: a polygon on the map with no entry, or an entry that
// matches nothing, stops the build with a list of what to review. A new Natural Earth release
// therefore cannot slip an unreviewed reservoir onto the map.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { clipRing, featuresIn, openRing, project } from './geo.mjs';

export const REVIEW_FILE = 'tools/map/ne-water-1219.json';

/**
 * @typedef {object} LakeEntry one reviewed lake polygon
 * @property {string} [name] Natural Earth's name (absent for unnamed polygons)
 * @property {[number, number]} at the middle of the polygon's bounding box, lon and lat, 2 decimals
 * @property {boolean} keep @property {string} why @property {string} [what]
 * @property {string} [show] the name to show instead of Natural Earth's ('' for none)
 * @property {string} [showWhy] @property {string} [join] entries with the same join become one lake
 * @property {number} [copies] identical copies of the polygon in Natural Earth
 * @property {string} [toCheck]
 *
 * @typedef {{ from: string, to: string, why: string }} NameFix
 * @typedef {{ lakes: LakeEntry[], riverNames: NameFix[] }} Review
 *
 * @typedef {object} ReviewedLake a kept Natural Earth lake feature
 * @property {any} feature the GeoJSON feature @property {LakeEntry} entry
 * @property {string} show the name the map shows ('' for none)
 */

/** @returns {Promise<Review>} */
export async function readReview() {
  return JSON.parse(await readFile(fileURLToPath(new URL('./ne-water-1219.json', import.meta.url)), 'utf8'));
}

/** @param {any} geometry @returns {number[][][][]} each polygon's rings, outer ring first */
const polygonsOf = (geometry) => (geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : []);

/**
 * Does any outer ring reach onto the map? (Projected and clipped, as the packers do it.)
 * @param {any} feature
 */
export function onMap(feature) {
  return polygonsOf(feature.geometry).some((p) => {
    const near = featuresIn({ features: [{ geometry: { type: 'Polygon', coordinates: [p[0]] } }] }, 'polygon').length > 0;
    return near && clipRing(openRing(project(p[0]))).length > 0;
  });
}

/**
 * The middle of a feature's bounding box, in degrees to 2 decimals: the key for unnamed lakes.
 * The bounding box, not a centroid, so the key is easy to check by eye on any map.
 * @param {any} feature
 * @returns {[number, number]}
 */
export function lakeAt(feature) {
  let w = Infinity; let e = -Infinity; let s = Infinity; let n = -Infinity;
  for (const p of polygonsOf(feature.geometry)) {
    for (const [lon, lat] of p[0]) {
      w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat);
    }
  }
  return [round2((w + e) / 2), round2((s + n) / 2)];
}

/** @param {number} v */
const round2 = (v) => Math.round(v * 100) / 100;

/** @param {any} feature @param {LakeEntry} entry */
const matches = (feature, entry) => {
  const [lon, lat] = lakeAt(feature);
  return (feature.properties?.name ?? undefined) === entry.name && lon === entry.at[0] && lat === entry.at[1];
};

/** @param {LakeEntry} e */
const describe = (e) => `${e.name ? `"${e.name}"` : 'unnamed'} at ${e.at.join(', ')}`;

/**
 * Problems with one entry on its own: the fields every decision needs.
 * @param {LakeEntry} e
 * @returns {string[]}
 */
function entryProblems(e) {
  const out = [];
  if (!Array.isArray(e.at) || e.at.length !== 2 || !e.at.every(Number.isFinite)) out.push(`${describe(e)}: "at" must be [lon, lat]`);
  if (typeof e.keep !== 'boolean') out.push(`${describe(e)}: "keep" must be true or false`);
  if (!e.why) out.push(`${describe(e)}: says no "why"`);
  if (!e.name && !e.what) out.push(`${describe(e)}: an unnamed polygon needs "what" it is`);
  if (e.show !== undefined && !e.showWhy) out.push(`${describe(e)}: "show" needs a "showWhy"`);
  if (!e.keep && (e.show !== undefined || e.join)) out.push(`${describe(e)}: a dropped lake has no name or join`);
  return out;
}

/**
 * The lake features the map keeps, in the list's order (so of two joined parts, the one listed
 * first gives the names), each with its entry. Throws with every problem at once when the list
 * and the data disagree.
 * @param {any} geojson Natural Earth's lakes
 * @param {Review} review
 * @returns {ReviewedLake[]}
 */
export function reviewLakes(geojson, review) {
  const problems = review.lakes.flatMap(entryProblems);
  /** @type {Map<LakeEntry, any[]>} */
  const found = new Map(review.lakes.map((e) => [e, []]));
  for (const feature of geojson.features) {
    if (!feature.geometry || !onMap(feature)) continue;
    const hits = review.lakes.filter((e) => matches(feature, e));
    if (hits.length === 1) found.get(hits[0])?.push(feature);
    else {
      const what = `${feature.properties?.name ? `"${feature.properties.name}"` : 'unnamed'} at ${lakeAt(feature).join(', ')}`;
      problems.push(hits.length ? `${what} matches ${hits.length} entries` : `${what} (Natural Earth class "${feature.properties?.featurecla}") is on the map but not in the list: review it`);
    }
  }
  /** @type {ReviewedLake[]} */
  const kept = [];
  for (const [entry, features] of found) {
    if (!features.length) {
      problems.push(`${describe(entry)} matches no Natural Earth lake on the map: remove or fix the entry`);
      continue;
    }
    // Natural Earth has a few polygons twice, byte for byte; drawing both would double them.
    const geometry = JSON.stringify(features[0].geometry);
    if (features.length !== (entry.copies ?? 1)) problems.push(`${describe(entry)} matches ${features.length} polygons, but says copies: ${entry.copies ?? 1}`);
    else if (features.some((f) => JSON.stringify(f.geometry) !== geometry)) problems.push(`${describe(entry)}: its copies are not identical`);
    if (entry.keep) kept.push({ feature: features[0], entry, show: entry.show ?? String(features[0].properties?.name ?? '') });
  }
  if (problems.length) throw new Error(`${REVIEW_FILE} and Natural Earth's lakes disagree:\n- ${problems.join('\n- ')}`);
  return kept;
}

/**
 * Natural Earth's lakes as a FeatureCollection of only the kept features: a drop-in for code
 * that reads lakes with featuresIn.
 * @param {any} geojson @param {Review} review
 */
export function keptLakeCollection(geojson, review) {
  return { type: 'FeatureCollection', features: reviewLakes(geojson, review).map((l) => l.feature) };
}

/**
 * A river's name fields with the repairs from the list applied.
 * @param {Record<string, any>} props a Natural Earth river's properties
 * @param {NameFix[]} fixes
 * @returns {Record<string, any>}
 */
export function fixRiverNames(props, fixes) {
  const out = { ...props };
  for (const key of Object.keys(out)) {
    if (!key.startsWith('name') || typeof out[key] !== 'string') continue;
    const fix = fixes.find((f) => f.from === out[key]);
    if (fix) out[key] = fix.to;
  }
  return out;
}

/**
 * Fixes that match no river name on the map are stale: say so rather than carry them silently.
 * @param {any[]} riverProps the properties of the river features on the map
 * @param {NameFix[]} fixes
 */
export function unusedRiverFixes(riverProps, fixes) {
  return fixes.filter((f) => !riverProps.some((p) => Object.keys(p).some((k) => k.startsWith('name') && p[k] === f.from)));
}

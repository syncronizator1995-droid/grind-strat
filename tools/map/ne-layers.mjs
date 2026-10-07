// @ts-check
// Natural Earth layers (public domain) for the map: the land (with its coast), and the rivers and
// lakes M2 ships (Natural Earth's simpler set; fuller OpenStreetMap rivers come in the next
// milestone). Which lakes count for 1219, and a few repaired names, come from the reviewed list
// in tools/map/ne-water-1219.json. Moved here from the M1 test-map builder, which step 2a M2
// retired.

import { readRaw } from './fetch.mjs';
import { clipLine, clipRing, featuresIn, openRing, project, ringArea2, simplify, simplifyRing } from './geo.mjs';
import { fixRiverNames, partFix, readReview, reviewLakes, unusedRiverFixes } from './ne-water-1219.mjs';

/** Islets and ponds smaller than this many square game units are left out (about 0.4 km²). */
const MIN_AREA = 40;
/**
 * Natural Earth's name fields for the languages of the map's lands that it has. It has none for
 * Lithuanian, Latvian or Estonian (no name_lt, name_lv or name_et), and its rivers carry only
 * name, name_en and name_alt.
 */
const NE_LANGS = ['de', 'en', 'pl', 'ru', 'sv', 'uk'];
/** Square km per square game unit (a unit is 100 m). */
const KM2_PER_UNIT2 = 0.01;

/** @param {string} id */
async function geojson(id) {
  return JSON.parse((await readRaw(id)).data.toString('utf8'));
}

/**
 * The land, as rings clipped to the map, simplified to about 150 m. Clipping adds edges along the
 * map's border; the game leaves those out when it draws the coast.
 * @returns {Promise<number[][]>}
 */
export async function neLand() {
  /** @type {number[][]} */
  const rings = [];
  for (const f of featuresIn(await geojson('ne-land'), 'polygon')) {
    for (const part of f.parts) {
      const ring = simplifyRing(openRing(project(part)), 1.5);
      if (Math.abs(ringArea2(ring)) < 2 * MIN_AREA) continue;
      const clipped = clipRing(ring);
      if (clipped.length) rings.push(clipped);
    }
  }
  return rings;
}

/**
 * The other names, for the info panel: by language code, plus "alt" (Natural Earth's other
 * names, "|" between them, as it writes them) and "ne" (Natural Earth's own main name, when the
 * map shows another).
 * @param {any} props @param {string} shown the name the map shows
 */
function neNames(props, shown) {
  /** @type {Record<string, string>} */
  const names = {};
  for (const l of NE_LANGS) if (props[`name_${l}`]) names[l] = String(props[`name_${l}`]);
  // Natural Earth's alternative name often repeats its English one.
  if (props.name_alt && !Object.values(names).includes(String(props.name_alt))) names.alt = String(props.name_alt);
  if (props.name && props.name !== shown) names.ne = String(props.name);
  return names;
}

/** @param {number[]} line */
function lengthOf(line) {
  let s = 0;
  for (let i = 2; i < line.length; i += 2) s += Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
  return s;
}

/**
 * Rivers and lakes from Natural Earth, in the same shape as the OpenStreetMap extract will be:
 * rivers with their lines, lakes with their rings (outer rings counter-clockwise, holes
 * clockwise, each outer ring before its holes).
 *
 * Rivers keep Natural Earth's own name (its main name is the local one where it has one,
 * otherwise the English one), with the repairs from the reviewed list; they are grouped by name,
 * so a river split into pieces in Natural Earth is one river here. Lakes are the ones the list
 * keeps for 1219, named as it says; polygons it joins (the two halves of the Vistula Lagoon)
 * become one lake.
 */
export async function neWater() {
  return neWaterFrom(await geojson('ne-rivers'), await geojson('ne-lakes'), await readReview());
}

/**
 * neWater's work on data already read, so tests can give it a small made-up map.
 * @param {any} riverData @param {any} lakeData GeoJSON FeatureCollections
 * @param {import('./ne-water-1219.mjs').Review} review
 */
export function neWaterFrom(riverData, lakeData, review) {
  const onMapRivers = featuresIn(riverData, 'line').filter((f) => f.parts.some((part) => clipLine(project(part)).some((l) => l.length >= 4)));
  const stale = unusedRiverFixes(onMapRivers.map((f) => f.props), review.riverNames);
  if (stale.length) throw new Error(`tools/map/ne-water-1219.json repairs river names that are not on the map: ${stale.map((f) => f.from).join(', ')}`);
  /** @type {Map<string, { name: string, names: Record<string, string>, wikidata: string | null, lines: number[][] }>} */
  const rivers = new Map();
  const partFixes = review.riverParts ?? [];
  /** @type {Set<import('./ne-water-1219.mjs').PartFix>} */
  const usedParts = new Set();
  onMapRivers.forEach((f, featureIndex) => {
    const props = fixRiverNames(f.props, review.riverNames);
    for (const part of f.parts) {
      const lines = clipLine(simplify(project(part), 1)).filter((line) => line.length >= 4);
      if (!lines.length) continue;
      const fix = partFix(String(props.name ?? ''), part, partFixes);
      if (fix) usedParts.add(fix);
      // A piece renamed by place belongs to another river: Natural Earth's other names for it
      // (and its Wikidata id) are the wrong river's, so it brings none.
      const name = fix ? fix.show : String(props.name ?? '');
      // Unnamed pieces stay grouped by the feature (or the repair) they come from.
      const key = name || (fix ? `unnamed-repair-${partFixes.indexOf(fix)}` : `unnamed-${featureIndex}`);
      const river = rivers.get(key) ?? { name, names: {}, wikidata: null, lines: /** @type {number[][]} */ ([]) };
      if (!fix) {
        // Pieces of one river may carry different extra names: keep the first piece's, add the rest.
        /** @type {Record<string, string>} */
        const old = review.riverNames.some((x) => x.keepOld && x.from === f.props.name) ? { ne: String(f.props.name) } : {};
        river.names = { ...neNames(props, name), ...old, ...river.names };
        river.wikidata ??= props.wikidataid ?? null;
      }
      river.lines.push(...lines);
      rivers.set(key, river);
    }
  });
  const unusedParts = partFixes.filter((f) => !usedParts.has(f));
  if (unusedParts.length) throw new Error(`tools/map/ne-water-1219.json renames river pieces that are not on the map: ${unusedParts.map((f) => `${f.name} ${f.ends.map((e) => e.join(',')).join(' to ')}`).join('; ')}`);
  /** @type {Map<string, { name: string, names: Record<string, string>, wikidata: string | null, rings: number[][], area2: number }>} */
  const joined = new Map();
  for (const { feature, entry, show } of reviewLakes(lakeData, review)) {
    const { rings, area2 } = lakeRings(polygonsNear(feature.geometry));
    if (!rings.length) continue;
    const key = entry.join ?? `${entry.name ?? ''} ${entry.at.join(' ')}`;
    const props = feature.properties ?? {};
    const have = joined.get(key);
    if (!have) {
      joined.set(key, { name: show, names: neNames(props, show), wikidata: props.wikidataid ?? null, rings, area2 });
      continue;
    }
    // A joined part adds its shape, any names the first part lacks, and its own main name.
    have.rings.push(...rings);
    have.area2 += area2;
    have.wikidata ??= props.wikidataid ?? null;
    const more = neNames(props, show);
    const ne = [have.names.ne, more.ne].filter(Boolean).join('|');
    have.names = { ...more, ...have.names, ...(ne ? { ne } : {}) };
  }
  return {
    rivers: [...rivers.values()].map((r) => ({ ...r, lengthKm: round1(r.lines.reduce((s, l) => s + lengthOf(l), 0) / 10) })),
    lakes: [...joined.values()].map(({ area2, ...l }) => ({ ...l, areaKm2: round1((area2 / 2) * KM2_PER_UNIT2) })),
  };
}

/**
 * One lake's rings, projected, simplified, clipped and wound the game's way, with twice its area.
 * @param {number[][][][]} polygons
 */
function lakeRings(polygons) {
  /** @type {number[][]} */
  const rings = [];
  let area2 = 0;
  for (const polygon of polygons) {
    // GeoJSON lists each polygon's outer ring first and its holes after it.
    let outerKept = false;
    polygon.forEach((part, k) => {
      const outer = k === 0;
      if (!outer && !outerKept) return;
      const ring = simplifyRing(openRing(project(part)), 1);
      if (Math.abs(ringArea2(ring)) < 2 * MIN_AREA) return;
      const clipped = clipRing(ring);
      if (!clipped.length) return;
      if (outer) outerKept = true;
      const a = ringArea2(clipped);
      // Outer rings counter-clockwise (positive area), holes clockwise.
      rings.push((a > 0) === outer ? clipped : reverse(clipped));
      area2 += outer ? Math.abs(a) : -Math.abs(a);
    });
  }
  return { rings, area2 };
}

/**
 * A feature's polygons that might touch the map, each keeping its rings together (featuresIn
 * flattens them, losing which ring is a hole).
 * @param {any} g a GeoJSON geometry
 * @returns {number[][][][]}
 */
function polygonsNear(g) {
  /** @type {number[][][][]} */
  const all = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  return all.filter((p) => featuresIn({ features: [{ geometry: { type: 'Polygon', coordinates: [p[0]] } }] }, 'polygon').length > 0);
}

/** @param {number[]} ring */
function reverse(ring) {
  /** @type {number[]} */
  const out = [];
  for (let i = ring.length - 2; i >= 0; i -= 2) out.push(ring[i], ring[i + 1]);
  return out;
}

/** @param {number} v */
const round1 = (v) => Math.round(v * 10) / 10;

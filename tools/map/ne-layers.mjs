// @ts-check
// Natural Earth layers (public domain) for the map: the land (with its coast), and, until the
// OpenStreetMap rivers and lakes are ready, an interim set of rivers and lakes. Moved here from
// the M1 test-map builder, which step 2a M2 retired.

import { readRaw } from './fetch.mjs';
import { clipLine, clipRing, featuresIn, openRing, project, ringArea2, simplify, simplifyRing } from './geo.mjs';

/** Islets and ponds smaller than this many square game units are left out (about 0.4 km²). */
const MIN_AREA = 40;
/** Natural Earth's name fields for the languages the water data keeps (others have none). */
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

/** @param {any} props */
function neNames(props) {
  /** @type {Record<string, string>} */
  const names = {};
  for (const l of NE_LANGS) if (props[`name_${l}`]) names[l] = String(props[`name_${l}`]);
  return names;
}

/** @param {number[]} line */
function lengthOf(line) {
  let s = 0;
  for (let i = 2; i < line.length; i += 2) s += Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
  return s;
}

/**
 * Interim rivers and lakes from Natural Earth, in the same shape as the OpenStreetMap extract
 * (tools/map/build-water.mjs): rivers with their lines, lakes with their rings (outer rings
 * counter-clockwise, holes clockwise, each outer ring before its holes). Reservoirs are left out:
 * they were not there in 1219. Rivers are grouped by name, so a river split into pieces in
 * Natural Earth is one river here.
 */
export async function neWater() {
  /** @type {Map<string, { name: string, names: Record<string, string>, wikidata: string | null, lines: number[][] }>} */
  const rivers = new Map();
  for (const f of featuresIn(await geojson('ne-rivers'), 'line')) {
    const name = String(f.props.name ?? '');
    const key = name || `unnamed-${rivers.size}`;
    const river = rivers.get(key) ?? { name, names: neNames(f.props), wikidata: f.props.wikidataid ?? null, lines: /** @type {number[][]} */ ([]) };
    for (const part of f.parts) for (const line of clipLine(simplify(project(part), 1))) if (line.length >= 4) river.lines.push(line);
    if (river.lines.length) rivers.set(key, river);
  }
  const lakes = [];
  for (const f of polygonsIn(await geojson('ne-lakes'))) {
    if (String(f.props.featurecla).toLowerCase().includes('reservoir')) continue;
    /** @type {number[][]} */
    const rings = [];
    let area2 = 0;
    for (const polygon of f.polygons) {
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
    if (!rings.length) continue;
    lakes.push({ name: String(f.props.name ?? ''), names: neNames(f.props), wikidata: f.props.wikidataid ?? null, areaKm2: round1((area2 / 2) * KM2_PER_UNIT2), rings });
  }
  return {
    rivers: [...rivers.values()].map((r) => ({ ...r, lengthKm: round1(r.lines.reduce((s, l) => s + lengthOf(l), 0) / 10) })),
    lakes,
  };
}

/**
 * Polygon features that might touch the map, keeping each polygon's rings together (featuresIn
 * flattens them, losing which ring is a hole).
 * @param {any} geojson
 * @returns {{ props: any, polygons: number[][][][] }[]}
 */
function polygonsIn(geojson) {
  const out = [];
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    /** @type {number[][][][]} */
    const all = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const polygons = all.filter((p) => featuresIn({ features: [{ geometry: { type: 'Polygon', coordinates: [p[0]] } }] }, 'polygon').length > 0);
    if (polygons.length) out.push({ props: f.properties ?? {}, polygons });
  }
  return out;
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

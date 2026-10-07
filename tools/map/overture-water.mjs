// @ts-check
// Turns the rows that tools/map/fetch-overture.mjs extracted from Overture's water theme into
// what the water rules work on: river ways (one OpenStreetMap way each, with its tags) and lake
// candidates (one OpenStreetMap way or multipolygon each, already assembled by Overture), plus
// the cached OpenStreetMap river relations that group ways into rivers. All of it is
// OpenStreetMap data under the ODbL 1.0.

import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { OSM_DIR, readCached } from './fetch-osm.mjs';
import { OVERTURE_DIR } from './fetch-overture.mjs';

/** @typedef {import('./fetch-overture.mjs').WaterRow} WaterRow */
/** @typedef {Record<string, string>} Tags */

/** The values of OpenStreetMap's water=* that can be a natural lake (none at all counts too). */
export const LAKE_WATER_VALUES = ['lake', 'oxbow', 'lagoon'];

/**
 * The release recorded by the last fetch, and where its rows are.
 * @returns {Promise<{ release: string, rows: string, meta: any }>}
 */
export async function overtureRun() {
  const runFile = join(OVERTURE_DIR, 'run.json');
  if (!existsSync(runFile)) throw new Error('no Overture download yet: run node tools/map/fetch-overture.mjs');
  const { release } = JSON.parse(await readFile(runFile, 'utf8'));
  const dir = join(OVERTURE_DIR, release);
  const rows = join(dir, 'water-rows.ndjson');
  const metaFile = join(dir, 'water-rows.meta.json');
  if (!existsSync(rows) || !existsSync(metaFile)) throw new Error(`release ${release} has not been read yet: run node tools/map/fetch-overture.mjs`);
  return { release, rows, meta: JSON.parse(await readFile(metaFile, 'utf8')) };
}

/**
 * Every row of the extract, one at a time (the file is too big to read as one string).
 * @param {string} path
 * @returns {AsyncGenerator<WaterRow>}
 */
export async function* waterRows(path) {
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) if (line) yield JSON.parse(line);
}

/**
 * The OpenStreetMap object behind an Overture row, from sources[].record_id ("w123@4" is
 * version 4 of way 123; "r..." a relation, "n..." a node).
 * @param {string} recordId
 * @returns {{ type: 'node' | 'way' | 'relation', id: number } | null}
 */
export function osmObject(recordId) {
  const m = /^([nwr])(\d+)(@\d+)?$/.exec(recordId);
  if (!m) return null;
  return { type: m[1] === 'n' ? 'node' : m[1] === 'w' ? 'way' : 'relation', id: Number(m[2]) };
}

/**
 * A row's tags in OpenStreetMap's own form: the raw tags Overture keeps (source_tags), plus the
 * name, the name:xx tags and the Wikidata id, which Overture moves into fields of their own.
 * @param {WaterRow} row
 * @returns {Tags}
 */
export function rowTags(row) {
  /** @type {Tags} */
  const tags = { ...row.tags };
  if (row.name) tags.name = row.name;
  for (const [lang, v] of Object.entries(row.common)) if (v) tags[`name:${lang}`] = v;
  if (row.wikidata) tags.wikidata = row.wikidata;
  return tags;
}

/**
 * A river way: a row of subtype river, class river, drawn as a line (rivers drawn as areas, the
 * river banks, are left out: the map draws rivers as lines). Rows that are not one way are
 * refused rather than guessed at.
 * @param {WaterRow} row
 * @returns {import('./water-rules.mjs').RiverWay | null}
 */
export function riverWay(row) {
  if (row.subtype !== 'river' || row.class !== 'river' || row.geometry?.type !== 'LineString') return null;
  const ids = row.osm.map(osmObject);
  const way = ids.length === 1 && ids[0]?.type === 'way' ? ids[0] : null;
  if (!way || row.geometry.line.length < 4) return null;
  return { id: way.id, tags: { waterway: 'river', ...rowTags(row) }, coords: row.geometry.line };
}

/**
 * @typedef {object} LakeCandidate
 * @property {string} osmId "way/123" or "relation/123"
 * @property {Tags} tags
 * @property {string} subtype Overture's subtype (lake, water or reservoir)
 * @property {{ outer: number[], holes: number[][] }[]} polygons lon/lat rings, as in the row
 */

/**
 * A lake candidate: a polygon row mapped as natural=water (a lake, an oxbow, a lagoon or water
 * with no water=* tag; a lagoon may be natural=bay) or a reservoir (kept so the build can report it and check rivers that
 * run through it). Harbours, ponds, basins, river areas and the like are not lakes.
 * @param {WaterRow} row
 * @returns {LakeCandidate | null}
 */
export function lakeCandidate(row) {
  const g = row.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null;
  if (!['lake', 'water', 'reservoir'].includes(row.subtype)) return null;
  const tags = rowTags(row);
  // Mapped as water: not a fairway drawn as an area, nor a lake only proposed.
  if (tags.natural !== 'water' && !(tags.natural === 'bay' && tags.water === 'lagoon')) return null;
  const isReservoir = row.subtype === 'reservoir' || tags.water === 'reservoir';
  if (!isReservoir && tags.water !== undefined && !LAKE_WATER_VALUES.includes(tags.water)) return null;
  const ids = row.osm.map(osmObject);
  const obj = ids.length === 1 ? ids[0] : null;
  if (!obj || obj.type === 'node') return null;
  const parts = g.type === 'Polygon' ? [g.rings] : g.polygons;
  return {
    osmId: `${obj.type}/${obj.id}`,
    tags,
    subtype: row.subtype,
    polygons: parts.map((/** @type {number[][]} */ rings) => ({ outer: rings[0], holes: rings.slice(1) })),
  };
}

/**
 * The OpenStreetMap river relations (type=waterway, waterway=river) cached by the earlier
 * Overpass download in data/raw/osm/: the newest copy, checked against its fingerprint.
 * @returns {Promise<{ relations: import('./water-rules.mjs').RiverRelation[], osmBase: string, file: string }>}
 */
export async function riverRelations() {
  const index = JSON.parse(await readFile(join(OSM_DIR, 'index.json'), 'utf8'));
  const files = Object.entries(index.files)
    .filter(([, f]) => /** @type {any} */ (f).label.startsWith('river relations'))
    .sort((a, b) => (/** @type {any} */ (a[1]).osmBase < /** @type {any} */ (b[1]).osmBase ? 1 : -1));
  if (!files.length) throw new Error('no cached OpenStreetMap river relations in data/raw/osm/');
  const [name, rec] = /** @type {[string, any]} */ (files[0]);
  const text = await readCached(name);
  if (text === null) throw new Error(`the cached river relations ${name} are missing or changed`);
  const relations = JSON.parse(text).elements
    .filter((/** @type {any} */ e) => e.type === 'relation')
    .map((/** @type {any} */ e) => ({ id: e.id, tags: e.tags ?? {}, members: e.members ?? [] }));
  return { relations, osmBase: rec.osmBase, file: name };
}

// @ts-check
// Downloads rivers, lakes and reservoirs from OpenStreetMap through the public Overpass API
// (overpass-api.de), politely, and caches every raw answer in data/raw/osm/ (git ignores it).
// A rerun downloads nothing: each answer is stored under a hash of its query, and its SHA-256
// is recorded in data/raw/manifest.json under "osm-water".
//
// Politeness (overpass-api.de "Commons" page: about 10,000 requests and 1 GB a day at most per
// user, rate-limited slots, 429 when no slot is free, 504 when the server is too busy):
//   - one request at a time, with a pause between them;
//   - /api/status is read before each request, and we wait for a free slot;
//   - on 429 or 504 we back off exponentially and retry;
//   - a tile whose query runs out of time or memory is split into four;
//   - geometry is fetched per id, once, so huge lakes (Ladoga, Peipus) are not fetched per tile.
// The whole run is a few hundred requests and a few hundred MB, once.
//
//   NODE_USE_ENV_PROXY=1 node tools/map/fetch-osm.mjs
//
// The queries, the filters and the thresholds are public on purpose: the ODbL asks that the
// method behind a derivative database is available (see src/data/odbl/README.md).

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureProxy, RAW, sha256 } from './fetch-grids.mjs';
import { MAP } from './projection.mjs';
import { mapWindow } from './resample.mjs';
import { lakeCandidateWorthFetching } from './water-rules.mjs';

export const OVERPASS = 'https://overpass-api.de/api/interpreter';
const STATUS_URL = 'https://overpass-api.de/api/status';
export const USER_AGENT = 'GrindStrat-map-build/1.0 (+github.com/syncronizator1995-droid/grind-strat)';
export const OSM_DIR = join(RAW, 'osm');
export const RUN_FILE = join(OSM_DIR, 'run.json');
const MANIFEST = join(RAW, 'manifest.json');
const INDEX = join(OSM_DIR, 'index.json');
const MANIFEST_KEY = 'osm-water';
const REVIEW_FILE = fileURLToPath(new URL('./reservoirs-1219.json', import.meta.url));

/**
 * What each query promises the server: run time in seconds and memory in bytes. The server only
 * admits a query when it promises at most half of what is still free (504 otherwise), so modest
 * promises get in sooner; a query that needs more fails with a "runtime error" and is split.
 */
const QUERY_TIMEOUT = 120;
const QUERY_MAXSIZE = 256 * 1024 * 1024;
/** Pause between two requests, in ms, on top of waiting for a free slot. */
const GAP_MS = 1500;
/** Tile size in degrees for the per-tile queries. */
const TILE_DEG = 2;

/** @typedef {{ south: number, west: number, north: number, east: number }} BBox */

/**
 * The lon/lat window that holds the whole map rectangle: its corners stick out of the nominal
 * 12-34°E, 50-61.5°N box once projected, so walk the rectangle's edges and add 0.3°, then round
 * outwards to 0.05° so the queries (and so the cache keys) do not change with tiny float noise.
 * @returns {BBox}
 */
export function osmWindow() {
  const w = mapWindow(0.3);
  const down = (/** @type {number} */ v) => Math.floor(v * 20) / 20;
  const up = (/** @type {number} */ v) => Math.ceil(v * 20) / 20;
  return { south: down(w.south), west: down(w.west), north: up(w.north), east: up(w.east) };
}

/** "s,w,n,e", as Overpass wants a bounding box. @param {BBox} b */
export const bboxText = (b) => [b.south, b.west, b.north, b.east].map((v) => +v.toFixed(4)).join(',');

/**
 * Whether a lon/lat tile overlaps the map rectangle: some sample point of the tile lands inside
 * the map, or some point on the map's edge lands inside the tile.
 * @param {BBox} t
 */
export function tileTouchesMap(t) {
  const n = 8;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const [x, y] = MAP.toUnits(t.west + ((t.east - t.west) * i) / n, t.south + ((t.north - t.south) * j) / n);
      if (x >= 0 && x <= MAP.width && y >= 0 && y <= MAP.height) return true;
    }
  }
  for (let k = 0; k <= 200; k++) {
    const s = k / 200;
    for (const [ux, uy] of [[s * MAP.width, 0], [s * MAP.width, MAP.height], [0, s * MAP.height], [MAP.width, s * MAP.height]]) {
      const [lon, lat] = MAP.toDegrees(ux, uy);
      if (lon >= t.west && lon <= t.east && lat >= t.south && lat <= t.north) return true;
    }
  }
  return false;
}

/** The window cut into tiles of TILE_DEG degrees, keeping those that touch the map. @param {BBox} w */
export function tilesOf(w) {
  /** @type {BBox[]} */
  const out = [];
  for (let south = w.south; south < w.north - 1e-9; south += TILE_DEG) {
    for (let west = w.west; west < w.east - 1e-9; west += TILE_DEG) {
      const t = { south: +south.toFixed(4), west: +west.toFixed(4), north: +Math.min(w.north, south + TILE_DEG).toFixed(4), east: +Math.min(w.east, west + TILE_DEG).toFixed(4) };
      if (tileTouchesMap(t)) out.push(t);
    }
  }
  return out;
}

/** Four quarters of a box, for a tile that was too big for one query. @param {BBox} b */
function quarters(b) {
  const mLat = (b.south + b.north) / 2;
  const mLon = (b.west + b.east) / 2;
  return [
    { south: b.south, west: b.west, north: mLat, east: mLon }, { south: b.south, west: mLon, north: mLat, east: b.east },
    { south: mLat, west: b.west, north: b.north, east: mLon }, { south: mLat, west: mLon, north: b.north, east: b.east },
  ];
}

// ---------------------------------------------------------------------------------------------
// The queries. [out:json] for easy parsing; "qt" sorts by location, which is faster for the
// server than sorting by id. Changes from the first plan are explained where they are made.

const HEAD = `[out:json][timeout:${QUERY_TIMEOUT}][maxsize:${QUERY_MAXSIZE}]`;

export const QUERIES = {
  /** Waterway relations of rivers, with members and tags, once for the whole window. @param {BBox} b */
  riverRelations: (b) => `${HEAD};\nrelation["type"="waterway"]["waterway"="river"](${bboxText(b)});\nout body qt;`,
  /**
   * River ways per tile, with tags and geometry. Only NAMED ways: an unnamed river way can only
   * join a river through its relation, and those members are fetched by id below. This keeps
   * the download far smaller (thousands of unnamed ditch-like "rivers"). Canals are left out.
   * @param {BBox} b
   */
  riverWays: (b) => `${HEAD};\nway["waterway"="river"]["name"](${bboxText(b)});\nout tags geom qt;`,
  /**
   * Relation members that the tile queries did not bring (unnamed ways, or streams and canals
   * that are part of a river's relation), by id, limited to the window.
   * @param {BBox} w @param {number[]} ids
   */
  memberWays: (w, ids) => `${HEAD};\nway(id:${ids.join(',')})(${bboxText(w)})["waterway"~"^(river|stream|canal)$"];\nout tags geom qt;`,
  /**
   * Lake candidates per tile: ids, tags and bounding boxes only (no geometry yet). Natural
   * water with water=lake, oxbow, lagoon or no water tag, with a name or a Wikidata id.
   * @param {BBox} b
   */
  lakeBoxes: (b) => {
    const bb = bboxText(b);
    const lines = [];
    for (const kind of ['way', 'relation']) {
      for (const key of ['name', 'wikidata']) {
        lines.push(`  ${kind}["natural"="water"]["water"~"^(lake|oxbow|lagoon)$"]["${key}"](${bb});`);
        lines.push(`  ${kind}["natural"="water"][!"water"]["${key}"](${bb});`);
      }
    }
    return `${HEAD};\n(\n${lines.join('\n')}\n);\nout tags bb qt;`;
  },
  /** Full geometry of chosen ways and relations, by id, once each. @param {'way' | 'relation'} kind @param {number[]} ids */
  geometry: (kind, ids) => `${HEAD};\n${kind}(id:${ids.join(',')});\nout tags geom qt;`,
  /**
   * The reservoir review list, once: everything tagged as a reservoir. Only those with a name or
   * a Wikidata id (the unnamed ones are farm ponds and never on our lake list anyway).
   * @param {BBox} b
   */
  reservoirs: (b) => {
    const bb = bboxText(b);
    return `${HEAD};\n(\n  nwr["natural"="water"]["water"="reservoir"]["name"](${bb});\n  nwr["natural"="water"]["water"="reservoir"]["wikidata"](${bb});\n`
      + `  nwr["landuse"="reservoir"]["name"](${bb});\n  nwr["landuse"="reservoir"]["wikidata"](${bb});\n);\nout tags bb center qt;`;
  },
};

// ---------------------------------------------------------------------------------------------
// The polite client.

/** This run's traffic, for the report. */
export const traffic = { requests: 0, statusChecks: 0, bytes: 0, cached: 0 };

/** Thrown when a query is too big for the server (timed out or out of memory): split it. */
export class TooBig extends Error {}

const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequest = 0;

/**
 * A GET or POST whose whole exchange (headers and body) is retried when the connection itself
 * fails, e.g. a tunnel through the proxy reset mid-way, with exponential backoff. HTTP errors
 * are returned to the caller, not retried here.
 * @param {string} url @param {RequestInit} init
 * @returns {Promise<{ ok: boolean, status: number, text: string }>}
 */
async function exchange(url, init) {
  let wait = 2000;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, init);
      return { ok: res.ok, status: res.status, text: await res.text() };
    } catch (err) {
      if (attempt >= 6) throw err;
      console.log(`  network error (${err instanceof Error ? err.message : err}): waiting ${wait / 1000} s`);
      await sleep(wait);
      wait *= 2;
    }
  }
}

/**
 * Reads /api/status and waits until one of our slots is free.
 * Its text looks like: "Rate limit: 4", "4 slots available now." or
 * "Slot available after: 2026-10-06T17:00:05Z, in 3 seconds."
 */
async function waitForSlot() {
  for (let tries = 0; tries < 60; tries++) {
    const { ok, text } = await exchange(STATUS_URL, { headers: { 'User-Agent': USER_AGENT } });
    traffic.statusChecks++;
    const free = /(\d+) slots? available now/.exec(text);
    if (ok && free && Number(free[1]) > 0) return;
    const waits = [...text.matchAll(/in (\d+) seconds/g)].map((m) => Number(m[1]));
    await sleep(((waits.length ? Math.min(...waits) : 10) + 1) * 1000);
  }
  throw new Error('Overpass: no free slot after many tries; try again later');
}

/** One POST to the interpreter, after a free slot and a pause. @param {string} query */
async function post(query) {
  await waitForSlot();
  const since = Date.now() - lastRequest;
  if (since < GAP_MS) await sleep(GAP_MS - since);
  lastRequest = Date.now();
  const { status, text } = await exchange(OVERPASS, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  traffic.requests++;
  traffic.bytes += Buffer.byteLength(text);
  return { status, text };
}

// ---------------------------------------------------------------------------------------------
// The cache and its manifest record.

/**
 * @typedef {object} CacheRecord
 * @property {string} sha256 @property {number} bytes @property {string} label
 * @property {string} osmBase @property {string} fetched
 *
 * @typedef {object} OsmManifestEntry
 * @property {string} url @property {string} fetched
 * @property {Record<string, CacheRecord>} files keyed by cache file name
 */

/** @type {OsmManifestEntry | null} */
let record = null;

/** Our manifest entry, from the manifest or (if another tool rewrote it) from our own index. */
async function loadRecord() {
  if (record) return record;
  /** @type {any} */
  let fromManifest = null;
  try { fromManifest = JSON.parse(await readFile(MANIFEST, 'utf8'))[MANIFEST_KEY]; } catch { /* no manifest yet */ }
  /** @type {any} */
  let fromIndex = null;
  try { fromIndex = JSON.parse(await readFile(INDEX, 'utf8')); } catch { /* first run */ }
  record = fromManifest ?? fromIndex ?? { url: OVERPASS, fetched: new Date().toISOString(), files: {} };
  if (fromIndex && fromManifest) record = { ...fromManifest, files: { ...fromIndex.files, ...fromManifest.files } };
  return /** @type {OsmManifestEntry} */ (record);
}

/**
 * Writes our entry back. The manifest is shared with the other map tools (maybe running in
 * another checkout), so re-read it just before writing and change only our own key.
 */
async function saveRecord() {
  if (!record) return;
  await mkdir(OSM_DIR, { recursive: true });
  await writeFile(`${INDEX}.tmp`, `${JSON.stringify(record, null, 1)}\n`);
  await rename(`${INDEX}.tmp`, INDEX);
  /** @type {Record<string, unknown>} */
  let m = {};
  try { m = JSON.parse(await readFile(MANIFEST, 'utf8')); } catch { /* new manifest */ }
  m[MANIFEST_KEY] = record;
  const sorted = Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(`${MANIFEST}.osm.tmp`, `${JSON.stringify(sorted, null, 2)}\n`);
  await rename(`${MANIFEST}.osm.tmp`, MANIFEST);
}

/** The cache file name of a query. @param {string} query */
export const cacheName = (query) => `${sha256(Buffer.from(query, 'utf8')).slice(0, 20)}.json`;

/**
 * Reads a cached answer, checking its fingerprint; null when missing or changed.
 * @param {string} name
 */
export async function readCached(name) {
  const rec = (await loadRecord()).files[name];
  const path = join(OSM_DIR, name);
  if (!rec || !existsSync(path)) return null;
  const text = await readFile(path);
  if (sha256(text) !== rec.sha256) return null;
  return text.toString('utf8');
}

/**
 * Runs one query, from the cache when we have it. Retries 429 and 504 with exponential
 * backoff; turns an Overpass "runtime error" for time or memory into TooBig.
 * @param {string} query @param {string} label
 * @returns {Promise<{ name: string, json: any }>}
 */
export async function overpass(query, label) {
  const name = cacheName(query);
  const cached = await readCached(name);
  if (cached !== null) {
    traffic.cached++;
    return { name, json: JSON.parse(cached) };
  }
  let wait = 30_000;
  let busy = 0;
  for (let attempt = 1; attempt <= 8; attempt++) {
    const started = Date.now();
    const { status, text } = await post(query);
    console.log(`  query ${label}${attempt > 1 ? ` (try ${attempt})` : ''}: HTTP ${status}, ${(text.length / 1e6).toFixed(2)} MB, ${Math.round((Date.now() - started) / 1000)} s`);
    if (status === 200) {
      const json = JSON.parse(text);
      const remark = String(json.remark ?? '');
      if (/runtime error/i.test(remark)) {
        if (/timed out|out of memory/i.test(remark)) throw new TooBig(`${label}: ${remark}`);
        throw new Error(`${label}: ${remark}`);
      }
      await store(name, text, label, json.osm3s?.timestamp_osm_base ?? '');
      return { name, json };
    }
    if (status === 429 || status === 504 || status >= 500) {
      // A 504 also means "your query promises more than the server can admit now": after a few
      // in a row, let the caller split it.
      if (status === 504 && ++busy >= 4) throw new TooBig(`${label}: HTTP 504 four times`);
      console.log(`  waiting ${Math.round(wait / 1000)} s`);
      await sleep(wait);
      wait = Math.min(wait * 2, 600_000);
      continue;
    }
    throw new Error(`${label}: HTTP ${status}: ${text.slice(0, 300)}`);
  }
  throw new Error(`${label}: gave up after 8 tries`);
}

/** Saves an answer and records it. @param {string} name @param {string} text @param {string} label @param {string} osmBase */
async function store(name, text, label, osmBase) {
  await mkdir(OSM_DIR, { recursive: true });
  const bytes = Buffer.from(text, 'utf8');
  await writeFile(join(OSM_DIR, name), bytes);
  const rec = await loadRecord();
  rec.files[name] = { sha256: sha256(bytes), bytes: bytes.length, label, osmBase, fetched: new Date().toISOString() };
  await saveRecord();
}

/**
 * Runs a per-box query, splitting the box into four (up to three times) when it is too big.
 * @param {string} label @param {BBox} box @param {(b: BBox) => string} make
 * @returns {Promise<string[]>} cache file names
 */
async function tiled(label, box, make, depth = 0) {
  try {
    return [(await overpass(make(box), `${label} ${bboxText(box)}`)).name];
  } catch (err) {
    if (!(err instanceof TooBig) || depth >= 3) throw err;
    console.log(`  too big, splitting: ${err.message}`);
    const out = [];
    for (const q of quarters(box)) out.push(...(await tiled(label, q, make, depth + 1)));
    return out;
  }
}

/**
 * Runs a by-id query in batches, halving a batch that is too big.
 * @param {string} label @param {number[]} ids @param {number} size @param {(ids: number[]) => string} make
 * @returns {Promise<string[]>}
 */
async function batched(label, ids, size, make) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) {
    const part = ids.slice(i, i + size);
    try {
      out.push((await overpass(make(part), `${label} ${i + 1}-${i + part.length} of ${ids.length}`)).name);
    } catch (err) {
      if (!(err instanceof TooBig) || part.length === 1) throw err;
      out.push(...(await batched(label, part, Math.ceil(part.length / 2), make)));
    }
  }
  return out;
}

/** Parsed elements of cached answers. @param {string[]} names @returns {Promise<any[]>} */
export async function elementsOf(names) {
  const out = [];
  for (const name of names) {
    const text = await readCached(name);
    if (text === null) throw new Error(`OSM cache file ${name} is missing or changed: run npm run map:osm`);
    out.push(...JSON.parse(text).elements);
  }
  return out;
}

/** The reviewed reservoirs whose geometry we want (to check rivers through them). */
async function reviewedDropIds() {
  if (!existsSync(REVIEW_FILE)) return { way: [], relation: [] };
  const review = JSON.parse(await readFile(REVIEW_FILE, 'utf8'));
  /** @type {{ way: number[], relation: number[] }} */
  const ids = { way: [], relation: [] };
  for (const e of review.reservoirs) {
    if (e.decision !== 'drop') continue;
    for (const id of e.osmIds) {
      const [kind, num] = String(id).split('/');
      if (kind === 'way' || kind === 'relation') ids[kind].push(Number(num));
    }
  }
  ids.way.sort((a, b) => a - b);
  ids.relation.sort((a, b) => a - b);
  return ids;
}

/**
 * @typedef {object} RunFiles which cache files hold what, for build-water.mjs
 * @property {string[]} riverRelations @property {string[]} riverWays @property {string[]} memberWays
 * @property {string[]} lakeBoxes @property {string[]} lakeGeometry @property {string[]} reservoirs
 * @property {string[]} reservoirGeometry
 */

async function main() {
  ensureProxy();
  const window = osmWindow();
  const tiles = tilesOf(window);
  console.log(`window ${bboxText(window)}: ${tiles.length} tiles of ${TILE_DEG}°`);
  /** @type {RunFiles} */
  const files = { riverRelations: [], riverWays: [], memberWays: [], lakeBoxes: [], lakeGeometry: [], reservoirs: [], reservoirGeometry: [] };

  console.log('river relations');
  files.riverRelations = await tiled('river relations', window, QUERIES.riverRelations);
  console.log('river ways');
  for (const t of tiles) files.riverWays.push(...(await tiled('river ways', t, QUERIES.riverWays)));

  // Relation members we do not have yet.
  const have = new Set((await elementsOf(files.riverWays)).map((e) => e.id));
  const wanted = new Set();
  for (const rel of await elementsOf(files.riverRelations)) {
    for (const m of rel.members ?? []) if (m.type === 'way' && !have.has(m.ref)) wanted.add(m.ref);
  }
  const missing = [...wanted].sort((a, b) => a - b);
  console.log(`relation member ways to fetch by id: ${missing.length}`);
  files.memberWays = await batched('member ways', missing, 1000, (ids) => QUERIES.memberWays(window, ids));

  console.log('lake candidates');
  for (const t of tiles) files.lakeBoxes.push(...(await tiled('lake boxes', t, QUERIES.lakeBoxes)));
  /** @type {{ way: Set<number>, relation: Set<number> }} */
  const lakeIds = { way: new Set(), relation: new Set() };
  let seen = 0;
  for (const e of await elementsOf(files.lakeBoxes)) {
    seen++;
    if (e.bounds && lakeCandidateWorthFetching(e.tags ?? {}, e.bounds)) lakeIds[/** @type {'way' | 'relation'} */ (e.type)].add(e.id);
  }
  console.log(`lake candidates: ${seen} answers, fetching ${lakeIds.way.size} ways and ${lakeIds.relation.size} relations`);
  const sortIds = (/** @type {Set<number>} */ s) => [...s].sort((a, b) => a - b);
  files.lakeGeometry.push(...(await batched('lake ways', sortIds(lakeIds.way), 500, (ids) => QUERIES.geometry('way', ids))));
  files.lakeGeometry.push(...(await batched('lake relations', sortIds(lakeIds.relation), 40, (ids) => QUERIES.geometry('relation', ids))));

  console.log('reservoirs');
  files.reservoirs = await tiled('reservoirs', window, QUERIES.reservoirs);
  const drops = await reviewedDropIds();
  files.reservoirGeometry.push(...(await batched('reviewed reservoir ways', drops.way, 200, (ids) => QUERIES.geometry('way', ids))));
  files.reservoirGeometry.push(...(await batched('reviewed reservoir relations', drops.relation, 20, (ids) => QUERIES.geometry('relation', ids))));

  const rec = await loadRecord();
  const used = Object.values(files).flat();
  const bases = used.map((n) => rec.files[n]?.osmBase).filter(Boolean).sort();
  const run = {
    window,
    tiles: tiles.length,
    osmBase: bases[bases.length - 1] ?? '',
    osmBaseOldest: bases[0] ?? '',
    files,
    cacheBytes: used.reduce((sum, n) => sum + (rec.files[n]?.bytes ?? 0), 0),
    cacheFiles: used.length,
  };
  await writeFile(RUN_FILE, `${JSON.stringify(run, null, 1)}\n`);
  console.log(`done: ${traffic.requests} requests (${(traffic.bytes / 1e6).toFixed(1)} MB) and ${traffic.statusChecks} status checks this run, ${traffic.cached} answers from the cache`);
  console.log(`cache: ${run.cacheFiles} files, ${(run.cacheBytes / 1e6).toFixed(1)} MB; OSM data as of ${run.osmBaseOldest} to ${run.osmBase}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

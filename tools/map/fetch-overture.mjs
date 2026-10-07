// @ts-check
// Reads OpenStreetMap's rivers and lakes from the Overture Maps Foundation's official copy on
// AWS S3 (bucket overturemaps-us-west-2, theme=base/type=water, GeoParquet), reading only what
// the map needs: each file's footer, then only the row groups whose bounding-box statistics
// overlap the map window, and in them only the columns we use. Every byte range is cached under
// data/raw/overture/ (git ignores data/raw/) with its SHA-256 and the file's ETag in
// data/raw/manifest.json, so a rerun downloads nothing.
//
//   node tools/map/fetch-overture.mjs            the release recorded in data/raw/overture/run.json,
//                                                or the newest one on the first run
//   node tools/map/fetch-overture.mjs --newest   look for a newer release first
//
// Output (git ignores it): data/raw/overture/<release>/water-rows.ndjson, one JSON row per line,
// with lon/lat geometry, and water-rows.meta.json with the release, the OpenStreetMap snapshot
// dates the rows carry, counts and traffic. tools/map/build-water.mjs builds the map's rivers
// and lakes from it.
//
// Overture's water rows come from OpenStreetMap (ODbL 1.0): what this reads stays ODbL data
// and only ever goes into src/data/odbl/.

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureProxy, getWithRetry, loadManifest, mergeRanges, RAW, saveManifest, sha256, traffic } from './fetch-grids.mjs';
import { columnRows, footerLength, mapRows, parseFooter, readColumnChunk, readWkb } from './parquet.mjs';
import { mapWindow } from './resample.mjs';

export const BUCKET_URL = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com';
export const OVERTURE_DIR = join(RAW, 'overture');
const RUN_FILE = join(OVERTURE_DIR, 'run.json');
const MANIFEST_PREFIX = 'overture-water';
/** The last bytes of a file read in one go: Overture's water footers are about 300 KB. */
const TAIL_BYTES = 1024 * 1024;
/** Column chunks closer than this in one row group are fetched in one request. */
const MERGE_GAP = 64 * 1024;
const MAX_REQUEST = 64 * 1024 * 1024;

/** The subtypes the map may use: rivers (lines), lakes, and reservoirs (to report and leave out). */
export const WANTED_SUBTYPES = ['river', 'lake', 'reservoir', 'water'];
/**
 * A lake or reservoir is only worth reading if its bounding box is at least this big (km²): the
 * smallest lake the map keeps is 0.5 km², and a lake is never bigger than its box.
 */
export const MIN_BOX_KM2 = 0.4;

/** Columns read for every overlapping row group, to choose rows. */
export const SCAN_COLUMNS = ['subtype', 'class', 'bbox.xmin', 'bbox.xmax', 'bbox.ymin', 'bbox.ymax'];
/** Columns read only for row groups with rows we want. */
export const ROW_COLUMNS = [
  'id', 'names.primary', 'names.common.key_value.key', 'names.common.key_value.value', 'wikidata',
  'sources.list.element.record_id', 'sources.list.element.version', 'sources.list.element.license',
  'source_tags.key_value.key', 'source_tags.key_value.value', 'geometry',
];

/** @typedef {{ west: number, east: number, south: number, north: number }} Window */

/** The lon/lat window that holds the whole map rectangle, plus 0.3°. */
export const overtureWindow = () => mapWindow(0.3);

/**
 * Approximate area of a lon/lat box in km².
 * @param {number} xmin @param {number} ymin @param {number} xmax @param {number} ymax
 */
export function boxKm2(xmin, ymin, xmax, ymax) {
  const mid = ((ymin + ymax) / 2) * (Math.PI / 180);
  return Math.max(0, (xmax - xmin) * 111.32 * Math.cos(mid)) * Math.max(0, (ymax - ymin) * 110.57);
}

/** @param {{ xmin: number, xmax: number, ymin: number, ymax: number }} b @param {Window} w */
export const boxOverlaps = (b, w) => b.xmin <= w.east && b.xmax >= w.west && b.ymin <= w.north && b.ymax >= w.south;

/**
 * Whether a row is worth reading in full, from its subtype, class and box.
 * @param {string | null} subtype @param {string | null} cls @param {{ xmin: number, xmax: number, ymin: number, ymax: number }} b @param {Window} w
 */
export function wantedRow(subtype, cls, b, w) {
  if (!subtype || !WANTED_SUBTYPES.includes(subtype) || !boxOverlaps(b, w)) return false;
  if (subtype === 'river') return cls === 'river';
  return boxKm2(b.xmin, b.ymin, b.xmax, b.ymax) >= MIN_BOX_KM2;
}

/**
 * The row group's box from its bbox column statistics, or null when a statistic is missing.
 * @param {import('./parquet.mjs').RowGroup} rg
 */
export function rowGroupBox(rg) {
  const s = (/** @type {string} */ p) => rg.columns.get(p)?.stats ?? null;
  const [x0, x1, y0, y1] = [s('bbox.xmin'), s('bbox.xmax'), s('bbox.ymin'), s('bbox.ymax')];
  if (!x0 || !x1 || !y0 || !y1 || [x0.min, x1.max, y0.min, y1.max].some((v) => typeof v !== 'number')) return null;
  return { xmin: x0.min, xmax: x1.max, ymin: y0.min, ymax: y1.max };
}

// ---------------------------------------------------------------------------------------------
// S3 listing.

/**
 * One ListObjectsV2 listing (all pages): keys with size and ETag, and common prefixes.
 * @param {string} prefix @param {string} [delimiter]
 */
export async function listObjects(prefix, delimiter) {
  /** @type {{ key: string, size: number, etag: string }[]} */
  const objects = [];
  /** @type {string[]} */
  const prefixes = [];
  let token = '';
  do {
    const q = new URLSearchParams({ 'list-type': '2', prefix, ...(delimiter ? { delimiter } : {}), ...(token ? { 'continuation-token': token } : {}) });
    const xml = new TextDecoder().decode((await getWithRetry(`${BUCKET_URL}/?${q}`)).body);
    const parsed = parseListing(xml);
    objects.push(...parsed.objects);
    prefixes.push(...parsed.prefixes);
    token = parsed.next;
  } while (token);
  return { objects, prefixes };
}

/** @param {string} s */
const unescapeXml = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Parses an S3 ListObjectsV2 answer.
 * @param {string} xml
 */
export function parseListing(xml) {
  const tag = (/** @type {string} */ block, /** @type {string} */ name) => unescapeXml(new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)?.[1] ?? '');
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => ({
    key: tag(m[1], 'Key'), size: Number(tag(m[1], 'Size')), etag: tag(m[1], 'ETag').replace(/"/g, ''),
  }));
  const prefixes = [...xml.matchAll(/<CommonPrefixes>\s*<Prefix>([^<]*)<\/Prefix>/g)].map((m) => unescapeXml(m[1]));
  const truncated = tag(xml, 'IsTruncated') === 'true';
  return { objects, prefixes, next: truncated ? tag(xml, 'NextContinuationToken') : '' };
}

/**
 * The newest release name from prefixes like "release/2026-09-23.1/": by date, then by the
 * number after the dot.
 * @param {string[]} prefixes
 */
export function newestRelease(prefixes) {
  const names = prefixes.map((p) => /^release\/(\d{4}-\d{2}-\d{2})\.(\d+)\/$/.exec(p)).filter((m) => m !== null);
  if (!names.length) throw new Error('no releases found under release/');
  names.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : Number(a[2]) - Number(b[2])));
  const last = names[names.length - 1];
  return `${last[1]}.${last[2]}`;
}

// ---------------------------------------------------------------------------------------------
// Cached byte ranges.

/**
 * A remote Parquet file, read by cached byte ranges.
 * @param {string} release @param {{ key: string, size: number, etag: string }} obj
 */
export async function remoteFile(release, obj) {
  const manifest = await loadManifest();
  const name = obj.key.split('/').pop() ?? obj.key;
  const mkey = `${MANIFEST_PREFIX}/${release}/${name}`;
  const url = `${BUCKET_URL}/${obj.key}`;
  const dir = join(OVERTURE_DIR, release, name.replace(/\.parquet$/, ''));
  if (manifest[mkey]?.etag !== obj.etag) manifest[mkey] = { url, etag: obj.etag, bytes: obj.size, fetched: new Date().toISOString(), windows: {} };
  const entry = manifest[mkey];
  const windows = /** @type {Record<string, string>} */ (entry.windows ??= {});

  /** Cached windows as [offset, length]. */
  const known = () => Object.keys(windows).map((k) => k.split('+').map(Number));
  /** Windows already read and checked in this run: a row group's columns share one window. */
  /** @type {Map<string, Uint8Array>} */
  const recent = new Map();
  /** @param {string} k @param {Uint8Array} data */
  const remember = (k, data) => {
    recent.set(k, data);
    if (recent.size > 3) recent.delete(/** @type {string} */ (recent.keys().next().value));
  };

  /** @param {number} offset @param {number} length */
  const fetchWindow = async (offset, length) => {
    const { body, headers } = await getWithRetry(url, { offset, length });
    const etag = (headers.get('etag') ?? '').replace(/"/g, '');
    if (etag && etag !== obj.etag) throw new Error(`${obj.key} changed while being read (ETag ${obj.etag} is now ${etag})`);
    const path = join(dir, `${offset}+${length}.bin`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(`${path}.tmp`, body);
    await rename(`${path}.tmp`, path);
    windows[`${offset}+${length}`] = sha256(body);
    remember(`${offset}+${length}`, body);
    return body;
  };

  return {
    name,
    size: obj.size,
    /**
     * The bytes [offset, offset + length), from a cached window that holds them (checked
     * against its SHA-256), else from the network.
     * @param {number} offset @param {number} length
     */
    async read(offset, length) {
      for (const [o, l] of known()) {
        if (offset < o || offset + length > o + l) continue;
        const k = `${o}+${l}`;
        const hot = recent.get(k);
        if (hot) return hot.subarray(offset - o, offset - o + length);
        const path = join(dir, `${k}.bin`);
        if (!existsSync(path)) continue;
        const data = new Uint8Array(await readFile(path));
        if (data.length === l && sha256(data) === windows[k]) {
          remember(k, data);
          return data.subarray(offset - o, offset - o + length);
        }
      }
      return fetchWindow(offset, length);
    },
    /**
     * Fetches the ranges not cached yet, merging close ones into one request.
     * @param {{ offset: number, length: number }[]} ranges
     */
    async prefetch(ranges) {
      const have = known();
      const missing = ranges.filter((r) => !have.some(([o, l]) => r.offset >= o && r.offset + r.length <= o + l
        && existsSync(join(dir, `${o}+${l}.bin`))));
      await Promise.all(mergeRanges(missing, MERGE_GAP, MAX_REQUEST).map((r) => fetchWindow(r.offset, r.length)));
      await saveManifest();
    },
  };
}

/**
 * Reads and parses a file's footer, with one request for the last megabyte (more if needed).
 * @param {Awaited<ReturnType<typeof remoteFile>>} file
 */
export async function readFooter(file) {
  const tailLen = Math.min(TAIL_BYTES, file.size);
  const tail = await file.read(file.size - tailLen, tailLen);
  const len = footerLength(tail.subarray(tail.length - 8));
  const bytes = len + 8 <= tail.length ? tail.subarray(tail.length - 8 - len, tail.length - 8) : await file.read(file.size - 8 - len, len);
  return parseFooter(bytes);
}

// ---------------------------------------------------------------------------------------------
// Rows.

/**
 * Reads some columns of one row group, each as one entry per row.
 * @param {Awaited<ReturnType<typeof remoteFile>>} file @param {import('./parquet.mjs').Footer} footer
 * @param {import('./parquet.mjs').RowGroup} rg @param {string[]} paths
 * @returns {Promise<Record<string, any[]>>}
 */
async function readColumns(file, footer, rg, paths) {
  const chunks = paths.map((p) => {
    const c = rg.columns.get(p);
    if (!c) throw new Error(`${file.name}: no column ${p}`);
    return c;
  });
  await file.prefetch(chunks.map((c) => ({ offset: c.start, length: c.length })));
  /** @type {Record<string, any[]>} */
  const out = {};
  for (const c of chunks) {
    const leaf = /** @type {import('./parquet.mjs').Leaf} */ (footer.leaves.get(c.path));
    out[c.path] = columnRows(readColumnChunk(await file.read(c.start, c.length), c, leaf), leaf);
  }
  return out;
}

/** Rounds lon/lat to 1e-7° (about 1 cm, OpenStreetMap's own precision). @param {number[]} flat */
const round7 = (flat) => flat.map((v) => Math.round(v * 1e7) / 1e7);

/** @param {import('./parquet.mjs').Geometry} g */
function roundGeometry(g) {
  switch (g.type) {
    case 'Point': return { type: g.type, point: round7(g.point) };
    case 'LineString': return { type: g.type, line: round7(g.line) };
    case 'Polygon': return { type: g.type, rings: g.rings.map(round7) };
    case 'MultiPoint': return { type: g.type, points: g.points.map(round7) };
    case 'MultiLineString': return { type: g.type, lines: g.lines.map(round7) };
    default: return { type: g.type, polygons: g.polygons.map((p) => p.map(round7)) };
  }
}

/**
 * @typedef {object} WaterRow one Overture water row, as written to water-rows.ndjson
 * @property {string} id GERS id @property {string} subtype @property {string} class
 * @property {string} name names.primary ('' if none) @property {Record<string, string>} common names.common
 * @property {string | null} wikidata @property {string[]} osm OSM ids from sources[].record_id, e.g. "w123@4"
 * @property {Record<string, string>} tags source_tags (the raw OSM tags Overture keeps)
 * @property {number[]} bbox [xmin, ymin, xmax, ymax]
 * @property {any} geometry lon/lat, see parquet.mjs Geometry
 */

/**
 * The wanted rows of one row group.
 * @param {Awaited<ReturnType<typeof remoteFile>>} file @param {import('./parquet.mjs').Footer} footer
 * @param {import('./parquet.mjs').RowGroup} rg @param {Window} w
 * @param {{ versions: Map<string, number>, licences: Map<string, number>, scanned: Map<string, number> }} tally
 * @returns {Promise<WaterRow[]>}
 */
async function rowGroupRows(file, footer, rg, w, tally) {
  const scan = await readColumns(file, footer, rg, SCAN_COLUMNS);
  /** @type {number[]} */
  const wanted = [];
  for (let i = 0; i < rg.numRows; i++) {
    const b = { xmin: scan['bbox.xmin'][i], xmax: scan['bbox.xmax'][i], ymin: scan['bbox.ymin'][i], ymax: scan['bbox.ymax'][i] };
    if (!boxOverlaps(b, w)) continue;
    const key = `${scan.subtype[i]}/${scan.class[i]}`;
    tally.scanned.set(key, (tally.scanned.get(key) ?? 0) + 1);
    if (wantedRow(scan.subtype[i], scan.class[i], b, w)) wanted.push(i);
  }
  if (!wanted.length) return [];
  const cols = await readColumns(file, footer, rg, ROW_COLUMNS);
  const common = mapRows(cols['names.common.key_value.key'], cols['names.common.key_value.value']);
  const tags = mapRows(cols['source_tags.key_value.key'], cols['source_tags.key_value.value']);
  return wanted.map((i) => {
    for (const v of cols['sources.list.element.version'][i] ?? []) if (v) tally.versions.set(v, (tally.versions.get(v) ?? 0) + 1);
    for (const v of cols['sources.list.element.license'][i] ?? []) if (v) tally.licences.set(v, (tally.licences.get(v) ?? 0) + 1);
    const geom = cols.geometry[i];
    return {
      id: cols.id[i],
      subtype: scan.subtype[i],
      class: scan.class[i],
      name: cols['names.primary'][i] ?? '',
      common: common[i] ?? {},
      wikidata: cols.wikidata[i],
      osm: (cols['sources.list.element.record_id'][i] ?? []).filter(Boolean),
      tags: tags[i] ?? {},
      bbox: [scan['bbox.xmin'][i], scan['bbox.ymin'][i], scan['bbox.xmax'][i], scan['bbox.ymax'][i]],
      geometry: geom ? roundGeometry(readWkb(geom)) : null,
    };
  });
}

// ---------------------------------------------------------------------------------------------

/** The release to read: the recorded one, or the newest when asked or on the first run. @param {boolean} newest */
async function chooseRelease(newest) {
  if (!newest && existsSync(RUN_FILE)) return JSON.parse(await readFile(RUN_FILE, 'utf8'));
  const { prefixes } = await listObjects('release/', '/');
  const release = newestRelease(prefixes);
  const { objects } = await listObjects(`release/${release}/theme=base/type=water/`);
  const files = objects.filter((o) => o.key.endsWith('.parquet')).sort((a, b) => (a.key < b.key ? -1 : 1));
  if (!files.length) throw new Error(`release ${release} has no water files`);
  const run = { release, listed: new Date().toISOString(), files };
  await mkdir(OVERTURE_DIR, { recursive: true });
  await writeFile(RUN_FILE, `${JSON.stringify(run, null, 1)}\n`);
  return run;
}

/** @param {number} bytes */
const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

async function main() {
  ensureProxy();
  const run = await chooseRelease(process.argv.includes('--newest'));
  const w = overtureWindow();
  console.log(`Overture release ${run.release}: ${run.files.length} water files; window ${w.west.toFixed(2)}-${w.east.toFixed(2)}°E, ${w.south.toFixed(2)}-${w.north.toFixed(2)}°N`);
  const outDir = join(OVERTURE_DIR, run.release);
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, 'water-rows.ndjson');
  /** @type {string[]} */
  const lines = [];
  const tally = { versions: new Map(), licences: new Map(), scanned: new Map() };
  let groups = 0; let groupsTotal = 0;
  /** @type {Record<string, number>} */
  const rowsBySubtype = {};
  // A few files at a time: each one's requests also run a few at a time (fetch-grids' limit).
  const queue = [...run.files];
  const worker = async () => {
    for (let obj = queue.shift(); obj; obj = queue.shift()) {
      const file = await remoteFile(run.release, obj);
      const footer = await readFooter(file);
      groupsTotal += footer.rowGroups.length;
      for (const rg of footer.rowGroups) {
        const box = rowGroupBox(rg);
        if (box && !boxOverlaps(box, w)) continue;
        groups++;
        for (const row of await rowGroupRows(file, footer, rg, w, tally)) {
          rowsBySubtype[row.subtype] = (rowsBySubtype[row.subtype] ?? 0) + 1;
          lines.push(JSON.stringify(row));
        }
      }
      await saveManifest();
      console.log(`  ${file.name.slice(0, 10)}: ${footer.rowGroups.length} row groups; so far ${lines.length} rows, ${traffic.requests} requests, ${mb(traffic.bytes)}`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  // Same order on every run, whatever order the files finished in.
  lines.sort();
  await writeFile(`${outPath}.tmp`, `${lines.join('\n')}\n`);
  await rename(`${outPath}.tmp`, outPath);
  const meta = {
    release: run.release,
    bucket: BUCKET_URL,
    prefix: `release/${run.release}/theme=base/type=water/`,
    listed: run.listed,
    window: w,
    files: run.files.length,
    rowGroupsRead: groups,
    rowGroupsInRelease: groupsTotal,
    rows: lines.length,
    rowsBySubtype,
    osmSnapshots: Object.fromEntries([...tally.versions.entries()].sort()),
    licences: Object.fromEntries(tally.licences),
    subtypeClassInWindow: Object.fromEntries([...tally.scanned.entries()].sort((a, b) => b[1] - a[1])),
    lastRun: { requests: traffic.requests, bytes: traffic.bytes },
  };
  await writeFile(join(outDir, 'water-rows.meta.json'), `${JSON.stringify(meta, null, 1)}\n`);
  console.log(`${lines.length} rows (${JSON.stringify(rowsBySubtype)}) from ${groups} of ${groupsTotal} row groups`);
  console.log(`OSM snapshot(s): ${JSON.stringify(meta.osmSnapshots)}; licences ${JSON.stringify(meta.licences)}`);
  console.log(`this run: ${traffic.requests} requests, ${mb(traffic.bytes)} downloaded`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

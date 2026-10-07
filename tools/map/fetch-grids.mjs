// @ts-check
// Network side of the grid pipeline: reads parts of big remote files (GEBCO, GLWD, WorldCover)
// by HTTP range requests, with retries, a small concurrency limit and an on-disk cache under
// data/raw/cache/ (git ignores data/raw/), so a second run downloads nothing. Every file read is
// recorded in data/raw/manifest.json: its url, S3 version and ETag, total size, the date, and
// the SHA-256 of each cached window.
//
// The cached windows are raw pieces of the source files. They stay on this machine: GLWD's
// authors ask that their data is not put back online in its original form, so only derived
// grids may ever be committed.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** data/raw/: everything downloaded, and everything derived from it. Git ignores it. */
export const RAW = join(fileURLToPath(new URL('../..', import.meta.url)), 'data', 'raw');
const MANIFEST = join(RAW, 'manifest.json');
const CACHE = join(RAW, 'cache');

/** Requests in flight at once: polite to the hosts, enough to fill the line. */
const CONCURRENCY = 6;
const RETRIES = 6;
/** Nearby blocks closer than this are fetched in one request (the gap is wasted, but cheap). */
const MERGE_GAP = 256 * 1024;
/** No single request bigger than this, so a retry never repeats much. A host that drops long
 * transfers (CEDA) is given a smaller limit through rangeSource's maxChunk. */
const MAX_CHUNK = 16 * 1024 * 1024;

/**
 * Node's fetch only uses the HTTPS_PROXY variable when started with --use-env-proxy (or
 * NODE_USE_ENV_PROXY=1). If a proxy is set and this process was started without it, run the
 * same command again with it and exit with its result. Call this first in a tool's main().
 */
export function ensureProxy() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  const enabled = process.env.NODE_USE_ENV_PROXY === '1' || process.execArgv.includes('--use-env-proxy');
  if (!proxy || enabled) return;
  const result = spawnSync(process.execPath, ['--use-env-proxy', '--disable-warning=UNDICI-EHPA', ...process.execArgv, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(result.status ?? 1);
}

/** @param {Uint8Array} data */
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// ---------------------------------------------------------------------------------------------
// The manifest: one shared copy in memory, written back after each file.

/**
 * @typedef {object} ManifestEntry
 * @property {string} url
 * @property {string} [versionId]  the S3 object version, when the host gives one
 * @property {string} [etag]
 * @property {number} [bytes]      the whole file's size
 * @property {string} [sha256]     for files downloaded whole
 * @property {string} fetched      when first fetched (ISO date)
 * @property {Record<string, string>} [windows] "offset+length" to SHA-256, for files read by range
 * @property {Record<string, string>} [pixelWindows] "x<col>+y<row> <width>x<height>" to the SHA-256
 *   of that block of decoded samples (written by compare-gebco.mjs)
 */

/** @type {Record<string, ManifestEntry> | null} */
let manifest = null;
let writing = Promise.resolve();

/** @returns {Promise<Record<string, ManifestEntry>>} */
export async function loadManifest() {
  if (!manifest) {
    try { manifest = JSON.parse(await readFile(MANIFEST, 'utf8')); } catch { manifest = {}; }
  }
  return /** @type {Record<string, ManifestEntry>} */ (manifest);
}

/** Writes the manifest (sorted, so diffs stay small), one write at a time. */
export function saveManifest() {
  writing = writing.then(async () => {
    if (!manifest) return;
    const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
    await mkdir(RAW, { recursive: true });
    await writeFile(`${MANIFEST}.tmp`, `${JSON.stringify(sorted, null, 2)}\n`);
    await rename(`${MANIFEST}.tmp`, MANIFEST);
  });
  return writing;
}

// ---------------------------------------------------------------------------------------------
// Requests: a limit on how many run at once, and retries with exponential backoff.

let active = 0;
/** @type {(() => void)[]} */
const waiting = [];

/** @template T @param {() => Promise<T>} job @returns {Promise<T>} */
async function limited(job) {
  if (active >= CONCURRENCY) await new Promise((resolve) => waiting.push(() => resolve(undefined)));
  active++;
  try {
    return await job();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Bytes downloaded by this process, for the end-of-run report. */
export const traffic = { bytes: 0, requests: 0 };

class HttpError extends Error {
  /** @param {number} status @param {string} url */
  constructor(status, url) {
    super(`HTTP ${status} from ${url}`);
    this.status = status;
  }
}

/**
 * GETs a URL (optionally one byte range) with retries. Client errors other than 429 are not
 * retried: they will not get better. A range answer that is not exactly the bytes asked for
 * (a cut-off transfer, or the wrong place in the file) is retried, never returned.
 * @param {string} url @param {{ offset: number, length: number }} [range]
 */
export async function getWithRetry(url, range) {
  let wait = 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await limited(async () => {
        const headers = range ? { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` } : undefined;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new HttpError(res.status, url);
        if (range && res.status !== 206) throw new Error(`${url} ignored the range request (status ${res.status})`);
        const body = new Uint8Array(await res.arrayBuffer());
        traffic.bytes += body.length;
        traffic.requests++;
        if (range) checkRangeAnswer(url, range, res.headers.get('content-range'), body.length);
        return { body, headers: res.headers };
      });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 0;
      const permanent = status >= 400 && status < 500 && status !== 429;
      if (permanent || attempt >= RETRIES) throw err;
      // Backoff with jitter (build tool only: the game itself never uses Math.random).
      await new Promise((resolve) => setTimeout(resolve, wait * (0.75 + Math.random() / 2)));
      wait *= 2;
    }
  }
}

/**
 * Throws unless a range answer holds exactly the bytes asked for: it must start at the offset
 * asked for, and be as long as asked, or run to the end of the file. A short body would
 * otherwise be cached, hashed and trusted on every later run.
 * @param {string} url @param {{ offset: number, length: number }} range
 * @param {string | null} contentRange the Content-Range header, e.g. "bytes 0-65535/3286944666"
 * @param {number} got bytes in the body
 */
export function checkRangeAnswer(url, range, contentRange, got) {
  const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec((contentRange ?? '').trim());
  if (!m) throw new Error(`${url}: range answer without a usable Content-Range (${contentRange})`);
  const [start, last] = [Number(m[1]), Number(m[2])];
  const total = m[3] === '*' ? Infinity : Number(m[3]);
  const want = Math.min(range.offset + range.length, total) - range.offset;
  if (start !== range.offset || last - start + 1 !== want || got !== want) {
    throw new Error(`${url}: asked for ${want} bytes at ${range.offset}, got ${got} bytes (${contentRange})`);
  }
}

// ---------------------------------------------------------------------------------------------
// Whole small files (licences, legends, CSV tables).

/**
 * Downloads a whole file into data/raw/<file> unless the copy there matches the manifest.
 * @param {string} key manifest key, e.g. "spatiocompo-tw4/README.md"
 * @param {string} url @param {string} file path under data/raw/
 * @returns {Promise<Uint8Array>}
 */
export async function fetchWhole(key, url, file) {
  const m = await loadManifest();
  const path = join(RAW, file);
  const known = m[key];
  if (known?.sha256 && known.url === url) {
    try {
      const data = new Uint8Array(await readFile(path));
      if (sha256(data) === known.sha256) return data;
    } catch { /* not here yet */ }
  }
  const { body, headers } = await getWithRetry(url);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  m[key] = { url, sha256: sha256(body), bytes: body.length, fetched: new Date().toISOString(), ...s3Version(headers) };
  await saveManifest();
  console.log(`got   ${key} (${(body.length / 1024).toFixed(0)} KB)`);
  return body;
}

/** The S3 version and ETag of a response, when given. @param {Headers} h */
function s3Version(h) {
  /** @type {{ versionId?: string, etag?: string }} */
  const out = {};
  const v = h.get('x-amz-version-id');
  const e = h.get('etag');
  if (v && v !== 'null') out.versionId = v;
  if (e) out.etag = e.replace(/"/g, '');
  return out;
}

// ---------------------------------------------------------------------------------------------
// Big files read by range.

/**
 * A ByteSource (see tiff.mjs) for a remote file, cached on disk window by window. Returns null
 * only when the host answers 404 (no such file). That is not recorded: a rerun asks again, so a
 * passing fault can never blank a file for good. Any other failure, 403 included (a proxy
 * denial or a passing AccessDenied), throws.
 * @param {string} key manifest key, e.g. "gebco-2026/GEBCO_2026.tif"
 * @param {string} url
 * @param {{ maxChunk?: number }} [opts] maxChunk: the largest single request, in bytes
 * @returns {Promise<import('./tiff.mjs').ByteSource & { key: string } | null>}
 */
export async function rangeSource(key, url, opts = {}) {
  const maxChunk = opts.maxChunk ?? MAX_CHUNK;
  const m = await loadManifest();
  const dir = join(CACHE, ...key.split('/'));
  if (m[key]?.url !== url) m[key] = { url, fetched: new Date().toISOString(), windows: {} };
  const entry = m[key];
  // Older manifests recorded 404s and 403s for good (missing: true): drop that and ask again.
  delete /** @type {ManifestEntry & { missing?: boolean }} */ (entry).missing;
  entry.windows ??= {};
  const windows = entry.windows;

  /** Loaded windows, kept in memory while this file is being read. */
  /** @type {{ offset: number, data: Uint8Array }[]} */
  const chunks = [];

  /** @param {number} offset @param {number} length */
  const inMemory = (offset, length) => {
    for (const c of chunks) {
      if (offset >= c.offset && offset + length <= c.offset + c.data.length) return c.data.subarray(offset - c.offset, offset - c.offset + length);
    }
    return null;
  };

  /** Loads one window from the disk cache, or from the network into the cache. @param {number} offset @param {number} length */
  const load = async (offset, length) => {
    const name = `${offset}+${length}`;
    const path = join(dir, `${name}.bin`);
    const want = windows[name];
    const end = entry.bytes ? Math.min(entry.bytes, offset + length) : offset + length;
    if (want) {
      try {
        const data = new Uint8Array(await readFile(path));
        // The size check also catches a short window cached by an older version of this tool.
        if (data.length === end - offset && sha256(data) === want) { chunks.push({ offset, data }); return data; }
      } catch { /* not cached: fetch it */ }
    }
    const { body, headers } = await getWithRetry(url, { offset, length: end - offset });
    checkSameFile(entry, headers, url);
    await mkdir(dir, { recursive: true });
    await writeFile(path, body);
    windows[name] = sha256(body);
    chunks.push({ offset, data: body });
    return body;
  };

  // Learn the file's size and version from its first bytes (the TIFF header lives there).
  try {
    await load(0, 65536);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      if (!Object.keys(windows).length) delete m[key];
      return null;
    }
    throw err;
  }

  return {
    key,
    async read(offset, length) {
      return inMemory(offset, length) ?? (await load(offset, length));
    },
    async prefetch(ranges) {
      const todo = mergeRanges(ranges.filter((r) => !inMemory(r.offset, r.length)), MERGE_GAP, maxChunk);
      await Promise.all(todo.map((r) => load(r.offset, r.length)));
      await saveManifest();
    },
  };
}

/**
 * Stops if the remote file changed while we were caching pieces of it: mixing pieces of two
 * versions would give nonsense.
 * @param {ManifestEntry} entry @param {Headers} h @param {string} url
 */
function checkSameFile(entry, h, url) {
  const { versionId, etag } = s3Version(h);
  const total = Number((h.get('content-range') ?? '').split('/')[1]);
  if (entry.etag && etag && entry.etag !== etag) {
    throw new Error(`${url} changed since it was first cached (ETag ${entry.etag} is now ${etag}): delete its cache to start again`);
  }
  if (etag) entry.etag = etag;
  if (versionId) entry.versionId = versionId;
  if (total > 0) entry.bytes = total;
}

/**
 * Sorts byte ranges and merges those that overlap or lie close together, so a row of tiles
 * comes in one request.
 * @param {{ offset: number, length: number }[]} ranges @param {number} gap @param {number} maxLength
 */
export function mergeRanges(ranges, gap, maxLength) {
  const sorted = [...ranges].filter((r) => r.length > 0).sort((a, b) => a.offset - b.offset);
  /** @type {{ offset: number, length: number }[]} */
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    const end = r.offset + r.length;
    if (last && r.offset <= last.offset + last.length + gap && end - last.offset <= maxLength) {
      last.length = Math.max(last.length, end - last.offset);
    } else {
      out.push({ offset: r.offset, length: r.length });
    }
  }
  return out;
}

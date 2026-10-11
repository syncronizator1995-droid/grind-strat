// @ts-check
// A small Parquet reader for exactly what Overture Maps' files use, so the map tools need no
// dependency (Apache Parquet format: github.com/apache/parquet-format, Thrift definitions in
// src/main/thrift/parquet.thrift). Pure functions on bytes: tools/map/fetch-overture.mjs does
// the downloading and caching.
//
// Supported, and nothing else (anything else throws, naming what it met):
//   - the footer (FileMetaData), in the Thrift compact protocol;
//   - row groups and column chunk metadata, with min/max statistics;
//   - data pages v1 and v2 and dictionary pages;
//   - values PLAIN, PLAIN_DICTIONARY / RLE_DICTIONARY, and RLE for booleans;
//   - levels and dictionary indices in the RLE / bit-packed hybrid;
//   - compression ZSTD (zlib.zstdDecompressSync, built into Node 22), GZIP and none;
//   - columns at most one level of repetition deep (a list, a map, a list of structs);
//   - geometry in WKB (2D Point, LineString, Polygon and their Multi* forms).

import { gunzipSync, zstdDecompressSync } from 'node:zlib';

// ---------------------------------------------------------------------------------------------
// Thrift compact protocol.

/** @typedef {{ [field: number]: any }} ThriftStruct fields by their numeric id */

/**
 * Reads one Thrift compact-protocol struct. Fields come back by number; i64 values come back as
 * numbers when they fit exactly (file offsets and counts always do), else as bigint.
 * @param {Uint8Array} buf @param {number} [start]
 * @returns {{ value: ThriftStruct, end: number }}
 */
export function readThrift(buf, start = 0) {
  let p = start;
  const byte = () => {
    if (p >= buf.length) throw new Error('Thrift: ran past the end of the bytes');
    return buf[p++];
  };
  const varint = () => {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const b = byte();
      result |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return result;
      shift += 7n;
    }
  };
  const zigzag = () => {
    const v = varint();
    const n = (v >> 1n) ^ -(v & 1n);
    return Number.isSafeInteger(Number(n)) ? Number(n) : n;
  };
  /** @param {number} type @returns {any} */
  const value = (type) => {
    switch (type) {
      case 1: return true;
      case 2: return false;
      case 3: { const b = byte(); return b > 127 ? b - 256 : b; }
      case 4: case 5: case 6: return zigzag();
      case 7: {
        if (p + 8 > buf.length) throw new Error('Thrift: ran past the end of the bytes');
        const v = new DataView(buf.buffer, buf.byteOffset + p, 8).getFloat64(0, true);
        p += 8;
        return v;
      }
      case 8: {
        const n = Number(varint());
        if (p + n > buf.length) throw new Error('Thrift: ran past the end of the bytes');
        const s = buf.subarray(p, p + n);
        p += n;
        return s;
      }
      case 9: case 10: {
        const h = byte();
        let n = h >> 4;
        const et = h & 15;
        if (n === 15) n = Number(varint());
        const out = [];
        // Booleans inside a list are one byte each: 1 is true.
        for (let i = 0; i < n; i++) out.push(et === 1 || et === 2 ? byte() === 1 : value(et));
        return out;
      }
      case 11: {
        const n = Number(varint());
        const out = new Map();
        if (!n) return out;
        const kv = byte();
        for (let i = 0; i < n; i++) out.set(value(kv >> 4), value(kv & 15));
        return out;
      }
      case 12: return struct();
      default: throw new Error(`Thrift: unknown type ${type} at byte ${p - 1}`);
    }
  };
  /** @returns {ThriftStruct} */
  const struct = () => {
    /** @type {ThriftStruct} */
    const out = {};
    let last = 0;
    for (;;) {
      const h = byte();
      if (h === 0) return out;
      const type = h & 15;
      const delta = h >> 4;
      const id = delta ? last + delta : Number(zigzag());
      last = id;
      out[id] = value(type);
    }
  };
  const v = struct();
  return { value: v, end: p };
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
/** @param {Uint8Array | undefined} b */
const text = (b) => (b ? utf8.decode(b) : '');

// ---------------------------------------------------------------------------------------------
// The footer.

export const MAGIC = 'PAR1';
const TYPES = ['BOOLEAN', 'INT32', 'INT64', 'INT96', 'FLOAT', 'DOUBLE', 'BYTE_ARRAY', 'FIXED_LEN_BYTE_ARRAY'];
const CODECS = ['UNCOMPRESSED', 'SNAPPY', 'GZIP', 'LZO', 'BROTLI', 'LZ4', 'ZSTD', 'LZ4_RAW'];

/**
 * @typedef {object} Leaf a column of values: a leaf of the schema tree
 * @property {string} path dotted, e.g. "names.common.key_value.key"
 * @property {string} type physical type, e.g. "BYTE_ARRAY"
 * @property {boolean} isText the bytes are UTF-8 text (STRING logical type or UTF8)
 * @property {number} maxDef @property {number} maxRep
 * @property {number} repDef the definition level at which a repeated item exists (0 if none)
 *
 * @typedef {object} ColumnChunk
 * @property {string} path @property {string} type @property {string} codec
 * @property {number} start where the chunk's first page starts in the file
 * @property {number} length the chunk's compressed size in bytes
 * @property {number} numValues
 * @property {{ min: any, max: any, nullCount: number | null } | null} stats
 *
 * @typedef {object} RowGroup
 * @property {number} numRows @property {Map<string, ColumnChunk>} columns by path
 *
 * @typedef {object} Footer
 * @property {number} numRows @property {Map<string, Leaf>} leaves by path
 * @property {RowGroup[]} rowGroups @property {Record<string, string>} keyValue
 * @property {string} createdBy
 */

/**
 * The footer's length, from the file's last 8 bytes (4-byte length, then "PAR1").
 * @param {Uint8Array} last8
 */
export function footerLength(last8) {
  if (last8.length !== 8 || text(last8.subarray(4)) !== MAGIC) throw new Error('not a Parquet file (no PAR1 at the end)');
  return new DataView(last8.buffer, last8.byteOffset, 8).getUint32(0, true);
}

/**
 * Parses the footer: the Thrift FileMetaData (without the trailing length and magic).
 * @param {Uint8Array} bytes
 * @returns {Footer}
 */
export function parseFooter(bytes) {
  const meta = readThrift(bytes).value;
  const leaves = schemaLeaves(meta[2] ?? []);
  /** @type {Record<string, string>} */
  const keyValue = {};
  for (const kv of meta[5] ?? []) keyValue[text(kv[1])] = text(kv[2]);
  const rowGroups = (meta[4] ?? []).map((/** @type {ThriftStruct} */ rg) => {
    /** @type {Map<string, ColumnChunk>} */
    const columns = new Map();
    for (const cc of rg[1] ?? []) {
      if (cc[1]) throw new Error('column chunks in another file are not supported');
      const chunk = columnChunk(cc[3], leaves);
      columns.set(chunk.path, chunk);
    }
    return { numRows: Number(rg[3]), columns };
  });
  return { numRows: Number(meta[3]), leaves, rowGroups, keyValue, createdBy: text(meta[6]) };
}

/**
 * Walks the flattened schema (depth-first, each group followed by its children) and gives each
 * leaf its path and its maximum definition and repetition levels.
 * @param {ThriftStruct[]} elements
 */
function schemaLeaves(elements) {
  /** @type {Map<string, Leaf>} */
  const leaves = new Map();
  let i = 0;
  /** @param {string[]} path @param {number} def @param {number} rep @param {number} repDef @param {boolean} root */
  const walk = (path, def, rep, repDef, root) => {
    const e = elements[i++];
    if (!e) throw new Error('Parquet schema ends early');
    const name = text(e[4]);
    const repetition = root ? 0 : e[3] ?? 0;
    const d = def + (repetition === 0 ? 0 : 1);
    const r = rep + (repetition === 2 ? 1 : 0);
    const rd = repetition === 2 ? d : repDef;
    const p = root ? [] : [...path, name];
    if (e[5]) {
      for (let k = 0; k < e[5]; k++) walk(p, d, r, rd, false);
      return;
    }
    const type = TYPES[e[1]] ?? `type ${e[1]}`;
    const logical = e[10] ?? {};
    leaves.set(p.join('.'), { path: p.join('.'), type, isText: type === 'BYTE_ARRAY' && (logical[1] !== undefined || e[6] === 0), maxDef: d, maxRep: r, repDef: rd });
  };
  if (elements.length) walk([], 0, 0, 0, true);
  return leaves;
}

/** @param {ThriftStruct} md ColumnMetaData @param {Map<string, Leaf>} leaves @returns {ColumnChunk} */
function columnChunk(md, leaves) {
  const path = (md[3] ?? []).map(text).join('.');
  const leaf = leaves.get(path);
  if (!leaf) throw new Error(`column ${path} is not in the schema`);
  const dataStart = Number(md[9]);
  // Some writers put 0 here for "no dictionary": a dictionary always comes before the data.
  const dictStart = md[11] !== undefined && Number(md[11]) > 0 && Number(md[11]) < dataStart ? Number(md[11]) : dataStart;
  const st = md[12];
  return {
    path,
    type: TYPES[md[1]] ?? `type ${md[1]}`,
    codec: CODECS[md[4]] ?? `codec ${md[4]}`,
    start: dictStart,
    length: Number(md[7]),
    numValues: Number(md[5]),
    stats: st ? { min: statValue(st[6] ?? st[2], leaf), max: statValue(st[5] ?? st[1], leaf), nullCount: st[3] === undefined ? null : Number(st[3]) } : null,
  };
}

/** A statistics bound in its plain form. @param {Uint8Array | undefined} b @param {Leaf} leaf */
function statValue(b, leaf) {
  if (!b) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.length);
  switch (leaf.type) {
    case 'DOUBLE': return view.getFloat64(0, true);
    case 'FLOAT': return view.getFloat32(0, true);
    case 'INT32': return view.getInt32(0, true);
    case 'INT64': return Number(view.getBigInt64(0, true));
    case 'BOOLEAN': return b[0] === 1;
    default: return leaf.isText ? text(b) : b;
  }
}

// ---------------------------------------------------------------------------------------------
// Levels and indices: the RLE / bit-packed hybrid.

/** Bits needed for values up to max. @param {number} max */
export const bitWidth = (max) => (max ? 32 - Math.clz32(max) : 0);

/**
 * Decodes the RLE / bit-packed hybrid into `count` values.
 * @param {Uint8Array} buf @param {number} start @param {number} end @param {number} width bits per value
 * @param {number} count
 * @returns {Uint32Array}
 */
export function readHybrid(buf, start, end, width, count) {
  if (width > 32) throw new Error(`bit width ${width} is too wide`);
  const out = new Uint32Array(count);
  let n = 0;
  let p = start;
  const bytesPerRun = Math.ceil(width / 8);
  while (n < count) {
    if (p >= end) throw new Error(`RLE/bit-packed data ends after ${n} of ${count} values`);
    let header = 0;
    let shift = 0;
    for (;;) {
      const b = buf[p++];
      header += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    if (header % 2 === 1) {
      // Bit-packed: groups of 8 values, least significant bit first.
      const values = Math.floor(header / 2) * 8;
      let acc = 0;
      let bits = 0;
      for (let k = 0; k < values; k++) {
        let v = 0;
        let got = 0;
        while (got < width) {
          if (!bits) { acc = buf[p++]; bits = 8; }
          const take = Math.min(width - got, bits);
          v += (acc & ((1 << take) - 1)) * 2 ** got;
          acc >>>= take;
          bits -= take;
          got += take;
        }
        if (n < count) out[n++] = v;
      }
    } else {
      const run = Math.floor(header / 2);
      let v = 0;
      for (let k = 0; k < bytesPerRun; k++) v += buf[p++] * 2 ** (8 * k);
      out.fill(v, n, Math.min(count, n + run));
      n = Math.min(count, n + run);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Values.

/**
 * PLAIN-encoded values.
 * @param {Uint8Array} buf @param {number} p @param {number} count @param {Leaf} leaf
 * @returns {any[]}
 */
export function readPlain(buf, p, count, leaf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.length);
  const out = new Array(count);
  switch (leaf.type) {
    case 'BOOLEAN':
      for (let i = 0; i < count; i++) out[i] = ((buf[p + (i >> 3)] >> (i & 7)) & 1) === 1;
      return out;
    case 'INT32': for (let i = 0; i < count; i++) out[i] = view.getInt32(p + i * 4, true); return out;
    case 'INT64': for (let i = 0; i < count; i++) out[i] = Number(view.getBigInt64(p + i * 8, true)); return out;
    case 'FLOAT': for (let i = 0; i < count; i++) out[i] = view.getFloat32(p + i * 4, true); return out;
    case 'DOUBLE': for (let i = 0; i < count; i++) out[i] = view.getFloat64(p + i * 8, true); return out;
    case 'BYTE_ARRAY':
      for (let i = 0; i < count; i++) {
        const n = view.getUint32(p, true);
        const b = buf.subarray(p + 4, p + 4 + n);
        if (b.length !== n) throw new Error(`${leaf.path}: a value runs past its page`);
        out[i] = leaf.isText ? text(b) : b;
        p += 4 + n;
      }
      return out;
    default: throw new Error(`${leaf.path}: physical type ${leaf.type} is not supported`);
  }
}

/** @param {Uint8Array} body @param {string} codec @param {number} size uncompressed size */
function decompress(body, codec, size) {
  let out;
  if (codec === 'UNCOMPRESSED') out = body;
  else if (codec === 'ZSTD') out = new Uint8Array(zstdDecompressSync(body));
  else if (codec === 'GZIP') out = new Uint8Array(gunzipSync(body));
  else throw new Error(`compression ${codec} is not supported`);
  if (out.length !== size) throw new Error(`a page decompressed to ${out.length} bytes, not ${size}`);
  return out;
}

const ENC = { PLAIN: 0, PLAIN_DICTIONARY: 2, RLE: 3, RLE_DICTIONARY: 8 };

/**
 * The values of a page's non-null entries.
 * @param {Uint8Array} buf @param {number} p @param {number} end @param {number} encoding
 * @param {number} count @param {Leaf} leaf @param {any[] | null} dict
 */
function pageValues(buf, p, end, encoding, count, leaf, dict) {
  if (encoding === ENC.PLAIN) return readPlain(buf, p, count, leaf);
  if (encoding === ENC.PLAIN_DICTIONARY || encoding === ENC.RLE_DICTIONARY) {
    if (!dict) throw new Error(`${leaf.path}: dictionary-encoded page without a dictionary`);
    const idx = count ? readHybrid(buf, p + 1, end, buf[p], count) : new Uint32Array(0);
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
      if (idx[i] >= dict.length) throw new Error(`${leaf.path}: dictionary index ${idx[i]} out of range`);
      out[i] = dict[idx[i]];
    }
    return out;
  }
  if (encoding === ENC.RLE && leaf.type === 'BOOLEAN') {
    const n = new DataView(buf.buffer, buf.byteOffset + p, 4).getUint32(0, true);
    return [...readHybrid(buf, p + 4, p + 4 + n, 1, count)].map((v) => v === 1);
  }
  throw new Error(`${leaf.path}: value encoding ${encoding} is not supported`);
}

/**
 * @typedef {object} ColumnData every entry of a column chunk
 * @property {any[]} values the non-null values, in order
 * @property {Uint32Array} defs definition level of each entry
 * @property {Uint32Array} reps repetition level of each entry
 */

/**
 * Decodes every page of one column chunk.
 * @param {Uint8Array} bytes the chunk's bytes, from ColumnChunk.start, ColumnChunk.length long
 * @param {ColumnChunk} chunk @param {Leaf} leaf
 * @returns {ColumnData}
 */
export function readColumnChunk(bytes, chunk, leaf) {
  if (bytes.length !== chunk.length) throw new Error(`${chunk.path}: got ${bytes.length} bytes, the chunk has ${chunk.length}`);
  /** @type {any[] | null} */
  let dict = null;
  /** @type {any[][]} */
  const values = [];
  /** @type {Uint32Array[]} */
  const defs = [];
  /** @type {Uint32Array[]} */
  const reps = [];
  let entries = 0;
  let p = 0;
  while (p < bytes.length && entries < chunk.numValues) {
    const { value: h, end } = readThrift(bytes, p);
    const size = h[3];
    const body = bytes.subarray(end, end + size);
    if (body.length !== size) throw new Error(`${chunk.path}: a page runs past the chunk`);
    p = end + size;
    if (h[1] === 2) {
      const dh = h[7];
      if (dh[2] !== ENC.PLAIN && dh[2] !== ENC.PLAIN_DICTIONARY) throw new Error(`${chunk.path}: dictionary encoding ${dh[2]} is not supported`);
      dict = readPlain(decompress(body, chunk.codec, h[2]), 0, dh[1], leaf);
    } else if (h[1] === 0) {
      const page = dataPageV1(decompress(body, chunk.codec, h[2]), h[5], leaf, dict);
      values.push(page.values); defs.push(page.defs); reps.push(page.reps); entries += page.defs.length;
    } else if (h[1] === 3) {
      const page = dataPageV2(body, h[8], h[2], chunk.codec, leaf, dict);
      values.push(page.values); defs.push(page.defs); reps.push(page.reps); entries += page.defs.length;
    } else {
      throw new Error(`${chunk.path}: page type ${h[1]} is not supported`);
    }
  }
  if (entries !== chunk.numValues) throw new Error(`${chunk.path}: read ${entries} entries, the chunk says ${chunk.numValues}`);
  return { values: values.flat(), defs: joinLevels(defs, entries), reps: joinLevels(reps, entries) };
}

/** @param {Uint32Array[]} parts @param {number} n */
function joinLevels(parts, n) {
  const out = new Uint32Array(n);
  let k = 0;
  for (const part of parts) { out.set(part, k); k += part.length; }
  return out;
}

/**
 * Levels of a v1 page: 4-byte length, then the hybrid data. A column that cannot repeat (or be
 * null) has no levels stored: they are all zero (or all the maximum).
 * @param {Uint8Array} buf @param {number} p @param {number} max @param {number} n @param {number} fill
 */
function levelsV1(buf, p, max, n, fill) {
  if (!max) return { levels: new Uint32Array(n).fill(fill), end: p };
  const len = new DataView(buf.buffer, buf.byteOffset + p, 4).getUint32(0, true);
  return { levels: readHybrid(buf, p + 4, p + 4 + len, bitWidth(max), n), end: p + 4 + len };
}

/** @param {Uint8Array} buf @param {ThriftStruct} h DataPageHeader @param {Leaf} leaf @param {any[] | null} dict */
function dataPageV1(buf, h, leaf, dict) {
  const n = h[1];
  if (leaf.maxRep && h[4] !== ENC.RLE) throw new Error(`${leaf.path}: repetition level encoding ${h[4]} is not supported`);
  if (leaf.maxDef && h[3] !== ENC.RLE) throw new Error(`${leaf.path}: definition level encoding ${h[3]} is not supported`);
  const r = levelsV1(buf, 0, leaf.maxRep, n, 0);
  const d = levelsV1(buf, r.end, leaf.maxDef, n, leaf.maxDef);
  const present = countEqual(d.levels, leaf.maxDef);
  return { reps: r.levels, defs: d.levels, values: pageValues(buf, d.end, buf.length, h[2], present, leaf, dict) };
}

/**
 * A v2 page: levels first, never compressed and without length prefixes, then the values,
 * compressed unless the header says otherwise.
 * @param {Uint8Array} body @param {ThriftStruct} h DataPageHeaderV2 @param {number} size uncompressed page size
 * @param {string} codec @param {Leaf} leaf @param {any[] | null} dict
 */
function dataPageV2(body, h, size, codec, leaf, dict) {
  const n = h[1];
  const repLen = h[6];
  const defLen = h[5];
  const reps = leaf.maxRep ? readHybrid(body, 0, repLen, bitWidth(leaf.maxRep), n) : new Uint32Array(n);
  const defs = leaf.maxDef ? readHybrid(body, repLen, repLen + defLen, bitWidth(leaf.maxDef), n) : new Uint32Array(n).fill(leaf.maxDef);
  const rest = body.subarray(repLen + defLen);
  const compressed = h[7] !== false;
  const vals = compressed ? decompress(rest, codec, size - repLen - defLen) : rest;
  return { reps, defs, values: pageValues(vals, 0, vals.length, h[4], countEqual(defs, leaf.maxDef), leaf, dict) };
}

/** @param {Uint32Array} a @param {number} v */
function countEqual(a, v) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === v) n++;
  return n;
}

// ---------------------------------------------------------------------------------------------
// Rows.

/**
 * One entry per row. A column that does not repeat gives its value, or null. A column inside a
 * list or a map (one level of repetition) gives an array per row: one item per list element
 * (null where the element or the field is missing), [] for an empty list, null for no list.
 * @param {ColumnData} data @param {Leaf} leaf
 * @returns {any[]}
 */
export function columnRows(data, leaf) {
  if (leaf.maxRep > 1) throw new Error(`${leaf.path}: columns nested in two lists are not supported`);
  const { values, defs, reps } = data;
  const rows = [];
  let v = 0;
  if (!leaf.maxRep) {
    for (let i = 0; i < defs.length; i++) rows.push(defs[i] === leaf.maxDef ? values[v++] : null);
    return rows;
  }
  /** @type {any[] | null} */
  let row = null;
  for (let i = 0; i < defs.length; i++) {
    if (reps[i] === 0) {
      // A new row: no list (def below the list's own level), an empty list, or a first item.
      row = defs[i] >= leaf.repDef - 1 ? [] : null;
      rows.push(row);
    }
    if (defs[i] >= leaf.repDef) /** @type {any[]} */ (row).push(defs[i] === leaf.maxDef ? values[v++] : null);
  }
  return rows;
}

/**
 * Zips a map's key and value columns into one object per row (null for no map).
 * @param {any[]} keys rows of the key column @param {any[]} vals rows of the value column
 * @returns {(Record<string, any> | null)[]}
 */
export function mapRows(keys, vals) {
  return keys.map((k, i) => {
    if (!k) return null;
    /** @type {Record<string, any>} */
    const out = {};
    k.forEach((/** @type {string} */ key, /** @type {number} */ j) => { out[key] = vals[i][j]; });
    return out;
  });
}

// ---------------------------------------------------------------------------------------------
// WKB geometry.

/**
 * @typedef {{ type: 'Point', point: number[] } | { type: 'LineString', line: number[] }
 *   | { type: 'Polygon', rings: number[][] } | { type: 'MultiPoint', points: number[][] }
 *   | { type: 'MultiLineString', lines: number[][] } | { type: 'MultiPolygon', polygons: number[][][] }} Geometry
 * Coordinates are flat lon/lat lists: [x0, y0, x1, y1, ...].
 */

/**
 * Decodes 2D well-known binary (OGC WKB, either byte order).
 * @param {Uint8Array} buf
 * @returns {Geometry}
 */
export function readWkb(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.length);
  let p = 0;
  let little = true;
  const u32 = () => { const v = view.getUint32(p, little); p += 4; return v; };
  const points = () => {
    const n = u32();
    if (p + n * 16 > buf.length) throw new Error('WKB: coordinates run past the end');
    const out = new Array(n * 2);
    for (let i = 0; i < n * 2; i++) { out[i] = view.getFloat64(p, little); p += 8; }
    return out;
  };
  /** @param {number} [want] @returns {Geometry} */
  const geometry = (want) => {
    little = buf[p++] === 1;
    const type = u32();
    if (type > 7) throw new Error(`WKB: geometry type ${type} is not supported (only 2D)`);
    if (want !== undefined && type !== want) throw new Error(`WKB: expected type ${want} inside a multi-geometry, got ${type}`);
    switch (type) {
      case 1: { const pt = [view.getFloat64(p, little), view.getFloat64(p + 8, little)]; p += 16; return { type: 'Point', point: pt }; }
      case 2: return { type: 'LineString', line: points() };
      case 3: { const n = u32(); const rings = []; for (let i = 0; i < n; i++) rings.push(points()); return { type: 'Polygon', rings }; }
      case 4: { const n = u32(); const pts = []; for (let i = 0; i < n; i++) pts.push(/** @type {any} */ (geometry(1)).point); return { type: 'MultiPoint', points: pts }; }
      case 5: { const n = u32(); const lines = []; for (let i = 0; i < n; i++) lines.push(/** @type {any} */ (geometry(2)).line); return { type: 'MultiLineString', lines }; }
      case 6: { const n = u32(); const polys = []; for (let i = 0; i < n; i++) polys.push(/** @type {any} */ (geometry(3)).rings); return { type: 'MultiPolygon', polygons: polys }; }
      default: throw new Error(`WKB: geometry type ${type} (collection) is not supported`);
    }
  };
  const g = geometry();
  if (p !== buf.length) throw new Error(`WKB: ${buf.length - p} bytes left over`);
  return g;
}

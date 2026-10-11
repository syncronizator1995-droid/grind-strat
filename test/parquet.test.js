// @ts-check
// Tests for the small Parquet reader (tools/map/parquet.mjs) on bytes the test builds itself:
// Thrift varints and structs, the RLE / bit-packed hybrid, dictionary and plain pages (v1 and
// v2), levels for a list of structs and a map, a whole little file, and WKB. No network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { zstdCompressSync } from 'node:zlib';
import {
  bitWidth, columnRows, footerLength, mapRows, parseFooter, readColumnChunk, readHybrid, readThrift, readWkb,
} from '../tools/map/parquet.mjs';

// ---------------------------------------------------------------------------------------------
// A tiny Thrift compact-protocol writer, enough to build footers and page headers.

/** @typedef {[number, string, any, string?]} Field [id, type, value, list element type] */

/** @param {number | bigint} n */
function varint(n) {
  const out = [];
  let v = BigInt(n);
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return out;
}
/** @param {number | bigint} n */
const zigzag = (n) => varint(BigInt(n) >= 0n ? BigInt(n) << 1n : (-BigInt(n) << 1n) - 1n);
const TYPE = { bool: 1, i8: 3, i16: 4, i32: 5, i64: 6, double: 7, bin: 8, list: 9, struct: 12 };

/** @param {string} type @param {any} v @returns {number[]} */
function val(type, v, elem = '') {
  switch (type) {
    case 'i8': return [v & 0xff];
    case 'i16': case 'i32': case 'i64': return zigzag(v);
    case 'double': { const b = Buffer.alloc(8); b.writeDoubleLE(v); return [...b]; }
    case 'bin': { const b = typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v); return [...varint(b.length), ...b]; }
    case 'list': {
      const t = /** @type {Record<string, number>} */ (TYPE)[elem];
      const head = v.length < 15 ? [(v.length << 4) | t] : [0xf0 | t, ...varint(v.length)];
      return [...head, ...v.flatMap((/** @type {any} */ x) => (elem === 'bool' ? [x ? 1 : 2] : val(elem, x)))];
    }
    case 'struct': return struct(v);
    default: throw new Error(type);
  }
}

/** @param {Field[]} fields @returns {number[]} */
function struct(fields) {
  const out = [];
  let last = 0;
  for (const [id, type, v, elem] of [...fields].sort((a, b) => a[0] - b[0])) {
    const t = type === 'bool' ? (v ? 1 : 2) : /** @type {Record<string, number>} */ (TYPE)[type];
    const delta = id - last;
    if (delta > 0 && delta <= 15) out.push((delta << 4) | t); else out.push(t, ...zigzag(id));
    if (type !== 'bool') out.push(...val(type, v, elem));
    last = id;
  }
  out.push(0);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Encoders for page contents.

/** RLE run. @param {number} count @param {number} value @param {number} width */
const rleRun = (count, value, width) => [...varint(count << 1), ...Array.from({ length: Math.ceil(width / 8) }, (_, k) => (value >> (8 * k)) & 0xff)];

/** Bit-packed run (values padded to a multiple of 8). @param {number[]} values @param {number} width */
function bitPacked(values, width) {
  const groups = Math.ceil(values.length / 8);
  const bytes = new Array(groups * width).fill(0);
  let bit = 0;
  for (let i = 0; i < groups * 8; i++) {
    const v = values[i] ?? 0;
    for (let k = 0; k < width; k++, bit++) if ((v >> k) & 1) bytes[bit >> 3] |= 1 << (bit & 7);
  }
  return [...varint((groups << 1) | 1), ...bytes];
}

/** Levels for a v1 page: 4-byte length, then one bit-packed run. @param {number[]} levels @param {number} max */
function levelsV1(levels, max) {
  const body = bitPacked(levels, bitWidth(max));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(body.length);
  return [...len, ...body];
}

/** PLAIN byte arrays. @param {string[]} strings */
const plainStrings = (strings) => strings.flatMap((s) => {
  const b = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length);
  return [...len, ...b];
});

/** A page: header then body. @param {Field[]} header @param {number[]} body */
const page = (header, body) => [...struct(header), ...body];

/** A ZSTD-compressed dictionary page. @param {string[]} strings */
function dictPage(strings) {
  const raw = Uint8Array.from(plainStrings(strings));
  const z = [...zstdCompressSync(raw)];
  return page([[1, 'i32', 2], [2, 'i32', raw.length], [3, 'i32', z.length], [7, 'struct', [[1, 'i32', strings.length], [2, 'i32', 0]]]], z);
}

/**
 * A ZSTD-compressed v1 data page of dictionary indices.
 * @param {number[]} reps @param {number[]} defs @param {number[]} idx @param {number} maxRep @param {number} maxDef @param {number} width
 */
function dictDataPageV1(reps, defs, idx, maxRep, maxDef, width) {
  const raw = Uint8Array.from([...(maxRep ? levelsV1(reps, maxRep) : []), ...(maxDef ? levelsV1(defs, maxDef) : []), width, ...bitPacked(idx, width)]);
  const z = [...zstdCompressSync(raw)];
  return page([[1, 'i32', 0], [2, 'i32', raw.length], [3, 'i32', z.length], [5, 'struct', [[1, 'i32', defs.length], [2, 'i32', 8], [3, 'i32', 3], [4, 'i32', 3]]]], z);
}

// ---------------------------------------------------------------------------------------------

describe('Thrift compact protocol', () => {
  it('reads varints, zigzag integers, strings, doubles, booleans, lists and nested structs', () => {
    const bytes = Uint8Array.from(struct([
      [1, 'i32', -3], [2, 'i64', 300], [3, 'bin', 'Nemunas'], [4, 'double', 54.5], [5, 'bool', true], [6, 'bool', false],
      [7, 'list', [1, 2, 3], 'i32'], [8, 'struct', [[1, 'bin', 'inner']]], [40, 'i64', 2 ** 40], [41, 'list', [true, false], 'bool'],
    ]));
    const { value, end } = readThrift(bytes);
    assert.equal(end, bytes.length);
    assert.equal(value[1], -3);
    assert.equal(value[2], 300);
    assert.equal(new TextDecoder().decode(value[3]), 'Nemunas');
    assert.equal(value[4], 54.5);
    assert.equal(value[5], true);
    assert.equal(value[6], false);
    assert.deepEqual(value[7], [1, 2, 3]);
    assert.equal(new TextDecoder().decode(value[8][1]), 'inner');
    assert.equal(value[40], 2 ** 40);
    assert.deepEqual(value[41], [true, false]);
  });

  it('reads long lists and multi-byte varints', () => {
    const list = Array.from({ length: 20 }, (_, i) => i * 1000);
    const { value } = readThrift(Uint8Array.from(struct([[1, 'list', list, 'i64']])));
    assert.deepEqual(value[1], list);
  });

  it('fails loudly on cut-off bytes', () => {
    const bytes = Uint8Array.from(struct([[1, 'bin', 'a long enough string']]));
    assert.throws(() => readThrift(bytes.subarray(0, 6)), /past the end/);
  });
});

describe('RLE / bit-packed hybrid', () => {
  it('reads RLE runs', () => {
    const buf = Uint8Array.from([...rleRun(5, 3, 9), ...rleRun(2, 300, 9)]);
    assert.deepEqual([...readHybrid(buf, 0, buf.length, 9, 7)], [3, 3, 3, 3, 3, 300, 300]);
  });

  it('reads bit-packed runs of odd widths and stops at the count', () => {
    for (const width of [1, 3, 5, 7, 12]) {
      const values = Array.from({ length: 13 }, (_, i) => (i * 37) % 2 ** width);
      const buf = Uint8Array.from(bitPacked(values, width));
      assert.deepEqual([...readHybrid(buf, 0, buf.length, width, 13)], values, `width ${width}`);
    }
  });

  it('mixes runs, and handles width 0', () => {
    const buf = Uint8Array.from([...bitPacked([1, 0, 1, 1, 0, 0, 0, 1], 1), ...rleRun(4, 1, 1)]);
    assert.deepEqual([...readHybrid(buf, 0, buf.length, 1, 12)], [1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1]);
    const zero = Uint8Array.from(rleRun(6, 0, 0));
    assert.deepEqual([...readHybrid(zero, 0, zero.length, 0, 6)], [0, 0, 0, 0, 0, 0]);
  });

  it('fails when a run reaches past its end, never reading other bytes as levels', () => {
    assert.throws(() => readHybrid(Uint8Array.from([3]), 0, 1, 3, 8), /runs past its end/, 'a bit-packed group with no bytes');
    assert.throws(() => readHybrid(Uint8Array.from([8, 7]), 0, 2, 16, 4), /runs past its end/, 'an RLE value cut short');
    assert.throws(() => readHybrid(Uint8Array.from([3, 0xff, 0xff, 0xff]), 0, 1, 3, 8), /runs past its end/, 'bytes after the end are not read');
    assert.throws(() => readHybrid(Uint8Array.from([0x81]), 0, 1, 1, 8), /header runs past its end/);
  });

  it('fails when the data ends early', () => {
    const buf = Uint8Array.from(rleRun(2, 1, 1));
    assert.throws(() => readHybrid(buf, 0, buf.length, 1, 5), /ends after 2 of 5/);
  });

  it('bit widths', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 7, 8].map(bitWidth), [0, 1, 2, 2, 3, 3, 4]);
  });
});

/**
 * A little Parquet file with the shapes Overture uses: an optional string (subtype), a map of
 * strings (names.common), a list of structs (sources.list.element.record_id) and an optional
 * double inside a struct (bbox.xmin), three rows.
 */
function littleFile() {
  /** @type {number[]} */
  const bytes = [...Buffer.from('PAR1')];
  /** @type {Field[][]} */
  const columns = [];
  /** @param {string[]} path @param {string} type @param {number} numValues @param {number[]} chunk @param {Field[]} [stats] */
  const addColumn = (path, type, numValues, chunk, stats) => {
    const start = bytes.length;
    bytes.push(...chunk);
    /** @type {Field[]} */
    const md = [[1, 'i32', type === 'DOUBLE' ? 5 : 6], [2, 'list', [0, 3, 8], 'i32'], [3, 'list', path, 'bin'], [4, 'i32', 6],
      [5, 'i64', numValues], [6, 'i64', chunk.length], [7, 'i64', chunk.length], [9, 'i64', start]];
    if (stats) md.push([12, 'struct', stats]);
    columns.push([[2, 'i64', start], [3, 'struct', md]]);
  };

  // subtype: optional, rows "river", null, "lake" (dictionary ["lake", "river"]).
  addColumn(['subtype'], 'BYTE_ARRAY', 3, [...dictPage(['lake', 'river']), ...dictDataPageV1([], [1, 0, 1], [1, 0], 0, 1, 1)]);
  // names.common: row 0 {lt: Nemunas, ru: Неман}, row 1 no map, row 2 empty map.
  // key: maxDef 3 (names, common, key_value), maxRep 1. value: maxDef 4 (optional value).
  addColumn(['names', 'common', 'key_value', 'key'], 'BYTE_ARRAY', 4, [...dictPage(['lt', 'ru']), ...dictDataPageV1([0, 1, 0, 0], [3, 3, 1, 2], [0, 1], 1, 3, 1)]);
  addColumn(['names', 'common', 'key_value', 'value'], 'BYTE_ARRAY', 4, [...dictPage(['Nemunas', 'Неман']), ...dictDataPageV1([0, 1, 0, 0], [4, 4, 1, 2], [0, 1], 1, 4, 1)]);
  // sources.list.element.record_id: row 0 [w1@2, w2@1], row 1 [null element], row 2 no list.
  // As a v2 page with PLAIN values: levels uncompressed and without length prefixes.
  {
    const reps = bitPacked([0, 1, 0, 0], 1);
    const defs = bitPacked([4, 4, 2, 0], 3);
    const values = Uint8Array.from(plainStrings(['w1@2', 'w2@1']));
    const z = [...zstdCompressSync(values)];
    addColumn(['sources', 'list', 'element', 'record_id'], 'BYTE_ARRAY', 4, page(
      [[1, 'i32', 3], [2, 'i32', reps.length + defs.length + values.length], [3, 'i32', reps.length + defs.length + z.length],
        [8, 'struct', [[1, 'i32', 4], [2, 'i32', 2], [3, 'i32', 3], [4, 'i32', 0], [5, 'i32', defs.length], [6, 'i32', reps.length]]]],
      [...reps, ...defs, ...z],
    ));
  }
  // bbox.xmin: an optional double in an optional struct, PLAIN in a v1 page without compression.
  {
    const raw = [...levelsV1([2, 2, 2], 2), ...[21.5, 23.25, 25].flatMap((v) => { const b = Buffer.alloc(8); b.writeDoubleLE(v); return [...b]; })];
    const st = (/** @type {number} */ v) => { const b = Buffer.alloc(8); b.writeDoubleLE(v); return [...b]; };
    addColumn(['bbox', 'xmin'], 'DOUBLE', 3, page([[1, 'i32', 0], [2, 'i32', raw.length], [3, 'i32', raw.length], [5, 'struct', [[1, 'i32', 3], [2, 'i32', 0], [3, 'i32', 3], [4, 'i32', 3]]]], raw),
      [[5, 'bin', st(25)], [6, 'bin', st(21.5)], [3, 'i64', 0]]);
    // That chunk is uncompressed: mark its codec so.
    /** @type {any} */ (columns[columns.length - 1][1][2]).find((/** @type {Field} */ f) => f[0] === 4)[2] = 0;
  }

  /** @type {{ utf8: Field[] }} */
  const str = { utf8: [[6, 'i32', 0], [10, 'struct', [[1, 'struct', []]]]] };
  /** @type {Field[][]} */
  const schema = [
    [[4, 'bin', 'schema'], [5, 'i32', 4]],
    [[1, 'i32', 6], [3, 'i32', 1], [4, 'bin', 'subtype'], ...str.utf8],
    [[3, 'i32', 1], [4, 'bin', 'names'], [5, 'i32', 1]],
    [[3, 'i32', 1], [4, 'bin', 'common'], [5, 'i32', 1], [6, 'i32', 1]],
    [[3, 'i32', 2], [4, 'bin', 'key_value'], [5, 'i32', 2]],
    [[1, 'i32', 6], [3, 'i32', 0], [4, 'bin', 'key'], ...str.utf8],
    [[1, 'i32', 6], [3, 'i32', 1], [4, 'bin', 'value'], ...str.utf8],
    [[3, 'i32', 1], [4, 'bin', 'sources'], [5, 'i32', 1], [6, 'i32', 3]],
    [[3, 'i32', 2], [4, 'bin', 'list'], [5, 'i32', 1]],
    [[3, 'i32', 1], [4, 'bin', 'element'], [5, 'i32', 1]],
    [[1, 'i32', 6], [3, 'i32', 1], [4, 'bin', 'record_id'], ...str.utf8],
    [[3, 'i32', 1], [4, 'bin', 'bbox'], [5, 'i32', 1]],
    [[1, 'i32', 5], [3, 'i32', 1], [4, 'bin', 'xmin']],
  ];
  const footer = struct([
    [1, 'i32', 2], [2, 'list', schema, 'struct'], [3, 'i64', 3],
    [4, 'list', [[[1, 'list', columns, 'struct'], [2, 'i64', 0], [3, 'i64', 3]]], 'struct'],
    [5, 'list', [[[1, 'bin', 'geo'], [2, 'bin', '{"version":"1.1.0"}']]], 'struct'],
    [6, 'bin', 'test writer'],
  ]);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(footer.length);
  return Uint8Array.from([...bytes, ...footer, ...len, ...Buffer.from('PAR1')]);
}

describe('a little Parquet file', () => {
  const file = littleFile();
  const len = footerLength(file.subarray(file.length - 8));
  const footer = parseFooter(file.subarray(file.length - 8 - len, file.length - 8));
  const rg = footer.rowGroups[0];
  /** @param {string} path */
  const rows = (path) => {
    const chunk = /** @type {import('../tools/map/parquet.mjs').ColumnChunk} */ (rg.columns.get(path));
    const leaf = /** @type {import('../tools/map/parquet.mjs').Leaf} */ (footer.leaves.get(path));
    return columnRows(readColumnChunk(file.subarray(chunk.start, chunk.start + chunk.length), chunk, leaf), leaf);
  };

  it('reads the footer: schema levels, row groups, key-value metadata', () => {
    assert.equal(footer.numRows, 3);
    assert.equal(footer.createdBy, 'test writer');
    assert.equal(footer.keyValue.geo, '{"version":"1.1.0"}');
    assert.deepEqual([...footer.leaves.keys()], ['subtype', 'names.common.key_value.key', 'names.common.key_value.value', 'sources.list.element.record_id', 'bbox.xmin']);
    const key = footer.leaves.get('names.common.key_value.key');
    assert.deepEqual({ d: key?.maxDef, r: key?.maxRep, rd: key?.repDef, t: key?.isText }, { d: 3, r: 1, rd: 3, t: true });
    const rec = footer.leaves.get('sources.list.element.record_id');
    assert.deepEqual({ d: rec?.maxDef, r: rec?.maxRep, rd: rec?.repDef }, { d: 4, r: 1, rd: 2 });
    assert.equal(footer.leaves.get('bbox.xmin')?.isText, false);
  });

  it('reads statistics', () => {
    assert.deepEqual(rg.columns.get('bbox.xmin')?.stats, { min: 21.5, max: 25, nullCount: 0 });
    assert.equal(rg.columns.get('subtype')?.stats, null);
  });

  it('reads an optional dictionary-encoded string', () => {
    assert.deepEqual(rows('subtype'), ['river', null, 'lake']);
  });

  it('reads a map of strings', () => {
    assert.deepEqual(mapRows(rows('names.common.key_value.key'), rows('names.common.key_value.value')), [{ lt: 'Nemunas', ru: 'Неман' }, null, {}]);
  });

  it('reads a list of structs from a v2 page with plain values', () => {
    assert.deepEqual(rows('sources.list.element.record_id'), [['w1@2', 'w2@1'], [null], null]);
  });

  it('reads plain doubles from an uncompressed page', () => {
    assert.deepEqual(rows('bbox.xmin'), [21.5, 23.25, 25]);
  });

  it('refuses a chunk of the wrong length and a file that is not Parquet', () => {
    const chunk = /** @type {import('../tools/map/parquet.mjs').ColumnChunk} */ (rg.columns.get('subtype'));
    const leaf = /** @type {import('../tools/map/parquet.mjs').Leaf} */ (footer.leaves.get('subtype'));
    assert.throws(() => readColumnChunk(file.subarray(chunk.start, chunk.start + chunk.length - 1), chunk, leaf), /got \d+ bytes/);
    assert.throws(() => footerLength(Uint8Array.from([0, 0, 0, 0, 80, 65, 82, 50])), /not a Parquet file/);
  });

  /**
   * Reads one made-up column chunk as one of the little file's columns.
   * @param {string} path @param {number[]} bytes @param {number} numValues
   */
  const readAs = (path, bytes, numValues) => {
    const chunk = { .../** @type {import('../tools/map/parquet.mjs').ColumnChunk} */ (rg.columns.get(path)), length: bytes.length, numValues };
    const leaf = /** @type {import('../tools/map/parquet.mjs').Leaf} */ (footer.leaves.get(path));
    return columnRows(readColumnChunk(Uint8Array.from(bytes), chunk, leaf), leaf);
  };

  it('refuses a dictionary index past the dictionary', () => {
    const bytes = [...dictPage(['lake']), ...dictDataPageV1([], [1, 1], [0, 1], 0, 1, 1)];
    assert.throws(() => readAs('subtype', bytes, 2), /dictionary index 1 out of range/);
  });

  it('reads a v2 page whose values are not compressed, though the column is ZSTD', () => {
    const reps = bitPacked([0, 0], 1);
    const defs = bitPacked([4, 4], 3);
    const values = plainStrings(['w9@1', 'w8@2']);
    const size = reps.length + defs.length + values.length;
    const header = (/** @type {number} */ defLen) => [[1, 'i32', 3], [2, 'i32', size], [3, 'i32', size],
      [8, 'struct', [[1, 'i32', 2], [2, 'i32', 0], [3, 'i32', 2], [4, 'i32', 0], [5, 'i32', defLen], [6, 'i32', reps.length], [7, 'bool', false]]]];
    const bytes = page(/** @type {Field[]} */ (header(defs.length)), [...reps, ...defs, ...values]);
    assert.deepEqual(readAs('sources.list.element.record_id', bytes, 2), [['w9@1'], ['w8@2']]);
    const bad = page(/** @type {Field[]} */ (header(size)), [...reps, ...defs, ...values]);
    assert.throws(() => readAs('sources.list.element.record_id', bad, 2), /level lengths .* run past/);
  });

  it('refuses compression it does not know', () => {
    const chunk = { .../** @type {import('../tools/map/parquet.mjs').ColumnChunk} */ (rg.columns.get('subtype')), codec: 'SNAPPY' };
    const leaf = /** @type {import('../tools/map/parquet.mjs').Leaf} */ (footer.leaves.get('subtype'));
    assert.throws(() => readColumnChunk(file.subarray(chunk.start, chunk.start + chunk.length), chunk, leaf), /SNAPPY is not supported/);
  });
});

describe('WKB', () => {
  /** @param {boolean} little @param {number} type @param {(w: (n: number) => void, d: (n: number) => void) => void} body */
  const wkb = (little, type, body) => {
    /** @type {number[]} */
    const out = [];
    const w = (/** @type {number} */ n) => { const b = Buffer.alloc(4); if (little) b.writeUInt32LE(n); else b.writeUInt32BE(n); out.push(...b); };
    const d = (/** @type {number} */ n) => { const b = Buffer.alloc(8); if (little) b.writeDoubleLE(n); else b.writeDoubleBE(n); out.push(...b); };
    out.push(little ? 1 : 0);
    w(type);
    body(w, d);
    return out;
  };

  it('reads points and lines in either byte order', () => {
    assert.deepEqual(readWkb(Uint8Array.from(wkb(true, 1, (_, d) => { d(23.9); d(54.9); }))), { type: 'Point', point: [23.9, 54.9] });
    assert.deepEqual(readWkb(Uint8Array.from(wkb(false, 2, (w, d) => { w(2); d(1); d(2); d(3); d(4); }))), { type: 'LineString', line: [1, 2, 3, 4] });
  });

  it('reads a polygon with a hole and a multipolygon', () => {
    const ring = (/** @type {(n: number) => void} */ w, /** @type {(n: number) => void} */ d, /** @type {number[]} */ pts) => { w(pts.length / 2); pts.forEach(d); };
    const poly = wkb(true, 3, (w, d) => { w(2); ring(w, d, [0, 0, 4, 0, 4, 4, 0, 0]); ring(w, d, [1, 1, 2, 1, 2, 2, 1, 1]); });
    assert.deepEqual(readWkb(Uint8Array.from(poly)), { type: 'Polygon', rings: [[0, 0, 4, 0, 4, 4, 0, 0], [1, 1, 2, 1, 2, 2, 1, 1]] });
    const multi = [...wkb(true, 6, (w) => w(2)), ...poly, ...poly];
    const g = readWkb(Uint8Array.from(multi));
    assert.equal(g.type, 'MultiPolygon');
    assert.equal(g.type === 'MultiPolygon' && g.polygons.length, 2);
    const lines = [...wkb(false, 5, (w) => w(1)), ...wkb(true, 2, (w, d) => { w(2); d(5); d(6); d(7); d(8); })];
    assert.deepEqual(readWkb(Uint8Array.from(lines)), { type: 'MultiLineString', lines: [[5, 6, 7, 8]] });
  });

  it('refuses 3D, collections and leftover bytes', () => {
    assert.throws(() => readWkb(Uint8Array.from(wkb(true, 1001, () => {}))), /only 2D/);
    assert.throws(() => readWkb(Uint8Array.from(wkb(true, 7, (w) => w(0)))), /collection/);
    assert.throws(() => readWkb(Uint8Array.from([...wkb(true, 1, (_, d) => { d(1); d(2); }), 0])), /left over/);
  });
});

describe('a real slice of Overture water data (test/fixtures/odbl/, ODbL 1.0)', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/odbl/overture-water-slice.json', import.meta.url), 'utf8'));

  for (const [path, col] of Object.entries(/** @type {Record<string, any>} */ (fixture.columns))) {
    it(`decodes ${path}: dictionary pages, levels and ZSTD as Overture writes them`, () => {
      const bytes = new Uint8Array(Buffer.from(col.bytes, 'base64'));
      const rows = columnRows(readColumnChunk(bytes, col.chunk, col.leaf), col.leaf);
      assert.equal(rows.length, fixture.numRows);
      assert.equal(rows.filter((r) => r === null).length, col.expect.nulls);
      /** @type {Record<string, number>} */
      const counts = {};
      for (const r of rows) for (const v of [r].flat()) if (v !== null) counts[v] = (counts[v] ?? 0) + 1;
      for (const [v, n] of Object.entries(col.expect.counts)) assert.equal(counts[v], n, `${path} ${v}`);
    });
  }
});

// @ts-check
// A small TIFF and BigTIFF reader for the map pipeline: enough to read a pixel window out of a big
// GeoTIFF (GEBCO heights, GLWD wetlands, ESA WorldCover) without downloading the whole file.
// Bytes come through a ByteSource (read(offset, length)), so the same code reads a local file, a
// buffer in a test, or a remote file by HTTP range requests. Only the tiles or strips that the
// window touches are read.
//
// Supported: little- and big-endian, classic TIFF and BigTIFF, several images per file (a COG's
// overviews are the later images), tiles and strips, one sample per pixel, uint8/int8/uint16/
// int16/uint32/int32/float32, compression none (1), LZW (5) and DEFLATE (8 and 32946), predictor
// 1 (none) and 2 (horizontal differencing). The GeoTIFF tags give each image's lon/lat grid.

import { inflateSync } from 'node:zlib';

/**
 * Where the bytes come from. prefetch is optional: a source that fetches over the network uses it
 * to merge many small reads into a few big ones.
 * @typedef {object} ByteSource
 * @property {(offset: number, length: number) => Promise<Uint8Array>} read  may return fewer bytes at the end of the file
 * @property {(ranges: { offset: number, length: number }[]) => Promise<void>} [prefetch]
 */

/** @typedef {Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array} Samples */

/**
 * One IFD entry, with its value bytes either read already or still in the file.
 * @typedef {{ type: number, count: number, offset: number, inline: Uint8Array | null }} Entry
 */

/**
 * Pixel grid to lon/lat: lon = west + (col + 0.5) * dx at a pixel's centre (same for lat with dy < 0).
 * @typedef {{ west: number, north: number, dx: number, dy: number }} GeoGrid
 */

/**
 * @typedef {object} TiffImage
 * @property {number} index        which IFD in the file (0 = full resolution)
 * @property {number} width
 * @property {number} height
 * @property {number} blockWidth   tile width, or the image width for strips
 * @property {number} blockHeight  tile height, or rows per strip
 * @property {boolean} tiled
 * @property {number} bitsPerSample
 * @property {number} sampleFormat 1 unsigned, 2 signed, 3 float
 * @property {number} compression
 * @property {number} predictor
 * @property {number | null} noData the GDAL_NODATA value, if any
 * @property {GeoGrid | null} geo   only on images that carry their own GeoTIFF tags
 * @property {Map<number, Entry>} entries
 */

// TIFF field types: [size in bytes, reader]. Only the types these files use for numbers.
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };

const TAG = Object.freeze({
  width: 256, height: 257, bitsPerSample: 258, compression: 259, stripOffsets: 273, samplesPerPixel: 277,
  rowsPerStrip: 278, stripByteCounts: 279, planarConfig: 284, predictor: 317, tileWidth: 322, tileLength: 323,
  tileOffsets: 324, tileByteCounts: 325, sampleFormat: 339, pixelScale: 33550, tiepoint: 33922,
  geoKeys: 34735, gdalNoData: 42113,
});

/** How many bytes to read at the start: a cloud-optimised file keeps all its IFDs there. */
const HEAD_BYTES = 65536;

/**
 * A ByteSource over bytes already in memory (tests, small local files).
 * @param {Uint8Array} bytes
 * @returns {ByteSource}
 */
export function memorySource(bytes) {
  return { read: async (offset, length) => bytes.subarray(offset, Math.min(bytes.length, offset + length)) };
}

/**
 * Opens a TIFF: reads the header and every IFD (not the pixel data).
 * @param {ByteSource} source
 */
export async function openTiff(source) {
  const head = await source.read(0, HEAD_BYTES);
  /** Reads bytes, from the head when they are inside it. @param {number} offset @param {number} length */
  const bytesAt = async (offset, length) => (offset + length <= head.length
    ? head.subarray(offset, offset + length)
    : source.read(offset, length));

  const order = String.fromCharCode(head[0], head[1]);
  if (order !== 'II' && order !== 'MM') throw new Error('not a TIFF file');
  const le = order === 'II';
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const magic = hv.getUint16(2, le);
  if (magic !== 42 && magic !== 43) throw new Error(`not a TIFF file (magic ${magic})`);
  const big = magic === 43;
  const reader = makeReader(le, big);

  /** @type {TiffImage[]} */
  const images = [];
  let next = big ? Number(hv.getBigUint64(8, le)) : hv.getUint32(4, le);
  const seen = new Set();
  while (next && !seen.has(next)) {
    seen.add(next);
    const countBytes = await bytesAt(next, big ? 8 : 2);
    const count = big ? reader.u64(countBytes, 0) : reader.u16(countBytes, 0);
    const entrySize = big ? 20 : 12;
    const block = await bytesAt(next, (big ? 8 : 2) + count * entrySize + (big ? 8 : 4));
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      const p = (big ? 8 : 2) + i * entrySize;
      const tag = reader.u16(block, p);
      const type = reader.u16(block, p + 2);
      const n = big ? reader.u64(block, p + 4) : reader.u32(block, p + 4);
      const valueAt = p + (big ? 12 : 8);
      const size = (TYPE_SIZE[/** @type {keyof typeof TYPE_SIZE} */ (type)] ?? 1) * n;
      const inlineMax = big ? 8 : 4;
      if (size <= inlineMax) entries.set(tag, { type, count: n, offset: 0, inline: block.subarray(valueAt, valueAt + size) });
      else entries.set(tag, { type, count: n, offset: big ? reader.u64(block, valueAt) : reader.u32(block, valueAt), inline: null });
    }
    const after = (big ? 8 : 2) + count * entrySize;
    next = big ? reader.u64(block, after) : reader.u32(block, after);
    images.push(await describeImage(images.length, entries, reader, bytesAt));
  }
  if (!images.length) throw new Error('TIFF has no images');
  // Overviews carry no GeoTIFF tags of their own: derive their grid from the full image's.
  const base = images[0].geo;
  if (base) {
    for (const img of images) {
      if (img.geo) continue;
      img.geo = { west: base.west, north: base.north, dx: (base.dx * images[0].width) / img.width, dy: (base.dy * images[0].height) / img.height };
    }
  }
  return {
    littleEndian: le,
    bigTiff: big,
    images,
    /** @param {TiffImage} image @param {number} x0 @param {number} y0 @param {number} w @param {number} h @param {{ fill?: number }} [opts] */
    readWindow: (image, x0, y0, w, h, opts = {}) => readWindow(source, reader, image, x0, y0, w, h, opts),
  };
}

/**
 * Number readers for one byte order and TIFF flavour.
 * @param {boolean} le @param {boolean} big
 */
function makeReader(le, big) {
  const dv = (/** @type {Uint8Array} */ b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const r = {
    big,
    le,
    u16: (/** @type {Uint8Array} */ b, /** @type {number} */ o) => dv(b).getUint16(o, le),
    u32: (/** @type {Uint8Array} */ b, /** @type {number} */ o) => dv(b).getUint32(o, le),
    u64: (/** @type {Uint8Array} */ b, /** @type {number} */ o) => Number(dv(b).getBigUint64(o, le)),
    /**
     * All values of an entry as numbers (rationals as a/b, ASCII as character codes).
     * @param {Entry} e @param {Uint8Array} bytes
     */
    values(e, bytes) {
      const v = dv(bytes);
      const out = new Array(e.count);
      for (let i = 0; i < e.count; i++) {
        switch (e.type) {
          case 1: case 2: case 7: out[i] = v.getUint8(i); break;
          case 6: out[i] = v.getInt8(i); break;
          case 3: out[i] = v.getUint16(i * 2, le); break;
          case 8: out[i] = v.getInt16(i * 2, le); break;
          case 4: out[i] = v.getUint32(i * 4, le); break;
          case 9: out[i] = v.getInt32(i * 4, le); break;
          case 5: out[i] = v.getUint32(i * 8, le) / v.getUint32(i * 8 + 4, le); break;
          case 10: out[i] = v.getInt32(i * 8, le) / v.getInt32(i * 8 + 4, le); break;
          case 11: out[i] = v.getFloat32(i * 4, le); break;
          case 12: out[i] = v.getFloat64(i * 8, le); break;
          case 16: case 18: out[i] = Number(v.getBigUint64(i * 8, le)); break;
          case 17: out[i] = Number(v.getBigInt64(i * 8, le)); break;
          default: throw new Error(`unsupported TIFF field type ${e.type}`);
        }
      }
      return /** @type {number[]} */ (out);
    },
  };
  return r;
}

/** @typedef {ReturnType<typeof makeReader>} Reader */

/**
 * The values of one tag, reading them from the file if they are not inline.
 * @param {Map<number, Entry>} entries @param {number} tag @param {Reader} reader
 * @param {(offset: number, length: number) => Promise<Uint8Array>} bytesAt
 */
async function tagValues(entries, tag, reader, bytesAt) {
  const e = entries.get(tag);
  if (!e) return null;
  const size = (TYPE_SIZE[/** @type {keyof typeof TYPE_SIZE} */ (e.type)] ?? 1) * e.count;
  const bytes = e.inline ?? await bytesAt(e.offset, size);
  if (bytes.length < size) throw new Error(`TIFF tag ${tag} runs past the end of the file`);
  return reader.values(e, bytes);
}

/**
 * Reads the small tags of an IFD and checks it is a layout this reader handles. The big block
 * offset tables are read later, only for the image a window is read from.
 * @param {number} index @param {Map<number, Entry>} entries @param {Reader} reader
 * @param {(offset: number, length: number) => Promise<Uint8Array>} bytesAt
 * @returns {Promise<TiffImage>}
 */
async function describeImage(index, entries, reader, bytesAt) {
  const one = async (/** @type {number} */ tag, /** @type {number} */ fallback) => (await tagValues(entries, tag, reader, bytesAt))?.[0] ?? fallback;
  const width = await one(TAG.width, 0);
  const height = await one(TAG.height, 0);
  const tiled = entries.has(TAG.tileOffsets);
  const spp = await one(TAG.samplesPerPixel, 1);
  if (spp !== 1) throw new Error(`image ${index}: ${spp} samples per pixel (only 1 is supported)`);
  const noDataText = await tagValues(entries, TAG.gdalNoData, reader, bytesAt);
  const noDataString = noDataText ? String.fromCharCode(...noDataText.filter((c) => c !== 0)).trim() : '';
  return {
    index,
    width,
    height,
    tiled,
    blockWidth: tiled ? await one(TAG.tileWidth, 0) : width,
    blockHeight: tiled ? await one(TAG.tileLength, 0) : Math.min(height, await one(TAG.rowsPerStrip, height)),
    bitsPerSample: await one(TAG.bitsPerSample, 1),
    sampleFormat: await one(TAG.sampleFormat, 1),
    compression: await one(TAG.compression, 1),
    predictor: await one(TAG.predictor, 1),
    noData: noDataString === '' ? null : Number(noDataString),
    geo: await readGeo(entries, reader, bytesAt),
    entries,
  };
}

/**
 * The lon/lat grid of an image from its GeoTIFF tags (a tie point and a pixel size), or null.
 * GeoTIFF's raster type key says whether the tie point is a pixel's corner (area, the usual) or
 * its centre (point); either way we return the grid by pixel centres' edges.
 * @param {Map<number, Entry>} entries @param {Reader} reader
 * @param {(offset: number, length: number) => Promise<Uint8Array>} bytesAt
 * @returns {Promise<GeoGrid | null>}
 */
async function readGeo(entries, reader, bytesAt) {
  const scale = await tagValues(entries, TAG.pixelScale, reader, bytesAt);
  const tie = await tagValues(entries, TAG.tiepoint, reader, bytesAt);
  if (!scale || !tie) return null;
  const keys = (await tagValues(entries, TAG.geoKeys, reader, bytesAt)) ?? [];
  let pixelIsPoint = false;
  for (let k = 4; k + 3 < keys.length; k += 4) {
    if (keys[k] === 1025 && keys[k + 1] === 0) pixelIsPoint = keys[k + 3] === 2; // GTRasterTypeGeoKey
  }
  const [i, j, , x, y] = tie;
  const shift = pixelIsPoint ? 0.5 : 0;
  return { west: x - (i + shift) * scale[0], north: y + (j + shift) * scale[1], dx: scale[0], dy: -scale[1] };
}

/** @type {WeakMap<TiffImage, { offsets: number[], counts: number[] }>} */
const blockTables = new WeakMap();

/**
 * The file offset and byte count of every block (tile or strip) of an image, read once.
 * @param {ByteSource} source @param {Reader} reader @param {TiffImage} image
 */
async function blocksOf(source, reader, image) {
  let t = blockTables.get(image);
  if (!t) {
    const bytesAt = (/** @type {number} */ o, /** @type {number} */ n) => source.read(o, n);
    const offsets = await tagValues(image.entries, image.tiled ? TAG.tileOffsets : TAG.stripOffsets, reader, bytesAt);
    const counts = await tagValues(image.entries, image.tiled ? TAG.tileByteCounts : TAG.stripByteCounts, reader, bytesAt);
    if (!offsets || !counts || offsets.length !== counts.length) throw new Error(`image ${image.index}: block tables missing`);
    t = { offsets, counts };
    blockTables.set(image, t);
  }
  return t;
}

/**
 * Reads a window of pixels: columns x0..x0+w-1, rows y0..y0+h-1 (row 0 at the top, as in the
 * file). Parts outside the image, and blocks the file leaves empty, read as `fill` (the image's
 * no-data value if it has one, else 0).
 * @param {ByteSource} source @param {Reader} reader @param {TiffImage} image
 * @param {number} x0 @param {number} y0 @param {number} w @param {number} h @param {{ fill?: number }} opts
 * @returns {Promise<Samples>}
 */
async function readWindow(source, reader, image, x0, y0, w, h, opts) {
  const out = newSamples(image, w * h);
  const fill = opts.fill ?? image.noData ?? 0;
  if (fill !== 0) out.fill(fill);
  const { offsets, counts } = await blocksOf(source, reader, image);
  const across = Math.ceil(image.width / image.blockWidth);
  const bx0 = Math.max(0, Math.floor(x0 / image.blockWidth));
  const bx1 = Math.min(across - 1, Math.floor((x0 + w - 1) / image.blockWidth));
  const by0 = Math.max(0, Math.floor(y0 / image.blockHeight));
  const by1 = Math.min(Math.ceil(image.height / image.blockHeight) - 1, Math.floor((y0 + h - 1) / image.blockHeight));
  /** @type {{ bx: number, by: number, i: number }[]} */
  const wanted = [];
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) {
      const i = by * across + bx;
      if (counts[i] > 0) wanted.push({ bx, by, i });
    }
  }
  if (source.prefetch) await source.prefetch(wanted.map(({ i }) => ({ offset: offsets[i], length: counts[i] })));
  for (const { bx, by, i } of wanted) {
    const raw = await source.read(offsets[i], counts[i]);
    const rows = image.tiled ? image.blockHeight : Math.min(image.blockHeight, image.height - by * image.blockHeight);
    const block = decodeBlock(image, reader, raw, image.blockWidth, rows);
    // A tile at the right or bottom edge is padded past the image: copy only the real pixels.
    const realCols = Math.min(image.blockWidth, image.width - bx * image.blockWidth);
    const realRows = Math.min(rows, image.height - by * image.blockHeight);
    copyBlock(block, image.blockWidth, realCols, realRows, bx * image.blockWidth, by * image.blockHeight, out, x0, y0, w, h);
  }
  return out;
}

/** An empty typed array of the image's sample type. @param {TiffImage} image @param {number} n @returns {Samples} */
function newSamples(image, n) {
  const { bitsPerSample: bits, sampleFormat: fmt } = image;
  if (fmt === 3 && bits === 32) return new Float32Array(n);
  if (bits === 8) return fmt === 2 ? new Int8Array(n) : new Uint8Array(n);
  if (bits === 16) return fmt === 2 ? new Int16Array(n) : new Uint16Array(n);
  if (bits === 32) return fmt === 2 ? new Int32Array(n) : new Uint32Array(n);
  throw new Error(`image ${image.index}: unsupported samples (${bits} bits, format ${fmt})`);
}

/**
 * Decompresses one block and turns it into samples in this machine's byte order, undoing the
 * predictor.
 * @param {TiffImage} image @param {Reader} reader @param {Uint8Array} raw @param {number} cols @param {number} rows
 * @returns {Samples}
 */
export function decodeBlock(image, reader, raw, cols, rows) {
  const bytesPer = image.bitsPerSample / 8;
  const size = cols * rows * bytesPer;
  /** @type {Uint8Array} */
  let bytes;
  if (image.compression === 1) bytes = raw;
  else if (image.compression === 5) bytes = lzwDecode(raw, size);
  else if (image.compression === 8 || image.compression === 32946) bytes = inflateSync(raw);
  else throw new Error(`image ${image.index}: unsupported compression ${image.compression}`);
  // A block that decodes short is damaged or was cut off in transfer. Never pad it with zeros:
  // that would quietly read as "no marsh" or "sea level" and poison the grids.
  if (bytes.length < size) {
    throw new Error(`image ${image.index}: a block gave ${bytes.length} bytes, expected ${size} (damaged or truncated data)`);
  }
  // Copy into an aligned buffer of exactly one block.
  const own = new Uint8Array(size);
  own.set(bytes.subarray(0, size));
  if (bytesPer > 1 && reader.le !== isLittleEndianMachine()) swapBytes(own, bytesPer);
  const samples = /** @type {Samples} */ (new (/** @type {any} */ (newSamples(image, 0)).constructor)(own.buffer));
  if (image.predictor === 2) undoHorizontalDifferencing(samples, cols, rows);
  else if (image.predictor !== 1) throw new Error(`image ${image.index}: unsupported predictor ${image.predictor}`);
  return samples;
}

/** @returns {boolean} */
function isLittleEndianMachine() {
  return new Uint8Array(Uint16Array.of(1).buffer)[0] === 1;
}

/** Reverses the byte order of every sample, in place. @param {Uint8Array} b @param {number} width */
function swapBytes(b, width) {
  for (let i = 0; i + width <= b.length; i += width) {
    for (let a = i, z = i + width - 1; a < z; a++, z--) { const t = b[a]; b[a] = b[z]; b[z] = t; }
  }
}

/**
 * Predictor 2 stores each sample as the difference from its left neighbour: add them back up.
 * Typed arrays wrap around on overflow, exactly as the TIFF spec's modular sums need.
 * @param {Samples} s @param {number} cols @param {number} rows
 */
function undoHorizontalDifferencing(s, cols, rows) {
  if (s instanceof Float32Array) throw new Error('predictor 2 on float samples');
  for (let r = 0; r < rows; r++) {
    const row = r * cols;
    for (let c = 1; c < cols; c++) s[row + c] += s[row + c - 1];
  }
}

/**
 * Copies the part of a decoded block that falls inside the window.
 * @param {Samples} block @param {number} bw the block's row length
 * @param {number} cols @param {number} rows how much of the block is real image
 * @param {number} bx0 @param {number} by0 block's top-left pixel
 * @param {Samples} out @param {number} x0 @param {number} y0 @param {number} w @param {number} h the window
 */
function copyBlock(block, bw, cols, rows, bx0, by0, out, x0, y0, w, h) {
  const cx0 = Math.max(x0, bx0);
  const cx1 = Math.min(x0 + w, bx0 + cols);
  const cy0 = Math.max(y0, by0);
  const cy1 = Math.min(y0 + h, by0 + rows);
  if (cx0 >= cx1 || cy0 >= cy1) return;
  for (let y = cy0; y < cy1; y++) {
    const from = (y - by0) * bw + (cx0 - bx0);
    out.set(block.subarray(from, from + (cx1 - cx0)), (y - y0) * w + (cx0 - x0));
  }
}

/**
 * TIFF's LZW: codes MSB-first, starting at 9 bits, with the "early change" (the code width grows
 * one code before the table fills), 256 = clear, 257 = end. Old-style (pre-1992, LSB-first) LZW
 * starts with a different bit pattern and is refused.
 *
 * A corrupt stream throws: a code may only name an entry already in the table, or the one being
 * defined right now. Without that check, a bad code can make two table entries point at each
 * other and the decoder would loop forever instead of failing.
 *
 * Returns the bytes decoded, at most `expected`: fewer when the stream ends early, so the caller
 * can tell a short block from a whole one.
 * @param {Uint8Array} src @param {number} expected bytes the block should give
 * @returns {Uint8Array}
 */
export function lzwDecode(src, expected) {
  if (src.length >= 2 && src[0] === 0 && (src[1] & 1) === 1) throw new Error('old-style LZW is not supported');
  const out = new Uint8Array(expected);
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const length = new Uint16Array(4096);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; length[i] = 1; }
  let op = 0;
  let next = 258;
  let bits = 9;
  let old = -1;
  let bitPos = 0;
  const totalBits = src.length * 8;

  /** Writes the string for a code into out; returns its first byte. @param {number} code */
  const emit = (code) => {
    const len = length[code];
    let c = code;
    const end = op + len;
    for (let k = end - 1; k >= op; k--) {
      if (k < expected) out[k] = suffix[c];
      c = prefix[c];
    }
    const first = op < expected ? out[op] : firstByte(code);
    op = end;
    return first;
  };
  /**
   * The first byte of a code's string, by walking to its root. Every entry's prefix is an older
   * entry, so the walk is at most 4096 steps; the bound is only a second guard.
   * @param {number} code
   */
  const firstByte = (code) => {
    let c = code;
    for (let steps = 0; prefix[c] >= 0; steps++) {
      if (steps > 4096) throw new Error('corrupt LZW data (a loop in the code table)');
      c = prefix[c];
    }
    return suffix[c];
  };
  /** Adds old's string plus one byte to the table. @param {number} byte */
  const define = (byte) => {
    if (next < 4096) { prefix[next] = old; suffix[next] = byte; length[next] = length[old] + 1; next++; }
  };

  while (bitPos + bits <= totalBits && op < expected) {
    // Read `bits` bits, most significant first; at most 12 bits span at most 3 bytes.
    const byte = bitPos >>> 3;
    const word = (src[byte] << 16) | ((src[byte + 1] ?? 0) << 8) | (src[byte + 2] ?? 0);
    const code = (word >>> (24 - (bitPos & 7) - bits)) & ((1 << bits) - 1);
    bitPos += bits;
    if (code === 257) break;
    if (code === 256) { next = 258; bits = 9; old = -1; continue; }
    if (old === -1) {
      // Straight after a clear only a single byte can come: the table holds nothing else yet.
      if (code > 255) throw new Error(`corrupt LZW data (code ${code} straight after a clear)`);
      emit(code);
      old = code;
      continue;
    }
    if (code < next) {
      define(emit(code));
    } else if (code === next && next < 4096) {
      // The code being defined right now: old's string plus its own first byte.
      define(firstByte(old));
      emit(code);
    } else {
      throw new Error(`corrupt LZW data (code ${code} is not in the table, which ends at ${next - 1})`);
    }
    old = code;
    if (next + 1 >= (1 << bits) && bits < 12) bits++;
  }
  return op >= expected ? out : out.subarray(0, op);
}

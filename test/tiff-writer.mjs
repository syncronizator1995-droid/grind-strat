// @ts-check
// Writes small synthetic TIFF and BigTIFF files for the reader's tests: strips or tiles, no
// compression, LZW or DEFLATE, predictor 1 or 2, uint8 or int16, either byte order, several
// images (like a COG's overviews), and GeoTIFF tie point, pixel size and GDAL no-data tags.
// Independent of tools/map/tiff.mjs on purpose, so the two check each other.

import { deflateSync } from 'node:zlib';

/**
 * @typedef {object} ImageSpec
 * @property {number} width
 * @property {number} height
 * @property {number[]} values row 0 at the top
 * @property {8 | 16} bits
 * @property {boolean} [signed]
 * @property {[number, number]} [tile] tile width and height (multiples of 16), or strips if absent
 * @property {number} [rowsPerStrip]
 * @property {1 | 5 | 8 | 32946} [compression]
 * @property {1 | 2} [predictor]
 * @property {{ west: number, north: number, dx: number, dy: number }} [geo] dy positive (degrees per row going south)
 * @property {number} [noData]
 */

/**
 * @param {{ images: ImageSpec[], big?: boolean, littleEndian?: boolean, padBefore?: number }} spec
 * @returns {Uint8Array}
 */
export function writeTiff({ images, big = false, littleEndian = true, padBefore = 0 }) {
  const out = new Growable(littleEndian);
  out.bytes([littleEndian ? 0x49 : 0x4d, littleEndian ? 0x49 : 0x4d]);
  out.u16(big ? 43 : 42);
  if (big) { out.u16(8); out.u16(0); }
  const firstIfdAt = out.length;
  big ? out.u64(0) : out.u32(0);
  out.bytes(new Uint8Array(padBefore));

  // Pixel data first, then the IFDs at the end (so the IFD may lie past the first 64 KB).
  const blockInfo = images.map((img) => writeBlocks(out, img, littleEndian));
  let linkAt = firstIfdAt;
  images.forEach((img, k) => {
    out.align();
    const at = out.length;
    out.patch(linkAt, at, big);
    linkAt = writeIfd(out, img, blockInfo[k], big);
  });
  return out.result();
}

/**
 * Splits an image into blocks, applies the predictor, encodes and compresses each block.
 * @param {Growable} out @param {ImageSpec} img @param {boolean} le
 */
function writeBlocks(out, img, le) {
  const tiled = !!img.tile;
  const bw = tiled ? /** @type {[number, number]} */ (img.tile)[0] : img.width;
  const bh = tiled ? /** @type {[number, number]} */ (img.tile)[1] : (img.rowsPerStrip ?? img.height);
  const across = Math.ceil(img.width / bw);
  const down = Math.ceil(img.height / bh);
  const offsets = []; const counts = [];
  for (let by = 0; by < down; by++) {
    for (let bx = 0; bx < across; bx++) {
      const rows = tiled ? bh : Math.min(bh, img.height - by * bh);
      const samples = new Array(bw * rows).fill(0);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < bw; x++) {
          const gx = bx * bw + x; const gy = by * bh + y;
          if (gx < img.width && gy < img.height) samples[y * bw + x] = img.values[gy * img.width + gx];
        }
      }
      if (img.predictor === 2) {
        for (let y = 0; y < rows; y++) for (let x = bw - 1; x > 0; x--) samples[y * bw + x] -= samples[y * bw + x - 1];
      }
      const raw = encodeSamples(samples, img.bits, le);
      const comp = img.compression ?? 1;
      const data = comp === 1 ? raw : comp === 5 ? lzwEncode(raw) : new Uint8Array(deflateSync(raw));
      offsets.push(out.length);
      counts.push(data.length);
      out.bytes(data);
    }
  }
  return { offsets, counts, bw, bh, tiled };
}

/** Samples to bytes, wrapping like the file's integer type. @param {number[]} s @param {number} bits @param {boolean} le */
function encodeSamples(s, bits, le) {
  const bytes = new Uint8Array(s.length * (bits / 8));
  const dv = new DataView(bytes.buffer);
  s.forEach((v, i) => { if (bits === 8) dv.setUint8(i, v & 0xff); else dv.setUint16(i * 2, v & 0xffff, le); });
  return bytes;
}

/**
 * @param {Growable} out @param {ImageSpec} img
 * @param {{ offsets: number[], counts: number[], bw: number, bh: number, tiled: boolean }} b @param {boolean} big
 * @returns {number} where the next-IFD link was written
 */
function writeIfd(out, img, b, big) {
  const LONG = 4; const SHORT = 3; const DOUBLE = 12; const ASCII = 2; const LONG8 = 16;
  const offType = big ? LONG8 : LONG;
  /** @type {[number, number, number[]][]} tag, type, values */
  const entries = [
    [256, LONG, [img.width]], [257, LONG, [img.height]], [258, SHORT, [img.bits]], [259, SHORT, [img.compression ?? 1]],
    [262, SHORT, [1]], [277, SHORT, [1]], [284, SHORT, [1]], [317, SHORT, [img.predictor ?? 1]], [339, SHORT, [img.signed ? 2 : 1]],
  ];
  if (b.tiled) entries.push([322, LONG, [b.bw]], [323, LONG, [b.bh]], [324, offType, b.offsets], [325, offType, b.counts]);
  else entries.push([273, offType, b.offsets], [278, LONG, [b.bh]], [279, offType, b.counts]);
  if (img.geo) {
    entries.push([33550, DOUBLE, [img.geo.dx, img.geo.dy, 0]], [33922, DOUBLE, [0, 0, 0, img.geo.west, img.geo.north, 0]]);
  }
  if (img.noData !== undefined) entries.push([42113, ASCII, [...`${img.noData}\0`].map((c) => c.charCodeAt(0))]);
  entries.sort((a, c) => a[0] - c[0]);

  /** @type {Record<number, number>} bytes per value of each field type */
  const size = { [SHORT]: 2, [LONG]: 4, [DOUBLE]: 8, [ASCII]: 1, [LONG8]: 8 };
  const inlineMax = big ? 8 : 4;
  // Values too big to sit in their entry go after the IFD.
  const entryBytes = big ? 20 : 12;
  const ifdStart = out.length;
  const ifdLength = (big ? 8 : 2) + entries.length * entryBytes + (big ? 8 : 4);
  let extraAt = ifdStart + ifdLength;
  const extras = [];
  big ? out.u64(entries.length) : out.u16(entries.length);
  for (const [tag, type, values] of entries) {
    out.u16(tag); out.u16(type);
    big ? out.u64(values.length) : out.u32(values.length);
    const n = size[type] * values.length;
    if (n <= inlineMax) {
      const start = out.length;
      writeValues(out, type, values);
      out.bytes(new Uint8Array(inlineMax - (out.length - start)));
    } else {
      big ? out.u64(extraAt) : out.u32(extraAt);
      extras.push([type, values]);
      extraAt += n;
    }
  }
  const linkAt = out.length;
  big ? out.u64(0) : out.u32(0);
  for (const [type, values] of /** @type {[number, number[]][]} */ (extras)) writeValues(out, type, values);
  return linkAt;
}

/** @param {Growable} out @param {number} type @param {number[]} values */
function writeValues(out, type, values) {
  for (const v of values) {
    if (type === 3) out.u16(v);
    else if (type === 4) out.u32(v);
    else if (type === 16) out.u64(v);
    else if (type === 12) out.f64(v);
    else out.bytes([v]);
  }
}

/** TIFF LZW (MSB-first, early change, clear at the start and when the table fills). @param {Uint8Array} data */
export function lzwEncode(data) {
  /** @type {number[]} */ const bytes = [];
  let acc = 0; let nacc = 0;
  const put = (/** @type {number} */ code, /** @type {number} */ bits) => {
    acc = (acc << bits) | code; nacc += bits;
    while (nacc >= 8) { bytes.push((acc >>> (nacc - 8)) & 0xff); nacc -= 8; }
    acc &= (1 << nacc) - 1;
  };
  let dict = new Map(); let next = 258; let bits = 9;
  put(256, bits);
  if (!data.length) { put(257, bits); if (nacc) bytes.push((acc << (8 - nacc)) & 0xff); return Uint8Array.from(bytes); }
  let w = data[0];
  for (let i = 1; i < data.length; i++) {
    const k = data[i];
    const key = w * 256 + k;
    const found = dict.get(key);
    if (found !== undefined) { w = found; continue; }
    put(w, bits);
    dict.set(key, next++);
    w = k;
    if (next === 4094) { put(256, bits); dict = new Map(); next = 258; bits = 9; }
    else if (next > (1 << bits) - 1) bits++;
  }
  put(w, bits);
  next++;
  if (next > (1 << bits) - 1 && bits < 12) bits++;
  put(257, bits);
  if (nacc) bytes.push((acc << (8 - nacc)) & 0xff);
  return Uint8Array.from(bytes);
}

/** A byte buffer that grows. */
class Growable {
  /** @param {boolean} le */
  constructor(le) { this.le = le; this.buf = new Uint8Array(1024); this.length = 0; }
  /** @param {number} n */
  room(n) {
    if (this.length + n <= this.buf.length) return;
    const b = new Uint8Array(Math.max(this.buf.length * 2, this.length + n));
    b.set(this.buf); this.buf = b;
  }
  /** @param {ArrayLike<number>} b */
  bytes(b) { this.room(b.length); this.buf.set(b, this.length); this.length += b.length; }
  /** @param {number} n @param {(dv: DataView, at: number) => void} f */
  write(n, f) { this.room(n); f(new DataView(this.buf.buffer), this.length); this.length += n; }
  /** @param {number} v */ u16(v) { this.write(2, (d, a) => d.setUint16(a, v, this.le)); }
  /** @param {number} v */ u32(v) { this.write(4, (d, a) => d.setUint32(a, v, this.le)); }
  /** @param {number} v */ u64(v) { this.write(8, (d, a) => d.setBigUint64(a, BigInt(v), this.le)); }
  /** @param {number} v */ f64(v) { this.write(8, (d, a) => d.setFloat64(a, v, this.le)); }
  align() { if (this.length % 2) this.bytes([0]); }
  /** Writes an offset at an earlier position. @param {number} at @param {number} v @param {boolean} big */
  patch(at, v, big) {
    const d = new DataView(this.buf.buffer);
    if (big) d.setBigUint64(at, BigInt(v), this.le); else d.setUint32(at, v, this.le);
  }
  result() { return this.buf.slice(0, this.length); }
}

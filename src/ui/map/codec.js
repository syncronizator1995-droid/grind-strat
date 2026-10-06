// @ts-check
// The packed format for map data. One place for both directions: tools/map writes it at build
// time, the game reads it at start-up. Everything is whole numbers in game units (100 m).
//
// A "shape set" is a list of lines or rings. Each shape is stored as its point count, its first
// point, then the step from each point to the next. Steps are small, so they are written as
// variable-length numbers (LEB128, with zigzag for negatives), which also compress well.
// The bytes are then deflated (zlib) and turned into base64 text to sit inside the one game file.

/** @typedef {Int32Array} Shape flat [x0, y0, x1, y1, ...] in game units */

/** Grows a byte buffer as numbers are written. */
class Writer {
  constructor() {
    this.bytes = new Uint8Array(1024);
    this.length = 0;
  }

  /** @param {number} value a whole number from 0 up */
  uint(value) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`not a whole number from 0: ${value}`);
    let v = value;
    do {
      if (this.length === this.bytes.length) {
        const bigger = new Uint8Array(this.bytes.length * 2);
        bigger.set(this.bytes);
        this.bytes = bigger;
      }
      let byte = v % 128;
      v = Math.floor(v / 128);
      if (v > 0) byte |= 128;
      this.bytes[this.length++] = byte;
    } while (v > 0);
  }

  /** @param {number} value any whole number */
  int(value) {
    this.uint(value >= 0 ? value * 2 : -value * 2 - 1);
  }

  done() {
    return this.bytes.slice(0, this.length);
  }
}

/** Reads numbers back from bytes. */
export class Reader {
  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    this.bytes = bytes;
    this.at = 0;
  }

  uint() {
    let value = 0;
    let scale = 1;
    for (;;) {
      if (this.at >= this.bytes.length) throw new RangeError('map data ends too early');
      const byte = this.bytes[this.at++];
      value += (byte & 127) * scale;
      if (byte < 128) return value;
      scale *= 128;
    }
  }

  int() {
    const v = this.uint();
    return v % 2 === 0 ? v / 2 : -(v + 1) / 2;
  }
}

/**
 * Packs a list of shapes.
 * @param {ArrayLike<number>[]} shapes each flat [x0, y0, x1, y1, ...] in whole game units
 * @returns {Uint8Array}
 */
export function encodeShapes(shapes) {
  const w = new Writer();
  w.uint(shapes.length);
  for (const s of shapes) {
    if (s.length % 2 !== 0) throw new RangeError('a shape needs pairs of numbers');
    const n = s.length / 2;
    w.uint(n);
    if (n === 0) continue;
    w.uint(s[0]);
    w.uint(s[1]);
    for (let i = 2; i < s.length; i += 2) {
      w.int(s[i] - s[i - 2]);
      w.int(s[i + 1] - s[i - 1]);
    }
  }
  return w.done();
}

/**
 * Unpacks a list of shapes.
 * @param {Uint8Array} bytes
 * @returns {Shape[]}
 */
export function decodeShapes(bytes) {
  const r = new Reader(bytes);
  const count = r.uint();
  /** @type {Shape[]} */
  const shapes = [];
  for (let k = 0; k < count; k++) {
    const n = r.uint();
    const s = new Int32Array(n * 2);
    if (n > 0) {
      s[0] = r.uint();
      s[1] = r.uint();
      for (let i = 2; i < s.length; i += 2) {
        s[i] = s[i - 2] + r.int();
        s[i + 1] = s[i - 1] + r.int();
      }
    }
    shapes.push(s);
  }
  if (r.at !== bytes.length) throw new RangeError('map data has bytes left over');
  return shapes;
}

/**
 * Packs points as one shape-like list: [count, x0, y0, steps...].
 * @param {ArrayLike<number>} flat [x0, y0, x1, y1, ...]
 */
export function encodePoints(flat) {
  return encodeShapes([flat]);
}

/** @param {Uint8Array} bytes */
export function decodePoints(bytes) {
  return decodeShapes(bytes)[0] ?? new Int32Array(0);
}

/**
 * Joins named byte blocks into one, so the game unpacks a single compressed block at start-up
 * (one decompression is much faster than many small ones).
 * @param {Record<string, Uint8Array>} blocks
 * @returns {Uint8Array}
 */
export function bundleBlocks(blocks) {
  const names = Object.keys(blocks);
  const w = new Writer();
  w.uint(names.length);
  for (const name of names) {
    w.uint(name.length);
    for (let i = 0; i < name.length; i++) w.uint(name.charCodeAt(i));
    w.uint(blocks[name].length);
  }
  const head = w.done();
  const total = head.length + names.reduce((n, k) => n + blocks[k].length, 0);
  const out = new Uint8Array(total);
  out.set(head, 0);
  let at = head.length;
  for (const name of names) {
    out.set(blocks[name], at);
    at += blocks[name].length;
  }
  return out;
}

/**
 * Splits a bundle back into its named blocks (views into the same bytes, no copying).
 * @param {Uint8Array} bundle
 * @returns {Record<string, Uint8Array>}
 */
export function unbundleBlocks(bundle) {
  const r = new Reader(bundle);
  const count = r.uint();
  /** @type {[string, number][]} */
  const index = [];
  for (let k = 0; k < count; k++) {
    const len = r.uint();
    let name = '';
    for (let i = 0; i < len; i++) name += String.fromCharCode(r.uint());
    index.push([name, r.uint()]);
  }
  /** @type {Record<string, Uint8Array>} */
  const blocks = {};
  let at = r.at;
  for (const [name, size] of index) {
    if (at + size > bundle.length) throw new RangeError(`map block ${name} runs past the end`);
    blocks[name] = bundle.subarray(at, at + size);
    at += size;
  }
  if (at !== bundle.length) throw new RangeError('map bundle has bytes left over');
  return blocks;
}

/** @param {string} text base64 */
export function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Inflates zlib-deflated bytes with the browser's built-in decompression (Chrome 80+,
 * Safari 16.4+). No fetch: the data is already inside the page.
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
export async function inflate(bytes) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

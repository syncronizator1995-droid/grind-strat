// @ts-check
// A tiny PNG encoder for build-time preview pictures (8-bit RGB, no filtering, zlib from Node).

import { deflateSync } from 'node:zlib';

/** CRC-32 table (the PNG and zlib polynomial). */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** @param {Uint8Array} bytes */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: length, type, data, CRC of type + data. @param {string} type @param {Uint8Array} data */
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Encodes an RGB image (3 bytes per pixel, rows from the top) as a PNG file.
 * @param {number} width @param {number} height @param {Uint8Array} rgb
 * @returns {Uint8Array}
 */
export function encodePng(width, height, rgb) {
  if (rgb.length !== width * height * 3) throw new Error('encodePng: wrong pixel count');
  const header = new Uint8Array(13);
  const dv = new DataView(header.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, deflate, no filter method, no interlace
  // Each row starts with its filter type (0: none).
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (1 + width * 3) + 1);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 6 }))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

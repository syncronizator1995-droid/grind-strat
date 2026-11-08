// @ts-check
// A tiny zip reader for the map tools (the standard library has none): reads the central
// directory and extracts files that are stored or deflated. Enough for DATED-1's shapefile zip.

import { inflateRawSync } from 'node:zlib';

/**
 * The files of a zip by name.
 * @param {Uint8Array} zip
 * @returns {Map<string, () => Uint8Array>} name to a function that extracts it
 */
export function zipFiles(zip) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip file (no end-of-directory record)');
  const count = dv.getUint16(end + 10, true);
  let at = dv.getUint32(end + 16, true);
  const names = new TextDecoder('utf-8');
  /** @type {Map<string, () => Uint8Array>} */
  const out = new Map();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(at, true) !== 0x02014b50) throw new Error('bad zip central directory');
    const method = dv.getUint16(at + 10, true);
    const compressed = dv.getUint32(at + 20, true);
    const size = dv.getUint32(at + 24, true);
    const nameLen = dv.getUint16(at + 28, true);
    const extraLen = dv.getUint16(at + 30, true);
    const commentLen = dv.getUint16(at + 32, true);
    const local = dv.getUint32(at + 42, true);
    const name = names.decode(zip.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    out.set(name, () => {
      if (dv.getUint32(local, true) !== 0x04034b50) throw new Error(`bad zip local header for ${name}`);
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = zip.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method !== 8) throw new Error(`${name}: zip method ${method} is not supported`);
      const bytes = new Uint8Array(inflateRawSync(data));
      if (bytes.length !== size) throw new Error(`${name}: unzipped size ${bytes.length}, expected ${size}`);
      return bytes;
    });
  }
  return out;
}

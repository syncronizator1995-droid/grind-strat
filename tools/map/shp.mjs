// @ts-check
// A small reader for ESRI shapefiles (polygons only), for the map tools: DATED-1's ice-sheet
// margins come as shapefiles. A .shp holds a 100-byte header and then records; a polygon record
// (shape type 5, or 15 and 25 with Z and M values, which are dropped) holds its rings as parts of
// one point list. Rings are returned as flat [x0, y0, x1, y1, ...] in the file's own units; a
// record's rings are filled together with the even-odd rule, which turns holes into holes.
// Anything that is not a polygon (or a null shape) is refused, never guessed.
//
// The .dbf (attributes) is read just far enough to list its rows' values as text, so a build can
// check which slice it holds.

/**
 * @typedef {object} ShapeRecord
 * @property {number} number the record number in the file (from 1)
 * @property {number[][]} rings flat [x0, y0, ...]; clockwise rings are outer, counter-clockwise are holes
 * @property {[number, number, number, number]} box xmin, ymin, xmax, ymax
 */

/**
 * @param {Uint8Array} bytes the .shp file
 * @returns {ShapeRecord[]}
 */
export function parseShp(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 100 || dv.getInt32(0, false) !== 9994) throw new Error('not a shapefile (bad magic number)');
  const fileBytes = dv.getInt32(24, false) * 2;
  if (fileBytes !== bytes.length) throw new Error(`shapefile says ${fileBytes} bytes but has ${bytes.length}`);
  /** @type {ShapeRecord[]} */
  const out = [];
  let at = 100;
  while (at < bytes.length) {
    const number = dv.getInt32(at, false);
    const length = dv.getInt32(at + 4, false) * 2;
    const body = at + 8;
    const type = dv.getInt32(body, true);
    if (type !== 0) {
      if (type !== 5 && type !== 15 && type !== 25) throw new Error(`record ${number}: shape type ${type} is not a polygon`);
      const box = /** @type {[number, number, number, number]} */ ([0, 1, 2, 3].map((k) => dv.getFloat64(body + 4 + k * 8, true)));
      const nParts = dv.getInt32(body + 36, true);
      const nPoints = dv.getInt32(body + 40, true);
      const partsAt = body + 44;
      const pointsAt = partsAt + nParts * 4;
      const starts = Array.from({ length: nParts }, (_, k) => dv.getInt32(partsAt + k * 4, true));
      starts.push(nPoints);
      /** @type {number[][]} */
      const rings = [];
      for (let k = 0; k < nParts; k++) {
        const ring = new Array((starts[k + 1] - starts[k]) * 2);
        for (let p = starts[k]; p < starts[k + 1]; p++) {
          ring[(p - starts[k]) * 2] = dv.getFloat64(pointsAt + p * 16, true);
          ring[(p - starts[k]) * 2 + 1] = dv.getFloat64(pointsAt + p * 16 + 8, true);
        }
        rings.push(ring);
      }
      out.push({ number, rings, box });
    }
    at = body + length;
  }
  return out;
}

/**
 * The values of a .dbf as text, one array per row (deleted rows left out).
 * @param {Uint8Array} bytes
 * @returns {{ names: string[], rows: string[][] }}
 */
export function parseDbf(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nRows = dv.getUint32(4, true);
  const headerLen = dv.getUint16(8, true);
  const rowLen = dv.getUint16(10, true);
  const text = new TextDecoder('latin1');
  /** @type {{ name: string, len: number }[]} */
  const fields = [];
  for (let at = 32; bytes[at] !== 0x0d && at < headerLen; at += 32) {
    fields.push({ name: text.decode(bytes.subarray(at, at + 11)).replace(/\0.*$/, ''), len: bytes[at + 16] });
  }
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const row = headerLen + r * rowLen;
    if (bytes[row] === 0x2a) continue;
    let at = row + 1;
    rows.push(fields.map((f) => { const v = text.decode(bytes.subarray(at, at + f.len)).trim(); at += f.len; return v; }));
  }
  return { names: fields.map((f) => f.name), rows };
}

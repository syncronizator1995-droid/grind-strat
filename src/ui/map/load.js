// @ts-check
// Turns the packed map data inside the game file into ready-to-draw shapes and grids.
// All layers travel as one compressed bundle: one decompression at start-up instead of many.

import { decodePoints, decodeShapes, fromBase64, inflate, unbundleBlocks } from './codec.js';

/**
 * @typedef {object} PackedMap
 * @property {string} kind
 * @property {string} [invented] what is made up, shown to the player
 * @property {{ width: number, height: number }} meta
 * @property {{ name: string, weight: number }[]} riverInfo
 * @property {number[]} seen
 * @property {{ cols: number, rows: number, cell: number }} terrain
 * @property {{ cols: number, rows: number, cell: number }} height
 * @property {string} bundle base64 of the deflated bundle of all layers
 */

/**
 * @typedef {object} Grid
 * @property {number} cols @property {number} rows @property {number} cell game units per cell
 * @property {Uint8Array} data row 0 at the south
 */

/**
 * @typedef {object} MapData
 * @property {string} kind
 * @property {string} invented
 * @property {number} width @property {number} height game units
 * @property {Int32Array[]} land @property {Int32Array[]} coast @property {Int32Array[]} lakes
 * @property {Int32Array[]} rivers
 * @property {{ name: string, weight: number }[]} riverInfo
 * @property {Int32Array[]} provinces @property {Int32Array[]} borders @property {Uint8Array} borderKinds
 * @property {Int32Array} points @property {Uint8Array} pointKinds
 * @property {number[]} seen
 * @property {Grid} terrain @property {Grid} heights land height, 0 to 255
 */

/**
 * @typedef {object} LoadTimes
 * @property {number} base64Ms @property {number} inflateMs @property {number} decodeMs
 */

/**
 * @param {PackedMap} packed
 * @returns {Promise<{ map: MapData, times: LoadTimes }>}
 */
export async function loadMap(packed) {
  const t0 = performance.now();
  const compressed = fromBase64(packed.bundle);
  const t1 = performance.now();
  const b = unbundleBlocks(await inflate(compressed));
  const t2 = performance.now();
  /** @param {string} name */
  const block = (name) => {
    const bytes = b[name];
    if (!bytes) throw new Error(`the map is missing its ${name} layer`);
    return bytes;
  };
  /** @type {MapData} */
  const map = {
    kind: packed.kind,
    invented: packed.invented ?? '',
    width: packed.meta.width,
    height: packed.meta.height,
    land: decodeShapes(block('land')),
    coast: decodeShapes(block('coast')),
    lakes: decodeShapes(block('lakes')),
    rivers: decodeShapes(block('rivers')),
    riverInfo: packed.riverInfo,
    provinces: decodeShapes(block('provinces')),
    borders: decodeShapes(block('borders')),
    borderKinds: block('borderKinds'),
    points: decodePoints(block('points')),
    pointKinds: block('pointKinds'),
    seen: packed.seen,
    terrain: { ...packed.terrain, data: block('terrain') },
    heights: { ...packed.height, data: block('height') },
  };
  const t3 = performance.now();
  return { map, times: { base64Ms: t1 - t0, inflateMs: t2 - t1, decodeMs: t3 - t2 } };
}

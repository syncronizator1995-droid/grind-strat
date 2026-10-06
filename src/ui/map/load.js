// @ts-check
// Turns the data blocks inside the game page into ready-to-draw shapes and grids. Each block is
// one compressed bundle of layers (tools/map/block.mjs writes them; the build puts each into the
// page as <script type="application/json" id="gs-<kind>">).

import { decodeGrid16, decodeShapes, decodeUints, fromBase64, inflate, unbundleBlocks } from './codec.js';

/**
 * @typedef {object} PackedBlock
 * @property {string} kind @property {number} format @property {string} licence @property {string} notice
 * @property {string[]} sources @property {boolean} [interim]
 * @property {Record<string, any>} meta
 * @property {string} bundle base64 of the deflated bundle of the block's layers
 */

/**
 * @typedef {object} Grid
 * @property {number} cols @property {number} rows @property {number} cell game units per cell
 * @property {Uint8Array} data row 0 at the south
 */

/**
 * @typedef {object} HeightGrid
 * @property {number} cols @property {number} rows @property {number} cell
 * @property {Int16Array} data metres, sea depth negative, row 0 at the south
 */

/**
 * @typedef {object} RiverInfo
 * @property {string} name today's local name @property {Record<string, string>} names
 * @property {string | null} wikidata @property {number} lengthKm
 */

/**
 * @typedef {object} LakeInfo
 * @property {string} name @property {Record<string, string>} names @property {string | null} wikidata
 * @property {number} areaKm2 @property {[number, number]} at where its name goes
 */

/**
 * @typedef {object} WaterData
 * @property {Int32Array[]} rivers @property {Uint8Array} riverLevels one per point
 * @property {Uint32Array} riverOf which river each line belongs to @property {RiverInfo[]} riverInfo
 * @property {Int32Array[]} lakes rings @property {Uint8Array} lakeLevels
 * @property {Uint32Array} lakeOf which lake each ring belongs to @property {LakeInfo[]} lakeInfo
 */

/**
 * @typedef {object} MapData
 * @property {number} width @property {number} height game units
 * @property {Int32Array[]} land rings clipped to the map; their outline is the coast
 * @property {Uint8Array} landLevels the zoom level each land point first shows at (one per point)
 * @property {HeightGrid} heights
 * @property {Grid} terrain
 * @property {WaterData | null} water null until the water block is unpacked
 * @property {Int32Array[]} provinces @property {Int32Array[]} borders @property {Uint8Array} borderKinds
 * @property {Int32Array} points @property {Uint8Array} pointKinds
 * @property {number[]} seen provinces the player has seen (fog of war)
 */

/**
 * @typedef {object} LoadTimes
 * @property {number} base64Ms @property {number} inflateMs @property {number} decodeMs
 */

/** A start-up timer that adds up across blocks. @returns {LoadTimes} */
export const noTimes = () => ({ base64Ms: 0, inflateMs: 0, decodeMs: 0 });

/**
 * Inflates data blocks' bundles into their named layers. The blocks are inflated side by side:
 * the browser decompresses streams in the background, so two take little longer than one.
 * @param {PackedBlock[]} blocks
 * @param {LoadTimes} times added to
 */
async function unpackBlocks(blocks, times) {
  const t0 = performance.now();
  const compressed = blocks.map((block) => {
    if (block.format !== 1) throw new Error(`the ${block.kind} data is in a format this game can't read (${block.format})`);
    return fromBase64(block.bundle);
  });
  const t1 = performance.now();
  const inflated = await Promise.all(compressed.map((bytes) => inflate(bytes)));
  times.base64Ms += t1 - t0;
  times.inflateMs += performance.now() - t1;
  return blocks.map((block, k) => layerReader(block, unbundleBlocks(inflated[k])));
}

/**
 * @param {PackedBlock} block @param {Record<string, Uint8Array>} layers
 */
function layerReader(block, layers) {
  /** @param {string} name */
  return (name) => {
    const bytes = layers[name];
    if (!bytes) throw new Error(`the ${block.kind} data is missing its ${name} layer`);
    return bytes;
  };
}

/**
 * Unpacks the land, heights and terrain: everything the first picture of the map needs.
 * Provinces and points return in step 2b; until then the map has none.
 * @param {PackedBlock} base @param {PackedBlock} terrain
 * @returns {Promise<{ map: MapData, times: LoadTimes }>}
 */
export async function loadMap(base, terrain) {
  const times = noTimes();
  const [b, t] = await unpackBlocks([base, terrain], times);
  const t0 = performance.now();
  const heights = decodeGrid16(b('heights'));
  const tg = terrain.meta.terrain;
  /** @type {MapData} */
  const map = {
    width: base.meta.width,
    height: base.meta.height,
    land: decodeShapes(b('land')),
    landLevels: b('landLevels'),
    heights: { ...heights, cell: base.meta.heights.cell },
    terrain: { cols: tg.cols, rows: tg.rows, cell: tg.cell, data: t('terrain') },
    water: null,
    provinces: [],
    borders: [],
    borderKinds: new Uint8Array(0),
    points: new Int32Array(0),
    pointKinds: new Uint8Array(0),
    seen: [],
  };
  if (map.terrain.data.length !== tg.cols * tg.rows) throw new Error('the terrain data is the wrong size');
  times.decodeMs += performance.now() - t0;
  return { map, times };
}

/**
 * Unpacks the rivers and lakes.
 * @param {PackedBlock & { riverInfo: RiverInfo[], lakeInfo: LakeInfo[] }} block
 * @param {LoadTimes} times added to
 * @returns {Promise<WaterData>}
 */
export async function loadWater(block, times) {
  const [w] = await unpackBlocks([block], times);
  const t0 = performance.now();
  /** @type {WaterData} */
  const water = {
    rivers: decodeShapes(w('rivers')),
    riverLevels: w('riverLevels'),
    riverOf: decodeUints(w('riverOf')),
    riverInfo: block.riverInfo,
    lakes: decodeShapes(w('lakes')),
    lakeLevels: w('lakeLevels'),
    lakeOf: decodeUints(w('lakeOf')),
    lakeInfo: block.lakeInfo,
  };
  if (water.riverOf.length !== water.rivers.length || water.lakeOf.length !== water.lakes.length) {
    throw new Error('the water data does not add up');
  }
  times.decodeMs += performance.now() - t0;
  return water;
}

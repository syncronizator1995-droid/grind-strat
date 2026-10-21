// @ts-check
// Turns the data blocks inside the game page into ready-to-draw shapes and grids. Each block is
// one compressed bundle of layers (tools/map/block.mjs writes them; the build puts each into the
// page as <script type="application/json" id="gs-<kind>">).

import { createCoast } from '../../sim/coast-date.js';
import { timelineFromBlock } from '../../sim/map-date.js';
import { decodeGrid16, decodeShapes, decodeUints, fromBase64, inflate, unbundleBlocks } from './codec.js';
import { shoreSquares } from './shore.js';

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
 * @property {string} name the name the map shows, in Latin letters: the local one where the data
 *   has it (for OpenStreetMap's, the local name at the river's lower end), otherwise the English
 *   one ('' for none)
 * @property {string} [local] the name as the data has it, where the map shows it otherwise
 *   (romanised from Cyrillic, one of two names, or without an abbreviation)
 * @property {'ru' | 'be' | 'uk'} [lang] the language a romanised name was written in
 * @property {Record<string, string>} names the other names, by language code; Natural Earth's
 *   also "alt" (its other names, "|" between them) and "ne" (its main name, when another is shown)
 * @property {string | null} wikidata @property {number} lengthKm
 */

/**
 * @typedef {object} LakeInfo
 * @property {string} name the name the map shows, in Latin letters
 * @property {string} [local] @property {'ru' | 'be' | 'uk'} [lang] as for a river
 * @property {Record<string, string>} names @property {string | null} wikidata
 * @property {number} areaKm2 @property {[number, number]} at where its name goes
 */

/**
 * @typedef {object} WaterData
 * @property {Int32Array[]} rivers @property {Uint8Array} riverLevels one per point
 * @property {Uint32Array} riverOf which river each line belongs to @property {RiverInfo[]} riverInfo
 * @property {Uint32Array | null} lineName per line, its local name in lineNames (0: none, the
 *   river's own name serves); null when the data has no names per line
 * @property {string[]} lineNames the labels of stretches of rivers that have a local name of
 *   their own, in Latin letters ('' first)
 * @property {string[]} lineLocal for each of lineNames, the name as the data has it ('' when the same)
 * @property {Int32Array[]} lakes rings @property {Uint8Array} lakeLevels
 * @property {Uint32Array} lakeOf which lake each ring belongs to @property {LakeInfo[]} lakeInfo
 * @property {Uint32Array | null} [lineTag] per line, its date tag (an index into tags; 0: shown at
 *   every date); null or missing when nothing is dated
 * @property {Uint32Array | null} [lakeTag] the same per lake (one per lakeInfo entry)
 * @property {string[]} [tags] the date tags' names ('' first): our dated entries' ids, or
 *   "osm-year-<year>" for a year from OpenStreetMap (src/ui/map/water-tiles.js tagsOnAt)
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
 * A block's layers by name: the reader throws for a missing layer; reader.has tells first.
 * @param {PackedBlock} block @param {Record<string, Uint8Array>} layers
 */
function layerReader(block, layers) {
  /** @param {string} name */
  const read = (name) => {
    const bytes = layers[name];
    if (!bytes) throw new Error(`the ${block.kind} data is missing its ${name} layer`);
    return bytes;
  };
  read.has = (/** @type {string} */ name) => Boolean(layers[name]);
  read.layers = layers;
  return read;
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
 * @typedef {object} WaterInfo the names and facts of the rivers and lakes, carried as JSON in the
 *   block's "info" layer
 * @property {RiverInfo[]} riverInfo @property {LakeInfo[]} lakeInfo @property {string[]} [riverLineNames]
 * @property {string[]} [riverLineLocal]
 * @property {string[]} [tags] the date tags ('' first), when some rivers or lakes are dated
 */

/**
 * Unpacks the rivers and lakes.
 * @param {PackedBlock} block
 * @param {LoadTimes} times added to
 * @returns {Promise<WaterData>}
 */
export async function loadWater(block, times) {
  const [w] = await unpackBlocks([block], times);
  const t0 = performance.now();
  /** @type {WaterInfo} */
  const info = JSON.parse(new TextDecoder().decode(w('info')));
  const rivers = decodeShapes(w('rivers'));
  const lineNames = info.riverLineNames ?? [''];
  /** @type {WaterData} */
  const water = {
    rivers,
    riverLevels: w('riverLevels'),
    riverOf: decodeUints(w('riverOf')),
    riverInfo: info.riverInfo,
    lineName: lineNames.length > 1 ? decodeUints(w('riverLineName')) : null,
    lineNames,
    lineLocal: info.riverLineLocal ?? lineNames.map(() => ''),
    lakes: decodeShapes(w('lakes')),
    lakeLevels: w('lakeLevels'),
    lakeOf: decodeUints(w('lakeOf')),
    lakeInfo: info.lakeInfo,
    // Dated rivers and lakes (M3a): without their tags a reservoir would show at every date.
    lineTag: w.has('riverTag') ? decodeUints(w('riverTag')) : null,
    lakeTag: w.has('lakeTag') ? decodeUints(w('lakeTag')) : null,
    tags: info.tags ?? [''],
  };
  const tagCount = /** @type {string[]} */ (water.tags).length;
  const badTag = (/** @type {Uint32Array | null | undefined} */ t, /** @type {number} */ n) => Boolean(t && (t.length !== n || t.some((k) => k >= tagCount)));
  if (badTag(water.lineTag, rivers.length) || badTag(water.lakeTag, water.lakeInfo.length)) throw new Error('the water data\'s dates do not add up');
  if (water.riverOf.length !== water.rivers.length || water.lakeOf.length !== water.lakes.length
    || (water.lineName && (water.lineName.length !== rivers.length || water.lineName.some((k) => k >= lineNames.length)))
    || water.lineLocal.length !== lineNames.length) {
    throw new Error('the water data does not add up');
  }
  times.decodeMs += performance.now() - t0;
  return water;
}

/**
 * @typedef {object} DatedEntry one fact of the map over time (src/data/own/changes.json): what is
 *   on from which year to which (BC years negative, null: open-ended)
 * @property {string} id @property {string} kind
 * @property {[number | null, number | null]} [on] @property {string} [tagPrefix] for a rule such as
 *   "osm-year-": the year is in the tag itself
 * @property {string[]} [marks] such as "reconstructed" or "estimate"
 */

/**
 * @typedef {object} OwnShape one of our drawn shapes, marked reconstructed
 * @property {string} id the dated entry it belongs to
 * @property {'water' | 'land' | 'lake' | 'terrain'} type water: a channel cut through today's land;
 *   land: land where today's map has sea; lake: a lake larger than today's; terrain: only its cells
 *   are used (the land engine's overrides), it is not drawn
 * @property {Int32Array} ring game units @property {Uint8Array} levels one per point, as the water's
 */

/**
 * @typedef {object} DatedData the map over time, unpacked: the land, the northern coast, and our
 *   dated facts and shapes. Rebuilt from the blocks every time; never saved.
 * @property {import('../../sim/map-date.js').TerrainTimeline} timeline
 * @property {import('../../sim/coast-date.js').Coast} coast
 * @property {import('./shore.js').ShoreSquares} shore
 * @property {DatedEntry[]} entries @property {OwnShape[]} shapes
 */

/**
 * Unpacks the map over time: the land from 1219 to today (terrain-time), the northern coast
 * (coast) and our own dated facts and shapes (changes). Not needed for the first picture of a new
 * game, so it is unpacked just after it; a save from a later year needs it first.
 * @param {{ terrainTime: PackedBlock, coast: PackedBlock, changes: PackedBlock }} blocks
 * @param {Uint8Array} base the 1219 terrain grid (copied: the map may change its own afterwards)
 * @param {LoadTimes} times added to
 * @returns {Promise<DatedData>}
 */
export async function loadDated({ terrainTime, coast, changes }, base, times) {
  const [t, c, o] = await unpackBlocks([terrainTime, coast, changes], times);
  const t0 = performance.now();
  const info = JSON.parse(new TextDecoder().decode(o('info')));
  const grid = terrainTime.meta.grid;
  if (info.grid && (info.grid.cols !== grid.cols || info.grid.rows !== grid.rows)) throw new Error('the dated data and the land over time use different grids');
  const overrides = (info.overrides ?? []).map((/** @type {any} */ v) => ({
    cells: decodeUints(o(v.cells)), bands: o(v.bands), cls: v.cls, from: v.from, to: v.to, hold: v.hold,
  }));
  const timeline = timelineFromBlock({ meta: /** @type {any} */ (terrainTime.meta), layers: t.layers, base: base.slice(), overrides });
  const box = coast.meta.coast;
  const codes = c('coast');
  const rings = decodeShapes(o('shapes'));
  const levels = o('shapeLevels');
  if (rings.length !== info.shapes.length) throw new Error('the drawn shapes do not add up');
  let at = 0;
  /** @type {OwnShape[]} */
  const shapes = info.shapes.map((/** @type {{ id: string, type: OwnShape['type'] }} */ s, /** @type {number} */ k) => {
    const n = rings[k].length / 2;
    const shape = { id: s.id, type: s.type, ring: rings[k], levels: levels.subarray(at, at + n) };
    at += n;
    return shape;
  });
  if (at !== levels.length) throw new Error('the drawn shapes do not add up');
  const dated = { timeline, coast: createCoast({ box, codes }), shore: shoreSquares(box, codes), entries: info.entries, shapes };
  times.decodeMs += performance.now() - t0;
  return dated;
}

// @ts-check
// Rivers and lakes cut into a grid of tiles, one set per level of detail, so a redraw only
// strokes and fills what lies near the view. With OpenStreetMap's thousands of rivers and lakes,
// drawing the whole map's water on every redraw took seconds on a slow phone. No DOM here:
// the view builds each tile's Path2D the first time the tile is drawn.
//
// Dated water (M3a): a line or lake whose date tag is not 0 (a reservoir that fills in its year,
// a channel cut in its year) is never in the tiles, so the tiles are still cut once per level and
// never per date. cutDated gives those features as small sets, one per tag per level, which the
// view draws on top when their tag is on at the map's date.

/** Tiles per side of the map. */
export const WATER_TILES = 8;
/** A river line is cut into pieces of at most this many points, each going to one tile. */
const PIECE = 48;

/**
 * @typedef {object} WaterTile
 * @property {number[]} box [minX, minY, maxX, maxY] of everything in the tile, game units
 * @property {number[][]} lakes rings at this level (a lake's rings stay together, so its
 *   islands stay holes)
 * @property {number[][][]} rivers per size band, lines at this level
 * @property {TilePaths | null} paths built by the view when first drawn
 *
 * @typedef {{ lakes: Path2D, rivers: (Path2D | null)[] }} TilePaths each band's rivers are built
 *   the first time that band is drawn in the tile
 *
 * @typedef {import('./load.js').WaterData & { lineTag?: ArrayLike<number> | null, lakeTag?: ArrayLike<number> | null }} DatedWater
 *   the water with its date tags (layers riverTag and lakeTag of the water block: one per line
 *   and one per lake, 0 = always shown); without them every feature counts as always shown
 *
 * @typedef {object} DatedSet the features of one date tag at one level
 * @property {number} tag index into the block's info.tags
 * @property {number[]} box [minX, minY, maxX, maxY], game units
 * @property {number[][]} lakes rings at this level, a lake's rings together
 * @property {number[][][]} rivers per size band, lines at this level, in the tiles' pieces
 * @property {TilePaths | null} paths built by the view when first drawn
 */

/**
 * The points of one shape kept at a level.
 * @param {ArrayLike<number>} shape @param {Uint8Array} levels all shapes' levels @param {number} at this shape's first point there
 * @param {number} level
 */
function keptAt(shape, levels, at, level) {
  /** @type {number[]} */
  const kept = [];
  for (let i = 0; i < shape.length / 2; i++) if (levels[at + i] <= level) kept.push(shape[i * 2], shape[i * 2 + 1]);
  return kept;
}

/**
 * A line in pieces of at most PIECE points that overlap by one point, so the line stays whole.
 * @param {number[]} kept @param {(piece: number[]) => void} each
 */
function pieces(kept, each) {
  for (let p = 0; p + 1 < kept.length / 2; p += PIECE - 1) each(kept.slice(p * 2, Math.min(kept.length, (p + PIECE) * 2)));
}

/** Grows a box over points. @param {number[]} b @param {number[]} pts */
function growBox(b, pts) {
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < b[0]) b[0] = pts[i];
    if (pts[i] > b[2]) b[2] = pts[i];
    if (pts[i + 1] < b[1]) b[1] = pts[i + 1];
    if (pts[i + 1] > b[3]) b[3] = pts[i + 1];
  }
}

/**
 * Cuts the water at one level into tiles: only the features shown at every date (tag 0).
 * @param {DatedWater} water
 * @param {number} level 0 overview, 1 middle, 2 close up: points with a level above it are left out
 * @param {(river: number) => number} bandOf a river's size band
 * @param {number} bands how many bands
 * @param {number} width @param {number} height the map, game units
 * @param {number} [perSide]
 * @returns {WaterTile[]}
 */
export function cutWater(water, level, bandOf, bands, width, height, perSide = WATER_TILES) {
  /** @type {WaterTile[]} */
  const tiles = Array.from({ length: perSide * perSide }, () => ({
    box: [Infinity, Infinity, -Infinity, -Infinity], lakes: [], rivers: Array.from({ length: bands }, () => []), paths: null,
  }));
  /** The tile holding a point. @param {number} x @param {number} y */
  const tileAt = (x, y) => {
    const c = Math.min(perSide - 1, Math.max(0, Math.floor((x / width) * perSide)));
    const r = Math.min(perSide - 1, Math.max(0, Math.floor((y / height) * perSide)));
    return tiles[r * perSide + c];
  };
  /** @param {WaterTile} t @param {number[]} pts */
  const grow = (t, pts) => growBox(t.box, pts);

  // Rivers: each line's points at this level, in pieces that overlap by one point so the line
  // stays whole, each piece in the tile of its middle point.
  let at = 0;
  for (let k = 0; k < water.rivers.length; k++) {
    const line = water.rivers[k];
    const start = at;
    at += line.length / 2;
    if (water.lineTag?.[k]) continue;
    const kept = keptAt(line, water.riverLevels, start, level);
    if (kept.length < 4) continue;
    const band = bandOf(water.riverOf[k]);
    pieces(kept, (piece) => {
      const mid = Math.floor(piece.length / 4) * 2;
      const t = tileAt(piece[mid], piece[mid + 1]);
      t.rivers[band].push(piece);
      grow(t, piece);
    });
  }

  // Lakes: all rings of one lake in the tile of its first ring's middle.
  at = 0;
  /** @type {WaterTile | null} */
  let current = null;
  let currentLake = -1;
  for (let k = 0; k < water.lakes.length; k++) {
    const ring = water.lakes[k];
    const start = at;
    at += ring.length / 2;
    if (water.lakeTag?.[water.lakeOf[k]]) continue;
    const kept = keptAt(ring, water.lakeLevels, start, level);
    if (kept.length < 6) continue;
    if (water.lakeOf[k] !== currentLake || !current) {
      currentLake = water.lakeOf[k];
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (let i = 0; i < kept.length; i += 2) {
        x0 = Math.min(x0, kept[i]); x1 = Math.max(x1, kept[i]); y0 = Math.min(y0, kept[i + 1]); y1 = Math.max(y1, kept[i + 1]);
      }
      current = tileAt((x0 + x1) / 2, (y0 + y1) / 2);
    }
    current.lakes.push(kept);
    grow(current, kept);
  }
  return tiles;
}

/**
 * Whether a tile's box overlaps a view box.
 * @param {WaterTile} t @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 */
export const tileInView = (t, x0, y0, x1, y1) => t.box[0] <= x1 && t.box[2] >= x0 && t.box[1] <= y1 && t.box[3] >= y0;

/**
 * The dated features at one level, one small set per date tag (in tag order), cut into the same
 * river pieces as the tiles, so the tiles and these sets together hold exactly what an uncut
 * map would. The view draws a set when its tag is on at the map's date.
 * @param {DatedWater} water
 * @param {number} level as for cutWater
 * @param {(river: number) => number} bandOf @param {number} bands
 * @returns {DatedSet[]} only tags with something at this level
 */
export function cutDated(water, level, bandOf, bands) {
  /** @type {Map<number, DatedSet>} */
  const sets = new Map();
  /** @param {number} tag */
  const setOf = (tag) => {
    let s = sets.get(tag);
    if (!s) {
      s = { tag, box: [Infinity, Infinity, -Infinity, -Infinity], lakes: [], rivers: Array.from({ length: bands }, () => []), paths: null };
      sets.set(tag, s);
    }
    return s;
  };
  let at = 0;
  for (let k = 0; k < water.rivers.length; k++) {
    const line = water.rivers[k];
    const start = at;
    at += line.length / 2;
    const tag = water.lineTag?.[k] ?? 0;
    if (!tag) continue;
    const kept = keptAt(line, water.riverLevels, start, level);
    if (kept.length < 4) continue;
    const s = setOf(tag);
    const band = bandOf(water.riverOf[k]);
    pieces(kept, (piece) => { s.rivers[band].push(piece); growBox(s.box, piece); });
  }
  at = 0;
  for (let k = 0; k < water.lakes.length; k++) {
    const ring = water.lakes[k];
    const start = at;
    at += ring.length / 2;
    const tag = water.lakeTag?.[water.lakeOf[k]] ?? 0;
    if (!tag) continue;
    const kept = keptAt(ring, water.lakeLevels, start, level);
    if (kept.length < 6) continue;
    const s = setOf(tag);
    s.lakes.push(kept);
    growBox(s.box, kept);
  }
  return [...sets.values()].sort((a, b) => a.tag - b.tag);
}

/**
 * Which date tags are on in a year: on[tag] is 1 when the features with that tag are shown.
 * Tag 0 is always on. A tag that is one of our dated entries follows the entry's years; an
 * "osm-year-<year>" tag (a year from OpenStreetMap) is on from that year; a tag with no entry
 * stays off (so a feature never shows without its dates).
 * @param {string[]} tags the water block's info.tags ('' first)
 * @param {readonly { id: string, on?: readonly [number | null, number | null], tagPrefix?: string }[]} entries our
 *   block's dated entries (src/data/own/changes.json)
 * @param {number} year never 0 (BC years are negative)
 * @returns {Uint8Array}
 */
export function tagsOnAt(tags, entries, year) {
  if (!Number.isInteger(year) || year === 0) throw new RangeError(`bad year: ${year}`);
  const byId = new Map(entries.filter((e) => e.on).map((e) => [e.id, e.on]));
  const rules = entries.filter((e) => e.tagPrefix);
  const on = new Uint8Array(tags.length);
  tags.forEach((t, k) => {
    if (!t) { on[k] = 1; return; }
    let window = byId.get(t);
    if (!window) {
      const rule = rules.find((e) => t.startsWith(/** @type {string} */ (e.tagPrefix)));
      const from = rule ? Number(t.slice(/** @type {string} */ (rule.tagPrefix).length)) : NaN;
      if (Number.isInteger(from) && from !== 0) window = [from, null];
    }
    if (window && (window[0] === null || year >= window[0]) && (window[1] === null || year < window[1])) on[k] = 1;
  });
  return on;
}

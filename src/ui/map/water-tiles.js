// @ts-check
// Rivers and lakes cut into a grid of tiles, one set per level of detail, so a redraw only
// strokes and fills what lies near the view. With OpenStreetMap's thousands of rivers and lakes,
// drawing the whole map's water on every redraw took seconds on a slow phone. No DOM here:
// the view builds each tile's Path2D the first time the tile is drawn.

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
 * @property {{ lakes: Path2D, rivers: Path2D[] } | null} paths built by the view when first drawn
 */

/**
 * Cuts the water at one level into tiles.
 * @param {import('./load.js').WaterData} water
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
  const grow = (t, pts) => {
    const b = t.box;
    for (let i = 0; i < pts.length; i += 2) {
      if (pts[i] < b[0]) b[0] = pts[i];
      if (pts[i] > b[2]) b[2] = pts[i];
      if (pts[i + 1] < b[1]) b[1] = pts[i + 1];
      if (pts[i + 1] > b[3]) b[3] = pts[i + 1];
    }
  };

  // Rivers: each line's points at this level, in pieces that overlap by one point so the line
  // stays whole, each piece in the tile of its middle point.
  let at = 0;
  for (let k = 0; k < water.rivers.length; k++) {
    const line = water.rivers[k];
    const n = line.length / 2;
    /** @type {number[]} */
    const kept = [];
    for (let i = 0; i < n; i++) if (water.riverLevels[at + i] <= level) kept.push(line[i * 2], line[i * 2 + 1]);
    at += n;
    if (kept.length < 4) continue;
    const band = bandOf(water.riverOf[k]);
    for (let p = 0; p + 1 < kept.length / 2; p += PIECE - 1) {
      const piece = kept.slice(p * 2, Math.min(kept.length, (p + PIECE) * 2));
      const mid = Math.floor(piece.length / 4) * 2;
      const t = tileAt(piece[mid], piece[mid + 1]);
      t.rivers[band].push(piece);
      grow(t, piece);
    }
  }

  // Lakes: all rings of one lake in the tile of its first ring's middle.
  at = 0;
  /** @type {WaterTile | null} */
  let current = null;
  let currentLake = -1;
  for (let k = 0; k < water.lakes.length; k++) {
    const ring = water.lakes[k];
    const n = ring.length / 2;
    /** @type {number[]} */
    const kept = [];
    for (let i = 0; i < n; i++) if (water.lakeLevels[at + i] <= level) kept.push(ring[i * 2], ring[i * 2 + 1]);
    at += n;
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

// @ts-check
// Paints the map's pictures once, at start-up: the terrain grid into image tiles (one pixel per
// 1 km cell) with hill shading from real heights and a little texture, and the sea depths into
// one small image (one pixel per 2 km cell) that fills the sea. Panning and zooming then only
// redraw these cached pictures. Written for speed: this runs while the game starts, on a phone.
//
// The land changes with the game's date (M3a): each tile keeps its image data, so a cell that
// changes class is written straight into it (setCells), and the tile's canvas is updated from it
// later, a few tiles at a time, those on screen first (flush).

/** Terrain classes, as stored in the grid (1 was lakes in M1; lakes are now vector shapes). */
export const TERRAIN = Object.freeze({ sea: 0, lake: 1, open: 2, conifer: 3, mixed: 4, marsh: 5, heath: 6 });

/** Colours per class, [r, g, b]: muted, like a painted map. */
const COLOURS = [
  [49, 86, 107], // sea (normally hidden under the vector sea)
  [74, 127, 150], // lake (not used by the 1219 grid)
  [184, 174, 122], // open land, fields
  [78, 104, 70], // conifer forest
  [108, 136, 82], // mixed and broadleaf forest
  [98, 118, 96], // marsh and bog
  [158, 146, 108], // heath, dunes
];
/** The same colours, for land the map draws as shapes (our own reconstructed islands). */
export const TERRAIN_COLOURS = COLOURS;

/** Sea colours from shallow to deep, [r, g, b]: the deeper, the darker, but only a little. */
const SHALLOW = [66, 112, 134];
const DEEP = [31, 58, 75];
/** Depth (metres) at which the sea is darkest. The Baltic's deepest hole is about 459 m. */
const DEEPEST = 220;
/** Brightness change per metre of height difference across two cells, and its limit. */
const RELIEF = 0.0045;
const RELIEF_LIMIT = 0.32;

export const TILE = 512;
const TEX = 64; // texture repeat, in cells

/** A small repeating texture: brightness changes and tree marks, made once. */
function makeTexture() {
  const tex = new Float32Array(TEX * TEX);
  const trees = new Uint8Array(TEX * TEX);
  let x = 0x9e3779b9;
  for (let i = 0; i < tex.length; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; // xorshift: fixed, so every phone paints the same
    const n = (x >>> 0) / 4294967296;
    tex[i] = 0.95 + n * 0.1;
    trees[i] = n > 0.72 ? 1 : 0;
  }
  return { tex, trees };
}

/**
 * Hill shading, lit from the north-west, one value per height cell. Only the land is shaded:
 * the sea floor is left flat, so coasts don't get a bright or dark rim from the drop into the sea.
 * @param {import('./load.js').HeightGrid} height
 * @returns {Float32Array} brightness factor around 1
 */
export function shading(height) {
  const { cols, rows, data } = height;
  const shade = new Float32Array(cols * rows);
  const land = (/** @type {number} */ i) => (data[i] > 0 ? data[i] : 0);
  for (let r = 0; r < rows; r++) {
    const north = Math.min(rows - 1, r + 1) * cols;
    const south = Math.max(0, r - 1) * cols;
    for (let c = 0; c < cols; c++) {
      const west = land(r * cols + Math.max(0, c - 1));
      const east = land(r * cols + Math.min(cols - 1, c + 1));
      // Facing west or north (rising to the east, falling to the north) faces the light.
      const lit = (east - west) - (land(north + c) - land(south + c));
      shade[r * cols + c] = 1 + Math.max(-RELIEF_LIMIT, Math.min(RELIEF_LIMIT, lit * RELIEF));
    }
  }
  return shade;
}

/**
 * Reads the coarse shading smoothly (bilinear) at the terrain's finer cells, so 2 km cells don't
 * show as blocks. Where each terrain column falls between height columns is the same for every
 * row, so it is worked out once.
 * @param {Float32Array} shade @param {import('./load.js').HeightGrid} height
 * @param {number} ratio height cell / terrain cell @param {number} cols terrain columns
 */
function shadeReader(shade, height, ratio, cols) {
  const x0 = new Int32Array(cols);
  const x1 = new Int32Array(cols);
  const tx = new Float32Array(cols);
  for (let c = 0; c < cols; c++) {
    const fx = Math.max(0, Math.min(height.cols - 1, (c + 0.5) / ratio - 0.5));
    x0[c] = Math.floor(fx);
    x1[c] = Math.min(height.cols - 1, x0[c] + 1);
    tx[c] = fx - x0[c];
  }
  /** Fills `out` with the shading of terrain row r. @param {number} r @param {Float32Array} out */
  return (r, out) => {
    const fy = Math.max(0, Math.min(height.rows - 1, (r + 0.5) / ratio - 0.5));
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const a = y0 * height.cols;
    const b = Math.min(height.rows - 1, y0 + 1) * height.cols;
    for (let c = 0; c < cols; c++) {
      const top = shade[a + x0[c]] + (shade[a + x1[c]] - shade[a + x0[c]]) * tx[c];
      const bottom = shade[b + x0[c]] + (shade[b + x1[c]] - shade[b + x0[c]]) * tx[c];
      out[c] = top + (bottom - top) * ty;
    }
  };
}

/**
 * @typedef {object} Tile
 * @property {HTMLCanvasElement} canvas
 * @property {number} col @property {number} row first grid cell in the tile
 * @property {number} w @property {number} h cells
 * @property {CanvasRenderingContext2D} ctx @property {ImageData} img the tile's pixels, kept
 * @property {Uint32Array} px the same pixels, one number each
 * @property {number[] | null} dirty [x0, y0, x1, y1] of pixels written since the canvas was
 *   updated (end exclusive), or null
 */

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
/** @param {number} r @param {number} g @param {number} b */
const rgba = (r, g, b) => (LITTLE_ENDIAN ? (255 << 24) | (b << 16) | (g << 8) | r : (r << 24) | (g << 16) | (b << 8) | 255);

/** Brightness steps in the colour table: from LIGHT_MIN to LIGHT_MIN + LIGHT_STEPS / LIGHT_SCALE. */
const LIGHT_STEPS = 256;
const LIGHT_MIN = 0.45;
const LIGHT_SCALE = 200;

/**
 * Every class in every brightness, ready to write: painting 2 million cells then costs one table
 * read per cell instead of three multiplications and a colour packing.
 */
function colourTable() {
  const table = new Uint32Array(COLOURS.length * LIGHT_STEPS);
  for (let k = 0; k < COLOURS.length; k++) {
    for (let q = 0; q < LIGHT_STEPS; q++) {
      const light = LIGHT_MIN + q / LIGHT_SCALE;
      const [r, g, b] = COLOURS[k].map((v) => Math.min(255, Math.round(v * light)));
      table[k * LIGHT_STEPS + q] = rgba(r, g, b);
    }
  }
  return table;
}

/**
 * The colour of one land cell: its class, lit by the hill shading and the texture.
 * @param {Uint32Array} table @param {number} k class @param {number} light shading x texture
 * @param {boolean} tree a tree mark falls here
 */
function cellColour(table, k, light, tree) {
  if (tree) {
    if (k === TERRAIN.conifer || k === TERRAIN.mixed) light *= 0.84;
    else if (k === TERRAIN.marsh) light *= 1.1;
  }
  let q = ((light - LIGHT_MIN) * LIGHT_SCALE) | 0;
  q = q < 0 ? 0 : q >= LIGHT_STEPS ? LIGHT_STEPS - 1 : q;
  return table[(k < COLOURS.length ? k : TERRAIN.open) * LIGHT_STEPS + q];
}

/**
 * The class a cell is painted in: its own, or for a sea cell beside land the land's, so the
 * vector coast drawn on top never leaves a gap where a coastal cell's centre fell in the sea.
 * 0 (sea): left transparent, the vector sea is drawn under it.
 * @param {ArrayLike<number>} data @param {number} cols @param {number} rows @param {number} c @param {number} r
 */
function paintedClass(data, cols, rows, c, r) {
  const i = r * cols + c;
  return data[i] || (c > 0 && data[i - 1]) || (c < cols - 1 && data[i + 1]) || (r > 0 && data[i - cols]) || (r < rows - 1 && data[i + cols]) || 0;
}

/**
 * @typedef {object} TerrainPicture the terrain as image tiles, kept up to date with its grid
 * @property {Tile[]} tiles
 * @property {(cell: number) => void} setCell repaints a cell whose class changed in the grid (and
 *   the sea cells beside it, which take their colour from the land), into the kept image data
 * @property {(first: (tile: Tile) => boolean, until: number) => number} flush updates the canvases
 *   of tiles with changed pixels, those that `first` picks before the rest, until performance.now()
 *   passes `until` (at least one); returns how many of the `first` tiles it updated
 * @property {() => number} dirtyTiles how many tiles have pixels waiting
 */

/**
 * Paints the terrain grid into tiles, and keeps what it needs to repaint single cells later.
 * @param {import('./load.js').Grid} terrain its data is read again by setCell, so the caller
 *   changes it in place
 * @param {import('./load.js').HeightGrid} height
 * @returns {TerrainPicture}
 */
export function paintTerrain(terrain, height) {
  const { cols, rows, data } = terrain;
  const ratio = height.cell / terrain.cell;
  const shade = shading(height);
  const { tex, trees } = makeTexture();
  const table = colourTable();
  const readShade = shadeReader(shade, height, ratio, cols);
  const rowShade = new Float32Array(cols);
  /** @type {Tile[]} */
  const tiles = [];
  const tilesPerRow = Math.ceil(cols / TILE);
  for (let row = 0; row < rows; row += TILE) {
    const th = Math.min(TILE, rows - row);
    /** @type {Tile[]} */
    const band = [];
    for (let col = 0; col < cols; col += TILE) {
      const w = Math.min(TILE, cols - col);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = th;
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      const img = ctx.createImageData(w, th);
      band.push({ canvas, ctx, img, px: new Uint32Array(img.data.buffer), col, row, w, h: th, dirty: null });
    }
    for (let y = 0; y < th; y++) {
      const r = row + y;
      readShade(r, rowShade);
      const texRow = (r % TEX) * TEX;
      for (const { px, col, w } of band) {
        let o = y * w;
        for (let c = col, end = col + w; c < end; c++, o++) {
          const k = paintedClass(data, cols, rows, c, r);
          if (k === 0) continue;
          const tk = texRow + (c & (TEX - 1));
          px[o] = cellColour(table, k, rowShade[c] * tex[tk], trees[tk] === 1);
        }
      }
    }
    for (const t of band) {
      t.ctx.putImageData(t.img, 0, 0);
      tiles.push(t);
    }
  }

  let dirtyCount = 0;
  const one = new Float32Array(1);
  /** Repaints the pixel of cell (c, r) from the grid as it is now. @param {number} c @param {number} r */
  function repaint(c, r) {
    const t = tiles[Math.floor(r / TILE) * tilesPerRow + Math.floor(c / TILE)];
    const x = c - t.col;
    const y = r - t.row;
    const k = paintedClass(data, cols, rows, c, r);
    if (k === 0) {
      t.px[y * t.w + x] = 0;
    } else {
      // The same shading as the full paint: one row's bilinear shade, kept as a float32.
      shadeAt(c, r, one);
      const tk = (r % TEX) * TEX + (c & (TEX - 1));
      t.px[y * t.w + x] = cellColour(table, k, one[0] * tex[tk], trees[tk] === 1);
    }
    const d = t.dirty;
    if (!d) {
      t.dirty = [x, y, x + 1, y + 1];
      dirtyCount++;
    } else {
      if (x < d[0]) d[0] = x;
      if (y < d[1]) d[1] = y;
      if (x + 1 > d[2]) d[2] = x + 1;
      if (y + 1 > d[3]) d[3] = y + 1;
    }
  }
  /** The shading of one cell, as readShade gives it for the cell's row. @param {number} c @param {number} r @param {Float32Array} out */
  function shadeAt(c, r, out) {
    const fx = Math.max(0, Math.min(height.cols - 1, (c + 0.5) / ratio - 0.5));
    const x0 = Math.floor(fx);
    const x1 = Math.min(height.cols - 1, x0 + 1);
    const tx = fx - x0;
    const fy = Math.max(0, Math.min(height.rows - 1, (r + 0.5) / ratio - 0.5));
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const a = y0 * height.cols;
    const b = Math.min(height.rows - 1, y0 + 1) * height.cols;
    const top = shade[a + x0] + (shade[a + x1] - shade[a + x0]) * Math.fround(tx);
    const bottom = shade[b + x0] + (shade[b + x1] - shade[b + x0]) * Math.fround(tx);
    out[0] = top + (bottom - top) * ty;
  }

  return {
    tiles,
    setCell(cell) {
      const c = cell % cols;
      const r = (cell - c) / cols;
      repaint(c, r);
      // Sea cells beside it take their colour from the land.
      if (c > 0 && !data[cell - 1]) repaint(c - 1, r);
      if (c < cols - 1 && !data[cell + 1]) repaint(c + 1, r);
      if (r > 0 && !data[cell - cols]) repaint(c, r - 1);
      if (r < rows - 1 && !data[cell + cols]) repaint(c, r + 1);
    },
    flush(first, until) {
      let done = 0;
      let any = false;
      for (const pass of [true, false]) {
        for (const t of tiles) {
          if (!t.dirty || first(t) !== pass) continue;
          if (any && performance.now() > until) return done;
          const [x0, y0, x1, y1] = t.dirty;
          t.ctx.putImageData(t.img, 0, 0, x0, y0, x1 - x0, y1 - y0);
          t.dirty = null;
          dirtyCount--;
          any = true;
          if (pass) done++;
        }
      }
      return done;
    },
    dirtyTiles: () => dirtyCount,
  };
}

/**
 * The sea depths as a small picture, one pixel per height cell, row 0 at the south. The map
 * fills the sea shape with it, so the coast stays a sharp vector line while the colour follows
 * the depth underneath. Land cells take the shallow colour, for the strip along the coast.
 * @param {import('./load.js').HeightGrid} height
 * @returns {HTMLCanvasElement}
 */
export function paintSea(height) {
  const { cols, rows, data } = height;
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const img = ctx.createImageData(cols, rows);
  const px = new Uint32Array(img.data.buffer);
  /** @type {number[]} */
  const ramp = [];
  for (let d = 0; d <= DEEPEST; d++) {
    const t = Math.sqrt(d / DEEPEST); // most of the change in the shallows, where the coast is
    ramp.push(rgba(...(/** @type {[number, number, number]} */ (SHALLOW.map((v, k) => Math.round(v + (DEEP[k] - v) * t))))));
  }
  for (let i = 0; i < data.length; i++) px[i] = ramp[Math.min(DEEPEST, Math.max(0, -data[i]))];
  ctx.putImageData(img, 0, 0);
  return canvas;
}

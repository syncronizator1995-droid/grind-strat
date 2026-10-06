// @ts-check
// Paints the map's pictures once, at start-up: the terrain grid into image tiles (one pixel per
// 1 km cell) with hill shading from real heights and a little texture, and the sea depths into
// one small image (one pixel per 2 km cell) that fills the sea. Panning and zooming then only
// redraw these cached pictures. Written for speed: this runs while the game starts, on a phone.

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
 * @param {import('./load.js').Grid} terrain
 * @param {import('./load.js').HeightGrid} height
 * @returns {Tile[]}
 */
export function paintTerrain(terrain, height) {
  const { cols, rows, data } = terrain;
  const ratio = height.cell / terrain.cell;
  const shade = shading(height);
  const { tex, trees } = makeTexture();
  // Land colour for each sea cell that touches land, so the vector coast drawn on top never
  // leaves a gap where a coastal cell's centre happened to fall in the sea.
  const fill = new Uint8Array(data);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (data[i] !== TERRAIN.sea) continue;
      const n = (c > 0 && data[i - 1]) || (c < cols - 1 && data[i + 1]) || (r > 0 && data[i - cols]) || (r < rows - 1 && data[i + cols]);
      if (n) fill[i] = n;
    }
  }
  const table = colourTable();
  const readShade = shadeReader(shade, height, ratio, cols);
  const rowShade = new Float32Array(cols);
  const conifer = TERRAIN.conifer;
  const mixed = TERRAIN.mixed;
  const marsh = TERRAIN.marsh;
  /** @type {Tile[]} */
  const tiles = [];
  for (let row = 0; row < rows; row += TILE) {
    const th = Math.min(TILE, rows - row);
    /** @type {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, img: ImageData, px: Uint32Array, col: number, w: number }[]} */
    const images = [];
    for (let col = 0; col < cols; col += TILE) {
      const w = Math.min(TILE, cols - col);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = th;
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      const img = ctx.createImageData(w, th);
      images.push({ canvas, ctx, img, px: new Uint32Array(img.data.buffer), col, w });
    }
    for (let y = 0; y < th; y++) {
      const r = row + y;
      readShade(r, rowShade);
      const texRow = (r % TEX) * TEX;
      const gridRow = r * cols;
      for (let t = 0; t < images.length; t++) {
        const { px, col, w } = images[t];
        let o = y * w;
        for (let c = col, end = col + w; c < end; c++, o++) {
          const k = fill[gridRow + c];
          if (k === 0) continue; // sea stays transparent: the vector sea is drawn under it
          const tk = texRow + (c & (TEX - 1));
          let light = rowShade[c] * tex[tk];
          if (trees[tk] === 1) {
            if (k === conifer || k === mixed) light *= 0.84;
            else if (k === marsh) light *= 1.1;
          }
          let q = ((light - LIGHT_MIN) * LIGHT_SCALE) | 0;
          q = q < 0 ? 0 : q >= LIGHT_STEPS ? LIGHT_STEPS - 1 : q;
          px[o] = table[(k < COLOURS.length ? k : TERRAIN.open) * LIGHT_STEPS + q];
        }
      }
    }
    for (const t of images) {
      t.ctx.putImageData(t.img, 0, 0);
      tiles.push({ canvas: t.canvas, col: t.col, row, w: t.w, h: th });
    }
  }
  return tiles;
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

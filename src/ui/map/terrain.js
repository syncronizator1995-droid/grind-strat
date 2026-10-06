// @ts-check
// Paints the terrain grid once into image tiles (one pixel per 1 km cell), with hill shading and
// a little texture. Panning and zooming then only redraw these cached tiles.
// Written for speed: this runs while the game starts, on a phone.

/** Terrain classes, as stored in the grid. */
export const TERRAIN = Object.freeze({ sea: 0, lake: 1, open: 2, conifer: 3, mixed: 4, marsh: 5, heath: 6 });

/** Colours per class, [r, g, b]: muted, like a painted map. */
const COLOURS = [
  [49, 86, 107], // sea (normally hidden under the vector sea)
  [74, 127, 150], // lake
  [184, 174, 122], // open land, fields
  [78, 104, 70], // conifer forest
  [108, 136, 82], // mixed and broadleaf forest
  [98, 118, 96], // marsh and bog
  [158, 146, 108], // heath, dunes
];

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
    tex[i] = 0.94 + n * 0.12;
    trees[i] = n > 0.72 ? 1 : 0;
  }
  return { tex, trees };
}

/**
 * Light from the north-west, worked out once per height cell.
 * @param {import('./load.js').Grid} height
 */
function shading(height) {
  const { cols, rows, data } = height;
  const shade = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const up = Math.min(rows - 1, r + 1) * cols;
    const down = Math.max(0, r - 1) * cols;
    for (let c = 0; c < cols; c++) {
      const left = data[r * cols + Math.max(0, c - 1)];
      const right = data[r * cols + Math.min(cols - 1, c + 1)];
      const slope = (left - right) + (data[up + c] - data[down + c]);
      shade[r * cols + c] = 1 + Math.max(-0.35, Math.min(0.35, slope * 0.024));
    }
  }
  return shade;
}

/**
 * @typedef {object} Tile
 * @property {HTMLCanvasElement} canvas
 * @property {number} col @property {number} row first grid cell in the tile
 * @property {number} w @property {number} h cells
 */

/**
 * @param {import('./load.js').Grid} terrain
 * @param {import('./load.js').Grid} height
 * @returns {Tile[]}
 */
export function paintTerrain(terrain, height) {
  const { cols, rows, data } = terrain;
  const ratio = Math.round(height.cell / terrain.cell);
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
  const little = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
  /** @type {Tile[]} */
  const tiles = [];
  for (let row = 0; row < rows; row += TILE) {
    for (let col = 0; col < cols; col += TILE) {
      const w = Math.min(TILE, cols - col);
      const th = Math.min(TILE, rows - row);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = th;
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      const img = ctx.createImageData(w, th);
      const px = new Uint32Array(img.data.buffer);
      for (let y = 0; y < th; y++) {
        const r = row + y;
        const shadeRow = Math.min(height.rows - 1, Math.floor(r / ratio)) * height.cols;
        const texRow = (r % TEX) * TEX;
        let o = y * w;
        for (let x = 0; x < w; x++, o++) {
          const c = col + x;
          const t = fill[r * cols + c];
          if (t === TERRAIN.sea) continue; // stays transparent: the vector sea is drawn under it
          const k = texRow + (c % TEX);
          let s = shade[shadeRow + Math.min(height.cols - 1, Math.floor(c / ratio))] * tex[k];
          if (trees[k] && (t === TERRAIN.conifer || t === TERRAIN.mixed)) s *= 0.82;
          else if (trees[k] && t === TERRAIN.marsh) s *= 1.12;
          const rgb = COLOURS[t];
          const red = Math.min(255, rgb[0] * s) | 0;
          const green = Math.min(255, rgb[1] * s) | 0;
          const blue = Math.min(255, rgb[2] * s) | 0;
          px[o] = little ? (255 << 24) | (blue << 16) | (green << 8) | red : (red << 24) | (green << 16) | (blue << 8) | 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      tiles.push({ canvas, col, row, w, h: th });
    }
  }
  return tiles;
}

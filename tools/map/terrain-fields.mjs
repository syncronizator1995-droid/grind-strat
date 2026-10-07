// @ts-check
// Small grid helpers for the 1219 terrain build: deterministic noise, box blur, distance to a
// set of cells, and reading the 2 km height grid at 1 km cell centres. Plain arrays in and out,
// no files, so the tests can run them on made-up grids.

/**
 * A hash of three integers to a number in [0, 1). Deterministic and the same on every machine:
 * the terrain must come out identical from the same inputs, so Math.random is never used.
 * @param {number} x @param {number} y @param {number} seed
 */
export function hash01(x, y, seed) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Smooth value noise in [0, 1): hashed values on a lattice `spacing` cells apart, blended with
 * a smoothstep. Gives soft blobs a few lattice steps wide, so where the data cannot tell two
 * cells apart the forest edge still wanders naturally instead of forming salt and pepper.
 * @param {number} c @param {number} r cell column and row
 * @param {number} spacing lattice step in cells @param {number} seed
 */
export function valueNoise(c, r, spacing, seed) {
  const x = c / spacing;
  const y = r / spacing;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = smooth(x - x0);
  const sy = smooth(y - y0);
  const a = hash01(x0, y0, seed);
  const b = hash01(x0 + 1, y0, seed);
  const d = hash01(x0, y0 + 1, seed);
  const e = hash01(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (d - a) * sy + (a - b - d + e) * sx * sy;
}

/** @param {number} t */
const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Noise for one cell: two octaves of value noise plus a little per-cell hash, centred on 0 and
 * roughly in [-0.5, 0.5]. The per-cell part only breaks exact ties.
 * @param {number} c @param {number} r @param {number} seed
 */
export function cellNoise(c, r, seed) {
  return 0.65 * valueNoise(c, r, 12, seed) + 0.3 * valueNoise(c, r, 4, seed + 1) + 0.05 * hash01(c, r, seed + 2) - 0.5;
}

/**
 * Mean over a (2 * radius + 1) square round each cell, counting only cells where `mask` is set
 * (so the sea does not dilute the land cover along the coast). Separable, so it is fast.
 * @param {ArrayLike<number>} values @param {Uint8Array} mask @param {number} cols @param {number} rows
 * @param {number} radius
 * @returns {Float32Array} mean where any masked cell is in reach, else the cell's own value
 */
export function maskedBlur(values, mask, cols, rows, radius) {
  const sumH = new Float64Array(cols * rows);
  const cntH = new Float64Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const o = r * cols;
    for (let c = 0; c < cols; c++) {
      let s = 0; let n = 0;
      for (let k = Math.max(0, c - radius); k <= Math.min(cols - 1, c + radius); k++) {
        if (mask[o + k]) { s += values[o + k]; n++; }
      }
      sumH[o + c] = s; cntH[o + c] = n;
    }
  }
  const out = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let s = 0; let n = 0;
      for (let k = Math.max(0, r - radius); k <= Math.min(rows - 1, r + radius); k++) {
        s += sumH[k * cols + c]; n += cntH[k * cols + c];
      }
      out[r * cols + c] = n ? s / n : values[r * cols + c];
    }
  }
  return out;
}

/**
 * Distance in cells from every cell to the nearest cell where `source` is set: a two-pass
 * chamfer transform with steps 1 and sqrt 2 (within about 8% of the true distance, plenty for
 * "near the sea" or "far from a river").
 * @param {Uint8Array} source @param {number} cols @param {number} rows
 * @returns {Float32Array} Infinity when there is no source cell at all
 */
export function distanceTo(source, cols, rows) {
  const d = new Float32Array(cols * rows);
  for (let i = 0; i < d.length; i++) d[i] = source[i] ? 0 : Infinity;
  const D = Math.SQRT2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let v = d[i];
      if (c > 0) v = Math.min(v, d[i - 1] + 1);
      if (r > 0) {
        v = Math.min(v, d[i - cols] + 1);
        if (c > 0) v = Math.min(v, d[i - cols - 1] + D);
        if (c < cols - 1) v = Math.min(v, d[i - cols + 1] + D);
      }
      d[i] = v;
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      let v = d[i];
      if (c < cols - 1) v = Math.min(v, d[i + 1] + 1);
      if (r < rows - 1) {
        v = Math.min(v, d[i + cols] + 1);
        if (c < cols - 1) v = Math.min(v, d[i + cols + 1] + D);
        if (c > 0) v = Math.min(v, d[i + cols - 1] + D);
      }
      d[i] = v;
    }
  }
  return d;
}

/**
 * Reads a coarse grid at the centres of a fine grid `ratio` times smaller, with bilinear
 * blending, so 2 km heights do not show as 2 km steps on the 1 km grid.
 * @param {ArrayLike<number>} coarse @param {number} cCols @param {number} cRows
 * @param {number} cols @param {number} rows fine grid size @param {number} ratio
 * @returns {Float32Array}
 */
export function upsample(coarse, cCols, cRows, cols, rows, ratio) {
  const out = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y = Math.max(0, Math.min(cRows - 1, (r + 0.5) / ratio - 0.5));
    const y0 = Math.min(cRows - 2, Math.floor(y));
    const ty = y - y0;
    for (let c = 0; c < cols; c++) {
      const x = Math.max(0, Math.min(cCols - 1, (c + 0.5) / ratio - 0.5));
      const x0 = Math.min(cCols - 2, Math.floor(x));
      const tx = x - x0;
      const a = coarse[y0 * cCols + x0];
      const b = coarse[y0 * cCols + x0 + 1];
      const d = coarse[(y0 + 1) * cCols + x0];
      const e = coarse[(y0 + 1) * cCols + x0 + 1];
      out[r * cols + c] = a + (b - a) * tx + (d - a) * ty + (a - b - d + e) * tx * ty;
    }
  }
  return out;
}

/**
 * Roughness: the standard deviation of land heights in the 3 x 3 block round each cell, in
 * metres. Sea cells (negative heights) are left out so a cliff coast is not "rough" by depth.
 * @param {ArrayLike<number>} h @param {number} cols @param {number} rows
 * @returns {Float32Array}
 */
export function roughness(h, cols, rows) {
  const out = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let s = 0; let s2 = 0; let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= rows) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc;
          if (cc < 0 || cc >= cols) continue;
          const v = h[rr * cols + cc];
          if (v < 0) continue;
          s += v; s2 += v * v; n++;
        }
      }
      out[r * cols + c] = n > 1 ? Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) : 0;
    }
  }
  return out;
}

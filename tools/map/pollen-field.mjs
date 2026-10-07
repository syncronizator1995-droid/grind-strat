// @ts-check
// The pollen map (SpatioCompo, REVEALS, about AD 750-1250) as a smooth field over the 1 km grid.
//
// The pollen map gives one conifer / broadleaf / open split per 1 degree cell. Painting those
// values as they are would show 1 degree squares on the map, which nobody saw in 1219. So each
// value is treated as a sample at its cell's centre, and every 1 km cell blends the four nearest
// centres (bilinear in lon/lat). Where a centre has no value (sea, or beyond the pollen map's
// reach) it borrows the value of the nearest centre that has one, so the blend never fades
// towards zero at the coast.

/**
 * @typedef {{ lon: number, lat: number, conifer: number, broadleaf: number, open: number }} PollenCell
 *   one row of spatiocompo-tw4.json; lon/lat is the cell centre (x.5)
 *
 * @typedef {object} Lattice the 1 degree cell centres as a grid of nodes
 * @property {number} lon0 @property {number} lat0 the south-west node's centre
 * @property {number} w @property {number} h nodes across and up
 * @property {Float64Array} forest conifer + broadleaf per node, filled everywhere
 * @property {Float64Array} coniferShare conifer / (conifer + broadleaf) per node, filled everywhere
 * @property {Uint8Array} measured 1 where the pollen map has its own value for the node
 */

/**
 * Builds the node lattice that covers a lon/lat box, filling missing nodes from the nearest
 * measured one (distance in km on the ground, so a degree of longitude counts less in the north).
 * @param {PollenCell[]} cells @param {{ west: number, east: number, south: number, north: number }} box
 * @returns {Lattice}
 */
export function pollenLattice(cells, box) {
  const lon0 = Math.floor(box.west - 0.5) + 0.5;
  const lat0 = Math.floor(box.south - 0.5) + 0.5;
  const w = Math.ceil(box.east + 0.5 - lon0) + 1;
  const h = Math.ceil(box.north + 0.5 - lat0) + 1;
  const forest = new Float64Array(w * h).fill(NaN);
  const coniferShare = new Float64Array(w * h).fill(NaN);
  const measured = new Uint8Array(w * h);
  for (const p of cells) {
    const x = Math.round(p.lon - lon0);
    const y = Math.round(p.lat - lat0);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const f = p.conifer + p.broadleaf;
    if (!(f >= 0 && f <= 1.0001)) continue;
    const k = y * w + x;
    forest[k] = f;
    coniferShare[k] = f > 0 ? p.conifer / f : 0.5;
    measured[k] = 1;
  }
  const have = [...measured.keys()].filter((k) => measured[k]);
  if (!have.length) throw new Error('pollenLattice: no pollen cell inside the box');
  for (let k = 0; k < w * h; k++) {
    if (measured[k]) continue;
    const near = nearestMeasured(k, have, w, lat0);
    forest[k] = forest[near];
    coniferShare[k] = coniferShare[near];
  }
  return { lon0, lat0, w, h, forest, coniferShare, measured };
}

/**
 * The measured node nearest on the ground to node k; ties go to the first in the list, which is
 * south-west first, so the answer never depends on anything but the data.
 * @param {number} k @param {number[]} have @param {number} w @param {number} lat0
 */
function nearestMeasured(k, have, w, lat0) {
  const x = k % w;
  const y = (k - x) / w;
  let best = have[0];
  let bestD = Infinity;
  for (const j of have) {
    const jx = j % w;
    const jy = (j - jx) / w;
    const coslat = Math.cos(((lat0 + (y + jy) / 2) * Math.PI) / 180);
    const d = ((jx - x) * coslat) ** 2 + (jy - y) ** 2;
    if (d < bestD - 1e-12) { bestD = d; best = j; }
  }
  return best;
}

/**
 * Where each 1 km cell sits on the lattice: its own 1 degree cell (the node whose square holds
 * it, for quotas) and the four nodes and weights that blend it (for smooth fields).
 * @param {Float64Array} lon @param {Float64Array} lat cell centres
 * @param {Lattice} L
 */
export function latticePlaces(lon, lat, L) {
  const n = lon.length;
  const group = new Int32Array(n);
  const x0 = new Int16Array(n);
  const y0 = new Int16Array(n);
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const fx = lon[i] - L.lon0;
    const fy = lat[i] - L.lat0;
    const gx = Math.round(fx);
    const gy = Math.round(fy);
    group[i] = gx >= 0 && gy >= 0 && gx < L.w && gy < L.h ? gy * L.w + gx : -1;
    const bx = Math.max(0, Math.min(L.w - 2, Math.floor(fx)));
    const by = Math.max(0, Math.min(L.h - 2, Math.floor(fy)));
    x0[i] = bx; y0[i] = by;
    tx[i] = Math.max(0, Math.min(1, fx - bx));
    ty[i] = Math.max(0, Math.min(1, fy - by));
  }
  return { group, x0, y0, tx, ty, w: L.w, h: L.h };
}

/** @typedef {ReturnType<typeof latticePlaces>} Places */

/**
 * A node field blended at cell i.
 * @param {ArrayLike<number>} nodes @param {Places} P @param {number} i
 */
export function blendAt(nodes, P, i) {
  const k = P.y0[i] * P.w + P.x0[i];
  const tx = P.tx[i];
  const ty = P.ty[i];
  const a = nodes[k];
  const b = nodes[k + 1];
  const d = nodes[k + P.w];
  const e = nodes[k + P.w + 1];
  return a + (b - a) * tx + (d - a) * ty + (a - b - d + e) * tx * ty;
}

/**
 * A node field blended at every cell.
 * @param {ArrayLike<number>} nodes @param {Places} P
 * @returns {Float32Array}
 */
export function blendAll(nodes, P) {
  const out = new Float32Array(P.group.length);
  for (let i = 0; i < out.length; i++) out[i] = blendAt(nodes, P, i);
  return out;
}

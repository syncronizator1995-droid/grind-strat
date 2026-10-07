// @ts-check
// Tidies a yes/no choice on a grid (forest or open; conifer or mixed) into coherent patches.
//
// Why: the quota solver picks cells by score, and however smooth the score, a threshold still
// leaves a few lone cells and tiny islands where the score hovers round the cut. On the map they
// read as salt and pepper. Real land, and a painted map, has blocks of forest and clearings.
// So islands under a few cells join whatever surrounds them (absorbSmallPatches), and then the
// quota solver runs once more on edgeScore, which ranks cells by how far they sit inside their
// patch: the squares that moved off their share get it back by moving patch edges in or out.
// Moving edges this way, rather than trimming cells square by square, matters: a square that
// trims only its own cells cuts a patch that crosses its edge in a straight line along it, and
// the solver's threshold is blended smoothly across square edges, so it cannot.

import { distanceTo } from './terrain-fields.mjs';

/**
 * Every patch of side-by-side eligible cells with one value, smaller than minCells and touching
 * an eligible cell with the other value, takes the other value. A patch walled in only by cells
 * that take no part (a forest islet in a bog) stays: there is nothing for it to join. A few
 * rounds, because an island that joins its surroundings can leave a smaller one beside it.
 * @param {Uint8Array} chosen 1 = yes; changed in place @param {Uint8Array} eligible
 * @param {number} cols @param {number} rows @param {number} minCells
 * @returns {{ islands: number, cells: number }}
 */
export function absorbSmallPatches(chosen, eligible, cols, rows, minCells) {
  let islands = 0; let cells = 0;
  for (let round = 0; round < 4 && minCells > 1; round++) {
    const r = absorbOnce(chosen, eligible, cols, rows, minCells);
    islands += r.islands; cells += r.cells;
    if (!r.islands) break;
  }
  return { islands, cells };
}

/** One round of absorbSmallPatches. @param {Uint8Array} chosen @param {Uint8Array} eligible @param {number} cols @param {number} rows @param {number} minCells */
function absorbOnce(chosen, eligible, cols, rows, minCells) {
  const n = chosen.length;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const patch = new Int32Array(minCells);
  /** @type {number[]} */ const flip = [];
  let islands = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s] || !eligible[s]) continue;
    const v = chosen[s];
    seen[s] = 1;
    let top = 0; let size = 0; let touchesOther = false;
    stack[top++] = s;
    while (top) {
      const i = stack[--top];
      if (size < minCells) patch[size] = i;
      size++;
      const c = i % cols;
      for (const j of sides(i, c, (i - c) / cols, cols, rows)) {
        if (j < 0 || !eligible[j]) continue;
        if (chosen[j] !== v) touchesOther = true;
        else if (!seen[j]) { seen[j] = 1; stack[top++] = j; }
      }
    }
    if (size >= minCells || !touchesOther) continue;
    islands++;
    for (let k = 0; k < size; k++) flip.push(patch[k]);
  }
  for (const i of flip) chosen[i] ^= 1;
  return { islands, cells: flip.length };
}

/**
 * A score for re-solving the quota that keeps the patches: how far each cell sits inside its
 * patch, in cells (yes cells positive, no cells negative, edge cells at plus or minus a half),
 * with the original score as a small tie-break inside each distance step. A threshold just
 * above 0.5 trims one ring of cells off the yes patches, one just below -0.5 grows them by a
 * ring, and in between, the original score decides which edge cells go first.
 * @param {Uint8Array} chosen @param {Uint8Array} eligible @param {Float32Array} score
 * @param {number} cols @param {number} rows
 */
export function edgeScore(chosen, eligible, score, cols, rows) {
  const n = chosen.length;
  const yes = new Uint8Array(n);
  const no = new Uint8Array(n);
  let lo = Infinity; let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (!eligible[i]) continue;
    if (chosen[i]) yes[i] = 1; else no[i] = 1;
    lo = Math.min(lo, score[i]); hi = Math.max(hi, score[i]);
  }
  const toNo = distanceTo(no, cols, rows);
  const toYes = distanceTo(yes, cols, rows);
  // The tie-break stays under the smallest gap between chamfer distance steps near an edge
  // (1 and sqrt 2), so it never moves a cell past one nearer the edge.
  const tie = 0.1 / (hi - lo || 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!eligible[i]) continue;
    // Capped: a patch with nothing of the other value anywhere near is simply "deep inside".
    const depth = Math.min(50, chosen[i] ? toNo[i] : toYes[i]) - 0.5;
    out[i] = (chosen[i] ? depth : -depth) + tie * (score[i] - lo);
  }
  return out;
}

/** The four side-by-side neighbours of cell i, -1 off the grid. @param {number} i @param {number} c @param {number} r @param {number} cols @param {number} rows */
function sides(i, c, r, cols, rows) {
  return [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1];
}

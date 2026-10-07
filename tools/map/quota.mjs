// @ts-check
// Meets a share per 1 degree cell without drawing 1 degree squares.
//
// The problem: the pollen map says, say, 64% of one 1 degree cell was forest and 70% of the next.
// Picking the best-scoring 64% of cells in the first square and the best 70% in the second
// would meet both numbers exactly, but the rule changes at the square's edge and the edge shows
// as a straight line across the map. Instead each square gets a score threshold at its centre,
// the thresholds are blended smoothly between centres (the same bilinear blend as the pollen
// field), and a cell is chosen when its score beats the blended threshold at that cell. The
// thresholds are then nudged, a few rounds over, until every square's share is back on target.
// The rule changes smoothly everywhere, so no square edge can show.

import { blendAt } from './pollen-field.mjs';

/**
 * @typedef {object} QuotaInput
 * @property {Float32Array} score higher = chosen first
 * @property {Uint8Array} eligible 1 where the cell may be chosen
 * @property {Uint8Array} domain 1 where the cell counts in its square's total (eligible or not)
 * @property {import('./pollen-field.mjs').Places} places
 * @property {Float64Array} target wanted share of each square's domain cells, per node
 * @property {number} [tolerance] stop when every square is within this share (default 0.005)
 * @property {number} [maxRounds] default 60
 * @property {(round: number, worst: number) => void} [onRound] for tuning: called after each count
 *
 * @typedef {object} QuotaResult
 * @property {Uint8Array} chosen
 * @property {Float64Array} threshold per node
 * @property {Int32Array} domainCount @property {Int32Array} eligibleCount @property {Int32Array} chosenCount
 * @property {Int32Array} wantCount per node, after capping at the eligible count
 * @property {number} rounds @property {number} worst largest miss, as a share of the square, beyond
 *   the one cell that rounding may always leave over
 */

/**
 * @param {QuotaInput} q
 * @returns {QuotaResult}
 */
export function solveQuota(q) {
  const { score, eligible, domain, places: P, target } = q;
  const tolerance = q.tolerance ?? 0.005;
  const maxRounds = q.maxRounds ?? 60;
  const nodes = P.w * P.h;
  const n = score.length;

  // Cells grouped by square: one counting sort, so each round walks each square's cells in turn.
  const domainCount = new Int32Array(nodes);
  const eligibleCount = new Int32Array(nodes);
  for (let i = 0; i < n; i++) {
    const g = P.group[i];
    if (g < 0) continue;
    if (domain[i]) domainCount[g]++;
    if (eligible[i]) eligibleCount[g]++;
  }
  const start = new Int32Array(nodes + 1);
  for (let g = 0; g < nodes; g++) start[g + 1] = start[g] + eligibleCount[g];
  const members = new Int32Array(start[nodes]);
  const fillAt = start.slice(0, nodes);
  for (let i = 0; i < n; i++) if (eligible[i] && P.group[i] >= 0) members[fillAt[P.group[i]]++] = i;

  // How many cells each square wants. A square cannot choose more cells than it has eligible
  // (marsh and heath already took part of the open share); such squares are capped and reported.
  const wantCount = new Int32Array(nodes);
  let lo = Infinity; let hi = -Infinity;
  for (let i = 0; i < n; i++) if (eligible[i]) { lo = Math.min(lo, score[i]); hi = Math.max(hi, score[i]); }
  if (!(lo <= hi)) { lo = 0; hi = 0; }
  // How far past the scores a threshold may go. A square whose few cells sit in a corner, far
  // from its own centre, feels its own threshold only weakly (a quarter at the corner), so it
  // may need a value well outside the score range; but not an unbounded one.
  const reach = 3 * (hi - lo) + 1;
  const threshold = new Float64Array(nodes);
  for (let g = 0; g < nodes; g++) {
    const t = Number.isFinite(target[g]) ? target[g] : 0;
    wantCount[g] = Math.min(eligibleCount[g], Math.round(t * domainCount[g]));
    // Start from the square's own quantile, so the first round is already close.
    threshold[g] = startThreshold(score, members, start[g], start[g + 1], wantCount[g], lo, hi);
  }
  fillEmpty(threshold, eligibleCount, P.w, P.h);

  const values = new Float64Array(Math.max(1, ...eligibleCount));
  const chosenCount = new Int32Array(nodes);
  // Each square's step size. All squares move at once and each one's threshold also reaches into
  // its neighbours' cells, so full steps can overshoot and swing back and forth; a square whose
  // miss changes sign halves its step, one that keeps missing the same way grows it again.
  const gain = new Float64Array(nodes).fill(1);
  const lastMiss = new Int32Array(nodes);
  let rounds = 0;
  let worst = Infinity;
  for (; rounds < maxRounds; rounds++) {
    worst = countChosen(score, members, start, P, threshold, chosenCount, wantCount, domainCount);
    q.onRound?.(rounds, worst);
    if (worst <= tolerance) break;
    for (let g = 0; g < nodes; g++) {
      const m = start[g + 1] - start[g];
      if (!m) continue;
      const miss = chosenCount[g] - wantCount[g];
      if (miss * lastMiss[g] < 0) gain[g] = Math.max(0.1, gain[g] / 2);
      else if (miss !== 0) gain[g] = Math.min(1, gain[g] * 1.25);
      lastMiss[g] = Math.sign(miss);
      if (Math.abs(miss) <= 1) continue; // close enough: let the neighbours settle round it
      // The shift that would make this square exact if its neighbours stood still.
      for (let k = 0; k < m; k++) {
        const i = members[start[g] + k];
        values[k] = score[i] - blendAt(threshold, P, i);
      }
      const shift = cutBetween(values.subarray(0, m), wantCount[g]);
      threshold[g] = Math.max(lo - reach, Math.min(hi + reach, threshold[g] + gain[g] * shift));
    }
    fillEmpty(threshold, eligibleCount, P.w, P.h);
  }
  if (rounds === maxRounds) worst = countChosen(score, members, start, P, threshold, chosenCount, wantCount, domainCount);

  const chosen = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (eligible[i] && score[i] > blendAt(threshold, P, i)) chosen[i] = 1;
  return { chosen, threshold, domainCount, eligibleCount, chosenCount, wantCount, rounds, worst };
}

/**
 * The square's own cut: a score between the wanted count's last chosen and first left-out cell.
 * @param {Float32Array} score @param {Int32Array} members @param {number} a @param {number} b
 * @param {number} want @param {number} lo @param {number} hi
 */
function startThreshold(score, members, a, b, want, lo, hi) {
  if (a === b) return (lo + hi) / 2;
  const v = new Float64Array(b - a);
  for (let k = a; k < b; k++) v[k - a] = score[members[k]];
  return cutBetween(v, want);
}

/**
 * A cut value so that exactly `want` of the values are above it (sorts `v` in place). For
 * "none" and "all" it sits a little past the extreme value, not far beyond it, so one empty or
 * full square does not drag its neighbours' blended thresholds a long way.
 * @param {Float64Array} v @param {number} want
 */
function cutBetween(v, want) {
  v.sort();
  const m = v.length;
  if (want <= 0) return v[m - 1] + 0.01;
  if (want >= m) return v[0] - 0.01;
  return (v[m - want - 1] + v[m - want]) / 2;
}

/**
 * Counts chosen cells per square under the current thresholds; returns the worst miss (as a
 * share of the square's domain) over squares that have any domain cells.
 * @param {Float32Array} score @param {Int32Array} members @param {Int32Array} start
 * @param {import('./pollen-field.mjs').Places} P @param {Float64Array} threshold
 * @param {Int32Array} chosenCount @param {Int32Array} wantCount @param {Int32Array} domainCount
 */
function countChosen(score, members, start, P, threshold, chosenCount, wantCount, domainCount) {
  let worst = 0;
  for (let g = 0; g < chosenCount.length; g++) {
    let k = 0;
    for (let j = start[g]; j < start[g + 1]; j++) {
      const i = members[j];
      if (score[i] > blendAt(threshold, P, i)) k++;
    }
    chosenCount[g] = k;
    // One cell either way is rounding, not a miss: a 5-cell square cannot be nearer than 20%.
    if (domainCount[g]) worst = Math.max(worst, Math.max(0, Math.abs(k - wantCount[g]) - 1) / domainCount[g]);
  }
  return worst;
}

/**
 * Squares with nothing to choose (open sea, or off the map) still feed the blend at their
 * neighbours' edges. Give them the mean of their neighbours, spreading outwards, so they pull
 * neither up nor down.
 * @param {Float64Array} threshold @param {Int32Array} eligibleCount @param {number} w @param {number} h
 */
function fillEmpty(threshold, eligibleCount, w, h) {
  const known = new Uint8Array(w * h);
  for (let g = 0; g < w * h; g++) known[g] = eligibleCount[g] > 0 ? 1 : 0;
  for (let pass = 0; pass < w + h; pass++) {
    let changed = false;
    const next = known.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const g = y * w + x;
        if (known[g]) continue;
        let s = 0; let c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h || !known[yy * w + xx]) continue;
            s += threshold[yy * w + xx]; c++;
          }
        }
        if (c) { threshold[g] = s / c; next[g] = 1; changed = true; }
      }
    }
    known.set(next);
    if (!changed) break;
  }
}

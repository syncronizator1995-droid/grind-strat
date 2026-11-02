// @ts-check
// The rules for the AD 1 coast (M3b): a second field over the same box as the 1219 coast field,
// read only for years before 1219 (src/sim/coast-date.js, "lead-in"). Pure functions, tested in
// Node; tools/map/build-coast-ad1.mjs reads the inputs and writes the field.
//
// The sea's height above today's at a place is taken as a straight line in time:
//   AD 1: H1 = k1 x (uplift - 0.5) x 2020 years         (k1 fitted at control places, see below)
//   1219: H1219 = k x (uplift - 0.5) x 802 years         (the 1219 field's own: tools/map/coast.mjs)
//   in between H(t) = H1 + (H1219 - H1) x (t - 1) / 1218.
// A cell of today's land at height h is land from the year where H(t) = h, so the shore moves at
// a steady pace between the two. Cells that are still sea in 1219 keep the 1219 field's years
// (their lead code is those years in 8-year steps), so the two fields agree at 1219: the same set
// of cells is sea just before it as in the 1219 field. Sills hold back the sea as in 1219 (the same
// widest-path flood). An estimate, not a measurement: the 1219 labels apply.

import { createHash } from 'node:crypto';
import { COAST_BASE_YEAR, COAST_CODE, LEAD } from '../../src/sim/coast-date.js';
import { COAST_PARAMS, kField } from './coast.mjs';

/** The sources that can end up in the field (SGU's shore model is blocked, so not among them). */
export const COAST_AD1_SOURCES = Object.freeze(['nkg-rf17vel', 'gebco-2026', 'ne-land', 'ne-lakes']);

/** The highest lead code a cell that is land in 1219 can have: land by 1217. */
export const LEAD_LAST_BEFORE_1219 = Math.floor((COAST_BASE_YEAR - 1 - LEAD.baseYear) / LEAD.step);

/**
 * A fingerprint of the rules' settings and the AD 1 control points, so a stale field is caught.
 * @param {string} anchorsText the text of tools/map/coast-anchors-ad1.json
 * @param {string} mainParamsSha256 the 1219 field's fingerprint it was built over
 */
export function coastAd1ParamsSha256(anchorsText, mainParamsSha256) {
  return createHash('sha256').update(JSON.stringify({ COAST_PARAMS, LEAD })).update('\n').update(anchorsText).update('\n').update(mainParamsSha256).digest('hex');
}

/**
 * The lead code of a year: land from LEAD.baseYear + 8 x code. Years up to AD 1 are code 0.
 * @param {number} year
 */
export const leadCodeOfYear = (year) => (year <= LEAD.baseYear ? 0 : Math.min(LEAD.last, Math.ceil((year - LEAD.baseYear) / LEAD.step)));

/**
 * Fits k for each group by least squares through zero: rsl = k x rate x years, rate being
 * (uplift - seaRise) with k = 1. Unlike coast.mjs's fitGroups it accepts points older than AD 800,
 * because the AD 1 control points are older (the uplift was faster then, which k then absorbs).
 * @param {{ id: string, group: string, use: string, year: number, rslM: number, lon: number, lat: number }[]} points
 * @param {(p: any) => { up: number, x: number, y: number }} at
 */
export function fitGroupsAd1(points, at) {
  /** @type {Map<string, { sxy: number, sxx: number, x: number, y: number, ids: string[] }>} */
  const groups = new Map();
  for (const p of points) {
    if (p.use !== 'value') continue;
    const { up, x, y } = at(p);
    const unit = ((up - COAST_PARAMS.seaRise) * (COAST_PARAMS.today - p.year)) / 1000;
    if (!(unit > 0)) throw new Error(`${p.id}: the land does not rise there`);
    const g = groups.get(p.group) ?? { sxy: 0, sxx: 0, x: 0, y: 0, ids: [] };
    g.sxy += unit * p.rslM; g.sxx += unit * unit; g.x += x; g.y += y; g.ids.push(p.id);
    groups.set(p.group, g);
  }
  return [...groups].map(([group, g]) => ({ group, k: g.sxy / g.sxx, x: g.x / g.ids.length, y: g.y / g.ids.length, points: g.ids }));
}

/**
 * k at a place for AD 1: the 1219 groups' k, with the AD 1 groups replacing those of the same name.
 * @param {import('./coast.mjs').FittedGroup[]} mainGroups @param {import('./coast.mjs').FittedGroup[]} adGroups
 * @returns {(x: number, y: number) => number}
 */
export function kFieldAd1(mainGroups, adGroups) {
  const replaced = new Set(adGroups.map((g) => g.group));
  return kField([...mainGroups.filter((g) => !replaced.has(g.group)), ...adGroups]);
}

/**
 * Each land cell's own lead code (sea 254), before the flood.
 * @param {{ land: Uint8Array, heights: Float32Array, fall: Float32Array, fall1: Float32Array, main: Uint8Array }} g
 *   fall, fall1: mm a year (1219's and AD 1's k), 0 where nothing changes; main: the 1219 field's final codes
 * @returns {Uint8Array}
 */
export function leadOwnCodes({ land, heights, fall, fall1, main }) {
  const out = new Uint8Array(land.length);
  const toDay = COAST_PARAMS.today;
  for (let i = 0; i < land.length; i++) {
    if (!land[i]) { out[i] = COAST_CODE.sea; continue; }
    const k = main[i];
    if (k >= COAST_CODE.first && k <= COAST_CODE.last) { out[i] = leadCodeOfYear(COAST_BASE_YEAR + 4 * k); continue; }
    // Land in 1219 (or never changing): the sea of AD 1 may still have covered it.
    if (!(fall[i] > 0) || !(fall1[i] > 0)) { out[i] = 0; continue; }
    const h = Math.max(COAST_PARAMS.minLandM, heights[i]);
    const h1219 = (fall[i] * (toDay - COAST_BASE_YEAR)) / 1000;
    const h1 = Math.max(h1219, (fall1[i] * (toDay - LEAD.baseYear)) / 1000);
    if (h >= h1 || !(h1 > h1219)) { out[i] = 0; continue; }
    const year = LEAD.baseYear + ((h1 - h) / (h1 - h1219)) * (COAST_BASE_YEAR - LEAD.baseYear);
    out[i] = Math.max(1, Math.min(LEAD_LAST_BEFORE_1219, leadCodeOfYear(year)));
  }
  return out;
}

/**
 * The cells under a hand-drawn line (in game units relative to the box's corner), stepped by half
 * a cell along it, each with the width of the cell it falls in.
 * @param {number[]} a [x, y] @param {number[]} b [x, y] @param {number} cols @param {number} rows @param {number} cell
 * @returns {number[]} cell indexes, each once
 */
export function lineCells(a, b, cols, rows, cell) {
  const steps = Math.max(1, Math.ceil((Math.hypot(b[0] - a[0], b[1] - a[1]) / cell) * 2));
  const seen = new Set();
  for (let s = 0; s <= steps; s++) {
    const c = Math.floor((a[0] + ((b[0] - a[0]) * s) / steps) / cell);
    const r = Math.floor((a[1] + ((b[1] - a[1]) * s) / steps) / cell);
    if (c >= 0 && r >= 0 && c < cols && r < rows) seen.add(r * cols + c);
  }
  return [...seen];
}

/**
 * Carries a line on in both directions until its next step lands on today's sea (or `max` cells),
 * so a cut across a neck reaches the water on both sides.
 * @param {number[]} a @param {number[]} b [x, y] @param {Uint8Array} land today's land over the box
 * @param {number} cols @param {number} rows @param {number} cell @param {number} [max]
 * @returns {[number[], number[]]} the longer line's two ends
 */
export function extendToSea(a, b, land, cols, rows, cell, max = 60) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = (b[0] - a[0]) / len; const dy = (b[1] - a[1]) / len;
  /** @param {number[]} from @param {number} sign */
  const walk = (from, sign) => {
    let [x, y] = from;
    for (let s = 0; s < max * 2; s++) {
      const c = Math.floor(x / cell); const r = Math.floor(y / cell);
      if (c < 0 || r < 0 || c >= cols || r >= rows || !land[r * cols + c]) break;
      x += sign * dx * (cell / 2); y += sign * dy * (cell / 2);
    }
    return [x, y];
  };
  return [walk(a, -1), walk(b, 1)];
}

/**
 * Holds drawn cut cells of today's land under the sea until a year (Kopli's neck): their own code
 * becomes the year's, unless it is higher already. Changes `own` in place.
 * @param {Uint8Array} own @param {Uint8Array} land @param {number[]} cells @param {number} seaUntil
 * @returns {number} how many cells were held
 */
export function holdCut(own, land, cells, seaUntil) {
  const code = Math.min(LEAD_LAST_BEFORE_1219, leadCodeOfYear(seaUntil));
  let held = 0;
  for (const i of cells) if (land[i] && own[i] < code) { own[i] = code; held++; }
  return held;
}

/**
 * Puts the two fields in step after the flood and the spread into today's sea: a cell is sea
 * until after 1219 (lead code 153 and up) exactly where the 1219 field says it is sea at 1219
 * (a code of 1 or more), and open sea (254) where the 1219 field says so.
 * @param {Uint8Array} lead changed in place @param {Uint8Array} main
 * @returns {number} how many cells were put right
 */
export function agreeAtHandOver(lead, main) {
  const first = leadCodeOfYear(COAST_BASE_YEAR + 4);
  let fixed = 0;
  for (let i = 0; i < lead.length; i++) {
    const m = main[i];
    let v = lead[i];
    if (m === COAST_CODE.sea) v = COAST_CODE.sea;
    else if (m >= COAST_CODE.first) v = Math.max(v === COAST_CODE.sea ? first : v, first);
    else v = Math.min(v === COAST_CODE.sea ? 0 : v, LEAD_LAST_BEFORE_1219);
    if (v !== lead[i]) { lead[i] = v; fixed++; }
  }
  return fixed;
}

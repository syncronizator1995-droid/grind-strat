// @ts-check
// Our own block: src/data/own/changes.json, the dated facts and drawn shapes of the map over time
// (M3a), under the game's own terms (not yet chosen by Ignas; see src/data/own/LICENSE.md). It
// holds only our own work: the entries of tools/map/water-changes.json (years, facts, sources by
// name, marks; no web addresses, which stay in data/sources.md) and the shapes of
// tools/map/history-shapes.json. No OpenStreetMap data: the OpenStreetMap features that are
// dated carry only our ids, as tags, in the ODbL water block.
//
// Layers:
//   shapes, shapeLevels   our shapes' rings (game units) and one level per point (as the water)
//   cells:<entry>, bands:<entry>   for each diking entry, the 1 km terrain cells it holds as marsh
//                         and each cell's band (0-31, lower switches earlier): the land engine's
//                         overrides (src/sim/map-date.js createTerrainTimeline)
//   info                  JSON: { entries, sources, shapes, overrides, grid }
//
//   node tools/map/pack-changes.mjs     (npm run map:pack runs it too)

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGrid16, decodeShapes, encodeShapes, encodeUints } from '../../src/ui/map/codec.js';
import { ROOT, writeBlock, makeBlock } from './block.mjs';
import { fillRings } from './geo.mjs';
import { joinLevels, pointLevels } from './levels.mjs';
import { WATER_TOLERANCES } from './pack-water.mjs';
import { blockLayers } from './water-hashes.mjs';
import { orient, pointInRings } from './water-rules.mjs';

export const CHANGES_BLOCK = 'src/data/own/changes.json';
export const OWN_NOTICE = 'Grind Strat\'s own work: the dated facts and the drawn shapes (marked "reconstructed") of the map over time. Under the game\'s own terms, not yet chosen. The sources of each fact are named with it; their full details are in the game\'s source code (data/sources.md).';
/** The terrain class the delta holds before it is diked (src/ui/map/terrain.js TERRAIN.marsh). */
const MARSH = 5;
/** Delta cells at or below this height (m) are the diking's low ground (its second wave). */
const LOW_M = 0;
/** Delta cells above this height (m) are not low ground at all. */
const DELTA_TOP_M = 5;

/**
 * @typedef {{ cite: string, url: string, seen: string }} Source
 * @typedef {{ id: string, kind: string, on?: [number | null, number | null], spread?: [number, number], tagPrefix?: string,
 *   feature?: object, shape?: string, about?: { wikidata: string }, what: string, fact: string, source?: string,
 *   toCheck?: string, marks?: string[], fix1219?: boolean, maskFrom?: string, maskSources?: string[] }} Entry
 * @typedef {{ id: string, type: 'water' | 'land' | 'lake' | 'terrain', class?: string, ring: number[][], drawnFrom: string,
 *   sources: string[], marks: string[] }} Shape
 * @typedef {{ cols: number, rows: number, cell: number }} GridSpec the 1 km terrain grid, south row first
 * @typedef {{ cols: number, rows: number, cell: number, data: ArrayLike<number> }} Heights the base block's heights
 */

/** A shape's ring as flat game units, counter-clockwise. @param {Shape} s */
export const shapeRing = (s) => orient(s.ring.flat(), false);

/**
 * A height at a point, bilinear between the heights grid's cell centres.
 * @param {Heights} h @param {number} x @param {number} y game units
 */
export function heightAt(h, x, y) {
  const fx = Math.min(h.cols - 1, Math.max(0, x / h.cell - 0.5));
  const fy = Math.min(h.rows - 1, Math.max(0, y / h.cell - 0.5));
  const c0 = Math.floor(fx); const r0 = Math.floor(fy);
  const c1 = Math.min(h.cols - 1, c0 + 1); const r1 = Math.min(h.rows - 1, r0 + 1);
  const tx = fx - c0; const ty = fy - r0;
  const v = (/** @type {number} */ c, /** @type {number} */ r) => h.data[r * h.cols + c];
  return (v(c0, r0) * (1 - tx) + v(c1, r0) * tx) * (1 - ty) + (v(c0, r1) * (1 - tx) + v(c1, r1) * tx) * ty;
}

/**
 * The delta's terrain cells: inside the shape, on the base land, and at most DELTA_TOP_M high,
 * split into the higher ground (wave 1, diked first) and the low ground at or below LOW_M (wave
 * 2). Each cell's band orders it inside its wave: higher ground first.
 * @param {Shape} shape @param {number[][]} land base land rings, game units @param {Heights} heights @param {GridSpec} grid
 */
export function deltaCells(shape, land, heights, grid) {
  const { cols, rows, cell } = grid;
  const inShape = new Uint8Array(cols * rows);
  fillRings(inShape, cols, rows, cell, [shapeRing(shape)], 1);
  const onLand = new Uint8Array(cols * rows);
  fillRings(onLand, cols, rows, cell, land, 1);
  /** @type {{ cells: number[], bands: number[] }[]} */
  const waves = [{ cells: [], bands: [] }, { cells: [], bands: [] }];
  for (let i = 0; i < inShape.length; i++) {
    if (!inShape[i] || !onLand[i]) continue;
    const x = ((i % cols) + 0.5) * cell; const y = (Math.floor(i / cols) + 0.5) * cell;
    const h = heightAt(heights, x, y);
    if (h > DELTA_TOP_M) continue;
    if (h > LOW_M) {
      waves[0].cells.push(i);
      waves[0].bands.push(Math.max(0, Math.min(31, Math.round(((DELTA_TOP_M - h) / (DELTA_TOP_M - LOW_M)) * 31))));
    } else {
      waves[1].cells.push(i);
      waves[1].bands.push(Math.max(0, Math.min(31, Math.round((LOW_M - h) / 2.5 * 31))));
    }
  }
  return waves;
}

/**
 * Whether a shape changes anything on today's base: a water channel or a lake must cover some
 * base land, a land patch some base sea, a terrain shape some land. Sampled on a lattice of 20 m, or coarser for a big shape.
 * @param {Shape} shape @param {number[][]} land base land rings
 * @returns {{ inside: number, changed: number }} lattice points inside the shape, and how many change
 */
export function shapeEffect(shape, land) {
  const ring = shapeRing(shape);
  const xs = ring.filter((_, i) => i % 2 === 0); const ys = ring.filter((_, i) => i % 2 === 1);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // About 200 x 200 samples at most, never coarser than needed for a 400 m channel (0.2 units = 20 m).
  const step = Math.max(0.2, Math.max(x1 - x0, y1 - y0) / 200);
  // Only the land rings whose box meets the shape's (the even-odd rule is unchanged by the rest).
  const near = land.filter((r) => {
    let a = Infinity; let b = -Infinity; let c = Infinity; let d = -Infinity;
    for (let i = 0; i < r.length; i += 2) { a = Math.min(a, r[i]); b = Math.max(b, r[i]); c = Math.min(c, r[i + 1]); d = Math.max(d, r[i + 1]); }
    return a <= x1 && b >= x0 && c <= y1 && d >= y0;
  });
  let inside = 0; let changed = 0;
  for (let x = x0; x <= x1; x += step) {
    for (let y = y0; y <= y1; y += step) {
      if (!pointInRings(x, y, [ring])) continue;
      inside++;
      const isLand = pointInRings(x, y, near);
      if (shape.type === 'land' ? !isLand : isLand) changed++;
    }
  }
  return { inside, changed };
}

/**
 * The entries as the game reads them: no web addresses, no tools-only fields.
 * @param {Entry[]} entries
 */
const shippedEntries = (entries) => entries.map((e) => ({
  id: e.id, kind: e.kind,
  ...(e.on ? { on: e.on } : {}), ...(e.spread ? { spread: e.spread } : {}), ...(e.tagPrefix ? { tagPrefix: e.tagPrefix } : {}),
  ...(e.shape ? { shape: e.shape } : {}), ...(e.about ? { about: e.about } : {}), ...(e.feature ? { dates: 'feature' } : {}),
  fact: e.fact, ...(e.source ? { source: e.source } : {}), ...(e.toCheck ? { toCheck: e.toCheck } : {}),
  ...(e.marks?.length ? { marks: e.marks } : {}), ...(e.fix1219 ? { fix1219: true } : {}),
}));

/**
 * Problems with the dated list and the shapes: what the build refuses.
 * @param {{ sources: Record<string, Source>, entries: Entry[] }} changes @param {Shape[]} shapes
 */
export function changesProblems(changes, shapes) {
  const problems = [];
  const ids = new Set();
  const shapeIds = new Set(shapes.map((s) => s.id));
  const KINDS = ['reservoir', 'channel', 'outlet', 'land', 'lake', 'diking', 'dam', 'fact', 'rule'];
  for (const e of changes.entries) {
    if (ids.has(e.id)) problems.push(`${e.id}: the id is used twice`);
    ids.add(e.id);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) problems.push(`${e.id}: ids are kebab-case`);
    if (!KINDS.includes(e.kind)) problems.push(`${e.id}: unknown kind ${e.kind}`);
    if (!e.source && !e.toCheck) problems.push(`${e.id}: needs a source or a toCheck`);
    if (e.source && !changes.sources[e.source]) problems.push(`${e.id}: unknown source ${e.source}`);
    for (const id of e.maskSources ?? []) if (!changes.sources[id]) problems.push(`${e.id}: unknown mask source ${id}`);
    if (e.feature && 'mask' in e.feature && !e.maskSources?.length) problems.push(`${e.id}: a mask names the sources of its coordinates`);
    if (!e.fact || !e.what) problems.push(`${e.id}: needs what and fact`);
    if (e.kind === 'rule' ? !e.tagPrefix : !e.on) problems.push(`${e.id}: ${e.kind === 'rule' ? 'a rule needs tagPrefix' : 'needs on: [from, to]'}`);
    for (const y of [...(e.on ?? []), ...(e.spread ?? [])]) if (y !== null && (!Number.isInteger(y) || y === 0)) problems.push(`${e.id}: bad year ${y} (BC is negative, there is no year 0)`);
    if (e.on && e.on[0] !== null && e.on[1] !== null && e.on[0] >= e.on[1]) problems.push(`${e.id}: on runs backwards`);
    if (e.kind === 'diking' && (!e.spread || !e.shape || !e.on || e.on[1] === null || e.spread[1] > e.on[1])) problems.push(`${e.id}: a diking entry needs a shape, and a spread that ends by its on's end`);
    if (e.shape && !shapeIds.has(e.shape)) problems.push(`${e.id}: unknown shape ${e.shape}`);
    if (e.marks?.includes('reconstructed') && !e.shape) problems.push(`${e.id}: 'reconstructed' is for our own shapes`);
    if (e.shape && !e.marks?.includes('reconstructed')) problems.push(`${e.id}: a drawn shape is marked 'reconstructed'`);
    if (/https?:|\/\//.test(`${e.fact}${e.toCheck ?? ''}`)) problems.push(`${e.id}: web addresses go in data/sources.md, not in the shown text`);
  }
  for (const s of shapes) {
    if (!changes.entries.some((e) => e.shape === s.id)) problems.push(`shape ${s.id}: no entry dates it`);
    if (!s.drawnFrom || !s.marks.includes('reconstructed')) problems.push(`shape ${s.id}: needs drawnFrom and the mark 'reconstructed'`);
    if (/openstreetmap|\bosm\b/i.test(s.drawnFrom)) problems.push(`shape ${s.id}: drawn from OpenStreetMap, which would make it ODbL`);
    for (const id of s.sources) if (!changes.sources[id]) problems.push(`shape ${s.id}: unknown source ${id}`);
  }
  for (const [id, s] of Object.entries(changes.sources)) if (/https?:|\/\//.test(s.cite)) problems.push(`source ${id}: the cite has a web address (it goes in url)`);
  return problems;
}

/**
 * Our block, from the dated list, the shapes and the base block (land rings and heights).
 * @param {{ sources: Record<string, Source>, entries: Entry[] }} changes @param {Shape[]} shapes
 * @param {{ land: number[][], heights: Heights, grid: GridSpec }} base
 */
export function changesBlock(changes, shapes, base) {
  const problems = changesProblems(changes, shapes);
  for (const s of shapes) {
    const { changed } = shapeEffect(s, base.land);
    if (!changed) problems.push(`shape ${s.id} changes nothing on today's base land`);
  }
  if (problems.length) throw new Error(`tools/map/water-changes.json or history-shapes.json:\n- ${problems.join('\n- ')}`);
  const rings = shapes.map(shapeRing);
  /** @type {Record<string, Uint8Array>} */
  const layers = {
    shapes: encodeShapes(rings),
    shapeLevels: joinLevels(rings.map((r) => pointLevels(r, true, { tolerances: WATER_TOLERANCES }))),
  };
  const overrides = [];
  /** @type {Map<string, { cells: number[], bands: number[] }[]>} */
  const wavesOf = new Map();
  const dikings = changes.entries.filter((e) => e.kind === 'diking');
  for (const e of dikings) {
    const shape = /** @type {Shape} */ (shapes.find((s) => s.id === e.shape));
    if (shape.type !== 'terrain' || shape.class !== 'marsh') throw new Error(`${e.id}: its shape ${shape.id} is not a marsh terrain shape`);
    if (!wavesOf.has(shape.id)) wavesOf.set(shape.id, deltaCells(shape, base.land, base.heights, base.grid));
  }
  // A shape's first diking entry (the earlier spread) takes its higher ground, the second its low ground.
  /** @type {Map<string, number>} */
  const used = new Map();
  for (const e of [...dikings].sort((a, b) => /** @type {[number, number]} */ (a.spread)[0] - /** @type {[number, number]} */ (b.spread)[0])) {
    const k = used.get(/** @type {string} */ (e.shape)) ?? 0;
    used.set(/** @type {string} */ (e.shape), k + 1);
    const wave = /** @type {{ cells: number[], bands: number[] }[]} */ (wavesOf.get(/** @type {string} */ (e.shape)))[k];
    if (!wave || !wave.cells.length) throw new Error(`${e.id}: no cells (wave ${k + 1} of shape ${e.shape})`);
    layers[`cells:${e.id}`] = encodeUints(wave.cells);
    layers[`bands:${e.id}`] = Uint8Array.from(wave.bands);
    const [from, to] = /** @type {[number, number]} */ (e.spread);
    overrides.push({ entry: e.id, shape: e.shape, cls: MARSH, from, to, hold: 'before', cells: `cells:${e.id}`, bands: `bands:${e.id}`, count: wave.cells.length });
  }
  const used1219 = changes.entries.filter((e) => e.fix1219).map((e) => e.id);
  layers.info = new TextEncoder().encode(JSON.stringify({
    entries: shippedEntries(changes.entries),
    sources: Object.fromEntries(Object.entries(changes.sources).map(([id, s]) => [id, s.cite])),
    shapes: shapes.map((s) => ({ id: s.id, type: s.type, ...(s.class ? { class: s.class } : {}), marks: s.marks })),
    overrides,
    grid: { ...base.grid, rowOrder: 'south-first' },
  }));
  return makeBlock({
    kind: 'changes',
    licence: 'grind-strat-own',
    notice: OWN_NOTICE,
    sources: ['grind-strat-own'],
    meta: { entries: changes.entries.length, shapes: shapes.length, overrideCells: overrides.reduce((s, o) => s + o.count, 0), fix1219: used1219, levels: WATER_TOLERANCES },
    layers,
  });
}

/** Reads the inputs from the repository. */
export async function changesInputs() {
  const changes = JSON.parse(await readFile(join(ROOT, 'tools/map/water-changes.json'), 'utf8'));
  const { shapes } = JSON.parse(await readFile(join(ROOT, 'tools/map/history-shapes.json'), 'utf8'));
  const baseBlock = JSON.parse(await readFile(join(ROOT, 'src/data/map/base.json'), 'utf8'));
  const terrain = JSON.parse(await readFile(join(ROOT, 'src/data/by-sa/terrain-1219.json'), 'utf8'));
  const L = blockLayers(baseBlock);
  const g = decodeGrid16(L.heights);
  const land = decodeShapes(L.land).map((r) => Array.from(r));
  const { cols, rows, cell } = terrain.meta.terrain;
  return { changes, shapes, base: { land, heights: { cols: g.cols, rows: g.rows, cell: baseBlock.meta.heights.cell, data: g.data }, grid: { cols, rows, cell } } };
}

/** @returns {Promise<import('./block.mjs').Block>} */
export async function packChanges() {
  const { changes, shapes, base } = await changesInputs();
  return changesBlock(changes, shapes, base);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  packChanges().then(async (block) => {
    const text = await writeBlock(CHANGES_BLOCK, block);
    console.log(`${CHANGES_BLOCK}: ${(text.length / 1024).toFixed(1)} KB, ${JSON.stringify(block.meta)}`);
  }).catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

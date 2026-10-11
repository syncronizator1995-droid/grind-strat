// @ts-check
// Builds the OpenStreetMap rivers and lakes of the 1219 map from Overture's copy of OSM (the rows
// tools/map/fetch-overture.mjs extracted into data/raw/overture/) and the OSM river relations
// cached in data/raw/osm/, and writes data/raw/derived/water-osm.json (git ignores it), which
// tools/map/pack-water.mjs simplifies and packs into src/data/odbl/water.json.
// The output is OSM-only on purpose (the OSMF rule on mixing sources in one layer): nothing from
// Natural Earth or any other source goes into it. Natural Earth land is only drawn under the
// preview pictures, for orientation.
//
//   node tools/map/build-water.mjs [preview-dir]
//
// Output, in whole game units (100 m) projected with MAP.toUnits and clipped to the map:
//   { source: 'osm', licence: 'ODbL-1.0', osmBase, overture, thresholds,
//     rivers: [{ id, name, names, wikidata, lengthKm, lines: [[x0, y0, ...], ...], lineNames }],
//     lakes:  [{ id, name, names, otherNames?, wikidata, areaKm2, rings: [[...], ...] }],
//     dropped: [{ id, name, wikidata, why }], checks: {...} }
// lineNames[i] is the local name of lines[i] (OSM's name where that stretch lies), '' where the
// stretch has none of its own. Lake rings: outer rings counter-clockwise and holes clockwise
// (y grows north), each outer ring before its own holes, the first point not repeated.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRaw } from './fetch.mjs';
import { clipLine, clipRing, featuresIn, fillRings, openRing, project } from './geo.mjs';
import { lakeCandidate, overtureRun, riverRelations, riverWay, waterRows } from './overture-water.mjs';
import { encodePng } from './png.mjs';
import { MAP } from './projection.mjs';
import { DERIVED } from './resample.mjs';
import { waterLabels } from './water-labels.mjs';
import {
  classifyLake, dropRepeats, groupRivers, KM2_PER_UNIT2, KM_PER_UNIT, lengthInside, lineLength, localNames, namesOf, orient, otherNamesOf,
  pointInRings, reviewIndex, riverMainName, ringsArea, stitch, THRESHOLDS,
} from './water-rules.mjs';

const REVIEW_FILE = fileURLToPath(new URL('./osm-water-1219.json', import.meta.url));
const OUT = join(DERIVED, 'water-osm.json');
const DEFAULT_PREVIEWS = join(DERIVED, 'previews');

/** @typedef {number[]} Flat */
/** @typedef {Record<string, string>} Tags */
/** @typedef {import('./water-rules.mjs').RiverWay} RiverWay */

/**
 * Rivers that must be on the map: what we call each, the names it may carry in OSM (local names
 * first), and the main name the map shows for it (tools/map/water-labels.mjs: the local name at
 * its lower end inside the map, in Latin letters).
 * Matching is on the river's name, its line names and its name:xx, ignoring case.
 * @type {[string, string[], string][]}
 */
export const MUST_HAVE_RIVERS = [
  ['Nemunas', ['Nemunas', 'Нёман', 'Неман', 'Niemen', 'Memel'], 'Nemunas'], ['Neris', ['Neris', 'Вілія', 'Вилия'], 'Neris'],
  ['Nevėžis', ['Nevėžis'], 'Nevėžis'], ['Dubysa', ['Dubysa'], 'Dubysa'], ['Šešupė', ['Šešupė', 'Шешупе'], 'Sheshupe'], ['Minija', ['Minija'], 'Minija'],
  ['Jūra', ['Jūra'], 'Jūra'], ['Merkys', ['Merkys'], 'Merkys'], ['Šventoji', ['Šventoji'], 'Šventoji'], ['Mūša', ['Mūša'], 'Mūsa'],
  ['Nemunėlis', ['Nemunėlis', 'Mēmele'], 'Mēmele'], ['Lielupe', ['Lielupe'], 'Lielupe'], ['Venta', ['Venta'], 'Venta'],
  ['Daugava', ['Daugava', 'Заходняя Дзвіна', 'Западная Двина'], 'Daugava'], ['Gauja', ['Gauja'], 'Gauja'], ['Aiviekste', ['Aiviekste'], 'Aiviekste'],
  ['Salaca', ['Salaca'], 'Salaca'], ['Emajõgi', ['Emajõgi'], 'Emajõgi'], ['Pärnu', ['Pärnu jõgi', 'Pärnu'], 'Pärnu jõgi'], ['Narva', ['Narva jõgi'], 'Narva jõgi'],
  ['Velikaya', ['Великая'], 'Velikaya'], ['Lovat', ['Ловать', 'Ловаць'], 'Lovat'], ['Volkhov', ['Волхов'], 'Volkhov'], ['Luga', ['Луга'], 'Luga'], ['Neva', ['Нева'], 'Neva'],
  ['Pregolya', ['Преголя'], 'Pregolya'], ['Łyna', ['Łyna', 'Лава'], 'Lava'], ['Pasłęka', ['Pasłęka'], 'Pasłęka'], ['Vistula', ['Wisła'], 'Wisła'],
  ['Narew', ['Narew', 'Нараў', 'Нарев'], 'Narew'], ['Western Bug', ['Bug', 'Західний Буг', 'Заходні Буг', 'Западный Буг'], 'Bug'],
  ['Oder', ['Odra', 'Oder'], 'Odra'], ['Pripyat', ['Прыпяць', "Прип'ять", 'Припять', 'Prypeć'], 'Prypiat'],
  ['Dnieper', ['Дняпро', 'Дніпро', 'Днепр'], 'Dnipro'], ['Berezina', ['Бярэзіна', 'Березина'], 'Byarezina'],
];

/**
 * The must-have rivers as the map names them: the main name shown (and whether it is the one
 * expected), OpenStreetMap's name there, and the other labels along the river.
 * @param {{ id: string }[]} rivers as in water-osm.json
 * @param {import('./water-labels.mjs').WaterLabels} labels in the order of rivers
 * @param {{ label: string, found: boolean, id: string | null, lengthKm: number }[]} must checks.mustHaveRivers
 * @returns {string[]} one line per river
 */
export function mustHaveRiverTable(rivers, labels, must) {
  const expected = new Map(MUST_HAVE_RIVERS.map(([label, , shows]) => [label, shows]));
  return must.map((m) => {
    const k = rivers.findIndex((r) => r.id === m.id);
    const l = k >= 0 ? labels.rivers[k] : null;
    const shows = l?.main.text ?? '-';
    const state = !m.found ? 'MISSING' : shows === expected.get(m.label) ? 'found  ' : 'LABEL? ';
    const others = [...new Set([...(l?.stretch.values() ?? [])].map((s) => s.text))].filter((t) => t !== shows);
    const local = l && l.main.local !== shows ? ` (${l.main.local})` : '';
    return `  ${state} ${m.label.padEnd(12)} ${`${shows}${local}`.padEnd(30)} ${String(m.lengthKm).padStart(6)} km  also: ${others.join(' | ') || '-'}`;
  });
}

/**
 * Lakes that must be on the map (natural lakes and lagoons), and modern reservoirs that must not.
 * @type {[string, string[]][]}
 */
export const MUST_HAVE_LAKES = [
  ['Lubāns', ['Lubāns']], ['Drūkšiai', ['Drūkšiai']], ['Dysnai', ['Dysnai']], ['Rāzna', ['Rāznas']], ['Burtnieks', ['Burtnieks']],
  ['Usma', ['Usmas']], ['Võrtsjärv', ['Võrtsjärv']], ['Peipus', ['Peipsi', 'Чудское']], ['Ilmen', ['Ильмень']], ['Ladoga', ['Ладожское']],
  ['Śniardwy', ['Śniardwy']], ['Mamry', ['Mamry']], ['Niegocin', ['Niegocin']], ['Curonian Lagoon', ['Kuršių marios']], ['Vistula Lagoon', ['Zalew Wiślany']],
];
/** @type {[string, RegExp][]} */
export const MUST_BE_ABSENT = [
  ['Kauno marios', /Kauno marios/], ['Pļaviņas reservoir', /Pļaviņ|Плявин/], ['Ķegums reservoir', /Ķegum|Кегум/],
  ['Rīga HES reservoir', /Rīgas HES|Rīgas ūdenskrātuve|Рижск.*водохр/], ['Narva reservoir', /Narva veehoidla|Нарвское/], ['Kyiv reservoir', /Київське водосх|Киевское водохр/],
  ['Kaniv reservoir', /Канівське водосх|Каневское водохр/], ['Vileyka reservoir', /Вілейск|Вилейск/], ['Zaslawye (Minsk Sea)', /Заслаўск|Заславск/],
  ['Elektrėnai', /Elektrėn/], ['Włocławek', /Włocławsk/], ['Zegrze', /Zegrzyńsk/], ['Jeziorsko', /^Jeziorsko/], ['Sulejów', /Sulejowsk/],
];

/** lon/lat pairs from a flat lon/lat list. @param {Flat} flat */
const pairs = (flat) => {
  /** @type {number[][]} */
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
};

/** Projects and clips a lon/lat line into clean game-unit pieces. @param {Flat} line */
function projectLine(line) {
  /** @type {Flat[]} */
  const out = [];
  for (const part of clipLine(dropRepeats(project(pairs(line))))) {
    const clean = dropRepeats(part);
    if (clean.length >= 4) out.push(clean);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Rivers.

/**
 * Builds every river group, projected and clipped, with its length inside the map and a local
 * name for each of its lines.
 * @param {Map<number, RiverWay>} ways @param {import('./water-rules.mjs').RiverRelation[]} relations
 */
function buildRivers(ways, relations) {
  const relById = new Map(relations.map((r) => [r.id, r]));
  return groupRivers(ways, relations).map((g) => {
    const members = g.ways.map((id) => /** @type {RiverWay} */ (ways.get(id)));
    const rel = g.relation !== null ? relById.get(g.relation) : undefined;
    const local = localNames(members, rel?.tags);
    /** @type {Map<string, RiverWay[]>} */
    const byName = new Map();
    for (const w of members) {
      const n = local.get(w.id) ?? '';
      const list = byName.get(n);
      if (list) list.push(w); else byName.set(n, [w]);
    }
    /** @type {Flat[]} */ const lines = [];
    /** @type {string[]} */ const lineNames = [];
    /** @type {Map<string, number>} */ const lengthByName = new Map();
    for (const [n, list] of [...byName.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      for (const line of stitch(list.map((w) => w.coords))) {
        for (const piece of projectLine(line)) {
          lines.push(piece);
          lineNames.push(n);
          lengthByName.set(n, (lengthByName.get(n) ?? 0) + lineLength(piece));
        }
      }
    }
    const lengthKm = Math.round(lines.reduce((s, l) => s + lineLength(l), 0) * KM_PER_UNIT * 10) / 10;
    const name = riverMainName(rel?.tags.name, lengthByName);
    /** @type {Tags} */
    const names = { ...namesOf(rel?.tags ?? {}) };
    const byLength = [...members].sort((a, b) => b.coords.length - a.coords.length || a.id - b.id);
    for (const w of byLength) if (local.get(w.id) === name) for (const [k, v] of Object.entries(namesOf(w.tags))) if (!(k in names)) names[k] = v;
    const id = g.relation !== null ? `relation/${g.relation}` : `way/${g.ways[0]}`;
    return { id, name, names, wikidata: g.wikidata, lengthKm, lines, lineNames, by: g.by, wayCount: members.length };
  });
}

/** Whether a river passes the keep rule. @param {{ name: string, wikidata: string | null, lengthKm: number }} r */
export function keepRiver(r) {
  if (!r.name) return false;
  return r.lengthKm >= THRESHOLDS.MIN_RIVER_KM || (r.wikidata !== null && r.lengthKm >= THRESHOLDS.MIN_RIVER_WIKIDATA_KM);
}

// ---------------------------------------------------------------------------------------------
// Lakes.

/**
 * A lake's rings, projected, oriented by role (outer counter-clockwise, holes clockwise),
 * clipped to the map, without repeated points, each outer ring followed by its holes.
 * @param {import('./overture-water.mjs').LakeCandidate['polygons']} polygons lon/lat
 * @returns {Flat[]}
 */
export function lakeRings(polygons) {
  /** @type {Flat[]} */
  const out = [];
  for (const p of polygons) {
    const outer = ringIn(p.outer, false);
    if (!outer) continue;
    out.push(outer);
    for (const h of p.holes) {
      const hole = ringIn(h, true);
      if (hole) out.push(hole);
    }
  }
  return out;
}

/** @param {Flat} lonLat @param {boolean} hole @returns {Flat | null} */
function ringIn(lonLat, hole) {
  const projected = orient(dropRepeats(openRing(project(pairs(lonLat)))), hole);
  const clipped = closeRepeats(dropRepeats(clipRing(projected)));
  return clipped.length >= 6 && Math.abs(ringsArea([clipped])) > 0 ? clipped : null;
}

/** Drops a last point equal to the first. @param {Flat} ring */
const closeRepeats = (ring) => {
  let r = ring;
  while (r.length >= 4 && r[0] === r[r.length - 2] && r[1] === r[r.length - 1]) r = r.slice(0, -2);
  return r;
};

/** Whether a lake passes the size rule. Every lake kept has a name. @param {{ name: string, wikidata: string | null, areaKm2: number }} l */
export function keepLakeBySize(l) {
  if (!l.name) return false;
  return l.areaKm2 >= THRESHOLDS.MIN_LAKE_KM2 || (l.wikidata !== null && l.areaKm2 >= THRESHOLDS.MIN_LAKE_WIKIDATA_KM2);
}

/**
 * @typedef {object} Lake
 * @property {string} id @property {string} name @property {Tags} names @property {string | null} wikidata
 * @property {Tags} otherNames alt_name, short_name and official_name (for the labels only; the biggest piece's)
 * @property {number} areaKm2 @property {Flat[]} rings @property {string} water @property {string[]} pieces OSM ids
 */

/**
 * Joins pieces of one lake (the same Wikidata id) into one lake, biggest piece first.
 * @param {Lake[]} pieces
 * @returns {Lake[]}
 */
function joinPieces(pieces) {
  /** @type {Map<string, Lake>} */
  const byWd = new Map();
  /** @type {Lake[]} */
  const out = [];
  for (const p of [...pieces].sort((a, b) => b.areaKm2 - a.areaKm2 || (a.id < b.id ? -1 : 1))) {
    const into = p.wikidata ? byWd.get(p.wikidata) : undefined;
    if (!into) {
      const lake = { ...p, rings: [...p.rings], pieces: [p.id] };
      if (p.wikidata) byWd.set(p.wikidata, lake);
      out.push(lake);
      continue;
    }
    into.rings.push(...p.rings);
    into.areaKm2 = Math.round((into.areaKm2 + p.areaKm2) * 100) / 100;
    into.pieces.push(p.id);
  }
  return out;
}

/**
 * Leaves out lakes that lie inside a bigger lake (OSM sometimes maps a part of a big lake again,
 * as Peipus proper inside Peipus-Pskov): the smaller one's points all inside the bigger one.
 * @param {Lake[]} lakes biggest first
 * @returns {{ kept: Lake[], inside: { id: string, name: string, wikidata: string | null, why: string }[] }}
 */
function dropNested(lakes) {
  /** @type {Lake[]} */
  const kept = [];
  const inside = [];
  const boxes = new Map();
  const box = (/** @type {Lake} */ l) => {
    if (!boxes.has(l)) {
      const xs = l.rings.flatMap((r) => r.filter((_, i) => i % 2 === 0));
      const ys = l.rings.flatMap((r) => r.filter((_, i) => i % 2 === 1));
      boxes.set(l, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    }
    return boxes.get(l);
  };
  for (const l of lakes) {
    const b = box(l);
    const samples = insidePoints(l.rings, b);
    const outer = kept.find((k) => {
      const kb = box(k);
      if (b[0] < kb[0] - 1 || b[1] < kb[1] - 1 || b[2] > kb[2] + 1 || b[3] > kb[3] + 1 || !samples.length) return false;
      // Points inside the smaller lake (not on its shore, which it may share with the bigger one).
      return samples.filter(([x, y]) => pointInRings(x, y, k.rings)).length >= samples.length * 0.9;
    });
    if (outer) inside.push({ id: l.id, name: l.name, wikidata: l.wikidata, why: `inside the bigger lake ${outer.name} (${outer.id}): OSM maps it twice` });
    else kept.push(l);
  }
  return { kept, inside };
}

/**
 * Up to about 60 points inside a lake, on a grid over its box.
 * @param {Flat[]} rings @param {number[]} b [x0, y0, x1, y1]
 * @returns {number[][]}
 */
function insidePoints(rings, b) {
  const out = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = b[0] + ((b[2] - b[0]) * (i + 0.5)) / n;
      const y = b[1] + ((b[3] - b[1]) * (j + 0.5)) / n;
      if (pointInRings(x, y, rings)) out.push([x, y]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Reading the rows.

/**
 * Reads the extract: the river ways, and the lake candidates with their rings and verdicts.
 * @param {string} path @param {ReturnType<typeof reviewIndex>} review
 */
async function readWater(path, review) {
  /** @type {Map<number, RiverWay>} */
  const ways = new Map();
  /** @type {Lake[]} */
  const lakePieces = [];
  /** @type {{ id: string, name: string, wikidata: string | null, why: string, areaKm2: number, rings: Flat[] }[]} */
  const droppedLakes = [];
  /** @type {{ id: string, name: string, areaKm2: number, flags: string[] }[]} */
  const flagged = [];
  const seen = new Set();
  let tooSmall = 0; let outside = 0; let unnamed = 0;
  for await (const row of waterRows(path)) {
    const way = riverWay(row);
    if (way) { ways.set(way.id, way); continue; }
    const c = lakeCandidate(row);
    if (!c) continue;
    seen.add(c.osmId);
    const rings = lakeRings(c.polygons);
    if (!rings.length) { outside++; continue; }
    const areaKm2 = Math.round(ringsArea(rings) * KM2_PER_UNIT2 * 100) / 100;
    const base = { id: c.osmId, name: c.tags.name ?? '', wikidata: c.tags.wikidata ?? null, areaKm2 };
    const verdict = classifyLake(c.osmId, { ...c.tags, ...(c.subtype === 'reservoir' ? { water: 'reservoir' } : {}) }, review);
    if (!verdict.keep) {
      if (areaKm2 >= THRESHOLDS.MIN_LAKE_WIKIDATA_KM2) droppedLakes.push({ ...base, why: verdict.why, rings });
      continue;
    }
    if (!keepLakeBySize(base)) { if (base.name) tooSmall++; else unnamed++; continue; }
    if (verdict.flags.length && !verdict.reviewed) flagged.push({ id: c.osmId, name: base.name, areaKm2, flags: verdict.flags });
    lakePieces.push({ ...base, names: namesOf(c.tags), otherNames: otherNamesOf(c.tags), rings, water: c.tags.water ?? '', pieces: [c.osmId] });
  }
  return { ways, lakePieces, droppedLakes, flagged, seen, counts: { lakesTooSmall: tooSmall, lakesUnnamed: unnamed, lakesOutsideMap: outside } };
}

// ---------------------------------------------------------------------------------------------
// Pictures for checking by eye.

/**
 * A picture of part of the map: Natural Earth land under OSM lakes and rivers.
 * @param {{ x0: number, y0: number, x1: number, y1: number, upp: number }} view game units; upp = units per pixel
 * @param {Flat[]} land @param {Flat[][]} lakes @param {Flat[][]} rivers @param {Flat[][]} dropped
 */
function picture(view, land, lakes, rivers, dropped) {
  const w = Math.ceil((view.x1 - view.x0) / view.upp);
  const h = Math.ceil((view.y1 - view.y0) / view.upp);
  const shift = (/** @type {Flat} */ r) => r.map((v, i) => (i % 2 ? v - view.y0 : v - view.x0));
  const layer = (/** @type {Flat[]} */ rings) => {
    const g = new Uint8Array(w * h);
    fillRings(g, w, h, view.upp, rings.map(shift), 1);
    return g;
  };
  const landG = layer(land);
  const lakeG = layer(lakes.flat());
  const dropG = layer(dropped.flat());
  const rgb = new Uint8Array(w * h * 3);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      const px = dropG[i] ? [230, 60, 60] : lakeG[i] ? [40, 110, 200] : landG[i] ? [236, 230, 214] : [190, 205, 220];
      rgb.set(px, ((h - 1 - r) * w + c) * 3);
    }
  }
  for (const river of rivers) {
    for (const line of river) {
      for (let i = 2; i < line.length; i += 2) {
        const ax = (line[i - 2] - view.x0) / view.upp; const ay = (line[i - 1] - view.y0) / view.upp;
        const bx = (line[i] - view.x0) / view.upp; const by = (line[i + 1] - view.y0) / view.upp;
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
        for (let k = 0; k <= steps; k++) {
          const x = Math.floor(ax + ((bx - ax) * k) / steps);
          const y = Math.floor(ay + ((by - ay) * k) / steps);
          if (x >= 0 && x < w && y >= 0 && y < h) rgb.set([20, 60, 160], ((h - 1 - y) * w + x) * 3);
        }
      }
    }
  }
  return encodePng(w, h, rgb);
}

/** Natural Earth land rings in game units (preview background only, never in the output). */
async function landRings() {
  const geo = JSON.parse((await readRaw('ne-land')).data.toString('utf8'));
  /** @type {Flat[]} */
  const rings = [];
  for (const f of featuresIn(geo, 'polygon')) for (const part of f.parts) {
    const ring = clipRing(openRing(project(part)));
    if (ring.length) rings.push(ring);
  }
  return rings;
}

/** @param {string} dir @param {any[]} rivers @param {Lake[]} lakes @param {Flat[][]} dropped */
async function pictures(dir, rivers, lakes, dropped) {
  await mkdir(dir, { recursive: true });
  const land = await landRings();
  const lakeRingsAll = lakes.map((l) => l.rings);
  const riverLines = rivers.map((r) => r.lines);
  await writeFile(join(dir, 'water-all.png'), picture({ x0: 0, y0: 0, x1: MAP.width, y1: MAP.height, upp: 10 }, land, lakeRingsAll, riverLines, dropped));
  const [ax, ay] = MAP.toUnits(20.6, 53.7);
  const [bx, by] = MAP.toUnits(28.4, 58.2);
  const [cx] = MAP.toUnits(20.6, 58.2);
  const [dx] = MAP.toUnits(28.4, 53.7);
  await writeFile(join(dir, 'water-lt-lv.png'), picture({ x0: Math.min(ax, cx), y0: ay, x1: Math.max(bx, dx), y1: by, upp: 3 }, land, lakeRingsAll, riverLines, dropped));
  const [kx, ky] = MAP.toUnits(23.6, 54.7);
  const [lx, ly] = MAP.toUnits(24.4, 55.05);
  await writeFile(join(dir, 'water-kaunas.png'), picture({ x0: kx, y0: ky, x1: lx, y1: ly, upp: 0.5 }, land, lakeRingsAll, riverLines, dropped));
  console.log(`previews in ${dir}`);
}

// ---------------------------------------------------------------------------------------------
// Checks.

/**
 * Kept rivers that run through dropped reservoirs, with the length inside each (over 1 km).
 * @param {{ name: string, lines: Flat[] }[]} rivers @param {{ id: string, name: string, rings: Flat[] }[]} shapes
 */
function riversThrough(rivers, shapes) {
  const out = [];
  for (const s of shapes) {
    const xs = s.rings.flatMap((r) => r.filter((_, i) => i % 2 === 0));
    const ys = s.rings.flatMap((r) => r.filter((_, i) => i % 2 === 1));
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    for (const r of rivers) {
      let len = 0;
      for (const line of r.lines) {
        let touches = false;
        for (let i = 0; i < line.length && !touches; i += 2) touches = line[i] >= box.x0 && line[i] <= box.x1 && line[i + 1] >= box.y0 && line[i + 1] <= box.y1;
        if (touches) len += lengthInside(line, s.rings);
      }
      const km = len * KM_PER_UNIT;
      if (km >= 1) out.push({ river: r.name, reservoir: s.name, reservoirId: s.id, km: Math.round(km), note: 'OSM line through the reservoir: an approximation of the pre-dam course (TO CHECK)' });
    }
  }
  return out;
}

/** All names of a feature, lower case. @param {{ name: string, names: Tags, lineNames?: string[] }} f */
const namesOfFeature = (f) => [f.name, ...Object.values(f.names), ...(f.lineNames ?? [])].map((n) => n.toLowerCase());

/**
 * Finds a must-have river or lake among the kept ones (the biggest match), else among all.
 * @template {{ id: string, name: string, names: Tags, lineNames?: string[] }} T
 * @param {string} label @param {string[]} wanted @param {T[]} kept @param {T[]} all @param {(f: T) => number} size
 */
function findWanted(label, wanted, kept, all, size) {
  const want = wanted.map((n) => n.toLowerCase());
  const hit = (/** @type {T} */ f) => namesOfFeature(f).some((n) => want.some((w) => n === w || n.startsWith(`${w} `) || n.includes(` ${w}`) || n.startsWith(`${w}-`)));
  const k = kept.filter(hit).sort((a, b) => size(b) - size(a))[0];
  if (k) return { label, found: true, f: k };
  const a = all.filter(hit).sort((x, y) => size(y) - size(x))[0];
  return { label, found: false, f: a ?? null };
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const previewDir = process.argv[2] ?? DEFAULT_PREVIEWS;
  const run = await overtureRun();
  const review = JSON.parse(await readFile(REVIEW_FILE, 'utf8'));
  const rIndex = reviewIndex(review.entries);
  const rel = await riverRelations();
  console.log(`Overture ${run.release}; OSM river relations from ${rel.osmBase} (${rel.relations.length})`);

  const water = await readWater(run.rows, rIndex);
  const allRivers = buildRivers(water.ways, rel.relations);
  const rivers = allRivers.filter(keepRiver).sort((a, b) => b.lengthKm - a.lengthKm || (a.name < b.name ? -1 : 1));

  const joined = joinPieces(water.lakePieces).filter((l) => keepLakeBySize(l));
  const { kept: lakes, inside } = dropNested(joined.sort((a, b) => b.areaKm2 - a.areaKm2 || (a.id < b.id ? -1 : 1)));
  const dropped = [
    ...water.droppedLakes.map(({ id, name, wikidata, why, areaKm2 }) => ({ id, name, wikidata, why, areaKm2 })),
    ...inside,
  ];

  const reservoirs = water.droppedLakes.filter((d) => d.areaKm2 >= 2);
  const through = riversThrough(rivers, reservoirs);
  const mustRivers = MUST_HAVE_RIVERS.map(([label, wanted]) => {
    const m = findWanted(label, wanted, rivers, allRivers, (r) => r.lengthKm);
    return { label, found: m.found, id: m.f?.id ?? null, name: m.f?.name ?? null, wikidata: m.f?.wikidata ?? null, lengthKm: m.f?.lengthKm ?? 0, lineNames: [...new Set(m.f?.lineNames ?? [])].filter(Boolean) };
  });
  const mustLakes = MUST_HAVE_LAKES.map(([label, wanted]) => {
    const m = findWanted(label, wanted, lakes, [], (l) => l.areaKm2);
    return { label, found: m.found, id: m.f?.id ?? null, name: m.f?.name ?? null, areaKm2: m.f?.areaKm2 ?? 0 };
  });
  const absent = MUST_BE_ABSENT.map(([label, re]) => {
    const shown = lakes.find((l) => [l.name, ...Object.values(l.names)].some((n) => re.test(n)));
    const gone = water.droppedLakes.find((d) => re.test(d.name));
    return { label, absent: !shown, shownAs: shown?.name ?? null, droppedAs: gone ? `${gone.name} (${gone.id}): ${gone.why}` : null };
  });
  const reviewMissing = review.entries.filter((/** @type {any} */ e) => e.osmIds.some((/** @type {string} */ i) => !water.seen.has(i)))
    .map((/** @type {any} */ e) => ({ name: e.name, osmIds: e.osmIds.filter((/** @type {string} */ i) => !water.seen.has(i)) }));

  const checks = {
    counts: {
      riverWays: water.ways.size,
      riverGroups: allRivers.length,
      riverGroupsUnnamed: allRivers.filter((r) => !r.name).length,
      riversKept: rivers.length,
      riversKeptBy50km: rivers.filter((r) => r.lengthKm >= THRESHOLDS.MIN_RIVER_KM).length,
      riversKeptByWikidata: rivers.filter((r) => r.lengthKm < THRESHOLDS.MIN_RIVER_KM).length,
      riversGroupedByRelation: rivers.filter((r) => r.by === 'relation').length,
      lakePiecesKept: water.lakePieces.length,
      lakesKept: lakes.length,
      lakesKeptByWikidataRule: lakes.filter((l) => l.areaKm2 < THRESHOLDS.MIN_LAKE_KM2).length,
      lakesDroppedAsReservoirs: water.droppedLakes.length,
      lakesInsideBiggerLakes: inside.length,
      ...water.counts,
      reviewedEntries: review.entries.length,
    },
    mustHaveRivers: mustRivers,
    mustHaveLakes: mustLakes,
    mustBeAbsent: absent,
    flaggedForReview: water.flagged.sort((a, b) => b.areaKm2 - a.areaKm2),
    reviewedButNotFound: reviewMissing,
    riversThroughDroppedReservoirs: through,
  };
  // The snapshot nearly every row carries (Overture's sources[].version); a few rows are newer.
  const osmSnapshot = Object.entries(/** @type {Record<string, number>} */ (run.meta.osmSnapshots ?? {})).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  const out = {
    source: 'osm',
    licence: 'ODbL-1.0',
    attribution: '© OpenStreetMap contributors, Overture Maps Foundation. ODbL 1.0 (openstreetmap.org/copyright)',
    osmBase: osmSnapshot,
    overture: { release: run.release, osmSnapshots: run.meta.osmSnapshots, relationsOsmBase: rel.osmBase },
    projection: MAP.meta(),
    thresholds: THRESHOLDS,
    rivers: rivers.map(({ id, name, names, wikidata, lengthKm, lines, lineNames }) => ({ id, name, names, wikidata, lengthKm, lines, lineNames })),
    lakes: lakes.map(({ id, name, names, otherNames, wikidata, areaKm2, rings, pieces }) => ({ id, name, names, ...(Object.keys(otherNames).length ? { otherNames } : {}), wikidata, areaKm2, rings, pieces })),
    dropped,
    checks,
  };
  await mkdir(DERIVED, { recursive: true });
  const text = JSON.stringify(out);
  await writeFile(OUT, text);
  report(out, text.length);
  await pictures(previewDir, rivers, lakes, reservoirs.map((r) => r.rings));
}

/** Prints the size summary and the tables. @param {any} out @param {number} bytes */
function report(out, bytes) {
  const pts = (/** @type {Flat[]} */ ls) => ls.reduce((s, l) => s + l.length / 2, 0);
  const c = out.checks;
  console.log(`rivers: ${out.rivers.length}, ${out.rivers.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + r.lines.length, 0)} lines, ${out.rivers.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + pts(r.lines), 0)} points`);
  console.log(`lakes: ${out.lakes.length}, ${out.lakes.reduce((/** @type {number} */ s, /** @type {any} */ l) => s + l.rings.length, 0)} rings, ${out.lakes.reduce((/** @type {number} */ s, /** @type {any} */ l) => s + pts(l.rings), 0)} points`);
  console.log(`dropped: ${out.dropped.length}; file ${(bytes / 1e6).toFixed(1)} MB`);
  console.log('counts', c.counts);
  console.log('\nmust-have rivers, as OpenStreetMap names them:');
  for (const m of c.mustHaveRivers) console.log(`  ${m.found ? 'found  ' : 'MISSING'} ${m.label.padEnd(12)} ${String(m.name ?? '-').padEnd(22)} ${String(m.lengthKm).padStart(6)} km  ${m.wikidata ?? '-'}  ${m.lineNames.join(' | ')}`);
  console.log('\nmust-have rivers, as the map names them:');
  for (const line of mustHaveRiverTable(out.rivers, waterLabels(out.rivers, out.lakes), c.mustHaveRivers)) console.log(line);
  console.log('\nmust-have lakes:');
  for (const m of c.mustHaveLakes) console.log(`  ${m.found ? 'found  ' : 'MISSING'} ${m.label.padEnd(16)} ${String(m.name ?? '-').padEnd(44)} ${m.areaKm2} km²`);
  console.log('\nmust be absent:');
  for (const m of c.mustBeAbsent) console.log(`  ${m.absent ? 'absent ' : 'SHOWN  '} ${m.label.padEnd(26)} ${m.shownAs ?? ''}${m.droppedAs ? `dropped: ${m.droppedAs}` : 'not in the data as a lake'}`);
  console.log(`\nflagged for review (kept): ${c.flaggedForReview.length}`);
  for (const f of c.flaggedForReview.slice(0, 40)) console.log(`  ${f.id} ${f.name} ${f.areaKm2} km² [${f.flags.join(', ')}]`);
  console.log(`reviewed but not found: ${JSON.stringify(c.reviewedButNotFound)}`);
  console.log('rivers through dropped reservoirs:');
  for (const t of c.riversThroughDroppedReservoirs) console.log(`  ${t.river} through ${t.reservoir}: ${t.km} km`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

// @ts-check
// Builds the OpenStreetMap rivers and lakes of the 1219 map from the answers that
// tools/map/fetch-osm.mjs cached in data/raw/osm/, and writes data/raw/derived/water-osm.json
// (git ignores it; a later step simplifies and packs it into the game under src/data/odbl/).
// The output is OSM-only on purpose (the OSMF rule on mixing sources in one layer): nothing from
// Natural Earth or any other source goes into it. Natural Earth land is only drawn under the
// preview pictures, for orientation.
//
//   node tools/map/build-water.mjs [preview-dir]
//
// Output, in whole game units (100 m) projected with MAP.toUnits and clipped to the map:
//   { source: 'osm', licence: 'ODbL-1.0', osmBase, window, thresholds,
//     rivers: [{ id, name, names, wikidata, lengthKm, lines: [[x0, y0, x1, y1, ...], ...] }],
//     lakes:  [{ id, name, names, wikidata, areaKm2, rings: [[...], ...] }],
//     dropped: [{ id, name, wikidata, why }], checks: {...} }
// Lake rings: outer rings run counter-clockwise and holes (islands) clockwise, with y growing
// north; each outer ring comes before its own holes; no ring repeats its first point at the end.
// Nothing is simplified here; only points that repeat after rounding to 100 m are dropped.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRaw } from './fetch.mjs';
import { elementsOf, RUN_FILE } from './fetch-osm.mjs';
import { clipLine, clipRing, featuresIn, fillRings, openRing, project } from './geo.mjs';
import { encodePng } from './png.mjs';
import { MAP } from './projection.mjs';
import { DERIVED } from './resample.mjs';
import {
  classifyLake, dropRepeats, KM2_PER_UNIT2, KM_PER_UNIT, lengthInside, lineLength, namesOf, orient, reservoirKeywordHits,
  reviewIndex, ringsArea, ringsFromMembers, stitch, THRESHOLDS, groupRivers, bboxAreaKm2, isReservoirTagged,
} from './water-rules.mjs';

const REVIEW_FILE = fileURLToPath(new URL('./reservoirs-1219.json', import.meta.url));
const OUT = join(DERIVED, 'water-osm.json');
const CANDIDATES = join(DERIVED, 'reservoir-candidates.json');
const DEFAULT_PREVIEWS = join(DERIVED, 'previews');

/** @typedef {number[]} Flat */
/** @typedef {Record<string, string>} Tags */

/**
 * Rivers that must be on the map, with the names they may carry in OSM (local names first).
 * Matching is on "name" and every name:xx, ignoring case.
 */
/** @type {[string, string[]][]} */
export const MUST_HAVE_RIVERS = [
  ['Nemunas / Neman', ['Nemunas', 'Неман', 'Нёман', 'Njemen', 'Memel', 'Neman', 'Niemen']],
  ['Neris / Viliya', ['Neris', 'Вилия', 'Вілія', 'Wilia', 'Viliya']],
  ['Nevėžis', ['Nevėžis']], ['Dubysa', ['Dubysa']], ['Šešupė', ['Šešupė', 'Шешупе']], ['Minija', ['Minija']],
  ['Jūra', ['Jūra']], ['Merkys', ['Merkys']], ['Šventoji (Neris)', ['Šventoji']], ['Mūša', ['Mūša']],
  ['Nemunėlis', ['Nemunėlis', 'Mēmele']], ['Lielupe', ['Lielupe']], ['Venta', ['Venta', 'Ventа']],
  ['Daugava / Western Dvina', ['Daugava', 'Западная Двина', 'Заходняя Дзвіна', 'Western Dvina']],
  ['Gauja', ['Gauja', 'Koiva']], ['Aiviekste', ['Aiviekste']], ['Salaca', ['Salaca', 'Salatsi']],
  ['Emajõgi', ['Emajõgi']], ['Pärnu', ['Pärnu jõgi', 'Pärnu']], ['Narva', ['Narva', 'Narva jõgi', 'Нарва']],
  ['Velikaya', ['Великая', 'Velikaya']], ['Lovat', ['Ловать', 'Lovat']], ['Volkhov', ['Волхов', 'Volkhov']],
  ['Luga', ['Луга', 'Luga']], ['Neva', ['Нева', 'Neva']], ['Pregolya / Pregel', ['Преголя', 'Pregola', 'Pregel', 'Pregolya']],
  ['Łyna / Lava', ['Łyna', 'Лава', 'Lava', 'Alle']], ['Pasłęka / Passarge', ['Pasłęka', 'Passarge']],
  ['Vistula / Wisła', ['Wisła', 'Vistula', 'Weichsel']], ['Narew', ['Narew', 'Нарва', 'Нараў']],
  ['Western Bug', ['Bug', 'Західний Буг', 'Заходні Буг', 'Western Bug', 'Буг']], ['Oder / Odra (east part)', ['Odra', 'Oder']],
  ['Shchara', ['Шчара', 'Щара', 'Shchara']], ['Berezina (Dnieper basin)', ['Бярэзіна', 'Березина', 'Berezina']],
  ['Pripyat', ['Прыпяць', 'Прип\'ять', 'Припять', 'Pripyat', 'Прип’ять']], ['Dnieper', ['Дняпро', 'Дніпро', 'Днепр', 'Dnieper']],
  ['Desna', ['Десна', 'Desna']],
];

/** Lagoons that must be on the map as lakes. */
/** @type {[string, string[]][]} */
const MUST_HAVE_LAGOONS = [
  ['Curonian Lagoon', ['Kuršių marios', 'Куршский залив', 'Curonian Lagoon']],
  ['Vistula Lagoon', ['Zalew Wiślany', 'Калининградский залив', 'Vistula Lagoon']],
];

/** lon/lat pairs from a flat lon/lat list. @param {Flat} flat */
const pairs = (flat) => {
  /** @type {number[][]} */
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
};

/** A way's geometry as a flat lon/lat list. @param {any} el */
const wayCoords = (el) => (el.geometry ?? []).flatMap((/** @type {any} */ p) => (p ? [p.lon, p.lat] : []));

/** All names of a feature, for matching, in lower case. @param {Tags} tags */
const allNames = (tags) => Object.entries(tags).filter(([k]) => k === 'name' || k.startsWith('name:')).map(([, v]) => v.toLowerCase());

// ---------------------------------------------------------------------------------------------
// Rivers.

/**
 * Builds every river group, projected and clipped, with its length inside the map.
 * @param {any[]} wayEls @param {any[]} relEls
 */
function buildRivers(wayEls, relEls) {
  /** @type {Map<number, import('./water-rules.mjs').RiverWay>} */
  const ways = new Map();
  for (const el of wayEls) {
    if (el.type !== 'way' || ways.has(el.id)) continue;
    if (!['river', 'stream', 'canal'].includes(el.tags?.waterway)) continue;
    const coords = wayCoords(el);
    if (coords.length >= 4) ways.set(el.id, { id: el.id, tags: el.tags ?? {}, coords });
  }
  /** @type {import('./water-rules.mjs').RiverRelation[]} */
  const relations = relEls.filter((r) => r.type === 'relation').map((r) => ({ id: r.id, tags: r.tags ?? {}, members: r.members ?? [] }));
  const relById = new Map(relations.map((r) => [r.id, r]));
  // Plain canals only join a river through its relation: a canal by itself is not a 1219 river.
  for (const [id, w] of ways) {
    if (w.tags.waterway === 'canal' && !relations.some((r) => r.members.some((m) => m.type === 'way' && m.ref === id))) ways.delete(id);
  }
  const groups = groupRivers(ways, relations);
  return groups.map((g) => {
    const members = g.ways.map((id) => /** @type {import('./water-rules.mjs').RiverWay} */ (ways.get(id)));
    const rel = g.relation !== null ? relById.get(g.relation) : undefined;
    const lines = [];
    for (const line of stitch(members.map((w) => w.coords))) {
      for (const part of clipLine(dropRepeats(project(pairs(line))))) {
        const clean = dropRepeats(part);
        if (clean.length >= 4) lines.push(clean);
      }
    }
    const lengthKm = lines.reduce((s, l) => s + lineLength(l), 0) * KM_PER_UNIT;
    const byLength = [...members].sort((a, b) => b.coords.length - a.coords.length);
    const name = rel?.tags.name ?? mostCommonName(members);
    /** @type {Record<string, string>} */
    const names = { ...namesOf(rel?.tags ?? {}) };
    for (const w of byLength) for (const [k, v] of Object.entries(namesOf(w.tags))) if (!(k in names) && w.tags.name === name) names[k] = v;
    const id = g.relation !== null ? `relation/${g.relation}` : `way/${g.ways[0]}`;
    /** @type {Tags} */
    const tags = { ...(rel?.tags ?? {}), name: name ?? '' };
    for (const w of byLength) for (const [k, v] of Object.entries(w.tags)) if (k.startsWith('name:') && !(k in tags)) tags[k] = v;
    return { id, name: name ?? '', names, wikidata: g.wikidata, lengthKm: Math.round(lengthKm * 10) / 10, lines, by: g.by, tags, wayCount: members.length };
  });
}

/** The name carried by the most length of ways in a group. @param {import('./water-rules.mjs').RiverWay[]} members */
function mostCommonName(members) {
  /** @type {Map<string, number>} */
  const weight = new Map();
  for (const w of members) if (w.tags.name) weight.set(w.tags.name, (weight.get(w.tags.name) ?? 0) + w.coords.length);
  return [...weight.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/** Whether a river passes the keep rule. @param {{ name: string, wikidata: string | null, lengthKm: number }} r */
export function keepRiver(r) {
  if (!r.name) return false;
  return r.lengthKm >= THRESHOLDS.MIN_RIVER_KM || (r.wikidata !== null && r.lengthKm >= THRESHOLDS.MIN_RIVER_WIKIDATA_KM);
}

// ---------------------------------------------------------------------------------------------
// Lakes.

/**
 * The rings of a lake (a closed way or a multipolygon relation), projected, oriented by role,
 * clipped to the map, without repeated points.
 * @param {any} el
 * @returns {{ rings: Flat[], open: number }}
 */
export function lakeRings(el) {
  /** @type {{ hole: boolean, coords: Flat }[]} */
  let raw = [];
  let open = 0;
  if (el.type === 'way') {
    const c = wayCoords(el);
    const n = c.length;
    if (n >= 8 && c[0] === c[n - 2] && c[1] === c[n - 1]) raw = [{ hole: false, coords: c.slice(0, -2) }];
    else open = 1;
  } else {
    const members = (el.members ?? []).filter((/** @type {any} */ m) => m.type === 'way' && m.geometry)
      .map((/** @type {any} */ m) => ({ role: m.role === 'inner' ? 'inner' : 'outer', coords: wayCoords(m) }));
    ({ rings: raw, open } = ringsFromMembers(members));
  }
  /** @type {{ hole: boolean, ring: Flat }[]} */
  const done = [];
  for (const r of raw) {
    const projected = orient(dropRepeats(openRing(project(pairs(r.coords)))), r.hole);
    const clipped = closeRepeats(dropRepeats(clipRing(projected)));
    if (clipped.length >= 6 && Math.abs(ringsArea([clipped])) > 0) done.push({ hole: r.hole, ring: clipped });
  }
  return { rings: orderRings(done), open };
}

/** Drops a last point equal to the first. @param {Flat} ring */
const closeRepeats = (ring) => {
  let r = ring;
  while (r.length >= 4 && r[0] === r[r.length - 2] && r[1] === r[r.length - 1]) r = r.slice(0, -2);
  return r;
};

/**
 * Puts each hole right after the outer ring that holds it (by its first point), so a reader can
 * walk "outer, its holes, next outer, ...". Holes whose outer cannot be found go at the end.
 * @param {{ hole: boolean, ring: Flat }[]} rings
 */
function orderRings(rings) {
  const outers = rings.filter((r) => !r.hole).map((r) => r.ring);
  const holes = rings.filter((r) => r.hole).map((r) => r.ring);
  /** @type {Flat[][]} */
  const byOuter = outers.map(() => []);
  /** @type {Flat[]} */
  const orphans = [];
  for (const h of holes) {
    const k = outers.findIndex((o) => pointInRing(h[0], h[1], o));
    if (k >= 0) byOuter[k].push(h); else orphans.push(h);
  }
  return [...outers.flatMap((o, k) => [o, ...byOuter[k]]), ...orphans];
}

/** Even-odd point in one ring. @param {number} x @param {number} y @param {Flat} ring */
function pointInRing(x, y, ring) {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = ring[i * 2 + 1]; const yj = ring[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ring[i * 2] + ((y - yi) * (ring[j * 2] - ring[i * 2])) / (yj - yi)) inside = !inside;
  }
  return inside;
}

/** Whether a lake passes the size rule. @param {{ name: string, wikidata: string | null, areaKm2: number }} l */
export function keepLakeBySize(l) {
  return (Boolean(l.name) && l.areaKm2 >= THRESHOLDS.MIN_LAKE_KM2) || (l.wikidata !== null && l.areaKm2 >= THRESHOLDS.MIN_LAKE_WIKIDATA_KM2);
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

// ---------------------------------------------------------------------------------------------

async function main() {
  const previewDir = process.argv[2] ?? DEFAULT_PREVIEWS;
  if (!existsSync(RUN_FILE)) throw new Error('no OSM download yet: run npm run map:osm');
  const run = JSON.parse(await readFile(RUN_FILE, 'utf8'));
  const review = existsSync(REVIEW_FILE) ? JSON.parse(await readFile(REVIEW_FILE, 'utf8')) : { reservoirs: [] };
  const rIndex = reviewIndex(review.reservoirs);

  // Rivers.
  const allRivers = buildRivers([...(await elementsOf(run.files.riverWays)), ...(await elementsOf(run.files.memberWays))], await elementsOf(run.files.riverRelations));
  const rivers = allRivers.filter(keepRiver).sort((a, b) => b.lengthKm - a.lengthKm);

  // Lakes.
  /** @type {any[]} */
  const lakes = [];
  /** @type {{ id: string, name: string, wikidata: string | null, why: string }[]} */
  const dropped = [];
  /** @type {{ id: string, name: string, areaKm2: number, keywords: string[] }[]} */
  const flagged = [];
  const seenLake = new Set();
  let openRings = 0; let tooSmall = 0; let outside = 0;
  for (const el of await elementsOf(run.files.lakeGeometry)) {
    const id = `${el.type}/${el.id}`;
    if (seenLake.has(id)) continue;
    seenLake.add(id);
    const tags = el.tags ?? {};
    const { rings, open } = lakeRings(el);
    openRings += open;
    const areaKm2 = Math.round(ringsArea(rings) * KM2_PER_UNIT2 * 100) / 100;
    const lake = { id, name: tags.name ?? '', names: namesOf(tags), wikidata: tags.wikidata ?? null, areaKm2, rings, water: tags.water ?? '' };
    const verdict = classifyLake(id, tags, rIndex);
    if (!verdict.keep) { if (areaKm2 > 0) dropped.push({ id, name: lake.name, wikidata: lake.wikidata, why: verdict.why }); continue; }
    if (!rings.length) { outside++; continue; }
    if (!keepLakeBySize(lake)) { tooSmall++; continue; }
    if (verdict.flags.length && !verdict.reviewed) flagged.push({ id, name: lake.name, areaKm2, keywords: verdict.flags });
    lakes.push(lake);
  }
  lakes.sort((a, b) => b.areaKm2 - a.areaKm2);

  // Reservoirs: the review candidates, and the reviewed ones that are dropped.
  const resEls = await elementsOf(run.files.reservoirs);
  const candidates = reservoirCandidates(resEls);
  await mkdir(DERIVED, { recursive: true });
  await writeFile(CANDIDATES, `${JSON.stringify(candidates, null, 1)}\n`);
  const presentIds = new Set([...resEls.map((e) => `${e.type}/${e.id}`), ...seenLake]);
  const reviewMissing = review.reservoirs.filter((/** @type {any} */ e) => e.osmIds.some((/** @type {string} */ i) => !presentIds.has(i))).map((/** @type {any} */ e) => ({ name: e.name, osmIds: e.osmIds.filter((/** @type {string} */ i) => !presentIds.has(i)) }));
  for (const e of review.reservoirs) if (e.decision === 'drop') dropped.push({ id: e.osmIds.join(' '), name: e.name, wikidata: e.wikidata, why: `reviewed: ${e.why}` });

  // Rivers through dropped reservoirs: the OSM line runs down the reservoir's middle, which is
  // only an approximation of the river before the dam.
  const resGeo = await elementsOf(run.files.reservoirGeometry ?? []);
  const reservoirShapes = resGeo.map((el) => ({ id: `${el.type}/${el.id}`, name: el.tags?.name ?? '', rings: lakeRings(el).rings }));
  const through = riversThrough(rivers, reservoirShapes);

  // Must-haves.
  const mustHave = MUST_HAVE_RIVERS.map(([label, wanted]) => matchRiver(label, wanted, rivers, allRivers));
  const lagoons = MUST_HAVE_LAGOONS.map(([label, wanted]) => {
    const want = wanted.map((n) => n.toLowerCase());
    const hit = lakes.find((l) => [l.name, ...Object.values(l.names)].some((n) => want.includes(String(n).toLowerCase())));
    return { label, found: Boolean(hit), id: hit?.id ?? null, name: hit?.name ?? null, areaKm2: hit?.areaKm2 ?? 0, water: hit?.water ?? null };
  });

  const wdCount = new Map();
  for (const l of lakes) if (l.wikidata) wdCount.set(l.wikidata, (wdCount.get(l.wikidata) ?? 0) + 1);
  const checks = {
    osmBaseRange: [run.osmBaseOldest, run.osmBase],
    counts: {
      riverGroups: allRivers.length,
      riversKept: rivers.length,
      riversKeptBy50km: rivers.filter((r) => r.lengthKm >= THRESHOLDS.MIN_RIVER_KM).length,
      riversKeptByWikidata: rivers.filter((r) => r.lengthKm < THRESHOLDS.MIN_RIVER_KM).length,
      riverGroupsUnnamed: allRivers.filter((r) => !r.name).length,
      lakeCandidatesFetched: seenLake.size,
      lakesKept: lakes.length,
      lakesKeptByWikidataOnly: lakes.filter((l) => !(l.name && l.areaKm2 >= THRESHOLDS.MIN_LAKE_KM2)).length,
      lakesTooSmall: tooSmall,
      lakesOutsideMap: outside,
      lakesDroppedAsReservoirs: dropped.filter((d) => !d.why.startsWith('reviewed') || seenLake.has(d.id)).length,
      reservoirsTaggedInWindow: resEls.length,
      reviewedReservoirs: review.reservoirs.length,
      multipolygonPiecesThatNeverClosed: openRings,
    },
    mustHaveRivers: mustHave,
    lagoons,
    flaggedForReview: flagged,
    reviewedButNotFoundInOsm: reviewMissing,
    riversThroughDroppedReservoirs: through,
    lakesSharingWikidata: [...wdCount.entries()].filter(([, n]) => n > 1).map(([wd, n]) => ({ wikidata: wd, lakes: n })),
  };
  const out = {
    source: 'osm',
    licence: 'ODbL-1.0',
    attribution: '© OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright)',
    osmBase: run.osmBase,
    window: run.window,
    projection: MAP.meta(),
    thresholds: THRESHOLDS,
    rivers: rivers.map(({ id, name, names, wikidata, lengthKm, lines }) => ({ id, name, names, wikidata, lengthKm, lines })),
    lakes: lakes.map(({ id, name, names, wikidata, areaKm2, rings }) => ({ id, name, names, wikidata, areaKm2, rings })),
    dropped,
    checks,
  };
  const text = JSON.stringify(out);
  await writeFile(OUT, text);
  report(out, text.length, allRivers);

  // Pictures.
  await mkdir(previewDir, { recursive: true });
  const land = await landRings();
  const lakeRingsAll = lakes.map((l) => l.rings);
  const riverLines = rivers.map((r) => r.lines);
  const dropRings = reservoirShapes.map((r) => r.rings);
  await writeFile(join(previewDir, 'water-all.png'), picture({ x0: 0, y0: 0, x1: MAP.width, y1: MAP.height, upp: 10 }, land, lakeRingsAll, riverLines, dropRings));
  const [ax, ay] = MAP.toUnits(20.6, 53.7);
  const [bx, by] = MAP.toUnits(28.4, 58.2);
  const [cx] = MAP.toUnits(20.6, 58.2);
  const [dx] = MAP.toUnits(28.4, 53.7);
  await writeFile(join(previewDir, 'water-lt-lv.png'), picture({ x0: Math.min(ax, cx), y0: ay, x1: Math.max(bx, dx), y1: by, upp: 3 }, land, lakeRingsAll, riverLines, dropRings));
  const [kx, ky] = MAP.toUnits(23.6, 54.7);
  const [lx, ly] = MAP.toUnits(24.4, 55.05);
  await writeFile(join(previewDir, 'water-kaunas.png'), picture({ x0: kx, y0: ky, x1: lx, y1: ly, upp: 0.5 }, land, lakeRingsAll, riverLines, dropRings));
  console.log(`previews in ${previewDir}`);
}

/**
 * The reservoir review list: named or Wikidata-tagged reservoirs, biggest box first.
 * @param {any[]} els
 */
function reservoirCandidates(els) {
  return els.filter((e) => e.bounds || e.type === 'node').map((e) => ({
    osmId: `${e.type}/${e.id}`,
    name: e.tags?.name ?? '',
    names: namesOf(e.tags ?? {}),
    wikidata: e.tags?.wikidata ?? null,
    bboxKm2: e.bounds ? Math.round(bboxAreaKm2(e.bounds) * 10) / 10 : 0,
    center: e.center ? [e.center.lon, e.center.lat] : e.lat !== undefined ? [e.lon, e.lat] : null,
    tagged: isReservoirTagged(e.tags ?? {}),
    keywords: reservoirKeywordHits(e.tags ?? {}),
  })).sort((a, b) => b.bboxKm2 - a.bboxKm2);
}

/**
 * Kept rivers that run through dropped reservoirs, with the length inside each (over 1 km).
 * @param {{ name: string, lines: Flat[] }[]} rivers @param {{ id: string, name: string, rings: Flat[] }[]} shapes
 */
function riversThrough(rivers, shapes) {
  const out = [];
  for (const s of shapes) {
    if (!s.rings.length) continue;
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

/**
 * Finds a must-have river among the kept ones (the longest match), else among all groups.
 * @param {string} label @param {string[]} wanted
 * @param {{ id: string, name: string, tags: Tags, lengthKm: number }[]} kept
 * @param {{ id: string, name: string, tags: Tags, lengthKm: number }[]} all
 */
function matchRiver(label, wanted, kept, all) {
  const want = wanted.map((n) => n.toLowerCase());
  const hit = (/** @type {{ tags: Tags, name: string }} */ r) => [r.name.toLowerCase(), ...allNames(r.tags)].some((n) => want.includes(n));
  const k = kept.filter(hit).sort((a, b) => b.lengthKm - a.lengthKm)[0];
  if (k) return { label, found: true, id: k.id, name: k.name, lengthKm: k.lengthKm };
  const a = all.filter(hit).sort((x, y) => y.lengthKm - x.lengthKm)[0];
  return { label, found: false, id: a?.id ?? null, name: a?.name ?? null, lengthKm: a?.lengthKm ?? 0 };
}

/** Prints the size summary and the tables. @param {any} out @param {number} bytes @param {any[]} allRivers */
function report(out, bytes, allRivers) {
  const pts = (/** @type {Flat[]} */ ls) => ls.reduce((s, l) => s + l.length / 2, 0);
  const riverPts = out.rivers.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + pts(r.lines), 0);
  const lakePts = out.lakes.reduce((/** @type {number} */ s, /** @type {any} */ l) => s + pts(l.rings), 0);
  console.log(`OSM data as of ${out.osmBase}`);
  console.log(`rivers: ${out.rivers.length} kept of ${allRivers.length} groups, ${out.rivers.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + r.lines.length, 0)} lines, ${riverPts} points`);
  console.log(`lakes: ${out.lakes.length}, ${out.lakes.reduce((/** @type {number} */ s, /** @type {any} */ l) => s + l.rings.length, 0)} rings, ${lakePts} points`);
  console.log(`dropped: ${out.dropped.length}; file ${(bytes / 1e6).toFixed(1)} MB`);
  console.log('counts', out.checks.counts);
  console.log('\nmust-have rivers:');
  for (const m of out.checks.mustHaveRivers) console.log(`  ${m.found ? 'found  ' : 'MISSING'} ${m.label.padEnd(28)} ${String(m.name ?? '-').padEnd(24)} ${m.lengthKm} km ${m.id ?? ''}`);
  console.log('\nlagoons:');
  for (const l of out.checks.lagoons) console.log(`  ${l.found ? 'found  ' : 'MISSING'} ${l.label} ${l.name ?? ''} ${l.areaKm2} km² water=${l.water}`);
  console.log(`\nflagged for review (kept): ${out.checks.flaggedForReview.length}`);
  for (const f of out.checks.flaggedForReview.slice(0, 40)) console.log(`  ${f.id} ${f.name} ${f.areaKm2} km² [${f.keywords.join(', ')}]`);
  console.log(`reviewed but not found: ${JSON.stringify(out.checks.reviewedButNotFoundInOsm)}`);
  console.log('rivers through dropped reservoirs:');
  for (const t of out.checks.riversThroughDroppedReservoirs) console.log(`  ${t.river} through ${t.reservoir}: ${t.km} km`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

// @ts-check
// The pure rules behind the OpenStreetMap rivers and lakes: which lakes are worth fetching,
// which water bodies are modern reservoirs (not there in 1219), how river ways group into one
// river and stitch into long lines, how multipolygon members join into rings, and lengths and
// areas in game units. No network, no files: tools/map/fetch-osm.mjs and build-water.mjs use
// these, and test/water.test.js checks them on small made-up inputs.

/** @typedef {number[]} Flat flat [x0, y0, x1, y1, ...] */
/** @typedef {Record<string, string>} Tags */

/** Game units are 100 m, so one unit is 0.1 km and one square unit is 0.01 km². */
export const KM_PER_UNIT = 0.1;
export const KM2_PER_UNIT2 = 0.01;

/**
 * Keep rules (tuned on the real data, see the counts in build-water's report): a river is kept
 * when its length inside the map is at least MIN_RIVER_KM, or it has a Wikidata id and is at
 * least MIN_RIVER_WIKIDATA_KM. A lake is kept at MIN_LAKE_KM2, or at MIN_LAKE_WIKIDATA_KM2 with a
 * Wikidata id (a sign someone found it notable). Every river and lake kept has a name.
 */
export const THRESHOLDS = {
  MIN_RIVER_KM: 50,
  MIN_RIVER_WIKIDATA_KM: 15,
  MIN_LAKE_KM2: 1,
  MIN_LAKE_WIKIDATA_KM2: 0.5,
};

/** The languages whose name:xx tags are kept, besides the local OSM "name". */
export const NAME_LANGS = ['lt', 'lv', 'et', 'pl', 'de', 'ru', 'be', 'uk', 'fi', 'sv', 'en'];

/** The name:xx tags we keep, as { lt: '...', ... } (missing languages left out). @param {Tags} tags */
export function namesOf(tags) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const l of NAME_LANGS) if (tags[`name:${l}`]) out[l] = tags[`name:${l}`];
  return out;
}

// ---------------------------------------------------------------------------------------------
// Lakes: the cheap pre-filter on bounding boxes, before any geometry is downloaded.

/**
 * Approximate area of a lon/lat bounding box in km² (a lake can never be bigger than its box,
 * so a box under the threshold rules the lake out for certain).
 * @param {{ minlat: number, minlon: number, maxlat: number, maxlon: number }} bb
 */
export function bboxAreaKm2(bb) {
  const midLat = ((bb.minlat + bb.maxlat) / 2) * (Math.PI / 180);
  const w = (bb.maxlon - bb.minlon) * 111.32 * Math.cos(midLat);
  const h = (bb.maxlat - bb.minlat) * 110.57;
  return Math.max(0, w) * Math.max(0, h);
}

/**
 * Whether a lake candidate (from a tags + bounding box query) could pass the keep rules, so
 * its geometry is worth fetching.
 * @param {Tags} tags @param {{ minlat: number, minlon: number, maxlat: number, maxlon: number }} bb
 */
export function lakeCandidateWorthFetching(tags, bb) {
  const box = bboxAreaKm2(bb);
  if (tags.wikidata && box >= THRESHOLDS.MIN_LAKE_WIKIDATA_KM2) return true;
  return Boolean(tags.name) && box >= THRESHOLDS.MIN_LAKE_KM2;
}

// ---------------------------------------------------------------------------------------------
// Modern reservoirs.

/** Tagged as a reservoir in OSM: always dropped. @param {Tags} tags */
export function isReservoirTagged(tags) {
  return tags.water === 'reservoir' || tags.landuse === 'reservoir' || tags.reservoir_type !== undefined;
}

/**
 * Why OSM's own tags show a lake was made by people after 1219, or null: a flooded quarry or
 * mine (lake=quarry, was:lake=quarry, a resource tag), or a start_date after 1219.
 * @param {Tags} tags
 * @returns {string | null}
 */
export function madeAfter1219(tags) {
  if (tags.lake === 'quarry' || tags['was:lake'] === 'quarry') return 'OSM tags it as a flooded quarry or open-cast mine (lake=quarry)';
  for (const k of ['old_resource', 'was:resource', 'resource']) if (tags[k]) return `OSM tags it as a flooded mine (${k}=${tags[k]})`;
  const year = /\b(\d{3,4})\b/.exec(tags.start_date ?? '')?.[1];
  if (year && Number(year) > 1219) return `OSM gives it start_date=${tags.start_date}: made after 1219`;
  return null;
}

/**
 * Whether a name is two (or more) names in one, as OpenStreetMap writes features on a border:
 * "Nemunas / Неман", "Łyna/Лава", "Zalew Wiślany - Калининградский залив". A hyphen inside a
 * word ("Peipsi-Pihkva") does not count; a slash always does.
 * @param {string} name
 */
export const isTwoLanguageName = (name) => /\s[–-]\s|\//.test(name);

/** The single names in a name like "Nemunas / Неман". @param {string} name */
export const splitNames = (name) => name.split(/\s[/–-]\s|\s\/|\/\s|\//).map((p) => p.trim()).filter(Boolean);

/**
 * The name a river is known by in the game's data (its info, and its label wherever a stretch
 * has no name of its own): the river relation's name when its ways carry it too (so it is a
 * local name, not a name for the whole river in another language, like "Dnieper"); else the
 * single name its ways carry over the most length on the map; else the relation's name.
 * @param {string | undefined} relationName
 * @param {Map<string, number>} lengthByName the length of the river's ways by their own name
 */
export function riverMainName(relationName, lengthByName) {
  if (relationName && !isTwoLanguageName(relationName) && lengthByName.has(relationName)) return relationName;
  const single = [...lengthByName.entries()].filter(([n]) => n && !isTwoLanguageName(n))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  if (single.length) return single[0][0];
  const any = [...lengthByName.entries()].filter(([n]) => n).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return relationName || (any[0]?.[0] ?? '');
}

/**
 * Gives each unnamed way of one river the name of a named way it touches (end to end), spreading
 * outwards, so the river's lines break where its local name changes and nowhere else. Ways that
 * touch no named way keep ''.
 * A way's own name counts only if it is a single name, or several names in one of which at
 * least one is a name of this river: OSM sometimes puts other text on a border stretch
 * ("Россия - Lietuva"), and such a stretch takes its neighbour's name instead.
 * @param {RiverWay[]} ways one river's ways
 * @param {Tags} [relationTags] the river relation's tags, whose names are this river's names
 * @returns {Map<number, string>} way id to local name
 */
export function localNames(ways, relationTags = {}) {
  const known = new Set();
  /** @param {string} n */
  const addParts = (n) => { for (const part of splitNames(n)) known.add(part.toLowerCase()); };
  for (const [k, v] of Object.entries(relationTags)) if (k === 'name' || k.startsWith('name:')) addParts(v);
  for (const w of ways) if (w.tags.name && !isTwoLanguageName(w.tags.name)) known.add(w.tags.name.toLowerCase());
  /** @param {string} n */
  const usable = (n) => !isTwoLanguageName(n) || splitNames(n).some((part) => known.has(part.toLowerCase()));
  /** @type {Map<number, string>} */
  const name = new Map(ways.map((w) => [w.id, w.tags.name && usable(w.tags.name) ? w.tags.name : '']));
  /** @type {Map<string, RiverWay[]>} */
  const atEnd = new Map();
  for (const w of ways) {
    const n = w.coords.length;
    for (const k of [endKey(w.coords[0], w.coords[1]), endKey(w.coords[n - 2], w.coords[n - 1])]) {
      const list = atEnd.get(k);
      if (list) list.push(w); else atEnd.set(k, [w]);
    }
  }
  const byId = [...ways].sort((a, b) => a.id - b.id);
  for (let changed = true; changed;) {
    changed = false;
    for (const w of byId) {
      if (name.get(w.id)) continue;
      const n = w.coords.length;
      const touching = [...(atEnd.get(endKey(w.coords[0], w.coords[1])) ?? []), ...(atEnd.get(endKey(w.coords[n - 2], w.coords[n - 1])) ?? [])];
      const named = touching.map((t) => name.get(t.id) ?? '').filter(Boolean).sort();
      if (named.length) { name.set(w.id, named[0]); changed = true; }
    }
  }
  return name;
}

/**
 * Name pieces that often mean a man-made reservoir or a flooded mine, and a start_date tag. They
 * only FLAG a lake for review, never drop it: "marios" is both Kauno marios (a reservoir) and Kuršių marios (the natural Curonian
 * Lagoon). Decisions live in tools/map/osm-water-1219.json.
 */
export const RESERVOIR_KEYWORDS = [
  { word: 'marios', re: /marios/i },
  { word: 'водохранилище', re: /водохранилищ/i },
  { word: 'вадасховішча', re: /вадасховішч/i },
  { word: 'водосховище', re: /водосховищ/i },
  { word: 'zbiornik', re: /zbiornik/i },
  { word: 'ūdenskrātuve', re: /ūdenskrātuv/i },
  { word: 'veehoidla', re: /veehoidla/i },
  { word: 'tekojärvi', re: /tekojärvi/i },
  { word: 'Stausee', re: /stausee|talsperre/i },
  { word: 'reservoir', re: /reservoir/i },
  { word: 'HES', re: /\bHES\b/ },
  { word: 'ГЭС', re: /ГЭС/ },
  { word: 'nádrž', re: /nádrž|nadrž/i },
  { word: 'tvenkinys', re: /tvenkin|\btv\./i },
  { word: 'dīķis', re: /dīķ/i },
  { word: 'mine lake', re: /tagebau|restsee|bergbau|odkrywk|kopalni|карьер|кар'єр|kar'?jer/i },
  // Gravel and sand pits, storage basins, and ponds made by people (Swedish -dammen, Russian
  // пруд, Ukrainian ставок, Belarusian сажалка).
  { word: 'Kiesgrube', re: /kiesgrube|sandgrube|speicherbecken/i },
  { word: 'dammen', re: /dammen(?![\p{L}])/iu },
  { word: 'пруд', re: /(?:^|[^\p{L}])(?:пруд|ставок|сажалка)(?![\p{L}])/iu },
];

/** The reservoir keywords found in any of a feature's names. @param {Tags} tags */
export function reservoirKeywordHits(tags) {
  const names = Object.entries(tags).filter(([k]) => k === 'name' || k.startsWith('name:') || k === 'alt_name' || k === 'old_name').map(([, v]) => v);
  const hits = RESERVOIR_KEYWORDS.filter((k) => names.some((n) => k.re.test(n))).map((k) => k.word);
  // A creation date on a lake is a sign it was made, not found.
  if (tags.start_date) hits.push('start_date');
  return hits;
}

/**
 * @typedef {object} ReviewEntry one reviewed water body in tools/map/reservoirs-1219.json
 * @property {string} name @property {string[]} osmIds e.g. "relation/123", "way/456"
 * @property {string | null} wikidata @property {'drop' | 'keep'} decision @property {string} why
 */

/**
 * Looks up reviewed decisions by OSM id and by Wikidata id.
 * @param {ReviewEntry[]} entries
 */
export function reviewIndex(entries) {
  /** @type {Map<string, ReviewEntry>} */
  const byOsm = new Map();
  /** @type {Map<string, ReviewEntry>} */
  const byWikidata = new Map();
  for (const e of entries) {
    for (const id of e.osmIds) byOsm.set(id, e);
    if (e.wikidata) byWikidata.set(e.wikidata, e);
  }
  return { byOsm, byWikidata };
}

/**
 * Decides whether a lake candidate stays on the 1219 map.
 * Order: a reviewed decision by OSM id or Wikidata id (so a natural lake that OSM tags as a
 * reservoir can be kept, and a reservoir tagged as a lake dropped), then reservoir tags (drop),
 * then tags that show the lake was made after 1219 (drop), then keep, flagging any
 * reservoir-like name for review.
 * @param {string} osmId "way/123" or "relation/123"
 * @param {Tags} tags
 * @param {ReturnType<typeof reviewIndex>} review
 * @returns {{ keep: boolean, why: string, flags: string[], reviewed: ReviewEntry | null }}
 */
export function classifyLake(osmId, tags, review) {
  const flags = reservoirKeywordHits(tags);
  const reviewed = review.byOsm.get(osmId) ?? (tags.wikidata ? review.byWikidata.get(tags.wikidata) : undefined) ?? null;
  if (reviewed) return { keep: reviewed.decision === 'keep', why: `reviewed: ${reviewed.why}`, flags, reviewed };
  if (isReservoirTagged(tags)) return { keep: false, why: 'tagged as a reservoir in OSM', flags, reviewed };
  const made = madeAfter1219(tags);
  if (made) return { keep: false, why: made, flags, reviewed };
  return { keep: true, why: '', flags, reviewed: null };
}

// ---------------------------------------------------------------------------------------------
// Rivers: grouping ways into one river each.

/**
 * @typedef {object} RiverWay
 * @property {number} id @property {Tags} tags
 * @property {Flat} coords lon/lat pairs, as OSM gives them (same node = same numbers)
 *
 * @typedef {object} RiverRelation
 * @property {number} id @property {Tags} tags
 * @property {{ type: string, ref: number, role: string }[]} members
 *
 * @typedef {object} RiverGroup
 * @property {string} id "r<relation id>" or "w<smallest way id>"
 * @property {number | null} relation @property {string | null} wikidata
 * @property {number[]} ways way ids
 * @property {'relation' | 'wikidata' | 'name'} by how the group was formed
 */

/** Exact key of an end point (OSM gives the same node the same coordinates). @param {number} lon @param {number} lat */
const endKey = (lon, lat) => `${lon},${lat}`;

/**
 * Which relation each way belongs to. A way in several river relations goes to the one whose
 * name matches the way's own name, else to the first (lowest id), so results are stable.
 * @param {RiverRelation[]} relations @param {Map<number, RiverWay>} ways
 */
export function assignWaysToRelations(relations, ways) {
  /** @type {Map<number, RiverRelation>} */
  const owner = new Map();
  for (const rel of [...relations].sort((a, b) => a.id - b.id)) {
    for (const m of rel.members) {
      if (m.type !== 'way') continue;
      const way = ways.get(m.ref);
      if (!way) continue;
      const current = owner.get(m.ref);
      const fits = rel.tags.name && rel.tags.name === way.tags.name;
      if (!current || (fits && current.tags.name !== way.tags.name)) owner.set(m.ref, rel);
    }
  }
  return owner;
}

/**
 * Groups river ways into rivers: by waterway relation first, else by Wikidata id, else by the
 * same name and touching end points. A group never mixes two relations or two Wikidata ids,
 * so two different rivers that share a name and a confluence stay apart.
 * @param {Map<number, RiverWay>} ways @param {RiverRelation[]} relations
 * @returns {RiverGroup[]}
 */
export function groupRivers(ways, relations) {
  const owner = assignWaysToRelations(relations, ways);
  const ids = [...ways.keys()].sort((a, b) => a - b);
  /** @type {Map<number, number>} */
  const parent = new Map(ids.map((id) => [id, id]));
  /** Each root's identity: at most one relation and one Wikidata id. */
  /** @type {Map<number, { rel: number | null, wd: string | null, by: RiverGroup['by'] }>} */
  const label = new Map();
  for (const id of ids) {
    const rel = owner.get(id);
    const wd = rel ? rel.tags.wikidata ?? null : ways.get(id)?.tags.wikidata ?? null;
    label.set(id, { rel: rel ? rel.id : null, wd, by: rel ? 'relation' : wd ? 'wikidata' : 'name' });
  }
  /** @param {number} x @returns {number} */
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) r = /** @type {number} */ (parent.get(r));
    while (parent.get(x) !== r) { const next = /** @type {number} */ (parent.get(x)); parent.set(x, r); x = next; }
    return r;
  };
  /** Joins two sets if their identities do not clash. @param {number} a @param {number} b */
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const la = /** @type {{ rel: number | null, wd: string | null, by: RiverGroup['by'] }} */ (label.get(ra));
    const lb = /** @type {{ rel: number | null, wd: string | null, by: RiverGroup['by'] }} */ (label.get(rb));
    if (la.rel !== null && lb.rel !== null && la.rel !== lb.rel) return;
    if (la.wd !== null && lb.wd !== null && la.wd !== lb.wd) return;
    const [keep, gone] = ra < rb ? [ra, rb] : [rb, ra];
    parent.set(gone, keep);
    const rank = { relation: 0, wikidata: 1, name: 2 };
    label.set(keep, { rel: la.rel ?? lb.rel, wd: la.wd ?? lb.wd, by: rank[la.by] <= rank[lb.by] ? la.by : lb.by });
  };

  // 1. Relation members.
  /** @type {Map<number, number>} */
  const firstOfRel = new Map();
  for (const id of ids) {
    const rel = owner.get(id);
    if (!rel) continue;
    const first = firstOfRel.get(rel.id);
    if (first === undefined) firstOfRel.set(rel.id, id);
    else union(first, id);
  }
  // 2. The same Wikidata id (on a way, or on the way's relation).
  /** @type {Map<string, number>} */
  const firstOfWd = new Map();
  for (const id of ids) {
    const wd = label.get(find(id))?.wd;
    if (!wd) continue;
    const first = firstOfWd.get(wd);
    if (first === undefined) firstOfWd.set(wd, id);
    else union(first, id);
  }
  // 3. The same name and a shared end point. An unnamed relation member counts as carrying its
  // relation's name, so a named way that continues an unnamed stretch still finds its river.
  /** @type {Map<string, number[]>} */
  const atEnd = new Map();
  for (const id of ids) {
    const w = /** @type {RiverWay} */ (ways.get(id));
    const name = w.tags.name ?? owner.get(id)?.tags.name;
    if (!name || w.coords.length < 4) continue;
    const n = w.coords.length;
    for (const k of [endKey(w.coords[0], w.coords[1]), endKey(w.coords[n - 2], w.coords[n - 1])]) {
      const key = `${name}|${k}`;
      const list = atEnd.get(key);
      if (list) list.push(id); else atEnd.set(key, [id]);
    }
  }
  for (const list of atEnd.values()) for (let i = 1; i < list.length; i++) union(list[0], list[i]);

  /** @type {Map<number, number[]>} */
  const sets = new Map();
  for (const id of ids) {
    const r = find(id);
    const list = sets.get(r);
    if (list) list.push(id); else sets.set(r, [id]);
  }
  return [...sets.entries()].map(([root, members]) => {
    const l = /** @type {{ rel: number | null, wd: string | null, by: RiverGroup['by'] }} */ (label.get(root));
    return { id: l.rel !== null ? `r${l.rel}` : `w${members[0]}`, relation: l.rel, wikidata: l.wd, ways: members, by: l.by };
  });
}

/**
 * Stitches lines that share end points into as few lines as possible (reversing pieces where
 * needed). Starts from the longest piece and grows it at both ends, so the main stem tends to
 * come out whole and side arms become separate short lines.
 * @param {Flat[]} lines lon/lat (or any exact) coordinates
 * @returns {Flat[]}
 */
export function stitch(lines) {
  const pieces = lines.filter((l) => l.length >= 4);
  /** @type {Map<string, number[]>} */
  const byEnd = new Map();
  pieces.forEach((l, i) => {
    for (const k of [endKey(l[0], l[1]), endKey(l[l.length - 2], l[l.length - 1])]) {
      const list = byEnd.get(k);
      if (list) list.push(i); else byEnd.set(k, [i]);
    }
  });
  const used = new Uint8Array(pieces.length);
  /** An unused piece touching this point, or -1. @param {number} x @param {number} y */
  const next = (x, y) => (byEnd.get(endKey(x, y)) ?? []).find((i) => !used[i]) ?? -1;
  const order = pieces.map((_, i) => i).sort((a, b) => pieces[b].length - pieces[a].length || a - b);
  /** @type {Flat[]} */
  const out = [];
  for (const start of order) {
    if (used[start]) continue;
    used[start] = 1;
    let line = pieces[start].slice();
    // Grow forwards from the tail, then backwards from the head.
    for (let i = next(line[line.length - 2], line[line.length - 1]); i >= 0; i = next(line[line.length - 2], line[line.length - 1])) {
      used[i] = 1;
      const p = pieces[i];
      const fwd = p[0] === line[line.length - 2] && p[1] === line[line.length - 1];
      line = line.concat((fwd ? p : reverseFlat(p)).slice(2));
    }
    for (let i = next(line[0], line[1]); i >= 0; i = next(line[0], line[1])) {
      used[i] = 1;
      const p = pieces[i];
      const endsHere = p[p.length - 2] === line[0] && p[p.length - 1] === line[1];
      line = (endsHere ? p : reverseFlat(p)).slice(0, -2).concat(line);
    }
    out.push(line);
  }
  return out;
}

/** A flat line backwards. @param {Flat} line */
export function reverseFlat(line) {
  /** @type {Flat} */
  const out = [];
  for (let i = line.length - 2; i >= 0; i -= 2) out.push(line[i], line[i + 1]);
  return out;
}

/** Drops points that repeat the one before (rounding to 100 m makes many). @param {Flat} line */
export function dropRepeats(line) {
  /** @type {Flat} */
  const out = [];
  for (let i = 0; i < line.length; i += 2) {
    if (out.length && out[out.length - 2] === line[i] && out[out.length - 1] === line[i + 1]) continue;
    out.push(line[i], line[i + 1]);
  }
  return out;
}

/** Length of a line in game units. @param {Flat} line */
export function lineLength(line) {
  let len = 0;
  for (let i = 2; i < line.length; i += 2) len += Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
  return len;
}

// ---------------------------------------------------------------------------------------------
// Lakes: rings, orientation and area.

/** Twice the signed area of a ring, positive when counter-clockwise (y up). @param {Flat} ring */
export function signedArea2(ring) {
  let a = 0;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
  return a;
}

/**
 * Turns a ring to the orientation that marks its role: outer rings counter-clockwise, holes
 * clockwise (with y growing north, as in game units).
 * @param {Flat} ring @param {boolean} hole
 */
export function orient(ring, hole) {
  const a = signedArea2(ring);
  return (hole ? a > 0 : a < 0) ? reverseFlat(ring) : ring;
}

/** Net area of oriented rings in game units² (holes subtract). @param {Flat[]} rings */
export function ringsArea(rings) {
  return rings.reduce((sum, r) => sum + signedArea2(r) / 2, 0);
}

/**
 * Joins a multipolygon's member ways into closed rings, per role (outer or inner). Ways are
 * matched by exact end points; pieces that never close are counted, not guessed at.
 * @param {{ role: string, coords: Flat }[]} members lon/lat coordinates
 * @returns {{ rings: { hole: boolean, coords: Flat }[], open: number }}
 */
export function ringsFromMembers(members) {
  /** @type {{ hole: boolean, coords: Flat }[]} */
  const rings = [];
  let open = 0;
  for (const hole of [false, true]) {
    const lines = members.filter((m) => (m.role === 'inner') === hole).map((m) => m.coords);
    for (const line of stitch(lines)) {
      const n = line.length;
      if (n >= 8 && line[0] === line[n - 2] && line[1] === line[n - 1]) rings.push({ hole, coords: line.slice(0, -2) });
      else open++;
    }
  }
  return { rings, open };
}

/**
 * Whether a point lies inside rings (even-odd rule, so holes work).
 * @param {number} x @param {number} y @param {Flat[]} rings
 */
export function pointInRings(x, y, rings) {
  let inside = false;
  for (const ring of rings) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i * 2]; const yi = ring[i * 2 + 1];
      const xj = ring[j * 2]; const yj = ring[j * 2 + 1];
      if ((yi > y) !== (yj > y) && x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) inside = !inside;
    }
  }
  return inside;
}

/**
 * Length of the parts of a line that lie inside rings. Each step is cut where it crosses a ring
 * edge, and each piece is judged by its middle point, so a step that enters and leaves a
 * reservoir counts only its inside part.
 * @param {Flat} line @param {Flat[]} rings
 */
export function lengthInside(line, rings) {
  let len = 0;
  for (let i = 2; i < line.length; i += 2) {
    const ax = line[i - 2]; const ay = line[i - 1]; const bx = line[i]; const by = line[i + 1];
    const cuts = [0, 1, ...crossings(ax, ay, bx, by, rings)].sort((p, q) => p - q);
    const step = Math.hypot(bx - ax, by - ay);
    for (let k = 1; k < cuts.length; k++) {
      const t = (cuts[k - 1] + cuts[k]) / 2;
      if (cuts[k] > cuts[k - 1] && pointInRings(ax + (bx - ax) * t, ay + (by - ay) * t, rings)) len += step * (cuts[k] - cuts[k - 1]);
    }
  }
  return len;
}

/**
 * Where a segment crosses ring edges, as fractions (0..1) along the segment.
 * @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {Flat[]} rings
 */
function crossings(ax, ay, bx, by, rings) {
  /** @type {number[]} */
  const out = [];
  const dx = bx - ax; const dy = by - ay;
  for (const ring of rings) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const cx = ring[j * 2]; const cy = ring[j * 2 + 1];
      const ex = ring[i * 2] - cx; const ey = ring[i * 2 + 1] - cy;
      const den = dx * ey - dy * ex;
      if (den === 0) continue;
      const t = ((cx - ax) * ey - (cy - ay) * ex) / den;
      const u = ((cx - ax) * dy - (cy - ay) * dx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) out.push(t);
    }
  }
  return out;
}

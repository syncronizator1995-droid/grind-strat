# src/data/own: Grind Strat's own data

Our own work, under the game's own terms (not yet chosen by Ignas; see LICENSE.md). The build's
licence guard (tools/build.mjs) refuses any block here that names a source other than our own
(`grind-strat-own` in tools/map/sources.json).

## changes.json: the map over time (M3a)

Made by `tools/map/pack-changes.mjs` (run by `npm run map:pack`) from:

- `tools/map/water-changes.json`, the dated list (reviewed by hand). Each entry has an id, a kind,
  its years (`on: [from, to]`: shown when from <= year < to; null is open-ended; BC years are
  negative and there is no year 0), what changes, the fact the map tells, and a source or TO CHECK,
  with marks ("reconstructed", "estimate", "year from OpenStreetMap"). `fix1219` marks the
  entries that change the 1219 map from M2b's on purpose. The web links of the sources stay in
  `data/sources.md`; the block carries the citations only.
- `tools/map/history-shapes.json`, our drawn shapes in game units: the Vistula Lagoon's old
  outlets (Lochstedt and Vogler, open in 1219; Balga, 14th century to 1520), the Pillau strait
  (from 1497, so today's map gets the strait the base map lacks), Ruden and its land bridge to
  Rügen (until 1304, TO CHECK), a larger Lake Drużno (TO CHECK) and the Vistula delta (Żuławy).

Layers: `shapes` and `shapeLevels` (rings and one level of detail per point, as in the water
block), and for each diking entry `cells:<id>` and `bands:<id>`: the 1 km terrain cells
(row-major from the south-west, as the terrain grid) that show as marsh until their own year in
the entry's spread, and each cell's band (lower switches earlier: higher ground is diked first).
They are the land engine's overrides (src/sim/map-date.js). The delta's cells are those inside the
drawn outline, on the base land, at most 5 m high on the base block's 2 km heights; those at 0 m
or lower are the second wave (Dutch settlers, from about 1550, TO CHECK). `info` (JSON) holds the
entries, the citations, the shapes' kinds and the overrides.

How the dated OpenStreetMap features are switched: the water block (`src/data/odbl/water.json`)
tags each dated line and lake with one of the ids here (`info.tags`, layers `riverTag` and
`lakeTag`), or with `osm-year-<year>` for a reservoir whose year comes from OpenStreetMap's own
start_date tag (the `osm-start-date` rule here). `tagsOnAt` in `src/ui/map/water-tiles.js` turns a
year into on and off per tag.

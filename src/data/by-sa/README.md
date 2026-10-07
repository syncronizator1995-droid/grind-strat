# src/data/by-sa: the land around 1219

`terrain-1219.json` is Grind Strat's terrain grid: the land of the Baltic map as it was around
AD 1219, as far as it can be worked out, one class per 1 km cell. Licence: CC BY-SA 4.0 (see
LICENSE.md in this folder).

## What it is

- A grid of 1573 x 1328 cells of 1 km (10 game units of 100 m), row 0 at the south, on the game's
  map projection (a Lambert azimuthal equal-area projection on the GRS80 ellipsoid centred on
  56°N 23°E, defined in tools/map/projection.mjs).
- One class per cell: 0 sea, 2 open land, 3 conifer forest, 4 mixed and broadleaf forest,
  5 marsh and bog, 6 heath and dunes. (1 is not used: lakes are drawn from the separate
  water block, never mixed into this grid.)
- The file is a JSON data block: `licence`, `notice`, `sources` (ids in tools/map/sources.json)
  and `meta` in plain JSON, and the grid itself in `bundle`: base64 text of zlib-deflated bytes,
  in the bundle format of src/ui/map/codec.js (`unbundleBlocks`), layer `terrain`, one byte per
  cell, row by row.

## What it is not (the honest labels)

- Forest share: estimated from pollen records (REVEALS reconstructions for about AD 750 to 1250,
  on 1 degree cells, with gaps filled by a statistical model).
- Exact forest edges: placed by a rule from today's land cover, terrain and rivers. They are not
  from a historical map.
- Marsh: from today's peat-soil and wetland maps (GLWD v2) plus today's open bogs (ESA
  WorldCover).
- Under modern reservoirs the land shows flat, at today's water level.

## How it was made

1. `npm run map:grids` (tools/map/build-grids.mjs) reads GEBCO heights, ESA WorldCover land cover
   and GLWD v2 wetlands, and moves them onto the game's grids (data/raw/derived/, not stored in
   git).
2. `npm run map:terrain` (tools/map/build-terrain-1219.mjs, with the rules in
   tools/map/terrain-1219.mjs) gives each 1 km cell its class. The sea follows the Natural Earth
   coast; marsh comes first, then dunes and fells as heath; then forest: each 1 degree cell gets
   the forest and conifer shares of the SpatioCompo pollen map, and which 1 km cells are forest,
   and which forest is conifer, is decided by a score from today's tree cover, fields, built-up
   land, height, roughness, distance from rivers and wetness. The rule's settings are recorded in
   the grid's sidecar file (terrain-1219-1km.u8.json).
3. `npm run map:pack` (tools/map/pack.mjs) packs the grid into this folder.

All the tools are in this repository. To make the grid again: `npm run map:grids`, then
`npm run map:terrain`, then `npm run map:pack`.

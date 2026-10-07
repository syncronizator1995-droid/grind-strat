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
  WorldCover). Where those maps show more marsh than the pollen's open share, marsh wins and the
  1 degree cell has less forest than the pollen share, and no open land. On the 2026 grid that
  is 25 cells (90,823 land cells of 1 km, 12,482 forest cells short of the pollen shares; worst
  32 points short, at 31.5E 60.5N), in parts of north-west Russia, south-east Finland and east
  Estonia. GLWD's forested wetland classes count as marsh here, while the pollen counts the trees
  on forested peat as forest: that is why. The terrain block's `meta.built.capped` keeps these
  totals.
- Under modern reservoirs the land shows flat, at today's water level.
- The coast is today's (Natural Earth): the land has risen since 1219 in Sweden and Finland, so
  some shores lay further inland then.
- Lakes are drawn from the separate water block. Natural lakes it lacks (in 2026 Natural Earth's
  set misses smaller ones, such as Drūkšiai in Lithuania) show the land of their shores here.
- Coastal dunes are heath (TO CHECK): on the 2026 grid a few dozen cells, mostly at the Łeba
  dunes and on the Curonian Spit near Nida, where today's great drifting dunes are; those may
  have been forest in 1219.

## How it was made

1. `npm run map:grids` (tools/map/build-grids.mjs) reads GEBCO heights, ESA WorldCover land cover
   and GLWD v2 wetlands, and moves them onto the game's grids (data/raw/derived/, not stored in
   git).
2. `npm run map:terrain` (tools/map/build-terrain-1219.mjs, with the rules in
   tools/map/terrain-1219.mjs) gives each 1 km cell its class:
   - The sea follows the Natural Earth coast.
   - Marsh comes first (cells at least half marsh), then coastal dunes and fells as heath.
   - Forest: each 1 degree cell gets the forest share of the SpatioCompo pollen map (except the
     capped cells above). Which 1 km cells are forest is decided by a score from today's tree
     cover, fields, built-up land, height, roughness, distance from rivers and from the lakes of
     1219 (the same lakes the water block draws), wetness, the pollen share itself, and a little
     seeded random variation. The score is smoothed over about 3 km, so the cut gives forest
     blocks and clearings, not single cells. Each 1 degree cell's share is then met by cutting
     the score; forest and clearings smaller than 8 cells are joined to what surrounds them
     (tools/map/tidy.mjs); and the shares are met again by moving patch edges, cells nearest a
     patch's edge first.
   - Conifer or mixed forest: the same steps among the forest cells, to the pollen conifer share,
     from a score of sandy ground (low, flat land near the sea or away from rivers), wetness,
     latitude, the pollen share and random variation. The random variation decides a fair part
     of this: built again without it, about a quarter of the forest cells change between conifer
     and mixed (forest or not: about 1% of the land). The grid's checks record both figures.
   - Cells that are water today (lakes, reservoirs, wide rivers) but land on the coast take the
     class most of their dry neighbours have.

   The settings are TERRAIN_PARAMS in tools/map/terrain-1219.mjs. The terrain block's
   `meta.built` records a fingerprint of them and of the lake list (tools/map/ne-water-1219.json),
   and packing refuses a grid built from other ones.
3. `npm run map:pack` (tools/map/pack.mjs) packs the grid into this folder.

All the tools are in this repository. To make the grid again: `npm run map:grids`, then
`npm run map:terrain`, then `npm run map:pack`.

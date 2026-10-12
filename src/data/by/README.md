# src/data/by: the northern coast over time

`coast.json` is Grind Strat's estimate of where the sea stood in the north of the map, year by
year from AD 1219 to today. Since 1219 the land of Sweden, Åland, Finland and Estonia has risen out
of the sea (by about 2 m at Stockholm and Tallinn, 4 to 5 m in north Uppland and on Åland), so the
sea then reached over some of today's land, and Lake Mälaren was still a bay of the sea. Licence:
CC BY 4.0 (see LICENSE.md in this folder).

## What it is

- A box of 500 m cells (5 game units of 100 m) over the north of the map, on the game's map
  projection (Lambert azimuthal equal-area on GRS80, centred on 56°N 23°E,
  tools/map/projection.mjs). `meta.coast` gives the box: its first column and row on the map's
  500 m lattice, its size, row 0 at the south.
- One code per cell (src/sim/coast-date.js reads them):
  - `0`: land before 1219, or a shore that does not change;
  - `1` to `201`: sea until the year 1219 + 4 x code, land (or lake) from then on;
  - `254`: sea all game.
- Cells of today's sea within 1 km of the land carry the code of the land beside them, so the old
  shore drawn from the field ends on today's coast. So a place is sea in a year when it is outside
  today's land, or the field says sea there.
- The file is a JSON data block: `licence`, `notice`, `sources` (ids in tools/map/sources.json)
  and `meta` in plain JSON, and the field itself in `bundle`: base64 text of zlib-deflated bytes,
  in the bundle format of src/ui/map/codec.js (`unbundleBlocks`), layer `coast`, one byte per cell,
  row by row.

## What it is not (the honest labels)

- It is an estimate, marked so in the game. The sea's fall is today's land-uplift rate
  (NKG_RF17vel) less 0.5 mm a year for the sea's own rise, times a factor k fitted to dated shores
  near Stockholm, in north Uppland, at Tallinn and on Saaremaa (tools/map/coast-anchors.json, each
  with its source). Far from those places k is 1: the rule as it is. `meta.checks` compares the
  rule with every control point, and `meta.regions` says how far each region can be off.
- Heights are GEBCO's, in whole metres, and include trees and buildings; north of 60°N (Turku,
  Åland) they come from another source (GMTED2010) than south of it (SRTM15+). Where GEBCO has no
  land in a cell of today's land, its height is taken from its neighbours (0.5 to 1 m). So the old
  shore is placed roughly, and can move in small jumps.
- Lake Mälaren stays a bay until about 1300, when its outlet at Stockholm closed (Söderlund 2016);
  at 500 m GEBCO cannot see the straits, so that outlet is given by hand.
- South of 56°N, and wherever the sea fell less than 0.5 m since 1219 (Riga, Kurzeme's south,
  Lithuania, Prussia, Pomerania), nothing changes here: the sea moved too little to show.
- SGU's shore model for Sweden is not used yet: its host (resource.sgu.se) is not reachable from
  the build machine. `meta.sgu` says so. Once it is, Sweden's coast comes from SGU's model.

## How it was made

1. `node tools/map/fetch.mjs nkg-rf17vel` fetches the land-uplift file; the GEBCO heights come
   from the cache that `npm run map:grids` fills.
2. `npm run map:coast` (tools/map/build-coast.mjs, with the rules in tools/map/coast.mjs) fits k,
   reads GEBCO at 500 m, gives each cell of today's land the year the sea fell below it, and floods
   from the open sea so that a basin behind a sill stays sea only while its sill is under water.
   It prints a report: the control points, how far the 1219 shore lies inland near Stockholm,
   Turku, Åland, Haapsalu and Pärnu, and how unevenly the land comes out of the sea.
3. `npm run map:pack` (tools/map/pack.mjs) packs the field into this folder, and refuses a field
   built from other settings or control points than today's.

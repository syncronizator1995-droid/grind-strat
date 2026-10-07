# src/data

Map and history data as JSON, made by tools/ scripts or by hand, with sources. Every real fact here
is listed in data/sources.md, and every dataset is credited in ATTRIBUTION.md at the repository root.

The map data comes in blocks split by licence (tools/map/pack.mjs writes them; `npm run map:pack`):

- `map/`: public domain data. `base.json` (Natural Earth land and coast, GEBCO heights and sea
  depths); `water-ne.json` (Natural Earth rivers and lakes, the ones M2 ships: the lakes of 1219
  are chosen by the reviewed list in tools/map/ne-water-1219.json). It goes once the OpenStreetMap
  water (the next milestone) is packed.
- `by-sa/`: CC BY-SA 4.0. `terrain-1219.json`, the land around 1219 (see its LICENSE.md and README.md).
- `odbl/`: ODbL 1.0, from the next milestone: `water.json`, OpenStreetMap rivers and lakes (see its
  LICENSE.md and README.md). Not there yet: no OpenStreetMap data ships in M2.
- `fingerprints.json`: the SHA-256 of every block, so tests notice a block edited by hand.
- `credits.json`: what the game's Credits sheet shows, written by tools/map/attribution.mjs.

Blocks are never edited by hand: change the tools and run `npm run map:pack`.

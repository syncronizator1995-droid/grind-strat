# src/data/odbl: OpenStreetMap rivers and lakes

Contains information from OpenStreetMap, openstreetmap.org/copyright, which is made available
here under the Open Database License (ODbL) 1.0, opendatacommons.org/licenses/odbl/1-0/.
Credit: © OpenStreetMap contributors. See LICENSE.md in this folder.

Everything in this folder is under the ODbL 1.0, and nothing from any other source is mixed into
it. The rest of the repository has its own terms.

## What the extract contains

The rivers and natural lakes of Grind Strat's map of the Baltic lands (the land as around AD 1219),
taken from OpenStreetMap:

- **Rivers**: one feature per river, as lines. Each has its OSM id (the waterway relation, or the
  first way when there is no relation), its local name (OSM `name`), its names in Lithuanian,
  Latvian, Estonian, Polish, German, Russian, Belarusian, Ukrainian, Finnish, Swedish and English
  (OSM `name:lt` ... `name:en`, where mapped), its Wikidata id, its length inside the map in km,
  and its lines.
- **Lakes**: natural lakes, lagoons and oxbow lakes with the same name fields, the Wikidata id,
  the area inside the map in km², and the rings (outer rings and holes for islands).
- Modern reservoirs are left out (the map shows the land before the dams). The list of reviewed
  water bodies and the reason for each decision is in tools/map/reservoirs-1219.json.

The names are today's names. Names as of 1219 come from other sources in a later step and are not
part of this database.

Coordinates are whole game units of 100 m on the game's map projection (a Lambert azimuthal
equal-area projection on the GRS80 ellipsoid centred on 56°N 23°E, defined in
tools/map/projection.mjs), measured from
the south-west corner of the map rectangle.

## OSM snapshot

OSM_BASE_PLACEHOLDER

## How it was made

Everything is done by scripts in tools/map/ in this repository, which are public:

1. `tools/map/fetch-osm.mjs` asks the public Overpass API (overpass-api.de) for the data, one
   request at a time, and caches every answer (the cache is not part of the repository). The
   queries are in the `QUERIES` object of that file:
   - all `type=waterway` + `waterway=river` relations in the window, with their members;
   - named `waterway=river` ways, with geometry, per tile of 2 x 2 degrees;
   - relation members that the tiles did not bring (unnamed stretches), by id;
   - lake candidates per tile: `natural=water` with `water=lake`, `oxbow`, `lagoon` or no `water`
     tag, that have a name or a Wikidata id, with bounding boxes only; candidates whose box is
     under the size limits are not fetched; the rest are fetched with full geometry once each;
   - everything tagged `water=reservoir` or `landuse=reservoir` (with a name or a Wikidata id),
     for the reservoir review.
   The query window is the map rectangle's extent in longitude and latitude plus 0.3 degrees.
2. `tools/map/build-water.mjs`, with the rules in `tools/map/water-rules.mjs`, builds the
   extract:
   - River ways are grouped into rivers: by waterway relation first, else by Wikidata id, else by
     the same name and a shared end point. A group never mixes two relations or two Wikidata ids.
     The ways of a river are stitched into as few lines as possible.
   - A river is kept when it has a name and its length inside the map is at least 50 km, or at
     least 15 km when it has a Wikidata id.
   - A lake is kept when it has a name and an area of at least 1 km², or a Wikidata id and at
     least 0.5 km².
   - Anything tagged `water=reservoir` or `landuse=reservoir` is dropped. Lakes whose names look
     like reservoirs (marios, водохранилище, zbiornik, ūdenskrātuve, veehoidla, HES, ГЭС and a few
     more) are only flagged for review; the decisions are in tools/map/reservoirs-1219.json.
   - Rivers mapped as areas (`water=river`) are not used; rivers stay lines. River lines through
     dropped reservoirs are kept as OSM has them (down the reservoir's middle).
   - Every point is projected with tools/map/projection.mjs (through `project` in
     tools/map/geo.mjs, which adds points along long edges), rounded to 100 m, and clipped to the
     map rectangle. Points that repeat after rounding are dropped.
   - Lake rings: outer rings run counter-clockwise and holes clockwise (with y growing north);
     each outer ring is followed by its own holes.
3. A later step simplifies the lines and rings for three zoom levels and writes `water.json` into
   this folder.

To make it again: `npm run map:osm`.

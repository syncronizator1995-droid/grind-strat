# src/data/odbl: OpenStreetMap rivers and lakes

Contains information from OpenStreetMap, openstreetmap.org/copyright, which is made available
here under the Open Database License (ODbL) 1.0, opendatacommons.org/licenses/odbl/1-0/.
Credit: © OpenStreetMap contributors, Overture Maps Foundation. See LICENSE.md in this folder.

Everything in this folder is under the ODbL 1.0, and nothing from any other source is mixed into
it. The rest of the repository has its own terms.

## What the database contains

`water.json` holds the rivers and lakes of Grind Strat's map of the Baltic lands, taken from
OpenStreetMap: the natural ones of the land around AD 1219, and (from M3a, when the map follows
the game's date) the reservoirs and river cuts that come later, each tagged with its date (see
"Dated features" below):

- **Rivers** (2,377): one feature per river. Each has its local name (OSM `name`), its names in
  Lithuanian, Latvian, Estonian, Polish, German, Russian, Belarusian, Ukrainian, Finnish, Swedish
  and English (OSM `name:lt` ... `name:en`, where mapped), its Wikidata id, its length inside the
  map in km, and its lines. Each line also carries the local name of that stretch where it
  differs from the river's own (the Nemunas is "Nemunas" in Lithuania and "Нёман" in Belarus).
  The names the map shows (labels) are kept next to OpenStreetMap's own (see "Labels" below).
- **Lakes** (7,046): 7,007 natural lakes, lagoons and oxbow lakes, and 39 reservoirs and other
  lakes made later (dated), with the same name fields, the
  Wikidata id, the area inside the map in km², a point for the name, and the rings (outer rings
  and holes for islands).

The names are today's names. Names as of 1219 come from other sources in a later step and are not
part of this database.

Coordinates are whole game units of 100 m on the game's map projection (a Lambert azimuthal
equal-area projection on the GRS80 ellipsoid centred on 56°N 23°E, defined in
tools/map/projection.mjs), measured from the south-west corner of the map rectangle. The file
is the game's data block: the lines and rings are packed (delta-encoded, deflated, base64) as
`src/ui/map/codec.js` reads them, with one level of detail per point; the names and facts are
JSON inside the same bundle (its `info` layer). `src/ui/map/load.js` unpacks it.

## Dated features

The game's map follows its date, so what was made after 1219 is in the database too, with a tag
saying it is dated: layer `riverTag` (one per line) and `lakeTag` (one per lake), indexes into
`info.tags`; 0 (`''`) means shown at every date. A tag is either one of Grind Strat's own ids
(for example `kaunas-reservoir`, `vistula-przekop`), whose years and facts are Grind Strat's own
work and live in `src/data/own/changes.json`, not here; or `osm-year-<year>`, for a reservoir or
other man-made lake that is shown from the year in its own OpenStreetMap `start_date` tag (the
first number of 3 or 4 digits in it). This database holds no other years.

- **Our dated lakes** (13): the reservoirs Kaunas, Narva, Kyiv, Kaniv, Vileyka, Zaslawye,
  Elektrėnai, Włocławek, Zegrze, Jeziorsko, Sulejów, Soodla and Rīga, each found by its OSM id
  (pieces with the same Wikidata id joined).
- **Lakes by OpenStreetMap's year** (26): every other lake left out of 1219 (reservoirs, flooded
  mines, ponds) that passes the size rule and has a `start_date` after 1219. The 413 others that
  pass the size rule but have no year are not in the database.
- They are added after the natural lakes are chosen, so a natural lake inside a reservoir stays.
- **Dated river stretches**: the Vistula's line is cut where it enters and leaves a coarse box
  round the Przekop (its start and mouth as published), on the projected lines before
  simplifying, with a shared point, and the piece inside is tagged; the same for the Lielupe's
  mouth. The Wisła Śmiała (way 60914906) is a whole dated river.
- **Short rivers kept at every date** (tools/map/osm-water-1219.json, kind `river`): the Buļļupe,
  the Lielupe's old way to the sea.

## Source and snapshot

- OpenStreetMap data as published by the Overture Maps Foundation: release **2026-09-23.1**,
  theme `base`, type `water` (GeoParquet files in the AWS S3 bucket `overturemaps-us-west-2`,
  `release/2026-09-23.1/theme=base/type=water/`), read on 7 October 2026. Every row used carries
  the licence `ODbL-1.0` in its `sources`.
- OSM snapshot: the rows' `sources[].version` is **2026-09-06** for 199,778 of the 199,781 rows
  read (2026-09-12 for 3). Overture's release notes for 2026-09-23 give the base theme's "OSM
  Cut-Off Date: 2026-09-12". (Which of the two to quote is TO CHECK with Overture's documentation.)
- River relations (which ways make up which river): OpenStreetMap `type=waterway` +
  `waterway=river` relations read through the public Overpass API (overpass-api.de) on
  6 October 2026 (OSM base 2026-10-06T17:27:06Z). Also OpenStreetMap data under the ODbL.

## How it was made

Everything is done by scripts in tools/map/ in this repository, which are public:

1. `tools/map/fetch-overture.mjs` finds the newest Overture release (S3 ListObjectsV2), reads each
   water file's footer, keeps the row groups whose bounding-box statistics overlap the map
   window (the map rectangle's extent in longitude and latitude plus 0.3°: about 7.98-38.03°E,
   49.15-62.23°N), reads their `subtype`, `class` and `bbox` columns, and reads the other columns
   only for row groups with rows it wants: river lines (`subtype` river, `class` river), and lakes,
   unnamed water and reservoirs whose box is at least 0.4 km². 391 of the release's 4,592 row
   groups were read: 1,348 byte-range requests, 2.18 GB. `tools/map/parquet.mjs` is the small
   Parquet reader it uses.
2. `tools/map/build-water.mjs`, with `tools/map/overture-water.mjs` and the rules in
   `tools/map/water-rules.mjs`, builds the extract:
   - River ways (129,439 lines, one OSM way each) are grouped into rivers: by waterway relation
     first (matching Overture's `sources[].record_id`, e.g. `w123@4`, to relation members), else
     by Wikidata id, else by the same name and a shared end point. A group never mixes two
     relations or two Wikidata ids. Rivers drawn as areas (river banks) are not used.
   - Each stretch keeps its own local name; an unnamed stretch, or one whose name is not a name of
     the river (OSM sometimes writes other text on a border), takes its neighbour's name. The
     ways of each name are stitched into as few lines as possible.
   - The river's own name: the relation's `name` when the river's ways carry it too; else the
     single name its ways carry over the most length on the map.
   - A river is kept when it has a name and its length inside the map is at least 50 km
     (1,108 rivers), or at least 15 km when it has a Wikidata id (1,267 more).
   - Lakes: rows mapped as `natural=water` with `water=lake`, `oxbow`, `lagoon` or no `water` tag
     (a lagoon may be `natural=bay`), already assembled by Overture from OSM multipolygons. A
     lake is kept when it has a name and an area of at least 1 km², or a Wikidata id and at least
     0.5 km² (2,301 of the lakes kept are under 1 km²). Pieces with the same Wikidata id are one
     lake. A lake that OSM maps a second time inside a bigger lake (Peipus proper inside
     Peipus-Pskov, parts of Saimaa) is left out (27).
   - Dated features (above) are added after this, with their tags.
   - The lakes of 1219: whatever OSM tags as a reservoir (`water=reservoir`, `landuse=reservoir`,
     `reservoir_type`, Overture's subtype `reservoir`) is left out (528 of 0.5 km² or more), and
     so is a lake whose OSM tags show it was made later (a flooded quarry or mine: `lake=quarry`,
     `was:lake=quarry`, a resource tag; or a `start_date` after 1219; 10). The reviewed list
     `tools/map/osm-water-1219.json` (107 entries) corrects the tags: it drops reservoirs and
     flooded mines tagged as lakes (85, among them the mining lakes of Lusatia and around
     Leipzig) and keeps natural lakes tagged as reservoirs (19, among them Tyrifjorden and
     Randsfjorden, whose levels are regulated today). Names that look like reservoirs (marios,
     водохранилище, zbiornik, ūdenskrātuve, veehoidla, nádrž, tvenkinys, dīķis, Stausee, HES, ГЭС
     and others) only flag a lake for review: "marios" names both the Kaunas Reservoir and the
     natural Curonian Lagoon.
   - River lines through dropped reservoirs are kept as OSM has them (down the reservoir's
     middle), an approximation of the river before the dam.
   - Every point is projected with tools/map/projection.mjs (through `project` in
     tools/map/geo.mjs, which adds points along long edges), rounded to 100 m, and clipped to the
     map rectangle. Points that repeat after rounding are dropped.
3. `tools/map/pack-water.mjs` simplifies the lines and rings to 150 m and gives each point the
   coarsest of three zoom levels that needs it (tolerances 20 and 5 units for the overview and
   the middle level), works out the labels (below), and writes `water.json`.

## Labels

Every name on the map is in Latin letters (`tools/map/water-labels.mjs` and
`tools/map/romanize.mjs`, run when the block is packed, using only the OpenStreetMap data above).
Each river, stretch and lake keeps OpenStreetMap's own name too: `name` is the label, `local` the
name as OpenStreetMap has it (where it differs), and `lang` the language a romanised name was
written in; for stretches, `riverLineNames` holds the labels and `riverLineLocal` the names.

- A name that joins two languages ("Neris - Вілія", "Nemunas / Немунас") shows its first part in
  Latin letters. If no part is in Latin letters, it shows the first part that is the feature's
  Belarusian or Ukrainian name (on the border of Belarus and Ukraine, "Днепр / Дніпро" shows
  Dnipro), else its first part. Abbreviations such as "up." (upė, river) are left out.
- A lake shows just its name, without the word for lake (`tools/map/lake-names.mjs`): "Ilmen",
  not "ozero Ilmen"; "Narach", not "vozyera Narach"; "Peipsi", not "Peipsi järv". The word
  (озеро, возера, jezioro, ežeras or ež., ezers, järv, See, sjö and others) is dropped only as a
  separate first or last word, and only where what is left is the lake's own name standing
  alone; a compound such as Võrtsjärv or Storsjön is a name already. Where the name is an
  adjective (Russian "Кожановское озеро", Polish "Jezioro Mikołajskie", German "Schweriner See")
  or a Lithuanian or Latvian genitive ("Platelių ež.", the lake of Plateliai; "Rāznas ezers"),
  the plain name is taken from the lake's own OSM `alt_name`, `short_name` or `official_name`
  tags when one is the same name ("Ладога" for "Ладожское озеро", "Galvė" for "Galvės ež."),
  but not one with the word for lake run into it ("Großer Döllnsee" for "Großdöllner See") nor,
  in a tag with no language, one whose letters read as another language (the Russian-looking
  "Зароново" for the Belarusian "Заронаўскае возера"); else from a short reviewed list, `tools/map/lake-names.json` (most of its entries marked TO
  CHECK); otherwise the full name is kept with the word written out ("Kozhanovskoye ozero",
  "Kampiniškių ežeras"), never a bare genitive or an abbreviation. Genitives are never turned
  into nominatives by a rule on endings alone. These other name tags are read when the block is
  packed and are not shipped.
- Cyrillic names are romanised by the BGN/PCGN systems: Russian (1947), Belarusian (1979) and
  Ukrainian (2019, the same as Ukraine's 2010 national system), with the soft and hard signs and
  the apostrophe left out. The language of each name comes from its own `name:be`, `name:uk` or
  `name:ru` tag, or letters and words only one language has (Belarusian writes возера for lake,
  Russian and Ukrainian озеро); otherwise from the language most of the surely known names
  within 150 km are in (in OpenStreetMap a name is written in the language of the country it
  lies in); and only then from a guess by the letters. A short reviewed list,
  `tools/map/osm-water-names.json`, settles the names those rules get wrong (mostly rivers in
  Russia whose only language tag is a Ukrainian one); it uses only the OpenStreetMap data too.
- A river's own name is the local name at its lower end inside the map, where it meets the sea
  or a bigger river or leaves the map: the walk goes downstream and follows the river under
  another name when that name is one of the river's own or carries a fifth of its length, so
  the Western Dvina is "Daugava", and the Nemunas does not become its delta arm "Atmata".

To make it again: `npm run map:water` (download and build; a rerun downloads nothing), then
`npm run map:pack`.

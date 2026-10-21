# Sources

Every real person, date, place and map stage used by Grind Strat is listed here with a link.
Mark anything unconfirmed as TO CHECK. Made-up people and details are marked as invented in the data.

## Verified during the planning chat (5 and 6 October 2026)

| Id | Source | Used for |
| --- | --- | --- |
| hist-lt | [Wikipedia: History of Lithuania](https://en.wikipedia.org/wiki/History_of_Lithuania) | First hunters in the 10th millennium BC; amber trade; Tacitus and the Aesti (about 97 AD); Viking raids and Danish tribute (9th to 11th century); tribute to Kievan Rus' (10th to 11th century); first written mention of Lithuania (1009); about 40 raids 1201 to 1236; Pskov burned 1213; Golden Horde raids 1241, 1259, 1275; Union of Krewo 1385; Jogaila's baptism 1386; conversion and Vilnius bishopric 1387; Grunwald 1410; Samogitia's conversion from 1413; Melno 1422; Union of Lublin 1569; elected kings from 1573; the Deluge 1655 to 1661; Constitution of 3 May 1791; partitions 1772, 1793, 1795; uprisings 1830 to 1831 and 1863 to 1864; press ban until 1904; independence 16 February 1918; occupations; restoration 1990 to 1991; NATO and EU 2004; burial customs (Samogitia skeletal, Aukštaitija cremation); Gediminid rulers choosing their most able son; Magdeburg rights; grain from Danzig to Amsterdam |
| hist-lt-1219 | [Wikipedia: History of Lithuania (1219–1295)](https://en.wikipedia.org/wiki/History_of_Lithuania_%281219%E2%80%931295%29) | The 1219 treaty of 21 dukes; Livonian Brothers of the Sword founded 1202 by Bishop Albert of Riga; Teutonic Knights invited 1226 and settled in Chełmno 1230; Saule 1236; the Livonian Order merged into the Teutonic Knights 1237; Mindaugas baptised 1251, crowned 1253, murdered 1263 by Treniota and Daumantas; Durbe 1260 and the 14-year Great Prussian Uprising; Karuse 1270, fought on the ice near Saaremaa; Yotvingians conquered 1283; Semigallia conquered 1291 |
| dukes | [Wikipedia: List of early Lithuanian dukes](https://en.wikipedia.org/wiki/List_of_early_Lithuanian_dukes) | Elder dukes of 1219: Živinbudas, Daujotas, Dausprungas, Mindaugas, Vilikaila (Viligaila); Samogitian dukes Erdvilas and Vykintas; Žvelgaitis killed attacking Riga in 1205 by Viesturs of Semigallia; Daugirutis imprisoned 1213; Stekšys killed 1214 |
| yoldia | [Wikipedia: Yoldia Sea](https://en.wikipedia.org/wiki/Yoldia_Sea) | Baltic Ice Lake drained to sea level about 9,670 BC; Yoldia Sea about 9,750 to 8,750 BC; Ancylus Lake about 8,750 to 7,850 BC; Littorina Sea from about 7,850 BC; Gulf of Bothnia under ice in the Yoldia stage; land bridge from Germany to Sweden through Denmark |
| rsl-2021 | Rosentau, A. and others (2021), "A Holocene relative sea-level database for the Baltic Sea", Quaternary Science Reviews 266, [doi:10.1016/j.quascirev.2021.107071](https://doi.org/10.1016/j.quascirev.2021.107071) | Cited by the Yoldia Sea page; use for water levels through time. Its data is a map data collection: see below |
| font | Grenze Gotisch by Omnibus-Type, font files from [Google Fonts' GitHub](https://github.com/google/fonts/tree/main/ofl/grenzegotisch), SIL Open Font License 1.1, cut to Latin and Latin Extended letters (licence: src/ui/fonts/OFL.txt). Taken in Claude Code, 6 October 2026 | Display font, with letters such as Ž, ė, ą, ł, ā and õ; the blackletter "G" app icon |

## Map data collections (step 2a)

Map data comes in collections. Each has a short id, and map records cite `collection:id` (for
example `osm:<feature id>`). A small machine-readable index of these ids lets tests check every
citation. The rule: **a collection's licence is read on its owner's site and quoted here before
any file made from it ships.** The build fails otherwise. Share-alike files (ODbL, CC BY-SA) are
kept separate from the rest, each with its own licence note. Every collection is credited on the
in-game Credits screen and in ATTRIBUTION.md.

| Id | Collection | Status |
| --- | --- | --- |
| ne | Natural Earth 1:10m, v5.1.2 | Licence read: public domain |
| osm | OpenStreetMap | Licence not yet read; nothing ships until it is |
| gebco | GEBCO 2026 grid | Licence not yet read; nothing ships until it is |
| reveals | REVEALS Europe pollen reconstructions | Licence not yet read; nothing ships until it is |
| dated1 | DATED-1 ice margins | Licence not yet read; nothing ships until it is |
| rsl-2021 | Rosentau 2021 sea-level database (row above) | Licence not yet read; nothing ships until it is |

**ne: Natural Earth 1:10m, v5.1.2**
- Where: [github.com/nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector),
  pinned to the v5.1.2 tag; site naturalearthdata.com (blocked from the cloud session).
- Used for: the base coast of every slice, main rivers, lakes, sea areas.
- Licence, read in the [LICENSE.md at the v5.1.2 tag](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/LICENSE.md)
  on 6 October 2026: "All versions of Natural Earth raster + vector map data found on this website
  are in the public domain." Also: "No permission is needed to use Natural Earth. Crediting the
  authors is unnecessary."
- Layers used so far (M1): the global `ne_10m_land`, `ne_10m_rivers_lake_centerlines` and
  `ne_10m_lakes` only.
- Note: the same file says JRC granted Natural Earth a licence to use JRC data "for the sole
  purpose of creating a world base map". The research tied this to the supplementary Europe
  layers (`ne_10m_rivers_europe`, `ne_10m_lakes_europe`), which are not used. TO CHECK before
  those layers are ever used.
- Known faults to fix by hand: missing or unnamed rivers, some wrong names, modern reservoirs.

**osm: OpenStreetMap**
- Where: [openstreetmap.org](https://www.openstreetmap.org/copyright) (blocked; Ignas is asked to
  allow it at milestone M2).
- Used for: smaller rivers and their names (Lielupe, Pregolya, Nevėžis, Dubysa, Šešupė, Minija and
  others).
- Licence: believed to be ODbL 1.0, with the notice "© OpenStreetMap contributors" (from the
  research's search results and the ODbL text; not yet read on openstreetmap.org/copyright).
  Share-alike:
  files made from it stay separate, each with its own licence note. Allowed because Ignas chose
  "free forever".
- Status: licence not yet read; nothing ships until it is.

**gebco: GEBCO 2026 grid**
- Where: [gebco.net](https://www.gebco.net), terms at
  [gebco.net terms of use](https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use)
  (blocked; Ignas is asked to allow it at M2).
- Used for: land height and sea depth (hill shading, old coasts).
- Licence: believed public domain with a credit, from search results only.
- Status: licence not yet read; nothing ships until it is.

**reveals: REVEALS Europe pollen reconstructions**
- Where: PANGAEA, [doi:10.1594/PANGAEA.937075](https://doi.org/10.1594/PANGAEA.937075) (Fyfe,
  Githumbi and others); paper: Githumbi and others (2022), Earth System Science Data 14,
  [doi:10.5194/essd-14-1581-2022](https://doi.org/10.5194/essd-14-1581-2022). Blocked; Ignas is
  asked when the 1219 forest is first built (M2 or M3).
- Used for: the forest share in 1219 (the AD 750–1250 window), shown as "estimated from pollen".
- Status: licence not yet read; nothing ships until it is.

**dated1: DATED-1 ice margins**
- Where: Hughes and others (2016), Boreas; data at PANGAEA,
  [doi:10.1594/PANGAEA.848117](https://doi.pangaea.de/10.1594/PANGAEA.848117). Blocked.
- Used for: the edge of the ice sheet in the ice-age slices (rough in 2a, properly in step 8).
- Licence: search results disagree (CC BY 3.0 or CC BY 4.0).
- Status: licence not yet read; nothing ships until it is.

**rsl-2021: Rosentau 2021 sea-level database**
- Where: the paper in the table above; data at GFZ,
  [doi:10.5880/GFZ.1.3.2020.003](https://doi.org/10.5880/GFZ.1.3.2020.003). Blocked.
- Used for: water levels around the Baltic through time (ice-age slices; checks on old coasts).
- Status: licence not yet read; nothing ships until it is.

Still to choose (at M2, licence first): the peat and wetland map for the 1219 marshes.

## TO CHECK before use

| Item | Why it's needed |
| --- | --- |
| Licences of the map data collections above (all but Natural Earth) | Map data for step 2a |
| Maps of Baltic tribal lands around 1200 | Province borders for the tribal age and 1219 |
| Maps of the Lithuanian lands (Lithuania proper, Deltuva, Upytė, Nalšia, Samogitia) | Province borders for 1219 |
| The Lithuanian lands and castle districts named in 14th-century sources, with each one's first-mention year (for example Upytė, Deltuva), and which sources name them | Lithuania's provinces in 2b; the pilot |
| Where Volhynia's centres and Halych lie against the 50°N edge | The south edge of the map |
| The full list of the 21 dukes of 1219 | Starting characters |
| Rulers of Galicia–Volhynia, Polotsk, Pskov, Novgorod and Smolensk in 1219 | Starting realms |
| Danish position in northern Estonia around 1219 | Starting realms |
| Which crusading order's army fought at Saule in 1236, and how the Livonian Order of 1237 relates to the Sword Brothers | History's path after 1219 |
| Curonian Spit and Vistula Lagoon through time | Historical coastlines |
| Animals and vegetation for each time slice (for example reindeer near the ice) | The hunter age and the living land |
| Whether by 1219 Jersika and Koknese no longer depended on Polotsk (1) | Starting realms |
| Vistula delta (Żuławy) as marsh in 1219 and 1 AD | The 1219 and 1 AD slices |
| The lagoon mouths in 1219 and 1 AD | The 1219 and 1 AD slices |
| Which lakes are modern reservoirs (Kaunas, Pļaviņas, Ķegums, Riga, Narva) | The 1219 and 1 AD slices |
| Land-rise rates for the north Estonian coast | The 1219 and 1 AD slices |
| Name forms of 1219 and 1 AD for rivers, lakes and seas (for example Düna for the Daugava) | Names of the time on the map; today's name stands in until each is sourced |
| Shore heights and dates for each ice-age stage | The rough ice-age previews in 2a |

(1) Read Henry of Livonia's chronicle (chapter to find). The step 2 research saw this only in a
search extract of [Wikipedia: Visvaldis](https://en.wikipedia.org/wiki/Visvaldis). HANDOFF's list
of starting realms stays unchanged until it is confirmed.

## Game design references (not history)

These are about how other games work, not about history. The research on 6 October 2026 could read
them only through search-result extracts, because the wikis and forums were blocked. So every
mechanic or number taken from them is unverified until someone reads the page itself. More detail:
docs/research/paradox-games.md.

Crusader Kings 3 wiki:
- [Council](https://ck3.paradoxwikis.com/Council), [Court](https://ck3.paradoxwikis.com/Court), [Schemes](https://ck3.paradoxwikis.com/Schemes), [Friends and Foes](https://ck3.paradoxwikis.com/Friends_and_Foes)
- [Subjects](https://ck3.paradoxwikis.com/Subjects), [Vassals](https://ck3.paradoxwikis.com/Vassals), [Factions](https://ck3.paradoxwikis.com/Factions), [Succession laws](https://ck3.paradoxwikis.com/Succession_laws)
- [Titles](https://ck3.paradoxwikis.com/Titles), [County](https://ck3.paradoxwikis.com/County), [Barony](https://ck3.paradoxwikis.com/Barony), [Events](https://ck3.paradoxwikis.com/Events)

Crusader Kings 3 dev diaries (Paradox forum):
- [#2: the medieval map](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-2-the-medieval-map.1274052/)
- [#17: governments, vassal management, laws and raiding](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-17-governments-vassal-management-laws-and-raiding.1352640/): vassal contract terms
- [#19: factions and civil wars](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-19-factions-and-civil-wars.1363951/): how factions build discontent
- [#30: event scripting](https://admin-forum.paradoxplaza.com/forum/developer-diary/crusader-kings-3-dev-diary-30-event-scripting.1397140)
- [#36: gotta go fast](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-36-gotta-go-fast.1408620/): performance
- [Console dev diary 3: UI/UX and controls](https://www.paradoxinteractive.com/games/crusader-kings-iii/news/ck3-console-dev-diary-3-uiux-and-controls): playing without a mouse

Europa Universalis 4 wiki:
- [Aggressive expansion](https://eu4.paradoxwikis.com/Aggressive_expansion), [Coalition](https://eu4.paradoxwikis.com/Coalition), [War exhaustion](https://eu4.paradoxwikis.com/War_exhaustion), [Personal union](https://eu4.paradoxwikis.com/Personal_union)
- [Trade nodes](https://eu4.paradoxwikis.com/Trade_nodes), [Development](https://eu4.paradoxwikis.com/Development), [Estates](https://eu4.paradoxwikis.com/Estates)

Hearts of Iron 4:
- Wiki: [Logistics](https://hoi4.paradoxwikis.com/Logistics), [Battle plan](https://hoi4.paradoxwikis.com/Battle_plan), [Land battle](https://hoi4.paradoxwikis.com/Land_battle)
- [Dev diary: supply and Mulberry harbors](https://admin-forum.paradoxplaza.com/forum/developer-diary/hoi4-dev-diary-supply-and-mulberry-harbors.1481424/)

Victoria 3:
- Wiki: [Market](https://vic3.paradoxwikis.com/Market), [Pops](https://vic3.paradoxwikis.com/Pops)
- [Dev diary #9: national markets](https://admin-forum.paradoxplaza.com/forum/developer-diary/victoria-3-dev-diary-9-national-markets.1484917)
- [Dev diary #143: trade rework, the world market](https://admin-forum.paradoxplaza.com/forum/developer-diary/victoria-3-dev-diary-143-trade-rework-the-world-market.1733205)

Manor Lords wiki (Hooded Horse, not Paradox):
- [Warfare](https://wiki.hoodedhorse.com/Manor_Lords/Warfare), [Regions](https://wiki.hoodedhorse.com/Manor_Lords/Regions), [Burgage plot](https://wiki.hoodedhorse.com/Manor_Lords/Burgage_plot/en), [Regional wealth](https://wiki.hoodedhorse.com/Manor_Lords/Regional_wealth)

## Map data used in step 2a M2 (7 October 2026)

This section replaces the status lines in "Map data collections (step 2a)" above wherever they
differ. The machine-readable record, with the verbatim licence quotes and fingerprints, is
`tools/map/sources.json`; `ATTRIBUTION.md` and the in-game Credits are generated from it.

| Collection | What the game uses | Licence, and where it was read | Status |
| --- | --- | --- | --- |
| Natural Earth v5.1.2 (`ne`) | Land, coast, rivers and lakes (M2's rivers and lakes for now) | Public domain; LICENSE.md in the project's own repository, github.com/nvkelso/natural-earth-vector, tag v5.1.2 | Read |
| GEBCO_2026 Grid (`gebco`) | Heights (2 km) and sea depths | Public domain, with credit, no endorsement, not for navigation: GEBCO_Grid_terms_of_use.pdf on dap.ceda.ac.uk (BODC/CEDA, GEBCO's official distributor). CEDA's readme also names the Open Government Licence v3.0 | Read. Data from the official tile `gebco_2026_n90.0_s0.0_w0.0_e90.0_geotiff.tif`; identical in all 22,690,248 cells to the AWS copy by the Australian Antarctic Division |
| GLWD v2 (`glwd`) | Marsh and bog (peat-soil and wetland classes) | CC BY 4.0, with a request not to put the whole data online again in its original form: GLWD_TechDoc_v2_0.pdf section 4.1 on data.hydrosheds.org (the owner's host; the same file, by md5, as in the copy) | Read. Data from the unofficial Source Cooperative copy (Boettiger lab), not compared with the official figshare zips: TO CHECK |
| ESA WorldCover 2021 v200 (`worldcover`) | Today's land cover, as a guide for forest edges, dunes and today's open bogs | CC BY 4.0: Product User Manual v2.0 sections 5.1 and 5.2, on ESA's own esa-worldcover bucket | Read |
| SpatioCompo, time window 4 (`spatiocompo`) | Conifer, broadleaf and open-land shares per 1° cell, about AD 750 to 1250 | CC BY-SA 4.0 in the README of the author's own repository, github.com/BehnazP/SpatioCompo_entireHolocene, commit 894d44d | Read, but TO CHECK: the same repository has a GPL-3.0 LICENSE file; Ignas is asking the author |

Citations:
- GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid - a continuous terrain
  model for oceans and land at 15 arc-second intervals. NERC EDS British Oceanographic Data Centre
  NOC. doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa
  (https://dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/)
- Lehner, B. et al. (2025). Mapping the world's inland surface waters: an upgrade to the Global
  Lakes and Wetlands Database (GLWD v2). Earth System Science Data. Data:
  https://doi.org/10.6084/m9.figshare.28519994 (the article's volume and pages: TO CHECK)
- Zanaga, D. et al. (2022). ESA WorldCover 10 m 2021 v200. https://doi.org/10.5281/zenodo.7254221
- Githumbi, E., Pirzamanbein, B. et al. (2022). Pollen-Based Maps of Past Regional Vegetation
  Cover in Europe Over 12 Millennia - Evaluation and Potential. Frontiers in Ecology and
  Evolution 10:795794. https://doi.org/10.3389/fevo.2022.795794. Data: "Land-cover maps based on
  pollen observations for Europe" by Behnaz Pirzamanbein.

What is estimated, not measured (the game says so in "About this map"):
- Forest share per 1° cell comes from pollen; in the east (most of Belarus, north-west Russia and
  Ukraine) a statistical model filled the gaps. The exact forest edges are placed by a rule.
- Marsh comes from today's peat-soil and wetland maps plus today's open bogs. The Uppsala plain
  reads partly marshy (drained peat in its valleys; the land there stood several metres lower in
  1219). This is left as the data shows: TO CHECK.
- Heights and sea depths are today's. Under modern reservoirs the land shows flat, at today's water
  level.
- Which lakes are modern reservoirs: `tools/map/ne-water-1219.json` lists each decision. Dam dates
  are not used; any entry not confirmed by a source is marked TO CHECK.
- Where the peat maps show more bog than the pollen's open share allows (25 one-degree squares in
  north-west Russia, south-east Finland and east Estonia), bog wins, so forest there is up to 32
  points below the pollen share. The game's "About this map" says so.
- Natural Earth river names repaired in the same reviewed list, each with its reason: Nemunas
  (Natural Earth says Neman), Dnipro (one river, where Natural Earth splits it), Göta älv,
  Klarälven, Motala ström, Glåma/Glomma, Kokemäenjoki, and the Gudbrandsdalslågen pieces Natural
  Earth calls Vorma. Today's names; names of 1219 come with the time slider.
- The coastal dunes of the Curonian Spit and Łeba are painted as heath from today's bare sand.
  Whether they were forested in 1219 (the drifting dunes may be later) is TO CHECK, with a source,
  before M3.

New TO CHECK items:
- The pollen time window's exact edges (700 to 1200 BP, or 750 to 1250 BP; that is, AD 750 to
  1250 or AD 700 to 1200).
- The SpatioCompo licence (CC BY-SA 4.0, or the repository's GPL-3.0 file).
- The GLWD data TIFFs against the official zips.
- Lake Ladoga reads about 1 m in GEBCO, against a surface of about 5 m.

## Map data used in step 2a M2b (11 October 2026)

| Collection | What the game uses | Licence, and where it was read | Status |
| --- | --- | --- | --- |
| OpenStreetMap, via Overture Maps (`osm`) | Rivers and lakes with today's names (block `src/data/odbl/water.json`) | ODbL 1.0. The OSM copyright text is in the OSMF's own repository, github.com/openstreetmap/openstreetmap-website, `config/locales/en.yml` (the `legal_babble` keys), commit 31bc4cd. Overture's attribution page is in github.com/OvertureMaps/docs (`docs/attribution.mdx`), commit f7030ca: "© OpenStreetMap contributors, Overture Maps Foundation" | Read. Overture release 2026-09-23.1, on Overture's own bucket overturemaps-us-west-2. River relations from Overpass, OSM base 2026-10-06 |

How the names are written (Ignas's choices, 11 October 2026):
- Latin letters everywhere. Cyrillic names are romanised by BGN/PCGN: Russian (1947), Belarusian
  (1979) and Ukrainian (2019, the same as Ukraine's 2010 national system). The soft and hard signs
  and the Ukrainian apostrophe are left out. The tables are in `tools/map/romanize.mjs` and are TO
  CHECK against the official BGN/PCGN documents (the gov.uk PCGN pages are not reachable from the
  cloud session).
- Lake labels show just the name, without the word for "lake". Plain forms come from the data or
  from a reviewed list, `tools/map/lake-names.json`; uncertain ones are marked TO CHECK.
- Every changed label is listed with its rule in `data/raw/derived/water-labels.json`, which the
  build writes; it is not committed.

New TO CHECK items:
- The OSM snapshot date to quote: the rows say 2026-09-06, and Overture's release notes say its
  cut-off was 2026-09-12.
- The ODbL legal code (opendatacommons.org) and the OSMF attribution guidelines (osmfoundation.org)
  were not read: both hosts are blocked.
- Each dropped or kept entry in `tools/map/osm-water-1219.json` without a source: mining lakes in
  Lusatia, around Leipzig and Halle, and in North Bohemia; Swedish dam ponds; Polish reservoirs;
  the Ivinsky Razliv on the Svir; Norwegian lakes kept although tagged as reservoirs. Dam years
  are quoted only from OSM's own start_date tags.
- Rivers through dropped reservoirs follow today's mapped line, an approximation of the river
  before the dam (for example the Dnieper through the Kyiv and Kaniv reservoirs, and the Nemunas
  through Kauno marios).

## Map data used in M3a: date engine and forest over time (20 October 2026)

The map follows the game's date (Ignas, 11 October 2026), so the forest changes from 1250 to
today. What is evidence and what is a rule:

- Evidence: how much of each 1 degree square is forest, and how much of that forest is conifer,
  at four anchors: 1425, 1725 and 1900 from the pollen maps below, 2021 from ESA WorldCover 2021
  (already listed under the M2 map data, `worldcover-2021`, CC BY 4.0).
- Rule (not a historical map, and labelled so): which 1 km cells are cleared or grow back, and in
  which year. Clearings spread out from open land; each 32 km block changes at a steady pace
  (tools/map/terrain-time.mjs, src/sim/map-date.js).

### SpatioCompo pollen land cover, time windows 3, 2 and 1

- What: pollen-based land cover (gap-filled REVEALS), conifer, broadleaf and open shares per
  1 degree cell, by Behnaz Pirzamanbein, the same dataset as the 1219 grid (`spatiocompo-tw4`).
- Files (pinned to commit 894d44d58f66bb5c273491d98c3ec23a35e6a796 of the author's own repository,
  fetched 12 October 2026 through tools/map/fetch.mjs; fingerprints in data/raw/manifest.json):
  - `spatiocompo-tw3`, about AD 1250-1600:
    https://raw.githubusercontent.com/BehnazP/SpatioCompo_entireHolocene/894d44d58f66bb5c273491d98c3ec23a35e6a796/Land-cover%20Maps/Land_Cover_550.csv
    (sha256 fb7cb5e379ab9932036db31043da1f5b505a3b868a7001781bdb6a66daddd1a0)
  - `spatiocompo-tw2`, about AD 1600-1850:
    https://raw.githubusercontent.com/BehnazP/SpatioCompo_entireHolocene/894d44d58f66bb5c273491d98c3ec23a35e6a796/Land-cover%20Maps/Land_Cover_225.csv
    (sha256 d8f34305b6977a3472637584ba3a33f260b74796cdf1477f9156db27d059dae9)
  - `spatiocompo-tw1`, about AD 1850-1950:
    https://raw.githubusercontent.com/BehnazP/SpatioCompo_entireHolocene/894d44d58f66bb5c273491d98c3ec23a35e6a796/Land-cover%20Maps/Land_Cover_50.csv
    (sha256 a4e1d95f0f40a33657cbf6114d59ea7d86a8ed1aaa6ef4333a774ff2345492fb)
- Licence: CC BY-SA 4.0, read in the repository's README.md at the same commit
  (https://raw.githubusercontent.com/BehnazP/SpatioCompo_entireHolocene/894d44d58f66bb5c273491d98c3ec23a35e6a796/README.md),
  as for `spatiocompo-tw4`. So the shipped `src/data/by-sa/terrain-time.json` is CC BY-SA 4.0 too.
- What was read: the README's list of the 25 files and its column names (C_ conifer, B_ broadleaf,
  U_ open); each CSV's header (`Lon,Lat,C_KK10LonLatElev,B_KK10LonLatElev,U_KK10LonLatElev`);
  423 one-degree cells of each window touch the map window.
- The time windows: Githumbi, E., Pirzamanbein, B., et al. (2022), Pollen-Based Maps of Past
  Regional Vegetation Cover in Europe Over 12 Millennia - Evaluation and Potential, Frontiers in
  Ecology and Evolution 10:795794,
  https://www.frontiersin.org/journals/ecology-and-evolution/articles/10.3389/fevo.2022.795794/full
  (read by the M3 research, 11 October 2026): "present-100, 100-350, 350-700, 700-1200,
  1200-1700 until 11700 calibrated years BP" (BP = before AD 1950). So 0-100 BP is AD 1850-1950,
  100-350 BP is AD 1600-1850, 350-700 BP is AD 1250-1600.
- Our choices (not facts): each anchor sits in the middle of its window (1425, 1725, 1900); the
  1219 grid holds until 1250, the end of its own window (AD 750-1250); between anchors the change
  is spread evenly over the years.
- Today's (2021) conifer share is window 1's (AD 1850-1950), per square: WorldCover has no conifer
  class, and the satellite conifer maps the research tried would show Lithuania's conifer
  collapsing (one gave 15% needleleaf among forest pixels).

Computed from the shipped data (a check, not a source): forest share of the land in a box over
Lithuania (21-27E, 54-56N): 64.3% in 1219, 51.9% in 1425, 44.2% in 1725, 42.0% in 1900, 39.4% in
2021. Every 1 degree square meets its pollen (or WorldCover) forest and conifer shares within
3 points at every anchor, except squares where marsh leaves too little open land (the "capped"
squares of the 1219 grid, listed in data/raw/derived/terrain-time-1km.u8.json).

TO CHECK:
- Which file is which window: the paper lists the windows and the README lists the 25 file names,
  but no source states the window of each file. Land_Cover_50, 225 and 550 as 0-100, 100-350 and
  350-700 BP rests on the count and the names (each a rounded window middle).
- The repository's LICENSE file is GPL-3.0 while the README licenses the data under CC BY-SA 4.0
  (the same open question as for window 4; the author is being asked).
- Today's conifer share from window 1 (1850-1950) rather than measured today. Lithuania's national
  forest inventory puts conifer stands at about 55% of forest area (2018 inventory slides, Stakėnas,
  sc2018.thuenen.de/fileadmin/sc2018/26_Stakenas_ICP_Forests_SC2018.pdf; seen only in search
  snippets by the M3 research). Whether to use national inventories per country instead is
  Ignas's call.
- Marsh and heath do not change over time in M3a (no drainage of bogs and fens yet); the Żuławy
  diking comes from the water part's own dated list.

## Map data used in M3a: the northern coast over time (20 October 2026)

Since 1219 the land of Sweden, Åland, Finland and Estonia has risen out of the sea. The game's
coast block (`src/data/by/coast.json`, CC BY 4.0) is an **estimate** of where the sea stood in each
year: relative sea fall = k × (land uplift − 0.5) mm a year, with k fitted to the dated shores
below and back to 1 within 150 km of them, over GEBCO's heights, flooded from the sea so that a
basin behind a sill stays sea only while the sill is under water. The rule's "0.5 mm a year" is
our own fit to dated shores (research notes, 11 October 2026), not a published figure. Rules:
`tools/map/coast.mjs`; control points with quotes: `tools/map/coast-anchors.json`.

| Collection | What the game uses | Licence, and where it was read | Status |
| --- | --- | --- | --- |
| Nordic Geodetic Commission, NKG_RF17vel (`nkg-rf17vel`) | The up_velocity band (mm a year), the land uplift behind the coast estimate | CC BY 4.0. Read in the file's own copyright tag ("The Nordic Geodetic Commission. Creative Commons Attribution 4.0"), in the copy the NKG publishes on its own site: https://www.nordicgeodeticcommission.com/wp-content/uploads/2025/06/eur_nkg_nkgrf17vel.tif, linked from https://www.nordicgeodeticcommission.com/products/ ("NKG_RF17vel: the official 2D+1D velocity model used in the NKG2020 transformation"). Fetched from PROJ-data release 1.25.0, byte-identical (SHA-256 515f68aeb59f659a3f3c340626cd060f58de6f93b4546df67732b906949e0d66): https://raw.githubusercontent.com/OSGeo/PROJ-data/1.25.0/eur_nkg/eur_nkg_nkgrf17vel.tif, README https://raw.githubusercontent.com/OSGeo/PROJ-data/1.25.0/eur_nkg/eur_nkg_README.txt | Read, used |
| SGU, Strandförskjutningsmodell (`sgu-shore`) | Would replace the estimate in Sweden: sea and lake polygons per century, tables issjohav_<cal BP>, in SWEREF 99 TM. Product description: https://resource.sgu.se/dokument/produkter/oppnadata/strandforskjutningsmodell-oppnadatabeskrivning.pdf; data: https://resource.sgu.se/data/oppnadata/jord/strandforskjutningsmodell/strandforskjutning_1_900.gpkg | CC BY 4.0 ("Creative Commons Erkännande 4.0") per the product description seen during research; not yet read on resource.sgu.se | **Not used**: resource.sgu.se is blocked until Ignas allows it. The reader (`tools/map/gpkg.mjs`) and the hook (`readSguCenturies` in `tools/map/build-coast.mjs`) are built and tested on a made-up GeoPackage; the build says "SGU's shore model is not here" and uses the estimate |
| GEBCO_2026 (`gebco-2026`) | Heights at 500 m (only GEBCO's land, above 0 m, averaged) | As listed above for M2 | Read, used |
| Natural Earth land and lakes (`ne-land`, `ne-lakes`) | Today's coast (the game's own), and Lake Mälaren's outline | As listed above for M2 | Read, used |

Control points (only their figures are used; the papers are cited, not shipped):

| Place | Sea above today's | Source | Seen |
| --- | --- | --- | --- |
| Lake Eckarfjärden, north Uppland (60°22'N 18°12'E) | 5.5 m, isolated 850 cal BP (about AD 1100) | Hedenström and Risberg (2003), SKB TR-03-17, Table 4-1: https://skb.com/publication/20970/TR-03-17.pdf | Read |
| Stockholm, Stadsholmen | about 2 m at the turn of the 13th/14th century (fitted); about 4 m around 1000 (check only) | Söderlund (2016), Slussen through the ages, p. 5: https://skonhetsradet.stockholm/wp-content/uploads/sites/45/2023/08/slussen-eng.pdf | Read |
| Lake Mälaren | a bay of the sea until about 1300, then a lake: the lake's outlet at Stockholm closes in 1300 | Söderlund (2016), as above: "By around 1300, land rise had transformed Mälaren from a deep bay of the Baltic Sea to a lake." | Read |
| Harku, Tallinn (59.42N 24.62E) | 2.73 m at 1040 cal BP (index point Harku-4) | Rosentau et al. (2020), HOLSEA Baltic database, GFZ Data Services, doi:10.5880/GFZ.1.3.2020.003 (CC BY 4.0, stated in the xlsx): https://datapub.gfz-potsdam.de/download/10.5880.GFZ.1.3.2020.003vEGWF/2020-003_Rosentau-et-al_HOLSEA_baltic_isol_21-06-18.xlsx | Read |
| Tallinn | 2.0 m in 1219: our arithmetic on the paper's linear fall from about 12 m at 4400 cal BP | Saarse and Vassiljev (2010), Estonian Journal of Earth Sciences 59(3), 207-215: https://kirj.ee/public/Estonian_Journal_of_Earth_Sciences/2010/issue_3/earth-2010-3-207-215.pdf | Read |
| Salme, Saaremaa | about 1.0 m in 1219 (fitted), 0.8 m at AD 1300 (check): "an almost linear RSL fall from 5.5 to 0.8 m a.s.l. between 1000 BC and 1300 AD" | Nirgi et al. (2022), The Holocene 32(4), doi:10.1177/09596836211066596: https://doi.org/10.1177/09596836211066596 (abstract read in Crossref's record: https://api.crossref.org/works/10.1177/09596836211066596) | Abstract only; the paper is closed access (TO CHECK) |
| Prassi, Hiiumaa (58.7289N 22.6172E) | sea at or below 6.63 m at 940 cal BP (a limiting point: a bracket, not a value) | HOLSEA Baltic database, as above (sample Prassi 1) | Read |
| Transverse Mercator formulas (for SWEREF 99 TM) | Krüger's series and the worked example the tests use | Lantmäteriet (2008), Gauss Conformal Projection (Transverse Mercator), Krüger's Formulas: https://www.lantmateriet.se/globalassets/geodata/gps-och-geodetisk-matning/gauss_conformal_projection.pdf; SWEREF 99 TM's parameters (EPSG:3006, as UTM zone 33N on GRS80): https://spatialreference.org/ref/epsg/3006/proj4.txt | Read |

What the build found (20 October 2026, without SGU): the fitted k is 0.53 at Stockholm, 0.89 in
north Uppland, 0.91 at Tallinn and 0.60 on Saaremaa. The 1219 sea stood about 2.2 m above
today's at Stockholm, 4.3 m at Turku, 4.6 m at Mariehamn, 1.9 m at Haapsalu and 1.2 m at Pärnu
(our estimate). Within 15 km of each, the 1219 shore lies at most 1.5 to 2.2 km inland of today's
(3 to 4 cells of 500 m), and up to 4.5 km round Mariehamn, where low basins behind sills are
cut off. About 31,000 cells of today's dry land change, plus Lake Mälaren (7,275 cells), a bay
until 1303.

TO CHECK:
- Stockholm's 1219 sea: Söderlund's 2 m about 1300 gives about 2.2 m in 1219; other sources allow
  2.5 to 4.3 m. Is the 2 m measured against the sea or against Lake Mälaren?
- When Mälaren became a lake: "about 1200" (Britannica, snippet only) or "by around 1300"
  (Söderlund, read). The outlet's position at Stockholm is picked by hand (approximate).
- Turku and Åland have no control point: the rule as it is gives about 4.3 m in 1219; a Turku
  curve seen only as a snippet (Vuorela et al. 2009, about 3.8 mm a year) suggests about 3 m.
- The Salme figures are from the abstract of Nirgi et al. (2022) only; the abstract also says the fall slowed after 1300, which the straight-line rule does not follow.
- Approximate positions picked by hand: Stockholm (Stadsholmen), Tallinn's centre, Salme.
- GEBCO's heights near Stockholm read high: Lake Mälaren's surface is 3.0 m in GEBCO against
  about 0.3 to 0.7 m above the sea, so the estimate floods less than the rule would on true
  heights there. A bare-earth height model (Lantmäteriet, Maanmittauslaitos, Maa-amet) or SGU's
  model would fix it.
- Whether NKG_RF17vel's up band is exactly the NKG2016LU_abs land-uplift model (Vestøl et al.
  2019); neither the file nor the README says.
- SGU's licence, read on resource.sgu.se, once Ignas allows the host.

## Map data used in M3a: water works and drawn shapes (20 October 2026)

The map follows the game's date. Reservoirs fill in their years, channels appear when they were
cut, the Vistula Lagoon's outlets open and close, Ruden loses its land bridge, and the Vistula
delta is diked. The dated list is `tools/map/water-changes.json` (reviewed by hand); our own drawn
shapes are `tools/map/history-shapes.json`; both are packed into `src/data/own/changes.json`, our
own work under the game's own terms (not yet chosen). The OpenStreetMap features that are dated
carry only our ids, as tags, in `src/data/odbl/water.json`.

Sources of the dated facts:

| Id | Source | Link | Status |
| --- | --- | --- | --- |
| `wp-kaunas-reservoir` | Wikipedia, 'Kaunas Reservoir' | https://en.wikipedia.org/wiki/Kaunas_Reservoir | Read |
| `wp-narva-reservoir` | Wikipedia, 'Narva Reservoir' | https://en.wikipedia.org/wiki/Narva_Reservoir | Read |
| `wp-kyiv-reservoir` | Wikipedia, 'Kyiv Reservoir' | https://en.wikipedia.org/wiki/Kyiv_Reservoir | Read |
| `wp-kaniv-reservoir` | Wikipedia, 'Kaniv Reservoir' | https://en.wikipedia.org/wiki/Kaniv_Reservoir | Read |
| `wp-vileyka-reservoir` | Wikipedia, 'Vileyka reservoir' | https://en.wikipedia.org/wiki/Vileyka_reservoir | Read |
| `wp-zaslawye-reservoir` | Wikipedia, 'Zaslawskaye reservoir' | https://en.wikipedia.org/wiki/Zaslawskaye_reservoir | Read |
| `wp-elektrenai-reservoir` | Wikipedia, 'Elektrėnai Reservoir' | https://en.wikipedia.org/wiki/Elektr%C4%97nai_Reservoir | Read |
| `wp-wloclawek-reservoir` | Wikipedia, 'Włocławek Reservoir' | https://en.wikipedia.org/wiki/W%C5%82oc%C5%82awek_Reservoir | Read |
| `wp-zegrze-reservoir` | Wikipedia, 'Zegrze Reservoir' | https://en.wikipedia.org/wiki/Zegrze_Reservoir | Read |
| `kaczmarek-2010-jeziorsko` | Kaczmarek, H. (2010), 'Analiza zdjęć lotniczych oraz wyników pomiarów geodezyjnych w badaniach dynamiki strefy brzegowej sztucznych zbiorników wodnych – zbiornik Jeziorsko, rzeka Warta', Landform Analysis 13: 19–26 | https://bibliotekanauki.pl/articles/295062.pdf | Read |
| `wp-sulejow-reservoir` | Wikipedia, 'Sulejów Reservoir' | https://en.wikipedia.org/wiki/Sulej%C3%B3w_Reservoir | Read |
| `wp-et-soodla` | Wikipedia (Estonian), 'Soodla veehoidla', citing A. Mäemets, 'Uus kaunis veehoidla Soodla jõel', Eesti Loodus, July 1983, p. 468 | https://et.wikipedia.org/wiki/Soodla_veehoidla | Read |
| `wp-riga-hes` | Wikipedia, 'Riga Hydroelectric Power Plant' | https://en.wikipedia.org/wiki/Riga_Hydroelectric_Power_Plant | Read |
| `wp-plavinas-hes` | Wikipedia, 'Pļaviņas Hydroelectric Power Station' | https://en.wikipedia.org/wiki/P%C4%BCavi%C5%86as_Hydroelectric_Power_Station | Read |
| `wp-kegums-hes` | Wikipedia, 'Ķegums Hydroelectric Power Station' | https://en.wikipedia.org/wiki/%C4%B6egums_Hydroelectric_Power_Station | Read |
| `wp-przekop` | Wikipedia, 'Przekop Wisły' | https://en.wikipedia.org/wiki/Przekop_Wis%C5%82y | Read |
| `wp-smiala-wisla` | Wikipedia, 'Śmiała Wisła' | https://en.wikipedia.org/wiki/%C5%9Amia%C5%82a_Wis%C5%82a | Read |
| `wp-pl-martwa-wisla` | Wikipedia (Polish), 'Martwa Wisła' | https://pl.wikipedia.org/wiki/Martwa_Wis%C5%82a | Read |
| `wp-bulli` | Wikipedia, 'Buļļi' (the history of the Buļļupe and the Lielupe's mouths) | https://en.wikipedia.org/wiki/Bu%C4%BC%C4%BCi | Read |
| `wp-lielupe` | Wikipedia, 'Lielupe' (the coordinates of its mouth) | https://en.wikipedia.org/wiki/Lielupe | Read |
| `hagen-1883-pillau` | L. Hagen, 'Der Hafen zu Pillau', Zeitschrift für Bauwesen 33 (1883), cols. 249–250 (after G. Hagen, Handbuch der Wasserbaukunst); scan in the Lower Silesian Digital Library | https://dbc.wroc.pl/Content/17630/PDF/19634.pdf | Read |
| `wp-strait-of-baltiysk` | Wikipedia, 'Strait of Baltiysk' | https://en.wikipedia.org/wiki/Strait_of_Baltiysk | Read |
| `wp-de-lochstedt` | Wikipedia (German), 'Burg Lochstedt' (the castle's coordinates) | https://de.wikipedia.org/wiki/Burg_Lochstedt | Read |
| `wp-de-ruden` | Wikipedia (German), 'Ruden (Insel)', citing F.-W. Dwars on the 'supposed' land bridge and N. Petzholdt, 'Der Mönchgraben bei Baabe und die Landverbindung zwischen Rügen und dem Ruden', Pommern 1/2014 | https://de.wikipedia.org/wiki/Ruden_(Insel) | Read |
| `wp-druzno` | Wikipedia, 'Druzno' | https://en.wikipedia.org/wiki/Druzno | Read |
| `nitychoruk-2016` | Nitychoruk, J., Szymanek, M., Bińka, K., Kasprzycka, M. and Zbucki, Ł. (2016), 'Changes of sedimentation in the Drużno Lake based on geoarchaeological data from the Teutonic fortress in Elbląg', Acta Geologica Polonica 66(1): 85–98, Text-fig. 9 (the lake in the 13th century, after Kasprzycka 1996, 1997, 1999), doi:10.1515/agp-2016-0004 | https://www.czasopisma.pan.pl//Content/81982/PDF/04_nitychoruk.pdf | Read |
| `koperska-2025` | Koperska-Kośmicka, M. (2025), 'The state of preservation of medieval street-square village in the landscape of northern Poland', Miscellanea Geographica 29(3): 185–193, doi:10.2478/mgrsd-2025-0008 (CC BY 4.0) | https://reference-global.com/download/article/10.2478/mgrsd-2025-0008.pdf | Read |
| `osm-start-date` | OpenStreetMap's own start_date tag on the lake, read with the rest of the OpenStreetMap water (© OpenStreetMap contributors, ODbL 1.0); not checked by us | https://wiki.openstreetmap.org/wiki/Key:start_date | Read |

The dated entries (years: shown from the first, up to but not including the second):

| Entry | Years | Fact | Source | Status |
| --- | --- | --- | --- | --- |
| `kaunas-reservoir` | 1959 to today | Reservoir, made in 1959 by damming the Nemunas near Kaunas. | `wp-kaunas-reservoir` | Read |
| `narva-reservoir` | 1955 to today | Reservoir, made in 1955-1956 for the Narva hydro station. | `wp-narva-reservoir` | TO CHECK: 1955 or 1956 for the filling: the page gives the years it was made, 1955-1956 |
| `kyiv-reservoir` | 1964 to today | Reservoir, filled in 1964-1966 behind the dam of the Kyiv hydro station at Vyshhorod. | `wp-kyiv-reservoir` | Read |
| `kaniv-reservoir` | 1972 to today | Reservoir, held by the dam of the Kaniv hydro station, built in 1972. | `wp-kaniv-reservoir` | TO CHECK: the year it filled; the map uses the dam's year |
| `vileyka-reservoir` | 1973 to today | Reservoir, begun in 1968; the Viliya (Neris) was dammed in 1973, and its water reached Minsk in 1975. | `wp-vileyka-reservoir` | TO CHECK: the year it filled; the map uses the year the river was dammed (OpenStreetMap's start_date says 1975) |
| `zaslawye-reservoir` | 1956 to today | Reservoir, made in 1956 by a dam on the Svislach to control floods in Minsk. | `wp-zaslawye-reservoir` | TO CHECK: what OpenStreetMap's second date, 1977, means |
| `elektrenai-reservoir` | 1961 to today | Reservoir, made in 1961 by damming the Strėva, for the Elektrėnai power station. | `wp-elektrenai-reservoir` | TO CHECK: one page says 1962; the natural lakes it drowned (about 8, a search result only) are not drawn before then |
| `wloclawek-reservoir` | 1970 to today | Reservoir on the Vistula, there since 1970, when the dam at Włocławek was built. | `wp-wloclawek-reservoir` | Read |
| `zegrze-reservoir` | 1963 to today | Reservoir on the Narew, formed by a dam built in 1963. | `wp-zegrze-reservoir` | Read |
| `jeziorsko-reservoir` | 1986 to today | Reservoir on the Warta: filling began in 1986 and it was full in 1992. | `kaczmarek-2010-jeziorsko` | Read |
| `sulejow-reservoir` | 1973 to today | Reservoir on the Pilica, built in 1969-1974 to supply Łódź with water; in use from May 1973. | `wp-sulejow-reservoir` | Read |
| `soodla-reservoir` | 1981 to today | Reservoir on the Soodla river, made for Tallinn's water supply; it had formed by the summer of 1981. | `wp-et-soodla` | Read |
| `riga-reservoir` | 1974 to today | Reservoir of the Rīga hydro station on the Daugava, which started work in 1974; it drowned about half of the island Doles sala. | `wp-riga-hes` | TO CHECK: the filling year: the page says 1974 for the station but also that the dam was 'built in the late 1970s'; not one of the 12 reservoirs Ignas listed, added because OpenStreetMap does have its shape (relation/5462605) |
| `plavinas-dam` | 1965 to today | The Pļaviņas dam on the Daugava was finished in 1965; its reservoir drowned the Staburags cliff and the valley around it. | `wp-plavinas-hes` | Read |
| `kegums-dam` | 1939 to today | The Ķegums hydro station, the oldest on the Daugava, was built in 1936-1939. | `wp-kegums-hes` | TO CHECK: 1939 (the plant) or 1940 (the dam finished, by the page's category) for the reservoir |
| `osm-start-date` | (rule) | A reservoir or man-made lake. The year it appears is the one OpenStreetMap gives for it; we have not checked it. | `osm-start-date` | Read (year from OpenStreetMap) |
| `vistula-przekop` | 1895 to today | The Przekop, a new mouth for the Vistula, was dug from June 1891 and opened on 31 March 1895. | `wp-przekop` | Read |
| `martwa-wisla-old-mouth` | always was to today | The Martwa Wisła ('Dead Vistula') is the Vistula's old way to the sea past Gdańsk. Its lower part took the name after 1840, when the river broke a new mouth at Górki, and the rest after the Przekop was cut in 1890-1895. | `wp-pl-martwa-wisla` | Read |
| `wisla-smiala` | 1840 to today | The Wisła Śmiała ('Daring Vistula') formed in the flood of 1840, when an ice jam sent the river through to the sea at Górki, and became a new mouth of the Vistula. | `wp-smiala-wisla` | TO CHECK: a scholarly source for 1840; the day (1 February 1840) is from a search result only |
| `lielupe-new-mouth` | 1755 to today | In the spring floods of 1755 (some sources say 1757) the Lielupe broke through the dunes to the sea, making its modern mouth. An earlier mouth, cut by an ice jam in 1697, later silted up. | `wp-bulli` | TO CHECK: 1755 or 1757: sources differ; the same page says the new bed was dammed in 1765-1768 and broke through again in 1771, which the map leaves out |
| `bullupe-old-lielupe` | always was to today | The Buļļupe is the Lielupe's old lower course, down to its old meeting with the Daugava; before the Lielupe broke its own mouths (1697, 1755), it reached the sea this way. | `wp-bulli` | Read |
| `lochstedt-outlet` | always was to 1350 | The lagoon once drained to the sea through a channel by Lochstedt; it closed in the 14th century. | `hagen-1883-pillau` | TO CHECK: where exactly the channel ran (drawn just south-west of Lochstedt castle), and the year it closed (the map uses 1350 for 'the 14th century') (reconstructed, estimate) |
| `vogler-outlet` | always was to 1350 | The lagoon once drained to the sea opposite Frauenburg (Frombork), between the spit villages of Vogler and Schmeergrube; it closed in the 14th century. | `hagen-1883-pillau` | TO CHECK: where exactly the channel ran (drawn across the spit north-west of Frombork), and the year it closed (the map uses 1350 for 'the 14th century') (reconstructed, estimate) |
| `balga-outlet` | 1350 to 1520 | The Balga channel through the spit formed in the 14th century, opposite Rosenberg. Danzig sank ships in it in 1456 to block it, and in 1520 closed it with a wall of piles. | `hagen-1883-pillau` | TO CHECK: where exactly it ran (Hagen: opposite Rosenberg, about 4 km south of the spit settlement Alt Tief; drawn across the spit north-west of Balga), and the year it opened (the map uses 1350) (reconstructed, estimate) |
| `pillau-strait` | 1497 to today | A storm surge cut the Pillau channel through the Vistula Spit in 1497, and another in 1510 made it deep enough for ships. It is the lagoon's way to the sea today. | `wp-strait-of-baltiysk` | TO CHECK: Hagen (1883) quotes a church inscription at Alt-Pillau saying a new channel had broken through by 1479 (reconstructed) |
| `ruden-island` | always was to today | Ruden is a small island, 2.3 km long, between Rügen and Usedom; it is first written of in 1254, as 'portus ruden'. | `wp-de-ruden` | TO CHECK: its size and shape in 1219: the page says the north shore has lost 800-900 m in the last 200 years and the southern hook (1.3 km) built up since, so the island was bigger then and of another shape; it is drawn at about today's size at every date (reconstructed) |
| `ruden-land-bridge` | always was to 1304 | Ruden may have been joined to Rügen by a strip of land until the All Saints' storm flood of 1304 broke it. Local lore tells of it; one study calls it supposed, a 2014 study finds it possible. | `wp-de-ruden` | TO CHECK: whether the land bridge existed at all, and its course and width (a guess); the storm's year (1304) as given by the page (reconstructed, estimate) |
| `zulawy-diking-1` | always was to 1400, spread 1308-1400 | Permanent settlement of the Vistula delta began around 1200. Most of its villages were founded in the Teutonic Order's colonisation of the 14th century, which one study dates to 1308-1400. The map has the land diked and drained as it was settled, which is still to check. | `koperska-2025` | TO CHECK: how much of the delta was undiked marsh in 1219, and that the diking went with the settlement (the source dates the villages, not the dikes); the delta's outline is drawn by us from the heights (reconstructed, estimate) |
| `zulawy-diking-2` | always was to 1650, spread 1550-1650 | Dutch settlers came to the delta in a first wave from the middle of the 16th century into the 17th, founding scattered villages. The map has them drain its lowest ground, which is still to check. | `koperska-2025` | TO CHECK: which ground was drained then (the map takes the cells the heights put below sea level), and when it ended (the map uses 1550-1650) (reconstructed, estimate) |
| `druzno-larger` | always was to 1860 | Lake Drużno was larger in the 13th century than today, reaching to Elbląg, though much smaller than older maps show; it has been filling in and growing over since. | `nitychoruk-2016` | TO CHECK: its outline (drawn by us from the heights, sized after the 13th-century range in Nitychoruk et al. 2016) and when it shrank to about today's size (the map uses 1860, the year the Elbląg Canal opened through the lake) (reconstructed, estimate) |

Notes:
- Smaller reservoirs and other man-made lakes (26 that ship) show from the year in their own
  OpenStreetMap `start_date` tag, marked "year from OpenStreetMap"; we have not checked these
  years. The 413 others that pass the size rule have no such year and are not shown at any date.
- The Pļaviņas and Ķegums reservoirs have no shape of their own in OpenStreetMap (the Daugava there
  is mapped only as river area, which the map does not draw): their dates are facts on the Daugava.
  The Rīga reservoir does have one (relation/5462605, 12.9 km²) and ships dated.
- Every drawn shape is marked "reconstructed": drawn by us on GEBCO's heights and sea depths
  (public domain), Natural Earth's land (public domain) and published coordinates, never traced
  from OpenStreetMap or a map in copyright. Lake Drużno's 13th-century size follows Text-fig. 9 of
  Nitychoruk et al. (2016), looked at, not traced.
- The masks that cut the dated river stretches (the Przekop, the Lielupe's mouth) are coarse
  boxes round the published coordinates; they are tools only and never ship.

New TO CHECK items:
- Every outlet's exact place and the years they opened and closed (Hagen gives "the 14th
  century"; the map uses 1350); the 1479 inscription at Alt-Pillau against the 1497 storm.
- Whether Ruden was ever joined to Rügen (local lore; one study calls it supposed, a 2014 study
  allows it), and the strip's course and width.
- Żuławy: how much of the delta was undiked marsh in 1219; that the diking went with the 14th
  century settlement; which ground the Dutch settlers drained from about 1550, and when that ended
  (the map uses 1550-1650); the delta's outline (ours, from the heights).
- Lake Drużno: its 13th-century outline and when it shrank to about today's size (the map uses
  1860).
- The filling years of Narva (1955 or 1956), Kaniv, Vileyka, Elektrėnai (1961 or 1962), Rīga and
  Ķegums; the Lielupe's mouth (1755 or 1757); a scholarly source for the Wisła Śmiała's 1840.
- Not yet on the list (from the research, all TO CHECK): canals (Augustów, Ogiński, Dnieper-Bug,
  Elbląg, Bydgoszcz, Klaipėda, the Masurian Canal), the Daugava's old mouth, lake lowerings
  (Hjälmaren, Lubāns, Engure, Võrtsjärv, Tåkern, Hornborgasjön, Søborg Sø), the Vuoksi and Lake
  Suvanto, the Oder's new channel, the Volkhov and Svir dams, and Hel.

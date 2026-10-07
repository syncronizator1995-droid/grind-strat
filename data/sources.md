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

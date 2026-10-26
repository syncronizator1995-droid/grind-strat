# Attribution

Grind Strat's map is made from the open data below. This file is written by
`tools/map/attribution.mjs` from `tools/map/sources.json` (run `npm run attribution`); do not edit it by
hand. The game shows the same credits on its Credits sheet, and a short credit line on the map.

## Which licence covers which folder

- `src/data/odbl/`: Open Database License (ODbL) 1.0: OpenStreetMap rivers and lakes, as the Overture Maps Foundation publishes them (see its LICENSE.md and README.md). Nothing else is mixed into it.
- `src/data/by-sa/`: Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0): the 1219 terrain grid and how it changes up to today (see its LICENSE.md and README.md).
- `src/data/by/`: Creative Commons Attribution 4.0 (CC BY 4.0): the northern coast over time (see its LICENSE.md and README.md). Nothing share-alike or from OpenStreetMap is mixed into it.
- `src/data/map/`: Public domain data: Natural Earth (land and coast; and the rivers and lakes until the OpenStreetMap ones ship) and GEBCO (GEBCO asks to be credited; not for navigation).
- `src/data/own/`: Grind Strat's own work under the game's own terms (not yet chosen): the dated facts and drawn shapes of the map over time, and the names of rivers, lakes and seas over time (see its LICENSE.md and README.md).
- `src/ui/fonts/`: SIL Open Font License 1.1: the Grenze Gotisch font (see OFL.txt there).
- `test/fixtures/odbl/`: Open Database License (ODbL) 1.0: a small test slice of the Overture Maps Foundation's copy of OpenStreetMap water data, for testing the Parquet reader (see its LICENSE.md).
- `everything else`: The code and the rest of the repository are under the repository's own licence (see README.md).

The game's combined data bundle (the way the blocks are put together in the game file) is also offered
under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), while the contents of the ODbL block
(`src/data/odbl/`) stay under the ODbL 1.0. The OpenStreetMap-derived data is offered at github.com/syncronizator1995-droid/grind-strat, folder src/data/odbl/.

All data is used as it is, with no warranty. No data provider endorses this game. The GEBCO grid
is not for navigation or any other purpose involving safety at sea.

## The data blocks in the game

- `src/data/map/base.json` (public-domain): land, coast, heights and sea depths. Notice: "Land, coast, heights and sea depths for Grind Strat. Sources: Made with Natural Earth (Public domain, www.naturalearthdata.com/about/terms-of-use/); GEBCO Compilation Group (2026) GEBCO 2026 Grid (doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa) (Public domain (GEBCO Grid terms of use), dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/GEBCO_Grid_terms_of_use.pdf). Not for navigation. Not endorsed by GEBCO, the IHO or the IOC. Made available as is."
- `src/data/by-sa/terrain-1219.json` (CC-BY-SA-4.0): the land around 1219: forest, open land, marsh and heath. Notice: "The land around AD 1219 for Grind Strat, 1 km grid: forest share estimated from pollen, edges placed by a rule; marsh from today's peat-soil and wetland maps plus today's open bogs. Shared under CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0/). Sources: Forest around 1219: pollen-based land-cover maps by Behnaz Pirzamanbein, from Githumbi, Pirzamanbein et al. (2022) (CC BY-SA 4.0, creativecommons.org/licenses/by-sa/4.0/); © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium (CC BY 4.0, creativecommons.org/licenses/by/4.0/); Marsh and bog: Global Lakes and Wetlands Database v2 (Lehner et al. 2025), hydrosheds.org/products/glwd (CC BY 4.0, creativecommons.org/licenses/by/4.0/); GEBCO Compilation Group (2026) GEBCO 2026 Grid (doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa) (Public domain (GEBCO Grid terms of use), dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/GEBCO_Grid_terms_of_use.pdf); Made with Natural Earth (Public domain, www.naturalearthdata.com/about/terms-of-use/). Not for navigation. Not endorsed by GEBCO, the IHO or the IOC. Made available as is."
- `src/data/odbl/water.json` (ODbL-1.0): rivers, lakes and their names. Notice: "Contains information from OpenStreetMap, openstreetmap.org/copyright, made available under the Open Database License (ODbL) 1.0, opendatacommons.org/licenses/odbl/1-0/"
- `src/data/own/names.json` (grind-strat-own): the names of rivers, lakes and seas over time, with their sources. Notice: "Grind Strat's own work: the names of rivers, lakes and seas over time, each with its source named. Under the game's own terms, not yet chosen. Full source details are in the game's source code (data/sources.md)."
- `src/data/by-sa/terrain-time.json` (CC-BY-SA-4.0): how the land changes from 1250 to today: forest cleared and grown back. Notice: "How the land changes from 1219 to 2021 for Grind Strat, 1 km grid: forest shares at 1425, 1725 and 1900 estimated from pollen, at 2021 from satellite land cover; which places change, and when, placed by a rule. Shared under CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0/). Sources: Forest around 1219: pollen-based land-cover maps by Behnaz Pirzamanbein, from Githumbi, Pirzamanbein et al. (2022) (CC BY-SA 4.0, creativecommons.org/licenses/by-sa/4.0/); © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium (CC BY 4.0, creativecommons.org/licenses/by/4.0/); Marsh and bog: Global Lakes and Wetlands Database v2 (Lehner et al. 2025), hydrosheds.org/products/glwd (CC BY 4.0, creativecommons.org/licenses/by/4.0/); GEBCO Compilation Group (2026) GEBCO 2026 Grid (doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa) (Public domain (GEBCO Grid terms of use), dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/GEBCO_Grid_terms_of_use.pdf); Made with Natural Earth (Public domain, www.naturalearthdata.com/about/terms-of-use/); Forest after 1250: pollen-based land-cover maps (about AD 1250-1600, 1600-1850 and 1850-1950) by Behnaz Pirzamanbein, from Githumbi, Pirzamanbein et al. (2022) (CC BY-SA 4.0, creativecommons.org/licenses/by-sa/4.0/). Not for navigation. Not endorsed by GEBCO, the IHO or the IOC. Made available as is."
- `src/data/by/coast.json` (CC-BY-4.0): the northern coast over time (where the sea stood higher in the game's year). Notice: "The northern coast over time for Grind Strat (Sweden, Åland, Finland, Estonia): where the sea stood higher against today's land since AD 1219, 500 m cells. An estimate: today's land uplift (NKG_RF17vel) bent to fit dated shores from local studies, over GEBCO's heights. Shared under CC BY 4.0 (creativecommons.org/licenses/by/4.0/). Sources: NKG_RF17vel land-uplift model © Nordic Geodetic Commission (NKG) (CC BY 4.0, creativecommons.org/licenses/by/4.0/); GEBCO Compilation Group (2026) GEBCO 2026 Grid (doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa) (Public domain (GEBCO Grid terms of use), dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/GEBCO_Grid_terms_of_use.pdf); Made with Natural Earth (Public domain, www.naturalearthdata.com/about/terms-of-use/). Not for navigation. Not endorsed by GEBCO, the IHO or the IOC. Made available as is."
- `src/data/own/changes.json` (grind-strat-own): the dated facts and drawn shapes of the map over time: reservoirs, cuts and outlets, and the Vistula delta. Notice: "Grind Strat's own work: the dated facts and the drawn shapes (marked "reconstructed") of the map over time. Under the game's own terms, not yet chosen. The sources of each fact are named with it; their full details are in the game's source code (data/sources.md)."

## Datasets

### Natural Earth

- Owner: Natural Earth: made by volunteer cartographers, supported by NACIS (the North American Cartographic Information Society)
- Version: 5.1.2
- Used for: Land, coast, heights and sea depths; the land around 1219: forest, open land, marsh and heath; how the land changes from 1250 to today: forest cleared and grown back; the northern coast over time (where the sea stood higher in the game's year)
- Where we got it: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_land.geojson, https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_rivers_lake_centerlines.geojson, https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_lakes.geojson
- Licence: Public domain, https://www.naturalearthdata.com/about/terms-of-use/
- Licence read at: LICENSE.md at tag v5.1.2 of github.com/nvkelso/natural-earth-vector, the repository of Natural Earth's co-author Nathaniel Vaughn Kelso (the owner's own host).
- Notice: Made with Natural Earth.
- Citation: Natural Earth. Free vector and raster map data @ naturalearthdata.com. Version 5.1.2.
- Changes we made:
  - Land and coast: clipped to the map, moved onto the game's flat map (an equal-area projection) and simplified to about 150 m; islets under about 0.4 km² dropped.
  - Terrain grid: combined with the other terrain sources into one class per 1 km cell by a rule (`src/data/by-sa/README.md` says how).
  - Rivers: clipped to the map, moved onto the game's flat map (an equal-area projection) and simplified to about 200 m. Names repaired where Natural Earth lost letters (Göta älv, Klarälven, Motala ström, Glåma, Kokemäenjoki) or mistyped one (Dnepre, shown as Dnipro like the rest of the river). The Neman shown as Nemunas, the local name Natural Earth also gives. The pieces Natural Earth calls Vorma that are really the lower Glomma and the Gudbrandsdalslågen shown under those names.
  - Lakes: clipped to the map, moved onto the game's flat map (an equal-area projection) and simplified to about 150 m. Every lake on the map reviewed by hand for 1219, whatever Natural Earth's own class says: modern reservoirs left out (not there in 1219), natural lakes kept even where a dam regulates them today. The two halves of the Vistula Lagoon joined under that name; Lake Il'Men' shown as Lake Ilmen; one lake whose names disagree shown unnamed.
  - Land over time: the forest and conifer shares of each later time (pollen for about 1425, 1725 and 1900, WorldCover for 2021) are met 1 km cell by cell from the 1219 grid by a rule, and each cell that changes gets a year of its own (`src/data/by-sa/README.md` says how).
  - Coast over time: combined with the other coast sources into one code per 500 m cell, the year the sea left it, by a rule fitted to dated shores (`src/data/by/README.md` says how). An estimate.
- Held in: `src/data/map/base.json`, `src/data/by-sa/terrain-1219.json`, `src/data/by-sa/terrain-time.json`, `src/data/by/coast.json`, inlined into the game file `dist/grind-strat.html`

### GEBCO

- Owner: GEBCO Compilation Group (the General Bathymetric Chart of the Oceans, under the IHO and the IOC of UNESCO); the grid is archived and published by the British Oceanographic Data Centre (BODC)
- Version: GEBCO_2026 Grid, ice-surface elevation, 15 arc-seconds
- Used for: Land, coast, heights and sea depths; the land around 1219: forest, open land, marsh and heath; how the land changes from 1250 to today: forest cleared and grown back; the northern coast over time (where the sea stood higher in the game's year)
- Where we got it: https://dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/ice_surface_elevation/geotiff/gebco_2026_n90.0_s0.0_w0.0_e90.0_geotiff.tif
- Licence: Public domain (GEBCO Grid terms of use), https://dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/GEBCO_Grid_terms_of_use.pdf
- Licence read at: GEBCO_Grid_terms_of_use.pdf (145,503 bytes, sha256 3d0236bbb239fd1b29a432422e2879754f3ce21d75071ac1bf63929401bbb6bd) and 00README_catalogue_and_licence.txt (CEDA: "Use of these data is covered by the following licence(s): http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ When using these data you must cite them correctly using the citation given on the catalogue record."), both in https://dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/ on dap.ceda.ac.uk, where BODC (GEBCO's Global Center) archives the grid with CEDA: the owner's own host. Read on 6 October 2026. Citation from 00readme.txt there; the short data set reference from GEBCO_Grid_docmentation.pdf (sha256 f3ced9f031ff9c7eaf7ec19fe1137c9f37bb7913591dd1f55560eaf3b7eb5201).
- Notice: GEBCO Compilation Group (2026) GEBCO 2026 Grid (doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa)
- Citation: GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid - a continuous terrain model for oceans and land at 15 arc-second intervals. NERC EDS British Oceanographic Data Centre NOC. doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa
- Changes we made:
  - Clipped to the Baltic map, moved onto the game's flat map (an equal-area projection) and averaged over 2 km cells, rounded to whole metres.
  - Terrain grid: combined with the other terrain sources into one class per 1 km cell by a rule (`src/data/by-sa/README.md` says how).
  - Land over time: the forest and conifer shares of each later time (pollen for about 1425, 1725 and 1900, WorldCover for 2021) are met 1 km cell by cell from the 1219 grid by a rule, and each cell that changes gets a year of its own (`src/data/by-sa/README.md` says how).
  - Coast over time: combined with the other coast sources into one code per 500 m cell, the year the sea left it, by a rule fitted to dated shores (`src/data/by/README.md` says how). An estimate.
- Notes: Not for navigation. Not endorsed by GEBCO, the IHO or the IOC. Made available as is.
- Held in: `src/data/map/base.json`, `src/data/by-sa/terrain-1219.json`, `src/data/by-sa/terrain-time.json`, `src/data/by/coast.json`, inlined into the game file `dist/grind-strat.html`

### SpatioCompo

- Owner: Behnaz Pirzamanbein
- Version: SpatioCompo_entireHolocene, commit 894d44d58f66bb5c273491d98c3ec23a35e6a796, time windows 4, 3, 2 and 1 (about AD 750-1250, 1250-1600, 1600-1850 and 1850-1950)
- Used for: The land around 1219: forest, open land, marsh and heath; how the land changes from 1250 to today: forest cleared and grown back
- Where we got it: https://raw.githubusercontent.com/BehnazP/SpatioCompo_entireHolocene/894d44d58f66bb5c273491d98c3ec23a35e6a796/Land-cover%20Maps/Land_Cover_1000.csv, https://raw.githubusercontent.com/BehnazP/SpatioCompo_entireHolocene/894d44d58f66bb5c273491d98c3ec23a35e6a796/Land-cover%20Maps/Land_Cover_550.csv, https://raw.githubusercontent.com/BehnazP/SpatioCompo_entireHolocene/894d44d58f66bb5c273491d98c3ec23a35e6a796/Land-cover%20Maps/Land_Cover_225.csv, https://raw.githubusercontent.com/BehnazP/SpatioCompo_entireHolocene/894d44d58f66bb5c273491d98c3ec23a35e6a796/Land-cover%20Maps/Land_Cover_50.csv
- Licence: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/
- Licence read at: README.md at commit 894d44d58f66bb5c273491d98c3ec23a35e6a796 of github.com/BehnazP/SpatioCompo_entireHolocene, the author's own repository (owner's own host). Quoted without its HTML tags.
- Notice: Forest around 1219 and how it changes after 1250: pollen-based land-cover maps of four time windows (about AD 750-1250, 1250-1600, 1600-1850 and 1850-1950) by Behnaz Pirzamanbein, from Githumbi, Pirzamanbein et al. (2022).
- Citation: Githumbi, E., Pirzamanbein, B., et al. (2022) Pollen-Based Maps of Past Regional Vegetation Cover in Europe Over 12 Millennia - Evaluation and Potential. Frontiers in Ecology and Evolution 10:795794. doi:10.3389/fevo.2022.795794
- Changes we made:
  - Time window 4 (about AD 750-1250) only, unblended; the 1 degree cells that touch the Baltic map kept as they are.
  - Terrain grid: combined with the other terrain sources into one class per 1 km cell by a rule (`src/data/by-sa/README.md` says how).
  - Land over time: the forest and conifer shares of each later time (pollen for about 1425, 1725 and 1900, WorldCover for 2021) are met 1 km cell by cell from the 1219 grid by a rule, and each cell that changes gets a year of its own (`src/data/by-sa/README.md` says how).
  - Time window 3 (about AD 1250-1600) only, unblended; the 1 degree cells that touch the Baltic map kept as they are. Its forest and conifer shares set the quotas of one forest anchor; which 1 km cells change, and in which year, is a rule (see the terrain-time block).
  - Time window 2 (about AD 1600-1850) only, unblended; the 1 degree cells that touch the Baltic map kept as they are. Its forest and conifer shares set the quotas of one forest anchor; which 1 km cells change, and in which year, is a rule (see the terrain-time block).
  - Time window 1 (about AD 1850-1950) only, unblended; the 1 degree cells that touch the Baltic map kept as they are. Its forest and conifer shares set the quotas of one forest anchor; which 1 km cells change, and in which year, is a rule (see the terrain-time block).
- Held in: `src/data/by-sa/terrain-1219.json`, `src/data/by-sa/terrain-time.json`, inlined into the game file `dist/grind-strat.html`

### ESA WorldCover

- Owner: European Space Agency (ESA) and the ESA WorldCover consortium
- Version: v200 (2021)
- Used for: The land around 1219: forest, open land, marsh and heath; how the land changes from 1250 to today: forest cleared and grown back
- Where we got it: https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif
- Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- Licence read at: Product User Manual V2.0 (WorldCover_PUM_V2.0.pdf, section 5.1 License and 5.2 Citation, page 19), on ESA WorldCover's own official bucket esa-worldcover.s3.eu-central-1.amazonaws.com: the owner's own host.
- Notice: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium
- Citation: Zanaga, D., Van De Kerchove, R., Daems, D., De Keersmaecker, W., Brockmann, C., Kirches, G., Wevers, J., Cartus, O., Santoro, M., Fritz, S., Lesiv, M., Herold, M., Tsendbazar, N.E., Xu, P., Ramoino, F., Arino, O., 2022. ESA WorldCover 10 m 2021 v200. doi:10.5281/zenodo.7254221
- Changes we made:
  - Read from the tiles' 74 m overviews, clipped to the Baltic map, moved onto the game's flat map (an equal-area projection) and turned into the share of each class in 1 km cells; snow merged into bare ground and mangrove into wetland. For the marsh around 1219, the herbaceous wetland share (class 90; moss and lichen, class 100, left out as mountain tundra) is combined with GLWD v2 marsh: each cell keeps the larger of the two, after GLWD shares at or below 15% are dropped and shares from 15% to 55% stretched to 0-100%.
  - Terrain grid: combined with the other terrain sources into one class per 1 km cell by a rule (`src/data/by-sa/README.md` says how).
  - Land over time: the forest and conifer shares of each later time (pollen for about 1425, 1725 and 1900, WorldCover for 2021) are met 1 km cell by cell from the 1219 grid by a rule, and each cell that changes gets a year of its own (`src/data/by-sa/README.md` says how).
- Held in: `src/data/by-sa/terrain-1219.json`, `src/data/by-sa/terrain-time.json`, inlined into the game file `dist/grind-strat.html`

### GLWD v2

- Owner: Bernhard Lehner and co-authors (2025), published by HydroSHEDS
- Version: 2.0
- Used for: The land around 1219: forest, open land, marsh and heath; how the land changes from 1250 to today: forest cleared and grown back
- Where we got it: https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/cboettig/wetlands/GLWD_v2_0/GLWD_v2_0_area_by_class_pct/GLWD_v2_0_class_{NN}_pct.tif. This is an unofficial copy: Carl Boettiger, on Source Cooperative (AWS S3, us-west-2, cboettig/wetlands/GLWD_v2_0/): the per-class percent GeoTIFFs, legend and TechDoc. The TechDoc is byte-identical to the official one; the data TIFFs were not compared with the official download.
- Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- Licence read at: Section 4.1 of GLWD_TechDoc_v2_0.pdf at https://data.hydrosheds.org/file/hydrobasins/GLWD_TechDoc_v2_0.pdf, on HydroSHEDS' own host (the owner's host), read on 6 October 2026: md5 3fbf94b5b6c175dc0cd795eecb4b9ee5, sha256 55c0b22ef0b619da2f6a25239d05df51ac467cf5c959666ababa2d966a30efe8, the same file as the copy on Source Cooperative. 4.2 disclaims all warranty ("as is"); 4.3 limits liability; 4.4 gives the citation.
- Notice: Marsh and bog: Global Lakes and Wetlands Database v2 (Lehner et al. 2025), hydrosheds.org/products/glwd
- Citation: Lehner, B., Anand, M., Fluet-Chouinard, E., Tan, F., Aires, F., Allen, G.H., Bousquet, P., Canadell, J.G., Davidson, N., Ding, M., Finlayson, C.M., Gumbricht, T., Hilarides, L., Hugelius, G., Jackson, R.B., Korver, M.C., Liu, L., McIntyre, P.B., Matthews, E., Nagy, S., Olefeldt, D., Pavelsky, T.M., Pekel, J.-F., Poulter, B., Prigent, C., Wang, J., Worthington, T.A., Yamazaki, D., Zhang, X., Thieme, M. (2025). Mapping the world's inland surface waters: an upgrade to the Global Lakes and Wetlands Database (GLWD v2). Earth System Science Data. Data doi:10.6084/m9.figshare.28519994
- Changes we made:
  - Wetland classes 8-19, 22-25 and 29-31 added up (capped at 100%), clipped to the Baltic map, moved onto the game's flat map (an equal-area projection) and averaged over 1 km cells. Shares at or below 15% dropped as background; shares from 15% to 55% stretched in a straight line to 0-100% marsh, and 55% or more read as full marsh. Combined with today's herbaceous wetland (class 90) from ESA WorldCover 2021: each cell keeps the larger of the two.
  - Terrain grid: combined with the other terrain sources into one class per 1 km cell by a rule (`src/data/by-sa/README.md` says how).
  - Land over time: the forest and conifer shares of each later time (pollen for about 1425, 1725 and 1900, WorldCover for 2021) are met 1 km cell by cell from the 1219 grid by a rule, and each cell that changes gets a year of its own (`src/data/by-sa/README.md` says how).
- Held in: `src/data/by-sa/terrain-1219.json`, `src/data/by-sa/terrain-time.json`, inlined into the game file `dist/grind-strat.html`

### OpenStreetMap contributors

- Owner: OpenStreetMap contributors; published by the Overture Maps Foundation
- Version: Overture release 2026-09-23.1 (OpenStreetMap data of September 2026)
- Used for: Rivers, lakes and their names
- Where we got it: https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-09-23.1/theme=base/type=water/
- Licence: Open Database License (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/
- Licence read at: OpenStreetMap: config/locales/en.yml, keys en.site.copyright.legal_babble.licensing_1_html to credit_4_v2025_html (lines 2483 to 2531), the English text of openstreetmap.org/copyright, at commit 31bc4cd72e26c70e1f453f202850aadae7c494e2 of github.com/openstreetmap/openstreetmap-website (the OpenStreetMap Foundation's own repository of the openstreetmap.org website), read through raw.githubusercontent.com on 6 October 2026 and read again on 7 October 2026 (still the latest commit). Overture: docs/attribution.mdx and docs/_generated_attribution.mdx (section Base) at commit f7030ca41d6ce4c31277e44762a4af00ddde80b3 of github.com/OvertureMaps/docs (the Overture Maps Foundation's own documentation repository, published at docs.overturemaps.org), read through raw.githubusercontent.com on 7 October 2026. Every row read carries sources[].license = ODbL-1.0. The %{...} placeholders of the YAML and the Markdown links are shown as [their link texts].
- Notice: Rivers, lakes and their names: © OpenStreetMap contributors, Overture Maps Foundation. Open Database License: openstreetmap.org/copyright
- Citation: OpenStreetMap contributors. OpenStreetMap data as published by the Overture Maps Foundation, overturemaps.org (release 2026-09-23.1, accessed 7 October 2026). openstreetmap.org
- Changes we made: Rivers and lakes: filtered to named rivers (at least 50 km on the map, or 15 km with a Wikidata id) and named natural lakes (at least 1 km², or 0.5 km² with a Wikidata id); river ways joined into rivers by OpenStreetMap's river relations; modern reservoirs and lakes made after 1219 found by their OpenStreetMap tags and a reviewed list, and shipped only where they have a year (from our own dated list, or from OpenStreetMap's start_date), tagged so the map shows them from that year; a few dated river stretches (the Vistula's 1895 cut, the Lielupe's mouth of 1755) split out and tagged the same way, and two short rivers kept for the old courses; lakes mapped twice inside a bigger lake left out; moved onto the game's flat map (an equal-area projection), rounded to 100 m and simplified for three zoom levels. Names shown on the map: Russian, Belarusian and Ukrainian names written in Latin letters (BGN/PCGN, with the soft and hard signs and the apostrophe left out); one name shown where OpenStreetMap gives a name in two languages; abbreviations such as "ež." left out; each river named by its name at its lower end. OpenStreetMap's own names are kept in the data.
- Held in: `src/data/odbl/water.json`, inlined into the game file `dist/grind-strat.html`

### Grind Strat

- Owner: Grind Strat
- Version: M3a (October 2026)
- Used for: The names of rivers, lakes and seas over time, with their sources; the dated facts and drawn shapes of the map over time: reservoirs, cuts and outlets, and the Vistula delta
- Where we got it: https://github.com/syncronizator1995-droid/grind-strat/tree/main/src/data/own
- Licence: Grind Strat's own terms (not yet chosen), https://github.com/syncronizator1995-droid/grind-strat/blob/main/src/data/own/LICENSE.md
- Licence read at: src/data/own/LICENSE.md in this repository: our own work, so its terms are ours to set.
- Notice: Dated facts, drawn shapes (marked reconstructed) and the names of rivers, lakes and seas over time: Grind Strat's own work, from the sources named with each.
- Citation: Grind Strat, the dated list of water works and other changes, its drawn shapes, and the names of rivers, lakes and seas over time (M3a, October 2026). Sources of each fact in data/sources.md.
- Changes we made: Our own work: years and facts read from the sources named with each, and shapes drawn by us on public-domain heights and land (GEBCO_2026 heights and sea depths, and Natural Earth's land); the Vistula delta's (Żuławy) marsh before diking is the low ground outlined on GEBCO_2026's heights, and its 1 km cells those 5 m or lower in the base block's heights (from GEBCO); years still to check are marked TO CHECK. The names of rivers, lakes and seas over time are forms read in the chronicles and other texts named with each; the Latin-letter spelling of an Old East Slavic form follows the BGN/PCGN Russian table after plain spelling changes; the rough outlines of the Gulf of Riga and the Gulf of Finland are drawn by us (marked TO CHECK) after the limits in the IHO's Limits of Oceans and Seas (1953).
- Held in: `src/data/own/names.json`, `src/data/own/changes.json`, inlined into the game file `dist/grind-strat.html`

### NKG

- Owner: Nordic Geodetic Commission (NKG)
- Version: NKG_RF17vel (file of 2020-11-04)
- Used for: The northern coast over time (where the sea stood higher in the game's year)
- Where we got it: https://raw.githubusercontent.com/OSGeo/PROJ-data/1.25.0/eur_nkg/eur_nkg_nkgrf17vel.tif. This is an unofficial copy: Fetched from PROJ-data (OSGeo's package of grids for the PROJ software, release 1.25.0), which is byte-identical to the file on the NKG's own site.
- Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- Licence read at: Inside the file itself, as the NKG publishes it on its own site (www.nordicgeodeticcommission.com/wp-content/uploads/2025/06/eur_nkg_nkgrf17vel.tif, linked from www.nordicgeodeticcommission.com/products/, read on 12 October 2026; byte-identical to the PROJ-data copy fetched here): its TIFF copyright tag (33432). Also PROJ-data's eur_nkg_README.txt at tag 1.25.0 (raw.githubusercontent.com/OSGeo/PROJ-data/1.25.0/eur_nkg/eur_nkg_README.txt), and the README of the NKG's own repository github.com/NordicGeodesy/NordicTransformations (which holds the NKG's older models, not this one), which licenses all its files CC BY 4.0 and names the NKG as the rights holder to credit.
- Notice: NKG_RF17vel land-uplift model © Nordic Geodetic Commission (NKG).
- Citation: Nordic Geodetic Commission (2020). NKG_RF17vel velocity model (eur_nkg_nkgrf17vel.tif), used in the NKG2020 transformation: An Updated Transformation between Dynamic and Static Reference Frames in the Nordic and Baltic Countries, Journal of Geodetic Science, doi:10.1515/jogs-2022-0155.
- Changes we made:
  - Only the up (vertical) velocity is used, read with bilinear interpolation onto 500 m cells of the game's flat map, to estimate how fast the sea has fallen against the land since 1219.
  - Coast over time: combined with the other coast sources into one code per 500 m cell, the year the sea left it, by a rule fitted to dated shores (`src/data/by/README.md` says how). An estimate.
- Held in: `src/data/by/coast.json`, inlined into the game file `dist/grind-strat.html`

## Font

### Grenze Gotisch (font)

- Owner: Omnibus-Type, The Grenze Gotisch Project Authors
- Used for: The game's title and date
- Where we got it: https://github.com/google/fonts/tree/main/ofl/grenzegotisch
- Licence: SIL Open Font License 1.1, https://scripts.sil.org/OFL (full text in `src/ui/fonts/OFL.txt`)
- Notice: Copyright 2020 The Grenze Gotisch Project Authors (github.com/Omnibus-Type/Grenze-Gotisch)
- Changes we made: Cut down to Latin and Latin Extended letters and saved in a compact web font format.
- Held in: `src/ui/fonts/grenze-gotisch.woff2`, inlined into the game file `dist/grind-strat.html`

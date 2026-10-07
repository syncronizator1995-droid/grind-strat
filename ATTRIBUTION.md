# Attribution

Grind Strat's map is made from the open data below. This file is written by
`tools/map/attribution.mjs` from `tools/map/sources.json` (run `npm run attribution`); do not edit it by
hand. The game shows the same credits on its Credits sheet, and a short credit line on the map.

## Which licence covers which folder

- `src/data/by-sa/`: Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0): the 1219 terrain grid (see its LICENSE.md and README.md).
- `src/data/map/`: Public domain data: Natural Earth (land, coast, rivers and lakes) and GEBCO (GEBCO asks to be credited; not for navigation).
- `src/ui/fonts/`: SIL Open Font License 1.1: the Grenze Gotisch font (see OFL.txt there).
- `everything else`: The code and the rest of the repository are under the repository's own licence (see README.md).

The game's combined data bundle (the way the blocks are put together in the game file) is also offered
under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). No OpenStreetMap data ships yet.

All data is used as it is, with no warranty. No data provider endorses this game. The GEBCO grid
is not for navigation or any other purpose involving safety at sea.

## The data blocks in the game

- `src/data/map/base.json` (public-domain): land, coast, heights and sea depths. Notice: "Land, coast, heights and sea depths for Grind Strat. Sources: Made with Natural Earth (Public domain, www.naturalearthdata.com/about/terms-of-use/); GEBCO Compilation Group (2026) GEBCO 2026 Grid (doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa) (Public domain (GEBCO Grid terms of use), dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/GEBCO_Grid_terms_of_use.pdf). Not for navigation. Not endorsed by GEBCO, the IHO or the IOC. Made available as is."
- `src/data/by-sa/terrain-1219.json` (CC-BY-SA-4.0): the land around 1219: forest, open land, marsh and heath. Notice: "The land around AD 1219 for Grind Strat, 1 km grid: forest share estimated from pollen, edges placed by a rule; marsh from today's peat-soil and wetland maps plus today's open bogs. Shared under CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0/). Sources: Forest around 1219: pollen-based land-cover maps by Behnaz Pirzamanbein, from Githumbi, Pirzamanbein et al. (2022) (CC BY-SA 4.0, creativecommons.org/licenses/by-sa/4.0/); © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium (CC BY 4.0, creativecommons.org/licenses/by/4.0/); Marsh and bog: Global Lakes and Wetlands Database v2 (Lehner et al. 2025), hydrosheds.org/products/glwd (CC BY 4.0, creativecommons.org/licenses/by/4.0/); GEBCO Compilation Group (2026) GEBCO 2026 Grid (doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa) (Public domain (GEBCO Grid terms of use), dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/GEBCO_Grid_terms_of_use.pdf); Made with Natural Earth (Public domain, www.naturalearthdata.com/about/terms-of-use/). Not for navigation. Not endorsed by GEBCO, the IHO or the IOC. Made available as is."
- `src/data/map/water-ne.json` (public-domain): rivers, lakes and their names. Notice: "Rivers and lakes for Grind Strat around AD 1219: Natural Earth's 1:10m set, with modern reservoirs left out and natural lakes kept, by a reviewed list. Sources: Made with Natural Earth (Public domain, www.naturalearthdata.com/about/terms-of-use/)."

## Datasets

### Natural Earth

- Owner: Natural Earth: made by volunteer cartographers, supported by NACIS (the North American Cartographic Information Society)
- Version: 5.1.2
- Used for: Land, coast, heights and sea depths; the land around 1219: forest, open land, marsh and heath; rivers, lakes and their names
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
- Held in: `src/data/map/base.json`, `src/data/by-sa/terrain-1219.json`, `src/data/map/water-ne.json`, inlined into the game file `dist/grind-strat.html`

### GEBCO

- Owner: GEBCO Compilation Group (the General Bathymetric Chart of the Oceans, under the IHO and the IOC of UNESCO); the grid is archived and published by the British Oceanographic Data Centre (BODC)
- Version: GEBCO_2026 Grid, ice-surface elevation, 15 arc-seconds
- Used for: Land, coast, heights and sea depths; the land around 1219: forest, open land, marsh and heath
- Where we got it: https://dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/ice_surface_elevation/geotiff/gebco_2026_n90.0_s0.0_w0.0_e90.0_geotiff.tif
- Licence: Public domain (GEBCO Grid terms of use), https://dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/GEBCO_Grid_terms_of_use.pdf
- Licence read at: GEBCO_Grid_terms_of_use.pdf (145,503 bytes, sha256 3d0236bbb239fd1b29a432422e2879754f3ce21d75071ac1bf63929401bbb6bd) and 00README_catalogue_and_licence.txt (CEDA: "Use of these data is covered by the following licence(s): http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ When using these data you must cite them correctly using the citation given on the catalogue record."), both in https://dap.ceda.ac.uk/bodc/gebco/global/gebco_2026/ on dap.ceda.ac.uk, where BODC (GEBCO's Global Center) archives the grid with CEDA: the owner's own host. Read on 6 October 2026. Citation from 00readme.txt there; the short data set reference from GEBCO_Grid_docmentation.pdf (sha256 f3ced9f031ff9c7eaf7ec19fe1137c9f37bb7913591dd1f55560eaf3b7eb5201).
- Notice: GEBCO Compilation Group (2026) GEBCO 2026 Grid (doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa)
- Citation: GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid - a continuous terrain model for oceans and land at 15 arc-second intervals. NERC EDS British Oceanographic Data Centre NOC. doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa
- Changes we made:
  - Clipped to the Baltic map, moved onto the game's flat map (an equal-area projection) and averaged over 2 km cells, rounded to whole metres.
  - Terrain grid: combined with the other terrain sources into one class per 1 km cell by a rule (`src/data/by-sa/README.md` says how).
- Notes: Not for navigation. Not endorsed by GEBCO, the IHO or the IOC. Made available as is.
- Held in: `src/data/map/base.json`, `src/data/by-sa/terrain-1219.json`, inlined into the game file `dist/grind-strat.html`

### SpatioCompo

- Owner: Behnaz Pirzamanbein
- Version: SpatioCompo_entireHolocene, commit 894d44d58f66bb5c273491d98c3ec23a35e6a796, time window 4 (about AD 750-1250)
- Used for: The land around 1219: forest, open land, marsh and heath
- Where we got it: https://raw.githubusercontent.com/BehnazP/SpatioCompo_entireHolocene/894d44d58f66bb5c273491d98c3ec23a35e6a796/Land-cover%20Maps/Land_Cover_1000.csv
- Licence: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/
- Licence read at: README.md at commit 894d44d58f66bb5c273491d98c3ec23a35e6a796 of github.com/BehnazP/SpatioCompo_entireHolocene, the author's own repository (owner's own host). Quoted without its HTML tags.
- Notice: Forest around 1219: pollen-based land-cover maps by Behnaz Pirzamanbein, from Githumbi, Pirzamanbein et al. (2022).
- Citation: Githumbi, E., Pirzamanbein, B., et al. (2022) Pollen-Based Maps of Past Regional Vegetation Cover in Europe Over 12 Millennia - Evaluation and Potential. Frontiers in Ecology and Evolution 10:795794. doi:10.3389/fevo.2022.795794
- Changes we made:
  - Time window 4 (about AD 750-1250) only, unblended; the 1 degree cells that touch the Baltic map kept as they are.
  - Terrain grid: combined with the other terrain sources into one class per 1 km cell by a rule (`src/data/by-sa/README.md` says how).
- Held in: `src/data/by-sa/terrain-1219.json`, inlined into the game file `dist/grind-strat.html`

### ESA WorldCover

- Owner: European Space Agency (ESA) and the ESA WorldCover consortium
- Version: v200 (2021)
- Used for: The land around 1219: forest, open land, marsh and heath
- Where we got it: https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif
- Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- Licence read at: Product User Manual V2.0 (WorldCover_PUM_V2.0.pdf, section 5.1 License and 5.2 Citation, page 19), on ESA WorldCover's own official bucket esa-worldcover.s3.eu-central-1.amazonaws.com: the owner's own host.
- Notice: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium
- Citation: Zanaga, D., Van De Kerchove, R., Daems, D., De Keersmaecker, W., Brockmann, C., Kirches, G., Wevers, J., Cartus, O., Santoro, M., Fritz, S., Lesiv, M., Herold, M., Tsendbazar, N.E., Xu, P., Ramoino, F., Arino, O., 2022. ESA WorldCover 10 m 2021 v200. doi:10.5281/zenodo.7254221
- Changes we made:
  - Read from the tiles' 74 m overviews, clipped to the Baltic map, moved onto the game's flat map (an equal-area projection) and turned into the share of each class in 1 km cells; snow merged into bare ground and mangrove into wetland. For the marsh around 1219, the herbaceous wetland share (class 90; moss and lichen, class 100, left out as mountain tundra) is combined with GLWD v2 marsh: each cell keeps the larger of the two, after GLWD shares at or below 15% are dropped and shares from 15% to 55% stretched to 0-100%.
  - Terrain grid: combined with the other terrain sources into one class per 1 km cell by a rule (`src/data/by-sa/README.md` says how).
- Held in: `src/data/by-sa/terrain-1219.json`, inlined into the game file `dist/grind-strat.html`

### GLWD v2

- Owner: Bernhard Lehner and co-authors (2025), published by HydroSHEDS
- Version: 2.0
- Used for: The land around 1219: forest, open land, marsh and heath
- Where we got it: https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/cboettig/wetlands/GLWD_v2_0/GLWD_v2_0_area_by_class_pct/GLWD_v2_0_class_{NN}_pct.tif. This is an unofficial copy: Carl Boettiger, on Source Cooperative (AWS S3, us-west-2, cboettig/wetlands/GLWD_v2_0/): the per-class percent GeoTIFFs, legend and TechDoc. The TechDoc is byte-identical to the official one; the data TIFFs were not compared with the official download.
- Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- Licence read at: Section 4.1 of GLWD_TechDoc_v2_0.pdf at https://data.hydrosheds.org/file/hydrobasins/GLWD_TechDoc_v2_0.pdf, on HydroSHEDS' own host (the owner's host), read on 6 October 2026: md5 3fbf94b5b6c175dc0cd795eecb4b9ee5, sha256 55c0b22ef0b619da2f6a25239d05df51ac467cf5c959666ababa2d966a30efe8, the same file as the copy on Source Cooperative. 4.2 disclaims all warranty ("as is"); 4.3 limits liability; 4.4 gives the citation.
- Notice: Marsh and bog: Global Lakes and Wetlands Database v2 (Lehner et al. 2025), hydrosheds.org/products/glwd
- Citation: Lehner, B., Anand, M., Fluet-Chouinard, E., Tan, F., Aires, F., Allen, G.H., Bousquet, P., Canadell, J.G., Davidson, N., Ding, M., Finlayson, C.M., Gumbricht, T., Hilarides, L., Hugelius, G., Jackson, R.B., Korver, M.C., Liu, L., McIntyre, P.B., Matthews, E., Nagy, S., Olefeldt, D., Pavelsky, T.M., Pekel, J.-F., Poulter, B., Prigent, C., Wang, J., Worthington, T.A., Yamazaki, D., Zhang, X., Thieme, M. (2025). Mapping the world's inland surface waters: an upgrade to the Global Lakes and Wetlands Database (GLWD v2). Earth System Science Data. Data doi:10.6084/m9.figshare.28519994
- Changes we made:
  - Wetland classes 8-19, 22-25 and 29-31 added up (capped at 100%), clipped to the Baltic map, moved onto the game's flat map (an equal-area projection) and averaged over 1 km cells. Shares at or below 15% dropped as background; shares from 15% to 55% stretched in a straight line to 0-100% marsh, and 55% or more read as full marsh. Combined with today's herbaceous wetland (class 90) from ESA WorldCover 2021: each cell keeps the larger of the two.
  - Terrain grid: combined with the other terrain sources into one class per 1 km cell by a rule (`src/data/by-sa/README.md` says how).
- Held in: `src/data/by-sa/terrain-1219.json`, inlined into the game file `dist/grind-strat.html`

## Font

### Grenze Gotisch (font)

- Owner: Omnibus-Type, The Grenze Gotisch Project Authors
- Used for: The game's title and date
- Where we got it: https://github.com/google/fonts/tree/main/ofl/grenzegotisch
- Licence: SIL Open Font License 1.1, https://scripts.sil.org/OFL (full text in `src/ui/fonts/OFL.txt`)
- Notice: Copyright 2020 The Grenze Gotisch Project Authors (github.com/Omnibus-Type/Grenze-Gotisch)
- Changes we made: Cut down to Latin and Latin Extended letters and saved in a compact web font format.
- Held in: `src/ui/fonts/grenze-gotisch.woff2`, inlined into the game file `dist/grind-strat.html`

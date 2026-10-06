# Grind Strat: handoff for Claude Code

Written on 6 October 2026 by Claude in a claude.ai chat, for Claude Code working with Ignas on his PC.
Updated 6 October 2026 in Claude Code with Ignas's answers; see docs/LEVELS.md. Updated again the
same day with his step 2 answers and the approved step 2a plan.

This file says what to build first and how to know it is right. It covers:

- Step 1: setting up the project.
- Step 2: the map, in two parts: 2a (the map itself, with a time slider) and 2b (the 1219
  provinces and holdings).
- Step 3: the Middle Ages, dynasty and realm, on the real map, in three parts (3a, 3b, 3c).

It also explains the prototype code you inherit, what comes after step 3, and the main risks.
CLAUDE.md loads by itself. Read docs/DESIGN.md, docs/LEVELS.md, docs/ARCHITECTURE.md and
docs/CONVERSATION.md before planning.

Golden rule: plan each step with Ignas in plan mode and wait for his OK before writing game code.

---

## 0. The game in one minute

Grind Strat is a slow, deep grand strategy game for phones, in English, in portrait, offline.
You follow the Baltic lands from 10,000 BC to today:

| Age | Years | You play | Feels like |
| --- | --- | --- | --- |
| First hunters | 10,000 BC to about 5000 BC | One hunter and a small band, hands-on | Far Cry Primal, top-down 2D |
| Crafts, farms and amber | About 5000 BC to 100 AD | Your people: customs, beliefs, crafts, lands | Your own design |
| Tribes and hillforts | About 100 AD to about 1200 | Your tribe among rival tribes | Your own design |
| Grand Duchy and Middle Ages | About 1200 to 1569 | A dynasty, one ruler at a time | Crusader Kings 3 |
| Commonwealth and gunpowder | 1569 to 1795 | The country | Europa Universalis 4 |
| Empires and revolutions | 1795 to 1918 | The country, or its fight for freedom | Europa Universalis 4, Hearts of Iron 4 |
| World wars to today | 1918 to today | The country | Hearts of Iron 4 |

Before about 1200 the history is the player's to write; outsiders only trade and raid.
From the crusades on, history follows its real course unless the player changes it.

Ignas's priorities, in his order: 1. dynasty and intrigue, 2. realm and diplomacy,
3. war, supply and fronts, 4. towns. Battles are real-time like Total War but deeper.
His words: "slow but everything", "everything in one".

The layers feed each other in a loop:

```
Your people and intrigue (tribe, dynasty, then country)
   | heirs, marriages, laws
   v
Realm and diplomacy (land, vassals, faith, allies)
   | land, people, protection
   v
Towns (fields, iron, horses, trade)
   | food, weapons, horses
   v
War, supply and fronts (armies, supply, seasons)
   | fed or hungry troops, the season
   v
Battles (real-time fights you command)
   | deaths, captives, fame
   +--------> back to Your people
```

A bad harvest in your town means hungry soldiers, a lost battle, and perhaps a dead heir.

Build order (Ignas can reorder it at any time):

1. Agree the design (done, but it stays open).
2. The map, in two parts, each ending playable on Ignas's phone:
   - 2a: the map itself: coasts, rivers, lakes, painted terrain, a time slider, names that change
     with the time, a Credits screen and a speed test (planned and approved);
   - 2b: the 1219 provinces and holdings, region by region, starting with a pilot (planned with
     Ignas after 2a).
3. Middle Ages: dynasty and realm, in three parts, each ending playable on Ignas's phone:
   - 3a: the real map, characters, family, succession and titles, on a rewritten engine;
   - 3b: diplomacy, vassals with fine-grained terms, faith, one faction type (a relative claiming
     your throne), and the goals of the Orders and the Golden Horde;
   - 3c: harvests and the full market.
4. Middle Ages: intrigue, with the council and spymaster.
5. Middle Ages: war.
6. Middle Ages: battles.
7. Middle Ages: towns.
8. The first hunters.
9. Your tribe's story.
10. Commonwealth and gunpowder.
11. Empires and revolutions.
12. World wars to today.

The Middle Ages come first because dynasty and intrigue, Ignas's top priority, live there,
and the prototype engine already covers much of them (as ideas, and what its tests checked: the
engine itself is rewritten in 3a, and its code and test files weren't uploaded).

---

## 1. Step 1: project setup (first session)

Goal: an empty but working project that builds one offline file and runs tests. No game features yet.
Show Ignas the folder layout and tool choices in plan mode first, then build it.

Status: done. Built and tested in Claude Code on 6 October 2026, merged, published on GitHub Pages,
and Ignas played it on his phone the same day: "it seems to work perfectly fine".
What was built, beyond the list below:
- Dev dependencies: esbuild, typescript and playwright, plus @types/node (type definitions only,
  needed so the type check understands the Node scripts in tools/ and test/).
- Pausing autosaves, and so do Load and New game. At the top speeds autosaves are at most one every
  2 real seconds, but a month that passes inside that gap is saved as soon as it ends.
- New game needs two separate taps (a double tap counts as one).
- The offline copy: the service worker loads the page network first, opens the saved copy after
  3 seconds of weak signal, and keeps a second copy in IndexedDB. All of Ignas's GitHub Pages apps
  share one web address (syncronizator1995-droid.github.io), so they share Cache Storage, and the
  service workers of Campfire (Guitar repo) and Cal Track delete every cache but their own when
  they update. Saves are safe (localStorage keys are separate). Fixing those two apps to delete
  only their own caches is a one-line change in each. Ignas said yes, and Claude made the fix in
  pull requests in his Guitar, cal_track and cal_track.2.0 repos.
- npm run shots checks, served like GitHub Pages: no signal, weak signal, caches wiped by another
  app, and an update arriving.

1. Create the folders from CLAUDE.md: src/sim, src/ui, src/data, tools, test, prototype, docs, dist.
2. package.json with the scripts build, test, soak, check, shots. Keep dev dependencies few:
   - esbuild, to bundle src/ into one script;
   - typescript, for type checking only (checkJs, noEmit);
   - playwright, for phone screenshots.
   Tests use Node's built-in test runner (node:test), so no test framework is needed.
3. tools/build.mjs:
   - bundles src/ui/main.js, which imports src/sim, with esbuild (format iife; minify for release builds);
   - reads src/ui/index.html (the page shell), src/ui/style.css, the font (base64) and the data JSON;
   - inlines everything into dist/grind-strat.html;
   - fails if script text contains "</script", or if the page would fetch anything over the network;
   - prints the file size.
4. A hello screen: the date, a speed control (pause plus five speeds), an empty canvas, and a save and
   load round trip through localStorage, wrapped in try/catch.
   - Speeds: 2, 5, 12 and 30 days a second, then as fast as the phone allows.
   - Autosave on the first day of every game month and when the app is hidden or closed, plus Save,
     Load and New game buttons. Every storage access is wrapped, so blocked storage shows a message.
   - Colours follow the phone's light or dark setting.
   - The save is plain JSON: {"version":1,"seed":<int>,"rng":[4 uint32],"day":<int>}. One seeded
     random generator (sfc32, seeded through splitmix32) keeps its 4-number state in the save.
   - "day" counts days since 1 January 1 AD in 365-day years with no leap days. Days before 1 AD are
     negative, and there is no year 0 (1 BC comes right before 1 AD). The campaign starts on
     1 January 1219. Details in docs/ARCHITECTURE.md.
5. Tests: one trivial sim test, the skeleton of the invariant checker, the skeleton of the soak runner.
6. Put the prototype (shipped with this handoff) into prototype/. Only part of it was uploaded:
   see section 4.
7. Copy the sources list into data/sources.md, with the font added.
8. Put the project on GitHub and serve the game with GitHub Pages so Ignas can open it on his phone,
   the same way he runs his Campfire app. Ignas chose to make the repo public for this.
9. Install like an app (Ignas asked for it), the way his Campfire app in his Guitar repo does:
   - a web manifest, a service worker, and icons with a blackletter "G";
   - an Install button when the phone offers it (on an iPhone, a tip: Share, then Add to Home Screen);
   - the game itself stays one self-contained offline file, and plays the same without these.
10. The font: Grenze Gotisch from Google Fonts' GitHub, cut to Latin and Latin Extended letters
    (so Ž, ė, ą, ł, ā and õ show), with its licence file beside it.
11. The design pages: docs/LEVELS.md (what you do at each level of play, and how the levels
    connect), docs/ARCHITECTURE.md (the technical rules), and research notes in docs/research/
    (ChatGPT's review word for word, and notes on Paradox-style games).

Done when: npm run build makes the file, it opens on Ignas's phone, and npm test passes. Also: it
installs to his home screen, opens with no signal, and an autosave survives closing and reopening.

---

## 2. Step 2: the map (2a), then the 1219 lands (2b)

### Why this comes first

The design promises a historically accurate map from the ice age to today. Every later system sits
on this map: provinces, armies, supply, towns and the hunter opening. Province ids, neighbours,
holdings and terrain feed dynasties (3a), wars (5), battles (6) and towns (7). Changing the map
later breaks saves and history data, so it is done carefully.

### Ignas's answers for step 2 (6 October 2026)

Research (six researchers, a draft plan and two reviewers) showed step 2 is too big for one go.
Ignas answered three rounds of questions, then approved the step 2a plan:

| Topic | His choice |
| --- | --- |
| Step 2 | Split into 2a (the map) and 2b (the 1219 provinces and holdings) |
| Lithuania's provinces | Lands and castle districts named in 14th-century sources, each showing the year it was first mentioned |
| Ice-age maps | Built properly in step 8 (the hunters); 2a gives sourced notes and a rough preview |
| South edge | 50°N: Volhynia on the map, Galicia just off the edge in less detail |
| Licences | Free forever, so share-alike data (like OpenStreetMap) is allowed |
| File size | No limit; the real test is how fast the map opens on his phone |
| Blocked data | He allows sites, but only when a milestone needs one: Claude stops and asks for that one site |
| His phone | Android |
| Terrain grid | A 1 km terrain map for every province now; battle and town maps made finer later |
| Names on the map | Names of the time, changing with the time slider |
| Unsure borders | Guessed borders look softer than sourced ones |

After the questions he wrote: "The names on the map should chage with the time and ask me to allow
sites once needed".

**What these change in this section's earlier plan:**
- Step 2 is two steps, 2a and 2b, each ending playable on his phone.
- The area is decided (it said "agree the exact box with Ignas").
- The projection is EPSG:3035's formula centred on the Baltic, not plain EPSG:3035.
- A 1 km terrain map replaces "a small terrain grid per province, for example 32 by 32".
- No hard size limit replaces "under about 500 KB of map JSON".
- The five ice-age slices are done properly in step 8, not in step 2. 2a gives a rough preview.
- Names of the time, changing with the slider. The research had proposed today's local names.
- Share-alike data is allowed. The research had recommended avoiding it.

### 2a: the map

Status (6 October 2026): **M1 built.** The speed test runs on a test map, labelled as made up,
with the real Natural Earth coast, lakes and rivers. Waiting for Ignas's numbers from his Android
phone before M2. In headless Chrome on a PC, with no GPU: first map in about 0.4 s, full redraw
about 33 ms, panning 99% of frames on time. With the processor slowed 4×: first map in about
1.7 s.

**What Ignas sees on his phone at the end of 2a:**
- **The real map** instead of the empty grid: sea, coasts, rivers, lakes, hill shading, forests
  and marshes, painted. Pinch to zoom, drag to pan; mouse wheel on a computer.
- **A time slider:** today, 1219 and 1 AD in full detail. The five ice-age slices (10,000, 9,500,
  8,500, 7,500 and 5,000 BC) show a rough preview, clearly labelled rough, plus a short sourced
  note on land, water, ice, plants, animals and people.
- **Names that change with the time:** 1219 shows the forms used in sources of that age; today
  shows today's local names. Where no name of the time is sourced, today's local name stands in,
  and the data says so. Tap a river, lake or sea for all its names and sources.
- **A Credits screen** listing every data owner, the licence and what we changed.
- **A Speed test button** that measures his phone, with a Copy button so he can paste the numbers.
- Light and dark follow the phone, as now. The date, speeds and saves keep working.

**Area and projection:**
- 12°E to 34°E and 50°N to 61.5°N. That takes in eastern Zealand and Bornholm, Novgorod and Lake
  Ilmen, Volhynia, the Gulf of Finland and Stockholm.
- The same equal-area formula as EPSG:3035 (ETRS89-LAEA), but centred on 56°N 23°E, so north
  points up over Lithuania and leans less than 10° at the edges (about 9.5° at the northern
  corners). Province sizes compare fairly.
- Game coordinates are whole numbers in 100 m units, about 15,720 × 13,270 units (about 1,572 by
  1,327 km). The approved plan's 14,400 was a typo.
- The formula is checked against the official EPSG:3035 test point.
- The region is about as wide as it is tall, so on a portrait phone the player pans and zooms.

**Data, layer by layer.** Each source's licence is read on its own site and quoted in
data/sources.md ("Map data collections (step 2a)") before anything ships. Files with share-alike
licences (ODbL, CC BY-SA) are kept separate, each with its own licence note, because those two
licences can't be mixed in one file.

| Layer | Source | Notes |
| --- | --- | --- |
| Coast, main rivers, lakes | Natural Earth 1:10m (global layers) | Public domain (licence read at v5.1.2), reachable now. The separate Europe layers carry a JRC clause and are not used |
| Smaller rivers, with names | OpenStreetMap (ODbL) | Lielupe, Pregolya, Nevėžis, Dubysa, Šešupė, Minija and others. Host blocked here: ask Ignas at M2 |
| Height and sea depth | GEBCO 2026 | Hill shading, old coasts. Blocked here: ask Ignas at M2. Until then, the hills wait |
| Forest in 1219 | REVEALS pollen reconstructions | An AD 750–1250 average, marked "estimated from pollen". Ask for PANGAEA when needed |
| Marsh in 1219 | Peat and wetland maps | Which map is chosen at M2, licence first |
| Water in 1219 | Today's natural lakes | Modern reservoirs removed |

- Natural Earth's coast is the one base coast for every slice, so the coast doesn't jump when
  nothing changed.
- Only Natural Earth's global layers are used. Its separate Europe rivers and lakes come from JRC
  data under a clause still TO CHECK (data/sources.md, "ne"), so they stay unused until then.
- Fields and open land arrive with the real holdings in 2b.
- **1219 and 1 AD coasts:** the base coast plus local fixes, each with a source or marked TO CHECK:
  the Vistula delta (Żuławy) as marsh; the lagoon mouths; modern reservoirs removed (Kaunas,
  Pļaviņas, Ķegums, Riga, Narva); the north Estonian coast lower by the land rise, using a few
  cited rates.
- **Ice-age previews:** a few cited shore heights and dates per stage, sketched roughly.
- **Blocked sites:** Claude stops and asks Ignas to allow one site at a time, only when a
  milestone needs it. M1 needs nothing blocked.

**Names.** Every named place stores its names by era, `{ today, 1219, 1 AD }`, each with a source
or marked "today's name standing in". Other languages (lt, lv, et, pl, de, ru) go in the panel.

**Tools.** No new dev dependencies. Plain Node scripts written for the project: the projection, a
GeoJSON reader, a GEBCO text-grid reader and the packers. mapshaper is only an occasional
cross-check, never part of the project. No computed river tracing (unreliable on flat Baltic
land): the rivers come from data.

**The pipeline:**
- `npm run map` fetches the raw data into `data/raw/`, which git ignores. It records each file's
  link, date, fingerprint and whether its licence was read.
- It then builds `src/data/map/`, which goes into git. Ignas never has to run it.
- A shipped file from a source whose licence is still unread fails the build.
- `.gitattributes` keeps map files byte-identical on Windows.

**Formats, size and drawing** (details in docs/ARCHITECTURE.md, section 9):
- Lines are whole-number coordinates with shared borders, packed as text. Grids are packed bytes,
  unpacked by the browser's built-in decompression (Chrome on Android is fine). The road-cost grid
  and anything rule-made are rebuilt at start-up, never stored.
- No hard size limit, as Ignas chose. Every build reports the map size, and a test fails if one
  file suddenly balloons (a sanity check, not a budget). The real test: first map on screen in
  under 3 seconds on his phone, opened from the saved copy.
- Terrain is painted once into cached image tiles; pixel density is capped at 2; less detail when
  zoomed out, and far-away detail drops first. A placeholder fog-of-war layer is in the speed test
  from the start, so its cost is known.

**Credits.** One credits list builds both the in-game Credits screen and an `ATTRIBUTION.md` in the
repo: owner, licence and its link, the required notice, and what we changed.

**Sources.** data/sources.md lists collections (for example Natural Earth or GEBCO), each with its
licence quoted. Records cite `collection:id`. A small machine-readable index lets tests check
every id.

**Work order** (each pushed so Ignas can look on his phone):

| # | Milestone | What he can try |
| --- | --- | --- |
| M1 | Speed test on an invented test map | Tap Speed test, then Copy, and send the numbers |
| M2 | The real map, 1219 terrain, Credits | Zoom around the real Baltic |
| M3 | Time slider, names that change | Slide through the ages |

- **M1:** the real drawing code at full map size, on a test map labelled "invented": real Natural
  Earth coast, lakes and rivers; made-up provinces, 3,000 made-up points, made-up terrain, and the
  fog layer. Uses only Natural Earth's global layers, so the JRC clause doesn't apply.
- **M2:** coast, named rivers and lakes, hill shading, 1219 terrain, Credits screen. Ask Ignas to
  allow GEBCO and OpenStreetMap here.
- **M3:** today, 1219 and 1 AD in full; the five ice-age previews with notes; names change with
  the slider. Ask for PANGAEA if still needed.
- **Open question for Ignas at M2:** the 1219 forest share comes from REVEALS, on PANGAEA. Either
  M2's 1219 terrain waits for forest until M3, or Claude asks for PANGAEA at M2. He chooses.
- If M1 shows his phone is too slow, the drawing gets fixed before M2.
- Each milestone passes npm test, soak, check and shots, and the GitHub run on its pull request,
  before it reaches him.

**Tests and checks for 2a:**
- **Projection:** matches the EPSG:3035 test point, and converting there and back returns the same
  point.
- **Lines:** no crossings, every coast and lake closed, rivers inside land.
- **Names and sources:** every named feature has a name per era, or a marked stand-in, plus a
  source. Every source id exists. Every shipped file's licence was read and is on the Credits screen.
- **Pipeline:** the committed map files match their recorded fingerprints, and a small sample is
  rebuilt to prove the same bytes come out.
- **Speed:** timed unpacking and drawing in Node and in headless Chrome, with the processor slowed
  down, to catch regressions. His phone's numbers are the real verdict: 95% of frames under
  16.7 ms while panning; a full redraw under 50 ms; first map in under 3 seconds.
- **Screenshots** at 390 × 844 in light and dark: the overview, zoomed in, the time slider, a name
  panel and Credits. Checked for cut-off or overlapping text.
- **Saves:** looking at the map never changes the save.

### 2b: the 1219 provinces and holdings (planned with Ignas after 2a)

**Provinces:**
- 150 or more in the Baltic core (Ignas's choice), plus coarser neighbours. This replaced
  "roughly 80 to 150, decide with Ignas". No province is invented just to reach 150.
- Each province grows from a sourced seed point over the 1 km terrain, with border rivers named in
  sources acting as walls.
- Each border records whether it is sourced or guessed; guessed ones look softer on the map.
- Modern units are only used to check the result.
- Lithuania uses the lands and castle districts named in 14th-century sources, each showing the
  year it was first mentioned.

**Holdings:**
- A point only at a real, sourced and dated site (Ignas: every holding is a point, at real sites
  only).
- Broadly dated sites appear in the panel as "possibly in use".
- Disputed sites (such as Beverin and Voruta) show their candidate sites, with no point.
- A holding whose site no source gives has no point, and is listed in its province's panel until
  research finds it.

**The pilot:** Semigallia plus one Lithuanian land (Upytė or Deltuva), which Ignas reviews first.

**Questions for the 2b plan:**
- How strict the site dating is.
- Whether a province with no sourced holding gets an invented seat (marked invented).
- Which name forms to use in Kaliningrad.
- The full list of neighbours inside the map: Gotland, Pomerelia, Finland Proper, Votia,
  Black Ruthenia and others.

**Data per province** (proposal; fixed in the 2b plan):
{ id, names by era, other-language names (lt, lv, et, pl, de, ru), outline, centre, terrain,
neighbours, coastal, rivers, historical land, first-mention year, holdings, sources }.
- Holdings: a list per province of { id, name, type, site (or null), dates, sources }. Type is
  camp, village, hillfort, castle, chartered town or city.
- Terrain per province (plains, forest, hills, marsh, lake shore, coast) is worked out from its
  cells of the 1 km terrain map.
- Neighbours come from shared borders; river and sea links are added for movement and trade.

**Checks for 2b:**
- Provinces don't overlap, and they tile the land.
- Every province has a name and at least one source; neighbour lists are symmetric.
- Every border is marked sourced or guessed.
- Every holding with a site has at least one source; holdings with site null are listed in the
  panel.
- Ignas reviews the map for historical mistakes. He knows Lithuanian history; ask him.

### Sources

Verified during the chat (links in data/sources.md):

- Wikipedia, "Yoldia Sea": the Baltic Ice Lake drained to sea level about 9,670 BC; the Yoldia Sea
  lasted about 9,750 to 8,750 BC; Ancylus Lake about 8,750 to 7,850 BC; the Littorina Sea from about
  7,850 BC. During the Yoldia stage the Gulf of Bothnia was still under ice and land joined Germany to
  southern Sweden through Denmark. The page cites Rosentau and others (2021), "A Holocene relative
  sea-level database for the Baltic Sea", Quaternary Science Reviews 266.
- Wikipedia, "History of Lithuania" and "History of Lithuania (1219–1295)": historical dates.
- Wikipedia, "List of early Lithuanian dukes": the dukes of 1219.

Map data (Natural Earth, OpenStreetMap, GEBCO, REVEALS, DATED-1, the Rosentau 2021 database):
listed in data/sources.md under "Map data collections (step 2a)", each with its licence status.
Nothing ships until its licence is read.

TO CHECK for 2b: published maps of the Baltic tribal lands around 1200, and of the Lithuanian
lands of the time (Lithuania proper, Deltuva, Upytė, Nalšia, Samogitia), to check province borders.

### The time slices

| Slice | Why it matters | In 2a |
| --- | --- | --- |
| 10,000 BC | Game start: ice sheet in the north, the Baltic Ice Lake | Rough preview |
| 9,500 BC | Yoldia Sea | Rough preview |
| 8,500 BC | Ancylus Lake | Rough preview |
| 7,500 BC | Early Littorina Sea | Rough preview |
| 5,000 BC | Start of the crafts, farms and amber age | Rough preview |
| 1 AD | The amber trade with Rome | Full |
| 1219 AD | Start of the Middle Ages campaign | Full |
| Today | Reference, and the later ages | Full |

- The ice-age slices are built properly in step 8, with the hunters. The method is chosen then.
  The two options from the first handoff stay open: A, hand-trace published reconstructions; or
  B, compute them from today's heights, each stage's water level and the DATED-1 ice edge.
- The coast changes much less after the Littorina stage than before, but check the spits and
  lagoons (Curonian Spit, Vistula Lagoon) for the historical slices: TO CHECK.
- For each slice also research the living land: vegetation (tundra, birch and pine, mixed forest,
  wetland, fields), the main animals (for example reindeer near the ice in the earliest slice:
  TO CHECK) and where people lived.

---

## 3. Step 3: the Middle Ages, dynasty and realm

### Goal

A playable medieval campaign on the real map from step 2 (2a and 2b). You play a Lithuanian duke or another
Baltic ruler through marriages, births, deaths, inheritance, diplomacy, vassals and simple wars.
History follows its course unless you change it.

The prototype engine is rewritten in 3a around the new design and docs/ARCHITECTURE.md. Its engine
and test files were not uploaded, so its ideas, and what its tests checked, are reused on purpose
from the notes in section 4. Ignas chose the rewrite on 6 October 2026. This replaces the earlier
plan to move its rules into src/sim and adapt them.

### Three parts, each ending playable on Ignas's phone

| Part | What it adds |
| --- | --- |
| 3a | The real map from step 2, characters, family, succession and titles, on the rewritten engine |
| 3b | Diplomacy, vassals with fine-grained terms, faith, one faction type (a relative claiming your throne), simple wars with battles settled automatically, the Orders' and the Horde's goals |
| 3c | Harvests, hunger and unrest (cutting tax and soldiers), and the full market: goods, prices, merchants, regional markets |

Each part is planned with Ignas, passes its tests and soak, and ends with a short note for him:
what's new, what to try, what's missing. Simple wars come in 3b (Ignas, 6 October 2026).

More of Ignas's answers for step 3 (6 October 2026; details in docs/LEVELS.md):
- Neighbours in full detail: the closest realms, and any tied to the player through family,
  marriage or council. The rest run as a goal and a strength. Unsourced rulers are invented and
  marked invented.
- Creating the Grand Duchy takes size (enough land) and renown; set the numbers in 3a and show them
  to Ignas.

### Start date: 1219 (proposal; confirm with Ignas)

In 1219, 21 Lithuanian dukes signed a peace treaty with Galicia–Volhynia, the first clear sign of the
Baltic tribes uniting. Five were elder dukes: Živinbudas (presumably the eldest), Daujotas,
Dausprungas, Mindaugas and Vilikaila (also Viligaila). Samogitian dukes in the treaty include Erdvilas
and Vykintas. Most of these dukes are known only by name: invent their families, ages and traits
plausibly, and mark those details as invented in the data.

In 1219 there is no Grand Duchy yet: a player who picks Lithuania starts as one of the dukes of the
1219 treaty, and the Grand Duchy is a title that can be created. A land can have more than one duke:
in 1219 Samogitia's dukes included Erdvilas and Vykintas.

### Starting realms (research list; TO CHECK unless marked verified)

- The Lithuanian dukes of the 1219 treaty. The five elder dukes are verified; get the full list of 21
  from the source.
- Samogitian dukes Erdvilas and Vykintas (verified).
- Semigallia under Viesturs (Vester), who beat the Lithuanian duke Žvelgaitis when Žvelgaitis
  attacked Riga in 1205 (verified).
- Bishop Albert of Riga, who founded the Livonian Brothers of the Sword in 1202 (verified).
  In 1219 there is no Teutonic or Livonian Order in the region yet: the Teutonic Knights are invited
  in 1226 and settle in Chełmno in 1230, and the Livonian Order merges into them in 1237.
- Curonians, Selonians, Latgalians, Livonians, and the Estonian lands: rulers and state TO CHECK.
- The Prussian lands, with no single ruler, and the Yotvingians: TO CHECK.
- Masovia under Konrad I (verified as the duke who invited the Teutonic Knights in 1226).
- Galicia–Volhynia, the treaty partner: its rulers in 1219 TO CHECK.
- Polotsk, Pskov, Novgorod and Smolensk: rulers TO CHECK.
- Denmark's position in northern Estonia around 1219: TO CHECK.

Possible history fix (TO CHECK, found in the step 2 research; the list above stays as it is until
it is confirmed): by 1219, Jersika and Koknese may no longer have depended on Polotsk. Source to
read: Henry of Livonia's chronicle (chapter to find); the research saw it only in a search extract
of the Wikipedia page on Visvaldis.

Background and flavour from before 1219 (verified): Žvelgaitis was killed attacking Riga in 1205;
the Livonians imprisoned Daugirutis in 1213; Stekšys was killed in 1214; Lithuanians made about
40 raids on their neighbours between 1201 and 1236; Pskov was burned in 1213.

### History's path: pressures, not scripts

Each item fires only if its conditions still make sense. If the player has already changed the
situation, the event adapts or does not happen. Verified dates:

| Year | What happened |
| --- | --- |
| 1226 to 1230 | Konrad of Masovia invites the Teutonic Knights; they settle in Chełmno in 1230 and attack Prussia |
| 1236 | Battle of Saule: Samogitians under Vykintas destroy a crusading order's army (the Sword Brothers: TO CHECK) |
| 1237 | The Livonian Order merges into the Teutonic Knights |
| 1241, 1259, 1275 | Golden Horde raids reach Lithuania |
| 1251 and 1253 | Mindaugas is baptised (1251) and crowned king (1253) |
| 1260 | Battle of Durbe; the Great Prussian Uprising follows and lasts 14 years |
| 1263 | Mindaugas is murdered by Treniota and Daumantas |
| 1270 | Battle of Karuse, fought on the ice near Saaremaa |
| 1283 and 1291 | The Teutonic Knights finish conquering the Yotvingians (1283); the Livonian Order finishes Semigallia (1291) |
| 1385 to 1387 | Union of Krewo (1385); Jogaila baptised and crowned King of Poland (1386); conversion and a bishop in Vilnius (1387) |
| 1410 | Grunwald: the Polish–Lithuanian army defeats the Teutonic Knights |
| 1413 | The conversion of Samogitia begins |
| 1422 | Treaty of Melno: Samogitia recovered for good |
| 1569 | Union of Lublin. Dynasty play carries on (Ignas, 6 October 2026): the player can try to save the dynasty and change history. When play turns to the country is planned with the later ages |

Build these as goals for computer-run realms (the crusading Orders want pagan land; the Horde raids),
plus events with conditions. For example, a ruler in Mindaugas's position may be offered baptism and a
crown, with real costs and benefits either way.

### Systems for step 3 and where they come from

| System | In the prototype | Work for step 3 |
| --- | --- | --- |
| Map, provinces, neighbours | Generated map of 52 counties | Replace with the real map from step 2 |
| Characters: traits, five skills, education | Yes | Baltic, Rus', Polish and German name lists; cultures; keep the traits |
| Births, deaths, illness, ageing | Yes | Add child rulers with regents |
| Marriage and alliances | Yes: ruling-family marriages create alliances | Keep; add betrothals of children |
| Succession | Partition with sons first; an eldest-takes-all law | 3a: sons first at the start; laws and events can change it. Add a chosen-heir law: Gediminid rulers chose the son they thought most able (verified) |
| Titles | County, duchy, kingdom on the generated map | 3a: real lands; the Grand Duchy as a title that can be created (not held in 1219). 3b: the crown as a special, event-driven title, offered with baptism |
| Vassals, opinion, revolts | Yes | 3b: fine-grained terms per vassal; one faction type, a relative claiming your throne |
| Economy, soldiers, buildings | Yes | 3c: harvests and the full market. Baltic goods: amber, furs, wax, honey, grain. Replaces "keep it simple" |
| Claims, wars, armies, sieges, war score | Yes, with battles settled automatically | 3b: simple wars with battles settled automatically; add raids (loot and captives, no conquest) and crusade wars. Winter routes move to step 5 (Ignas) |
| Computer-run rulers | Yes, simple | 3b: historical goals per realm; how the Orders and the Horde behave. They know only what their character would know |
| Faith | None | 3b: pagan, Catholic, Orthodox; conversion; being a crusade target |
| Events | 17 general events | Condition-based historical events; Baltic flavour events |
| Save and load | Yes, deterministic and tested | Version numbers and migrations |
| Phone interface | Unfinished prototype | Rebuild: map, character, realm, family, rulers, war, chronicle; pause plus five speeds |

### Interface for step 3 (portrait)

- Top bar: you (portrait, name, title), the date, speed (pause plus five speeds), gold, prestige, soldiers.
- Map: terrain drawn, with realm colours tinted over it; your realm outlined; holdings as points at
  their real sites; armies as banners. Tap a province for its panel; pinch to zoom; drag to pan.
  Map modes: realms, lands, opinion of you, faith.
- Bottom tabs: Realm, Family, Rulers, War, Chronicle.
- Panels slide up from the bottom. Events appear as cards that show what each choice does,
  and the game pauses on events.
- Reuse the prototype's look: woad blue frames, madder red and weld yellow accents, and the
  blackletter display font Grenze Gotisch (OFL licence; keep the licence file next to it).
  Colours follow the phone's light or dark setting.

### Tests for step 3

Invariants, checked every game year in soak runs:

- No NaN or Infinity anywhere in the state.
- Every province has a living holder; every title has a living holder or none.
- Nobody is their own liege, liege chains have no loops, and every liege holds land.
- Every army belongs to an independent ruler and has a positive size.
- Every war has both sides; war scores stay between -100 and 100.
- Save, load and continue gives exactly the same result as continuing without saving.

Market tests and invariants (3c):

- No good's stock is ever negative.
- Every price stays within its limits.
- Money is conserved in trades: no gold is made or lost when goods change hands.

Soak runs:

- 100 seeds from 1219 to 1569 with the computer playing every ruler.
- 100 seeds with a passive player who accepts every offer and starts nothing.
- Report: errors (must be zero), time per game year, save size, and how often key history happens
  when nobody interferes. Examples: the share of runs where the Orders reach Samogitia's border by
  1300; the share where one Lithuanian ruler holds most Lithuanian lands by 1260.
  These history numbers guide tuning; they are not pass or fail. Show them to Ignas.

Interface:

- Screenshots at 390 x 844 of the intro, map, character, family, realm, rulers, war, chronicle and an
  event card. Check for overlapping or cut-off text and unreadable sizes.
- No console errors during a scripted play session. The prototype's screenshot script stopped when
  an event card covered the screen; the test script must resolve events before tapping elsewhere.

### Done when

- You can start in 1219 on the real map as any listed Baltic ruler.
- An hour of play on the phone runs without errors or stalls.
- History follows its course when you leave it alone and bends sensibly when you don't.
- Ignas has played it and given feedback, and the top issues are fixed before step 4.
- Each part (3a, 3b, 3c) ended playable on his phone, with its own feedback round.

---

## 4. The prototype you inherit

The prototype/ folder holds code written during the chat. It works and is tested, but it is a base,
not final code.

What reached the repo (6 October 2026). Only part of the prototype was uploaded:

- In the repo: README.md; realm/build.py, shot.py, shell.html, style.css and the 9 screenshots;
  font/OFL.txt.
- Missing: realm/realm1.js, realm2.js, ui.js, test.js and test2.js; hamlet/sim.js; the font's
  gg.b64 and woff2.
- Ignas chose to rewrite the engine in step 3a around the new design instead of uploading them.
  The notes below say what each file did, so its ideas can still be reused on purpose.
- Without hamlet/sim.js, step 7 starts from its notes below.
- The game's font now comes fresh from Google Fonts' GitHub (data/sources.md).

### prototype/realm: the realm and dynasty engine

- realm1.js: constants, seeded random numbers, the map generator (Voronoi cells with two smoothing
  passes and wobbly shared borders), name lists, characters, starting realms.
  The map generator is replaced by the real map from step 2.
- realm2.js: who holds what, opinions with reasons, the economy (gold, prestige, soldiers, a limit on
  land held directly), courts, alliances from marriages, marriage acceptance scores, births, deaths,
  education, succession (partition with sons first), war (claims, rightful lands of a title,
  independence; war score from battles, occupation and time), armies (raising, moving along the
  county graph, battles with terrain and commander skill, retreats, sieges), computer-run rulers
  (wars, forged claims, marriages, building, creating titles, vassal revolts), 17 player events,
  monthly and yearly updates, player actions, save and load. It exports one object, Realm.
- To run it: join the two files (build.py does this) and run node test.js or node test2.js.
- test.js: five worlds over 150 years with the computer playing everyone, checking invariants.
  Last run: no errors, 0.2 to 2.6 seconds per world.
- test2.js: save and load give identical results, and every player action works.
- ui.js, style.css, shell.html, build.py, shot.py: the phone interface attempt (map drawn with Path2D,
  sliding panels, event cards, portraits and coats of arms drawn as SVG). It builds, but the
  screenshot script stopped when an event card covered the screen. Treat it as unfinished.
- screenshots/: what the interface looked like.

Measured behaviour: realms merge and split, and kingdoms form. A passive player lasted 29 to 53 years
in 8 of 10 worlds and survived 100 years in the other 2.

Known issues:

- Name lists are generic Central European, and place names are generated from syllables.
- Battles chain quickly when a beaten army retreats and is caught again.
- Women rule only through succession, with sons first.
- Dead characters more than 60 years gone are removed, except the player's own house.
- build.py and shot.py use paths relative to their own folder; build.py writes kin-and-crown.html
  next to itself. Both were checked after packaging: the build works and test2.js passes.

### prototype/hamlet: the town builder

- sim.js: rules only, no interface. A 40 by 40 tile village with houses, families as workers, logging,
  firewood, foraging, hunting, farming with a September harvest, a bakery, a tannery, a quarry, a well,
  a church and a trading post, plus approval with visible reasons, taxes, seasons, goals, and save and
  load. A starting point for step 7.

### prototype/font

- Grenze Gotisch, cut down to Latin letters (woff2 and base64), with its OFL licence.

---

## 5. After step 3 (outline only; plan each with Ignas)

4. Intrigue: schemes, secrets and leverage, the council and spymaster, friends, rivals and lovers,
   and stress (test whether it is fun).
5. War: supply and food from towns, foraging, starvation, seasons and frozen winter routes, raids
   versus conquest, sieges, peasant revolts with rebel armies when unrest runs very high, and war
   exhaustion that lowers armies' effectiveness the longer a war lasts.
6. Battles: real-time, portrait, formations, morale, messengers, line of sight, weather,
   relatives on the field.
7. Towns: your seat and any holding in your realm, built by hand and feeding the realm, starting
   from Hamlet's notes. The clock slows to speed 1 inside a holding. Sieges and raids of any holding
   you built are fought on its own layout, and what you built stays when the holding changes hands.
8. First hunters: the Far Cry Primal-style action opening on the 10,000 BC map. The five ice-age
   map slices are built properly here (Ignas, 6 October 2026); step 2a gives only a rough preview.
9. Your tribe's story: from the hunters to the crusades, with time jumps and player-made history.
10 to 12. Country play: the Commonwealth, empires and revolutions (including the fight for freedom
   when an empire holds the land), and the world wars to today.

---

## 6. Risks and how to handle them

- Scope: the game is huge. Keep each step small, playable and tested. Don't add features in the middle
  of a step; write ideas into docs/DESIGN.md for later.
- History errors: source every fact, mark doubts TO CHECK, and have Ignas review.
- Map data: some reconstructions may be paywalled or not licensed for reuse. Read each licence on
  its owner's site and quote it in data/sources.md before anything ships; credit every owner on the
  Credits screen. Share-alike data is allowed (Ignas: "free forever"), kept in separate files with
  their own licence note. If the game were ever sold, those layers would need replacing.
- Blocked sites: most map data hosts are blocked in the cloud session. Milestones M2 and M3 of 2a
  wait for Ignas to allow them, one site at a time, asked only when needed. M1 needs nothing blocked.
- Old coasts: on flat shores they are approximate, and marked so.
- Names of the time: many features have no sourced 1219 form, so today's name will often stand in
  at first, marked as a stand-in.
- Phone performance: measure early on his Android phone (2a, M1: the Speed test button); keep
  drawing and daily work within budget. There is no hard size limit; the test is first map on
  screen in under 3 seconds.
- Save size over centuries: remove characters who no longer matter, keep logs capped, avoid repeating
  long strings.
- Sensitive history: plan how the later ages handle occupation, deportation and the Holocaust with
  Ignas before writing any of it.

---

## 7. Plain words used in this project

- Sim: the game rules, without the drawing.
- Soak run: letting the computer play many long games to find errors.
- Invariant: something that must always be true, checked automatically.
- Time slice: a snapshot of the map at one moment, for example 9,500 BC.
- Projection: the formula that lays the round Earth flat on the screen.
- Share-alike: a data licence that says anything made from the data must be shared under the same
  licence (OpenStreetMap's ODbL is one).
- Stand-in name: today's local name, shown where no name of the time is sourced, and marked so.
- Province: a piece of land on the map that someone holds.
- Liege: the ruler someone serves.
- War score: how well a war is going, from -100 to 100.
- Plan mode: Claude Code's mode for planning without editing files (Shift+Tab twice).

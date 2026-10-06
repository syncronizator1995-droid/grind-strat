# Grind Strat: handoff for Claude Code

Written on 6 October 2026 by Claude in a claude.ai chat, for Claude Code working with Ignas on his PC.
Updated 6 October 2026 in Claude Code with Ignas's answers; see docs/LEVELS.md.

This file says what to build first and how to know it is right. It covers:

- Step 1: setting up the project.
- Step 2: map research and the map pipeline, from the ice age to today.
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
2. Map research and the map pipeline.
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

Status: in progress (Claude Code, 6 October 2026).

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

## 2. Step 2: map research and the map pipeline

### Why this comes first

The design promises a historically accurate map from the ice age to today. Every later system sits
on this map: provinces, armies, supply, towns and the hunter opening. Getting it wrong late is expensive.

### What to produce

1. A base map of today's region: coast, main rivers, lakes.
2. Time slices of land, water and ice from 10,000 BC to today.
3. A province map for the start of the Middle Ages (around 1219): 150 or more provinces in the
   Baltic core (Ignas's choice), with their holdings.
4. A sources list for all of the above, with licences.
5. A debug map screen in the game file: a time slider through the slices, tap a province to see its
   name, sources and neighbours. It must run on a phone.
6. Land cover for drawing (forests, marshes, rivers, lakes), with sources. Ignas chose this map look:
   terrain drawn, with realm colours tinted over it.
7. A small terrain grid per province (land cover, water, height), for later battlefields (step 6)
   and town layouts (step 7).

### Area and projection

- Area: from the Vistula in the south-west to the Gulf of Finland in the north, and far enough east to
  include Polotsk, Pskov and Novgorod. Neighbours such as Masovia, Galicia–Volhynia and Scandinavia
  across the sea appear in less detail. Agree the exact box with Ignas.
- Projection: an equal-area projection for Europe, for example ETRS89-LAEA (EPSG:3035), so province
  sizes compare fairly. Store game coordinates at a fixed scale; the interface zooms.
- The region is roughly as wide as it is tall, so on a portrait phone the player pans and zooms.
  Start views centred on the player's land.

### Sources

Verified during the chat (links in data/sources.md):

- Wikipedia, "Yoldia Sea": the Baltic Ice Lake drained to sea level about 9,670 BC; the Yoldia Sea
  lasted about 9,750 to 8,750 BC; Ancylus Lake about 8,750 to 7,850 BC; the Littorina Sea from about
  7,850 BC. During the Yoldia stage the Gulf of Bothnia was still under ice and land joined Germany to
  southern Sweden through Denmark. The page cites Rosentau and others (2021), "A Holocene relative
  sea-level database for the Baltic Sea", Quaternary Science Reviews 266.
- Wikipedia, "History of Lithuania" and "History of Lithuania (1219–1295)": historical dates.
- Wikipedia, "List of early Lithuanian dukes": the dukes of 1219.

TO CHECK (not verified yet; confirm availability and licence before use):

- Natural Earth (naturalearthdata.com) for today's coast, rivers and lakes. Believed public domain.
- GEBCO grid for land height and sea depth.
- DATED-1 (Hughes and others, 2016, Boreas) for the edge of the ice sheet through time.
- The Rosentau 2021 database for water levels around the Baltic through time.
- Published maps of the Baltic tribal lands around 1200, and of the Lithuanian lands of the time
  (Lithuania proper, Deltuva, Nalšia, Samogitia), for province borders.

### Method (suggested; agree it with Ignas)

Two ways to make the time slices:

- A. Hand-trace key slices from published reconstructions. Fast, and good enough to start.
- B. Compute them: take today's land height and sea depth, apply each stage's water level
  (it differs by area, because the land rose unevenly after the ice), and cut out the ice sheet
  from DATED-1. More accurate, more work.

Start with A for a playable result, credit the source maps, and keep B as a later upgrade.

Slices to make, each with land, water and ice:

| Slice | Why it matters |
| --- | --- |
| 10,000 BC | Game start: ice sheet in the north, the Baltic Ice Lake |
| 9,500 BC | Yoldia Sea |
| 8,500 BC | Ancylus Lake |
| 7,500 BC | Early Littorina Sea |
| 5,000 BC | Start of the crafts, farms and amber age |
| 1 AD | The amber trade with Rome |
| 1219 AD | Start of the Middle Ages campaign |
| Today | Reference, and the later ages |

The coast changes much less after the Littorina stage than before, but check the spits and lagoons
(Curonian Spit, Vistula Lagoon) for the historical slices: TO CHECK.

For each slice also research the living land: vegetation (tundra, birch and pine, mixed forest,
wetland, fields), the main animals (for example reindeer near the ice in the earliest slice: TO CHECK)
and where people lived.

### Data format (proposal)

src/data/map/

- base.json: projection, bounding box, rivers (named polylines), lakes (polygons).
- slices/<year>.json: { year, land, water, ice (each a MultiPolygon), notes, sources: [ids] }.
- provinces-1219.json: a list of
  { id, name, altNames: { lt, lv, et, pl, de, ru }, polygon, centroid, terrain, neighbours: [ids],
  coastal, rivers: [names], historicalLand, holdings, sources: [ids] }.
- holdings: a list per province of { id, name, type, site (or null), sources }. Type is camp, village,
  hillfort, castle, chartered town or city. Ignas chose: every holding is a point on the map, at
  real sites only. A holding whose site no source gives has site null: no point on the map, and
  it is listed in its province's panel until research finds it.
- Terrain per province, from sources: plains, forest, hills, marsh, lake shore, coast.
- A small terrain grid per province (for example 32 by 32 cells, an invented size): land cover,
  water and height. Battlefields and town layouts are cut from it later.

Keep polygons simplified for phone drawing: aim for under about 500 KB of map JSON in total,
and cache drawn shapes as Path2D objects. Neighbours come from shared borders; river and sea links
are added later for movement and trade.

### Checks

- Every polygon is valid (no self-crossing); provinces do not overlap and they tile the land.
- Every province has a name and at least one source.
- Neighbour lists are symmetric.
- Every slice loads and draws at 60 fps on a phone.
- Every holding with a site has at least one source; holdings with site null are listed in the panel.
- Measure speed on Ignas's phone early in step 2 (150 or more provinces, with terrain drawn) and
  show him the numbers.
- Ignas reviews the map for historical mistakes. He knows Lithuanian history; ask him.

### How many provinces

Ignas chose 150 or more for the Baltic core (6 October 2026), plus coarser neighbours. This replaces
"roughly 80 to 150, decide with Ignas". More provinces mean more detail, more data work and slower
phones, and real holding sites are a big research job: measure early, as above.

---

## 3. Step 3: the Middle Ages, dynasty and realm

### Goal

A playable medieval campaign on the real map from step 2. You play a Lithuanian duke or another
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
| 3b | Diplomacy, vassals with fine-grained terms, faith, one faction type (a relative claiming your throne), the Orders' and the Horde's goals |
| 3c | Harvests and the full market: goods, prices, merchants, regional markets |

Each part is planned with Ignas, passes its tests and soak, and ends with a short note for him:
what's new, what to try, what's missing. Where simple wars fit (3b is proposed) is to settle with him.

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
| 1569 | Union of Lublin: the end of dynasty play; the game hands over to country play in a later step |

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
| Claims, wars, armies, sieges, war score | Yes, with battles settled automatically | Add raids (loot and captives, no conquest), crusade wars, winter routes |
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
5. War: supply and food from towns, foraging, starvation, seasons and winter routes, raids versus
   conquest, sieges.
6. Battles: real-time, portrait, formations, morale, messengers, line of sight, weather,
   relatives on the field.
7. Towns: your seat and any holding in your realm, built by hand and feeding the realm, starting
   from Hamlet's notes. The clock slows to speed 1 inside a holding, and a siege of your seat is
   fought on your own town map.
8. First hunters: the Far Cry Primal-style action opening on the 10,000 BC map.
9. Your tribe's story: from the hunters to the crusades, with time jumps and player-made history.
10 to 12. Country play: the Commonwealth, empires and revolutions (including the fight for freedom
   when an empire holds the land), and the world wars to today.

---

## 6. Risks and how to handle them

- Scope: the game is huge. Keep each step small, playable and tested. Don't add features in the middle
  of a step; write ideas into docs/DESIGN.md for later.
- History errors: source every fact, mark doubts TO CHECK, and have Ignas review.
- Map data: some reconstructions may be paywalled or not licensed for reuse. Prefer public-domain or
  openly licensed data; otherwise hand-trace, credit the source, and note it.
- Phone performance: measure early on a real phone; keep polygon counts and daily work within budget.
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
- Province: a piece of land on the map that someone holds.
- Liege: the ruler someone serves.
- War score: how well a war is going, from -100 to 100.
- Plan mode: Claude Code's mode for planning without editing files (Shift+Tab twice).

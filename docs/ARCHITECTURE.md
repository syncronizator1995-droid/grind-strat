# Grind Strat: architecture

The technical rules that stop the parts of the game from breaking each other. For Claude Code and any
developer. Written on 6 October 2026 from the approved step-1 plan and Ignas's answers of that day.
Section 9 updated the same day with his step 2 answers.
Like every doc here it stays open: if Ignas says something different, he wins, and this file changes.

Plain words used below:
- **Sim**: the game rules, without the drawing. **System**: one part of the sim that owns some data.
- **Derived data** (an index or cache): anything that can be worked out again from the save.
- **Deterministic**: the same seed and the same player actions always give the same game.
- **Hash**: a fixed scramble of numbers; the same input always gives the same "random" output.
- **Migration**: upgrades a save to the next version. **Invariant**: a rule checked automatically.
- **Soak run**: the computer plays many long games to find errors.

Labels: **invented** is our own idea or estimate, not history and not measured. **unverified** is a
game mechanic read only from search-result extracts (the Paradox and Manor Lords wikis were blocked).
**TO CHECK** is history not yet confirmed in data/sources.md.

## 1. Purpose and the layers

| Folder | Holds | Rule |
| --- | --- | --- |
| src/sim/ | The game rules | No DOM, canvas, `Date.now()` or `Math.random()`. Plain data in and out. Runs in Node |
| src/ui/ | Drawing, screens, input, sound, storage, install | Reads sim state; changes it only by sending player actions |
| src/data/ | Map and history data as JSON | Made by tools/ or by hand; every real fact has a source id |
| tools/, test/ | Build and data scripts; tests, soak, screenshots | Never shipped |

- prototype/ is for reference only. Copy ideas on purpose; never import from it.
- The game ships as one self-contained offline file, dist/grind-strat.html, with no network at
  runtime and zero runtime dependencies. Dev tools: esbuild, typescript, playwright, and
  @types/node (type definitions only, for checking the Node scripts).
- GitHub Pages also serves a web manifest, a service worker and icons with a blackletter "G", so it
  installs like an app. The game adds these only on the website; as a plain file it plays the same.
- Step 1 files: src/sim/game.js (new game, advance a day, save and load), random.js, calendar.js,
  invariants.js; src/ui/main.js (screen and buttons), clock.js (speeds), storage.js (wrapped
  localStorage), autosave.js (when to autosave), install.js and sw.js (install like an app).
- The service worker keeps the game page in its own cache and a second copy in IndexedDB, because
  Ignas's other apps on the same github.io address delete every cache but their own when they
  update. It loads the page network first and falls back to a saved copy after 3 seconds.

**Ignas's answers of 6 October that change earlier plans:**
- Every holding in your realm can be built by hand, even a vassal's (vassals may resent it).
  This replaces "Other holdings: run from the realm map with build menus" in DESIGN.md.
- The prototype engine is rewritten in step 3a around the new design and this file. HANDOFF had said
  to reuse and adapt it. The rewrite is what makes the ownership rule in section 2 affordable.
- A full market (goods, prices, merchants) arrives in 3c with harvests. HANDOFF had said to keep
  step 3's economy simple.
- 150 or more provinces in the Baltic core (HANDOFF: "80 to 150, decide with Ignas").
- Step 3 is split into 3a, 3b and 3c, each playable on the phone.

## 2. The systems and what each owns

| System | Owns | Step |
| --- | --- | --- |
| World | Map shapes; fixed province facts (terrain, rivers, coast, neighbours, sources); the 1 km terrain map; names by era; holding sites | 2a, 2b; links later |
| Settlements and holdings | Holdings: type, level, buildings, outputs; your edits to hand-built layouts | 3a summary; 7 hand-built |
| Characters and dynasty | People, houses, family links, skills, traits, faith, culture, memories; later friends, rivals, lovers, secrets, court and council | 3a; 4 |
| Feudal politics | Titles, who holds what, who serves whom, laws, claims, vassal contracts, factions, alliances, truces; province control, faith, culture | 3a titles; 3b |
| War | Armies, wars, war score, sieges; later supply and battles | 3b (to confirm); 5; 6 |
| Economy (market) | Treasuries, prestige, food, goods, harvests, regional markets, prices, merchants | 3a gold; 3c |
| Events and stories | Event list, cooldowns, the card waiting for the player, chronicle, legends | 3a; every step |
| Clock and ages (shared) | The day, the speed, the current age and its step, handovers | 1; handovers later |
| Computer rulers (shared) | Each realm's goals (data) and planning | 3a; grows each step |
| Save (shared) | Save format, versions, migrations, autosave | 1; each step adds a slot |

**The rules:**
1. **Only the owner writes its data.** Any system may read anything. Where an owner is unclear,
   settle it while planning 3a and write it here.
2. **Others change it through the owner's named change functions, which run straight away.**
   Examples (final names in 3a): `killCharacter(state, id, cause)`,
   `transferTitle(state, titleId, toId, reason)`,
   `addMemory(state, whoId, aboutId, value, reason, days)`.
3. **Each change function logs one line** to the chronicle or "why" log, through the log's own
   function, with a reason id. The screen turns the id into text, such as "−20: left us to starve"
   (invented). A chain of causes you can't see reads as random noise.
4. **No message queues.** A queue needs a fixed handling order, anything still waiting at a save
   point must go into the save, and it is a second engine to test. Direct calls protect just as well.
5. Each change function keeps its own invariants (`transferTitle` never makes anyone their own
   liege) and has unit tests. A text-search check in `npm test` (built in 3a) flags code that writes
   another system's slot outside its change functions.

**Realms and titles appear, merge and vanish mid-game,** so the data allows it from 3a:
- In 1219 there is no Grand Duchy yet. A player who picks Lithuania starts as one of the dukes of
  the 1219 treaty; the Grand Duchy is a title that can be created.
- In 1219 the Livonian Brothers of the Sword (founded 1202 by Bishop Albert of Riga) are there, but
  not the Teutonic Knights: they are invited in 1226 and settle in Chełmno in 1230, and the Livonian
  Order merges into them in 1237 (source: hist-lt-1219).
- A land can have more than one duke: Samogitia's dukes in 1219 included Erdvilas and Vykintas
  (source: dukes).
  Lands, titles and holders are never assumed to match one-to-one.

## 3. Time

**Calendar** (src/sim/calendar.js; nothing else does date maths):
- The sim counts whole days in one number, `day`. Day 0 is 1 January 1 AD.
- Years have 365 days, with no leap days. Months keep their usual lengths; February always has 28.
- Days before 1 AD are negative. There is no year 0: 1 BC comes right before 1 AD, so 1 January
  1 BC is day −365, and 1 January of year N BC is day −365 × N.
- The Middle Ages campaign starts on 1 January 1219, day 444,570. 10,000 BC starts on day −3,650,000.
- Because days can be negative, use a remainder that never is: `((x % n) + n) % n`.

**The loop and the speeds:**
- Pause plus 5 speeds: 2, 5, 12 and 30 days a second, then as fast as the phone allows. Easy to tune.
- The UI works out how many whole days to run from the real time passed. The sim only runs whole
  days, so the frame rate never changes results. A phone that falls behind drops the backlog and
  runs slower; it never freezes. Top speed runs as many days as fit in about 8 ms of each frame,
  at most 30 (easy to tune).
  Player actions apply between days, never in the middle of one.
- Big moments pause the game: events, births, deaths, war declarations. A card waiting for the
  player is sim state: it is saved, and no days run until it is answered. Computer rulers answer
  their own cards at once.

**Autosave** on the first day of every game month and when the app is hidden or closed, plus
Save, Load and New game buttons. Saves happen only between days. Storage is localStorage and every
access is wrapped, so blocked or full storage shows a message such as "Couldn't save: this browser
blocks storage" instead of crashing. Pausing, Load and New game also autosave. At high speeds
autosaves are kept at least 2 real seconds apart; a month that passes inside that gap is saved as
soon as the gap ends, so the stored game is never more than about 2 seconds behind. An autosave
the game can't read (say, from a newer version) is copied to `grind-strat/autosave-unreadable`
before a new game starts, so it is never overwritten.

**Spreading the monthly and yearly work:**
- Each thing with monthly work (a province, a character, a computer ruler, a market) runs it on
  days where `(day + id) mod 30 = 0`; yearly work where `(day + id) mod 365 = 0`. Ids are whole
  numbers, and within one day things run in id order.
- This uses the running day counter, never the day of the month: anything given the 29th, 30th or
  31st would skip some months. So "monthly" here means every 30 days. Things tied to the calendar
  (the autumn harvest, seasons, autosave) use the calendar instead.
- Spread days shift the balance compared with the prototype's monthly and yearly updates, so the
  soak's history numbers are re-tuned afterwards.

**Inside a holding** the clock runs at speed 1 at most (2 days a second). Pause still works and big
events still pause. It is a limit set by the UI: the rules are the same, so results don't change.

**Ages:**
- Each age has its own step (DESIGN.md, "How time works"): days in the Middle Ages, months in the
  tribal age, jumps in prehistory. The day counter is the same in every age.
- Each age gets its own save shape, designed when that age is built; no single record fits all.
- Moving between ages calls one handover function per boundary: old age's state in, new age's state
  out, carrying what DESIGN.md's "What carries over" lists. Each bumps the save version and is tested.
- 1569 does not end dynasty play (Ignas, 6 October 2026): the dynasty carries on, and the player
  can try to save it and change history. When play turns to the country is designed with those ages.
- What the player sees follows the same knowledge rule as computer rulers: neighbouring lands are
  only partly visible (fog of war), and the inside of a holding shows only through a direct tie
  such as a visit, a hunt or letters. Far realms stay hidden. Built with 3b's knowledge rules
  (proposal).

## 4. Saves

**Step 1 save**, exactly:
```json
{"version":1,"seed":<int>,"rng":[4 uint32],"day":<int>}
```

- `rng` is the state of the one random generator (sfc32, seeded through splitmix32): four 32-bit
  whole numbers. `day` is the counter from section 3.
- Only the sim draws from this generator, always in the same order. The UI and look-only views
  never touch it.
- The save is exactly the state. Never round or trim at save time, or "load and continue" would
  differ from "continue". Plain JSON only: no functions, classes, Maps, Sets, `undefined` or NaN.
- **Same results on every device.** Phones and PCs may round `Math.pow`, `exp`, `log`, `sin` and
  similar slightly differently, and a tiny difference grows into a different game. In anything that
  feeds the state, use + − × ÷, `Math.floor`, `round`, `min`, `max`, `abs`, or a lookup table.
  Iterate in id order and break sort ties by id.

**Adding slots:**
- Each system adds its top-level slots when it is built, and the version goes up by one. Example
  keys (invented): `ch` characters, `ti` titles, `pv` provinces, `ho` holdings, `ar` armies, `wa`
  wars, `mk` market, `ev` events, `lg` chronicle.
- `migrations[v]` upgrades version v to v+1; loading runs them in order. A newer or unknown version
  shows a clear message and leaves the stored save untouched. Each version keeps a small fixture
  save in test/, and a test loads every one.
- Fields are added when they are played, not stored early "just in case". A later migration is
  small, and it tests the migration path early.

**Never saved** (and view state, such as zoom and the open panel, stays out of the sim save):
- Derived data: indexes (children by parent, titles by holder, provinces by realm), army and
  faction strengths, drawn map shapes. One function rebuilds it after New game and Load.
- Opinion totals. Opinions are worked out from facts (same house, liege, faith, traits) plus
  short-lived memories, `{about, value, reason id, until day}`, capped per character (for example
  10, invented). Expired memories go on that character's monthly day.

**Keeping it small:**
- Short keys, and reason ids instead of sentences; the text lives in one table.
- Dead characters who no longer matter are removed. The prototype removed the dead after 60 years,
  except the player's own house. Proposed: a removed person leaves a tiny record (name, house,
  dates) so old chronicle lines still read.
- The chronicle has a cap (for example 500 lines, invented).
- Budget: under 2 MB. From 3a the soak reports save bytes per living character. Early estimates
  such as "3,000 characters at about 250 bytes each" are invented until measured.
- **Holdings:** an untouched holding's layout is generated from its id, by a hash. The save keeps
  only the player's edits, as a list of changes, stored by holding id, so they stay with the place
  when its holder changes. The layout generator's version is in the save; changing the generator
  needs a migration, or every untouched town would move.

## 5. Detail tiers

| Tier | What | How often |
| --- | --- | --- |
| Full | Your house; rulers and heirs that matter now; councillors; commanders; armies on the move; sieges; wars; the battle you fight; the holding you are inside | Daily, or real time in battle |
| Summary | Provinces as a few numbers; holdings you are not inside, hand-built ones too; peasants as numbers; distant realms as a goal and a strength; distant markets; battles between computer realms, settled at once into one chronicle line | Monthly or yearly, spread out |
| Only when you look | An untouched holding's generated layout; "why?" sheets; portraits; a look-only view of land outside your realm (still open) | On tap, then thrown away |

- Putting hand-built holdings in Summary is a proposal: Ignas's rule is that far-away detail gives
  first if phones are too slow. Confirm with him in step 7, after measuring.
- Which realms run in full detail (Ignas, 6 October 2026): the closest to the player, and any tied
  to the player through family, marriage or council. Re-check the list when those ties or borders
  change (for example yearly, spread out); a realm moving to Summary keeps its rulers and heirs as
  characters, but its courtiers stop being simulated in detail.
- Sieges and raids of any holding the player built are fought on that holding's layout: the
  generated layout plus the player's edits, stored by holding id (section 4).
- **Looking never changes the game.** A look-only view uses its own hash and its own throwaway
  generator and writes nothing to the state. A test opens every view and checks that the save is
  byte-for-byte the same.
- **Budgets** (CLAUDE.md): one game day under 5 ms on a mid-range phone with the full map; the map
  at 60 frames a second; start-up under 3 s; a save under 2 MB.
- Starting split of one game day (invented until measured): armies and sieges 1 ms; spread province
  updates 1 ms; spread character updates 1.5 ms; events and computer rulers 1 ms; spare 0.5 ms.
- Speed is measured on Ignas's Android phone early in step 2a (milestone M1, the Speed test
  button). The prototype's 0.2 to 2.6 s per 150 game years (52 provinces, monthly and yearly
  updates) says little about daily armies on the real map.
- **Ignas's rule: far-away detail gives first.** If phones are too slow, distant holdings and
  markets run as simple numbers until you look. What gives after that is his call.

## 6. The holding interface

Every holding, hand-built or not, gives the same six outputs. The realm reads only these, never the
inside of a town, so towns can't become a separate game that doesn't fit.
```js
/** One holding's outputs for one update (proposed; fixed in 3a).
 * @typedef {Object} HoldingOutput
 * @property {number} gold
 * @property {number} soldiers  levy it can send
 * @property {number} food
 * @property {Object<string, number>} goods  amount by good id
 * @property {number} fort      fort strength
 * @property {number} approval  0 to 100 (invented range)
 */
```

- One function for all: `holdingOutput(state, holdingId)`. **Summary holdings (3a):** outputs come
  from type, level, buildings and the province's state; from 3c also the harvest and prices.
- **Hand-built holdings (7):** outputs come from the layout and its families, refreshed on the
  holding's spread day and kept as its summary. The realm reads the same thing either way.
- Inputs flow down the same way for both: holder, contract terms, laws, harvest, prices, men called
  away to the army, raids and sieges. Each step adds its own.
- The only reader of a layout outside Settlements is a battle or siege at that holding, because
  seat sieges are fought on your own town map. Damage goes through Settlements' change functions.
- Building in a vassal's holding is an ordinary action. The vassal's resentment is a memory with a
  reason id; how strong it is gets decided in step 7.
- **Test (3a):** a stub hand-built holding and a summary holding of the same type and level give the
  same fields and units, all finite and in range, with values within a set tolerance of each other
  (the tolerance is invented until step 7).

## 7. Computer rulers

- **Same actions as the player.** An action is a plain object, such as `{type: "marry", a, b}`.
  `canDo(state, actorId, action)` checks it and `doAction(state, actorId, action)` applies it. The
  UI and the computer call the same two functions; nothing is open only to the computer.
- **They know only what their character knows:** public facts (the map, titles, wars, public
  traits) plus the secrets they have found. Secrets (step 4) record who knows them, and the computer
  reads the world through functions that take the viewer's id. The filter exists from 3a, so step
  4 needs no rewrite. Test (step 4): no computer ruler acts on a secret it doesn't know.
- Each plans on its spread monthly day, in id order, drawing from the sim's generator.
- Historical goals per realm are data with conditions, like events. DESIGN.md: the crusading Orders
  push into pagan lands and Rus' princes demand tribute, unless someone stops them.

## 8. Systems still to come (sketches only)

Each is designed with Ignas in its own step. Numbers here are invented; game mechanics are unverified.

**The market (3c, with harvests):**
- A few goods in a few regional markets; prices update monthly, spread by market id. Merchants move
  goods toward better prices. Distant markets run as fixed numbers until you look. The harvest is
  rolled each autumn per province, by the calendar; food feeds the markets, and from step 5 armies.
- Candidate goods from DESIGN.md: amber, furs, wax, honey, grain, timber. Which province makes which
  good is a historical claim: it needs a source, or goods go by terrain type, marked invented.
- Victoria 3's market moves prices with buy and sell orders, between 25% and 175% of the base price
  (unverified; vic3.paradoxwikis.com/Market, and a reviewer could not confirm it).

**Vassal contract terms (3b; fine-grained per vassal, closer to CK3):**
- Each vassal has its own contract: a list of terms (tax, soldiers, others decided in 3b), each at a
  level. Changing a term is an action; raising one costs that vassal's opinion through a memory.
- CK3 sets tax and levy in steps: the wiki extract lists five (Exempt, Low, Normal, High, Massive),
  while the pre-release Dev Diary #17 described three. Raising one adds 20 "tyranny", an opinion
  penalty with vassals. All unverified.
- The terms go on the vassal's own panel, not in list rows, so they fit 360 px.

**Inheritance laws (from 3a):**
- Each title has a law. One small function per law lists the heirs, with its own tests.
- At the start, sons come first and land is split between them (DESIGN.md). Laws and events can
  change it, for example to a chosen-heir law: Gediminid rulers chose the son they thought most able
  (source: hist-lt). When laws can change is to agree with Ignas. Child rulers get regents.

**Factions (one type in 3b: a relative claiming your throne):**
- A faction is `{id, type, claimant, targetTitle, members, discontent}`. Its strength is derived,
  never saved. Friends, rivals and lovers come in step 4.
- Idea from CK3 Dev Diary #19: discontent builds while the members' combined strength is above a
  threshold, "typically 80%" of the liege's; at 100% the faction sends an ultimatum; vassals happy
  enough never join. Details unverified.
- Inside your realm, strength deters factions and grievances drive them. Outside it, realms that
  fear your growth band together (DESIGN.md, coalitions).

**The event format (from 3a).** An outline; every value is invented:
```json
{ "id": "hungry_vassal_asks_grain",
  "invented": true, "sources": [],
  "fires": { "on": "monthly", "chance": 0.1, "cooldownDays": 1825 },
  "roles": { "vassal": "vassalOfPlayer" },
  "if": [["hungry", "vassal.capital"]],
  "pauses": true, "text": "ev.hungry_vassal",
  "choices": [
    { "id": "send", "ai": [1, ["trait", "generous", 3]],
      "do": [["addGold", "player", -50, "grain_sent"],
             ["addMemory", "vassal", "player", 15, "grain_sent", 1825]] },
    { "id": "refuse", "ai": [1, ["trait", "greedy", 3]],
      "do": [["addMemory", "vassal", "player", -20, "left_to_starve", 1825]] } ] }
```

- `if` uses named checks from a fixed list; `do` calls the change functions from section 2. No code
  in the data. A test rejects any unknown check, effect, reason or source id.
- `"monthly"` means the main role's spread day. `ai` is a base weight, multiplied while a condition
  holds; the computer picks by weight. Each card shows what every choice does (DESIGN.md).
- Historical events list their source ids (such as `hist-lt-1219`) and fire only while their
  conditions hold, so a changed history stays consistent. Made-up events say `"invented": true`.

## 9. Map data (step 2: 2a, then 2b)

Step 2 is split (Ignas, 6 October 2026): **2a** is the map itself; **2b** is the 1219 provinces
and holdings, planned with him after 2a. The approved 2a plan is in docs/HANDOFF.md, section 2.

**Ignas's step 2 answers that change earlier plans:**
- A 1 km terrain map replaces "a small terrain grid per province (for example 32 by 32 cells)".
- No hard size limit replaces "map JSON under about 500 KB"; the test is first map on screen in
  under 3 s on his phone.
- Names of the time, changing with the game's date (the research had proposed today's names). Later, 11 October 2026: no slider; the map follows the game's date.
- Share-alike data is allowed ("free forever"), in separate files.
- The five ice-age slices are built properly in step 8; 2a gives a rough preview.

**Area, projection and units:**
- Area: 12°E to 34°E, 50°N to 61.5°N.
- Projection: Lambert azimuthal equal-area, the same formula as EPSG:3035 (ETRS89-LAEA), but
  centred on 56°N 23°E instead of 52°N 10°E. North is up over Lithuania and leans less than 10°
  at the edges (about 9.5° at the northern corners); areas compare fairly.
- Game coordinates are whole numbers in 100 m units, about 15,720 × 13,270 units (about 1,572 by
  1,327 km). Whole numbers keep the geometry maths exact on every device (section 4).
- Tests: the formula matches the official EPSG:3035 test point (run with EPSG:3035's own centre),
  and converting there and back returns the same point.

**Files and pipeline:**
- `npm run map` fetches raw data into `data/raw/` (git ignores it). For each raw file it records
  the link, date, fingerprint, collection id and licence status (read or not yet read).
- A collection whose host is blocked waits. Claude asks Ignas to allow that one host only when a
  milestone needs it (Ignas, 6 October 2026).
- `npm run map` then builds `src/data/map/`, which goes into git, so nobody needs to run the
  pipeline to build the game. A shipped file from a source whose licence is not yet read fails
  the build.
- Files with share-alike licences (ODbL, CC BY-SA) are kept separate from the rest, each with its
  own licence note, because ODbL and CC BY-SA can't be mixed in one file.
- `.gitattributes` keeps map files byte-identical on Windows. Tests check the committed files
  against their recorded fingerprints, and rebuild a small sample to prove the same bytes come out.
- Tools are plain Node scripts written for the project (projection, GeoJSON reader, TIFF reader,
  resamplers, packers). No new dev dependencies. Rivers come from data, never traced by computer.

**Formats:**
- Lines (coasts, rivers, lakes, later province borders): whole-number coordinates, shared borders
  stored once, packed as text.
- Grids (terrain, height): packed bytes, unpacked in the browser by its built-in
  `DecompressionStream` (fine on Chrome for Android, Ignas's phone).
- Rule-made data (the road-cost grid, anything worked out by a rule) is rebuilt at start-up as
  derived data, never stored in the map files or the save.
- Size: no hard limit. Every build reports the map size, and a test fails if one file suddenly
  balloons (a sanity check, not a budget).

**The 1 km terrain map** (replaces the 32 by 32 grid per province):
- One grid for the whole map at 1 km cells: land cover (forest, marsh, open land, water and so
  on), water and height. A province's terrain is its own cells, worked out at load as derived data.
- Every province shares one cell size, so battlefields compare fairly.
- Battle maps (step 6) and town maps (step 7) are generated finer from these cells plus the
  holding's site, by hash, like untouched holding layouts (section 4). Looking at one never
  changes the save (section 5).
- 1219 forest share is estimated from pollen (REVEALS, an AD 750–1250 average) and labelled so.

**Time slices:** today and 1219 in full. AD 1 and the five ice-age slices (10,000, 9,500, 8,500,
7,500 and 5,000 BC) are prepared as data in M3b, each with a sourced note; played properly
in step 8. One base coast (Natural Earth) is used by every slice, so the coast doesn't jump where
nothing changed; 1219 and 1 AD add local fixes, each with a source or marked TO CHECK.

**Names over time.** Rivers, lakes and seas keep their names in one list, not in the water data
(built in M3a, PR 2; see "As built in M3a, pull request 2" below). Each feature is named by its kind
and Wikidata id, and carries every form with years, language and source. Where no name of the time
is sourced, today's name stands in; the data never stores that, it is worked out when needed.
- A test checks that every form names a source, and that every listed feature is found in the water.
- Provinces and holdings (later steps) will follow the same idea.

**Sources and credits:**
- data/sources.md lists collections (Natural Earth, OpenStreetMap, GEBCO and so on), each with a
  short id and its licence quoted once read. Records cite `collection:id`, such as
  `osm:<feature id>`.
- A small machine-readable index of the collection ids lets tests check that every cited
  collection exists and its licence was read before the file ships.
- One credits list builds both the in-game Credits screen and `ATTRIBUTION.md`: owner, licence and
  link, the required notice, and what we changed.

**Drawing (2a):**
- Terrain is painted once into cached image tiles, so panning reuses them. Pixel density is
  capped at 2.
- Less detail when zoomed out; far-away detail drops first (Ignas's rule).
- A placeholder fog-of-war layer is in the speed test from the start, so its cost is known.
- Speed targets on his phone: 95% of frames under 16.7 ms while panning, a full redraw under
  50 ms, first map in under 3 s from the saved copy.

**As built in M2 (7 October 2026):**
- **Raw data** goes in `data/raw/` (gitignored), fetched by range requests with retries and a
  cache. `data/raw/manifest.json` records every file's link, size and fingerprint. Raw GLWD files
  are never committed: their authors ask that the data not be put online again in its original
  form.
- **Derived grids** go in `data/raw/derived/` (gitignored), each with a `.json` sidecar of inputs and
  parameters: heights (2 km, from GEBCO's official tile), land cover (1 km, ESA WorldCover), marsh
  (1 km, GLWD v2 plus WorldCover's wetland class), pollen shares (1°, SpatioCompo), and the 1219
  terrain classes (1 km). The tools are plain Node: a small TIFF and BigTIFF reader, area-averaging
  resamplers, and a PNG writer for preview pictures.
- **The 1219 terrain rule.** The pollen forest and conifer shares are smoothed between 1° cell
  centres. Marsh comes first (cells at 50% marsh or more), then dunes and heath; both come out of
  the pollen "open" share. Forest is then chosen by a score: today's tree cover, height, roughness,
  distance from rivers, wetness and a fixed hash. Score thresholds are smoothed so that each 1°
  cell meets its pollen share within 3 points with no visible steps. Conifer versus broadleaf
  follows the same method. It is a rule, not evidence, and the game says so.
- **Data blocks, split by licence.** The packer (`npm run map:pack`) writes committed JSON blocks,
  each `{kind, format, licence, notice, sources, meta, bundle}`. The bundle is the M1 packed format,
  deflated and base64.
  - `src/data/map/base.json`: public domain. Natural Earth land and coast, GEBCO heights.
  - `src/data/by-sa/terrain-1219.json`: CC BY-SA 4.0, because of the pollen maps. Its inputs are CC
    BY and public domain, never OpenStreetMap: ODbL and CC BY-SA cannot be mixed in one file.
  - The water block: Natural Earth in M2 (public domain). From M2b it is the OpenStreetMap block
    `src/data/odbl/water.json` (ODbL 1.0). It is read from Overture's official S3 copy with
    `tools/map/parquet.mjs` (footer, row-group and column range reads) and grouped by the cached
    OSM river relations. Labels are made at pack time: today's local name per stretch, romanised
    to Latin letters (`tools/map/romanize.mjs`, BGN/PCGN), and lake labels without the word for
    "lake". The original names stay in the data. The block is cut into tiles per detail level
    (`src/ui/map/water-tiles.js`), so only tiles near the view are drawn. Small rivers appear only
    when zoomed in. Natural Earth water is not shipped alongside it, because OSM's horizontal-layer
    rule forbids mixing.

  Lakes are never written into the terrain grid; the game draws them from the water block at load.
- **The build** inlines each block as its own `<script type="application/json" id="gs-<kind>">`
  element. The browser doesn't parse these as code, which keeps start-up fast.
- **The licence guard.** The build fails if a block names a source whose `licenceStatus` in
  `tools/map/sources.json` is not 'read', or if a block is an interim stand-in. The only way round
  it is `--allow-interim`, for local previews, never in CI.
- **Credits.** `tools/map/sources.json` holds every source's licence quote, where it was read, its
  credit and its changes. From it, `tools/map/attribution.mjs` generates `ATTRIBUTION.md` and
  `src/data/credits.json` (the Credits screen). Tests fail if either is stale.

**Provinces, borders and holdings (2b):**
- **Per province:** id, names by era, other-language names, outline, centre, terrain (plains,
  forest, hills, marsh, lake shore, coast, from its cells), neighbours, coast, rivers, historical
  land, first-mention year, sources. 150 or more in the Baltic core. No province is invented to
  reach 150.
- **Lithuania:** the lands and castle districts named in 14th-century sources, each with its
  first-mention year.
- **How provinces are made:** each grows from a sourced seed point over the 1 km terrain, with
  border rivers named in sources acting as walls. Modern units only check the result.
- **Border kinds:** every border piece records its kind: *sourced* (a line a source gives, with
  its source ids) or *guessed* (drawn by a stated rule, marked invented). The two are drawn
  differently: guessed borders look softer.
- **The lands** (Lithuania proper, Deltuva, Nalšia, Samogitia: TO CHECK) as groups of provinces.
- **Holding sites only where sourced.** A point only at a real, sourced and dated site. Broadly
  dated sites show in the panel as "possibly in use"; disputed sites show their candidates, with
  no point; a holding with no sourced site is listed in its province panel.
- **Links** between provinces by river, sea and road, for movement, supply and trade. Winter routes
  over frozen marshes, rivers and lakes need seasonal links too (step 5, Ignas). Roads are not
  drawn by hand: they develop by themselves between busy places (Ignas), so the map only needs to
  say where a road could run (the road-cost grid, rebuilt at start-up).
- Province ids enter saves from 3a. Changing them after that needs a save migration (section 4).

**Sources for every item** (province, border, holding site, river, name), by `collection:id` or
by ids from data/sources.md.

**As built in M3a, pull request 1 (the map follows the game's date; no slider):**
- **The date engine** is pure rules in `src/sim/map-date.js` (the map year of a game day, dated
  features, the land of any year from anchors and change planes, with `prepareStep` to work out
  switch years ahead in small pieces) and `src/sim/coast-date.js` (the northern coast's field,
  `seaAt` and `step`). Nothing new is saved: the map for a date is always worked out again from
  the shipped blocks, so it can't break a save. `src/ui/map/dated.js` puts the two together for
  the view (what changes when the year moves) and runs in Node for tests.
- **Data blocks by licence:** `src/data/by-sa/terrain-time.json` (CC BY-SA 4.0, the pollen-based
  land over time, 691 KB), `src/data/by/coast.json` (CC BY 4.0, the northern coast, 70 KB),
  `src/data/own/changes.json` (our own work: dated facts, drawn shapes, Żuławy's cells, 15 KB),
  and the ODbL water block with its date tags (`riverTag`, `lakeTag`, `info.tags`). The build
  fails if a CC BY block holds anything but CC BY or public-domain data, if an ODbL block holds
  anything but OpenStreetMap's, or if our own block holds anyone else's. The game file grew from
  2.0 MB to 2.8 MB.
- **Loading:** a new game's first picture needs none of this. The three blocks sit after the code
  in the page and are unpacked just after the rivers and lakes, in pieces with a frame between
  them (about 0.25 s in headless Chrome, 1.1 s with the processor slowed 4x). A save from a later
  year unpacks them first and moves the 1219 grid to its year before the first picture, so it
  never shows 1219 first (`data-map-year-at-first-paint` lets the shots check it). The first map
  of a new game measured 106% to 110% of M2b's in headless Chrome slowed 4x (about 1.3 s against
  1.25 s; the runs vary by about 15%): over the 5% target, because the page carries 0.8 MB more.
- **Drawing while the date runs:** the view does its date work in its own animation frames,
  about 3 ms of each: it moves the date, writes changed land cells straight into the terrain
  tiles' kept image data (`paintTerrain` keeps each 512 px tile's pixels, about 8.4 MB), copies
  changed tiles to their canvases (on-screen tiles first) and, with time left, prepares the
  land's coming changes. The kept frame is painted again in one go, at most every 250 ms, no more
  often than 12 times what one paint costs (copy to the screen included), and never while a
  finger or the mouse is down or a zoom is under way. The names already placed are drawn again
  as they are; they are placed anew (with up to 32 ms to place them, so none are left for a
  second paint) only when a dated river or lake comes or goes, or the old sea moves. Painting in
  strips over several frames was tried and dropped: in headless Chrome each strip cost most of a
  whole paint, as the big outlines are drawn whole each time, so its time run (slowed 4x) had
  about 100 frames over 12 ms with strips and about 40 without.
- **Water by date:** `cutWater` still cuts once per zoom level and leaves dated features out;
  `cutDated` gives them as small sets per tag, drawn when `tagsOnAt` says the tag is on. Names
  skip features that are off and places under the old sea. Our drawn shapes (outlets as sea,
  Ruden as land, the larger Lake Drużno) come from `changes.json`.
- **The old sea** (an estimate) is drawn from `src/ui/map/shore.js` for a box round the view,
  rebuilt only when the coast's level changes (every 4 game years) or the view leaves the box.
  Zoomed out it reads the field coarser (2 km cells, then 1 km; 500 m close up). Its path has no
  closePath: in Chrome each closePath slows down with every ring already in the path (10,000
  rings took over half a second).
- **Measured:** one map run from 1219 to 2021 a year at a time takes about 0.35 ms per map year
  in Node and changes 667,896 cells (the soak checks it ends on today's anchor). The speed test's
  time run (1219 to 2021 at speed 5, 9,758 frames) in headless Chrome slowed 4x: 100% of frames
  on time, 95% under 16.7 ms; date work per frame median 0.0 ms, 95% under 4.3 ms. Its worst
  frames (about 0.5 s, about 40 of them) are whole repaints of the frame at the overview, which a
  headless canvas makes slow (M2b's own full redraw of that view takes 0.4 to 0.6 s there too);
  Ignas's phone paints a full frame in 11 ms.
- **The hidden test link** `#date=1550` pins the map to a year without changing the game's date;
  `#date=1550&view=x,y,scale` also places the camera, for the screenshots. Later `#10000BC`.

**As built in M3a, pull request 2 (the names change; the tap panel):**
- **The names block** `src/data/own/names.json` (our own work, made by `tools/map/pack-names.mjs`
  from the hand file `tools/map/names-of-the-time.json`; `npm run map:pack` runs it): one JSON
  layer with `sources` (title, author, year written, or "about"), `languages`, `regions` (Lithuania
  has the rule "today's names"), `periods` (per region: from, to, language), `features` (river or
  lake, Wikidata id, and its forms) and `seas` (with a ring of points for a gulf). A form may
  name `stretches` (the text one of the river's lines shows today) and carries marks (TO CHECK,
  estimate, disputed) and `map: false` for a form kept for the panel only. The packer checks that
  every Wikidata id matches exactly one river or lake of the shipped water, every stretch text is
  one a line shows today, and no web address or Cyrillic gets in. It is an EARLY block (before the
  code, next to the water): the page reads it with the water, so the first picture of the water
  already has its names. A damaged block logs a console warning and the map keeps today's names.
- **The resolver** `src/ui/map/names.js` (pure, runs in Node): `linkNames` joins the list to the
  shipped water (a group per lake or river stretch; lines of listed rivers all have a group), and
  `nameAt(group, year)` gives the name by one rule: a group takes the name its region's records give
  for the year, in the language that region's period uses; a region with the "today" rule, or no
  record, or no period keeps today's name. "Of the time" is worked out, never stored: a name counts
  as of the time when its source was written within 25 years of the year shown
  (`OF_THE_TIME_YEARS`, Ignas, 25 October 2026); a source further off is marked "later source".
  Medieval forms end in 1400 (a game choice, TO CHECK). `changeYears` lists the years when anything
  changes, so `epochAt` says in one binary search whether the names on the map must be placed
  again. `namesAt(year)` returns the text for every line and lake.
- **On the map:** `labels.js` reads the text from that view, so only a real text change places the
  names anew (`renamed`, a separate path from a full repaint); the map's date pass calls it. It
  cost a median 12 ms, worst 18 ms in headless desktop Chrome, and a median 101 ms with the
  processor slowed 4x (two changes in the time run).
- **Tap** `src/ui/map/hit.js` (pure): `createTapTracker` counts a touch as a tap when it is one
  primary pointer, up within 600 ms and 10 px (it holds the pan until 10 px, then releases it by
  the whole distance). `hitWater` decides in order: a placed name (circles along the label), the
  old sea, a lake (unless a river runs within 6 px), a river within 20 px, then today's sea. A gulf
  ring (Riga, Finland) covers the land around it, so a sea is picked only where the point is open
  sea first, and then the ring decides which sea. Our drawn land (Ruden) still taps as the Baltic Sea.
- **The panel** `src/ui/water-panel.js` shows `panelInfo` (names.js): the title (today's name), the
  kind, "Name now" with its source and marks, "Names over time" (name, years, language, source,
  marks; `stretches` lists the other stretches of the river that share a name), "Today" (today's
  name, how it is written in the data, other names) and the dated facts. It reuses the Credits
  sheet's style. A tap on empty land closes it; it is written again when the names change.
- **Start-up fix:** the three late blocks (terrain-time, coast, changes, 0.8 MB) now sit after the
  code as HTML comments, `<!--gs:<kind>` then the JSON with "<" and ">" written as `\u003c` and
  `\u003e`, not as script elements; the game reads them back (`lateComment` in main.js) when it needs
  them. The licence guard and every block test still run on the block texts. Measured in headless
  Chrome slowed 4x, 16 runs in turn, first map median 1464 ms against 1501 ms with script elements
  (a 2 to 3% gain). Against M2b (2.0 MB, 1393 ms) the first map was 106 to 107% in two runs and
  98% in a third (the machine's noise is about 5%). What remains is the code: 102 KB against 53 KB
  in M2b, so the page's code starts about 50 ms later (scriptStartMs 570 against 520).
- **Fonts:** the label font (Grenze Gotisch, subset to Latin Extended) draws every letter of the
  shipped names (checked: ǫ, Â, ê, æ, and a test keeps the names inside the subset's ranges).

## 10. Invariants and soak outputs

Checked every game year in soak runs; tests feed them broken states to prove they catch errors.
From HANDOFF and step 1:
- No NaN or Infinity anywhere, and only plain JSON values; the day is a whole number between
  10,000 BC and 9999 AD; `rng` holds 4 unsigned 32-bit whole numbers, not all zero.
- Every province has a living holder; every title has a living holder or none.
- Nobody is their own liege, liege chains have no loops, and every liege holds land.
- Every army belongs to an independent ruler and has a positive size.
- Every war has both sides; war scores stay between −100 and 100.
- Save, load and continue gives exactly the same result as continuing without saving.

New:
- Opening any look-only view, a holding included, never changes the save.
- Every holding gives all six outputs, finite and in range.
- Every log line and memory has a known reason id; memories respect the cap and expire in the future.
- Every id in the save points to something that exists, or to a removed person's small record.
- From 3c, every price is finite and inside its limits.
- Every old fixture save migrates and loads. No system writes another's slot (section 2).

Soak outputs (`npm run soak`: 100 seeds from 1219 to 1569; a skeleton until step 3):
- Errors (must be zero); time per game year, and the slowest single day.
- Save size, save bytes per living character (from 3a), and living characters over time.
- Start-up time: loading a late save and rebuilding the derived data (budget 3 s).
- History numbers, such as how often the Orders reach Samogitia's border by 1300 (HANDOFF). They
  guide tuning and are not pass or fail. Show them to Ignas.
- By the end of 3c, the step-3 part of the example chain in LEVELS.md runs as a scripted test;
  links 8 to 10 join in steps 5 and 6.

## Sources for the game mechanics above (read only through search-result extracts)

- CK3 Dev Diary #19 (factions): https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-19-factions-and-civil-wars.1363951/
- CK3 Dev Diary #17 (vassals): https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-17-governments-vassal-management-laws-and-raiding.1352640/
- CK3 wiki: https://ck3.paradoxwikis.com/Vassals. Victoria 3 wiki: https://vic3.paradoxwikis.com/Market

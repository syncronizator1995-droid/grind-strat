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
- Names of the time, changing with the time slider (the research had proposed today's names).
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
- Tools are plain Node scripts written for the project (projection, GeoJSON reader, GEBCO
  text-grid reader, packers). No new dev dependencies. Rivers come from data, never traced by
  computer.

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

**Time slices:** today, 1219 and 1 AD in full. The five ice-age slices (10,000, 9,500, 8,500,
7,500 and 5,000 BC) are a rough preview, labelled rough, each with a sourced note; built properly
in step 8. One base coast (Natural Earth) is used by every slice, so the coast doesn't jump where
nothing changed; 1219 and 1 AD add local fixes, each with a source or marked TO CHECK.

**Names per era.** Every named place (river, lake, sea, later province and holding) stores its
names by era. A proposed shape:
```json
{ "names": {
    "today":  { "name": "Daugava", "sources": ["ne:<feature id>"] },
    "1219":   { "name": "Daugava", "standIn": true },
    "1 AD":   { "name": "Daugava", "standIn": true } },
  "other": { "lt": "…", "lv": "…", "et": "…", "pl": "…", "de": "…", "ru": "…" } }
```
- `standIn: true` means today's local name is standing in because no name of the time is sourced.
  The map shows the name for the slider's era. The panel shows every name with its sources.
- A test checks that every named feature has a name per era, or a marked stand-in, and a source.
- The values above are an invented example of the shape, not data.

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

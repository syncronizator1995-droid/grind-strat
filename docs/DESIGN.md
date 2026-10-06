# Grind Strat: design

A snapshot of Ignas's living plan, 6 October 2026. If Ignas says something different now, he wins:
update this file. Everything here stays open to change.

Updated on 6 October 2026 in Claude Code with Ignas's answers to a questionnaire, and again the same
day with his answers for step 2 (the map). Each answer is a row in "Decisions so far" at the end;
docs/LEVELS.md explains what each one means in play.

## The game

A slow, deep grand strategy game for your phone, in English. You start as a band of hunters in
10,000 BC, just after the ice retreats, and carry your people through every age to today.
Prehistory moves in big jumps; from the tribal age on, time runs continuously with speed buttons.

It combines Crusader Kings 3 (family and intrigue), Europa Universalis 4 (realm and diplomacy),
Hearts of Iron 4 (war and supply), Total War (battles), Manor Lords (towns) and Far Cry Primal
(hands-on action). Every layer feeds the others, so one choice shows up everywhere.

It is played in portrait, top-down and offline, and saves on the phone. You play a hunter band,
then your tribe, then a dynasty in the Middle Ages, then the country. There is no time limit:
pause and speed buttons work like Paradox games, and battles can be fast-forwarded like Total War.

## What matters most

| Layer | Ignas's rank | Inspired by | Depth in the first playable |
| --- | --- | --- | --- |
| Dynasty and intrigue | 1 | Crusader Kings 3 | Deep |
| Realm and diplomacy | 2 | Europa Universalis 4, Crusader Kings 3 | Deep |
| War, supply and fronts | 3 | Hearts of Iron 4 | Medium |
| Battles | 3, with war | Total War, Manor Lords, Arma Reforger | Medium |
| Towns | 4 | Manor Lords | Simple |
| Hands-on action | Extra | Far Cry Primal | Simple |

Every layer exists from the first playable version, because Ignas wants everything in one game.

## How the layers connect

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
That chain is where the depth comes from.

## Levels of play

- docs/LEVELS.md, for Ignas: what you do at each level of the Middle Ages, from you in person up
  to distant powers; what a typical 10 minutes looks like; and how the levels feed each other.
- docs/ARCHITECTURE.md, for Claude Code: the technical rules that stop the parts of the game from
  breaking each other, such as who may change what, saves, time and detail.

## How time works

Time moves at different speeds in different ages, so 12,000 years stay playable.

| Age | How time moves | Typical step |
| --- | --- | --- |
| First hunters | Hands-on scenes in real time, then jumps forward | A season played, then a jump of a few hundred years |
| Crafts, farms and amber | Chapters with choices between jumps | Decades to a century per chapter |
| Tribes and hillforts | Continuous time on the map | Months, with speed buttons |
| Middle Ages to today | Continuous time on the map | One day per tick, with speed buttons |

- Speed buttons on the map: pause and five speeds, like Paradox games.
- Battles: pause, normal, double and quadruple speed, like Total War.
- Big moments pause the game and wait: events, births, deaths, war declarations.
- A jump never skips a decision the player must make; it stops and asks.

## The ages

**First hunters**, 10,000 BC to about 5000 BC
- You play: one hunter and a small band, hands-on.
- What changes: bands, hunting, survival, wild beasts.
- Key moments: the game starts here.

**Crafts, farms and amber**, about 5000 BC to 100 AD
- You play: your people, whose customs, beliefs and lands you shape.
- What changes: settling down, first fields, amber trade.
- Key moments: new peoples arrive about 3000 BC.

**Tribes and hillforts**, about 100 AD to about 1200
- You play: your tribe among rival tribes.
- What changes: named tribes, raids, pagan faith, amber trade.
- Key moments: amber for Rome, Viking raids, tribute to Rus'.

**Grand Duchy and Middle Ages**, about 1200 to 1569
- You play: a dynasty, like Crusader Kings 3.
- What changes: unification, castles, wars with the Orders.
- Key moments: crowned 1253, converted 1387, Grunwald 1410.

**Commonwealth and gunpowder**, 1569 to 1795
- You play: the country, like Europa Universalis 4.
- What changes: elected kings, a nobles' parliament, muskets.
- Key moments: Union of Lublin 1569, the Deluge 1655, the partitions.

**Empires and revolutions**, 1795 to 1918
- You play: the country, or its fight for freedom if an empire has taken it.
- What changes: imperial rule, uprisings, national revival.
- Key moments: uprisings 1830 and 1863, the press ban until 1904.

**World wars to today**, 1918 to today
- You play: the country, like Hearts of Iron 4.
- What changes: fronts, ideologies, occupation, resistance.
- Key moments: independence 1918 and 1990, NATO and the EU 2004.

Each age gets the same space here, whatever its length. Before about 1200 the history is the
player's to write; after that it follows this path unless the player's choices bend it.

## Who you play, and how one hands over to the next

1. A hunter and a band: you control one hunter directly; the band follows and works the camp.
2. Your people: you shape customs, beliefs, crafts and where your people live.
3. Your tribe: you lead a tribe among rival tribes, with chiefs, feuds, raids and trade.
4. A dynasty: you play one ruler at a time and continue as the heir, Crusader Kings 3 style.
   The game ends only if your house holds no land.
5. The country: you run the state, like Europa Universalis 4 and later Hearts of Iron 4.

What carries over at each hand-over:

- Your people's traditions and legends become bonuses and quirks later, such as skilled forest
  fighters or shrewd amber traders.
- The tribe you led becomes the starting realm of your dynasty, with your chief's line as the first house.
- Your dynasty's final state becomes the country you run, with its laws, lands and reputation.
- If history has taken your land, you play the fight to win it back: a rising, a government in exile,
  a resistance.

## Hands-on action: the first hunters

The game opens as top-down 2D action inspired by Far Cry Primal. You are one hunter at the edge of
the melting ice.

- Controls: a thumb stick on the left, actions on the right (attack, throw, sneak, use, call the band).
- Survival: warmth, food and wounds matter, and winter kills without fire and shelter.
- Hunting: track herds, read the wind, drive game with the band, and throw spears.
- Crafting: stone blades, spears, clothing and shelters from what you hunt and gather.
- Danger: predators, cold, thin ice and rival bands.
- The band: members have names, skills and moods, and they can be lost.
- The land: tundra and young forest beside a huge meltwater lake, built from the real map of the time.

The animals, plants and tools of each period come from research sources, not guesses. The same action
engine later handles raids, hunts and duels for the player's chief or ruler.

## Your tribe's story

Before the crusades, the history is the player's to write.

- Customs: how you bury your dead, which festivals you keep, how you choose a chief. Real differences
  can seed this: early medieval Samogitia is known for skeletal burials and Aukštaitija for cremation.
- Beliefs: gods, sacred groves and fires, priests and omens, which shape morale and choices.
- Legends: the game remembers what your people lived through and turns it into named legends,
  such as the winter the lake broke.
- Lands: where you settle, which hills you fortify, which rivers you control.
- Neighbours: other tribes with their own stories, alliances, feuds, marriages and raids.
- Crafts and discoveries: stone, then pottery, farming, metal and hillforts, unlocked by what your
  people do.
- Trade: amber first, then furs, wax and honey.
- The outside world: distant powers touch you only through traders and raiders, until the Christian
  world notices the pagan Baltics around 1200.

Outside contacts, roughly in order:

| When | Who | What reaches your people |
| --- | --- | --- |
| About 97 AD | Rome | Tacitus describes the Aesti; amber travels south along the Amber Road |
| 9th to 11th century | Vikings and Danish kings | Raids on the coast, and tribute at times |
| 10th to 11th century | Kievan Rus' | Tribute demanded from Lithuanian lands |
| 1009 | Bruno of Querfurt, a missionary | The first written mention of Lithuania |
| Early 13th century | German crusading orders | The crusades begin, and recorded history takes over |

## Dynasty and intrigue: the Middle Ages

The deepest layer, and the first one built.

Characters:

- Five skills: diplomacy, martial, stewardship, intrigue and learning.
- Traits: personality, education, inherited (strong, quick-witted, beautiful) and health.
- Opinions with visible reasons, so you can see why someone likes or hates you.
- Stress, as an idea to test: acting against your character's nature costs stress.
- Age, illness, wounds and death, with child rulers and regents.
- Friends, rivals and lovers, in step 4.

Family:

- Marriages create alliances between ruling families.
- Children pick an education focus at six and finish at sixteen.
- Succession laws change over time. Land is split between sons until a stronger law is adopted.
  Gediminid rulers were hereditary but chose the son they thought most able, which suggests a
  chosen-heir law.
- Inheritance starts sons first (sons before daughters); laws and events can change it.
- Younger branches and rival relatives can claim your titles.

Intrigue:

- Schemes: forge a claim, win someone over, kill a rival, spread rumours.
- Secrets: pagan worship after conversion, children born outside marriage, past murders.
  A secret you find becomes leverage.
- A spymaster and council defend you against plots. Both come in step 4.
- Computer rulers know only what their character would know: a rival can't use your secret unless
  he has found it.
- Intrigue carries on in every age: feuds between clans before, court plots during, politics after.

Faith:

- Pagan, Catholic or Orthodox. Converting changes allies, enemies and the crusade threat.
- When Jogaila took Catholic baptism, one aim was to take away the Teutonic Knights' reason
  for crusading.

Titles and realm:

- Land dukes, the grand duke, and a possible crown: Mindaugas was crowned king in 1253.
- Creating the Grand Duchy takes size (enough land) and renown, your house's fame. The numbers are
  set in step 3a.
- Vassals with loyalty, taxes, soldiers and revolts.

Starting point (proposed): 1219, when 21 Lithuanian dukes signed a treaty with Galicia–Volhynia.
The five elder dukes were Živinbudas, Daujotas, Dausprungas, Mindaugas and Vilikaila.

- In 1219 there is no Grand Duchy yet. Playing Lithuania, you start as one of the dukes of the 1219
  treaty; the Grand Duchy is a title that can be created.
- A land can have more than one duke: in 1219 Samogitia's dukes included Erdvilas and Vykintas.
- In 1219 there is no Teutonic or Livonian Order in the region yet. The crusading neighbours are
  the Livonian Brothers of the Sword, founded in 1202 by Bishop Albert of Riga, and the Bishop of Riga.

History's path after 1219, followed unless the player changes it:

| Year | What happened |
| --- | --- |
| 1226 to 1230 | Konrad of Masovia invites the Teutonic Knights, who settle in Chełmno and attack Prussia |
| 1236 | Samogitians under Vykintas crush a crusading order's army at Saule (the Sword Brothers: TO CHECK) |
| 1237 | The Livonian Order merges into the Teutonic Knights |
| 1241, 1259, 1275 | Golden Horde raids reach Lithuania |
| 1251 to 1253 | Mindaugas is baptised and crowned king |
| 1260 | Samogitians win at Durbe, and the Great Prussian Uprising follows |
| 1263 | Mindaugas is murdered |
| 1385 to 1387 | Union of Krewo with Poland, then conversion |
| 1410 | Grunwald: the Polish–Lithuanian army defeats the Knights |
| 1422 | Treaty of Melno: Samogitia recovered for good |
| 1569 | Union of Lublin creates the Commonwealth. Your dynasty carries on (Ignas, 6 October 2026): you can try to save it and change history |

## Realm and diplomacy

- Provinces: terrain, wealth, people, culture, faith, buildings, a fort and a seat.
- Holdings: camp, village, hillfort, castle, chartered town, city.
- Money: taxes, trade and tribute, spent on armies, buildings, gifts and bribes.
- Diplomacy: marriages, alliances, tribute, vassals, truces, peace deals and unions between crowns.
- Wars need reasons: claims, holy wars, independence, or a title's rightful lands.
- Coalitions: realms gang up on whoever grows too fast, as in Europa Universalis 4.
- Trade: amber, furs, wax, honey, grain and timber along the rivers, then the Hanseatic towns.
  Later the Commonwealth shipped grain from Danzig to Amsterdam.
- Laws: clan councils, feudal law, a nobles' parliament where one veto could block everything,
  and in 1791 a written constitution.
- From the crusades on, computer-run realms follow their historical goals by default: the crusading
  Orders push into pagan lands and Rus' princes demand tribute, unless someone stops them.
- Factions inside your realm: your own vassals band together to demand something. The first type,
  a relative claiming your throne, comes in step 3 (3b); more types later.
- Vassal terms: each vassal has his own fine-grained terms, such as tax and soldiers, set one by
  one, closer to Crusader Kings 3. Which terms: designed in 3b.
- The full market: goods, prices, merchants and regional markets, so prices move with harvests and
  trade. It arrives in step 3c, with harvests.

## War, supply and fronts

- Army makeup by age: hunters and warbands; tribal warriors and mounted raiders; levies, retinues,
  knights and crossbowmen; pikes, muskets and cannon; line infantry and artillery; rifles,
  machine guns, tanks and aircraft.
- Roads develop by themselves where traffic needs them (Ignas, 6 October 2026); rivers and the sea
  are routes from the start.
- Supply: food comes from provinces and towns. Armies carry little, forage the land, and starve in
  poor or plundered country.
- Seasons: winter freezes marshes, rivers and lakes and opens routes closed in summer, and the thaw
  turns roads to mud. The Battle of Karuse in 1270 was fought on the ice near Saaremaa.
- Raids or conquest: tribal war is mostly raiding for loot and captives, as early Lithuanian war bands
  did. Conquest needs forts and sieges.
- Simple wars come first, in step 3b, with battles settled automatically. Supply, seasons and
  frozen winter routes come in step 5.
- Hunger and unrest: from step 3c, hunger raises a province's unrest, which cuts its tax and
  soldiers. From step 5, very high unrest can become a peasant revolt with rebel armies.
- Sieges: walls slow them, starving a fort works, and storming one is bloody.
- War score and peace: battles and occupation build a score that decides the peace terms.
- War exhaustion: the longer a war drags on, the worse your armies fight (step 5).
- Commanders are characters with traits and skills: they can die, defect or win fame.
- Fronts: from the age of revolutions, front lines and battle plans like Hearts of Iron 4, with
  factories and supply lines.

## Battles

- Battlefield: built from the province where the armies meet, with its terrain, rivers, forests,
  season and weather.
- Portrait layout: your army starts at the bottom of the screen and the enemy at the top.
- Units: formations of soldiers with morale, tiredness, ammunition and a facing.
- Orders: tap a unit and drag to move or turn it, use formation buttons, pause anytime.
- Command: your commander has a reach; orders to distant units travel by messenger and arrive late.
- Sight: forests and hills hide troops, so scouting and ambushes matter.
- Weather: rain weakens bows, mud slows charges, frozen lakes hold or crack.
- Characters on the field: relatives fight in person and can be killed, wounded or captured for ransom.
- After the battle: losses, prisoners, war score, and a story for the chronicle.
- Auto-resolve: small fights can be settled instantly.
- Limit: 2D and top-down, with a few hundred soldiers on screen.

## Towns

- Hand-built seat: families, plots, workplaces and production chains, like Manor Lords.
- Growth with the ages: hunters' camp, village, hillfort, castle town, a town with its own law
  (Vilnius received Magdeburg rights), then an industrial city planned like Cities: Skylines.
- Feeding the rest of the game: grain becomes army food, iron becomes weapons, horses become cavalry,
  trade goods become gold.
- Seasons and approval: families need food, firewood and safety; unhappy towns shrink.
- Every holding in your realm can be built by hand like Manor Lords, even a vassal's, though
  vassals may resent it. (Ignas, 6 October 2026. This replaces the earlier "Other holdings: run
  from the realm map with build menus".)
- While you are inside a holding, the realm clock slows to speed 1; big events still pause it.
- Sieges and raids of any holding you built, your seat included, are fought on its own layout.
- A holding you built keeps your work when it changes hands, for example to a brother under split
  inheritance; only the holder changes.
- Holdings nobody is building still grow, but very slowly compared with built ones.
- You can look at neighbouring lands only partly, like fog of war; you see inside a holding through
  a direct tie such as a visit, a hunt together or letters.
- Far future: a Stellaris-style age beyond today is a maybe.

## The map through time

The map covers 12°E to 34°E and 50°N to 61.5°N (south edge chosen by Ignas on 6 October 2026; the
rest from the approved 2a plan): from eastern Zealand and Bornholm to Novgorod and Lake Ilmen, and
from Volhynia to the Gulf of Finland and Stockholm. Galicia lies just off the south edge, in less
detail, like the other neighbouring powers. Coasts, rivers,
lakes and ice must match research for each period, with every source recorded. The main goal is a
polished, error-free Lithuanian playthrough that holds together however the player changes history.

- Provinces: 150 or more in the Baltic core in 1219. Lithuania's are the lands and castle
  districts named in 14th-century sources, each showing the year it was first mentioned.
- Borders: a border a source gives is drawn firmly; a border guessed by a rule looks softer.
- Holdings: every holding is a point on the map, at its real, sourced site only. A holding with no
  sourced site is listed in its province's panel until research finds the site.
- The look: terrain is drawn (forests, marshes, rivers, lakes), with realm colours tinted over it.
- Names: names of the time. Moving the time slider changes them: 1219 shows the forms used in
  sources of that age, today shows today's local names. Where no name of the time is sourced,
  today's name stands in, marked so. Tap a place for all its names and sources.
- Terrain: one 1 km terrain map covers every province. Battle maps (step 6) and town maps (step 7)
  are made finer from it later.
- Time slices: today, 1219 and 1 AD in full from step 2a. The five ice-age slices get a rough
  preview and sourced notes in 2a, and are built properly in step 8, with the hunters.
- Credits: a Credits screen lists every data owner, the licence and what we changed.

The Baltic basin changed shape after the ice:

| Stage | Roughly when | What the map shows |
| --- | --- | --- |
| Baltic Ice Lake | Until about 9,670 BC | A freshwater lake dammed by the ice sheet, above sea level |
| Yoldia Sea | About 9,750 to 8,750 BC | Salt water enters, the Gulf of Bothnia is still under ice, and land joins Germany to Sweden through Denmark |
| Ancylus Lake | About 8,750 to 7,850 BC | The land rises, closes the outlet, and the basin becomes a freshwater lake again |
| Littorina Sea | From about 7,850 BC | The sea breaks through near Denmark and the Baltic joins the North Sea |
| Later stages | After that | Close to today's coast, with smaller changes |

When the tribal age begins, the map holds the Baltic tribes: Prussians, Yotvingians, Curonians,
Samogitians, Lithuanians, Semigallians, Selonians and Latgalians, with the Livonians and Estonians
to the north. Around them sit the Polish duchies, the Rus' principalities of Polotsk, Pskov and
Novgorod, and Denmark and Sweden across the sea. Powers further out that shaped the region,
such as the Golden Horde, appear in less detail.

Real people appear where records exist; made-up people fill the gaps, and no one is overpowered.

## Events and history

- Events are built from conditions and choices, not fixed scripts, so history can bend without breaking.
- Historical events fire when their conditions still hold, so a changed history stays consistent.
- Every real date and person in the game is listed in data/sources.md.
- A strange history must never crash or produce nonsense, and tests cover odd paths too.

## The phone screen

- Portrait and one-handed: date and speed at the top, the map in the middle, tabs at the bottom.
- Panels slide up from the bottom; events appear as cards that show each choice's effect.
- Text stays large enough to read, and nothing important needs two hands.
- It works offline and saves on the phone automatically.
- It installs like an app: a home-screen icon with a blackletter "G", and it opens with no signal.
- It autosaves on the first day of every game month, when you pause and when you leave the app
  (at the top speeds, at most once every 2 seconds), and has Save,
  Load and New game buttons.
- Colours follow the phone's light or dark setting.
- Years have 365 days, with no leap days.

## Quality and testing

- No errors: every build is tested by letting the computer play hundreds of games over long spans.
- Checks: no broken numbers, every province has a living ruler, no loops in who serves whom,
  and saves load back exactly.
- Speed: the map stays smooth, and one game day computes in a few milliseconds.
- If phones are too slow, far-away detail gives first: distant holdings and markets run as simple
  numbers until you look at them.
- Each step ends with Ignas playing it on his phone.

## Build plan

Build one era well, with every layer working together, before adding the next. Each step is tested with
hundreds of computer-played games, then Ignas plays it on his phone and gives feedback before the next
one starts. The Middle Ages come first, because dynasty and intrigue live there and the existing engine
already covers much of them (as ideas, and what its tests checked: the engine itself is rewritten
in 3a, and its code and test files weren't uploaded).

1. Agree this design.
2. The map, with sources for every stage, in two parts, each ending playable on Ignas's phone:
   - 2a: the map itself: coasts, rivers, lakes, painted terrain, a time slider (today, 1219 and
     1 AD in full; a rough ice-age preview), names that change with the time, a Credits screen and
     a speed test on his phone.
   - 2b: the 1219 provinces and holdings, region by region, starting with a pilot he checks.
3. Middle Ages, dynasty and realm: from about 1200, as the crusades begin, with real rulers, families,
   marriages, succession, diplomacy and events. Split into three parts, each ending playable on
   Ignas's phone:
   - 3a: the real map, characters, family, succession and titles. The prototype engine is rewritten.
   - 3b: diplomacy, vassals with fine-grained terms, faith, one faction type (a relative claiming
     your throne), simple wars with battles settled automatically, and the goals of the
     crusading Orders and the Golden Horde.
   - 3c: harvests, hunger and unrest, and the full market.
4. Middle Ages, intrigue: schemes, secrets, the council and spymaster, friends, rivals and lovers,
   and stress as an idea to test (faith itself arrives in 3b; secret pagan worship comes here).
5. Middle Ages, war: armies, supply, seasons and sieges, with battles settled automatically.
6. Middle Ages, battles: real-time battles you command.
7. Middle Ages, towns: your seat, and any holding in your realm, built by hand and feeding the realm.
8. The first hunters: top-down action in 10,000 BC on the ice-age map, like Far Cry Primal. The
   ice-age map slices are built properly here.
9. Your tribe's story: shaping your people from the hunters to the crusades as the land changes.
   With step 8, this becomes the game's opening.
10. Commonwealth and gunpowder, playing the country.
11. Empires and revolutions.
12. World wars to today.

## Decisions so far (all open to change)

The rows from Calendar down are Ignas's answers of 6 October 2026, in Claude Code. The rows from
Step 2 split down are his step 2 answers, later the same day.

| Question | Decision |
| --- | --- |
| Start date | 10,000 BC, the first hunters after the ice; prehistory moves in jumps until the tribes |
| Who you play over time | A hunter band, then your tribe, then a dynasty in the Middle Ages, then the country. Updated 6 October 2026: the dynasty carries on past 1569, and you can try to save it and change history; when play turns to the country is planned with those ages |
| Tribal history | Written by the player; outsiders only trade and raid until the crusades around 1200 |
| Playable realms | Baltic realms, Lithuania first; the powers that shaped them, up to the Golden Horde, are on the map too |
| Main goal | A polished, error-free Lithuanian playthrough, however history changes |
| People | Real people where records exist, made-up ones to fill gaps, no one overpowered |
| Map | Historically accurate from the ice age on: ice sheet, meltwater lake, and coasts that change over time |
| Towns after 1800 | City planning like Cities: Skylines; a Stellaris-style future is a maybe |
| Hands-on action | Top-down action like Far Cry Primal, which opens the game |
| Language | English |
| How it's built | Claude Code on Ignas's PC, ending in one offline file for his phone |
| Pace | No limit; pause and speed buttons, fast-forward in battles |
| Name | Grind Strat, a working title for a game that borrows from many others |
| Calendar | 365-day years, no leap days |
| Saving | Autosave every game month and when you leave the app, plus Save and Load buttons |
| Colours | Follow the phone's light or dark setting |
| App icon | A blackletter "G" |
| Installs like an app | Yes, like his Campfire app: home-screen icon, works offline; the game stays one file |
| Step 3 split | 3a, 3b and 3c, each playable on the phone |
| Economy | A full market (goods, prices, merchants, regional markets), in 3c with harvests |
| Factions | One type (a relative claiming your throne) in step 3; more later |
| Friends, rivals, lovers | Step 4 |
| Council | Step 4, with the spymaster |
| Vassal duties | Fine-grained terms per vassal, closer to Crusader Kings 3 |
| Computer rulers | Know only what their character would know |
| Inheritance | Sons first at the start; laws and events can change it |
| Provinces | 150 or more in the Baltic core |
| Holdings on the map | Every holding a point, at real sourced sites only; the rest listed in the province panel |
| Entering land | Every holding in your realm can be built by hand, even a vassal's (replaces "build menus") |
| Clock inside a holding | Slows to speed 1; big events still pause |
| Seat sieges | Fought on your own town map |
| Sieges and raids of built holdings | Fought on that holding's own layout |
| A built holding changing hands | Your work stays with it; it just gets a new holder |
| Peasant unrest | 3c: hunger raises unrest, cutting tax and soldiers; step 5: revolts with rebel armies |
| Frozen winter routes | Step 5, with the seasons |
| Neighbours in full detail | The closest realms, and any tied to you through family, marriage or your council |
| Creating the Grand Duchy | Takes size (enough land) and renown |
| Simple wars | In 3b, with battles settled automatically |
| After 1569 | Your dynasty carries on; you can try to save it and change history |
| Holdings nobody is building | Grow very slowly compared with built ones |
| Looking at other lands | Neighbours only, limited, like fog of war; see inside through direct ties such as visits, hunts or letters |
| War exhaustion | Long wars directly lower your armies' effectiveness (step 5) |
| Roads | Develop by themselves where they are needed; rivers and the sea are routes from the start |
| Phone screen rule | At most 5 bottom tabs, 4 map modes in step 3, 2 buttons per list row |
| Map look | Terrain drawn, with realm colours tinted over it |
| Prototype engine | Rewritten in step 3a around the new design |
| If phones are too slow | Far-away detail gives first |
| Repo public on GitHub Pages | Yes, so the game opens on Ignas's phone from a link |
| Font with extended Latin letters | Yes: Grenze Gotisch, so letters such as Ž, ė, ą, ł, ā and õ show |
| Step 2 split | 2a, the map; then 2b, the 1219 provinces and holdings |
| Lithuania's provinces | Lands and castle districts named in 14th-century sources, each showing the year it was first mentioned |
| Ice-age maps | Built properly in step 8 (the hunters); step 2a gives sourced notes and a rough preview |
| South edge | 50°N: Volhynia on the map, Galicia just off the edge in less detail (the full box, 12°E to 34°E and 50°N to 61.5°N, is from the approved 2a plan) |
| Licences | Free forever, so share-alike data (like OpenStreetMap) is allowed |
| File size | No limit; the real test is how fast the map opens on his phone |
| Blocked data | Ignas allows sites, but only when a milestone needs one: Claude stops and asks for that one site |
| Ignas's phone | Android |
| Terrain grid | A 1 km terrain map for every province; battle and town maps made finer later (replaces the small 32 by 32 grid per province) |
| Names on the map | Names of the time, changing with the time slider; today's name stands in, marked, where none is sourced |
| Unsure borders | Guessed borders look softer than sourced ones |

## Treating real history with care

The later ages include occupations, deportations and the Holocaust. They are shown truthfully and
seriously, never as a reward or a joke.

## Sources

See data/sources.md for every link.

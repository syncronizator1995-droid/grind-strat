# Paradox-style games: how they work, and what we can borrow

A research reference for Grind Strat, written on 6 October 2026. It condenses five research notes made for the step 1 plan: Crusader Kings 3; Europa Universalis 4 and Hearts of Iron 4; Victoria 3 and Manor Lords; games that mix big and small scales; and ChatGPT's review compared with our design.

## 1. Why this exists

- Ignas asked for it when he shared ChatGPT's review: "I believ this will help with researching paradox style of games".
- For each game it answers: which levels of play it has (one person up to the wider world), what you do at each, and what passes between them.
- Then it lists ideas worth borrowing, by build step, and the traps these games fell into, especially on small touch screens.
- Nothing here is a decision. Every idea is a proposal for the plan of its step, which Ignas agrees first.

**Caveat: direct reads of the game wikis were blocked in this environment, so every mechanic here was confirmed only through search-result extracts, or not at all. Numbers may be from an older patch. Re-check each one in a browser before coding it.**

**How to read the marks**
- **(unverified):** seen only in a search-result extract. That covers every game number in this file.
- **(verified):** the notes call it verified. Used only for which mobile games exist.
- **Players say:** from forums, guides or reviews, not from the developers.
- **TO CHECK:** history not yet in data/sources.md. **Invented:** made up to show an idea.
- **Needs Ignas's OK:** the idea would change something he has already decided.
- **Open:** a question still open in docs/LEVELS.md, for Ignas to settle.
- Sources are named in brackets, such as (CK3 wiki: County). The links are in section 5.

## 2. How each game handles the levels

The pattern across all of them: you work hands-on at one or two levels, and every other level reaches you as a menu, a number or a report. Detail goes where you make decisions; the rest is totals.

### Crusader Kings 3 (CK3)

You play one person. Every level above matters only through the characters who hold it, sit on its council or plot inside it.

**Levels, and what you do**
- **Character:** five skills, traits, stress, and a lifestyle focus with perk trees. You pick a focus (changeable every 5 years) and answer events that add or remove stress. Stress runs 0 to 400; a perk costs 1,000 experience at a base 25 a month (unverified) (CK3 wiki: Lifestyle, Traits).
- **Family and dynasty:** you arrange marriages, pick each child's education focus (around ages 6 to 9, unverified), plan the heir, and can found a cadet branch (a new house you head). The dynasty head spends renown (the dynasty's fame) on legacies; the first costs 250, each later one 500 more (unverified) (CK3 wiki: Dynasty).
- **Court and council:** five council seats, each set to one task; guests who stay 3 years, then have a 5% chance a month to leave; activities (feast, hunt, tournament, pilgrimage) aimed at someone, such as befriending a vassal (unverified) (CK3 wiki: Council, Court, Royal court, Tours and Tournaments).
- **Holdings:** a county holds 1 to 7 baronies, each with one holding: castle, city, temple or tribal (unverified). You build in your own holdings and decide which to keep (CK3 wiki: Barony, Building).
- **County:** development (how built-up it is, 0 to 100), control (how firmly you hold it), popular opinion, culture and faith. You reach it mostly through councillors: the steward raises development, the marshal raises control, the chaplain converts (CK3 wiki: County, Council).
- **Realm:** vassal contracts, granting and taking back titles, crown authority (the ruler's power over vassals), succession laws and factions (CK3 wiki: Subjects, Authority laws, Succession laws).
- **Titles:** barony, county, duchy, kingdom, empire, each with rightful ("de jure") borders. You create a title once you hold 51% of its rightful counties, 81% for an empire (unverified) (CK3 wiki: Titles).
- **International:** a war needs a reason (a "casus belli": a claim, rightful lands or faith); marriages make alliances; hooks give leverage; "struggles" are regional situations involving many rulers (CK3 wiki: Casus belli, Hooks, Struggle).

**Passing up: land to power** (CK3 wiki: Barony, Building, County, Government, Subjects)

| Holding | Gold a month | Levies (called-up soldiers) |
| --- | --- | --- |
| Castle | 0.4 to 1.3 (unverified) | 175 to 625 (unverified) |
| City | 0.8 to 2.6 (unverified) | 75 to 225 (unverified) |
| Temple | 0.75 to 2 (unverified) | 125 to 425 (unverified) |
| Tribal | none | 250 to 400 (unverified) |

- Each point of development: +0.5% tax and levies, +150 supply limit. Each point of control below 100: −1% tax, −0.5% levies (unverified).
- Domain limit (how many holdings you can keep yourself): +1, +2, +3 or +4 for a count, duke, king or emperor. Over it, holdings stop paying after a year's grace; each vassal over the vassal limit cuts vassal tax and levies by 5% (unverified).
- Contracts set each vassal's share of tax and levies. One extract gives five steps (0 to 25% tax, 0 to 50% levies) but contradicts itself on the defaults; dev diary 17, from before release, and another extract describe three steps (low, medium, high). The count is unclear (unverified) (CK3 wiki: Subjects, Vassals; CK3 dev diary 17).
- Clan vassals pay by opinion instead: up to +10% tax and +30.5% levies at 100 opinion (unverified).
- A councillor's task adds up over time: the chancellor's 0.035 × diplomacy a month towards 1,200 points moves a county's rightful borders, which otherwise takes about 100 years (unverified) (CK3 wiki: Council).

**Passing down: power to unrest** (CK3 wiki: Subjects, Vassals, County; CK3 dev diary 19)
- **Tyranny** (an opinion penalty for harsh acts): raising a vassal's duties +20 (doubled for tax from normal to high), revoking a title without reason +20, imprisoning +20, executing a vassal +10; it fades by 0.25 a month (unverified).
- **Factions** (your own vassals banding together): discontent rises while their combined strength is above 80% of yours and falls below it; at 100% they send an ultimatum, and refusing starts a civil war (unverified). Contented vassals never join; hooks, alliances, prison and dread (fear of you) also keep vassals out. One extract says a vassal at 80+ opinion cannot join (unverified).
- Faction types: claimant, liberty, independence, dissolution, populist. A winning independence faction costs the ruler 150 prestige (unverified); a liberty faction lowers crown authority.
- **Popular opinion:** a ruler of another faith costs up to −45, another culture up to −15, and an attacking war longer than 6 months 0.5 a month (unverified). Low opinion breeds peasant revolts.
- **Succession:** partition splits titles among the children; the player's heir always gets the main title and capital; legitimate children get pressed claims, and wars over them cost 25% less (unverified). Crown authority unlocks the stronger laws (CK3 wiki: Succession laws, Authority laws).

**Intrigue** (CK3 wiki: Hooks, Schemes, Friends and Foes)
- A "shunned" secret gives a weak hook: one use, extra acceptance (+40 when demanding a hostage, unverified). A "criminal" secret gives a strong hook, which forces a yes.
- Schemes have success and secrecy. Up to 5 agents, only from the target's courtiers, guests and vassals; your own skills give at most 30%; success caps at 95%; each month the chance of discovery is a tenth of the missing secrecy (unverified).
- Friend and best friend, lover and soulmate, rival and nemesis, each with opinion and scheme effects.

**War** (CK3 wiki: Army, Warfare)
- A levy has 10 damage and 10 toughness and costs 3 gold per 1,000 men a month while raised. One knight with 10 prowess (personal fighting skill) hits like 50 levies. Men-at-arms (paid regulars) come in regiments of 100, heavy cavalry 50 (unverified).
- Battles run themselves in phases: manoeuvre (2 days), early (12 days, no retreat), late, then a 3-day pursuit. Each commander rolls a d10 every 3 days for advantage, each point worth +2% damage; defending across a river gives +10, a large river +20, a strait +30 (unverified). Terrain sets how many fight at once.
- Results flow back up as dead, wounded or captured characters.

**Stories** (CK3 wiki: Events, Event modding, Struggle; story-cycle forum thread)
- Events fire on game moments (a birth, an inheritance, a hook used), plus yearly draws weighted from sets that fire every 1 to 5 years (unverified).
- Story cycles are small lasting stories (a pet dog, say) with timed effects, which can pass on when the owner dies.
- A struggle changes phase 3 months after enough "catalysts" (actions by anyone involved); the Iberian one needs 1,000 (unverified).

**What it abstracts, and why**
- Population: a county is about five numbers. The notes found no population figure, so "CK3 has no pops" is inferred, not quoted.
- Money: fixed gold per holding, scaled by percentages. Resources are gold, prestige, piety and renown, with no goods market (CK3 wiki: Resources).
- Peasants exist only as popular opinion and a revolt faction. Unattached commoners sit in a pool where a game setting makes them die off (community source).
- Why: performance (players call it CPU-heavy because of its many characters; dev diary 36 on speed could not be read), readability, and because the drama lives in people.

### Europa Universalis 4 (EU4)

A nation seen from the court. No one below the court exists as a person: there are no "pops" (population groups).

**Levels, and what you do**
- **Person:** ruler, heir, consort, advisors, generals. You hire advisors, arrange royal marriages and react to dynastic events. Rare.
- **Province:** development as three numbers (base tax, production, manpower), a trade good, buildings, a fort and autonomy. You develop, build, convert, and make "cores" (make a province fully yours). Every few months.
- **State or territory:** a state costs more to govern but produces more. You promote territories. Yearly.
- **Estates:** social blocs with loyalty, influence, land and privileges. You grant or revoke privileges, or seize land. Every few years.
- **Country:** three pools of monarch points (points the ruler earns each month and spends on actions such as developing provinces), stability, technology, ideas. Monthly.
- **Trade:** nodes with one-way flow, about 80 of them (unverified). You send merchants to collect or steer.
- **International:** opinion, aggressive expansion (anger at your conquests), coalitions, alliances, subjects, unions. Constantly.

**Passing between levels** (EU4 wiki: Development, Trade, Local autonomy, Monarch power, Estates)
- Up: 1 base tax = +1 ducat a year; 1 base manpower = +250 maximum manpower; 1 base production = +0.2 goods. Goods × price is trade value, which flows downstream to whoever has merchants (unverified).
- Each development point also gives +0.1 land force limit and +2% local supply limit (unverified).
- Autonomy scales all of that down; at 100% a province pays nothing (unverified).
- Down: monarch points come at 2 to 20 a month per type (base 3, ruler skill up to +6, advisors up to +5). Developing a province costs a base 50, rising with its development (unverified).
- Crown land: at 0%, −20% tax; at 70% or more, +1 absolutism a year. Seizing land (every 5 years) adds 5% and costs every estate 20 loyalty. An estate at 100 influence and under 50 loyalty can start a coup (unverified).

**Between countries** (EU4 wiki: Aggressive expansion, Coalition, War exhaustion, Personal union, Subject nation, Land warfare, Army, Price Change events)
- A coalition can form when 4 or more realms without a truce reach −50 opinion from your conquests; the anger fades by 2 a year (unverified).
- War exhaustion (war-weariness) grows from battles, attrition, blockade and occupation, up to 20; each point adds unrest and cuts goods and recruits (unverified).
- Personal union: a royal marriage, then a ruler dying with no heir, can join two crowns; after 50 stable years the junior partner can be absorbed (unverified).
- A subject gets +75 liberty desire when its army equals its overlord's (unverified).
- Attrition (losses to hunger and disease) hits an army bigger than the province's supply limit, which runs from +2 (glacier) to +10 (farmland), up to 5% a month (unverified).
- A siege needs 3,000 men per 1,000 garrison; each fort level adds 1,000 garrison (unverified).
- World prices move only through scripted events.

**What it abstracts, and why**
- Three numbers stand for a province's people and economy; trade is value flowing on a fixed graph, not cargo; society is a few estates; state capacity is monarch points.
- Why: three numbers per province are easy to scan, there's no per-person simulation, and choices stay about the realm.
- Paradox reversed much of this in Europa Universalis V (released 4 November 2025, unverified): pops, central estates, markets instead of trade nodes, no monarch points, 27,518 map locations (unverified). One review title calls it "the most complex grand strategy game I have ever played" (EU5 sources).

### Hearts of Iron 4 (HOI4)

A nation seen from the general staff. The person level reaches the war only as manpower and war support.

**Levels, and what you do**
- **Person:** country leader, advisors, generals with four skills (attack, defence, planning, logistics). You assign commanders. The notes found no family layer.
- **Province:** terrain, railways, supply hubs, victory points (key places that count towards a country's collapse); 13,381 of them (unverified, third-party count). You build railways and hubs.
- **State:** population, building slots, factories, infrastructure, resistance; 1,046 of them (unverified). You queue construction, about weekly.
- **Country:** laws, war support, stability, a focus tree (a branching plan of national goals), production lines. Weekly to monthly.
- **Military:** division templates, armies, fronts and battle plans. You draw front and attack lines, then execute. Daily in war.

**Passing between levels** (HOI4 wiki: Logistics, Attrition and accidents, Land battle, Terrain, Battle plan, Commander, Ideas, Occupation)
- Manpower = state population × the conscription law's share, from 1% up to 25%; higher laws cost the economy and need war support (unverified).
- Supply runs from the capital along railways to hubs, then drops off with each province, less where infrastructure is good. Rail capacity is 15 at level 1, +5 a level, up to 35, and the worst stretch sets the cap. Hubs can hold 0, 40 or 80 trucks to reach further (unverified).
- Supply below 35% adds up to +20% attrition, which wears down equipment and readiness, not men (unverified).
- Battles run in one-hour rounds. Combat width (how many units fit) comes from terrain: plains 70, marsh 50, more when attacking from the flanks (unverified).
- Planning bonus: +2% a day spent preparing, up to 30%. Each general skill level: +2.5% attack and defence (unverified).
- A country gives up when it loses core victory points past its surrender limit, 80% by default. Resistance in an occupied state starts at 1% (unverified).

**What it abstracts, and why**
- Population is one number per state; politics is laws and focus trees; characters are bundles of bonuses.
- Why: it is a war game. Battle plans were designed to cut "pointless" shuffling of divisions along a front (HOI4 sources, unverified).
- Lesson from the notes: both games put the state above people, the opposite of Ignas's ranking. How much the family still matters after 1569 is his call (open in LEVELS.md).

### Victoria 3 (Vic3)

An economy and society seen from the state. No individuals except politicians and generals.

**Levels, and what you do**
- **Pop:** everyone in a state who shares culture, religion, job and workplace, counted as one group. You never touch them.
- **State:** building levels, a production method per building, infrastructure. You queue buildings and switch methods every few months.
- **Market:** one price per good across the country, adjusted locally by market access (how well a state's infrastructure keeps up with its use). You set laws and tariffs: rare but heavy choices.
- **World:** a world market whose trade centres trade by themselves (since patch 1.9), diplomatic plays, and infamy (distrust of your conquests).

**Passing between levels** (Vic3 wiki: Market, Standard of living, Pops, Interest group, Events, Patch 1.9)
- Production makes sell orders and consumption makes buy orders; the price moves with the gap, held between 25% and 175% of a base price (unverified; our reviewer could not confirm this range).
- Buildings pay wages; pay sets each pop's standard of living.
- Each standard-of-living level lost turns 3% of a pop radical, each gained 3% loyalist (unverified). These shift the approval of interest groups (political blocs); an angry bloc feeds movements, and a revolution needs one behind it.
- A crop failure cuts farm output by 60% for 5 years. Food security under 40% raises deaths; under 20% it raises them much more and cuts births by 90% (unverified).
- Outward: the computer weighs the size of your army. At 100 infamy you become a pariah (unverified).

**What it abstracts, and why**
- People are grouped into pops, kept per state rather than per province for speed (Alt Char interview, unverified). Players still report weeks taking minutes around 1880.
- Hand-made trade routes were removed. Dev diary 143 called them "unreliable, overly fiddly"; trade became automatic and profit-driven, with the player setting policy.

### Manor Lords (ML)

A medieval town builder: deep in space, thin beyond the map's edge.

**Levels, and what you do**
- **Family:** the unit of people; husbands and sons are also the militia. You give families jobs.
- **Burgage plot** (a family's house plot): you place and upgrade plots and add a garden, a coop or goat shed, or an orchard (15, 25 or 50 regional wealth, unverified) (ML wiki: Burgage plot).
- **Region:** its own deposits, fertility, storehouses, market and regional wealth (the villagers' own money). You build and set taxes all the time.
- **The lord:** treasury, influence and policies. Claiming a region costs 1,000 influence, or 2,000 if another lord has claimed it (unverified) (ML wiki: Regions; GameSpot guide).
- **Outside:** the King's Road market, trade routes, a rival lord, bandits.

**Passing between levels** (ML wiki: Family, Regional wealth, Resources, Warfare, 0.7.972 update; guides)
- Needs: each family eats 1 food a month and each plot burns 1 fuel a month; ale every 3 months, cloth every 6, shoes every 12 (unverified).
- Approval moves families in or out each month. Current official wiki: 0–4%: −3 · 5–19%: −1 · 20–54%: 0 · 55–79%: +1 · 80–94%: +2 · 95–100%: +3 (unverified). Older guides give other bands.
- Land tax turns regional wealth into the lord's treasury but costs approval; with no regional wealth there is no tax.
- Patch 0.7.972 added oversupply: selling a lot of one good drops its price to ×0.75, then ×0.5 (unverified).
- Calling the militia stops those men working. Everything, battles included, runs in real time on one map.

**What it abstracts**
- Families, carts and plots exist inside about 8 regions (unverified); beyond them is a market with near-fixed prices.
- The rival lord has no town; his troops appear at the map edge, which players find strange.

### Total War and Mount & Blade II: Bannerlord

Two ways to join a strategy map to battles you fight by hand.

**Total War**
- Levels: a campaign map of settlements and armies, then real-time battles.
- From Rome: Total War on, the battlefield is built from the terrain where the armies stand: hills, rivers, forests, settlements (Wikipedia: Rome: Total War).
- Newer games keep one large battle terrain and cut each battlefield from it. "Catchments" decide which battles can happen where; a "no-go map" blocks impossible places (Total War wiki: pages on "Terry", the map editor).
- Medieval II has six settlement levels, and the siege map follows the settlement's type and level (unverified) (Wikipedia: Medieval II).
- In Warhammer III, defenders earn "supplies" during a siege and spend them on towers and barricades at fixed spots (totalwar.com).
- Battles you skip are auto-resolved by a simplified formula over unit stats (Steam players).

**Mount & Blade II: Bannerlord**
- Levels: you, one rider; your clan; towns, castles and villages; kingdoms.
- What you do: ride, fight, talk, trade, recruit, second by second. A town is a walkable scene, a siege battlefield, or most often a menu (GameBanshee).
- Villages produce by type (sheep give wool and cheese); peasants carry the goods to town, workshops process them and prosperity rises (players say).
- The map has about 150 regions, each linked to a hand-made battle scene; each side starts where its party was and the way it was moving. At patch e1.7.0 only 72 scenes existed for about 148 regions (unverified) (GameBanshee; Steam players).
- One scene takes a day to a couple of weeks to build (unverified). Battles you don't watch run as a ticking casualty report. Battles are capped at 1,000 soldiers (unverified) (PC Gamer).

### Dwarf Fortress and Songs of Syx

Two games that simulate one place in full and everything else as numbers.

**Dwarf Fortress**
- Levels: a generated world, its regions, and your fortress.
- Only "historical figures" are tracked one by one; the rest are numbers, "due to computation and memory constraints" (DF wiki: Historical figure).
- One region tile is a 16 × 16 grid of embark tiles (places you can settle), each 48 × 48 game tiles (unverified) (DF wiki: Embark).
- Since version 0.40 the world keeps running after you settle. It reaches you as migrants, caravans and sieges at the map edge; your raids come back as a written report (DF wiki: World activities, Raid).

**Songs of Syx**
- Levels: your capital, conquered regions, armies.
- The capital simulates its citizens one by one, tens of thousands of them (unverified). Conquered regions are not built tile by tile: their buildings become stats that ship goods to the capital, managed with administration points (Substack essay).
- Armies need supply depots or they desert. City assaults were auto-resolve only, as of 2020 (devlog; GamingOnLinux).

### Knights of Honor II (brief)

- Your court is capped at 9 knights, the king included, each a marshal, merchant, diplomat, cleric or scholar, or spy (unverified). A governor knight boosts his province (guides).
- Rural areas (farms, monasteries, coastal towns) are fixed and placed at random each game.

### Mobile strategy games

- Age of History 3 on iOS (verified); on Android, unverified. 13,892 provinces, 5,532 in its Pocket Edition (unverified). On a phone the problem is reading the map, not its size.
- Total War: Medieval II and Rome, ported by Feral to iOS and Android (verified). Medieval II has "Command Slowdown" while you give orders; Rome on iPad lets you draw paths. A review: "the concessions to fit this fiddly thing onto a small screen are clear" (Pocket Tactics).
- European War 7: Medieval on iOS (verified).
- Reigns (verified): one-thumb choices, "grand strategy by way of Tinder" (AV Club).
- Mount & Blade: Warband on Android, only for Tegra 4 devices (verified). No Bannerlord for phones was found.
- "Bronze Age" exists, but it is a 2013 iPad resource manager, not grand strategy.
- Close to phones: CK3 on consoles split windows into several, added a top command bar with tabs, radial menus, one fixed control per function and control hints at the bottom (CK3 console dev diary 3).
- Prison Architect's phone port: screen size was the hardest problem; the interface had to shrink while touch targets grew (PocketGamer.biz).

## 3. Ideas worth borrowing

Proposals only, one line each: the idea, why, and the game it comes from. Ignas's answers of 6 October 2026 already settled some of these; they are marked **decided**.

### Step 2: the map
- A title tree (holding, province, land, title) with rightful and actual owners kept apart: every later system reads it (CK3).
- Provinces grouped into lands: armies use provinces, money and politics use lands, and there are fewer things to tap. Land borders TO CHECK (HOI4 states).
- One terrain tag per province sets movement, computer behaviour and the battle template (Bannerlord).
- A supply limit per terrain, changed by season, such as frozen marsh (EU4: +2 to +10, unverified).
- River crossings stored on province borders, for defence bonuses later (CK3).
- A no-go mask for lakes and bogs that opens when they freeze; DESIGN.md's 1270 battle on the ice fits (Total War's no-go map).
- Fertility and river, road and coast links per province: the market and supply both need them (Vic3).
- Map modes as recolours of the same shapes, at most 4 in step 3, tinted over the drawn terrain (CK3; EU4 and HOI4 small-screen lessons).
- Victory points on key towns: one number for who controls a land. Which towns existed when: TO CHECK (HOI4).

### Step 3a: map, characters, family, succession, titles
- Two tiers of people: nobles as full characters, commoners as numbers, for speed and memory (Dwarf Fortress, Vic3).
- Clear out minor characters with no ties on a schedule, to keep a game day within budget; the prototype already removes the long dead (CK3 game setting and mods).
- Opinions with itemised reasons; show the top 3 and fold the rest, as long lists don't fit a phone (CK3).
- Children's claims from partition feed the 3b claimant faction, which makes stories for free; fits "sons first" (**decided**) (CK3).
- Create a title by holding enough of its rightful lands, such as the Grand Duchy (CK3: 51%, unverified). What it takes is still open in LEVELS.md.
- A cap on holdings you keep yourself pushes land to relatives, who become vassals with claims; the prototype had one (CK3 domain limit).
- Long-term goals for slow play: dynasty renown, legacies, cadet branches (CK3).
- Events triggered by births, deaths and inheritance, plus weighted yearly draws with cooldowns, so they don't repeat (CK3).

### Step 3b: diplomacy, vassals, faith, the Orders and the Horde, one faction
- Per-vassal tax and levy levels, where asking for more costs "tyranny" opinion: matches "fine-grained terms" (**decided**). How many steps: CK3 sources say 3 or 5 (unverified) (CK3).
- Clan vassals who pay by opinion, not contract: one way to play DESIGN.md's "clan councils" law (CK3).
- The claimant faction is **decided** for 3b. How it works is a proposal: a discontent bar that fills only while its strength is above about 80% of yours; contented vassals never join (CK3 dev diary 19, unverified).
- Coalitions shown as one threat bar per neighbour, easy to read on a phone (EU4: 4 or more realms at −50 opinion, unverified).
- Neighbours fear a big army nearby, so growth worries them; it shows on the "opinion of you" map mode (Vic3, EU4).
- A vassal grows bolder as his army nears yours, which gives revolts a cause you can see (EU4: +75 liberty desire at parity, unverified).
- Personal unions from a marriage plus a ruler dying without an heir, a way to play DESIGN.md's "unions between crowns" (EU4). Whether Krewo worked this way: TO CHECK.
- A ruler of another faith is resented by the people, so faith matters below the court too (CK3: up to −45, unverified).
- Crusade pressure as a "struggle" whose phases move with everyone's actions, so history bends without a script (CK3). In 1219 the order in the region is the Livonian Brothers of the Sword (founded 1202 by Bishop Albert of Riga); the Teutonic Knights are invited in 1226 and settle in Chełmno in 1230.
- Crown land tracked against vassal land, a bridge to estates later (EU4).
- Computer rulers use your actions and know only what their character knows (**decided**).

### Step 3c: the market and harvests
- A full market (**decided**): goods in a few regional markets, priced monthly from supply and demand with a floor and a ceiling (Vic3: 25% to 175%, unverified). The notes suggest 6 goods in about 5 markets, so 30 prices a month (invented, as a starting size).
- Merchants trade by themselves where prices differ, and the player sets policy, because hand-made routes proved fiddly (Vic3, dev diary 143).
- An autumn harvest roll per province, linked across a weather region (Vic3 crop failure: −60%, unverified, as a starting point).
- Hunger shows as an opinion reason ("hungry lands") and as unrest, which plugs the economy into the top-ranked layer (Vic3, CK3). Peasant revolts: open.
- Oversupply discounts so one good can't be farmed for easy money (Manor Lords: ×0.75 and ×0.5, unverified).
- Development raises tax and levies, and control scales them: readable, and it feeds gold and soldiers directly (CK3: +0.5% per point, unverified).
- Which province produced which good is history: each needs a source or an invented label.
- Monthly work grows only with goods × markets plus provinces, to fit the phone budget.

### Step 4: intrigue
- Secrets become weak hooks (one use) or strong hooks (force a yes): leverage as one resource every interaction can spend (CK3).
- Pagan worship after conversion as a secret: already in DESIGN.md, and it fits CK3's secrets and hooks (CK3).
- Schemes as two bars, success and secrecy, with agents from the target's court and a monthly discovery roll: two bars read well on a phone (CK3).
- Friends, rivals and lovers with opinion and scheme effects (**decided** for step 4) (CK3).
- Council seats with one task each, aimed at one province: the main way a game about people reaches the land (**decided**: council in step 4) (CK3).
- Feasts and hunts with an aim, such as winning over a vassal (CK3 activities).
- Stress from 0 to 400, with breaking points that give a coping trait: tests DESIGN.md's "stress, as an idea to test" (CK3, unverified).
- Noble blocs that plot when strong and disloyal, which gives plots a visible cause (EU4 estates).
- Don't copy monarch points; let money, time and opinion be the limits (EU4 lesson).
- Event cards with 2 or 3 choices and their effects shown, one thumb (Reigns).
- Tap a highlighted word to open its explanation, which can open more: Paradox's nested tooltips, made for touch (CK3, Vic3; Tinto Talks 77).
- Events that read the economy, such as "Riga's merchants offer for your grain while Samogitia starves" (invented example; ChatGPT's chain).

### Step 5: war
- Levies = holding base × development × control × the vassal's terms, so a bad harvest means fewer soldiers by formula (CK3).
- Attrition when an army is bigger than the land can feed: DESIGN.md's "starve in poor country" as one sum a month (EU4 supply limit; CK3 development).
- A small version of supply hubs: castles as hubs, rivers and roads with a carrying limit, wagons, supply thinning with distance (HOI4). Roads are still open in LEVELS.md.
- Sieges need about 3 men per defender, more for stronger forts: a rule anyone can read (EU4, unverified).
- War exhaustion, capped, feeding unrest, so long wars wear a realm down. **Open** in LEVELS.md (EU4).
- Armies eat grain at local prices, foraging cuts the harvest, and raised levies are missing farmers: the cleanest link from economy to war (Manor Lords militia).
- One strength formula for auto-resolve and for the odds shown before a hand-fought battle, because players resent the two disagreeing (Total War lesson).
- Auto battles in phases: manoeuvre, a main fight with no retreat, a pursuit; a commander roll, terrain width, a river bonus. Cheap, readable and easy to test (CK3).
- Battles between computer realms become one chronicle line, which costs almost nothing (Bannerlord, Dwarf Fortress).
- Commander skills from our five: martial for attack and defence, stewardship for supply, learning for planning, so no new skills are needed (HOI4's four skills).

### Step 6: battles
- Cut the battlefield from the province's terrain grid, and place each side by its direction of approach, so there are no hand-made maps to fall behind (Total War, Bannerlord).
- Width from terrain, wider when attacked from more sides, which suits a portrait battlefield (HOI4).
- Slow time automatically while a finger gives orders, and let players draw paths, because touch is slower than a mouse. This adds to DESIGN.md's battle speeds (Medieval II and Rome on phones and iPad).
- A capped bonus for time spent preparing, which rewards scouting (HOI4 planning).
- Knights and relatives worth far more than levies, who can die or be captured: where family meets war (CK3: one knight hits like 50 levies, unverified).
- A pursuit after the fight, where captives, ransoms and dead relatives come from (CK3).

### Step 7: towns
- Sieges of your seat fought on the town you built (**decided**) (Manor Lords).
- Sieges of your other built holdings: their own layout, or 3 or 4 templates by holding type? **Open**, a new question for Ignas (Medieval II templates).
- Family needs: food and fuel each month, ale, cloth and shoes less often: a short table that's easy to show (Manor Lords).
- Approval sets how many families arrive or leave each month: one number, with reasons, drives growth (Manor Lords).
- The villagers' money kept apart from your treasury, with land tax costing approval, so taxing has a visible cost (Manor Lords).
- A town's surplus sells into the 3c market, with oversupply discounts (Manor Lords, Vic3).
- Holdings you aren't looking at run as stats that ship goods (Songs of Syx). Ignas **decided** this is what gives first if phones are too slow. Whether a town you built keeps running in full when you leave it is a step 7 question.
- Building slots by holding type, so a castle and a village grow differently (HOI4: 0 to 12, capped at 25, unverified).
- Overtaken by Ignas's answers: the research suggested "only the seat is hand-built" (from CK3) and "a look-only view of other counties" (the research notes' own idea). He chose every holding in his realm buildable by hand, which replaced DESIGN.md's earlier "other holdings run from build menus". A look-only view of land outside the realm is still open in LEVELS.md.

### Later ages (steps 8 to 12)
- Step 8: zoom from a world cell into a finer local grid made from it (Dwarf Fortress embark).
- Step 10: the dynasty carries on through the elected kings: **needs Ignas's OK**, as it would change "you play the country from 1569" (EU4 wiki: The Commonwealth, unverified).
- Step 10: crown authority and liberty factions grow into the nobles' parliament with its one veto, for continuity at the 1569 handover (CK3).
- Step 10: estates as Vic3-style groups whose living standard feeds radicals. Which estates, and their real role: TO CHECK (Vic3, EU4).
- Step 10: the Danzig grain trade run by merchants who trade by themselves (Vic3).
- From 1795: count population by region, not by town (Vic3 performance lesson).
- Step 11: war support and stability driving the 1830 and 1863 uprisings: the notes' own idea, not a Paradox mechanic.
- Step 12: fronts drawn with one finger, a planning bonus, small division templates, conscription laws gated by war support, railway capacity, collapse by victory points, and occupation resistance shown with care (HOI4).

## 4. Pitfalls

### In play
- **Snowballing.** CK3 players call it "way too easy to steamroll" the AI, a "trivial map painter" (Steam players). Brakes: coalitions, tyranny, attrition.
- **Repeating events.** CK3 players report "a small set of 20 or 30 random events"; patch notes show cooldown bugs (CK3 wiki: Patch 1.9.X). Cooldowns and condition-heavy events from the start.
- **Slowdown.** CK3's late game, Vic3 weeks taking minutes around 1880, Dwarf Fortress crawling as creatures multiply (players say), Bannerlord's 1,000-soldier cap (PC Gamer). Measure on the phone early.
- **Points instead of power.** EU4's monarch points made players feel like "an advisor who optimises" rather than a king (players, via the EU4 research). EU5 dropped them (EU5 sources).
- **Systems nobody can predict.** EU4 trade is opaque even to 500-hour players; Vic3 trade was reworked twice; HOI4 supply after patch 1.11 confused players, and the developers admitted the supply map made flow hard to predict (PCGamesN; Vic3 wiki: Patch 1.9; HOI4 developer posts).
- **Long chains look random.** A ten-step chain over two years reads as noise. Every link needs one line with its reason.
- **Auto-resolve that disagrees with real battles.** Warhammer III players report hand-fought battles costing double the predicted losses (Steam players).
- **Content debt.** Bannerlord had 72 hand-made scenes for about 148 regions; Warhammer III players count about ten maps per region (Steam players). Generate battlefields from terrain instead.
- **A hollow late game.** Bannerlord's kingdom play is called shallow after 20 to 25 hours; Manor Lords lacks a clear mid and late game; Knights of Honor II reviews cite weak battle AI and slow pacing (Steam players; reviews).
- **Hidden enemies feel like cheating.** Manor Lords' rival has no base you can see (Steam players).
- **Tools the computer can't use.** HOI4's battle plans: the AI can't exploit weak points, and veterans take the bonus, then move troops by hand; the developers describe a "stark divide" between new and veteran players (HOI4 sources).
- **Stale numbers.** Manor Lords' approval bands changed between versions (ML wiki and guides). The same risk applies to every number in this file.
- **Hard to learn.** Reviews of Songs of Syx and Dwarf Fortress cite poor tutorials and a scattered screen (Vaporlens; blog).

### On small touch screens
- **No hover.** CK3, EU4 and HOI4 lean on hover tooltips (PCGamesN on nested tooltips; CK3 console sources). Tap or long-press to open a "why?" sheet.
- **Too much at once.** A reviewer called CK3 "a mosaic of menus, icons, buttons, and tooltips". The console version split windows and added radial menus (CK3 press; console dev diary 3).
- **Long lists.** Opinion breakdowns and stacked modifiers run long: the top 3 reasons, the rest folded.
- **Alerts pile up** in CK3, so our "big moments pause" rule needs a strict priority order.
- **Wide tables.** Goods × markets won't fit: one row per province (food, mood, tax, levy, with arrows).
- **Busy maps.** At most 4 map modes in step 3, a legend that stays visible, one arrow per river, one counter per stretch of front.
- **Formulas.** Show what changed and why, not the sum behind it.
- **Fiddly battles.** Medieval II on phones made visible concessions (Pocket Tactics); slow time while a finger gives orders.
- **Touch targets.** The Prison Architect port shrank the interface while touch targets grew (PocketGamer.biz).
- **A screen budget** (proposal in LEVELS.md): at most 5 tabs, at most 4 map modes in step 3, 2 buttons per list row.

## 5. Sources

All were read through search-result extracts only; direct page reads were blocked.

### Crusader Kings 3
- CK3 wiki: [Titles](https://ck3.paradoxwikis.com/Titles), [Barony](https://ck3.paradoxwikis.com/Barony), [Building](https://ck3.paradoxwikis.com/Building), [County](https://ck3.paradoxwikis.com/County), [Subjects](https://ck3.paradoxwikis.com/Subjects), [Vassals](https://ck3.paradoxwikis.com/Vassals), [Government](https://ck3.paradoxwikis.com/Government), [Feudal](https://ck3.paradoxwikis.com/Feudal)
- CK3 wiki: [Authority laws](https://ck3.paradoxwikis.com/Authority_laws), [Succession laws](https://ck3.paradoxwikis.com/Succession_laws), [Casus belli](https://ck3.paradoxwikis.com/Casus_belli), [Attributes](https://ck3.paradoxwikis.com/Attributes), [Traits](https://ck3.paradoxwikis.com/Traits), [Character](https://ck3.paradoxwikis.com/Character), [Lifestyle](https://ck3.paradoxwikis.com/Lifestyle), [Dynasty](https://ck3.paradoxwikis.com/Dynasty)
- CK3 wiki: [Friends and Foes](https://ck3.paradoxwikis.com/Friends_and_Foes), [Council](https://ck3.paradoxwikis.com/Council), [Royal court](https://ck3.paradoxwikis.com/Royal_court), [Court](https://ck3.paradoxwikis.com/Court), [Hooks](https://ck3.paradoxwikis.com/Hooks), [Schemes](https://ck3.paradoxwikis.com/Schemes), [Prisoner](https://ck3.paradoxwikis.com/Prisoner), [Army](https://ck3.paradoxwikis.com/Army), [Warfare](https://ck3.paradoxwikis.com/Warfare)
- CK3 wiki: [Situation](https://ck3.paradoxwikis.com/Situation), [Struggle](https://ck3.paradoxwikis.com/Struggle), [Events](https://ck3.paradoxwikis.com/Events), [Event modding](https://ck3.paradoxwikis.com/Event_modding), [Innovation](https://ck3.paradoxwikis.com/Innovation), [Resources](https://ck3.paradoxwikis.com/Resources), [Keyboard shortcuts](https://ck3.paradoxwikis.com/Keyboard_shortcuts), [Patch 1.9.X](https://ck3.paradoxwikis.com/Patch_1.9.X), [Tours and Tournaments](https://ck3.paradoxwikis.com/Tours_and_Tournaments)
- [Dev diary 2: the medieval map](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-2-the-medieval-map.1274052/)
- [Dev diary 17: governments and vassals](https://admin-forum.paradoxplaza.com/forum/developer-diary/ck3-dev-diary-17-governments-vassal-management-laws-and-raiding.1352640), also at [forum.paradoxplaza.com](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-17-governments-vassal-management-laws-and-raiding.1352640/)
- [Dev diary 19: factions and civil wars](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-19-factions-and-civil-wars.1363951/) (from our review of the draft)
- [Dev diary 30: event scripting](https://admin-forum.paradoxplaza.com/forum/developer-diary/crusader-kings-3-dev-diary-30-event-scripting.1397140)
- [Dev diary 36: performance](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-36-gotta-go-fast.1408620/)
- [Console dev diary 3: interface and controls](https://www.paradoxinteractive.com/games/crusader-kings-iii/news/ck3-console-dev-diary-3-uiux-and-controls), also on the [forum](https://admin-forum.paradoxplaza.com/forum/developer-diary/console-dd-3-ui-ux-and-controls.1516699)
- [Story-cycle forum thread](https://admin-forum.paradoxplaza.com/forum/threads/story-cycle-effect-group-chance-out-of-1-instead-of-100.1594492)
- Press: [Wccftech, console](https://wccftech.com/crusader-kings-iii-console-ps5-xbox-series-x-impressions/amp/), [PC Gamer, console port](https://www.pcgamer.com/crusader-kings-3-console-port-xbox-playstation), [PC Gamer, review](https://pcgamer.com/crusader-kings-3-review), [PCGamesN, nested tooltips](https://www.pcgamesn.com/victoria-3/nested-tooltip-system)
- Press: [TheSixthAxis, 2021](https://www.thesixthaxis.com/2021/08/24/crusader-kings-3-is-coming-to-xbox-series-xs-soon), [TheSixthAxis, console](https://www.thesixthaxis.com/?p=392272)
- Players: [Steam 1](https://steamcommunity.com/app/1158310/discussions/0/3838801919839423509), [Steam 2](https://steamcommunity.com/app/1158310/discussions/0/3070866588611096495/?ctp=6), [Steam 3](https://steamcommunity.com/app/1158310/discussions/0/3821912677675548093), [Steam 4](https://steamcommunity.com/app/1158310/discussions/0/3727323721760166023), [Steam mod changelog](https://steamcommunity.com/sharedfiles/filedetails/changelog/2887120253?p=2)

### Europa Universalis 4 (and 5)
- EU4 wiki: [Development](https://eu4.paradoxwikis.com/Development), [Monarch power](https://eu4.paradoxwikis.com/Monarch_power), [Estates](https://eu4.paradoxwikis.com/Estates), [Trade](https://eu4.paradoxwikis.com/Trade), [Trade nodes](https://eu4.paradoxwikis.com/Trade_nodes), [Price Change events](https://eu4.paradoxwikis.com/Price_Change_events), [Local autonomy](https://eu4.paradoxwikis.com/Local_autonomy)
- EU4 wiki: [Aggressive expansion](https://eu4.paradoxwikis.com/Aggressive_expansion), [Coalition](https://eu4.paradoxwikis.com/Coalition), [Diplomacy](https://eu4.paradoxwikis.com/Diplomacy), [War exhaustion](https://eu4.paradoxwikis.com/War_exhaustion), [Overextension](https://eu4.paradoxwikis.com/Overextension), [Subject nation](https://eu4.paradoxwikis.com/Subject_nation), [Personal union](https://eu4.paradoxwikis.com/Personal_union)
- EU4 wiki: [Land warfare](https://eu4.paradoxwikis.com/Land_warfare), [Army](https://eu4.paradoxwikis.com/Army), [Combat](https://eu4.paradoxwikis.com/Combat), [Dynastic events](https://eu4.paradoxwikis.com/Dynastic_events), [The Commonwealth](https://eu4.paradoxwikis.com/The_Commonwealth)
- [PCGamesN, trade nodes](https://www.pcgamesn.com/europa-universalis-iv/trade-nodes), [PC Gamer, rebuilding Imperator: Rome](https://www.pcgamer.com/how-paradox-is-rebuilding-imperator-rome)
- EU5: [Wikipedia](https://en.wikipedia.org/wiki/Europa_Universalis_V), [dev diary 1: population](https://admin-forum.paradoxplaza.com/forum/developer-diary/developer-diary-1-population-and-living-world.1857075), [Tinto Talks 77: tooltips](https://admin-forum.paradoxplaza.com/forum/developer-diary/tinto-talks-77-20th-of-august-2025.1856053)
- EU5 press: [A Collection of Unmitigated Pedantry](https://acoup.blog/2025/10/31/miscellania-europa-universalis-v-confirmed-first-impressions/), [Strategy and Wargaming review](https://strategyandwargaming.com/2025/11/04/europa-universalis-5-eu5-review)

### Hearts of Iron 4
- HOI4 wiki: [Logistics](https://hoi4.paradoxwikis.com/Logistics), [Attrition and accidents](https://hoi4.paradoxwikis.com/Attrition_and_accidents), [Battle plan](https://hoi4.paradoxwikis.com/Battle_plan), [Division designer](https://hoi4.paradoxwikis.com/Division_designer), [Land battle](https://hoi4.paradoxwikis.com/Land_battle), [Terrain](https://hoi4.paradoxwikis.com/Terrain)
- HOI4 wiki: [Commander](https://hoi4.paradoxwikis.com/Commander), [Ideas](https://hoi4.paradoxwikis.com/Ideas), [State](https://hoi4.paradoxwikis.com/State), [Construction](https://hoi4.paradoxwikis.com/Construction), [Warfare](https://hoi4.paradoxwikis.com/Warfare), [Occupation](https://hoi4.paradoxwikis.com/Occupation)
- [hoi4commands.com, province and state counts](https://hoi4commands.com/province) (third party)
- [Dev diary: supply](https://admin-forum.paradoxplaza.com/forum/developer-diary/hoi4-dev-diary-supply-and-mulberry-harbors.1481424/), [anniversary developer corners](https://admin-forum.paradoxplaza.com/forum/developer-diary/hearts-of-iron-iv-anniversary-week-developer-corners.1760451/)
- Press and players: [PCGamesN, supply changes](https://www.pcgamesn.com/hearts-of-iron-iv/supply-changes), [forum thread on supply](https://forum.paradoxplaza.com/forum/threads/smoke-and-mirrors-supply-system-no-step-back.1499345/), [Steam](https://steamcommunity.com/app/394360/discussions/0/1698293255119626617)

### Victoria 3
- Vic3 wiki: [Market](https://vic3.paradoxwikis.com/Market), [Infrastructure](https://vic3.paradoxwikis.com/Infrastructure), [Standard of living](https://vic3.paradoxwikis.com/Standard_of_living), [Pops](https://vic3.paradoxwikis.com/Pops), [Needs](https://vic3.paradoxwikis.com/Needs), [Building](https://vic3.paradoxwikis.com/Building), [Profession](https://vic3.paradoxwikis.com/Profession)
- Vic3 wiki: [Interest group](https://vic3.paradoxwikis.com/Interest_group), [Revolution](https://vic3.paradoxwikis.com/Revolution), [State](https://vic3.paradoxwikis.com/State), [Events](https://vic3.paradoxwikis.com/Events), [Patch 1.9](https://vic3.paradoxwikis.com/Patch_1.9), [Vickypedia](https://vic3.paradoxwikis.com/index.php?mobileaction=toggle_view_mobile&title=Vickypedia)
- [Dev diary 143: the world market](https://admin-forum.paradoxplaza.com/forum/developer-diary/victoria-3-dev-diary-143-trade-rework-the-world-market.1733205)
- [Dev diary 9: national markets](https://admin-forum.paradoxplaza.com/forum/developer-diary/victoria-3-dev-diary-9-national-markets.1484917) (from our review; search result only)
- Press and players: [Alt Char, no province-level play](https://www.altchar.com/game-news/victoria-3-will-most-likely-not-have-provincial-level-gameplay-a2kqf0V2YDxV), [GameCritics review](https://gamecritics.com/mitch-zehe/victoria-3-review/), [Vaporlens](https://vaporlens.app/app/529340/victoria_3)

### Manor Lords
- ML wiki: [Family](https://wiki.hoodedhorse.com/Manor_Lords/Family), [Warfare](https://wiki.hoodedhorse.com/Manor_Lords/Warfare), [Regions](https://wiki.hoodedhorse.com/Manor_Lords/Regions), [Regions (en)](https://wiki.hoodedhorse.com/Manor_Lords/Regions/en), [Regions (de)](https://wiki.hoodedhorse.com/Manor_Lords/Regions/de), [Regional wealth](https://wiki.hoodedhorse.com/Manor_Lords/Regional_wealth)
- ML wiki: [Burgage plot](https://wiki.hoodedhorse.com/Manor_Lords/Burgage_plot/en), [Resources](https://wiki.hoodedhorse.com/Manor_Lords/Resources/en), [Beginner's Guide](https://wiki.hoodedhorse.com/Manor_Lords/Beginner's_Guide/en), [0.7.972 update](https://wiki.hoodedhorse.com/Manor_Lords/0.7.972_-_Update_1), [FAQ](https://wiki.hoodedhorse.com/Manor_Lords/FAQ)
- Guides: [GameSpot, approval](https://Gamespot.com/articles/manor-lords-increase-approval-population-guide/1100-6523010/), [GameSpot, claiming regions](https://gamespot.com/articles/manor-lords-claim-regions-influence/1100-6523011/), [Gamer Guides, treasury](https://gamerguides.com/manor-lords/guide/basics/economy/treasury-wealth-explained), [SI, trade](https://videogames.si.com/guides/manor-lords-how-to-trade)
- Press and players: [Seasoned Gaming](https://seasonedgaming.com/2024/05/04/early-access-review-manor-lords-to-reign-or-refrain/), [GameGeeker](https://gamegeeker.com/games/manor-lords/review?market=HK), [Vaporlens](https://vaporlens.app/app/1363080/manor_lords), [Steam](https://steamcommunity.com/app/1363080/discussions/0/4355619963547135388/?ctp=3)

### Total War
- [Wikipedia: Rome: Total War](https://en.wikipedia.org/wiki/Rome:_Total_War), [Wikipedia: Medieval II: Total War](https://en.wikipedia.org/wiki/Medieval_II:_Total_War)
- Total War wiki: [Attila "Terry"](https://wiki.totalwar.com/w/Total_War:_ATTILA_Terry), [Assembly Kit "Terry" intro](https://wiki.totalwar.com/w/TWW_Assembly_Kit_Terry_Intro); [totalwar.com, Warhammer III sieges](https://www.totalwar.com/?p=15524)
- Players: [Steam 1](https://steamcommunity.com/app/1142710/discussions/0/4353373056338659396), [Steam 2](https://steamcommunity.com/app/1142710/discussions/0/3832045251561220120), [Steam 3](https://steamcommunity.com/app/1142710/discussions/0/4521135313690233108)
- On phones: [Cosmocover, Medieval II on iOS and Android](https://www.cosmocover.com/newsroom/total-war-medieval-ii-out-now-on-ios-and-android/), [Pocket Tactics review](https://www.pockettactics.com/total-war-medieval-2/mobile-review), [Feral, Rome](https://feralinteractive.com/en/news/685)

### Mount & Blade II: Bannerlord
- GameBanshee: [battle terrain](https://gamebanshee.com/a9p6w), [scenes 1](https://gamebanshee.com/k48fk), [scenes 2](https://gamebanshee.com/k4qw9), [towns](https://gamebanshee.com/k4hcx), [casualty report](https://www.gamebanshee.com/k4dd4)
- [PC Gamer, graphics settings](https://pcgamer.com/bannerlord-best-graphics-settings-mount-blade-2), [Gamepressure, resource map](https://www.gamepressure.com/newsroom/bannerlord-helpful-map-of-resources-and-goods/z61b0c)
- Players: [Steam, scenes](https://steamcommunity.com/app/261550/discussions/0/3397428060593018050), [Steam, villages](https://steamcommunity.com/app/261550/discussions/0/2144217924393833920), [Steam, kingdoms](https://steamcommunity.com/app/261550/discussions/0/4783413655228866890)

### Dwarf Fortress and Songs of Syx
- DF wiki: [Embark](https://dwarffortresswiki.org/index.php/DF2014:Embark), [Historical figure](https://dwarffortresswiki.org/index.php/Historical_figure), [World activities](https://dwarffortresswiki.org/index.php/World_activities), [Raid](https://dwarffortresswiki.org/index.php/Raid)
- DF players: [Steam](https://steamcommunity.com/app/975370/discussions/0/3727323721773035648), [blog](https://ponti.bearblog.dev/dwarf-fortress-on-steam)
- Songs of Syx: [Substack essay](https://sobanthestranger.substack.com/p/songs-of-societal-collapse), [devlog v58](https://songsofsyx.itch.io/songs-of-syx/devlog/267026/v58-conquest), [GamingOnLinux](https://www.gamingonlinux.com/2020/03/epic-city-state-simulator-songs-of-syx-is-very-promising-and-now-on-kickstarter/page=1/), [Vaporlens](https://vaporlens.app/app/1162750/songs_of_syx/stats/details)

### Knights of Honor II
- [Gamepressure guide](https://www.gamepressure.com/S013-amp.asp?ID=19976), [Gamer Journalist tips](https://gamerjournalist.com/knights-of-honor-2-sovereign-starting-tips-and-tricks/), [Prima review](https://primagames.com/reviews/knights-of-honor-ii-sovereign-review), [Way Too Many Games review](https://waytoomany.games/2023/01/27/review-knights-of-honor-ii-sovereign/)

### Mobile strategy games
- Age of History 3: [App Store](https://apps.apple.com/app/id6686394372), [Pocket Edition on Steam](https://store.steampowered.com/app/3238550/Age_of_History_3_Pocket_Edition/)
- [European War 7: Medieval, App Store](https://apps.apple.com/US/app/id1597697423), [Bronze Age, App Store](https://apps.apple.com/app/id704623156)
- [AV Club on Reigns](https://www.avclub.com/reigns-offers-grand-strategy-by-way-of-tinder), [Warband on Android](https://www.phonearena.com/news/Online-RPG-Mount---Blade-Warband-available-for-Tegra-4-Android-devices_id53747), [PocketGamer.biz, Prison Architect](https://www.pocketgamer.biz/breaking-out-the-making-of-prison-architect)
- Total War on phones and CK3 on consoles: see their own groups above.

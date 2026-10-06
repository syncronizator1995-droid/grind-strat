# Grind Strat: project rules for Claude Code

Grind Strat is a slow, deep grand strategy game for phones, in English, played in portrait and offline.
It follows the Baltic lands from the first hunters of 10,000 BC to today. The player is a hunter band,
then a tribe, then a dynasty in the Middle Ages, then the country. It borrows from Crusader Kings 3,
Europa Universalis 4, Hearts of Iron 4, Total War, Manor Lords, Far Cry Primal and Arma Reforger.

Owner: Ignas. Read these before planning any work:

- docs/HANDOFF.md: what to build now, step by step, with tests and acceptance checks.
- docs/DESIGN.md: the whole design.
- docs/CONVERSATION.md: how each decision was reached, in Ignas's own words.
- data/sources.md: every real fact the game uses, with links.

The living plan is a Claude Doc that Ignas keeps on claude.ai. The docs here are a snapshot from
6 October 2026. If they disagree with what Ignas says now, Ignas wins: update the docs.

## Working with Ignas (most important)

1. Plan first, build second. For anything bigger than a small fix, use plan mode (Shift+Tab twice),
   show the plan in plain words, and wait for his OK. Building ahead of agreement is the one mistake
   this project has already made. Don't repeat it.
2. Never change a design decision on your own. Propose it with the trade-off, let him choose,
   then update docs/DESIGN.md.
3. Talk plainly and briefly. No jargon unless he asks. He often reads on his phone.
4. He pushes back when he disagrees. Take it seriously, and push back too when you have reasons.
5. Nothing is ever final ("everything is open in the plan"). Keep decisions easy to change.
6. Every step ends with something he can play on his phone, plus a short note:
   what's new, what to try, what's missing.

## Hard rules

- The game ships as ONE self-contained file: dist/grind-strat.html. No network at runtime:
  no CDN, no remote fonts, images or data. Everything is inlined.
- Portrait phone first (360 to 430 px wide, touch). Desktop must also work (mouse, wheel zoom).
- Zero runtime dependencies. Dev-only tools are allowed and kept few.
- All game text in English, in plain words.
- History must be right. Every real person, date, place and map stage the game uses is listed in
  data/sources.md with a link. If unsure, mark it TO CHECK in the data and tell Ignas.
  Never invent a "fact". Made-up people and details are fine, but are marked as invented.
- No errors: tests and soak runs pass before anything is shown to Ignas.
- Occupations, deportations and the Holocaust are shown truthfully and with respect,
  never as rewards or jokes.

## Architecture

- src/sim/: the game rules. Plain data in, plain data out. No DOM, no canvas, no Date.now(),
  no Math.random(). Runs in Node for tests.
- src/ui/: drawing (canvas 2D), screens, input, sound. Reads sim state, sends player actions.
- src/data/: map and history data as JSON, made by tools/ scripts or by hand, with sources.
- tools/: the build script and data-processing scripts.
- test/: unit tests, invariant checks, soak runs, phone screenshots.
- prototype/: earlier prototypes, for reference only. Copy ideas or code into src/ on purpose;
  never import from prototype/.
- docs/: design, handoff, conversation.

## Code rules

- Modern JavaScript modules with JSDoc types and `// @ts-check` in every file; type-check with
  TypeScript (checkJs, noEmit). If Ignas later prefers full TypeScript, switching is fine. Ask first.
- Deterministic simulation: one seeded random generator whose state lives in the save.
  Same seed and same player actions give the same game.
- Fixed time steps: the sim advances in whole days (or the current age's step).
  The frame rate never changes results.
- Save state is plain JSON: no functions, classes, Maps or Sets. Saves carry a version number;
  old saves migrate, or fail with a clear message.
- Derived data (indexes, caches) is rebuilt after loading, never saved.
- Performance budgets: one game day under 5 ms on a mid-range phone with the full map;
  map drawing at 60 fps; start-up under 3 s; a save under 2 MB.
- Small functions, clear names, comments that explain why.

## Commands (create them in step 1 if missing)

- npm run build: writes dist/grind-strat.html
- npm test: unit tests, invariants and a short soak
- npm run soak: long runs, many seeds over a full era
- npm run check: type check
- npm run shots: phone-size screenshots of the main screens (Playwright, 390 x 844)

## Definition of done, for every step

1. Ignas agreed to the plan for this step.
2. npm test, npm run soak and npm run check all pass.
3. dist/grind-strat.html opens offline on a phone in portrait and plays.
4. Screenshots checked for overlapping or cut-off text and unreadable sizes.
5. docs/DESIGN.md, docs/HANDOFF.md and data/sources.md are updated.
6. A plain-language note for Ignas: what's new, what to try, known gaps.

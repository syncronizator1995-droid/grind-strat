# Grind Strat

A slow, deep grand strategy game for phones, in English, played in portrait and offline. It follows
the Baltic lands from the first hunters of 10,000 BC to today: a hunter band, then a tribe, then a
dynasty in the Middle Ages, then the country.

**Play it:** https://syncronizator1995-droid.github.io/grind-strat/
(open it on your phone, then tap Install, or on an iPhone: Share, then Add to Home Screen).

Right now (step 1) it is the empty frame of the game: the date, pause and five speeds, saves and
autosaves, and installing like an app. The map arrives in step 2.

## Read first

- [CLAUDE.md](CLAUDE.md): project rules.
- [docs/HANDOFF.md](docs/HANDOFF.md): what to build, step by step.
- [docs/DESIGN.md](docs/DESIGN.md): the whole design and every decision so far.
- [docs/LEVELS.md](docs/LEVELS.md): what you do at each level of play, and how the levels connect.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the technical rules that keep the parts working together.
- [docs/CONVERSATION.md](docs/CONVERSATION.md): how each decision was reached.
- [data/sources.md](data/sources.md): every real fact the game uses, with links.

## Commands

Needs Node 22 or newer. Run `npm install` once, and `npx playwright install chromium` once for
the screenshots.

| Command | What it does |
| --- | --- |
| `npm run build` | Makes `dist/grind-strat.html`, the whole game in one offline file, plus the install files |
| `npm test` | Rules tests, build checks and a short soak run |
| `npm run soak` | 100 computer-played games from 1219 to 1569, checking that nothing breaks |
| `npm run check` | Type check |
| `npm run shots` | Phone-size screenshots and a scripted play session (`shots/`) |

GitHub runs all of these on every pull request, and publishes the game when `main` changes.

## Folders

- `src/sim/`: the game rules (no screen code; runs in Node for tests).
- `src/ui/`: the screen, styles, font, icons and install pieces.
- `src/data/`: map and history data (from step 2).
- `tools/`: the build and one-off scripts (font cutting, icon drawing).
- `test/`: tests, the soak runner and the screenshot script.
- `docs/`: design, handoff, levels, architecture, research.
- `prototype/`: earlier prototypes, for reference only.

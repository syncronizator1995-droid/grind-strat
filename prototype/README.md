# Prototype

Code written during the planning chat in October 2026. It works and is tested, but it is a starting
point, not final code. Never import from here: copy what you need into src/ on purpose.
Full notes are in docs/HANDOFF.md, section 4.

## realm/ (the realm and dynasty engine, once called "Kin & Crown")

- realm1.js and realm2.js: the engine, split in two. Join them to run: `cat realm1.js realm2.js > realm.js`.
- test.js: five worlds over 150 years with the computer playing everyone. Run `node test.js`.
- test2.js: save and load determinism, plus every player action. Run `node test2.js`.
- ui.js, style.css, shell.html: the unfinished phone interface.
- build.py: joins everything into one HTML file (kin-and-crown.html, next to the script).
- shot.py: phone-size screenshots with Playwright. Unfinished: it stopped when an event card covered the screen.
- screenshots/: what the interface looked like.

## hamlet/ (the town builder)

- sim.js: town rules only (houses, families, production chains, seasons, approval, goals). No interface.

## font/

- Grenze Gotisch, cut down to Latin letters, with its OFL licence. build.py reads gg.b64.

## What came through to the repo (6 October 2026)

Only part of the prototype was uploaded when the project moved to GitHub:

- realm/: build.py, shot.py, shell.html, style.css, and the 9 screenshots in realm/screenshots/
  (named after the steps in shot.py).
- font/: OFL.txt only.

Missing: realm/realm1.js, realm/realm2.js, realm/ui.js, realm/test.js, realm/test2.js,
hamlet/sim.js, font/gg.b64 and the font's woff2. Ignas chose to rewrite the engine in step 3a
around the new design instead of uploading them, so these files are not needed. The game's font
now lives in src/ui/fonts/, taken fresh from Google Fonts (see data/sources.md).

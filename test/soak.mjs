// @ts-check
// Soak runner: lets the computer play many long games and checks the invariants every game year.
//   npm run soak                          100 seeds from 1219 to 1569
//   node test/soak.mjs --seeds 10 --to 1300
// Every game starts on 1 January 1219, the start of the Middle Ages campaign.
// Reports errors (must be zero), time per game year, save size and start-up time.
// In step 1 there is almost nothing to simulate; step 3 fills this in with computer-run rulers
// and the history numbers from HANDOFF section 3.

import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DAYS_PER_YEAR, dateFromDay, dayFromDate } from '../src/sim/calendar.js';
import { advanceDay, fromSave, newGame, START_DAY, toSave } from '../src/sim/game.js';
import { checkInvariants } from '../src/sim/invariants.js';

/**
 * @typedef {object} SoakReport
 * @property {number} seeds
 * @property {number} years game years per seed
 * @property {string[]} errors
 * @property {number} msPerYear average time per game year
 * @property {number} maxSaveBytes the biggest save seen
 * @property {number} startupMs average time to make a new game and load it from its save
 */

/**
 * @param {{ seeds?: number, toYear?: number, firstSeed?: number }} [options]
 * @returns {SoakReport}
 */
export function runSoak({ seeds = 100, toYear = 1569, firstSeed = 1 } = {}) {
  const fromYear = dateFromDay(START_DAY).year;
  /** @type {string[]} */
  const errors = [];
  const years = toYear - fromYear;
  let simMs = 0;
  let startupMs = 0;
  let maxSaveBytes = 0;
  const endDay = dayFromDate(toYear, 1, 1);

  for (let s = 0; s < seeds; s++) {
    const seed = firstSeed + s;
    const t0 = performance.now();
    const fresh = fromSave(toSave(newGame(seed)));
    startupMs += performance.now() - t0;
    if (!fresh.ok) {
      errors.push(`seed ${seed}: a new game does not load: ${fresh.error}`);
      continue;
    }
    const state = fresh.state;
    if (state.day !== START_DAY) {
      errors.push(`seed ${seed}: starts on day ${state.day}, not 1 January ${fromYear}`);
      continue;
    }
    const t1 = performance.now();
    while (state.day < endDay) {
      for (let d = 0; d < DAYS_PER_YEAR; d++) advanceDay(state);
      const problems = checkInvariants(state);
      if (problems.length) {
        errors.push(`seed ${seed}, day ${state.day}: ${problems.join('; ')}`);
        break;
      }
      maxSaveBytes = Math.max(maxSaveBytes, Buffer.byteLength(toSave(state)));
    }
    simMs += performance.now() - t1;
  }

  return {
    seeds,
    years,
    errors,
    msPerYear: seeds && years ? simMs / (seeds * years) : 0,
    maxSaveBytes,
    startupMs: seeds ? startupMs / seeds : 0,
  };
}

/** @param {SoakReport} r */
export function formatReport(r) {
  return [
    `Soak: ${r.seeds} seeds x ${r.years} years`,
    `  errors:            ${r.errors.length}`,
    ...r.errors.slice(0, 10).map((e) => `    ${e}`),
    `  time per year:     ${r.msPerYear.toFixed(4)} ms`,
    `  biggest save:      ${r.maxSaveBytes} bytes`,
    `  start-up (sim):    ${r.startupMs.toFixed(3)} ms`,
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  /** @param {string} name @param {number} fallback */
  const num = (name, fallback) => {
    const at = args.indexOf(name);
    const value = at >= 0 ? Number(args[at + 1]) : fallback;
    if (!Number.isInteger(value) || value < 1) {
      console.error(`${name} must be a whole number of 1 or more`);
      process.exit(1);
    }
    return value;
  };
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] !== '--seeds' && args[i] !== '--to') {
      console.error(`unknown option: ${args[i]} (use --seeds N and --to YEAR)`);
      process.exit(1);
    }
  }
  const toYear = num('--to', 1569);
  if (toYear <= 1219) {
    console.error('--to must be after 1219, when every game starts');
    process.exit(1);
  }
  const report = runSoak({ seeds: num('--seeds', 100), toYear });
  console.log(formatReport(report));
  if (report.errors.length) process.exit(1);
}

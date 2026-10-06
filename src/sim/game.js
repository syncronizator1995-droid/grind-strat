// @ts-check
// The game state and the rules that move it. Plain data in, plain data out: no DOM, no clock,
// no Math.random(). In step 1 the state holds only the date and the random numbers; each system
// adds its own slot when it is built (see docs/ARCHITECTURE.md), with a save migration.

import { dayFromDate } from './calendar.js';
import { checkInvariants } from './invariants.js';
import { seedRng } from './random.js';

/** Bump when the save shape changes, and add a migration below. */
export const SAVE_VERSION = 1;

/** The Middle Ages campaign starts on 1 January 1219 (HANDOFF section 3). */
export const START_DAY = dayFromDate(1219, 1, 1);

/**
 * Everything the game knows. Kept as plain JSON so it saves as it is.
 * @typedef {object} GameState
 * @property {number} version save format version
 * @property {number} seed the seed the world was made from
 * @property {number[]} rng the random generator's state (see random.js)
 * @property {number} day days since 1 January 1 AD (see calendar.js)
 */

/**
 * Starts a new game.
 * @param {number} seed
 * @returns {GameState}
 */
export function newGame(seed) {
  const s = seed >>> 0;
  return { version: SAVE_VERSION, seed: s, rng: seedRng(s), day: START_DAY };
}

/**
 * Moves the game on by one day. The only way time passes: the screen calls this a whole number
 * of times per frame, so a slow or fast phone never changes the results.
 * @param {GameState} state changed in place
 */
export function advanceDay(state) {
  state.day += 1;
  // Daily, monthly and yearly work for each system goes here as the systems are built.
}

/**
 * The save text for a state.
 * @param {GameState} state
 * @returns {string}
 */
export function toSave(state) {
  return JSON.stringify(state);
}

/**
 * Old save versions and how to bring each one up to date: version -> function returning the
 * next version's state. Empty until the save shape first changes.
 * @type {Record<number, (old: any) => any>}
 */
const MIGRATIONS = {};

/**
 * @typedef {{ ok: true, state: GameState } | { ok: false, error: string }} LoadResult
 */

/**
 * Reads a save. Never throws: a bad save gives a clear message instead.
 * @param {string} text
 * @returns {LoadResult}
 */
export function fromSave(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This save is damaged and cannot be read.' };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'This is not a Grind Strat save.' };
  }
  if (!Number.isInteger(data.version) || data.version < 1) {
    return { ok: false, error: 'This is not a Grind Strat save.' };
  }
  if (data.version > SAVE_VERSION) {
    return { ok: false, error: 'This save comes from a newer version of the game. Update the game to load it.' };
  }
  while (data.version < SAVE_VERSION) {
    /** @type {((old: any) => any) | undefined} */
    const migrate = MIGRATIONS[data.version];
    if (!migrate) return { ok: false, error: `Saves from version ${data.version} can no longer be loaded.` };
    data = migrate(data);
  }
  const errors = checkInvariants(data);
  if (errors.length) return { ok: false, error: `This save is damaged: ${errors[0]}` };
  return { ok: true, state: /** @type {GameState} */ (data) };
}

// @ts-check
// Things that must always be true about the game state. Soak runs check them every game year,
// and loading a save checks them too. Each system adds its own checks as it is built
// (HANDOFF section 3 lists the ones planned for the Middle Ages).

import { dayFromDate } from './calendar.js';

/** The game runs from 10,000 BC to today; anything far outside that is a broken day count. */
export const FIRST_DAY = dayFromDate(-10000, 1, 1);
export const LAST_DAY = dayFromDate(9999, 12, 31);

/**
 * Returns a list of problems; an empty list means the state is sound.
 * @param {any} state
 * @returns {string[]}
 */
export function checkInvariants(state) {
  /** @type {string[]} */
  const errors = [];
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    return ['the state is not an object'];
  }
  checkPlainData(state, 'state', errors);
  if (!Number.isInteger(state.version) || state.version < 1) errors.push('version is not a whole number of 1 or more');
  if (!Number.isInteger(state.seed) || state.seed < 0 || state.seed > 0xffffffff) errors.push('seed is not a 32-bit whole number');
  if (!Number.isInteger(state.day)) errors.push('day is not a whole number');
  else if (state.day < FIRST_DAY || state.day > LAST_DAY) errors.push(`day ${state.day} is outside 10,000 BC to 9999 AD`);
  checkRng(state.rng, errors);
  return errors;
}

/**
 * The random generator's state: four unsigned 32-bit numbers, not all zero.
 * @param {any} rng
 * @param {string[]} errors
 */
function checkRng(rng, errors) {
  if (!Array.isArray(rng) || rng.length !== 4) {
    errors.push('rng is not a list of four numbers');
    return;
  }
  if (!rng.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)) {
    errors.push('rng holds a number that is not an unsigned 32-bit whole number');
  } else if (rng.every((n) => n === 0)) {
    errors.push('rng is all zeros');
  }
}

/**
 * Saves are plain JSON: no NaN or Infinity, no undefined, functions, classes, Maps or Sets.
 * Walks the whole state, so it also catches a broken number deep inside a later system.
 * @param {any} value
 * @param {string} path where we are, for the error message
 * @param {string[]} errors
 */
function checkPlainData(value, path, errors) {
  if (errors.length >= 20) return; // enough to diagnose; stop before flooding the report
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) errors.push(`${path} is ${value}`);
      return;
    case 'string':
    case 'boolean':
      return;
    case 'object':
      if (value === null) return;
      if (Array.isArray(value)) {
        value.forEach((v, i) => checkPlainData(v, `${path}[${i}]`, errors));
        return;
      }
      if (Object.getPrototypeOf(value) !== Object.prototype) {
        errors.push(`${path} is not plain data (${value.constructor?.name ?? 'unknown'})`);
        return;
      }
      for (const [k, v] of Object.entries(value)) checkPlainData(v, `${path}.${k}`, errors);
      return;
    default:
      errors.push(`${path} is ${typeof value}, which a save cannot hold`);
  }
}

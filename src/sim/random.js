// @ts-check
// Seeded random numbers. The whole game uses one generator whose state is four whole numbers
// kept in the save, so the same seed and the same player actions always give the same game.
// Never use Math.random() in src/sim.
//
// Generator: sfc32 (Chris Doty-Humphrey's "small fast counting" generator), seeded through
// splitmix32 so that nearby seeds such as 1 and 2 still start far apart.

/**
 * Four unsigned 32-bit numbers: the generator's whole state. Plain data, so it saves as JSON.
 * @typedef {number[]} RngState
 */

/**
 * Makes a fresh generator state from a seed.
 * @param {number} seed any whole number; only its low 32 bits matter
 * @returns {RngState}
 */
export function seedRng(seed) {
  let x = seed >>> 0;
  /** splitmix32: spreads one number into well-mixed ones. */
  const next = () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  const state = [next(), next(), next(), next()];
  // sfc32 needs a non-zero state; splitmix32 makes all four zero only in theory, but be sure.
  if ((state[0] | state[1] | state[2] | state[3]) === 0) state[3] = 1;
  // Warm up, as the generator's author recommends.
  for (let i = 0; i < 12; i++) nextU32(state);
  return state;
}

/**
 * Next unsigned 32-bit number. Changes `state` in place.
 * @param {RngState} state
 * @returns {number}
 */
export function nextU32(state) {
  let [a, b, c, d] = state;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  state[0] = a >>> 0;
  state[1] = b;
  state[2] = c;
  state[3] = d;
  return t;
}

/**
 * Next number from 0 (included) to 1 (not included).
 * @param {RngState} state
 * @returns {number}
 */
export function nextFloat(state) {
  return nextU32(state) / 4294967296;
}

/**
 * Next whole number from 0 to n - 1.
 * @param {RngState} state
 * @param {number} n a whole number from 1 to 2^32
 * @returns {number}
 */
export function nextInt(state, n) {
  if (!Number.isInteger(n) || n < 1 || n > 4294967296) throw new RangeError(`bad range: ${n}`);
  return Math.floor(nextFloat(state) * n);
}

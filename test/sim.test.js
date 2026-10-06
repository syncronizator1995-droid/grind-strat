// @ts-check
// Rules tests: the calendar, random numbers, saves and the invariant checker.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dateFromDay, dayFromDate, formatDate, isFirstOfMonth } from '../src/sim/calendar.js';
import { advanceDay, fromSave, newGame, SAVE_VERSION, START_DAY, toSave } from '../src/sim/game.js';
import { checkInvariants } from '../src/sim/invariants.js';
import { nextFloat, nextInt, nextU32, seedRng } from '../src/sim/random.js';

describe('calendar', () => {
  it('starts the Middle Ages on 1 January 1219', () => {
    assert.equal(formatDate(START_DAY), '1 January 1219');
    assert.equal(formatDate(newGame(1).day), '1 January 1219');
  });

  it('has 365-day years with no leap days', () => {
    assert.equal(formatDate(START_DAY + 365), '1 January 1220');
    assert.equal(formatDate(START_DAY + 364), '31 December 1219');
    assert.equal(formatDate(START_DAY + 31 + 27), '28 February 1219');
    assert.equal(formatDate(START_DAY + 31 + 28), '1 March 1219');
    assert.equal(formatDate(dayFromDate(1600, 2, 28) + 1), '1 March 1600');
  });

  it('round-trips every day of a year, and real dates such as Grunwald', () => {
    for (let d = START_DAY; d < START_DAY + 365; d++) {
      const { year, month, day } = dateFromDay(d);
      assert.equal(dayFromDate(year, month, day), d);
    }
    assert.equal(formatDate(dayFromDate(1410, 7, 15)), '15 July 1410');
  });

  it('counts BC years with no year 0', () => {
    assert.equal(dayFromDate(1, 1, 1), 0);
    assert.equal(formatDate(-1), '31 December 1 BC');
    assert.equal(formatDate(dayFromDate(-10000, 1, 1)), '1 January 10000 BC');
    assert.deepEqual(dateFromDay(dayFromDate(-5000, 6, 30)), { year: -5000, month: 6, day: 30 });
    assert.throws(() => dayFromDate(0, 1, 1), RangeError);
  });

  it('rejects impossible dates', () => {
    assert.throws(() => dayFromDate(1219, 2, 29), RangeError);
    assert.throws(() => dayFromDate(1219, 13, 1), RangeError);
    assert.throws(() => dayFromDate(1219, 1, 0), RangeError);
  });

  it('knows the first day of each month', () => {
    const firsts = [];
    for (let d = START_DAY; d < START_DAY + 365; d++) if (isFirstOfMonth(d)) firsts.push(formatDate(d));
    assert.equal(firsts.length, 12);
    assert.equal(firsts[0], '1 January 1219');
    assert.equal(firsts[11], '1 December 1219');
  });
});

describe('random numbers', () => {
  it('gives the same numbers for the same seed', () => {
    const a = seedRng(42);
    const b = seedRng(42);
    for (let i = 0; i < 1000; i++) assert.equal(nextU32(a), nextU32(b));
  });

  it('gives different numbers for nearby seeds', () => {
    const a = seedRng(1);
    const b = seedRng(2);
    const same = Array.from({ length: 100 }, () => nextU32(a) === nextU32(b)).filter(Boolean).length;
    assert.ok(same < 3, `${same} of 100 numbers matched`);
  });

  it('stays in range and keeps its state as plain numbers', () => {
    const r = seedRng(7);
    for (let i = 0; i < 10000; i++) {
      const f = nextFloat(r);
      assert.ok(f >= 0 && f < 1);
      const n = nextInt(r, 6);
      assert.ok(Number.isInteger(n) && n >= 0 && n < 6);
    }
    assert.ok(r.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff));
    assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
  });

  it('is roughly even', () => {
    const r = seedRng(123);
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 100000; i++) counts[nextInt(r, 10)]++;
    for (const c of counts) assert.ok(c > 9500 && c < 10500, `bucket count ${c}`);
  });
});

describe('game and saves', () => {
  /**
   * Plays some days, drawing random numbers the way later systems will.
   * @param {import('../src/sim/game.js').GameState} state
   * @param {number} days
   */
  function play(state, days) {
    const draws = [];
    for (let i = 0; i < days; i++) {
      advanceDay(state);
      draws.push(nextU32(state.rng));
    }
    return draws;
  }

  it('gives the same game for the same seed', () => {
    const a = newGame(99);
    const b = newGame(99);
    assert.deepEqual(play(a, 500), play(b, 500));
    assert.deepEqual(a, b);
  });

  it('continues exactly the same after save and load', () => {
    const straight = newGame(2024);
    const saved = newGame(2024);
    play(straight, 200);
    play(saved, 200);
    const loaded = fromSave(toSave(saved));
    assert.ok(loaded.ok);
    if (!loaded.ok) return;
    assert.deepEqual(play(loaded.state, 300), play(straight, 300));
    assert.deepEqual(loaded.state, straight);
  });

  it('saves plain JSON with a version number', () => {
    const state = newGame(5);
    const data = JSON.parse(toSave(state));
    assert.equal(data.version, SAVE_VERSION);
    assert.deepEqual(Object.keys(data).sort(), ['day', 'rng', 'seed', 'version']);
  });

  it('refuses bad saves with a clear message instead of crashing', () => {
    /** @param {string} text */
    const error = (text) => {
      const r = fromSave(text);
      assert.equal(r.ok, false);
      return r.ok ? '' : r.error;
    };
    assert.match(error('{not json'), /damaged/);
    assert.match(error('[1,2]'), /not a Grind Strat save/);
    assert.match(error('{"hello":1}'), /not a Grind Strat save/);
    assert.match(error(JSON.stringify({ ...newGame(1), version: SAVE_VERSION + 1 })), /newer version/);
    assert.match(error(JSON.stringify({ ...newGame(1), day: 1.5 })), /damaged: day/);
    assert.match(error(JSON.stringify({ ...newGame(1), rng: [0, 0, 0, 0] })), /damaged: rng/);
  });
});

describe('invariants', () => {
  it('passes a fresh game', () => {
    assert.deepEqual(checkInvariants(newGame(3)), []);
  });

  it('catches broken numbers anywhere in the state', () => {
    const state = /** @type {any} */ (newGame(3));
    state.day = NaN;
    assert.ok(checkInvariants(state).some((e) => e.includes('state.day is NaN')));
    const deep = /** @type {any} */ (newGame(3));
    deep.later = { realms: [{ gold: Infinity }] };
    assert.ok(checkInvariants(deep).some((e) => e.includes('state.later.realms[0].gold is Infinity')));
  });

  it('catches things a save cannot hold', () => {
    const state = /** @type {any} */ (newGame(3));
    state.a = undefined;
    state.b = () => 1;
    state.c = new Map();
    state.d = new Set();
    const errors = checkInvariants(state);
    assert.ok(errors.some((e) => e.includes('state.a is undefined')));
    assert.ok(errors.some((e) => e.includes('state.b is function')));
    assert.ok(errors.some((e) => e.includes('state.c is not plain data (Map)')));
    assert.ok(errors.some((e) => e.includes('state.d is not plain data (Set)')));
  });

  it('catches a bad day, seed or random state', () => {
    assert.ok(checkInvariants({ ...newGame(3), day: 2.5 }).includes('day is not a whole number'));
    assert.ok(checkInvariants({ ...newGame(3), seed: -1 }).includes('seed is not a 32-bit whole number'));
    assert.ok(checkInvariants({ ...newGame(3), rng: [1, 2, 3] }).includes('rng is not a list of four numbers'));
    assert.ok(checkInvariants({ ...newGame(3), rng: [1, 2, 3, 2 ** 32] }).some((e) => e.startsWith('rng holds')));
    assert.deepEqual(checkInvariants(null), ['the state is not an object']);
  });
});

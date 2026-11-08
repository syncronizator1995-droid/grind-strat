// @ts-check
// Tests for the screen's pure logic: the clock and when to autosave.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayFromDate } from '../src/sim/calendar.js';
import { AUTOSAVE_MIN_GAP_MS, monthStartedSince, shouldAutosave } from '../src/ui/autosave.js';
import { daysForFrame, MAX_DAYS_PER_FRAME, MAX_FRAME_SECONDS, SPEEDS } from '../src/ui/clock.js';

describe('clock', () => {
  it('has pause plus five speeds, getting faster', () => {
    assert.equal(SPEEDS.length, 6);
    assert.equal(SPEEDS[0], 0);
    for (let i = 1; i < SPEEDS.length; i++) assert.ok(SPEEDS[i] > SPEEDS[i - 1]);
  });

  it('runs nothing while paused', () => {
    assert.deepEqual(daysForFrame(0.5, 1, 0), { days: 0, carry: 0 });
  });

  /**
   * Days run over `seconds` of real time at a steady frame rate.
   * @param {number} fps
   * @param {number} speed
   * @param {number} seconds
   */
  function daysOver(fps, speed, seconds) {
    let carry = 0;
    let total = 0;
    for (let f = 0; f < fps * seconds; f++) {
      const step = daysForFrame(carry, 1 / fps, speed);
      carry = step.carry;
      total += step.days;
    }
    return total;
  }

  it('runs the same number of days whatever the frame rate', () => {
    for (let speed = 1; speed <= 4; speed++) {
      const expected = SPEEDS[speed] * 10;
      for (const fps of [24, 30, 60, 90, 120, 144]) {
        assert.ok(Math.abs(daysOver(fps, speed, 10) - expected) <= 1, `speed ${speed} at ${fps} fps`);
      }
    }
  });

  it('never leaps after a long pause between frames', () => {
    const step = daysForFrame(0, 30, 4);
    assert.equal(step.days, Math.floor(MAX_FRAME_SECONDS * SPEEDS[4]));
    assert.ok(step.days <= MAX_DAYS_PER_FRAME);
  });
});

describe('autosave', () => {
  const firstOfMarch = dayFromDate(1219, 3, 1);

  it('saves when a new month begins, not within the same month', () => {
    assert.equal(shouldAutosave(firstOfMarch, firstOfMarch - 28, 10_000, 0), true);
    assert.equal(shouldAutosave(firstOfMarch + 1, firstOfMarch, 10_000, 0), false);
    assert.equal(shouldAutosave(firstOfMarch + 30, firstOfMarch, 10_000, 0), false);
    assert.equal(monthStartedSince(firstOfMarch + 31, firstOfMarch), true);
  });

  it('catches up on a month that passed inside the gap, instead of skipping it', () => {
    // Speed 5: 1 March arrives only 1 second after the last autosave...
    assert.equal(shouldAutosave(firstOfMarch, firstOfMarch - 28, 1000, 0), false);
    // ...so the save happens a few days later, as soon as the gap is over.
    assert.equal(shouldAutosave(firstOfMarch + 5, firstOfMarch - 28, AUTOSAVE_MIN_GAP_MS, 0), true);
  });

  it('never leaves the stored game more than a gap behind, even at top speed', () => {
    let lastDay = dayFromDate(1219, 1, 1);
    let lastMs = 0;
    let longest = 0;
    for (let frameNo = 1; frameNo <= 60 * 20; frameNo++) {
      const nowMs = frameNo * (1000 / 60); // 60 frames a second
      const day = dayFromDate(1219, 1, 1) + frameNo * 30; // 30 days a frame
      if (shouldAutosave(day, lastDay, nowMs, lastMs)) {
        longest = Math.max(longest, nowMs - lastMs);
        lastDay = day;
        lastMs = nowMs;
      }
    }
    assert.ok(longest <= AUTOSAVE_MIN_GAP_MS + 1000 / 60 + 1, `longest gap ${longest} ms`);
  });

  it('fires once a month over a year at normal speed', () => {
    let lastDay = dayFromDate(1219, 1, 1);
    let lastMs = 0;
    let saves = 0;
    for (let d = lastDay + 1; d <= dayFromDate(1220, 1, 1); d++) {
      const nowMs = (d - lastDay) * 500 + lastMs; // speed 1: 2 days a second
      if (shouldAutosave(d, lastDay, nowMs, lastMs)) {
        saves++;
        lastDay = d;
        lastMs = nowMs;
      }
    }
    assert.equal(saves, 12);
  });

  it('does not save the same day twice, or too often in real time', () => {
    assert.equal(shouldAutosave(firstOfMarch, firstOfMarch, 10_000, 0), false);
    assert.equal(shouldAutosave(firstOfMarch, firstOfMarch - 28, AUTOSAVE_MIN_GAP_MS, 0), true);
    assert.equal(shouldAutosave(firstOfMarch, firstOfMarch - 28, AUTOSAVE_MIN_GAP_MS - 1, 0), false);
  });
});

describe('tap tracker', () => {
  /** @param {number} id @param {number} x @param {number} y @param {number} time @param {object} [more] */
  const ev = (id, x, y, time, more = {}) => ({ pointerId: id, x, y, time, button: 0, isPrimary: true, ...more });
  it('is a tap when short and still, within the slop', async () => {
    const { createTapTracker, TAP_MS, TAP_SLOP_PX } = await import('../src/ui/map/hit.js');
    const t = createTapTracker();
    t.down(ev(1, 50, 50, 1000), 1);
    assert.deepEqual(t.start, { x: 50, y: 50 });
    assert.equal(t.move(ev(1, 50 + TAP_SLOP_PX - 1, 50, 1100)), 'hold');
    assert.equal(t.up(ev(1, 54, 50, 1000 + TAP_MS - 1)), true);
    t.down(ev(1, 50, 50, 1000), 1);
    assert.equal(t.up(ev(1, 50, 50, 1000 + TAP_MS)), false, 'a long press is not a tap');
  });
  it('releases once past the slop, then is free, and the touch is no tap', async () => {
    const { createTapTracker, TAP_SLOP_PX } = await import('../src/ui/map/hit.js');
    const t = createTapTracker();
    t.down(ev(1, 0, 0, 0), 1);
    assert.equal(t.move(ev(1, TAP_SLOP_PX, 0, 10)), 'release');
    assert.equal(t.move(ev(1, TAP_SLOP_PX + 1, 0, 20)), 'free');
    assert.equal(t.move(ev(1, 2, 0, 30)), 'free', 'back near the start does not hold again');
    assert.equal(t.up(ev(1, 2, 0, 40)), false);
  });
  it('drops the tap for a second finger, cancel, the right button or a non-primary pointer', async () => {
    const { createTapTracker } = await import('../src/ui/map/hit.js');
    const t = createTapTracker();
    t.down(ev(1, 0, 0, 0), 1);
    t.down(ev(2, 30, 0, 5), 2);
    assert.equal(t.move(ev(1, 1, 0, 6)), 'free');
    assert.equal(t.up(ev(1, 1, 0, 7)), false);
    assert.equal(t.up(ev(2, 30, 0, 8)), false);
    t.down(ev(1, 0, 0, 0), 1);
    t.cancel();
    assert.equal(t.up(ev(1, 0, 0, 5)), false);
    t.down(ev(1, 0, 0, 0, { button: 2 }), 1);
    assert.equal(t.up(ev(1, 0, 0, 5)), false);
    t.down(ev(1, 0, 0, 0, { isPrimary: false }), 1);
    assert.equal(t.move(ev(1, 1, 0, 1)), 'free');
    assert.equal(t.up(ev(1, 0, 0, 5)), false);
    t.down(ev(1, 0, 0, 0), 1);
    assert.equal(t.up(ev(7, 0, 0, 5)), false, 'another pointer going up is not this tap');
  });
});

// @ts-check
// Turns real time into whole game days. The game only ever moves in whole days (advanceDay), so
// the frame rate changes how smooth the date looks, never what happens.

/** Days per second for pause and the five speeds. Easy to tune. */
export const SPEEDS = Object.freeze([0, 2, 5, 12, 30, Infinity]);

/** The fastest speed runs as many days as fit in this much time per frame... */
export const FASTEST_BUDGET_MS = 8;
/** ...but never more than this many, so the date stays readable while the game is still small. */
export const MAX_DAYS_PER_FRAME = 30;

/** A frame longer than this (a hidden tab, a hiccup) counts as this long, so time never leaps. */
export const MAX_FRAME_SECONDS = 0.25;

/**
 * How many whole days to run this frame at a fixed speed, and what's left over for next time.
 * @param {number} carry part-days left over from earlier frames (0 to under 1)
 * @param {number} frameSeconds real time since the last frame
 * @param {number} speed 0 to 4 here; speed 5 uses FASTEST_BUDGET_MS instead
 * @returns {{ days: number, carry: number }}
 */
export function daysForFrame(carry, frameSeconds, speed) {
  const perSecond = SPEEDS[speed] ?? 0;
  if (perSecond === 0 || !Number.isFinite(perSecond)) return { days: 0, carry: 0 };
  const total = carry + Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS) * perSecond;
  const days = Math.min(Math.floor(total), MAX_DAYS_PER_FRAME);
  return { days, carry: days === MAX_DAYS_PER_FRAME ? 0 : total - days };
}

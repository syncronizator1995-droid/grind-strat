// @ts-check
// When to autosave (Ignas, 6 Oct 2026): every game month, and always when the app is hidden or
// closed. At the top speeds several months can pass in one real second, and later saves will be
// big, so autosaves are also kept at least AUTOSAVE_MIN_GAP_MS apart. A month that passes inside
// that gap isn't lost: the save happens as soon as the gap is over, so the stored game is never
// more than about two real seconds behind.

import { dateFromDay } from '../sim/calendar.js';

export const AUTOSAVE_MIN_GAP_MS = 2000;

/**
 * A number that changes once per game month.
 * @param {number} day
 */
function monthIndex(day) {
  const d = dateFromDay(day);
  return d.year * 12 + d.month;
}

/**
 * True when a new game month has begun since the last autosave.
 * @param {number} day the game day now
 * @param {number} lastSavedDay the game day of the last autosave
 */
export function monthStartedSince(day, lastSavedDay) {
  return monthIndex(day) !== monthIndex(lastSavedDay);
}

/**
 * @param {number} day the game day just reached
 * @param {number} lastSavedDay the game day of the last autosave
 * @param {number} nowMs real time now, in milliseconds
 * @param {number} lastSavedMs real time of the last autosave
 * @returns {boolean}
 */
export function shouldAutosave(day, lastSavedDay, nowMs, lastSavedMs) {
  return monthStartedSince(day, lastSavedDay) && nowMs - lastSavedMs >= AUTOSAVE_MIN_GAP_MS;
}

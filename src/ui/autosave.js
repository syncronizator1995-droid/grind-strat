// @ts-check
// When to autosave: on the first day of every game month (Ignas, 6 Oct 2026), and always when the
// app is hidden or closed. At the top speeds months fly past, so autosaves are also kept at least
// a couple of real seconds apart to spare the phone's storage.

import { isFirstOfMonth } from '../sim/calendar.js';

export const AUTOSAVE_MIN_GAP_MS = 2000;

/**
 * @param {number} day the game day just reached
 * @param {number} lastSavedDay the game day of the last autosave
 * @param {number} nowMs real time now, in milliseconds
 * @param {number} lastSavedMs real time of the last autosave
 * @returns {boolean}
 */
export function shouldAutosave(day, lastSavedDay, nowMs, lastSavedMs) {
  return isFirstOfMonth(day) && day !== lastSavedDay && nowMs - lastSavedMs >= AUTOSAVE_MIN_GAP_MS;
}

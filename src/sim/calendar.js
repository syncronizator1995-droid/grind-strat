// @ts-check
// The game calendar: 365-day years with no leap days, like Crusader Kings 3 (Ignas, 6 Oct 2026).
// A date is stored as one whole number, `day`: days since 1 January 1 AD. Days before that are
// negative. There is no year 0: 1 BC comes right before 1 AD, as on real calendars.
// In the results below, BC years are negative numbers: -1 is 1 BC, -10000 is 10,000 BC.

export const DAYS_PER_YEAR = 365;

export const MONTH_LENGTHS = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

export const MONTH_NAMES = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

/** First day of each month, counted from 0 within the year. */
const MONTH_STARTS = MONTH_LENGTHS.map((_, i) => MONTH_LENGTHS.slice(0, i).reduce((a, b) => a + b, 0));

/**
 * @typedef {object} GameDate
 * @property {number} year  1 AD is 1, 1 BC is -1; never 0
 * @property {number} month 1 to 12
 * @property {number} day   1 to the month's length
 */

/**
 * Turns a calendar date into the day count.
 * @param {number} year  never 0; negative for BC
 * @param {number} month 1 to 12
 * @param {number} dayOfMonth 1 to the month's length
 * @returns {number}
 */
export function dayFromDate(year, month, dayOfMonth) {
  if (!Number.isInteger(year) || year === 0) throw new RangeError(`bad year: ${year}`);
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError(`bad month: ${month}`);
  const len = MONTH_LENGTHS[month - 1];
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > len) {
    throw new RangeError(`bad day of month: ${dayOfMonth}`);
  }
  const yearIndex = year > 0 ? year - 1 : year;
  return yearIndex * DAYS_PER_YEAR + MONTH_STARTS[month - 1] + dayOfMonth - 1;
}

/**
 * Turns a day count back into a calendar date.
 * @param {number} day
 * @returns {GameDate}
 */
export function dateFromDay(day) {
  const yearIndex = Math.floor(day / DAYS_PER_YEAR);
  const dayOfYear = day - yearIndex * DAYS_PER_YEAR;
  let month = 11;
  while (MONTH_STARTS[month] > dayOfYear) month--;
  return {
    year: yearIndex >= 0 ? yearIndex + 1 : yearIndex,
    month: month + 1,
    day: dayOfYear - MONTH_STARTS[month] + 1,
  };
}

/**
 * "1 January 1219", or "5 March 120 BC" before 1 AD.
 * @param {number} day
 * @returns {string}
 */
export function formatDate(day) {
  const d = dateFromDay(day);
  const year = d.year > 0 ? String(d.year) : `${-d.year} BC`;
  return `${d.day} ${MONTH_NAMES[d.month - 1]} ${year}`;
}

/**
 * True on the first day of a month: the moment for monthly work and autosaves.
 * @param {number} day
 * @returns {boolean}
 */
export function isFirstOfMonth(day) {
  return dateFromDay(day).day === 1;
}

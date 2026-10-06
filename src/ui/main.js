// @ts-check
// The step 1 screen: the date, pause plus five speeds, an empty map, and saves.
// It reads the game state and calls the sim's functions; all rules live in src/sim.

import { formatDate } from '../sim/calendar.js';
import { advanceDay, fromSave, newGame, toSave } from '../sim/game.js';
import { shouldAutosave } from './autosave.js';
import { daysForFrame, FASTEST_BUDGET_MS, MAX_DAYS_PER_FRAME } from './clock.js';
import { setUpInstall } from './install.js';
import { askToKeepStorage, AUTOSAVE_KEY, readText, SAVE_KEY, writeText } from './storage.js';

/**
 * @template {Element} T
 * @param {string} selector
 * @param {new () => T} type
 * @returns {T}
 */
function $(selector, type) {
  const el = document.querySelector(selector);
  if (!(el instanceof type)) throw new Error(`missing element: ${selector}`);
  return el;
}

const dateEl = $('#date', HTMLElement);
const statusEl = $('#status', HTMLElement);
const canvas = $('#map', HTMLCanvasElement);
const speedButtons = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll('[data-speed]')]);
const saveButton = $('[data-act="save"]', HTMLButtonElement);
const loadButton = $('[data-act="load"]', HTMLButtonElement);
const newButton = $('[data-act="new"]', HTMLButtonElement);
const installButton = $('[data-act="install"]', HTMLButtonElement);

let state = startingState();
let speed = 0;
let lastRunningSpeed = 1;
let carry = 0;
/** @type {number | null} */
let frameRequest = null;
let lastFrameMs = 0;
let lastAutosaveDay = state.day;
let lastAutosaveMs = -Infinity;
let shownDay = NaN;

/** Continues the autosave if there is one, otherwise starts a new game. */
function startingState() {
  const read = readText(AUTOSAVE_KEY);
  if (!read.ok) {
    tell(read.error, true);
  } else if (read.text !== null) {
    const loaded = fromSave(read.text);
    if (loaded.ok) {
      queueMicrotask(() => tell(`Continued from your autosave: ${formatDate(loaded.state.day)}.`));
      return loaded.state;
    }
    queueMicrotask(() => tell(`Your autosave couldn't be loaded. ${loaded.error} A new game has started.`, true));
    return newGame(randomSeed());
  }
  if (read.ok) queueMicrotask(() => tell('A new game. Time is paused: tap a speed, 1 to 5, to start.'));
  return newGame(randomSeed());
}

/** A fresh seed for a new world. The sim itself never uses Math.random or the clock. */
function randomSeed() {
  if (globalThis.crypto && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
  return Date.now() >>> 0;
}

/**
 * Shows a message in the status line under the buttons.
 * @param {string} message
 * @param {boolean} [bad]
 */
function tell(message, bad = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('bad', bad);
}

// --- time ---------------------------------------------------------------------------------

/** @param {number} next 0 is pause, 1 to 5 are the speeds */
function setSpeed(next) {
  speed = next;
  if (next > 0) lastRunningSpeed = next;
  for (const b of speedButtons) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed));
  if (speed > 0 && frameRequest === null) {
    lastFrameMs = performance.now();
    carry = 0;
    frameRequest = requestAnimationFrame(frame);
  }
}

/** @param {number} nowMs */
function frame(nowMs) {
  frameRequest = null;
  if (speed === 0) return;
  const frameSeconds = (nowMs - lastFrameMs) / 1000;
  lastFrameMs = nowMs;
  if (speed === 5) {
    // Fastest: as many days as fit in the frame's time budget.
    const start = performance.now();
    for (let i = 0; i < MAX_DAYS_PER_FRAME && performance.now() - start < FASTEST_BUDGET_MS; i++) runDay();
  } else {
    const step = daysForFrame(carry, frameSeconds, speed);
    carry = step.carry;
    for (let i = 0; i < step.days; i++) runDay();
  }
  showDate();
  frameRequest = requestAnimationFrame(frame);
}

function runDay() {
  advanceDay(state);
  const nowMs = performance.now();
  if (shouldAutosave(state.day, lastAutosaveDay, nowMs, lastAutosaveMs)) autosave(nowMs);
}

function showDate() {
  if (state.day === shownDay) return;
  shownDay = state.day;
  dateEl.textContent = formatDate(state.day);
}

// --- saves --------------------------------------------------------------------------------

/** @param {number} nowMs */
function autosave(nowMs) {
  lastAutosaveDay = state.day;
  lastAutosaveMs = nowMs;
  const written = writeText(AUTOSAVE_KEY, toSave(state));
  if (written.ok) tell(`Autosaved: ${formatDate(state.day)}.`);
  else tell(`Couldn't autosave: ${written.error}.`, true);
}

function save() {
  const written = writeText(SAVE_KEY, toSave(state));
  if (written.ok) tell(`Saved: ${formatDate(state.day)}.`);
  else tell(`Couldn't save: ${written.error}.`, true);
}

function load() {
  const read = readText(SAVE_KEY);
  if (!read.ok) return tell(read.error, true);
  if (read.text === null) return tell('No save yet. Tap Save first.');
  const loaded = fromSave(read.text);
  if (!loaded.ok) return tell(loaded.error, true);
  replaceState(loaded.state);
  tell(`Loaded: ${formatDate(state.day)}. Paused.`);
}

let newArmedUntil = 0;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let newDisarm;
/** New game needs two taps, so one slip doesn't throw a game away. */
function startNewGame() {
  const now = performance.now();
  if (now > newArmedUntil) {
    newArmedUntil = now + 3000;
    newButton.textContent = 'Tap again';
    newButton.classList.add('armed');
    clearTimeout(newDisarm);
    newDisarm = setTimeout(disarmNew, 3000);
    return;
  }
  disarmNew();
  replaceState(newGame(randomSeed()));
  autosave(performance.now());
  tell(`New game: ${formatDate(state.day)}. Paused.`);
}

function disarmNew() {
  newArmedUntil = 0;
  newButton.textContent = 'New game';
  newButton.classList.remove('armed');
}

/** @param {import('../sim/game.js').GameState} next */
function replaceState(next) {
  state = next;
  lastAutosaveDay = state.day;
  setSpeed(0);
  showDate();
}

// --- the map (empty until step 2) ---------------------------------------------------------

function drawMap() {
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const color = (/** @type {string} */ name) => css.getPropertyValue(name).trim();

  ctx.fillStyle = color('--sea');
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = color('--wave');
  ctx.lineWidth = 1;
  ctx.beginPath();
  const cell = 48;
  for (let x = (w % cell) / 2; x < w; x += cell) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
  for (let y = (h % cell) / 2; y < h; y += cell) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
  ctx.stroke();

  ctx.fillStyle = color('--coast');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${w < 360 ? 26 : 30}px ${color('--display')}`;
  ctx.fillText('The map arrives in step 2', w / 2, h / 2 - 12);
  ctx.font = '14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Time, speeds and saves already work.', w / 2, h / 2 + 22);
}

// --- wiring -------------------------------------------------------------------------------

for (const b of speedButtons) b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)));
saveButton.addEventListener('click', save);
loadButton.addEventListener('click', load);
newButton.addEventListener('click', startNewGame);

// Desktop: space pauses and resumes, 1 to 5 pick a speed.
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return;
  if (e.key === ' ') {
    e.preventDefault();
    setSpeed(speed === 0 ? lastRunningSpeed : 0);
  } else if (/^[1-5]$/.test(e.key)) {
    setSpeed(Number(e.key));
  }
});

// Leaving the app (switching away, locking the phone, closing the tab) always autosaves.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.day !== lastAutosaveDay) autosave(performance.now());
});
window.addEventListener('pagehide', () => {
  if (state.day !== lastAutosaveDay) autosave(performance.now());
});

new ResizeObserver(drawMap).observe(canvas);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawMap);
document.fonts?.load('600 30px "Grenze Gotisch"').then(drawMap, () => {});

setUpInstall({ button: installButton, tell });
askToKeepStorage();
setSpeed(0);
showDate();

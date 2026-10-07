// @ts-check
// The game screen: the date, pause plus five speeds, the map of the Baltic lands, and saves.
// It reads the game state and calls the sim's functions; all rules live in src/sim.

import credits from '../data/credits.json';
import { formatDate } from '../sim/calendar.js';
import { advanceDay, fromSave, newGame, toSave } from '../sim/game.js';
import { shouldAutosave } from './autosave.js';
import { daysForFrame, FASTEST_BUDGET_MS, MAX_DAYS_PER_FRAME } from './clock.js';
import { setUpInstall } from './install.js';
import { showCredits } from './credits.js';
import { loadMap, loadWater } from './map/load.js';
import { formatResults, runSpeedTest } from './map/speedtest.js';
import { createMapView } from './map/view.js';
import { askToKeepStorage, AUTOSAVE_KEY, readText, SAVE_KEY, UNREADABLE_KEY, writeText } from './storage.js';

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
const creditLine = $('#mapCreditText', HTMLElement);
const creditsSheet = $('#creditsSheet', HTMLElement);
const creditsBody = $('#creditsBody', HTMLElement);
const speedButton = $('[data-act="speedtest"]', HTMLButtonElement);
const speedSheet = $('#speedSheet', HTMLElement);
const speedResults = $('#speedResults', HTMLElement);

let state = startingState();
let speed = 0;
let lastRunningSpeed = 1;
let carry = 0;
/** @type {number | null} */
let frameRequest = null;
let lastFrameMs = 0;
let lastAutosaveDay = state.day;
let lastAutosaveMs = -Infinity;
/** The game has changed since the last autosave. */
let unsaved = false;
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
    // Keep the unreadable save aside (a newer version of the game may read it), so the new
    // game's autosaves never overwrite it.
    const kept = writeText(UNREADABLE_KEY, read.text).ok ? ' It has been kept aside.' : '';
    queueMicrotask(() => tell(`Your autosave couldn't be loaded. ${loaded.error}${kept} A new game has started.`, true));
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
 * Shows a message in the status line above the buttons.
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
  // Pausing is a natural moment to keep the game safe.
  if (next === 0 && unsaved) autosave(performance.now());
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
  unsaved = true;
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
  unsaved = false;
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
  replaceState(loaded.state); // this autosaves, so leaving now still keeps the loaded game
  tell(`Loaded: ${formatDate(state.day)}. Paused.`);
}

/** The second tap must come at least this long after the first, so a double tap isn't two. */
const NEW_GAME_MIN_GAP_MS = 400;
let newArmedAt = 0;
let newArmedUntil = 0;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let newDisarm;
/** New game needs two separate taps, so one slip doesn't throw a game away. */
function startNewGame() {
  const now = performance.now();
  if (now - newArmedAt < NEW_GAME_MIN_GAP_MS) return; // the second half of a double tap
  if (now > newArmedUntil) {
    newArmedAt = now;
    newArmedUntil = now + 3000;
    newButton.textContent = 'Tap again';
    newButton.classList.add('armed');
    clearTimeout(newDisarm);
    newDisarm = setTimeout(disarmNew, 3000);
    return;
  }
  disarmNew();
  replaceState(newGame(randomSeed())); // this autosaves the new game
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
  unsaved = true;
  setSpeed(0);
  showDate();
}

// --- the map ------------------------------------------------------------------------------

/** @type {import('./map/view.js').MapView | null} */
let mapView = null;
/** @type {import('./map/speedtest.js').StartupTimes} */
const startup = {
  mapOnScreenMs: NaN, scriptStartMs: performance.now(), base64Ms: NaN, inflateMs: NaN, decodeMs: NaN, paintMs: NaN, pathMs: NaN,
  waterMs: NaN, waterOnScreenMs: NaN,
};
const darkMode = window.matchMedia('(prefers-color-scheme: dark)');

/**
 * A data block the build put into the page as JSON (tools/build.mjs).
 * @param {string} kind
 */
function readBlock(kind) {
  const el = document.getElementById(`gs-${kind}`);
  if (!el?.textContent) throw new Error(`the game file is missing its ${kind} data`);
  return JSON.parse(el.textContent);
}

/** Shown for the moment before the map is unpacked. */
function drawLoading() {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#2f5266';
  ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ctx.fillStyle = 'rgba(238, 242, 245, .8)';
  ctx.textAlign = 'center';
  ctx.font = '15px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Unpacking the map…', canvas.clientWidth / 2, canvas.clientHeight / 2);
}

/**
 * The land first, then the rivers and lakes just after the first picture is on screen: the
 * player sees the map sooner, and the water and its names follow a moment later.
 */
async function showMap() {
  const { map: data, times } = await loadMap(readBlock('base'), readBlock('terrain'));
  Object.assign(startup, times);
  mapView = createMapView(canvas, data);
  mapView.setDark(darkMode.matches);
  keepNamesClear();
  startup.paintMs = mapView.timings.paintMs;
  mapView.resize();
  mapView.prepare();
  startup.pathMs = mapView.timings.pathMs;
  mapView.render(true);
  // performance.now() counts from the moment the page started opening.
  startup.mapOnScreenMs = performance.now();
  document.documentElement.dataset.mapOnScreenMs = startup.mapOnScreenMs.toFixed(1);
  await new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));
  const t0 = performance.now();
  const waterTimes = { base64Ms: 0, inflateMs: 0, decodeMs: 0 };
  mapView.setWater(await loadWater(readBlock('water'), waterTimes));
  mapView.render(true);
  startup.waterMs = performance.now() - t0;
  startup.waterOnScreenMs = performance.now();
  document.documentElement.dataset.waterOnScreenMs = startup.waterOnScreenMs.toFixed(1);
  // For test/startup.mjs: where the start-up time goes.
  document.documentElement.dataset.startup = JSON.stringify(startup, (_, v) => (typeof v === 'number' ? Math.round(v) : v));
}

async function speedTest() {
  if (!mapView) return;
  speedButton.disabled = true;
  speedSheet.hidden = true;
  creditsSheet.hidden = true;
  tell('Speed test running: keep your fingers off the screen for about 12 seconds.');
  try {
    const result = await runSpeedTest(mapView);
    speedResults.textContent = formatResults(result, startup, mapView.size());
    speedSheet.hidden = false;
    tell('Speed test done. Tap Copy and paste the results to Claude.');
  } finally {
    speedButton.disabled = false;
  }
}

async function copyResults() {
  const text = speedResults.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    tell('Copied. Paste it into the chat.');
  } catch {
    // No clipboard access: select the text so a long press can copy it.
    const range = document.createRange();
    range.selectNodeContents(speedResults);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    tell('Couldn\'t copy by itself: the text is selected, so long-press it and choose Copy.');
  }
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
  if (document.visibilityState === 'hidden' && unsaved) autosave(performance.now());
});
window.addEventListener('pagehide', () => {
  if (unsaved) autosave(performance.now());
});

speedButton.addEventListener('click', speedTest);
creditLine.textContent = credits.mapLine;
for (const el of document.querySelectorAll('[data-act="credits"]')) {
  el.addEventListener('click', () => {
    speedSheet.hidden = true;
    showCredits(creditsBody, credits);
    creditsSheet.hidden = false;
    creditsBody.scrollTop = 0;
  });
}
$('[data-act="close-credits"]', HTMLButtonElement).addEventListener('click', () => { creditsSheet.hidden = true; });
darkMode.addEventListener('change', () => mapView?.setDark(darkMode.matches));
$('[data-act="rerun-speed"]', HTMLButtonElement).addEventListener('click', speedTest);
$('[data-act="close-speed"]', HTMLButtonElement).addEventListener('click', () => { speedSheet.hidden = true; });
$('[data-act="copy-speed"]', HTMLButtonElement).addEventListener('click', copyResults);
/** Tells the map where buttons sit over it, so no river or lake name hides under them. */
function keepNamesClear() {
  const map = canvas.getBoundingClientRect();
  const rects = [...document.querySelectorAll('.map-tools, #mapCreditText')].map((el) => {
    const r = el.getBoundingClientRect();
    return [r.left - map.left, r.top - map.top, r.right - map.left, r.bottom - map.top];
  });
  mapView?.setKeepOut(rects);
}

new ResizeObserver(() => {
  keepNamesClear();
  if (mapView) mapView.resize();
  else drawLoading();
}).observe(canvas);
drawLoading();
showMap().catch((err) => tell(`The map could not be shown: ${err instanceof Error ? err.message : err}`, true));

setUpInstall({ button: installButton, tell });
askToKeepStorage();
setSpeed(0);
showDate();

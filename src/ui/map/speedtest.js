// @ts-check
// The speed test (step 2a, from M1): drives the map through a fixed pan-and-zoom route and measures
// how the phone copes. The numbers are shown as plain text with a Copy button, so Ignas can paste
// them back. Targets from the plan: 95% of frames under 16.7 ms while panning, a full redraw under
// 50 ms, the first map on screen in under 3 seconds, and river and lake names under 5 ms a redraw.
// M3a adds the time run: the map from 1219 to 2021 at speed 5's pace while the camera stays put,
// with the same 95% target for its frames.

import { dayFromDate } from '../../sim/calendar.js';
import { mapYear } from '../../sim/map-date.js';
import { MAX_DAYS_PER_FRAME } from '../clock.js';

/** The time run's first and last years. */
export const TIME_RUN = Object.freeze({ from: 1219, to: 2021 });

/** @param {number[]} values @param {number} q 0..1 */
export function quantile(values, q) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/**
 * @typedef {object} StartupTimes
 * @property {number} mapOnScreenMs since the page started opening
 * @property {number} scriptStartMs when the game's code began running
 * @property {number} base64Ms @property {number} inflateMs @property {number} decodeMs
 * @property {number} paintMs @property {number} pathMs
 * @property {number} waterMs unpacking the rivers and lakes and drawing them, just after the first map
 * @property {number} waterUnpackMs of which unpacking @property {number} waterLabelMs of which placing the names
 * @property {number} waterOnScreenMs since the page started opening
 * @property {number} datedMs unpacking the map over time (and, for a later save, moving it to the save's year)
 * @property {number} datedOnScreenMs since the page started opening: the map shows the game's date
 */

/**
 * @typedef {object} SpeedResult
 * @property {number[]} redrawMs full redraws, back to back
 * @property {number[]} frameMs time between frames while moving
 * @property {number[]} renderMs time spent drawing each moving frame
 * @property {number[]} labelMs placing and drawing the names, per full redraw, at three zooms
 * @property {number[]} timeFrameMs the time run: time between frames while the years pass
 * @property {number[]} timeDateMs the time run: the map's date work in each of its frames
 * @property {number} timeRunMs how long the time run took (NaN when the map over time was not in)
 */

/**
 * Runs the route. Resolves when done.
 * @param {import('./view.js').MapView} view
 * @returns {Promise<SpeedResult>}
 */
export async function runSpeedTest(view) {
  const cam = view.camera;
  const home = { cx: cam.cx, cy: cam.cy, scale: cam.scale };
  const overview = view.minScale();

  // 1. Full redraws at the overview (the heaviest view), one per frame. Time between frames is
  //    the honest cost: the browser finishes the drawing before the next frame.
  cam.scale = overview;
  view.clampCamera();
  /** @type {number[]} */
  const redrawMs = [];
  await new Promise((done) => {
    let last = 0;
    let n = 0;
    const step = (/** @type {number} */ now) => {
      if (last) redrawMs.push(now - last);
      last = now;
      view.render(true);
      if (++n <= 15) requestAnimationFrame(step);
      else done(undefined);
    };
    requestAnimationFrame(step);
  });

  // 2. Names: full redraws at three zooms over Lithuania, timing only the names.
  /** @type {number[]} */
  const labelMs = [];
  for (const scale of [overview, 0.12, 0.5]) {
    cam.cx = 9300; cam.cy = 5600; cam.scale = scale;
    view.clampCamera();
    for (let i = 0; i < 6; i++) {
      view.render(true);
      if (Number.isFinite(view.labelMs())) labelMs.push(view.labelMs());
      await new Promise((done) => requestAnimationFrame(() => done(undefined)));
    }
  }

  // 3. A route of camera moves, one per frame, like a finger panning and pinching.
  const legs = [
    { ms: 2000, from: { cx: 8000, cy: 6000, scale: overview * 1.4 }, to: { cx: 11000, cy: 8500, scale: overview * 1.4 } },
    { ms: 1500, from: { cx: 11000, cy: 8500, scale: overview * 1.4 }, to: { cx: 9300, cy: 5250, scale: 0.12 } },
    { ms: 2500, from: { cx: 9300, cy: 5250, scale: 0.12 }, to: { cx: 8500, cy: 7700, scale: 0.12 } },
    { ms: 1500, from: { cx: 8500, cy: 7700, scale: 0.12 }, to: { cx: 8500, cy: 7700, scale: 0.6 } },
    { ms: 2000, from: { cx: 8500, cy: 7700, scale: 0.6 }, to: { cx: 9000, cy: 7300, scale: 0.6 } },
    { ms: 1500, from: { cx: 9000, cy: 7300, scale: 0.6 }, to: { cx: home.cx, cy: home.cy, scale: home.scale } },
  ];
  /** @type {number[]} */
  const frameMs = [];
  /** @type {number[]} */
  const renderMs = [];
  for (const leg of legs) {
    await new Promise((done) => {
      const start = performance.now();
      let last = start;
      const step = (/** @type {number} */ now) => {
        const t = Math.min(1, (now - start) / leg.ms);
        const e = t * t * (3 - 2 * t);
        cam.cx = leg.from.cx + (leg.to.cx - leg.from.cx) * e;
        cam.cy = leg.from.cy + (leg.to.cy - leg.from.cy) * e;
        // Zoom moves in equal ratios, as a pinch does.
        cam.scale = leg.from.scale * (leg.to.scale / leg.from.scale) ** e;
        view.clampCamera();
        renderMs.push(view.render());
        if (now !== start) frameMs.push(now - last);
        last = now;
        if (t < 1) requestAnimationFrame(step);
        else done(undefined);
      };
      requestAnimationFrame(step);
    });
  }
  view.requestRender();
  return { redrawMs, frameMs, renderMs, labelMs, ...(await timeRun(view)) };
}

/**
 * The time run: the map from 1219 to 2021 at speed 5's pace (as many game days a frame as speed
 * 5 runs at most), the camera still on the starting view. The game's own date is not touched: the
 * map is pinned to each year, then follows the game again.
 * @param {import('./view.js').MapView} view
 */
async function timeRun(view) {
  /** @type {number[]} */
  const timeFrameMs = [];
  if (!view.mapYear().dated) return { timeFrameMs, timeDateMs: [], timeRunMs: NaN };
  const before = view.mapYear().pinned;
  view.setMapYear(TIME_RUN.from);
  await new Promise((done) => setTimeout(done, 300));
  view.takeDateMs();
  const t0 = performance.now();
  await new Promise((done) => {
    let day = dayFromDate(TIME_RUN.from, 1, 1);
    let last = 0;
    const step = (/** @type {number} */ now) => {
      if (last) timeFrameMs.push(now - last);
      last = now;
      day += MAX_DAYS_PER_FRAME;
      const year = Math.min(TIME_RUN.to, mapYear(day));
      view.setMapYear(year);
      if (year < TIME_RUN.to || view.mapYear().year < TIME_RUN.to) requestAnimationFrame(step);
      else done(undefined);
    };
    requestAnimationFrame(step);
  });
  const timeRunMs = performance.now() - t0;
  const timeDateMs = view.takeDateMs();
  view.setMapYear(before);
  return { timeFrameMs, timeDateMs, timeRunMs };
}

/**
 * The results as text to read on the phone and paste into the chat.
 * @param {SpeedResult} r
 * @param {StartupTimes} startup
 * @param {{ cssW: number, cssH: number, dpr: number, pixels: number }} size
 */
export function formatResults(r, startup, size) {
  const fmt = (/** @type {number} */ v) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a');
  const onTime = r.frameMs.filter((v) => v <= 16.7 + 1).length / Math.max(1, r.frameMs.length);
  const p95frame = quantile(r.frameMs, 0.95);
  const redraw = quantile(r.redrawMs, 0.5);
  const nav = /** @type {any} */ (navigator);
  const verdict = (/** @type {boolean} */ ok) => (ok ? 'OK' : 'TOO SLOW');
  return [
    'Grind Strat speed test (step 2a, M3a)',
    `Phone: ${navigator.userAgent}`,
    `Screen: ${size.cssW}x${size.cssH} at ${size.dpr}x (${(size.pixels / 1e6).toFixed(2)} MP drawn), cores ${nav.hardwareConcurrency ?? '?'}, memory ${nav.deviceMemory ?? '?'} GB`,
    '',
    `First map on screen: ${fmt(startup.mapOnScreenMs)} ms after opening (target under 3000): ${verdict(startup.mapOnScreenMs < 3000)}`,
    `  page and code ready ${fmt(startup.scriptStartMs)} ms; then text to bytes ${fmt(startup.base64Ms)} ms, unpacking ${fmt(startup.inflateMs)} ms, reading shapes ${fmt(startup.decodeMs)} ms, painting terrain ${fmt(startup.paintMs)} ms, preparing shapes ${fmt(startup.pathMs)} ms`,
    `  rivers and lakes on screen ${fmt(startup.waterOnScreenMs)} ms after opening (unpacking and drawing them took ${fmt(startup.waterMs)} ms)`,
    `Full redraw: median ${fmt(redraw)} ms, worst ${fmt(Math.max(...r.redrawMs))} ms (target under 50): ${verdict(redraw < 50)}`,
    `Panning and zooming: ${r.frameMs.length} frames, ${Math.round(onTime * 100)}% on time`,
    `  frame time median ${fmt(quantile(r.frameMs, 0.5))} ms, 95% under ${fmt(p95frame)} ms (target 16.7): ${verdict(p95frame <= 17.7)}`,
    `  drawing per frame median ${fmt(quantile(r.renderMs, 0.5))} ms, 95% under ${fmt(quantile(r.renderMs, 0.95))} ms`,
    `Names (rivers and lakes): median ${fmt(quantile(r.labelMs, 0.5))} ms, worst ${fmt(r.labelMs.length ? Math.max(...r.labelMs) : NaN)} ms per redraw (target under 5): ${verdict(quantile(r.labelMs, 0.5) < 5)}`,
    ...timeRunLines(r, fmt, verdict),
  ].join('\n');
}

/**
 * The time run's lines of the results.
 * @param {SpeedResult} r @param {(v: number) => string} fmt @param {(ok: boolean) => string} verdict
 */
function timeRunLines(r, fmt, verdict) {
  if (!r.timeFrameMs.length) return [`Time run ${TIME_RUN.from} to ${TIME_RUN.to}: n/a (the map over time was not unpacked yet)`];
  const p95 = quantile(r.timeFrameMs, 0.95);
  const onTime = r.timeFrameMs.filter((v) => v <= 16.7 + 1).length / r.timeFrameMs.length;
  return [
    `Time run ${TIME_RUN.from} to ${TIME_RUN.to} at speed 5: ${r.timeFrameMs.length} frames in ${fmt(r.timeRunMs / 1000)} s, ${Math.round(onTime * 100)}% on time`,
    `  frame time median ${fmt(quantile(r.timeFrameMs, 0.5))} ms, 95% under ${fmt(p95)} ms (target 16.7): ${verdict(p95 <= 17.7)}`,
    `  date work per frame median ${fmt(quantile(r.timeDateMs, 0.5))} ms, 95% under ${fmt(quantile(r.timeDateMs, 0.95))} ms, worst ${fmt(r.timeDateMs.length ? Math.max(...r.timeDateMs) : NaN)} ms`,
  ];
}

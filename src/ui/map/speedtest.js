// @ts-check
// The speed test (step 2a, M1): drives the map through a fixed pan-and-zoom route and measures
// how the phone copes. The numbers are shown as plain text with a Copy button, so Ignas can paste
// them back. Targets from the plan: 95% of frames under 16.7 ms while panning, a full redraw under
// 50 ms, and the first map on screen in under 3 seconds.

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
 */

/**
 * @typedef {object} SpeedResult
 * @property {number[]} redrawMs full redraws, back to back
 * @property {number[]} frameMs time between frames while moving
 * @property {number[]} renderMs time spent drawing each moving frame
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

  // 2. A route of camera moves, one per frame, like a finger panning and pinching.
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
  return { redrawMs, frameMs, renderMs };
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
    'Grind Strat speed test (step 2a, M1, test map)',
    `Phone: ${navigator.userAgent}`,
    `Screen: ${size.cssW}x${size.cssH} at ${size.dpr}x (${(size.pixels / 1e6).toFixed(2)} MP drawn), cores ${nav.hardwareConcurrency ?? '?'}, memory ${nav.deviceMemory ?? '?'} GB`,
    '',
    `First map on screen: ${fmt(startup.mapOnScreenMs)} ms after opening (target under 3000): ${verdict(startup.mapOnScreenMs < 3000)}`,
    `  page and code ready ${fmt(startup.scriptStartMs)} ms; then text to bytes ${fmt(startup.base64Ms)} ms, unpacking ${fmt(startup.inflateMs)} ms, reading shapes ${fmt(startup.decodeMs)} ms, painting terrain ${fmt(startup.paintMs)} ms, preparing shapes ${fmt(startup.pathMs)} ms`,
    `Full redraw: median ${fmt(redraw)} ms, worst ${fmt(Math.max(...r.redrawMs))} ms (target under 50): ${verdict(redraw < 50)}`,
    `Panning and zooming: ${r.frameMs.length} frames, ${Math.round(onTime * 100)}% on time`,
    `  frame time median ${fmt(quantile(r.frameMs, 0.5))} ms, 95% under ${fmt(p95frame)} ms (target 16.7): ${verdict(p95frame <= 17.7)}`,
    `  drawing per frame median ${fmt(quantile(r.renderMs, 0.5))} ms, 95% under ${fmt(quantile(r.renderMs, 0.95))} ms`,
  ].join('\n');
}

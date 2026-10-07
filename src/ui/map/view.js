// @ts-check
// The map on screen: camera, drawing and touch. It draws only when something changed.
// Map units are game units (100 m), y grows northwards; the canvas flips it.
//
// Two tricks keep it smooth on a phone:
// - A finished frame is kept, a bit bigger than the screen. Panning slides it, pinching scales
//   it, and the full map is only redrawn when the view leaves it or the fingers settle.
// - Outlines have three levels of detail, worked out when the map data was made; zoomed out,
//   the simpler ones are drawn.
// River and lake names are drawn into the kept frame too, so they cost nothing while panning.
// A copy of the frame without names is kept as well: when the view settles after a pan, the
// names are placed again for what is on screen (clear of the buttons and the screen's edges)
// without redrawing the whole map.

import { simplify } from './geometry.js';
import { bandShown, BANDS, bandWidth, indexWater, labelFont, placeWaterLabels, riverBand } from './labels.js';
import { paintSea, paintTerrain } from './terrain.js';

/** @typedef {import('./load.js').WaterData} WaterData */

/** Province tint colours (provinces return in step 2b, realms in step 3). */
const TINTS = ['#c0392b', '#2e86c1', '#d4ac0d', '#7d3c98', '#17a589', '#ca6f1e', '#5d6d7e', '#a93226', '#1f618d', '#b7950b', '#6c3483', '#148f77'];
const SEA = '#2f5266';
const OUTSIDE = '#26414f';
const MAX_SCALE = 0.8; // CSS pixels per game unit: 1 km = 8 px at most
/** How much bigger than the screen the kept frame is, each way. */
const MARGIN = 0.35;
/** Redraw sharply once the camera has been still this long. */
const SETTLE_MS = 140;
/**
 * Detail levels: the data's levels 0 to 2 (tools/map/levels.mjs) are drawn below these scales.
 * The tolerance (CSS px) is only for shapes without levels: provinces and borders, from step 2b.
 */
const LEVELS = [{ tolerancePx: 0.8, below: 0.06 }, { tolerancePx: 0.6, below: 0.25 }, { tolerancePx: 0, below: Infinity }];
const WATER = '#4a7f96';
/**
 * Placing names during a redraw stops after this long (ms): a cap for a slow phone, not the
 * usual cost (about 1 ms once warm). The biggest rivers and lakes are named first and a dozen
 * are always placed, so it only drops small ones, and those are added once the view settles.
 */
const LABEL_BUDGET_MS = 8;
/** How far past the map's edge the view may go, as a share of the screen. */
const EDGE_SLACK = 0.1;
/** Name colours: dark blue with a light halo; on a dark phone, light blue with a dark halo. */
const LABEL_INK = { light: { fill: '#173f56', halo: 'rgba(238, 241, 232, 0.88)' }, dark: { fill: '#d3e6f0', halo: 'rgba(14, 26, 34, 0.86)' } };

/**
 * @typedef {object} Camera
 * @property {number} cx @property {number} cy map point at the centre of the screen
 * @property {number} scale CSS pixels per map unit
 */

/**
 * @param {ArrayLike<number>[]} shapes
 * @param {boolean} closed
 * @param {number} tolerance map units; 0 keeps every point
 */
function pathOf(shapes, closed, tolerance = 0) {
  const p = new Path2D();
  for (const raw of shapes) {
    const s = tolerance > 0 && raw.length > 8 ? simplify(raw, tolerance) : raw;
    if (s.length < 4) continue;
    p.moveTo(s[0], s[1]);
    for (let i = 2; i < s.length; i += 2) p.lineTo(s[i], s[i + 1]);
    if (closed) p.closePath();
  }
  return p;
}

/**
 * Adds the shapes' points kept at `level` to a path.
 * @param {Path2D} p @param {ArrayLike<number>[]} shapes @param {Uint8Array} levels one per point
 * @param {number} level @param {boolean} closed
 * @param {(shape: number) => boolean} [wanted]
 */
function addLevel(p, shapes, levels, level, closed, wanted) {
  let at = 0;
  for (let k = 0; k < shapes.length; k++) {
    const s = shapes[k];
    const n = s.length / 2;
    if (!wanted || wanted(k)) {
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (levels[at + i] > level) continue;
        if (count++ === 0) p.moveTo(s[i * 2], s[i * 2 + 1]);
        else p.lineTo(s[i * 2], s[i * 2 + 1]);
      }
      if (closed && count >= 3) p.closePath();
    }
    at += n;
  }
}

/**
 * The coast: the land's outline at `level`, leaving out the edges that run along the map's border
 * (they are where the land was cut to the map, not a shore).
 * @param {ArrayLike<number>[]} rings @param {Uint8Array} levels @param {number} level
 * @param {number} width @param {number} height
 */
function coastPath(rings, levels, level, width, height) {
  const p = new Path2D();
  const border = (/** @type {number} */ ax, /** @type {number} */ ay, /** @type {number} */ bx, /** @type {number} */ by) =>
    (ax === bx && (ax === 0 || ax === width)) || (ay === by && (ay === 0 || ay === height));
  let at = 0;
  for (const s of rings) {
    const n = s.length / 2;
    /** @type {number[]} */
    const kept = [];
    for (let i = 0; i < n; i++) if (levels[at + i] <= level) kept.push(i);
    at += n;
    if (kept.length < 3) continue;
    let pen = false;
    for (let k = 0; k < kept.length; k++) {
      const i = kept[k];
      const j = kept[(k + 1) % kept.length];
      const ax = s[i * 2]; const ay = s[i * 2 + 1];
      if (border(ax, ay, s[j * 2], s[j * 2 + 1])) { pen = false; continue; }
      if (!pen) { p.moveTo(ax, ay); pen = true; }
      p.lineTo(s[j * 2], s[j * 2 + 1]);
    }
  }
  return p;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import('./load.js').MapData} map
 */
export function createMapView(canvas, map) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { alpha: false }));
  const frame = document.createElement('canvas');
  const fctx = /** @type {CanvasRenderingContext2D} */ (frame.getContext('2d', { alpha: false }));
  // The kept frame without names, so the names can be placed again without redrawing the map.
  const bare = document.createElement('canvas');
  const bctx = /** @type {CanvasRenderingContext2D} */ (bare.getContext('2d', { alpha: false }));

  // --- prepared once ------------------------------------------------------------------
  const t0 = performance.now();
  const tiles = paintTerrain(map.terrain, map.heights);
  const seaPicture = paintSea(map.heights);
  const seaFill = /** @type {CanvasPattern} */ (bctx.createPattern(seaPicture, 'repeat'));
  // One pattern pixel is one height cell; the pattern is placed in map units when the sea is filled.
  seaFill.setTransform(new DOMMatrix([map.heights.cell, 0, 0, map.heights.cell, 0, 0]));
  const paintMs = performance.now() - t0;
  /** @type {import('./labels.js').WaterIndex | null} */
  let waterIndex = map.water ? indexWater(map.water) : null;
  /** Text widths, measured once per name and size. @type {Map<string, number>} */
  const widths = new Map();
  let ink = LABEL_INK.light;
  /** Screen areas covered by buttons, CSS px from the canvas's top left: no names there. @type {number[][]} */
  let keepOut = [];
  let labelMs = NaN;
  /** Where each river's names were last placed, game units, so they stay put. @type {Map<number, number[]>} */
  let anchors = new Map();
  /** The camera the names in the kept frame were placed for, and whether all of them fit the budget. */
  /** @type {{ cx: number, cy: number, complete: boolean } | null} */
  let named = null;

  /**
   * The outlines at one level of detail, built the first time that level is needed.
   * @typedef {{ sea: Path2D, coast: Path2D, tints: Path2D[], sourced: Path2D, guessed: Path2D, fog: Path2D }} Level
   * @typedef {{ lakes: Path2D, rivers: Path2D[] }} WaterLevel
   */
  /** @type {(Level | null)[]} */
  const levels = LEVELS.map(() => null);
  /** @type {(WaterLevel | null)[]} */
  const waterLevels = LEVELS.map(() => null);
  /** @param {number} index @param {number} scale */
  function level(index, scale) {
    const ready = levels[index];
    if (ready) return ready;
    const tol = LEVELS[index].tolerancePx / scale;
    const sea = new Path2D();
    // The sea goes on top of the land layers as one shape: the map with the land cut out.
    sea.rect(0, 0, map.width, map.height);
    addLevel(sea, map.land, map.landLevels, index, true);
    const fog = new Path2D();
    fog.rect(-map.width, -map.height, map.width * 3, map.height * 3);
    fog.addPath(pathOf(map.seen.map((i) => map.provinces[i]), true, tol));
    /** @type {Level} */
    const built = {
      sea,
      coast: coastPath(map.land, map.landLevels, index, map.width, map.height),
      // Provinces grouped by tint: a dozen fills per frame, not hundreds. None until step 2b.
      tints: TINTS.map((_, k) => pathOf(map.provinces.filter((_, i) => i % TINTS.length === k), true, tol)),
      sourced: pathOf(map.borders.filter((_, i) => map.borderKinds[i] === 0), false, tol),
      guessed: pathOf(map.borders.filter((_, i) => map.borderKinds[i] !== 0), false, tol),
      fog,
    };
    levels[index] = built;
    return built;
  }

  /** Rivers (one path per size band) and lakes at one level, once the water is unpacked. @param {number} index */
  function waterLevel(index) {
    const w = map.water;
    if (!w) return null;
    const ready = waterLevels[index];
    if (ready) return ready;
    const lakes = new Path2D();
    addLevel(lakes, w.lakes, w.lakeLevels, index, true);
    const band = w.riverInfo.map((r) => riverBand(r.lengthKm));
    const rivers = Array.from({ length: BANDS }, (_, b) => {
      const p = new Path2D();
      addLevel(p, w.rivers, w.riverLevels, index, false, (line) => band[w.riverOf[line]] === b);
      return p;
    });
    const built = { lakes, rivers };
    waterLevels[index] = built;
    return built;
  }

  // --- camera ---------------------------------------------------------------------------
  /** @type {Camera} */
  const cam = { cx: map.width / 2, cy: map.height / 2, scale: 0.02 };
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  // Fog of war returns with the provinces in step 2b; its drawing code stays ready.
  let fogOn = false;
  let placed = false;

  const minScale = () => Math.min(cssW / map.width, cssH / map.height) * 0.95;
  /**
   * Keeps the map on screen: centred on an axis where it is smaller than the screen, otherwise
   * with its edge no further in than a little past the screen's edge.
   * @param {number} c camera centre @param {number} size the map, game units @param {number} view the screen, game units
   */
  function clampAxis(c, size, view) {
    if (size <= view) return size / 2;
    const slack = view * EDGE_SLACK;
    return Math.min(size - view / 2 + slack, Math.max(view / 2 - slack, c));
  }
  function clampCamera() {
    cam.scale = Math.min(MAX_SCALE, Math.max(minScale(), cam.scale));
    cam.cx = clampAxis(cam.cx, map.width, cssW / cam.scale);
    cam.cy = clampAxis(cam.cy, map.height, cssH / cam.scale);
  }

  /** The kept frame: what camera it was drawn for, or null when it must be redrawn. */
  /** @type {Camera | null} */
  let kept = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); // more than 2x costs a lot and shows little
    cssW = Math.max(1, canvas.clientWidth);
    cssH = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    bare.width = frame.width = Math.round(cssW * (1 + 2 * MARGIN) * dpr);
    bare.height = frame.height = Math.round(cssH * (1 + 2 * MARGIN) * dpr);
    if (!placed) {
      // First time: centred on Lithuania, showing the Baltic core.
      placed = true;
      cam.cx = 9000; cam.cy = 6500; cam.scale = Math.min(cssW, cssH) / 5200;
    }
    clampCamera();
    kept = null;
    requestRender();
  }

  // --- drawing -----------------------------------------------------------------------------
  let pending = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let settle;
  function requestRender() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      render();
    });
  }

  /** Draws the whole map into the kept frame, for the current camera. */
  function drawFrame() {
    const s = cam.scale;
    const fw = cssW * (1 + 2 * MARGIN);
    const fh = cssH * (1 + 2 * MARGIN);
    const ox = fw / 2 - cam.cx * s;
    const oy = fh / 2 + cam.cy * s;
    const c = bctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = OUTSIDE;
    c.fillRect(0, 0, fw, fh);
    c.setTransform(s * dpr, 0, 0, -s * dpr, ox * dpr, oy * dpr); // map units from here: x right, y up
    const px = 1 / s; // one CSS pixel in map units
    const index = LEVELS.findIndex((l) => s < l.below);
    const L = level(index, s);
    const W = waterLevel(index);

    c.fillStyle = SEA;
    c.fillRect(0, 0, map.width, map.height);
    c.imageSmoothingEnabled = s * map.terrain.cell > 1.5;
    const halfW = fw / 2 / s;
    const halfH = fh / 2 / s;
    for (const t of tiles) {
      const x = t.col * map.terrain.cell;
      const y = t.row * map.terrain.cell;
      const w = t.w * map.terrain.cell;
      const h = t.h * map.terrain.cell;
      if (x > cam.cx + halfW || x + w < cam.cx - halfW || y > cam.cy + halfH || y + h < cam.cy - halfH) continue;
      c.drawImage(t.canvas, x, y, w, h);
    }
    if (map.provinces.length) {
      c.globalAlpha = 0.26;
      for (let k = 0; k < TINTS.length; k++) {
        c.fillStyle = TINTS[k];
        c.fill(L.tints[k]);
      }
      c.globalAlpha = 1;
    }
    if (map.borders.length) {
      c.strokeStyle = 'rgba(30, 24, 18, 0.75)';
      c.lineWidth = 1.3 * px;
      c.stroke(L.sourced);
      // Guessed borders look softer (Ignas, 6 October 2026); dashed once zoomed in.
      c.strokeStyle = 'rgba(30, 24, 18, 0.38)';
      if (s >= 0.06) c.setLineDash([4 * px, 3 * px]);
      c.stroke(L.guessed);
      c.setLineDash([]);
    }

    // The sea, coloured by depth, with the land cut out: the coast stays a sharp line.
    c.imageSmoothingEnabled = true;
    c.fillStyle = seaFill;
    c.fill(L.sea, 'evenodd');
    if (W) {
      c.fillStyle = WATER;
      c.fill(W.lakes, 'evenodd');
      c.strokeStyle = WATER;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      for (let band = 0; band < BANDS; band++) {
        if (!bandShown(band, s)) continue;
        c.lineWidth = bandWidth(band, s) * px;
        c.stroke(W.rivers[band]);
      }
      c.strokeStyle = 'rgba(20, 35, 45, 0.45)';
      c.lineWidth = 0.6 * px;
      c.stroke(W.lakes);
    }
    c.strokeStyle = 'rgba(20, 35, 45, 0.85)';
    c.lineWidth = 1.1 * px;
    c.stroke(L.coast);
    if (fogOn) {
      c.fillStyle = 'rgba(12, 18, 24, 0.42)';
      c.fill(L.fog, 'evenodd');
    }
    // Holdings: fixed-size marks, only when zoomed in enough to tell them apart.
    if (s > 0.06 && map.points.length) drawPoints(c, ox, oy, s, fw, fh);
    kept = { cx: cam.cx, cy: cam.cy, scale: s };
    labelMs = drawNames(LABEL_BUDGET_MS);
  }

  /**
   * Copies the frame without names into the kept frame and puts the river and lake names on it,
   * for the screen at the current camera (which may have slid since the frame was drawn).
   * Returns how long the names took to place and draw, in ms.
   * @param {number} budgetMs
   */
  function drawNames(budgetMs) {
    const k = /** @type {Camera} */ (kept);
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.drawImage(bare, 0, 0);
    const s = k.scale;
    const fw = cssW * (1 + 2 * MARGIN);
    const fh = cssH * (1 + 2 * MARGIN);
    const index = LEVELS.findIndex((l) => s < l.below);
    const ms = drawLabels(fctx, index, fw / 2 - k.cx * s, fh / 2 + k.cy * s, s, fw, fh, budgetMs);
    return ms;
  }

  /**
   * River and lake names, in CSS pixels on the frame. Returns how long it took, in ms.
   * @param {CanvasRenderingContext2D} c @param {number} index @param {number} ox @param {number} oy
   * @param {number} s @param {number} fw @param {number} fh @param {number} budgetMs
   */
  function drawLabels(c, index, ox, oy, s, fw, fh, budgetMs) {
    const k = /** @type {Camera} */ (kept);
    named = { cx: cam.cx, cy: cam.cy, complete: true };
    if (!map.water || !waterIndex) return NaN;
    const start = performance.now();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Measuring a name is slow the first time (the browser finds the font), then it is cached.
    // That one-off time doesn't count against the placing budget, or the first map would get
    // almost no names.
    let measuring = 0;
    const measure = (/** @type {string} */ text, /** @type {number} */ size) => {
      const key = `${size}|${text}`;
      let w = widths.get(key);
      if (w === undefined) {
        const t0 = performance.now();
        c.font = labelFont(size);
        w = c.measureText(text).width;
        widths.set(key, w);
        measuring += performance.now() - t0;
      }
      return w;
    };
    // The frame reaches past the screen by a margin, and the camera may have slid since the
    // frame was drawn: the screen's top left in the frame, where the buttons' areas move with it.
    const dx = (fw - cssW) / 2 + (cam.cx - k.cx) * s;
    const dy = (fh - cssH) / 2 - (cam.cy - k.cy) * s;
    const covered = keepOut.map(([l, t, r, b]) => [l + dx, t + dy, r + dx, b + dy]);
    const screen = [dx, dy, dx + cssW, dy + cssH];
    const result = { complete: true };
    const labels = placeWaterLabels({
      water: map.water, index: waterIndex, level: index, scale: s, ox, oy, width: fw, height: fh, measure, keepOut: covered,
      screen, budgetMs, now: () => performance.now() - measuring, previous: anchors, result,
    });
    named.complete = result.complete;
    anchors = new Map();
    for (const l of labels) {
      if (l.river === undefined || l.mx === undefined || l.my === undefined) continue;
      const list = anchors.get(l.river) ?? [];
      list.push(l.mx, l.my);
      anchors.set(l.river, list);
    }
    showNamesForChecks(labels, screen, result.complete);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = 3;
    c.strokeStyle = ink.halo;
    c.fillStyle = ink.fill;
    let font = '';
    for (const l of labels) {
      if (labelFont(l.size) !== font) c.font = font = labelFont(l.size);
      c.setTransform(dpr * Math.cos(l.angle), dpr * Math.sin(l.angle), -dpr * Math.sin(l.angle), dpr * Math.cos(l.angle), l.x * dpr, l.y * dpr);
      c.strokeText(l.text, 0, 0);
      c.fillText(l.text, 0, 0);
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return performance.now() - start;
  }

  /**
   * Marks the canvas with the names on screen, for the screenshot and start-up checks.
   * @param {import('./labels.js').Label[]} labels @param {number[]} screen @param {boolean} complete
   */
  function showNamesForChecks(labels, screen, complete) {
    const shown = labels.filter((l) => l.x >= screen[0] && l.x <= screen[2] && l.y >= screen[1] && l.y <= screen[3]);
    canvas.dataset.names = String(shown.length);
    canvas.dataset.nameList = [...new Set(shown.map((l) => l.text))].join('|');
    canvas.dataset.namesComplete = String(complete);
  }

  const POINT_COLOURS = ['#f4ecd8', '#d4a72c', '#e8e2d0', '#c9c2ad'];
  /**
   * @param {CanvasRenderingContext2D} c @param {number} ox @param {number} oy @param {number} s
   * @param {number} fw @param {number} fh
   */
  function drawPoints(c, ox, oy, s, fw, fh) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pts = map.points;
    const size = s > 0.25 ? 6 : 4;
    for (let kind = 0; kind < 4; kind++) {
      c.fillStyle = POINT_COLOURS[kind];
      c.beginPath();
      for (let i = 0, k = 0; i < pts.length; i += 2, k++) {
        if (map.pointKinds[k] !== kind) continue;
        const x = ox + pts[i] * s;
        const y = oy - pts[i + 1] * s;
        if (x < -8 || y < -8 || x > fw + 8 || y > fh + 8) continue;
        c.rect(x - size / 2, y - size / 2, size, size);
      }
      c.fill();
    }
  }

  /** Copies the kept frame to the screen, slid and scaled to the current camera. */
  function blit() {
    if (!kept) return;
    const ratio = cam.scale / kept.scale;
    const fw = cssW * (1 + 2 * MARGIN);
    const fh = cssH * (1 + 2 * MARGIN);
    // Where the frame's top-left corner lands on screen.
    const left = cssW / 2 - (cam.cx - kept.cx) * cam.scale - (fw / 2) * ratio;
    const top = cssH / 2 + (cam.cy - kept.cy) * cam.scale - (fh / 2) * ratio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (left > 0 || top > 0 || left + fw * ratio < cssW || top + fh * ratio < cssH) {
      ctx.fillStyle = OUTSIDE;
      ctx.fillRect(0, 0, cssW, cssH);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(frame, left, top, fw * ratio, fh * ratio);
  }

  /** Does the kept frame still cover the screen at the current camera, sharp? */
  function keptCovers() {
    if (!kept || kept.scale !== cam.scale) return false;
    const dx = Math.abs(cam.cx - kept.cx) * cam.scale;
    const dy = Math.abs(cam.cy - kept.cy) * cam.scale;
    return dx <= cssW * MARGIN && dy <= cssH * MARGIN;
  }

  /**
   * Shows the current camera. Slides or scales the kept frame when it can, and redraws the
   * whole map when it must. Returns how long it took, in ms.
   * @param {boolean} [force] redraw the whole map now
   */
  function render(force = false) {
    const start = performance.now();
    const zooming = kept !== null && kept.scale !== cam.scale;
    if (force || !kept || !(keptCovers() || (zooming && Math.abs(Math.log(cam.scale / kept.scale)) < 0.7))) {
      drawFrame();
      if (named && !named.complete) settleSoon();
    } else if (zooming || (named && (named.cx !== cam.cx || named.cy !== cam.cy))) {
      // Mid-pinch or mid-pan: show the scaled or slid frame now, and the sharp frame or the names
      // placed again for the new view once the camera is still.
      settleSoon();
    }
    blit();
    return performance.now() - start;
  }

  /** Waits for the camera to be still for SETTLE_MS, then settles. */
  function settleSoon() {
    clearTimeout(settle);
    settle = setTimeout(settleNow, SETTLE_MS);
  }

  /**
   * The camera is still: redraw sharply after a zoom; after a pan, place the names again for what
   * is on screen (the names in the slid frame were kept clear of the buttons and screen edges for
   * where the frame was drawn); finish the names the time budget left out. No time budget here:
   * nothing is moving.
   */
  function settleNow() {
    clearTimeout(settle);
    if (!kept || kept.scale !== cam.scale) {
      kept = null;
      requestRender();
      return;
    }
    if (named && named.complete && named.cx === cam.cx && named.cy === cam.cy) return;
    drawNames(Infinity);
    blit();
  }

  // --- touch and mouse ---------------------------------------------------------------------
  /** @type {Map<number, { x: number, y: number }>} */
  const pointers = new Map();
  /** @type {{ dist: number, cx: number, cy: number, scale: number, mx: number, my: number } | null} */
  let pinch = null;

  /** Zooms by `factor` keeping the map point under (sx, sy) in place. */
  function zoomAt(/** @type {number} */ sx, /** @type {number} */ sy, /** @type {number} */ factor) {
    const mx = cam.cx + (sx - cssW / 2) / cam.scale;
    const my = cam.cy - (sy - cssH / 2) / cam.scale;
    cam.scale *= factor;
    clampCamera();
    cam.cx = mx - (sx - cssW / 2) / cam.scale;
    cam.cy = my + (sy - cssH / 2) / cam.scale;
    clampCamera();
    requestRender();
  }

  const local = (/** @type {PointerEvent | WheelEvent} */ e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: cam.cx, cy: cam.cy, scale: cam.scale, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = local(e);
    pointers.set(e.pointerId, now);
    if (pointers.size === 1) {
      cam.cx -= (now.x - prev.x) / cam.scale;
      cam.cy += (now.y - prev.y) / cam.scale;
      clampCamera();
      requestRender();
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // Keep the map point first under the fingers' midpoint under the new midpoint.
      const anchorX = pinch.cx + (pinch.mx - cssW / 2) / pinch.scale;
      const anchorY = pinch.cy - (pinch.my - cssH / 2) / pinch.scale;
      cam.scale = pinch.scale * (dist / Math.max(1, pinch.dist));
      clampCamera();
      cam.cx = anchorX - (mx - cssW / 2) / cam.scale;
      cam.cy = anchorY + (my - cssH / 2) / cam.scale;
      clampCamera();
      requestRender();
    }
  });
  const lift = (/** @type {PointerEvent} */ e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    // The last finger is off: settle now rather than after the timer, unless a frame is pending.
    if (pointers.size === 0 && !pending) settleNow();
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  const timings = { paintMs, pathMs: 0 };
  return {
    /**
     * Adds the rivers and lakes once they are unpacked (just after the first picture), and
     * redraws.
     * @param {WaterData} water
     */
    setWater(water) {
      map.water = water;
      waterIndex = indexWater(water);
      waterLevels.fill(null);
      kept = null;
      requestRender();
    },
    /** @param {boolean} dark the phone is in dark mode */
    setDark(dark) {
      ink = dark ? LABEL_INK.dark : LABEL_INK.light;
      kept = null;
      requestRender();
    },
    /**
     * Areas of the screen covered by buttons, where names would hide; used from the next redraw.
     * @param {number[][]} rects [left, top, right, bottom], CSS px from the canvas's top left
     */
    setKeepOut(rects) { keepOut = rects; },
    /** How long the last names took to place and draw, ms (NaN before the water is in). */
    labelMs: () => labelMs,
    resize,
    render,
    requestRender,
    camera: cam,
    clampCamera,
    zoomAt,
    /** @param {boolean} on */
    setFog(on) { fogOn = on; kept = null; requestRender(); },
    minScale,
    size: () => ({ cssW, cssH, dpr, pixels: canvas.width * canvas.height }),
    timings,
    /** Builds the outlines for the starting view now, and times it. */
    prepare() {
      const t = performance.now();
      const index = LEVELS.findIndex((l) => cam.scale < l.below);
      level(index, cam.scale);
      waterLevel(index);
      timings.pathMs = performance.now() - t;
    },
  };
}

/** @typedef {ReturnType<typeof createMapView>} MapView */

// @ts-check
// The map on screen: camera, drawing and touch. It draws only when something changed.
// Map units are game units (100 m), y grows northwards; the canvas flips it.
//
// Two tricks keep it smooth on a phone:
// - A finished frame is kept, a bit bigger than the screen. Panning slides it, pinching scales
//   it, and the full map is only redrawn when the view leaves it or the fingers settle.
// - Outlines have three levels of detail; zoomed out, the simpler ones are drawn.

import { simplify } from './geometry.js';
import { paintTerrain } from './terrain.js';

/** Province tint colours (realms come in step 3; the test map uses these). */
const TINTS = ['#c0392b', '#2e86c1', '#d4ac0d', '#7d3c98', '#17a589', '#ca6f1e', '#5d6d7e', '#a93226', '#1f618d', '#b7950b', '#6c3483', '#148f77'];
const SEA = '#2f5266';
const OUTSIDE = '#26414f';
const MAX_SCALE = 0.8; // CSS pixels per game unit: 1 km = 8 px at most
/** How much bigger than the screen the kept frame is, each way. */
const MARGIN = 0.35;
/** Redraw sharply once the camera has been still this long. */
const SETTLE_MS = 140;
/** Detail levels: [simplify tolerance in CSS pixels, below this scale]. */
const LEVELS = [{ tolerancePx: 0.8, below: 0.06 }, { tolerancePx: 0.6, below: 0.25 }, { tolerancePx: 0, below: Infinity }];

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
 * @param {HTMLCanvasElement} canvas
 * @param {import('./load.js').MapData} map
 */
export function createMapView(canvas, map) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { alpha: false }));
  const frame = document.createElement('canvas');
  const fctx = /** @type {CanvasRenderingContext2D} */ (frame.getContext('2d', { alpha: false }));

  // --- prepared once ------------------------------------------------------------------
  const t0 = performance.now();
  const tiles = paintTerrain(map.terrain, map.heights);
  const paintMs = performance.now() - t0;

  /**
   * The outlines at one level of detail, built the first time that level is needed.
   * @typedef {{ sea: Path2D, coast: Path2D, lakes: Path2D, rivers: Path2D[], tints: Path2D[],
   *   sourced: Path2D, guessed: Path2D, fog: Path2D }} Level
   */
  /** @type {(Level | null)[]} */
  const levels = LEVELS.map(() => null);
  /** @param {number} index @param {number} scale */
  function level(index, scale) {
    const ready = levels[index];
    if (ready) return ready;
    const tol = LEVELS[index].tolerancePx / scale;
    const sea = new Path2D();
    // The sea goes on top of the land layers as one shape: the map with the land cut out.
    sea.rect(0, 0, map.width, map.height);
    sea.addPath(pathOf(map.land, true, tol));
    const fog = new Path2D();
    fog.rect(-map.width, -map.height, map.width * 3, map.height * 3);
    fog.addPath(pathOf(map.seen.map((i) => map.provinces[i]), true, tol));
    /** @type {Level} */
    const built = {
      sea,
      coast: pathOf(map.coast, false, tol),
      lakes: pathOf(map.lakes, true, tol),
      rivers: [0, 1, 2].map((band) => pathOf(map.rivers.filter((_, i) => {
        const w = map.riverInfo[i]?.weight ?? 1;
        return (w >= 2 ? 2 : w >= 1 ? 1 : 0) === band;
      }), false, tol)),
      // Provinces grouped by tint: a dozen fills per frame, not hundreds.
      tints: TINTS.map((_, k) => pathOf(map.provinces.filter((_, i) => i % TINTS.length === k), true, tol)),
      sourced: pathOf(map.borders.filter((_, i) => map.borderKinds[i] === 0), false, tol),
      guessed: pathOf(map.borders.filter((_, i) => map.borderKinds[i] !== 0), false, tol),
      fog,
    };
    levels[index] = built;
    return built;
  }

  // --- camera ---------------------------------------------------------------------------
  /** @type {Camera} */
  const cam = { cx: map.width / 2, cy: map.height / 2, scale: 0.02 };
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  let fogOn = true;
  let placed = false;

  const minScale = () => Math.min(cssW / map.width, cssH / map.height) * 0.95;
  function clampCamera() {
    cam.scale = Math.min(MAX_SCALE, Math.max(minScale(), cam.scale));
    cam.cx = Math.min(map.width, Math.max(0, cam.cx));
    cam.cy = Math.min(map.height, Math.max(0, cam.cy));
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
    frame.width = Math.round(cssW * (1 + 2 * MARGIN) * dpr);
    frame.height = Math.round(cssH * (1 + 2 * MARGIN) * dpr);
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
    const c = fctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = OUTSIDE;
    c.fillRect(0, 0, fw, fh);
    c.setTransform(s * dpr, 0, 0, -s * dpr, ox * dpr, oy * dpr); // map units from here: x right, y up
    const px = 1 / s; // one CSS pixel in map units
    const L = level(LEVELS.findIndex((l) => s < l.below), s);

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
    c.globalAlpha = 0.26;
    for (let k = 0; k < TINTS.length; k++) {
      c.fillStyle = TINTS[k];
      c.fill(L.tints[k]);
    }
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(30, 24, 18, 0.75)';
    c.lineWidth = 1.3 * px;
    c.stroke(L.sourced);
    // Guessed borders look softer (Ignas, 6 October 2026); dashed once zoomed in.
    c.strokeStyle = 'rgba(30, 24, 18, 0.38)';
    if (s >= 0.06) c.setLineDash([4 * px, 3 * px]);
    c.stroke(L.guessed);
    c.setLineDash([]);

    c.fillStyle = SEA;
    c.fill(L.sea, 'evenodd');
    c.fillStyle = '#4a7f96';
    c.fill(L.lakes);
    c.strokeStyle = '#4a7f96';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let band = 0; band < 3; band++) {
      c.lineWidth = (0.8 + band * 0.7) * px;
      c.stroke(L.rivers[band]);
    }
    c.strokeStyle = 'rgba(20, 35, 45, 0.85)';
    c.lineWidth = 1.1 * px;
    c.stroke(L.coast);
    if (fogOn) {
      c.fillStyle = 'rgba(12, 18, 24, 0.42)';
      c.fill(L.fog, 'evenodd');
    }
    // Holdings: fixed-size marks, only when zoomed in enough to tell them apart.
    if (s > 0.06) drawPoints(c, ox, oy, s, fw, fh);
    kept = { cx: cam.cx, cy: cam.cy, scale: s };
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
    } else if (zooming) {
      // Mid-pinch: show the scaled frame now, and the sharp one once the fingers settle.
      clearTimeout(settle);
      settle = setTimeout(() => { kept = null; requestRender(); }, SETTLE_MS);
    }
    blit();
    return performance.now() - start;
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
      level(LEVELS.findIndex((l) => cam.scale < l.below), cam.scale);
      timings.pathMs = performance.now() - t;
    },
  };
}

/** @typedef {ReturnType<typeof createMapView>} MapView */

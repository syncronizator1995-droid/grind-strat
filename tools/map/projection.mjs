// @ts-check
// Lambert azimuthal equal-area projection on the GRS80 ellipsoid: the same formulas as
// ETRS89-LAEA (EPSG:3035), from Snyder (1987), "Map Projections: A Working Manual", USGS
// Professional Paper 1395, pages 187-190. Equal-area, so province sizes compare fairly.
// Used at build time only: the game itself only ever sees projected whole-number coordinates.

const A = 6378137; // GRS80 semi-major axis, metres
const E2 = 0.00669438002290; // GRS80 first eccentricity squared
const E = Math.sqrt(E2);
const RAD = Math.PI / 180;

/** Snyder's q(φ). @param {number} sinPhi */
function q(sinPhi) {
  const es = E * sinPhi;
  return (1 - E2) * (sinPhi / (1 - es * es) - (1 / (2 * E)) * Math.log((1 - es) / (1 + es)));
}
const QP = q(1);
const RQ = A * Math.sqrt(QP / 2);

/**
 * @typedef {object} Laea
 * @property {(lon: number, lat: number) => [number, number]} forward degrees to metres
 * @property {(x: number, y: number) => [number, number]} inverse metres to degrees
 */

/**
 * Makes a projection centred on (lon0, lat0), with false easting and northing in metres.
 * @param {number} lon0 @param {number} lat0 @param {number} [fe] @param {number} [fn]
 * @returns {Laea}
 */
export function laea(lon0, lat0, fe = 0, fn = 0) {
  const sinPhi1 = Math.sin(lat0 * RAD);
  const beta1 = Math.asin(q(sinPhi1) / QP);
  const sinB1 = Math.sin(beta1);
  const cosB1 = Math.cos(beta1);
  const m1 = Math.cos(lat0 * RAD) / Math.sqrt(1 - E2 * sinPhi1 * sinPhi1);
  const D = (A * m1) / (RQ * cosB1);
  return {
    forward(lon, lat) {
      const beta = Math.asin(q(Math.sin(lat * RAD)) / QP);
      const dl = (lon - lon0) * RAD;
      const B = RQ * Math.sqrt(2 / (1 + sinB1 * Math.sin(beta) + cosB1 * Math.cos(beta) * Math.cos(dl)));
      const x = B * D * Math.cos(beta) * Math.sin(dl);
      const y = (B / D) * (cosB1 * Math.sin(beta) - sinB1 * Math.cos(beta) * Math.cos(dl));
      return [fe + x, fn + y];
    },
    inverse(xIn, yIn) {
      const x = xIn - fe;
      const y = yIn - fn;
      const rho = Math.hypot(x / D, D * y);
      if (rho < 1e-9) return [lon0, lat0];
      const C = 2 * Math.asin(rho / (2 * RQ));
      const beta = Math.asin(Math.cos(C) * sinB1 + (D * y * Math.sin(C) * cosB1) / rho);
      const lon = lon0 + Math.atan2(x * Math.sin(C), D * rho * cosB1 * Math.cos(C) - D * D * y * sinB1 * Math.sin(C)) / RAD;
      // Authalic latitude back to geodetic latitude (Snyder eq. 3-18).
      const e4 = E2 * E2;
      const e6 = e4 * E2;
      const lat = beta
        + (E2 / 3 + (31 * e4) / 180 + (517 * e6) / 5040) * Math.sin(2 * beta)
        + ((23 * e4) / 360 + (251 * e6) / 3780) * Math.sin(4 * beta)
        + ((761 * e6) / 45360) * Math.sin(6 * beta);
      return [lon, lat / RAD];
    },
  };
}

/** ETRS89-LAEA Europe, EPSG:3035: for checking our formulas against the official definition. */
export const EPSG3035 = laea(10, 52, 4321000, 3210000);

/**
 * The game map (Ignas, 6 October 2026): 12°E to 34°E and 50°N to 61.5°N, centred on 56°N 23°E so
 * north points up over Lithuania. Game coordinates are whole numbers in 100 m units, counted from
 * the south-west corner of the box that holds the whole area.
 */
export const MAP = (() => {
  const proj = laea(23, 56);
  const box = { west: 12, east: 34, south: 50, north: 61.5 };
  // The projected area's extent: walk the box edges, since its sides curve once projected.
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    for (const [lon, lat] of [
      [box.west + t * (box.east - box.west), box.south], [box.west + t * (box.east - box.west), box.north],
      [box.west, box.south + t * (box.north - box.south)], [box.east, box.south + t * (box.north - box.south)],
    ]) {
      const [x, y] = proj.forward(lon, lat);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  const UNIT = 100; // metres per game unit
  const originX = Math.floor(minX / UNIT) * UNIT;
  const originY = Math.floor(minY / UNIT) * UNIT;
  const width = Math.ceil((maxX - originX) / UNIT);
  const height = Math.ceil((maxY - originY) / UNIT);
  return {
    box,
    centre: { lon: 23, lat: 56 },
    unitMetres: UNIT,
    width,
    height,
    /** degrees to game units (whole numbers; y grows northwards) @param {number} lon @param {number} lat */
    toUnits(lon, lat) {
      const [x, y] = proj.forward(lon, lat);
      return /** @type {[number, number]} */ ([Math.round((x - originX) / UNIT), Math.round((y - originY) / UNIT)]);
    },
    /** game units to degrees @param {number} ux @param {number} uy */
    toDegrees(ux, uy) {
      return proj.inverse(ux * UNIT + originX, uy * UNIT + originY);
    },
    meta() {
      return { projection: 'LAEA on GRS80 (as EPSG:3035)', lon0: 23, lat0: 56, unitMetres: UNIT, originX, originY, width, height, box };
    },
  };
})();

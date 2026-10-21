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

/**
 * @typedef {object} TransverseMercator
 * @property {(lon: number, lat: number) => [number, number]} forward degrees to [easting, northing] in metres
 * @property {(easting: number, northing: number) => [number, number]} inverse [easting, northing] to degrees
 */

/**
 * Transverse Mercator (Gauss conformal) on the GRS80 ellipsoid, by Krüger's series to the 8th
 * order: the formulas and the worked example in Lantmäteriet, "Gauss Conformal Projection
 * (Transverse Mercator), Krüger's Formulas" (2008), which Sweden uses for SWEREF 99. Accurate to
 * well under a millimetre within a few degrees of the central meridian.
 * @param {{ lon0: number, k0: number, fe: number, fn: number, a?: number, f?: number }} p
 *   central meridian (degrees), scale on it, false easting and northing (metres)
 * @returns {TransverseMercator}
 */
export function transverseMercator({ lon0, k0, fe, fn, a = A, f = 1 / 298.257222101 }) {
  const e2 = f * (2 - f);
  const n = f / (2 - f);
  const n2 = n * n; const n3 = n2 * n; const n4 = n3 * n;
  const aHat = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64);
  // Geodetic to conformal latitude, and back (the series in e²).
  const e4 = e2 * e2; const e6 = e4 * e2; const e8 = e6 * e2;
  const cA = e2; const cB = (5 * e4 - e6) / 6; const cC = (104 * e6 - 45 * e8) / 120; const cD = (1237 * e8) / 1260;
  const sA = e2 + e4 + e6 + e8; const sB = -(7 * e4 + 17 * e6 + 30 * e8) / 6; const sC = (224 * e6 + 889 * e8) / 120; const sD = -(4279 * e8) / 1260;
  const beta = [n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180, (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440, (61 * n3) / 240 - (103 * n4) / 140, (49561 * n4) / 161280];
  const delta = [n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360, n2 / 48 + n3 / 15 - (437 * n4) / 1440, (17 * n3) / 480 - (37 * n4) / 840, (4397 * n4) / 161280];
  const scale = k0 * aHat;
  return {
    forward(lon, lat) {
      const phi = lat * RAD;
      const s = Math.sin(phi); const c = Math.cos(phi);
      const s2 = s * s;
      const conformal = phi - s * c * (cA + cB * s2 + cC * s2 * s2 + cD * s2 * s2 * s2);
      const dl = (lon - lon0) * RAD;
      const xi = Math.atan2(Math.tan(conformal), Math.cos(dl));
      const eta = Math.atanh(Math.cos(conformal) * Math.sin(dl));
      let x = xi; let y = eta;
      for (let j = 1; j <= 4; j++) {
        x += beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
        y += beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
      }
      return [fe + scale * y, fn + scale * x];
    },
    inverse(easting, northing) {
      const xi = (northing - fn) / scale;
      const eta = (easting - fe) / scale;
      let xi1 = xi; let eta1 = eta;
      for (let j = 1; j <= 4; j++) {
        xi1 -= delta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
        eta1 -= delta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
      }
      const conformal = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
      const dl = Math.atan2(Math.sinh(eta1), Math.cos(xi1));
      const s = Math.sin(conformal); const c = Math.cos(conformal);
      const s2 = s * s;
      const phi = conformal + s * c * (sA + sB * s2 + sC * s2 * s2 + sD * s2 * s2 * s2);
      return [lon0 + dl / RAD, phi / RAD];
    },
  };
}

/**
 * SWEREF 99 TM (EPSG:3006), Sweden's national grid, in which SGU's shore-displacement model is
 * published: Transverse Mercator on GRS80, central meridian 15°E, scale 0.9996, false easting
 * 500 000 m (the same as UTM zone 33N; EPSG's definition, as spatialreference.org gives it).
 */
export const SWEREF99TM = transverseMercator({ lon0: 15, k0: 0.9996, fe: 500000, fn: 0 });

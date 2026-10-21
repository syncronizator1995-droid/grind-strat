// @ts-check
// A small GeoPackage reader for the map tools: enough to read SGU's shore-displacement model
// (polygon tables in SWEREF 99 TM). A GeoPackage is an SQLite file, opened here with Node's
// built-in SQLite (node:sqlite, so no new dependency), read only. Geometries are GeoPackage
// blobs: a short header ("GP", version, flags, the SRS id and an optional bounding box) followed
// by standard well-known binary (WKB). Polygons and multipolygons are read, with or without Z and
// M values (which are dropped); anything else is refused, never guessed.
//
// Build time only. node:sqlite is still marked experimental in Node 22 and prints a warning when
// it loads; it is loaded only when a GeoPackage is actually opened.

/**
 * A polygon: rings of flat [x0, y0, x1, y1, ...]; the first ring is the outer one, the others holes.
 * @typedef {number[][]} Polygon
 */

/**
 * @typedef {object} Feature
 * @property {Polygon[]} polygons every polygon of the feature's geometry (one for a Polygon)
 * @property {number} srsId
 * @property {Record<string, unknown>} properties the other columns asked for
 */

/**
 * Opens a GeoPackage read only.
 * @param {string} path
 */
export async function openGeoPackage(path) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  const head = /** @type {any} */ (db.prepare('PRAGMA application_id').get());
  // 0x47504B47 is "GPKG"; older GeoPackages (1.0) used "GP10".
  if (head && head.application_id !== 0x47504b47 && head.application_id !== 0x47503130) {
    db.close();
    throw new Error(`${path} is not a GeoPackage (application id ${head.application_id})`);
  }
  return {
    /** The feature tables, with their geometry column and SRS. */
    tables() {
      const rows = /** @type {any[]} */ (db.prepare(
        `SELECT c.table_name AS name, g.column_name AS geometry, g.geometry_type_name AS type, g.srs_id AS srsId
         FROM gpkg_contents c JOIN gpkg_geometry_columns g ON g.table_name = c.table_name
         WHERE c.data_type = 'features' ORDER BY c.table_name`,
      ).all());
      return rows.map((r) => ({ name: String(r.name), geometry: String(r.geometry), type: String(r.type), srsId: Number(r.srsId) }));
    },
    /**
     * Every feature of a table, with the columns asked for.
     * @param {string} table @param {string[]} [columns]
     * @returns {Feature[]}
     */
    features(table, columns = []) {
      const t = this.tables().find((x) => x.name === table);
      if (!t) throw new Error(`no feature table ${table}`);
      const known = new Set((/** @type {any[]} */ (db.prepare(`PRAGMA table_info(${quoteName(table)})`).all())).map((c) => String(c.name)));
      for (const c of columns) if (!known.has(c)) throw new Error(`table ${table} has no column ${c}`);
      const cols = [t.geometry, ...columns].map(quoteName).join(', ');
      const rows = /** @type {any[]} */ (db.prepare(`SELECT ${cols} FROM ${quoteName(table)}`).all());
      return rows.filter((r) => r[t.geometry] != null).map((r) => {
        const g = parseGpkgGeometry(/** @type {Uint8Array} */ (r[t.geometry]));
        /** @type {Record<string, unknown>} */
        const properties = {};
        for (const c of columns) properties[c] = r[c];
        return { polygons: g.polygons, srsId: g.srsId, properties };
      });
    },
    close: () => db.close(),
  };
}

/** An SQL identifier in double quotes. @param {string} name */
const quoteName = (name) => `"${name.replace(/"/g, '""')}"`;

/**
 * Reads a GeoPackage geometry blob (GeoPackage 1.x, section 2.1.3).
 * @param {Uint8Array} blob
 * @returns {{ srsId: number, polygons: Polygon[] }}
 */
export function parseGpkgGeometry(blob) {
  if (blob[0] !== 0x47 || blob[1] !== 0x50) throw new Error('not a GeoPackage geometry (no "GP" magic)');
  const flags = blob[3];
  if (flags & 0x20) throw new Error('extended GeoPackage geometries are not supported');
  const le = (flags & 1) === 1;
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const srsId = dv.getInt32(4, le);
  const envelope = (flags >> 1) & 7;
  const envelopeBytes = [0, 32, 48, 48, 64][envelope];
  if (envelopeBytes === undefined) throw new Error(`bad GeoPackage envelope code ${envelope}`);
  if (flags & 0x10) return { srsId, polygons: [] }; // an empty geometry
  return { srsId, polygons: parseWkb(blob.subarray(8 + envelopeBytes)) };
}

/**
 * Reads WKB: a Polygon or MultiPolygon, 2D, Z, M or ZM (ISO codes 1000/2000/3000 above the base
 * type, or the older flag bits 0x80000000 for Z and 0x40000000 for M).
 * @param {Uint8Array} bytes
 * @returns {Polygon[]}
 */
export function parseWkb(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  /** @returns {{ le: boolean, base: number, dims: number }} */
  const header = () => {
    const le = dv.getUint8(at) === 1;
    const raw = dv.getUint32(at + 1, le);
    at += 5;
    let code = raw & 0x0fffffff;
    let dims = 2;
    if (raw & 0x80000000) dims++;
    if (raw & 0x40000000) dims++;
    const iso = Math.floor(code / 1000);
    if (iso === 1 || iso === 2) dims++;
    else if (iso === 3) dims += 2;
    else if (iso !== 0) throw new Error(`unknown WKB geometry type ${raw}`);
    code %= 1000;
    return { le, base: code, dims };
  };
  /** @param {boolean} le @param {number} dims @returns {Polygon} */
  const polygon = (le, dims) => {
    const nRings = dv.getUint32(at, le); at += 4;
    /** @type {Polygon} */
    const rings = [];
    for (let k = 0; k < nRings; k++) {
      const n = dv.getUint32(at, le); at += 4;
      const ring = new Array(n * 2);
      for (let p = 0; p < n; p++) {
        ring[p * 2] = dv.getFloat64(at, le);
        ring[p * 2 + 1] = dv.getFloat64(at + 8, le);
        at += 8 * dims;
      }
      rings.push(ring);
    }
    return rings;
  };
  const top = header();
  if (top.base === 3) return [polygon(top.le, top.dims)];
  if (top.base === 6) {
    const n = dv.getUint32(at, top.le); at += 4;
    /** @type {Polygon[]} */
    const out = [];
    for (let k = 0; k < n; k++) {
      const h = header();
      if (h.base !== 3) throw new Error(`a MultiPolygon holds a geometry of type ${h.base}`);
      out.push(polygon(h.le, h.dims));
    }
    return out;
  }
  throw new Error(`WKB geometry type ${top.base} is not a polygon or multipolygon`);
}

/**
 * Writes a polygon or multipolygon as a GeoPackage geometry blob (little-endian, no envelope).
 * For tests, which build small GeoPackages to read back.
 * @param {Polygon[]} polygons @param {number} srsId
 * @returns {Uint8Array}
 */
export function gpkgGeometryBlob(polygons, srsId) {
  const wkbPolygon = (/** @type {Polygon} */ rings) => 4 + rings.reduce((n, r) => n + 4 + r.length * 8, 0);
  const multi = polygons.length !== 1;
  const size = 8 + (multi ? 9 + polygons.reduce((n, p) => n + 5 + wkbPolygon(p), 0) : 5 + wkbPolygon(polygons[0]));
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out.set([0x47, 0x50, 0, 1]);
  dv.setInt32(4, srsId, true);
  let at = 8;
  const put = (/** @type {Polygon} */ rings) => {
    dv.setUint8(at, 1); dv.setUint32(at + 1, 3, true); dv.setUint32(at + 5, rings.length, true); at += 9;
    for (const r of rings) {
      dv.setUint32(at, r.length / 2, true); at += 4;
      for (const v of r) { dv.setFloat64(at, v, true); at += 8; }
    }
  };
  if (multi) {
    dv.setUint8(at, 1); dv.setUint32(at + 1, 6, true); dv.setUint32(at + 5, polygons.length, true); at += 9;
    for (const p of polygons) put(p);
  } else {
    put(polygons[0]);
  }
  return out;
}

// @ts-check
// Builds data/raw/derived/coast-ad1-500m.u8: the AD 1 coast, one byte per 500 m cell over the same
// box as the 1219 coast field (codes in src/sim/coast-date.js, "lead-in": steps of 8 years from
// AD 1), with a .json sidecar of its settings, control-point checks and report. The rules live in
// tools/map/coast-ad1.mjs. It reads the 1219 field's inputs (makeCoastField) and adds the AD 1
// control points of tools/map/coast-anchors-ad1.json.
//   node tools/map/build-coast-ad1.mjs     (npm run map:coast-ad1; needs npm run map:coast first)
//
// SGU's shore model (resource.sgu.se) is blocked, so Sweden's AD 1 shore is the estimate, as in 1219.
// LICENCE: CC BY 4.0, like the 1219 field. Never OpenStreetMap data.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COAST_CODE, LEAD, leadLevel } from '../../src/sim/coast-date.js';
import { ANCHORS_FILE, makeCoastField, OUT_NAME as MAIN_OUT } from './build-coast.mjs';
import { chamferDistance, COAST_PARAMS, coastParamsSha256, floodCodes, seaAbove, seaFall, spreadIntoSea } from './coast.mjs';
import { agreeAtHandOver, COAST_AD1_SOURCES, coastAd1ParamsSha256, fitGroupsAd1, extendToSea, holdCut, kFieldAd1, leadOwnCodes, lineCells } from './coast-ad1.mjs';
import { ensureProxy } from './fetch-grids.mjs';
import { inputRecord } from './grid-sources.mjs';
import { MAP } from './projection.mjs';
import { DERIVED, writeGrid } from './resample.mjs';

export const OUT_NAME = 'coast-ad1-500m.u8';
export const ANCHORS_AD1_FILE = 'tools/map/coast-anchors-ad1.json';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Places to report on: [name, lon, lat]. */
const PLACES = /** @type {const} */ ([
  ['Stockholm', 18.07, 59.33], ['North Uppland (Forsmark)', 18.2, 60.37], ['Tallinn', 24.75, 59.44], ['Mariehamn (Åland)', 19.94, 60.1],
  ['Turku', 22.27, 60.45], ['Helsinki', 24.94, 60.17], ['Pärnu', 24.5, 58.385], ['Haapsalu', 23.54, 58.94],
]);

const round = (/** @type {number} */ v, /** @type {number} */ d) => Math.round(v * 10 ** d) / 10 ** d;

async function main() {
  ensureProxy();
  const made = await makeCoastField();
  const { box, land, heights, fall, codes: main, uplift, groups, at } = made;
  const { cols, rows, cell } = box;
  const n = cols * rows;
  const anchorsText = await readFile(join(ROOT, ANCHORS_AD1_FILE), 'utf8');
  const ad = JSON.parse(anchorsText);
  const adGroups = fitGroupsAd1(ad.points, at);
  const k1At = kFieldAd1(groups, adGroups);

  // AD 1 fall rate per cell, with the AD 1 k (nothing changes south of 56N, as in 1219).
  const fall1 = new Float32Array(n);
  const ox = box.col0 * cell; const oy = box.row0 * cell;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cell + ox; const y = (r + 0.5) * cell + oy;
      const [lon, lat] = MAP.toDegrees(x, y);
      fall1[r * cols + c] = lat < COAST_PARAMS.southLimitLat ? 0 : seaFall(uplift.at(lon, lat), k1At(x, y));
    }
  }
  const own = leadOwnCodes({ land, heights, fall, fall1, main });
  // Kopli's neck: a hand-drawn cut (tools/map/coast-anchors-ad1.json), sea until about AD 150.
  const cut = ad.tallinn.kopliCut;
  const toBox = (/** @type {number[]} */ p) => { const [x, y] = MAP.toUnits(p[0], p[1]); return [x - ox, y - oy]; };
  const [cutA, cutB] = extendToSea(toBox(cut.from), toBox(cut.to), land, cols, rows, cell);
  const cutCells = lineCells(cutA, cutB, cols, rows, cell);
  const cutHeld = holdCut(own, land, cutCells, cut.seaUntil);
  console.log(`Kopli cut: ${cutCells.length} cells on the line, ${cutHeld} of today's land held under the sea until AD ${cut.seaUntil}`);
  const lead = floodCodes(own, cols, rows);
  spreadIntoSea(lead, land, cols, rows, COAST_PARAMS.spreadCells);
  const fixed = agreeAtHandOver(lead, main);
  console.log(`lead-in field made; ${fixed} cells put in step with the 1219 field`);

  // Checks: the AD 1 control points against the model, and the report.
  const checks = ad.points.map((/** @type {any} */ p) => {
    const { up, x, y } = at(p);
    const model = seaAbove(up, k1At(x, y), p.year);
    return { id: p.id, use: p.use, year: p.year, observedM: p.rslM, toleranceM: p.toleranceM, modelM: round(model, 2), upliftMmYr: round(up, 2), k: round(k1At(x, y), 3), ok: Math.abs(model - p.rslM) <= p.toleranceM };
  });
  const seaDist = chamferDistance(land.map((v) => (v ? 0 : 1)), cols, rows);
  const km = cell / 10;
  const report = PLACES.map(([name, lon, lat]) => {
    const [x, y] = MAP.toUnits(lon, lat);
    const c0 = Math.floor(x / cell) - box.col0; const r0 = Math.floor(y / cell) - box.row0;
    const radius = Math.round(25 / km);
    let cells = 0; let far = 0;
    /** @type {number[]} */ const ds = [];
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= cols || r >= rows || Math.hypot(c - c0, r - r0) > radius) continue;
        const i = r * cols + c;
        // Land today that is sea at AD 1 (lead code 1 or more), outside lakes that were bays.
        if (!land[i] || lead[i] === COAST_CODE.land || lead[i] === COAST_CODE.sea || made.lakeCells[i]) continue;
        cells++; ds.push(seaDist[i]); far = Math.max(far, seaDist[i]);
      }
    }
    ds.sort((a, b) => a - b);
    const i0 = r0 * cols + c0;
    const here = r0 >= 0 && r0 < rows && c0 >= 0 && c0 < cols;
    return {
      place: name, landCellsSeaAtAd1: cells, areaKm2: round(cells * km * km, 1), inlandKmMax: round(far * km, 1), inlandKm90: round((ds.length ? ds[Math.floor(ds.length * 0.9)] : 0) * km, 1),
      seaAboveTodayAtAd1M: here ? round((fall1[i0] * (COAST_PARAMS.today - LEAD.baseYear)) / 1000, 2) : null,
      seaAboveTodayIn1219M: here ? round((fall[i0] * (COAST_PARAMS.today - 1219)) / 1000, 2) : null,
    };
  });
  const kopli = { cut: { ...cut, cells: cutCells.length, held: cutHeld } };
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < n; i++) if (land[i] && !made.lakeCells[i]) histogram[lead[i]]++;
  const changing = histogram.slice(1, LEAD.last + 1).reduce((a, b) => a + b, 0);

  console.log('\nFitted AD 1 k:'); for (const g of adGroups) console.log(`  ${g.group.padEnd(14)} k = ${g.k.toFixed(3)} (${g.points.join(', ')})`);
  console.log('\nAD 1 control points:'); for (const c of checks) console.log(`  ${c.ok ? 'ok ' : 'OFF'} ${c.id.padEnd(20)} ${c.use.padEnd(5)} model ${c.modelM} m, study ${c.observedM} m ±${c.toleranceM} (k ${c.k})`);
  console.log('\nThe AD 1 shore (land today that is sea at AD 1, within 25 km):');
  for (const p of report) console.log(`  ${p.place.padEnd(26)} sea +${p.seaAboveTodayAtAd1M} m (1219: +${p.seaAboveTodayIn1219M}); ${String(p.landCellsSeaAtAd1).padStart(6)} cells (${p.areaKm2} km²); inland up to ${p.inlandKmMax} km, 90% within ${p.inlandKm90} km`);
  console.log('\nKopli:', JSON.stringify(kopli));
  console.log(`\n${changing} cells of today's dry land are sea at AD 1.`);
  console.log(`Level check: AD 1 is level ${leadLevel(1)}, 1218 is level ${leadLevel(1218)}.`);

  await writeGrid(OUT_NAME, lead, {
    cols, rows, cell, col0: box.col0, row0: box.row0, rowOrder: 'south-first', type: 'uint8',
    unit: `lead code: 0 land at AD 1; k = 1-${LEAD.last} sea until ${LEAD.baseYear} + ${LEAD.step}k (153 and up: the same cells as the 1219 field's codes 1-201); 254 sea all game (src/sim/coast-date.js)`,
    licence: 'CC-BY-4.0',
    sources: COAST_AD1_SOURCES,
    inputs: [await inputRecord('nkg-rf17vel'), await inputRecord(made.key), await inputRecord('ne-land'), await inputRecord('ne-lakes')],
    params: { ...COAST_PARAMS, lead: LEAD },
    paramsSha256: coastAd1ParamsSha256(anchorsText, coastParamsSha256(made.anchorsText)),
    mainParamsSha256: coastParamsSha256(made.anchorsText),
    anchorsFile: ANCHORS_AD1_FILE, mainAnchorsFile: ANCHORS_FILE, mainField: MAIN_OUT,
    gebcoKey: made.key,
    sgu: { used: false, note: 'SGU\'s shore model is blocked (resource.sgu.se is not allowed): Sweden\'s AD 1 shore is the estimate, bent to north Uppland (Hedenström and Risberg), as the 1219 coast was bent to Stockholm.' },
    fitted: adGroups.map((g) => ({ group: g.group, k: round(g.k, 3), points: g.points })),
    checks, report, kopli, putInStep: fixed,
    cells: { dryLandSeaAtAd1: changing },
    notes: 'An estimate. The sea\'s height above today\'s is a straight line in time from AD 1 (k1 x (uplift - 0.5) x 2020 years, k1 fitted to north Uppland\'s older lake isolations, 1219\'s k elsewhere) to the 1219 value; a cell of today\'s land at GEBCO height h is land from the year the line reaches h, unless a higher sill cut it off sooner (the 1219 flood). Cells still sea in 1219 keep the 1219 field\'s years. Nothing changes south of 56N.',
  });
  console.log(`wrote ${join(DERIVED, OUT_NAME)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

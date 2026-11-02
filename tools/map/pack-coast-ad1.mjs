// @ts-check
// The coast-ad1 block (src/data/by/coast-ad1.json, CC BY 4.0): the AD 1 coast, one lead code per
// 500 m cell over the same box as the 1219 coast block (src/sim/coast-date.js reads it as the
// lead-in field; src/ui/map/shore.js draws the old sea and shore from it). CC BY 4.0 like the 1219
// field (NKG_RF17vel; the rest is public domain). A late block: read only for dates before 1219.
// SGU's shore model is blocked, so Sweden's AD 1 shore is the estimate.
//   node tools/map/pack-coast-ad1.mjs     (also run by tools/map/pack.mjs)

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COAST_CODE, LEAD, leadFromMain } from '../../src/sim/coast-date.js';
import { blockText, makeBlock, ROOT, writeBlock } from './block.mjs';
import { ANCHORS_FILE, OUT_NAME as MAIN_OUT } from './build-coast.mjs';
import { ANCHORS_AD1_FILE, OUT_NAME } from './build-coast-ad1.mjs';
import { coastParamsSha256 } from './coast.mjs';
import { coastAd1ParamsSha256 } from './coast-ad1.mjs';
import { readDerived } from './pack-base.mjs';
import { madeFrom } from './pack-notice.mjs';
import { DERIVED } from './resample.mjs';

export const COAST_AD1_BLOCK = 'src/data/by/coast-ad1.json';

/**
 * Why a built field no longer matches today's settings and control points (none: it is current).
 * @param {any} meta the field's sidecar @param {string} anchorsAd1Text @param {string} anchorsText the 1219 control points
 * @returns {string[]}
 */
export function coastAd1StaleReasons(meta, anchorsAd1Text, anchorsText) {
  return meta.paramsSha256 === coastAd1ParamsSha256(anchorsAd1Text, coastParamsSha256(anchorsText)) ? []
    : [`COAST_PARAMS, ${ANCHORS_FILE} or ${ANCHORS_AD1_FILE} changed since it was built`];
}

/** The block, or null when the field was never built here. */
export async function packCoastAd1() {
  if (!existsSync(join(DERIVED, OUT_NAME))) return null;
  const anchorsAd1Text = await readFile(join(ROOT, ANCHORS_AD1_FILE), 'utf8');
  const anchorsText = await readFile(join(ROOT, ANCHORS_FILE), 'utf8');
  const { meta, bytes } = await readDerived(OUT_NAME);
  const codes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (codes.length !== meta.cols * meta.rows) throw new Error(`${OUT_NAME} does not match its sidecar`);
  const stale = coastAd1StaleReasons(meta, anchorsAd1Text, anchorsText);
  if (stale.length) throw new Error(`the AD 1 coast field is stale (${stale.join('; ')}): run npm run map:coast-ad1`);
  for (const k of codes) if (k > LEAD.last && k !== 254) throw new Error(`lead code ${k} is not one the game knows`);
  // The cells still sea in 1219 follow from the 1219 field (leadFromMain): stored as 0, put back
  // by createCoast. Checked here, so the game rebuilds exactly the field that was built.
  const main = await readDerived(MAIN_OUT);
  const mainCodes = new Uint8Array(main.bytes.buffer, main.bytes.byteOffset, main.bytes.byteLength);
  if (mainCodes.length !== codes.length) throw new Error(`${OUT_NAME} and ${MAIN_OUT} cover different boxes`);
  const stored = codes.slice();
  for (let i = 0; i < stored.length; i++) {
    const k = mainCodes[i];
    if (k < COAST_CODE.first || k > COAST_CODE.last) continue;
    if (stored[i] !== leadFromMain(k)) throw new Error(`cell ${i}: lead code ${stored[i]} does not follow from the 1219 code ${k}: run npm run map:coast-ad1`);
    stored[i] = 0;
  }
  const ad = JSON.parse(anchorsAd1Text);
  /** @type {string[]} */
  const sources = meta.sources;
  const label = 'The northern coast around AD 1 for Grind Strat (Sweden, Åland, Finland, Estonia): where the sea stood higher against today\'s land, 500 m cells, in steps of 8 years from AD 1 to 1219, where the 1219 coast takes over. An estimate: today\'s land uplift (NKG_RF17vel) bent to fit dated lake isolations (north Uppland), over GEBCO\'s heights; Kopli\'s neck is a hand-drawn cut.';
  return makeBlock({
    kind: 'coast-ad1',
    licence: 'CC-BY-4.0',
    notice: `${label} Shared under CC BY 4.0 (creativecommons.org/licenses/by/4.0/). ${await madeFrom(sources)}`,
    sources,
    meta: {
      coast: { col0: meta.col0, row0: meta.row0, cols: meta.cols, rows: meta.rows, cell: meta.cell, rowOrder: 'south-first' },
      codes: { land: 0, last: LEAD.last, sea: 254, baseYear: LEAD.baseYear, step: LEAD.step, handOver: LEAD.handOver, fromMain: 'cells the 1219 field has as sea in 1219 are stored as 0 and rebuilt from it (src/sim/coast-date.js completeLead)' },
      estimate: true,
      sgu: meta.sgu,
      fitted: meta.fitted,
      checks: meta.checks,
      report: meta.report,
      kopli: { ...meta.kopli, about: ad.tallinn.about, source: ad.tallinn.source },
      older: ad.older,
      built: { paramsSha256: meta.paramsSha256, mainParamsSha256: meta.mainParamsSha256 },
    },
    layers: { lead: stored },
  });
}

async function main() {
  const block = await packCoastAd1();
  if (!block) {
    console.log(`no data/raw/derived/${OUT_NAME}: ${COAST_AD1_BLOCK} left as it is (npm run map:coast-ad1 builds it)`);
    return;
  }
  const text = await writeBlock(COAST_AD1_BLOCK, block);
  console.log(`${COAST_AD1_BLOCK}: ${(text.length / 1024).toFixed(1)} KB (${(Buffer.byteLength(blockText(block)) / 1048576).toFixed(2)} MB)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}

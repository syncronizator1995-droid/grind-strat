// @ts-check
// Builds the game into ONE self-contained file, dist/grind-strat.html, with everything inlined:
// code, styles, the font and any data. Next to it go the files that let the website version
// install like an app: index.html (the same game), manifest.webmanifest, sw.js and the icons.
//
//   node tools/build.mjs                  minified release build into dist/
//   node tools/build.mjs --dev            readable code, for debugging
//   node tools/build.mjs --out <folder>
//   node tools/build.mjs --allow-interim  a local preview with stand-in data (never in CI)
//
// It stops with an error if the script would break the page (`</script`) or if the page would
// load anything over the network. Only the install files listed in src/ui/install.js may be
// referenced, and only by the website version (install.js skips them when opened as a file).
//
// The map data blocks (tools/map/block.mjs) go into the page as JSON, each in its own
// <script type="application/json" id="gs-<kind>">, not into the code: the browser never parses
// them as code, so the game starts faster. The licence guard stops the build if a block names a
// source whose licence was not read on its owner's own host, if a block is an interim stand-in,
// or if a block mixes licences that must stay apart.

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { INSTALL_FILES } from '../src/ui/install.js';
import { BLOCK_FILES, shippedBlockFiles } from './map/block.mjs';
import { rawSources } from './map/fetch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UI = join(ROOT, 'src', 'ui');

export const ICONS = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

/** The web manifest: how the installed app looks on the home screen. */
export const MANIFEST = {
  id: './',
  name: 'Grind Strat',
  short_name: 'Grind Strat',
  description: 'A slow, deep grand strategy game of the Baltic lands, from the first hunters to today.',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#17212c',
  theme_color: '#17212c',
  lang: 'en',
  dir: 'ltr',
  categories: ['games', 'education'],
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

/**
 * Problems that would break the page: a `</script` inside the script ends the script early.
 * @param {string} js
 * @returns {string[]}
 */
export function findScriptBreakers(js) {
  return /<\/script/i.test(js) ? ['the script contains "</script", which would cut the page short'] : [];
}

/**
 * Everything in the finished page that would load something over the network. Data URIs and
 * same-page links (#...) are fine; anything else is not. The screenshot test backs this up at
 * run time by blocking and reporting every outside request.
 * @param {string} html the whole page
 * @param {string} js the inlined script (also inside html; checked separately for clearer messages)
 * @returns {string[]}
 */
export function findNetworkUses(html, js) {
  /** @type {string[]} */
  const problems = [];
  const htmlOnly = html.replace(js, '');
  for (const m of htmlOnly.matchAll(/\s(src|href|srcset|poster|action|formaction|data|background)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const value = (m[3] ?? m[4] ?? m[5] ?? '').trim();
    if (!/^(data:|#)/i.test(value)) problems.push(`the page links to "${value.slice(0, 80)}" (${m[1]})`);
  }
  for (const m of htmlOnly.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
    if (!/^(data:|#)/i.test(m[2].trim())) problems.push(`the styles load "${m[2].slice(0, 80)}"`);
  }
  if (/@import\b/i.test(htmlOnly)) problems.push('the styles use @import');
  const calls = [
    [/\bfetch\s*\(/, 'fetch()'],
    [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
    [/\bWebSocket\b/, 'WebSocket'],
    [/\bEventSource\b/, 'EventSource'],
    [/\bsendBeacon\b/, 'sendBeacon'],
    [/\bimportScripts\b/, 'importScripts'],
    [/\bimport\s*\(/, 'import()'],
    [/\bnew\s+Worker\s*\(/, 'new Worker()'],
  ];
  for (const [pattern, name] of /** @type {[RegExp, string][]} */ (calls)) {
    if (pattern.test(js)) problems.push(`the script uses ${name}`);
  }
  // Web addresses in strings: "https://…", or "//host.name/…". A host needs a dot, which base64
  // text (map data) never has, so packed data that happens to start with "//" is not flagged.
  for (const m of js.matchAll(/["'`](?:https?:\/\/|\/\/[\w-]+\.[\w.-]+)[^"'`\s]*/g)) {
    // XML namespace names look like links but are never loaded.
    if (!/^["'`]https?:\/\/www\.w3\.org\//.test(m[0])) problems.push(`the script contains the address ${m[0].slice(1, 81)}`);
  }
  // File names in the script: only the install files that sit next to the game on the website.
  const allowed = new Set(/** @type {string[]} */ (Object.values(INSTALL_FILES)));
  for (const m of js.matchAll(/["'`]([\w./-]+\.(?:m?js|css|png|jpe?g|gif|webp|svg|json|webmanifest|woff2?|ttf|otf|html?|wasm|mp3|ogg|wav))["'`]/gi)) {
    if (!allowed.has(m[1])) problems.push(`the script refers to the file "${m[1]}"`);
  }
  return problems;
}

/**
 * @typedef {{ kind: string, text: string }} BlockText a data block as it is on disk
 * @typedef {{ id: string, collection: string, licenceStatus: string, credit: { licenceName: string } }} SourceRecord
 */

/**
 * The licence guard: problems that stop a release build.
 * @param {BlockText[]} blocks
 * @param {SourceRecord[]} sources tools/map/sources.json
 * @param {{ allowInterim?: boolean }} [options]
 * @returns {string[]}
 */
export function licenceProblems(blocks, sources, { allowInterim = false } = {}) {
  /** @type {string[]} */
  const problems = [];
  const byId = new Map(sources.map((s) => [s.id, s]));
  const kinds = new Set();
  for (const { kind, text } of blocks) {
    /** @type {any} */
    let block;
    try {
      block = JSON.parse(text);
    } catch {
      problems.push(`the ${kind} block is not valid JSON`);
      continue;
    }
    const name = `the ${kind} block`;
    if (block.kind !== kind) problems.push(`${name} says it is "${block.kind}"`);
    if (kinds.has(kind)) problems.push(`two blocks are "${kind}"`);
    kinds.add(kind);
    if (!Array.isArray(block.sources) || !block.sources.length) problems.push(`${name} names no sources`);
    if (typeof block.licence !== 'string' || !block.licence) problems.push(`${name} names no licence`);
    if (typeof block.notice !== 'string' || !block.notice) problems.push(`${name} has no notice`);
    if (block.interim && !allowInterim) {
      problems.push(`${name} is interim (a stand-in, not the real data): pack the real data with npm run map:pack, or preview locally with --allow-interim`);
    }
    for (const id of block.sources ?? []) {
      const s = byId.get(id);
      if (!s) problems.push(`${name} names the source "${id}", which is not in tools/map/sources.json`);
      else if (s.licenceStatus !== 'read') problems.push(`${name} uses "${id}", whose licence has not been read on its owner's own host (licenceStatus "${s.licenceStatus}")`);
    }
    const used = (block.sources ?? []).map((/** @type {string} */ id) => byId.get(id)).filter(Boolean);
    // OpenStreetMap data (ODbL) never shares a block with anything else, and only sits in an
    // ODbL block. Share-alike blocks must say so. Public-domain blocks hold only public domain.
    const osm = used.filter((/** @type {SourceRecord} */ s) => s.collection === 'osm');
    if (osm.length && (block.licence !== 'ODbL-1.0' || osm.length !== used.length)) problems.push(`${name} mixes OpenStreetMap data with other data or licences`);
    if (block.licence === 'public-domain' && used.some((/** @type {SourceRecord} */ s) => !/^public domain/i.test(s.credit.licenceName))) {
      problems.push(`${name} says public domain but uses data under another licence`);
    }
    if (used.some((/** @type {SourceRecord} */ s) => /BY-SA/i.test(s.credit.licenceName)) && block.licence !== 'CC-BY-SA-4.0') {
      problems.push(`${name} holds share-alike data but is not under CC BY-SA 4.0`);
    }
  }
  return problems;
}

/**
 * Web addresses in the data blocks. The notices write addresses without a scheme
 * (openstreetmap.org/copyright), and packed data never contains a dot, so anything that looks
 * like an address is a mistake.
 * @param {BlockText[]} blocks
 */
export function findAddressesInData(blocks) {
  /** @type {string[]} */
  const problems = [];
  for (const { kind, text } of blocks) {
    for (const m of text.matchAll(/(?:https?:)?\/\/[\w-]+\.[\w.-]+[^"\s]*/gi)) problems.push(`the ${kind} block contains the address ${m[0].slice(0, 80)}`);
  }
  return problems;
}

/**
 * The data blocks as page elements, in a fixed order. Every "<" is written as \u003c, so no text
 * inside can end the element early.
 * @param {BlockText[]} blocks
 */
export function dataElements(blocks) {
  return blocks.map(({ kind, text }) => `<script type="application/json" id="gs-${kind}">${text.trim().replace(/</g, '\\u003c')}</script>`).join('\n');
}

/**
 * The blocks the game ships, read from disk, in build order.
 * @returns {Promise<BlockText[]>}
 */
export async function shippedBlocks() {
  const files = shippedBlockFiles();
  const missing = Object.keys(BLOCK_FILES).filter((k) => !files.some((f) => f.kind === k));
  if (missing.length) throw new Error(`build stopped: no ${missing.join(', ')} data block: run npm run map:pack`);
  return Promise.all(files.map(async ({ kind, path }) => ({ kind, text: await readFile(join(ROOT, path), 'utf8') })));
}

/**
 * Replaces a {{NAME}} placeholder. A function replacement keeps "$" in the code from being read
 * as a special replacement pattern.
 * @param {string} text
 * @param {string} name
 * @param {string} value
 */
function fill(text, name, value) {
  const token = `{{${name}}}`;
  if (!text.includes(token)) throw new Error(`placeholder ${token} not found`);
  return text.replace(token, () => value);
}

/**
 * @param {{ dev?: boolean, out?: string, entry?: string, allowInterim?: boolean, blocks?: BlockText[],
 *   sources?: SourceRecord[] }} [options] `entry`, `blocks` and `sources` are for tests
 * @returns {Promise<{ file: string, bytes: number, build: string, blocks: { kind: string, bytes: number, interim: boolean }[] }>}
 */
export async function build({ dev = false, out = join(ROOT, 'dist'), entry = join(UI, 'main.js'), allowInterim = false, blocks, sources } = {}) {
  const data = blocks ?? await shippedBlocks();
  const guard = licenceProblems(data, sources ?? await rawSources(), { allowInterim });
  if (guard.length) throw new Error(`build stopped by the licence guard:\n- ${guard.join('\n- ')}`);

  const bundle = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    target: ['chrome90', 'firefox90', 'safari15'],
    minify: !dev,
    write: false,
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'silent',
  });
  const js = bundle.outputFiles[0].text;

  const font = (await readFile(join(UI, 'fonts', 'grenze-gotisch.woff2'))).toString('base64');
  const css = fill(await readFile(join(UI, 'style.css'), 'utf8'), 'FONT', font);
  const icon = (await readFile(join(UI, 'icons', 'icon-192.png'))).toString('base64');

  let html = await readFile(join(UI, 'index.html'), 'utf8');
  html = fill(html, 'ICON', `data:image/png;base64,${icon}`);
  html = fill(html, 'CSS', css);
  const elements = dataElements(data);
  html = fill(html, 'DATA', elements);
  html = fill(html, 'SCRIPT', js);

  const problems = [...findScriptBreakers(js), ...findNetworkUses(html.replace(elements, ''), js), ...findAddressesInData(data)];
  if (problems.length) throw new Error(`build stopped:\n- ${problems.join('\n- ')}`);

  // The build id names the offline cache, so it must change whenever ANY published file changes:
  // otherwise phones keep an old manifest or icon forever.
  const manifest = `${JSON.stringify(MANIFEST, null, 2)}\n`;
  const swSource = await readFile(join(UI, 'sw.js'), 'utf8');
  const hash = createHash('sha256').update(html).update(manifest).update(swSource);
  for (const name of ICONS) hash.update(await readFile(join(UI, 'icons', name)));
  const buildId = hash.digest('hex').slice(0, 12);
  const marker = "const BUILD = '__BUILD__';";
  if (!swSource.includes(marker)) throw new Error(`sw.js must contain: ${marker}`);
  const sw = swSource.replace(marker, () => `const BUILD = '${buildId}';`);

  await mkdir(out, { recursive: true });
  const file = join(out, 'grind-strat.html');
  await writeFile(file, html);
  await writeFile(join(out, 'index.html'), html);
  await writeFile(join(out, 'manifest.webmanifest'), manifest);
  await writeFile(join(out, 'sw.js'), sw);
  await writeFile(join(out, '.nojekyll'), '');
  for (const name of ICONS) await copyFile(join(UI, 'icons', name), join(out, name));
  return {
    file,
    bytes: Buffer.byteLength(html),
    build: buildId,
    blocks: data.map(({ kind, text }) => ({ kind, bytes: Buffer.byteLength(text), interim: Boolean(JSON.parse(text).interim) })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  try {
    const result = await build({ dev: args.includes('--dev'), out: outAt >= 0 ? resolve(args[outAt + 1]) : undefined, allowInterim: args.includes('--allow-interim') });
    console.log(`built ${result.file} (${(result.bytes / 1024).toFixed(1)} KB, build ${result.build})`);
    for (const b of result.blocks) console.log(`  data block ${b.kind}: ${(b.bytes / 1024).toFixed(1)} KB${b.interim ? ' (INTERIM, preview only)' : ''}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

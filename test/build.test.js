// @ts-check
// Tests for the build: its safety checks, and a real build into a temporary folder.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { build, dataElements, lateElements, findAddressesInData, findNetworkUses, findScriptBreakers, ICONS, licenceProblems, MANIFEST } from '../tools/build.mjs';
import { blockText, makeBlock } from '../tools/map/block.mjs';

// The tests that build the real game build it strictly, as a release does: every real block must
// pass the licence guard (none is an interim stand-in). The guard has tests of its own below.

describe('build safety checks', () => {
  it('stops a script that contains </script', () => {
    assert.equal(findScriptBreakers('const a = "</script>";').length, 1);
    assert.equal(findScriptBreakers('const a = "</SCRIPT >";').length, 1);
    assert.deepEqual(findScriptBreakers('const a = "<\\/script>";'), []);
  });

  /** @param {string} body @param {string} [js] */
  const page = (body, js = '') => `<html><head></head><body>${body}<script>${js}</script></body></html>`;

  it('stops links and styles that load from the network', () => {
    assert.ok(findNetworkUses(page('<img src="https://example.com/a.png">'), '').length);
    assert.ok(findNetworkUses(page('<link rel="stylesheet" href="//cdn.example.com/x.css">'), '').length);
    assert.ok(findNetworkUses(page('<link rel="manifest" href="manifest.webmanifest">'), '').length);
    assert.ok(findNetworkUses(page('<style>body{background:url(bg.png)}</style>'), '').length);
    assert.ok(findNetworkUses(page('<style>@import "x.css";</style>'), '').length);
    assert.ok(findNetworkUses(page('<div style="background: url(\'https://x.y/z.png\')"></div>'), '').length);
  });

  it('allows data URIs and same-page links', () => {
    assert.deepEqual(findNetworkUses(page('<link rel="icon" href="data:image/png;base64,AAAA"><a href="#top">top</a><style>@font-face{src:url(data:font/woff2;base64,AAAA)}</style>'), ''), []);
  });

  it('stops scripts that fetch, open sockets, or name outside files', () => {
    for (const js of [
      'fetch("data.json")',
      'new XMLHttpRequest()',
      'new WebSocket("ws://x")',
      'new EventSource("/s")',
      'navigator.sendBeacon("/b")',
      'import("./x.js")',
      'new Worker("w.js")',
      'img.src = "https://example.com/a.png"',
      'img.src = "//example.com/a.png"',
      'img.src = "pic.png"',
    ]) {
      assert.ok(findNetworkUses(page('', js), js).length, js);
    }
  });

  it('does not mistake packed map data for a web address', () => {
    const js = 'const bundle = "//8AAP7+/wAB"; const other = "ab//cd==";';
    assert.deepEqual(findNetworkUses(page('', js), js), []);
    const bad = 'load("//cdn.example.com/x.js")';
    assert.ok(findNetworkUses(page('', bad), bad).length);
  });

  it('allows the install files and XML namespace names', () => {
    const js = 'reg("sw.js"); link("manifest.webmanifest"); link("icon-192.png"); document.createElementNS("http://www.w3.org/2000/svg","svg")';
    assert.deepEqual(findNetworkUses(page('', js), js), []);
  });
});

describe('build', () => {
  // esbuild already escapes "</script" inside strings, so a bundle can't contain one; the
  // findScriptBreakers test above covers that backstop.
  it('refuses to build a game that would load from the network', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'grind-strat-bad-'));
    try {
      for (const [name, code] of [
        ['fetches.js', 'fetch("data.json").then(console.log);'],
        ['socket.js', 'new WebSocket("wss://example.com/live");'],
        ['image.js', 'const i = new Image(); i.src = "https://example.com/x.png";'],
      ]) {
        const entry = join(dir, name);
        await writeFile(entry, code);
        await assert.rejects(build({ entry, out: join(dir, 'out') }), /build stopped:/, name);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('gives a new build id when only the manifest changes, so phones get the update', async () => {
    const out = await mkdtemp(join(tmpdir(), 'grind-strat-id-'));
    const name = MANIFEST.name;
    try {
      const first = await build({ out });
      MANIFEST.name = `${name} (test)`;
      const second = await build({ out });
      assert.notEqual(first.build, second.build);
    } finally {
      MANIFEST.name = name;
      await rm(out, { recursive: true, force: true });
    }
  });

  it('makes one self-contained game file plus the install files', async () => {
    const out = await mkdtemp(join(tmpdir(), 'grind-strat-build-'));
    try {
      const result = await build({ out });
      const html = await readFile(result.file, 'utf8');
      assert.ok(html.startsWith('<!doctype html>'));
      assert.ok(html.includes('data:font/woff2;base64,'), 'font inlined');
      assert.ok(html.includes('data:image/png;base64,'), 'icon inlined');
      assert.ok(!html.includes('{{'), 'no placeholder left');
      // The real map makes the file big; past this it would be slow to open on a phone.
      assert.ok(result.bytes < 4 * 1024 * 1024, `game file is ${result.bytes} bytes`);
      for (const kind of ['base', 'terrain', 'water', 'names']) {
        assert.ok(html.includes(`<script type="application/json" id="gs-${kind}">`), `the ${kind} data is in the page`);
      }
      for (const kind of ['terrain-time', 'coast', 'changes']) {
        assert.ok(html.includes(`<!--gs:${kind}\n`), `the ${kind} data is in the page, as a comment the browser does not parse`);
        assert.ok(!html.includes(`id="gs-${kind}"`), `the ${kind} data is not a script element`);
      }
      assert.ok(html.indexOf('id="gs-water"') < html.lastIndexOf('<script>'), 'the first picture\'s data comes before the code that reads it');
      // The map over time is needed only after the first picture: after the code, so it starts sooner.
      for (const kind of ['terrain-time', 'coast', 'changes']) assert.ok(html.indexOf(`<!--gs:${kind}\n`) > html.lastIndexOf('<script>'), `the ${kind} data comes after the code`);
      assert.equal(await readFile(join(out, 'index.html'), 'utf8'), html);

      const manifest = JSON.parse(await readFile(join(out, 'manifest.webmanifest'), 'utf8'));
      assert.equal(manifest.name, 'Grind Strat');
      assert.equal(manifest.display, 'standalone');
      assert.equal(manifest.orientation, 'portrait');
      for (const icon of manifest.icons) assert.ok((await stat(join(out, icon.src))).size > 0, icon.src);
      for (const name of ICONS) assert.ok((await stat(join(out, name))).size > 0, name);

      const sw = await readFile(join(out, 'sw.js'), 'utf8');
      assert.ok(sw.includes(`const BUILD = '${result.build}';`));
      assert.ok(!sw.includes('__BUILD__'));
      await stat(join(out, '.nojekyll'));
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});

describe('licence guard', () => {
  /** Sources as tools/map/sources.json has them, cut down to what the guard reads. */
  const sources = [
    { id: 'pd', collection: 'pd', licenceStatus: 'read', credit: { licenceName: 'Public domain' } },
    { id: 'by', collection: 'by', licenceStatus: 'read', credit: { licenceName: 'CC BY 4.0' } },
    { id: 'bysa', collection: 'bysa', licenceStatus: 'read', credit: { licenceName: 'CC BY-SA 4.0' } },
    { id: 'osm', collection: 'osm', licenceStatus: 'read', credit: { licenceName: 'Open Database License (ODbL) 1.0' } },
    { id: 'unread', collection: 'x', licenceStatus: 'unverified', credit: { licenceName: 'Public domain' } },
    { id: 'own', collection: 'own', licenceStatus: 'read', credit: { licenceName: 'Grind Strat\'s own terms (not yet chosen)' } },
  ];
  /**
   * @param {string} kind @param {string} licence @param {string[]} ids
   * @param {{ interim?: boolean, notice?: string }} [more]
   */
  const block = (kind, licence, ids, more = {}) => ({
    kind,
    text: blockText(makeBlock({ kind, licence, notice: more.notice ?? 'A notice.', sources: ids, interim: more.interim, meta: {}, layers: { a: Uint8Array.of(1, 2, 3) } })),
  });
  const good = [block('base', 'public-domain', ['pd']), block('terrain', 'CC-BY-SA-4.0', ['bysa', 'by', 'pd']), block('water', 'ODbL-1.0', ['osm'])];

  it('accepts blocks whose licences were read and kept apart', () => {
    assert.deepEqual(licenceProblems(good, sources), []);
  });

  it('refuses a source whose licence was not read on its owner\'s host', () => {
    const problems = licenceProblems([block('base', 'public-domain', ['pd', 'unread'])], sources);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /"unread".*licence has not been read/);
    assert.match(licenceProblems([block('base', 'public-domain', ['nowhere'])], sources)[0], /not in tools\/map\/sources.json/);
  });

  it('refuses an interim block unless previewing', () => {
    const interim = [block('water', 'public-domain', ['pd'], { interim: true })];
    assert.match(licenceProblems(interim, sources)[0], /interim/);
    assert.deepEqual(licenceProblems(interim, sources, { allowInterim: true }), []);
  });

  it('refuses mixed licences: OpenStreetMap with anything, share-alike outside CC BY-SA, non-public data in a public-domain block', () => {
    assert.ok(licenceProblems([block('water', 'ODbL-1.0', ['osm', 'pd'])], sources).some((p) => /mixes OpenStreetMap/.test(p)));
    assert.ok(licenceProblems([block('terrain', 'CC-BY-SA-4.0', ['bysa', 'osm'])], sources).some((p) => /mixes OpenStreetMap/.test(p)));
    assert.ok(licenceProblems([block('terrain', 'CC-BY-4.0', ['bysa'])], sources).some((p) => /share-alike/.test(p)));
    assert.ok(licenceProblems([block('base', 'public-domain', ['by'])], sources).some((p) => /public domain/.test(p)));
  });

  it('keeps a CC BY block to CC BY and public-domain data only', () => {
    assert.deepEqual(licenceProblems([block('coast', 'CC-BY-4.0', ['by', 'pd'])], sources), []);
    assert.ok(licenceProblems([block('coast', 'CC-BY-4.0', ['by', 'bysa'])], sources).some((p) => /under CC BY 4.0 but holds data under another licence/.test(p)));
    assert.ok(licenceProblems([block('coast', 'CC-BY-4.0', ['by', 'osm'])], sources).some((p) => /under CC BY 4.0 but holds/.test(p)));
    const odd = [...sources, { id: 'nc', collection: 'nc', licenceStatus: 'read', credit: { licenceName: 'CC BY-NC 4.0' } }];
    assert.ok(licenceProblems([block('coast', 'CC-BY-4.0', ['nc'])], odd).some((p) => /under CC BY 4.0 but holds/.test(p)));
    // The other way round is fine: CC BY data may sit in a share-alike block.
    assert.deepEqual(licenceProblems([block('terrain', 'CC-BY-SA-4.0', ['by'])], sources), []);
  });

  it('keeps an ODbL block to OpenStreetMap data, and our own block to our own work', () => {
    assert.deepEqual(licenceProblems([block('changes', 'grind-strat-own', ['own'])], sources), []);
    assert.deepEqual(licenceProblems([block('names', 'grind-strat-own', ['own'])], sources), []);
    assert.ok(licenceProblems([block('water', 'ODbL-1.0', ['pd'])], sources).some((p) => /under the ODbL but holds data that is not OpenStreetMap's/.test(p)));
    assert.ok(licenceProblems([block('water', 'ODbL-1.0', ['own'])], sources).some((p) => /not OpenStreetMap's/.test(p)));
    for (const other of ['pd', 'by', 'osm']) {
      assert.ok(licenceProblems([block('changes', 'grind-strat-own', ['own', other])], sources).some((p) => /our own work but holds data from others/.test(p)), other);
      assert.ok(licenceProblems([block('names', 'grind-strat-own', ['own', other])], sources).some((p) => /our own work but holds data from others/.test(p)), other);
    }
  });

  it('puts each block into the page safely, and finds web addresses in the data', () => {
    const tricky = block('water', 'ODbL-1.0', ['osm'], { notice: 'a </script> b' });
    const html = dataElements([tricky]);
    assert.ok(!/<\/script>.*<\/script>/s.test(html), 'the notice cannot end the element early');
    assert.ok(html.includes('\\u003c/script>'));
    assert.equal(JSON.parse(html.replace(/^<script[^>]*>|<\/script>$/g, '')).notice, 'a </script> b', 'the JSON still reads back the same');
    assert.throws(() => makeBlock({ kind: 'x', licence: 'public-domain', notice: 'see https://example.com/a', sources: ['pd'], meta: {}, layers: {} }), /"\/\/"/);
    const sneaky = { kind: 'water', text: good[2].text.replace('A notice.', 'see https://example.com/a') };
    assert.equal(findAddressesInData([sneaky]).length, 1);
    assert.deepEqual(findAddressesInData(good), []);
  });

  it('puts a late block into the page as a comment that nothing inside can end', () => {
    const nasty = block('changes', 'grind-strat-own', ['own'], { notice: 'a --> b <!-- c </script> d --!> e' });
    const html = lateElements([nasty]);
    assert.ok(html.startsWith('<!--gs:changes\n') && html.endsWith('\n-->'));
    assert.equal(html.indexOf('-->'), html.length - 3, 'no "-->" inside');
    assert.ok(!html.slice(4).includes('<!--') && !html.includes('--!>'));
    const text = html.slice('<!--gs:changes\n'.length, -'\n-->'.length);
    assert.equal(JSON.parse(text).notice, 'a --> b <!-- c </script> d --!> e', 'the JSON reads back the same');
  });

  it('a strict build refuses an interim block and an unread source, and builds good blocks', async () => {
    const out = await mkdtemp(join(tmpdir(), 'grind-strat-guard-'));
    try {
      await assert.rejects(build({ out, blocks: [...good.slice(0, 2), block('water', 'public-domain', ['pd'], { interim: true })], sources }), /licence guard[\s\S]*interim/);
      await assert.rejects(build({ out, blocks: [block('base', 'public-domain', ['unread']), ...good.slice(1)], sources }), /licence guard[\s\S]*not been read/);
      const result = await build({ out, blocks: good, sources });
      assert.deepEqual(result.blocks.map((b) => b.kind), ['base', 'terrain', 'water']);
      const html = await readFile(result.file, 'utf8');
      assert.ok(html.includes('<script type="application/json" id="gs-terrain">'));
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});

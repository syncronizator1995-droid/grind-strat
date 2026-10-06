// @ts-check
// Tests for the build: its safety checks, and a real build into a temporary folder.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { build, findNetworkUses, findScriptBreakers, ICONS, MANIFEST } from '../tools/build.mjs';

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
        await assert.rejects(build({ entry, out: join(dir, 'out') }), /build stopped/, name);
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
      assert.ok(result.bytes < 1024 * 1024, `game file is ${result.bytes} bytes`);
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

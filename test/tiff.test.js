// @ts-check
// Tests for the TIFF reader (tools/map/tiff.mjs) against synthetic files written by
// test/tiff-writer.mjs: classic and BigTIFF, both byte orders, strips and tiles, no
// compression, LZW and DEFLATE, predictor 1 and 2, uint8 and int16. No network, no data/raw.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lzwDecode, memorySource, openTiff } from '../tools/map/tiff.mjs';
import { lzwEncode, writeTiff } from './tiff-writer.mjs';

/**
 * A test picture with smooth parts (so LZW and the predictor have something to do), sharp
 * edges, and for int16 negative values and the full range.
 * @param {number} w @param {number} h @param {8 | 16} bits @param {boolean} signed
 */
function picture(w, h, bits, signed) {
  const values = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = x * 3 + y * 7 + ((x * y) % 5);
      if (bits === 8) v &= 0xff;
      else v = signed ? ((x * 977 + y * 131) % 60000) - 30000 : (x * 977 + y * 131) % 65536;
      if (x === 0 && y === 0) v = signed ? -32768 : bits === 8 ? 255 : 65535;
      values.push(v);
    }
  }
  return values;
}

/** The expected window, with `fill` outside the picture. */
function expectedWindow(/** @type {number[]} */ values, /** @type {number} */ w, /** @type {number} */ h, /** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ ww, /** @type {number} */ wh, /** @type {number} */ fill) {
  const out = [];
  for (let y = y0; y < y0 + wh; y++) for (let x = x0; x < x0 + ww; x++) out.push(x >= 0 && y >= 0 && x < w && y < h ? values[y * w + x] : fill);
  return out;
}

/** A source that counts which byte ranges were asked for. @param {Uint8Array} bytes */
function countingSource(bytes) {
  const inner = memorySource(bytes);
  /** @type {{ offset: number, length: number }[]} */
  const reads = [];
  return { reads, read: (/** @type {number} */ o, /** @type {number} */ n) => { reads.push({ offset: o, length: n }); return inner.read(o, n); } };
}

describe('TIFF reader', () => {
  const W = 37; const H = 29; // odd sizes: the last tiles and strips are partial
  const windows = [[0, 0, W, H], [5, 7, 20, 15], [15, 14, 3, 5], [-3, 20, 10, 15], [30, -2, 12, 4]];
  for (const big of [false, true]) {
    for (const littleEndian of [true, false]) {
      for (const tile of [undefined, /** @type {[number, number]} */ ([16, 16])]) {
        for (const compression of /** @type {const} */ ([1, 5, 8])) {
          for (const predictor of /** @type {const} */ ([1, 2])) {
            for (const [bits, signed] of /** @type {const} */ ([[8, false], [16, true], [16, false]])) {
              const name = `${big ? 'BigTIFF' : 'TIFF'} ${littleEndian ? 'LE' : 'BE'} ${tile ? 'tiles' : 'strips'} comp ${compression} pred ${predictor} ${signed ? 'int' : 'uint'}${bits}`;
              it(`reads windows: ${name}`, async () => {
                const values = picture(W, H, bits, signed);
                const file = writeTiff({ big, littleEndian, images: [{ width: W, height: H, values, bits, signed, tile, rowsPerStrip: 5, compression, predictor }] });
                const tiff = await openTiff(memorySource(file));
                assert.equal(tiff.bigTiff, big);
                const img = tiff.images[0];
                assert.equal(img.width, W);
                assert.equal(img.tiled, !!tile);
                for (const [x0, y0, w, h] of windows) {
                  const got = await tiff.readWindow(img, x0, y0, w, h, { fill: 7 });
                  assert.deepEqual([...got], expectedWindow(values, W, H, x0, y0, w, h, 7), `window ${x0},${y0} ${w}x${h}`);
                }
              });
            }
          }
        }
      }
    }
  }

  it('reads only the tiles a window needs', async () => {
    const values = picture(64, 64, 16, true);
    const file = writeTiff({ images: [{ width: 64, height: 64, values, bits: 16, signed: true, tile: [16, 16], compression: 8, predictor: 2 }] });
    const src = countingSource(file);
    const tiff = await openTiff(src);
    const before = src.reads.length;
    // Inside one tile, then across a corner of four tiles.
    await tiff.readWindow(tiff.images[0], 18, 18, 10, 10);
    const one = src.reads.length - before;
    await tiff.readWindow(tiff.images[0], 12, 12, 8, 8);
    const four = src.reads.length - before - one;
    assert.equal(four, 4);
    assert.ok(one <= 3, `${one} reads for one tile (the tile, plus the offset tables once)`);
  });

  it('walks several images (overviews), reads IFDs past the first 64 KB, and the GeoTIFF grid', async () => {
    const full = picture(32, 32, 8, false);
    const half = picture(16, 16, 8, false).map((v) => 255 - v);
    const file = writeTiff({
      big: true,
      padBefore: 70000,
      images: [
        { width: 32, height: 32, values: full, bits: 8, tile: [16, 16], compression: 5, geo: { west: 20, north: 60, dx: 0.25, dy: 0.125 }, noData: 255 },
        { width: 16, height: 16, values: half, bits: 8, tile: [16, 16], compression: 5 },
      ],
    });
    const tiff = await openTiff(memorySource(file));
    assert.equal(tiff.images.length, 2);
    assert.deepEqual(tiff.images[0].geo, { west: 20, north: 60, dx: 0.25, dy: -0.125 });
    // The overview has no tags of its own: its grid is the full image's, with bigger pixels.
    assert.deepEqual(tiff.images[1].geo, { west: 20, north: 60, dx: 0.5, dy: -0.25 });
    assert.equal(tiff.images[0].noData, 255);
    assert.deepEqual([...(await tiff.readWindow(tiff.images[1], 0, 0, 16, 16))], half);
    // Outside the image reads as the no-data value.
    assert.deepEqual([...(await tiff.readWindow(tiff.images[0], 31, 31, 2, 1))], [full[31 * 32 + 31], 255]);
  });

  it('refuses what it cannot read, with a clear message', async () => {
    await assert.rejects(openTiff(memorySource(new TextEncoder().encode('not a tiff at all'))), /not a TIFF/);
    const file = writeTiff({ images: [{ width: 4, height: 4, values: new Array(16).fill(1), bits: 8, compression: 1 }] });
    const tiff = await openTiff(memorySource(file));
    const img = { ...tiff.images[0], compression: 7 }; // JPEG
    await assert.rejects(tiff.readWindow(img, 0, 0, 4, 4), /unsupported compression 7/);
  });
});

describe('LZW', () => {
  it('decodes long input that fills the code table and clears it', () => {
    // Pseudo-random bytes (a fixed linear congruential sequence) fill the table fast.
    const data = new Uint8Array(50000);
    let s = 12345;
    for (let i = 0; i < data.length; i++) { s = (s * 1103515245 + 12345) >>> 0; data[i] = (s >>> 16) & 0x0f; }
    assert.deepEqual(lzwDecode(lzwEncode(data), data.length), data);
  });

  it('decodes the code that is being defined (the KwKwK case) and runs of one byte', () => {
    const data = new Uint8Array(3000).fill(65);
    assert.deepEqual(lzwDecode(lzwEncode(data), data.length), data);
    const abab = Uint8Array.from('ABABABA'.split('').map((c) => c.charCodeAt(0)));
    assert.deepEqual(lzwDecode(lzwEncode(abab), abab.length), abab);
  });
});

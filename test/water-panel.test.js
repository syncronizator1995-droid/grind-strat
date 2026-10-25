// @ts-check
// The tap panel sheet (src/ui/water-panel.js) on a tiny stand-in for the page: it writes the
// title and every part of the panel's text, and clears the old one. INVENTED names only.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { linkNames, panelInfo } from '../src/ui/map/names.js';
import { dated, info, water } from './fixtures/names-invented.js';

/** The least of a page element the panel uses. */
class Fake {
  /** @param {string} tag */
  constructor(tag) { this.tag = tag; this.textContent = ''; this.className = ''; this.scrollTop = 0; this.children = /** @type {any[]} */ ([]); }
  /** @param {...any} nodes */
  append(...nodes) { this.children.push(...nodes); }
  /** @param {...any} nodes */
  replaceChildren(...nodes) { this.children = nodes; }
  /** @returns {string} */
  all() { return `${this.textContent} ${this.children.map((c) => (c instanceof Fake ? c.all() : String(c.data ?? c))).join(' ')}`; }
}

describe('the water panel', () => {
  it('writes the name now, the names over time, today\'s and the facts, and replaces what was there', async () => {
    Object.assign(globalThis, { document: { createElement: (/** @type {string} */ t) => new Fake(t), createTextNode: (/** @type {string} */ data) => ({ data }) } });
    const { showWaterPanel } = await import('../src/ui/water-panel.js');
    const link = linkNames(info, water);
    const title = /** @type {any} */ (new Fake('h2'));
    const body = /** @type {any} */ (new Fake('div'));
    showWaterPanel(title, body, panelInfo({ link, water, hit: { kind: 'lake', lake: 0 }, year: 1219, dated }));
    assert.equal(title.textContent, 'Delta');
    const text = body.all();
    for (const part of ['Name now: Deltus', 'Names over time', "Deltus ('Mother of lakes')", 'Latin', 'Invented reservoir', "Today's name: Delta", 'From OpenStreetMap']) assert.ok(text.includes(part), part);
    showWaterPanel(title, body, panelInfo({ link, water, hit: { kind: 'sea', sea: 'main' }, year: 1219, dated }));
    assert.equal(title.textContent, 'Invented Sea');
    assert.ok(!body.all().includes('Deltus'));
  });
});

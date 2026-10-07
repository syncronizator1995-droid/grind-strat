// @ts-check
// The Credits sheet: what the map is (and is not), then every dataset and the font, with their
// licences written out as text. The words come from src/data/credits.json, which
// tools/map/attribution.mjs writes from tools/map/sources.json, the one place credits live.

/**
 * @typedef {import('../../tools/map/attribution.mjs').Credits} Credits
 * @typedef {import('../../tools/map/attribution.mjs').CreditEntry} CreditEntry
 */

/**
 * @param {keyof HTMLElementTagNameMap} tag @param {string} text @param {string} [className]
 */
function el(tag, text, className) {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
}

/** "Used for: ..." text: the uses joined, the first letter capitalised. @param {string[]} uses */
function usedFor(uses) {
  const text = uses.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** @param {CreditEntry} d */
function entry(d) {
  const nodes = [el('h3', d.title), el('p', d.line)];
  const facts = document.createElement('ul');
  for (const text of [
    `Used for: ${usedFor(d.uses)}.`,
    `By: ${d.owner}.`,
    `Version: ${d.version}.`,
    `Licence: ${d.licenceName}, ${d.licenceUri}`,
    `Cite as: ${d.citation}`,
    ...(d.changes.length === 1 ? [`What we changed: ${d.changes[0]}`] : []),
    ...(d.unofficialCopy ? [`Read from an unofficial copy: ${d.unofficialCopy}`] : []),
    ...d.notes,
  ]) facts.append(el('li', text, 'small'));
  // Several changes (Natural Earth's land, rivers and lakes): a list of their own, one per part.
  if (d.changes.length > 1) {
    const item = el('li', 'What we changed:', 'small');
    const list = document.createElement('ul');
    for (const c of d.changes) list.append(el('li', c, 'small'));
    item.append(list);
    facts.insertBefore(item, facts.children[5] ?? null);
  }
  nodes.push(facts);
  return nodes;
}

/**
 * Fills the sheet (once; the credits don't change while the game runs).
 * @param {HTMLElement} body
 * @param {Credits} credits
 */
export function showCredits(body, credits) {
  if (body.childElementCount) return;
  body.append(el('h3', 'About this map'));
  for (const line of credits.interim) body.append(el('p', line, 'interim'));
  const about = document.createElement('ul');
  for (const line of credits.about) about.append(el('li', line));
  body.append(about);
  body.append(el('p', 'All data is used as it is, with no warranty. No data provider endorses this game. Not for navigation.', 'small'));
  for (const d of credits.datasets) body.append(...entry(d));
  if (credits.odblOffer) {
    body.append(el('h3', 'Get the map data'), el('p', `The rivers and lakes from OpenStreetMap, as this game uses them, are free to download under the Open Database License: ${credits.odblOffer}.`));
  }
  body.append(...entry(credits.font));
}

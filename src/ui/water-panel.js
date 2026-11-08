// @ts-check
// The tap panel for a river, lake or sea: the name now, every name over time with its language,
// years and source, today's names, and dated facts. The words come from src/ui/map/names.js
// (panelInfo); this file only puts them on the sheet. Reuses the Credits sheet's style.

import { el } from './credits.js';

/** "Narva stretch", "Narva and Narova stretches", "A, B and C stretches". @param {string[]} names */
function stretchText(names) {
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `${list} ${names.length > 1 ? 'stretches' : 'stretch'}`;
}

/**
 * @param {HTMLElement} titleEl @param {HTMLElement} bodyEl
 * @param {import('./map/names.js').PanelInfo} info
 */
export function showWaterPanel(titleEl, bodyEl, info) {
  titleEl.textContent = info.title;
  bodyEl.replaceChildren();
  bodyEl.append(el('p', info.kind, 'small'), el('p', info.now));
  for (const m of info.nowMarks) bodyEl.append(el('p', `Mark: ${m}`, 'mark'));
  for (const section of info.over) {
    bodyEl.append(el('h3', section.heading));
    const list = document.createElement('ul');
    for (const r of section.rows) {
      const item = document.createElement('li');
      item.append(el('strong', r.name), document.createTextNode(` ${[r.years, r.language, r.source].filter(Boolean).join(' · ')}`));
      if (r.stretches) item.append(el('span', ` (on the ${stretchText(r.stretches)})`, 'mark'));
      if (r.marks.length) item.append(el('span', ` [${r.marks.join('; ')}]`, 'mark'));
      list.append(item);
    }
    bodyEl.append(list);
  }
  if (info.today.length) {
    bodyEl.append(el('h3', 'Today'));
    for (const line of info.today) bodyEl.append(el('p', line, line.startsWith('From ') ? 'mark' : ''));
  }
  if (info.facts.length) {
    bodyEl.append(el('h3', 'Facts'));
    const list = document.createElement('ul');
    for (const f of info.facts) list.append(el('li', f));
    bodyEl.append(list);
  }
  bodyEl.scrollTop = 0;
}

// @ts-check
// The note of an ice-age map (M3b): the sheet that opens when the banner is tapped. The words come
// from src/data/own/age-notes.json; every sentence shows the sources it rests on. Reuses the
// Credits sheet's style (text is 13 px or more, buttons are the sheet's 44 px ones).

import { el } from './credits.js';

/**
 * A short citation: "Saarse and Vassiljev 2010", "Lunkka and others 2019". An author line that is
 * not a list of "Surname, I." names (an encyclopedia, a news site) is used as it is.
 * @param {{ author: string, year: number }} s
 */
export function citation(s) {
  // Capitals with accents count too ("David, É.", "Påsse, T.").
  const names = [...s.author.matchAll(/(\p{Lu}[\p{L}'-]+),\s*(?:\p{Lu}\.[-\p{Lu}.]*\s*,?\s*)+/gu)].map((m) => m[1]);
  const who = names.length === 0 ? s.author : names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} and others`;
  return s.year ? `${who} ${s.year}` : who;
}

/**
 * What the sheet says, as plain data (the sheet only puts it on the page).
 * @param {import('./map/load.js').AgeNote} note
 * @param {import('./map/load.js').AgeNotes} notes
 * @param {boolean} hasData does the age have a map yet
 */
export function noteView(note, notes, hasData) {
  /** @param {string[]} ids */
  const cites = (ids) => ids.map((id) => notes.sources[id]).filter(Boolean).map((s) => `${citation(s)}: ${s.title}`);
  const used = [...new Set([...note.stage.sources, ...note.sentences.flatMap((s) => s.sources)])];
  return {
    title: note.title,
    lead: hasData
      ? 'Rough preview: a first draft from published studies, not exact.'
      : 'Rough preview. The map for this age is not built yet; the note below is.',
    sentences: note.sentences.map((s) => ({
      text: s.text,
      marks: (s.marks ?? []).map((m) => (m === 'TO CHECK' ? 'Not yet checked' : m === 'not yet confirmed' ? 'Not yet confirmed' : m)),
      from: cites(s.sources),
    })),
    water: `The water on this map is the ${note.stage.name}.`,
    waterFrom: cites(note.stage.sources),
    dates: 'Years are calendar years BC. "Converted by us (IntCal20)" marks dates we worked out from radiocarbon years with the standard IntCal20 curve. Heights say "now found N m up": where an old shore is found today, after the land rose. "The reservoir effect": the bones of people who ate much fish, and food burnt onto pots, can give radiocarbon dates that read too old.',
    sources: used.map((id) => cites([id])[0]),
  };
}

/**
 * @param {HTMLElement} titleEl @param {HTMLElement} bodyEl
 * @param {ReturnType<typeof noteView>} v
 */
export function showAgeNote(titleEl, bodyEl, v) {
  titleEl.textContent = v.title;
  bodyEl.replaceChildren(el('p', v.lead, 'small'));
  for (const s of v.sentences) {
    bodyEl.append(el('p', s.text));
    const line = [...s.marks.map((m) => `[${m}]`), s.from.length ? `From: ${s.from.map((f) => f.split(': ')[0]).join('; ')}` : ''].filter(Boolean).join(' ');
    if (line) bodyEl.append(el('p', line, 'mark'));
  }
  bodyEl.append(el('h3', 'The water'), el('p', v.water), el('h3', 'About the dates'), el('p', v.dates, 'small'), el('h3', 'Sources'));
  const list = document.createElement('ul');
  for (const c of v.sources) list.append(el('li', c, 'small'));
  bodyEl.append(list);
  bodyEl.scrollTop = 0;
}

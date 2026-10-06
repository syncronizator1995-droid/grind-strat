// @ts-check
// The plain-text notice each data block carries, made from the credits in
// tools/map/sources.json so the words live in one place.

import { rawSources } from './fetch.mjs';

/**
 * "Sources: <credit line> (<licence>); ..." for the given sources, with their notes.
 * @param {string[]} ids source ids
 */
export async function madeFrom(ids) {
  const all = await rawSources();
  const parts = [];
  const notes = new Set();
  const seen = new Set();
  for (const id of ids) {
    const s = all.find((x) => x.id === id);
    if (!s) throw new Error(`unknown source ${id} (not in tools/map/sources.json)`);
    // Sources from one collection (the three Natural Earth layers) share one credit.
    const line = `${s.credit.line.replace(/\.$/, '')} (${s.credit.licenceName}, ${s.credit.licenceUri})`;
    if (seen.has(line)) continue;
    seen.add(line);
    parts.push(line);
    for (const n of s.credit.notes ?? []) notes.add(n);
  }
  return `Sources: ${parts.join('; ')}.${notes.size ? ` ${[...notes].join(' ')}` : ''}`;
}

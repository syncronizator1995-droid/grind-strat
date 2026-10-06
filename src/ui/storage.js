// @ts-check
// Saves live in the browser's localStorage. Private windows, strict settings or a full phone can
// block it, so every use is wrapped: the game shows a message and carries on instead of crashing.

export const AUTOSAVE_KEY = 'grind-strat/autosave';
export const SAVE_KEY = 'grind-strat/save';

/** @typedef {{ ok: true, text: string | null } | { ok: false, error: string }} ReadResult */
/** @typedef {{ ok: true } | { ok: false, error: string }} WriteResult */

/**
 * @param {string} key
 * @returns {ReadResult}
 */
export function readText(key) {
  try {
    return { ok: true, text: window.localStorage.getItem(key) };
  } catch {
    return { ok: false, error: 'This browser blocks storage, so saves are off.' };
  }
}

/**
 * @param {string} key
 * @param {string} text
 * @returns {WriteResult}
 */
export function writeText(key, text) {
  try {
    window.localStorage.setItem(key, text);
    return { ok: true };
  } catch (err) {
    const full = err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
    return { ok: false, error: full ? 'the storage for this game is full' : 'this browser blocks storage' };
  }
}

/**
 * Asks the browser to keep the game's storage, so the phone doesn't clear saves to free space.
 * Browsers may say no; that's fine.
 */
export async function askToKeepStorage() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Not supported or refused: saves still work, they're just not protected.
  }
}

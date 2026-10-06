// @ts-check
// Lets the game install like an app, the same way as Ignas's Campfire and Cal Track apps:
// a web manifest, a service worker that keeps an offline copy, and an Install button.
// These pieces are separate files on the website (written by tools/build.mjs), so they are added
// only when the game is opened from the website. Opened as a plain file, the game skips them and
// plays the same.

/** The install files that sit next to the game on the website. The build checks this list. */
export const INSTALL_FILES = Object.freeze({
  manifest: 'manifest.webmanifest',
  serviceWorker: 'sw.js',
  icon: 'icon-192.png',
});

/**
 * The Chrome event that offers installing; not in TypeScript's DOM types yet.
 * @typedef {Event & { prompt: () => Promise<void>, userChoice: Promise<{ outcome: string }> }} InstallPromptEvent
 */

/**
 * @param {{ button: HTMLButtonElement, tell: (message: string) => void }} ui
 */
export function setUpInstall({ button, tell }) {
  if (!/^https?:$/.test(location.protocol)) return;

  addLink('manifest', INSTALL_FILES.manifest);
  addLink('apple-touch-icon', INSTALL_FILES.icon);

  if ('serviceWorker' in navigator) {
    const register = () => navigator.serviceWorker.register(INSTALL_FILES.serviceWorker).catch(() => {
      // No offline copy this time; the game still runs online.
    });
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }

  if (isStandalone()) return; // already installed and running as an app

  /** @type {InstallPromptEvent | null} */
  let offer = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    offer = /** @type {InstallPromptEvent} */ (e);
    button.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    button.hidden = true;
    tell('Installed. Grind Strat is on your home screen.');
  });

  // iPhones and iPads never offer install by themselves: show the button with a tip instead.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) button.hidden = false;

  button.addEventListener('click', async () => {
    if (offer) {
      const shown = offer;
      offer = null;
      await shown.prompt();
      const choice = await shown.userChoice;
      if (choice.outcome === 'accepted') button.hidden = true;
    } else if (ios) {
      tell('To install on iPhone or iPad: tap Share, then Add to Home Screen.');
    }
  });
}

/**
 * @param {string} rel
 * @param {string} href
 */
function addLink(rel, href) {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  document.head.append(link);
}

/** True when running from the home screen rather than in a browser tab. */
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || /** @type {any} */ (navigator).standalone === true;
}

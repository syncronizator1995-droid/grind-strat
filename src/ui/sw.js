// @ts-check
// Grind Strat's service worker: keeps a copy of the game on the phone so it opens with no signal.
// Same approach as Ignas's Campfire app. tools/build.mjs fills in BUILD with a hash of the game
// file, so each new build gets its own cache and replaces the old one.
//
// The game page loads NETWORK FIRST: online, you always get the newest version straight away;
// offline, the saved copy opens instead. Icons and the manifest load from the cache first.

const BUILD = '__BUILD__';
const PREFIX = 'grind-strat-';
const CACHE = PREFIX + BUILD;
const SHELL = [
  './', './index.html', './grind-strat.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
];

/** This file runs as a service worker; TypeScript's DOM types don't describe that, so use any. */
const sw = /** @type {any} */ (self);

sw.addEventListener('install', (/** @type {any} */ event) => {
  // Cache what exists one by one: a single missing file must not leave the app with no offline copy.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (/** @type {any} */ event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (/** @type {any} */ event) => {
  /** @type {Request} */
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  const isPage = request.mode === 'navigate' || request.destination === 'document';
  if (isPage) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html')))
        .then((response) => response || new Response('Grind Strat is offline and has no saved copy yet.', { status: 503 })),
    );
  } else {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});

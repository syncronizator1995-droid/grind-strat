// @ts-check
// Grind Strat's service worker: keeps a copy of the game on the phone so it opens with no signal.
// Same approach as Ignas's Campfire app. tools/build.mjs fills in BUILD with a hash of everything
// it publishes, so each new build gets its own cache and replaces the old one.
//
// The game page loads NETWORK FIRST: online, you get the newest version straight away; offline,
// or when the signal is too weak to answer within a few seconds, the saved copy opens instead.
// Icons and the manifest load from the cache first.
//
// A second copy of the game page is kept in IndexedDB. All of Ignas's GitHub Pages apps share one
// web address (syncronizator1995-droid.github.io), so they share Cache Storage, and Campfire's and
// Cal Track's service workers delete every cache but their own when they update. They leave
// IndexedDB alone, so the game still opens offline after they do.

const BUILD = '__BUILD__';
const PREFIX = 'grind-strat-';
const CACHE = PREFIX + BUILD;
/** The game itself: an update must download these, or it is refused and the old copy stays. */
const PAGE = ['./', './index.html'];
/** Nice to have offline, but the game plays without them. */
const EXTRAS = ['./grind-strat.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
/** How long to wait for the network before opening the saved copy. */
const PAGE_TIMEOUT_MS = 3000;
const DB_NAME = 'grind-strat-offline';
const DB_STORE = 'files';
const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' };

/** This file runs as a service worker; TypeScript's DOM types don't describe that, so use any. */
const sw = /** @type {any} */ (self);

/** @param {string} url fetched past the browser's own HTTP cache, so a new build is really new */
const fresh = (url) => new Request(url, { cache: 'reload' });

sw.addEventListener('install', (/** @type {any} */ event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // If the game page can't be downloaded (say the signal drops mid-update), this throws, the
    // install fails, and the old worker keeps its complete copy.
    await cache.addAll(PAGE.map(fresh));
    await Promise.all(EXTRAS.map((url) => cache.add(fresh(url)).catch(() => undefined)));
    const page = await cache.match('./index.html');
    if (page) await backUpPage(await page.text()).catch(() => undefined);
    await sw.skipWaiting();
  })());
});

sw.addEventListener('activate', (/** @type {any} */ event) => {
  // Delete only our own old caches: other apps on this address keep theirs.
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
  if (request.mode === 'navigate' || request.destination === 'document') {
    respondWithPage(event, request);
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

/**
 * Network first, with a time limit, falling back to the saved copies.
 * @param {any} event
 * @param {Request} request
 */
function respondWithPage(event, request) {
  /** @type {Promise<unknown>} */
  let saving = Promise.resolve();
  const network = fetch(request, { cache: 'no-cache' }).then((response) => {
    if (response.ok) {
      const forCache = response.clone();
      const forBackup = response.clone();
      saving = Promise.all([
        caches.open(CACHE).then((cache) => cache.put(request, forCache)),
        forBackup.text().then(backUpPage),
      ]);
    }
    return response;
  });
  // Keep the worker alive until the new copy is saved, even if the old one was shown first.
  event.waitUntil(network.then(() => saving, () => undefined).catch(() => undefined));

  event.respondWith(new Promise((resolve) => {
    let answered = false;
    /** @param {Response | undefined} response */
    const answer = (response) => {
      if (!answered && response) {
        answered = true;
        resolve(response);
      }
    };
    // Weak signal: after a few seconds, open the saved copy (if there is one) instead of waiting.
    const timer = setTimeout(() => savedPage(request).then(answer), PAGE_TIMEOUT_MS);
    network.then(
      (response) => {
        clearTimeout(timer);
        // A 404 or a server error must not hide a good saved copy.
        if (response.ok) answer(response);
        else savedPage(request).then((saved) => answer(saved || response));
      },
      () => {
        clearTimeout(timer);
        savedPage(request).then((saved) => answer(saved || new Response(
          'Grind Strat is offline and has no saved copy yet. Open it once with a signal.',
          { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
        )));
      },
    );
  }));
}

/**
 * The saved game page: from the cache, or else from the IndexedDB backup.
 * @param {Request} request
 * @returns {Promise<Response | undefined>}
 */
async function savedPage(request) {
  const hit = (await caches.match(request)) || (await caches.match('./index.html'));
  if (hit) return hit;
  const text = await readBackup().catch(() => undefined);
  return typeof text === 'string' ? new Response(text, { headers: HTML_HEADERS }) : undefined;
}

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @param {string} html */
async function backUpPage(html) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(html, 'page');
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** @returns {Promise<unknown>} */
async function readBackup() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE).objectStore(DB_STORE).get('page');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Service worker: an offline shell, and a permanent cache for the price data.
 *
 * The document itself is network-first. A stale cached price is exactly the
 * failure this project has refused to ship anywhere else (see the "Report
 * failure" step in catalogue-daily.yml), so a connected visitor must always
 * get the latest build; the cached copy exists purely so the app still opens
 * with no signal, not as a shortcut around fetching today's prices.
 *
 * The data is different, and cache-first. scripts/build-demo.ts publishes it
 * as data/<module>.<hash>.json, named for a hash of its own bytes
 * (scripts/dataFiles.ts), so a file of a given name can never change: the
 * latest document says which names today's prices are in, and any of those
 * already held here is today's data by construction. That is what makes a
 * repeat visit cost one small HTML request instead of the whole catalogue.
 * Whenever a newer document arrives, data files it no longer names are
 * dropped, so the cache holds one build's data (two, briefly) and no more.
 */
// v2: v1 held two copies of the old ~25 MB all-in-one page (under './' and
// './index.html'); renaming the cache is what gets activate to drop them.
const CACHE = 'pricesniffs-shell-v2';
const DATA_CACHE = 'pricesniffs-data-v1';
const SHELL = [
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
// Same shape as DATA_FILE_PATTERN in scripts/dataFiles.ts; tests/demoDataFiles
// holds the two together.
const DATA_FILE = /data\/[A-Za-z]+\.[0-9a-f]{16}\.json/g;

/** Absolute URLs of the data files a document names. */
function dataUrlsIn(html) {
  return [...new Set(html.match(DATA_FILE) || [])].map((path) => new URL(path, self.registration.scope).href);
}

/** Drops every cached data file the given document does not name. */
async function pruneData(html) {
  const wanted = new Set(dataUrlsIn(html));
  if (wanted.size === 0) return;
  const cache = await caches.open(DATA_CACHE);
  for (const request of await cache.keys()) {
    if (!wanted.has(request.url)) await cache.delete(request);
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const shell = await caches.open(CACHE);
      await shell.addAll(SHELL);
      // The page that registered this worker fetched its data a moment ago,
      // before there was a worker to see it, so it is in the HTTP cache: take
      // it from there, and the app opens offline after a single visit. Best
      // effort: the fetch handler below caches each file on first use anyway,
      // so a miss here must not cost the visitor the offline shell itself.
      try {
        const page = await shell.match('./index.html');
        if (page) await (await caches.open(DATA_CACHE)).addAll(dataUrlsIn(await page.text()));
      } catch (err) {
        console.warn('PriceSniffs: could not pre-cache price data', err);
      }
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== DATA_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          const text = response.clone();
          event.waitUntil(
            caches
              .open(CACHE)
              .then((cache) => cache.put('./index.html', copy))
              .then(() => text.text())
              .then(pruneData),
          );
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && /\/data\/[A-Za-z]+\.[0-9a-f]{16}\.json$/.test(url.pathname)) {
    event.respondWith(
      caches.open(DATA_CACHE).then((cache) =>
        cache.match(event.request).then(
          (cached) =>
            cached ??
            fetch(event.request).then((response) => {
              if (response.ok) event.waitUntil(cache.put(event.request, response.clone()));
              return response;
            }),
        ),
      ),
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});

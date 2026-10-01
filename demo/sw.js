/**
 * Minimal service worker: the entire app is one HTML document plus the
 * catalogue it loads, data.json, both with the day's prices baked in at build
 * time (see scripts/build-demo.ts and scripts/demoDataFile.ts), so there is no
 * API to cache — only the shell and that one data file.
 *
 * The document itself is network-first. A stale cached price is exactly the
 * failure this project has refused to ship anywhere else (see the "Report
 * failure" step in catalogue-daily.yml), so a connected visitor must always
 * get the latest build; the cache exists purely so the app still opens with
 * no signal, not as a shortcut around fetching today's prices.
 *
 * The data can be served from the cache first without breaking that rule,
 * because the page asks for it by version (`data.json?v=<version>`) and the
 * version is a hash of the data itself: a given URL only ever has one
 * possible content, and the page that names it came from the network. That
 * saves a returning visitor the 23MB download for as long as the prices have
 * not changed. Lookups use the full URL, version included, so a page can only
 * ever be paired with its own build's data: offline, a page whose data was
 * never cached fails to open rather than open on another build's prices. One
 * version is kept; caching a new one deletes the rest.
 */
const CACHE = 'pricesniffs-shell-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
/** How the page asks for its data. See readPageDataVersion() in scripts/demoDataFile.ts. */
const DATA_REQUEST = /data\.json\?v=[0-9a-f]{16}/;

function isData(url) {
  return new URL(url).pathname.endsWith('/data.json');
}

async function cacheData(request, response) {
  const cache = await caches.open(CACHE);
  const stale = (await cache.keys()).filter((key) => isData(key.url) && key.url !== request.url);
  await Promise.all(stale.map((key) => cache.delete(key)));
  await cache.put(request, response);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // The data the page just cached asks for, so the very first visit
      // already opens offline. Best effort: a failure here leaves the page
      // to cache its data the next time it loads it.
      try {
        const page = await cache.match('./index.html');
        const wanted = page && DATA_REQUEST.exec(await page.text());
        if (wanted) {
          const request = new Request(new URL(wanted[0], self.registration.scope));
          const response = await fetch(request);
          if (response.ok) await cacheData(request, response);
        }
      } catch {
        /* see above */
      }
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
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
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  if (isData(event.request.url)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ??
          fetch(event.request).then((response) => {
            if (response.ok) event.waitUntil(cacheData(event.request, response.clone()));
            return response;
          }),
      ),
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});

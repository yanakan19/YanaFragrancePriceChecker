/**
 * Minimal service worker: the entire app is one self-contained HTML document
 * with the day's prices baked in at build time (see scripts/build-demo.ts),
 * so there is no API to cache — only the shell.
 *
 * The document itself is network-first. A stale cached price is exactly the
 * failure this project has refused to ship anywhere else (see the "Report
 * failure" step in catalogue-daily.yml), so a connected visitor must always
 * get the latest build; the cache exists purely so the app still opens with
 * no signal, not as a shortcut around fetching today's prices.
 */
const CACHE = 'scentday-shell-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
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

  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});

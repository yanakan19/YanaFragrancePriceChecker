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
 * The price history, which the page only fetches once the app is running
 * (demo/priceHistoryStore.ts), is named in the document like the rest, so it
 * is pre-cached, served and pruned exactly the same way.
 *
 * One worker, at the site's root, serves every country: the UK at the root and
 * each other country under its own folder (/us/, /in/; src/config/regions.ts),
 * whose document names its own data files (us/data/<module>.<hash>.json). So
 * nothing a country's page shows can come from another's cache (owner rule,
 * 10 Oct 2026: Most Stocked, Deals and every count use the country's own shops
 * and prices only), each country keeps its own offline document
 * (`shellKey`), a document's data files are resolved inside its own folder,
 * and pruning after a newer document only lets go of that country's files.
 * Until then a visit to /us/ was stored as the UK's offline page (an offline
 * visitor at / was handed the US page) and its pruning dropped every UK file.
 */
// v2: v1 held two copies of the old ~25 MB all-in-one page (under './' and
// './index.html'); renaming the cache is what gets activate to drop them.
// v3 (10 Oct 2026): v2 could hold a US or Indian page as the UK's one offline
// page (see the header), which it served at a UK address whenever the network
// failed: a dropped connection after switching from /us/ to the UK showed the
// US Most Stocked rail and US shops at /. Renaming drops that copy for every
// visitor who has it.
const CACHE = 'pricesniffs-shell-v3';
const DATA_CACHE = 'pricesniffs-data-v1';
// The note icons under content-hashed names (scripts/noteData.ts): a redrawn
// icon is a new address, so a stored one never goes stale. Filled on first
// use, never at install, so installing costs what it did; scripts/noteData.ts
// carries the same pattern (HASHED_ICON_PATTERN).
const ICON_CACHE = 'pricesniffs-icons-v1';
const NOTE_ICON = /\/note-icons\/h\/[a-z0-9-]+\.[0-9a-f]{10}\.svg$/;
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
// The folders of the other countries' sites (src/config/regions.ts pathPrefix);
// tests/serviceWorker.test.ts holds the list to the config.
const REGION_PREFIXES = ['us', 'in'];
// A data file's path as a document names it, with its country's folder when it has one.
const REGION_DATA_FILE = new RegExp(`(?:\\b(${REGION_PREFIXES.join('|')})\\/)?${DATA_FILE.source}`, 'g');

/** The country an address inside the worker's scope belongs to: 'us', 'in', or '' for the UK. */
function regionOfUrl(href) {
  const scope = new URL(self.registration.scope).pathname;
  const path = new URL(href, self.registration.scope).pathname;
  const rest = path.startsWith(scope) ? path.slice(scope.length) : path.replace(/^\//, '');
  const first = rest.split('/')[0];
  return REGION_PREFIXES.includes(first) ? first : '';
}

/** The country a document was built for (the folder its data files sit in), or null when it names none. */
function regionOfDocument(html) {
  const found = [...html.matchAll(REGION_DATA_FILE)];
  return found.length === 0 ? null : (found[0][1] || '');
}

/** Where a country's offline document is kept. */
function shellKey(region) {
  return region ? `./${region}/index.html` : './index.html';
}

/** Absolute URLs of the data files a document names, each in its own country's folder. */
function dataUrlsIn(html) {
  return [...new Set([...html.matchAll(REGION_DATA_FILE)].map((m) => m[0]))].map((path) => new URL(path, self.registration.scope).href);
}

/** Drops every cached data file of the document's country that the document does not name; other countries' files stay. */
async function pruneData(html) {
  const region = regionOfDocument(html);
  const wanted = new Set(dataUrlsIn(html));
  if (region === null || wanted.size === 0) return;
  const cache = await caches.open(DATA_CACHE);
  for (const request of await cache.keys()) {
    if (regionOfUrl(request.url) === region && !wanted.has(request.url)) await cache.delete(request);
  }
}

/** The countries of the pages open now, so installing caches what they show and nothing else; the UK when none can be read. */
async function openRegions() {
  try {
    const windows = self.clients.matchAll ? await self.clients.matchAll({ type: 'window', includeUncontrolled: true }) : [];
    const regions = new Set(windows.map((c) => regionOfUrl(c.url)));
    return regions.size ? regions : new Set(['']);
  } catch {
    return new Set(['']);
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
      // Only the countries of the open pages: a US visitor's worker keeps the
      // US document and data, never fetches the UK's.
      try {
        for (const region of await openRegions()) {
          if (region) await shell.addAll([shellKey(region)]);
          const page = await shell.match(shellKey(region));
          if (page) await (await caches.open(DATA_CACHE)).addAll(dataUrlsIn(await page.text()));
        }
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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== DATA_CACHE && key !== ICON_CACHE).map((key) => caches.delete(key))))
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
          // Kept as the offline document of the country it was built for (the
          // UK's page answering a /us/ address it hands on stays the UK's).
          event.waitUntil(
            text.text().then((html) => {
              const region = regionOfDocument(html) ?? regionOfUrl(event.request.url);
              return caches
                .open(CACHE)
                .then((cache) => cache.put(shellKey(region), copy))
                .then(() => pruneData(html));
            }),
          );
          return response;
        })
        // Offline: this country's own document, never another country's.
        .catch(() => caches.match(shellKey(regionOfUrl(event.request.url)))),
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

  if (url.origin === self.location.origin && NOTE_ICON.test(url.pathname)) {
    event.respondWith(
      caches.open(ICON_CACHE).then((cache) =>
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

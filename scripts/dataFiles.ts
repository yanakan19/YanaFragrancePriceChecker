/**
 * The pure half of publishing the demo's data as separate, content-hashed
 * files: how a file is named, the loader the page runs to fetch them before
 * the app starts, and how a built page names the files it needs. Used by
 * scripts/bundle-demo.ts and scripts/build-demo.ts, and by the tests that hold
 * the built page, its data folder and demo/sw.js to one another.
 *
 * ── The contract ─────────────────────────────────────────────────────────────
 *   - Every file is `data/<module>.<hash>.json`, where <hash> is the first 16
 *     hex characters of the sha256 of its exact bytes. Same bytes, same name;
 *     different bytes, a different name. That is what lets the service worker
 *     treat any file it has seen as immutable (demo/sw.js), and what lets the
 *     build delete every file in demo/data it did not just write.
 *   - An eager file is a JSON array holding one module's moved literals, in
 *     order; the page is told the global index of each file's first entry.
 *   - The loader, inline in <head>, starts every eager fetch before the
 *     browser has parsed the rest of the document, and resolves READY_GLOBAL
 *     once all of them are in BLOBS_GLOBAL. The bundle (scripts/bundle-demo.ts's
 *     PRELUDE) reads `__psData(n)` as `BLOBS_GLOBAL[n]`, and is only run after
 *     that.
 *   - A lazy file (LAZY_DATA_MODULES) is not part of that: the app starts
 *     without it, and asks for it with `LAZY_GLOBAL(name)` when it needs it.
 *     It is a JSON object of the module's named data exports rather than an
 *     array, because the bundle does not import the module at all (it would
 *     have nothing to read at start-up), so there is no `__psData(n)` call
 *     site to number. Its path is still in the page, so the service worker
 *     pre-caches it and keeps it like any other data file.
 */
import { createHash } from 'node:crypto';

/** Global the loader fills and `__psData(n)` reads. */
export const BLOBS_GLOBAL = '__psBlobs';
/** Global promise the loader resolves once BLOBS_GLOBAL is complete. */
export const READY_GLOBAL = '__psReady';

/**
 * Function the loader defines: `__psLazy(name)` fetches the lazy data file of
 * that name and resolves with its parsed JSON. demo/priceHistoryStore.ts
 * carries a copy of the name; tests/priceHistoryLazy.test.ts pins the two.
 */
export const LAZY_GLOBAL = '__psLazy';

/**
 * Generated modules the app loads on demand rather than before it starts,
 * each with the exports that make up its data file. The bundle must not
 * import them (scripts/bundle-demo.ts refuses to build if it does), only
 * their types.
 *
 * priceHistory: ~6.6 MB of JSON (~425 KB gzipped) that only the product
 * page's price chart reads. Measured 2026-10-01 (npm run perf:load), it was a
 * quarter of the parse work standing between a first visit and its first
 * tiles. Nothing else reads it: deals rank by each shop's own reference
 * price, computed at build time by scripts/build-deals.ts.
 */
export const LAZY_DATA_MODULES: Record<string, readonly string[]> = {
  priceHistory: ['PRICE_HISTORY', 'PRICE_HISTORY_GAP'],
};

/** A lazy data file: its module name and its path relative to the site root. */
export interface LazyDataFile {
  name: string;
  path: string;
}

/** What scripts/bundle-demo.ts tells scripts/build-demo.ts, in dist-demo/data-files.json. */
export interface DataManifest {
  groups: DataGroup[];
  lazy: string[];
}

/** Where one generated module's moved literals sit in the global numbering. */
export interface DataGroup {
  /** Module basename without `.generated.js`, e.g. `catalogue`. */
  name: string;
  /** Global index of the module's first blob. */
  start: number;
  count: number;
}

/** A published file: its path relative to the site root, and its first blob. */
export interface DataFile {
  path: string;
  start: number;
}

/**
 * Set on <html> once the app has started. The window's `load` event no longer
 * means that: it fires once the document and its images are in, and a fetch
 * (the data) does not hold it back. Anything driving the page in a browser
 * (scripts/a11y-audit.ts's waitForApp, the screenshot scripts, the browser
 * tests) waits for this instead.
 */
export const APP_READY_ATTR = 'data-app-ready';

/** sessionStorage key that limits the stale-page reload in bootScript to one. */
const RELOAD_KEY = 'pricesniffs.dataReload';

/** Matches a published data file's path anywhere in a document. demo/sw.js carries a copy. */
export const DATA_FILE_PATTERN = /data\/[A-Za-z]+\.[0-9a-f]{16}\.json/g;

/** `data/<name>.<hash>.json` for these exact bytes. */
export function hashedDataPath(name: string, content: string | Buffer): string {
  if (!/^[A-Za-z]+$/.test(name)) throw new Error(`data file name "${name}" must be letters only`);
  return `data/${name}.${createHash('sha256').update(content).digest('hex').slice(0, 16)}.json`;
}

/**
 * The inline <head> script. Resolves each path against the app's base, never
 * the current URL: a deep link like /brands/lattafa is served this same
 * document through 404.html, and a relative `data/…` would resolve to
 * /brands/data/…, which the host answers with that HTML fallback. Same
 * derivation as basePath() in demo/router.ts and the service worker's
 * registration in demo/template.html; tests/demoDataFiles.test.ts pins all
 * three together.
 */
export function loaderScript(files: DataFile[], lazy: LazyDataFile[] = []): string {
  return `(function () {
  var files = ${JSON.stringify(files.map((f) => [f.path, f.start]))};
  var lazy = ${JSON.stringify(Object.fromEntries(lazy.map((f) => [f.name, f.path])))};
  var path = location.pathname;
  var idx = path.indexOf('/index.html');
  var base = idx >= 0 ? path.slice(0, idx + 1) : '/';
  // Parsing ~20 MB of JSON holds the main thread for a second or more on a
  // phone. From the service worker's cache the files can arrive before the
  // page has painted at all, and parsing them then leaves the screen blank
  // until the app is done. So parsing waits for the document to be parsed
  // and one frame to be drawn; on a first visit the network is slower than
  // that anyway, and this costs nothing. The timeout is for a tab opened in
  // the background, which draws no frames until it is shown.
  var painted = new Promise(function (resolve) {
    function frame() {
      requestAnimationFrame(function () { setTimeout(resolve, 0); });
      setTimeout(resolve, 200);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', frame);
    else frame();
  });
  // Data the app asks for once it needs it (LAZY_DATA_MODULES). Fetched from
  // the same base, and rejected with the status like the files above, so the
  // caller can tell a missing file from a dropped connection.
  window.${LAZY_GLOBAL} = function (name) {
    if (!Object.prototype.hasOwnProperty.call(lazy, name)) return Promise.reject(new Error('no lazy data file named ' + name));
    return fetch(base + lazy[name]).then(function (r) {
      if (!r.ok) {
        var err = new Error(lazy[name] + ': HTTP ' + r.status);
        err.status = r.status;
        throw err;
      }
      return r.json();
    });
  };
  window.${READY_GLOBAL} = Promise.all(files.map(function (f) {
    return fetch(base + f[0]).then(function (r) {
      if (!r.ok) {
        var err = new Error(f[0] + ': HTTP ' + r.status);
        err.status = r.status;
        throw err;
      }
      return painted.then(function () { return r.json(); });
    });
  })).then(function (parts) {
    var blobs = [];
    parts.forEach(function (part, k) {
      for (var j = 0; j < part.length; j++) blobs[files[k][1] + j] = part[j];
    });
    window.${BLOBS_GLOBAL} = blobs;
  });
})();`;
}

/**
 * The bundle, run once the loader has resolved. An exception thrown by the
 * app itself is re-thrown from a task of its own, so it surfaces as an
 * ordinary uncaught error rather than vanishing into a rejected promise.
 *
 * A 404 for a data file means this copy of the page is older than the site:
 * every build deletes the previous build's data, so a document the browser
 * kept from before a deploy names files the host no longer has. One reload
 * revalidates the document and fetches the one that names today's files;
 * sessionStorage stops that from ever becoming a loop. Anything else (offline
 * with nothing cached, or a second 404) says so in the page instead of
 * leaving it blank.
 */
export function bootScript(bundle: string): string {
  return `${READY_GLOBAL}.then(function () {
  try { sessionStorage.removeItem('${RELOAD_KEY}'); } catch (e) {}
  try {
${bundle}
    document.documentElement.setAttribute('${APP_READY_ATTR}', '');
  } catch (e) { setTimeout(function () { throw e; }); }
}, function (err) {
  var retried = true;
  try { retried = sessionStorage.getItem('${RELOAD_KEY}') === '1'; } catch (e) {}
  if (err && err.status === 404 && !retried) {
    try { sessionStorage.setItem('${RELOAD_KEY}', '1'); } catch (e) {}
    location.reload();
    return;
  }
  console.error('PriceSniffs could not load its price data', err);
  var view = document.getElementById('view');
  if (view) view.innerHTML = '<p role="alert" style="padding:24px 16px">Today\\u2019s prices could not be loaded. Check your connection, then <a href="">reload the page</a>.</p>';
});`;
}

/** The data files a built page fetches, in order, as paths relative to the site root. */
export function referencedDataFiles(html: string): string[] {
  return [...new Set(html.match(DATA_FILE_PATTERN) ?? [])];
}

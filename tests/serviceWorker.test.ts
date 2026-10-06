import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { basePath } from '../demo/router.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The inline `<script>` in demo/template.html that registers demo/sw.js. */
function registrationScript(): string {
  const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
  const blocks = [...template.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  const matches = blocks.filter((src) => src.includes('serviceWorker.register'));
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

/**
 * Runs that script against a stub window loaded at `pathname`, fires its load
 * handler, lets the app's data promise and an idle period pass, and returns
 * what it passed to navigator.serviceWorker.register.
 */
async function registerCall(
  pathname: string,
  opts: { ready?: Promise<void>; idle?: boolean } = {},
): Promise<{ script: string; options: unknown } & { order: string[] }> {
  const calls: Array<{ script: string; options: unknown }> = [];
  const order: string[] = [];
  const listeners: Array<() => void> = [];
  const timers: Array<() => void> = [];
  const window = {
    addEventListener: (type: string, fn: () => void) => { if (type === 'load') listeners.push(fn); },
    __psReady: opts.ready ?? Promise.resolve(),
    setTimeout: (fn: () => void, ms: number) => { order.push(`timeout ${ms}`); timers.push(fn); },
    ...(opts.idle === false ? {} : { requestIdleCallback: (fn: () => void) => { order.push('idle'); timers.push(fn); } }),
  };
  const navigator = { serviceWorker: { register: (script: string, options?: unknown) => { calls.push({ script, options }); } } };
  const location = { pathname };
  new Function('window', 'navigator', 'location', registrationScript())(window, navigator, location);
  expect(timers).toHaveLength(0);
  for (const fn of listeners) fn();
  // Not on `load` itself: after the data promise settles, then at idle.
  expect(calls).toHaveLength(0);
  await new Promise((r) => setTimeout(r, 0));
  expect(calls).toHaveLength(0);
  for (const fn of timers.splice(0)) fn();
  expect(calls).toHaveLength(1);
  return { ...calls[0]!, order };
}

/**
 * Checked 2026-10-01: the template registered a bare `'sw.js'`, which the
 * browser resolves against the current URL. Every in-app route is served the
 * same document through 404.html (scripts/build-demo.ts), so a visitor landing
 * on /brands/lattafa asked for /brands/sw.js, got that HTML fallback back, and
 * registration failed on the MIME type: the offline shell never installed for
 * anyone whose first page was two segments deep. One-segment routes and the
 * homepage happened to resolve to /sw.js and worked, which is why it went
 * unnoticed.
 *
 * The inline script cannot import basePath() from demo/router.ts (it runs
 * outside the bundle), so it carries its own copy of the derivation. These
 * tests run that copy and hold it to basePath() itself, so the worker always
 * sits at the same base the router routes under.
 */
describe('service worker registration', () => {
  const pathnames = [
    '/',
    '/about',
    '/about/legal',
    '/brands',
    '/brands/lattafa',
    '/fragrance/ean-5012345678900',
    '/creed_aventus_100ml',
    '/legal/privacy',
    '/index.html',
    '/YanaFragrancePriceChecker/index.html',
  ];

  for (const pathname of pathnames) {
    it(`registers the worker at the app's base from ${pathname}`, async () => {
      const { script, options } = await registerCall(pathname);
      expect(script).toBe(`${basePath(pathname)}sw.js`);
      expect(options).toEqual({ scope: basePath(pathname) });
    });
  }

  it('never registers relative to a deep route', async () => {
    /* The original failure, named outright rather than only implied by the
       basePath() comparison above. */
    expect((await registerCall('/brands/lattafa')).script).toBe('/sw.js');
    expect((await registerCall('/fragrance/ean-5012345678900')).script).toBe('/sw.js');
    // A product's own address, /BRAND_NAME_VOLUME (docs/PRODUCT-URLS.md): one
    // segment, so the base is the root, and no path based handling is needed in
    // the worker itself (a navigation is network first for any path, with the
    // cached index.html as the offline answer).
    expect((await registerCall('/creed_aventus_100ml')).script).toBe('/sw.js');
  });

  /* Installing the worker pre-caches every data file the page names, the
     on-demand price history included (demo/priceHistoryStore.ts), so it waits
     for the app to have started and for idle time rather than `load`, which
     fires before the data is in. */
  it('waits for the app to start, then for idle time', async () => {
    expect((await registerCall('/')).order).toEqual(['idle']);
  });

  it('falls back to a timeout without requestIdleCallback (Safari)', async () => {
    expect((await registerCall('/', { idle: false })).order).toEqual(['timeout 1000']);
  });

  it('still registers when the data failed to load, for the offline shell', async () => {
    const failed = Promise.reject(new Error('offline'));
    failed.catch(() => {});
    expect((await registerCall('/', { ready: failed })).script).toBe('/sw.js');
  });
});

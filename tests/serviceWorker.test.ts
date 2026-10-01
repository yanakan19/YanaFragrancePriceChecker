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
 * handler, and returns what it passed to navigator.serviceWorker.register.
 */
function registerCall(pathname: string): { script: string; options: unknown } {
  const calls: Array<{ script: string; options: unknown }> = [];
  const listeners: Array<() => void> = [];
  const window = { addEventListener: (type: string, fn: () => void) => { if (type === 'load') listeners.push(fn); } };
  const navigator = { serviceWorker: { register: (script: string, options?: unknown) => { calls.push({ script, options }); } } };
  const location = { pathname };
  new Function('window', 'navigator', 'location', registrationScript())(window, navigator, location);
  for (const fn of listeners) fn();
  expect(calls).toHaveLength(1);
  return calls[0]!;
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
    '/brands',
    '/brands/lattafa',
    '/fragrance/ean-5012345678900',
    '/legal/privacy',
    '/index.html',
    '/YanaFragrancePriceChecker/index.html',
  ];

  for (const pathname of pathnames) {
    it(`registers the worker at the app's base from ${pathname}`, () => {
      const { script, options } = registerCall(pathname);
      expect(script).toBe(`${basePath(pathname)}sw.js`);
      expect(options).toEqual({ scope: basePath(pathname) });
    });
  }

  it('never registers relative to a deep route', () => {
    /* The original failure, named outright rather than only implied by the
       basePath() comparison above. */
    expect(registerCall('/brands/lattafa').script).toBe('/sw.js');
    expect(registerCall('/fragrance/ean-5012345678900').script).toBe('/sw.js');
  });
});

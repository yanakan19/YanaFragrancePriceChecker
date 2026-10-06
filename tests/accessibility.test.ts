import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { auditRoute, launchChromium, startDemoServer } from '../scripts/a11y-audit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * axe-core against the built page, on one route of each kind, in both
 * palettes. This is the gate; scripts/a11y-audit.ts (`npm run a11y`) is the
 * wider sweep a person reads.
 *
 * Runs against demo/index.html as committed, the same document
 * tests/demoBuildFreshness.test.ts already requires to be current, so a
 * regression in demo/app.ts or demo/template.html that reaches the bundle
 * is caught here on the same `npx vitest run` that gates every commit and
 * every crawl. Every impact level is asserted, not only serious and
 * critical: the three findings the first sweep turned up (no level one
 * heading, the quick search outside any landmark, a scroll region with no
 * keyboard access) were all "moderate", and all three were real.
 *
 * Skipped, not failed, where the page has never been built — a fresh clone
 * before `npm run demo` — for the same reason the freshness test says so in
 * words: there is nothing to audit yet, and that is a different fact from
 * "the page is inaccessible".
 */
const built = existsSync(resolve(root, 'demo/index.html'));

const ROUTES = ['/', '/search', '/fragrance/ean-6290360375687', '/retailers/fragrance-click', '/about', '/about/legal', '/legal/how-it-works', '/account'];

describe.skipIf(!built)('the built page has no axe violations', () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = await launchChromium();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  // The home page again at the widths of a phone and a tablet, where the
  // full width scrolling banner is at its most cramped and its contrast
  // against the band is read against both palettes (owner, 2026-10-04).
  for (const mode of ['dark', 'light'] as const) {
    for (const width of [320, 390, 768]) {
      it(`/ at ${width}px wide (${mode})`, async () => {
        const violations = await auditRoute(browser, port, '/', mode, width);
        const summary = violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.slice(0, 3).join(' | ')}`).join('\n');
        expect(violations, summary).toEqual([]);
      }, 30_000);
    }
  }

  // The shortened About page and the Legal Notice at phone widths (owner's
  // revamp, 2026-10-06): nothing may overflow or lose contrast on a 320 screen.
  for (const mode of ['dark', 'light'] as const) {
    for (const route of ['/about', '/about/legal']) {
      for (const width of [320, 390]) {
        it(`${route} at ${width}px wide (${mode})`, async () => {
          const violations = await auditRoute(browser, port, route, mode, width);
          const summary = violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.slice(0, 3).join(' | ')}`).join('\n');
          expect(violations, summary).toEqual([]);
        }, 30_000);
      }
    }
  }

  for (const mode of ['dark', 'light'] as const) {
    for (const route of ROUTES) {
      it(`${route} (${mode})`, async () => {
        const violations = await auditRoute(browser, port, route, mode);
        const summary = violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.slice(0, 3).join(' | ')}`).join('\n');
        expect(violations, summary).toEqual([]);
      }, 30_000);
    }
  }
});

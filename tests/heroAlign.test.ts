import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { compactDeliveryLine } from '../demo/deliveryFacts.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * Owner request, 6 Oct 2026: on every brand and shop page the logo is a
 * square whose top edge is flush with the top of the heading and whose bottom
 * edge is flush with the bottom of the last line of the heading block (the
 * official site button on a brand, the domain on a shop). Measured on the
 * built page with bounding boxes, at 320, 390 and 1280, in both palettes.
 *
 * Where a very narrow phone has no room for a square beside a long name and
 * the button (the page then stacks the logo above the text, .org-hero--stack),
 * only "it is a square" is asserted, since no side by side edge exists.
 */
const ROUTES = [
  '/brands/yves-saint-laurent', // wordmark logo
  '/brands/tom-ford', // wordmark brand
  '/brands/versace', // square logo brand
  '/brands/sol-de-janeiro', // no logo, initials tile
  '/retailers/allbeauty', // shop with a logo
  '/retailers/fragrance-click', // shop without one
];

describe.skipIf(!built)('hero logos line up with their text', () => {
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

  for (const width of [320, 390, 1280]) {
    for (const mode of ['light', 'dark'] as const) {
      it(`at ${width}px, ${mode}`, async () => {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        await context.addInitScript((m: string) => {
          try { localStorage.setItem('pricesniffs.display', m); } catch { /* fine */ }
        }, mode);
        try {
          for (const route of ROUTES) {
            const page = await context.newPage();
            await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
            await waitForApp(page);
            await page.waitForSelector('.org-hero', { timeout: 20_000 });
            await page.waitForTimeout(400);
            const m = await page.evaluate(() => {
              const hero = document.querySelector('.org-hero') as HTMLElement;
              const logo = hero.querySelector(':scope > .org-mark, :scope > .monogram')!.getBoundingClientRect();
              const h1 = hero.querySelector('h1')!.getBoundingClientRect();
              const last = hero.querySelector('.org-hero-head')!.lastElementChild!.getBoundingClientRect();
              return {
                stacked: hero.classList.contains('org-hero--stack'),
                logo: { top: logo.top, bottom: logo.bottom, w: logo.width, h: logo.height },
                top: h1.top,
                bottom: last.bottom,
                doc: document.documentElement.scrollWidth,
              };
            });
            const where = `${route} @${width} ${mode}`;
            expect(Math.abs(m.logo.w - m.logo.h), `square ${where}`).toBeLessThanOrEqual(1);
            expect(m.doc, `no sideways scroll ${where}`).toBeLessThanOrEqual(width);
            if (!m.stacked) {
              expect(Math.abs(m.logo.top - m.top), `top ${where}`).toBeLessThanOrEqual(1);
              expect(Math.abs(m.logo.bottom - m.bottom), `bottom ${where}`).toBeLessThanOrEqual(1);
            }
            if (width >= 390) expect(m.stacked, `side by side ${where}`).toBe(false);
            await page.close();
          }
        } finally {
          await context.close();
        }
      }, 120_000);
    }
  }
});

describe('compactDeliveryLine', () => {
  it('shortens the repeated wording and leaves other lines alone', () => {
    expect(compactDeliveryLine('Read from this shop’s own delivery page on 1 October 2026')).toBe('Read from its delivery page on 1 October 2026');
    expect(compactDeliveryLine('Free standard delivery on every order')).toBe('Free standard delivery on every order');
  });
});

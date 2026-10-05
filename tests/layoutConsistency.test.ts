import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { devices, webkit, type Browser, type BrowserContextOptions, type Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The layout rules every page has to keep, checked on the built page as
 * committed, the way tests/accessibility.test.ts is.
 *
 * Written after a layout audit on 2026-10-01 found, on a phone: every text
 * field and dropdown at 15px (iPhone Safari zooms the whole page in when a
 * field under 16px is tapped), the controls row side by side on some list
 * pages and stacked at three different widths on others, a filter panel
 * 950-1,500px tall, and a product page 2px wider than the screen, so it
 * wiggled sideways.
 *
 * Runs in Chromium here and in every crawl. `LAYOUT_BROWSER=webkit` runs the
 * same checks in WebKit, the engine inside Safari, with iPhone settings; the
 * "Layout check (Safari engine)" workflow does that on GitHub, where WebKit
 * can be installed.
 */
const built = existsSync(resolve(root, 'demo/index.html'));
const engine = process.env.LAYOUT_BROWSER === 'webkit' ? 'webkit' : 'chromium';

const LIST_PAGES = ['/search', '/deals', '/brands/lattafa', '/retailers/fragrance-click', '/notes/vanilla'];
const OTHER_PAGES = ['/', '/brands', '/notes', '/retailers', '/fragrance/ean-6290360375687', '/settings', '/suggestions', '/account', '/legal/privacy'];

const CONTEXTS: Record<'phone' | 'desktop', BrowserContextOptions> =
  engine === 'webkit'
    ? { phone: devices['iPhone 13']!, desktop: devices['Desktop Safari']! }
    : {
        phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
        desktop: { viewport: { width: 1366, height: 900 } },
      };

interface Measured {
  overflow: number;
  smallFields: string[];
  row: { first: string; second: string; x: number[]; widths: number[] } | null;
}

/**
 * Move to a route inside the already-loaded app, the way a reader's own
 * navigation does, rather than reloading: the page is one large document, and
 * re-parsing it for every route made this test take minutes.
 */
async function visit(page: Page, route: string): Promise<void> {
  await page.evaluate(`(() => {
    history.pushState(null, '', ${JSON.stringify(route)});
    dispatchEvent(new PopStateEvent('popstate', { state: null }));
  })()`);
}

async function measure(page: Page, viewportWidth: number): Promise<Measured> {
  // A string, not a function: the test runner's transform adds helpers to
  // named functions that do not exist inside the page.
  return page.evaluate(`(() => {
    const vw = ${viewportWidth};
    const smallFields = [...document.querySelectorAll('select, textarea, input')]
      .filter((el) => el.type !== 'checkbox' && el.type !== 'radio' && el.offsetParent !== null)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => (el.id || el.className) + ' ' + getComputedStyle(el).fontSize);
    const row = document.querySelector('#view .controls');
    const cells = row ? [...row.children] : [];
    const kind = (el) => !el ? 'none' : el.matches('[data-facets-toggle]') ? 'filters' : el.querySelector('select') ? 'select' : el.tagName.toLowerCase();
    return {
      overflow: document.documentElement.scrollWidth - vw,
      smallFields,
      row: row ? {
        first: kind(cells[0]), second: kind(cells[1]),
        x: cells.slice(0, 2).map((c) => Math.round(c.getBoundingClientRect().left)),
        widths: cells.slice(0, 2).map((c) => Math.round(c.getBoundingClientRect().width)),
      } : null,
    };
  })()`) as Promise<Measured>;
}

describe.skipIf(!built)(`page layout holds its rules (${engine})`, () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = engine === 'webkit' ? await webkit.launch() : await launchChromium();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  for (const size of ['phone', 'desktop'] as const) {
    it(`${size}: no page scrolls sideways, and no field is small enough for iPhone to zoom into`, async () => {
      const ctx = await browser.newContext({ ...CONTEXTS[size], reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const width = CONTEXTS[size].viewport!.width;
      const problems: string[] = [];
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      await waitForApp(page);
      for (const route of [...LIST_PAGES, ...OTHER_PAGES]) {
        await visit(page, route);
        const m = await measure(page, width);
        if (m.overflow > 0) problems.push(`${route}: ${m.overflow}px wider than the screen`);
        for (const f of m.smallFields) problems.push(`${route}: field under 16px (${f})`);
      }
      await ctx.close();
      expect(problems).toEqual([]);
    }, 90_000);

    it(`${size}: every fragrance list has the same controls row, in the same place, with native filters`, async () => {
      const ctx = await browser.newContext({ ...CONTEXTS[size], reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const rows: Record<string, Measured['row']> = {};
      const panels: Record<string, { height: number; nonNative: number }> = {};
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      await waitForApp(page);
      for (const route of LIST_PAGES) {
        await visit(page, route);
        rows[route] = (await measure(page, CONTEXTS[size].viewport!.width)).row;
        await page.click('[data-facets-toggle]');
        panels[route] = (await page.evaluate(`(() => {
          const panel = document.querySelector('.facets-panel');
          const controls = panel ? [...panel.querySelectorAll('.facet-grid > *')] : [];
          return {
            height: panel ? Math.round(panel.getBoundingClientRect().height) : -1,
            nonNative: controls.filter((c) => !c.querySelector('select, input[type=checkbox]')).length,
          };
        })()`)) as { height: number; nonNative: number };
      }
      await ctx.close();

      for (const [route, row] of Object.entries(rows)) {
        expect(row, route).not.toBeNull();
        expect([row!.first, row!.second], route).toEqual(['select', 'filters']);
      }
      // Same cells at the same place on every list page, to the pixel.
      const first = rows[LIST_PAGES[0]!]!;
      for (const route of LIST_PAGES) {
        expect({ x: rows[route]!.x, widths: rows[route]!.widths }, route).toEqual({ x: first.x, widths: first.widths });
      }
      for (const [route, p] of Object.entries(panels)) {
        expect(p.nonNative, `${route}: a filter that is not a native dropdown or checkbox`).toBe(0);
        // The pill panel this replaced ran to 950-1,500px on a phone.
        expect(p.height, `${route}: filter panel height`).toBeGreaterThan(0);
        expect(p.height, `${route}: filter panel height`).toBeLessThan(size === 'phone' ? 600 : 300);
      }
    }, 90_000);
  }
});

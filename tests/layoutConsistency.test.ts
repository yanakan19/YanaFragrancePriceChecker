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

const LIST_PAGES = ['/search', '/deals', '/brands/lattafa', '/retailers/fragrance-click', '/notes/vanilla', '/sets', '/oils'];
const OTHER_PAGES = ['/', '/brands', '/notes', '/retailers', '/fragrance/ean-6290360375687', '/settings', '/suggestions', '/account', '/legal/privacy'];

const CONTEXTS: Record<'phone' | 'desktop', BrowserContextOptions> =
  engine === 'webkit'
    ? { phone: devices['iPhone 13']!, desktop: devices['Desktop Safari']! }
    : {
        phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
        desktop: { viewport: { width: 1366, height: 900 } },
      };

interface Panel {
  fits: boolean;
  options: number;
  notCheckbox: number;
  smallTargets: string[];
  smallFields: number;
  sideways: number;
  pageHeld: boolean;
  focusBack: boolean;
}

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

    it(`${size}: every fragrance list has the same controls row, in the same place, and a Filters panel of real checkboxes that fits the screen`, async () => {
      const ctx = await browser.newContext({ ...CONTEXTS[size], reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const rows: Record<string, Measured['row']> = {};
      const panels: Record<string, Panel> = {};
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      await waitForApp(page);
      for (const route of LIST_PAGES) {
        await visit(page, route);
        rows[route] = (await measure(page, CONTEXTS[size].viewport!.width)).row;
        await page.click('#view [data-facets-toggle]');
        await page.waitForSelector('#ps-filters[open]');
        // A shut group of the panel is opened too, so its rows are measured.
        await page.click('#ps-filters .fs-group:not([open]) > summary').catch(() => undefined);
        panels[route] = (await page.evaluate(`(() => {
          const d = document.getElementById('ps-filters');
          const r = d.getBoundingClientRect();
          const body = d.querySelector('.fs-body');
          const opts = [...d.querySelectorAll('.fs-opt')].filter((o) => o.offsetParent !== null);
          const fields = [...d.querySelectorAll('input, select, textarea')].filter((el) => el.offsetParent !== null);
          return {
            fits: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.height > 100,
            options: opts.length,
            notCheckbox: opts.filter((o) => !o.querySelector('input[type=checkbox]')).length,
            smallTargets: opts.filter((o) => o.getBoundingClientRect().height < 44).map((o) => o.textContent.trim().slice(0, 30)),
            smallFields: fields.filter((el) => el.type !== 'checkbox' && parseFloat(getComputedStyle(el).fontSize) < 16).length,
            sideways: body.scrollWidth - body.clientWidth,
            pageHeld: getComputedStyle(document.documentElement).overflowY === 'hidden',
          };
        })()`)) as Panel;
        await page.keyboard.press('Escape');
        await page.waitForFunction(`!document.getElementById('ps-filters').open`);
        panels[route]!.focusBack = (await page.evaluate(`!!document.activeElement && document.activeElement.matches('#view [data-facets-toggle]')`)) as boolean;
      }
      await ctx.close();

      for (const [route, row] of Object.entries(rows)) {
        expect(row, route).not.toBeNull();
        expect([row!.first, row!.second], route).toEqual(['select', 'filters']);
      }
      // Same cells at the same place on every list page, to the pixel. The Oils
      // and Sets tabs have a search box above the row, so only its cells' widths
      // and left edges are compared.
      const first = rows[LIST_PAGES[0]!]!;
      for (const route of LIST_PAGES) {
        expect({ x: rows[route]!.x, widths: rows[route]!.widths }, route).toEqual({ x: first.x, widths: first.widths });
      }
      for (const [route, p] of Object.entries(panels)) {
        expect(p.fits, `${route}: the panel is on screen, whole`).toBe(true);
        expect(p.options, `${route}: options in the panel`).toBeGreaterThan(0);
        expect(p.notCheckbox, `${route}: an option that is not a real checkbox`).toBe(0);
        expect(p.smallTargets, `${route}: an option under 44px tall`).toEqual([]);
        expect(p.smallFields, `${route}: a field small enough for iPhone to zoom into`).toBe(0);
        expect(p.sideways, `${route}: the panel scrolls sideways`).toBeLessThanOrEqual(0);
        expect(p.pageHeld, `${route}: the page behind holds still`).toBe(true);
        expect(p.focusBack, `${route}: Escape puts focus back on the Filters button`).toBe(true);
      }
    }, 120_000);
  }
});

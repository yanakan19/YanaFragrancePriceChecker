import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { devices, type Browser, type BrowserContextOptions, type Page } from 'playwright';
import { launchChromium, launchWebkit, startDemoServer, waitForApp, type LaunchOptions } from '../scripts/a11y-audit.js';

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
 *
 * Both engines start the way a returning visitor does, with the UK saved as
 * their country (launchChromium, launchWebkit: scripts/a11y-audit.ts). Since
 * the public beta of 9 October 2026 the bare home page asks a visitor who has
 * chosen none with the modal "Select your country" pop-up, which sits over
 * the page and takes every click. The WebKit half launched with a bare
 * `webkit.launch()`, so the pop-up covered the Filters button and the check
 * failed on every run from 9 October (workflow runs 95 to 97). The pop-up
 * itself has a check of its own below, for a visitor who has chosen none.
 *
 * Motion is switched off in every context (`reducedMotion: 'reduce'`): a
 * layout rule is about where things sit, not where they are part way through
 * fading in (docs/UX-POLISH-PLAN.md, section 4).
 */
const built = existsSync(resolve(root, 'demo/index.html'));
const engine = process.env.LAYOUT_BROWSER === 'webkit' ? 'webkit' : 'chromium';

const LIST_PAGES = ['/search', '/deals', '/brands/lattafa', '/retailers/fragrance-click', '/notes/vanilla', '/sets', '/oils'];
const OTHER_PAGES = ['/', '/brands', '/notes', '/retailers', '/fragrance/ean-6290360375687', '/settings', '/suggestions', '/account', '/about', '/about/legal'];

const CONTEXTS: Record<'narrow' | 'phone' | 'desktop', BrowserContextOptions> =
  engine === 'webkit'
    ? { narrow: devices['iPhone SE']!, phone: devices['iPhone 13']!, desktop: devices['Desktop Safari']! }
    : {
        narrow: { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true },
        phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
        desktop: { viewport: { width: 1366, height: 900 } },
      };

const launch = (options: LaunchOptions = {}): Promise<Browser> => (engine === 'webkit' ? launchWebkit(options) : launchChromium(options));

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
    browser = await launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  // The narrowest iPhone is in this one: the page must not scroll sideways at 320.
  for (const size of ['narrow', 'phone', 'desktop'] as const) {
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

    it(`${size}: a visitor who has chosen no country gets the Select your country pop-up whole on the screen, and Escape puts it away`, async () => {
      // A browser of its own: the shared one starts every visitor with the UK saved.
      const fresh = await launch({ countryChosen: null });
      try {
        const ctx = await fresh.newContext({ ...CONTEXTS[size], reducedMotion: 'reduce', timezoneId: 'America/New_York' });
        const page = await ctx.newPage();
        await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
        await waitForApp(page);
        await page.waitForSelector('#region-welcome[open]', { timeout: 15_000 });
        const d = (await page.evaluate(`(() => {
          const dlg = document.getElementById('region-welcome');
          const r = dlg.getBoundingClientRect();
          const choices = [...dlg.querySelectorAll('[data-region-choice]')];
          const clipped = [dlg, ...dlg.querySelectorAll('.region-welcome-body, .region-welcome-list, [data-region-choice], .region-welcome-text, .region-welcome-login')]
            .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
            .map((el) => el.className || el.tagName);
          return {
            modal: dlg.matches(':modal'),
            fits: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.height > 100,
            width: Math.round(r.width),
            choices: choices.length,
            smallChoices: choices.filter((a) => a.getBoundingClientRect().height < 44).length,
            smallClose: dlg.querySelector('[data-region-welcome-close]').getBoundingClientRect().width < 44,
            clipped,
            sideways: document.documentElement.scrollWidth - innerWidth,
          };
        })()`)) as { modal: boolean; fits: boolean; width: number; choices: number; smallChoices: number; smallClose: boolean; clipped: string[]; sideways: number };
        expect(d.modal, 'a real modal dialog').toBe(true);
        expect(d.fits, 'the pop-up is on screen, whole').toBe(true);
        expect(d.width, 'a small card, not a full screen interstitial').toBeLessThanOrEqual(400);
        expect(d.choices, 'one choice for each live country').toBeGreaterThanOrEqual(2);
        expect(d.smallChoices, 'a choice under 44px tall').toBe(0);
        expect(d.smallClose, 'the close button under 44px wide').toBe(false);
        expect(d.clipped, 'text clipped or spilling out of the pop-up').toEqual([]);
        expect(d.sideways, 'the page scrolls sideways behind the pop-up').toBeLessThanOrEqual(0);
        await page.keyboard.press('Escape');
        await page.waitForFunction(`!document.getElementById('region-welcome')`, null, { timeout: 5_000 });
        // Put away, nothing modal is left over the page.
        expect(await page.evaluate(`document.querySelectorAll('dialog[open]').length`), 'a dialog still open over the page').toBe(0);
        await ctx.close();
      } finally {
        await fresh.close();
      }
    }, 90_000);
  }

  for (const size of ['phone', 'desktop'] as const) {
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
        // The dialog's close event, which puts focus back, comes a task after it shuts.
        panels[route]!.focusBack = await page
          .waitForFunction(`!!document.activeElement && document.activeElement.matches('#view [data-facets-toggle]')`, null, { timeout: 2000 })
          .then(() => true, () => false);
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

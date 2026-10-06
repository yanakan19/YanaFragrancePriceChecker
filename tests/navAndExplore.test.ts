import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The owner's requests of 2026-10-03, checked on the built page:
 *   - the top bar says "Deals", not "Today's Deals", and /deals still works;
 *   - the bar search reads "Quick Search";
 *   - Brands, Retailers and Notes carry no search box of their own (no Search
 *     tab, no field): the Quick Search in the top bar is the one. Oils and Sets
 *     (owner's decision, 2026-10-05) each search only within themselves;
 *   - the "Got an Idea?" section is gone from the home page (owner's decision,
 *     2026-10-04): it is Suggestions in the account menu now, see
 *     tests/suggestions.test.ts.
 */
async function visit(page: Page, route: string): Promise<void> {
  await page.evaluate(`(() => {
    history.pushState(null, '', ${JSON.stringify(route)});
    dispatchEvent(new PopStateEvent('popstate', { state: null }));
  })()`);
}

describe.skipIf(!built)('top bar, Explore and the home page bottom', () => {
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

  it('labels the deals page "Deals" in the bar and on the page, and keeps /deals', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://localhost:${port}/deals`, { waitUntil: 'load' });
    await waitForApp(page);
    expect((await page.textContent('#nav-deals'))?.trim()).toBe('Deals');
    expect(await page.getAttribute('#search', 'placeholder')).toBe('Quick Search');
    expect((await page.textContent('#view h1'))?.trim()).toBe('Deals');
    expect(await page.title()).toBe('PriceSniffs: Deals');
    expect(await page.$eval('#nav-deals', (el) => el.classList.contains('on'))).toBe(true);
    await page.close();
  }, 90_000);

  it('has no search box under Brands, Retailers or Notes, only the Quick Search in the top bar; Fragrances, Oils and Sets have their own', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://localhost:${port}/brands`, { waitUntil: 'load' });
    await waitForApp(page);
    const found: Record<string, { tabs: string[]; fields: number; searchInputs: number }> = {};
    for (const route of ['/fragrances', '/brands', '/retailers', '/notes', '/oils', '/sets']) {
      await visit(page, route);
      found[route] = (await page.evaluate(`(() => ({
        tabs: [...document.querySelectorAll('#subnav [data-tab]')].map((b) => b.textContent.trim()),
        fields: document.querySelectorAll('#view input[type=search], #view input[type=text], #search-full').length,
        searchInputs: document.querySelectorAll('input[type=search]').length,
      }))()`)) as { tabs: string[]; fields: number; searchInputs: number };
    }
    for (const [route, f] of Object.entries(found)) {
      expect(f.tabs, route).toEqual(['All Fragrances', 'All Oils', 'All Sets', 'All Brands', 'All Retailers', 'All Notes']);
      // All Fragrances, Oils and Sets each have a search box of their own, searching only within
      // that tab (owner's decision, 2026-10-05); the other three have none.
      const own = route === '/oils' || route === '/sets' || route === '/fragrances' ? 1 : 0;
      expect(f.fields, route).toBe(own);
      expect(f.searchInputs, `${route}: the top bar search${own ? ' and the tab\'s own' : ' only'}`).toBe(1 + own);
    }
    await page.close();
  }, 90_000);

  it('has no "Got an Idea?" section on the home page, and ends with Update History', async () => {
    for (const width of [390, 1366]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      await waitForApp(page);
      const r = (await page.evaluate(`(() => {
        const sections = [...document.querySelectorAll('#view section')];
        const lowest = sections.reduce((a, b) => (b.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? b : a));
        return {
          lowest: lowest.className,
          headings: [...document.querySelectorAll('#view h1, #view h2, #view h3')].map((h) => h.textContent.trim()),
          form: document.querySelectorAll('#view form, #view textarea').length,
          suggestSection: document.querySelectorAll('.suggest-section').length,
        };
      })()`)) as { lowest: string; headings: string[]; form: number; suggestSection: number };
      // The update history may still mention the old section by name; no heading does.
      expect(r.headings.join('|'), String(width)).not.toMatch(/Got an Idea/i);
      expect(r.suggestSection, String(width)).toBe(0);
      expect(r.form, `${width}: no form on the home page`).toBe(0);
      expect(r.lowest, String(width)).toContain('updates-section');
      await page.close();
    }
  }, 90_000);
});

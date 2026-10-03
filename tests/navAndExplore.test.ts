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
 *   - Explore carries no search box of its own (no Search tab, no field on
 *     Brands, Retailers or Notes): the Quick Search in the top bar is the one;
 *   - on a phone, "Got an idea?" is the last section of the home page, and on
 *     desktop it keeps the left column beside Update History.
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

  it('has no search box under Explore, only the Quick Search in the top bar', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://localhost:${port}/brands`, { waitUntil: 'load' });
    await waitForApp(page);
    const found: Record<string, { tabs: string[]; fields: number; searchInputs: number }> = {};
    for (const route of ['/brands', '/retailers', '/notes']) {
      await visit(page, route);
      found[route] = (await page.evaluate(`(() => ({
        tabs: [...document.querySelectorAll('#subnav [data-tab]')].map((b) => b.textContent.trim()),
        fields: document.querySelectorAll('#view input[type=search], #view input[type=text], #search-full').length,
        searchInputs: document.querySelectorAll('input[type=search]').length,
      }))()`)) as { tabs: string[]; fields: number; searchInputs: number };
    }
    for (const [route, f] of Object.entries(found)) {
      expect(f.tabs, route).toEqual(['Brands', 'Retailers', 'Notes']);
      expect(f.fields, route).toBe(0);
      expect(f.searchInputs, `${route}: only the top bar search`).toBe(1);
    }
    await page.close();
  }, 90_000);

  it('puts "Got an idea?" last on a phone and keeps it on the left on desktop', async () => {
    const where = async (width: number) => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      await waitForApp(page);
      const r = (await page.evaluate(`(() => {
        const sections = [...document.querySelectorAll('#view section')];
        const lowest = sections.reduce((a, b) => (b.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? b : a));
        const idea = document.querySelector('.suggest-section').getBoundingClientRect();
        const updates = document.querySelector('.updates-section').getBoundingClientRect();
        return { lowest: lowest.className, ideaLeft: idea.left, updatesLeft: updates.left };
      })()`)) as { lowest: string; ideaLeft: number; updatesLeft: number };
      await page.close();
      return r;
    };
    expect((await where(390)).lowest).toContain('suggest-section');
    const desktop = await where(1366);
    expect(desktop.ideaLeft).toBeLessThan(desktop.updatesLeft);
  }, 90_000);
});

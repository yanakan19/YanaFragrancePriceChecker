import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { RETAILERS } from '../src/config/retailers.js';
import { REGION_RETAILERS } from '../src/config/regionRetailers.js';
import { stubSupabase } from './support/fakeAccount.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = ['index.html', 'us/index.html', 'in/index.html', 'ca/index.html'].every((f) => existsSync(resolve(root, 'demo', f)));

/**
 * Owner rule, 10 October 2026: on the built page, each country's Most Stocked
 * rail and Deals tab name only that country's shops and show only its
 * currency (tests/regionRails.test.ts holds the data they are drawn from).
 */
const SITES = [
  { id: 'GB', prefix: '', symbol: '£', shops: new Set(RETAILERS.map((r) => r.name)) },
  { id: 'US', prefix: '/us', symbol: '$', shops: new Set(REGION_RETAILERS.US.map((s) => s.name)) },
  { id: 'IN', prefix: '/in', symbol: '₹', shops: new Set(REGION_RETAILERS.IN.map((s) => s.name)) },
  { id: 'CA', prefix: '/ca', symbol: '$', shops: new Set(REGION_RETAILERS.CA.map((s) => s.name)) },
] as const;
const SYMBOLS = /[£$₹]/g;

describe.skipIf(!built)('each country\'s rails on the built page', () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = await launchChromium({ countryChosen: null });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  async function read(site: (typeof SITES)[number], path: string, list: string) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript((id: string) => {
      try { localStorage.setItem('pricesniffs.region', id); } catch { /* storage refused */ }
    }, site.id);
    await stubSupabase(context, null, null);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}${site.prefix}${path}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForTimeout(300);
    const tiles = (await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(list)})].map((li) => ({
      shop: (li.querySelector('.sold-by span')?.textContent ?? '').trim().replace(/^(from|at) /, ''),
      price: (li.querySelector('.tile-price')?.textContent ?? '').replace(/\\s+/g, ' '),
    }))`)) as { shop: string; price: string }[];
    await context.close();
    return tiles;
  }

  for (const site of SITES) {
    it(`${site.id}: Most Stocked names only its own shops, in ${site.symbol}`, async () => {
      const rail = await read(site, '/', '.pop-section:not(.pop-reviewed) .pop-rail li:has(.tile)');
      expect(rail).toHaveLength(12);
      for (const t of rail) {
        expect(site.shops.has(t.shop), `${t.shop} on the ${site.id} rail`).toBe(true);
        expect([...new Set(t.price.match(SYMBOLS))]).toEqual([site.symbol]);
      }
    }, 90_000);

    it(`${site.id}: the Deals tab names only its own shops, in ${site.symbol}`, async () => {
      const deals = await read(site, '/deals', '.tile-grid li:has(.tile)');
      // A beta country may have none yet ("Not many deals yet in the beta."); the UK always has some.
      if (site.id === 'GB') expect(deals.length).toBeGreaterThan(0);
      for (const t of deals) {
        expect(site.shops.has(t.shop), `${t.shop} on the ${site.id} Deals tab`).toBe(true);
        expect([...new Set(t.price.match(SYMBOLS))]).toEqual([site.symbol]);
      }
    }, 90_000);
  }
});

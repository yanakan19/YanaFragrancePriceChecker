/**
 * The home page's first screen in the built site (scripts/firstScreen.ts,
 * docs/SITE-AUDIT-2026-10-12.md "21 Oct 2026"): the home tiles are drawn
 * before any price data has arrived, the app still loads all of it and takes
 * over (search, a list's filters, a product page), each country's home loads
 * only its own data, no other address shows the home tiles, and the offline
 * copy of the page still works. Rules, not figures: no product, price or count
 * is named here.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page, Route } from 'playwright';
import { launchChromium, startPagesServer, waitForApp } from '../scripts/a11y-audit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demo = resolve(root, 'demo');
const built = ['index.html', 'us/index.html', 'in/index.html', 'sw.js'].every((f) => existsSync(resolve(demo, f)));

const COUNTRIES = [
  { id: 'GB', path: '/', symbol: '£', data: /^\/data\// },
  { id: 'US', path: '/us/', symbol: '$', data: /^\/us\/data\// },
  { id: 'IN', path: '/in/', symbol: '₹', data: /^\/in\/data\// },
] as const;

describe.skipIf(!built)('the home page’s first screen', () => {
  let browser: Browser;
  let server: { port: number; close: () => void };
  const url = (path: string) => `http://127.0.0.1:${server.port}${path}`;

  beforeAll(async () => {
    server = await startPagesServer();
    browser = await launchChromium();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  /** A page whose data files wait until `release` is called; every data address asked for is recorded. */
  async function heldPage(context: BrowserContext): Promise<{ page: Page; release: () => void; asked: string[] }> {
    const page = await context.newPage();
    const held: Route[] = [];
    const asked: string[] = [];
    let released = false;
    await page.route(/\/data\/[A-Za-z]+\.[0-9a-f]{16}\.json$/, (route) => {
      asked.push(new URL(route.request().url()).pathname);
      if (released) void route.continue();
      else held.push(route);
    });
    return {
      page,
      asked,
      release: () => {
        released = true;
        for (const r of held.splice(0)) void r.continue();
      },
    };
  }

  const firstScreenTiles = (page: Page) =>
    page.evaluate(`[...document.querySelectorAll('#view [data-first-screen] .pop-rail .tile-body')].map((b) => ({
      id: b.getAttribute('data-frag'), href: b.getAttribute('data-href'), price: (b.querySelector('.tile-price')?.textContent ?? '').replace(/\\s+/g, ' '),
      shown: b.getBoundingClientRect().height > 40,
    }))`) as Promise<{ id: string; href: string; price: string; shown: boolean }[]>;

  for (const c of COUNTRIES) {
    it(`${c.id}: the tiles show before any price data is in, then the app loads only ${c.id} data and takes over`, async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      const { page, release, asked } = await heldPage(context);
      try {
        await page.goto(url(c.path), { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#view [data-first-screen] .tile', { timeout: 15_000 });
        const before = await firstScreenTiles(page);
        expect(before.length, 'a rail of tiles').toBeGreaterThanOrEqual(4);
        // Each row shows the tiles that fit (two at 390 wide), its first ones; the rest wait in the markup.
        const shownBefore = before.filter((t) => t.shown).length;
        expect(shownBefore).toBeGreaterThanOrEqual(2);
        const perRail = (await page.evaluate(`[...document.querySelectorAll('#view [data-first-screen] .pop-rail')].map((r) =>
          [...r.querySelectorAll('.tile-body')].map((b) => b.getBoundingClientRect().height > 40))`)) as boolean[][];
        for (const flags of perRail) expect(flags.indexOf(false) === -1 || flags.slice(flags.indexOf(false)).every((f) => !f)).toBe(true);
        for (const t of before) expect([...new Set(t.price.match(/[£$₹]/g))], t.price).toEqual([c.symbol]);
        expect(await page.locator('#view > .boot').count(), 'the outline gave way').toBe(0);
        expect(await page.evaluate(`document.documentElement.hasAttribute('data-app-ready')`)).toBe(false);

        release();
        await waitForApp(page);
        expect(await page.locator('[data-first-screen]').count(), 'the app replaced the screen').toBe(0);
        const appIds = (await page.evaluate(`[...document.querySelectorAll('.pop-rail .tile-body')].map((b) => b.getAttribute('data-frag'))`)) as string[];
        expect(appIds.length).toBe(before.length);
        expect(await page.evaluate(`[...document.querySelectorAll('.pop-rail .tile-body')].filter((b) => b.getBoundingClientRect().height > 40).length`), 'as many tiles shown as the first screen showed').toBe(shownBefore);
        // The same tiles in the same order, but for a price that went stale
        // between the build and this run and moved one.
        const same = appIds.filter((id, i) => before[i]!.id === id).length;
        expect(same, `${appIds.join(',')} against ${before.map((t) => t.id).join(',')}`).toBeGreaterThanOrEqual(before.length - 2);
        // Only this country's data was asked for.
        expect(asked.length).toBeGreaterThan(0);
        for (const p of asked) expect(p, `${c.id} asked for ${p}`).toMatch(c.data);
      } finally {
        await context.close();
      }
    });
  }

  it('a tap on a tile before the app is ready opens that product’s own page, which answers 200', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const { page } = await heldPage(context);
    try {
      await page.goto(url('/'), { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#view [data-first-screen] .tile-body');
      const [tile] = await firstScreenTiles(page);
      const [response] = await Promise.all([
        page.waitForNavigation({ waitUntil: 'commit' }),
        page.click(`#view [data-first-screen] .tile-body[data-frag="${tile!.id}"]`),
      ]);
      expect(new URL(page.url()).pathname).toBe(tile!.href);
      expect(response?.status()).toBe(200);
    } finally {
      await context.close();
    }
  });

  it('no other address shows the home tiles: a route page, a product page, a region’s deep link', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const { page } = await heldPage(context);
    try {
      await page.goto(url('/'), { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#view [data-first-screen] .tile-body');
      const product = (await firstScreenTiles(page))[0]!.href;
      for (const path of ['/deals', '/search', '/us/deals', '/brands', product]) {
        await page.goto(url(path), { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(300);
        expect(await page.locator('[data-first-screen]').count(), path).toBe(0);
      }
    } finally {
      await context.close();
    }
  });

  it('once in: search, a list’s filters and a product page work from the full catalogue', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    try {
      await page.goto(url('/'), { waitUntil: 'load' });
      await waitForApp(page);
      // A brand from the rail, typed into the quick search, lists more than the rail holds of it.
      const brand = (await page.evaluate(`document.querySelector('.pop-rail [data-brand]').getAttribute('data-brand')`)) as string;
      await page.fill('#search', brand);
      await page.waitForFunction(`document.querySelectorAll('.tile-grid .tile-body').length > 0`, null, { timeout: 15_000 });
      // The list's filters are drawn from the catalogue.
      await page.goto(url('/search'), { waitUntil: 'load' });
      await waitForApp(page);
      expect(await page.locator('#view select').count(), 'filters on the list').toBeGreaterThan(0);
      // A product page opened from a tile lists its shops.
      await page.goto(url('/'), { waitUntil: 'load' });
      await waitForApp(page);
      await page.click('.pop-rail .tile-body');
      await page.waitForFunction(`document.querySelector('#view h1') && /\\S/.test(document.querySelector('#view h1').textContent) && location.pathname !== '/'`, null, { timeout: 15_000 });
      expect(await page.evaluate(`document.querySelectorAll('#view a[href^="http"]').length`)).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  it('offline, the kept home page still starts, and the kept copy shows no home tiles on another address', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      await page.goto(url('/'), { waitUntil: 'load' });
      await waitForApp(page);
      const active = (await page.evaluate(`(async () => {
        for (let i = 0; i < 300; i++) {
          const r = await navigator.serviceWorker.getRegistration();
          if (r && r.active && r.active.state === 'activated') return true;
          await new Promise((ok) => setTimeout(ok, 100));
        }
        return false;
      })()`)) as boolean;
      expect(active).toBe(true);
      // Through the worker once, so the page and its data are kept.
      await page.goto(url('/'), { waitUntil: 'load' });
      await waitForApp(page);
      await context.setOffline(true);
      await page.reload({ waitUntil: 'load' });
      await waitForApp(page);
      expect(await page.locator('.pop-rail .tile').count()).toBeGreaterThan(0);
      // The kept document answers /deals offline: the deals page, never the home tiles.
      await page.goto(url('/deals'), { waitUntil: 'load' });
      expect(await page.locator('[data-first-screen]').count()).toBe(0);
      await waitForApp(page);
      expect(new URL(page.url()).pathname).toBe('/deals');
      expect(await page.locator('.pop-rail').count()).toBe(0);
    } finally {
      await context.setOffline(false);
      await context.close();
    }
  });
});

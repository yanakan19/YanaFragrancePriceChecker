import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { matchRoute, routeToPath } from '../demo/router.js';
import { headFor } from '../demo/head.js';
import { GIFT_SET_BAND, volumeOptions, type VolumeBand } from '../demo/volumeBands.js';
import { panelOptions } from './support/filterPanel.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Gift sets have their own tab, Sets under Explore (owner's decision,
 * 2026-10-05, which reverses the 2026-10-04 decision that they were only an
 * option under Size). They were an option under Size on the search list
 * until Phase 8 (docs/GIFT-SETS-AND-OILS-PLAN.md) took sets out of every bottle list. The old
 * /gift-sets address is kept as a way in, not answered with a not found.
 */
describe('/gift-sets, kept as an alias for the Sets tab', () => {
  it('lands on the Sets tab, never a not found', () => {
    for (const path of ['/gift-sets', '/gift-sets/']) {
      const route = matchRoute(path);
      expect(route.name, path).toBe('sets');
    }
    // A link that already carries a search keeps it for the tab's own search.
    expect(matchRoute('/gift-sets', '?q=lattafa').query).toEqual({ q: 'lattafa' });
  });

  it('is answered with the Sets page, which is the one in the sitemap', () => {
    expect(routeToPath({ name: 'sets', param: '', query: {} })).toBe('/sets');
    expect(headFor({ route: matchRoute('/gift-sets') }).title).toBe('PriceSniffs: Sets');
    expect(headFor({ route: matchRoute('/gift-sets') }).canonical).toMatch(/\/sets$/);
    expect(headFor({ route: matchRoute('/gift-sets') }).noindex).toBe(false);
  });

  it('is not itself in the sitemap, while /sets and /oils are', () => {
    const xml = readFileSync(resolve(root, 'demo/sitemap-gb.xml'), 'utf8');
    expect(xml).not.toContain('/gift-sets');
    expect(xml).toMatch(/<loc>[^<]*\/sets<\/loc>/);
    expect(xml).toMatch(/<loc>[^<]*\/oils<\/loc>/);
  });
});

describe('Gift Sets in the Size filter', () => {
  it('is listed after the five size bands, and only where a list has a set', () => {
    const withSets = volumeOptions(new Map<VolumeBand, number>([['gift-set', 4], ['70-120', 9], ['0-15', 2]]));
    expect(withSets.map((o) => o.value)).toEqual(['0-15', '70-120', 'gift-set']);
    expect(volumeOptions(new Map<VolumeBand, number>([['70-120', 9]])).map((o) => o.value)).toEqual(['70-120']);
  });
});

const built = existsSync(resolve(root, 'demo/index.html'));

describe.skipIf(!built)('Gift Sets on the built site', () => {
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

  /**
   * Opens a path and reads the page: its address, headings and tiles, then the
   * Size options in its Filters panel (the values offered, and which are ticked).
   */
  async function read(path: string) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load' });
      await waitForApp(page);
      await page.waitForTimeout(300);
      const seen = (await page.evaluate(`(() => ({
        path: location.pathname + location.search,
        h1: document.querySelector('h1') ? document.querySelector('h1').textContent : null,
        h2s: [...document.querySelectorAll('h2')].map((h) => h.textContent.trim()),
        text: document.body.innerText,
        tiles: [...document.querySelectorAll('.tile-grid > li')].map((li) => li.innerText.trim()).filter(Boolean),
        hasFilters: !!document.querySelector('#view [data-facets-toggle]'),
      }))()`)) as { path: string; h1: string | null; h2s: string[]; text: string; tiles: string[]; hasFilters: boolean };
      const size = seen.hasFilters ? await panelOptions(page, 'size') : [];
      return {
        ...seen,
        sizeChosen: size.filter((o) => o.checked).map((o) => o.value),
        sizeOptions: seen.hasFilters ? size.map((o) => o.value) : null,
      };
    } finally {
      await context.close();
    }
  }

  it('is gone from the home page: no section, no button', async () => {
    const home = await read('/');
    expect(home.h2s).not.toContain('Gift Sets');
    expect(home.text).not.toMatch(/See All Gift Sets/i);
    expect(home.h2s).toContain('Most Stocked');
  });

  it('opens the old address as the Sets tab, and rewrites it to /sets', async () => {
    const page = await read('/gift-sets');
    // Rewritten to the tab's own address, no 404, no dead page.
    expect(page.path).toBe('/sets');
    expect(page.h1).toBe('Sets');
    expect(page.tiles.length).toBeGreaterThan(20);
    // Every tile on it is a gift set.
    expect(page.tiles.every((t) => /gift set|bundle/i.test(t))).toBe(true);
  });

  it('opens the old search address with Gift Sets chosen as the Sets tab, rewritten to /sets', async () => {
    // Sets are in no list on the search page any more (Phase 8), so the address
    // /gift-sets once rewrote to is answered with the tab.
    const page = await read('/search?size=gift-set');
    expect(page.path).toBe('/sets');
    expect(page.h1).toBe('Sets');
    expect(page.tiles.length).toBeGreaterThan(10);
    expect(page.tiles.every((t) => /gift set|bundle/i.test(t))).toBe(true);
  });

  it('keeps gift sets out of the Most stocked list, and does not offer them there', async () => {
    const page = await read('/search');
    expect(page.h1).toBe('Most stocked');
    expect(page.sizeOptions).not.toContain(GIFT_SET_BAND.id);
    expect(page.tiles.length).toBeGreaterThan(0);
    expect(page.tiles.some((t) => /gift set/i.test(t))).toBe(false);
  });

  it('lists no set on a search, a brand page or a shop page, and offers no Gift Sets under Size there', async () => {
    for (const path of ['/search?q=set', '/search?q=invictus', '/brands/kayali', '/retailers/perfume-click']) {
      const page = await read(path);
      expect(page.tiles.length, path).toBeGreaterThan(0);
      expect(page.tiles.some((t) => /gift set|bundle/i.test(t)), path).toBe(false);
      if (page.sizeOptions) expect(page.sizeOptions, path).not.toContain(GIFT_SET_BAND.id);
    }
  }, 60_000);

  it('reaches a shop\'s sets from the shop page, with the shop kept', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/retailers/perfume-click`, { waitUntil: 'load' });
      await waitForApp(page);
      const line = (await page.locator('.tabs-line').first().innerText()).trim();
      expect(line).toMatch(/^Perfume Click also has [\d,]+ Sets/);
      await page.locator('.tabs-line a[data-tab-jump="sets"]').click();
      await page.waitForTimeout(400);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/sets?shop=perfume-click');
      const tiles = (await page.evaluate(
        `[...document.querySelectorAll('.tile-grid > li')].map((li) => li.innerText.trim()).filter(Boolean)`,
      )) as string[];
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.every((t) => /gift set|bundle/i.test(t))).toBe(true);
    } finally {
      await context.close();
    }
  }, 60_000);
});

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { matchRoute, routeToPath } from '../demo/router.js';
import { headFor } from '../demo/head.js';
import { GIFT_SET_BAND, volumeOptions, type VolumeBand } from '../demo/volumeBands.js';
import { panelOptions, tick } from './support/filterPanel.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Gift sets have their own tab, Sets under Explore (owner's decision,
 * 2026-10-05, which reverses the 2026-10-04 decision that they were only an
 * option under Size). They stay an option under Size on the search list until
 * Search stops listing sets (docs/GIFT-SETS-AND-OILS-PLAN.md, Phase 8). The old
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
    const xml = readFileSync(resolve(root, 'demo/sitemap.xml'), 'utf8');
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

  it('opens the same list as the search list with Size set to Gift Sets, the choice kept in its address', async () => {
    const page = await read('/search?size=gift-set');
    expect(page.path).toBe('/search?size=gift-set');
    expect(page.sizeChosen).toEqual([GIFT_SET_BAND.id]);
    // Tiles below the fold are skipped by the browser and have no text to read; a set's tile is taller since it names its contents.
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

  it('offers Gift Sets under Size on a search, a brand page and a shop page that have sets', async () => {
    for (const path of ['/search?q=set', '/brands/kayali', '/retailers/perfume-click']) {
      const page = await read(path);
      expect(page.sizeOptions, path).not.toBeNull();
      expect(page.sizeOptions, path).toContain(GIFT_SET_BAND.id);
      // After the size bands, never among them.
      expect(page.sizeOptions!.at(-1), path).toBe(GIFT_SET_BAND.id);
    }
  }, 60_000);

  it('narrows a list to its gift sets when the option is chosen', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/retailers/perfume-click`, { waitUntil: 'load' });
      await waitForApp(page);
      // The list draws a screenful of tiles at a time, so the figure to
      // compare is the count the page states above it.
      const stated = async () =>
        Number(((await page.evaluate(`document.querySelector('.gone-head').textContent`)) as string).replace(/\D/g, ''));
      const before = await stated();
      await tick(page, 'size', GIFT_SET_BAND.id);
      await page.waitForTimeout(300);
      const tiles = (await page.evaluate(
        `[...document.querySelectorAll('.tile-grid > li')].map((li) => li.innerText.trim()).filter(Boolean)`,
      )) as string[];
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.every((t) => /gift set|bundle/i.test(t))).toBe(true);
      const after = await stated();
      expect(after).toBeGreaterThan(0);
      expect(after).toBeLessThan(before);
    } finally {
      await context.close();
    }
  }, 60_000);
});

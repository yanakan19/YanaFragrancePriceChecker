import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { BY_POPULARITY } from '../demo/data.js';
import { rankedInMostStocked } from '../demo/mostStocked.js';
import { onePerScent } from '../demo/oneScent.js';
import { sortFragrances } from '../demo/listSort.js';
import { GRID_AD_INTERVAL, WIDEST_ROW, interleaveAds, isGridAd, type AdConfig } from '../demo/ads.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/** The old cap on the Most Stocked list, and the chunk the list loads by (CHUNK in demo/app.ts). */
const OLD_CAP = 50;
const CHUNK = 48;

/** The whole Most Stocked ranking, as the list builds it: one entry per scent. */
const RANKING = onePerScent(BY_POPULARITY.filter(rankedInMostStocked));

/**
 * No list has a cap any more (owner's decision, 2026-10-04). A list paints one
 * chunk and keeps going as the reader scrolls, in rank order, and sorting and
 * filtering still work on the whole of it.
 */
describe('the ranking is longer than the old cap, so the cap would show', () => {
  it('has far more than 50 scents', () => {
    expect(RANKING.length).toBeGreaterThan(OLD_CAP * 10);
  });
});

describe('ads keep their placement rule in an endless list', () => {
  const on: AdConfig = { client: 'ca-pub-1234567890123456', slots: { grid: '1234567890', product: '1234567890' } };
  const long = Array.from({ length: 5000 }, (_, i) => i);
  const withAds = interleaveAds(long, on);

  it('puts none in the first row, one after every interval, and none at the very end', () => {
    const firstAd = withAds.findIndex(isGridAd);
    // Never in the first row at any column count.
    expect(firstAd).toBeGreaterThanOrEqual(WIDEST_ROW);
    expect(isGridAd(withAds[withAds.length - 1])).toBe(false);
    // From the first ad on, ads fall at an even spacing however far the list runs,
    // so chunk boundaries (48 items) change nothing about where they are.
    const positions = withAds.flatMap((x, i) => (isGridAd(x) ? [i] : []));
    for (let k = 1; k < positions.length; k++) {
      expect(positions[k]! - positions[k - 1]!).toBe(GRID_AD_INTERVAL + 1);
    }
    // The products keep their order, and none is lost or doubled.
    expect(withAds.filter((x) => !isGridAd(x))).toEqual(long);
  });

  it('adds nothing when the placement is off', () => {
    const off: AdConfig = { client: on.client, slots: { grid: '', product: '' } };
    expect(interleaveAds(long, off)).toBe(long);
  });
});

describe.skipIf(!built)('endless lists on the built site', () => {
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

  const tileCount = (page: Page): Promise<number> =>
    page.evaluate(`document.querySelectorAll('#view .tile-grid > li:not(.grid-more)').length`) as Promise<number>;

  /**
   * The fragrance id of each tile loaded so far, by position. A tile far from the
   * screen is an empty stand in (see keepNearTiles in demo/app.ts) and gives null.
   */
  const tileIds = (page: Page): Promise<(string | null)[]> =>
    page.evaluate(`[...document.querySelectorAll('#view .tile-grid > li:not(.grid-more)')].map((li) => li.querySelector('[data-frag]')?.dataset.frag ?? null)`) as Promise<(string | null)[]>;

  /** Every tile that is on the page is the one the ranking puts at that position, and enough of them are. */
  function expectRankOrder(ids: (string | null)[], expected: readonly string[], atLeast: number): void {
    const present = ids.flatMap((id, i) => (id === null ? [] : [[i, id] as const]));
    expect(present.length).toBeGreaterThanOrEqual(atLeast);
    for (const [i, id] of present) if (id !== expected[i]) expect.fail(`position ${i}: ${id} is not ${expected[i]}`);
  }

  /** Scrolls down the list until at least `n` tiles are on the page. */
  async function loadUntil(page: Page, n: number): Promise<number> {
    let count = await tileCount(page);
    for (let i = 0; i < 80 && count < n; i++) {
      // Brings the list's own sentinel into view, as a reader scrolling down
      // does; the page's very bottom can be another list (a brand's own shop).
      await page.evaluate(`(document.querySelector('#view .tile-grid > .grid-more') ?? document.documentElement).scrollIntoView({ block: 'end' })`);
      await page.waitForTimeout(150);
      count = await tileCount(page);
    }
    return count;
  }

  async function open(path: string, width = 390): Promise<Page> {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 600, isMobile: width < 600 });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}${path}`, { waitUntil: 'load' });
    await waitForApp(page);
    return page;
  }

  it('paints one chunk first, then keeps appending in rank order well past the old cap', async () => {
    const page = await open('/search');
    // The count beside the heading is the whole ranking, not 50.
    const shown = Number(await page.textContent('#view .page-head .count'));
    expect(shown).toBe(RANKING.length);
    // First paint: one chunk, with the sentinel waiting below it.
    expect(await tileCount(page)).toBe(CHUNK);
    expect(await page.$$('#view .grid-more')).toHaveLength(1);

    const loaded = await loadUntil(page, CHUNK * 10);
    expect(loaded).toBeGreaterThanOrEqual(CHUNK * 10);
    expect(loaded).toBeGreaterThan(OLD_CAP);
    // Loaded a chunk at a time, never all of it at once.
    expect(loaded).toBeLessThan(RANKING.length);
    // Rank order, one per scent, from the first tile to the last one loaded.
    expectRankOrder(await tileIds(page), RANKING.map((f) => f.id), 20);
    await page.context().close();
  }, 120_000);

  it('sorts the whole ranking, then loads on without a cap', async () => {
    const page = await open('/search');
    await page.selectOption('#browse-sort', 'price-low');
    await page.waitForFunction(`document.querySelectorAll('#view .tile-grid > li:not(.grid-more)').length > 0`);
    expect(await tileCount(page)).toBe(CHUNK);
    expect(Number(await page.textContent('#view .page-head .count'))).toBe(RANKING.length);
    const loaded = await loadUntil(page, CHUNK * 4);
    expect(loaded).toBeGreaterThan(OLD_CAP);
    const expected = sortFragrances([...RANKING], 'price-low').map((f) => f.id);
    expectRankOrder(await tileIds(page), expected, 20);
    await page.context().close();
  }, 120_000);

  it('keeps going on a brand page and on Gift Sets under Size', async () => {
    const gifts = await open('/gift-sets');
    const total = Number(await gifts.textContent('#view .page-head .count'));
    expect(total).toBeGreaterThan(OLD_CAP);
    expect(await tileCount(gifts)).toBe(CHUNK);
    expect(await loadUntil(gifts, CHUNK * 3)).toBeGreaterThanOrEqual(CHUNK * 3);
    await gifts.context().close();

    // The biggest brand page has more than one chunk too.
    const biggest = [...BY_POPULARITY.reduce((m, f) => m.set(f.brand, (m.get(f.brand) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]!;
    const slug = biggest[0].toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const brand = await open(`/brands/${slug}`);
    expect(await loadUntil(brand, Math.min(biggest[1], CHUNK * 3))).toBeGreaterThan(CHUNK);
    await brand.context().close();
  }, 180_000);

  it('keeps only the tiles near the screen once the list is long, and puts the rest back as the reader returns', async () => {
    const page = await open('/search');
    // The remote photos are not part of this check and would only slow it.
    await page.context().route((u) => u.hostname !== '127.0.0.1' && u.hostname !== 'localhost', (r) => r.abort());
    expect(await loadUntil(page, CHUNK * 25)).toBeGreaterThanOrEqual(CHUNK * 25);
    await page.waitForTimeout(300);

    const stats = (): Promise<{ real: number; stands: number; elements: number; docHeight: number }> =>
      page.evaluate(`({
        real: document.querySelectorAll('#view .tile-grid > li:not(.grid-more):not(.tile-gone)').length,
        stands: document.querySelectorAll('#view .tile-grid > li.tile-gone').length,
        elements: document.getElementsByTagName('*').length,
        docHeight: document.documentElement.scrollHeight,
      })`) as Promise<{ real: number; stands: number; elements: number; docHeight: number }>;

    const deep = await stats();
    // Far fewer real tiles than loaded ones, the rest held in place by empty stand ins.
    expect(deep.real).toBeLessThan(CHUNK * 2);
    expect(deep.real + deep.stands).toBe(await tileCount(page));
    expect(deep.elements).toBeLessThan(CHUNK * 25 * 3);

    // Part way up the list, remember which tile is first fully on screen, and where.
    const at = (): Promise<{ id: string | null; top: number }> =>
      page.evaluate(`(() => {
        for (const el of document.querySelectorAll('#view .tile-grid > li [data-frag]')) {
          const top = el.getBoundingClientRect().top;
          if (top > 80) return { id: el.dataset.frag, top: Math.round(top) };
        }
        return { id: null, top: 0 };
      })()`) as Promise<{ id: string | null; top: number }>;
    const topOf = (id: string): Promise<number | null> =>
      page.evaluate(`(() => { const el = document.querySelector('#view .tile-grid [data-frag="${id}"]'); return el ? Math.round(el.getBoundingClientRect().top) : null; })()`) as Promise<number | null>;
    const midY = Math.round(deep.docHeight * 0.4);
    await page.evaluate(`window.scrollTo(0, ${midY})`);
    await page.waitForTimeout(400);
    const mid = await at();
    expect(mid.id).not.toBeNull();
    const midStats = await stats();
    expect(midStats.real).toBeLessThan(CHUNK * 2);
    // Swapping tiles never changes how tall the page is, or the pixel the reader is on.
    expect(Math.abs(midStats.docHeight - deep.docHeight)).toBeLessThanOrEqual(2);

    // Back to the very top: the head of the ranking is whole again, in order.
    await page.evaluate('window.scrollTo(0, 0)');
    await page.waitForTimeout(400);
    const ids = await tileIds(page);
    // The very first tiles are whole again, and none of them is out of place.
    expect(ids.slice(0, 8).every((id) => id !== null)).toBe(true);
    expectRankOrder(ids, RANKING.map((f) => f.id), 8);

    // And down again to the same place: the same tile is at the same pixel.
    await page.evaluate(`window.scrollTo(0, ${midY})`);
    await page.waitForTimeout(400);
    const again = await topOf(mid.id!);
    expect(again).not.toBeNull();
    expect(Math.abs(again! - mid.top)).toBeLessThanOrEqual(2);
    await page.context().close();
  }, 180_000);

  it('opens the full ranking from See All on the home page', async () => {
    const page = await open('/');
    await page.click('.pop-section .see-top');
    await page.waitForURL(/\/search$/);
    expect(await page.textContent('#view h1')).toMatch(/Most stocked/i);
    expect(Number(await page.textContent('#view .page-head .count'))).toBe(RANKING.length);
    expect(await page.textContent('#view')).not.toMatch(/Top\s*\d+|\b50 most\b/i);
    // The first tiles are the head of the ranking, in order.
    const ids = await tileIds(page);
    expect(ids.every((id) => id !== null)).toBe(true);
    expectRankOrder(ids, RANKING.map((f) => f.id), CHUNK);
    await page.context().close();
  }, 90_000);
});

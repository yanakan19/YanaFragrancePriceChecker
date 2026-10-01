import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { dayKey } from '../src/services/priceHistoryDaily.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The page half of loading the price history on demand
 * (demo/priceHistoryStore.ts), on the built page as committed: the app starts
 * without the file, a product page opened before it arrives shows a
 * placeholder exactly the chart's height and then the chart, and a failed
 * fetch costs the chart and nothing else.
 */
const built = existsSync(resolve(root, 'demo/index.html'));
const HISTORY_FILE = '**/data/priceHistory.*.json';

/** The fragrance with the most distinct days of real prices: as sure a chart as the data allows. */
function chartedFragrance(): string {
  const html = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
  const path = (JSON.parse(/var lazy = (\{.*\});/.exec(html)![1]!) as Record<string, string>).priceHistory!;
  const { PRICE_HISTORY } = JSON.parse(readFileSync(resolve(root, 'demo', path), 'utf8')) as {
    PRICE_HISTORY: Record<string, { at: string; priceGbp: number | null }[]>;
  };
  let best = '';
  let bestDays = 0;
  for (const [id, points] of Object.entries(PRICE_HISTORY)) {
    const days = new Set(points.filter((p) => p.priceGbp !== null).map((p) => dayKey(p.at))).size;
    if (days > bestDays) [best, bestDays] = [id, days];
  }
  return best;
}

const blockState = (page: Page) =>
  page.evaluate(`(() => {
    const block = document.querySelector('[data-history-block]');
    return {
      pending: !!document.querySelector('[data-history-pending]'),
      chart: !!document.querySelector('[data-history-chart]'),
      failed: !!document.querySelector('[data-history-failed]'),
      height: block ? Math.round(block.getBoundingClientRect().height) : null,
      text: block ? block.textContent.replace(/\\s+/g, ' ').trim() : null,
      offers: document.querySelectorAll('.detail-offers .offers li').length,
    };
  })()`) as Promise<{ pending: boolean; chart: boolean; failed: boolean; height: number | null; text: string | null; offers: number }>;

describe.skipIf(!built)('price history loaded on demand (built page, Chromium)', () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};
  const id = built ? chartedFragrance() : '';

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = await launchChromium();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  it('starts the app without it, then prefetches it once the page is idle', async () => {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    // When the app was marked ready, and when the history fetch started, on
    // the page's own clock.
    await page.addInitScript(`new MutationObserver((_, obs) => {
      if (document.documentElement.hasAttribute('data-app-ready')) { window.__readyAt = performance.now(); obs.disconnect(); }
    }).observe(document, { attributes: true, subtree: true });`);
    await page.goto(`http://localhost:${port}/`);
    await waitForApp(page);
    const timing = () =>
      page.evaluate(`({
        ready: window.__readyAt ?? null,
        history: performance.getEntriesByType('resource').find((e) => e.name.includes('/data/priceHistory.'))?.startTime ?? null,
      })`) as Promise<{ ready: number | null; history: number | null }>;
    await expect.poll(async () => (await timing()).history, { timeout: 15_000 }).not.toBeNull();
    const t = await timing();
    expect(t.ready).not.toBeNull();
    expect(t.history!).toBeGreaterThan(t.ready!);
    await ctx.close();
  }, 60_000);

  it('holds the chart\'s place while it loads, then draws the chart in the same space', async () => {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    await page.route(HISTORY_FILE, async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(`http://localhost:${port}/fragrance/${encodeURIComponent(id)}`);
    await waitForApp(page);
    const loading = await blockState(page);
    expect(loading.pending).toBe(true);
    expect(loading.text).toContain('Loading price history');
    // The rest of the page does not wait for it.
    expect(loading.offers).toBeGreaterThan(0);

    release();
    await page.waitForSelector('[data-history-chart]', { timeout: 30_000 });
    const drawn = await blockState(page);
    expect(drawn.pending).toBe(false);
    expect(drawn.height).toBe(loading.height);
    await ctx.close();
  }, 60_000);

  it('shows the page without the chart, and says so, when the file cannot be fetched', async () => {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route(HISTORY_FILE, (route) => route.fulfill({ status: 503, body: 'unavailable' }));
    await page.goto(`http://localhost:${port}/fragrance/${encodeURIComponent(id)}`);
    await waitForApp(page);
    await page.waitForSelector('[data-history-failed]', { timeout: 30_000 });
    const failed = await blockState(page);
    expect(failed.chart).toBe(false);
    expect(failed.pending).toBe(false);
    expect(failed.text).toContain('could not be loaded');
    expect(failed.offers).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 60_000);
});

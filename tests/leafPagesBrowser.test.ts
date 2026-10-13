import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext } from 'playwright';
import { launchChromium, startDemoServer, startPagesServer, waitForApp } from '../scripts/a11y-audit.js';
import { LEAF_MANIFEST, type LeafManifest } from '../scripts/leafPages.js';

/**
 * The prerendered product, brand and shop pages (scripts/leafPages.ts) as the
 * host serves them (startPagesServer: a file at its own address with 200,
 * anything else 404.html with 404):
 *   - they answer 200, and an address with no page still answers 404;
 *   - without JavaScript they show the H1, the prices and plain links;
 *   - with it the app takes over exactly as it does from 404.html, with no
 *     layout shift (CLS under 0.05) at 390 and 1280 wide;
 *   - a merged product's old address still reaches the product it moved to.
 * The pages are picked from what the last build wrote, never named here.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html')) && existsSync(resolve(root, LEAF_MANIFEST));

describe.skipIf(!built)('prerendered pages in a browser', () => {
  let browser: Browser;
  let pages: { port: number; close: () => void };
  let shell: { port: number; close: () => void };
  let manifest: LeafManifest;
  const of = (kind: string): string[] => manifest.pages.filter((p) => p.kind === kind).map((p) => p.path);
  const spread = (list: string[], n: number): string[] =>
    list.length === 0 ? [] : Array.from({ length: n }, (_, i) => list[Math.floor((i * (list.length - 1)) / Math.max(1, n - 1))]!);

  beforeAll(async () => {
    manifest = JSON.parse(readFileSync(resolve(root, LEAF_MANIFEST), 'utf8')) as LeafManifest;
    pages = await startPagesServer();
    shell = await startDemoServer();
    browser = await launchChromium();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    pages?.close();
    shell?.close();
  });

  const at = (path: string): string => `http://127.0.0.1:${pages.port}${path}`;

  it('answers 200 at a prerendered address and 404 at one that has no page', async () => {
    for (const path of [...spread(of('product'), 5), ...spread(of('brand'), 2), ...spread(of('shop'), 2), ...spread(of('note'), 1)]) {
      expect((await fetch(at(path), { method: 'HEAD' })).status, path).toBe(200);
    }
    expect((await fetch(at('/no_such_bottle_anywhere_100ml'), { method: 'HEAD' })).status).toBe(404);
  });

  it('shows the H1, the cheapest price and plain links without JavaScript', async () => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    try {
      for (const path of [...spread(of('product'), 3), ...spread(of('brand'), 1), ...spread(of('shop'), 1)]) {
        const page = await ctx.newPage();
        await page.goto(at(path), { waitUntil: 'load' });
        const d = (await page.evaluate(`(() => {
          const shown = (el) => !!el && el.getBoundingClientRect().height > 0;
          const h1 = document.querySelectorAll('main h1');
          const low = document.querySelector('[data-ps-lowest]');
          return { h1s: h1.length, h1Shown: shown(h1[0]), low: low && shown(low) ? low.textContent : null, links: document.querySelectorAll('main a[href]').length,
            pounds: (document.querySelector('main').textContent.match(/£\\d/g) || []).length, sideways: document.documentElement.scrollWidth - innerWidth };
        })()`)) as { h1s: number; h1Shown: boolean; low: string | null; links: number; pounds: number; sideways: number };
        expect(d.h1s, path).toBe(1);
        expect(d.h1Shown, path).toBe(true);
        expect(d.links, path).toBeGreaterThan(5);
        expect(d.pounds, path).toBeGreaterThan(0);
        expect(d.sideways, path).toBeLessThanOrEqual(0);
        if (!path.startsWith('/brands/') && !path.startsWith('/retailers/')) expect(d.low, path).toMatch(/£\d/);
        await page.close();
      }
    } finally {
      await ctx.close();
    }
  }, 120_000);

  async function open(url: string, width: number): Promise<{ ctx: BrowserContext; cls: number; view: string; staticLeft: boolean; errors: string[] }> {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { hadRecentInput: boolean; value: number }[]) if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(url, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForTimeout(1200);
    const d = (await page.evaluate(`({ cls: window.__cls, view: document.getElementById('view').innerText.replace(/\\b\\d+[hmd]\\b|\\d+ (minutes?|hours?|days?) ago/g, ''), staticLeft: !!document.querySelector('#view .static-intro') })`)) as { cls: number; view: string; staticLeft: boolean };
    return { ctx, ...d, errors };
  }

  for (const width of [390, 1280]) {
    it(`with JavaScript at ${width}: the app takes over as it does from 404.html, and nothing shifts`, async () => {
      for (const path of [spread(of('product'), 2)[1]!, spread(of('brand'), 1)[0]!]) {
        const a = await open(at(path), width);
        const b = await open(`http://127.0.0.1:${shell.port}${path}`, width);
        try {
          expect(a.errors, path).toEqual([]);
          expect(a.staticLeft, `${path}: the static content is still in the page`).toBe(false);
          expect(a.view, `${path}: the app draws the same page as from 404.html`).toBe(b.view);
          expect(a.cls, `${path}: layout shift`).toBeLessThan(0.05);
        } finally {
          await a.ctx.close();
          await b.ctx.close();
        }
      }
    }, 120_000);
  }

  it('still opens a merged product at its old address, through 404.html', async () => {
    const index = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
    const dormantPath = /data\/dormant\.[0-9a-f]{16}\.json/.exec(index)![0];
    const aliases = Object.keys((JSON.parse(readFileSync(resolve(root, 'demo', dormantPath), 'utf8')) as { SLUG_ALIASES?: Record<string, string> }).SLUG_ALIASES ?? {});
    const old = spread(aliases, 3)[1];
    if (!old) return;
    expect((await fetch(at(`/${old}`), { method: 'HEAD' })).status).toBe(404);
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await page.goto(at(`/${old}`), { waitUntil: 'load' });
      await waitForApp(page);
      // The app reads the dormant file that says where it went, then shows that product.
      await page.waitForFunction(`!!document.querySelector('#view .t-page') && !/not found/i.test(document.title) && document.title !== 'PriceSniffs'`, null, { timeout: 20_000 });
      expect(await page.evaluate(`document.title`)).not.toMatch(/not found/i);
    } finally {
      await ctx.close();
    }
  }, 60_000);
});

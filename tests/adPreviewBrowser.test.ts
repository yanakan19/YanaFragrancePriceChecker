import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { auditRoute, launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { adPositions } from '../demo/ads.js';

/**
 * The ad spacers, in a real browser. Ads ship switched off, so what a visitor
 * sees must be exactly what the page was before they existed; and with
 * `?adpreview=1` every slot is a labelled frame in its place, with no request
 * to Google, at every width and in both themes. Needs the built page
 * (`npm run demo`).
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/** The display mode's storage key (MODE_KEY in scripts/a11y-audit.ts and demo/app.ts). */
const MODE_KEY = 'pricesniffs.display';
const CHUNK = 48;
const GOOGLE = /googlesyndication|doubleclick|googleadservices|adservice|pagead|google\.com\/adsense/i;

describe.skipIf(!built)('ad spacers on the built site', () => {
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

  interface Opened {
    page: Page;
    ctx: BrowserContext;
    external: string[];
  }

  async function open(path: string, width: number, mode: 'light' | 'dark' = 'dark', height = 900): Promise<Opened> {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 600, isMobile: width < 600 });
    await ctx.addInitScript(
      ([k, v]: [string, string]) => {
        try {
          localStorage.setItem(k, v);
        } catch {
          /* storage may be unavailable */
        }
      },
      [MODE_KEY, mode] as [string, string],
    );
    const page = await ctx.newPage();
    const external: string[] = [];
    // Everything that is not the local server: product photos and the like. The
    // photos are not part of these checks, so they are refused to keep it quick.
    await ctx.route(
      (u) => u.hostname !== '127.0.0.1' && u.hostname !== 'localhost',
      (r) => {
        external.push(r.request().url());
        return r.abort();
      },
    );
    await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForTimeout(300);
    return { page, ctx, external };
  }

  const count = (page: Page, sel: string): Promise<number> =>
    page.evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`) as Promise<number>;

  const noSideways = (page: Page): Promise<{ sw: number; cw: number }> =>
    page.evaluate(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`) as Promise<{ sw: number; cw: number }>;

  describe('with ads off and no preview, the page is exactly as it was', () => {
    for (const width of [320, 390, 1280]) {
      it(`shows nothing at all at ${width} wide: no frame, no style, no script, no request`, async () => {
        const { page, ctx, external } = await open('/', width);
        expect(await count(page, '.ps-ad')).toBe(0);
        expect(await count(page, '#ps-ad-styles')).toBe(0);
        expect(await count(page, 'ins.adsbygoogle')).toBe(0);
        expect(await count(page, 'script[src*="googlesyndication"]')).toBe(0);
        expect(await count(page, 'meta[name="robots"]')).toBe(0);
        // The home page still reads Most Stocked, then the update history.
        expect(await page.evaluate(`document.querySelector('.pop-section').nextElementSibling.className`)).toBe('bottom-split');
        await page.goto(`http://127.0.0.1:${port}/search`, { waitUntil: 'load' });
        await waitForApp(page);
        expect(await count(page, '.ps-ad')).toBe(0);
        expect(external.filter((u) => GOOGLE.test(u))).toEqual([]);
        const sideways = await noSideways(page);
        expect(sideways.sw).toBeLessThanOrEqual(sideways.cw);
        await ctx.close();
      }, 60_000);
    }

    it('adds not one character to the home page when the preview is on and its frame is taken out', async () => {
      const off = await open('/', 1280);
      const offHtml = (await off.page.evaluate(`document.querySelector('#view').innerHTML`)) as string;
      await off.ctx.close();
      const on = await open('/?adpreview=1', 1280);
      expect(await count(on.page, '.ps-ad')).toBe(1);
      const onHtml = (await on.page.evaluate(`(() => {
        const view = document.querySelector('#view').cloneNode(true);
        view.querySelectorAll('.ps-ad').forEach((el) => el.remove());
        return view.innerHTML;
      })()`)) as string;
      await on.ctx.close();
      expect(onHtml).toBe(offHtml);
    }, 60_000);

    it('puts the same tiles before the first frame of a list as the list has without the preview', async () => {
      for (const path of ['/search', '/deals']) {
        const tiles = `[...document.querySelectorAll('#view .tile-grid > li:not(.grid-more):not(.ps-ad)')].slice(0, 16).map((li) => li.outerHTML)`;
        const off = await open(path, 1280);
        const offTiles = (await off.page.evaluate(tiles)) as string[];
        await off.ctx.close();
        const on = await open(`${path}?adpreview=1`, 1280);
        const onTiles = (await on.page.evaluate(tiles)) as string[];
        await on.ctx.close();
        expect(offTiles).toHaveLength(16);
        expect(onTiles, path).toEqual(offTiles);
      }
    }, 90_000);

    it('the product page has no frame either', async () => {
      const { page, ctx } = await open('/', 1280);
      await page.click('.pop-rail li:first-child [data-frag]');
      await page.waitForSelector('.detail-grid');
      expect(await count(page, '.ps-ad')).toBe(0);
      await ctx.close();
    }, 60_000);
  });

  describe('with ?adpreview=1', () => {
    for (const mode of ['dark', 'light'] as const) {
      for (const width of [320, 390, 1280]) {
        it(`draws labelled frames, no sideways scroll, no axe violations: ${width} wide, ${mode}`, async () => {
          for (const path of ['/', '/search', '/deals']) {
            const { page, ctx, external } = await open(`${path}?adpreview=1`, width, mode);
            const frames = await count(page, '.ps-ad');
            expect(frames, path).toBeGreaterThan(0);
            expect(await page.evaluate(`[...document.querySelectorAll('.ps-ad-label')].every((l) => l.textContent === 'Advertisement')`)).toBe(true);
            expect(await page.evaluate(`getComputedStyle(document.querySelector('.ps-ad-frame, .ps-ad-home')).borderTopStyle`)).toBe('dashed');
            // Sized in small text, once measured.
            // (A frame far off screen is measured when it comes near: the browser skips its contents until then.)
            await page.evaluate(`document.querySelector('.ps-ad').scrollIntoView({ block: 'center' })`);
            await page.waitForFunction(`/^Slot \\d+ × \\d+ px$/.test(document.querySelector('.ps-ad .ps-ad-live').textContent)`);
            await page.evaluate('window.scrollTo(0, 0)');
            const sideways = await noSideways(page);
            expect(sideways.sw, `${path} ${width}`).toBeLessThanOrEqual(sideways.cw);
            expect(await count(page, 'ins.adsbygoogle')).toBe(0);
            expect(await count(page, 'script[src*="googlesyndication"]')).toBe(0);
            expect(external.filter((u) => GOOGLE.test(u))).toEqual([]);
            await ctx.close();
            const violations = await auditRoute(browser, port, `${path}?adpreview=1`, mode, width);
            expect(violations.map((v) => `${v.id}: ${v.nodes.join(' | ')}`), `${path} ${width} ${mode}`).toEqual([]);
          }
        }, 180_000);
      }
    }

    it('puts the home banner directly under Most Stocked, as wide as its grid on desktop and the full column on a phone', async () => {
      const wide = await open('/?adpreview=1', 1280);
      const sizes = (await wide.page.evaluate(`(() => {
        const sec = document.querySelector('.pop-section');
        const ad = document.querySelector('.ps-ad-home');
        const rail = document.querySelector('.pop-rail');
        const r = ad.getBoundingClientRect();
        return {
          next: sec.nextElementSibling === ad,
          after: ad.nextElementSibling.className,
          adW: Math.round(r.width), railW: Math.round(rail.getBoundingClientRect().width),
          gap: Math.round(r.top - sec.getBoundingClientRect().bottom),
          wellH: Math.round(ad.querySelector('.ps-ad-well').getBoundingClientRect().height),
        };
      })()`)) as { next: boolean; after: string; adW: number; railW: number; gap: number; wellH: number };
      expect(sizes.next).toBe(true);
      expect(sizes.after).toBe('bottom-split');
      // About the width of six tiles: 6 x 168 + 5 x 12.
      expect(sizes.adW).toBe(1068);
      expect(Math.abs(sizes.adW - sizes.railW)).toBeLessThanOrEqual(2);
      expect(sizes.wellH).toBe(90);
      await wide.ctx.close();

      const phone = await open('/?adpreview=1', 390);
      const p = (await phone.page.evaluate(`(() => {
        const ad = document.querySelector('.ps-ad-home');
        const main = document.querySelector('main').getBoundingClientRect();
        const r = ad.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(main.right - r.right), wellH: Math.round(ad.querySelector('.ps-ad-well').getBoundingClientRect().height),
                 railBottom: Math.round(document.querySelector('.pop-rail').getBoundingClientRect().bottom), top: Math.round(r.top) };
      })()`)) as { left: number; right: number; wellH: number; railBottom: number; top: number };
      // The full content width, beneath the swipe row.
      expect(p.left).toBe(16);
      expect(p.wellH).toBe(100);
      expect(p.top).toBeGreaterThanOrEqual(p.railBottom);
      await phone.ctx.close();
    }, 90_000);

    it('is noindex, keeps the canonical address clean, stays on the address as the reader moves, and is gone on a plain reload', async () => {
      const { page, ctx } = await open('/search?q=dior&adpreview=1', 1280);
      const head = async () =>
        (await page.evaluate(`({ robots: document.querySelector('meta[name=robots]')?.content ?? null, canonical: document.querySelector('link[rel=canonical]').href, ogurl: document.querySelector('meta[property="og:url"]').content })`)) as { robots: string | null; canonical: string; ogurl: string };
      let h = await head();
      expect(h.robots).toMatch(/noindex/);
      expect(h.canonical).toBe('https://pricesniffs.space/search');
      expect(h.ogurl).not.toContain('adpreview');
      // Moving about in the app keeps the preview, and its address says so.
      await page.click('#nav-deals');
      await page.waitForURL(/\/deals/);
      await page.waitForTimeout(300);
      expect(new URL(page.url()).searchParams.get('adpreview')).toBe('1');
      expect(await count(page, '.ps-ad')).toBeGreaterThan(0);
      h = await head();
      expect(h.robots).toMatch(/noindex/);
      expect(h.canonical).not.toContain('adpreview');
      // Nothing is stored.
      const stored = (await page.evaluate(`JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie])`)) as string;
      expect(stored).not.toMatch(/adpreview|ps-ad/i);
      // A reload without the parameter is an ordinary page.
      await page.goto(`http://127.0.0.1:${port}/deals`, { waitUntil: 'load' });
      await waitForApp(page);
      expect(await count(page, '.ps-ad')).toBe(0);
      expect(await count(page, 'meta[name="robots"]')).toBe(0);
      await ctx.close();
    }, 90_000);

    it('shows the product page slot under the whole offer list', async () => {
      const { page, ctx } = await open('/?adpreview=1', 1280);
      await page.click('.pop-rail li:first-child [data-frag]');
      await page.waitForSelector('.detail-grid');
      const r = (await page.evaluate(`(() => {
        const ad = document.querySelector('.detail-offers .ps-ad-block');
        const lists = [...document.querySelectorAll('.detail-offers ul.offers')];
        const below = lists.every((l) => ad.getBoundingClientRect().top >= l.getBoundingClientRect().bottom);
        return { has: !!ad, lists: lists.length, below, inRail: !!document.querySelector('.hero .ps-ad'), wellH: ad ? Math.round(ad.querySelector('.ps-ad-well').getBoundingClientRect().height) : 0 };
      })()`)) as { has: boolean; lists: number; below: boolean; inRail: boolean; wellH: number };
      expect(r.has).toBe(true);
      expect(r.lists).toBeGreaterThan(0);
      expect(r.below).toBe(true);
      expect(r.inRail).toBe(false);
      expect(r.wellH).toBe(280);
      // The page passes axe with its frame in place, on a phone and wide, in both themes.
      const id = (await page.evaluate(`location.pathname`)) as string;
      expect(id).toMatch(/^\/fragrance\//);
      await ctx.close();
      for (const [width, mode] of [[390, 'light'], [1280, 'dark']] as const) {
        const violations = await auditRoute(browser, port, `${id}?adpreview=1`, mode, width);
        expect(violations.map((v) => `${v.id}: ${v.nodes.join(' | ')}`), `${id} ${width} ${mode}`).toEqual([]);
      }
    }, 90_000);
  });

  describe('frames in a long endless list', () => {
    for (const width of [390, 1280]) {
      it(`keeps every frame where the generator puts it through chunking, windowing and scrolling back, ${width} wide`, async () => {
        const { page, ctx } = await open('/search?adpreview=1', width, 'dark', 844);
        await page.evaluate(`
          window.__cls = 0;
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift' });
        `);
        const total = (): Promise<number> => count(page, '#view .tile-grid > li:not(.grid-more)');
        // Scroll down a screen at a time so the chunks arrive as they do for a reader.
        for (let i = 0; i < 90 && (await total()) < CHUNK * 14; i++) {
          await page.evaluate(`(document.querySelector('#view .tile-grid > .grid-more') ?? document.documentElement).scrollIntoView({ block: 'end' })`);
          await page.waitForTimeout(150);
        }
        const loaded = await total();
        expect(loaded).toBeGreaterThanOrEqual(CHUNK * 14);
        // The list's own length, as the heading counts it (frames are not products).
        const products = Number(await page.textContent('#view .page-head .count'));

        // Which element of the grid is a frame, a tile or a stand in.
        const kinds = async (): Promise<string[]> =>
          (await page.evaluate(`[...document.querySelectorAll('#view .tile-grid > li:not(.grid-more)')].map((li) => li.classList.contains('ps-ad') ? 'ad' : li.classList.contains('tile-gone') ? 'gone' : 'tile')`)) as string[];

        // Product tiles in the list: ads go after adPositions(...) of them.
        const expectedAdIndexes = (n: number): number[] => adPositions(products, '/search').map((p, k) => p + k).filter((i) => i < n);
        const check = async (label: string): Promise<void> => {
          const k = await kinds();
          const ads = k.flatMap((x, i) => (x === 'ad' ? [i] : []));
          expect(ads, label).toEqual(expectedAdIndexes(k.length));
          // A frame is never a stand in, so an ad never goes missing from a long list.
          expect(k.filter((x) => x === 'gone').length, label).toBeGreaterThan(0);
        };
        await check('deep in the list');
        // Gaps between frames, in product tiles, stay 8 to 12 (the first 16 to 20).
        const idx = expectedAdIndexes(loaded);
        expect(idx.length).toBeGreaterThan(8);
        for (let j = 1; j < idx.length; j++) {
          const between = idx[j]! - idx[j - 1]! - 1;
          expect(between).toBeGreaterThanOrEqual(8);
          expect(between).toBeLessThanOrEqual(12);
        }
        expect(idx[0]).toBeGreaterThanOrEqual(16);

        // Up to the top and down again: the same frames in the same places.
        await page.evaluate('window.scrollTo(0, 0)');
        await page.waitForTimeout(500);
        await check('back at the top');
        const topKinds = await kinds();
        expect(topKinds.slice(0, 12).every((x) => x === 'tile')).toBe(true);
        // The products are the ones the list has without the preview, in the same order, frames aside.
        const productIds = (p: Page): Promise<string[]> =>
          p.evaluate(`[...document.querySelectorAll('#view .tile-grid > li:not(.grid-more):not(.ps-ad):not(.tile-gone)')].map((li) => li.querySelector('[data-frag]').dataset.frag)`) as Promise<string[]>;
        const reference = await open('/search', width, 'dark', 844);
        for (let i = 0; i < 30 && (await count(reference.page, '#view .tile-grid > li:not(.grid-more)')) < CHUNK * 2; i++) {
          await reference.page.evaluate(`document.querySelector('#view .tile-grid > .grid-more')?.scrollIntoView({ block: 'end' })`);
          await reference.page.waitForTimeout(150);
        }
        await reference.page.evaluate('window.scrollTo(0, 0)');
        await reference.page.waitForTimeout(400);
        const want = await productIds(reference.page);
        await reference.ctx.close();
        const got = await productIds(page);
        // Far tiles are stand ins, so only the ones near the top are whole in both.
        const common = Math.min(want.length, got.length);
        expect(common).toBeGreaterThanOrEqual(12);
        expect(got.slice(0, common)).toEqual(want.slice(0, common));
        await page.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight * 0.5)`);
        await page.waitForTimeout(500);
        await check('half way');

        // No layout shift to speak of across all that scrolling.
        const cls = (await page.evaluate('window.__cls')) as number;
        expect(cls).toBeLessThan(0.01);
        const sideways = await noSideways(page);
        expect(sideways.sw).toBeLessThanOrEqual(sideways.cw);
        await ctx.close();
      }, 240_000);
    }

    it('the frames do not change the page height when tiles are swapped for stand ins and back', async () => {
      const { page, ctx } = await open('/search?adpreview=1', 1280, 'dark', 844);
      for (let i = 0; i < 60 && (await count(page, '#view .tile-grid > li:not(.grid-more)')) < CHUNK * 10; i++) {
        await page.evaluate(`(document.querySelector('#view .tile-grid > .grid-more') ?? document.documentElement).scrollIntoView({ block: 'end' })`);
        await page.waitForTimeout(150);
      }
      const h = (): Promise<number> => page.evaluate('document.documentElement.scrollHeight') as Promise<number>;
      await page.waitForTimeout(400);
      const deep = await h();
      await page.evaluate(`window.scrollTo(0, ${Math.round(deep * 0.3)})`);
      await page.waitForTimeout(400);
      expect(Math.abs((await h()) - deep)).toBeLessThanOrEqual(2);
      await page.evaluate('window.scrollTo(0, 0)');
      await page.waitForTimeout(400);
      expect(Math.abs((await h()) - deep)).toBeLessThanOrEqual(2);
      await ctx.close();
    }, 120_000);
  });
});

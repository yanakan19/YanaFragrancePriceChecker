import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { auditRoute, launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { adPositions } from '../demo/ads.js';
import { sortFragrances } from '../demo/listSort.js';
import { isOil, isSet } from '../demo/productKind.js';
import { routeToPath, setProductSlugLookup } from '../demo/router.js';
import { chips, closeFilters, isSheetOpen, tick } from './support/filterPanel.js';

/**
 * The Explore Oils and Sets tabs on the built page (docs/GIFT-SETS-AND-OILS-PLAN.md,
 * Phase 1; owner's answers of 2026-10-05). Needs `npm run demo`.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

const MODE_KEY = 'pricesniffs.display';
const CHUNK = 48;
const SETS = DEMO_FRAGRANCES.filter(isSet);
const OILS = DEMO_FRAGRANCES.filter(isOil);
const SET_IDS = new Set(SETS.map((f) => f.id));
const OIL_IDS = new Set(OILS.map((f) => f.id));
const SLUG_OF = new Map(DEMO_FRAGRANCES.map((f) => [f.id, f.slug]));
setProductSlugLookup((id) => SLUG_OF.get(id) ?? null);

describe.skipIf(!built)('the Oils and Sets tabs on the built site', () => {
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

  async function open(path: string, width = 1280, mode: 'light' | 'dark' = 'dark', height = 900): Promise<{ page: Page; ctx: BrowserContext }> {
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
    // The product photos are not part of these checks and would only slow them.
    await ctx.route((u) => u.hostname !== '127.0.0.1' && u.hostname !== 'localhost', (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForSelector('#view h1');
    await page.waitForTimeout(250);
    return { page, ctx };
  }

  const where = (page: Page): string => new URL(page.url()).pathname + new URL(page.url()).search;
  const heading = async (page: Page) => ({
    h1: (await page.textContent('#view h1'))?.trim(),
    count: Number(await page.textContent('#view .page-head .count')),
  });
  const tileIds = (page: Page): Promise<string[]> =>
    page.evaluate(`[...document.querySelectorAll('#view .tile-grid > li:not(.grid-more):not(.ps-ad):not(.tile-gone)')].map((li) => li.querySelector('[data-frag]').dataset.frag)`) as Promise<string[]>;
  const noSideways = (page: Page): Promise<{ sw: number; cw: number }> =>
    page.evaluate(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`) as Promise<{ sw: number; cw: number }>;

  for (const width of [390, 1280]) {
    it(`draws /sets and /oils at ${width} wide with the six tabs in order, their own count, and no bottle`, async () => {
      for (const [route, label, want, own, other] of [
        ['/sets', 'Sets', SETS.length, SET_IDS, OIL_IDS],
        ['/oils', 'Oils', OILS.length, OIL_IDS, SET_IDS],
      ] as const) {
        const { page, ctx } = await open(route, width);
        const h = await heading(page);
        expect(h, route).toEqual({ h1: label, count: want });
        expect(await page.title()).toBe(`PriceSniffs: ${label}`);
        const tabs = (await page.evaluate(`[...document.querySelectorAll('#subnav [data-tab]')].map((b) => [b.textContent.trim(), b.classList.contains('on')])`)) as [string, boolean][];
        expect(tabs.map(([t]) => t), route).toEqual(['All Fragrances', 'All Oils', 'All Sets', 'All Brands', 'All Retailers', 'All Notes']);
        expect(tabs.filter(([, on]) => on).map(([t]) => t), route).toEqual([`All ${label}`]);
        if (width === 1280) {
          // All six labels are visible without scrolling the row.
          const fit = (await page.evaluate(`(() => { const s = document.getElementById('subnav'); return { sw: s.scrollWidth, cw: s.clientWidth }; })()`)) as { sw: number; cw: number };
          expect(fit.sw, `${route}: tab row`).toBeLessThanOrEqual(fit.cw);
        }
        const ids = await tileIds(page);
        expect(ids.length, route).toBe(CHUNK);
        expect(ids.every((id) => own.has(id)), `${route}: every tile is its own kind`).toBe(true);
        expect(ids.some((id) => other.has(id))).toBe(false);
        const s = await noSideways(page);
        expect(s.sw, `${route} ${width}`).toBeLessThanOrEqual(s.cw);
        // The tile says what a set is; an oil says its strength.
        const first = (await page.textContent('#view .tile-grid > li:first-child'))!;
        expect(first).toMatch(route === '/sets' ? /Gift Set/ : /Perfume Oil/);
        await ctx.close();
      }
    }, 90_000);
  }

  it('keeps the tab row in view at 320 wide, with the current tab brought into it', async () => {
    const { page, ctx } = await open('/sets', 320);
    const r = (await page.evaluate(`(() => {
      const s = document.getElementById('subnav'); const on = s.querySelector('.on').getBoundingClientRect(); const box = s.getBoundingClientRect();
      return { right: on.right, left: on.left, boxLeft: box.left, boxRight: box.right, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    })()`)) as { right: number; left: number; boxLeft: number; boxRight: number; sw: number; cw: number };
    expect(r.right).toBeLessThanOrEqual(r.boxRight + 1);
    expect(r.left).toBeGreaterThanOrEqual(r.boxLeft - 1);
    expect(r.sw).toBeLessThanOrEqual(r.cw);
    await ctx.close();
  }, 60_000);

  it('rewrites /gift-sets to /sets', async () => {
    const { page, ctx } = await open('/gift-sets');
    expect(where(page)).toBe('/sets');
    expect((await heading(page)).h1).toBe('Sets');
    expect(await page.evaluate(`document.querySelector('#subnav .on').textContent.trim()`)).toBe('All Sets');
    await ctx.close();
  }, 60_000);

  it('opens a tile on its own product address and comes Back to the tab with its sort, filters, search and place as left', async () => {
    const { page, ctx } = await open('/sets', 390, 'dark', 844);
    await page.selectOption('#tab-sort', 'price-low');
    await page.waitForTimeout(200);
    await tick(page, 'type', 'designer');
    await closeFilters(page);
    const want = sortFragrances(SETS.filter((f) => f.tier === 'designer'), 'price-low');
    expect((await heading(page)).count).toBe(want.length);
    expect(where(page)).toBe('/sets?sort=price-low&type=designer');
    // Scroll down so the place is worth restoring.
    await page.evaluate(`window.scrollTo(0, 2400)`);
    await page.waitForTimeout(500);
    const before = (await page.evaluate(`(() => { const el = [...document.querySelectorAll('#view [data-frag]')].find((e) => e.getBoundingClientRect().top > 120); return { id: el.dataset.frag, top: Math.round(el.getBoundingClientRect().top), y: scrollY }; })()`)) as { id: string; top: number; y: number };
    await page.click(`#view [data-frag="${before.id}"]`);
    await page.waitForSelector('.detail-grid');
    // The product's own address, built through routeToPath.
    expect(where(page)).toBe(routeToPath({ name: 'fragrance', param: before.id, query: {} }));
    expect(where(page)).toMatch(/^\/[a-z0-9_]+$/);
    await page.goBack();
    await page.waitForSelector('#tab-sort');
    await page.waitForTimeout(600);
    expect(where(page)).toBe('/sets?sort=price-low&type=designer');
    expect(await page.inputValue('#tab-sort')).toBe('price-low');
    expect(await chips(page)).toEqual(['type=designer']);
    expect((await heading(page)).count).toBe(want.length);
    const after = (await page.evaluate(`(() => { const el = document.querySelector('#view [data-frag="${before.id}"]'); return el ? { top: Math.round(el.getBoundingClientRect().top), y: scrollY } : null; })()`)) as { top: number; y: number } | null;
    expect(after, 'the tile left from is on screen again').not.toBeNull();
    expect(Math.abs(after!.top - before.top)).toBeLessThanOrEqual(40);
    await ctx.close();
  }, 120_000);

  it('opens a shared link with its filters chosen and shown as chips, and the list ordered as the address says', async () => {
    const { page, ctx } = await open('/oils?sort=price-high&type=mideast&q=musk', 1280);
    expect(await page.inputValue('#tab-sort')).toBe('price-high');
    expect(await chips(page)).toEqual(['type=mideast']);
    expect(await page.inputValue('#tab-search')).toBe('musk');
    expect(await isSheetOpen(page)).toBe(false);
    const filtered = OILS.filter((f) => f.tier === 'mideast' && /musk/i.test(`${f.brand} ${f.name} ${f.concentration}`));
    expect(filtered.length).toBeGreaterThan(0);
    expect((await heading(page)).count).toBe(filtered.length);
    const ids = await tileIds(page);
    expect(ids).toEqual(sortFragrances(filtered, 'price-high').map((f) => f.id).slice(0, ids.length));
    await ctx.close();
  }, 60_000);

  it('drops a filter or sort it does not know, and shows the whole list', async () => {
    const { page, ctx } = await open('/sets?type=nonsense&sort=bogus&stock=maybe', 1280);
    expect((await heading(page)).count).toBe(SETS.length);
    expect(await page.inputValue('#tab-sort')).toBe('stocked');
    expect(where(page)).toBe('/sets');
    await ctx.close();
  }, 60_000);

  it('puts every change in the address, replacing rather than pushing, and Clear All empties it', async () => {
    const { page, ctx } = await open('/sets', 1280);
    const length = (await page.evaluate('history.length')) as number;
    await page.selectOption('#tab-sort', 'az');
    expect(where(page)).toBe('/sets?sort=az');
    await tick(page, 'type', 'niche');
    expect(where(page)).toBe('/sets?sort=az&type=niche');
    await tick(page, 'type', 'mideast');
    expect(where(page)).toBe('/sets?sort=az&type=niche,mideast');
    expect(await page.textContent('#view [data-facets-toggle] .facets-badge')).toBe('2');
    expect((await heading(page)).count).toBe(SETS.filter((f) => f.tier === 'niche' || f.tier === 'mideast').length);
    await closeFilters(page);
    expect(await chips(page)).toEqual(['type=niche', 'type=mideast']);
    await page.click('#view .filter-chips [data-facets-clear]');
    expect(where(page)).toBe('/sets?sort=az');
    expect((await heading(page)).count).toBe(SETS.length);
    expect(await chips(page)).toEqual([]);
    expect(await page.evaluate('history.length')).toBe(length);
    await ctx.close();
  }, 60_000);

  it('searches only within the tab, keeps focus while typing, and says so when nothing matches', async () => {
    const { page, ctx } = await open('/sets', 1280);
    await page.click('#tab-search');
    await page.keyboard.type('rabanne invictus', { delay: 40 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(`document.activeElement && document.activeElement.id`)).toBe('tab-search');
    expect(await page.inputValue('#tab-search')).toBe('rabanne invictus');
    const hits = SETS.filter((f) => ['rabanne', 'invictus'].every((w) => `${f.brand} ${f.name} ${f.concentration}`.toLowerCase().includes(w)));
    expect(hits.length).toBeGreaterThan(0);
    expect((await heading(page)).count).toBe(hits.length);
    expect(where(page)).toBe('/sets?q=rabanne+invictus');
    expect((await tileIds(page)).every((id) => SET_IDS.has(id))).toBe(true);
    // The top bar search is a different box: it is untouched.
    expect(await page.inputValue('#search')).toBe('');
    await page.fill('#tab-search', 'zzzzzzzz');
    await page.waitForTimeout(200);
    expect(await page.textContent('#view .empty-note')).toContain('No set matches that.');
    expect((await heading(page)).count).toBe(0);
    await ctx.close();

    const oils = await open('/oils', 1280);
    await oils.page.fill('#tab-search', 'rabanne');
    await oils.page.waitForTimeout(200);
    expect((await heading(oils.page)).count).toBe(0);
    await oils.ctx.close();
  }, 90_000);

  it('leaves sets and oils out of Search: it counts and lists bottles only, and points to the tabs (Phase 8)', async () => {
    const { page, ctx } = await open('/search?q=rabanne', 1280);
    const match = (f: (typeof DEMO_FRAGRANCES)[number]) => `${f.brand} ${f.name} ${f.concentration}`.toLowerCase().includes('rabanne');
    const bottles = DEMO_FRAGRANCES.filter((f) => match(f) && !isSet(f) && !isOil(f));
    expect(DEMO_FRAGRANCES.some((f) => match(f) && isSet(f))).toBe(true);
    expect((await heading(page)).count).toBe(bottles.length);
    expect(await page.locator('#view .tabs-line a[data-tab-jump="sets"]').count()).toBe(1);
    await ctx.close();
  }, 60_000);

  describe('ad placement, which the ad rules decide and the new lists keep', () => {
    it('puts the frames of /sets and of a filtered /sets where adPositions says, never in the first row', async () => {
      for (const [path, seed, total] of [
        ['/sets?adpreview=1', '/sets', SETS.length],
        ['/sets?sort=az&adpreview=1', '/sets?sort=az', SETS.length],
        ['/oils?adpreview=1', '/oils', OILS.length],
      ] as const) {
        const { page, ctx } = await open(path, 1280);
        const kinds = (await page.evaluate(`[...document.querySelectorAll('#view .tile-grid > li:not(.grid-more)')].map((li) => li.classList.contains('ps-ad') ? 'ad' : 'tile')`)) as string[];
        const ads = kinds.flatMap((k, i) => (k === 'ad' ? [i] : []));
        const expected = adPositions(total, seed).map((p, k) => p + k).filter((i) => i < kinds.length);
        expect(ads.length, path).toBeGreaterThan(0);
        expect(ads, path).toEqual(expected);
        expect(ads[0]!, path).toBeGreaterThanOrEqual(16);
        // The products are the same ones in the same order with the frames taken out.
        const plain = await open(path.replace(/[?&]adpreview=1/, '').replace(/^(\/[a-z]+)&/, '$1?'), 1280);
        expect((await tileIds(page)).slice(0, 30)).toEqual((await tileIds(plain.page)).slice(0, 30));
        await plain.ctx.close();
        await ctx.close();
      }
    }, 120_000);
  });

  for (const mode of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1280]) {
      it(`passes axe with no sideways scroll on /sets and /oils, a filter chosen: ${width} wide, ${mode}`, async () => {
        for (const route of ['/sets', '/oils']) {
          const violations = await auditRoute(browser, port, `${route}?type=niche`, mode, width);
          expect(violations.map((v) => `${v.id}: ${v.nodes.join(' | ')}`), `${route} ${width} ${mode}`).toEqual([]);
          const { page, ctx } = await open(route, width, mode);
          const s = await noSideways(page);
          expect(s.sw, `${route} ${width} ${mode}`).toBeLessThanOrEqual(s.cw);
          await ctx.close();
        }
      }, 120_000);
    }
  }
});

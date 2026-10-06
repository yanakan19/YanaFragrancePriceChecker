import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { auditRoute, launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { isOil, isSet } from '../demo/productKind.js';
import { matchRoute, routeToPath } from '../demo/router.js';
import { RESERVED_WORDS } from '../src/catalogue/productSlug.js';

/**
 * The Explore tab bar and All Fragrances (owner's request, 2026-10-06): two
 * groups of tabs with a gap between them, All Fragrances first and the page's
 * default. Needs `npm run demo` for the browser part.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

const LABELS = ['All Fragrances', 'All Oils', 'All Sets', 'All Brands', 'All Retailers', 'All Notes'];
const BOTTLES = DEMO_FRAGRANCES.filter((f) => !isSet(f) && !isOil(f));

describe('the All Fragrances address', () => {
  it('is /fragrances, and Explore itself opens it', () => {
    expect(matchRoute('/fragrances').name).toBe('fragrances');
    expect(routeToPath({ name: 'fragrances', param: '', query: {} })).toBe('/fragrances');
    expect(matchRoute('/explore').name).toBe('fragrances');
    for (const old of ['/brands', '/retailers', '/notes', '/oils', '/sets']) expect(matchRoute(old).name, old).toBe(old.slice(1));
    expect(matchRoute('/gift-sets').name).toBe('sets');
  });

  it('is a reserved word, so no product address can be it', () => {
    expect(RESERVED_WORDS).toContain('fragrances');
  });
});

describe.skipIf(!built)('the Explore tab bar on the built site', () => {
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

  async function open(path: string, width = 1280, mode: 'light' | 'dark' = 'dark'): Promise<{ page: Page; ctx: BrowserContext }> {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 600, isMobile: width < 600 });
    await ctx.addInitScript(
      ([k, v]: [string, string]) => {
        try {
          localStorage.setItem(k, v);
        } catch {
          /* storage may be unavailable */
        }
      },
      ['pricesniffs.display', mode] as [string, string],
    );
    await ctx.route((u) => u.hostname !== '127.0.0.1' && u.hostname !== 'localhost', (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForSelector('#view h1');
    await page.waitForTimeout(250);
    return { page, ctx };
  }

  const where = (page: Page): Promise<string> => page.evaluate('location.pathname') as Promise<string>;

  it('lists the six tabs in two groups with an aria-hidden gap, as a tablist, at 1280', async () => {
    const { page, ctx } = await open('/fragrances');
    const bar = (await page.evaluate(`(() => {
      const s = document.querySelector('#subnav [role=tablist]');
      return {
        role: s.getAttribute('role'),
        label: s.getAttribute('aria-label'),
        kids: [...s.children].map((c) => c.getAttribute('role') === 'tab' ? c.textContent.trim() : '|' + c.getAttribute('aria-hidden')),
        selected: [...s.querySelectorAll('[role=tab][aria-selected=true]')].map((c) => c.textContent.trim()),
        tabbable: [...s.querySelectorAll('[role=tab]')].filter((c) => c.tabIndex === 0).map((c) => c.textContent.trim()),
        gap: s.querySelector('.subnav-gap').getBoundingClientRect().width,
        fits: document.getElementById('subnav').scrollWidth <= document.getElementById('subnav').clientWidth,
      };
    })()`)) as { role: string; label: string; kids: string[]; selected: string[]; tabbable: string[]; gap: number; fits: boolean };
    expect(bar.role).toBe('tablist');
    expect(bar.label).toBe('Explore');
    expect(bar.kids).toEqual([...LABELS.slice(0, 3), '|true', ...LABELS.slice(3)]);
    expect(bar.selected).toEqual(['All Fragrances']);
    expect(bar.tabbable).toEqual(['All Fragrances']);
    expect(bar.gap).toBeGreaterThan(0);
    expect(bar.fits, 'all six show on a desktop without scrolling').toBe(true);
    await ctx.close();
  }, 60_000);

  it('opens on All Fragrances: bottles only, 48 tiles, its own search, sort and Filters', async () => {
    const { page, ctx } = await open('/fragrances', 390);
    expect((await page.textContent('#view h1'))?.trim()).toBe('Fragrances');
    expect(await page.title()).toBe('PriceSniffs: All Fragrances');
    expect(Number(await page.textContent('#view .page-head .count'))).toBe(BOTTLES.length);
    const ids = (await page.evaluate(`[...document.querySelectorAll('#view .tile-grid > li:not(.grid-more):not(.ps-ad):not(.tile-gone) [data-frag]')].map((e) => e.dataset.frag)`)) as string[];
    expect(ids.length).toBe(48);
    const bottle = new Set(BOTTLES.map((f) => f.id));
    expect(ids.every((id) => bottle.has(id))).toBe(true);
    const sorts = (await page.evaluate(`[...document.querySelectorAll('#tab-sort option')].map((o) => o.textContent.trim())`)) as string[];
    expect(sorts).toEqual(['Most to Least Stocked', 'A to Z', 'Z to A', 'Lowest to Highest Price', 'Highest to Lowest Price', 'Smallest to Largest Size', 'Largest to Smallest Size']);
    await page.click('#view [data-facets-toggle]');
    const groups = (await page.evaluate(`[...document.querySelectorAll('dialog[open] summary')].map((s) => s.textContent.trim().replace(/\\s+/g, ' '))`)) as string[];
    for (const want of ['Brand', 'Shop', 'Size', 'Gender']) expect(groups.some((g) => g.startsWith(want)), want).toBe(true);
    await page.keyboard.press('Escape');
    await page.fill('#tab-search', 'sauvage');
    await page.waitForTimeout(600);
    const n = Number(await page.textContent('#view .page-head .count'));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(BOTTLES.length);
    expect(await where(page)).toBe('/fragrances');
    await ctx.close();
  }, 90_000);

  it('switches tab by click and by keyboard, skipping the gap, and keeps focus on the bar', async () => {
    const { page, ctx } = await open('/fragrances', 1280);
    await page.focus('#subnav [role=tab][aria-selected=true]');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(`document.activeElement.textContent.trim()`)).toBe('All Brands');
    await page.keyboard.press('Enter');
    await page.waitForFunction(`location.pathname === '/brands'`);
    expect(await page.evaluate(`document.activeElement.textContent.trim()`)).toBe('All Brands');
    expect(await page.evaluate(`document.querySelector('#subnav [aria-selected=true]').textContent.trim()`)).toBe('All Brands');
    await page.keyboard.press('End');
    expect(await page.evaluate(`document.activeElement.textContent.trim()`)).toBe('All Notes');
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(`document.activeElement.textContent.trim()`)).toBe('All Fragrances');
    await ctx.close();
  }, 60_000);

  it('opens /explore as All Fragrances and keeps the other addresses', async () => {
    const { page, ctx } = await open('/explore');
    expect(await where(page)).toBe('/fragrances');
    for (const [route, on] of [['/brands', 'All Brands'], ['/retailers', 'All Retailers'], ['/notes', 'All Notes'], ['/oils', 'All Oils'], ['/sets', 'All Sets'], ['/gift-sets', 'All Sets']] as const) {
      await page.evaluate(`(() => { history.pushState(null, '', ${JSON.stringify(route)}); dispatchEvent(new PopStateEvent('popstate', { state: null })); })()`);
      await page.waitForTimeout(150);
      expect(await page.evaluate(`document.querySelector('#subnav [aria-selected=true]').textContent.trim()`), route).toBe(on);
    }
    await ctx.close();
  }, 60_000);

  for (const width of [320, 390]) {
    it(`scrolls the bar sideways at ${width}, the page never, with the current tab in view, and the gap too wherever it fits`, async () => {
      for (const [route, label] of [['/fragrances', 'All Fragrances'], ['/notes', 'All Notes'], ['/retailers', 'All Retailers']] as const) {
        const { page, ctx } = await open(route, width);
        const r = (await page.evaluate(`(() => {
          const s = document.getElementById('subnav'); const box = s.getBoundingClientRect();
          const on = s.querySelector('[aria-selected=true]').getBoundingClientRect();
          const gap = s.querySelector('.subnav-gap').getBoundingClientRect();
          return { label: s.querySelector('[aria-selected=true]').textContent.trim(), left: on.left - box.left, right: box.right - on.right,
            gapIn: gap.right > box.left && gap.left < box.right, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
        })()`)) as { label: string; left: number; right: number; gapIn: boolean; sw: number; cw: number };
        expect(r.label).toBe(label);
        expect(r.left, `${route} ${width}`).toBeGreaterThanOrEqual(-1);
        expect(r.right, `${route} ${width}`).toBeGreaterThanOrEqual(-1);
        expect(r.sw, `${route} ${width}: no sideways page scroll`).toBeLessThanOrEqual(r.cw);
        if (width > 320 || route === '/retailers') expect(r.gapIn, `the gap is visible beside ${label}`).toBe(true);
        await ctx.close();
      }
    }, 90_000);
  }

  it('passes axe in both themes at 320, 390 and 1280', async () => {
    for (const route of ['/fragrances', '/brands']) {
      for (const mode of ['light', 'dark'] as const) {
        for (const width of [320, 390, 1280]) {
          const violations = await auditRoute(browser, port, route, mode, width);
          expect(violations.map((v) => `${v.id}: ${v.help}`), `${route} ${mode} ${width}`).toEqual([]);
        }
      }
    }
  }, 300_000);
});

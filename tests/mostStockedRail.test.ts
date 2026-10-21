import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The home page's Most Stocked block, checked on the built page:
 *   - one row of tiles at every width (owner, 21 Oct 2026): as many whole
 *     tiles as fit across the section (a tile is at least 150px, gaps 12px),
 *     never a second row, never a row that scrolls sideways, and the page
 *     itself never scrolling sideways; the tiles that do not fit are out of
 *     the layout and the tab order, not merely clipped;
 *   - on a desktop window the row sits centred, four or six tiles wide
 *     (owner request, 2026-10-04);
 *   - the link under the heading reads "See All", not a count.
 */
describe.skipIf(!built)('Most Stocked on the home page', () => {
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

  interface RailProbe {
    inMarkup: number;
    shown: number;
    rows: number;
    railWidth: number;
    scrollWidth: number;
    clientWidth: number;
    firstLeft: number;
    lastRight: number;
    hiddenFocusable: number;
    pageScrollWidth: number;
    innerWidth: number;
  }

  const probe = (page: Page): Promise<RailProbe> =>
    page.evaluate(`(() => {
      const rail = document.querySelector('.pop-section .pop-rail');
      const items = [...rail.children];
      const shown = items.filter((el) => getComputedStyle(el).display !== 'none');
      const boxes = shown.map((el) => el.getBoundingClientRect());
      const hidden = items.filter((el) => getComputedStyle(el).display === 'none');
      return {
        inMarkup: items.length,
        shown: shown.length,
        rows: new Set(boxes.map((b) => Math.round(b.top))).size,
        railWidth: rail.getBoundingClientRect().width,
        scrollWidth: rail.scrollWidth,
        clientWidth: rail.clientWidth,
        firstLeft: boxes[0].left,
        lastRight: boxes[boxes.length - 1].right,
        hiddenFocusable: hidden.flatMap((el) => [...el.querySelectorAll('button, a')]).filter((b) => b.offsetParent !== null).length,
        pageScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    })()`) as Promise<RailProbe>;

  /** How many tiles of at least 150px, 12px apart, fit across `width`: the rule the stylesheet's steps follow. */
  const fit = (width: number): number => Math.max(2, Math.min(12, Math.floor((Math.round(width) + 12) / 162)));

  async function openHome(width: number, touch: boolean, theme: 'dark' | 'light' = 'dark'): Promise<{ page: Page; close: () => Promise<void> }> {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(`try { localStorage.setItem('pricesniffs.display', '${theme}'); } catch (e) {}`);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
    await waitForApp(page);
    return { page, close: () => ctx.close() };
  }

  const oneRow = (p: RailProbe): void => {
    expect(p.inMarkup).toBeGreaterThan(p.shown);
    expect(p.shown).toBe(fit(p.railWidth));
    expect(p.rows).toBe(1);
    expect(p.scrollWidth).toBeLessThanOrEqual(p.clientWidth);
    expect(p.hiddenFocusable).toBe(0);
    expect(p.pageScrollWidth).toBeLessThanOrEqual(p.innerWidth);
  };

  for (const [width, touch] of [[375, true], [390, true], [768, true], [1280, true]] as const) {
    it(`is one row of the tiles that fit at ${width} wide on a touch screen, nothing scrolling sideways`, async () => {
      const { page, close: done } = await openHome(width, touch);
      const p = await probe(page);
      oneRow(p);
      // Whole tiles inside the page's gutters.
      expect(p.firstLeft).toBeGreaterThanOrEqual(12);
      expect(p.lastRight).toBeLessThanOrEqual(p.innerWidth - 12);
      await done();
    }, 90_000);
  }

  it('centres one row of six at 1280 wide on a desktop, with no sideways scroll', async () => {
    const { page, close: done } = await openHome(1280, false);
    const p = await probe(page);
    oneRow(p);
    expect(p.shown).toBe(6);
    // Centred: the space left of the first tile equals the space right of the last.
    expect(Math.abs(p.firstLeft - (p.innerWidth - p.lastRight))).toBeLessThanOrEqual(1);
    expect(p.firstLeft).toBeGreaterThan(40);
    await done();
  }, 90_000);

  it('keeps one centred row of four on a narrower desktop window', async () => {
    const { page, close: done } = await openHome(1000, false);
    const p = await probe(page);
    oneRow(p);
    expect(p.shown).toBe(4);
    await done();
  }, 90_000);

  it('puts Most Popular directly under it where the shops publish reviews: one row, no perfume of the row above, See All opening the reviews order', async () => {
    const { page, close: done } = await openHome(390, true);
    const rows = (await page.evaluate(`[...document.querySelectorAll('#view .pop-section')].map((s) => ({
      heading: s.querySelector('h2').textContent.trim(),
      ids: [...s.querySelectorAll('.pop-rail .tile-body')].map((b) => b.getAttribute('data-frag')),
      names: [...s.querySelectorAll('.pop-rail .tile-body')].map((b) => b.getAttribute('aria-label')),
      tops: [...s.querySelectorAll('.pop-rail > li')].filter((li) => getComputedStyle(li).display !== 'none').map((li) => Math.round(li.getBoundingClientRect().top)),
    }))`)) as { heading: string; ids: string[]; names: string[]; tops: number[] }[];
    expect(rows[0]!.heading).toBe('Most Stocked');
    if (rows.length > 1) {
      expect(rows).toHaveLength(2);
      expect(rows[1]!.heading).toBe('Most Popular');
      expect(new Set(rows[1]!.tops).size).toBe(1);
      expect(rows[1]!.tops.length).toBe(rows[0]!.tops.length);
      for (const id of rows[1]!.ids) expect(rows[0]!.ids).not.toContain(id);
      await page.click('.pop-reviewed .see-top');
      await page.waitForSelector('#view .page-head h1');
      expect(await page.textContent('#view .page-head h1')).toBe('Most popular');
      expect(new URL(page.url()).searchParams.get('sort')).toBe('reviewed');
    }
    await done();
  }, 90_000);

  it('says "See All" under the heading, never a count', async () => {
    const { page, close: done } = await openHome(390, true);
    const label = (await page.textContent('.pop-section .see-top'))?.replace(/\s+/g, ' ').trim();
    expect(label).toBe('See All →');
    expect(await page.textContent('#view')).not.toMatch(/Top\s*\d+/i);
    await done();
  }, 90_000);
});

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The home page's Most Stocked block, checked on the built page (owner's
 * request, 2026-10-04):
 *   - on a phone it is one horizontal rail that can be swiped to its very end,
 *     with the last tile whole and the page itself never scrolling sideways;
 *   - on a desktop window the twelve tiles sit in a centred grid;
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
    tiles: number;
    scrollWidth: number;
    clientWidth: number;
    scrollLeft: number;
    railLeft: number;
    railRight: number;
    lastLeft: number;
    lastRight: number;
    firstLeft: number;
    rows: number;
    perFirstRow: number;
    pageScrollWidth: number;
    innerWidth: number;
  }

  const probe = (page: Page): Promise<RailProbe> =>
    page.evaluate(`(() => {
      const rail = document.querySelector('.pop-rail');
      const boxes = [...rail.children].map((el) => el.getBoundingClientRect());
      const r = rail.getBoundingClientRect();
      const tops = boxes.map((b) => Math.round(b.top));
      return {
        tiles: boxes.length,
        scrollWidth: rail.scrollWidth,
        clientWidth: rail.clientWidth,
        scrollLeft: rail.scrollLeft,
        railLeft: r.left,
        railRight: r.right,
        firstLeft: boxes[0].left,
        lastLeft: boxes[boxes.length - 1].left,
        lastRight: boxes[boxes.length - 1].right,
        rows: new Set(tops).size,
        perFirstRow: tops.filter((t) => t === tops[0]).length,
        pageScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    })()`) as Promise<RailProbe>;

  async function openHome(width: number, touch: boolean, theme: 'dark' | 'light' = 'dark'): Promise<{ page: Page; close: () => Promise<void> }> {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(`try { localStorage.setItem('pricesniffs.display', '${theme}'); } catch (e) {}`);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
    await waitForApp(page);
    return { page, close: () => ctx.close() };
  }

  for (const width of [375, 390]) {
    it(`is a rail at ${width} wide that swipes to the end, last tile whole, page not scrolling sideways`, async () => {
      const { page, close: done } = await openHome(width, true);
      const start = await probe(page);
      expect(start.tiles).toBe(12);
      // A rail, not a wrapped grid: one row, and wider than what is shown.
      expect(start.rows).toBe(1);
      expect(start.scrollWidth).toBeGreaterThan(start.clientWidth);
      expect(start.scrollLeft).toBe(0);
      expect(await page.$eval('.pop-rail', (el) => getComputedStyle(el).overflowX)).toBe('auto');
      expect(await page.$eval('.pop-rail', (el) => getComputedStyle(el).scrollSnapType)).toContain('x');

      // A real touch swipe moves the rail and not the page.
      const cdp = await page.context().newCDPSession(page);
      await page.evaluate(`document.querySelector('.pop-rail').scrollIntoView({ block: 'center' })`);
      const box = (await page.locator('.pop-rail').boundingBox())!;
      const y = box.y + 120;
      const swipe = async (): Promise<void> => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: width - 30, y }] });
        for (let k = 1; k <= 10; k++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: width - 30 - k * 28, y }] });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(120);
      };
      await swipe();
      expect((await probe(page)).scrollLeft).toBeGreaterThan(0);

      // And enough of them reach the very end, with the last tile whole on
      // screen and the right gutter after it.
      for (let i = 0; i < 14; i++) await swipe();
      await page.waitForFunction(() => {
        const r = document.querySelector('.pop-rail') as HTMLElement;
        return Math.abs(r.scrollLeft - (r.scrollWidth - r.clientWidth)) < 1;
      });
      const end = await probe(page);
      expect(end.scrollLeft + end.clientWidth).toBeGreaterThanOrEqual(end.scrollWidth - 1);
      expect(end.lastLeft).toBeGreaterThanOrEqual(end.railLeft);
      expect(end.lastRight).toBeLessThanOrEqual(end.railRight - 12);
      expect(end.pageScrollWidth).toBeLessThanOrEqual(end.innerWidth);
      expect(await page.evaluate('window.scrollX')).toBe(0);
      await done();
    }, 90_000);
  }

  it('centres the twelve tiles as two rows of six at 1280 wide, with no sideways scroll', async () => {
    const { page, close: done } = await openHome(1280, false);
    const p = await probe(page);
    expect(p.tiles).toBe(12);
    expect(p.rows).toBe(2);
    expect(p.perFirstRow).toBe(6);
    // Nothing to scroll: the whole grid is in view.
    expect(p.scrollWidth).toBeLessThanOrEqual(p.clientWidth);
    // Centred: the space left of the first tile equals the space right of the last.
    const left = p.firstLeft;
    const right = p.innerWidth - Math.max(...(await page.$$eval('.pop-rail > *', (els) => els.map((e) => e.getBoundingClientRect().right))));
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    expect(left).toBeGreaterThan(40);
    expect(p.pageScrollWidth).toBeLessThanOrEqual(p.innerWidth);
    await done();
  }, 90_000);

  it('keeps the grid centred on a narrower desktop window, in rows of four', async () => {
    const { page, close: done } = await openHome(1000, false);
    const p = await probe(page);
    expect(p.perFirstRow).toBe(4);
    expect(p.rows).toBe(3);
    expect(p.scrollWidth).toBeLessThanOrEqual(p.clientWidth);
    expect(p.pageScrollWidth).toBeLessThanOrEqual(p.innerWidth);
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

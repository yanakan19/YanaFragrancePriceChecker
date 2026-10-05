import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { shareUrl } from '../demo/share.js';
import { routeToPath } from '../demo/router.js';
import { stubSupabase, type FakeAccount } from './support/fakeAccount.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/** Tiles per chunk of an endless list (CHUNK in demo/app.ts). */
const CHUNK = 48;

type Mode = 'dark' | 'light';
const WIDTHS = [320, 390, 1280] as const;
const MODES: Mode[] = ['dark', 'light'];

interface Box { x: number; y: number; width: number; height: number }

/**
 * Where the Share button is and is not, and its pop-up, on the built page, at
 * the three widths and in both themes.
 *   - Product tiles, in every list (including tiles swapped out of a long
 *     list and back): no Share button, and the brand label has the full width.
 *   - The product page: a Share pill beside Save.
 *   - The wishlist rows on /account/wishlist: a small icon button at the end
 *     of each row.
 */

/** Two saved fragrances, the same ids tests/accountPagesBrowser.test.ts saves. */
const READER: FakeAccount = {
  email: 'reader@example.com',
  createdAt: '2026-09-20T10:00:00Z',
  wishlist: [
    { fragrance_id: 'ean-6290360375687', target_price_gbp: 30, added_at: '2026-10-01T09:00:00Z' },
    { fragrance_id: 'ean-3349668508587', target_price_gbp: null, added_at: '2026-10-03T09:00:00Z' },
  ],
  priceAlerts: true,
};
const productPath = (id: string): string => routeToPath({ name: 'fragrance', param: id, query: {} });

describe.skipIf(!built)('the Share button and pop-up', () => {
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

  async function open(
    route: string,
    opts: { width?: number; mode?: Mode; init?: string; routes?: (ctx: BrowserContext) => Promise<void>; account?: FakeAccount } = {},
  ): Promise<{ context: BrowserContext; page: Page }> {
    const width = opts.width ?? 390;
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 600, isMobile: width < 600 });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await context.addInitScript((m: string) => {
      try { localStorage.setItem('pricesniffs.display', m); } catch { /* fine */ }
    }, opts.mode ?? 'dark');
    if (opts.init) await context.addInitScript(opts.init);
    // Remote shop photos are not part of this check and would only slow it.
    await context.route((u) => u.hostname !== '127.0.0.1' && u.hostname !== 'localhost', (r) => r.abort());
    if (opts.routes) await opts.routes(context);
    if (opts.account) await stubSupabase(context, opts.account, null);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForTimeout(300);
    return { context, page };
  }

  const ev = <T>(page: Page, expr: string): Promise<T> => page.evaluate(expr) as Promise<T>;
  const box = async (page: Page, sel: string): Promise<Box> => {
    const b = await page.locator(sel).first().boundingBox();
    if (!b) throw new Error(`no box for ${sel}`);
    return b;
  };
  const overlap = (a: Box, b: Box): boolean =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const pathname = (page: Page): Promise<string> => ev(page, 'location.pathname');
  const dialogOpen = (page: Page): Promise<boolean> => ev(page, `!!document.querySelector('#ps-share')?.open`);
  const linkValue = (page: Page): Promise<string> => ev(page, `document.querySelector('#ps-share-link').value`);
  const noSideScroll = async (page: Page): Promise<void> => {
    expect(await ev<boolean>(page, 'document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    expect(await ev<boolean>(page, `(() => { const d = document.querySelector('#ps-share'); return !d?.open || d.scrollWidth <= d.clientWidth; })()`)).toBe(true);
  };
  const noViolations = async (page: Page): Promise<void> => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  };

  /** Opens the pop-up from `selector`, checks it, and leaves it open. */
  async function openFrom(page: Page, selector: string, expectedId: string): Promise<void> {
    await page.locator(selector).first().click();
    await page.waitForSelector('#ps-share[open]');
    expect(await linkValue(page)).toBe(shareUrl(expectedId));
  }

  /** Taps the first tile on the page and waits for its product page: returns the product's id. */
  async function openFirstProduct(page: Page): Promise<string> {
    const id = (await page.locator('#view .tile .tile-body').first().getAttribute('data-frag'))!;
    await page.locator('#view .tile .tile-body').first().click();
    await page.waitForSelector('#view .share-page');
    return id;
  }

  /** Share buttons anywhere in the page's lists: tiles, rails, stand ins. */
  const SHARE_IN_LISTS = '#view .tile-grid .share-btn, #view .tile-grid [data-share], #view .pop-item .share-btn, #view .pop-item [data-share], #view .tile [aria-label^="Share "]';

  /**
   * The tiles matching `tileSel` have no Share button, and each brand label
   * uses the tile's full inner width: nothing narrows it, so it is cut short
   * only when the brand name is itself wider than the tile.
   */
  async function expectPlainTiles(page: Page, tileSel = '#view .tile'): Promise<number> {
    const r = await ev<{ tiles: number; share: number; clipped: string[]; narrowed: string[] }>(page, `(() => {
      const tiles = [...document.querySelectorAll('${tileSel}')];
      const clipped = [];
      const narrowed = [];
      for (const t of tiles) {
        const b = t.querySelector('.phead-brand');
        if (!b) continue;
        const tr = t.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const cs = getComputedStyle(t);
        const inner = tr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
        if (b.scrollWidth > b.clientWidth + 1) clipped.push(b.textContent.trim());
        // A label that is cut short while narrower than the tile's inner width was held back by something.
        if (b.scrollWidth > b.clientWidth + 1 && br.width < inner - 1) narrowed.push(b.textContent.trim());
      }
      return {
        tiles: tiles.length,
        share: document.querySelectorAll('${SHARE_IN_LISTS}').length,
        clipped, narrowed,
      };
    })()`);
    expect(r.tiles).toBeGreaterThan(0);
    expect(r.share, 'no Share button on any tile').toBe(0);
    expect(r.narrowed, 'brand label held back by something other than the tile edge').toEqual([]);
    return r.tiles;
  }

  for (const width of WIDTHS) {
    for (const mode of MODES) {
      it(`no tile button, product page pop-up and wishlist rows at ${width}px, ${mode}`, async () => {
        const { context, page } = await open('/deals', { width, mode });
        await page.waitForSelector('#view .tile-grid .tile');

        // Tiles: no Share button at all, the brand label has its full width.
        await expectPlainTiles(page);
        expect(await ev<number>(page, `document.querySelectorAll('#view .tile > *').length`)).toBe(
          await ev<number>(page, `document.querySelectorAll('#view .tile > .phead-brand, #view .tile > .tile-body').length`),
        );
        await noSideScroll(page);

        // Tapping a tile still opens the product, and the product page has the button.
        const id = (await page.locator('#view .tile .tile-body').first().getAttribute('data-frag'))!;
        await page.locator('#view .tile .tile-body').first().click();
        await page.waitForSelector('#view .share-page');
        expect(await ev<number>(page, `document.querySelectorAll('#view .share-btn').length`)).toBe(1);
        const pageBtn = await box(page, '#view .share-page');
        expect(pageBtn.height).toBeGreaterThanOrEqual(44);
        expect(await ev<string>(page, `document.querySelector('#view .share-page').getAttribute('aria-label')`)).toMatch(/^Share \S/);
        expect(await ev<string>(page, `document.querySelector('#view .share-page').textContent.trim()`)).toBe('Share');
        // The price boxes sit below the row, not under it.
        const boxes = page.locator('#view .price-boxes');
        if (await boxes.count()) expect(overlap(pageBtn, (await boxes.first().boundingBox())!)).toBe(false);
        await noSideScroll(page);

        // Tapping it opens the pop-up and stays on the product.
        const productRoute = await pathname(page);
        await openFrom(page, '#view .share-page', id);
        expect(await pathname(page)).toBe(productRoute);
        expect(await ev<string>(page, `document.querySelector('#ps-share-title').textContent`)).toBe('Share');
        expect(await ev<string>(page, `document.querySelector('.share-product').textContent`)).toMatch(/\S/);

        // The pop-up: link field, Copy beside it, then the targets.
        const field = await box(page, '#ps-share-link');
        const copy = await box(page, '[data-share-copy]');
        expect(copy.x).toBeGreaterThanOrEqual(field.x + field.width);
        expect(Math.abs(copy.y - field.y)).toBeLessThan(2);
        expect(copy.height).toBeGreaterThanOrEqual(44);
        expect(await ev<boolean>(page, `document.querySelector('#ps-share-link').readOnly`)).toBe(true);

        const url = shareUrl(id);
        const targets = await ev<{ wa: string; sc: string; x: string; rel: string[]; tgt: string[]; labels: string[] }>(page, `(() => {
          const as = [...document.querySelectorAll('#ps-share .share-targets a')];
          return {
            wa: as[0].href, sc: as[1].href, x: as[2].href,
            rel: as.map((a) => a.getAttribute('rel')), tgt: as.map((a) => a.getAttribute('target')),
            labels: [...document.querySelectorAll('#ps-share .share-target span:not(.sr)')].map((s) => s.textContent),
          };
        })()`);
        expect(targets.rel).toEqual(['noopener noreferrer', 'noopener noreferrer', 'noopener noreferrer']);
        expect(targets.tgt).toEqual(['_blank', '_blank', '_blank']);
        expect(targets.labels.slice(0, 4)).toEqual(['Instagram', 'WhatsApp', 'Snapchat', 'X']);
        expect(targets.wa.startsWith('https://wa.me/?text=')).toBe(true);
        const waText = decodeURIComponent(targets.wa.slice('https://wa.me/?text='.length));
        expect(waText.endsWith(` ${url}`)).toBe(true);
        expect(waText).toMatch(/ on PriceSniffs /);
        const xUrl = new URL(targets.x);
        expect(`${xUrl.origin}${xUrl.pathname}`).toBe('https://twitter.com/intent/tweet');
        expect(xUrl.searchParams.get('url')).toBe(url);
        expect(waText).toBe(`${xUrl.searchParams.get('text')} ${url}`);
        expect(new URL(targets.sc).searchParams.get('attachmentUrl')).toBe(url);
        expect(`${new URL(targets.sc).origin}${new URL(targets.sc).pathname}`).toBe('https://www.snapchat.com/scan');
        expect(`${targets.wa}${targets.x}${targets.sc}`).not.toMatch(/awin|utm_|clickref/i);

        // Within the screen, no sideways scroll, axe clean with it open.
        const dlg = await box(page, '#ps-share');
        expect(dlg.x).toBeGreaterThanOrEqual(0);
        expect(dlg.x + dlg.width).toBeLessThanOrEqual(width);
        await noSideScroll(page);
        await noViolations(page);

        // Esc closes it, and focus goes back to the button.
        await page.keyboard.press('Escape');
        expect(await dialogOpen(page)).toBe(false);
        expect(await ev<boolean>(page, `document.activeElement?.classList.contains('share-page')`)).toBe(true);

        // So does a tap on the dimmed backdrop; a tap inside does not.
        await openFrom(page, '#view .share-page', id);
        await page.locator('#ps-share .share-product').click();
        expect(await dialogOpen(page)).toBe(true);
        await page.mouse.click(2, 2);
        expect(await dialogOpen(page)).toBe(false);
        await noViolations(page);

        // The same product by its own address.
        await page.goto(`http://127.0.0.1:${port}${productPath(id)}`, { waitUntil: 'load' });
        await waitForApp(page);
        await page.waitForSelector('#view .share-page');
        await openFrom(page, '#view .share-page', id);
        await page.keyboard.press('Escape');
        await context.close();

        // The wishlist page, signed in: a Share button at the end of each row.
        const w = await open('/account/wishlist', { width, mode, account: READER });
        try {
          await w.page.waitForSelector('#view .wishlist-row');
          const rows = await ev<{
            n: number; names: string[]; share: number; sharesPerRow: number[];
            rowOverlap: boolean; sideWidth: number; textMin: number; endOk: boolean; wraps: boolean;
          }>(w.page, `(() => {
            const rows = [...document.querySelectorAll('#view .wishlist-row')];
            const side = (r) => r.querySelector('.wishlist-side').getBoundingClientRect();
            return {
              n: rows.length,
              names: rows.map((r) => r.querySelector('[data-share]').getAttribute('aria-label')),
              share: document.querySelectorAll('#view [data-share]').length,
              sharesPerRow: rows.map((r) => r.querySelectorAll('[data-share]').length),
              rowOverlap: rows.some((r) => {
                const a = r.querySelector('[data-share]').getBoundingClientRect();
                const b = r.querySelector('[data-wishlist-remove]').getBoundingClientRect();
                return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
              }),
              // The end column is no wider than the Remove button alone was (34px).
              sideWidth: Math.max(...rows.map((r) => side(r).width)),
              // The width the row's text has left.
              textMin: Math.min(...rows.map((r) => r.querySelector('.shop-row-text').getBoundingClientRect().width)),
              // The button sits inside its row, after the row's own button.
              endOk: rows.every((r) => {
                const a = r.querySelector('[data-share]').getBoundingClientRect();
                const rr = r.getBoundingClientRect();
                return a.right <= rr.right + 0.5 && a.left >= rr.left && a.top >= rr.top - 0.5 && a.bottom <= rr.bottom + 0.5
                  && a.left >= r.querySelector('.shop-row').getBoundingClientRect().right - 2;
              }),
              // Share is beside the row, not wrapped under it.
              wraps: rows.some((r) => r.querySelector('[data-share]').getBoundingClientRect().top > r.querySelector('.shop-row').getBoundingClientRect().bottom),
            };
          })()`);
          expect(rows.n).toBe(2);
          expect(rows.share).toBe(2);
          expect(rows.sharesPerRow).toEqual([1, 1]);
          for (const n of rows.names) expect(n).toMatch(/^Share \S/);
          const rowNames = await ev<string[]>(w.page, `[...document.querySelectorAll('#view .wishlist-row .shop-row')].map((b) => b.querySelector('.shop-row-name').textContent.trim())`);
          expect(rows.names).toEqual(rowNames.map((n) => `Share ${n}`));
          expect(rows.rowOverlap, 'Share and Remove do not overlap').toBe(false);
          expect(rows.sideWidth, 'no wider than Remove alone').toBeLessThanOrEqual(34.5);
          expect(rows.endOk).toBe(true);
          expect(rows.wraps).toBe(false);
          // At 320 the row's text keeps the width it had with Remove alone: Share is stacked above Remove, not beside it.
          if (width === 320) expect(rows.textMin).toBeGreaterThanOrEqual(130);
          const wTarget = await box(w.page, '#view .wishlist-row [data-share]');
          expect(wTarget.width).toBeGreaterThanOrEqual(34);
          expect(wTarget.height).toBeGreaterThanOrEqual(34);
          await noSideScroll(w.page);
          await noViolations(w.page);

          // Tapping it opens the pop-up for that row's product, and does not open the product.
          const wid = (await w.page.locator('#view .wishlist-row .shop-row').first().getAttribute('data-frag'))!;
          await openFrom(w.page, '#view .wishlist-row [data-share]', wid);
          expect(await pathname(w.page)).toBe('/account/wishlist');
          expect(await ev<string>(w.page, `document.querySelector('.share-product').textContent`)).toMatch(/\S/);
          expect(await ev<string>(w.page, `document.querySelector('#ps-share .share-targets a').href`)).toMatch(/^https:\/\/wa\.me\/\?text=/);
          await noSideScroll(w.page);
          await noViolations(w.page);
          await w.page.keyboard.press('Escape');
          expect(await dialogOpen(w.page)).toBe(false);
          expect(await ev<boolean>(w.page, `document.activeElement?.hasAttribute('data-share')`)).toBe(true);

          // The second row shares its own product, not the first's.
          const second = (await w.page.locator('#view .wishlist-row .shop-row').nth(1).getAttribute('data-frag'))!;
          expect(second).not.toBe(wid);
          await w.page.locator('#view .wishlist-row [data-share]').nth(1).click();
          await w.page.waitForSelector('#ps-share[open]');
          expect(await linkValue(w.page)).toBe(shareUrl(second));
          await w.page.keyboard.press('Escape');

          // Remove still works and still names its own product.
          await w.page.click('#view .wishlist-row [data-wishlist-remove]');
          await w.page.waitForTimeout(200);
          expect(await w.page.locator('#view .wishlist-row').count()).toBe(1);
          expect(await w.page.locator('#view .wishlist-row [data-share]').count()).toBe(1);
        } finally {
          await w.context.close();
        }
      }, 180_000);
    }
  }

  it('has no Share button on the tiles of any list: home rail, search, deals, brand, note, shop', async () => {
    const { context, page } = await open('/');
    await page.waitForSelector('#view .pop-item .tile');
    // The Most Stocked rail on Home.
    expect(await expectPlainTiles(page, '#view .pop-item .tile')).toBeGreaterThan(0);

    for (const route of ['/search', '/deals', '/brands/dior', '/notes/vanilla']) {
      await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
      await waitForApp(page);
      await page.waitForSelector('#view .tile-grid .tile');
      expect(await expectPlainTiles(page), route).toBeGreaterThan(0);
      expect(await ev<number>(page, `document.querySelectorAll('#view .share-btn, #view [data-share]').length`), route).toBe(0);
    }
    // A shop's page: the first shop in the directory.
    await page.goto(`http://127.0.0.1:${port}/retailers`, { waitUntil: 'load' });
    await waitForApp(page);
    const firstShop = await ev<string | null>(page, `document.querySelector('#view [data-retailer]')?.getAttribute('data-retailer') ?? null`);
    expect(firstShop).not.toBeNull();
    await page.locator('#view [data-retailer]').first().click();
    await page.waitForSelector('#view .tile-grid .tile');
    expect(await expectPlainTiles(page)).toBeGreaterThan(0);
    expect(await ev<number>(page, `document.querySelectorAll('#view .share-btn, #view [data-share]').length`)).toBe(0);
    await context.close();
  }, 120_000);

  it('opens the product from a tile and shares from there', async () => {
    const { context, page } = await open('/search');
    await page.waitForSelector('#view .tile-grid .tile');
    const id = await openFirstProduct(page);
    await openFrom(page, '#view .share-page', id);
    await page.keyboard.press('Escape');
    await context.close();
  }, 60_000);

  it('copies the link to the clipboard, says Copied for about two seconds, then goes back', async () => {
    const { context, page } = await open('/deals');
    const id = await openFirstProduct(page);
    await openFrom(page, '#view .share-page', id);
    // Focus lands on Copy, so Enter copies for a keyboard reader.
    expect(await ev<boolean>(page, `document.activeElement?.hasAttribute('data-share-copy')`)).toBe(true);
    expect(await ev<string>(page, `document.querySelector('.share-copy-label').textContent`)).toBe('Copy');
    await page.locator('[data-share-copy]').click();
    await page.waitForFunction(`document.querySelector('.share-copy-label').textContent === 'Copied'`);
    expect(await ev<string>(page, 'navigator.clipboard.readText()')).toBe(shareUrl(id));
    expect(await ev<boolean>(page, `document.querySelector('[data-share-copy]').classList.contains('is-copied')`)).toBe(true);
    // The tick replaces the copy icon.
    expect(await ev<string>(page, `getComputedStyle(document.querySelector('.share-copy-ico-tick')).display`)).not.toBe('none');
    expect(await ev<string>(page, `getComputedStyle(document.querySelector('.share-copy-ico-copy')).display`)).toBe('none');
    // Announced politely.
    expect(await ev<string>(page, `document.querySelector('#ps-share-status').getAttribute('aria-live')`)).toBe('polite');
    expect(await ev<string>(page, `document.querySelector('#ps-share-status').textContent`)).toBe('Link copied');
    await page.waitForFunction(`document.querySelector('.share-copy-label').textContent === 'Copy'`, null, { timeout: 4_000 });
    expect(await ev<boolean>(page, `document.querySelector('[data-share-copy]').classList.contains('is-copied')`)).toBe(false);
    await context.close();
  }, 60_000);

  it('falls back to select and copy where the clipboard API is missing', async () => {
    const { context, page } = await open('/deals', {
      init: `Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
             window.__copied = [];
             document.execCommand = (cmd) => { if (cmd !== 'copy') return false; window.__copied.push(getSelection().toString() || document.activeElement.value.slice(document.activeElement.selectionStart, document.activeElement.selectionEnd)); return true; };`,
    });
    const id = await openFirstProduct(page);
    await openFrom(page, '#view .share-page', id);
    await page.locator('[data-share-copy]').click();
    await page.waitForFunction(`document.querySelector('.share-copy-label').textContent === 'Copied'`);
    expect(await ev<string[]>(page, 'window.__copied')).toEqual([shareUrl(id)]);
    await context.close();
  }, 60_000);

  it('selects the link for copying by hand when copying is blocked', async () => {
    const { context, page } = await open('/deals', {
      init: `Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('no', 'NotAllowedError')) }, configurable: true });
             document.execCommand = () => false;`,
    });
    const id = await openFirstProduct(page);
    await openFrom(page, '#view .share-page', id);
    await page.locator('[data-share-copy]').click();
    await page.waitForFunction(`document.querySelector('#ps-share-note').textContent !== ''`);
    expect(await ev<string>(page, `document.querySelector('#ps-share-note').textContent`)).toMatch(/blocked.*selected/);
    expect(await ev<string>(page, `document.querySelector('.share-copy-label').textContent`)).toBe('Copy');
    expect(await ev<string>(page, `(() => { const i = document.querySelector('#ps-share-link'); return i.value.slice(i.selectionStart, i.selectionEnd); })()`)).toBe(shareUrl(id));
    expect(await ev<boolean>(page, `document.activeElement?.id === 'ps-share-link'`)).toBe(true);
    await context.close();
  }, 60_000);

  it('without Web Share, Instagram copies the link and says so, and More is not shown', async () => {
    const { context, page } = await open('/deals', {
      init: `Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });`,
    });
    const id = await openFirstProduct(page);
    await openFrom(page, '#view .share-page', id);
    expect(await page.locator('[data-share-more]').count()).toBe(0);
    expect(await page.locator('#ps-share .share-target').count()).toBe(4);
    await page.locator('[data-share-instagram]').click();
    await page.waitForFunction(`document.querySelector('#ps-share-note').textContent !== ''`);
    expect(await ev<string>(page, `document.querySelector('#ps-share-note').textContent`)).toBe('Link copied. Paste it into Instagram.');
    expect(await ev<string>(page, 'navigator.clipboard.readText()')).toBe(shareUrl(id));
    expect(await ev<string>(page, `document.querySelector('#ps-share-note').getAttribute('aria-live')`)).toBe('polite');
    // The note names what happened and no more: it does not claim anything was posted.
    expect(await ev<string>(page, `document.querySelector('#ps-share-note').textContent`)).not.toMatch(/posted|shared|sent/i);
    await noViolations(page);
    await context.close();
  }, 60_000);

  it('with Web Share, Instagram and More open the system share sheet with the link', async () => {
    const { context, page } = await open('/deals', {
      init: `window.__shared = []; Object.defineProperty(navigator, 'share', { value: (d) => { window.__shared.push(d); return Promise.resolve(); }, configurable: true });`,
    });
    const id = await openFirstProduct(page);
    await openFrom(page, '#view .share-page', id);
    expect(await page.locator('[data-share-more]').count()).toBe(1);
    expect(await page.locator('#ps-share .share-target').count()).toBe(5);
    await noViolations(page);
    await page.locator('[data-share-more]').click();
    await page.locator('[data-share-instagram]').click();
    await page.waitForFunction('window.__shared.length === 2');
    const shared = await ev<{ title: string; text: string; url: string }[]>(page, 'window.__shared');
    for (const s of shared) {
      expect(s.url).toBe(shareUrl(id));
      expect(s.title).toMatch(/\S/);
      expect(s.text).toMatch(/ on PriceSniffs/);
      expect(s.text).not.toContain(s.url);
    }
    // Instagram did not copy anything or say it had.
    expect(await ev<string>(page, `document.querySelector('#ps-share-note').textContent`)).toBe('');
    await context.close();
  }, 60_000);

  it('does nothing noisy when the reader cancels the system share sheet', async () => {
    const { context, page } = await open('/deals', {
      init: `Object.defineProperty(navigator, 'share', { value: () => Promise.reject(new DOMException('cancelled', 'AbortError')), configurable: true });`,
    });
    const id = await openFirstProduct(page);
    await openFrom(page, '#view .share-page', id);
    await page.locator('[data-share-instagram]').click();
    await page.waitForTimeout(300);
    expect(await ev<string>(page, `document.querySelector('#ps-share-note').textContent`)).toBe('');
    expect(await dialogOpen(page)).toBe(true);
    await context.close();
  }, 60_000);

  it('leaves the price out of the text for a product with no current prices', async () => {
    const id = 'sh-test-dormant';
    const { context, page } = await open(productPath(id), {
      routes: async (ctx) => {
        // A fixture product, served in place of the empty dormant file, so the
        // page for a product with no current prices can be opened here.
        await ctx.route(/\/data\/dormant\.[0-9a-f]+\.json$/, (r) =>
          r.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              DORMANT_PRODUCTS: {
                [id]: { slug: 'test_house_quiet_ember_and_co_75ml', brand: 'Test House', name: "Quiet Ember & Co", concentration: 'Eau de Parfum', sizeMl: 75, ean: null, image: null, older: [] },
              },
              ID_ALIASES: {},
              SLUG_ALIASES: {},
            }),
          }),
        );
      },
    });
    await page.waitForSelector('#view .share-page');
    expect(await ev<string>(page, `document.querySelector('#view .hero-price').textContent`)).toBe('No Current Prices');
    await openFrom(page, '#view .share-page', id);
    const wa = await ev<string>(page, `document.querySelector('#ps-share .share-targets a').href`);
    expect(decodeURIComponent(wa.slice('https://wa.me/?text='.length))).toBe(`Test House Quiet Ember & Co 75ml on PriceSniffs ${shareUrl(id)}`);
    expect(wa).not.toContain('%C2%A3');
    await context.close();
  }, 60_000);

  it('puts the price, the shop and delivered in the text of a product that has a price', async () => {
    const { context, page } = await open('/deals');
    const id = await openFirstProduct(page);
    await openFrom(page, '#view .share-page', id);
    const wa = await ev<string>(page, `document.querySelector('#ps-share .share-targets a').href`);
    const text = decodeURIComponent(wa.slice('https://wa.me/?text='.length));
    // Every Deals product has a buyable offer, so the price part is always there.
    expect(text).toMatch(/, (from £\d+\.\d\d delivered at .+ on PriceSniffs|£\d+\.\d\d at .+ with delivery not stated, on PriceSniffs) /);
    await context.close();
  }, 60_000);

  describe('in the endless lists, where far tiles are empty stand ins', () => {
    const realTiles = `#view .tile-grid > li:not(.grid-more):not(.tile-gone) .tile`;

    it('has no Share button on tiles drawn after scrolling far, or on stand ins, and tiles still open', async () => {
      const { context, page } = await open('/search', { width: 390 });
      let count = 0;
      for (let i = 0; i < 80 && count < CHUNK * 20; i++) {
        await page.evaluate(`(document.querySelector('#view .tile-grid > .grid-more') ?? document.documentElement).scrollIntoView({ block: 'end' })`);
        await page.waitForTimeout(150);
        count = await ev<number>(page, `document.querySelectorAll('#view .tile-grid > li:not(.grid-more)').length`);
      }
      expect(count).toBeGreaterThanOrEqual(CHUNK * 20);
      await page.waitForTimeout(400);

      const stats = await ev<{ real: number; stands: number; buttons: number }>(page, `({
        real: document.querySelectorAll('${realTiles}').length,
        stands: document.querySelectorAll('#view .tile-grid > li.tile-gone').length,
        buttons: document.querySelectorAll('#view .tile-grid .share-btn, #view .tile-grid [data-share]').length,
      })`);
      // Far tiles are stand ins now; neither they nor the tiles still drawn carry a button.
      expect(stats.stands).toBeGreaterThan(0);
      expect(stats.real).toBeGreaterThan(0);
      expect(stats.buttons).toBe(0);
      await expectPlainTiles(page, realTiles);
      await noSideScroll(page);

      // The tile on screen after the scroll still opens its own product.
      const onScreen = await ev<string | null>(page, `(() => {
        for (const t of document.querySelectorAll('${realTiles}')) {
          const r = t.querySelector('.tile-body').getBoundingClientRect();
          if (r.top > 60 && r.bottom < window.innerHeight) return t.querySelector('.tile-body').dataset.frag;
        }
        return null;
      })()`);
      expect(onScreen).not.toBeNull();
      await page.locator(`#view .tile-body[data-frag="${onScreen}"]`).click();
      await page.waitForSelector('#view .share-page');
      await openFrom(page, '#view .share-page', onScreen!);
      await page.keyboard.press('Escape');

      // Back in the list at the top, the tiles that were swapped out are whole again, still without buttons.
      await page.goBack();
      await page.waitForSelector('#view .tile-grid .tile');
      await page.evaluate('window.scrollTo(0, 0)');
      await page.waitForTimeout(500);
      const top = await ev<{ real: number; buttons: number }>(page, `({
        real: document.querySelectorAll('${realTiles}').length,
        buttons: document.querySelectorAll('#view .tile-grid .share-btn, #view .tile-grid [data-share]').length,
      })`);
      expect(top.real).toBeGreaterThan(0);
      expect(top.buttons).toBe(0);
      await expectPlainTiles(page, realTiles);
      await context.close();
    }, 180_000);
  });
});

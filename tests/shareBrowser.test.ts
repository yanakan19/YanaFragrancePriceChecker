import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { shareUrl } from '../demo/share.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/** Tiles per chunk of an endless list (CHUNK in demo/app.ts). */
const CHUNK = 48;

type Mode = 'dark' | 'light';
const WIDTHS = [320, 390, 1280] as const;
const MODES: Mode[] = ['dark', 'light'];

interface Box { x: number; y: number; width: number; height: number }

/**
 * The Share button and its pop-up on the built page: on every product tile
 * (including tiles that were swapped out of a long list and back) and on the
 * product page, at the three widths and in both themes.
 */
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
    opts: { width?: number; mode?: Mode; init?: string; routes?: (ctx: BrowserContext) => Promise<void> } = {},
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

  for (const width of WIDTHS) {
    for (const mode of MODES) {
      it(`tile, pop-up and product page at ${width}px, ${mode}`, async () => {
        const { context, page } = await open('/deals', { width, mode });
        await page.waitForSelector('#view .tile-grid .share-tile');

        // One button on every tile, named for its product, with a 44px target.
        const counts = await ev<{ tiles: number; buttons: number; named: number }>(page, `({
          tiles: document.querySelectorAll('#view .tile-grid .tile').length,
          buttons: document.querySelectorAll('#view .tile-grid .tile .share-tile').length,
          named: [...document.querySelectorAll('#view .tile-grid .tile')].filter((t) => {
            const b = t.querySelector('.share-tile');
            const body = t.querySelector('.tile-body');
            return b && body && b.getAttribute('aria-label') === 'Share ' + body.getAttribute('aria-label');
          }).length,
        })`);
        expect(counts.tiles).toBeGreaterThan(0);
        expect(counts.buttons).toBe(counts.tiles);
        expect(counts.named).toBe(counts.tiles);
        const target = await box(page, '#view .tile .share-tile');
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);

        // It sits in the corner without crowding the brand label or the price.
        const tile = await box(page, '#view .tile');
        expect(target.x + target.width).toBeLessThanOrEqual(tile.x + tile.width + 0.5);
        expect(target.y).toBeGreaterThanOrEqual(tile.y - 0.5);
        const circle: Box = { x: target.x + 10, y: target.y + 8, width: 28, height: 28 };
        expect(overlap(circle, await box(page, '#view .tile .phead-brand'))).toBe(false);
        expect(overlap(target, await box(page, '#view .tile .tile-price'))).toBe(false);
        await noSideScroll(page);

        const id = (await page.locator('#view .tile .tile-body').first().getAttribute('data-frag'))!;

        // Tapping it opens the pop-up and never the product.
        await openFrom(page, '#view .tile .share-tile', id);
        expect(await pathname(page)).toBe('/deals');
        expect(await ev<number>(page, `document.querySelectorAll('#view .detail-grid').length`)).toBe(0);
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
        expect(await ev<boolean>(page, `document.activeElement?.classList.contains('share-tile')`)).toBe(true);

        // So does a tap on the dimmed backdrop; a tap inside does not.
        await openFrom(page, '#view .tile .share-tile', id);
        await page.locator('#ps-share .share-product').click();
        expect(await dialogOpen(page)).toBe(true);
        await page.mouse.click(2, 2);
        expect(await dialogOpen(page)).toBe(false);

        // The product page has its own button, beside Save when that is shown.
        await page.goto(`http://127.0.0.1:${port}/fragrance/${encodeURIComponent(id)}`, { waitUntil: 'load' });
        await waitForApp(page);
        await page.waitForSelector('#view .share-page');
        const pageBtn = await box(page, '#view .share-page');
        expect(pageBtn.height).toBeGreaterThanOrEqual(44);
        expect(await ev<string>(page, `document.querySelector('#view .share-page').getAttribute('aria-label')`)).toMatch(/^Share \S/);
        expect(await ev<string>(page, `document.querySelector('#view .share-page').textContent.trim()`)).toBe('Share');
        // The price boxes sit below the row, not under it.
        const boxes = page.locator('#view .price-boxes');
        if (await boxes.count()) expect(overlap(pageBtn, (await boxes.first().boundingBox())!)).toBe(false);
        await noSideScroll(page);
        await openFrom(page, '#view .share-page', id);
        await noSideScroll(page);
        await noViolations(page);
        await page.keyboard.press('Escape');
        expect(await dialogOpen(page)).toBe(false);
        expect(await ev<boolean>(page, `document.activeElement?.classList.contains('share-page')`)).toBe(true);
        expect(await pathname(page)).toBe(`/fragrance/${encodeURIComponent(id)}`);
        await context.close();
      }, 120_000);
    }
  }

  it('shares the same link from the home rail, Explore, a brand, a note and search', async () => {
    const { context, page } = await open('/');
    await page.waitForSelector('#view .pop-item .share-tile');
    expect(await ev<number>(page, `document.querySelectorAll('#view .pop-item .tile').length`)).toBe(
      await ev<number>(page, `document.querySelectorAll('#view .pop-item .share-tile').length`),
    );
    const homeId = (await page.locator('#view .pop-item .tile-body').first().getAttribute('data-frag'))!;
    await openFrom(page, '#view .pop-item .share-tile', homeId);
    await page.keyboard.press('Escape');
    expect(await pathname(page)).toBe('/');

    // A brand page, a note page and the search page: one tile each, same behaviour.
    for (const route of ['/search', '/brands/dior', '/notes/vanilla']) {
      await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
      await waitForApp(page);
      await page.waitForSelector('#view .tile-grid .share-tile');
      const id = (await page.locator('#view .tile-grid .tile-body').first().getAttribute('data-frag'))!;
      await openFrom(page, '#view .tile-grid .share-tile', id);
      await page.keyboard.press('Escape');
      expect(await pathname(page)).toBe(route);
    }
    await context.close();
  }, 120_000);

  it('copies the link to the clipboard, says Copied for about two seconds, then goes back', async () => {
    const { context, page } = await open('/deals');
    const id = (await page.locator('#view .tile .tile-body').first().getAttribute('data-frag'))!;
    await openFrom(page, '#view .tile .share-tile', id);
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
    const id = (await page.locator('#view .tile .tile-body').first().getAttribute('data-frag'))!;
    await openFrom(page, '#view .tile .share-tile', id);
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
    const id = (await page.locator('#view .tile .tile-body').first().getAttribute('data-frag'))!;
    await openFrom(page, '#view .tile .share-tile', id);
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
    const id = (await page.locator('#view .tile .tile-body').first().getAttribute('data-frag'))!;
    await openFrom(page, '#view .tile .share-tile', id);
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
    const id = (await page.locator('#view .tile .tile-body').first().getAttribute('data-frag'))!;
    await openFrom(page, '#view .tile .share-tile', id);
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
    const id = (await page.locator('#view .tile .tile-body').first().getAttribute('data-frag'))!;
    await openFrom(page, '#view .tile .share-tile', id);
    await page.locator('[data-share-instagram]').click();
    await page.waitForTimeout(300);
    expect(await ev<string>(page, `document.querySelector('#ps-share-note').textContent`)).toBe('');
    expect(await dialogOpen(page)).toBe(true);
    await context.close();
  }, 60_000);

  it('leaves the price out of the text for a product with no current prices', async () => {
    const id = 'sh-test-dormant';
    const { context, page } = await open(`/fragrance/${id}`, {
      routes: async (ctx) => {
        // A fixture product, served in place of the empty dormant file, so the
        // page for a product with no current prices can be opened here.
        await ctx.route(/\/data\/dormant\.[0-9a-f]+\.json$/, (r) =>
          r.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              DORMANT_PRODUCTS: {
                [id]: { brand: 'Test House', name: "Quiet Ember & Co", concentration: 'Eau de Parfum', sizeMl: 75, ean: null, image: null, older: [] },
              },
              ID_ALIASES: {},
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
    const id = (await page.locator('#view .tile .tile-body').first().getAttribute('data-frag'))!;
    await openFrom(page, '#view .tile .share-tile', id);
    const wa = await ev<string>(page, `document.querySelector('#ps-share .share-targets a').href`);
    const text = decodeURIComponent(wa.slice('https://wa.me/?text='.length));
    // Every Deals tile has a buyable offer, so the price part is always there.
    expect(text).toMatch(/, (from £\d+\.\d\d delivered at .+ on PriceSniffs|£\d+\.\d\d at .+ with delivery not stated, on PriceSniffs) /);
    await context.close();
  }, 60_000);

  describe('in the endless lists, where far tiles are empty stand ins', () => {
    const realTiles = `#view .tile-grid > li:not(.grid-more):not(.tile-gone) .tile`;

    it('has a working button on tiles drawn after scrolling far, and none on stand ins', async () => {
      const { context, page } = await open('/search', { width: 390 });
      let count = 0;
      for (let i = 0; i < 80 && count < CHUNK * 20; i++) {
        await page.evaluate(`(document.querySelector('#view .tile-grid > .grid-more') ?? document.documentElement).scrollIntoView({ block: 'end' })`);
        await page.waitForTimeout(150);
        count = await ev<number>(page, `document.querySelectorAll('#view .tile-grid > li:not(.grid-more)').length`);
      }
      expect(count).toBeGreaterThanOrEqual(CHUNK * 20);
      await page.waitForTimeout(400);

      const stats = await ev<{ real: number; stands: number; buttons: number; standButtons: number }>(page, `({
        real: document.querySelectorAll('${realTiles}').length,
        stands: document.querySelectorAll('#view .tile-grid > li.tile-gone').length,
        buttons: document.querySelectorAll('${realTiles} .share-tile').length,
        standButtons: document.querySelectorAll('#view .tile-grid > li.tile-gone .share-tile').length,
      })`);
      // Far tiles are stand ins now, and the ones still drawn each carry the button.
      expect(stats.stands).toBeGreaterThan(0);
      expect(stats.real).toBeGreaterThan(0);
      expect(stats.buttons).toBe(stats.real);
      expect(stats.standButtons).toBe(0);

      // The tile on screen after the scroll: its button opens its own product's pop-up.
      const onScreen = await ev<string | null>(page, `(() => {
        for (const t of document.querySelectorAll('${realTiles}')) {
          const r = t.querySelector('.share-tile').getBoundingClientRect();
          if (r.top > 60 && r.bottom < window.innerHeight) return t.querySelector('.tile-body').dataset.frag;
        }
        return null;
      })()`);
      expect(onScreen).not.toBeNull();
      const before = await ev<number>(page, 'window.scrollY');
      await openFrom(page, `#view .tile-body[data-frag="${onScreen}"] + .share-tile`, onScreen!);
      expect(await pathname(page)).toBe('/search');
      await noSideScroll(page);
      await page.keyboard.press('Escape');
      expect(await dialogOpen(page)).toBe(false);
      // Closing it moved nothing.
      expect(Math.abs((await ev<number>(page, 'window.scrollY')) - before)).toBeLessThanOrEqual(2);

      // Back at the top the tiles that were swapped out are whole again, buttons and all.
      await page.evaluate('window.scrollTo(0, 0)');
      await page.waitForTimeout(500);
      const top = await ev<{ first: string | null; real: number; buttons: number }>(page, `({
        first: document.querySelector('${realTiles} .tile-body')?.dataset.frag ?? null,
        real: document.querySelectorAll('${realTiles}').length,
        buttons: document.querySelectorAll('${realTiles} .share-tile').length,
      })`);
      expect(top.first).not.toBeNull();
      expect(top.buttons).toBe(top.real);
      await openFrom(page, `#view .tile-body[data-frag="${top.first}"] + .share-tile`, top.first!);
      await page.keyboard.press('Escape');
      expect(await pathname(page)).toBe('/search');
      await context.close();
    }, 180_000);
  });
});

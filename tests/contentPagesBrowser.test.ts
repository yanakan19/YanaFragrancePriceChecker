import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { CONTENT_PATHS, GUIDES, GUIDES_PATH, HOW_WE_CHECK, guidePath } from '../demo/guideList.js';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { itemSummary } from '../demo/itemSummary.js';
import { isOil, isSet } from '../demo/productKind.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));
const MODE_KEY = 'pricesniffs.display';

/**
 * The guides, /about/how-we-check-prices and the set and oil summary line, in a
 * browser on the built site: phone and desktop widths, both palettes, axe, the
 * words arriving only when a page is opened, and the links in the words.
 * What the words say and the head tags are held by tests/contentPages.test.ts.
 */
describe.skipIf(!built)('guides and the price checking page on the built site', () => {
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

  /** Opens a page, with the service worker blocked so the requests seen are the page's own. */
  async function open(path: string, width = 1280, mode: 'light' | 'dark' = 'dark', requests?: string[]): Promise<Page> {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await context.addInitScript(
      ([k, v, desktop]: [string, string, boolean]) => {
        try {
          localStorage.setItem(k, v);
          if (desktop) localStorage.setItem('pricesniffs.layout', 'desktop');
        } catch {
          /* storage may be unavailable */
        }
      },
      [MODE_KEY, mode, width >= 1000] as [string, string, boolean],
    );
    const page = await context.newPage();
    if (requests) page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load' });
    await waitForApp(page);
    await settled(page);
    return page;
  }

  /** The words have arrived (nothing is loading) and every fade has finished. */
  async function settled(page: Page): Promise<void> {
    await page.waitForFunction(() => document.querySelector('#view h1') !== null && document.querySelector('#view [aria-busy="true"]') === null, null, { timeout: 15_000 });
    await page.evaluate(
      `Promise.all(document.getAnimations().filter((a) => a.effect.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined)))`,
    );
  }

  const overflow = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const here = (page: Page): Promise<string> => page.evaluate(() => location.pathname + location.search + location.hash);
  const wordsOnPage = (page: Page): Promise<number> =>
    page.evaluate(() => (document.querySelector('#view') as HTMLElement).innerText.split(/\s+/).filter(Boolean).length);

  for (const width of [320, 390, 1280]) {
    for (const path of CONTENT_PATHS) {
      it(`${path} has one heading, its own tags and no sideways scroll at ${width} wide`, async () => {
        const page = await open(path, width);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        expect(await page.$$eval('#view h1', (els) => els.length)).toBe(1);
        const h1 = ((await page.textContent('#view h1')) ?? '').trim();
        const title = await page.title();
        expect(title).toBe(`PriceSniffs: ${h1}`);
        expect(await page.getAttribute('link[rel=canonical]', 'href')).toBe(`https://pricesniffs.space${path}`);
        expect(await page.$('meta[name=robots][content*=noindex]')).toBeNull();
        expect(((await page.getAttribute('meta[name=description]', 'content')) ?? '').length).toBeGreaterThan(100);
        // The words are there, and a guide is not a stub.
        expect(await wordsOnPage(page)).toBeGreaterThan(path === GUIDES_PATH ? 100 : 250);
        // Nothing is wider than the screen, so nothing is cut off at 320.
        const wide = await page.$$eval('#view *', (els, w) => els.filter((e) => e.getBoundingClientRect().right > w + 1).map((e) => e.tagName + '.' + e.className).slice(0, 3), width);
        expect(wide, 'wider than the screen').toEqual([]);
        await page.context().close();
      }, 60_000);
    }
  }

  it('keeps a reading width on the desktop layout', async () => {
    const page = await open(guidePath(GUIDES[0]!.slug), 1280);
    expect(await page.evaluate(() => Math.round((document.querySelector('#view .content-doc') as HTMLElement).getBoundingClientRect().width))).toBe(640);
    await page.context().close();
  }, 60_000);

  for (const mode of ['light', 'dark'] as const) {
    for (const width of [320, 1280]) {
      for (const path of ['/', GUIDES_PATH, guidePath(GUIDES[0]!.slug), guidePath(GUIDES[3]!.slug), HOW_WE_CHECK.path]) {
        it(`${path} has no axe violations at ${width} wide (${mode})`, async () => {
          const page = await open(path, width, mode);
          const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
          const summary = results.violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`).join('\n');
          expect(results.violations, summary).toEqual([]);
          await page.context().close();
        }, 60_000);
      }
    }
  }

  it('does not fetch any of the words until a page that has them is opened', async () => {
    const requests: string[] = [];
    const page = await open('/', 390, 'dark', requests);
    const lazy = (name: string) => requests.filter((p) => new RegExp(`/data/${name}\\.[0-9a-f]{16}\\.json$`).test(p));
    // The first load names them but does not ask for them.
    expect(lazy('guides')).toEqual([]);
    expect(lazy('method')).toEqual([]);
    expect(requests.some((p) => /\/data\/catalogue\./.test(p))).toBe(true);

    // The home page links to the guides and the method page.
    expect(await page.$$eval('.guides-section .guide-card a', (els) => els.length)).toBe(GUIDES.length + 1);
    await page.click(`.guides-section a[href="${guidePath(GUIDES[1]!.slug)}"]`);
    await page.waitForFunction((p) => location.pathname === p, guidePath(GUIDES[1]!.slug));
    await settled(page);
    expect(lazy('guides')).toHaveLength(1);
    expect(lazy('method')).toEqual([]);
    expect((await page.textContent('#view h1'))?.trim()).toBe(GUIDES[1]!.title);

    // Another guide: the file is already in, so nothing more is fetched.
    await page.click(`#view .content-more a[href="${guidePath(GUIDES[2]!.slug)}"]`);
    await page.waitForFunction((p) => location.pathname === p, guidePath(GUIDES[2]!.slug));
    await settled(page);
    expect(lazy('guides')).toHaveLength(1);

    // The price checking page fetches its own file, once.
    await page.click('#nav-about');
    await page.waitForFunction(() => location.pathname === '/about');
    await page.click(`#view a[href="${HOW_WE_CHECK.path}"]`);
    await page.waitForFunction((p) => location.pathname === p, HOW_WE_CHECK.path);
    await settled(page);
    expect(lazy('method')).toHaveLength(1);
    expect(await page.title()).toBe('PriceSniffs: How We Check Prices');
    await page.context().close();
  }, 90_000);

  it('says plainly, and keeps the heading, when the words cannot be fetched', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    await context.route(/\/data\/(guides|method)\.[0-9a-f]{16}\.json$/, (r) => r.abort());
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}${guidePath(GUIDES[0]!.slug)}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForSelector('#view [role=alert]', { timeout: 15_000 });
    expect(((await page.textContent('#view [role=alert]')) ?? '')).toContain('could not be loaded');
    expect((await page.textContent('#view h1'))?.trim()).toBe(GUIDES[0]!.title);
    expect(await page.textContent('#view .content-lead')).toBe(GUIDES[0]!.description);
    await context.close();
  }, 60_000);

  it('is Page Not Found for a guide that does not exist, and the old style address still opens', async () => {
    const missing = await open('/guides/not-a-guide');
    expect((await missing.textContent('#view h1'))?.trim()).toBe('Page Not Found');
    expect(await missing.$('meta[name=robots][content*=noindex]')).not.toBeNull();
    await missing.context().close();

    const retyped = await open('/guides/Decants-And-Testers');
    expect((await retyped.textContent('#view h1'))?.trim()).toBe('Decants, Testers and Miniatures');
    await retyped.waitForFunction(() => location.pathname === '/guides/decants-and-testers');
    await retyped.context().close();
  }, 60_000);

  it('opens the links in the words through the router, with Back returning to the guide', async () => {
    const page = await open(guidePath('perfume-strengths-explained'), 390);
    const guideAddress = await here(page);

    // A strength filter, already chosen.
    await page.click('#view a[href="/fragrances?strength=edt"]');
    await page.waitForFunction(() => location.pathname === '/fragrances');
    expect(await here(page)).toBe('/fragrances?strength=edt');
    expect(await page.textContent('#view')).toContain('Eau de Toilette');
    expect(await page.$$eval('#view [data-filter-remove]', (els) => els.length)).toBe(1);
    await page.goBack();
    await page.waitForFunction((a) => location.pathname + location.search === a, guideAddress);
    await settled(page);
    expect((await page.textContent('#view h1'))?.trim()).toBe('Perfume Strengths Explained');

    // Brands, and the shop's own price checking page.
    await page.click('#view a[href="/brands"]');
    await page.waitForFunction(() => location.pathname === '/brands');
    await page.goBack();
    await settled(page);
    await page.click(`#view a[href="${HOW_WE_CHECK.path}"]`);
    await page.waitForFunction((p) => location.pathname === p, HOW_WE_CHECK.path);
    await settled(page);

    // A section of the Legal Notice, scrolled to.
    await page.click('#view a[href="/about/legal#affiliate"]');
    await page.waitForFunction(() => location.pathname === '/about/legal');
    expect(await here(page)).toBe('/about/legal#affiliate');
    expect(await page.$eval('#notice-affiliate', (el) => el === document.activeElement)).toBe(true);
    await page.context().close();

    // A note, with its layer.
    const notes = await open(guidePath('perfume-notes-explained'), 390);
    await notes.click('#view a[href="/notes/bergamot?layer=top"]');
    await notes.waitForFunction(() => location.pathname === '/notes/bergamot');
    expect(await here(notes)).toBe('/notes/bergamot?layer=top');
    expect((await notes.textContent('#view h1'))?.trim()).toBe('Bergamot');
    expect(await notes.$('#view .note-chip.on')).not.toBeNull();
    await notes.context().close();

    // The sort on the Oils tab.
    const perMl = await open(guidePath('compare-perfume-prices-per-ml'), 390);
    await perMl.click('#view a[href="/oils?sort=ml-low"]');
    await perMl.waitForFunction(() => location.pathname === '/oils');
    expect(await here(perMl)).toBe('/oils?sort=ml-low');
    await perMl.context().close();
  }, 120_000);

  it('goes back up: a guide to the index, the price checking page to About', async () => {
    const guide = await open(guidePath(GUIDES[0]!.slug));
    await guide.click('#view .back');
    await guide.waitForFunction(() => location.pathname === '/guides');
    await guide.context().close();

    const method = await open(HOW_WE_CHECK.path);
    await method.click('#view .back');
    await method.waitForFunction(() => location.pathname === '/about');
    expect(await method.$eval('#nav-about', (el) => el.classList.contains('on'))).toBe(true);
    await method.context().close();
  }, 60_000);

  it('links the guides and the method from About, and the index lists them all', async () => {
    const about = await open('/about', 390);
    expect(await about.getAttribute(`#view a[href="${HOW_WE_CHECK.path}"]`, 'data-goto')).toBe('howWeCheck');
    await about.click('#view a[href="/guides"]');
    await about.waitForFunction(() => location.pathname === '/guides');
    expect(await about.$$eval('#view .guide-card a', (els) => els.map((e) => e.getAttribute('href')))).toEqual(GUIDES.map((g) => guidePath(g.slug)));
    await about.context().close();
  }, 60_000);

  it('gives a set and an oil a plain summary line, the one the record says', async () => {
    const withBits = DEMO_FRAGRANCES.find((f) => isSet(f) && f.giftSet?.items && f.giftSet.mainMl && f.giftSet.box);
    const plainSet = DEMO_FRAGRANCES.find((f) => isSet(f) && !f.giftSet?.items && !f.giftSet?.mainMl);
    const anOil = DEMO_FRAGRANCES.find((f) => isOil(f) && f.sizeMl);
    const bottle = DEMO_FRAGRANCES.find((f) => !isSet(f) && !isOil(f));
    for (const f of [withBits, plainSet, anOil]) {
      if (!f) continue;
      const page = await open(`/${f.slug}`, 390);
      const line = ((await page.textContent('.giftset-summary')) ?? '').trim();
      expect(line).toBe(itemSummary(f));
      expect(line.length).toBeGreaterThan(10);
      // It leads the block, before the contents and facts.
      expect(await page.$eval('.giftset-block', (el) => el.firstElementChild?.className.includes('giftset-summary'))).toBe(true);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.context().close();
    }
    expect(withBits ?? anOil, 'the catalogue has sets and oils to show').toBeDefined();
    if (bottle) {
      const page = await open(`/${bottle.slug}`, 390);
      expect(await page.$('.giftset-summary')).toBeNull();
      await page.context().close();
    }
  }, 120_000);
});

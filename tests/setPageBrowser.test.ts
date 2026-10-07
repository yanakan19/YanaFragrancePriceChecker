import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { auditRoute, launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { BY_POPULARITY, DEMO_FRAGRANCES, fragranceById, type DemoFragrance } from '../demo/data.js';
import { isOil, isSet } from '../demo/productKind.js';
import { routeToPath, setProductSlugLookup } from '../demo/router.js';
import { sprayVersion, valueLine } from '../demo/setPage.js';
import { CRAWLED } from '../demo/catalogue.generated.js';

/**
 * A set's page and an oil's page on the built site (docs/GIFT-SETS-AND-OILS-PLAN.md,
 * 2.5, phase 7). Needs `npm run demo`. A bottle's page must carry none of it.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));
const MODE_KEY = 'pricesniffs.display';

const SLUG_OF = new Map(DEMO_FRAGRANCES.map((f) => [f.id, f.slug]));
setProductSlugLookup((id) => SLUG_OF.get(id) ?? null);
const pathOf = (f: DemoFragrance): string => routeToPath({ name: 'fragrance', param: f.id, query: {} });

const sets = DEMO_FRAGRANCES.filter(isSet);
const oils = DEMO_FRAGRANCES.filter(isOil);
const bottles = BY_POPULARITY.filter((f) => !isSet(f) && !isOil(f));

const withValue = sets.filter((s) => s.giftSet!.contents && valueLine(s));
const setDearer = withValue.find((s) => valueLine(s)!.setPrice > valueLine(s)!.bottlePrice)!;
const setCheaper = withValue.find((s) => valueLine(s)!.setPrice < valueLine(s)!.bottlePrice)!;
const noContents = sets.find((s) => s.giftSet!.contents === null)!;
const twoShops = sets.find((s) => s.giftSet!.contents && (CRAWLED[s.id] ?? []).length >= 2 && (CRAWLED[s.id] ?? []).some((o) => o.title))!;
const oilWithSpray = oils.find((o) => sprayVersion(o) && o.oil?.format && o.oil.formatBy)!;
const oilNoSpray = oils.find((o) => !o.oil?.sprayId)!;

describe.skipIf(!built)('set and oil pages on the built site', () => {
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

  async function open(path: string, width = 1280, mode: 'light' | 'dark' = 'light'): Promise<{ page: Page; ctx: BrowserContext }> {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
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
    await ctx.route((u) => u.hostname !== '127.0.0.1' && u.hostname !== 'localhost', (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForTimeout(400);
    return { page, ctx };
  }

  const text = async (page: Page, sel: string): Promise<string> => (await page.locator(sel).first().innerText().catch(() => '')).trim();

  it('lists a set\'s contents one item to a line', async () => {
    const { page, ctx } = await open(pathOf(setDearer));
    try {
      const lines = await page.locator('.giftset-list li').allInnerTexts();
      expect(lines).toEqual(setDearer.giftSet!.contents);
      expect(await text(page, '.giftset-note')).toMatch(/compared only with this same set, never with a single bottle/);
    } finally {
      await ctx.close();
    }
  });

  it('says "As the shop lists it" and shows no list for a set with no contents', async () => {
    const { page, ctx } = await open(pathOf(noContents));
    try {
      expect(await page.locator('.giftset-list').count()).toBe(0);
      expect(await text(page, '.giftset-contents')).toContain('As the shop lists it');
      expect(await text(page, '.giftset-contents')).toContain(noContents.giftSet!.title);
    } finally {
      await ctx.close();
    }
  });

  it('prints both prices with the shop\'s name, no percentage and no saving, where the set is dearer than the bottle', async () => {
    const v = valueLine(setDearer)!;
    const { page, ctx } = await open(pathOf(setDearer));
    try {
      const line = await text(page, '.giftset-value');
      expect(line).toContain(`At ${v.shopName} this set is`);
      expect(line).toContain('bottle alone is');
      expect(line).toContain('at the same shop');
      expect(line).not.toMatch(/%|sav(e|ing)|cheaper|dearer|discount|off\b/i);
      expect(line).not.toMatch(/[-‐-―−]/);
      const prices = line.match(/£\d[\d,]*(?:\.\d\d)?/g)!;
      expect(prices).toHaveLength(2);
      expect(Number(prices[0]!.replace(/[£,]/g, ''))).toBeGreaterThan(Number(prices[1]!.replace(/[£,]/g, '')));
    } finally {
      await ctx.close();
    }
  });

  it('prints both prices, the set first, where the set is cheaper than the bottle alone', async () => {
    const { page, ctx } = await open(pathOf(setCheaper));
    try {
      const line = await text(page, '.giftset-value');
      const prices = line.match(/£\d[\d,]*(?:\.\d\d)?/g)!;
      expect(prices).toHaveLength(2);
      expect(Number(prices[0]!.replace(/[£,]/g, ''))).toBeLessThan(Number(prices[1]!.replace(/[£,]/g, '')));
    } finally {
      await ctx.close();
    }
  });

  it('opens the bottle page from the value line, and that page has no set block', async () => {
    const bottle = valueLine(setDearer)!.bottle;
    const { page, ctx } = await open(pathOf(setDearer));
    try {
      await page.locator('.giftset-value [data-frag]').click();
      // Waits for the page it opens rather than a fixed half second.
      const want = pathOf(bottle).replace(/\?.*$/, '');
      await page.waitForFunction((p) => location.pathname === p, want, { timeout: 15_000 });
      await page.locator('.giftset-block').waitFor({ state: 'detached', timeout: 15_000 });
      expect(new URL(page.url()).pathname).toBe(want);
      expect(await page.locator('.giftset-block').count()).toBe(0);
    } finally {
      await ctx.close();
    }
  }, 60_000);

  it('shows no value line on a set with no headline bottle', async () => {
    const lone = withValue.length ? sets.find((s) => !s.giftSet!.bottleId && s.giftSet!.contents)! : sets[0]!;
    const { page, ctx } = await open(pathOf(lone));
    try {
      expect(await page.locator('.giftset-value').count()).toBe(0);
    } finally {
      await ctx.close();
    }
  });

  it('names each shop\'s own title on a set sold by two shops', async () => {
    const { page, ctx } = await open(pathOf(twoShops));
    try {
      const lines = await page.locator('.offer .facts').allInnerTexts();
      expect(lines.filter((l) => l.startsWith('Listed as:')).length).toBeGreaterThanOrEqual(2);
    } finally {
      await ctx.close();
    }
  });

  it('gives an oil its facts as a shop states them, its price per ml, other sizes and its spray', async () => {
    const { page, ctx } = await open(pathOf(oilWithSpray));
    try {
      const block = await text(page, '.oil-block');
      expect(block).toMatch(/Roll On|Dropper/);
      expect(block).toMatch(/as .+ describes it/);
      expect(block).toMatch(/£\d+\.\d+ per ml/);
      const spray = page.locator('.oil-block [data-frag]', { hasText: 'The spray version' });
      expect(await spray.count()).toBe(1);
      await spray.click();
      await page.waitForTimeout(500);
      const sprayProduct = sprayVersion(oilWithSpray)!;
      expect(new URL(page.url()).pathname).toBe(pathOf(sprayProduct).replace(/\?.*$/, ''));
      expect(await page.locator('.oil-block').count()).toBe(0);
    } finally {
      await ctx.close();
    }
  }, 60_000);

  it('shows an oil with no spray no spray link, and states nothing a shop did not', async () => {
    const { page, ctx } = await open(pathOf(oilNoSpray));
    try {
      expect(await page.getByText('The spray version').count()).toBe(0);
      const block = await text(page, '.oil-block');
      if (!oilNoSpray.oil?.format) expect(block).not.toMatch(/Roll On|Dropper/);
      if (!oilNoSpray.oil?.alcoholFree) expect(block).not.toMatch(/Alcohol Free/);
    } finally {
      await ctx.close();
    }
  });

  it('leaves a bottle\'s page without any of it', async () => {
    for (const b of [bottles[0]!, bottles[800]!, bottles[6000]!]) {
      const { page, ctx } = await open(pathOf(b));
      try {
        expect(await page.locator('.giftset-block, .giftset-list, .giftset-value, .oil-block').count(), b.id).toBe(0);
        expect(await page.getByText('Listed as:').count(), b.id).toBe(0);
        expect(await page.getByText('The spray version').count(), b.id).toBe(0);
      } finally {
        await ctx.close();
      }
    }
  }, 90_000);

  for (const width of [320, 390, 1280]) {
    for (const mode of ['light', 'dark'] as const) {
      it(`a set page and an oil page at ${width}px (${mode}): no sideways scroll, axe passes`, async () => {
        for (const f of [setDearer, oilWithSpray]) {
          const { page, ctx } = await open(pathOf(f), width, mode);
          try {
            const [sw, cw] = (await page.evaluate(`[document.documentElement.scrollWidth, document.documentElement.clientWidth]`)) as [number, number];
            expect(sw, f.id).toBeLessThanOrEqual(cw);
          } finally {
            await ctx.close();
          }
          const violations = await auditRoute(browser, port, pathOf(f), mode, width);
          expect(violations, JSON.stringify(violations).slice(0, 400)).toEqual([]);
        }
      }, 90_000);
    }
  }

  it('keeps a headline bottle id pointing at a real bottle', () => {
    for (const s of withValue.slice(0, 50)) {
      const b = fragranceById(s.giftSet!.bottleId!)!;
      expect(isSet(b) || isOil(b)).toBe(false);
    }
  });
});

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { auditRoute, launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { BY_POPULARITY, DEMO_FRAGRANCES, fragrancesAt, shopIdsOf } from '../demo/data.js';
import { COUNTS } from '../demo/counts.js';
import { isOil, isSet } from '../demo/productKind.js';
import { intentOf, searchMatches } from '../demo/searchIntent.js';
import { slugify } from '../demo/router.js';
import { slugOf } from '../demo/tabFacets.js';

/**
 * Sets and oils leave the bottle lists and are one line away (docs/GIFT-SETS-AND-OILS-PLAN.md,
 * Phase 8): the search page, a brand's page and a shop's page list bottles only; a line
 * above says how many sets and oils also match and opens the tab with the same words,
 * brand or shop. Needs `npm run demo`.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));
const MODE_KEY = 'pricesniffs.display';

const text = (f: { brand: string; name: string; concentration: string }) => `${f.brand} ${f.name} ${f.concentration}`;
const kindCount = (list: typeof BY_POPULARITY, q: string, pick: (f: (typeof BY_POPULARITY)[number]) => boolean) =>
  list.filter((f) => pick(f) && searchMatches(text(f), q)).length;
const phrase = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

const bottlesOf = (brand: string) => BY_POPULARITY.filter((f) => f.brand === brand && !isSet(f) && !isOil(f));
const setsOf = (brand: string) => BY_POPULARITY.filter((f) => f.brand === brand && isSet(f));
const oilsOf = (brand: string) => BY_POPULARITY.filter((f) => f.brand === brand && isOil(f));

// A brand with bottles, sets and oils; a brand with sets and no bottle; a brand with oils and no set.
const byBrand = new Map<string, { b: number; s: number; o: number }>();
for (const f of DEMO_FRAGRANCES) {
  const c = byBrand.get(f.brand) ?? { b: 0, s: 0, o: 0 };
  if (isSet(f)) c.s += 1;
  else if (isOil(f)) c.o += 1;
  else c.b += 1;
  byBrand.set(f.brand, c);
}
const brandWithAll = [...byBrand].filter(([, c]) => c.b > 5 && c.s > 3 && c.o > 0).sort((a, b) => b[1].s - a[1].s)[0]![0];
const brandOnlySetsOrOils = [...byBrand].find(([, c]) => c.b === 0 && c.s + c.o > 0)![0];

describe.skipIf(!built)('sets and oils one line away from the bottle lists', () => {
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

  const where = (page: Page): string => new URL(page.url()).pathname + new URL(page.url()).search;
  const heading = async (page: Page): Promise<number> => Number(((await page.locator('#view .page-head .count').first().innerText()) ?? '').replace(/\D/g, ''));
  const line = async (page: Page): Promise<string> => (await page.locator('#view .tabs-line').first().innerText()).replace(/\s+/g, ' ').trim();
  /** The ids of the product tiles drawn so far. */
  const tileIds = async (page: Page): Promise<string[]> =>
    (await page.evaluate(`[...document.querySelectorAll('#view .tile-grid [data-frag]')].map((e) => e.getAttribute('data-frag'))`)) as string[];

  it('lists bottles only for "yara", and says how many sets and oils also match, with the tab one click away', async () => {
    const sets = kindCount(BY_POPULARITY, 'yara', isSet);
    const oils = kindCount(BY_POPULARITY, 'yara', isOil);
    const bottles = kindCount(BY_POPULARITY, 'yara', (f) => !isSet(f) && !isOil(f));
    expect(sets).toBeGreaterThan(0);
    expect(oils).toBeGreaterThan(0);
    const { page, ctx } = await open('/search?q=yara');
    try {
      expect(await heading(page)).toBe(bottles);
      const ids = await tileIds(page);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        const f = DEMO_FRAGRANCES.find((x) => x.id === id)!;
        expect(isSet(f) || isOil(f), id).toBe(false);
      }
      expect(await line(page)).toBe(`${phrase(sets, 'Set', 'Sets')} and ${phrase(oils, 'Oil', 'Oils')} also match: See Sets, See Oils`);

      await page.locator('#view .tabs-line a[data-tab-jump="sets"]').click();
      await page.waitForTimeout(500);
      expect(where(page)).toBe('/sets?q=yara');
      expect(await heading(page)).toBe(sets);

      await page.goBack();
      await page.waitForTimeout(500);
      expect(where(page)).toBe('/search?q=yara');
      expect(await heading(page)).toBe(bottles);

      await page.locator('#view .tabs-line a[data-tab-jump="oils"]').click();
      await page.waitForTimeout(500);
      expect(where(page)).toBe('/oils?q=yara');
      expect(await heading(page)).toBe(oils);
    } finally {
      await ctx.close();
    }
  }, 60_000);

  it('leads with Oils for a search that says oil, and matches the word, not "Toilette"', async () => {
    const q = 'oil';
    expect(intentOf(q).oils).toBe(true);
    const bottles = kindCount(BY_POPULARITY, q, (f) => !isSet(f) && !isOil(f));
    const sets = kindCount(BY_POPULARITY, q, isSet);
    const oils = kindCount(BY_POPULARITY, q, isOil);
    // The word match, not the old letters match: 396 oils, and no Eau de Toilette in the thousands.
    expect(bottles + sets + oils).toBeLessThan(1000);
    const { page, ctx } = await open('/search?q=oil');
    try {
      expect(await heading(page)).toBe(bottles);
      expect(await line(page)).toMatch(new RegExp(`^${phrase(oils, 'Oil', 'Oils')}(?: and ${phrase(sets, 'Set', 'Sets')})? also match: See Oils(?:, See Sets)?$`));
      const links = await page.locator('#view .tabs-line a').allInnerTexts();
      expect(links[0]).toBe('See Oils');
    } finally {
      await ctx.close();
    }
  }, 60_000);

  it('says so on a search whose only matches are sets, with no bottle listed', async () => {
    const { page, ctx } = await open('/search?q=gift%20set');
    try {
      expect(await heading(page)).toBe(0);
      expect(await page.locator('#view .tile-grid [data-frag]').count()).toBe(0);
      expect(await line(page)).toMatch(/^[\d,]+ Sets also match: See Sets$/);
      expect(await page.locator('#view').innerText()).toContain('Nothing here matches that search.');
    } finally {
      await ctx.close();
    }
  }, 60_000);

  it('shows no line on the Most Stocked list, and its note names both left out', async () => {
    const { page, ctx } = await open('/search');
    try {
      expect(await page.locator('#view .tabs-line').count()).toBe(0);
      const note = await page.locator('#view .panel-note').first().innerText();
      expect(note).toMatch(/Sets and oils are not listed here/);
      expect(note).toMatch(/tabs under Explore/);
    } finally {
      await ctx.close();
    }
  }, 60_000);

  it('lists a brand\'s bottles only, and reaches its sets and oils by the line', async () => {
    const sets = setsOf(brandWithAll).length;
    const oils = oilsOf(brandWithAll).length;
    const bottles = bottlesOf(brandWithAll).length;
    const { page, ctx } = await open(`/brands/${slugify(brandWithAll)}`);
    try {
      expect(await line(page)).toBe(
        `${brandWithAll} also has ${phrase(sets, 'Set', 'Sets')}${oils > 0 ? ` and ${phrase(oils, 'Oil', 'Oils')}` : ''}: See Sets${oils > 0 ? ', See Oils' : ''}`,
      );
      expect(await page.locator('#view .gone-head').first().innerText()).toBe(`${bottles} ${bottles === 1 ? 'Fragrance' : 'Fragrances'}`);
      for (const id of await tileIds(page)) {
        const f = DEMO_FRAGRANCES.find((x) => x.id === id)!;
        expect(isSet(f) || isOil(f), id).toBe(false);
      }
      await page.locator('#view .tabs-line a[data-tab-jump="sets"]').click();
      await page.waitForTimeout(500);
      expect(where(page)).toBe(`/sets?brand=${slugOf(brandWithAll)}`);
      expect(await heading(page)).toBe(sets);
    } finally {
      await ctx.close();
    }
  }, 60_000);

  it('gives a brand with only sets and oils its line, not "no listings"', async () => {
    const { page, ctx } = await open(`/brands/${slugify(brandOnlySetsOrOils)}`);
    try {
      expect(await line(page)).toMatch(new RegExp(`^${brandOnlySetsOrOils.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} also has `));
      expect(await page.locator('#view').innerText()).not.toContain('We have no listings from this brand yet.');
      expect(await page.locator('#view .tile-grid [data-frag]').count()).toBe(0);
    } finally {
      await ctx.close();
    }
  }, 60_000);

  it('lists a shop\'s bottles only, and its count and line add up to what the shop lists', async () => {
    const all = fragrancesAt('perfume-click');
    const sets = all.filter(isSet).length;
    const oils = all.filter(isOil).length;
    const bottles = all.length - sets - oils;
    expect(sets).toBeGreaterThan(100);
    // The tab filters by shopIdsOf: the same offers the shop's page counts.
    expect(BY_POPULARITY.filter((f) => isSet(f) && shopIdsOf(f.id).includes('perfume-click')).length).toBe(sets);
    const { page, ctx } = await open('/retailers/perfume-click');
    try {
      expect(await page.locator('#view .gone-head').first().innerText()).toBe(`${bottles} Fragrances Here`);
      expect(await line(page)).toBe(
        `Perfume Click also has ${phrase(sets, 'Set', 'Sets')}${oils > 0 ? ` and ${phrase(oils, 'Oil', 'Oils')}` : ''} here: See Sets${oils > 0 ? ', See Oils' : ''}`,
      );
    } finally {
      await ctx.close();
    }
  }, 60_000);

  it('opens the old Gift Sets address on the Sets tab', async () => {
    const { page, ctx } = await open('/search?size=gift-set');
    try {
      expect(where(page)).toBe('/sets');
      expect(await heading(page)).toBe(COUNTS.sets);
    } finally {
      await ctx.close();
    }
  }, 60_000);

  it('states the banner as Products, and the About page gives the three counts', async () => {
    const { page, ctx } = await open('/');
    try {
      const banner = await page.locator('.marquee').first().innerText();
      expect(banner).toMatch(/[\d,]+\+ Products Tracked/);
      expect(banner).not.toMatch(/Fragrances Tracked/);
    } finally {
      await ctx.close();
    }
    const missing = await open('/no-such-page');
    try {
      expect((await missing.page.locator('#view').innerText()).replace(/\s+/g, ' ')).toContain(`Search ${COUNTS.bottles.toLocaleString('en-GB')} Fragrances`);
    } finally {
      await missing.ctx.close();
    }
    const about = await open('/about');
    try {
      const stats = (await about.page.$$eval('#view [data-stat]', (els) =>
        Object.fromEntries(els.map((e) => [e.getAttribute('data-stat'), Number(e.querySelector('dd')!.textContent!.replace(/,/g, ''))])),
      )) as Record<string, number>;
      expect(stats.fragrances).toBe(COUNTS.bottles);
      expect(stats.sets).toBe(COUNTS.sets);
      expect(stats.oils).toBe(COUNTS.oils);
      expect(stats.products).toBe(COUNTS.products);
      expect((stats.fragrances ?? 0) + (stats.sets ?? 0) + (stats.oils ?? 0)).toBe(stats.products);
    } finally {
      await about.ctx.close();
    }
  }, 60_000);

  for (const width of [320, 390, 1280]) {
    for (const mode of ['light', 'dark'] as const) {
      it(`the search, brand and shop pages at ${width}px (${mode}): no sideways scroll, axe passes`, async () => {
        for (const path of ['/search?q=yara', `/brands/${slugify(brandWithAll)}`, '/retailers/perfume-click']) {
          const { page, ctx } = await open(path, width, mode);
          try {
            const [sw, cw] = (await page.evaluate(`[document.documentElement.scrollWidth, document.documentElement.clientWidth]`)) as [number, number];
            expect(sw, path).toBeLessThanOrEqual(cw);
            expect(await page.locator('#view .tabs-line').count(), path).toBe(1);
          } finally {
            await ctx.close();
          }
          const violations = await auditRoute(browser, port, path, mode, width);
          expect(violations, `${path}: ${JSON.stringify(violations).slice(0, 400)}`).toEqual([]);
        }
      }, 120_000);
    }
  }
});

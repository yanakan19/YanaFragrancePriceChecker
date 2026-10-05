import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { DEMO_FRAGRANCES, fragranceById } from '../demo/data.js';
import { ID_ALIASES } from '../demo/dormant.generated.js';
import { SITE_URL } from '../demo/head.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The product address /BRAND_NAME_VOLUME on the built page (docs/PRODUCT-URLS.md):
 * a new address opens the product, the old /fragrance/<id> and an absorbed id
 * are rewritten to it, and Back and Share work from it. Stored examples: the
 * product is the catalogue's first, the absorbed id is read from the build's own
 * alias file, and the rest are fixtures served in place of the lazy file.
 */
describe.skipIf(!built)('product addresses in the page', () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  const product = DEMO_FRAGRANCES[0]!;
  const absorbed = Object.entries(ID_ALIASES).find(([, to]) => fragranceById(to) !== undefined)!;
  const survivor = fragranceById(absorbed[1])!;

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
    routes?: (ctx: BrowserContext) => Promise<void>,
  ): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await context.route((u) => u.hostname !== '127.0.0.1' && u.hostname !== 'localhost', (r) => r.abort());
    if (routes) await routes(context);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForTimeout(300);
    return { context, page };
  }

  const ev = <T>(page: Page, expr: string): Promise<T> => page.evaluate(expr) as Promise<T>;
  const pathname = (page: Page): Promise<string> => ev(page, 'location.pathname');
  const canonical = (page: Page): Promise<string | null> =>
    ev(page, `document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null`);
  const robots = (page: Page): Promise<string | null> =>
    ev(page, `document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null`);
  const heading = (page: Page): Promise<string> => ev(page, `document.querySelector('#view h1')?.textContent ?? ''`);

  /** Waits until the address bar says `path`, which the page rewrites a moment after drawing. */
  async function settledAt(page: Page, path: string): Promise<void> {
    await page.waitForFunction((p) => location.pathname === p, path, { timeout: 10_000 });
  }

  it('has a catalogue to check against', () => {
    expect(product.slug).toMatch(/^[a-z0-9]+(_[a-z0-9]+){2,}$/);
    expect(survivor.slug).toBeTruthy();
  });

  it('opens a product by its new address and keeps it in the bar, with that address as canonical', async () => {
    const { context, page } = await open(`/${product.slug}`);
    await page.waitForSelector('#view .phead-name');
    expect(await heading(page)).toBe(product.name);
    expect(await pathname(page)).toBe(`/${product.slug}`);
    expect(await canonical(page)).toBe(`${SITE_URL}/${product.slug}`);
    expect(await robots(page)).toBeNull();
    expect(await ev<string>(page, `document.querySelector('meta[property="og:url"]').getAttribute('content')`)).toBe(
      `${SITE_URL}/${product.slug}`,
    );
    await context.close();
  }, 60_000);

  it('opens the old address /fragrance/<id> on the same product and rewrites the bar to the new one', async () => {
    const { context, page } = await open(`/fragrance/${encodeURIComponent(product.id)}`);
    await page.waitForSelector('#view .phead-name');
    await settledAt(page, `/${product.slug}`);
    expect(await heading(page)).toBe(product.name);
    expect(await canonical(page)).toBe(`${SITE_URL}/${product.slug}`);
    // Not noindex once the bar holds the product's own address.
    expect(await robots(page)).toBeNull();
    // Replaced, not pushed: the page has as many history entries as one opened
    // straight at the new address, so there is no old address to go Back to.
    const direct = await open(`/${product.slug}`);
    expect(await ev<number>(page, 'history.length')).toBe(await ev<number>(direct.page, 'history.length'));
    await direct.context.close();
    await context.close();
  }, 60_000);

  it('marks the old address noindex while it is showing, with the new address as canonical, and clears it after', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route((u) => u.hostname !== '127.0.0.1' && u.hostname !== 'localhost', (r) => r.abort());
    // Records the head at the moment the page rewrites the address: the old
    // address is still in the bar, and the head is what a crawler would read.
    await context.addInitScript(`
      window.__heads = [];
      const replace = history.replaceState.bind(history);
      history.replaceState = (...args) => {
        window.__heads.push({
          path: location.pathname,
          robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
          canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
        });
        return replace(...args);
      };
    `);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/fragrance/${encodeURIComponent(product.id)}`, { waitUntil: 'load' });
    await waitForApp(page);
    await settledAt(page, `/${product.slug}`);
    await page.waitForTimeout(300);
    const seen = await ev<{ path: string; robots: string | null; canonical: string | null }[]>(page, 'window.__heads');
    const onOld = seen.filter((h) => h.path.startsWith('/fragrance/') && h.canonical?.includes(product.slug));
    expect(onOld.length).toBeGreaterThan(0);
    for (const h of onOld) expect(h.robots, JSON.stringify(h)).toContain('noindex');
    for (const h of onOld) expect(h.canonical).toBe(`${SITE_URL}/${product.slug}`);
    expect(await robots(page)).toBeNull();
    await context.close();
  }, 60_000);

  it('opens an absorbed id on the product that holds it, at that product\'s new address', async () => {
    const { context, page } = await open(`/fragrance/${encodeURIComponent(absorbed[0])}`);
    await page.waitForSelector('#view .phead-name');
    await settledAt(page, `/${survivor.slug}`);
    expect(await heading(page)).toBe(survivor.name);
    expect(await canonical(page)).toBe(`${SITE_URL}/${survivor.slug}`);
    expect(await robots(page)).toBeNull();
    await context.close();
  }, 60_000);

  it('opens the address of a product that was merged away on the product that holds it', async () => {
    const oldSlug = 'old_house_merged_away_100ml';
    const { context, page } = await open(`/${oldSlug}`, async (ctx) => {
      await ctx.route(/\/data\/dormant\.[0-9a-f]+\.json$/, (r) =>
        r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ DORMANT_PRODUCTS: {}, ID_ALIASES: {}, SLUG_ALIASES: { [oldSlug]: product.id } }),
        }),
      );
    });
    await page.waitForSelector('#view .phead-name');
    await settledAt(page, `/${product.slug}`);
    expect(await heading(page)).toBe(product.name);
    expect(await canonical(page)).toBe(`${SITE_URL}/${product.slug}`);
    await context.close();
  }, 60_000);

  it('opens a product with no current prices by its own address, and keeps it off search engines', async () => {
    const slug = 'test_house_quiet_ember_75ml';
    const { context, page } = await open(`/${slug}`, async (ctx) => {
      await ctx.route(/\/data\/dormant\.[0-9a-f]+\.json$/, (r) =>
        r.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            DORMANT_PRODUCTS: {
              'pu-test-dormant': {
                slug,
                brand: 'Test House',
                name: 'Quiet Ember',
                concentration: 'Eau de Parfum',
                sizeMl: 75,
                ean: null,
                image: null,
                older: [],
              },
            },
            ID_ALIASES: {},
            SLUG_ALIASES: {},
          }),
        }),
      );
    });
    await page.waitForSelector('#view .hero-price.none');
    expect(await heading(page)).toBe('Quiet Ember');
    expect(await pathname(page)).toBe(`/${slug}`);
    expect(await canonical(page)).toBe(`${SITE_URL}/${slug}`);
    expect(await robots(page)).toContain('noindex');
    await context.close();
  }, 60_000);

  it('says Page Not Found for an address shaped like a product that is none, and keeps it in the bar', async () => {
    const { context, page } = await open('/nobody_makes_this_999ml');
    await page.waitForSelector('#view .doc h1');
    expect(await heading(page)).toBe('Page Not Found');
    expect(await pathname(page)).toBe('/nobody_makes_this_999ml');
    expect(await robots(page)).toContain('noindex');
    await context.close();
  }, 60_000);

  it('rewrites an address typed with capitals to the lower case one', async () => {
    const { context, page } = await open(`/${product.slug.toUpperCase()}`);
    await page.waitForSelector('#view .phead-name');
    await settledAt(page, `/${product.slug}`);
    expect(await heading(page)).toBe(product.name);
    await context.close();
  }, 60_000);

  it('goes to the product address on a click, Back returns to the list, Forward to the product', async () => {
    const { context, page } = await open('/');
    await page.waitForSelector('#view .pop-item .tile-body');
    const id = (await page.locator('#view .pop-item .tile-body').first().getAttribute('data-frag'))!;
    const frag = fragranceById(id)!;
    await page.locator('#view .pop-item .tile-body').first().click();
    await page.waitForSelector('#view .phead-name');
    expect(await pathname(page)).toBe(`/${frag.slug}`);
    expect(await canonical(page)).toBe(`${SITE_URL}/${frag.slug}`);

    await page.goBack();
    await settledAt(page, '/');
    await page.waitForSelector('#view .pop-item .tile-body');

    await page.goForward();
    await settledAt(page, `/${frag.slug}`);
    await page.waitForSelector('#view .phead-name');
    expect(await heading(page)).toBe(frag.name);
    await context.close();
  }, 60_000);

  it('shares the product\'s own address from the product page and from a tile', async () => {
    const { context, page } = await open(`/${product.slug}`);
    await page.waitForSelector('#view .share-page');
    await page.locator('#view .share-page').first().click();
    await page.waitForSelector('#ps-share[open]');
    expect(await ev<string>(page, `document.querySelector('#ps-share-link').value`)).toBe(`${SITE_URL}/${product.slug}`);
    const whatsapp = await ev<string>(page, `document.querySelector('#ps-share .share-targets a').href`);
    expect(decodeURIComponent(whatsapp)).toContain(`${SITE_URL}/${product.slug}`);
    expect(decodeURIComponent(whatsapp)).not.toContain('/fragrance/');
    await page.keyboard.press('Escape');

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForSelector('#view .pop-item .share-tile');
    const tileId = (await page.locator('#view .pop-item .tile-body').first().getAttribute('data-frag'))!;
    await page.locator('#view .pop-item .share-tile').first().click();
    await page.waitForSelector('#ps-share[open]');
    expect(await ev<string>(page, `document.querySelector('#ps-share-link').value`)).toBe(
      `${SITE_URL}/${fragranceById(tileId)!.slug}`,
    );
    await context.close();
  }, 60_000);
});

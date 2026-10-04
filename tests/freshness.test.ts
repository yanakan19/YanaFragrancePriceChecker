import { describe, expect, it } from 'vitest';
import { crawlViaSitemap, selectUrlsToFetch, redirectedAway } from '../src/catalogue/sitemapCrawl.js';
import { crawlViaShopifyProducts, SHOPIFY_PAGE_SIZE } from '../src/catalogue/shopifyProductsCrawl.js';
import {
  refreshFromItems, parseWooStoreProducts, crawlWooStoreProducts, normaliseProductUrl,
  MIN_COMPARISONS, type RefreshItem,
} from '../src/catalogue/catalogueRefresh.js';
import { shopFreshness, freshnessTolerance } from '../src/catalogue/freshness.js';
import { parseCursor, withDiscoveryOffset, discoveryOffsetFor, EMPTY_CURSOR } from '../src/catalogue/harvestCursor.js';
import { NO_RESTRICTIONS, parseRobots } from '../src/catalogue/robots.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { Retailer } from '../src/types/retailer.js';
import type { StoredListing } from '../src/catalogue/types.js';
import type { StorefrontCurrency } from '../src/catalogue/shopCurrency.js';

/**
 * Every shown price re-checked within a day (owner, 2026-10-03). These cover
 * the parts of the harvest that make that true: whole-catalogue Shopify
 * reads, the due list, the shop's own catalogue feed as a re-pricing source,
 * gone pages, discovery rotation and the freshness measure itself.
 */

const NOW = new Date('2026-10-03T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function stored(over: Partial<StoredListing> = {}): StoredListing {
  return {
    retailerSku: 'sku-1',
    url: 'https://www.shop.example/products/a',
    rawTitle: 'A Eau de Parfum 50ml',
    rawBrand: 'House',
    ean: '5000000000001',
    imageUrl: null,
    priceGbp: 30,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'sitemap',
    retailerId: 'shop',
    firstSeenAt: hoursAgo(500),
    lastSeenAt: hoursAgo(200),
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
    ...over,
  };
}

const retailer = {
  id: 'shop', name: 'Shop', domain: 'shop.example', homepage: 'https://shop.example',
  catalogue: null,
} as unknown as Retailer;

const STERLING: StorefrontCurrency = {
  presented: 'GBP', settlement: 'GBP', rate: 1, isSterling: true, reason: 'settles in GBP at no conversion',
};

function productPage(sku: string, price: number): string {
  return (
    `<html><head><script type="application/ld+json">` +
    `{"@type":"Product","name":"Test Fragrance EDP 50ml","sku":"${sku}",` +
    `"offers":{"price":${price},"priceCurrency":"GBP"}}` +
    `</script></head><body></body></html>`
  );
}

describe('Shopify /products.json: the whole catalogue, 250 at a time', () => {
  function shopifyPage(count: number, priced = true): string {
    return JSON.stringify({
      products: Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        title: `Fragrance ${i} EDP`,
        handle: `fragrance-${i}`,
        vendor: 'House',
        images: [],
        body_html: '',
        variants: [{ id: i, sku: `s-${i}`, title: '100ml', price: priced ? '10.00' : null, compare_at_price: null, available: true }],
      })),
    });
  }

  it('asks for 250 a page whatever the page budget, and is complete only at an empty page', async () => {
    const asked: string[] = [];
    const http: Http = async (url) => {
      asked.push(url);
      const p = Number(/page=(\d+)/.exec(url)![1]);
      return { status: 200, ok: true, body: shopifyPage(p <= 2 ? 3 : 0) };
    };
    const res = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 70, gapMs: 0, currency: STERLING,
    });
    expect(asked.every((u) => u.includes(`limit=${SHOPIFY_PAGE_SIZE}&`))).toBe(true);
    expect(SHOPIFY_PAGE_SIZE).toBe(250);
    expect(res.complete).toBe(true);
    expect(res.listings).toHaveLength(6);
  });

  it('does not stop at a page whose products are all unpriced', async () => {
    const http: Http = async (url) => {
      const p = Number(/page=(\d+)/.exec(url)![1]);
      const body = p === 1 ? shopifyPage(2, false) : p === 2 ? shopifyPage(2) : shopifyPage(0);
      return { status: 200, ok: true, body };
    };
    const res = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 10, gapMs: 0, currency: STERLING,
    });
    expect(res.listings).toHaveLength(2);
    expect(res.complete).toBe(true);
  });

  it('is not complete when the page cap stops it', async () => {
    const http: Http = async () => ({ status: 200, ok: true, body: shopifyPage(1) });
    const res = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0, currency: STERLING,
    });
    expect(res.complete).toBe(false);
  });
});

describe('re-pricing from the shop\'s own catalogue feed', () => {
  const item = (over: Partial<RefreshItem> = {}): RefreshItem => ({
    sku: 'sku-1', url: 'https://shop.example/products/a/', priceGbp: 28, inStock: false, ...over,
  });

  it('matches on the same page by SKU and changes only price and stock', () => {
    const prior = stored({ wasPriceGbp: 40, promoEndsAt: '2026-12-31T00:00:00.000Z' });
    const res = refreshFromItems([prior], [item()], NOW);
    expect(res.listings).toHaveLength(1);
    const l = res.listings[0]!;
    expect(l.priceGbp).toBe(28);
    expect(l.inStock).toBe(false);
    expect(l.ean).toBe('5000000000001');
    expect(l.rawTitle).toBe(prior.rawTitle);
    // A was-price read beside £30 says nothing about £28.
    expect(l.wasPriceGbp).toBeNull();
    expect(l.promoEndsAt).toBeNull();
    expect('lastSeenAt' in l).toBe(false);
    expect(res.refreshedSkus.has('sku-1')).toBe(true);
  });

  it('keeps a was-price while the price is the one it was read beside', () => {
    const res = refreshFromItems([stored({ wasPriceGbp: 40 })], [item({ priceGbp: 30 })], NOW);
    expect(res.listings[0]!.wasPriceGbp).toBe(40);
  });

  it('never carries a SKU match across to another product page', () => {
    // One SKU on two pages at two prices, as BellaVita lists it.
    const res = refreshFromItems(
      [stored()],
      [item({ url: 'https://shop.example/products/a-deal', priceGbp: 19.99 })],
      NOW,
    );
    expect(res.listings).toHaveLength(0);
  });

  it('matches by page alone only when the page names one item and one listing', () => {
    const noSku = item({ sku: 'other' });
    expect(refreshFromItems([stored()], [noSku], NOW).listings).toHaveLength(1);
    const twoSizes = [noSku, item({ sku: 'other-2', priceGbp: 45 })];
    expect(refreshFromItems([stored()], twoSizes, NOW).listings).toHaveLength(0);
  });

  it('sets the whole feed aside when it disagrees with recent prices', () => {
    const known = Array.from({ length: MIN_COMPARISONS }, (_, i) =>
      stored({ retailerSku: `s${i}`, url: `https://shop.example/products/p${i}`, lastSeenAt: hoursAgo(5) }),
    );
    const items = known.map((l) => item({ sku: l.retailerSku, url: l.url, priceGbp: 41 }));
    const res = refreshFromItems(known, items, NOW);
    expect(res.rejected).toMatch(/set aside/);
    expect(res.listings).toHaveLength(0);
    // The same disagreement against old prices is a reprice, not a bad feed.
    const old = known.map((l) => ({ ...l, lastSeenAt: hoursAgo(300) }));
    expect(refreshFromItems(old, items, NOW).listings).toHaveLength(MIN_COMPARISONS);
  });

  it('trusts a UK market feed over pages read plainly from a foreign vantage', () => {
    const known = Array.from({ length: MIN_COMPARISONS }, (_, i) =>
      stored({ retailerSku: `s${i}`, url: `https://shop.example/products/p${i}`, lastSeenAt: hoursAgo(5), priceGbp: 34 }),
    );
    const items = known.map((l) => item({ sku: l.retailerSku, url: l.url, priceGbp: 25 }));
    const res = refreshFromItems(known, items, NOW, { trustOverPages: true });
    expect(res.rejected).toBeNull();
    expect(res.listings.map((l) => l.priceGbp)).toEqual(Array(MIN_COMPARISONS).fill(25));
  });

  it('ignores delisted listings', () => {
    expect(refreshFromItems([stored({ status: 'delisted' })], [item()], NOW).listings).toHaveLength(0);
  });

  it('normalises a product URL to host and path', () => {
    expect(normaliseProductUrl('https://www.Shop.example/products/A/?variant=1#x')).toBe('shop.example/products/a');
  });
});

describe('WooCommerce Store API', () => {
  const product = (over: Record<string, unknown> = {}) => ({
    id: 1, type: 'simple', sku: 'W1', permalink: 'https://shop.example/products/a/', is_in_stock: true,
    prices: { price: '2899', regular_price: '2899', currency_code: 'GBP', currency_minor_unit: 2 },
    ...over,
  });

  it('reads simple products in minor units and skips what it cannot vouch for', () => {
    const items = parseWooStoreProducts(JSON.stringify([
      product(),
      product({ type: 'variable', permalink: 'https://shop.example/products/b/' }),
      product({ permalink: 'https://shop.example/products/c/', prices: { price: '1000', currency_code: 'EUR', currency_minor_unit: 2 } }),
      product({ permalink: 'https://shop.example/products/d/', prices: { price: '', currency_code: 'GBP', currency_minor_unit: 2 } }),
    ]));
    expect(items).toEqual([{ sku: 'W1', url: 'https://shop.example/products/a/', priceGbp: 28.99, inStock: true }]);
  });

  it('walks pages until a short one, and reads a 404 as not WooCommerce', async () => {
    const asked: string[] = [];
    const full = JSON.stringify(Array.from({ length: 100 }, (_, i) => product({ permalink: `https://shop.example/products/p${i}/` })));
    const http: Http = async (url) => {
      asked.push(url);
      const p = Number(/[?&]page=(\d+)/.exec(url)![1]);
      return { status: 200, ok: true, body: p === 1 ? full : JSON.stringify([product()]) };
    };
    const res = await crawlWooStoreProducts({ retailer, http, robots: NO_RESTRICTIONS, headers: {}, gapMs: 0 });
    expect(res.isWoo).toBe(true);
    expect(asked).toHaveLength(2);
    expect(res.items).toHaveLength(101);
    expect(asked.every((u) => u.includes('/wp-json/wc/store/v1/products?'))).toBe(true);

    const notWoo = await crawlWooStoreProducts({
      retailer, http: async () => ({ status: 404, ok: false, body: '' }), robots: NO_RESTRICTIONS, headers: {}, gapMs: 0,
    });
    expect(notWoo.isWoo).toBe(false);
    expect(notWoo.errors).toEqual([]);
  });

  it('asks nothing robots.txt disallows', async () => {
    let asked = 0;
    const robots = parseRobots('User-agent: *\nDisallow: /wp-json/', 'pricesniffsbot');
    const res = await crawlWooStoreProducts({
      retailer, http: async () => { asked++; return { status: 200, ok: true, body: '[]' }; }, robots, headers: {}, gapMs: 0,
    });
    expect(asked).toBe(0);
    expect(res.isWoo).toBe(false);
  });
});

describe('sitemap walk: due listings, gone pages, rotation', () => {
  const sitemap = (urls: string[]) => `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;
  const base = 'https://www.shop.example';

  it('re-reads every due listing first, beyond the page budget, and records 404s as gone', async () => {
    const fetched: string[] = [];
    const discovered = [`${base}/products/perfume-new-1`, `${base}/products/perfume-new-2`];
    const due = [`${base}/products/perfume-old-1`, `${base}/products/perfume-old-2`, `${base}/products/perfume-old-3`];
    const http: Http = async (url) => {
      if (url.endsWith('sitemap.xml')) return { status: 200, ok: true, body: sitemap(discovered) };
      fetched.push(url);
      if (url.endsWith('old-3')) return { status: 404, ok: false, body: '' };
      return { status: 200, ok: true, body: productPage(url.split('/').pop()!, 10), finalUrl: url };
    };
    const res = await crawlViaSitemap({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, gapMs: 0,
      maxPages: 1, refreshShare: 0,
      knownUrls: new Map(due.map((u) => [u, hoursAgo(30)])),
      refreshUrls: due,
    });
    expect(fetched.slice(0, 3)).toEqual(due);
    expect(fetched).toHaveLength(4);
    expect(res.goneUrls).toEqual([`${base}/products/perfume-old-3`]);
    expect(res.discoveryFetched).toBe(1);
    expect(res.fetchedEveryDiscovered).toBe(false);
  });

  it('records a stored page that now redirects to another page as moved', async () => {
    const url = `${base}/products/perfume-old`;
    const http: Http = async (u) =>
      u.endsWith('sitemap.xml')
        ? { status: 200, ok: true, body: sitemap([]) }
        : { status: 200, ok: true, body: '<html></html>', finalUrl: `${base}/collections/fragrance` };
    const res = await crawlViaSitemap({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, gapMs: 0, maxPages: 0,
      knownUrls: new Map([[url, hoursAgo(30)]]), refreshUrls: [url],
    });
    expect(res.movedUrls).toEqual([url]);
    expect(redirectedAway(`${url}/`, url)).toBe(false);
  });

  it('does not re-ask stored pages of a shop that refused its sitemap', async () => {
    const fetched: string[] = [];
    const http: Http = async (url) => {
      fetched.push(url);
      return { status: 403, ok: false, body: '' };
    };
    const res = await crawlViaSitemap({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, gapMs: 0, maxPages: 5,
      refreshUrls: [`${base}/products/a`, `${base}/products/b`],
    });
    expect(fetched.every((u) => u.endsWith('.xml'))).toBe(true);
    expect(res.pagesFetched).toBe(0);
  });

  it('stops after five failed pages in a row', async () => {
    const due = Array.from({ length: 20 }, (_, i) => `${base}/products/p${i}`);
    let productAsks = 0;
    const http: Http = async (url) => {
      if (url.endsWith('sitemap.xml')) return { status: 200, ok: true, body: sitemap([`${base}/products/perfume-x`]) };
      productAsks++;
      return { status: 0, ok: false, body: '', error: 'timeout' };
    };
    const res = await crawlViaSitemap({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, gapMs: 0, maxPages: 0, refreshUrls: due,
    });
    expect(productAsks).toBe(5);
    expect(res.errors.at(-1)).toMatch(/5 pages in a row failed/);
  });

  it('is complete only when every discovered URL was fetched', async () => {
    const discovered = [`${base}/products/perfume-1`, `${base}/products/perfume-2`];
    const http: Http = async (url) =>
      url.endsWith('sitemap.xml')
        ? { status: 200, ok: true, body: sitemap(discovered) }
        : { status: 200, ok: true, body: productPage(url.split('/').pop()!, 10), finalUrl: url };
    const all = await crawlViaSitemap({ retailer, http, robots: NO_RESTRICTIONS, headers: {}, gapMs: 0, maxPages: 5 });
    expect(all.fetchedEveryDiscovered).toBe(true);
    const some = await crawlViaSitemap({ retailer, http, robots: NO_RESTRICTIONS, headers: {}, gapMs: 0, maxPages: 1 });
    expect(some.fetchedEveryDiscovered).toBe(false);
  });

  it('rotates discovery through the unseen URLs instead of asking the same head every run', () => {
    const urls = ['u1', 'u2', 'u3', 'u4', 'u5'];
    expect(selectUrlsToFetch(urls, 2, new Map(), 0, 0)).toEqual(['u1', 'u2']);
    expect(selectUrlsToFetch(urls, 2, new Map(), 0, 2)).toEqual(['u3', 'u4']);
    expect(selectUrlsToFetch(urls, 2, new Map(), 0, 4)).toEqual(['u5', 'u1']);
    expect(selectUrlsToFetch(urls, 2, new Map(), 0, 12)).toEqual(['u3', 'u4']);
  });

  it('keeps the discovery offset in the cursor, and an old cursor reads as offset 0', () => {
    expect(discoveryOffsetFor(EMPTY_CURSOR, 'shop')).toBe(0);
    const c = withDiscoveryOffset(EMPTY_CURSOR, 'shop', 42);
    const back = parseCursor(JSON.stringify(c));
    expect(discoveryOffsetFor(back, 'shop')).toBe(42);
    expect(parseCursor(JSON.stringify({ attempted: {}, actorRendered: {} }))).toEqual({ attempted: {}, actorRendered: {} });
  });
});

describe('freshness of shown listings', () => {
  it('counts only what the site would show, by age of last confirmation', () => {
    const f = shopFreshness(
      [
        stored({ lastSeenAt: hoursAgo(2) }),
        stored({ retailerSku: 'b', lastSeenAt: hoursAgo(30) }),
        stored({ retailerSku: 'c', lastSeenAt: hoursAgo(60) }),
        stored({ retailerSku: 'd', lastSeenAt: hoursAgo(24 * 8) }), // hidden, past 7 days
        stored({ retailerSku: 'e', lastSeenAt: hoursAgo(60), status: 'delisted' }),
        stored({ retailerSku: 'f', lastSeenAt: hoursAgo(60), priceGbp: null }),
      ],
      NOW,
    );
    expect(f).toEqual({ shown: 3, over24h: 2, over48h: 1, oldestShownAt: hoursAgo(60) });
  });

  it('tolerates a handful, never a slice of the catalogue', () => {
    expect(freshnessTolerance(10)).toBe(5);
    expect(freshnessTolerance(2000)).toBe(40);
  });
});

import { describe, expect, it } from 'vitest';
import { crawlViaShopifyProducts, publishedProductsCount, SHOPIFY_CAP_SLACK_PRODUCTS, SHOPIFY_MAX_PAGE, SHOPIFY_PAGE_SIZE, SERVER_ERROR_RETRY_MAX_MS, SERVER_ERROR_RETRY_MS, waitAfterServerError } from '../src/catalogue/shopifyProductsCrawl.js';
import { NO_RESTRICTIONS } from '../src/catalogue/robots.js';
import type { Retailer } from '../src/types/retailer.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { StorefrontCurrency } from '../src/catalogue/shopCurrency.js';

/**
 * The wait between `/products.json` pages, mirroring
 * tests/sitemapCrawl.test.ts's own "gap between requests" coverage for the
 * other crawl route into the same harvest.
 */

const retailer = { id: 'shop', name: 'Shop', domain: 'shop.example' } as unknown as Retailer;

// An already-settled sterling currency, passed in directly so these tests
// exercise only the pagination loop and never the market/currency probing
// tests/marketHarvest.test.ts already covers.
const STERLING: StorefrontCurrency = {
  presented: 'GBP', settlement: 'GBP', rate: 1, isSterling: true, reason: 'settles in GBP at no conversion',
};

function page(ids: number[]): string {
  return JSON.stringify({
    products: ids.map((id) => ({
      id,
      title: `Fragrance ${id} EDP`,
      handle: `fragrance-${id}`,
      vendor: 'Test House',
      images: [],
      body_html: '',
      variants: [
        { id: id * 10, sku: `sku-${id}`, title: '100ml', price: '39.99', compare_at_price: null, available: true },
      ],
    })),
  });
}

describe('crawlViaShopifyProducts: the gap between requests', () => {
  it('waits between pages but not after the page that fills maxPages', async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number) => {
      sleeps.push(ms);
    };
    const http: Http = async (url) => {
      const m = /page=(\d+)/.exec(url);
      const p = m ? Number.parseInt(m[1]!, 10) : 1;
      // A full page every time — the walk only stops because maxPages says so.
      return { status: 200, ok: true, body: page([p]) };
    };

    const result = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 3, gapMs: 1500, sleep, currency: STERLING,
    });

    expect(result.pagesFetched).toBe(3);
    expect(result.listings).toHaveLength(3);
    // Three pages fetched, two gaps waited — the third page filled the
    // budget, so there is no fourth request left to space out from.
    expect(sleeps).toEqual([1500, 1500]);
  });

  it('still waits once after a catalogue that ends naturally before maxPages', async () => {
    // Page 2 comes back empty (a real, smaller catalogue), which this loop
    // can only discover *by asking* — so the wait before that discovery is
    // paid once, unlike the maxPages case above where the end is known in
    // advance. See the fix's own comment in shopifyProductsCrawl.ts.
    const sleeps: number[] = [];
    const sleep = async (ms: number) => {
      sleeps.push(ms);
    };
    const http: Http = async (url) => {
      const m = /page=(\d+)/.exec(url);
      const p = m ? Number.parseInt(m[1]!, 10) : 1;
      return { status: 200, ok: true, body: p === 1 ? page([1]) : page([]) };
    };

    const result = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 5, gapMs: 1500, sleep, currency: STERLING,
    });

    expect(result.listings).toHaveLength(1);
    expect(sleeps).toEqual([1500]);
  });
});

/**
 * A storefront's bad minute. Fenwick (100 pages of 250) answered 3 of them with
 * HTTP 503 on 2026-10-08, 1.5 to 2.5 seconds apart, and answered the same page
 * with 200 fifteen seconds later. The walk used to end at the first one, which
 * for a catalogue whose perfume sits on pages 47 and 64 to 70 meant most of it
 * was missed on most runs.
 */
describe('crawlViaShopifyProducts: a server error is asked about once more', () => {
  const pageOf = (url: string) => {
    const m = /page=(\d+)/.exec(url);
    return m ? Number.parseInt(m[1]!, 10) : 1;
  };

  it('waits, asks the same page again, and carries on when the second answer is good', async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number) => {
      sleeps.push(ms);
    };
    const asked: number[] = [];
    let failedOnce = false;
    const http: Http = async (url) => {
      const p = pageOf(url);
      asked.push(p);
      if (p === 2 && !failedOnce) {
        failedOnce = true;
        return { status: 503, ok: false, body: '' };
      }
      return { status: 200, ok: true, body: p <= 3 ? page([p]) : page([]) };
    };

    const result = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 10, gapMs: 1500, sleep, currency: STERLING,
    });

    expect(asked).toEqual([1, 2, 2, 3, 4]);
    expect(result.listings.map((l) => l.retailerSku)).toEqual(['sku-1', 'sku-2', 'sku-3']);
    expect(result.errors).toEqual([]);
    expect(result.retriedPages).toBe(1);
    // The retry is not a page of the catalogue: four pages were read (the fourth empty).
    expect(result.pagesFetched).toBe(4);
    expect(result.complete).toBe(true);
    expect(sleeps).toContain(SERVER_ERROR_RETRY_MS);
    expect(sleeps.filter((ms) => ms === SERVER_ERROR_RETRY_MS)).toHaveLength(1);
  });

  it('asks a failing page again after longer and longer waits, and carries on when a later answer is good', async () => {
    const sleeps: number[] = [];
    let failures = 0;
    const http: Http = async (url) => {
      const p = pageOf(url);
      if (p === 2 && failures < 3) { failures++; return { status: 503, ok: false, body: '' }; }
      return { status: 200, ok: true, body: p <= 2 ? page([p]) : page([]) };
    };
    const result = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 10, gapMs: 0, sleep: async (ms) => { sleeps.push(ms); }, currency: STERLING,
    });
    expect(result.listings.map((l) => l.retailerSku)).toEqual(['sku-1', 'sku-2']);
    expect(result.errors).toEqual([]);
    expect(result.complete).toBe(true);
    expect(sleeps).toEqual([15_000, 45_000, 90_000]);
  });

  it('honours Retry-After when it asks for longer than the step, within the cap', () => {
    expect(waitAfterServerError(0, undefined)).toBe(15_000);
    expect(waitAfterServerError(0, 60)).toBe(60_000);
    expect(waitAfterServerError(1, 5)).toBe(45_000);
    expect(waitAfterServerError(2, 3600)).toBe(SERVER_ERROR_RETRY_MAX_MS);
  });

  it('asks a failing page four times in all, then leaves it out politely and reads the rest, but not as a complete read', async () => {
    const asked: number[] = [];
    const http: Http = async (url) => {
      const p = pageOf(url);
      asked.push(p);
      if (p === 2) return { status: 503, ok: false, body: '' };
      return { status: 200, ok: true, body: p <= 3 ? page([p]) : page([]) };
    };

    const result = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 10, gapMs: 0, sleep: async () => {}, currency: STERLING,
    });

    expect(asked).toEqual([1, 2, 2, 2, 2, 3, 4]);
    expect(result.listings.map((l) => l.retailerSku)).toEqual(['sku-1', 'sku-3']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/page=2.*HTTP 503/);
    expect(result.retriedPages).toBe(1);
    expect(result.complete).toBe(false);
  });

  it('ends the walk when a second page also fails, and when the first page fails', async () => {
    const asked: number[] = [];
    const http: Http = async (url) => {
      const p = pageOf(url);
      asked.push(p);
      if (p === 1 || p === 2 || p === 3) return p === 1 ? { status: 200, ok: true, body: page([1]) } : { status: 503, ok: false, body: '' };
      return { status: 200, ok: true, body: page([p]) };
    };
    const result = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 10, gapMs: 0, sleep: async () => {}, currency: STERLING,
    });
    expect(asked).toEqual([1, 2, 2, 2, 2, 3, 3, 3, 3]);
    expect(result.errors).toHaveLength(2);
    expect(result.complete).toBe(false);
  });

  it.each([403, 429, 404])('never asks again after an HTTP %s', async (status) => {
    const asked: number[] = [];
    const http: Http = async (url) => {
      const p = pageOf(url);
      asked.push(p);
      if (p === 2) return { status, ok: false, body: '' };
      return { status: 200, ok: true, body: page([p]) };
    };

    const result = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 10, gapMs: 0, sleep: async () => {}, currency: STERLING,
    });

    expect(asked).toEqual([1, 2]);
    expect(result.retriedPages).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
});

describe('crawlViaShopifyProducts: a shop one product past the page cap', () => {
  // Fenwick publishes 25,001 products and Shopify hands over 25,000, so the walk
  // never meets the empty page. Without this its withdrawn listings were never
  // retired and the freshness check failed 20 crawls (25 to 28 Oct 2026).
  const pageOf = (url: string) => Number.parseInt(/page=(\d+)/.exec(url)?.[1] ?? '1', 10);
  const fullPage = (p: number) => page(Array.from({ length: SHOPIFY_PAGE_SIZE }, (_, i) => p * 1000 + i));
  const walk = async (published: number | null, metaOk = true) => {
    const asked: string[] = [];
    const http: Http = async (url) => {
      asked.push(url);
      if (url.endsWith('/meta.json')) {
        return metaOk
          ? { status: 200, ok: true, body: JSON.stringify(published === null ? {} : { published_products_count: published }) }
          : { status: 404, ok: false, body: '' };
      }
      return { status: 200, ok: true, body: fullPage(pageOf(url)) };
    };
    const result = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: SHOPIFY_MAX_PAGE, gapMs: 0, sleep: async () => {}, currency: STERLING,
    });
    return { result, asked };
  };

  it('counts as the whole shop when the shop publishes hardly more than the cap', async () => {
    const { result, asked } = await walk(SHOPIFY_MAX_PAGE * SHOPIFY_PAGE_SIZE + 1);
    expect(result.pagesFetched).toBe(SHOPIFY_MAX_PAGE);
    expect(result.complete).toBe(true);
    expect(asked.filter((u) => u.endsWith('/meta.json'))).toHaveLength(1);
  });

  it('does not, when the shop publishes far more than the cap can hand over', async () => {
    const { result } = await walk(SHOPIFY_MAX_PAGE * SHOPIFY_PAGE_SIZE + SHOPIFY_CAP_SLACK_PRODUCTS + 1);
    expect(result.complete).toBe(false);
  });

  it('does not, when the shop names no count or will not say', async () => {
    expect((await walk(null)).result.complete).toBe(false);
    expect((await walk(25_001, false)).result.complete).toBe(false);
  });

  it('never asks for the count of a walk that ended on its own', async () => {
    const asked: string[] = [];
    const http: Http = async (url) => {
      asked.push(url);
      const p = pageOf(url);
      return { status: 200, ok: true, body: p <= 2 ? page([p]) : page([]) };
    };
    const result = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: SHOPIFY_MAX_PAGE, gapMs: 0, sleep: async () => {}, currency: STERLING,
    });
    expect(result.complete).toBe(true);
    expect(asked.some((u) => u.endsWith('/meta.json'))).toBe(false);
  });

  it('reads the count only from a number', () => {
    expect(publishedProductsCount('{"published_products_count":25001}')).toBe(25001);
    expect(publishedProductsCount('{"published_products_count":"25001"}')).toBeNull();
    expect(publishedProductsCount('not json')).toBeNull();
  });
});

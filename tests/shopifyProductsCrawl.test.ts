import { describe, expect, it } from 'vitest';
import { crawlViaShopifyProducts } from '../src/catalogue/shopifyProductsCrawl.js';
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

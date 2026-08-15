import { describe, expect, it } from 'vitest';
import { crawlViaShopifyProducts } from '../src/catalogue/shopifyProductsCrawl.js';
import { NO_RESTRICTIONS } from '../src/catalogue/robots.js';
import type { Retailer } from '../src/types/retailer.js';
import type { Http } from '../src/catalogue/attempt.js';

/**
 * Reading the *right market's* price list, which is a different problem from
 * reading the right currency and was hidden behind it.
 *
 * Detecting the currency (2026-08-13, commit 86c4660) stopped this repo
 * publishing dollars as pounds. It did not get the pounds. escentual.com is a
 * UK shop that settles in GBP and quotes a US visitor USD, and every harvest
 * this project runs is a US visitor — so the fix left 8,104 listings correctly
 * unpriced rather than incorrectly priced, which is better and is not the job.
 *
 * Measured on the real shop from a runner (currency probe, run 31880556596,
 * job 95002418010): /products.json served 39.00 at the origin and 28.00 for
 * the same handle under ?country=GB, and the Calvin Klein Obsession 125ml this
 * repo had held at "£57.00" came back 40.95 GBP the same way. The shapes below
 * are that behaviour in miniature.
 */

const retailer = { id: 'shop', name: 'Shop', domain: 'shop.example' } as unknown as Retailer;

function page(price: string): string {
  return JSON.stringify({
    products: [
      {
        id: 1,
        title: 'Calvin Klein Obsession For Men Eau de Toilette Spray',
        handle: 'ck-obsession',
        vendor: 'Calvin Klein',
        images: [],
        body_html: '',
        variants: [
          { id: 11, sku: '10000170', title: '125ml', price, compare_at_price: null, available: true },
        ],
      },
    ],
  });
}

const EMPTY = JSON.stringify({ products: [] });

/**
 * A storefront that geolocates: dollars to anyone who does not ask for the UK,
 * pounds to anyone who does, with `?country=GB` the only switch it honours.
 * `/meta.json` says GBP whichever way it is asked, because settlement is a
 * fact about the shop and not about the caller — which is exactly why reading
 * it alone was never enough.
 */
function geolocatingShop(): { http: Http; asked: string[] } {
  const asked: string[] = [];
  const http: Http = async (url) => {
    asked.push(url);
    const gb = url.includes('country=GB');
    if (url.includes('/meta.json')) return { status: 200, body: '{"currency":"GBP"}', ok: true };
    if (url.includes('/products.json')) {
      if (!url.includes('page=1')) return { status: 200, body: EMPTY, ok: true };
      return { status: 200, body: page(gb ? '40.95' : '57.00'), ok: true };
    }
    return {
      status: 200,
      ok: true,
      body: gb
        ? 'Shopify.currency = {"active":"GBP","rate":"1.0"};'
        : 'Shopify.currency = {"active":"USD","rate":"1.38605"};',
    };
  };
  return { http, asked };
}

describe('harvesting a shop that serves a different price list to every country', () => {
  it('finds the sterling market and publishes that list, not the one it was shown first', async () => {
    const { http } = geolocatingShop();
    const res = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0,
    });
    expect(res.market.label).toBe('?country=GB');
    expect(res.currency.isSterling).toBe(true);
    expect(res.listings[0]!.priceGbp).toBe(40.95);
  });

  it('carries the market onto every catalogue page, not just the one that proved it', async () => {
    const { http, asked } = geolocatingShop();
    await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0,
    });
    const catalogue = asked.filter((u) => u.includes('/products.json'));
    expect(catalogue.length).toBeGreaterThan(0);
    expect(catalogue.every((u) => u.includes('country=GB'))).toBe(true);
  });

  // The bug this shape invites: appending a second `?` drops `page`, so the
  // walk re-reads page one until maxPages runs out and the catalogue looks
  // like one product repeated.
  it('keeps its own pagination alongside the market’s query', async () => {
    const { http, asked } = geolocatingShop();
    await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0,
    });
    const catalogue = asked.filter((u) => u.includes('/products.json'));
    expect(catalogue[0]).toContain('page=1');
    expect(catalogue[0]!.split('?')).toHaveLength(2);
  });

  // A stored URL is where a shopper is sent. They should arrive as themselves
  // and get their own market, not arrive holding our query string.
  it('stores the shop’s plain product URL, without the market query', async () => {
    const { http } = geolocatingShop();
    const res = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0,
    });
    expect(res.listings[0]!.url).toBe('https://shop.example/products/ck-obsession');
  });

  it('sends a cookie candidate’s cookie when that is what proved sterling', async () => {
    const asked: Array<{ url: string; headers: Record<string, string> }> = [];
    const http: Http = async (url, headers) => {
      asked.push({ url, headers });
      const gb = headers['Cookie'] === 'localization=GB';
      if (url.includes('/meta.json')) return { status: 200, body: '{"currency":"GBP"}', ok: true };
      if (url.includes('/products.json')) {
        if (!url.includes('page=1')) return { status: 200, body: EMPTY, ok: true };
        return { status: 200, body: page(gb ? '40.95' : '57.00'), ok: true };
      }
      return {
        status: 200,
        ok: true,
        body: gb
          ? 'Shopify.currency = {"active":"GBP","rate":"1.0"};'
          : 'Shopify.currency = {"active":"USD","rate":"1.38605"};',
      };
    };
    const res = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0,
    });
    expect(res.market.label).toBe('cookie localization=GB');
    expect(res.listings[0]!.priceGbp).toBe(40.95);
    const catalogue = asked.filter((a) => a.url.includes('/products.json'));
    expect(catalogue.every((a) => a.headers['Cookie'] === 'localization=GB')).toBe(true);
  });

  // The direction that must never loosen. A shop with no sterling list at any
  // address gets the same treatment it got before this search existed.
  it('publishes nothing in pounds when no way of asking produces sterling', async () => {
    const http: Http = async (url) => {
      if (url.includes('/meta.json')) return { status: 200, body: '{"currency":"EUR"}', ok: true };
      if (url.includes('/products.json')) {
        if (!url.includes('page=1')) return { status: 200, body: EMPTY, ok: true };
        return { status: 200, body: page('57.00'), ok: true };
      }
      return { status: 200, body: 'Shopify.currency = {"active":"EUR","rate":"1.0"};', ok: true };
    };
    const res = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0,
    });
    expect(res.market.label).toBe('origin');
    expect(res.currency.isSterling).toBe(false);
    expect(res.listings[0]!.priceGbp).toBeNull();
    expect(res.listings[0]!.nativePrice).toEqual({ amount: 57, currency: 'EUR' });
    expect(res.errors.join(' ')).toContain('market:');
  });

  // A shop that is already sterling where it stands must not pay for any of
  // this — nor risk being moved to a market it never needed.
  it('does not go looking when the origin already publishes sterling', async () => {
    const asked: string[] = [];
    const http: Http = async (url) => {
      asked.push(url);
      if (url.includes('/meta.json')) return { status: 200, body: '{"currency":"GBP"}', ok: true };
      if (url.includes('/products.json')) {
        if (!url.includes('page=1')) return { status: 200, body: EMPTY, ok: true };
        return { status: 200, body: page('40.95'), ok: true };
      }
      return { status: 200, body: 'Shopify.currency = {"active":"GBP","rate":"1.0"};', ok: true };
    };
    const res = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0,
    });
    expect(res.market.label).toBe('origin');
    expect(res.listings[0]!.priceGbp).toBe(40.95);
    expect(asked.every((u) => !u.includes('country=GB'))).toBe(true);
  });

  it('can be told not to look, for a caller that wants exactly the origin', async () => {
    const { http, asked } = geolocatingShop();
    const res = await crawlViaShopifyProducts({
      retailer, http, robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0,
      resolveUkMarket: false,
    });
    expect(res.market.label).toBe('origin');
    expect(res.listings[0]!.priceGbp).toBeNull();
    expect(asked.every((u) => !u.includes('country=GB'))).toBe(true);
  });

  it('never reads a market robots.txt disallows', async () => {
    const { http, asked } = geolocatingShop();
    await crawlViaShopifyProducts({
      retailer,
      http,
      robots: { ...NO_RESTRICTIONS, disallow: ['/*country='] },
      headers: {},
      maxPages: 2,
      gapMs: 0,
    });
    expect(asked.every((u) => !u.includes('country=GB'))).toBe(true);
  });
});

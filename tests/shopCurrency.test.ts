import { describe, expect, it } from 'vitest';
import { readStorefrontCurrency } from '../src/catalogue/shopCurrency.js';
import { crawlViaShopifyProducts } from '../src/catalogue/shopifyProductsCrawl.js';
import { quarantinePrices } from '../src/catalogue/priceQuarantine.js';
import { auditPriceScale } from '../src/catalogue/priceScale.js';
import { NO_RESTRICTIONS } from '../src/catalogue/robots.js';
import type { Retailer } from '../src/types/retailer.js';
import type { StoredListing } from '../src/catalogue/types.js';
import type { Http } from '../src/catalogue/attempt.js';

/**
 * The defect these hold shut.
 *
 * Escentual's Calvin Klein Obsession For Men 125ml EDT was published here at
 * £57.00 against a shop price of £40.25 — and not as one bad row: the shop's
 * whole price list sat at roughly 1.44× the rest of the market's, on 2,542
 * published offers. Nothing upstream could see it, because our figures were a
 * faithful copy of the shop's own /products.json and re-reading that source
 * only ever confirms the copy.
 *
 * The reason a foreign price list could be copied into `priceGbp` at all was
 * `crawlViaShopifyProducts` passing a hardcoded `currency: 'GBP'` — the shop's
 * registry entry, not the response in front of it.
 */

const shopifyPage = JSON.stringify({
  products: [{
    id: 1, title: 'Calvin Klein Obsession For Men Eau de Toilette Spray', handle: 'ck-obsession',
    vendor: 'Calvin Klein', images: [], body_html: '',
    variants: [{ id: 11, sku: '10000170', title: '125ml', price: '57.00', compare_at_price: null, available: true }],
  }],
});

const retailer = { id: 'shop', name: 'Shop', domain: 'shop.example' } as unknown as Retailer;

function httpServing(homepage: string | null, meta: string | null): Http {
  return async (url) => {
    if (url.endsWith('/meta.json')) {
      return meta === null ? { status: 404, body: '', ok: false } : { status: 200, body: meta, ok: true };
    }
    if (url.includes('/products.json')) {
      return { status: 200, body: url.includes('page=1') ? shopifyPage : JSON.stringify({ products: [] }), ok: true };
    }
    return homepage === null
      ? { status: 500, body: '', ok: false }
      : { status: 200, body: homepage, ok: true };
  };
}

describe('what currency a storefront is quoting us in', () => {
  it('accepts sterling quoted at no conversion', () => {
    const c = readStorefrontCurrency('{"currency":"GBP"}', 'Shopify.currency = {"active":"GBP","rate":"1.0"};');
    expect(c.isSterling).toBe(true);
    expect(c.presented).toBe('GBP');
  });

  it('refuses a storefront quoting another currency', () => {
    const c = readStorefrontCurrency('{"currency":"GBP"}', 'Shopify.currency = {"active":"USD","rate":"1.42"};');
    expect(c.isSterling).toBe(false);
    expect(c.presented).toBe('USD');
    expect(c.reason).toContain('USD');
  });

  // The whole point. /meta.json reports what the shop settles in; the theme
  // reports what this client is being quoted. A shop that settles in pounds
  // and quotes a CI runner in dollars answers "GBP" to the first question and
  // is still handing us a converted price list.
  it('lets the quoted currency beat the settlement currency, not the other way round', () => {
    const c = readStorefrontCurrency('{"currency":"GBP"}', 'Shopify.currency = {"active":"USD","rate":"1.42"};');
    expect(c.settlement).toBe('GBP');
    expect(c.presented).toBe('USD');
    expect(c.isSterling).toBe(false);
  });

  it('refuses GBP that is itself a conversion', () => {
    const c = readStorefrontCurrency('{"currency":"EUR"}', 'Shopify.currency = {"active":"GBP","rate":"0.85"};');
    expect(c.isSterling).toBe(false);
    expect(c.rate).toBe(0.85);
  });

  // Unknown is not sterling. This is the case that decides whether being wrong
  // costs listings or costs a wrong price, and it must cost listings.
  it('refuses a storefront that publishes no currency at all', () => {
    const c = readStorefrontCurrency(null, '<html>nothing useful</html>');
    expect(c.presented).toBeNull();
    expect(c.isSterling).toBe(false);
  });
});

describe('the Shopify retailer crawl', () => {
  it('prices a storefront that is established as sterling', async () => {
    const res = await crawlViaShopifyProducts({
      retailer, http: httpServing('Shopify.currency = {"active":"GBP","rate":"1.0"};', '{"currency":"GBP"}'),
      robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0,
    });
    expect(res.currency.isSterling).toBe(true);
    expect(res.listings).toHaveLength(1);
    expect(res.listings[0]!.priceGbp).toBe(57);
  });

  // The Escentual shape, end to end: same payload, same parser, a storefront
  // quoting something else — and not one number reaches `priceGbp`.
  it('publishes no sterling price when the storefront is quoting another currency', async () => {
    const res = await crawlViaShopifyProducts({
      retailer, http: httpServing('Shopify.currency = {"active":"USD","rate":"1.42"};', '{"currency":"GBP"}'),
      robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0,
    });
    expect(res.currency.isSterling).toBe(false);
    expect(res.listings).toHaveLength(1);
    expect(res.listings[0]!.priceGbp).toBeNull();
    // The figure is kept as what it actually is, so nothing is lost.
    expect(res.listings[0]!.nativePrice).toEqual({ amount: 57, currency: 'USD' });
    expect(res.errors.join(' ')).toContain('USD');
  });

  it('publishes no sterling price when the storefront says nothing about currency', async () => {
    const res = await crawlViaShopifyProducts({
      retailer, http: httpServing('<html></html>', null),
      robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0,
    });
    expect(res.currency.isSterling).toBe(false);
    expect(res.listings[0]!.priceGbp).toBeNull();
  });

  // Never divide by a rate. A converted figure and a rate would let this
  // produce a plausible pound value, and a plausible wrong price is the worst
  // thing this codebase can ship.
  it('never converts a foreign figure into a sterling one', async () => {
    const res = await crawlViaShopifyProducts({
      retailer, http: httpServing('Shopify.currency = {"active":"USD","rate":"1.42"};', '{"currency":"GBP"}'),
      robots: NO_RESTRICTIONS, headers: {}, maxPages: 2, gapMs: 0,
    });
    expect(res.listings.every((l) => l.priceGbp === null)).toBe(true);
    expect(res.listings.map((l) => l.nativePrice?.amount)).toEqual([57]);
  });
});

function stored(sku: string, price: number | null): StoredListing {
  return {
    retailerSku: sku,
    url: `https://shop.example/products/${sku}`,
    rawTitle: `Scent ${sku} Eau de Parfum 100ml`,
    rawBrand: 'House',
    ean: null,
    imageUrl: null,
    priceGbp: price,
    wasPriceGbp: price === null ? null : price + 10,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'shopify-products-json',
    retailerId: 'shop',
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
  };
}

describe('clearing a snapshot whose prices we can no longer call pounds', () => {
  it('clears active sterling prices and keeps the figure as a native one', () => {
    const out = quarantinePrices([stored('a', 57)], 'USD');
    expect(out.cleared).toBe(1);
    expect(out.listings[0]!.priceGbp).toBeNull();
    expect(out.listings[0]!.wasPriceGbp).toBeNull();
    expect(out.listings[0]!.nativePrice).toEqual({ amount: 57, currency: 'USD' });
  });

  it('records an unresolved currency as unknown rather than assuming one', () => {
    const out = quarantinePrices([stored('a', 57)], null);
    expect(out.listings[0]!.nativePrice).toEqual({ amount: 57, currency: 'unknown' });
  });

  it('leaves delisted rows alone, because their price is a record of the past', () => {
    const delisted: StoredListing = { ...stored('a', 57), status: 'delisted' };
    const out = quarantinePrices([delisted], 'USD');
    expect(out.cleared).toBe(0);
    expect(out.listings[0]!.priceGbp).toBe(57);
  });
});

describe('the off-scale price audit', () => {
  // 60 products, three shops. Two quote the same RRP; one quotes 1.44× it on
  // everything, which is the Escentual measurement in miniature.
  const offScale = Array.from({ length: 60 }, (_, i) => ({
    offers: [
      { retailerId: 'honest-a', wasPrice: 50 + i },
      { retailerId: 'honest-b', wasPrice: 50 + i },
      { retailerId: 'wrong-scale', wasPrice: (50 + i) * 1.44 },
    ],
  }));

  it('finds the shop on a different scale and not the shops it distorts', () => {
    const audit = auditPriceScale(offScale);
    expect(audit.offScale.map((f) => f.retailerId)).toEqual(['wrong-scale']);
    expect(audit.offScale[0]!.factor).toBeCloseTo(1.44, 2);
    expect(audit.offScale[0]!.sample).toBe(60);
  });

  // The condition that separates a unit error from a marketing habit. Without
  // it, any shop that pads its "was" loses every offer it has.
  it('leaves a shop whose reference prices are high but uneven', () => {
    const uneven = Array.from({ length: 60 }, (_, i) => ({
      offers: [
        { retailerId: 'honest-a', wasPrice: 50 + i },
        { retailerId: 'honest-b', wasPrice: 50 + i },
        { retailerId: 'padded', wasPrice: (50 + i) * (i % 2 === 0 ? 1.05 : 2.2) },
      ],
    }));
    expect(auditPriceScale(uneven).offScale).toEqual([]);
  });

  it('says nothing about a shop with too little overlap to measure', () => {
    const audit = auditPriceScale(offScale.slice(0, 10));
    expect(audit.offScale).toEqual([]);
    expect(audit.measured).toEqual([]);
  });

  it('leaves a market where everyone agrees', () => {
    const agreeing = Array.from({ length: 60 }, (_, i) => ({
      offers: [
        { retailerId: 'a', wasPrice: 50 + i },
        { retailerId: 'b', wasPrice: 50 + i },
        { retailerId: 'c', wasPrice: 50 + i },
      ],
    }));
    expect(auditPriceScale(agreeing).offScale).toEqual([]);
  });
});

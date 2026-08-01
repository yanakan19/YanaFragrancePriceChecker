import { describe, expect, it } from 'vitest';
import { parseListings, parsePrice, parseAvailability, extractJsonLdBlocks } from '../src/catalogue/jsonld.js';
import { reconcile } from '../src/catalogue/reconcile.js';
import { isNewListing, newListings, daysSinceFirstSeen } from '../src/catalogue/newBadge.js';
import type { RawListing, StoredListing } from '../src/catalogue/types.js';

const OPTS = { sectionId: 'fragrance', pageUrl: 'https://shop.example/fragrance' };

function page(ld: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;
}

describe('parsePrice', () => {
  it('reads plain numbers and numeric strings', () => {
    expect(parsePrice(62.95)).toBe(62.95);
    expect(parsePrice('62.95')).toBe(62.95);
  });

  it('strips currency symbols and codes', () => {
    expect(parsePrice('£62.95')).toBe(62.95);
    expect(parsePrice('GBP 62.95')).toBe(62.95);
  });

  it('handles a thousands separator', () => {
    expect(parsePrice('£1,299.00')).toBe(1299);
  });

  it('treats a lone comma as a decimal separator', () => {
    expect(parsePrice('62,95')).toBe(62.95);
  });

  it('returns null for nonsense', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('POA')).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });
});

describe('parseAvailability', () => {
  it('reads the prefixed and bare forms', () => {
    expect(parseAvailability('https://schema.org/InStock')).toBe(true);
    expect(parseAvailability('InStock')).toBe(true);
    expect(parseAvailability('http://schema.org/OutOfStock')).toBe(false);
    expect(parseAvailability('SoldOut')).toBe(false);
  });

  it('is null when the page says nothing', () => {
    expect(parseAvailability(undefined)).toBeNull();
    expect(parseAvailability('Mystery')).toBeNull();
  });
});

describe('extractJsonLdBlocks', () => {
  it('skips a malformed block without losing the good ones', () => {
    const html =
      `<script type="application/ld+json">{ broken,,, }</script>` +
      `<script type="application/ld+json">{"@type":"Product","name":"Fine"}</script>`;
    expect(extractJsonLdBlocks(html)).toHaveLength(1);
  });

  it('ignores scripts that are not JSON-LD', () => {
    expect(extractJsonLdBlocks('<script>var x = 1;</script>')).toHaveLength(0);
  });
});

describe('parseListings', () => {
  it('reads a plain Product', () => {
    const html = page({
      '@type': 'Product',
      name: 'Dior Sauvage Eau de Parfum 100ml',
      sku: 'abc123',
      gtin13: '3348901486958',
      brand: { name: 'Dior' },
      image: ['https://shop.example/i.jpg'],
      url: 'https://shop.example/p/abc123',
      offers: { '@type': 'Offer', price: '24.99', availability: 'https://schema.org/InStock' },
    });

    const [l] = parseListings(html, OPTS);
    expect(l).toMatchObject({
      retailerSku: 'abc123',
      rawTitle: 'Dior Sauvage Eau de Parfum 100ml',
      rawBrand: 'Dior',
      ean: '3348901486958',
      priceGbp: 24.99,
      inStock: true,
      sectionId: 'fragrance',
    });
  });

  it('walks a @graph wrapper', () => {
    const html = page({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'BreadcrumbList' },
        { '@type': 'Product', name: 'A', sku: 'a', offers: { price: 1 } },
        { '@type': 'Product', name: 'B', sku: 'b', offers: { price: 2 } },
      ],
    });
    expect(parseListings(html, OPTS).map((l) => l.retailerSku)).toEqual(['a', 'b']);
  });

  it('walks an ItemList of products', () => {
    const html = page({
      '@type': 'ItemList',
      itemListElement: [
        { '@type': 'ListItem', item: { '@type': 'Product', name: 'A', sku: 'a', offers: { price: '£5.00' } } },
      ],
    });
    const [l] = parseListings(html, OPTS);
    expect(l?.retailerSku).toBe('a');
    expect(l?.priceGbp).toBe(5);
  });

  it('accepts brand as a bare string and an array @type', () => {
    const html = page({
      '@type': ['Product', 'IndividualProduct'],
      name: 'X',
      sku: 'x',
      brand: 'Versace',
    });
    expect(parseListings(html, OPTS)[0]?.rawBrand).toBe('Versace');
  });

  it('takes the first of an array of offers', () => {
    const html = page({
      '@type': 'Product', name: 'X', sku: 'x',
      offers: [{ price: '10.00' }, { price: '99.00' }],
    });
    expect(parseListings(html, OPTS)[0]?.priceGbp).toBe(10);
  });

  it('rejects an identifier that is not a valid GTIN length', () => {
    // Retailers put internal ids in gtin13 more often than you would hope.
    const html = page({ '@type': 'Product', name: 'X', sku: 'x', gtin13: '12345' });
    expect(parseListings(html, OPTS)[0]?.ean).toBeNull();
  });

  it('falls back to the URL slug when there is no sku', () => {
    const html = page({
      '@type': 'Product', name: 'X', url: 'https://shop.example/p/dior-sauvage-100',
    });
    expect(parseListings(html, OPTS)[0]?.retailerSku).toBe('dior-sauvage-100');
  });

  it('deduplicates a product that appears twice on one page', () => {
    const html = page([
      { '@type': 'Product', name: 'X', sku: 'x' },
      { '@type': 'Product', name: 'X', sku: 'x' },
    ]);
    expect(parseListings(html, OPTS)).toHaveLength(1);
  });

  it('reads a published reference price and promotion end', () => {
    const html = page({
      '@type': 'Product', name: 'X', sku: 'x',
      offers: {
        price: '88.40',
        priceValidUntil: '2026-08-05T23:59:00Z',
        priceSpecification: { priceType: 'https://schema.org/ListPrice', price: '110.00' },
      },
    });
    const [l] = parseListings(html, OPTS);
    expect(l?.wasPriceGbp).toBe(110);
    expect(l?.promoEndsAt).toBe('2026-08-05T23:59:00.000Z');
  });

  it('ignores a reference price at or below the selling price', () => {
    // A stale RRP left in the markup is not a discount.
    const html = page({
      '@type': 'Product', name: 'X', sku: 'x',
      offers: { price: '90.00', highPrice: '90.00' },
    });
    expect(parseListings(html, OPTS)[0]?.wasPriceGbp).toBeNull();
  });

  it('returns nothing for a page with no Product markup', () => {
    expect(parseListings('<html><body>nothing here</body></html>', OPTS)).toEqual([]);
  });
});

/* ── reconcile ─────────────────────────────────────────────────────────────── */

function raw(sku: string, over: Partial<RawListing> = {}): RawListing {
  return {
    retailerSku: sku,
    url: `https://shop.example/p/${sku}`,
    rawTitle: `Product ${sku}`,
    rawBrand: 'Brand',
    ean: null,
    imageUrl: null,
    priceGbp: 10,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'fragrance',
    ...over,
  };
}

const DAY1 = '2026-07-25T06:00:00Z';
const DAY2 = '2026-07-26T06:00:00Z';

describe('reconcile', () => {
  it('marks the first crawl as a baseline and flags nothing new', () => {
    const r = reconcile({
      existing: [], crawled: [raw('a'), raw('b')],
      retailerId: 'boots', now: DAY1, complete: true,
    });

    expect(r.baseline).toBe(true);
    expect(r.newIds).toEqual([]);
    expect(r.listings.every((l) => l.eligibleForNewBadge === false)).toBe(true);
  });

  it('flags genuinely new listings after a baseline exists', () => {
    const base = reconcile({
      existing: [], crawled: [raw('a')], retailerId: 'boots', now: DAY1, complete: true,
    });
    const next = reconcile({
      existing: base.listings, crawled: [raw('a'), raw('b')],
      retailerId: 'boots', now: DAY2, complete: true,
    });

    expect(next.baseline).toBe(false);
    expect(next.newIds).toEqual(['boots::b']);
    expect(next.listings.find((l) => l.retailerSku === 'b')?.eligibleForNewBadge).toBe(true);
  });

  it('refreshes retailer fields but never moves firstSeenAt', () => {
    const base = reconcile({
      existing: [], crawled: [raw('a', { priceGbp: 10 })],
      retailerId: 'boots', now: DAY1, complete: true,
    });
    const next = reconcile({
      existing: base.listings, crawled: [raw('a', { priceGbp: 8, rawTitle: 'Renamed' })],
      retailerId: 'boots', now: DAY2, complete: true,
    });

    const a = next.listings[0]!;
    expect(a.priceGbp).toBe(8);
    expect(a.rawTitle).toBe('Renamed');
    expect(a.firstSeenAt).toBe(DAY1);
    expect(a.lastSeenAt).toBe(DAY2);
  });

  it('delists what the crawl no longer returns', () => {
    const base = reconcile({
      existing: [], crawled: [raw('a'), raw('b')],
      retailerId: 'boots', now: DAY1, complete: true,
    });
    const next = reconcile({
      existing: base.listings, crawled: [raw('a')],
      retailerId: 'boots', now: DAY2, complete: true,
    });

    expect(next.delistedIds).toEqual(['boots::b']);
    const b = next.listings.find((l) => l.retailerSku === 'b')!;
    expect(b.status).toBe('delisted');
    expect(b.delistedAt).toBe(DAY2);
  });

  it('delists nothing when the crawl did not finish', () => {
    // Absence is only evidence if we actually looked everywhere.
    const base = reconcile({
      existing: [], crawled: [raw('a'), raw('b')],
      retailerId: 'boots', now: DAY1, complete: true,
    });
    const next = reconcile({
      existing: base.listings, crawled: [raw('a')],
      retailerId: 'boots', now: DAY2, complete: false,
    });

    expect(next.delistedIds).toEqual([]);
    expect(next.listings.find((l) => l.retailerSku === 'b')?.status).toBe('active');
  });

  it('treats a returning listing as relisted rather than new', () => {
    const base = reconcile({ existing: [], crawled: [raw('a'), raw('b')], retailerId: 'boots', now: DAY1, complete: true });
    const gone = reconcile({ existing: base.listings, crawled: [raw('a')], retailerId: 'boots', now: DAY2, complete: true });
    const back = reconcile({
      existing: gone.listings, crawled: [raw('a'), raw('b')],
      retailerId: 'boots', now: '2026-07-27T06:00:00Z', complete: true,
    });

    expect(back.newIds).toEqual([]);
    expect(back.relistedIds).toEqual(['boots::b']);
    const b = back.listings.find((l) => l.retailerSku === 'b')!;
    expect(b.firstSeenAt).toBe(DAY1);
    expect(b.status).toBe('active');
    expect(b.delistedAt).toBeNull();
    expect(b.relistedAt).toBe('2026-07-27T06:00:00Z');
  });

  it('collapses a product listed in two sections', () => {
    const r = reconcile({
      existing: [], crawled: [raw('a', { sectionId: 'mens' }), raw('a', { sectionId: 'womens' })],
      retailerId: 'boots', now: DAY1, complete: true,
    });
    expect(r.listings).toHaveLength(1);
    expect(r.listings[0]?.sectionId).toBe('mens');
  });

  it('keeps a matched variant across a refresh', () => {
    const base = reconcile({ existing: [], crawled: [raw('a')], retailerId: 'boots', now: DAY1, complete: true });
    base.listings[0]!.variantId = 'sauvage-edp-100';
    const next = reconcile({ existing: base.listings, crawled: [raw('a')], retailerId: 'boots', now: DAY2, complete: true });
    expect(next.listings[0]?.variantId).toBe('sauvage-edp-100');
  });
});

/* ── the badge ─────────────────────────────────────────────────────────────── */

function stored(over: Partial<StoredListing> = {}): StoredListing {
  return {
    ...raw('a'),
    retailerId: 'boots',
    firstSeenAt: '2026-08-01T00:00:00Z',
    lastSeenAt: '2026-08-01T00:00:00Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: true,
    variantId: null,
    ...over,
  };
}

const NOW = new Date('2026-08-03T00:00:00Z');

describe('isNewListing', () => {
  it('is true inside the window', () => {
    expect(isNewListing(stored(), NOW)).toBe(true);
  });

  it('is false once the window has passed', () => {
    expect(isNewListing(stored({ firstSeenAt: '2026-07-20T00:00:00Z' }), NOW)).toBe(false);
  });

  it('is true exactly on the boundary', () => {
    expect(isNewListing(stored({ firstSeenAt: '2026-07-27T00:00:00Z' }), NOW)).toBe(true);
  });

  it('is false for a baseline listing however recent the crawl', () => {
    // Otherwise day one would badge an entire catalogue.
    expect(isNewListing(stored({ eligibleForNewBadge: false }), NOW)).toBe(false);
  });

  it('is false once the listing is gone', () => {
    expect(isNewListing(stored({ status: 'delisted' }), NOW)).toBe(false);
  });

  it('is false for a first seen date in the future', () => {
    expect(isNewListing(stored({ firstSeenAt: '2026-09-01T00:00:00Z' }), NOW)).toBe(false);
  });

  it('is false for an unparseable date', () => {
    expect(isNewListing(stored({ firstSeenAt: 'whenever' }), NOW)).toBe(false);
  });

  it('respects a custom window', () => {
    expect(isNewListing(stored({ firstSeenAt: '2026-07-30T00:00:00Z' }), NOW, 2)).toBe(false);
    expect(isNewListing(stored({ firstSeenAt: '2026-07-30T00:00:00Z' }), NOW, 30)).toBe(true);
  });
});

describe('newListings', () => {
  it('returns the newest first and excludes the rest', () => {
    const list = [
      stored({ retailerSku: 'old', firstSeenAt: '2026-06-01T00:00:00Z' }),
      stored({ retailerSku: 'mid', firstSeenAt: '2026-07-29T00:00:00Z' }),
      stored({ retailerSku: 'new', firstSeenAt: '2026-08-02T00:00:00Z' }),
    ];
    expect(newListings(list, NOW).map((l) => l.retailerSku)).toEqual(['new', 'mid']);
  });
});

describe('daysSinceFirstSeen', () => {
  it('counts whole days', () => {
    expect(daysSinceFirstSeen(stored({ firstSeenAt: '2026-08-01T00:00:00Z' }), NOW)).toBe(2);
  });

  it('never goes negative', () => {
    expect(daysSinceFirstSeen(stored({ firstSeenAt: '2026-09-01T00:00:00Z' }), NOW)).toBe(0);
  });
});

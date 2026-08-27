import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseListings, parsePrice, parseAvailability, extractJsonLdBlocks } from '../src/catalogue/jsonld.js';
import { reconcile } from '../src/catalogue/reconcile.js';
import { isNewListing, newListings, daysSinceFirstSeen } from '../src/catalogue/newBadge.js';
import type { RawListing, StoredListing } from '../src/catalogue/types.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

  // ── description ──────────────────────────────────────────────────────────
  // This parser did not read schema.org's `description` at all, so every
  // sitemap-route shop reached the catalogue with none while the feed and
  // Shopify routes carried real copy. Notes are parsed out of that field at
  // build time, so the omission silently capped notes coverage for those
  // shops at zero however well their pages were written.
  it('captures the product description', () => {
    const html = page({
      '@type': 'Product',
      name: 'A',
      sku: 'a',
      description: 'Top notes: Bergamot, Pepper. Base notes: Amber.',
      offers: { price: 1 },
    });
    expect(parseListings(html, OPTS)[0]?.description).toBe(
      'Top notes: Bergamot, Pepper. Base notes: Amber.',
    );
  });

  it('strips markup so the note parser sees prose, not tags', () => {
    // A <br> between the label and the list is the difference between the
    // note parser reading it and not.
    const html = page({
      '@type': 'Product',
      name: 'A',
      sku: 'a',
      description: '<p><strong>Top notes:</strong><br>Bergamot, Pepper</p>',
      offers: { price: 1 },
    });
    expect(parseListings(html, OPTS)[0]?.description).toBe('Top notes: Bergamot, Pepper');
  });

  it('treats a missing or placeholder description as none', () => {
    const none = page({ '@type': 'Product', name: 'A', sku: 'a', offers: { price: 1 } });
    expect(parseListings(none, OPTS)[0]?.description).toBeNull();

    // Shops emit a stray character or an empty tag here; carrying it costs a
    // row in the store and can never yield a note.
    const stub = page({
      '@type': 'Product', name: 'A', sku: 'a', description: '<p> </p>', offers: { price: 1 },
    });
    expect(parseListings(stub, OPTS)[0]?.description).toBeNull();
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

  // A site-relative URL taken verbatim is not a cosmetic defect: it lands in
  // the catalogue as `/products/x`, and an href like that on our own pages
  // resolves against pricesniffs.space, so the Buy button points at a 404 on
  // our domain rather than at the shop. Glorious Beauty's theme emits exactly
  // this, and all 49 of its stored listings carried it.
  it('resolves a site-relative product url against the page it was read from', () => {
    const html = page({
      '@type': 'Product',
      name: 'X',
      sku: 'x',
      url: '/products/glorious-x',
      offers: { price: 10 },
    });
    expect(parseListings(html, OPTS)[0]?.url).toBe('https://shop.example/products/glorious-x');
  });

  it('leaves an absolute product url exactly as published', () => {
    const html = page({
      '@type': 'Product',
      name: 'X',
      sku: 'x',
      url: 'https://other.example/p/x',
      offers: { price: 10 },
    });
    expect(parseListings(html, OPTS)[0]?.url).toBe('https://other.example/p/x');
  });

  it('falls back to the page url when the markup publishes none', () => {
    const html = page({ '@type': 'Product', name: 'X', sku: 'x', offers: { price: 10 } });
    expect(parseListings(html, OPTS)[0]?.url).toBe(OPTS.pageUrl);
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

  it('resolves a single offer with no identity of its own', () => {
    // Exactly one offer, so there is nothing to disambiguate — no sku on the
    // offer needed, unlike the multi-offer cases below.
    const html = page({
      '@type': 'Product', name: 'X', sku: 'x',
      offers: [{ price: '10.00' }],
    });
    expect(parseListings(html, OPTS)[0]?.priceGbp).toBe(10);
  });

  it('picks the offer whose own sku matches the listing, not whichever sorts first', () => {
    // Real shape this was caught from: a Shopify product page bundling
    // several size/variant offers under one Product block, only one of
    // which is genuinely the sku this listing is being recorded under. The
    // old behaviour took offers[0] unconditionally — here that would have
    // meant recording the 50ml bottle as £99 and out of stock, when it is
    // genuinely £10 and in stock; only the 100ml sibling is the expensive,
    // sold-out one.
    const html = page({
      '@type': 'Product', name: 'X', sku: 'x-50ml',
      offers: [
        { sku: 'x-100ml', price: '99.00', availability: 'https://schema.org/OutOfStock' },
        { sku: 'x-50ml', price: '10.00', availability: 'https://schema.org/InStock' },
      ],
    });
    const l = parseListings(html, OPTS)[0];
    expect(l?.priceGbp).toBe(10);
    expect(l?.inStock).toBe(true);
  });

  it('reports price and stock as unknown when several offers exist and none can be identified as this listing', () => {
    // No offer carries a sku, mpn, gtin or url of its own to match against —
    // genuinely ambiguous which one is this listing's. Guessing (the old
    // behaviour) traded a proven bug for a plausible-looking one; unknown is
    // the honest answer, and this app already has a real, supported state
    // for it rather than treating it as though it were "out of stock".
    const html = page({
      '@type': 'Product', name: 'X', sku: 'x',
      offers: [{ price: '10.00' }, { price: '99.00' }],
    });
    const l = parseListings(html, OPTS)[0];
    expect(l?.priceGbp).toBeNull();
    expect(l?.inStock).toBeNull();
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

  it('reads an aggregateRating carried on the same Product node as the price', () => {
    const html = page({
      '@type': 'Product', name: 'X', sku: 'x',
      offers: { price: '10.00' },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.6', reviewCount: '128' },
    });
    expect(parseListings(html, OPTS)[0]?.rating).toEqual({ value: 4.6, count: 128 });
  });

  it('accepts ratingCount as an alias for reviewCount', () => {
    const html = page({
      '@type': 'Product', name: 'X', sku: 'x',
      aggregateRating: { ratingValue: 4.2, ratingCount: 9 },
    });
    expect(parseListings(html, OPTS)[0]?.rating).toEqual({ value: 4.2, count: 9 });
  });

  it('keeps a rating with a star value but no published review count', () => {
    const html = page({
      '@type': 'Product', name: 'X', sku: 'x',
      aggregateRating: { ratingValue: '4.9' },
    });
    expect(parseListings(html, OPTS)[0]?.rating).toEqual({ value: 4.9, count: null });
  });

  it('does not invent a rating when the page carries none', () => {
    const html = page({ '@type': 'Product', name: 'X', sku: 'x', offers: { price: '10.00' } });
    expect(parseListings(html, OPTS)[0]?.rating).toBeNull();
  });

  it('does not invent a rating from a reviewCount with no ratingValue', () => {
    // A count with no star figure is not a rating anyone could show — the
    // schema-absence case must not silently zero it into "0 stars".
    const html = page({
      '@type': 'Product', name: 'X', sku: 'x',
      aggregateRating: { reviewCount: '40' },
    });
    expect(parseListings(html, OPTS)[0]?.rating).toBeNull();
  });
});

/*
 * ── Notino UK render capture, 2026-08-27 ────────────────────────────────────
 *
 * data/render-capture/notino-uk/*.html are real bytes committed by CI dispatch
 * run #344 (commit 0fb2cd4), captured via --capture-render-shop against
 * localBrowserRenderer — the free tier, no Apify credential involved. These
 * tests run the actual parsing path against them so a parser change is
 * checked against real markup, not a hand-written fixture that only proves
 * the parser agrees with itself.
 *
 * Only fragrance.html turned out to carry a real page: its `<title>` is
 * "Fragrances" and its JSON-LD is a genuine CollectionPage. mens.html,
 * womens.html and niche.html each rendered to Cloudflare's interactive
 * "Just a moment..." challenge instead — confirmed by their own `<title>`
 * and by the `cf-chl-widget`/`challenges.cloudflare.com` markup they carry,
 * not by a string match that could be an unrelated footer widget. That is a
 * different, harder failure than the plain HTTP 403 'proxied' documents: a
 * managed challenge is what the *browser* got shown after rendering, so a
 * plain headless render cannot be assumed to fix these three sections the
 * way it fixed fragrance. See src/config/retailers.ts's notino-uk entry.
 */
describe('parseListings against the real Notino UK render capture', () => {
  const capture = (name: string) =>
    readFileSync(resolve(REPO_ROOT, 'data/render-capture/notino-uk', name), 'utf8');

  it('reads 27 real, priced, in-stock listings out of fragrance.html', () => {
    const html = capture('fragrance.html');
    const listings = parseListings(html, {
      sectionId: 'fragrance',
      pageUrl: 'https://www.notino.co.uk/fragrance/?page=1',
    });

    expect(listings).toHaveLength(27);
    expect(listings.every((l) => l.priceGbp !== null)).toBe(true);
    expect(listings.every((l) => l.inStock === true)).toBe(true);

    // Hand-checked against the raw HTML itself (grep for "Xerjoff XJ 1861
    // Naxos" in the fixture): `"price":144.5`. Not a value this test invents.
    const xerjoff = listings.find((l) => l.rawTitle === 'Xerjoff XJ 1861 Naxos');
    expect(xerjoff?.priceGbp).toBe(144.5);
    expect(xerjoff?.url).toBe('https://www.notino.co.uk/xerjoff/xj-1861-naxos-eau-de-parfum-unisex/');

    // Notino's Product nodes carry none of sku/mpn/gtin13/gtin/productID — the
    // registry's notino-uk comment must not overclaim GTIN coverage this
    // capture never showed. Every listing still gets an identifier, but only
    // because parseListings falls back to the URL's own slug.
    expect(listings.every((l) => l.ean === null)).toBe(true);
    expect(listings.every((l) => l.retailerSku.length > 0)).toBe(true);
  });

  it('finds no listings in mens.html, womens.html or niche.html — Cloudflare challenge pages, not empty grids', () => {
    for (const name of ['mens.html', 'womens.html', 'niche.html']) {
      const html = capture(name);
      expect(html).toContain('cf-chl-widget');
      expect(html).toContain('challenges.cloudflare.com');
      expect(parseListings(html, { sectionId: name, pageUrl: 'https://www.notino.co.uk/' })).toHaveLength(0);
    }
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

describe('reconcile — merchantUrl survives storage', () => {
  // reconcile spreads the crawled listing rather than copying named fields, so
  // merchantUrl reaches storage without reconcile knowing it exists. These
  // guard that: if someone replaces the spread with an enumerated field list,
  // affiliate-feed listings silently lose their only verifiable address and
  // Fragrance Click drops back out of price verification with nothing failing.
  const feedRaw = (sku: string) =>
    raw(sku, {
      url: `https://www.awin1.com/pclick.php?p=${sku}&a=3026001&m=124166`,
      merchantUrl: `https://shop.example/products/${sku}`,
    });

  it('stores merchantUrl on a listing seen for the first time', () => {
    const r = reconcile({
      existing: [], crawled: [feedRaw('a')],
      retailerId: 'fragrance-click', now: DAY1, complete: true,
    });

    const stored = r.listings.find((l) => l.retailerSku === 'a');
    expect(stored?.merchantUrl).toBe('https://shop.example/products/a');
    expect(stored?.url).toBe('https://www.awin1.com/pclick.php?p=a&a=3026001&m=124166');
  });

  it('refreshes merchantUrl on a listing seen again, without touching url', () => {
    const base = reconcile({
      existing: [], crawled: [feedRaw('a')],
      retailerId: 'fragrance-click', now: DAY1, complete: true,
    });
    const moved = raw('a', {
      url: 'https://www.awin1.com/pclick.php?p=a&a=3026001&m=124166',
      merchantUrl: 'https://shop.example/products/a-renamed',
    });
    const next = reconcile({
      existing: base.listings, crawled: [moved],
      retailerId: 'fragrance-click', now: DAY2, complete: true,
    });

    const stored = next.listings.find((l) => l.retailerSku === 'a');
    expect(stored?.merchantUrl).toBe('https://shop.example/products/a-renamed');
    expect(stored?.url).toBe('https://www.awin1.com/pclick.php?p=a&a=3026001&m=124166');
    expect(stored?.firstSeenAt).toBe(DAY1);
  });

  it('leaves merchantUrl absent for a scraped listing that has no second URL', () => {
    const r = reconcile({
      existing: [], crawled: [raw('a')],
      retailerId: 'boots', now: DAY1, complete: true,
    });
    expect(r.listings[0]!.merchantUrl ?? null).toBeNull();
  });
});

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

/* ── crawl safety guards ───────────────────────────────────────────────────── */

import { crawlRetailer } from '../src/catalogue/crawl.js';
import type { CatalogueSnapshot } from '../src/catalogue/store.js';
import { getRetailer } from '../src/config/retailers.js';

/** In memory stand in for the file store. */
function fakeStore(initial?: Partial<CatalogueSnapshot>) {
  let snap: CatalogueSnapshot = {
    retailerId: 'boots',
    updatedAt: DAY1,
    listings: [],
    runs: [],
    ...initial,
  };
  return {
    read: () => snap,
    write: (s: CatalogueSnapshot) => {
      snap = s;
    },
    hasBaseline: () => snap.listings.length > 0,
    get current() {
      return snap;
    },
  };
}

function pageWith(count: number): string {
  return page(
    Array.from({ length: count }, (_, i) => ({
      '@type': 'Product', name: `P${i}`, sku: `p${i}`, offers: { price: '10.00' },
    })),
  );
}

const boots = getRetailer('boots')!;

describe('crawl safety guards', () => {
  it('refuses to write when a catalogue collapses', async () => {
    // Ten held, one found. A shop has not cleared its shelves overnight.
    const held = Array.from({ length: 10 }, (_, i) =>
      stored({ retailerId: 'boots', retailerSku: `p${i}` }),
    );
    const store = fakeStore({ listings: held, source: 'live' });

    const run = await crawlRetailer({
      retailer: boots,
      fetchPage: async (url) => ({ ok: true, html: url.includes('1') ? pageWith(1) : '', status: 200 }),
      store: store as never,
      source: 'live',
      sleep: async () => {},
    });

    expect(run.status).toBe('failed');
    expect(run.errors[0]).toContain('Refusing to write');
    // The previous snapshot survives intact.
    expect(store.current.listings).toHaveLength(10);
  });

  it('allows a normal sized crawl through', async () => {
    const held = Array.from({ length: 10 }, (_, i) =>
      stored({ retailerId: 'boots', retailerSku: `p${i}` }),
    );
    const store = fakeStore({ listings: held, source: 'live' });

    const run = await crawlRetailer({
      retailer: boots,
      fetchPage: async (url) => ({ ok: true, html: url.includes('1') ? pageWith(10) : '', status: 200 }),
      store: store as never,
      source: 'live',
      sleep: async () => {},
    });

    expect(run.status).toBe('ok');
    expect(run.listingsSeen).toBe(10);
  });

  it('refuses to mix fixture data into a live crawl', async () => {
    // Fixture SKUs are invented, so reconciling would delist everything held
    // and flag the whole real catalogue as new.
    const store = fakeStore({ listings: [stored({ retailerId: 'boots' })], source: 'fixtures' });

    const run = await crawlRetailer({
      retailer: boots,
      fetchPage: async () => ({ ok: true, html: pageWith(50), status: 200 }),
      store: store as never,
      source: 'live',
      sleep: async () => {},
    });

    expect(run.status).toBe('failed');
    expect(run.errors[0]).toContain('clean baseline');
  });

  it('lets a clean baseline run on any source', async () => {
    const store = fakeStore({ listings: [] });
    const run = await crawlRetailer({
      retailer: boots,
      fetchPage: async (url) => ({ ok: true, html: url.includes('1') ? pageWith(5) : '', status: 200 }),
      store: store as never,
      source: 'live',
      sleep: async () => {},
    });

    expect(run.status).toBe('ok');
    expect(run.baseline).toBe(true);
    expect(run.newListings).toBe(0);
  });
});

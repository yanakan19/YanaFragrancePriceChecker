import { describe, expect, it } from 'vitest';
import { selectUrlsToFetch } from '../src/catalogue/sitemapCrawl.js';
import { reconcile } from '../src/catalogue/reconcile.js';
import {
  parseShopifyProducts, parseShopCurrency, isShopifyProductsPayload,
} from '../src/catalogue/shopifyJson.js';
import type { RawListing, StoredListing } from '../src/catalogue/types.js';

/* ── the bug that capped every shop at one run's sample ─────────────────────── */

function listing(sku: string): RawListing {
  return {
    retailerSku: sku,
    url: `https://shop.example/p/${sku}`,
    rawTitle: `Scent ${sku} Eau de Parfum 100ml`,
    rawBrand: 'House',
    ean: null,
    imageUrl: null,
    priceGbp: 50,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'sitemap',
  };
}

function stored(sku: string): StoredListing {
  return {
    ...listing(sku),
    retailerId: 'shop',
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: true,
    variantId: null,
  };
}

describe('a budgeted walk is not evidence of absence', () => {
  const existing = [stored('a'), stored('b'), stored('c')];
  const now = '2026-02-01T00:00:00.000Z';

  it('delists nothing when the walk only sampled part of the catalogue', () => {
    // This is the exact shape of the production bug: run two sampled a
    // different slice of the sitemap than run one, and every product run one
    // had found was marked withdrawn despite still being on sale.
    const result = reconcile({
      existing, crawled: [listing('d')], retailerId: 'shop', now, complete: false,
    });

    expect(result.delistedIds).toEqual([]);
    expect(result.listings.filter((l) => l.status === 'active')).toHaveLength(4);
  });

  it('still delists when the walk genuinely reached the end', () => {
    const result = reconcile({
      existing, crawled: [listing('a')], retailerId: 'shop', now, complete: true,
    });

    expect(result.delistedIds).toHaveLength(2);
  });

  it('accumulates across runs that each see a different slice', () => {
    let listings = existing;
    for (const sku of ['d', 'e', 'f']) {
      listings = reconcile({
        existing: listings, crawled: [listing(sku)], retailerId: 'shop', now, complete: false,
      }).listings;
    }

    // Six known, all still active — the behaviour that lets a shop's stored
    // catalogue grow past one budget instead of being replaced by it.
    expect(listings).toHaveLength(6);
    expect(listings.every((l) => l.status === 'active')).toBe(true);
  });
});

/* ── spending the budget where it grows the catalogue ───────────────────────── */

describe('selectUrlsToFetch', () => {
  const urls = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10'];

  it('takes everything when the budget covers the catalogue', () => {
    expect(selectUrlsToFetch(urls.slice(0, 3), 10)).toEqual(['u1', 'u2', 'u3']);
  });

  it('spends a first run entirely on discovery', () => {
    expect(selectUrlsToFetch(urls, 4, new Map())).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('prefers URLs it has never fetched over ones it holds', () => {
    const known = new Map([
      ['u1', '2026-01-01T00:00:00.000Z'],
      ['u2', '2026-01-01T00:00:00.000Z'],
    ]);
    // Without this the walk re-fetched u1 and u2 every single run and never
    // reached u3 onward, which is why a shop stayed stuck at one budget.
    expect(selectUrlsToFetch(urls, 4, known)).toContain('u3');
    expect(selectUrlsToFetch(urls, 4, known)).toContain('u4');
  });

  it('reserves part of the budget to refresh the stalest prices first', () => {
    const known = new Map([
      ['u1', '2026-01-05T00:00:00.000Z'],
      ['u2', '2026-01-01T00:00:00.000Z'],
      ['u3', '2026-01-03T00:00:00.000Z'],
    ]);
    const picked = selectUrlsToFetch(urls, 10, known, 0.3);

    // Three of ten reserved for refresh, oldest first.
    expect(picked).toContain('u2');
    expect(picked.filter((u) => known.has(u))).toHaveLength(3);
  });

  it('never exceeds the budget', () => {
    const known = new Map(urls.map((u) => [u, '2026-01-01T00:00:00.000Z']));
    expect(selectUrlsToFetch(urls, 3, known)).toHaveLength(3);
  });

  it('uses leftover budget for refreshes when little is unseen', () => {
    const known = new Map([
      ['u1', '2026-01-01T00:00:00.000Z'],
      ['u2', '2026-01-02T00:00:00.000Z'],
      ['u3', '2026-01-03T00:00:00.000Z'],
    ]);
    // Only u4..u10 unseen but a budget of 10: nothing should be wasted.
    expect(selectUrlsToFetch(urls, 10, known)).toHaveLength(10);
  });
});

/* ── reading a house's catalogue without an API ─────────────────────────────── */

const SHOPIFY = JSON.stringify({
  products: [
    {
      id: 111,
      title: 'Hawas Ice',
      handle: 'hawas-ice',
      vendor: 'Rasasi',
      body_html: '<p>Top notes: Bergamot, Apple.</p><p>Base notes: Amber</p>',
      images: [{ src: 'https://cdn.example/hawas.jpg' }],
      variants: [
        { id: 1, sku: 'HAWAS-100', title: '100ml', price: '95.00', compare_at_price: '120.00', available: true },
        { id: 2, sku: 'HAWAS-50', title: '50ml', price: '65.00', compare_at_price: null, available: false },
      ],
    },
  ],
});

describe('Shopify products.json', () => {
  it('recognises a products payload and rejects a homepage', () => {
    expect(isShopifyProductsPayload(SHOPIFY)).toBe(true);
    expect(isShopifyProductsPayload('<html>not json</html>')).toBe(false);
    expect(isShopifyProductsPayload('{"collections":[]}')).toBe(false);
  });

  it('reads one listing per variant, with the size in the title', () => {
    const out = parseShopifyProducts(SHOPIFY, {
      origin: 'https://www.rasasi.com', sectionId: 'house-direct', currency: 'GBP',
    });

    expect(out).toHaveLength(2);
    expect(out[0]!.rawTitle).toBe('Hawas Ice 100ml');
    expect(out[0]!.rawBrand).toBe('Rasasi');
    expect(out[0]!.url).toBe('https://www.rasasi.com/products/hawas-ice');
    expect(out[0]!.imageUrl).toBe('https://cdn.example/hawas.jpg');
    expect(out[1]!.inStock).toBe(false);
  });

  it('prices in sterling only when the shop actually sells in sterling', () => {
    const gbp = parseShopifyProducts(SHOPIFY, {
      origin: 'https://x.example', sectionId: 's', currency: 'GBP',
    });
    expect(gbp[0]!.priceGbp).toBe(95);
    expect(gbp[0]!.wasPriceGbp).toBe(120);
    expect(gbp[0]!.nativePrice).toBeNull();
  });

  // A user reported French Avenue "Vulcan Feu" showing £67.99 against a £30.99
  // shop price, and the house harvest was suspected of reading compare_at_price
  // as the selling price. It was not: the listing was MyBeauty.Boutique's, off
  // the Awin feed, and no French Avenue house exists in src/config/houses.ts at
  // all. These two hold the house route to the reading that cleared it.
  it('reads price as the selling price and compare_at_price as the reference, never the reverse', () => {
    const out = parseShopifyProducts(SHOPIFY, {
      origin: 'https://x.example', sectionId: 's', currency: 'GBP',
    });
    expect(out[0]!.priceGbp).toBe(95);
    expect(out[0]!.wasPriceGbp).toBe(120);
    // The failure being guarded against is the swap, so state it directly.
    expect(out[0]!.priceGbp).toBeLessThan(out[0]!.wasPriceGbp!);
  });

  it('drops a compare_at_price at or below the selling price instead of swapping it in', () => {
    const body = JSON.stringify({
      products: [{
        id: 1, title: 'X', handle: 'x', vendor: 'V', images: [],
        variants: [
          { id: 1, sku: 'EQUAL', title: '100ml', price: '30.99', compare_at_price: '30.99', available: true },
          { id: 2, sku: 'BELOW', title: '50ml', price: '30.99', compare_at_price: '20.00', available: true },
        ],
      }],
    });
    const out = parseShopifyProducts(body, {
      origin: 'https://x.example', sectionId: 's', currency: 'GBP',
    });
    expect(out.map((l) => l.priceGbp)).toEqual([30.99, 30.99]);
    expect(out.map((l) => l.wasPriceGbp)).toEqual([null, null]);
  });

  it('never presents dirhams as pounds', () => {
    const aed = parseShopifyProducts(SHOPIFY, {
      origin: 'https://x.example', sectionId: 's', currency: 'AED',
    });
    expect(aed[0]!.priceGbp).toBeNull();
    expect(aed[0]!.wasPriceGbp).toBeNull();
    expect(aed[0]!.nativePrice).toEqual({ amount: 95, currency: 'AED' });
  });

  it('treats an unknown currency as unknown rather than as sterling', () => {
    const out = parseShopifyProducts(SHOPIFY, {
      origin: 'https://x.example', sectionId: 's', currency: null,
    });
    expect(out[0]!.priceGbp).toBeNull();
    expect(out[0]!.nativePrice).toEqual({ amount: 95, currency: 'unknown' });
  });

  it('carries the house copy as plain text so notes can be parsed from it', () => {
    const out = parseShopifyProducts(SHOPIFY, {
      origin: 'https://x.example', sectionId: 's', currency: 'GBP',
    });
    expect(out[0]!.description).toContain('Top notes: Bergamot, Apple');
    expect(out[0]!.description).not.toContain('<p>');
  });

  it('drops a variant with no price rather than inventing one', () => {
    const body = JSON.stringify({
      products: [{
        id: 1, title: 'X', handle: 'x', vendor: 'V', images: [],
        variants: [{ id: 1, sku: 'A', title: '100ml', price: null, available: true }],
      }],
    });
    expect(parseShopifyProducts(body, { origin: 'https://x.example', sectionId: 's', currency: 'GBP' })).toEqual([]);
  });

  it('survives malformed payloads', () => {
    expect(parseShopifyProducts('not json', { origin: 'https://x.example', sectionId: 's', currency: 'GBP' })).toEqual([]);
  });
});

describe('parseShopCurrency', () => {
  it('reads meta.json', () => {
    expect(parseShopCurrency('{"currency":"AED"}', null)).toBe('AED');
  });

  it('falls back to the currency the theme inlines', () => {
    const html = '<script>var Shopify = {}; Shopify.currency = {"active":"USD","rate":"1.0"};</script>';
    expect(parseShopCurrency(null, html)).toBe('USD');
  });

  it('is null when neither source says, rather than guessing sterling', () => {
    expect(parseShopCurrency(null, null)).toBeNull();
    expect(parseShopCurrency('<html>404</html>', '<html>nothing here</html>')).toBeNull();
  });
});

/* ── finding products at shops that do not name their aisles ────────────────── */

import { crawlViaSitemap } from '../src/catalogue/sitemapCrawl.js';
import { NO_RESTRICTIONS } from '../src/catalogue/robots.js';
import type { Retailer } from '../src/types/retailer.js';

const shop = { id: 'x', name: 'X', domain: 'x.example' } as unknown as Retailer;

function sitemapOf(urls: string[]): string {
  return `<urlset>${urls.map((u) => `<loc>${u}</loc>`).join('')}</urlset>`;
}

/** Serves a canned sitemap tree and records what was asked for. */
function server(tree: Record<string, string>) {
  const asked: string[] = [];
  const http = async (url: string) => {
    asked.push(url);
    const body = tree[url];
    return body === undefined
      ? { status: 404, body: '', ok: false }
      : { status: 200, body, ok: true };
  };
  return { http, asked };
}

describe('sitemap discovery', () => {
  const opts = {
    retailer: shop, robots: NO_RESTRICTIONS, maxPages: 10, gapMs: 0,
    headers: {}, sleep: async () => {},
  };

  it('finds products when the aisle is named, as before', async () => {
    const { http } = server({
      'https://www.x.example/sitemap.xml': sitemapOf([
        'https://x.example/fragrance/dior-sauvage',
        'https://x.example/socks/black',
      ]),
    });
    const r = await crawlViaSitemap({ ...opts, http });
    // Only the fragrance URL is fetched; socks are never requested.
    expect(r.urlsDiscovered).toBe(1);
  });

  it('finds products at a shop whose URLs carry ids, not category words', async () => {
    // The Boots / Harvey Nichols shape: a product sitemap full of opaque ids.
    // This previously discovered nothing and reported "0 urls" with no error.
    const { http } = server({
      'https://www.x.example/sitemap.xml': sitemapOf([
        'https://www.x.example/sitemap_products_1.xml',
        'https://www.x.example/sitemap_content.xml',
      ]),
      'https://www.x.example/sitemap_products_1.xml': sitemapOf([
        'https://x.example/p/10429551',
        'https://x.example/p/10429552',
      ]),
      'https://www.x.example/sitemap_content.xml': sitemapOf([
        'https://x.example/about-us',
      ]),
    });
    const r = await crawlViaSitemap({ ...opts, http });
    expect(r.urlsDiscovered).toBe(2);
  });

  it('ignores non-product sitemaps when deciding what is generic', async () => {
    const { http, asked } = server({
      'https://www.x.example/sitemap.xml': sitemapOf([
        'https://www.x.example/sitemap_content.xml',
      ]),
      'https://www.x.example/sitemap_content.xml': sitemapOf([
        'https://x.example/about-us',
      ]),
    });
    const r = await crawlViaSitemap({ ...opts, http });
    // A content sitemap is not descended into at all, so nothing is collected.
    expect(r.urlsDiscovered).toBe(0);
    expect(asked).not.toContain('https://x.example/about-us');
  });

  it('prefers named fragrance URLs over generic ones when both exist', async () => {
    const { http } = server({
      'https://www.x.example/sitemap.xml': sitemapOf([
        'https://www.x.example/sitemap_products_1.xml',
      ]),
      'https://www.x.example/sitemap_products_1.xml': sitemapOf([
        'https://x.example/perfume/aventus',
        'https://x.example/p/99999',
      ]),
    });
    const r = await crawlViaSitemap({ ...opts, http });
    expect(r.urlsDiscovered).toBe(1);
  });

  it('does not treat every URL as fragrance just because the shop is named after one', async () => {
    // The regression that cost run #158 14m35s for zero listings. SCENT was
    // tested against the whole URL, so a hostname like escentual.com,
    // thefragrancecounter.co.uk or scentstore.com matched on its own — every
    // URL in the sitemap looked like a named fragrance aisle, the generic
    // fallback was never reached because the scented set was never empty, and
    // the page budget went on the shop's CMS pages.
    const scentedHost = { id: 'y', name: 'Y', domain: 'scentstore.example' } as unknown as Retailer;
    const { http } = server({
      'https://www.scentstore.example/sitemap.xml': sitemapOf([
        'https://www.scentstore.example/sitemap_products_1.xml',
        'https://www.scentstore.example/sitemap_content.xml',
      ]),
      'https://www.scentstore.example/sitemap_products_1.xml': sitemapOf([
        'https://www.scentstore.example/p/10429551',
      ]),
      'https://www.scentstore.example/sitemap_content.xml': sitemapOf([
        'https://www.scentstore.example/about-us',
        'https://www.scentstore.example/delivery-information',
      ]),
    });
    const r = await crawlViaSitemap({ ...opts, retailer: scentedHost, http });

    // Only the one real product URL, from the sitemap whose own name says it
    // lists products. The two content pages are not fragrance URLs just
    // because "scent" appears in the host.
    expect(r.urlsDiscovered).toBe(1);
    expect(r.sampledUrls).toEqual(['https://www.scentstore.example/p/10429551']);
  });

  it('still reads a fragrance word in the path of a shop named after one', async () => {
    const scentedHost = { id: 'y', name: 'Y', domain: 'scentstore.example' } as unknown as Retailer;
    const { http } = server({
      'https://www.scentstore.example/sitemap.xml': sitemapOf([
        'https://www.scentstore.example/perfume/aventus',
        'https://www.scentstore.example/socks/black',
      ]),
    });
    const r = await crawlViaSitemap({ ...opts, retailer: scentedHost, http });
    expect(r.urlsDiscovered).toBe(1);
    expect(r.sampledUrls).toEqual(['https://www.scentstore.example/perfume/aventus']);
  });

  it('falls back to the conventional path when the declared sitemap is dead', async () => {
    // John Lewis's shape: robots.txt names a siteindex.xml that never answers.
    const { http, asked } = server({
      'https://www.x.example/sitemap.xml': sitemapOf(['https://x.example/perfume/a']),
    });
    const robots = { ...NO_RESTRICTIONS, sitemaps: ['https://www.x.example/siteindex.xml'] };
    const r = await crawlViaSitemap({ ...opts, robots, http });

    expect(asked).toContain('https://www.x.example/siteindex.xml');
    expect(asked).toContain('https://www.x.example/sitemap.xml');
    expect(r.urlsDiscovered).toBe(1);
  });
});

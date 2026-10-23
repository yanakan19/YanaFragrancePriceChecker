// Two readers of a region shop's own product page (23 Oct 2026): every size of a page's AggregateOffer (Dillard's) and the
// strength printed in a labelled field of the product facts (Luckyscent). Both read the page the walk fetches anyway.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { HttpResponse } from '../src/catalogue/attempt.js';
import { aggregateOfferListings, harvestRegionShop, listingsPerOffer, pageFieldStrength } from '../src/catalogue/regionHarvest.js';
import { REGION_RETAILERS } from '../src/config/regionRetailers.js';
import type { RawListing } from '../src/catalogue/types.js';

const NOW = '2026-10-23T12:00:00.000Z';
const US = (id: string) => REGION_RETAILERS.US.find((s) => s.id === id)!;

const offer = (sku: string, size: string, price: string, availability = 'InStock') => ({
  '@type': 'Offer',
  checkoutPageURLTemplate: `https://www.dillards.com/webapp/wcs/stores/servlet/OrderItemAdd?catEntryId=1&productId=2&quantity=1&field2=Size:${size}`,
  availability: `http://schema.org/${availability}`,
  itemOffered: { '@type': 'Product', sku, offers: { '@type': 'Offer', price, priceCurrency: 'USD' } },
  price,
  priceCurrency: 'USD',
});
const dillardsPage = (offers: unknown[]) => `<html><head><script type="application/ld+json">${JSON.stringify({
  '@context': 'http://schema.org/', '@type': 'Product', productID: '20715171', sku: 'LC022A01', name: 'Lacoste L.12.12 Bleu Eau de Parfum',
  brand: { '@type': 'Brand', name: 'Lacoste' }, image: 'https://dimg.dillards.com/is/image/x.jpg',
  offers: { '@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: '60.00', highPrice: '106.00', offers },
})}</script></head><body></body></html>`;

describe('the offers of a page that lists every size in one AggregateOffer', () => {
  it('reads each size from its checkout address, with its own sku, price and stock', () => {
    const got = aggregateOfferListings(dillardsPage([offer('6512984', '3.3%20oz.', '106.00'), offer('6512985', '1.7 oz.', '60.00', 'OutOfStock')]));
    expect(got).toEqual([
      { sku: '6512984', size: '3.3 oz.', price: 106, currency: 'USD', inStock: true },
      { sku: '6512985', size: '1.7 oz.', price: 60, currency: 'USD', inStock: false },
    ]);
  });

  it('reads the redacted fixture of a real Dillard\'s page (read 23 Oct 2026)', () => {
    const html = readFileSync(join(process.cwd(), 'fixtures/regions/us/dillards.html'), 'utf8');
    const got = aggregateOfferListings(html);
    expect(got.length).toBeGreaterThan(0);
    for (const o of got) {
      expect(o.size).toMatch(/\d/);
      expect(o.price).toBeGreaterThan(0);
      expect(o.currency).toBe('USD');
    }
  });

  it('reads nothing where an offer lacks a size, a sku or a price, or two offers share a sku', () => {
    expect(aggregateOfferListings(dillardsPage([offer('1', '3.3 oz.', '10.00'), { ...offer('2', '1 oz.', '5.00'), checkoutPageURLTemplate: 'https://x/y?a=1' }]))).toEqual([]);
    expect(aggregateOfferListings(dillardsPage([offer('1', '3.3 oz.', '10.00'), offer('1', '1 oz.', '5.00')]))).toEqual([]);
    expect(aggregateOfferListings('<html>no data</html>')).toEqual([]);
    expect(aggregateOfferListings('<script type="application/ld+json">{not json</script>')).toEqual([]);
  });

  it('makes one sized listing per offer and never keeps the page\'s product id as a barcode', () => {
    const base = { retailerSku: 'LC022A01', url: 'https://www.dillards.com/p/x/1', rawTitle: 'Lacoste L.12.12 Bleu Eau de Parfum', rawBrand: 'Lacoste', ean: '20715171',
      imageUrl: null, priceGbp: null, wasPriceGbp: null, promoEndsAt: null, inStock: true, sectionId: 's' } as RawListing;
    const out = listingsPerOffer(base, [{ sku: 'a', size: '3.3 oz.', price: 106, currency: 'USD', inStock: true }, { sku: 'b', size: '1.7 oz.', price: 60, currency: 'USD', inStock: null }]);
    expect(out.map((l) => [l.retailerSku, l.rawTitle, l.ean, l.nativePrice])).toEqual([
      ['a', 'Lacoste L.12.12 Bleu Eau de Parfum 3.3 oz.', null, { amount: 106, currency: 'USD' }],
      ['b', 'Lacoste L.12.12 Bleu Eau de Parfum 1.7 oz.', null, { amount: 60, currency: 'USD' }],
    ]);
    expect(out[1]!.inStock).toBe(true);
  });
});

describe('the strength a page prints among its product facts', () => {
  const facts = (value: string) => `<div class="x"><div class="leading-4 font-normal">Concentration</div><div class="space-x-2"><a href="/fragrances?f.l.concentration=${value}" data-discover="true">${value}</a></div></div>`;

  it('maps the printed value to the catalogue\'s strengths, and Extrait is Extrait de Parfum', () => {
    expect(pageFieldStrength(facts('Extrait'), 'Concentration')).toBe('Extrait de Parfum');
    expect(pageFieldStrength(facts('Eau de Parfum'), 'Concentration')).toBe('Eau de Parfum');
    expect(pageFieldStrength(facts('Eau de Toilette'), 'Concentration')).toBe('Eau de Toilette');
    expect(pageFieldStrength(facts('Parfum'), 'Concentration')).toBe('Parfum');
  });

  it('reads nothing from a page without the field or with a value that is no strength', () => {
    expect(pageFieldStrength('<div>Country</div><div><a>France</a></div>', 'Concentration')).toBeNull();
    expect(pageFieldStrength(facts('Candle'), 'Concentration')).toBeNull();
    expect(pageFieldStrength('', 'Concentration')).toBeNull();
  });
});

describe('the shops that use them', () => {
  it('Dillard\'s is on, with its own page budget, and Luckyscent reads the Concentration field', () => {
    const d = US('dillards');
    expect(d.enabled).toBe(true);
    expect(d.offersFromAggregate).toBe(true);
    expect(d.blockedReason).toBeUndefined();
    expect(d.minRequestGapMs).toBeGreaterThanOrEqual(1500);
    expect(US('luckyscent').strengthFromPageField).toBe('Concentration');
  });
});

describe('a walk through a fake network', () => {
  const robots = 'User-agent: *\nDisallow: /webapp/wcs/stores/servlet/\n';
  const asked: string[] = [];
  const net = (pages: Record<string, string>, index: string, child: string) => async (url: string): Promise<HttpResponse> => {
    asked.push(url);
    if (url.endsWith('/robots.txt')) return { status: 200, ok: true, body: robots };
    if (url in pages) return { status: 200, ok: true, body: pages[url]! };
    if (/sitemap\.xml$/.test(url)) return { status: 200, ok: true, body: index };
    if (/sitemap_beauty_1\.xml$|\/sitemap\/products\/1\.xml$/.test(url)) return { status: 200, ok: true, body: child };
    return { status: 404, ok: false, body: '' };
  };
  const urlset = (...locs: string[]) => `<urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>`;

  it('Dillard\'s: one listing per size of a page, in dollars, asked at PriceSniffsBot\'s gap', async () => {
    asked.length = 0;
    const page = 'https://www.dillards.com/p/lacoste-l.12.12-bleu-eau-de-parfum/522050841';
    const http = net({ [page]: dillardsPage([offer('6512984', '3.3 oz.', '106.00'), offer('6512985', '1.7 oz.', '60.00')]) },
      '<sitemapindex><sitemap><loc>https://www.dillards.com/sitemap/sitemap_beauty_1.xml</loc></sitemap></sitemapindex>', urlset(page));
    const { report, snapshot } = await harvestRegionShop({ shop: US('dillards'), http, now: NOW, previous: null, maxPages: 10, shopMs: 60_000, refreshAfterHours: 20, sleep: async () => {} });
    expect(report.status).toBe('priced');
    expect(snapshot!.listings.map((l) => [l.retailerSku, l.price, l.rawTitle]).sort()).toEqual([
      ['6512984', 106, 'Lacoste L.12.12 Bleu Eau de Parfum 3.3 oz.'],
      ['6512985', 60, 'Lacoste L.12.12 Bleu Eau de Parfum 1.7 oz.'],
    ]);
    expect(snapshot!.listings.every((l) => l.ean === null)).toBe(true);
    expect(asked[0]).toMatch(/\/robots\.txt$/);
  });

  it('Luckyscent: a title that states no strength takes the page\'s, a title that states one keeps it', async () => {
    const mk = (name: string, value: string) => `<html><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Product', name, sku: name.replace(/\W/g, ''), brand: { '@type': 'Brand', name: 'Sylhouette Parfums' },
      offers: { '@type': 'Offer', price: '225.0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
    })}</script><div>Concentration</div><div class="s"><a href="/x">${value}</a></div></html>`;
    const a = 'https://www.luckyscent.com/products/romance-noire-by-sylhouette-parfums';
    const b = 'https://www.luckyscent.com/products/soleil-noir-by-sylhouette-parfums';
    const http = net({ [a]: mk('Romance Noire - 50ml', 'Extrait'), [b]: mk('Soleil Noir Eau de Toilette - 50ml', 'Extrait') },
      '<sitemapindex><sitemap><loc>https://www.luckyscent.com/sitemap/products/1.xml</loc></sitemap></sitemapindex>', urlset(a, b));
    const { snapshot } = await harvestRegionShop({ shop: US('luckyscent'), http, now: NOW, previous: null, maxPages: 10, shopMs: 60_000, refreshAfterHours: 20, sleep: async () => {} });
    const titles = snapshot!.listings.map((l) => l.rawTitle).sort();
    expect(titles).toEqual(['Romance Noire - Extrait de Parfum 50ml', 'Soleil Noir Eau de Toilette - 50ml']);
  });
});

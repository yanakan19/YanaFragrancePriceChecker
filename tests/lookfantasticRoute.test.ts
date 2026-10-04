import { describe, expect, it } from 'vitest';
import { crawlViaSitemap, ROUTE_HEADERS } from '../src/catalogue/sitemapCrawl.js';
import { isAllowed, parseRobots } from '../src/catalogue/robots.js';
import { isFragrance } from '../src/catalogue/fragranceId.js';
import { getRetailer } from '../src/config/retailers.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * LOOKFANTASTIC, on the same THG platform as Cult Beauty, is read from the
 * shop's own "view all fragrance" category pages as PriceSniffsBot. The
 * addresses and robots.txt below are what the shop served on 2026-10-04.
 */

/** The "*" group in full and the two browser groups, as read 2026-10-04T17:50Z. */
const LOOKFANTASTIC_ROBOTS = `User-agent: *
Disallow: /renderer/*
Disallow: */email/*
Disallow: /*.html?buy=*
Disallow: /*_escaped_fragment_
Disallow: /*buy=*
Disallow: /*facetFilters=*
Disallow: /*fromBrands=*
Disallow: /*helpfulReview.account?*reviewId=*
Disallow: /*pagination_sortSelect=*
Disallow: /*reportReview.account?*reviewId=*
Disallow: /*search=*
Disallow: /search/*
Disallow: /*sessionSettings.overlay
Disallow: /*sortOrder=*
Disallow: /*switchLocale.overlay
Disallow: /basketinterface.json?productId=*
Disallow: /checkout
Disallow: /checkout-api
Disallow: /components/diversionNotifier/*
Disallow: /components/internationalOverlay/*
Disallow: /my.basket?*buy=*
Disallow: /my.basket?*buylist=*
Disallow: /products.foundationMatcher
Disallow: /styleguide.info
Disallow: /submit-review.info
Disallow: /*.location
Disallow: /store.locate
Disallow: /*searchInfo=*
Disallow: /*redirectedFromSearch=*
Disallow: /*originalSearchRay=*

User-agent: mozilla/4
Disallow: /

User-agent: mozilla/5
Disallow: /

Sitemap: https://www.lookfantastic.com/sitemapindex-product.xml.gz
Sitemap: https://www.lookfantastic.com/sitemapindex-list.xml.gz
`;

describe('LOOKFANTASTIC in the registry', () => {
  const lf = getRetailer('lookfantastic')!;
  const r = lf.sitemapRoute!;
  const robots = parseRobots(LOOKFANTASTIC_ROBOTS);

  it('is a pinned route, so every request is PriceSniffsBot and never a browser', () => {
    expect(lf.enabled).toBe(true);
    expect(r).toBeDefined();
    // The browser groups say Disallow: /, so a browser identity is exactly what the file refuses.
    expect(robots.disallow).not.toContain('/');
    expect(robots.crawlDelaySeconds).toBeNull();
  });

  it('walks the shop\'s view all fragrance aisle, rotated, and reads sizes and strength from the page', () => {
    expect(r.categories!.pages).toEqual(['https://www.lookfantastic.com/c/health-beauty/fragrance/view-all-fragrance/']);
    expect(r.categories!.pageParam).toBe('pageNumber');
    expect(r.categories!.rotation).toBe(3);
    expect(r.categories!.pageCount).toBeDefined();
    expect(r.categories!.maxPages).toBeGreaterThanOrEqual(75);
    expect(r.variantSizesFromPage).toBe(true);
    expect(r.strengthFromPage).toBe(true);
    expect(r.requireGbp).toBe(true);
  });

  it('asks only for addresses its robots.txt permits: every page of the aisle, the sitemaps, product pages and size links', () => {
    const page = r.categories!.pages[0]!;
    expect(isAllowed(robots, page)).toBe(true);
    for (const n of [2, 40, 75, r.categories!.maxPages]) expect(isAllowed(robots, `${page}?pageNumber=${n}`), String(n)).toBe(true);
    for (const root of r.roots) expect(isAllowed(robots, root), root).toBe(true);
    expect(isAllowed(robots, 'https://www.lookfantastic.com/sitemap-product-0.xml.gz')).toBe(true);
    expect(isAllowed(robots, 'https://www.lookfantastic.com/p/ysl-libre-santal-couture-eau-de-parfum-50ml/17811114/')).toBe(true);
    expect(isAllowed(robots, 'https://www.lookfantastic.com/p/ysl-libre-santal-couture-eau-de-parfum-50ml/17811114/?variation=17811115')).toBe(true);
    // Its own disallows are real ones: search and sort are the parameters not to use.
    expect(isAllowed(robots, `${page}?search=x`)).toBe(false);
    expect(isAllowed(robots, `${page}?sortOrder=asc`)).toBe(false);
  });

  it('keeps a product address with a slug and an id, and nothing else', () => {
    const keep = new RegExp(r.product, 'i');
    expect(keep.test('https://www.lookfantastic.com/p/ysl-libre-santal-couture-eau-de-parfum-50ml/17811114/')).toBe(true);
    expect(keep.test('https://www.lookfantastic.com/p/17811114/')).toBe(false);
    expect(keep.test('https://www.lookfantastic.com/p/x/1/?variation=1')).toBe(false);
    expect(keep.test('https://www.lookfantastic.co.uk/p/x/1/')).toBe(false);
  });

  it('reads the product cards and page count the shop publishes (75 pages of 32, 2026-10-04)', () => {
    const html =
      '<span>Page 1 of 75</span>' +
      '<product-card-wrapper data-quicklook-url="/p/givenchy-l-interdit-eau-de-parfum-80ml/13716352/" data-context="x">' +
      '<a href="/p/ignored-carousel-link/1/">x</a>';
    expect([...html.matchAll(new RegExp(r.categories!.productLink, 'gi'))].map((m) => m[1])).toEqual([
      '/p/givenchy-l-interdit-eau-de-parfum-80ml/13716352/',
    ]);
    expect(new RegExp(r.categories!.pageCount!, 'i').exec(html)?.[1]).toBe('75');
  });

  it('names out candles, diffusers, mists and body care, and no perfume the shop sells by that name', () => {
    const out = new RegExp(r.exclude!, 'i');
    for (const slug of [
      'jo-malone-london-lime-basil-mandarin-classic-candle-200g',
      'jo-malone-london-pomegranate-noir-diffuser-refill-165ml',
      'espa-restorative-scented-candle-240g',
      'calvin-klein-cotton-musk-body-mist-236ml',
      'fenty-fragrance-allover-body-mist-vanilla-flower-175ml',
    ]) {
      expect(out.test(`/p/${slug}/1/`), slug).toBe(true);
    }
    for (const slug of [
      'armani-stronger-with-you-eau-de-toilette-100ml',
      'ysl-libre-santal-couture-eau-de-parfum-50ml',
      'burberry-goddess-eau-de-parfum-for-women-refill-150ml',
      'creed-aventus-eau-de-parfum-100ml',
      'jean-paul-gaultier-scandal-eau-de-parfum-spray-50ml',
      'chloe-eau-de-parfum-refillable-100ml',
    ]) {
      expect(out.test(`/p/${slug}/1/`), slug).toBe(false);
    }
  });

  it('reads a floor of 300 never read pages a run', () => {
    expect(r.discoveryPages).toBe(300);
    expect(r.maxSitemaps).toBe(2);
  });
});

describe('the LOOKFANTASTIC route, end to end on a made up shop of the same shape', () => {
  const HOST = 'https://www.lookfantastic.com';
  const aisle = `${HOST}/c/health-beauty/fragrance/view-all-fragrance/`;
  const card = (path: string) => `<product-card-wrapper data-quicklook-url="${path}"></product-card-wrapper>`;
  const ld = (node: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(node)}</script></head></html>`;
  const group = (name: string, id: string, variants: [string, number, string][]) => ld({
    '@type': 'ProductGroup', productGroupID: id, name,
    hasVariant: variants.map(([sku, price, vname]) => ({
      '@type': 'Product', sku, name: vname,
      offers: { '@type': 'Offer', sku, price, priceCurrency: 'GBP', availability: 'https://schema.org/InStock', url: `${HOST}/p/x/${id}/?variation=${sku}` },
    })),
  });
  const site: Record<string, string> = {
    [aisle]: `<p>Page 1 of 1</p>${card('/p/prada-paradigme-eau-de-parfum-50ml/9001/')}${card('/p/espa-scented-candle-240g/9002/')}${card('/p/balmain-vent-vert-10ml/9003/')}`,
    [`${HOST}/sitemapindex-product.xml.gz`]: `<sitemapindex><sitemap><loc>${HOST}/sitemap-product-0.xml.gz</loc></sitemap></sitemapindex>`,
    [`${HOST}/sitemap-product-0.xml.gz`]: '<urlset></urlset>',
    [`${HOST}/p/prada-paradigme-eau-de-parfum-50ml/9001/`]: group('Prada Paradigme Eau de Parfum', '9001', [
      ['9001', 65.25, 'Prada Paradigme Eau de Parfum 50ml'],
    ]),
    [`${HOST}/p/balmain-vent-vert-10ml/9003/`]: group('Balmain Vent Vert', '9003', [['9003', 25.5, 'Balmain Vent Vert 10ml']]).replace(
      '</head>',
      '</head><script>(function(){const defaultVariant = {"sku":9003,"content":[{"key":"synopsis","value":{"richContentListValue":[{"content":[{"type":"HTML","content":"<p>The Balmain Vent Vert Eau de Parfum (10ml) is a fresh green scent.</p>"}]}]}}]};})();</script>',
    ),
  };

  it('walks the aisle, never asks for the candle, and puts a strength the page states into a title that names none', async () => {
    const calls: { url: string; ua: string }[] = [];
    const http: Http = async (url, headers) => {
      calls.push({ url, ua: headers['user-agent'] ?? '' });
      const body = site[url];
      return body ? { status: 200, ok: true, body } : { status: 404, ok: false, body: '' };
    };
    const result = await crawlViaSitemap({
      retailer: getRetailer('lookfantastic')!, http, robots: parseRobots(LOOKFANTASTIC_ROBOTS), maxPages: 10, gapMs: 0,
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/124' }, refreshShare: 0, sleep: async () => {},
    });
    expect(calls[0]!.url).toBe(aisle);
    expect(calls.every((c) => c.ua === ROUTE_HEADERS['user-agent'])).toBe(true);
    expect(calls.map((c) => c.url)).not.toContain(`${HOST}/p/espa-scented-candle-240g/9002/`);
    expect(result.categoryPagesFetched).toBe(1);
    expect(Object.fromEntries(result.listings.map((l) => [l.retailerSku, l.rawTitle]))).toEqual({
      '9001': 'Prada Paradigme Eau de Parfum 50ml',
      '9003': 'Balmain Vent Vert Eau de Parfum 10ml',
    });
  });
});

describe('what LOOKFANTASTIC listings meet once stored', () => {
  const listing = (rawTitle: string): StoredListing => ({
    retailerSku: '1', retailerId: 'lookfantastic', url: 'https://www.lookfantastic.com/p/x/1/',
    rawTitle, rawBrand: null, ean: null, imageUrl: null, description: null, priceGbp: 100, wasPriceGbp: null,
    promoEndsAt: null, inStock: true, sectionId: 'sitemap', rating: null,
    firstSeenAt: '2026-10-04T00:00:00.000Z', lastSeenAt: '2026-10-04T00:00:00.000Z', status: 'active',
    delistedAt: null, relistedAt: null, eligibleForNewBadge: false, variantId: null,
  } as StoredListing);

  it('single bottles with a strength and a size show; refills and refill bottles do not', () => {
    expect(isFragrance(listing('Prada Paradigme Eau de Parfum 50ml'))).toBe(true);
    expect(isFragrance(listing('Jean Paul Gaultier Scandal Elixir Parfum 80 ml'))).toBe(true);
    expect(isFragrance(listing('Burberry Hero Eau de Toilette for Men Refill 200ml'))).toBe(false);
    expect(isFragrance(listing('MUGLER Angel Nova Eau de Parfum Refill Bottle 100ml (Worth £130)'))).toBe(false);
  });
});

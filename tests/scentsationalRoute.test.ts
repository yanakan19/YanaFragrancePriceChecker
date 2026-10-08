import { describe, expect, it } from 'vitest';
import { crawlViaSitemap, routeHeaders, ROUTE_HEADERS } from '../src/catalogue/sitemapCrawl.js';
import { parseListings } from '../src/catalogue/jsonld.js';
import { isAllowed, parseRobots } from '../src/catalogue/robots.js';
import { getRetailer } from '../src/config/retailers.js';
import type { Http } from '../src/catalogue/attempt.js';

/**
 * Scentsational (Visualsoft): read through its product sitemaps as
 * PriceSniffsBot, asking for sterling with the shop's own currency cookie.
 *
 * The fixtures are the shop's real JSON-LD for one product, read 2026-10-08
 * with and without the cookie, with the long description cut. Asked without
 * it from a US address, the same page labels the same figure USD (25.00) while
 * its visible price is $33.05; with it, GBP 25.00 beside a visible £25.00. So
 * the label is the only thing a page can be trusted on, and the route keeps a
 * price only where it says GBP.
 */

const HOST = 'https://www.scentsational.com';
const PAGE = `${HOST}/women-c2/sabrina-carpenter-caramel-dream-75ml-edp-s-p50853`;

const productLd = (currency: 'GBP' | 'USD') =>
  '<html><head><script defer="defer" type="application/ld+json">' +
  JSON.stringify({
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: 'Sabrina Carpenter Sabrina Carpenter Caramel Dream 75ml EDP-S',
    image: `${HOST}/images/sabrina-carpenter-caramel-dream-75ml-edp-s-p50853-101568_image.jpg`,
    category: ['Women', 'Perfumes', 'Women/Perfumes'],
    Brand: { '@type': 'Brand', name: 'Sabrina Carpenter' },
    Description: 'Sabrina Carpenter Caramel Dream 75ml Eau de Parfum Spray',
    SKU: '82678_10-SC-CD-75P',
    gtin13: '810023679943',
    Offers: {
      '@type': 'Offer',
      priceCurrency: currency,
      price: '25.00',
      itemcondition: 'http://schema.org/NewCondition',
      availability: 'https://schema.org/InStock',
      url: PAGE,
    },
    url: PAGE,
  }) +
  '</script></head><body></body></html>';

/** The robots.txt served on 2026-10-08, the "*" group and the sitemap line. */
const ROBOTS = `Sitemap: https://www.scentsational.com/sitemap-index.xml
User-agent: pricebot
Crawl-delay: 30
User-agent: *
Crawl-delay: 2
Request-rate: 1/2s
Allow: /
Disallow: /ajax/removefrombasket/
Disallow: /basket$
Disallow: /checkout/
Disallow: /errors/
Disallow: /quickbuy/
Disallow: /product_personalisation/
Disallow: /register/
Disallow: /register
Disallow: /vs/
Disallow: /images/products/yofla/
Disallow: /customer_groups/choose_group/
Disallow: /formbuilder/
Disallow: /callbacks/
Disallow: /ajax/formatprice/
Disallow: /products/
Disallow: /sale/
Disallow: /search/
Disallow: /new/
Disallow: /new-arrivals/
Disallow: /images/products/moving_stills/
`;

describe('Scentsational product pages', () => {
  it('read the capitalised Offers, Brand and SKU the theme writes', () => {
    const [l, ...rest] = parseListings(productLd('GBP'), { sectionId: 'sitemap', pageUrl: PAGE, microdata: true, requireGbp: true });
    expect(rest).toEqual([]);
    expect(l!.priceGbp).toBe(25);
    expect(l!.retailerSku).toBe('82678_10-SC-CD-75P');
    expect(l!.rawBrand).toBe('Sabrina Carpenter');
    expect(l!.ean).toBe('810023679943');
    expect(l!.inStock).toBe(true);
    expect(l!.url).toBe(PAGE);
  });

  it('keep no price from the page a US address is served, which labels the sterling figure USD', () => {
    const [l] = parseListings(productLd('USD'), { sectionId: 'sitemap', pageUrl: PAGE, microdata: true, requireGbp: true });
    expect(l!.priceGbp).toBeNull();
    // And not for a shop without requireGbp either: a page naming another currency is never pounds.
    const [plain] = parseListings(productLd('USD'), { sectionId: 'sitemap', pageUrl: PAGE });
    expect(plain!.priceGbp).toBeNull();
  });

  it('leave a lower case key alone where the node already has one', () => {
    const html = productLd('GBP').replace('"SKU":"82678_10-SC-CD-75P"', '"SKU":"upper","sku":"lower"');
    const [l] = parseListings(html, { sectionId: 'sitemap', pageUrl: PAGE });
    expect(l!.retailerSku).toBe('lower');
  });
});

describe('Scentsational in the registry', () => {
  const shop = getRetailer('scentsational')!;
  const route = shop.sitemapRoute!;
  const robots = parseRobots(ROBOTS);

  it('asks for sterling with the shop own currency cookie, and keeps only prices that say GBP', () => {
    expect(route.cookie).toBe('VSCurrency=GBP');
    expect(route.requireGbp).toBe(true);
    const headers = routeHeaders(route);
    expect(headers['cookie']).toBe('VSCurrency=GBP');
    // Still the bot, and nothing a browser alone would send.
    expect(headers['user-agent']).toBe(ROUTE_HEADERS['user-agent']);
    expect(Object.keys(headers).some((h) => /^sec-|upgrade-insecure/i.test(h))).toBe(false);
    // No render sections: the render tier would ask without the cookie.
    expect(shop.catalogue).toBeNull();
  });

  it('obeys robots.txt: its crawl delay, its sitemap and its product pages, never /products/ or /sale/', () => {
    expect(robots.crawlDelaySeconds).toBe(2);
    for (const root of route.roots) expect(isAllowed(robots, root), root).toBe(true);
    expect(isAllowed(robots, `${HOST}/sitemap-products_women-c2-1.xml`)).toBe(true);
    expect(isAllowed(robots, PAGE)).toBe(true);
    const keep = new RegExp(route.product, 'i');
    for (const banned of [`${HOST}/products/x-edp-p1`, `${HOST}/sale/women-c2/perfumes-c20`, `${HOST}/search/?q=edp`]) {
      expect(isAllowed(robots, banned) && keep.test(banned), banned).toBe(false);
    }
  });

  it('opens only the product sitemaps', () => {
    const follow = new RegExp(route.follow!, 'i');
    expect(follow.test(`${HOST}/sitemap-products_women-c2-1.xml`)).toBe(true);
    expect(follow.test(`${HOST}/sitemap-products_arabic-c1324-1.xml`)).toBe(true);
    expect(follow.test(`${HOST}/sitemap-tags-123.xml`)).toBe(false);
    expect(follow.test(`${HOST}/sitemap-brands.xml`)).toBe(false);
  });

  it('keeps perfume and gift set pages of the fragrance ranges, and nothing else', () => {
    const keep = new RegExp(route.product, 'i');
    const out = new RegExp(route.exclude!, 'i');
    const kept = (u: string) => keep.test(`${HOST}/${u}`) && !out.test(`${HOST}/${u}`);
    for (const u of [
      'women-c2/sabrina-carpenter-caramel-dream-75ml-edp-s-p50853',
      'women-c2/perfumes-c20/abercrombie-fitch-abercombie-fitch-first-instinct-pour-femme-50ml-eau-de-parfum-spray-p39826',
      'men-c11/ralph-lauren-polo-67-75ml-eau-de-toilette-spray-p47750',
      'arabic-c1324/riiffs-momento-extrait-de-parfum-100ml-spray-p49218',
      'women-c2/narciso-rodriguez-all-of-me-gift-set-90ml-edp-s-50ml-body-lotion-10ml-edp-s-p50834',
      'women-c2/gift-sets-c8/jojo-siwa-be-you-gift-set-with-100ml-edp-spray-100ml-body-wash-and-100ml-body-lotion-p39949',
    ]) {
      expect(kept(u), u).toBe(true);
    }
    for (const u of [
      'women-c2/haircare-c6/alfaparf-precious-nature-capri-hair-mask-200ml-p39129',
      'women-c2/ariana-grande-cloud-236ml-body-mist-p45103',
      'mens-c1213/american-crew-daily-shampoo-1000ml-p49317',
      'arabic-c1324/louis-cardin-aly-femme-perfumed-deodorant-body-spray-200ml-p49845',
      'k-beauty-c1325/cosrx-snail-mucin-essence-p1',
      'women-c2/avene-cicalfate-cream-100ml-p49997',
    ]) {
      expect(kept(u), u).toBe(false);
    }
  });

  it('carries the delivery terms read off its own delivery page', () => {
    expect(shop.shipping.standardGbp).toBe(2.95);
    expect(shop.shipping.freeOverGbp).toBe(80);
    expect(shop.shipping.confidence).toBe('confirmed');
    expect(shop.shipping.source?.url).toBe(`${HOST}/delivery-returns-i5`);
  });
});

describe('a walk of the Scentsational sitemaps', () => {
  it('sends the cookie on every request and prices the page in pounds', async () => {
    const shop = getRetailer('scentsational')!;
    const site: Record<string, string> = {
      [`${HOST}/sitemap-index.xml`]:
        `<sitemapindex><sitemap><loc>${HOST}/sitemap-tags-123.xml</loc></sitemap>` +
        `<sitemap><loc>${HOST}/sitemap-products_women-c2-1.xml</loc></sitemap></sitemapindex>`,
      [`${HOST}/sitemap-products_women-c2-1.xml`]:
        `<urlset><url><loc>${PAGE}</loc></url>` +
        `<url><loc>${HOST}/women-c2/ariana-grande-cloud-236ml-body-mist-p45103</loc></url></urlset>`,
    };
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const http: Http = async (url, headers) => {
      calls.push({ url, headers });
      if (url === PAGE) {
        // The shop's own behaviour: sterling only for a visitor who chose it.
        return { status: 200, ok: true, body: productLd(headers['cookie'] === 'VSCurrency=GBP' ? 'GBP' : 'USD') };
      }
      const body = site[url];
      return body ? { status: 200, ok: true, body } : { status: 404, ok: false, body: '' };
    };
    const result = await crawlViaSitemap({
      retailer: shop,
      http,
      robots: parseRobots(ROBOTS),
      maxPages: 10,
      gapMs: 2000,
      headers: { 'user-agent': ROUTE_HEADERS['user-agent']! },
      sleep: async () => {},
      refreshShare: 0,
    });
    expect(calls.map((c) => c.url)).toEqual([
      `${HOST}/sitemap-index.xml`,
      `${HOST}/sitemap-products_women-c2-1.xml`,
      PAGE,
    ]);
    expect(calls.every((c) => c.headers['cookie'] === 'VSCurrency=GBP')).toBe(true);
    expect(calls.every((c) => c.headers['user-agent']!.startsWith('PriceSniffsBot/'))).toBe(true);
    expect(result.listings.map((l) => l.priceGbp)).toEqual([25]);
  });
});

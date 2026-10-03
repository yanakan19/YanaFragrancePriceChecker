import { describe, expect, it } from 'vitest';
import { crawlViaSitemap, withTitleParts, cleanListingUrl, ROUTE_HEADERS } from '../src/catalogue/sitemapCrawl.js';
import { parseListings, extractMicrodataProducts } from '../src/catalogue/jsonld.js';
import { beautyBayApiUrl, parseBeautyBayProduct } from '../src/catalogue/beautyBayApi.js';
import { NO_RESTRICTIONS, parseRobots } from '../src/catalogue/robots.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { Retailer, SitemapRoute } from '../src/types/retailer.js';

/**
 * The pinned sitemap routes (Retailer.sitemapRoute) and the parser shapes
 * built alongside them on 2026-10-03: a ProductGroup whose variants each name
 * their own size (Space NK, Parfumdreams), offers paired with a size list
 * (John Lewis), schema.org microdata (Shy Mimosa, Niche Beauty), the GBP
 * check, and Beauty Bay's product API.
 */

function retailer(route: SitemapRoute, over: Partial<Retailer> = {}): Retailer {
  return {
    id: 'example-shop',
    name: 'Example Shop',
    domain: 'example.co.uk',
    homepage: 'https://www.example.co.uk',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null, freeOverGbp: null, estimatedDays: [3, 5],
      verifiedAt: '2026-10-03', confidence: 'unverified',
    },
    catalogue: null,
    affiliate: {
      network: null, verified: false, status: 'not-applied', publisherId: null,
      deeplinkTemplate: null, querySuffixTemplate: null, signupUrl: null,
    },
    sitemapRoute: route,
    ...over,
  } as Retailer;
}

const ld = (node: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(node)}</script></head><body></body></html>`;

const gbpProduct = (name: string, sku: string, price: number) =>
  ld({ '@type': 'Product', name, sku, offers: { '@type': 'Offer', price, priceCurrency: 'GBP' } });

describe('crawlViaSitemap along a pinned route', () => {
  const site: Record<string, string> = {
    'https://www.example.co.uk/index.xml':
      '<sitemapindex>' +
      '<sitemap><loc>https://www.example.co.uk/sitemap/products-1.xml</loc></sitemap>' +
      '<sitemap><loc>https://www.example.co.uk/sitemap/blog.xml</loc></sitemap>' +
      '</sitemapindex>',
    'https://www.example.co.uk/sitemap/products-1.xml':
      '<urlset>' +
      '<url><loc>https://www.example.co.uk/uk/rose-eau-de-parfum-50ml/p1</loc></url>' +
      '<url><loc>https://www.example.co.uk/us/rose-eau-de-parfum-50ml/p1</loc></url>' +
      '<url><loc>https://www.example.co.uk/uk/rose-candle/p2</loc></url>' +
      '<url><loc>https://www.example.co.uk/uk/view.asp?brand=A&amp;name=Oud</loc></url>' +
      '</urlset>',
    'https://www.example.co.uk/uk/rose-eau-de-parfum-50ml/p1': gbpProduct('Rose Eau de Parfum 50ml', 'p1', 80),
    'https://www.example.co.uk/uk/view.asp?brand=A&name=Oud': gbpProduct('Oud Eau de Parfum 100ml', 'oud', 120),
  };

  const route: SitemapRoute = {
    roots: ['https://www.example.co.uk/index.xml'],
    follow: '/sitemap/products-\\d+\\.xml$',
    product: '^https://www\\.example\\.co\\.uk/uk/',
    exclude: 'candle',
  };

  async function walk(over: Partial<SitemapRoute> = {}, robotsText?: string) {
    const calls: { url: string; ua: string }[] = [];
    const http: Http = async (url, headers) => {
      calls.push({ url, ua: headers['user-agent'] ?? '' });
      const body = site[url];
      return body ? { status: 200, ok: true, body } : { status: 404, ok: false, body: '' };
    };
    const sleeps: number[] = [];
    const result = await crawlViaSitemap({
      retailer: retailer({ ...route, ...over }),
      http,
      robots: robotsText ? parseRobots(robotsText) : NO_RESTRICTIONS,
      maxPages: 10,
      gapMs: 10_000,
      // A browser user agent passed by the caller must not reach the shop.
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/124.0' },
      sleep: async (ms) => { sleeps.push(ms); },
    });
    return { result, calls, sleeps };
  }

  it('opens only the sitemaps it is told to, and fetches only matching product pages', async () => {
    const { result, calls } = await walk();
    expect(calls.map((c) => c.url)).toEqual([
      'https://www.example.co.uk/index.xml',
      'https://www.example.co.uk/sitemap/products-1.xml',
      // Named a perfume, so first; the query string arrives unescaped.
      'https://www.example.co.uk/uk/rose-eau-de-parfum-50ml/p1',
      'https://www.example.co.uk/uk/view.asp?brand=A&name=Oud',
    ]);
    expect(result.listings.map((l) => l.priceGbp)).toEqual([80, 120]);
  });

  it('never asks for another country, a blog sitemap or an excluded page', async () => {
    const { calls } = await walk();
    const asked = calls.map((c) => c.url);
    expect(asked.some((u) => u.includes('/us/'))).toBe(false);
    expect(asked.some((u) => u.includes('blog'))).toBe(false);
    expect(asked.some((u) => u.includes('candle'))).toBe(false);
  });

  it('identifies itself honestly on every request, whatever headers the caller passed', async () => {
    const { calls } = await walk();
    expect(calls.every((c) => c.ua === ROUTE_HEADERS['user-agent'])).toBe(true);
    expect(calls.every((c) => c.ua.startsWith('PriceSniffsBot/'))).toBe(true);
  });

  it('keeps the crawl delay between every pair of requests, sitemaps included', async () => {
    const { calls, sleeps } = await walk();
    expect(sleeps).toHaveLength(calls.length - 1);
    expect(sleeps.every((ms) => ms === 10_000)).toBe(true);
  });

  it('does not ask for a root robots.txt disallows', async () => {
    const { calls, result } = await walk({}, 'User-agent: *\nDisallow: /index.xml\n');
    expect(calls).toHaveLength(0);
    expect(result.errors.join(' ')).toContain('robots.txt does not permit it');
  });

  it("drops another publisher's tracking a page put on its own address", () => {
    const page = 'https://www.marksandspencer.com/white-musk-100ml/p/hbp22184550';
    expect(cleanListingUrl(`${page}?extid=af_Sub+Networks_Skimlinks&awc=1402_1`, page)).toBe(page);
    // A size fragment survives; a different path, or a page whose own address
    // has a query (Shy Mimosa), is left exactly as given.
    expect(cleanListingUrl(`${page}?gclid=x#variation=2`, page)).toBe(`${page}#variation=2`);
    expect(cleanListingUrl('https://www.marksandspencer.com/other/p/1?a=1', page)).toBe('https://www.marksandspencer.com/other/p/1?a=1');
    const q = 'https://www.shymimosa.co.uk/shop/products/view.asp?brand=A&name=B';
    expect(cleanListingUrl(q, q)).toBe(q);
  });

  it('appends the page text titleParts names, once', () => {
    const html = '<h4>Extrait de Parfum | <a>House</a></h4><div class="t">Product Size</div><div class="d"><p>100ml</p></div>';
    const parts = ['<h4>\\s*([^<|]{3,60})\\|', 'Product Size</div>\\s*<div[^>]*>\\s*<p>\\s*([^<]{1,30})</p>'];
    expect(withTitleParts('Chypre Shot', html, parts)).toBe('Chypre Shot Extrait de Parfum 100ml');
    expect(withTitleParts('Chypre Shot Extrait de Parfum 100ml', html, parts)).toBe('Chypre Shot Extrait de Parfum 100ml');
  });
});

describe('parseListings: every size with its own price', () => {
  it("reads each of a ProductGroup's variants when each names its own size (Space NK)", () => {
    const html = ld({
      '@type': 'ProductGroup',
      name: 'Young Rose Eau de Parfum',
      productGroupID: 'MUK200031967',
      brand: { '@type': 'Brand', name: 'Byredo' },
      image: ['https://img/group.jpg'],
      hasVariant: [
        { '@type': 'Product', name: 'Byredo Young Rose Eau de Parfum 100ml', sku: 'UK200031967',
          url: 'https://www.spacenk.com/uk/young-rose-UK200031967.html',
          offers: { '@type': 'Offer', priceCurrency: 'GBP', price: '225.00', availability: 'http://schema.org/InStock' } },
        { '@type': 'Product', name: 'Byredo Young Rose Eau de Parfum 50ml', sku: 'UK200033403',
          url: 'https://www.spacenk.com/uk/young-rose-UK200033403.html',
          offers: { '@type': 'Offer', priceCurrency: 'GBP', price: '155.00', availability: 'http://schema.org/InStock' } },
      ],
    });
    const out = parseListings(html, { sectionId: 's', pageUrl: 'https://www.spacenk.com/uk/young-rose-UK200033403.html', requireGbp: true });
    expect(out.map((l) => [l.retailerSku, l.rawTitle, l.priceGbp, l.rawBrand])).toEqual([
      ['UK200031967', 'Byredo Young Rose Eau de Parfum 100ml', 225, 'Byredo'],
      ['UK200033403', 'Byredo Young Rose Eau de Parfum 50ml', 155, 'Byredo'],
    ]);
    expect(out[0]!.imageUrl).toBe('https://img/group.jpg');
  });

  it('still reads only the variant that is the group itself when one is (THG)', () => {
    const html = ld({
      '@type': 'ProductGroup', name: 'Chloe EDP 50ml', productGroupID: '1',
      hasVariant: [
        { '@type': 'Product', name: 'Chloe EDP 50ml', sku: '1', offers: { price: 71, priceCurrency: 'GBP' } },
        { '@type': 'Product', name: 'Chloe EDP 50ml', sku: '2', offers: { price: 98, priceCurrency: 'GBP' } },
      ],
    });
    const out = parseListings(html, { sectionId: 's', pageUrl: 'https://x.test/p' });
    expect(out.map((l) => l.priceGbp)).toEqual([71]);
  });

  it('reads nothing from variants that share one name', () => {
    const html = ld({
      '@type': 'ProductGroup', name: 'Chloe EDP 50ml', productGroupID: 'G',
      hasVariant: [
        { '@type': 'Product', name: 'Chloe EDP 50ml', sku: '1', offers: { price: 71, priceCurrency: 'GBP' } },
        { '@type': 'Product', name: 'Chloe EDP 50ml', sku: '2', offers: { price: 98, priceCurrency: 'GBP' } },
      ],
    });
    expect(parseListings(html, { sectionId: 's', pageUrl: 'https://x.test/p' })).toEqual([]);
  });

  const johnLewis = (prices: number[]) =>
    ld({
      '@type': 'Product',
      name: 'Carolina Herrera Good Girl Eau de Parfum',
      url: 'https://www.johnlewis.com/carolina-herrera-good-girl-eau-de-parfum/p3783121',
      brand: { '@type': 'Brand', name: 'Carolina Herrera' },
      size: ['30ml', '50ml', '80ml'],
      offers: [
        { '@type': 'Offer', sku: '237767921', price: String(prices[0]), priceCurrency: 'GBP', gtin13: '8411061041673' },
        { '@type': 'Offer', sku: '237767925', price: String(prices[1]), priceCurrency: 'GBP', gtin13: '8411061026250' },
        { '@type': 'Offer', sku: '237767905', price: String(prices[2]), priceCurrency: 'GBP', gtin13: '8411061026342' },
      ],
    });

  it('pairs offers with the product size list in order (John Lewis)', () => {
    const out = parseListings(johnLewis([67, 98, 126]), { sectionId: 's', pageUrl: 'https://www.johnlewis.com/x/p3783121' });
    expect(out.map((l) => [l.retailerSku, l.rawTitle, l.priceGbp, l.ean])).toEqual([
      ['237767921', 'Carolina Herrera Good Girl Eau de Parfum 30ml', 67, '8411061041673'],
      ['237767925', 'Carolina Herrera Good Girl Eau de Parfum 50ml', 98, '8411061026250'],
      ['237767905', 'Carolina Herrera Good Girl Eau de Parfum 80ml', 126, '8411061026342'],
    ]);
  });

  it('refuses the pairing when a larger bottle would be priced below a smaller one', () => {
    const out = parseListings(johnLewis([98, 67, 126]), { sectionId: 's', pageUrl: 'https://www.johnlewis.com/x/p3783121' });
    expect(out).toHaveLength(1);
    expect(out[0]!.priceGbp).toBeNull();
  });

  it('splits an offers array whose offers each name a size', () => {
    const html = ld({
      '@type': 'Product', name: 'Oud', sku: 'GROUP',
      offers: {
        '@type': 'AggregateOffer', lowPrice: 30,
        offers: [
          { '@type': 'Offer', name: 'Oud 30ml', sku: 'a', price: 30, priceCurrency: 'GBP' },
          { '@type': 'Offer', name: 'Oud 100ml', sku: 'b', price: 70, priceCurrency: 'GBP' },
        ],
      },
    });
    const out = parseListings(html, { sectionId: 's', pageUrl: 'https://x.test/p' });
    expect(out.map((l) => [l.rawTitle, l.priceGbp])).toEqual([['Oud 30ml', 30], ['Oud 100ml', 70]]);
  });
});

describe('parseListings: the currency a page states', () => {
  it('never stores a price as pounds when its offer names another currency', () => {
    const html = ld({ '@type': 'Product', name: 'Cloud EDP 50ml', sku: 'c', offers: { price: 52.5, priceCurrency: 'USD' } });
    const [l] = parseListings(html, { sectionId: 's', pageUrl: 'https://x.test/p' });
    expect(l!.priceGbp).toBeNull();
    expect(l!.nativePrice).toEqual({ amount: 52.5, currency: 'USD' });
  });

  it('leaves an unstated currency alone for an ordinary shop', () => {
    const html = ld({ '@type': 'Product', name: 'Cloud EDP 50ml', sku: 'c', offers: { price: 45 } });
    const [l] = parseListings(html, { sectionId: 's', pageUrl: 'https://x.test/p' });
    expect(l!.priceGbp).toBe(45);
    expect(l).not.toHaveProperty('nativePrice');
  });

  it('withholds an unstated currency when the route requires GBP, and accepts the page meta', () => {
    const bare = ld({ '@type': 'Product', name: 'Cloud EDP 50ml', sku: 'c', offers: { price: 45 } });
    const [a] = parseListings(bare, { sectionId: 's', pageUrl: 'https://x.test/p', requireGbp: true });
    expect(a!.priceGbp).toBeNull();
    const withMeta = bare.replace('<head>', '<head><meta property="og:price:currency" content="GBP" />');
    const [b] = parseListings(withMeta, { sectionId: 's', pageUrl: 'https://x.test/p', requireGbp: true });
    expect(b!.priceGbp).toBe(45);
  });
});

describe('parseListings: schema.org microdata', () => {
  const shyMimosa =
    '<body><div itemscope itemtype="http://schema.org/Product">' +
    '<h2 class="product-title"><span itemprop="name">Chypre Shot</span></h2>' +
    '<h4>Extrait de Parfum | <a href="/b"><span itemprop="brand">Olfactive Studio</span></a></h4>' +
    '<p><span itemprop="description">Dark and primal.<br /><a href="/x">Click</a></span></p>' +
    '<div itemprop="offers" itemscope itemtype="http://schema.org/Offer">' +
    '<div class="current"><span itemprop="priceCurrency" content="GBP">&pound;</span><span itemprop="price">195.00</span></div>' +
    '</div></div></body>';
  const pageUrl = 'https://www.shymimosa.co.uk/shop/products/view.asp?brand=Olfactive+Studio&name=Chypre+Shot';

  it('reads a Product and its Offer, keyed by the query string when it has no sku', () => {
    const [l] = parseListings(shyMimosa, { sectionId: 's', pageUrl, microdata: true, requireGbp: true });
    expect(l).toMatchObject({
      rawTitle: 'Chypre Shot', rawBrand: 'Olfactive Studio', priceGbp: 195,
      retailerSku: 'view.asp?brand=Olfactive+Studio&name=Chypre+Shot', url: pageUrl,
    });
  });

  it('is not read unless asked for', () => {
    expect(parseListings(shyMimosa, { sectionId: 's', pageUrl })).toEqual([]);
  });

  it('takes the printed £ beside a price held in content as its currency (Niche Beauty)', () => {
    const html =
      '<div id="products" itemscope="itemscope" itemtype="http://schema.org/Product">' +
      '<h1><a itemprop="brand" href="/en-gb/brands/byredo-268"><span>Byredo&nbsp;</span></a>' +
      '<span class="h a-h" itemprop="name">Blanche</span></h1>' +
      '<div class="offr" itemprop="offers" itemscope="itemscope" itemtype="http://schema.org/Offer">' +
      '<span class="content" itemprop="price" data-fp="{\'US\':301.0,\'GB\':245.0}" content="245.00">£ 245.00</span>' +
      '<meta itemprop="itemCondition" itemscope="itemscope" itemtype="http://schema.org/OfferItemCondition" content="http://schema.org/NewCondition" />' +
      '<link itemprop="availability" href="http://schema.org/InStock" /></div></div>';
    const nodes = extractMicrodataProducts(html);
    expect(nodes).toHaveLength(1);
    const [l] = parseListings(html, {
      sectionId: 's', pageUrl: 'https://www.niche-beauty.com/en-gb/products/byredo-blanche/303-019',
      microdata: true, requireGbp: true,
    });
    expect(l).toMatchObject({ rawTitle: 'Blanche', rawBrand: 'Byredo', priceGbp: 245, inStock: true, retailerSku: '303-019' });
  });

  it('refuses a price printed in another currency', () => {
    const html =
      '<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Blanche</span>' +
      '<div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><span itemprop="price" content="301.00">$ 301.00</span></div></div>';
    const [l] = parseListings(html, { sectionId: 's', pageUrl: 'https://x.test/p/1', microdata: true, requireGbp: true });
    expect(l!.priceGbp).toBeNull();
    expect(l!.nativePrice).toEqual({ amount: 301, currency: 'USD' });
  });
});

describe('Beauty Bay product API', () => {
  const page = 'https://www.beautybay.com/p/ariana-grande/cloud-eau-de-parfum-spray/cloud-eau-de-parfum-spray-50/';
  const answer = (currency: string) =>
    JSON.stringify({
      sku: 'ARIA0006F', name: 'Cloud Eau de Parfum Spray', gtin: '812256023296',
      brand: { name: 'Ariana Grande' },
      variants: {
        inStock: [
          { name: 'Cloud Eau de Parfum Spray', sku: 'ARIA0006F', url: 'cloud-eau-de-parfum-spray-50', measurement: '50ml',
            price: { itemPrice: 45, itemCurrency: currency } },
          { name: '100ml', sku: 'ARIA0007F', url: 'cloud-edp-spray-100', measurement: '100ml',
            price: { itemPrice: 55, itemCurrency: currency } },
        ],
        outOfStock: [
          { name: 'Cloud Eau de Parfum Spray', sku: 'ARIA0005F', url: 'cloud-eau-de-parfum-spray-30', measurement: '30ml',
            price: { itemPrice: 35, itemCurrency: currency } },
        ],
      },
    });

  it('pins the sterling locale in the address it asks', () => {
    expect(beautyBayApiUrl(page)).toBe(
      'https://pdp-api.public.prd.beautybay.com/product/ariana-grande-cloud-eau-de-parfum-spray' +
        '?variant=cloud-eau-de-parfum-spray-50&locale=en-GB',
    );
  });

  it('reads every size in GBP, naming a size-only variant after its product', () => {
    const out = parseBeautyBayProduct(answer('GBP'), page);
    expect(out.map((l) => [l.retailerSku, l.rawTitle, l.priceGbp, l.inStock, l.ean])).toEqual([
      ['ARIA0006F', 'Ariana Grande Cloud Eau de Parfum Spray 50ml', 45, true, '812256023296'],
      ['ARIA0007F', 'Ariana Grande Cloud Eau de Parfum Spray 100ml', 55, true, null],
      ['ARIA0005F', 'Ariana Grande Cloud Eau de Parfum Spray 30ml', 35, false, null],
    ]);
    expect(out[1]!.url).toBe('https://www.beautybay.com/p/ariana-grande/cloud-eau-de-parfum-spray/cloud-edp-spray-100/');
  });

  it('stores no price from a dollar answer', () => {
    const out = parseBeautyBayProduct(answer('USD'), page);
    expect(out.every((l) => l.priceGbp === null)).toBe(true);
    expect(out[0]!.nativePrice).toEqual({ amount: 45, currency: 'USD' });
  });

  it("reads the API's robots.txt first, then asks once per product", async () => {
    const calls: string[] = [];
    const http: Http = async (url) => {
      calls.push(url);
      if (url.endsWith('/sitemap-p.xml')) {
        return {
          status: 200, ok: true,
          body:
            `<urlset><url><loc>${page}</loc></url>` +
            '<url><loc>https://www.beautybay.com/p/ariana-grande/cloud-eau-de-parfum-spray/cloud-edp-spray-100/</loc></url></urlset>',
        };
      }
      if (url === 'https://pdp-api.public.prd.beautybay.com/robots.txt') return { status: 404, ok: false, body: '' };
      if (url.startsWith('https://pdp-api.public.prd.beautybay.com/product/')) return { status: 200, ok: true, body: answer('GBP') };
      return { status: 404, ok: false, body: '' };
    };
    const result = await crawlViaSitemap({
      retailer: retailer({
        roots: ['https://www.beautybay.com/.sitemaps/sitemap-p.xml'],
        product: '^https://www\\.beautybay\\.com/p/',
        requireGbp: true,
        pageReader: 'beauty-bay-api',
      }),
      http, robots: NO_RESTRICTIONS, maxPages: 10, gapMs: 0, headers: {},
    });
    expect(calls).toEqual([
      'https://www.beautybay.com/.sitemaps/sitemap-p.xml',
      'https://pdp-api.public.prd.beautybay.com/robots.txt',
      beautyBayApiUrl(page),
    ]);
    expect(result.listings.filter((l) => l.priceGbp !== null)).toHaveLength(3);
  });

  it('asks the API nothing when its robots.txt answers with a server error', async () => {
    const calls: string[] = [];
    const http: Http = async (url) => {
      calls.push(url);
      if (url.endsWith('/sitemap-p.xml')) return { status: 200, ok: true, body: `<urlset><url><loc>${page}</loc></url></urlset>` };
      return { status: 503, ok: false, body: '' };
    };
    const result = await crawlViaSitemap({
      retailer: retailer({
        roots: ['https://www.beautybay.com/.sitemaps/sitemap-p.xml'],
        product: '^https://www\\.beautybay\\.com/p/',
        pageReader: 'beauty-bay-api',
      }),
      http, robots: NO_RESTRICTIONS, maxPages: 10, gapMs: 0, headers: {},
    });
    expect(calls.some((u) => u.includes('/product/'))).toBe(false);
    expect(result.listings).toEqual([]);
  });
});

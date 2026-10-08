import { describe, expect, it } from 'vitest';
import { crawlViaSitemap, ROUTE_HEADERS } from '../src/catalogue/sitemapCrawl.js';
import { parseListings } from '../src/catalogue/jsonld.js';
import { isAllowed, parseRobots } from '../src/catalogue/robots.js';
import { getRetailer } from '../src/config/retailers.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { Retailer } from '../src/types/retailer.js';

/**
 * Gorgeous Shop and Beauty Flash: one operator, one Magento 2 build (theme
 * "Limely"), read from the shops' own fragrance aisles as PriceSniffsBot
 * (SitemapRoute.categories), because their sitemaps were last written in 2023.
 *
 * The fixtures are the shops' real markup, read 2026-10-08, cut down to the
 * parts the route reads: a product card, the pager with its hidden page count,
 * and each product page's JSON-LD. The wishlist form keys, the image cache
 * hashes, the review widget and the rest of the page are left out.
 */

const GS = 'https://www.gorgeousshop.com';

/** A product card as the category grid draws it (Limely theme), trimmed. */
const card = (slug: string, title: string, price: string) =>
  '<div class="col col-xs-6 col-md-4 col-lg-3">' +
  '<div class="card card-link card-product card-product-grid"><div class="card-image">' +
  `<div class="card-image-inner"><img src="${GS}/media/catalog/product/x.jpg" alt="${title}" loading="lazy" /></div>` +
  `<a href="${GS}/${slug}" class="full-block"></a></div>` +
  `<div class="card-content"><h5><a href="${GS}/${slug}">${title}</a></h5>` +
  `<span class="price-wrapper " data-price-amount="${price}"><span class="price">£${price}</span></span>` +
  `<a href="${GS}/${slug}" class="btn btn-default">View Product</a></div></div></div>`;

/** The pager: links to the next pages, and the page count Amasty hides in it. */
const pager = (base: string, n: number, total: number) =>
  '<div class="pages"><ul class="items pages-items">' +
  `<li class="item current"><strong class="page"><span>${n}</span></strong></li>` +
  (n < total ? `<li class="item pages-item-next"><a class="action next" href="${base}?p=${n + 1}" title="Next"></a></li>` : '') +
  `</ul></div> <div id="am-page-count" style="display: none">${total}</div>`;

/** The aisle page, with the category's own sub aisle tiles that also carry full-block links. */
const aisle = (base: string, n: number, total: number, cards: string[]) =>
  `<html><body><a href="${GS}/fragrance/for-her" class="full-block"></a>${cards.join('')}${pager(base, n, total)}</body></html>`;

const ld = (node: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(node)}</script></head><body></body></html>`;

/** Jimmy Choo Blossom 40ml, 2026-10-08: a simple product, out of stock. */
const SIMPLE = ld({
  '@context': 'https://schema.org/',
  '@type': 'Product',
  '@id': `${GS}/jimmy-choo-blossom-edp-spray-40-ml`,
  brand: { '@type': 'Brand', name: 'Jimmy Choo ' },
  mpn: 'Q-7Q-303-40',
  name: 'Jimmy Choo Blossom Eau de Parfum Spray 40ml',
  sku: 'HTG1601489',
  offers: {
    '@type': 'Offer',
    '@id': `${GS}/jimmy-choo-blossom-edp-spray-40-ml#Offer`,
    url: `${GS}/jimmy-choo-blossom-edp-spray-40-ml`,
    price: 23.65,
    priceCurrency: 'GBP',
    priceSpecification: { price: 23.65, priceCurrency: 'GBP', valueAddedTaxIncluded: true },
    availability: 'http://schema.org/OutOfStock',
    itemCondition: 'http://schema.org/NewCondition',
  },
});

/** Kylie Minogue Darling, 2026-10-08: a configurable product, one named offer per size. */
const SIZES = ld({
  '@context': 'https://schema.org/',
  '@type': 'Product',
  '@id': `${GS}/kylie-minogue-darling-edp`,
  brand: { '@type': 'Brand', name: 'Kylie Minogue' },
  name: 'Kylie Minogue Darling Eau De Parfum 30ml',
  sku: 'KYMMULT1',
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'GBP',
    offerCount: '2',
    offers: [
      {
        '@type': 'Offer',
        '@id': `${GS}/kylie-minogue-darling-edp-30ml#Offer-42094`,
        url: `${GS}/kylie-minogue-darling-edp-30ml`,
        name: 'Kylie Minogue Darling Eau De Parfum  30ml',
        sku: 'KYM1601002',
        price: 22,
        priceCurrency: 'GBP',
        availability: 'http://schema.org/InStock',
      },
      {
        '@type': 'Offer',
        '@id': `${GS}/kylie-minogue-darling-edp-75ml#Offer-42093`,
        url: `${GS}/kylie-minogue-darling-edp-75ml`,
        name: 'Kylie Minogue Darling Eau De Parfum 75ml',
        sku: 'KYM1601001',
        price: 15.2,
        priceCurrency: 'GBP',
        availability: 'http://schema.org/InStock',
      },
    ],
  },
});

/** The robots.txt both shops served on 2026-10-08 (the host line changed). */
const robotsFor = (host: string) => `#Bingbot
User-agent: bingbot
Crawl-delay: 5

# Semrush
User-agent: SemrushBot
Crawl-delay: 30

# Ahrefs
User-agent: AhrefsBot
Crawl-delay: 30

User-agent: *
Disallow: /index.php/
Disallow: /app/
Disallow: /lib/
Disallow: /*.php$
Disallow: /pkginfo/
Disallow: /report/
Disallow: /var/
Disallow: /catalog/
Disallow: /sendfriend/
Disallow: /review/
Disallow: /searchanise/async/
Disallow: /searchanise/result
Disallow: /page_cache/block/esi/blocks/
Disallow: /customer/account/
Sitemap: ${host}/sitemap.xml
`;

describe('Gorgeous Shop and Beauty Flash in the registry', () => {
  for (const [id, host] of [
    ['gorgeous-shop', GS],
    ['beauty-flash', 'https://www.beautyflash.co.uk'],
  ] as const) {
    describe(id, () => {
      const shop = getRetailer(id)!;
      const route = shop.sitemapRoute!;
      const walk = route.categories!;
      const robots = parseRobots(robotsFor(host));

      it('reads the fragrance aisles as a pinned route, so every request is PriceSniffsBot', () => {
        expect(route).toBeDefined();
        // The whole fragrance aisle: every product of its sub aisles (perfume,
        // for her, for him, gift sets) was among its own on 2026-10-08.
        expect(walk.pages).toEqual([`${host}/fragrance`]);
        expect(walk.rotation).toBe(3);
        // Its sitemap is from 2023: the aisles are the route, and no sitemap is asked for.
        expect(route.roots).toEqual([]);
        // A price is kept only where the page names sterling for it.
        expect(route.requireGbp).toBe(true);
        expect(robots.crawlDelaySeconds).toBeNull();
        // The gap the file asks of bingbot: a faster pace was answered 429.
        expect(shop.catalogue!.minRequestGapMs).toBe(5000);
      });

      it('asks only for addresses its robots.txt permits', () => {
        for (const page of walk.pages) {
          expect(isAllowed(robots, page), page).toBe(true);
          for (const n of [2, 17, walk.maxPages]) {
            expect(isAllowed(robots, `${page}?${walk.pageParam}=${n}`), `${page} ${n}`).toBe(true);
          }
        }
        expect(isAllowed(robots, `${host}/kylie-minogue-darling-edp`)).toBe(true);
        // The shop's search is for visitors (the fallback link), never asked by the bot.
        const search = shop.catalogue!.searchUrlTemplate.replace('{q}', 'chanel');
        expect(isAllowed(robots, search)).toBe(false);
        for (const s of shop.catalogue!.sections) {
          expect(isAllowed(robots, s.urlTemplate.replace('{page}', '1')), s.id).toBe(true);
        }
      });

      it('reads the product cards and the hidden page count, and nothing but the product address', () => {
        const html = aisle(`${GS}/fragrance/perfume`, 1, 23, [
          card('jimmy-choo-blossom-edp-spray-40-ml', 'Jimmy Choo Blossom Eau de Parfum Spray 40ml', '23.65'),
        ]).replaceAll(GS, host);
        const links = [...html.matchAll(new RegExp(walk.productLink, 'gi'))].map((m) => m[1]!);
        const keep = new RegExp(route.product, 'i');
        // The sub aisle tile is a full-block link too; it has a second path segment.
        expect(links.filter((l) => keep.test(l))).toEqual([`${host}/jimmy-choo-blossom-edp-spray-40-ml`]);
        expect(new RegExp(walk.pageCount!, 'i').exec(html)?.[1]).toBe('23');
      });

      it('keeps a product address at the root of this host, and nothing else', () => {
        const keep = new RegExp(route.product, 'i');
        expect(keep.test(`${host}/kylie-minogue-darling-edp-75ml`)).toBe(true);
        expect(keep.test(`${host}/fragrance/for-her`)).toBe(false);
        expect(keep.test(`${host}/brands/sabrina-carpenter-fragrance`)).toBe(false);
        expect(keep.test(`${host}/kylie-minogue-darling-edp?p=2`)).toBe(false);
        const other = host === GS ? 'https://www.beautyflash.co.uk' : GS;
        expect(keep.test(`${other}/kylie-minogue-darling-edp`)).toBe(false);
      });

      it('names out candles, oils and hair perfume, and no perfume or gift set by those words', () => {
        const out = new RegExp(route.exclude!, 'i');
        for (const slug of [
          'shay-blue-melrose-apple-blossom-candle-200g',
          'evolve-organic-beauty-zen-whisper-ceramide-body-oil-100ml-1',
          'evolve-organic-beauty-wild-divine-aromatic-bath-oil-100ml-1',
          'evolve-organic-beauty-zen-whisper-pulse-point-roller-10ml-1',
          'pureology-love-luster-hydrating-hair-perfume-50ml',
          'kerastase-gloss-absolu-le-parfum-hair-mist',
        ]) {
          expect(out.test(`/${slug}`), slug).toBe(true);
        }
        for (const slug of [
          'jimmy-choo-blossom-edp-spray-40-ml',
          // A gift set: the perfume with a body milk beside it.
          'korres-set-white-tea-edt-50ml-body-milk-125ml',
          'korres-kyma-set-eau-de-toilette-shower-gel-300ml',
          'paco-rabanne-lady-million-gift-set-180ml',
          'creed-aventus-edp-100ml',
          'viktor-rolf-spicebomb-eau-de-toilette-90ml',
        ]) {
          expect(out.test(`/${slug}`), slug).toBe(false);
        }
      });

      it('carries the delivery terms read off its own delivery page', () => {
        expect(shop.shipping.standardGbp).toBe(2.95);
        expect(shop.shipping.freeOverGbp).toBe(25);
        expect(shop.shipping.confidence).toBe('confirmed');
        expect(shop.shipping.source?.url).toBe(`${host}/uk-delivery-options`);
        expect(shop.shipping.source?.quote).toContain('£2.95');
        expect(shop.shipping.verifiedAt).toBe('2026-10-08');
      });
    });
  }
});

describe('the product pages', () => {
  it('read a simple product at its sterling price, out of stock as the page says', () => {
    const [l, ...rest] = parseListings(SIMPLE, {
      sectionId: 'sitemap', pageUrl: `${GS}/jimmy-choo-blossom-edp-spray-40-ml`, microdata: true, requireGbp: true,
    });
    expect(rest).toEqual([]);
    expect(l!.rawTitle).toBe('Jimmy Choo Blossom Eau de Parfum Spray 40ml');
    expect(l!.priceGbp).toBe(23.65);
    expect(l!.inStock).toBe(false);
    expect(l!.url).toBe(`${GS}/jimmy-choo-blossom-edp-spray-40-ml`);
  });

  it('read every size of a configurable product as its own listing at its own address', () => {
    const found = parseListings(SIZES, {
      sectionId: 'sitemap', pageUrl: `${GS}/kylie-minogue-darling-edp`, microdata: true, requireGbp: true,
    });
    expect(found.map((l) => [l.rawTitle.replace(/\s+/g, ' '), l.priceGbp, l.url])).toEqual([
      ['Kylie Minogue Darling Eau De Parfum 30ml', 22, `${GS}/kylie-minogue-darling-edp-30ml`],
      ['Kylie Minogue Darling Eau De Parfum 75ml', 15.2, `${GS}/kylie-minogue-darling-edp-75ml`],
    ]);
  });

  it('keep no price from a page that names another currency', () => {
    const dollars = SIMPLE.replaceAll('"GBP"', '"USD"');
    const found = parseListings(dollars, {
      sectionId: 'sitemap', pageUrl: `${GS}/jimmy-choo-blossom-edp-spray-40-ml`, microdata: true, requireGbp: true,
    });
    expect(found.filter((l) => l.priceGbp !== null)).toEqual([]);
  });
});

describe('a walk of the Gorgeous Shop aisles', () => {
  const shop = getRetailer('gorgeous-shop')!;
  const route = { ...shop.sitemapRoute!, categories: { ...shop.sitemapRoute!.categories!, rotation: 1 } };
  const used: Retailer = { ...shop, sitemapRoute: route };
  const perfume = `${GS}/fragrance`;

  const site: Record<string, string> = {
    [perfume]: aisle(perfume, 1, 2, [
      card('jimmy-choo-blossom-edp-spray-40-ml', 'Jimmy Choo Blossom Eau de Parfum Spray 40ml', '23.65'),
      card('shay-blue-melrose-apple-blossom-candle-200g', 'Shay & Blue Melrose Apple Blossom Candle', '12.00'),
    ]),
    [`${perfume}?p=2`]: aisle(perfume, 2, 2, [card('kylie-minogue-darling-edp', 'Kylie Minogue Darling Eau De Parfum', '15.20')]),
    [`${GS}/jimmy-choo-blossom-edp-spray-40-ml`]: SIMPLE,
    [`${GS}/kylie-minogue-darling-edp`]: SIZES,
  };

  async function run() {
    const calls: { url: string; ua: string }[] = [];
    const http: Http = async (url, headers) => {
      calls.push({ url, ua: headers['user-agent'] ?? '' });
      const body = site[url];
      return body ? { status: 200, ok: true, body } : { status: 404, ok: false, body: '' };
    };
    const result = await crawlViaSitemap({
      retailer: used,
      http,
      robots: parseRobots(robotsFor(GS)),
      maxPages: 50,
      gapMs: 1500,
      headers: { 'user-agent': ROUTE_HEADERS['user-agent']! },
      sleep: async () => {},
      refreshShare: 0,
    });
    return { result, calls };
  }

  it('walks the aisles page by page, then reads each product page once, asking for no sitemap', async () => {
    const { result, calls } = await run();
    const asked = calls.map((c) => c.url.replace(GS, ''));
    expect(asked.slice(0, 2)).toEqual(['/fragrance', '/fragrance?p=2']);
    expect(asked.some((u) => u.includes('sitemap'))).toBe(false);
    // The candle is named out; the two perfumes are read.
    expect(asked.filter((u) => !u.startsWith('/fragrance'))).toEqual([
      '/jimmy-choo-blossom-edp-spray-40-ml',
      '/kylie-minogue-darling-edp',
    ]);
    expect(result.listings.map((l) => l.priceGbp)).toEqual([23.65, 22, 15.2]);
    expect(calls.every((c) => c.ua.startsWith('PriceSniffsBot/'))).toBe(true);
  });
});

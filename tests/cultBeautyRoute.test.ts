import { describe, expect, it, vi } from 'vitest';
import {
  canonicalPage, crawlViaSitemap, selectUrlsToFetch, CATEGORY_WALK_SHARE, ROUTE_HEADERS,
} from '../src/catalogue/sitemapCrawl.js';
import { parseListings } from '../src/catalogue/jsonld.js';
import { isAllowed, parseRobots } from '../src/catalogue/robots.js';
import { isCatalogueListing, isFragrance } from '../src/catalogue/fragranceId.js';
import { getRetailer } from '../src/config/retailers.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { Retailer, SitemapRoute } from '../src/types/retailer.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * Cult Beauty's fragrance range is read from the shop's own category pages
 * (SitemapRoute.categories), as PriceSniffsBot, one request at a time. These
 * tests pin the walk's rules on a made up shop, and then pin the registry's
 * Cult Beauty entry against the shop's real robots.txt and real addresses
 * (read 2026-10-04).
 */

const HOST = 'https://www.example.co.uk';

function shop(route: SitemapRoute): Retailer {
  return {
    id: 'example-shop',
    name: 'Example Shop',
    domain: 'example.co.uk',
    homepage: HOST,
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: { standardGbp: null, freeOverGbp: null, estimatedDays: [3, 5], verifiedAt: '2026-10-04', confidence: 'unverified' },
    catalogue: null,
    affiliate: {
      network: null, verified: false, status: 'not-applied', publisherId: null,
      deeplinkTemplate: null, querySuffixTemplate: null, signupUrl: null,
    },
    sitemapRoute: route,
  } as Retailer;
}

const card = (path: string) => `<product-card-wrapper data-e2e="search_list-item-0" data-quicklook-url="${path}" class="product-card"></product-card-wrapper>`;
const listingPage = (n: number, total: number, paths: string[]) =>
  `<html><body><p aria-label="Page ${n} of ${total}">Page ${n} of ${total}</p>${paths.map(card).join('')}</body></html>`;
const ld = (node: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(node)}</script></head></html>`;
const product = (name: string, sku: string, price: number) =>
  ld({ '@type': 'Product', name, sku, offers: { '@type': 'Offer', price, priceCurrency: 'GBP' } });

const route: SitemapRoute = {
  roots: [`${HOST}/sitemapindex-product.xml`],
  follow: '/sitemap-product-\\d+\\.xml$',
  product: '^https://www\\.example\\.co\\.uk/p/[^/?#]+/\\d+/$',
  exclude: '(^|[/-])(candles?|body-mist)(-|/|$)',
  maxSitemaps: 2,
  requireGbp: true,
  categories: {
    pages: [`${HOST}/c/fragrance/perfumes/`, `${HOST}/c/fragrance/niche/`],
    pageParam: 'pageNumber',
    productLink: 'data-quicklook-url="(/p/[^"]+)"',
    pageCount: 'Page 1 of (\\d+)',
    maxPages: 5,
  },
};

const site: Record<string, string> = {
  [`${HOST}/c/fragrance/perfumes/`]: listingPage(1, 3, [
    '/p/rose-eau-de-parfum-50ml/101/',
    '/p/rose-eau-de-parfum-100ml/102/',
    '/p/rose-scented-candle-200g/103/',
    '/p/15861508/',
  ]),
  [`${HOST}/c/fragrance/perfumes/?pageNumber=2`]: listingPage(2, 3, [
    '/p/rose-eau-de-parfum-100ml/102/',
    '/p/oud-extrait-de-parfum-50ml/104/',
    '/p/home-accessories/trudon-candle/105/',
  ]),
  [`${HOST}/c/fragrance/perfumes/?pageNumber=3`]: listingPage(3, 3, ['/p/iris-cologne-30ml/106/']),
  [`${HOST}/c/fragrance/niche/`]: listingPage(1, 1, ['/p/oud-extrait-de-parfum-50ml/104/', '/p/molecule-01-100ml/107/']),
  [`${HOST}/sitemapindex-product.xml`]:
    `<sitemapindex><sitemap><loc>${HOST}/sitemap-product-0.xml</loc></sitemap></sitemapindex>`,
  [`${HOST}/sitemap-product-0.xml`]:
    '<urlset>' +
    // Listed by the categories already.
    `<url><loc>${HOST}/p/rose-eau-de-parfum-50ml/101/</loc></url>` +
    // Names a perfume and no category walk listed it: added.
    `<url><loc>${HOST}/p/amber-parfum-30ml/108/</loc></url>` +
    // Names no perfume: never asked for, whatever else the sitemap lists.
    `<url><loc>${HOST}/p/hydrating-face-serum-30ml/109/</loc></url>` +
    '</urlset>',
};
for (const [path, name, sku, price] of [
  ['/p/rose-eau-de-parfum-50ml/101/', 'Rose Eau de Parfum 50ml', '101', 98],
  ['/p/rose-eau-de-parfum-100ml/102/', 'Rose Eau de Parfum 100ml', '102', 150],
  ['/p/oud-extrait-de-parfum-50ml/104/', 'Oud Extrait de Parfum 50ml', '104', 210],
  ['/p/iris-cologne-30ml/106/', 'Iris Cologne 30ml', '106', 60],
  ['/p/molecule-01-100ml/107/', 'Molecule 01 (100ml)', '107', 125],
  ['/p/amber-parfum-30ml/108/', 'Amber Parfum 30ml', '108', 70],
] as const) {
  site[`${HOST}${path}`] = product(name, sku, price);
}

async function walk(over: {
  route?: Partial<SitemapRoute>;
  robots?: string;
  maxPages?: number;
  minDiscovery?: number;
  knownUrls?: Map<string, string>;
  refreshUrls?: string[];
  replies?: Record<string, { status: number; body: string }>;
  noCategories?: boolean;
} = {}) {
  const used: SitemapRoute = { ...route, ...over.route };
  if (over.noCategories) delete used.categories;
  const calls: { url: string; ua: string }[] = [];
  const http: Http = async (url, headers) => {
    calls.push({ url, ua: headers['user-agent'] ?? '' });
    const forced = over.replies?.[url];
    if (forced) return { status: forced.status, ok: forced.status < 400, body: forced.body };
    const body = site[url];
    return body ? { status: 200, ok: true, body } : { status: 404, ok: false, body: '' };
  };
  const sleeps: number[] = [];
  const result = await crawlViaSitemap({
    retailer: shop(used),
    http,
    robots: over.robots ? parseRobots(over.robots) : parseRobots(''),
    maxPages: over.maxPages ?? 50,
    gapMs: 1500,
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/124.0' },
    sleep: async (ms) => { sleeps.push(ms); },
    ...(over.minDiscovery !== undefined ? { minDiscovery: over.minDiscovery } : {}),
    ...(over.knownUrls ? { knownUrls: over.knownUrls } : {}),
    ...(over.refreshUrls ? { refreshUrls: over.refreshUrls } : {}),
    refreshShare: 0,
  });
  return { result, calls, sleeps };
}

describe('canonicalPage', () => {
  it("drops THG's variation parameter and any fragment, nothing else", () => {
    const page = `${HOST}/p/rose-eau-de-parfum-50ml/101/`;
    expect(canonicalPage(`${page}?variation=101`)).toBe(page);
    expect(canonicalPage(`${page}?variation=101#x`)).toBe(page);
    expect(canonicalPage(page)).toBe(page);
    expect(canonicalPage(`${page}?a=1&variation=101&b=2`)).toBe(`${page}?a=1&b=2`);
  });

  it('keeps a query that is the page itself, and a size fragment is one page', () => {
    const q = 'https://www.shymimosa.co.uk/shop/products/view.asp?brand=A&name=B';
    expect(canonicalPage(q)).toBe(q);
    expect(canonicalPage('https://www.parfumdreams.co.uk/index_13043.aspx#variation=222365'))
      .toBe('https://www.parfumdreams.co.uk/index_13043.aspx');
  });
});

describe('a route that reads the shop\'s category pages', () => {
  it('walks every page of every category, then the sitemap, asking only for what it keeps', async () => {
    const { result, calls } = await walk();
    const asked = calls.map((c) => c.url.replace(HOST, ''));
    expect(asked.slice(0, 5)).toEqual([
      '/c/fragrance/perfumes/',
      '/c/fragrance/perfumes/?pageNumber=2',
      '/c/fragrance/perfumes/?pageNumber=3',
      '/c/fragrance/niche/',
      '/sitemapindex-product.xml',
    ]);
    expect(asked[5]).toBe('/sitemap-product-0.xml');
    expect(result.categoryPagesFetched).toBe(4);
    // Products, once each, in the order the categories listed them, the
    // sitemap's perfume named address last. A candle, a slugless address
    // (the shop's gift card) and a two segment path are never kept, and the
    // sitemap's serum is not a fragrance the categories named.
    expect(asked.slice(6)).toEqual([
      '/p/rose-eau-de-parfum-50ml/101/',
      '/p/rose-eau-de-parfum-100ml/102/',
      '/p/oud-extrait-de-parfum-50ml/104/',
      '/p/iris-cologne-30ml/106/',
      '/p/molecule-01-100ml/107/',
      '/p/amber-parfum-30ml/108/',
    ]);
    expect(result.urlsDiscovered).toBe(6);
    expect(result.listings.map((l) => l.priceGbp)).toEqual([98, 150, 210, 60, 125, 70]);
  });

  it('is PriceSniffsBot on every request, whatever the caller passed', async () => {
    const { calls } = await walk();
    expect(calls.length).toBeGreaterThan(8);
    expect(calls.every((c) => c.ua === ROUTE_HEADERS['user-agent'])).toBe(true);
  });

  it('waits the gap between every pair of requests, category pages included', async () => {
    const { calls, sleeps } = await walk();
    expect(sleeps).toHaveLength(calls.length - 1);
    expect(sleeps.every((ms) => ms === 1500)).toBe(true);
  });

  it('does not ask for a category page robots.txt does not permit, and says so', async () => {
    const { calls, result } = await walk({ robots: 'User-agent: *\nDisallow: /c/fragrance/niche/\nDisallow: /*pageNumber=3\n' });
    const asked = calls.map((c) => c.url.replace(HOST, ''));
    expect(asked).not.toContain('/c/fragrance/niche/');
    expect(asked).not.toContain('/c/fragrance/perfumes/?pageNumber=3');
    expect(result.errors.join(' ')).toContain('robots.txt does not permit it');
  });

  it('stops at the first refusal, asks for nothing else and never goes round it', async () => {
    const { calls, result } = await walk({
      replies: { [`${HOST}/c/fragrance/perfumes/?pageNumber=2`]: { status: 403, body: '' } },
    });
    expect(calls.map((c) => c.url.replace(HOST, ''))).toEqual([
      '/c/fragrance/perfumes/',
      '/c/fragrance/perfumes/?pageNumber=2',
    ]);
    expect(result.errors.join(' ')).toContain('the shop began refusing requests');
    // What the first page listed is not read either: a refused shop is not
    // asked for its sitemap or a single product page this run.
    expect(result.pagesFetched).toBe(0);
    expect(result.urlsDiscovered).toBe(0);
  });

  it('never goes past maxPages, whatever the page claims', async () => {
    const { calls } = await walk({
      route: { categories: { ...route.categories!, pages: [`${HOST}/c/fragrance/perfumes/`], maxPages: 2 } },
    });
    const asked = calls.map((c) => c.url.replace(HOST, ''));
    expect(asked).toContain('/c/fragrance/perfumes/?pageNumber=2');
    expect(asked).not.toContain('/c/fragrance/perfumes/?pageNumber=3');
  });

  it('records a first page with no product link, instead of reading nothing quietly', async () => {
    const { result } = await walk({
      replies: { [`${HOST}/c/fragrance/niche/`]: { status: 200, body: '<html>No cards here</html>' } },
    });
    expect(result.errors.join(' ')).toContain('no product link found on the first page');
  });

  it('never calls a product withdrawn because a category walk did not list it', async () => {
    // Every discovered address is fetched here, and a walk of the sitemap
    // alone would call that complete. A category walk is never the whole range.
    const { result } = await walk();
    expect(result.pagesFetched).toBe(result.urlsDiscovered);
    expect(result.fetchedEveryDiscovered).toBe(false);
  });

  it('keeps the product pages their time when the category pages are slow', async () => {
    // A clock that moves one second a request. With eight seconds in all, the
    // category pages may take their share and no more; the sitemap and then
    // the product pages are still read in what is left, so stored prices are
    // re-read on a day the shop answers slowly.
    let now = 1_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const calls: string[] = [];
      const http: Http = async (url) => {
        calls.push(url.replace(HOST, ''));
        now += 1000;
        const body = site[url];
        return body ? { status: 200, ok: true, body } : { status: 404, ok: false, body: '' };
      };
      const result = await crawlViaSitemap({
        retailer: shop(route), http, robots: parseRobots(''), maxPages: 50, gapMs: 0,
        headers: {}, maxDurationMs: 8_000, refreshShare: 0,
      });
      const categoryCalls = calls.filter((u) => u.startsWith('/c/'));
      expect(categoryCalls.length).toBeLessThanOrEqual(Math.ceil(8 * CATEGORY_WALK_SHARE));
      expect(categoryCalls.length).toBeGreaterThan(0);
      expect(result.errors.join(' ')).toContain('used their share of this shop');
      expect(calls.some((u) => u.startsWith('/p/'))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('without a category walk the route behaves as before, rest of the shop included', async () => {
    const { result, calls } = await walk({ noCategories: true });
    expect(result.categoryPagesFetched).toBeUndefined();
    expect(calls.map((c) => c.url.replace(HOST, ''))).toContain('/p/hydrating-face-serum-30ml/109/');
  });
});

describe('reading a shop in many runs', () => {
  const stored = (path: string) => [`${HOST}${path}?variation=${path.match(/(\d+)\/$/)![1]}`, '2026-10-03T10:00:00.000Z'] as const;

  it('knows a stored size by its page, whichever way the address was written', async () => {
    const { calls } = await walk({
      knownUrls: new Map([stored('/p/rose-eau-de-parfum-50ml/101/'), stored('/p/amber-parfum-30ml/108/')]),
      maxPages: 3,
    });
    const products = calls.map((c) => c.url.replace(HOST, '')).filter((u) => u.startsWith('/p/'));
    // Three never read pages, taken from the ones not stored; the two stored
    // are not read as new (they are older than the unseen ones are, so they
    // only come into the budget once the unseen run out).
    expect(products).toEqual([
      '/p/rose-eau-de-parfum-100ml/102/',
      '/p/oud-extrait-de-parfum-50ml/104/',
      '/p/iris-cologne-30ml/106/',
    ]);
  });

  it('reads a due listing at its page, once, not as a stored address and again as a new one', async () => {
    const { calls, result } = await walk({
      knownUrls: new Map([stored('/p/rose-eau-de-parfum-50ml/101/')]),
      refreshUrls: [`${HOST}/p/rose-eau-de-parfum-50ml/101/?variation=101`],
      maxPages: 2,
    });
    const products = calls.map((c) => c.url.replace(HOST, '')).filter((u) => u.startsWith('/p/'));
    expect(products.filter((u) => u.includes('/101/'))).toEqual(['/p/rose-eau-de-parfum-50ml/101/']);
    expect(products[0]).toBe('/p/rose-eau-de-parfum-50ml/101/');
    expect(result.discoveryFetched).toBe(2);
  });

  it('gives a listing the address of its page, with no variation parameter', () => {
    const html = ld({
      '@type': 'ProductGroup', productGroupID: '101', name: 'Rose Eau de Parfum 50ml',
      hasVariant: [
        { '@type': 'Product', sku: '101', name: 'Rose Eau de Parfum 50ml',
          offers: { '@type': 'Offer', url: `${HOST}/p/rose-eau-de-parfum-50ml/101/?variation=101`, price: 98, priceCurrency: 'GBP' } },
        { '@type': 'Product', sku: '1', name: 'Rose Eau de Parfum 50ml',
          offers: { '@type': 'Offer', url: `${HOST}/p/rose-eau-de-parfum-50ml/101/?variation=1`, price: 71, priceCurrency: 'GBP' } },
      ],
    });
    const [only, ...rest] = parseListings(html, { sectionId: 'sitemap', pageUrl: `${HOST}/p/rose-eau-de-parfum-50ml/101/`, requireGbp: true });
    expect(rest).toHaveLength(0);
    expect(only!.priceGbp).toBe(98);
  });
});

describe('selectUrlsToFetch with a floor on never read pages', () => {
  const urls = Array.from({ length: 20 }, (_, i) => `https://x.example/p/a-${i}/${i}/`);
  const known = new Map(urls.slice(0, 5).map((u) => [u, '2026-10-01T00:00:00.000Z'] as const));

  it('reads that many unread pages when there are that many, and no re-reads', () => {
    const picked = selectUrlsToFetch(urls, 4, known, 0, 0, 12);
    expect(picked).toHaveLength(12);
    expect(picked.every((u) => !known.has(u))).toBe(true);
  });

  it('never pads a run with re-reads beyond the ordinary budget when little is unread', () => {
    const allButTwo = new Map(urls.slice(0, 18).map((u) => [u, '2026-10-01T00:00:00.000Z'] as const));
    const picked = selectUrlsToFetch(urls, 4, allButTwo, 0, 0, 300);
    // The two unread, then re-reads only up to the ordinary budget of four.
    expect(picked).toHaveLength(4);
    expect(picked.slice(0, 2)).toEqual(urls.slice(18));
  });

  it('is the old arithmetic when no floor is given', () => {
    expect(selectUrlsToFetch(urls, 4, known, 0.5, 0)).toEqual(selectUrlsToFetch(urls, 4, known, 0.5, 0, 0));
    expect(selectUrlsToFetch(urls, 4, known, 0.5, 0)).toHaveLength(4);
  });
});

/** The shop's own robots.txt as read on 2026-10-04: the "*" group in full, and the two browser groups. */
const CULT_BEAUTY_ROBOTS = `User-agent: *
Disallow: /renderer/*
Disallow: */email/*
Disallow: /*.html?buy=*
Disallow: /*_escaped_fragment_
Disallow: /*buy=*
Disallow: /*facetFilters=*
Disallow: /*helpfulReview.account?*reviewId=*
Disallow: /*pagination_sortSelect=*
Disallow: /*reportReview.account?*reviewId=*
Disallow: /*search=*
Disallow: /*sessionSettings.overlay
Disallow: /*sort=*
Disallow: /*sortOrder=*
Disallow: /*switchLocale.overlay
Disallow: /?q=
Disallow: /basketinterface.json?productId=*
Disallow: /checkout
Disallow: /checkout-api
Disallow: /components/diversionNotifier/*
Disallow: /components/internationalOverlay/*
Disallow: /my.basket?*buy=*
Disallow: /styleguide.info
Disallow: /submit-review.info
Disallow: /*searchInfo=*
Disallow: /*redirectedFromSearch=*
Disallow: /*originalSearchRay=*

User-agent: mozilla/5
Disallow: /

User-agent: mozilla/4
Disallow: /

Sitemap: https://www.cultbeauty.co.uk/sitemapindex-product.xml.gz
Sitemap: https://www.cultbeauty.co.uk/sitemapindex-list.xml.gz
`;

describe('Cult Beauty in the registry', () => {
  const cb = getRetailer('cult-beauty-global')!;
  const r = cb.sitemapRoute!;
  const robots = parseRobots(CULT_BEAUTY_ROBOTS);

  it('is a pinned route, so every request is PriceSniffsBot and never a browser', () => {
    expect(cb.enabled).toBe(true);
    expect(r).toBeDefined();
    // The file names browser groups with Disallow: /, so a browser identity is
    // exactly what it refuses; the crawler's own name falls to the "*" group.
    expect(robots.disallow).not.toContain('/');
    expect(robots.crawlDelaySeconds).toBeNull();
  });

  it('walks the fragrance aisles: perfumes, aftershave, unisex, niche, eau de toilette and all fragrance', () => {
    expect(r.categories!.pages.map((p) => p.replace('https://www.cultbeauty.co.uk', ''))).toEqual([
      '/c/fragrance/perfumes/',
      '/c/fragrance/aftershave/',
      '/c/fragrance/unisex/',
      '/c/fragrance/niche-fragrance/',
      '/c/fragrance/eau-de-toilette/',
      '/c/fragrance/shop-all/',
    ]);
    // Not skincare, makeup or hair.
    for (const page of r.categories!.pages) expect(page).toContain('/c/fragrance/');
  });

  it('asks only for addresses its robots.txt permits, every page of every aisle and the sitemaps', () => {
    for (const page of r.categories!.pages) {
      expect(isAllowed(robots, page), page).toBe(true);
      for (const n of [2, 17, r.categories!.maxPages]) {
        expect(isAllowed(robots, `${page}?${r.categories!.pageParam}=${n}`), `${page} ${n}`).toBe(true);
      }
    }
    for (const root of r.roots) expect(isAllowed(robots, root), root).toBe(true);
    expect(isAllowed(robots, 'https://www.cultbeauty.co.uk/sitemap-product-0.xml.gz')).toBe(true);
    expect(isAllowed(robots, 'https://www.cultbeauty.co.uk/p/chloe-eau-de-parfum-for-her-50ml/11079307/')).toBe(true);
    // Its own disallows are real ones: sort and search are the parameters not to use.
    expect(isAllowed(robots, 'https://www.cultbeauty.co.uk/c/fragrance/perfumes/?sort=price')).toBe(false);
  });

  it('keeps a product address with a slug and an id, and nothing else', () => {
    const keep = new RegExp(r.product, 'i');
    expect(keep.test('https://www.cultbeauty.co.uk/p/chloe-eau-de-parfum-for-her-50ml/11079307/')).toBe(true);
    // The e-gift card has no slug; a home accessory has two path segments;
    // another host and a size link with a query are not the page itself.
    expect(keep.test('https://www.cultbeauty.co.uk/p/15861508/')).toBe(false);
    expect(keep.test('https://www.cultbeauty.co.uk/p/home-accessories/trudon-candle/11472778/')).toBe(false);
    expect(keep.test('https://www.cultbeauty.com/p/chloe-eau-de-parfum-for-her-50ml/11079307/')).toBe(false);
    expect(keep.test('https://www.cultbeauty.co.uk/p/x/1/?variation=1')).toBe(false);
  });

  it('reads the product cards and page count the shop publishes, and nothing in the cards but the address', () => {
    const html =
      '<p aria-label="Page 1 of 41"><span>Page 1 of 41</span></p>' +
      '<product-card-wrapper data-e2e="search_list-item-0" data-quicklook="13992179" data-quicklook-url="/p/kayali-vanilla-royale-sugared-patchouli-64-eau-de-parfum-intense-100ml/13992179/" data-context="nobasket">' +
      '<a href="/p/ignored-carousel-link/1/">x</a>';
    const link = new RegExp(r.categories!.productLink, 'gi');
    expect([...html.matchAll(link)].map((m) => m[1])).toEqual([
      '/p/kayali-vanilla-royale-sugared-patchouli-64-eau-de-parfum-intense-100ml/13992179/',
    ]);
    expect(new RegExp(r.categories!.pageCount!, 'i').exec(html)?.[1]).toBe('41');
  });

  it('names out candles, mists and body care, and no perfume the shop sells by that name', () => {
    const out = new RegExp(r.exclude!, 'i');
    for (const slug of [
      'jo-malone-london-wood-sage-sea-salt-classic-candle-200g',
      'byredo-blanche-body-mist-100ml',
      'gisou-honey-infused-hair-perfume-15ml-sticky-toffee',
      'trudon-room-spray-cire-375ml',
      'le-labo-santal-33-shower-gel-237ml',
      'jo-malone-london-pine-eucalyptus-diffuser',
      'byredo-cotton-blend-hand-cream-50ml',
    ]) {
      expect(out.test(`/p/${slug}/1/`), slug).toBe(true);
    }
    // Creed contains "reed" and Candle-like words appear inside perfume names.
    for (const slug of [
      'creed-aventus/12870029',
      'creed-green-irish-tweed/12870035',
      'tom-ford-black-orchid-eau-de-parfum-spray-50ml/12018646',
      'maison-margiela-replica-by-the-fireplace-eau-de-toilette-100ml/13183550',
      'jo-malone-london-wood-sage-sea-salt-cologne-30ml/12079096',
      'kayali-vanilla-28-eau-de-parfum-100ml/13457549',
      'escentric-molecules-molecule-01-100ml/10366660',
      'd.s.-durga-black-magenta-50ml/17622150',
      'byredo-mojave-ghost-eau-de-parfum-100ml/13309792',
    ]) {
      expect(out.test(`/p/${slug}/`), slug).toBe(false);
    }
  });

  it('reads a floor of 300 never read pages a run, five runs for what the aisles hold', () => {
    expect(r.discoveryPages).toBe(300);
    expect(r.maxSitemaps).toBe(2);
    expect(r.requireGbp).toBe(true);
  });
});

describe('what Cult Beauty listings meet once stored', () => {
  const listing = (rawTitle: string, priceGbp: number | null = 100): StoredListing => ({
    retailerSku: '1', retailerId: 'cult-beauty-global', url: 'https://www.cultbeauty.co.uk/p/x/1/',
    rawTitle, rawBrand: null, ean: null, imageUrl: null, description: null, priceGbp, wasPriceGbp: null,
    promoEndsAt: null, inStock: true, sectionId: 'sitemap', rating: null,
    firstSeenAt: '2026-10-04T00:00:00.000Z', lastSeenAt: '2026-10-04T00:00:00.000Z', status: 'active',
    delistedAt: null, relistedAt: null, eligibleForNewBadge: false, variantId: null,
  } as StoredListing);

  it('a perfume with a strength and a size is a fragrance', () => {
    expect(isFragrance(listing('Kayali Freedom Musk Santal 34 EDP 50ml'))).toBe(true);
    expect(isFragrance(listing('Chloé Eau de Parfum For Her 50ml'))).toBe(true);
    expect(isFragrance(listing('Tom Ford Black Orchid Eau de Parfum Spray 50ml'))).toBe(true);
  });

  it('refills, gift sets, body mists and hair perfume are not single bottles', () => {
    expect(isFragrance(listing('Kilian Angels Share Eau de Parfum Refill 100ml'))).toBe(false);
    expect(isFragrance(listing('Jo Malone London Cologne Collection Gift Set 5x9ml'))).toBe(false);
    expect(isFragrance(listing('Byredo Blanche Body Mist 100ml'))).toBe(false);
    expect(isFragrance(listing('Byredo Mojave Ghost Hair Perfume 75ml'))).toBe(false);
  });

  it('a fragrance gift set is still a catalogue listing of its own, with a price', () => {
    expect(isCatalogueListing(listing('Tom Ford Soleil Neige Eau de Parfum Travel Gift Set'))).toBe(true);
    expect(isCatalogueListing(listing('Tom Ford Soleil Neige Eau de Parfum Travel Gift Set', null))).toBe(false);
  });

  it('a title that names no strength stays off the site, as at every other multi brand shop', () => {
    expect(isFragrance(listing('Creed Aventus 50ml'))).toBe(false);
  });

  it('a pre-order page is read as a pre-order, not as stock', () => {
    const html = ld({
      '@type': 'Product', sku: '1', name: 'Kayali Eden Juicy Apple 01 Eau de Parfum 50ml',
      offers: { '@type': 'Offer', price: 80, priceCurrency: 'GBP', availability: 'https://schema.org/PreOrder' },
    });
    const [l] = parseListings(html, { sectionId: 'sitemap', pageUrl: 'https://www.cultbeauty.co.uk/p/x/1/', requireGbp: true });
    expect(l!.inStock).toBe(false);
    expect(l!.availability).toBe('preOrder');
  });
});

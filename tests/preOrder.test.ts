import { describe, expect, it } from 'vitest';
import { parseListings, parseAvailability, isPreOrderAvailability } from '../src/catalogue/jsonld.js';
import { parseAwinFeed, parseDelimitedText } from '../src/catalogue/awinFeed.js';
import {
  isAvailableListing,
  listingStockState,
  markTitlePreOrders,
  titleStatesPreOrder,
  withFeedStock,
} from '../src/catalogue/listingAvailability.js';
import {
  parseProductPageAvailability,
  readAvailabilityFromProductPages,
} from '../src/catalogue/productPageAvailability.js';
import { parseRobots } from '../src/catalogue/robots.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { RawListing, StoredListing } from '../src/catalogue/types.js';
import { bestOffer, buildComparison, isPurchasable, outOfStockOffers, preOrderOffers } from '../src/services/priceService.js';
import { availabilityHeading, offerGroups, offersInPageOrder } from '../demo/offerGroups.js';
import { STOCK_LABEL, noStockLabel, rowStockMarks } from '../demo/stockLabels.js';
import { priceShown } from '../demo/wrongPrice.js';
import type { RawOffer } from '../src/types/offer.js';
import { RETAILERS } from '../src/config/retailers.js';
import { switchOnTheSwitchedOffShopsForThisFile } from './switchedOffShops.js';

// The Fragrance Shop, Harvey Nichols and Boots are fixtures here: see that file.
switchOnTheSwitchedOffShopsForThisFile();

/**
 * Pre-orders (owner's request, 2026-10-04): a bottle a shop sells but is not
 * shipping yet is its own state beside in stock and out of stock. Stored
 * examples only: the page below is Bloom Perfumery's Rose Ivoire De Caron
 * product JSON-LD as read 2026-10-04 (two sizes on PreOrder, the 1 ml sample
 * out of stock), kept here as text. No test reads a live shop.
 */

const BLOOM_PAGE = `<html><head>
<script type="application/ld+json">
  { "@context": "https://schema.org", "@type": "Store", "name": "Bloom Perfumery London" }
</script>
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Rose Ivoire De Caron",
    "brand": {"@type": "Brand","name": "Caron"},
    "url": "https://bloomperfume.co.uk/products/rose-ivoire-de-caron",
    "offers": [
        {"@type": "Offer",
          "price": "250.00",
          "priceCurrency": "GBP",
          "url": "https://bloomperfume.co.uk/products/rose-ivoire-de-caron",
          "sku": "ROSE-IVOIRE-DE-CARON-100-ML-EDP",
          "availability" : "https://schema.org/PreOrder"
        }
       , {"@type": "Offer",
          "price": "135.00",
          "priceCurrency": "GBP",
          "url": "https://bloomperfume.co.uk/products/rose-ivoire-de-caron",
          "sku": "ROSE-IVOIRE-DE-CARON-30-ML-EDP",
          "availability" : "https://schema.org/PreOrder"
        }
       , {"@type": "Offer",
          "price": "9.00",
          "priceCurrency": "GBP",
          "url": "https://bloomperfume.co.uk/products/rose-ivoire-de-caron",
          "sku": "ROSE-IVOIRE-DE-CARON-1-ML-EDP",
          "availability" : "https://schema.org/OutOfStock"
        }]
  }
</script></head><body></body></html>`;

// The same shape for a bottle on the shelf, and one the page lists twice, two ways.
const SHELF_PAGE = `<script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Product","name":"Shelf Bottle",
   "offers":[{"@type":"Offer","price":"120.00","priceCurrency":"GBP","sku":"SHELF-BOTTLE-50-ML-EDP","availability":"https://schema.org/InStock"}]}
</script>`;
const CONFLICTED_PAGE = `<script type="application/ld+json">
  {"@type":"Product","offers":[
    {"@type":"Offer","sku":"TWICE-50-ML","availability":"https://schema.org/PreOrder"},
    {"@type":"Offer","sku":"TWICE-50-ML","availability":"https://schema.org/InStock"}]}
</script>`;

const PAGES: Record<string, string> = {
  'https://bloomperfume.co.uk/products/rose-ivoire-de-caron': BLOOM_PAGE,
  'https://bloomperfume.co.uk/products/shelf-bottle': SHELF_PAGE,
  'https://bloomperfume.co.uk/products/twice': CONFLICTED_PAGE,
  'https://bloomperfume.co.uk/products/nothing': '<html>no structured data</html>',
};

// Bloom's own robots.txt group for every agent (read 2026-10-04): carts,
// checkout, search and the like are disallowed; product pages are not.
const ROBOTS = parseRobots(
  'User-agent: *\nDisallow: /cart\nDisallow: /checkout\nDisallow: /account\nDisallow: /search\nDisallow: /policies/\n',
);
const HEADERS = { 'user-agent': 'PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about)' };
const noSleep = async () => {};

function fakeHttp(seen: { url: string; ua: string }[], status = 200): Http {
  return async (url, headers) => {
    seen.push({ url, ua: headers['user-agent'] ?? '' });
    return { status, body: status === 200 ? PAGES[url.split('?')[0]!] ?? '' : '', ok: status === 200 };
  };
}

function listing(over: Partial<RawListing> = {}): RawListing {
  return {
    retailerSku: 'ROSE-IVOIRE-DE-CARON-100-ML-EDP',
    url: 'https://bloomperfume.co.uk/products/rose-ivoire-de-caron',
    rawTitle: 'Rose Ivoire De Caron 100 ml EdP',
    rawBrand: 'Caron',
    ean: null,
    imageUrl: null,
    priceGbp: 250,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'shopify-products-json',
    ...over,
  };
}

const stored = (over: Partial<StoredListing> = {}): StoredListing => ({
  ...listing(),
  retailerId: 'bloom-perfumery',
  firstSeenAt: '2026-10-03T00:00:00.000Z',
  lastSeenAt: '2026-10-04T00:00:00.000Z',
  status: 'active',
  delistedAt: null,
  relistedAt: null,
  eligibleForNewBadge: false,
  variantId: null,
  ...over,
});

describe('reading a pre-order from schema.org availability', () => {
  it('knows PreOrder, PreSale and BackOrder, with or without the prefix, and nothing else', () => {
    for (const v of ['https://schema.org/PreOrder', 'PreOrder', 'http://schema.org/PreSale', 'BackOrder']) {
      expect(isPreOrderAvailability(v), v).toBe(true);
    }
    for (const v of ['https://schema.org/InStock', 'OutOfStock', 'SoldOut', 'LimitedAvailability', 'Mystery', undefined, null]) {
      expect(isPreOrderAvailability(v), String(v)).toBe(false);
    }
  });

  it('is not in stock: a pre-order reads false, where it used to read true', () => {
    expect(parseAvailability('https://schema.org/PreOrder')).toBe(false);
    expect(parseAvailability('BackOrder')).toBe(false);
    expect(parseAvailability('https://schema.org/InStock')).toBe(true);
  });

  it('marks a JSON-LD listing a pre-order and not in stock, and leaves a shelf bottle alone', () => {
    const preOrderPage = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product",
      "name":"Hawas Boa Eau de Parfum 100ml","sku":"HB-100","url":"https://example.test/p/hawas-boa",
      "offers":{"@type":"Offer","price":"44.99","priceCurrency":"GBP","availability":"https://schema.org/PreOrder"}}</script>`;
    const shelfPage = preOrderPage.replace('PreOrder', 'InStock');
    const [pre] = parseListings(preOrderPage, { sectionId: 'x', pageUrl: 'https://example.test/p/hawas-boa' });
    expect(pre).toBeDefined();
    expect(pre!.availability).toBe('preOrder');
    expect(pre!.inStock).toBe(false);
    const [shelf] = parseListings(shelfPage, { sectionId: 'x', pageUrl: 'https://example.test/p/hawas-boa' });
    expect(shelf).toBeDefined();
    expect(shelf!.availability).toBeUndefined();
    expect(shelf!.inStock).toBe(true);
  });
});

describe('the shop wording rule', () => {
  it('reads Pre-Order in a title as the shop wrote it, and only as a whole word', () => {
    expect(titleStatesPreOrder('Momento Liquid Gold Extrait de Parfum 100ml Riiffs PRE-ORDER: Estimated dispatch: 7th October')).toBe(true);
    expect(titleStatesPreOrder('Hawas Boa 100ml Pre Order')).toBe(true);
    expect(titleStatesPreOrder('Hawas Boa 100ml (Preorder)')).toBe(true);
    expect(titleStatesPreOrder('Dior Sauvage Eau de Parfum 100ml')).toBe(false);
    expect(titleStatesPreOrder('Reorder Candle')).toBe(false);
  });

  it('marks a title pre-order not in stock, but never one the shop calls unavailable', () => {
    const a = listing({ rawTitle: 'Muse Perfume 100ml EDP Khadlaj PRE-ORDER: Estimated dispatch: 1st October' });
    const b = listing({ retailerSku: 'b', rawTitle: 'Sold Out Thing 100ml PRE-ORDER', inStock: false });
    const c = listing({ retailerSku: 'c', rawTitle: 'Plain Bottle 100ml' });
    const { listings, marked } = markTitlePreOrders([a, b, c]);
    expect(marked).toEqual([a.rawTitle]);
    expect(listings[0]).toMatchObject({ inStock: false, availability: 'preOrder' });
    expect(listings[1]).toBe(b);
    expect(listings[2]).toBe(c);
  });
});

describe('listingStockState', () => {
  it('decides in stock, sold out, pre-order and unknown in one place', () => {
    expect(listingStockState({ rawTitle: 'A 50ml', inStock: true })).toBe('inStock');
    expect(listingStockState({ rawTitle: 'A 50ml', inStock: false })).toBe('outOfStock');
    expect(listingStockState({ rawTitle: 'A 50ml', inStock: null })).toBe('unknown');
    expect(listingStockState({ rawTitle: 'A 50ml', inStock: false, availability: 'preOrder' })).toBe('preOrder');
  });

  it('reads the shop wording from a listing stored before the field existed, and lets sold out win', () => {
    expect(listingStockState({ rawTitle: 'Hawas Ice 100ml PRE-ORDER: Estimated dispatch: 5th October', inStock: true })).toBe('preOrder');
    expect(listingStockState({ rawTitle: 'Hawas Ice 100ml PRE-ORDER: Estimated dispatch: 5th October', inStock: null })).toBe('preOrder');
    expect(listingStockState({ rawTitle: 'Hawas Ice 100ml PRE-ORDER', inStock: false })).toBe('outOfStock');
  });

  it('keeps old data valid: no field at all behaves exactly as before', () => {
    const old = stored();
    expect(old.availability).toBeUndefined();
    expect(listingStockState(old)).toBe('inStock');
    expect(isAvailableListing(old)).toBe(true);
  });
});

describe('what a pre-order does to the history and to a re-read feed', () => {
  it('is not an available listing, so it is not a point on the price graph', () => {
    expect(isAvailableListing(stored({ inStock: false, availability: 'preOrder' }))).toBe(false);
    expect(isAvailableListing(stored({ rawTitle: 'Muse 100ml PRE-ORDER: Estimated dispatch: 1st October' }))).toBe(false);
  });

  it('keeps a pre-order when a feed that only says "available" is re-read, and clears it on "unavailable"', () => {
    const pre = stored({ inStock: false, availability: 'preOrder' });
    expect(withFeedStock(pre, true)).toMatchObject({ inStock: false, availability: 'preOrder' });
    const gone = withFeedStock(pre, false);
    expect(gone.inStock).toBe(false);
    expect(gone.availability).toBeUndefined();
    expect(withFeedStock(stored(), true).inStock).toBe(true);
    expect(withFeedStock(pre, null)).toBe(pre);
  });
});

describe('Awin feed', () => {
  const header = 'aw_deep_link,product_name,search_price,merchant_product_id,in_stock,stock_status,currency';
  const row = (sku: string, inStock: string, status: string) =>
    `https://example.test/${sku},Bottle ${sku} Eau de Parfum 50ml,40.00,${sku},${inStock},${status},GBP`;

  it('reads a merchant who writes preorder as a pre-order, and plain flags as before', () => {
    expect(parseDelimitedText('a,b\n1,2', ',')).toEqual([['a', 'b'], ['1', '2']]);
    const out = parseAwinFeed([header, row('1', 'yes', ''), row('2', '1', 'preorder'), row('3', 'preorder', ''), row('4', 'no', ''), row('5', '', '')].join('\n'));
    const by = new Map(out.map((l) => [l.retailerSku, l]));
    expect(by.get('1')).toMatchObject({ inStock: true });
    expect(by.get('1')!.availability).toBeUndefined();
    expect(by.get('2')).toMatchObject({ inStock: false, availability: 'preOrder' });
    expect(by.get('3')).toMatchObject({ inStock: false, availability: 'preOrder' });
    expect(by.get('4')).toMatchObject({ inStock: false });
    expect(by.get('4')!.availability).toBeUndefined();
    expect(by.get('5')).toMatchObject({ inStock: null });
  });
});

describe('parseProductPageAvailability', () => {
  it('reads each variant by its own SKU from the page JSON-LD', () => {
    const page = parseProductPageAvailability(BLOOM_PAGE);
    expect(page.get('ROSE-IVOIRE-DE-CARON-100-ML-EDP')).toBe('preOrder');
    expect(page.get('ROSE-IVOIRE-DE-CARON-30-ML-EDP')).toBe('preOrder');
    expect(page.get('ROSE-IVOIRE-DE-CARON-1-ML-EDP')).toBe('outOfStock');
    expect(page.has('SOMETHING-ELSE')).toBe(false);
    expect(parseProductPageAvailability(SHELF_PAGE).get('SHELF-BOTTLE-50-ML-EDP')).toBe('inStock');
  });

  it('says nothing about a SKU the page states two ways', () => {
    expect(parseProductPageAvailability(CONFLICTED_PAGE).has('TWICE-50-ML')).toBe(false);
  });
});

describe('readAvailabilityFromProductPages', () => {
  const input = () => [
    listing(),
    listing({ retailerSku: 'ROSE-IVOIRE-DE-CARON-30-ML-EDP', rawTitle: 'Rose Ivoire De Caron 30 ml EdP', priceGbp: 135 }),
    listing({ retailerSku: 'SHELF-BOTTLE-50-ML-EDP', url: 'https://bloomperfume.co.uk/products/shelf-bottle', rawTitle: 'Shelf Bottle 50 ml EdP', priceGbp: 120 }),
    // The feed already says sold out: its page is never asked for.
    listing({ retailerSku: 'ROSE-IVOIRE-DE-CARON-1-ML-EDP', rawTitle: 'Rose Ivoire De Caron 1 ml EdP', priceGbp: 9, inStock: false }),
    listing({ retailerSku: 'NOT-LISTED', url: 'https://bloomperfume.co.uk/products/nothing', rawTitle: 'Not Listed 50 ml EdP' }),
  ];
  const now = new Date('2026-10-04T12:00:00Z');

  it('marks the variants the page states as pre-orders, once per page, asked as the bot', async () => {
    const seen: { url: string; ua: string }[] = [];
    const out = await readAvailabilityFromProductPages(input(), { http: fakeHttp(seen), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep, now });
    const by = new Map(out.listings.map((l) => [l.retailerSku, l]));
    expect(by.get('ROSE-IVOIRE-DE-CARON-100-ML-EDP')).toMatchObject({ inStock: false, availability: 'preOrder', availabilityReadAt: now.toISOString() });
    expect(by.get('ROSE-IVOIRE-DE-CARON-30-ML-EDP')).toMatchObject({ inStock: false, availability: 'preOrder' });
    expect(by.get('SHELF-BOTTLE-50-ML-EDP')).toMatchObject({ inStock: true, availabilityReadAt: now.toISOString() });
    expect(by.get('SHELF-BOTTLE-50-ML-EDP')!.availability).toBeUndefined();
    expect(by.get('ROSE-IVOIRE-DE-CARON-1-ML-EDP')).toMatchObject({ inStock: false });
    expect(by.get('NOT-LISTED')).toMatchObject({ inStock: true });
    expect(by.get('NOT-LISTED')!.availability).toBeUndefined();
    expect(out.preOrder).toHaveLength(2);
    expect(out.unlisted).toEqual(['NOT-LISTED Not Listed 50 ml EdP']);
    // Three distinct pages: the two Caron sizes share one request, and the sold out listing has none.
    expect(out.fetched).toBe(3);
    expect(seen.every((s) => s.ua.startsWith('PriceSniffsBot'))).toBe(true);
    expect(out.listings).toHaveLength(5);
  });

  it('does not ask for a page robots.txt disallows', async () => {
    const seen: { url: string; ua: string }[] = [];
    const out = await readAvailabilityFromProductPages(
      [listing({ url: 'https://bloomperfume.co.uk/search?q=caron' })],
      { http: fakeHttp(seen), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep, now },
    );
    expect(seen).toEqual([]);
    expect(out.unread[0]).toMatch(/disallowed by robots\.txt/);
    expect(out.listings[0]!.inStock).toBe(true);
  });

  it('asks nothing when robots.txt could not be read', async () => {
    const seen: { url: string; ua: string }[] = [];
    await readAvailabilityFromProductPages(input(), {
      http: fakeHttp(seen), robots: { ...ROBOTS, unavailable: true }, headers: HEADERS, gapMs: 0, sleep: noSleep, now,
    });
    expect(seen).toEqual([]);
  });

  it('keeps a recent pre-order from an earlier read when the page cannot be read, and drops an old one', async () => {
    const recent = new Map([['ROSE-IVOIRE-DE-CARON-100-ML-EDP', { availability: 'preOrder' as const, availabilityReadAt: '2026-10-03T12:00:00.000Z' }]]);
    const out = await readAvailabilityFromProductPages([listing()], {
      http: fakeHttp([], 503), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep, now, prior: recent,
    });
    expect(out.listings[0]).toMatchObject({ inStock: false, availability: 'preOrder', availabilityReadAt: '2026-10-03T12:00:00.000Z' });
    expect(out.carried).toHaveLength(1);

    const old = new Map([['ROSE-IVOIRE-DE-CARON-100-ML-EDP', { availability: 'preOrder' as const, availabilityReadAt: '2026-09-20T12:00:00.000Z' }]]);
    const out2 = await readAvailabilityFromProductPages([listing()], {
      http: fakeHttp([], 503), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep, now, prior: old,
    });
    expect(out2.listings[0]!.inStock).toBe(true);
    expect(out2.listings[0]!.availability).toBeUndefined();
  });

  it('stops asking at the time budget and leaves the rest as the feed said', async () => {
    const seen: { url: string; ua: string }[] = [];
    const out = await readAvailabilityFromProductPages(input(), {
      http: fakeHttp(seen), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep, now, deadlineAt: Date.now() - 1,
    });
    expect(seen).toEqual([]);
    expect(out.unread.every((u) => /out of time/.test(u))).toBe(true);
    expect(out.listings.filter((l) => l.availability === 'preOrder')).toEqual([]);
  });

  it('reads the pages flagged on the last run first, then the ones never read, then the oldest read', async () => {
    const seen: { url: string; ua: string }[] = [];
    const prior = new Map<string, { availability?: 'preOrder' | null; availabilityReadAt?: string | null }>([
      ['SHELF-BOTTLE-50-ML-EDP', { availability: null, availabilityReadAt: '2026-10-01T00:00:00.000Z' }],
      ['ROSE-IVOIRE-DE-CARON-100-ML-EDP', { availability: 'preOrder', availabilityReadAt: '2026-10-04T00:00:00.000Z' }],
    ]);
    await readAvailabilityFromProductPages(input(), { http: fakeHttp(seen), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep, now, prior });
    expect(seen.map((s) => s.url)).toEqual([
      'https://bloomperfume.co.uk/products/rose-ivoire-de-caron',
      'https://bloomperfume.co.uk/products/nothing',
      'https://bloomperfume.co.uk/products/shelf-bottle',
    ]);
  });

  it('waits the shop gap between pages and never before the first', async () => {
    const gaps: number[] = [];
    await readAvailabilityFromProductPages(input(), {
      http: fakeHttp([]), robots: ROBOTS, headers: HEADERS, gapMs: 1500, now, sleep: async (ms) => { gaps.push(ms); },
    });
    expect(gaps).toEqual([1500, 1500]);
  });
});

/* ── the site ─────────────────────────────────────────────────────────────── */

const at = new Date('2026-10-04T09:00:00Z');
const offer = (retailerId: string, price: number, stock: RawOffer['stock']): RawOffer => ({
  retailerId,
  variantId: 'rose-ivoire-100',
  price,
  wasPrice: null,
  currency: 'GBP',
  stock,
  url: `https://example.test/${retailerId}`,
  promoEndsAt: null,
  fetchedAt: new Date(at.getTime() - 3_600_000).toISOString(),
});

describe('a pre-order on the product page', () => {
  // Bloom's Rose Ivoire 100ml is a pre-order at 250; two shops have it on the
  // shelf at dearer prices; one is sold out; one states no delivery cost.
  const offers = [
    offer('bloom-perfumery', 250, 'preOrder'),
    offer('the-fragrance-shop', 289, 'inStock'),
    offer('harvey-nichols', 305, 'inStock'),
    offer('boots', 199, 'outOfStock'),
    offer('manchester-ouds', 190, 'preOrder'),
  ];
  const rows = buildComparison(offers, { now: at });
  const groups = offerGroups(rows);

  it('is not buyable, however cheap', () => {
    expect(isPurchasable('preOrder')).toBe(false);
    const bloom = rows.find((r) => r.retailer.id === 'bloom-perfumery')!;
    expect(bloom.stock).toBe('preOrder');
    expect(bloom.isPurchasable).toBe(false);
  });

  it('is never the cheapest, though it is the cheapest price on the page', () => {
    const best = bestOffer(rows);
    expect(best?.retailer.id).toBe('the-fragrance-shop');
    expect(rows.map((r) => r.retailer.id)).toContain('bloom-perfumery');
    expect(rows.some((r) => r.stock === 'preOrder' && r === best)).toBe(false);
  });

  it('sits under the in stock list and under the sold out rows, in a group of its own', () => {
    expect(groups.delivered.map((r) => r.retailer.id)).toEqual(['the-fragrance-shop', 'harvey-nichols']);
    expect(groups.gone.map((r) => r.retailer.id)).toEqual(['boots']);
    expect(groups.preOrder.map((r) => r.retailer.id)).toEqual(['manchester-ouds', 'bloom-perfumery']);
    expect(offersInPageOrder(groups).map((r) => r.stock)).toEqual(['inStock', 'inStock', 'outOfStock', 'preOrder', 'preOrder']);
    // The shared sort puts them last as well.
    expect(rows.map((r) => r.stock).slice(-3)).toEqual(['outOfStock', 'preOrder', 'preOrder']);
  });

  it('is not counted in the "Available at" heading', () => {
    expect(availabilityHeading(groups)).toBe('Available at (2 Shops)');
    expect(availabilityHeading(offerGroups(buildComparison([offer('bloom-perfumery', 250, 'preOrder')], { now: at })))).toBe('');
  });

  it('counts as not in stock: out of the buyable list, and out when out of stock rows are hidden', () => {
    expect(outOfStockOffers(rows).map((r) => r.stock).sort()).toEqual(['outOfStock', 'preOrder', 'preOrder']);
    expect(preOrderOffers(rows).map((r) => r.retailer.id).sort()).toEqual(['bloom-perfumery', 'manchester-ouds']);
    const hidden = buildComparison(offers, { now: at, hideOutOfStock: true });
    expect(hidden.map((r) => r.stock)).toEqual(['inStock', 'inStock']);
  });

  it('with nothing else on the page, has no cheapest at all', () => {
    const only = buildComparison([offer('bloom-perfumery', 250, 'preOrder')], { now: at });
    expect(bestOffer(only)).toBeNull();
    expect(noStockLabel(only)).toBe('Preorder Only');
    expect(noStockLabel(buildComparison([offer('boots', 9, 'outOfStock'), offer('bloom-perfumery', 250, 'preOrder')], { now: at }))).toBe('Sold Out');
    expect(noStockLabel(buildComparison([offer('boots', 9, 'outOfStock')], { now: at }))).toBe('Sold Out');
  });
});

describe('the Preorder label', () => {
  it('shows on a pre-order row as a tag, and a sold out row keeps its Last price line', () => {
    expect(rowStockMarks({ isPurchasable: false, stock: 'preOrder' })).toEqual({ tag: 'Preorder', lastPrice: false, fact: null });
    expect(rowStockMarks({ isPurchasable: false, stock: 'outOfStock' })).toEqual({ tag: null, lastPrice: true, fact: null });
    expect(rowStockMarks({ isPurchasable: true, stock: 'inStock' })).toEqual({ tag: null, lastPrice: false, fact: null });
    expect(rowStockMarks({ isPurchasable: true, stock: 'lowStock' })).toEqual({ tag: null, lastPrice: false, fact: 'Low stock' });
  });

  it('is written Preorder, Title Case, with no hyphen or dash anywhere a reader sees', () => {
    const words = [...Object.values(STOCK_LABEL), noStockLabel([{ isPurchasable: false, stock: 'preOrder' }])];
    for (const w of words) expect(w, w).not.toMatch(/[-‐-―−]/);
    expect(STOCK_LABEL.preOrder).toBe('Preorder');
    expect(noStockLabel([{ isPurchasable: false, stock: 'preOrder' }])).toBe('Preorder Only');
  });

  it('is said in the wrong price report as shown as preorder, not sold out', () => {
    const base = { shop: 'Bloom Perfumery', itemPriceGbp: 250, deliveredPriceGbp: 259.86, deliveryCostGbp: 9.86, fetchedAt: '2026-10-04T08:00:00Z' };
    expect(priceShown({ ...base, isPurchasable: false, isPreOrder: true })).toMatch(/shown as preorder$/);
    expect(priceShown({ ...base, isPurchasable: false })).toMatch(/shown as sold out$/);
    expect(priceShown({ ...base, isPurchasable: true })).not.toMatch(/shown as/);
  });
});

describe('the registry', () => {
  it('reads Bloom Perfumery pre-orders from its product pages and no other shop does', () => {
    const flagged = RETAILERS.filter((r) => r.availabilityFromProductPage).map((r) => r.id);
    expect(flagged).toEqual(['bloom-perfumery']);
    const bloom = RETAILERS.find((r) => r.id === 'bloom-perfumery')!;
    expect(bloom.shopifyStorefront).toBe(true);
  });
});

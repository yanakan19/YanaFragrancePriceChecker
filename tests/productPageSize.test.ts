import { describe, it, expect } from 'vitest';
import {
  parseProductPageSizes,
  pageSizeFor,
  plainMl,
  titleWithPageSize,
  wantsPageSize,
  readSizesFromProductPages,
} from '../src/catalogue/productPageSize.js';
import { isFragrance, sizeMl } from '../src/catalogue/fragranceId.js';
import { parseRobots } from '../src/catalogue/robots.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { RawListing, StoredListing } from '../src/catalogue/types.js';

/**
 * Stored examples, not live values. The three real pages are trimmed copies of
 * what beautypie.com served as PriceSniffsBot on 2026-10-04, keeping only the
 * parts the size rule reads: the theme's variants array, the basket size field,
 * the feature line and the "Shop now" price. The last three are made up to
 * exercise the rule's edges and say so.
 */

/** Real, trimmed: Stole The Morning. The page title carries no size. */
const STOLE_THE_MORNING = `
<title>Stole The Morning Eau De Parfum | Beauty Pie</title>
<input type="hidden" name="properties[Size]" value="50ml" data-product-variant-size>
<script>
"variants": [{ "id": 48759216799927, "title": "Default Title", "available": true, "size":
  "50ml", "options":
  ["Default Title"], "price": 5900, "compare_at_price": null, "sku":
  "82908", "inventory_quantity": 27, "max_qty": 10,
  "custom_label": "£5 OFF", "promotional_label": "October Members" }],
</script>
<ul role="list"><li class="flex items-center gap-2">50ml<span aria-hidden="true">&bull;</span></li><li class="flex items-center gap-2">Made in the UK<span aria-hidden="true">&bull;</span></li></ul>
<span class="block body-md-strong" data-purchase-price>£59.00</span>
`;

/** Real, trimmed: Orris Florentina. The page title carries 50ml; its variants array too. */
const ORRIS_FLORENTINA = `
<title>Orris Florentina Eau De Parfum 50ml | Beauty Pie</title>
<script>
"variants": [{ "id": 48479776669879, "title": "Default Title", "available": true, "size": "50ml", "options": ["Default Title"], "price": 5900, "sku": "62350" }],
</script>
<ul role="list"><li class="flex items-center gap-2">50ml<span aria-hidden="true">&bull;</span></li></ul>
<span class="block body-md-strong" data-purchase-price>£59.00</span>
`;

/** Real, trimmed: a skincare page, to show a size that is not a perfume's still reads plainly. */
const BODY_CREME = `
<script>
"variants": [{ "id": 48479773556919, "title": "Default Title", "size": "100ml", "sku": "75222" }],
</script>
<span data-purchase-price>£35.00</span>
`;

/** Made up: a page that states no size anywhere. */
const NO_SIZE_PAGE = `
<title>Mystery Eau De Parfum | Beauty Pie</title>
<script>
"variants": [{ "id": 1, "title": "Default Title", "size": "", "sku": "90001" }],
</script>
<span data-purchase-price>£59.00</span>
`;

/** Made up: two variants, each stating its own size. */
const TWO_VARIANTS = `
<script>
"variants": [
  { "id": 11, "title": "30ml", "size": "30ml", "sku": "90010" },
  { "id": 12, "title": "100ml", "size": "100 ml", "sku": "90011" }
],
</script>
<span data-purchase-price>£45.00</span>
`;

/** Made up: a set, whose size is not one plain millilitre figure. */
const SET_PAGE = `
<script>
"variants": [{ "id": 21, "title": "Default Title", "size": "3 x 10ml", "sku": "90020" }],
</script>
`;

function listing(over: Partial<RawListing> = {}): RawListing {
  return {
    retailerSku: '82908',
    url: 'https://www.beautypie.com/products/stole-the-morning-parfum',
    rawTitle: 'Stole The Morning Eau De Parfum',
    rawBrand: 'Beauty Pie',
    ean: null,
    imageUrl: null,
    priceGbp: 59,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'shopify-products-json',
    description: null,
    productType: 'Fragrance',
    nativePrice: null,
    ...over,
  };
}

const asStored = (l: RawListing): StoredListing =>
  ({
    ...l,
    retailerId: 'beauty-pie',
    firstSeenAt: '2026-10-04T00:00:00Z',
    lastSeenAt: '2026-10-04T00:00:00Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
  }) as StoredListing;

describe('plainMl', () => {
  it('reads exactly one plain millilitre figure', () => {
    expect(plainMl('50ml')).toBe(50);
    expect(plainMl(' 100 ML ')).toBe(100);
    expect(plainMl('7.5ml')).toBe(7.5);
  });

  it('refuses anything that is not one plain figure', () => {
    for (const v of ['', '3 x 10ml', '50ml / 100ml', 'Mini', '1.7 fl oz', '0ml', '5000ml', undefined, 50]) {
      expect(plainMl(v)).toBeNull();
    }
  });
});

describe('parseProductPageSizes', () => {
  it('reads the size per variant, keyed by the variant SKU', () => {
    const page = parseProductPageSizes(STOLE_THE_MORNING);
    expect(page.variants).toEqual([{ sku: '82908', id: '48759216799927', ml: 50 }]);
    expect(page.pageMl).toBe(50);
  });

  it('reads the non member "Shop now" price in pounds', () => {
    expect(parseProductPageSizes(STOLE_THE_MORNING).shopNowGbp).toBe(59);
    expect(parseProductPageSizes(BODY_CREME).shopNowGbp).toBe(35);
  });

  it('does not take the size from the page title, which three of thirteen pages omit it from', () => {
    const page = parseProductPageSizes(STOLE_THE_MORNING);
    expect(STOLE_THE_MORNING).not.toMatch(/<title>[^<]*\d+ml/);
    expect(page.variants[0]!.ml).toBe(50);
  });

  it('reads two variants separately', () => {
    const page = parseProductPageSizes(TWO_VARIANTS);
    expect(page.variants.map((v) => [v.sku, v.ml])).toEqual([['90010', 30], ['90011', 100]]);
  });

  it('leaves a page that states no size, or a set, with no size', () => {
    expect(parseProductPageSizes(NO_SIZE_PAGE).variants[0]!.ml).toBeNull();
    expect(parseProductPageSizes(SET_PAGE).variants[0]!.ml).toBeNull();
  });

  it('returns nothing for a page with no variants data', () => {
    const page = parseProductPageSizes('<html><title>Beauty Pie</title></html>');
    expect(page.variants).toEqual([]);
    expect(page.pageMl).toBeNull();
    expect(page.shopNowGbp).toBeNull();
  });
});

describe('pageSizeFor', () => {
  it('answers a listed SKU from its own variant', () => {
    const page = parseProductPageSizes(TWO_VARIANTS);
    expect(pageSizeFor(page, '90010', false)).toBe(30);
    expect(pageSizeFor(page, '90011', false)).toBe(100);
  });

  it('does not answer a SKU the page does not list when there are several variants', () => {
    expect(pageSizeFor(parseProductPageSizes(TWO_VARIANTS), '99999', false)).toBeNull();
  });

  it('answers an unlisted SKU on a one variant page only for the product\'s only listing', () => {
    const page = parseProductPageSizes(STOLE_THE_MORNING);
    expect(pageSizeFor(page, '00000', true)).toBe(50);
    expect(pageSizeFor(page, '00000', false)).toBeNull();
  });

  it('states no size for a one variant page that contradicts itself', () => {
    const contradicting = STOLE_THE_MORNING.replace('value="50ml"', 'value="100ml"');
    expect(pageSizeFor(parseProductPageSizes(contradicting), '82908', true)).toBeNull();
  });

  it('never invents a size for a page that states none', () => {
    expect(pageSizeFor(parseProductPageSizes(NO_SIZE_PAGE), '90001', true)).toBeNull();
  });
});

describe('titleWithPageSize', () => {
  it('appends the page size to a title that states none', () => {
    expect(titleWithPageSize('Orris Florentina Eau De Parfum', 50)).toBe('Orris Florentina Eau De Parfum 50ml');
  });

  it('leaves the title alone when the page states no size', () => {
    expect(titleWithPageSize('Mystery Eau De Parfum', null)).toBe('Mystery Eau De Parfum');
  });

  it('leaves a title that already agrees with the page', () => {
    expect(titleWithPageSize('Orris Florentina Eau De Parfum 50ml', 50)).toBe('Orris Florentina Eau De Parfum 50ml');
  });

  it('puts the page size over a different size the title guessed', () => {
    expect(titleWithPageSize('Orris Florentina Eau De Parfum 100ml', 50)).toBe('Orris Florentina Eau De Parfum 50ml');
  });

  it('does not touch a title with two sizes, or one stated in ounces', () => {
    expect(titleWithPageSize('Duo 30ml and 100ml', 50)).toBe('Duo 30ml and 100ml');
    expect(titleWithPageSize('Orris Eau De Parfum 1.7 oz', 50)).toBe('Orris Eau De Parfum 1.7 oz');
  });
});

describe('wantsPageSize', () => {
  it('wants unsized perfumes, by product type or by concentration word', () => {
    expect(wantsPageSize({ rawTitle: 'Le Smash Santal', productType: 'Fragrance' })).toBe(true);
    expect(wantsPageSize({ rawTitle: 'Stole The Morning Eau De Parfum', productType: null })).toBe(true);
  });

  it('does not fetch candles, skincare or listings that already state a size', () => {
    expect(wantsPageSize({ rawTitle: 'Midnight Cashmere Luxury Scented Candle', productType: 'HomeFragrance' })).toBe(false);
    expect(wantsPageSize({ rawTitle: 'Orange Absolute Eau De Parfum Hand Cream', productType: 'Bodycare' })).toBe(false);
    expect(wantsPageSize({ rawTitle: 'Orris Eau De Parfum 50ml', productType: 'Fragrance' })).toBe(false);
  });
});

describe('the size rule on a stored Beauty Pie listing', () => {
  it('keeps a perfume out of the catalogue with no size, and in once its page gives one', () => {
    const before = listing();
    expect(sizeMl(before.rawTitle, before.description)).toBeNull();
    expect(isFragrance(asStored(before))).toBe(false);

    const titled = titleWithPageSize(before.rawTitle, pageSizeFor(parseProductPageSizes(STOLE_THE_MORNING), '82908', true));
    const after = listing({ rawTitle: titled });
    expect(titled).toBe('Stole The Morning Eau De Parfum 50ml');
    expect(sizeMl(after.rawTitle, after.description)).toBe(50);
    expect(isFragrance(asStored(after))).toBe(true);
  });

  it('leaves a perfume whose page states no size unsized, so it stays out and matches nothing', () => {
    const l = listing({ retailerSku: '90001', rawTitle: 'Mystery Eau De Parfum' });
    const ml = pageSizeFor(parseProductPageSizes(NO_SIZE_PAGE), '90001', true);
    const titled = titleWithPageSize(l.rawTitle, ml);
    expect(titled).toBe('Mystery Eau De Parfum');
    expect(sizeMl(titled, null)).toBeNull();
    expect(isFragrance(asStored({ ...l, rawTitle: titled }))).toBe(false);
  });
});

describe('readSizesFromProductPages', () => {
  const ROBOTS = parseRobots('User-agent: *\nAllow: /\nDisallow: /cart/\nDisallow: /account\n');
  const HEADERS = { 'user-agent': 'PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about)' };

  const pages: Record<string, string> = {
    'https://www.beautypie.com/products/stole-the-morning-parfum': STOLE_THE_MORNING,
    'https://www.beautypie.com/products/mystery-parfum': NO_SIZE_PAGE,
    'https://www.beautypie.com/products/two-sizes': TWO_VARIANTS,
  };

  function fakeHttp(seen: { url: string; ua: string }[], status = 200): Http {
    return async (url, headers) => {
      seen.push({ url, ua: headers['user-agent'] ?? '' });
      const body = pages[url.split('?')[0]!] ?? '';
      return { status, body: status === 200 ? body : '', ok: status === 200 };
    };
  }

  const noSleep = async () => {};

  it('sizes each listing from its own page, asked as the bot, and leaves a page with no size unsized', async () => {
    const seen: { url: string; ua: string }[] = [];
    const input = [
      listing(),
      listing({ retailerSku: '90001', url: 'https://www.beautypie.com/products/mystery-parfum', rawTitle: 'Mystery Eau De Parfum' }),
      listing({ retailerSku: '90010', url: 'https://www.beautypie.com/products/two-sizes', rawTitle: 'Two Sizes Eau De Parfum', priceGbp: 45 }),
      listing({ retailerSku: '90011', url: 'https://www.beautypie.com/products/two-sizes', rawTitle: 'Two Sizes Eau De Parfum', priceGbp: 45 }),
      listing({ retailerSku: '80546', url: 'https://www.beautypie.com/products/candle', rawTitle: 'Midnight Cashmere Luxury Scented Candle', productType: 'HomeFragrance' }),
    ];
    const out = await readSizesFromProductPages(input, { http: fakeHttp(seen), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep });

    expect(out.listings.map((l) => l.rawTitle)).toEqual([
      'Stole The Morning Eau De Parfum 50ml',
      'Mystery Eau De Parfum',
      'Two Sizes Eau De Parfum 30ml',
      'Two Sizes Eau De Parfum 100ml',
      'Midnight Cashmere Luxury Scented Candle',
    ]);
    expect(out.fetched).toBe(3);
    expect(out.sized).toBe(3);
    expect(out.unsized).toEqual(['90001 Mystery Eau De Parfum']);
    expect(seen.every((s) => s.ua.startsWith('PriceSniffsBot'))).toBe(true);
    expect(seen.map((s) => s.url)).not.toContain('https://www.beautypie.com/products/candle');
  });

  it('reports a page whose Shop now price differs from the held price', async () => {
    const out = await readSizesFromProductPages([listing({ priceGbp: 49 })], {
      http: fakeHttp([]), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep,
    });
    expect(out.priceDisagreements).toHaveLength(1);
  });

  it('does not ask for a page robots.txt disallows', async () => {
    const seen: { url: string; ua: string }[] = [];
    const out = await readSizesFromProductPages(
      [listing({ url: 'https://www.beautypie.com/account/orris' })],
      { http: fakeHttp(seen), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep },
    );
    expect(seen).toEqual([]);
    expect(out.unread[0]).toMatch(/disallowed by robots\.txt/);
    expect(out.listings[0]!.rawTitle).toBe('Stole The Morning Eau De Parfum');
  });

  it('asks nothing when robots.txt could not be read', async () => {
    const seen: { url: string; ua: string }[] = [];
    await readSizesFromProductPages([listing()], {
      http: fakeHttp(seen), robots: { ...ROBOTS, unavailable: true }, headers: HEADERS, gapMs: 0, sleep: noSleep,
    });
    expect(seen).toEqual([]);
  });

  it('keeps a size an earlier run read when the page cannot be read, and invents none otherwise', async () => {
    const prior = new Map([['82908', 'Stole The Morning Eau De Parfum 50ml']]);
    const withPrior = await readSizesFromProductPages([listing()], {
      http: fakeHttp([], 503), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep, prior,
    });
    expect(withPrior.listings[0]!.rawTitle).toBe('Stole The Morning Eau De Parfum 50ml');

    const without = await readSizesFromProductPages([listing()], {
      http: fakeHttp([], 503), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep,
    });
    expect(without.listings[0]!.rawTitle).toBe('Stole The Morning Eau De Parfum');
    expect(without.unread[0]).toMatch(/HTTP 503/);
  });

  it('never carries a prior size over a page that was read and states none', async () => {
    const prior = new Map([['90001', 'Mystery Eau De Parfum 50ml']]);
    const out = await readSizesFromProductPages(
      [listing({ retailerSku: '90001', url: 'https://www.beautypie.com/products/mystery-parfum', rawTitle: 'Mystery Eau De Parfum' })],
      { http: fakeHttp([]), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep, prior },
    );
    expect(out.listings[0]!.rawTitle).toBe('Mystery Eau De Parfum');
  });
});

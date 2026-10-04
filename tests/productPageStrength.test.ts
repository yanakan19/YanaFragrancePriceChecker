import { describe, it, expect } from 'vitest';
import {
  parseProductPageStrength,
  readStrengthsFromProductPages,
  titleWithPageStrength,
  wantsPageStrength,
} from '../src/catalogue/productPageStrength.js';
import { isFragrance, fragranceId } from '../src/catalogue/fragranceId.js';
import { CONCENTRATION_NOT_STATED, concentration, displayName } from '../src/catalogue/productName.js';
import { parseRobots } from '../src/catalogue/robots.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { RawListing, StoredListing } from '../src/catalogue/types.js';

/**
 * Stored examples, not live values. The metafields block is a trimmed copy of
 * what uk.kayali.com served as PriceSniffsBot on 2026-10-04 on its perfume
 * pages (`<script type="application/json" data-product-metafields-json>`),
 * keeping three of the keys around `subtitle`; each page's own subtitle is
 * the value read from that page that day. The pages without a usable block are
 * made up to exercise the edges, and say so.
 */
function block(subtitle: unknown, extra = ''): string {
  const fields = `"gravitate":["Warm \\u0026 Spicy"],"product_keywords":["Sweet","Addictive","Warm"],${
    subtitle === undefined ? '' : `"subtitle":${JSON.stringify(subtitle)},`
  }"upsell_items":["gid:\\/\\/shopify\\/Product\\/9632244334920"]${extra}`;
  return `<head><title>Vanilla | 28 Warm &amp; Sweet Gourmand Perfume – KAYALI UK</title></head>
<script type="application/json" data-product-metafields-json>
     {"metafields": {${fields}}}
</script>`;
}

/** Real subtitle values, one per page kind read on 2026-10-04. */
const VANILLA_28 = block('Eau de Parfum');
const OUDGASM_CAFE = block('Eau de Parfum Intense');
const VANILLA_ROYALE = block('Eau de parfum intense');
const OUDGASM_DISCOVERY_SET = block('Eau De Parfum Intense');
const BODY_SPRAY = block('All Over Body Spray');
const HAIR_MIST = block('Hair Mist');

describe('parseProductPageStrength', () => {
  it('reads the strength a perfume page prints, in the catalogue spelling', () => {
    expect(parseProductPageStrength(VANILLA_28)).toEqual({ stated: 'Eau de Parfum', strength: 'Eau de Parfum' });
  });

  it('keeps "Intense" and reads every capitalisation the shop used', () => {
    for (const html of [OUDGASM_CAFE, VANILLA_ROYALE, OUDGASM_DISCOVERY_SET]) {
      expect(parseProductPageStrength(html)?.strength).toBe('Eau de Parfum Intense');
    }
    expect(parseProductPageStrength(VANILLA_ROYALE)?.stated).toBe('Eau de parfum intense');
  });

  it('reads the other strengths the catalogue knows, only when the whole subtitle is one', () => {
    expect(parseProductPageStrength(block('Eau de Toilette'))?.strength).toBe('Eau de Toilette');
    expect(parseProductPageStrength(block('Extrait de Parfum'))?.strength).toBe('Extrait de Parfum');
    expect(parseProductPageStrength(block('Parfum'))?.strength).toBe('Parfum');
    expect(parseProductPageStrength(block('  eau   de  parfum '))?.strength).toBe('Eau de Parfum');
  });

  it('reads no strength from a subtitle that is a product kind, not a strength', () => {
    expect(parseProductPageStrength(BODY_SPRAY)).toBeNull();
    expect(parseProductPageStrength(HAIR_MIST)).toBeNull();
    for (const v of ['Elixir', 'Eau de Parfum Spray', 'Eau de Parfum for Men', '', 'Oud Wood', 42, null]) {
      expect(parseProductPageStrength(block(v)), String(v)).toBeNull();
    }
  });

  it('reads nothing from a page with no block, no subtitle or a block that is not JSON', () => {
    expect(parseProductPageStrength('<html><body>Eau de Parfum</body></html>')).toBeNull();
    expect(parseProductPageStrength(block(undefined))).toBeNull();
    expect(parseProductPageStrength('<script type="application/json" data-product-metafields-json>{nope</script>')).toBeNull();
    expect(parseProductPageStrength('<script type="application/json" data-product-metafields-json>[]</script>')).toBeNull();
    // A strength named in the prose or the ingredients is not the shop stating the product's strength.
    expect(parseProductPageStrength('<p>Alcohol Denat., Parfum, Water. Eau de Parfum 50ml</p>')).toBeNull();
  });
});

describe('titleWithPageStrength', () => {
  it('puts the strength before the size, whatever the variant label that follows', () => {
    expect(titleWithPageStrength('Vanilla | 28 100ml', 'Eau de Parfum')).toBe('Vanilla | 28 Eau de Parfum 100ml');
    expect(titleWithPageStrength('Vanilla | 28 10ml Miniature', 'Eau de Parfum')).toBe('Vanilla | 28 Eau de Parfum 10ml Miniature');
    expect(titleWithPageStrength('Vanilla | 28 1.5ml', 'Eau de Parfum')).toBe('Vanilla | 28 Eau de Parfum 1.5ml');
    expect(titleWithPageStrength('Oudgasm Café Oud | 19 50ml', 'Eau de Parfum Intense')).toBe(
      'Oudgasm Café Oud | 19 Eau de Parfum Intense 50ml',
    );
  });

  it('appends where the title states no size, and changes nothing for no strength', () => {
    expect(titleWithPageStrength('Mystery', 'Parfum')).toBe('Mystery Parfum');
    expect(titleWithPageStrength('Vanilla | 28 100ml', null)).toBe('Vanilla | 28 100ml');
  });
});

describe('the strength as the catalogue reads it once it is in the title', () => {
  it('turns "Not stated" into the stated strength', () => {
    expect(concentration('Vanilla | 28 100ml')).toBe(CONCENTRATION_NOT_STATED);
    expect(concentration('Vanilla | 28 Eau de Parfum 100ml')).toBe('Eau de Parfum');
  });

  it('keeps the "Oud" in a name that has one once a real strength is in the title', () => {
    // Before: "Oud" was the only concentration-like word, so it was taken for one and cut out.
    expect(displayName('Oudgasm Café Oud | 19 50ml', 'KAYALI', 'Kayali')).toBe('Oudgasm Café | 19');
    expect(displayName('Dapper Daddy Saffron Oud 100ml', 'KAYALI', 'Kayali')).toBe('Dapper Daddy Saffron');
    expect(displayName('Oudgasm Café Oud | 19 Eau de Parfum Intense 50ml', 'KAYALI', 'Kayali')).toBe('Oudgasm Café Oud | 19 Intense');
    expect(displayName('Dapper Daddy Saffron Oud Eau de Parfum 100ml', 'KAYALI', 'Kayali')).toBe('Dapper Daddy Saffron Oud');
  });

  it('reads "Eau de Parfum Intense" as Eau de Parfum and leaves "Intense" in the name, as for any house', () => {
    expect(concentration('Oudgasm Café Oud | 19 Eau de Parfum Intense 50ml')).toBe('Eau de Parfum');
    expect(displayName('Armani Code Eau de Parfum Intense 100ml', 'Armani', 'Armani')).toBe('Code Intense');
  });
});

const asStored = (l: RawListing): StoredListing =>
  ({
    ...l,
    retailerId: 'kayali',
    firstSeenAt: '2026-10-04T00:00:00Z',
    lastSeenAt: '2026-10-04T00:00:00Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
  }) as StoredListing;

/** Real Kayali rows (data/catalogue/kayali.json, 2026-10-03), as the feed gave them. */
function row(over: Partial<RawListing>): RawListing {
  return {
    retailerSku: 'KY00082',
    url: 'https://uk.kayali.com/products/vanilla-28',
    rawTitle: 'Vanilla | 28 100ml',
    rawBrand: 'KAYALI',
    ean: null,
    imageUrl: null,
    priceGbp: 110,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'shopify-products-json',
    description: null,
    productType: 'Fragrances',
    nativePrice: null,
    ...over,
  };
}

const VANILLA_ROWS: RawListing[] = [
  row({ retailerSku: 'KY00082', rawTitle: 'Vanilla | 28 100ml', priceGbp: 110 }),
  row({ retailerSku: 'KY00081', rawTitle: 'Vanilla | 28 50ml', priceGbp: 80 }),
  row({ retailerSku: 'KY00080', rawTitle: 'Vanilla | 28 10ml Miniature', priceGbp: 28 }),
  row({ retailerSku: 'KY00126', rawTitle: 'Vanilla | 28 10ml Travel Spray', priceGbp: 22 }),
  row({ retailerSku: 'KY00103', rawTitle: 'Vanilla | 28 1.5ml', priceGbp: 3 }),
];

describe('wantsPageStrength', () => {
  it('wants a single perfume whose title names no strength', () => {
    for (const l of VANILLA_ROWS) expect(wantsPageStrength(l, 'kayali'), l.rawTitle).toBe(true);
  });

  it('wants an Oudgasm bottle, where "Oud" is a word of the name and not a strength', () => {
    expect(wantsPageStrength(row({ rawTitle: 'Oudgasm Café Oud | 19 50ml' }), 'kayali')).toBe(true);
  });

  it('does not want a title that already names its strength: the title is the shop\'s statement too', () => {
    expect(wantsPageStrength(row({ rawTitle: 'Vanilla | 28 Eau de Toilette 100ml' }), 'kayali')).toBe(false);
  });

  it('does not want a set, a bundle, a body product or an accessory', () => {
    const sets = [
      row({ rawTitle: 'Dreamy Obsession Miniature Set 4 x 10ml', productType: 'Sets' }),
      row({ rawTitle: 'Yum Mini Duo (Pistachio Gelato, Boujee Marshmallow) 2 x 5ml', productType: 'Sets' }),
      row({ rawTitle: 'Fruit Crush 100ml', productType: 'Bundles' }),
      row({ rawTitle: 'Vacay in a Bottle 50ml Wardrobe', productType: null }),
      row({ rawTitle: 'Vanilla | 28 Body Spray 125ml', productType: 'Mists & Sprays' }),
      row({ rawTitle: 'Yum Pistachio Gelato | 33 Silk Soufflé 240g', productType: 'Body' }),
      row({ rawTitle: 'Eden Mini Perfume Holder Charm', productType: 'Accessories' }),
    ];
    for (const l of sets) expect(wantsPageStrength(l, 'kayali'), l.rawTitle).toBe(false);
  });
});

describe('readStrengthsFromProductPages', () => {
  const ROBOTS = parseRobots('User-agent: *\nDisallow: /cart$\nDisallow: /checkouts/\nDisallow: /search\n');
  const HEADERS = { 'user-agent': 'PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about)' };
  const noSleep = async () => {};

  const pages: Record<string, string> = {
    'https://uk.kayali.com/products/vanilla-28': VANILLA_28,
    'https://uk.kayali.com/products/oudgasm-cafe-oud-19': OUDGASM_CAFE,
    'https://uk.kayali.com/products/vanilla-28-body-spray': BODY_SPRAY,
    'https://uk.kayali.com/products/mystery': block(undefined),
  };

  function fakeHttp(seen: { url: string; ua: string }[], status = 200): Http {
    return async (url, headers) => {
      seen.push({ url, ua: headers['user-agent'] ?? '' });
      const body = pages[url.split('?')[0]!] ?? '';
      return { status, body: status === 200 ? body : '', ok: status === 200 };
    };
  }

  const input = (): RawListing[] => [
    ...VANILLA_ROWS,
    row({ retailerSku: 'KY00159', url: 'https://uk.kayali.com/products/oudgasm-cafe-oud-19', rawTitle: 'Oudgasm Café Oud | 19 50ml', priceGbp: 119 }),
    row({ retailerSku: 'KY00300', url: 'https://uk.kayali.com/products/vanilla-28-body-spray', rawTitle: 'Vanilla | 28 Body Spray 125ml', productType: 'Mists & Sprays', priceGbp: 39 }),
    row({ retailerSku: 'KY09999', url: 'https://uk.kayali.com/products/mystery', rawTitle: 'Mystery 50ml', priceGbp: 50 }),
    row({
      retailerSku: 'KY00700', url: 'https://uk.kayali.com/products/dreamy-obsession-miniature-set',
      rawTitle: 'Dreamy Obsession Miniature Set 4 x 10ml', productType: 'Sets', priceGbp: 88,
    }),
  ];

  it('gives every size on a page that page\'s strength, with one request per page, asked as the bot', async () => {
    const seen: { url: string; ua: string }[] = [];
    const out = await readStrengthsFromProductPages(input(), { retailerId: 'kayali', http: fakeHttp(seen), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep });

    expect(out.listings.map((l) => l.rawTitle)).toEqual([
      'Vanilla | 28 Eau de Parfum 100ml',
      'Vanilla | 28 Eau de Parfum 50ml',
      'Vanilla | 28 Eau de Parfum 10ml Miniature',
      'Vanilla | 28 Eau de Parfum 10ml Travel Spray',
      'Vanilla | 28 Eau de Parfum 1.5ml',
      'Oudgasm Café Oud | 19 Eau de Parfum Intense 50ml',
      'Vanilla | 28 Body Spray 125ml',
      'Mystery 50ml',
      'Dreamy Obsession Miniature Set 4 x 10ml',
    ]);
    expect(out.stated).toBe(6);
    expect(out.fetched).toBe(3);
    expect(seen.map((s) => s.url)).toEqual([
      'https://uk.kayali.com/products/vanilla-28',
      'https://uk.kayali.com/products/oudgasm-cafe-oud-19',
      'https://uk.kayali.com/products/mystery',
    ]);
    expect(seen.every((s) => s.ua.startsWith('PriceSniffsBot'))).toBe(true);
    // A page that states no strength is left as it was, and said so.
    expect(out.unstated).toEqual(['KY09999 Mystery 50ml']);
  });

  it('leaves every listing\'s id, price and link as they were: only the title moves', async () => {
    const before = input();
    const out = await readStrengthsFromProductPages(before, { retailerId: 'kayali', http: fakeHttp([]), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep });
    out.listings.forEach((l, i) => {
      const { rawTitle: _a, ...rest } = l;
      const { rawTitle: _b, ...was } = before[i]!;
      expect(rest).toEqual(was);
      expect(fragranceId(asStored(l))).toBe(fragranceId(asStored(before[i]!)));
    });
  });

  it('never rewrites a set, so a set\'s identity (made from its title) cannot move', async () => {
    const set = row({ retailerSku: 'KY00700', url: 'https://uk.kayali.com/products/vanilla-28', rawTitle: 'Dreamy Obsession Miniature Set 4 x 10ml', productType: 'Sets' });
    const out = await readStrengthsFromProductPages([set], { retailerId: 'kayali', http: fakeHttp([]), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep });
    expect(out.fetched).toBe(0);
    expect(out.listings[0]!.rawTitle).toBe(set.rawTitle);
  });

  it('asks robots.txt for every page and leaves a refused page\'s listings as they were', async () => {
    const seen: { url: string; ua: string }[] = [];
    const robots = parseRobots('User-agent: *\nDisallow: /products/vanilla-28\n');
    const out = await readStrengthsFromProductPages(VANILLA_ROWS, { retailerId: 'kayali', http: fakeHttp(seen), robots, headers: HEADERS, gapMs: 0, sleep: noSleep });
    expect(seen).toEqual([]);
    expect(out.listings.map((l) => l.rawTitle)).toEqual(VANILLA_ROWS.map((l) => l.rawTitle));
    expect(out.unread[0]).toContain('disallowed by robots.txt');
  });

  it('keeps last run\'s strength for one run when a page cannot be read, and never invents one', async () => {
    const held = new Map(VANILLA_ROWS.map((l) => [l.retailerSku, titleWithPageStrength(l.rawTitle, 'Eau de Parfum')]));
    const withPrior = await readStrengthsFromProductPages(VANILLA_ROWS, {
      retailerId: 'kayali', http: fakeHttp([], 503), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep, prior: held,
    });
    expect(withPrior.listings.map((l) => l.rawTitle)).toEqual([...held.values()]);
    expect(withPrior.unread[0]).toContain('HTTP 503');

    const without = await readStrengthsFromProductPages(VANILLA_ROWS, {
      retailerId: 'kayali', http: fakeHttp([], 503), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep,
    });
    expect(without.listings.map((l) => l.rawTitle)).toEqual(VANILLA_ROWS.map((l) => l.rawTitle));

    // A held title that is not this title plus a strength is not trusted.
    const stale = new Map([['KY00082', 'Something Else Entirely Eau de Parfum 100ml']]);
    const ignored = await readStrengthsFromProductPages([VANILLA_ROWS[0]!], {
      retailerId: 'kayali', http: fakeHttp([], 503), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep, prior: stale,
    });
    expect(ignored.listings[0]!.rawTitle).toBe('Vanilla | 28 100ml');
  });

  it('a page read that states none never inherits a held strength', async () => {
    const held = new Map([['KY09999', 'Mystery Eau de Parfum 50ml']]);
    const out = await readStrengthsFromProductPages([row({ retailerSku: 'KY09999', url: 'https://uk.kayali.com/products/mystery', rawTitle: 'Mystery 50ml' })], {
      retailerId: 'kayali', http: fakeHttp([]), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep, prior: held,
    });
    expect(out.listings[0]!.rawTitle).toBe('Mystery 50ml');
  });

  it('a perfume with a stated strength is a fragrance, and so is one without at Kayali, which sells only fragrance', async () => {
    const out = await readStrengthsFromProductPages(VANILLA_ROWS, { retailerId: 'kayali', http: fakeHttp([]), robots: ROBOTS, headers: HEADERS, gapMs: 0, sleep: noSleep });
    for (const l of out.listings) expect(isFragrance(asStored(l)), l.rawTitle).toBe(true);
    for (const l of VANILLA_ROWS) expect(isFragrance(asStored(l)), l.rawTitle).toBe(true);
  });
});

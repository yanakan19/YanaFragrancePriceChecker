import { describe, it, expect } from 'vitest';
import { extractNextData, parseJohnLewisListings } from '../src/catalogue/johnLewisNextData.js';
import { hasRenderedStateParser, parseRenderedState } from '../src/catalogue/renderedState.js';

/**
 * Three real John Lewis product records, captured from two rendered category
 * pages and quoted verbatim from the run logs that produced them:
 *
 *   - CHANEL Coco Mademoiselle Crush Absolu, from
 *     /browse/beauty/womens-fragrance/_/N-a63?page=1 — state probe run
 *     32503415608, job 96838106561, 2026-08-21T16:33Z.
 *   - Byredo Mojave Ghost L'Huile and Byredo Bal d'Afrique Absolu, from
 *     /browse/beauty/mens-aftershave/_/N-a61?page=1 — state probe run
 *     32504051993, job 96840113636, 2026-08-21T16:40Z.
 *
 * Trimmed, not rewritten: `alternativeImageUrls`, `colorSwatches`,
 * `advertising`, `pricePerUnit`, `customerNotifiableEvents` and the non-volume
 * attributes are dropped because this parser never reads them and the real
 * payload is 216 kB. Every field below is exactly as John Lewis published it,
 * down to the string-typed prices and the protocol-relative image URLs, which
 * is the whole point of testing against a capture rather than a hand-written
 * shape someone believed the site used.
 *
 * The three are not an arbitrary three. They are the three price shapes that
 * grid contains: a two-size range (£117-£160), a single price (£65.00) and a
 * second two-size range on a product whose title names no size at all.
 */
const REAL_PRODUCTS = [
  {
    productId: '115419487',
    title: 'CHANEL Coco Mademoiselle Crush Absolu Eau de Parfum',
    averageRating: 0,
    reviews: 0,
    image: '//media.johnlewiscontent.com/i/JohnLewis/115419468?',
    defaultSkuId: '115419468',
    brand: 'CHANEL',
    variantPriceRange: {
      display: { max: '£160.00', min: '£117.00' },
      reductionHistory: [],
      value: { max: '160.00', min: '117.00' },
      for: 'ITEM',
    },
    url: '/chanel-coco-mademoiselle-crush-absolu-eau-de-parfum/p115419487',
    messaging: [],
    type: 'product',
    outOfStock: false,
    isAvailableToOrder: true,
    multiSku: true,
    attributes: [{ key: 'volume', values: ['50ml', '100ml'], displayName: 'Volume' }],
  },
  {
    productId: '113633365',
    title: "Byredo Mojave Ghost L'Huile Parfum Roll-On Perfumed Oil, 7.5ml",
    averageRating: 0,
    reviews: 0,
    image: '//media.johnlewiscontent.com/i/JohnLewis/113402091?',
    defaultSkuId: '113402091',
    brand: 'Byredo',
    variantPriceRange: {
      display: { max: '£65.00', min: '£65.00' },
      reductionHistory: [],
      value: { max: '65.00', min: '65.00' },
      for: 'ITEM',
    },
    url: '/byredo-mojave-ghost-lhuile-parfum-roll-on-perfumed-oil-7-5ml/p113633365',
    messaging: [],
    type: 'product',
    outOfStock: false,
    isAvailableToOrder: true,
    multiSku: false,
    attributes: [{ key: 'volume', values: ['7.5ml'], displayName: 'Volume' }],
  },
  {
    productId: '113892319',
    title: "Byredo Bal d'Afrique Absolu de Parfum",
    averageRating: 4.5,
    reviews: 34,
    image: '//media.johnlewiscontent.com/i/JohnLewis/113892307?',
    defaultSkuId: '113892307',
    brand: 'Byredo',
    variantPriceRange: {
      display: { max: '£270.00', min: '£195.00' },
      reductionHistory: [],
      value: { max: '270.00', min: '195.00' },
      for: 'ITEM',
    },
    url: '/byredo-bal-dafrique-absolu-de-parfum/p113892319',
    messaging: [],
    type: 'product',
    outOfStock: false,
    isAvailableToOrder: true,
    multiSku: true,
    attributes: [{ key: 'volume', values: ['50ml', '100ml'], displayName: 'Volume' }],
  },
];

const PAGE_URL = 'https://www.johnlewis.com/browse/beauty/womens-fragrance/_/N-a63?page=1';

/** The page as Next.js serves it: the payload in a typed JSON script block. */
function pageWith(products: unknown[]): string {
  const payload = { props: { pageProps: { productListingData: { products } } } };
  return (
    '<!doctype html><html><head><title>Fragrance</title></head><body><div id="__next"></div>' +
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>` +
    '</body></html>'
  );
}

/** A real record with one field changed, for a shape the capture did not contain. */
function variantOf(index: number, patch: Record<string, unknown>): unknown {
  return { ...REAL_PRODUCTS[index], ...patch };
}

describe('extractNextData', () => {
  it('reads the __NEXT_DATA__ block out of a page', () => {
    const data = extractNextData(pageWith(REAL_PRODUCTS)) as Record<string, unknown>;
    expect(data).not.toBeNull();
    expect(Object.keys(data)).toContain('props');
  });

  it('is null for a page with no such block, and for one whose block is not JSON', () => {
    expect(extractNextData('<html><body>nothing here</body></html>')).toBeNull();
    expect(
      extractNextData('<script id="__NEXT_DATA__" type="application/json">{oops</script>'),
    ).toBeNull();
  });
});

describe('parseJohnLewisListings, against the captured records', () => {
  const listings = parseJohnLewisListings(pageWith(REAL_PRODUCTS), {
    sectionId: 'womens',
    pageUrl: PAGE_URL,
  });

  it('finds every product in the grid', () => {
    expect(listings).toHaveLength(3);
    expect(listings.map((l) => l.retailerSku)).toEqual(['115419487', '113633365', '113892319']);
  });

  it('prices the single-price product from the shop\'s own figure', () => {
    const mojave = listings[1]!;
    expect(mojave.priceGbp).toBe(65);
    expect(mojave.rawTitle).toBe("Byredo Mojave Ghost L'Huile Parfum Roll-On Perfumed Oil, 7.5ml");
    expect(mojave.rawBrand).toBe('Byredo');
    expect(mojave.inStock).toBe(true);
  });

  it('refuses to price a card whose variants disagree', () => {
    // £117 and £160 are two different bottles behind one title that names
    // neither. Either number would be a price nobody can pay for the thing
    // the title describes.
    expect(listings[0]!.priceGbp).toBeNull();
    expect(listings[2]!.priceGbp).toBeNull();
  });

  it('still records the unpriced products as listings', () => {
    // A listing exists whether or not it has been priced — see RawListing in
    // src/catalogue/types.ts. Dropping them would lose the fact that John
    // Lewis stocks these at all.
    expect(listings[0]!.rawTitle).toBe('CHANEL Coco Mademoiselle Crush Absolu Eau de Parfum');
    expect(listings[0]!.inStock).toBe(true);
  });

  it('resolves the site-relative product URL and the protocol-relative image', () => {
    expect(listings[0]!.url).toBe(
      'https://www.johnlewis.com/chanel-coco-mademoiselle-crush-absolu-eau-de-parfum/p115419487',
    );
    expect(listings[0]!.imageUrl).toBe('https://media.johnlewiscontent.com/i/JohnLewis/115419468?');
  });

  it('carries the section it was crawled from, and claims nothing it did not read', () => {
    expect(listings.map((l) => l.sectionId)).toEqual(['womens', 'womens', 'womens']);
    for (const l of listings) {
      expect(l.ean).toBeNull();
      expect(l.wasPriceGbp).toBeNull();
      expect(l.promoEndsAt).toBeNull();
    }
  });
});

describe('parseJohnLewisListings, shapes the capture did not contain', () => {
  it('appends the stated volume when the title omits it and the shop names one', () => {
    // The Mojave record with its size taken out of the title. John Lewis's own
    // `volume` attribute still states 7.5ml, which is recovery, not a guess —
    // the same move sizeFromUrl.ts makes from a URL slug.
    const page = pageWith([variantOf(1, { title: "Byredo Mojave Ghost L'Huile Parfum Roll-On" })]);
    const [listing] = parseJohnLewisListings(page, { sectionId: 'mens', pageUrl: PAGE_URL });
    expect(listing!.rawTitle).toBe("Byredo Mojave Ghost L'Huile Parfum Roll-On 7.5ml");
  });

  it('leaves a two-volume card\'s title alone even when the title states no size', () => {
    // Bal d'Afrique names no size and offers two. There is no single size to
    // recover, and it is also a card this parser has already declined to price.
    expect(
      parseJohnLewisListings(pageWith([REAL_PRODUCTS[2]]), { sectionId: 'mens', pageUrl: PAGE_URL })[0]!
        .rawTitle,
    ).toBe("Byredo Bal d'Afrique Absolu de Parfum");
  });

  it('reads out of stock from either flag', () => {
    const outOfStock = pageWith([variantOf(1, { outOfStock: true })]);
    expect(parseJohnLewisListings(outOfStock, { sectionId: 'mens', pageUrl: PAGE_URL })[0]!.inStock).toBe(
      false,
    );

    const unorderable = pageWith([variantOf(1, { isAvailableToOrder: false })]);
    expect(
      parseJohnLewisListings(unorderable, { sectionId: 'mens', pageUrl: PAGE_URL })[0]!.inStock,
    ).toBe(false);
  });

  it('reports unknown stock rather than guessing when neither flag is present', () => {
    const page = pageWith([{ ...REAL_PRODUCTS[1], outOfStock: undefined, isAvailableToOrder: undefined }]);
    expect(parseJohnLewisListings(page, { sectionId: 'mens', pageUrl: PAGE_URL })[0]!.inStock).toBeNull();
  });

  it('will not price a figure the shop did not display in sterling', () => {
    // `value.min` is a bare "65.00" with no currency on it anywhere; the only
    // statement of currency in the whole record is the £ in `display.min`.
    // Without it, the number is a number and not a sterling price.
    const euros = pageWith([
      variantOf(1, {
        variantPriceRange: {
          display: { max: '€65.00', min: '€65.00' },
          value: { max: '65.00', min: '65.00' },
        },
      }),
    ]);
    expect(parseJohnLewisListings(euros, { sectionId: 'mens', pageUrl: PAGE_URL })[0]!.priceGbp).toBeNull();
  });

  it('drops a record with no id, no title or no url rather than storing half of one', () => {
    const page = pageWith([
      variantOf(1, { productId: undefined, defaultSkuId: undefined }),
      variantOf(2, { title: '' }),
      variantOf(0, { url: undefined }),
    ]);
    expect(parseJohnLewisListings(page, { sectionId: 'mens', pageUrl: PAGE_URL })).toEqual([]);
  });

  it('counts a product listed twice in one grid once', () => {
    // A sponsored slot and an ordinary position are the same product; the
    // capture shows `isMerchBoost: true` on records that occupy both.
    const page = pageWith([REAL_PRODUCTS[1], REAL_PRODUCTS[1]]);
    expect(parseJohnLewisListings(page, { sectionId: 'mens', pageUrl: PAGE_URL })).toHaveLength(1);
  });

  it('is empty, not thrown, for a page with no product payload at all', () => {
    expect(parseJohnLewisListings('<html></html>', { sectionId: 'x', pageUrl: PAGE_URL })).toEqual([]);
    expect(
      parseJohnLewisListings(pageWith([]), { sectionId: 'x', pageUrl: PAGE_URL }),
    ).toEqual([]);
  });
});

describe('renderedState registry', () => {
  it('routes John Lewis to the __NEXT_DATA__ reader', () => {
    expect(hasRenderedStateParser('john-lewis')).toBe(true);
    const listings = parseRenderedState('john-lewis', pageWith([REAL_PRODUCTS[1]]), {
      sectionId: 'mens',
      pageUrl: PAGE_URL,
    });
    expect(listings).toHaveLength(1);
    expect(listings[0]!.priceGbp).toBe(65);
  });

  it('has no reader for Superdrug, whose rendered page JSON-LD already covers', () => {
    // State probe run 32503824167, job 96839386128: parseListings() returned
    // 60 listings from that page's own JSON-LD. A second reader here would be
    // a bespoke parser for data the one parser already reads correctly.
    expect(hasRenderedStateParser('superdrug')).toBe(false);
    expect(
      parseRenderedState('superdrug', pageWith([REAL_PRODUCTS[1]]), {
        sectionId: 'fragrance',
        pageUrl: PAGE_URL,
      }),
    ).toEqual([]);
  });

  it('returns nothing for a shop with no reader rather than guessing at its markup', () => {
    // Boots is the standing example: state probe 32505341082, job 96844124899,
    // rendered 2,513 bytes of challenge page through a real browser on a
    // residential UK IP. There is nothing on that page for any reader to read.
    expect(hasRenderedStateParser('boots')).toBe(false);
    expect(
      parseRenderedState('boots', pageWith(REAL_PRODUCTS), {
        sectionId: 'fragrance',
        pageUrl: PAGE_URL,
      }),
    ).toEqual([]);
  });

  it('does not hand a John Lewis page to the Selfridges reader, or the reverse', () => {
    // Both shops have a reader; neither reader is a general one. Selfridges'
    // reads an RSC flight stream and finds nothing in a __NEXT_DATA__ block.
    expect(hasRenderedStateParser('selfridges')).toBe(true);
    expect(
      parseRenderedState('selfridges', pageWith(REAL_PRODUCTS), {
        sectionId: 'fragrance',
        pageUrl: PAGE_URL,
      }),
    ).toEqual([]);
  });
});

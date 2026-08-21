import { describe, it, expect } from 'vitest';
import {
  rscFlightStream,
  productArraysIn,
  parseSelfridgesListings,
} from '../src/catalogue/selfridgesRsc.js';
import { hasRenderedStateParser, parseRenderedState } from '../src/catalogue/renderedState.js';

/**
 * Three real Selfridges product records, quoted verbatim from the React
 * Server Components window printed by state probe run 32505063770, job
 * 96843269238, 2026-08-21T16:51Z, against
 * /GB/en/cat/beauty/fragrance/?pn=1.
 *
 * Trimmed only of the fields this parser never reads — `altImageUrl`,
 * `alternateImageUrl`, `displayFlag`, `description`, `previewAttribute`,
 * `skus`, and the RSC back-references (`"$f:props:products:0:department"`)
 * the stream uses to avoid repeating a department object. `__typename`,
 * `department`, `division`, `ratingAndReviews` and `id` are kept exactly as
 * streamed: the first because the parser filters on it, the rest because a
 * fixture that quietly drops the fields around the ones being read stops
 * being a capture of what the shop actually sends.
 *
 * All three carry `markdownPrice: null` and `prevMarkdownPrice: null`, which
 * is the case this parser prices. No reduced record has been captured; see
 * the module header for why that gap is handled by declining to price rather
 * than by guessing which field a reduced record would use.
 */
const REAL_PRODUCTS = [
  {
    __typename: 'Product',
    name: 'Atelier des Fleurs Cedrus de Nuit Eau de Parfum 150ml',
    seoKey: 'chloe-atelier-des-fleurs-cedrus-de-nuit-eau-de-parfum-150ml_R04693967',
    brand: 'CHLOE',
    defaultImageUrl: '//images.selfridges.com/is/image/selfridges/R04693967_M',
    productId: 'R04693967',
    department: { __typename: 'Department', id: 207, name: 'Fashion Fragrance' },
    division: { __typename: 'Division', id: 1701, name: 'Health & Beauty' },
    lowestPrice: [
      {
        __typename: 'LowestPrice',
        currency: 'GBP',
        price: 231,
        markdownPrice: null,
        prevMarkdownPrice: null,
      },
    ],
    ratingAndReviews: {
      __typename: 'RatingAndReviews',
      rating: { __typename: 'Rating', score: 0, totalReviews: 0 },
    },
    id: '178ee7d0-29e7-4131-a8a8-2ac16f2fb045',
  },
  {
    __typename: 'Product',
    name: 'Atelier des Fleurs Cedrus de Nuit Eau de Parfum 50ml',
    seoKey: 'chloe-atelier-des-fleurs-cedrus-de-nuit-eau-de-parfum-50ml_R04693968',
    brand: 'CHLOE',
    defaultImageUrl: '//images.selfridges.com/is/image/selfridges/R04693968_M',
    productId: 'R04693968',
    lowestPrice: [
      {
        __typename: 'LowestPrice',
        currency: 'GBP',
        price: 115,
        markdownPrice: null,
        prevMarkdownPrice: null,
      },
    ],
    ratingAndReviews: {
      __typename: 'RatingAndReviews',
      rating: { __typename: 'Rating', score: 0, totalReviews: 0 },
    },
    id: '3fc45ac3-674e-4293-a453-ec6c0bb235a1',
  },
  {
    __typename: 'Product',
    name: 'Essence Elsewhere Essence Elsewhere 100ml',
    seoKey: 'amouage-essence-elsewhere-essence-elsewhere-100ml_R04676357',
    brand: 'AMOUAGE',
    defaultImageUrl: '//images.selfridges.com/is/image/selfridges/R04676357_M',
    productId: 'R04676357',
    department: { __typename: 'Department', id: 1334, name: 'Amouage' },
    lowestPrice: [
      {
        __typename: 'LowestPrice',
        currency: 'GBP',
        price: 375,
        markdownPrice: null,
        prevMarkdownPrice: null,
      },
    ],
    ratingAndReviews: {
      __typename: 'RatingAndReviews',
      rating: { __typename: 'Rating', score: 0, totalReviews: 0 },
    },
    id: '4b955d9a-e901-4439-b024-b5254445e2e8',
  },
];

const PAGE_URL = 'https://www.selfridges.com/GB/en/cat/beauty/fragrance/?pn=1';

/**
 * A page as Next.js streams one: the payload escaped into `__next_f` chunks,
 * split across two pushes so the reassembly is actually exercised rather than
 * assumed. The `b:props:facets` reference and the trailing prose are what
 * really sits either side of the array in the capture.
 */
function pageWith(products: unknown[], chunkSplit = true): string {
  const row =
    `b:{"props":{"facets":"$b:props:facets","products":${JSON.stringify(products)},` +
    `"totalProducts":${products.length}}}\n`;
  const escaped = JSON.stringify(row).slice(1, -1);
  const at = chunkSplit ? Math.floor(escaped.length / 2) : escaped.length;
  // Never split inside an escape sequence; the real stream never does either.
  const safe = escaped.lastIndexOf('\\', at) === at - 1 ? at - 1 : at;

  return (
    '<!doctype html><html><body><div id="_R_"></div>' +
    `<script>self.__next_f.push([1,"${escaped.slice(0, safe)}"])</script>` +
    `<script>self.__next_f.push([1,"${escaped.slice(safe)}"])</script>` +
    '</body></html>'
  );
}

describe('rscFlightStream', () => {
  it('concatenates the chunks the page pushes to itself', () => {
    const stream = rscFlightStream(pageWith(REAL_PRODUCTS));
    expect(stream).toContain('"products":[');
    expect(stream).toContain('R04693967');
  });

  it('is empty for a page that streams nothing', () => {
    expect(rscFlightStream('<html><body>plain</body></html>')).toBe('');
  });
});

describe('productArraysIn', () => {
  it('finds the typed Product objects', () => {
    const found = productArraysIn(rscFlightStream(pageWith(REAL_PRODUCTS)));
    expect(found).toHaveLength(3);
  });

  it('ignores a products array that is not of GraphQL Products', () => {
    // A page carries several `products` arrays — recommendation rails,
    // recently-viewed — and only the typed ones are this shop's grid.
    const stream = '{"products":[{"__typename":"Banner","name":"Shop fragrance"}]}';
    expect(productArraysIn(stream)).toEqual([]);
  });

  it('is not fooled by a bracket inside a product name', () => {
    const tricky = [{ ...REAL_PRODUCTS[0], name: 'Cedrus de Nuit [Refill] 150ml' }];
    const found = productArraysIn(`{"products":${JSON.stringify(tricky)}}`);
    expect(found).toHaveLength(1);
    expect((found[0] as { name?: string }).name).toBe('Cedrus de Nuit [Refill] 150ml');
  });

  it('skips an array that never closes rather than throwing', () => {
    expect(productArraysIn('{"products":[{"__typename":"Product","name":"cut off')).toEqual([]);
  });
});

describe('parseSelfridgesListings, against the captured records', () => {
  const listings = parseSelfridgesListings(pageWith(REAL_PRODUCTS), {
    sectionId: 'fragrance',
    pageUrl: PAGE_URL,
  });

  it('reads every product in the streamed grid', () => {
    expect(listings).toHaveLength(3);
    expect(listings.map((l) => l.retailerSku)).toEqual(['R04693967', 'R04693968', 'R04676357']);
  });

  it('prices each one from the figure the record states in sterling', () => {
    expect(listings.map((l) => l.priceGbp)).toEqual([231, 115, 375]);
  });

  it('builds the product URL the way the grid\'s own anchors do', () => {
    // Measured, not constructed: job 96845282753 printed these three exact
    // hrefs off the same page the records came from.
    expect(listings.map((l) => l.url)).toEqual([
      'https://www.selfridges.com/GB/en/product/chloe-atelier-des-fleurs-cedrus-de-nuit-eau-de-parfum-150ml_R04693967/',
      'https://www.selfridges.com/GB/en/product/chloe-atelier-des-fleurs-cedrus-de-nuit-eau-de-parfum-50ml_R04693968/',
      'https://www.selfridges.com/GB/en/product/amouage-essence-elsewhere-essence-elsewhere-100ml_R04676357/',
    ]);
  });

  it('carries the brand, the title and the resolved image', () => {
    expect(listings.map((l) => l.rawBrand)).toEqual(['CHLOE', 'CHLOE', 'AMOUAGE']);
    expect(listings[0]!.rawTitle).toBe('Atelier des Fleurs Cedrus de Nuit Eau de Parfum 150ml');
    expect(listings[0]!.imageUrl).toBe(
      'https://images.selfridges.com/is/image/selfridges/R04693967_M',
    );
  });

  it('reports stock as unknown, because this payload never states it', () => {
    // "inStock" and "availab" are both absent from all 459,936 characters of
    // the captured stream. Null means not published; it does not mean in stock.
    for (const l of listings) expect(l.inStock).toBeNull();
  });

  it('claims no ean, no was-price and no promotion end', () => {
    for (const l of listings) {
      expect(l.ean).toBeNull();
      expect(l.wasPriceGbp).toBeNull();
      expect(l.promoEndsAt).toBeNull();
    }
  });
});

describe('parseSelfridgesListings, shapes the capture did not contain', () => {
  it('will not price a record carrying a markdown whose meaning is unestablished', () => {
    const reduced = [
      {
        ...REAL_PRODUCTS[0],
        lowestPrice: [
          {
            __typename: 'LowestPrice',
            currency: 'GBP',
            price: 231,
            markdownPrice: 161.7,
            prevMarkdownPrice: null,
          },
        ],
      },
    ];
    const [listing] = parseSelfridgesListings(pageWith(reduced), {
      sectionId: 'fragrance',
      pageUrl: PAGE_URL,
    });
    // Still a listing — Selfridges demonstrably sells it — but not a price,
    // because 231 and 161.70 cannot both be what a customer pays today and
    // no captured record settles which field means which.
    expect(listing!.retailerSku).toBe('R04693967');
    expect(listing!.priceGbp).toBeNull();
  });

  it('will not price a record quoted in another currency', () => {
    const euros = [
      {
        ...REAL_PRODUCTS[0],
        lowestPrice: [
          { __typename: 'LowestPrice', currency: 'EUR', price: 231, markdownPrice: null },
        ],
      },
    ];
    expect(
      parseSelfridgesListings(pageWith(euros), { sectionId: 'fragrance', pageUrl: PAGE_URL })[0]!
        .priceGbp,
    ).toBeNull();
  });

  it('drops a record with no id, no name or no seoKey', () => {
    const broken = [
      { ...REAL_PRODUCTS[0], productId: undefined },
      { ...REAL_PRODUCTS[1], name: '' },
      { ...REAL_PRODUCTS[2], seoKey: undefined },
    ];
    expect(
      parseSelfridgesListings(pageWith(broken), { sectionId: 'fragrance', pageUrl: PAGE_URL }),
    ).toEqual([]);
  });

  it('counts a product streamed twice once', () => {
    const page = pageWith([REAL_PRODUCTS[0], REAL_PRODUCTS[0]]);
    expect(
      parseSelfridgesListings(page, { sectionId: 'fragrance', pageUrl: PAGE_URL }),
    ).toHaveLength(1);
  });

  it('is empty, not thrown, for a page with no stream at all', () => {
    expect(
      parseSelfridgesListings('<html></html>', { sectionId: 'fragrance', pageUrl: PAGE_URL }),
    ).toEqual([]);
  });
});

describe('renderedState registry, Selfridges', () => {
  it('routes Selfridges to the RSC reader', () => {
    expect(hasRenderedStateParser('selfridges')).toBe(true);
    const listings = parseRenderedState('selfridges', pageWith(REAL_PRODUCTS), {
      sectionId: 'fragrance',
      pageUrl: PAGE_URL,
    });
    expect(listings.map((l) => l.priceGbp)).toEqual([231, 115, 375]);
  });
});

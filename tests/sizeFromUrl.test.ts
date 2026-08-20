import { describe, it, expect } from 'vitest';
import { slugOf, sizeMlFromUrl, titleWithSizeFromUrl } from '../src/catalogue/sizeFromUrl.js';
import { isFragrance } from '../src/catalogue/fragranceId.js';
import type { StoredListing } from '../src/catalogue/types.js';

describe('slugOf', () => {
  it('is the last path segment, lowercased', () => {
    expect(slugOf('https://uk.zimayaperfumes.com/products/Al-Kaser-100ml')).toBe('al-kaser-100ml');
  });

  it('ignores a trailing slash and a query string', () => {
    expect(slugOf('https://x.test/products/ghayath-100ml/?variant=7')).toBe('ghayath-100ml');
  });

  it('is null for something that is not a URL', () => {
    expect(slugOf('not a url')).toBeNull();
  });
});

describe('sizeMlFromUrl', () => {
  // The real Zimaya URLs, from data/catalogue/zimaya.json.
  it('reads the size a shop states in its own product URL', () => {
    expect(sizeMlFromUrl('https://uk.zimayaperfumes.com/products/al-kaser-100ml')).toBe(100);
    expect(sizeMlFromUrl('https://uk.zimayaperfumes.com/products/itqan-gold-edp-100ml')).toBe(100);
    expect(sizeMlFromUrl('https://uk.zimayaperfumes.com/products/infrad-noir-100ml-edp')).toBe(100);
    expect(sizeMlFromUrl('https://uk.zimayaperfumes.com/products/abadi-saga-pour-homme-edp-100ml')).toBe(100);
  });

  it('reads a separated size too', () => {
    expect(sizeMlFromUrl('https://x.test/products/thing-50-ml')).toBe(50);
    expect(sizeMlFromUrl('https://x.test/products/thing-7-5ml')).toBe(8);
  });

  it('is null when the URL states no size', () => {
    expect(sizeMlFromUrl('https://uk.zimayaperfumes.com/products/ghali-imperial')).toBeNull();
    expect(sizeMlFromUrl('https://uk.zimayaperfumes.com/products/ode-to-rose-royale')).toBeNull();
  });

  it('refuses a slug naming two sizes, which is a set or an ambiguity', () => {
    expect(sizeMlFromUrl('https://x.test/products/gift-set-100ml-and-50ml')).toBeNull();
    expect(sizeMlFromUrl('https://x.test/products/discovery-3x10ml')).toBeNull();
  });

  it('refuses a number that could not be a bottle', () => {
    expect(sizeMlFromUrl('https://x.test/products/thing-0ml')).toBeNull();
    expect(sizeMlFromUrl('https://x.test/products/thing-5000ml')).toBeNull();
  });

  it('does not read "ml" out of the middle of a word', () => {
    expect(sizeMlFromUrl('https://x.test/products/sku-100mlx')).toBeNull();
    expect(sizeMlFromUrl('https://x.test/products/12mlada')).toBeNull();
  });
});

describe('titleWithSizeFromUrl', () => {
  it('appends the size a bare Zimaya title omits', () => {
    expect(
      titleWithSizeFromUrl('Al Kaser', 'https://uk.zimayaperfumes.com/products/al-kaser-100ml'),
    ).toBe('Al Kaser 100ml');
  });

  it('leaves a title that already states a size exactly alone', () => {
    expect(
      titleWithSizeFromUrl('Al Kaser EDP 50ml', 'https://uk.zimayaperfumes.com/products/al-kaser-100ml'),
    ).toBe('Al Kaser EDP 50ml');
  });

  it('leaves a title stating an ounce size alone: the title still wins', () => {
    expect(titleWithSizeFromUrl('Some Scent 3.4 fl oz', 'https://x.test/products/some-scent-100ml'))
      .toBe('Some Scent 3.4 fl oz');
  });

  it('leaves a title alone when the URL states nothing', () => {
    expect(
      titleWithSizeFromUrl('Ghali Imperial', 'https://uk.zimayaperfumes.com/products/ghali-imperial'),
    ).toBe('Ghali Imperial');
  });

  it('leaves a title alone when the URL is unparseable', () => {
    expect(titleWithSizeFromUrl('Ghali Imperial', '')).toBe('Ghali Imperial');
  });
});

/**
 * The end this exists for: a Zimaya listing that `isFragrance` rejected only
 * because nothing had read the size out of the URL the shop itself published.
 */
const listing = (rawTitle: string, url: string): StoredListing => ({
  retailerId: 'zimaya',
  retailerSku: '1337',
  url,
  rawTitle,
  rawBrand: 'Zimaya',
  ean: null,
  imageUrl: null,
  priceGbp: 35,
  wasPriceGbp: null,
  promoEndsAt: null,
  inStock: true,
  sectionId: 'shopify-products-json',
  description: null,
  nativePrice: null,
  firstSeenAt: '2026-08-19T00:00:00.000Z',
  lastSeenAt: '2026-08-20T00:00:00.000Z',
  status: 'active',
  delistedAt: null,
  relistedAt: null,
  eligibleForNewBadge: false,
  variantId: null,
});

describe('what the recovery actually unblocks', () => {
  const url = 'https://uk.zimayaperfumes.com/products/al-kaser-100ml';

  it('was rejected for having no size, and is admitted once the URL is read', () => {
    expect(isFragrance(listing('Al Kaser', url))).toBe(false);
    expect(isFragrance(listing(titleWithSizeFromUrl('Al Kaser', url), url))).toBe(true);
  });

  it('still rejects the ones whose URL states no size either — no size is invented', () => {
    const bare = 'https://uk.zimayaperfumes.com/products/ghali-imperial';
    expect(isFragrance(listing(titleWithSizeFromUrl('Ghali Imperial', bare), bare))).toBe(false);
  });
});

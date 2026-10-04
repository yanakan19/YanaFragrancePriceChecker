import { describe, expect, it } from 'vitest';
import { isFragrance, productTypeStatesEauDeParfum } from '../src/catalogue/fragranceId.js';
import { concentrationOfStoredListing } from '../src/catalogue/productName.js';
import { RETAILERS } from '../src/config/retailers.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * Beauty Pie's "Fragrance" type is read as Eau de Parfum, for Beauty Pie only.
 *
 * Stored examples: titles, product types and prices are copies of
 * data/catalogue/beauty-pie.json as harvested on 2026-10-04.
 */
function stored(retailerId: string, rawTitle: string, productType: string | null, priceGbp = 59): StoredListing {
  return {
    retailerSku: rawTitle,
    url: `https://beautypie.com/products/${encodeURIComponent(rawTitle)}`,
    rawTitle,
    rawBrand: 'Beauty Pie',
    ean: null,
    imageUrl: null,
    priceGbp,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'shopify-products-json',
    description: null,
    productType,
    nativePrice: null,
    retailerId,
    firstSeenAt: '2026-10-03T00:00:00Z',
    lastSeenAt: '2026-10-04T00:00:00Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
  } as StoredListing;
}

// The 12 perfumes Beauty Pie types Fragrance on 2026-10-04: 11 name Eau De Parfum, Le Smash Santal names none.
const TYPED_FRAGRANCE = [
  'Une Balade En Forêt Eau De Parfum 50ml',
  'Orange Absolute Intense Eau De Parfum 50ml',
  'She Brought Peonies Eau De Parfum 50ml',
  'Orris Florentina Eau De Parfum 50ml',
  'Love The Remix Eau De Parfum 50ml',
  'La Flâneuse Eau De Parfum 50ml',
  'Figuier De Dalmatie Eau De Parfum 50ml',
  'Flower Drench Eau De Parfum 50ml',
  'Hyper Beach Eau De Parfum 50ml',
  'La Botanista 001 Eau De Parfum 50ml',
  'Brazilian Lime, Fig Leaves & Tea Eau De Parfum 50ml',
];
const LE_SMASH = stored('beauty-pie', 'Le Smash Santal 50ml', 'Fragrance');

describe('Beauty Pie Le Smash Santal', () => {
  it('is the only perfume it types Fragrance that names no strength: every other one says Eau De Parfum', () => {
    for (const title of TYPED_FRAGRANCE) {
      expect(concentrationOfStoredListing(stored('beauty-pie', title, 'Fragrance')), title).toBe('Eau de Parfum');
      expect(/eau de parfum/i.test(title), title).toBe(true);
    }
  });

  it('is shown, as Eau de Parfum, now that the shop\'s own type settles the strength', () => {
    expect(isFragrance(LE_SMASH)).toBe(true);
    expect(concentrationOfStoredListing(LE_SMASH)).toBe('Eau de Parfum');
  });

  it('is the registry\'s statement for Beauty Pie and for no other shop', () => {
    expect(RETAILERS.filter((r) => r.fragranceTypeIsEauDeParfum).map((r) => r.id)).toEqual(['beauty-pie']);
  });

  it('does not touch another shop that types a perfume Fragrance', () => {
    const other = stored('escentual', 'Le Smash Santal 50ml', 'Fragrance');
    expect(productTypeStatesEauDeParfum(other)).toBe(false);
    expect(isFragrance(other)).toBe(false);
  });

  it('does not make anything else Beauty Pie sells a perfume', () => {
    for (const [title, type] of [
      ['Le Smash Santal Shimmering Body Moisture Crème', 'Bodycare'],
      ['Midnight Cashmere Luxury Scented Candle', 'HomeFragrance'],
      ['Youthbomb Mega Kit', 'Skincare'],
    ] as const) {
      expect(isFragrance(stored('beauty-pie', title, type, 35)), title).toBe(false);
    }
    // Typed Fragrance but sizeless: still no bottle.
    expect(isFragrance(stored('beauty-pie', 'Le Smash Santal', 'Fragrance'))).toBe(false);
  });

  it('keeps a strength the title names, whatever the type says', () => {
    const edt = stored('beauty-pie', 'Some Scent Eau De Toilette 50ml', 'Fragrance');
    expect(concentrationOfStoredListing(edt)).toBe('Eau de Toilette');
  });
});

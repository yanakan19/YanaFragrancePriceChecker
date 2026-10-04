import { describe, expect, it } from 'vitest';
import { isCatalogueListing, isFragrance } from '../src/catalogue/fragranceId.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * A listing the shop itself types "Refill" is out, the same as one whose title
 * says so.
 *
 * Stored examples: the Escentric Molecules and Nicchia rows are copies of
 * data/catalogue/escentric-molecules.json and nicchia-luxury-uk.json as
 * harvested on 2026-10-04.
 */
function stored(retailerId: string, rawTitle: string, productType: string | null, priceGbp: number, url: string): StoredListing {
  return {
    retailerSku: rawTitle,
    url,
    rawTitle,
    rawBrand: 'Escentric Molecules',
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
    firstSeenAt: '2026-08-11T00:00:00Z',
    lastSeenAt: '2026-10-04T00:00:00Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
  } as StoredListing;
}

const ESC = 'https://escentric.com/products/';
// The 11 listings Escentric types Refill whose title does not say so.
const UNTITLED_REFILLS: [string, number, string][] = [
  ['Molecule 01 30ml', 60, 'molecule-01-30ml-refill'],
  ['Molecule 02 30ml', 60, 'molecule-02-30ml-refill'],
  ['Molecule 03 30ml', 60, 'molecule-03-30ml-refill'],
  ['Molecule 04 30ml', 60, 'molecule-04-30ml-refill'],
  ['Molecule 05 30ml', 60, 'molecule-05-refill-30ml'],
  ['Escentric 01 30ml', 65, 'escentric-01-30ml-refill'],
  ['Escentric 02 30ml', 65, 'escentric-02-30ml-refill'],
  ['Escentric 03 30ml', 65, 'escentric-03-30ml-refill'],
  ['Escentric 04 30ml', 65, 'escentric-04-30ml-refill'],
  ['Escentric 05 30ml', 65, 'escentric-05-refill-30ml'],
  ['Molecule 01 + Iris 30ml', 70, 'molecule-01-iris'],
];

describe('a listing the shop types Refill', () => {
  it('is out of the catalogue even when its title says nothing of a refill', () => {
    for (const [title, price, slug] of UNTITLED_REFILLS) {
      const l = stored('escentric-molecules', title, 'Refill', price, ESC + slug);
      expect(isFragrance(l), title).toBe(false);
      expect(isCatalogueListing(l), title).toBe(false);
    }
  });

  it('is out when the title says so as well, as it always was', () => {
    const l = stored('escentric-molecules', 'Molecule 01 ATOM.ISER Refill 3 x 8.5ml', 'Refill', 40, ESC + 'molecule-01-atom-iser-refill');
    expect(isFragrance(l)).toBe(false);
  });

  it('leaves the same shop\'s own plain bottles and cased bottles in', () => {
    for (const [title, type, price] of [
      ['Molecule 01 100ml', 'Fragrance', 125],
      ['Molecule 01 Portable 30ml', 'Portable', 60],
      ['Escentric 01 Portable 30ml', 'Portable', 65],
    ] as const) {
      const l = stored('escentric-molecules', title, type, price, ESC + 'x');
      expect(isFragrance(l), title).toBe(true);
    }
  });

  it('leaves Nicchia\'s plain 30ml bottle in, and its titled refill out', () => {
    expect(isFragrance(stored('nicchia-luxury-uk', 'Molecule 01 Eau de Toilette 30 ml', 'Eau de Toilette', 92, 'https://n/1'))).toBe(true);
    expect(isFragrance(stored('nicchia-luxury-uk', 'Molecule 01 Eau de Toilette 30 ml Refill', 'Eau de Toilette', 66, 'https://n/2'))).toBe(false);
  });

  it('matches the word Refill only, not a product type that merely contains the letters', () => {
    const l = stored('escentric-molecules', 'Molecule 01 100ml', 'Refillable Fragrance', 125, ESC + 'x');
    expect(isFragrance(l)).toBe(true);
  });
});

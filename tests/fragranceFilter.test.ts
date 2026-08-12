import { describe, expect, it } from 'vitest';
import { isFragrance } from '../src/catalogue/fragranceId.js';
import { RETAILERS, getRetailer } from '../src/config/retailers.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * The concentration test and its one exception.
 *
 * `isFragrance` requires a title to name a concentration — "eau de parfum",
 * "EDP", "cologne". That test is what keeps a broad beauty retailer's
 * skincare out of a fragrance comparison, and these tests exist to stop it
 * being loosened site-wide by someone fixing the symptom below.
 *
 * The symptom: a single fragrance house names products after itself, never
 * after a concentration, so its entire catalogue failed. Escentric Molecules
 * reached the app with 2 of its 118 listings. The fix is a per-shop opt-in
 * (`fragranceOnlyCatalogue`), not a weaker regex.
 */

function listing(retailerId: string, rawTitle: string, priceGbp: number | null = 95): StoredListing {
  return {
    retailerId,
    retailerSku: 'sku-1',
    url: 'https://shop.example/p/1',
    rawTitle,
    rawBrand: null,
    ean: null,
    imageUrl: null,
    priceGbp,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'fragrance',
    firstSeenAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-08-12T00:00:00.000Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
  };
}

describe('isFragrance: the concentration requirement', () => {
  it('keeps a titled concentration at an ordinary multi-brand shop', () => {
    expect(isFragrance(listing('escentual', 'Chanel Bleu de Chanel Eau de Parfum 100ml'))).toBe(true);
  });

  // The reason the requirement exists at all. These are real titles from
  // Escentual's own harvested catalogue, where 4,173 listings fail this test —
  // serums, brushes and shampoo, correctly kept out of a fragrance comparison.
  it.each([
    'Lancome Absolue Longevity MD Reset The Serum 30ml',
    'Nuxe Nuxuriance Ultra The Global Anti-Aging Rich Cream 50ml',
    'NIOD Copper Amino Isolate Lipid 1% 15ml',
    'Elemis Pro-Collagen Toning Mist 150ml',
  ])('rejects non-fragrance without a concentration word: %s', (title) => {
    expect(isFragrance(listing('escentual', title))).toBe(false);
  });
});

describe('isFragrance: fragranceOnlyCatalogue shops', () => {
  // The 44 listings this recovers are single bottles priced £60-£220.
  it.each([
    'Escentric 01 200ml',
    'Molecule 01 100ml',
    'Molecule 01 + Clary Sage 100ml',
    'Escentric 05 Portable 30ml',
  ])('accepts a real fragrance with no concentration word: %s', (title) => {
    expect(isFragrance(listing('escentric-molecules', title))).toBe(true);
  });

  // Multi-item sets must still be rejected. sizeMl reads the first size it
  // finds, so admitting "Set 3 x 8.5ml" at £80 would publish it as a single
  // 8.5ml bottle at £80 — the most overpriced thing on the site, and untrue.
  it.each([
    'Molecule 01 ATOM.iser. Set 3 x 8.5ml, 1 x ATOM.iser',
    'M+ Patchouli ATOM.iser. Set 3 x 8.5ml, 1 x ATOM.iser',
    'Molecule 01 8.5ml + Escentric 01 8.5ml',
  ])('still rejects a multi-item set: %s', (title) => {
    expect(isFragrance(listing('escentric-molecules', title))).toBe(false);
  });

  it('does not relax the requirement for shops without the flag', () => {
    // Byte-identical title, different shop: the exemption is per-shop, so an
    // ordinary retailer gets the concentration test exactly as before.
    expect(isFragrance(listing('escentric-molecules', 'Escentric 01 200ml'))).toBe(true);
    expect(isFragrance(listing('escentual', 'Escentric 01 200ml'))).toBe(false);
  });

  it('still applies the non-fragrance and price rules to an exempt shop', () => {
    // The exemption drops one test, not all of them.
    expect(isFragrance(listing('escentric-molecules', 'Molecule 01 Body Wash 100ml'))).toBe(false);
    expect(isFragrance(listing('escentric-molecules', 'Molecule 01 100ml', null))).toBe(false);
    expect(isFragrance(listing('escentric-molecules', 'Molecule 01 100ml', 0))).toBe(false);
    expect(isFragrance(listing('escentric-molecules', 'Molecule 01'))).toBe(false);
  });
});

describe('fragranceOnlyCatalogue is opt-in and deliberately narrow', () => {
  it('is set on exactly the shops a human has vouched for', () => {
    const flagged = RETAILERS.filter((r) => r.fragranceOnlyCatalogue).map((r) => r.id).sort();
    expect(flagged).toEqual(['escentric-molecules']);
  });

  // The trap this guards. LUSH and Bath & Body Works are also single-brand,
  // and their tiers are indistinguishable from Escentric Molecules', so
  // nothing about a registry entry's shape can be used to infer the flag.
  // They sell bath and body products, where the concentration test is exactly
  // what keeps soap out of the comparison.
  it('is not implied by singleBrandOnly', () => {
    for (const id of ['lush', 'bath-body-works-uk']) {
      const r = getRetailer(id);
      expect(r?.singleBrandOnly, `${id} should still be single-brand`).toBeTruthy();
      expect(r?.fragranceOnlyCatalogue, `${id} must not be exempt`).toBeFalsy();
    }
  });

  it('is not inferable from tiers', () => {
    // Both 'niche'. If anyone ever tries to derive the flag from tiers, this
    // is the pair that makes it impossible.
    expect(getRetailer('lush')?.tiers).toEqual(getRetailer('escentric-molecules')?.tiers);
  });
});

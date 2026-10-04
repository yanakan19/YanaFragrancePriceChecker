import { describe, expect, it } from 'vitest';
import { fragranceId, isCatalogueListing, isFragrance, isSingleTravelSpray, sizeMl } from '../src/catalogue/fragranceId.js';
import { isGiftSet } from '../src/catalogue/giftSet.js';
import { concentrationOfListing, displayName } from '../src/catalogue/productName.js';
import { findDuplicateGroups, matchKey, type MatchableProduct } from '../src/catalogue/productMatch.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * Single travel sprays at shops other than Kayali: in, as their own size, and
 * apart from the plain bottle of that size.
 *
 * Stored examples, not live values: every title, barcode and shop below is a
 * copy of what data/catalogue/<shop>.json held on 2026-10-04.
 */
function stored(retailerId: string, rawTitle: string, rawBrand: string, over: Partial<StoredListing> = {}): StoredListing {
  return {
    retailerSku: rawTitle,
    url: `https://example.com/${encodeURIComponent(rawTitle)}`,
    rawTitle,
    rawBrand,
    ean: null,
    imageUrl: null,
    priceGbp: 24,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'x',
    description: null,
    productType: null,
    nativePrice: null,
    retailerId,
    firstSeenAt: '2026-09-22T00:00:00Z',
    lastSeenAt: '2026-10-04T00:00:00Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
    ...over,
  } as StoredListing;
}

/** The product this listing would be, built the way scripts/build-demo-catalogue.ts builds one. */
function product(l: StoredListing, brand: string): MatchableProduct {
  return {
    id: fragranceId(l),
    brand,
    name: displayName(l.rawTitle, l.rawBrand, brand, false),
    concentration: concentrationOfListing(l.rawTitle, l.description ?? null),
    sizeMl: sizeMl(l.rawTitle, l.description),
    ean: l.ean,
  };
}

// Nina Ricci L'Air du Temps Eau de Toilette 30ml: the bottle (EAN 3137370207030) at three shops and the
// travel spray (EAN 3137370072744) at Perfume Click, the case that broke the first global attempt.
const NR_BOTTLE = (shop: string, title: string, ean: string | null) => stored(shop, title, 'Nina Ricci', { ean, priceGbp: 25 });
const NR_BOTTLES = [
  NR_BOTTLE('perfume-click', "Nina Ricci L'air Du Temps Eau de Toilette 30ml Spray", '3137370207030'),
  NR_BOTTLE('escentual', "Nina Ricci L'Air du Temps Eau de Toilette 30ml", '3137370207030'),
  NR_BOTTLE('mybeauty-boutique', "Nina Ricci L'Air du Temps Eau de Toilette Spray 30ml", null),
  NR_BOTTLE('the-beauty-store-uk', "Nina Ricci L'Air Du Temps Eau de Toilette 30ml", null),
];
const NR_TRAVEL = stored('perfume-click', "Nina Ricci L'air Du Temps Eau de Toilette 30ml Travel Spray", 'Nina Ricci', {
  ean: '3137370072744',
  priceGbp: 21.85,
});

describe('which titles are a single travel spray', () => {
  it('admits one bottle with one size and its own words, wherever the label sits', () => {
    for (const t of [
      'Ormonde Jayne Verano Eau de Parfum Travel Spray 10ml',
      'Versace Eros Flame Eau de Parfum Travel Spray 10ml',
      "Nina Ricci L'air Du Temps Eau de Toilette 30ml Travel Spray",
      'Calvin Klein Euphoria Men Eau De Toilette Travel Spray (20ml)',
      'Salvatore Ferragamo Ferragamo Travel Spray Eau de Toilette 30ml',
      'Good Morning Midnight Parfum Travel Spray 15ml',
    ]) {
      expect(isSingleTravelSpray(t), t).toBe(true);
    }
  });

  it('refuses a set, and a travel spray named as one component of something else', () => {
    for (const t of [
      'Maradona Legend Eau De Parfum 50ml & Travel Spray 20ml & Body Wash 100ml Gift Set',
      'YSL Black Opium Eau De Parfum 50ml & Travel Spray 10ml & Mascara Gift Set',
      "Paco Rabanne 1 Million Eau de Toilette Men's Aftershave Spray (50ml) & Travel Spray (10ml)",
      'Giorgio Armani Code Pour Homme 75ml EDP + 15ml Travel Spray Gift Set',
      'Missguided Real Babe Gift Set 80ml Eau de Parfum + 10ml Eau De Parfum Travel Spray',
      'Montblanc Explorer Eau De Parfum 100ml with Travel Spray 15ml',
    ]) {
      expect(isSingleTravelSpray(t), t).toBe(false);
    }
  });

  it('refuses a travel spray that states no size of its own, or two sizes', () => {
    expect(isSingleTravelSpray('TOCCA Lucia Eau de Parfum Travel Spray')).toBe(false);
    expect(isSingleTravelSpray('Eau de Parfum 100ml Travel Spray 10ml')).toBe(false);
  });

  it('is a plain bottle for a title with no travel spray at all', () => {
    expect(isSingleTravelSpray('Versace Eros Eau de Toilette 100ml')).toBe(false);
  });
});

describe('admitting them', () => {
  const ADMITTED: [string, string, string][] = [
    ['escentual', 'Ormonde Jayne Verano Eau de Parfum Travel Spray 10ml', 'Ormonde Jayne'],
    ['escentual', 'Versace Eros Eau de Toilette Travel Spray 10ml', 'Versace'],
    ['marks-and-spencer', 'Aramis Intuition Eau de Parfum Travel Spray 10ml', 'Aramis'],
    ['mybeauty-boutique', 'Calvin Klein Euphoria Eau de Toilette 20ml Travel Spray', 'Calvin Klein'],
    ['perfume-click', "Nina Ricci L'air Du Temps Eau de Toilette 30ml Travel Spray", 'Nina Ricci'],
    ['selfridges', 'Good Morning Midnight Parfum Travel Spray 15ml', 'Bottega Veneta'],
    ['the-beauty-store-uk', 'Salvatore Ferragamo Ferragamo Travel Spray Eau de Toilette 30ml', 'Salvatore Ferragamo'],
  ];

  it('keeps each of them as a fragrance with its own size', () => {
    for (const [shop, title, brand] of ADMITTED) {
      const l = stored(shop, title, brand);
      expect(isFragrance(l), title).toBe(true);
      expect(isCatalogueListing(l), title).toBe(true);
      expect(sizeMl(title, null), title).not.toBeNull();
      expect(isGiftSet(l), title).toBe(false);
    }
  });

  it('still keeps out every set, every refill and every travel spray without a size', () => {
    for (const [shop, title] of [
      ['beautybase', 'YSL Libre Eau De Parfum 90ml & Travel Spray 10ml & Lipstick Gift Set'],
      ['beautybase', 'Viktor & Rolf Flowerbomb Eau De Parfum 10ml Travel Spray Refill'],
      ['john-lewis', 'TOCCA Lucia Eau de Parfum Travel Spray'],
      ['perfume-direct', "Paco Rabanne 1 Million Eau de Toilette Men's Aftershave Spray (50ml) & Travel Spray (10ml)"],
      ['the-beauty-store-uk', 'Travalo Classic Refillable Perfume Spray 5ml Travel Spray'],
    ] as const) {
      expect(isCatalogueListing(stored(shop, title, 'X')), title).toBe(false);
    }
  });

  it('names the product with Travel Spray on the end, and no hyphen', () => {
    expect(displayName('Versace Eros Eau de Toilette Travel Spray 10ml', 'Versace', 'Versace')).toBe('Eros Travel Spray');
    expect(displayName('Ormonde Jayne Verano Eau de Parfum Travel Spray 10ml', 'Ormonde Jayne', 'Ormonde Jayne')).toBe('Verano Travel Spray');
    expect(displayName('Calvin Klein Euphoria Men Eau De Toilette Travel Spray (20ml)', 'Calvin Klein', 'Calvin Klein')).toBe('Euphoria Men Travel Spray');
    expect(displayName('Salvatore Ferragamo Ferragamo Travel Spray Eau de Toilette 30ml', 'Salvatore Ferragamo', 'Salvatore Ferragamo')).toBe('Ferragamo Travel Spray');
  });

  it('gives two shops\' travel sprays of one perfume one name, so they meet', () => {
    const a = product(stored('escentual', 'Versace Eros Eau de Toilette Travel Spray 10ml', 'Versace'), 'Versace');
    const b = product(stored('the-beauty-store-uk', 'Versace Eros Eau de Toilette 10ml Travel Spray', 'Versace'), 'Versace');
    expect(matchKey(a)).toBe(matchKey(b));
    expect(findDuplicateGroups([a, b])).toHaveLength(1);
  });

  it('keeps a travel spray apart from the plain bottle of the same size, with no barcodes to help', () => {
    const bottle = product(stored('escentual', 'Versace Eros Eau de Toilette 10ml', 'Versace'), 'Versace');
    const travel = product(stored('escentual', 'Versace Eros Eau de Toilette Travel Spray 10ml', 'Versace'), 'Versace');
    expect(bottle.sizeMl).toBe(travel.sizeMl);
    expect(matchKey(bottle)).not.toBe(matchKey(travel));
    expect(findDuplicateGroups([bottle, travel])).toEqual([]);
  });
});

describe("Nina Ricci L'Air du Temps 30ml stays merged", () => {
  const bottles = NR_BOTTLES.map((l) => product(l, 'Nina Ricci'));
  const travel = product(NR_TRAVEL, 'Nina Ricci');

  it('gives the bottle one identity at every shop, and the travel spray another', () => {
    expect(new Set(bottles.map((p) => matchKey(p))).size).toBe(1);
    expect(travel.name).toBe("L'air Du Temps Travel Spray");
    expect(matchKey(travel)).not.toBe(matchKey(bottles[0]!));
    expect(bottles.every((p) => p.sizeMl === 30)).toBe(true);
    expect(travel.sizeMl).toBe(30);
  });

  it('still merges the four shops\' bottles when the travel spray, with its other barcode, is in the build', () => {
    const groups = findDuplicateGroups([...bottles, travel]);
    expect(groups).toHaveLength(1);
    const merged = [groups[0]!.canonical, ...groups[0]!.absorbed];
    expect(merged.map((p) => p.id).sort()).toEqual(bottles.map((p) => p.id).sort());
    expect(merged.map((p) => p.id)).not.toContain(travel.id);
  });

  it('would have split them if the words had been read as a size label for every shop', () => {
    // What the first attempt did, as a control: same name as the bottle, other barcode.
    const asSizeLabel = { ...travel, name: bottles[0]!.name };
    expect(findDuplicateGroups([...bottles, asSizeLabel])).toEqual([]);
  });
});

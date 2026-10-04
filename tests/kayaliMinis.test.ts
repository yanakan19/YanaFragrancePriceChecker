import { describe, it, expect } from 'vitest';
import {
  fragranceId,
  isCatalogueListing,
  isFragrance,
  sizeMl,
  stripSizeLabel,
  travelSizeIsASize,
} from '../src/catalogue/fragranceId.js';
import { giftSetId, isGiftSet } from '../src/catalogue/giftSet.js';
import { concentrationOfListing, displayName } from '../src/catalogue/productName.js';
import { findDuplicateGroups, matchKey, type MatchableProduct } from '../src/catalogue/productMatch.js';
import { titleWithPageStrength } from '../src/catalogue/productPageStrength.js';
import { RETAILERS, getRetailer } from '../src/config/retailers.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * Minis group by size, and a set of minis is a gift set.
 *
 * Stored examples, not live values: the Kayali rows are copies of
 * data/catalogue/kayali.json as harvested on 2026-10-03 (titles as the feed
 * gives them, before a page's strength is read in), and the Selfridges row is
 * data/catalogue/selfridges.json's own "Eden Sweet Peach 35 Eau de Parfum
 * 10ml". Each case says what it is checking against.
 */
function stored(retailerId: string, over: Partial<StoredListing>): StoredListing {
  return {
    retailerSku: 'x',
    url: 'https://uk.kayali.com/products/eden-sweet-peach-35',
    rawTitle: '',
    rawBrand: 'KAYALI',
    ean: null,
    imageUrl: null,
    priceGbp: 80,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'shopify-products-json',
    description: null,
    productType: 'Fragrances',
    nativePrice: null,
    retailerId,
    firstSeenAt: '2026-09-22T00:00:00Z',
    lastSeenAt: '2026-10-03T00:00:00Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
    ...over,
  } as StoredListing;
}

const kayali = (sku: string, rawTitle: string, priceGbp: number, over: Partial<StoredListing> = {}) =>
  stored('kayali', { retailerSku: sku, rawTitle, priceGbp, ...over });

/** Eden Sweet Peach | 35, every size Kayali lists it in, as the feed titled them. */
const EDEN = {
  l100: kayali('KY00452', 'Eden Sweet Peach | 35 100ml', 110),
  l50: kayali('KY00451', 'Eden Sweet Peach | 35 50ml', 80),
  mini: kayali('KY00450', 'Eden Sweet Peach | 35 10ml Miniature', 28),
  travel: kayali('KY00453', 'Eden Sweet Peach | 35 10ml Travel Spray', 22),
  vial: kayali('KY00454', 'Eden Sweet Peach | 35 1.5ml', 3),
};

/** The page states "Eau de Parfum"; the title as the harvest now stores it. */
const withStrength = (l: StoredListing, strength = 'Eau de Parfum'): StoredListing => ({
  ...l,
  rawTitle: titleWithPageStrength(l.rawTitle, strength),
});

const SELFRIDGES_MINI = stored('selfridges', {
  retailerSku: 'R04619979',
  url: 'https://www.selfridges.com/GB/en/product/kayali-eden-sweet-peach-35-eau-de-parfum-10ml_R04619979/',
  rawTitle: 'Eden Sweet Peach 35 Eau de Parfum 10ml',
  priceGbp: 28,
  productType: null,
});

/** The product this listing would be, built as scripts/build-demo-catalogue.ts builds it. */
function product(l: StoredListing): MatchableProduct {
  const brand = 'Kayali';
  const name = displayName(l.rawTitle, l.rawBrand, brand, travelSizeIsASize(l.retailerId));
  return {
    id: fragranceId(l),
    brand,
    name,
    concentration: concentrationOfListing(l.rawTitle, l.description ?? null),
    sizeMl: sizeMl(l.rawTitle, l.description),
    ean: null,
  };
}

describe('a size label is the shop naming the size, not part of the perfume\'s name', () => {
  it('gives every size of a Kayali perfume one name, so the sizes are one perfume\'s sizes', () => {
    const names = Object.values(EDEN).map((l) => product(l).name);
    expect(new Set(names)).toEqual(new Set(['Eden Sweet Peach | 35']));
    expect(Object.values(EDEN).map((l) => product(l).sizeMl)).toEqual([100, 50, 10, 10, 1.5]);
  });

  it('with the strength from the page, every size also shares one strength', () => {
    const products = Object.values(EDEN).map((l) => product(withStrength(l)));
    expect(new Set(products.map((p) => p.concentration))).toEqual(new Set(['Eau de Parfum']));
    expect(new Set(products.map((p) => p.name))).toEqual(new Set(['Eden Sweet Peach | 35']));
  });

  it('does not make the mini the full size: the size is part of what has to match', () => {
    const [full, mini] = [product(withStrength(EDEN.l50)), product(withStrength(EDEN.mini))];
    expect(matchKey(full)).not.toBe(matchKey(mini));
    expect(findDuplicateGroups([full, mini])).toEqual([]);
    const all = Object.values(EDEN).filter((l) => l !== EDEN.travel).map((l) => product(withStrength(l)));
    expect(findDuplicateGroups(all)).toEqual([]);
  });

  it('meets another shop\'s mini of the same perfume at the same size, and only that one', () => {
    const kayaliMini = product(withStrength(EDEN.mini));
    const selfridgesMini = product(SELFRIDGES_MINI);
    expect(selfridgesMini).toMatchObject({ name: 'Eden Sweet Peach 35', concentration: 'Eau de Parfum', sizeMl: 10 });
    expect(matchKey(kayaliMini)).toBe(matchKey(selfridgesMini));

    const groups = findDuplicateGroups([product(withStrength(EDEN.l50)), kayaliMini, selfridgesMini, product(withStrength(EDEN.vial))]);
    expect(groups).toHaveLength(1);
    expect([groups[0]!.canonical.id, ...groups[0]!.absorbed.map((a) => a.id)].sort()).toEqual(
      [kayaliMini.id, selfridgesMini.id].sort(),
    );
  });

  it('meets another shop\'s mini even when Kayali\'s page states no strength: "Not stated" bridges to the one stated strength', () => {
    const groups = findDuplicateGroups([product(EDEN.mini), product(SELFRIDGES_MINI)]);
    expect(groups).toHaveLength(1);
  });

  it('puts the Kayali travel spray with the miniature as a second 10ml of the same perfume, not as the full size', () => {
    const [mini, travel, full] = [product(withStrength(EDEN.mini)), product(withStrength(EDEN.travel)), product(withStrength(EDEN.l100))];
    expect(travel.sizeMl).toBe(10);
    expect(matchKey(travel)).toBe(matchKey(mini));
    expect(matchKey(travel)).not.toBe(matchKey(full));
  });

  it('keeps each id as the shop\'s own SKU: nothing about a label or a strength moves one', () => {
    for (const l of Object.values(EDEN)) {
      expect(fragranceId(l)).toBe(`kayali-${l.retailerSku}`.toLowerCase());
      expect(fragranceId(withStrength(l))).toBe(fragranceId(l));
    }
  });
});

describe('Kayali\'s travel spray is a size at Kayali, and stays what it was everywhere else', () => {
  it('admits the Kayali travel spray as a fragrance', () => {
    expect(isFragrance(EDEN.travel)).toBe(true);
    expect(isFragrance(withStrength(EDEN.travel))).toBe(true);
  });

  it('is named in the registry for Kayali and for no other shop', () => {
    expect(RETAILERS.filter((r) => r.travelSizeIsASize).map((r) => r.id)).toEqual(['kayali']);
    expect(RETAILERS.filter((r) => r.strengthFromProductPage).map((r) => r.id)).toEqual(['kayali']);
  });

  it('every shop that reads a strength from its pages is a confirmed Shopify storefront, asked as the bot', () => {
    for (const r of RETAILERS.filter((s) => s.strengthFromProductPage)) {
      expect(r.shopifyStorefront, r.id).toBe(true);
    }
  });

  it('does not read another shop\'s "Travel Spray" as a size label: it keeps its own name, apart from the plain bottle', () => {
    // Escentual and Perfume Click titles as harvested. Nina Ricci's L'Air du Temps Eau de Toilette is
    // sold as a 30ml bottle (EAN 3137370207030) and a 30ml travel spray (EAN 3137370072744): folding
    // the second into the first split a four shop comparison into four products when measured. These
    // are admitted since 2026-10-04 (tests/travelSprays.test.ts), but never as a size of the bottle.
    const escentual = stored('escentual', { retailerSku: 'versaceeros024', rawTitle: 'Versace Eros Eau de Toilette Travel Spray 10ml', rawBrand: 'Versace', productType: 'Fragrance', priceGbp: 24 });
    const pclick = stored('perfume-click', { retailerSku: 'p1', rawTitle: "Nina Ricci L'air Du Temps Eau de Toilette 30ml Travel Spray", rawBrand: 'Nina Ricci', productType: null, priceGbp: 21.85 });
    expect(getRetailer('escentual')?.travelSizeIsASize).toBeUndefined();
    expect(displayName(escentual.rawTitle, 'Versace', 'Versace', false)).toBe('Eros Travel Spray');
    expect(displayName(pclick.rawTitle, 'Nina Ricci', 'Nina Ricci', false)).toBe("L'air Du Temps Travel Spray");
  });
});

describe('stripSizeLabel', () => {
  it('removes a label directly against the one size, either side of it', () => {
    expect(stripSizeLabel('Vanilla | 28 10ml Miniature')).toBe('Vanilla | 28 10ml');
    expect(stripSizeLabel('Wish Eau de Parfum Mini 5ml')).toBe('Wish Eau de Parfum 5ml');
    expect(stripSizeLabel('Le Male Mini 7 ml Eau de Toilette For Men')).toBe('Le Male 7 ml Eau de Toilette For Men');
    expect(stripSizeLabel('Vanilla | 28 10ml Travel Spray', true)).toBe('Vanilla | 28 10ml');
    expect(stripSizeLabel('Ormonde Jayne Verano Eau de Parfum Travel Spray 10ml', true)).toBe('Ormonde Jayne Verano Eau de Parfum 10ml');
  });

  it('reads "Travel Spray" only when asked to', () => {
    expect(stripSizeLabel('Vanilla | 28 10ml Travel Spray')).toBe('Vanilla | 28 10ml Travel Spray');
  });

  it('leaves a title alone when the label is not against its one size, or it names two sizes', () => {
    for (const t of [
      'Montblanc Explorer Eau De Parfum 100ml & Travel Spray 15ml & Shower Gel 100ml Gift Set',
      'Mugler Angel Eau De Parfum 50ml & Travel Size 10ml & Body Lotion 50ml Gift Set',
      'Mini Collection Eau De Parfum 5.0ml Gift Set',
      'Ador Parfum by Fragrance World - Mini Perfume 50ml',
      'Vanilla Voyage 25ml Mini Size Travel Size Miniature',
      'Miniature Set 4 x 10ml',
      'Mini Mouse Eau de Toilette',
    ]) {
      expect(stripSizeLabel(t, true), t).toBe(t);
    }
  });
});

describe('a set of minis is a gift set, never one bottle', () => {
  // Real Kayali set titles and product types (data/catalogue/kayali.json, 2026-10-03).
  const SETS: [string, string | null][] = [
    ['Dreamy Obsession Miniature Set 4 x 10ml', 'Sets'],
    ['Oudgasm Miniature Set (Vanilla, Rose, Milky Musk, Chocolate) 4 x 10ml', 'Sets'],
    ['Yum Mini Duo (Pistachio Gelato, Boujee Marshmallow) 2 x 5ml', 'Sets'],
    ['Vanilla Musk Mini Duo Set 2 x 5ml', 'Sets'],
    ['Discovery Layering Set 2025 8 x 1.5ml', 'Sets'],
    ['Freedom Discovery Layering Set 4x1,5ml', 'Sets'],
    ['Vacay in a Bottle Discovery Set (Capri, Maui, Maldives, Marrakesh) 4 x 1.5ml', 'Sets'],
    ['Vanilla Duo Set 50ml + 10 ml', 'Sets'],
    ['Maui in a Bottle Sweet Banana Duo', 'Bundles'],
    ['Fruit Crush 100ml', 'Bundles'],
    ['Vacay in a Bottle 50ml Wardrobe', null],
  ];

  it.each(SETS)('%s is a gift set and not a fragrance', (title, productType) => {
    const l = kayali('KYSET', title, 88, { productType });
    expect(isGiftSet(l)).toBe(true);
    expect(isFragrance(l)).toBe(false);
    expect(isCatalogueListing(l)).toBe(true);
    expect(fragranceId(l).startsWith('set-')).toBe(true);
  });

  it('gives a set no size, so it can never match a bottle of any size', () => {
    const mini = kayali('KY00450', 'Eden Sweet Peach | 35 Eau de Parfum 10ml Miniature', 28);
    const set = kayali('KYSET', 'Dreamy Obsession Miniature Set 4 x 10ml', 88, { productType: 'Sets' });
    const asProduct = (l: StoredListing): MatchableProduct => ({
      id: fragranceId(l), brand: 'Kayali', name: displayName(l.rawTitle, 'KAYALI', 'Kayali'),
      concentration: 'Eau de Parfum', sizeMl: isGiftSet(l) ? null : sizeMl(l.rawTitle), ean: null,
    });
    expect(findDuplicateGroups([asProduct(mini), asProduct(set)])).toEqual([]);
    expect(giftSetId(set)).toBe('set-dreamy-obsession-miniature-set-4-x-10ml');
  });

  it('a strength read from a page is never written into a set, so a set\'s id does not move', () => {
    const set = kayali('KYSET', 'Dreamy Obsession Miniature Set 4 x 10ml', 88, { productType: 'Sets' });
    expect(fragranceId(set)).toBe('set-dreamy-obsession-miniature-set-4-x-10ml');
  });
});

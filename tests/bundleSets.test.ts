import { afterEach, describe, expect, it } from 'vitest';
import { fragranceId, isCatalogueListing, isFragrance } from '../src/catalogue/fragranceId.js';
import { buildKnownHouseProducts, isGiftSet, namesTwoKnownProducts, registerKnownHouseProducts } from '../src/catalogue/giftSet.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * Bundles are sets (owner's list, 2026-10-05). Every title is a real one read
 * from data/catalogue/<shop>.json on 2026-10-05: the positives were kept as, or
 * dropped for being, single bottles before; the negatives are single bottles
 * whose names or sizes only look like bundles.
 */
function listing(retailerId: string, rawTitle: string, extra: Partial<StoredListing> = {}): StoredListing {
  return {
    retailerId,
    retailerSku: 'sku-1',
    url: 'https://shop.example/p/1',
    rawTitle,
    rawBrand: null,
    ean: null,
    imageUrl: null,
    priceGbp: 49.99,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'fragrance',
    firstSeenAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-10-01T00:00:00.000Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
    description: null,
    ...extra,
  };
}

afterEach(() => registerKnownHouseProducts(null));

describe('a bundle, duo, trio or two sizes in one box is a set', () => {
  it.each([
    ['fragrancehub', 'Liquid Brun and Vulcan Feu Bundle - Dusk Till Dawn Set EDP 100ml'],
    ['fragrancehub', 'Liquid Brun, Azzure Aoud and Cocoa Morado Eau de Parfum 100ml Trio Bundle'],
    ['the-beauty-store-uk', 'Revlon Charlie Silver Eau de Toilette Spray 100ml x 3 Trio Pack'],
    ['the-beauty-store-uk', 'Revlon Charlie Silver Eau de Toilette Spray 100ml x 2 Duo Pack'],
    ['perfume-direct', "DKNY Be Delicious + Fresh Blossom Eau de Parfum Women's Perfume Spray 30ml Twin Pack"],
    ['cult-beauty-global', 'NEST New York A Duo to Love: 8ml Lychee Rose EDP + 6ml Lychee Rose Oil (20% funded savings)'],
    ['john-lewis', 'Jo Malone London Festive Cologne Duo'],
    ['nicchia-luxury-uk', 'Birdwatcher Eau de Parfum 50+10 ml'],
    ['nicchia-luxury-uk', 'Fracas Eau de Parfum 100+8 ml'],
    ['perfume-click', "Issey Miyake Fusion d'Issey IGO Eau de Toilette 80ml Spray + 20ml Cap To Go"],
    ['the-beauty-store-uk', 'Tommy Hilfiger Impact Spark Eau de Toilette 100ml + 4 ml'],
    ['mybeauty-boutique', 'Versace Dylan Blue 100ml EDT Spray +10ml EDT Mini + Trousse'],
    ['mybeauty-boutique', 'Q by Dolce & Gabbana (F) EDP 50ml Spray + EDP 5ml Mini'],
    ['lookfantastic', 'Givenchy Gentleman Society Eau De Parfum 60ml + Travel Size 12.5ml'],
    ['perfume-click', "L'Artisan Parfumeur Travelset EDT Spray 10ml x 3 -Pass D'Enfer + Un Air De Bretagne+ Memoire De Roses with Leather Pouch"],
  ])('%s: %s', (shop, title) => {
    const l = listing(shop, title);
    expect(isGiftSet(l)).toBe(true);
    expect(isFragrance(l)).toBe(false);
    expect(isCatalogueListing(l)).toBe(true);
    expect(fragranceId(l).startsWith('set-')).toBe(true);
  });

  it.each([
    ['escentric-molecules', 'Molecule 01 + Ginger 100ml'],
    ['perfume-click', 'Escentric Molecules Molecule 01 + Cistus Eau de Toilette 100ml Spray'],
    ['nicchia-luxury-uk', 'Sainte + Figue Eau de Parfum 100 ml'],
    ['perfume-click', 'Blood Concept +MA Eau de Parfum 60ml Spray'],
    ['space-nk', 'DedCool Milk Layering + Enhancer Eau De Parfum 50ml'],
    ['the-beauty-store-uk', 'Azzaro Twin Women Eau de Toilette 80ml'],
    ['perfume-click', 'Atkinsons 24 Old Bond Street Triple Extract Eau de Cologne 100ml Spray'],
    ['emirates-oud', 'Double Espresso Perfume 100ml EDP Fragrance World'],
    ['armaf', 'Club De Nuit Sillage Eau De Parfum 250ml + FREE Refillable 5ml'],
    ['al-haramain', 'Al Haramain Sultan Perfume Oil 3ml + 6ml + 12ml 24ml'],
    ['al-haramain', 'Al Haramain Sultan Perfume Oil 3ml + 6ml + 12ml 3ml'],
  ])('%s: "%s" stays the single bottle it is', (shop, title) => {
    expect(isGiftSet(listing(shop, title)), title).toBe(false);
  });

  it('still needs a fragrance in it: a body spray duo or a make up duo is not a fragrance set', () => {
    expect(isGiftSet(listing('perfume-click', 'Lynx Africa Body Spray Duo Gift Set'))).toBe(false);
    expect(isGiftSet(listing('perfume-click', 'Max Factor Miracle Glow Duo Highlighter 8g - 30 Deep'))).toBe(false);
    expect(isCatalogueListing(listing('perfume-click', 'Sunkissed Mini Contour Face Trio 12.6g'))).toBe(false);
  });
});

describe('two known products of one house in one title', () => {
  // The names French Avenue's own storefront sells as single bottles, as the build hands them in.
  const house = (names: string[]) =>
    buildKnownHouseProducts(names.map((name) => ({ brands: ['French Avenue', 'French Avenue UK'], name })));
  const KNOWN = ['Liquid Brun', 'Cocoa Morado', 'Spectre Ghost', 'Royal Blend Sequoia', 'Aether', 'Atlantis', 'Vulcan Feu'];
  const fa = (title: string) => listing('french-avenue', title, { rawBrand: 'French Avenue UK', priceGbp: 48.5 });

  it.each([
    'Liquid Brun & Cocoa Morado',
    'Aether & Atlantis',
    'The Extrovert x Introvert  - Liquid Brun & Spectre Ghost',
    'Physical Touch - Royal Blend Sequoia & Liquid Brun',
    'Liquid Brun, Cocoa Morado and Vulcan Feu',
  ])('%s is a set', (title) => {
    registerKnownHouseProducts(house(KNOWN));
    const l = fa(title);
    expect(isGiftSet(l)).toBe(true);
    expect(isCatalogueListing(l)).toBe(true);
    expect(fragranceId(l).startsWith('set-')).toBe(true);
  });

  it('says nothing until the build has handed the house over', () => {
    expect(namesTwoKnownProducts('Liquid Brun & Cocoa Morado', 'French Avenue UK')).toBe(false);
    expect(isGiftSet(fa('Liquid Brun & Cocoa Morado'))).toBe(false);
  });

  it('needs every part to be a known product of that house', () => {
    registerKnownHouseProducts(house(KNOWN));
    expect(isGiftSet(fa('Liquid Brun & Mystery Scent'))).toBe(false);
    expect(isGiftSet(fa('Liquid Brun'))).toBe(false);
  });

  it('does not take a known product of another house', () => {
    registerKnownHouseProducts(house(KNOWN));
    expect(isGiftSet(listing('armaf', 'Liquid Brun & Cocoa Morado', { rawBrand: 'Armaf' }))).toBe(false);
  });

  it('leaves a product that is itself called "A & B" as the one bottle it is', () => {
    registerKnownHouseProducts(house([...KNOWN, 'Aether & Atlantis']));
    expect(isGiftSet(fa('Aether & Atlantis'))).toBe(false);
  });

  it('is never asked of a title that states a size, so no kept bottle moves', () => {
    registerKnownHouseProducts(house(KNOWN));
    expect(isGiftSet(fa('Liquid Brun & Cocoa Morado 100ml'))).toBe(false);
    expect(isFragrance(listing('fragrancehub', 'Liquid Brun 100ml Eau de Parfum by French Avenue', { rawBrand: 'Fragrance Hub LTD' }))).toBe(true);
  });
});

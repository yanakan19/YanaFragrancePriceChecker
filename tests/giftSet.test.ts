import { describe, expect, it } from 'vitest';
import { fragranceId, isCatalogueListing, isFragrance } from '../src/catalogue/fragranceId.js';
import { giftSetContents, giftSetId, giftSetName, isGiftSet } from '../src/catalogue/giftSet.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * Gift sets as their own category (owner's decision, 2026-10-03). Every title
 * below is a real one, read from data/catalogue/<shop>.json on 2026-10-03.
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

describe('isGiftSet: what counts as a fragrance gift set', () => {
  it.each([
    ['fragrance-click', 'Guerlain Shalimar 50ml Eau de Parfum Set'],
    ['fragrance-click', 'Paco Rabanne Invictus 100ml Eau de Toilette + 20ml Set'],
    ['fragrance-click', 'Dolce & Gabbana Q 100ml Eau de Parfum 3Pcs Set'],
    ['fragrance-click', 'Mont Blanc Legend Red 100ml Eau De Parfum 3 Ps Set'],
    ['home-bargains', 'Firetrap Oura Eau De Toilette 50ml & Bodywash 150ml'],
    ['mybeauty-boutique', 'Boss Bottled EDT 50Ml + Deo Spray 150Ml Gs'],
    ['the-beauty-store-uk', 'Christian Louboutin 7 * 4 Ml Eau De Parfum Mini Set: Loubifunk + Loubidoo + Loubikiss + Loubirouge + Loubiraj + Loubicrown + Loubicroc'],
    ['the-beauty-store-uk', 'Joop! Homme Wild Eau de Toilette Spray 125ml Pack of 2'],
    ['john-lewis', 'CHANEL N°5 Eau de Parfum Purse Spray, 3 x 20ml'],
    ['perfumeo', 'Pride No.1 Gift Set by Lattafa 5X20ml Eau De Parfum'],
  ])('%s: %s', (shop, title) => {
    const l = listing(shop, title);
    expect(isGiftSet(l)).toBe(true);
    expect(isFragrance(l)).toBe(false);
    expect(isCatalogueListing(l)).toBe(true);
  });

  it("reads the shop's own category: Kayali's Bundles and Sets, and its wardrobe boxes", () => {
    expect(isGiftSet(listing('kayali', 'Fruit Crush 100ml', { productType: 'Bundles' }))).toBe(true);
    expect(isGiftSet(listing('kayali', 'Vanilla Duo Set 50ml + 10 ml', { productType: 'Sets' }))).toBe(true);
    expect(isGiftSet(listing('kayali', 'Vacay in a Bottle 50ml Wardrobe'))).toBe(true);
  });

  it('reads a description that calls the listing a gift set with a body wash in it', () => {
    const l = listing('bm-stores', 'Scent Favourites La Beauté Shimmer EDT 100ml', {
      description: 'La Beauté Shimmer EDT and body wash gift set for her',
    });
    expect(isGiftSet(l)).toBe(true);
  });

  it('keeps one bottle whose name or box only sounds like a set', () => {
    for (const title of [
      'Tommy Bahama Set Sail Cologne St. Barts Eau de Cologne 100ml Spray',
      'Kilian Voulez-Vous Coucher Avec Moi With Coffret Refillable Eau de Parfum 50ml',
    ]) {
      const l = listing('mybeauty-boutique', title);
      expect(isGiftSet(l)).toBe(false);
      expect(isFragrance(l)).toBe(true);
    }
  });

  it('never lets a non perfume in, however it is boxed', () => {
    for (const [shop, title, extra] of [
      ['al-haramain', 'Plain Empty Perfume Bottle 12 Pieces of 50ml', {}],
      ['beautybase', 'Travalo Classic Refillable Perfume Spray 5ml', {}],
      ['home-bargains', "Let's Travel Atomiser Refillable Perfume Spray 5ml", {}],
      ['bm-stores', 'Pet Care Cologne 100ml - Dylan', {}],
      ['morrisons', 'Bugalugs Baby Fresh Cologne 200ml', { description: "keep your dog's coat smelling great" }],
      ['escentric-molecules', 'Escentric 01 Bath & Body Gift Set', { productType: 'Bundle' }],
      ['john-lewis', 'Sol de Janeiro Cheirosa Perfume Mist Best Sellers Fragrance Gift Set', {}],
      ['perfume-click', 'Lynx Africa Body Spray Duo Gift Set', {}],
      ['perfume-click', 'Yankee Candle Fragrance Gift Set 3 Pieces', {}],
      ['debenhams', 'Barber Marmara No.3 Eau De Cologne Gift Set', {}],
    ] as [string, string, Partial<StoredListing>][]) {
      const l = listing(shop, title, extra);
      expect(isGiftSet(l), title).toBe(false);
      expect(isCatalogueListing(l), title).toBe(false);
    }
  });
});

describe('a gift set is never a single bottle', () => {
  it('has its own id, even where a shop reuses the bottle barcode', () => {
    const bottle = listing('perfume-click', 'Paco Rabanne Invictus Eau de Toilette 100ml', { ean: '3349668508587' });
    const set = listing('fragrance-click', 'Paco Rabanne Invictus 100ml Eau de Toilette + 20ml Set', { ean: '3349668508587' });
    expect(fragranceId(bottle)).toBe('ean-3349668508587');
    expect(fragranceId(set)).toBe('set-ean-3349668508587');
  });

  it('groups across shops only on a barcode or the exact normalised title', () => {
    const a = listing('mybeauty-boutique', 'Bruno Banani Woman Gift Set 30ml EDT + 50ml Shower Gel');
    const b = listing('perfume-click', 'Bruno Banani Woman Gift Set 30ml EDT + 50ml Shower Gel', { retailerSku: 'other' });
    const c = listing('perfume-click', 'Bruno Banani Woman Gift Set 30ml EDT + 50ml Body Lotion');
    expect(giftSetId(a)).toBe(giftSetId(b));
    expect(giftSetId(a)).toBe('set-bruno-banani-woman-gift-set-30ml-edt-50ml-shower-gel');
    expect(giftSetId(c)).not.toBe(giftSetId(a));
  });
});

describe('giftSetContents and giftSetName', () => {
  it('reads the contents a title spells out', () => {
    expect(giftSetContents('Firetrap Oura Eau De Toilette 50ml & Bodywash 150ml')).toEqual(['50ml Eau de Toilette', '150ml Body Wash']);
    expect(giftSetContents('Pride No.1 Gift Set by Lattafa 5X20ml Eau De Parfum')).toEqual(['5 x 20ml Eau de Parfum']);
    expect(giftSetContents('Azzaro Forever Wanted Elixir 100ml Parfum + 2x 10ml Set')).toEqual(['100ml Parfum', '2 x 10ml']);
    expect(giftSetContents('Musamam White Intense Perfume 3pcs Unisex Gift Set')).toEqual(['3 pieces']);
  });

  it('says nothing rather than guess where the title does not spell them out', () => {
    expect(giftSetContents('Guerlain Shalimar 50ml Eau de Parfum Set')).toBeNull();
  });

  it('keeps the title whole, sizes included, less a leading brand', () => {
    expect(giftSetName('Burberry Her 100ml Eau de Parfum + 10ml Set', 'Burberry')).toBe('Her 100ml Eau de Parfum + 10ml Set');
  });

  it('drops a trailing pipe with nothing after it, and still keeps a Kayali number', () => {
    // Scent Store, read 2026-10-04.
    expect(giftSetName('Guerlain Aqua Allegoria Florabloom Forte Eau de Parfum 75ml Gift Set |', 'Guerlain')).toBe(
      'Aqua Allegoria Florabloom Forte Eau de Parfum 75ml Gift Set',
    );
    expect(giftSetName('Yum Boujee Marshmallow | 81 Sweet Fix', 'Kayali')).toBe('Yum Boujee Marshmallow | 81 Sweet Fix');
  });
});

describe('two numbered Kayali scents in one title are a set, whatever size it names', () => {
  // Cult Beauty's duos and trios, read from data/catalogue/cult-beauty-global.json on 2026-10-04.
  const DUOS = [
    'KAYALI Warm Apple Pie a la Mode 50ml (Eden Juicy Apple | 01 + Vanilla | 28)',
    'KAYALI Lychee Lemonade 10ml (Eden Sparkling Lychee | 39 + Capri in a Bottle Lemon Sugar | 14)',
    'KAYALI Fresh Fruit Tart 10ml ((Yum Boujee Marshmallow | 81 + Eden Juicy Apple | 01 + Capri in a Bottle Lemon Sugar | 14)',
  ];

  it.each(DUOS)('%s is a gift set and not a bottle', (title) => {
    const l = listing('cult-beauty-global', title, { rawBrand: null, priceGbp: 56 });
    expect(isGiftSet(l)).toBe(true);
    expect(isFragrance(l)).toBe(false);
    expect(isCatalogueListing(l)).toBe(true);
    expect(fragranceId(l).startsWith('set-')).toBe(true);
  });

  it('leaves one numbered scent as the bottle it is', () => {
    for (const title of [
      'KAYALI Eden Plush Pear 23 Eau de Parfum 10ml',
      'KAYALI Yum Pistachio Gelato 33 Eau de Parfum Intense 50ml',
      'KAYALI Maui In A Bottle Sweet Banana 37 Eau de Parfum 10ml',
    ]) {
      expect(isGiftSet(listing('cult-beauty-global', title)), title).toBe(false);
    }
  });
});

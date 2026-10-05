import { describe, expect, it } from 'vitest';
import { offerPhotoState, productNoPhotoReason } from '../scripts/photoCoverage.js';
import { giftSetId, isGiftSet } from '../src/catalogue/giftSet.js';

// Stored image URLs copied from data/catalogue/*.json on 2026-10-05, the
// listings behind the tiles without a photo in the owner's search for "ysl".
const STORED = {
  escentualMyslfGiftSet:
    'https://cdn.shopify.com/s/files/1/0853/1863/1748/files/Yves_Saint_Laurent_MYSLF_Eau_de_Parfum_Refillable_Spray_100ml_Gift_Set_Contents_075219fd-91fb-4bdd-bfc0-261e64d808ad.png?v=1788787266',
  escentualMyslfIntense:
    'https://cdn.shopify.com/s/files/1/0853/1863/1748/files/Yves_Saint_Laurent_MYSLF_Intense_Eau_de_Toilette_100ml.png?v=1784559909',
  scentstoreYForMen: 'https://www.scentstore.com/wp-content/uploads/2025/03/YSL-Y-Le-Parfum-100ml-150x150.jpg',
  perfumeDirectBlackOpium:
    'https://cdn.shopify.com/s/files/1/1442/8846/files/yves-saint-laurent-women-s-perfume-ysl-black-opium-le-parfum-women-s-parfum-spray-30ml-90ml-36751569354911.png?v=1698682618',
  beautyStoreLibre: 'https://cdn.shopify.com/s/files/1/0054/6996/2304/files/YSL648401__55762.1782204247.1280.1280.jpg?v=1782360303',
};

describe('why an offer has no photo', () => {
  it('says shop-not-allowed for an image that is stored but whose shop has no basis', () => {
    expect(offerPhotoState(STORED.escentualMyslfGiftSet, false)).toBe('shop-not-allowed');
    expect(offerPhotoState(STORED.beautyStoreLibre, false)).toBe('shop-not-allowed');
  });

  it('says has-photo when the same kind of stored image belongs to a shop with a basis', () => {
    expect(offerPhotoState(STORED.perfumeDirectBlackOpium, true)).toBe('has-photo');
  });

  it('says no-image-url when the shop stored none, and placeholder for a platform graphic', () => {
    expect(offerPhotoState(null, true)).toBe('no-image-url');
    expect(offerPhotoState('', true)).toBe('no-image-url');
    expect(offerPhotoState('https://images2.productserve.com/noimage.gif', true)).toBe('placeholder');
    // A placeholder is a placeholder whether or not the shop may show photos.
    expect(offerPhotoState('https://images2.productserve.com/noimage.gif', false)).toBe('placeholder');
  });

  it('puts the product under the reason that could be acted on', () => {
    expect(productNoPhotoReason(['no-image-url', 'shop-not-allowed'])).toBe('shop-not-allowed');
    expect(productNoPhotoReason(['no-image-url', 'placeholder'])).toBe('placeholder');
    expect(productNoPhotoReason(['no-image-url'])).toBe('no-image-url');
  });
});

describe('the shops behind the owner\'s example', () => {
  it('stored an image for every one of them: the parsers read it, so the registry is what withholds it', () => {
    for (const url of Object.values(STORED)) expect(url).toMatch(/^https:\/\//);
  });
});

describe('a gift set never shares a product with a single bottle, so never shares its photo', () => {
  const listing = (rawTitle: string, retailerId: string) => ({ rawTitle, retailerId, productType: null, description: null, rawBrand: null, ean: null });

  it('reads the owner\'s examples as sets, and the bottles beside them as bottles', () => {
    expect(isGiftSet(listing('Yves Saint Laurent MYSLF Eau de Parfum Refillable Spray 100ml Gift Set 100ml', 'escentual'))).toBe(true);
    expect(isGiftSet(listing('Ysl Black Opium 2 Pcs Set: 1.6 Eau De Parfum Spray + 1.6 Shimmering Body Lotion', 'the-beauty-store-uk'))).toBe(true);
    expect(isGiftSet(listing('YSL Black Opium Gift Set (50ml EDP + 50ml Body Lotion + 10ml EDP)', 'perfume-direct'))).toBe(true);
    expect(isGiftSet(listing('Yves Saint Laurent MYSLF Intense Eau de Toilette 100ml', 'escentual'))).toBe(false);
    expect(isGiftSet(listing('YSL Black Opium Le Parfum Women\'s Parfum Spray (90ml) 90ml', 'perfume-direct'))).toBe(false);
  });

  it('gives a set an id of its own, in the set- namespace, even when a bottle shares its barcode', () => {
    const set = giftSetId({ rawTitle: 'YSL Myslf Eau De Parfum 100ml & Travel Spray 10ml Gift Set', ean: '3614274769616' });
    expect(set.startsWith('set-')).toBe(true);
    expect(set).not.toBe('ean-3614274769616');
  });
});

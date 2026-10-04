import { describe, expect, it } from 'vitest';
import { displayName, stripPreOrderNotice } from '../src/catalogue/productName.js';
import { listingStockState, titleStatesPreOrder } from '../src/catalogue/listingAvailability.js';
import { isFragrance } from '../src/catalogue/fragranceId.js';
import { findDuplicateGroups, matchKey, type MatchableProduct } from '../src/catalogue/productMatch.js';
import { concentrationOfListing } from '../src/catalogue/productName.js';
import { sizeMl } from '../src/catalogue/fragranceId.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * A pre-order notice is not part of a perfume's name, and the listing is still a
 * Preorder.
 *
 * Stored examples: the Emirates Oud titles are copies of
 * data/catalogue/emirates-oud.json as harvested on 2026-10-04, and the
 * FragranceHub title is data/catalogue/fragrancehub.json's own.
 */
const EO_MOMENTO = 'Momento Liquid Gold Extrait de Parfum 100ml Riiffs PRE-ORDER: Estimated dispatch: 7th October';
const EO_ICE = 'Hawas Ice Freeze Perfume 100ml EDP Rasasi PRE-ORDER: Estimated dispatch: 5th October';
const EO_BOA = 'Hawas Boa Perfume 100ml EDP Rasasi PRE-ORDER: Estimated dispatch: 7th October';

describe('stripPreOrderNotice', () => {
  it('takes the notice and its dispatch date off the end of an Emirates Oud title', () => {
    expect(stripPreOrderNotice(EO_MOMENTO)).toBe('Momento Liquid Gold Extrait de Parfum 100ml Riiffs');
    expect(stripPreOrderNotice(EO_ICE)).toBe('Hawas Ice Freeze Perfume 100ml EDP Rasasi');
    expect(stripPreOrderNotice(EO_BOA)).toBe('Hawas Boa Perfume 100ml EDP Rasasi');
  });

  it('takes it off the front, with the date written any usual way', () => {
    expect(stripPreOrderNotice('PRE-ORDER: Estimated dispatch: 7th October Hawas Boa 100ml EDP')).toBe('Hawas Boa 100ml EDP');
    expect(stripPreOrderNotice('Pre Order - Dispatch 5 Oct Amber Oud 100ml EDP')).toBe('Amber Oud 100ml EDP');
    expect(stripPreOrderNotice('Amber Oud 100ml EDP Preorder: Estimated delivery w/c 12th October')).toBe('Amber Oud 100ml EDP');
    expect(stripPreOrderNotice('Amber Oud 100ml EDP PRE-ORDER: Estimated dispatch: October 7th 2026')).toBe('Amber Oud 100ml EDP');
    expect(stripPreOrderNotice('Amber Oud 100ml EDP (Pre-Order)')).toBe('Amber Oud 100ml EDP');
    expect(stripPreOrderNotice('Amber Oud 100ml EDP [PRE-ORDER: ships mid October]')).toBe('Amber Oud 100ml EDP');
    expect(stripPreOrderNotice('Amber Oud 100ml EDP Estimated dispatch: 7th October')).toBe('Amber Oud 100ml EDP');
  });

  it('takes a bare pre-order word and leaves the rest of the name', () => {
    expect(stripPreOrderNotice('Amber Oud Pre-Order 100ml EDP')).toBe('Amber Oud 100ml EDP');
  });

  it('leaves a title that is not a pre-order exactly as it was', () => {
    for (const t of [
      'Hawas Boa Perfume 100ml EDP Rasasi',
      'Ready To Wear Eau de Parfum 50ml',
      'Available Light Eau de Toilette 100ml',
      'Delivery Boy Eau de Parfum 50ml',
      'Order of the Day Eau de Parfum 100ml',
    ]) {
      expect(stripPreOrderNotice(t), t).toBe(t);
    }
  });

  it('never hands back an empty title', () => {
    expect(stripPreOrderNotice('PRE-ORDER')).toBe('PRE-ORDER');
  });
});

describe('the product name', () => {
  it('has no notice and no date, so it can be the same name another shop uses', () => {
    expect(displayName(EO_MOMENTO, 'Riiffs', 'Riiffs')).toBe('Momento Liquid Gold');
    expect(displayName(EO_BOA, 'Rasasi', 'Rasasi')).toBe('Hawas Boa');
    expect(displayName(EO_ICE, 'Rasasi', 'Rasasi')).toBe('Hawas Ice Freeze');
  });

  it('meets the same bottle at another shop', () => {
    const product = (id: string, title: string): MatchableProduct => ({
      id,
      brand: 'Rasasi',
      name: displayName(title, 'Rasasi', 'Rasasi'),
      concentration: concentrationOfListing(title, null),
      sizeMl: sizeMl(title, null),
      ean: null,
    });
    const emirates = product('emirates-oud-16475975680349-pre-order--estimated-dispatch--7th-october', EO_BOA);
    const hub = product('fragrancehub-hawasboa', 'Hawas Boa Eau de Parfum 100ml Rasasi');
    expect(matchKey(emirates)).toBe(matchKey(hub));
    const groups = findDuplicateGroups([emirates, hub]);
    expect(groups).toHaveLength(1);
    // The page keeps the other shop's id: the Emirates Oud one carries a dispatch date.
    expect(groups[0]!.canonical.id).toBe('fragrancehub-hawasboa');
    expect(groups[0]!.absorbed.map((p) => p.id)).toEqual([emirates.id]);
  });

  it('is the same name whichever dispatch date the shop writes, so a new date is not a new product', () => {
    const later = EO_BOA.replace('7th October', '9th October');
    expect(displayName(later, 'Rasasi', 'Rasasi')).toBe(displayName(EO_BOA, 'Rasasi', 'Rasasi'));
  });
});

describe('the stock state is not read from the name', () => {
  const stored = (rawTitle: string, over: Partial<StoredListing> = {}): StoredListing =>
    ({
      retailerSku: rawTitle,
      url: 'https://emiratesoud.co.uk/products/hawas-for-him-boa-perfume-rasasi',
      rawTitle,
      rawBrand: 'Rasasi',
      ean: null,
      imageUrl: null,
      priceGbp: 44.99,
      wasPriceGbp: null,
      promoEndsAt: null,
      inStock: true,
      sectionId: 'shopify-products-json',
      description: null,
      productType: 'Perfume',
      nativePrice: null,
      retailerId: 'emirates-oud',
      firstSeenAt: '2026-10-01T00:00:00Z',
      lastSeenAt: '2026-10-04T00:00:00Z',
      status: 'active',
      delistedAt: null,
      relistedAt: null,
      eligibleForNewBadge: false,
      variantId: null,
      ...over,
    }) as StoredListing;

  it('keeps the listing a Preorder, from its own title and from the stored flag', () => {
    expect(titleStatesPreOrder(EO_BOA)).toBe(true);
    expect(listingStockState(stored(EO_BOA))).toBe('preOrder');
    expect(listingStockState(stored(EO_BOA, { inStock: false, availability: 'preOrder' }))).toBe('preOrder');
  });

  it('is still a fragrance, so it is still shown, as a Preorder', () => {
    expect(isFragrance(stored(EO_BOA))).toBe(true);
  });

  it('does not make a bottle a Preorder because the name lost nothing: a plain title is in stock', () => {
    expect(listingStockState(stored('Hawas Boa Perfume 100ml EDP Rasasi'))).toBe('inStock');
  });
});

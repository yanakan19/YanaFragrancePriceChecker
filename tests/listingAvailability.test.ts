import { describe, expect, it } from 'vitest';
import { isAvailableListing } from '../src/catalogue/listingAvailability.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * The three `inStock` values actually found in data/catalogue/*.json on
 * 2026-08-26 (measured via a full scan of every live snapshot's active
 * listings): `true` (44,780), `false` (9,275) and `null` (289, concentrated
 * on superdrug, selfridges, the-perfume-shop and zara — the only value those
 * four ever publish). All three are exercised below, crossed with both
 * `status` values, because the function's whole job is that both have to
 * agree before a listing counts as available.
 */
function listing(over: Partial<StoredListing> = {}): StoredListing {
  return {
    retailerId: 'allbeauty',
    retailerSku: 'sku-1',
    url: 'https://example.test/a',
    rawTitle: 'Calvin Klein Obsession For Men Eau de Toilette 125ml',
    rawBrand: 'Calvin Klein',
    ean: null,
    imageUrl: null,
    priceGbp: 45,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'fragrance',
    firstSeenAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-08-13T00:00:00.000Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
    ...over,
  };
}

describe('isAvailableListing', () => {
  it('accepts an active listing confirmed in stock', () => {
    expect(isAvailableListing(listing({ status: 'active', inStock: true }))).toBe(true);
  });

  it('rejects an active listing confirmed out of stock — the whole point of this change', () => {
    expect(isAvailableListing(listing({ status: 'active', inStock: false }))).toBe(false);
  });

  it('accepts an active listing whose stock was never established (inStock: null)', () => {
    // Not the same claim as "in stock" — see this function's own header for
    // why unestablished is treated as available rather than excluded: some
    // retailers (superdrug, selfridges, the-perfume-shop, zara) never
    // publish a stock signal at all, so excluding null would erase their
    // listings from history permanently rather than occasionally.
    expect(isAvailableListing(listing({ status: 'active', inStock: null }))).toBe(true);
  });

  it('rejects a delisted listing regardless of its stock field', () => {
    expect(isAvailableListing(listing({ status: 'delisted', inStock: true }))).toBe(false);
    expect(isAvailableListing(listing({ status: 'delisted', inStock: false }))).toBe(false);
    expect(isAvailableListing(listing({ status: 'delisted', inStock: null }))).toBe(false);
  });
});

/**
 * The behaviour build-price-history.ts actually depends on: filtering with
 * isAvailableListing before picking the cheapest means a cheaper-but-unbuyable
 * listing can no longer win "the price" for a fragrance. This is the direct
 * regression test for the owner's request — before this filter, the £39
 * out-of-stock row below would have been plotted as the fragrance's price,
 * which nobody could have paid.
 */
describe('picking the cheapest listing after filtering by availability', () => {
  const cheapestOf = (listings: readonly StoredListing[]) =>
    listings.filter(isAvailableListing).reduce<StoredListing | null>((best, l) => {
      if (!best || l.priceGbp! < best.priceGbp! || (l.priceGbp === best.priceGbp && l.retailerId < best.retailerId)) {
        return l;
      }
      return best;
    }, null);

  it('skips a cheaper out-of-stock listing in favour of the cheapest buyable one', () => {
    const rows = [
      listing({ retailerId: 'perfumeo', priceGbp: 39, inStock: false }),
      listing({ retailerId: 'allbeauty', priceGbp: 45, inStock: true }),
      listing({ retailerId: 'escentual', priceGbp: 49, inStock: true }),
    ];
    const winner = cheapestOf(rows);
    expect(winner?.retailerId).toBe('allbeauty');
    expect(winner?.priceGbp).toBe(45);
  });

  it('still lets an unestablished-stock listing win when it really is the cheapest', () => {
    const rows = [
      listing({ retailerId: 'selfridges', priceGbp: 40, inStock: null }),
      listing({ retailerId: 'allbeauty', priceGbp: 45, inStock: true }),
    ];
    const winner = cheapestOf(rows);
    expect(winner?.retailerId).toBe('selfridges');
    expect(winner?.priceGbp).toBe(40);
  });

  it('returns nothing when every listing is confirmed out of stock', () => {
    const rows = [
      listing({ retailerId: 'perfumeo', priceGbp: 39, inStock: false }),
      listing({ retailerId: 'avon', priceGbp: 41, inStock: false }),
    ];
    expect(cheapestOf(rows)).toBeNull();
  });
});

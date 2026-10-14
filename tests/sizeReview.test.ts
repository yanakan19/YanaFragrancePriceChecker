import { describe, expect, it } from 'vitest';
import {
  HOUSE_SIZES_REVIEWED,
  SIZE_CORRECTIONS_REVIEWED,
  SIZE_REVIEW_PENDING,
  correctionKey,
  findHouseSizeContradictions,
} from '../src/catalogue/sizeReview.js';
import type { StoredListing } from '../src/catalogue/types.js';

const l = (retailerId: string, rawTitle: string, retailerSku = rawTitle): StoredListing =>
  ({ retailerId, retailerSku, rawTitle, rawBrand: null, status: 'active', url: 'https://x.test/' + retailerSku } as unknown as StoredListing);

describe('house size rule', () => {
  it('flags a size only one shop states that the house list lacks', () => {
    const found = findHouseSizeContradictions([l('a', 'Swiss Arabian Shaghaf Oud Marine EDP 100ml'), l('b', 'Swiss Arabian Shaghaf Oud Marine EDP 75ml')]);
    expect(found.map((f) => f.key)).toEqual([correctionKey('a', 'Swiss Arabian Shaghaf Oud Marine EDP 100ml')]);
  });
  it('lets a size two shops state through (a genuine new bottle)', () => {
    expect(findHouseSizeContradictions([l('a', 'Swiss Arabian Shaghaf Oud X EDP 100ml'), l('b', 'Swiss Arabian Shaghaf Oud X 100ml')])).toEqual([]);
  });
  it('ignores vials, listed sizes, other houses and sets', () => {
    expect(findHouseSizeContradictions([
      l('a', 'Swiss Arabian Shaghaf Oud Sample 2ml'),
      l('a', 'Swiss Arabian Shaghaf 25ml'),
      l('a', 'Orchid Rotana Shaghaf EDP 100ml'),
      l('a', 'Swiss Arabian Shaghaf Oud Ahmar 75ml + Shaghaf Oud Elixir 25ml Gift Set'),
    ])).toEqual([]);
  });
});

describe('reviewed lists', () => {
  it('every correction reads a size the house list shows, with its evidence', () => {
    for (const c of SIZE_CORRECTIONS_REVIEWED) {
      expect(c.evidence.length).toBeGreaterThan(10);
      expect(HOUSE_SIZES_REVIEWED.some((h) => h.sizes.includes(c.ml))).toBe(true);
    }
  });
  it('has no key twice', () => {
    const keys = SIZE_CORRECTIONS_REVIEWED.map((c) => correctionKey(c.retailerId, c.retailerSku));
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(SIZE_REVIEW_PENDING).size).toBe(SIZE_REVIEW_PENDING.length);
  });
});

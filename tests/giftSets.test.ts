import { describe, expect, it } from 'vitest';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { offersFor } from '../demo/catalogue.generated.js';
import { giftSetRail, giftSetSaving, rankGiftSets } from '../demo/giftSets.js';
import { onePerScent, scentKey } from '../demo/oneScent.js';
import { offerGroups } from '../demo/offerGroups.js';
import { rankedInMostStocked } from '../demo/mostStocked.js';
import { buildComparison } from '../src/services/priceService.js';
import { matchRoute, routeToPath } from '../demo/router.js';

/**
 * The home page's Gift sets section and /gift-sets (owner's decision,
 * 2026-10-03): popular sets with photos, ranked by how many shops stock them,
 * then by saving.
 */
const set = (id: string, brand: string, photo = true) => ({
  id,
  brand,
  name: `${id} Gift Set`,
  concentration: 'Eau de Parfum',
  giftSet: { contents: null, title: `${id} Gift Set` },
  photoUrl: photo ? `https://example.test/${id}.jpg` : null,
});

describe('gift set ranking', () => {
  it('ranks by shops, then by saving, then by brand and name', () => {
    const list = [set('a', 'Armaf'), set('b', 'Dior'), set('c', 'Afnan'), set('d', 'Lattafa'), { ...set('e', 'Zara'), giftSet: null }];
    const standing: Record<string, { shops: number; saving: number }> = {
      a: { shops: 2, saving: 1 },
      b: { shops: 3, saving: 0 },
      c: { shops: 2, saving: 5 },
      d: { shops: 0, saving: 0 },
      e: { shops: 9, saving: 9 },
    };
    // d cannot be bought anywhere; e is not a set.
    expect(rankGiftSets(list, (f) => standing[f.id]!).map((f) => f.id)).toEqual(['b', 'c', 'a']);
  });

  it('puts only sets with a photo in the section, one per brand', () => {
    const ranked = [set('a', 'Dior'), set('b', 'Dior'), set('c', 'Armaf', false), set('d', 'Afnan')];
    expect(giftSetRail(ranked).map((f) => f.id)).toEqual(['a', 'd']);
  });

  it('works the saving out between shops, never mixing delivered and item prices', () => {
    expect(giftSetSaving([{ itemPriceGbp: 40, deliveredPriceGbp: 43.99 }])).toBe(0);
    expect(giftSetSaving([{ itemPriceGbp: 40, deliveredPriceGbp: 43.99 }, { itemPriceGbp: 50, deliveredPriceGbp: 50 }])).toBe(6.01);
    expect(giftSetSaving([{ itemPriceGbp: 40, deliveredPriceGbp: 43.99 }, { itemPriceGbp: 45, deliveredPriceGbp: null }])).toBe(5);
  });
});

describe('gift sets on the real catalogue', () => {
  const standing = (f: (typeof DEMO_FRAGRANCES)[number]) => {
    const { delivered, plusDelivery } = offerGroups(buildComparison(offersFor(f.id), { sortBy: 'delivered' }));
    return { shops: delivered.length + plusDelivery.length, saving: giftSetSaving([...delivered, ...plusDelivery]) };
  };
  const ranked = onePerScent(rankGiftSets(DEMO_FRAGRANCES, standing));
  const rail = giftSetRail(ranked);

  it('fills the section with sets that have photos and a price, none repeated', () => {
    expect(rail.length).toBeGreaterThan(0);
    expect(rail.length).toBeLessThanOrEqual(12);
    expect(rail.every((f) => f.giftSet !== null && f.photoUrl !== null && standing(f).shops > 0)).toBe(true);
    expect(new Set(rail.map(scentKey)).size).toBe(rail.length);
  });

  it('lists each set line once in the full list, in ranking order', () => {
    expect(new Set(ranked.map(scentKey)).size).toBe(ranked.length);
    const shops = ranked.map((f) => standing(f).shops);
    expect(shops).toEqual([...shops].sort((a, b) => b - a));
  });

  it('keeps sets out of Most stocked as before', () => {
    expect(ranked.every((f) => !rankedInMostStocked(f))).toBe(true);
  });
});

describe('the /gift-sets route', () => {
  it('maps both ways', () => {
    expect(matchRoute('/gift-sets').name).toBe('giftSets');
    expect(routeToPath({ name: 'giftSets', param: '', query: {} })).toBe('/gift-sets');
  });
});

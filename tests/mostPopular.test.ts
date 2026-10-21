import { describe, expect, it } from 'vitest';
import { BY_POPULARITY, reviewsOf } from '../demo/data.js';
import { byReviews, mostPopularRail, reviewCount, sortByReviews } from '../demo/mostPopular.js';
import { mostStockedRail, rankedInMostStocked } from '../demo/mostStocked.js';
import { scentKey } from '../demo/oneScent.js';

/**
 * The home page's Most Popular row (demo/mostPopular.ts): ranked by the
 * reviews the shops publish, the largest count at any one shop, one per scent
 * and per brand, never a scent the Most Stocked row shows. Rules, not
 * figures: the made up products below hold the rule, and the real catalogue
 * is only checked against the rule.
 */
const bottle = (id: string, brand: string, name: string, extra: Partial<{ concentration: string; giftSet: null | object }> = {}) => ({
  id,
  brand,
  name,
  concentration: extra.concentration ?? 'Eau de Parfum',
  giftSet: (extra.giftSet ?? null) as never,
});

describe('reviewCount', () => {
  it('takes the largest count any one shop publishes, never the sum', () => {
    expect(reviewCount([{ rating: { value: 4.5, count: 120 } }, { rating: { value: 4.8, count: 300 } }, { rating: { value: 4, count: 300 } }])).toBe(300);
  });
  it('is 0 with no listings, no rating, or a rating with no count', () => {
    expect(reviewCount(undefined)).toBe(0);
    expect(reviewCount([])).toBe(0);
    expect(reviewCount([{ rating: null }, {}, { rating: { value: 5, count: null } }])).toBe(0);
  });
});

describe('the Most Popular ranking', () => {
  const stocked = [
    bottle('a50', 'A', 'One'),
    bottle('b', 'B', 'Two'),
    bottle('a100', 'A', 'One'),
    bottle('c', 'C', 'Three'),
    bottle('d-oil', 'D', 'Oil', { concentration: 'Perfume Oil' }),
    bottle('e-set', 'E', 'Set', { giftSet: { items: 2 } }),
    bottle('f', 'F', 'Four'),
    bottle('a-other', 'A', 'Other'),
  ];
  const reviews: Record<string, number> = { a50: 10, a100: 40, b: 0, c: 40, 'd-oil': 900, 'e-set': 900, f: 5, 'a-other': 30 };
  const of = (id: string) => reviews[id] ?? 0;

  it('ranks by reviews, ties to the Most Stocked order, one size per scent, unreviewed, oils and sets out', () => {
    expect(byReviews(stocked, of).map((f) => f.id)).toEqual(['a100', 'c', 'a-other', 'f']);
  });

  it('leaves out every scent of the row above and repeats no brand', () => {
    const rail = mostPopularRail(byReviews(stocked, of), [bottle('c-other-size', 'C', 'Three')], 12);
    expect(rail.map((f) => f.id)).toEqual(['a100', 'f']);
  });

  it('is empty, so the row is not drawn, where no shop publishes a review count', () => {
    expect(mostPopularRail(byReviews(stocked, () => 0), [], 12)).toEqual([]);
  });

  it('the full list puts the most reviewed first and keeps the list order for ties and the unreviewed', () => {
    expect(sortByReviews(stocked, of).map((f) => f.id)).toEqual(['d-oil', 'e-set', 'a100', 'c', 'a-other', 'a50', 'f', 'b']);
  });
});

describe('the Most Popular row on the real catalogue', () => {
  const above = mostStockedRail(BY_POPULARITY);
  const rail = mostPopularRail(byReviews(BY_POPULARITY, reviewsOf), above);

  it('shares no scent with the Most Stocked row, and no brand with itself', () => {
    const shown = new Set(above.map(scentKey));
    for (const f of rail) expect(shown.has(scentKey(f)), f.id).toBe(false);
    expect(new Set(rail.map((f) => f.brand)).size).toBe(rail.length);
  });

  it('holds only reviewed bottles, ranked in the Most Stocked sense, in falling order of reviews', () => {
    const counts = rail.map((f) => reviewsOf(f.id));
    for (const [i, f] of rail.entries()) {
      expect(counts[i], f.id).toBeGreaterThan(0);
      expect(rankedInMostStocked(f), f.id).toBe(true);
      if (i > 0) expect(counts[i]!, f.id).toBeLessThanOrEqual(counts[i - 1]!);
    }
    expect(rail.length).toBeLessThanOrEqual(12);
  });
});

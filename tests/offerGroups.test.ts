import { describe, expect, it } from 'vitest';
import { availabilityHeading, offerGroups, offersInPageOrder, rowShowsAge } from '../demo/offerGroups.js';
import { bestOffer, buildComparison } from '../src/services/priceService.js';
import type { RawOffer } from '../src/types/offer.js';

/**
 * Owner's decisions, 2026-10-03: on 4 of the 5 most stocked products a cheaper
 * 10 to 21 day old Perfumeo or Justmylook row sat ABOVE the row tagged
 * Cheapest. The fix the owner settled on: every listed offer in the one list,
 * sorted by delivered price, each row stating its age, and the Cheapest tag
 * on the cheapest listed buyable row whatever its age.
 */
const now = new Date('2026-10-03T09:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const offer = (retailerId: string, price: number, ageDays: number, stock: RawOffer['stock'] = 'inStock'): RawOffer => ({
  retailerId,
  variantId: 'azzure-aoud-100',
  price,
  wasPrice: null,
  currency: 'GBP',
  stock,
  url: `https://example.test/${retailerId}`,
  promoEndsAt: null,
  fetchedAt: daysAgo(ageDays),
});

// The shape of French Avenue Azzure Aoud 100ml on 2026-10-03: two cheaper
// rows 17 and 19 days old, three current ones, and some sold out.
const offers = [
  offer('perfumeo', 24.99, 16.7),
  offer('justmylook', 25.99, 18.9),
  offer('perfume-click', 29.55, 0.1),
  offer('emirates-oud', 29.99, 0.1),
  offer('french-avenue', 34.99, 0.1),
  offer('manchester-ouds', 22.99, 0.1, 'outOfStock'),
];

describe('offerGroups', () => {
  const rows = buildComparison(offers, { now });
  const best = bestOffer(rows);
  const groups = offerGroups(rows);
  const order = offersInPageOrder(groups);

  it('lists older offers in the one list, by delivered price, with no group of their own', () => {
    expect(Object.keys(groups).sort()).toEqual(['delivered', 'gone', 'plusDelivery']);
    const buyable = [...groups.delivered, ...groups.plusDelivery];
    expect(buyable.map((r) => r.retailer.id)).toContain('perfumeo');
    expect(buyable.map((r) => r.retailer.id)).toContain('justmylook');
    const prices = groups.delivered.map((r) => r.deliveredPriceGbp!);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(groups.gone.map((r) => r.retailer.id)).toEqual(['manchester-ouds']);
  });

  it('tags the cheapest listed buyable row, whatever its age, so nothing cheaper sits above it', () => {
    expect(best).toBe(order[0]);
    expect(best!.stale).toBe(true);
    const bestTotal = best!.deliveredPriceGbp!;
    expect(order.filter((r) => r.isPurchasable && r.deliveredPriceGbp !== null).every((r) => r.deliveredPriceGbp! >= bestTotal)).toBe(true);
  });

  it('keeps every offer, each exactly once', () => {
    expect(order).toHaveLength(rows.length);
    expect(new Set(order).size).toBe(rows.length);
  });

  it('counts every listed buyable row in the Available at heading', () => {
    expect(availabilityHeading(groups)).toBe('Available at (5 Shops)');
    const one = buildComparison([offer('perfumeo', 24.99, 16)], { now });
    expect(availabilityHeading(offerGroups(one))).toBe('Available at (1 Shop)');
    const soldOut = buildComparison([offer('perfumeo', 24.99, 1, 'outOfStock')], { now });
    expect(availabilityHeading(offerGroups(soldOut))).toBe('');
  });

  it('has every row older than about a day state its age', () => {
    const byId = new Map(rows.map((r) => [r.retailer.id, r]));
    expect(rowShowsAge(byId.get('perfumeo')!)).toBe(true);
    expect(rowShowsAge(byId.get('perfume-click')!)).toBe(false);
    expect(rowShowsAge({ ageSeconds: 2 * 86_400 })).toBe(true);
    expect(rowShowsAge({ ageSeconds: 3_600 })).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { availabilityHeading, offerGroups, offersInPageOrder, offerAge } from '../demo/offerGroups.js';
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
// rows (17 and 19 days old then, 5 and 7 days here, since 21 days is no
// longer shown), three current ones, and some sold out.
const offers = [
  offer('perfumeo', 24.99, 4.7),
  offer('justmylook', 25.99, 6.9),
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
    expect(Object.keys(groups).sort()).toEqual(['delivered', 'gone', 'plusDelivery', 'preOrder']);
    const buyable = [...groups.delivered, ...groups.plusDelivery];
    expect(buyable.map((r) => r.retailer.id)).toContain('perfumeo');
    expect(buyable.map((r) => r.retailer.id)).toContain('justmylook');
    const prices = groups.delivered.map((r) => r.deliveredPriceGbp!);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(groups.gone.map((r) => r.retailer.id)).toEqual(['manchester-ouds']);
  });

  it('tags the cheapest listed buyable row, whatever its age, so nothing cheaper sits above it', () => {
    expect(best).toBe(order[0]);
    const bestTotal = best!.deliveredPriceGbp!;
    expect(order.filter((r) => r.isPurchasable && r.deliveredPriceGbp !== null).every((r) => r.deliveredPriceGbp! >= bestTotal)).toBe(true);
  });

  it('keeps every offer, each exactly once', () => {
    expect(order).toHaveLength(rows.length);
    expect(new Set(order).size).toBe(rows.length);
  });

  it('counts every listed buyable row in the Available at heading', () => {
    expect(availabilityHeading(groups)).toBe('Available at (5 Shops)');
    const one = buildComparison([offer('perfumeo', 24.99, 5)], { now });
    expect(availabilityHeading(offerGroups(one))).toBe('Available at (1 Shop)');
    const soldOut = buildComparison([offer('perfumeo', 24.99, 1, 'outOfStock')], { now });
    expect(availabilityHeading(offerGroups(soldOut))).toBe('');
  });

  it('gives every row its own short age and a full sentence for a screen reader', () => {
    expect(offerAge(30)).toEqual({ short: 'Now', long: 'checked just now' });
    expect(offerAge(45 * 60)).toEqual({ short: '45m', long: 'checked 45 minutes ago' });
    expect(offerAge(9 * 3_600)).toEqual({ short: '9h', long: 'checked 9 hours ago' });
    expect(offerAge(3_600)).toEqual({ short: '1h', long: 'checked 1 hour ago' });
    expect(offerAge(86_400)).toEqual({ short: '1d', long: 'checked 1 day ago' });
    expect(offerAge(3 * 86_400)).toEqual({ short: '3d', long: 'checked 3 days ago' });
    const byId = new Map(rows.map((r) => [r.retailer.id, r]));
    expect(offerAge(byId.get('perfumeo')!.ageSeconds).short).toMatch(/^\d+d$/);
    expect(offerAge(byId.get('perfume-click')!.ageSeconds).short).toMatch(/^(Now|\d+[mh])$/);
  });
});

import { describe, expect, it } from 'vitest';
import { offerGroups, offersInPageOrder } from '../demo/offerGroups.js';
import { bestOffer, buildComparison } from '../src/services/priceService.js';
import type { RawOffer } from '../src/types/offer.js';

/**
 * Owner's decision, 2026-10-03: on 4 of the 5 most stocked products a cheaper
 * 10 to 21 day old Perfumeo or Justmylook row sat ABOVE the row tagged
 * Cheapest. Current offers come first; older ones go below them under "Older
 * prices"; nothing older ever sits above the Cheapest row.
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
  const groups = offerGroups(rows, best);
  const order = offersInPageOrder(groups);

  it('puts offers last checked over STALE_OFFER_DAYS ago in their own group', () => {
    expect(groups.older.map((r) => r.retailer.id).sort()).toEqual(['justmylook', 'perfumeo']);
    expect([...groups.delivered, ...groups.plusDelivery].every((r) => !r.stale)).toBe(true);
    expect(groups.gone.map((r) => r.retailer.id)).toEqual(['manchester-ouds']);
  });

  it('never lists an older or sold out row above the Cheapest row', () => {
    expect(best?.retailer.id).toBe('perfume-click');
    const bestAt = order.indexOf(best!);
    expect(order.slice(0, bestAt).every((r) => !r.stale && r.isPurchasable)).toBe(true);
    expect(order[0]).toBe(best);
  });

  it('keeps every offer, each exactly once', () => {
    expect(order).toHaveLength(rows.length);
    expect(new Set(order).size).toBe(rows.length);
  });

  it('leads the older group with the Cheapest row when every buyable offer is old', () => {
    const oldOnly = buildComparison([offer('perfumeo', 24.99, 16), offer('justmylook', 23.99, 12, 'unknown'), offer('allbeauty', 26, 14)], { now });
    const oldBest = bestOffer(oldOnly);
    const g = offerGroups(oldOnly, oldBest);
    expect(g.delivered).toHaveLength(0);
    expect(g.older[0]).toBe(oldBest);
  });
});

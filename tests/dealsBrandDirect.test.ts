import { describe, expect, it } from 'vitest';
import { DEALS } from '../demo/data.js';
import { RETAILERS } from '../src/config/retailers.js';

/**
 * Backlog item: "brand-direct excluded from Most Stocked and Deals". Checked
 * against the live snapshot in demo/deals.generated.ts (scripts/build-deals.ts
 * is what excludes them at build time), not a fixture — before this fix 112
 * of 7,294 live deals were a brand-direct storefront discounting its own
 * line (ibraq and avon among them, measured 2026-08-21); after regenerating
 * with the fix, 0 of 7,181 are. This test is what stops that regressing
 * silently on a future rebuild.
 */
describe('DEALS excludes brand-direct storefronts', () => {
  it('is not empty, so the assertion below is checking something real', () => {
    expect(DEALS.length).toBeGreaterThan(0);
  });

  it('never surfaces a deal from a retailer with singleBrandOnly set', () => {
    const singleBrandOnlyIds = new Set(
      RETAILERS.filter((r) => r.singleBrandOnly).map((r) => r.id),
    );
    const offenders = DEALS.filter((d) => singleBrandOnlyIds.has(d.retailerId));
    expect(offenders.map((d) => `${d.fragrance.id} via ${d.retailerId}`)).toEqual([]);
  });
});

/**
 * Perfume Click, excluded on the owner's instruction 2026-08-25.
 *
 * Measured against the snapshot before the change: 3,667 of 7,134 deal
 * entries were Perfume Click, 51.4% — more than every other shop combined.
 * After regenerating, 0 of 4,957 are, and the drop is 2,177 rather than
 * 3,667 because 1,490 of those fragrances kept a deal sourced from a
 * different shop instead, which is the behaviour intended: the exclusion
 * removes one shop's offer from consideration, never the fragrance.
 */
describe('DEALS excludes shops the owner has taken off the page', () => {
  it('never surfaces a Perfume Click deal', () => {
    expect(DEALS.filter((d) => d.retailerId === 'perfume-click')).toEqual([]);
  });

  it('still has deals from other shops, so the exclusion did not empty the page', () => {
    const shops = new Set(DEALS.map((d) => d.retailerId));
    expect(shops.size).toBeGreaterThan(1);
  });
});

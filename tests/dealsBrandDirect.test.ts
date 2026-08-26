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
 * Perfume Click was excluded from here 2026-08-25 on a report that its RRPs
 * were misleading, then reinstated 2026-08-26 once that premise was measured
 * and found false: its stated RRP agrees with the rest of the market (median
 * ratio 1.000 across 2,472 product/other-shop comparisons — see
 * scripts/build-deals.ts's own comment). This test now guards the opposite
 * regression: that a future change does not quietly bring the exclusion back.
 */
describe('DEALS no longer singles out Perfume Click', () => {
  it('surfaces Perfume Click deals like any other shop', () => {
    expect(DEALS.some((d) => d.retailerId === 'perfume-click')).toBe(true);
  });

  it('still has deals from other shops', () => {
    const shops = new Set(DEALS.map((d) => d.retailerId));
    expect(shops.size).toBeGreaterThan(1);
  });
});

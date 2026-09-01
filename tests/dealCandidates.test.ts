import { describe, expect, it } from 'vitest';
import { dealCandidateForOffer } from '../src/services/dealCandidates.js';

function fragrance(over: Partial<{ brand: string; houseCeiling: number | null }> = {}) {
  return { brand: 'Zimaya', houseCeiling: null, ...over };
}

function offer(over: Partial<{ price: number; wasPrice: number | null; retailerId: string }> = {}) {
  return { price: 20, wasPrice: null, retailerId: 'perfume-click', ...over };
}

describe('dealCandidateForOffer', () => {
  it('returns null when there is no wasPrice and no house ceiling to anchor to', () => {
    expect(dealCandidateForOffer(fragrance(), offer())).toBeNull();
  });

  it('builds a retailer candidate from a genuine, uncontradicted wasPrice', () => {
    const c = dealCandidateForOffer(fragrance(), offer({ price: 20, wasPrice: 30 }))!;
    expect(c.kind).toBe('retailer');
    expect(c.wasPrice).toBe(30);
    expect(c.percentOff).toBe(33);
    expect(c.houseName).toBeNull();
  });

  it('prefers a genuine house-anchored saving over the shop’s own wasPrice', () => {
    const c = dealCandidateForOffer(
      fragrance({ houseCeiling: 35 }),
      offer({ price: 19.9, wasPrice: 25 }),
    )!;
    expect(c.kind).toBe('house');
    expect(c.wasPrice).toBe(35);
    expect(c.houseName).toBe('Zimaya');
  });

  /**
   * The real regression: ean-6290171071051 (Zimaya Fatima 100ml). Perfume
   * Click's £50 wasPrice was genuine when first recorded (2026-08-13, no
   * house price existed to check it against) and never re-verified before
   * Zimaya's own storefront added a size-matched £35 listing on 2026-08-31,
   * establishing a houseCeiling for the first time. The stale £50 shipped in
   * demo/deals.generated.ts as a live deal — "was £50" against a bottle the
   * house itself sells for £35 — until this function started checking every
   * retailer wasPrice against the ceiling directly, not just inheriting
   * whatever scripts/build-demo-catalogue.ts's own withholding pass happened
   * to have already caught in the same run. See this function's own header
   * comment in src/services/dealCandidates.ts for the full timeline, sourced
   * from the real commit history (ed880e1c, 7bc50143, fbae46b0).
   */
  it('never returns a retailer wasPrice above the house ceiling (ean-6290171071051)', () => {
    const c = dealCandidateForOffer(
      fragrance({ brand: 'Zimaya', houseCeiling: 35 }),
      offer({ retailerId: 'perfume-click', price: 19.9, wasPrice: 50 }),
    );
    // Price (19.9) is below the ceiling (35), so a genuine house-anchored
    // saving exists and wins — but it must never be the shop's own £50.
    expect(c).not.toBeNull();
    expect(c!.wasPrice).toBeLessThanOrEqual(35);
    expect(c!.kind).toBe('house');
  });

  it('drops the offer entirely when its wasPrice exceeds the ceiling and its own price does not undercut the house either', () => {
    // price (36) is at or above the ceiling (35), so buildHouseAnchor has no
    // genuine saving to anchor to, and the retailer's own wasPrice (50) is
    // still above the ceiling — there is no honest deal to state here at all.
    const c = dealCandidateForOffer(
      fragrance({ houseCeiling: 35 }),
      offer({ price: 36, wasPrice: 50 }),
    );
    expect(c).toBeNull();
  });

  it('still allows a retailer wasPrice that sits at or below the house ceiling', () => {
    // price (99.5) is just under the ceiling (100), but too close for
    // buildHouseAnchor's own "too small to reach one percent" floor (the
    // exact pair discount.test.ts's buildHouseAnchor suite already asserts
    // is null) — so the retailer's own wasPrice, itself at the ceiling, is
    // the only candidate, and this gate must not drop it just for equalling
    // the ceiling.
    const c = dealCandidateForOffer(
      fragrance({ houseCeiling: 100 }),
      offer({ price: 99.5, wasPrice: 100 }),
    )!;
    expect(c.kind).toBe('retailer');
    expect(c.wasPrice).toBe(100);
  });

  it('is unaffected by the house ceiling when the fragrance has none', () => {
    const c = dealCandidateForOffer(fragrance({ houseCeiling: null }), offer({ price: 20, wasPrice: 999 }))!;
    expect(c.kind).toBe('retailer');
    expect(c.wasPrice).toBe(999);
  });
});

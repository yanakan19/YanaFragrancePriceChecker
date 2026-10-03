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
    // A wasPrice equal to the ceiling passes the gate. With no house ceiling
    // in the way it is an ordinary retailer deal...
    const c = dealCandidateForOffer(
      fragrance({ houseCeiling: 100 }),
      offer({ price: 99.5, wasPrice: 100 }),
    );
    // ...but 99.5 against 100 is half a percent, and since 3 Oct 2026 a saving
    // under one whole percent is no candidate at all rather than a 0% one the
    // caller had to filter out afterwards (demo/msrpComparison.ts).
    expect(c).toBeNull();
    const ok = dealCandidateForOffer(fragrance({ houseCeiling: 100 }), offer({ price: 95, wasPrice: 100 }))!;
    // 95 against the house's 100 is itself a 5% house saving, which wins.
    expect(ok.kind).toBe('house');
    expect(ok.wasPrice).toBe(100);
  });

  /**
   * The 3 Oct 2026 report: French Avenue Azzure Aoud 100ml, house price £30,
   * Perfume Click £29.55 plus £2.95 delivery. The product page prints £32.50,
   * so a deal worked from £29.55 ("1% below French Avenue") would contradict
   * the page it opens. Worked from the shown £32.50 there is no deal.
   */
  it('works every saving from the shown figure, not the item price', () => {
    expect(
      dealCandidateForOffer(
        fragrance({ brand: 'French Avenue', houseCeiling: 30 }),
        { price: 29.55, shownPrice: 32.5, shownDelivered: true, wasPrice: null, retailerId: 'perfume-click' },
      ),
    ).toBeNull();
    // Perfumeo, £28.99 with free delivery: the shown figure is the item price.
    const free = dealCandidateForOffer(
      fragrance({ brand: 'French Avenue', houseCeiling: 30 }),
      { price: 28.99, shownPrice: 28.99, shownDelivered: true, wasPrice: null, retailerId: 'perfumeo' },
    )!;
    expect(free).toMatchObject({ kind: 'house', price: 28.99, percentOff: 3, delivered: true });
    // A retailer RRP is restated against the shown figure too: £39.99 struck
    // through beside £32.50 is 18% off, not the 26% the item price gives.
    const rrp = dealCandidateForOffer(
      fragrance({ houseCeiling: null }),
      { price: 29.55, shownPrice: 32.5, shownDelivered: true, wasPrice: 39.99, retailerId: 'perfume-click' },
    )!;
    expect(rrp).toMatchObject({ kind: 'retailer', price: 32.5, percentOff: 18, delivered: true });
    // Delivery not stated: the item price is all there is, and the candidate
    // says it is not a delivered figure.
    const unstated = dealCandidateForOffer(fragrance({ houseCeiling: null }), offer({ price: 20, wasPrice: 30 }))!;
    expect(unstated).toMatchObject({ price: 20, percentOff: 33, delivered: false });
  });

  it('is unaffected by the house ceiling when the fragrance has none', () => {
    const c = dealCandidateForOffer(fragrance({ houseCeiling: null }), offer({ price: 20, wasPrice: 999 }))!;
    expect(c.kind).toBe('retailer');
    expect(c.wasPrice).toBe(999);
  });
});

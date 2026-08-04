import { describe, expect, it } from 'vitest';
import { RETAILERS, getRetailer, enabledRetailers, retailersForTier } from '../src/config/retailers.js';

describe('retailer registry', () => {
  it('contains the retailers from the plan plus any live affiliate additions', () => {
    // Twelve from the original plan, plus three added as their Awin programmes
    // actually approved us: Fragrance Click UK, MyBeauty.Boutique and Glorious
    // Beauty. None of the three was part of the original twelve.
    expect(RETAILERS).toHaveLength(15);
  });

  // The whole point of allowing `standardGbp: null` is that "we have not
  // established this" stops being unsayable. It is only safe because such a
  // retailer never reaches the offer pipeline — delivered price is the default
  // sort key, and an unknown delivery cost counted as zero would sort that shop
  // to the top as artificially cheapest. This test is what keeps that true.
  it('never enables a retailer whose standard delivery cost is unknown', () => {
    const leaked = RETAILERS.filter((r) => r.shipping.standardGbp === null && r.enabled);
    expect(leaked.map((r) => r.id)).toEqual([]);
  });

  it('has unique ids and domains', () => {
    expect(new Set(RETAILERS.map((r) => r.id)).size).toBe(RETAILERS.length);
    expect(new Set(RETAILERS.map((r) => r.domain)).size).toBe(RETAILERS.length);
  });

  it('gives every retailer at least one tier', () => {
    for (const r of RETAILERS) {
      expect(r.tiers.length, `${r.name} has no tiers`).toBeGreaterThan(0);
    }
  });

  it('prices everything in sterling', () => {
    for (const r of RETAILERS) expect(r.currency).toBe('GBP');
  });

  it('includes Beauty Base, enabled', () => {
    const bb = getRetailer('beautybase');
    expect(bb?.enabled).toBe(true);
    expect(bb?.tiers).toContain('niche');
  });

  it('exposes no trust flag — honesty lives in the offer pipeline, not a boolean', () => {
    for (const r of RETAILERS) {
      expect(r).not.toHaveProperty('trusted');
      expect(r).not.toHaveProperty('recommended');
    }
  });

  describe('shipping rules', () => {
    it('records a verification date and confidence for every retailer', () => {
      for (const r of RETAILERS) {
        expect(Number.isFinite(Date.parse(r.shipping.verifiedAt))).toBe(true);
        expect(['confirmed', 'unverified']).toContain(r.shipping.confidence);
      }
    });

    it('never has a negative cost or threshold', () => {
      for (const r of RETAILERS) {
        // null is "not established yet", which is a different statement from
        // any number and is checked by its own test above. Only a recorded
        // figure can be nonsensical.
        if (r.shipping.standardGbp !== null) {
          expect(r.shipping.standardGbp).toBeGreaterThanOrEqual(0);
        }
        // 0 is a legitimate threshold — it means "free from the first item",
        // not "no threshold recorded". Fragrance Click UK is free on every
        // order, so freeOverGbp: 0 is the honest way to say that, not a bug.
        if (r.shipping.freeOverGbp !== null) {
          expect(r.shipping.freeOverGbp).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('has a coherent estimated-days range', () => {
      for (const r of RETAILERS) {
        const [min, max] = r.shipping.estimatedDays;
        expect(min).toBeGreaterThan(0);
        expect(max).toBeGreaterThanOrEqual(min);
      }
    });

    it('models Notino as having no spend-based free delivery', () => {
      // Notino gates free postage on specific products, not basket value. A
      // threshold here would systematically understate its delivered price.
      expect(getRetailer('notino-uk')?.shipping.freeOverGbp).toBeNull();
    });

    it('uses the non-member threshold for Superdrug', () => {
      // £25 non-member, not the £20 Beautycard rate.
      expect(getRetailer('superdrug')?.shipping.freeOverGbp).toBe(25);
      expect(getRetailer('superdrug')?.shipping.membershipPerk).toBeDefined();
    });
  });

  describe('affiliate config', () => {
    it('never has an active programme with placeholder ids', () => {
      // status: 'active' is what flips buildOutboundLink into producing a
      // real tracked link — if it were ever set without real ids behind it,
      // every link for that retailer would silently be broken.
      for (const r of RETAILERS) {
        if (r.affiliate.status === 'active') {
          expect(r.affiliate.publisherId, `${r.name} is active with no publisherId`).toBeTruthy();
          expect(r.affiliate.deeplinkTemplate, `${r.name} is active with no deeplinkTemplate`).toBeTruthy();
        }
      }
    });

    it('gives every confirmed network a signup URL to act on', () => {
      for (const r of RETAILERS) {
        if (r.affiliate.verified && r.affiliate.network) {
          expect(r.affiliate.signupUrl, `${r.name} is confirmed but has no signup URL`).toBeTruthy();
        }
      }
    });
  });

  describe('lookups', () => {
    it('returns undefined for an unknown id', () => {
      expect(getRetailer('not-a-retailer')).toBeUndefined();
    });

    it('filters by tier', () => {
      const niche = retailersForTier('niche');
      expect(niche.map((r) => r.id)).toContain('selfridges');
      expect(niche.map((r) => r.id)).not.toContain('boots');
    });

    it('only returns enabled retailers from tier and enabled lookups', () => {
      for (const r of [...enabledRetailers(), ...retailersForTier('designer')]) {
        expect(r.enabled).toBe(true);
      }
    });
  });
});

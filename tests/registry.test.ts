import { describe, expect, it } from 'vitest';
import { RETAILERS, getRetailer, enabledRetailers, retailersForTier } from '../src/config/retailers.js';

describe('retailer registry', () => {
  it('contains the twelve retailers from the plan', () => {
    expect(RETAILERS).toHaveLength(12);
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

  it('includes Beautybase, enabled', () => {
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
        expect(r.shipping.standardGbp).toBeGreaterThanOrEqual(0);
        if (r.shipping.freeOverGbp !== null) {
          expect(r.shipping.freeOverGbp).toBeGreaterThan(0);
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
    it('starts with no live programmes, so links stay direct', () => {
      for (const r of RETAILERS) {
        expect(r.affiliate.status).not.toBe('active');
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

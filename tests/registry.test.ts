import { describe, expect, it } from 'vitest';
import { RETAILERS, getRetailer, enabledRetailers, retailersForTier, cannotCarryBrand } from '../src/config/retailers.js';

describe('retailer registry', () => {
  it('contains the retailers from the plan plus any live affiliate or direct additions', () => {
    // Twelve from the original plan, three added as their Awin programmes
    // actually approved us (Fragrance Click UK, MyBeauty.Boutique, Glorious
    // Beauty), four added as direct scrapes — Escentual, The Fragrance
    // Counter, ScentStore and Perfume Shopping — sourced without Awin
    // approval, nine Middle Eastern / Arabic shops added 2026-08-05 (French
    // Avenue and Armaf promoted out of houses.ts, Al Haramain, Riiffs, IBRAQ,
    // BellaVita Luxury, Oud Arabian, Manchester Ouds, Perfumeo), The Beauty
    // Store UK, Zimaya, and five single-brand UK storefronts added the same
    // day on request: Khadlaj, KAYALI, Zara, LUSH, Bath & Body Works.
    expect(RETAILERS).toHaveLength(35);
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

  describe('single-brand storefronts', () => {
    const armaf = getRetailer('armaf')!;
    const boots = getRetailer('boots')!;

    it("does not claim a house's own shop merely lacks another house's fragrance", () => {
      expect(cannotCarryBrand(armaf, 'Dior')).toBe(true);
      expect(cannotCarryBrand(armaf, 'Calvin Klein')).toBe(true);
    });

    it("still reports a house's own shop as genuinely missing its own fragrance", () => {
      // Armaf's own shop not listing an Armaf bottle IS a real absence, and
      // has to keep reading as one rather than being explained away.
      expect(cannotCarryBrand(armaf, 'Armaf')).toBe(false);
    });

    it('never excuses an ordinary multi-brand retailer', () => {
      for (const brand of ['Dior', 'Armaf', 'Lattafa', 'Anything At All']) {
        expect(cannotCarryBrand(boots, brand)).toBe(false);
      }
    });

    it('matches a house across the casing and suffixes feeds actually use', () => {
      const bellavita = getRetailer('bellavita-luxury')!;
      // Real strings from this shop's own harvested listings.
      expect(cannotCarryBrand(bellavita, 'BellaVita Luxury (UK)')).toBe(false);
      expect(cannotCarryBrand(bellavita, 'BELLAVITA')).toBe(false);
      // But a different house is still a different house.
      expect(cannotCarryBrand(bellavita, 'Bella Donna')).toBe(true);
    });

    it('only flags shops that genuinely sell one house', () => {
      // Oud Arabian and Manchester Ouds stock many houses between them, so
      // "not available" there is an ordinary, truthful absence.
      for (const id of ['oud-arabian', 'manchester-ouds', 'perfumeo']) {
        expect(getRetailer(id)!.singleBrandOnly, id).toBeUndefined();
      }
    });
  });
});

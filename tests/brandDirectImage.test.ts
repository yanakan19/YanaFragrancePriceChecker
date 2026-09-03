import { describe, expect, it } from 'vitest';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { RETAILERS, cannotCarryBrand } from '../src/config/retailers.js';
import { upgradeImageResolution } from '../src/catalogue/pickImage.js';

/**
 * Diagnosing the 3,036-product no-photo well (2026-09-03) found that 656 of
 * them were a brand-direct storefront's own product — al-haramain, armaf,
 * avon, french-avenue, zimaya or kayali selling its own bottle, with a real
 * photo sitting in the harvested data, excluded only because that retailer
 * carries no `imageBasis` in retailers.ts. That is not a licensing gap the
 * way a third-party retailer's would be: it is the brand's own photograph of
 * its own product, `own-storefront` basis — the type retailers.ts's own
 * ImageBasis already names, and the strongest this project has.
 *
 * The fix (scripts/build-demo-catalogue.ts, the "image licensing,
 * brand-direct offers" pass) lets an offer's image through when
 * `offer.brandDirect` is true, regardless of whether its retailer carries a
 * blanket `imageBasis` — without touching retailers.ts, and so without
 * unlocking that retailer's photos of anyone else's brand. Measured effect
 * on the 2026-09-03 catalogue: the no-photo count fell from 3,041 to 2,385
 * (15,271 products total), all 656 of them house/brand-direct products.
 *
 * These tests run against the live generated catalogue rather than a
 * fixture, in the style of tests/dealsBrandDirect.test.ts, so they keep
 * checking the real thing on every rebuild rather than a frozen snapshot.
 */
describe('brand-direct offers may show their own photo without a retailer imageBasis', () => {
  const IMAGE_ALLOWED = new Set(
    RETAILERS.filter((r) => r.affiliate.imageBasis != null).map((r) => r.id),
  );

  /** True when `retailerId` is genuinely `brand`'s own storefront for this offer. */
  function isBrandDirect(retailerId: string, brand: string): boolean {
    const retailer = RETAILERS.find((r) => r.id === retailerId);
    return !!retailer?.singleBrandOnly && !cannotCarryBrand(retailer, brand);
  }

  it('is not empty, so the assertions below are checking something real', () => {
    expect(CATALOGUE.length).toBeGreaterThan(0);
  });

  it('shows every displayed image is attributable to an allowed retailer or the product’s own brand-direct offer', () => {
    const offenders: string[] = [];
    for (const p of CATALOGUE) {
      if (!p.image) continue;
      const offers = CRAWLED[p.id] ?? [];
      const attributable = offers.some(
        (o) =>
          o.imageUrl !== null &&
          upgradeImageResolution(o.imageUrl) === p.image &&
          (IMAGE_ALLOWED.has(o.retailerId) || isBrandDirect(o.retailerId, p.brand)),
      );
      if (!attributable) offenders.push(`${p.id} (${p.brand} ${p.name})`);
    }
    expect(offenders).toEqual([]);
  });

  it('never shows a singleBrandOnly retailer’s photo of a bottle that is not its own brand', () => {
    const offenders: string[] = [];
    for (const p of CATALOGUE) {
      if (!p.image) continue;
      const offers = CRAWLED[p.id] ?? [];
      for (const o of offers) {
        if (o.imageUrl === null || upgradeImageResolution(o.imageUrl) !== p.image) continue;
        const retailer = RETAILERS.find((r) => r.id === o.retailerId);
        if (!retailer?.singleBrandOnly) continue;
        if (IMAGE_ALLOWED.has(o.retailerId)) continue; // licensed regardless of brand
        if (cannotCarryBrand(retailer, p.brand)) offenders.push(`${p.id} via ${o.retailerId}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('actually unlocks at least one real product — the mechanism fires, not just passes vacuously', () => {
    const unlockedByBrandDirect = CATALOGUE.filter((p) => {
      if (!p.image) return false;
      const offers = CRAWLED[p.id] ?? [];
      return offers.some(
        (o) =>
          o.imageUrl !== null &&
          upgradeImageResolution(o.imageUrl) === p.image &&
          !IMAGE_ALLOWED.has(o.retailerId) &&
          isBrandDirect(o.retailerId, p.brand),
      );
    });
    expect(unlockedByBrandDirect.length).toBeGreaterThan(0);
  });
});

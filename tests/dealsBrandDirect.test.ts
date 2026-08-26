import { describe, expect, it } from 'vitest';
import { DEALS } from '../demo/data.js';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
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
 * The Armaf report: "65% off RRP" on Club De Nuit Intense Man EDT 105ml
 * (ean-6085010044712), struck through against Perfume Click's RRP of £69.00,
 * while armaf.uk — whose offer was sitting three rows further down the same
 * page — sells that bottle for £37.99. Three shops stated ~£69 and so
 * corroborated each other, which is precisely why the two market tests in
 * src/catalogue/wasPriceCredibility.ts passed it.
 *
 * Today's Deals is built from whatever `wasPrice` survives that check
 * (scripts/build-deals.ts never looks at a verdict itself), so this asserts
 * the property the deals page actually needs, over the live snapshot rather
 * than a fixture: no deal on this site advertises a saving against a reference
 * price higher than what the fragrance house charges for the same bottle.
 *
 * Measured on 2026-08-26: 97 of the previous snapshot's 1,464 deals were on a
 * fragrance whose house is also stocked here, and 72 of those 97 advertised a
 * saving against a reference price above the house's own — Armaf at 65% off
 * against £69 (house £37.99), French Avenue at 46% off against £66.99 (house
 * £35), and 70 more. After test zero: 0 of 1,413, with 46 deals still
 * house-anchored. The Armaf product is still on the page, now at 6% off
 * against FragranceHub's RRP £29.95 — under Armaf's own price, so not a
 * figure the house contradicts.
 *
 * The ceiling comes from `CatalogueEntry.houseCeiling`, which
 * build-demo-catalogue.ts records as it applies the check, and deliberately is
 * not recomputed from the shipped CRAWLED offers: those have had `sizeMl` and
 * `brandDirect` dropped and every uncorroborated `wasPrice` cleared — the
 * house's own included — so a reconstruction from them can only ever be
 * *lower* than the real ceiling. Five Armaf products failed against such a
 * reconstruction while being entirely correct, Connoisseur Man among them,
 * where Perfume Click's RRP £39.99 is exactly the figure armaf.uk struck
 * through on its own listing and the reconstruction saw only its £34.99.
 *
 * Reading it back is still an end-to-end check rather than the build marking
 * its own homework: the deals snapshot is produced two steps later, by a
 * different script, from `wasPrice` alone.
 */
describe('DEALS never out-claim the fragrance house', () => {
  const ceilings = new Map(
    CATALOGUE.flatMap((p) => (p.houseCeiling === undefined ? [] : [[p.id, p.houseCeiling] as const])),
  );

  it('has deals on fragrances whose house is also here, or this proves nothing', () => {
    expect(DEALS.filter((d) => ceilings.has(d.fragrance.id)).length).toBeGreaterThan(0);
  });

  it('never strikes through a price above the house’s own', () => {
    const offenders = DEALS.filter((d) => {
      const top = ceilings.get(d.fragrance.id);
      return top !== undefined && d.wasPrice > top;
    });
    expect(
      offenders.map((d) => `${d.fragrance.id}: ${d.retailerId} was ${d.wasPrice} vs house ${ceilings.get(d.fragrance.id)}`),
    ).toEqual([]);
  });

  it('records a ceiling exactly where a single-brand storefront is stocked', () => {
    /* The ceiling and the offers are written by the same pass over the same
       products, so they cannot drift apart — but they can both be wrong in the
       same direction if the brand match silently stops matching, which would
       empty the ceilings and make the assertion above vacuous. Every product
       carrying one must still have a single-brand storefront among its
       offers. */
    expect(ceilings.size).toBeGreaterThan(0);
    const unbacked = [...ceilings.keys()].filter(
      (id) => !(CRAWLED[id] ?? []).some((o) => RETAILERS.find((r) => r.id === o.retailerId)?.singleBrandOnly),
    );
    expect(unbacked).toEqual([]);
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

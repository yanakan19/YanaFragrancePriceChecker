import { describe, expect, it } from 'vitest';
import {
  msrpComparison,
  msrpComparisonLabel,
  rrpSaving,
  rrpSavingFor,
  rrpSavingLabel,
  shownPrice,
} from '../demo/msrpComparison.js';
import { buildDiscount } from '../src/services/discount.js';
import { buildHouseAnchor } from '../src/services/discount.js';

describe('msrpComparison', () => {
  it('reports a shop under the house price as "below", floored', () => {
    // 30.00 -> 26.10 is exactly 13%.
    expect(msrpComparison(26.1, 30)).toEqual({ direction: 'below', percent: 13 });
    // 30.00 -> 26.05 is 13.16%: floored to 13, never rounded up to 14.
    expect(msrpComparison(26.05, 30)).toEqual({ direction: 'below', percent: 13 });
  });

  it('reports a shop over the house price as "above", floored', () => {
    // The case the page could not state at all until now: Beauty Base's £39.00
    // on French Avenue Azzure Aoud, whose house sells it at £30.00.
    expect(msrpComparison(39, 30)).toEqual({ direction: 'above', percent: 30 });
    // 30.00 -> 39.29 is 30.96%: floored to 30, so a mark-up is understated
    // rather than overstated, exactly as a saving is.
    expect(msrpComparison(39.29, 30)).toEqual({ direction: 'above', percent: 30 });
  });

  it('uses the house price as the denominator in both directions', () => {
    // ±£3 on a £30 ceiling is 10% each way. If "above" divided by the item
    // price instead, this pair would come back 10 and 9.
    expect(msrpComparison(27, 30)).toEqual({ direction: 'below', percent: 10 });
    expect(msrpComparison(33, 30)).toEqual({ direction: 'above', percent: 10 });
  });

  it('never returns zero percent, in either direction', () => {
    // Emirates Oud's £29.99 against a £30.00 ceiling — a penny apart, which
    // the catalogue is full of. "0% below MSRP" is not a fact worth printing.
    expect(msrpComparison(29.99, 30)).toBeNull();
    expect(msrpComparison(30.01, 30)).toBeNull();
    expect(msrpComparison(30, 30)).toBeNull();
    // Anything under a whole percent, not merely under a penny.
    expect(msrpComparison(29.75, 30)).toBeNull();
    expect(msrpComparison(30.25, 30)).toBeNull();
  });

  it('returns one direction or none, so a row can never claim both', () => {
    for (const price of [1, 15, 29.99, 30, 30.01, 45, 900]) {
      const c = msrpComparison(price, 30);
      if (c === null) continue;
      expect(c.direction === 'below' || c.direction === 'above').toBe(true);
      expect(c.percent).toBeGreaterThanOrEqual(1);
    }
  });

  it('refuses a ceiling that is not a price', () => {
    expect(msrpComparison(20, 0)).toBeNull();
    expect(msrpComparison(20, -5)).toBeNull();
    expect(msrpComparison(20, Number.NaN)).toBeNull();
    expect(msrpComparison(Number.NaN, 30)).toBeNull();
    expect(msrpComparison(20, Number.POSITIVE_INFINITY)).toBeNull();
  });

  // The "below" half is what the fragrance page already rendered through
  // buildHouseAnchor. Moving that render onto this function must not move a
  // single existing percentage, so the two are checked against each other
  // across the range rather than trusted to agree.
  it('agrees with buildHouseAnchor on every price it also has an opinion about', () => {
    for (const ceiling of [8.5, 30, 37.99, 57.99, 220]) {
      for (let p = 0.5; p < ceiling + 5; p += 0.25) {
        const price = Math.round(p * 100) / 100;
        const anchor = buildHouseAnchor(price, ceiling, 'Test House');
        const c = msrpComparison(price, ceiling);
        if (anchor) {
          expect(c).toEqual({ direction: 'below', percent: anchor.percentOff });
        } else if (c) {
          // Everything buildHouseAnchor declines is either the house being the
          // cheaper side — the case this function exists to state — or a gap
          // too small to be a whole percent, which this one declines too.
          expect(c.direction).toBe('above');
        }
      }
    }
  });
});

describe('msrpComparisonLabel', () => {
  it('names the direction the reader is being told about', () => {
    expect(msrpComparisonLabel({ direction: 'below', percent: 13 })).toBe('13% below MSRP');
    expect(msrpComparisonLabel({ direction: 'above', percent: 30 })).toBe('30% above MSRP');
  });
});

/**
 * The 3 Oct 2026 report, French Avenue Azzure Aoud 100ml: MSRP £30.00,
 * Perfume Click £29.55 plus £2.95 delivery. The row printed £32.50 "Incl.
 * £2.95 delivery" and, worked from the £29.55 it did not print, "1% below
 * MSRP" in sale green. Every comparison now uses the figure the row prints.
 */
describe('comparisons use the figure the reader is shown', () => {
  const row = (item: number, delivered: number | null, wasPrice: number | null = null) => ({
    itemPriceGbp: item,
    deliveredPriceGbp: delivered,
    discount: wasPrice === null ? null : buildDiscount({ price: item, wasPrice }),
  });

  it('reads the reported row as 8% above MSRP, not 1% below', () => {
    const r = row(29.55, 32.5);
    expect(shownPrice(r)).toEqual({ amountGbp: 32.5, delivered: true });
    const c = msrpComparison(shownPrice(r).amountGbp, 30)!;
    expect(c).toEqual({ direction: 'above', percent: 8 });
    expect(msrpComparisonLabel(c)).toBe('8% above MSRP');
    // offerRow's sale ink is `d || msrp.direction === 'below'`: an above
    // comparison is never green.
    expect(c.direction).not.toBe('below');
  });

  it('keeps a free delivery row below, on the same figure either way', () => {
    // Perfumeo £28.99, free delivery: the delivered total is the item price.
    const r = row(28.99, 28.99);
    expect(shownPrice(r)).toEqual({ amountGbp: 28.99, delivered: true });
    expect(msrpComparisonLabel(msrpComparison(shownPrice(r).amountGbp, 30)!)).toBe('3% below MSRP');
  });

  it('compares the item price where delivery is not stated, and says so', () => {
    const r = row(25, null);
    // The flag is what lets a caller avoid any wording implying delivery.
    expect(shownPrice(r)).toEqual({ amountGbp: 25, delivered: false });
    expect(msrpComparison(shownPrice(r).amountGbp, 30)).toEqual({ direction: 'below', percent: 16 });
    expect(rrpSavingFor(row(25, null, 30))).toMatchObject({ percentOff: 16, nowPrice: 25 });
  });

  it('never lets rounding flip the direction', () => {
    // £30.10 against £30 is above: a third of a percent, so nothing is said,
    // and certainly never "0% below".
    expect(msrpComparison(30.1, 30)).toBeNull();
    expect(msrpComparison(30.3, 30)).toEqual({ direction: 'above', percent: 1 });
    expect(msrpComparison(29.7, 30)).toEqual({ direction: 'below', percent: 1 });
    expect(msrpComparison(29.71, 30)).toBeNull();
    expect(msrpComparison(30.29, 30)).toBeNull();
    // A penny either side of the delivered total decides the side, not the
    // item price: £29.55 + £0.46 is £30.01, above by a penny, so silent.
    expect(msrpComparison(shownPrice(row(29.55, 30.01)).amountGbp, 30)).toBeNull();
    // Every price from £20 to £40 in pennies: "below" only ever below, "above"
    // only ever above, and never 0%.
    for (let p = 2000; p <= 4000; p++) {
      const c = msrpComparison(p / 100, 30);
      if (!c) continue;
      expect(c.percent).toBeGreaterThanOrEqual(1);
      expect(c.direction === 'below' ? p < 3000 : p > 3000).toBe(true);
    }
  });

  it('floors in whole pence, so float drift cannot cost a point', () => {
    // 29 / 100 * 100 is 28.999999999999996 in floating point.
    expect(msrpComparison(71, 100)).toEqual({ direction: 'below', percent: 29 });
    expect(msrpComparison(129, 100)).toEqual({ direction: 'above', percent: 29 });
    expect(rrpSaving(71, 100)).toEqual({ savingGbp: 29, percentOff: 29 });
  });

  it('restates a shop RRP against the shown figure', () => {
    // £39.99 struck through beside £32.50 is 18% off, which a reader can
    // check on the page; 26% (from the £29.55 item price) is not.
    const d = rrpSavingFor(row(29.55, 32.5, 39.99))!;
    expect(d).toMatchObject({ wasPrice: 39.99, nowPrice: 32.5, percentOff: 18 });
    expect(rrpSavingLabel(d)).toBe('18% off RRP');
    // A delivered total at or above the RRP states no saving at all.
    expect(rrpSavingFor(row(15.35, 18.3, 17))).toBeNull();
    expect(rrpSavingFor(row(14.25, 17.2, 14.5))).toBeNull();
    // Under a whole percent is not printed as 0%.
    expect(rrpSaving(29.8, 30)).toBeNull();
    expect(rrpSavingFor(row(20, 20, null))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { msrpComparison, msrpComparisonLabel } from '../demo/msrpComparison.js';
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

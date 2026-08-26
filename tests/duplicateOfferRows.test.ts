import { describe, expect, it } from 'vitest';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';

/**
 * Owner report, 2026-08-26: Emirates Oud is listed twice on Armaf Club De Nuit
 * Intense Man EDT 105ml (ean-6085010044712), both rows £26.99 was £40, both
 * linking to the same page. One shop cannot be two entries in a price
 * comparison — a reader counting shops counts wrong, and the "8 shops" on that
 * product was 7.
 *
 * The cause was not a matching mistake. Emirates Oud's feed carries three
 * variants of Shopify product 9369918832989 — "Default Title", "105ml" and
 * "Unboxed: 105ml" — and the first two describe the same bottle at the same
 * price, one of them Shopify's placeholder variant. scripts/build-demo-
 * catalogue.ts collapses rows a reader could not tell apart; see its comment
 * for why the key is every visible field rather than the URL alone, and for the
 * Al Haramain multi-size case that would break a URL-only rule.
 *
 * Measured over the shipped catalogue: 42 such rows across 42 products before,
 * all Emirates Oud's; 0 after.
 */
describe('no product lists one shop twice with the same row', () => {
  it('is checking a real catalogue', () => {
    expect(CATALOGUE.length).toBeGreaterThan(0);
  });

  it('has no two offers a reader could not tell apart', () => {
    const offenders: string[] = [];
    for (const [fragranceId, offers] of Object.entries(CRAWLED)) {
      const seen = new Set<string>();
      for (const o of offers) {
        const key = [o.retailerId, o.url, o.price, o.wasPrice, o.stock].join('|');
        if (seen.has(key)) offenders.push(`${fragranceId}: ${key}`);
        seen.add(key);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('counts shops on the product record as offers actually shipped', () => {
    /* `shops` is written as offers.length, so a collapsed row has to leave it
       consistent or the count on the page goes back to overstating. */
    const wrong = CATALOGUE.filter((p) => p.shops !== (CRAWLED[p.id] ?? []).length);
    expect(wrong.map((p) => `${p.id}: says ${p.shops}`)).toEqual([]);
  });
});

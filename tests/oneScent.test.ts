import { describe, expect, it } from 'vitest';
import { BY_POPULARITY, DEALS } from '../demo/data.js';
import { rankedInMostStocked } from '../demo/mostStocked.js';
import { bestDealPerScent, onePerScent, scentKey } from '../demo/oneScent.js';

/**
 * Owner's decision, 2026-10-03: the Most stocked list, Today's Deals and the
 * Gift sets list show one entry per scent, never 50ml and 100ml of the same
 * perfume side by side. Search, brand and shop pages still list every size.
 */
const bottle = (id: string, brand: string, name: string, sizeMl: number | null, concentration = 'Eau de Parfum') => ({
  id,
  brand,
  name,
  concentration,
  sizeMl,
});

describe('one entry per scent', () => {
  it('keeps the first, best ranked size of each perfume and every other perfume', () => {
    const ranked = [
      bottle('a100', 'Dior', 'Sauvage', 100),
      bottle('b50', 'Armaf', 'Club de Nuit', 105),
      bottle('a60', 'Dior', 'Sauvage', 60),
      bottle('c100', 'Dior', 'Sauvage', 100, 'Eau de Toilette'),
      bottle('a200', 'DIOR', 'sauvage', 200),
    ];
    expect(onePerScent(ranked).map((f) => f.id)).toEqual(['a100', 'b50', 'c100']);
  });

  it('treats two concentrations of one name as two scents', () => {
    expect(scentKey(bottle('x', 'Dior', 'Sauvage', 100, 'Eau de Parfum'))).not.toBe(
      scentKey(bottle('y', 'Dior', 'Sauvage', 100, 'Eau de Toilette')),
    );
  });

  it('keeps the best deal of each scent, whatever order the deals arrive in', () => {
    const deals = [
      { fragrance: bottle('s50', 'Dior', 'Sauvage', 50), percentOff: 20, price: 60 },
      { fragrance: bottle('s100', 'Dior', 'Sauvage', 100), percentOff: 30, price: 80 },
      { fragrance: bottle('k', 'Armaf', 'Club de Nuit', 105), percentOff: 10, price: 25 },
      { fragrance: bottle('s200', 'Dior', 'Sauvage', 200), percentOff: 30, price: 120 },
    ];
    expect(bestDealPerScent(deals).map((d) => d.fragrance.id)).toEqual(['s100', 'k']);
    expect(bestDealPerScent([...deals].reverse()).map((d) => d.fragrance.id)).toEqual(['k', 's100']);
  });

  it('holds on the real catalogue: the Most stocked list repeats no scent', () => {
    const ranked = BY_POPULARITY.filter(rankedInMostStocked);
    const once = onePerScent(ranked);
    expect(new Set(once.map(scentKey)).size).toBe(once.length);
    // The catalogue really does carry several sizes of one perfume.
    expect(once.length).toBeLessThan(ranked.length);
    // Each scent keeps the size the ranking puts first.
    const firstAt = new Map<string, number>();
    ranked.forEach((f, i) => {
      if (!firstAt.has(scentKey(f))) firstAt.set(scentKey(f), i);
    });
    expect(once.every((f) => ranked.indexOf(f) === firstAt.get(scentKey(f)))).toBe(true);
  });

  it('holds on the real deals: one deal per scent', () => {
    const kept = bestDealPerScent(DEALS);
    expect(new Set(kept.map((d) => scentKey(d.fragrance))).size).toBe(kept.length);
  });
});

import { describe, expect, it } from 'vitest';
import { BY_POPULARITY } from '../demo/data.js';
import { mostStockedRail, rankedInMostStocked } from '../demo/mostStocked.js';
import { onePerScent } from '../demo/oneScent.js';

/**
 * The home page's Most stocked list leaves gift sets out (owner's decision,
 * 2026-10-03), as it already left out perfume oils. A set keeps its own page,
 * its brand page and search; it is only not ranked here.
 */
const fake = (brand: string, giftSet: boolean, concentration = 'Eau de Parfum') => ({
  brand,
  concentration,
  giftSet: giftSet ? { contents: null, title: `${brand} Gift Set` } : null,
});

describe('Most stocked leaves gift sets out', () => {
  it('skips a gift set even when it is the most stocked thing there is', () => {
    const rail = mostStockedRail([fake('Rabanne', true), fake('Rabanne', false), fake('Armaf', false, 'Perfume Oil'), fake('Afnan', false)], 12);
    expect(rail).toEqual([fake('Rabanne', false), fake('Afnan', false)]);
  });

  it('holds on the real catalogue: no gift set or oil in the rail or the whole ranking', () => {
    expect(BY_POPULARITY.some((f) => f.giftSet !== null)).toBe(true);
    const rail = mostStockedRail(BY_POPULARITY);
    expect(rail).toHaveLength(12);
    expect(rail.every((f) => f.giftSet === null)).toBe(true);
    // The list behind See All has no cap, so the rule is held to all of it.
    const ranking = onePerScent(BY_POPULARITY.filter(rankedInMostStocked));
    expect(ranking.length).toBeGreaterThan(50);
    expect(ranking.every((f) => f.giftSet === null && f.concentration !== 'Perfume Oil')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { brandTierForName } from '../src/catalogue/brandTier.js';

describe('brandTierForName', () => {
  it('classifies named Middle Eastern houses regardless of their own price mix', () => {
    for (const brand of ['Lattafa', 'Rasasi', 'Afnan', 'Arabian Oud']) {
      expect(brandTierForName(brand, ['niche', 'niche'])).toBe('mideast');
      expect(brandTierForName(brand, ['designer'])).toBe('mideast');
    }
  });

  it('adds the 2026-08-10 reclassifications to the Middle Eastern set', () => {
    for (const brand of ['French Avenue', 'Street Origins', 'Maison Asrar', 'Mykonos']) {
      expect(brandTierForName(brand, ['designer'])).toBe('mideast');
    }
  });

  it('matches case insensitively, the way catalogue brand strings actually vary', () => {
    expect(brandTierForName('LATTAFA', [])).toBe('mideast');
    expect(brandTierForName('mykonos', [])).toBe('mideast');
  });

  it('overrides Amouage to niche even though it is a Middle Eastern company', () => {
    // Amouage sits in the world niche market, not the dupe/attar segment this
    // tier otherwise groups — grouping it with Lattafa and Afnan understates it.
    expect(brandTierForName('Amouage', ['designer', 'designer'])).toBe('niche');
    expect(brandTierForName('amouage', [])).toBe('niche');
  });

  it('overrides Kayali to designer even if its own prices would vote niche', () => {
    expect(brandTierForName('Kayali', ['niche', 'niche', 'niche'])).toBe('designer');
  });

  it('falls back to a majority vote of the brand\'s own fragrance tiers otherwise', () => {
    expect(brandTierForName('Some New Brand', ['niche', 'niche', 'designer'])).toBe('niche');
    expect(brandTierForName('Some New Brand', ['niche', 'designer', 'designer'])).toBe('designer');
  });

  it('treats an even split as designer, not niche', () => {
    expect(brandTierForName('Some New Brand', ['niche', 'designer'])).toBe('designer');
  });

  it('treats a brand with no fragrances yet as designer, not a crash', () => {
    expect(brandTierForName('Brand New House', [])).toBe('designer');
  });
});

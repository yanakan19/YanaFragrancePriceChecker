import { describe, expect, it } from 'vitest';
import { BRAND_SITES, officialSiteFor } from '../demo/brandSites.js';

/**
 * These cover officialSiteFor's *lookup*, not the contents of BRAND_SITES.
 * Which URL a house has is a research question settled one brand at a time in
 * that file; whether a house reaches its own entry is a code question, and it
 * was silently getting the answer wrong for eleven houses in the live
 * catalogue before these existed.
 */
describe('officialSiteFor', () => {
  it('resolves a brand spelled exactly as this file keys it', () => {
    expect(officialSiteFor('Armaf')?.url).toBe(BRAND_SITES['armaf']);
  });

  it('returns null rather than guessing for a house with no entry', () => {
    expect(officialSiteFor('A House That Does Not Exist')).toBeNull();
  });

  // A feed writing "and" where this file keys "&": normalizeBrand strips the
  // ampersand to whitespace, so the two spellings key differently and the
  // written-out one missed.
  it('resolves a brand that writes out "and" where the key uses "&"', () => {
    expect(officialSiteFor('Dolce and Gabbana')?.url).toBe(BRAND_SITES['dolce gabbana']);
    expect(officialSiteFor('Viktor and Rolf')?.url).toBe(BRAND_SITES['viktor rolf']);
  });

  // A feed appending the market it ships to. Same house, longer string.
  it('resolves a brand with a trailing market word', () => {
    expect(officialSiteFor('ARMAF UK')?.url).toBe(BRAND_SITES['armaf']);
    expect(officialSiteFor('French Avenue UK')?.url).toBe(BRAND_SITES['french avenue']);
  });

  // The whole safety argument for the fallbacks: they run only after the
  // brand's own key has already missed, so a house that already resolved
  // cannot be moved onto a different house's website by them.
  it('never lets a fallback override an exact key', () => {
    for (const key of Object.keys(BRAND_SITES)) {
      expect(officialSiteFor(key)?.url, key).toBe(BRAND_SITES[key]);
    }
  });

  // marketOf's slash-separated language/region reading, seen from the label
  // the brand page actually renders.
  it('labels a /en/gb/ storefront as UK', () => {
    expect(officialSiteFor('Acqua Di Parma')).toEqual({
      url: 'https://www.acquadiparma.com/en/gb/',
      uk: true,
    });
  });

  // Carolina Herrera used to be this file's example of a plain global .com
  // with no UK-marked page — a Job B pass (2026-08-22) found one
  // (carolinaherrera.com/uk/en/...) and swapped it in, so Lattafa (whose
  // own entry documents the same "no UK-marked page found" conclusion) is
  // the example now.
  it('labels a plain global .com as non-UK rather than guessing', () => {
    expect(officialSiteFor('Lattafa')?.uk).toBe(false);
  });
});

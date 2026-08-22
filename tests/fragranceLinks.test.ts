import { describe, expect, it } from 'vitest';
import { fragranceLinksFor } from '../demo/fragranceLinks.js';
import { BRAND_SITES } from '../demo/brandSites.js';

describe('fragranceLinksFor: official site', () => {
  it('resolves to the brand homepage — the same URL brandView() already renders — for a known brand', () => {
    const links = fragranceLinksFor('Armaf', 'Club De Nuit Intense Man');
    expect(links.officialSite).toEqual({ url: BRAND_SITES['armaf'], uk: expect.any(Boolean) });
  });

  it('is null, not guessed, for a brand with no BRAND_SITES entry', () => {
    const links = fragranceLinksFor('A House That Does Not Exist', 'Some Fragrance');
    expect(links.officialSite).toBeNull();
  });

  it('never varies with the fragrance name — only the brand decides this link', () => {
    const a = fragranceLinksFor('Armaf', 'Club De Nuit Intense Man');
    const b = fragranceLinksFor('Armaf', 'Ego Tonight');
    expect(a.officialSite).toEqual(b.officialSite);
  });
});

describe('fragranceLinksFor: Fragrantica search link', () => {
  it('builds a search URL, never a guessed direct product page', () => {
    const links = fragranceLinksFor('Dior', 'Sauvage');
    expect(links.fragranticaSearchUrl).toBe('https://www.fragrantica.com/search/?query=Dior%20Sauvage');
    expect(links.fragranticaSearchUrl).not.toMatch(/\/perfume\//);
  });

  it('is present even when the brand has no known official site', () => {
    const links = fragranceLinksFor('A House That Does Not Exist', 'Some Fragrance');
    expect(links.fragranticaSearchUrl).toContain('fragrantica.com/search/');
  });

  it('percent-encodes brand and name characters that are not URL-safe', () => {
    const links = fragranceLinksFor('Dolce & Gabbana', 'Light Blue');
    expect(links.fragranticaSearchUrl).toBe(
      'https://www.fragrantica.com/search/?query=' + encodeURIComponent('Dolce & Gabbana Light Blue'),
    );
  });
});

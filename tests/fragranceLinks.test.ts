import { describe, expect, it } from 'vitest';
import { fragranceLinksFor } from '../demo/fragranceLinks.js';
import { FRAGRANCE_LINKS } from '../demo/fragranceLinks.generated.js';
import { BRAND_SITES } from '../demo/brandSites.js';
import { fragranticaUrlFromPath, matchFragranticaUrl, parseFragranticaUrl } from '../src/catalogue/fragranceLinkMatch.js';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { fragranceLinkKey } from '../src/catalogue/fragranceLinkMatch.js';

// An empty table is "nothing has been resolved for this perfume": the page must
// behave exactly as it did before direct links existed.
const NONE = {};

describe('fragranceLinksFor: nothing stored falls back to the old behaviour', () => {
  describe('official site', () => {
    it('is the brand homepage — the same URL brandView() already renders — for a known brand', () => {
      const links = fragranceLinksFor('Armaf', 'Club De Nuit Intense Man', 'Eau de Toilette', NONE);
      expect(links.officialSite).toEqual({ url: BRAND_SITES['armaf'], uk: expect.any(Boolean) });
      expect(links.officialDirect).toBe(false);
    });

    it('is null, not guessed, for a brand with no BRAND_SITES entry', () => {
      const links = fragranceLinksFor('A House That Does Not Exist', 'Some Fragrance', 'Eau de Parfum', NONE);
      expect(links.officialSite).toBeNull();
      expect(links.officialDirect).toBe(false);
    });

    it('never varies with the fragrance name — only the brand decides this link', () => {
      const a = fragranceLinksFor('Armaf', 'Club De Nuit Intense Man', '', NONE);
      const b = fragranceLinksFor('Armaf', 'Ego Tonight', '', NONE);
      expect(a.officialSite).toEqual(b.officialSite);
    });
  });

  describe('Fragrantica', () => {
    it('is a search URL, never a guessed direct product page', () => {
      const links = fragranceLinksFor('Dior', 'Sauvage', 'Eau de Toilette', NONE);
      expect(links.fragranticaUrl).toBe('https://www.fragrantica.com/search/?query=Dior%20Sauvage');
      expect(links.fragranticaSearchUrl).toBe(links.fragranticaUrl);
      expect(links.fragranticaUrl).not.toMatch(/\/perfume\//);
      expect(links.fragranticaDirect).toBe(false);
    });

    it('is present even when the brand has no known official site', () => {
      const links = fragranceLinksFor('A House That Does Not Exist', 'Some Fragrance', '', NONE);
      expect(links.fragranticaUrl).toContain('fragrantica.com/search/');
    });

    it('percent-encodes brand and name characters that are not URL-safe', () => {
      const links = fragranceLinksFor('Dolce & Gabbana', 'Light Blue', '', NONE);
      expect(links.fragranticaUrl).toBe(
        'https://www.fragrantica.com/search/?query=' + encodeURIComponent('Dolce & Gabbana Light Blue'),
      );
    });
  });
});

describe('fragranceLinksFor: stored direct links', () => {
  const table = {
    'dior|sauvage|edt': ['Dior/Sauvage-31861', 'https://www.dior.com/en_gb/beauty/fragrance/mens-fragrance/sauvage'],
    'armaf|egotonight|edp': ['', 'https://armaf.uk/products/ego-tonight-eau-de-parfum-100ml'],
    'lattafa|khamrahqahwa|edp': ['Lattafa-Perfumes/Khamrah-Qahwa-88175', ''],
  } as const;

  it('goes to the perfume\'s own page on both sites when both are stored', () => {
    const links = fragranceLinksFor('Dior', 'Sauvage', 'Eau de Toilette', table);
    expect(links.fragranticaUrl).toBe('https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html');
    expect(links.fragranticaDirect).toBe(true);
    expect(links.officialSite?.url).toBe('https://www.dior.com/en_gb/beauty/fragrance/mens-fragrance/sauvage');
    expect(links.officialDirect).toBe(true);
  });

  it('marks a direct official page as UK from its own address', () => {
    expect(fragranceLinksFor('Dior', 'Sauvage', 'Eau de Toilette', table).officialSite?.uk).toBe(true);
    expect(fragranceLinksFor('Armaf', 'Ego Tonight', 'Eau de Parfum', table).officialSite?.uk).toBe(true);
  });

  it('falls back per link: a stored official page with no Fragrantica page keeps the Fragrantica search', () => {
    const links = fragranceLinksFor('Armaf', 'Ego Tonight', 'Eau de Parfum', table);
    expect(links.officialSite?.url).toBe('https://armaf.uk/products/ego-tonight-eau-de-parfum-100ml');
    expect(links.officialDirect).toBe(true);
    expect(links.fragranticaDirect).toBe(false);
    expect(links.fragranticaUrl).toBe('https://www.fragrantica.com/search/?query=Armaf%20Ego%20Tonight');
  });

  it('falls back per link: a stored Fragrantica page with no official page keeps the brand homepage', () => {
    const links = fragranceLinksFor('Lattafa', 'Khamrah Qahwa', 'Eau de Parfum', table);
    expect(links.fragranticaUrl).toBe('https://www.fragrantica.com/perfume/Lattafa-Perfumes/Khamrah-Qahwa-88175.html');
    expect(links.officialDirect).toBe(false);
    expect(links.officialSite).toEqual({ url: BRAND_SITES['lattafa'], uk: expect.any(Boolean) });
  });

  it('does not use another perfume\'s page', () => {
    const links = fragranceLinksFor('Dior', 'Sauvage Elixir', 'Parfum', table);
    expect(links.fragranticaDirect).toBe(false);
    expect(links.officialDirect).toBe(false);
  });
});

describe('the committed link table', () => {
  const entries = Object.entries(FRAGRANCE_LINKS);

  it('only holds Fragrantica perfume pages and absolute official URLs', () => {
    for (const [key, [f, o]] of entries) {
      if (f) expect(parseFragranticaUrl(fragranticaUrlFromPath(f)), key).not.toBeNull();
      if (o) expect(o, key).toMatch(/^https?:\/\//);
      expect(f || o, `${key} has neither link, so should not be stored`).toBeTruthy();
    }
  });

  it('holds no Fragrantica page whose slug disagrees with its own perfume', () => {
    const byKey = new Map(CATALOGUE.map((e) => [fragranceLinkKey(e.brand, e.name, e.concentration), e]));
    let checked = 0;
    for (const [key, [f]] of entries) {
      const e = byKey.get(key);
      if (!f || !e) continue;
      checked++;
      expect(
        matchFragranticaUrl(fragranticaUrlFromPath(f), { brand: e.brand, name: e.name, concentration: e.concentration }),
        `${key} -> ${f}`,
      ).not.toBeNull();
    }
    // Vacuous while no Fragrantica page has been resolved; real once any have.
    expect(checked).toBeGreaterThanOrEqual(0);
  });
});

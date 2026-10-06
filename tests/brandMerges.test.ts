import { describe, expect, it } from 'vitest';
import { BRAND_MERGES, HAND_ALIASES, KNOWN_ALIASES, brandKey, buildBrandCanon } from '../src/catalogue/brandName.js';
import { BRAND_ALIAS_SLUGS, matchRoute, slugify } from '../demo/router.js';
import { logoFor } from '../demo/brandLogos.js';
import { officialSiteFor } from '../demo/brandSites.js';

describe('BRAND_MERGES', () => {
  it('has no chains, repeats or self merges', () => {
    const froms = BRAND_MERGES.map(([from]) => brandKey(from));
    expect(new Set(froms).size).toBe(froms.length);
    for (const [from, to] of BRAND_MERGES) {
      expect(brandKey(from), `${from} merges into itself`).not.toBe(brandKey(to));
      expect(froms, `${to} is both kept and merged away`).not.toContain(brandKey(to));
    }
  });

  it('never overturns an older hand written alias that says something different', () => {
    for (const [from, to] of BRAND_MERGES) {
      for (const name of [from, to]) {
        const older = HAND_ALIASES[brandKey(name)];
        if (older !== undefined) expect(older, `${name} was already aliased to ${older}`).toBe(to);
      }
    }
  });

  it('puts every merged spelling under the kept name', () => {
    for (const [from, to] of BRAND_MERGES) {
      expect(KNOWN_ALIASES[brandKey(from)]).toBe(to);
      expect(KNOWN_ALIASES[brandKey(to)]).toBe(to);
    }
  });

  it('folds the Kayali gift set brand into Kayali, whatever the casing', () => {
    const canon = buildBrandCanon(['Kayali', 'Kayali', 'Kayali UK', 'KAYALI UK']);
    expect(canon.get('Kayali')).toBe('Kayali');
    expect(canon.get('Kayali UK')).toBe('Kayali');
    expect(canon.get('KAYALI UK')).toBe('Kayali');
  });

  it('merges a suffix, a shortened name, a plural and an ampersand written two ways', () => {
    const canon = buildBrandCanon([
      'Kilian', 'Kilian Paris', 'Thierry Mugler', 'Mugler', 'Escentric Molecules', 'Escentric Molecule',
      'Scotch & Soda', 'Scotch and Soda', 'Maison Francis Kurkdjian', 'Francis Kurkdjian', 'Hugo Boss', 'BOSS',
    ]);
    expect(canon.get('Kilian Paris')).toBe('Kilian');
    expect(canon.get('Thierry Mugler')).toBe('Mugler');
    expect(canon.get('Escentric Molecule')).toBe('Escentric Molecules');
    expect(canon.get('Scotch and Soda')).toBe('Scotch & Soda');
    expect(canon.get('Francis Kurkdjian')).toBe('Maison Francis Kurkdjian');
    expect(canon.get('BOSS')).toBe('Hugo Boss');
  });

  it('leaves genuinely different houses apart', () => {
    const canon = buildBrandCanon([
      'Maison Margiela', 'Margiela', 'Al Haramain', 'Al Rehab', 'Essential Parfums',
      'Essential Perfumes', 'New Brand', 'Lamborghini', 'Tonino Lamborghini',
      'Collection Prestige', 'Designer Collection', 'Designer Fragrances', 'Orchid', 'Gulf Orchid',
    ]);
    expect(canon.get('Maison Margiela')).toBe('Maison Margiela');
    expect(canon.get('Margiela')).toBe('Margiela');
    expect(canon.get('Al Haramain')).toBe('Al Haramain');
    expect(canon.get('Al Rehab')).toBe('Al Rehab');
    expect(canon.get('Essential Parfums')).toBe('Essential Parfums');
    expect(canon.get('Essential Perfumes')).toBe('Essential Perfumes');
    expect(canon.get('Lamborghini')).toBe('Lamborghini');
    expect(canon.get('Tonino Lamborghini')).toBe('Tonino Lamborghini');
    expect(canon.get('Orchid')).toBe('Orchid');
  });

  it('applies the owner decisions of 4 Oct 2026 and leaves the refused pairs apart', () => {
    const canon = buildBrandCanon([
      'Al Rehab', 'Al Rehab Crown Perfumes', 'Risala', 'Risala Elite', 'Alwataniah', 'al wataniah Perfume',
      'Sillage D\'Orient', 'Signature Sillage D\'Orient', 'New Brand', 'New Brand Perfumes', 'New Brand Prestige',
      'Floral Street', 'Floral Street x Bridgerton', 'Essential Parfums', 'Essential Perfumes', 'Lamborghini',
      'Tonino Lamborghini', 'Orchid', 'Gulf Orchid',
    ]);
    expect(canon.get('Al Rehab Crown Perfumes')).toBe('Al Rehab');
    expect(canon.get('Risala Elite')).toBe('Risala');
    expect(canon.get('al wataniah Perfume')).toBe('Alwataniah');
    expect(canon.get('Signature Sillage D\'Orient')).toBe('Sillage D\'Orient');
    expect(canon.get('New Brand Perfumes')).toBe('New Brand');
    expect(canon.get('New Brand Prestige')).toBe('New Brand');
    expect(canon.get('Floral Street x Bridgerton')).toBe('Floral Street');
    // Refused: different houses, or not shown to be one.
    expect(canon.get('Essential Perfumes')).toBe('Essential Perfumes');
    expect(canon.get('Essential Parfums')).toBe('Essential Parfums');
    expect(canon.get('Tonino Lamborghini')).toBe('Tonino Lamborghini');
    expect(canon.get('Orchid')).toBe('Orchid');
    expect(canon.get('Gulf Orchid')).toBe('Gulf Orchid');
  });

  it('adds no Intense strength anywhere: a brand merge touches brand names only', () => {
    for (const [from, to] of BRAND_MERGES) {
      expect(`${from} ${to}`).not.toMatch(/\bintense\b/i);
    }
  });
});

describe('Bvlgari and the spelling sweep of 6 Oct 2026', () => {
  it('folds Bulgari, whatever the casing, into Bvlgari', () => {
    const canon = buildBrandCanon(['Bvlgari', 'BVLGARI', 'Bulgari', 'BULGARI']);
    for (const name of ['Bvlgari', 'BVLGARI', 'Bulgari', 'BULGARI']) expect(canon.get(name), name).toBe('Bvlgari');
  });

  it('folds the trailing word variants into the house name and leaves Essential apart', () => {
    const canon = buildBrandCanon([
      'Maison Francis Kurkdjian', 'Maison Francis Kurkdjian Paris', 'Lattafa', 'Lattafa Perfume', 'Dumont',
      'Dumont Paris', 'Versatile', 'Versatile Paris', 'Essential Parfums', 'Essential Perfumes',
    ]);
    expect(canon.get('Maison Francis Kurkdjian Paris')).toBe('Maison Francis Kurkdjian');
    expect(canon.get('Lattafa Perfume')).toBe('Lattafa');
    expect(canon.get('Dumont')).toBe('Dumont Paris');
    expect(canon.get('Versatile Paris')).toBe('Versatile');
    expect(canon.get('Essential Perfumes')).toBe('Essential Perfumes');
  });

  it('sends the old Bulgari brand page to Bvlgari', () => {
    expect(matchRoute('/brands/bulgari')).toMatchObject({ name: 'brand', param: 'bvlgari' });
    expect(matchRoute('/brands/bvlgari')).toMatchObject({ name: 'brand', param: 'bvlgari' });
  });

  it('gives both spellings the same logo and the same site', () => {
    expect(logoFor('Bulgari')).not.toBeNull();
    expect(logoFor('Bulgari')).toBe(logoFor('Bvlgari'));
    expect(logoFor('BULGARI')).toBe(logoFor('Bvlgari'));
    expect(officialSiteFor('Bulgari')).toEqual(officialSiteFor('Bvlgari'));
    expect(officialSiteFor('Bvlgari')).not.toBeNull();
  });
});

describe('old brand addresses', () => {
  it('open the merged brand instead of a not found', () => {
    expect(matchRoute('/brands/kayali-uk')).toMatchObject({ name: 'brand', param: 'kayali' });
    expect(matchRoute('/brands/thierry-mugler')).toMatchObject({ name: 'brand', param: 'mugler' });
    expect(matchRoute('/brands/tiffany')).toMatchObject({ name: 'brand', param: 'tiffany-and-co' });
    expect(matchRoute('/brands/boss')).toMatchObject({ name: 'brand', param: 'hugo-boss' });
  });

  it('leaves a current brand address, and an unknown one, alone', () => {
    expect(matchRoute('/brands/kayali')).toMatchObject({ name: 'brand', param: 'kayali' });
    expect(matchRoute('/brands/no-such-house')).toMatchObject({ name: 'brand', param: 'no-such-house' });
  });

  it('has an entry for every merge whose address would otherwise change', () => {
    for (const [from, to] of BRAND_MERGES) {
      if (slugify(from) === slugify(to)) continue;
      expect(BRAND_ALIAS_SLUGS[slugify(from)], from).toBe(slugify(to));
    }
  });

  it('never redirects an address that is itself a kept brand', () => {
    const kept = new Set(BRAND_MERGES.map(([, to]) => slugify(to)));
    for (const slug of Object.keys(BRAND_ALIAS_SLUGS)) expect(kept.has(slug), slug).toBe(false);
  });
});

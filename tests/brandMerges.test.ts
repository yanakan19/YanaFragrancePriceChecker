import { describe, expect, it } from 'vitest';
import { BRAND_MERGES, HAND_ALIASES, KNOWN_ALIASES, brandKey, buildBrandCanon } from '../src/catalogue/brandName.js';
import { BRAND_ALIAS_SLUGS, matchRoute, slugify } from '../demo/router.js';

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
      'Maison Margiela', 'Margiela', 'Al Haramain', 'Al Rehab', 'Al Rehab Crown Perfumes', 'Essential Parfums',
      'Essential Perfumes', 'New Brand', 'New Brand Prestige', 'Lamborghini', 'Tonino Lamborghini',
      'Collection Prestige', 'Designer Collection', 'Designer Fragrances', 'Orchid', 'Gulf Orchid',
    ]);
    expect(canon.get('Maison Margiela')).toBe('Maison Margiela');
    expect(canon.get('Margiela')).toBe('Margiela');
    expect(canon.get('Al Haramain')).toBe('Al Haramain');
    expect(canon.get('Al Rehab')).toBe('Al Rehab');
    expect(canon.get('Al Rehab Crown Perfumes')).toBe('Al Rehab Crown Perfumes');
    expect(canon.get('Essential Parfums')).toBe('Essential Parfums');
    expect(canon.get('Essential Perfumes')).toBe('Essential Perfumes');
    expect(canon.get('New Brand Prestige')).toBe('New Brand Prestige');
    expect(canon.get('Lamborghini')).toBe('Lamborghini');
    expect(canon.get('Orchid')).toBe('Orchid');
  });

  it('adds no Intense strength anywhere: a brand merge touches brand names only', () => {
    for (const [from, to] of BRAND_MERGES) {
      expect(`${from} ${to}`).not.toMatch(/\bintense\b/i);
    }
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

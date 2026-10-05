import { describe, expect, it } from 'vitest';
import { matchFragranticaUrl } from '../src/catalogue/fragranceLinkMatch.js';
import { auditFragranticaLink, classifyFragranticaUrl } from '../src/catalogue/fragranticaAudit.js';
import { indexReview, matchFragranticaChecked, NO_REVIEW, reviewRefusal } from '../src/catalogue/fragranticaReview.js';

const U = (path: string) => `https://www.fragrantica.com/perfume/${path}.html`;

describe('classifyFragranticaUrl', () => {
  it.each([
    [U('Dior/Sauvage-31861'), 'direct'],
    ['https://www.fragrantica.fr/perfume/Dior/Sauvage-31861.html', 'direct'],
    ['https://www.fragrantica.com/search/?query=Dior%20Sauvage', 'search'],
    ['https://www.fragrantica.com/search/', 'search'],
    ['https://www.fragrantica.com/designers/Dior.html', 'search'],
    ['https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html?utm_source=x', 'search'],
    ['https://www.fragrantica.com/perfume/Dior/', 'malformed'],
    ['https://www.fragrantica.com/perfume/Dior/Sauvage.html', 'malformed'],
    ['https://www.fragrantica.com/news/Dior-Sauvage-1.html', 'malformed'],
    ['http://www.fragrantica.com/perfume/Dior/Sauvage-31861.html', 'malformed'],
    ['https://www.parfumo.com/Perfumes/Dior/Sauvage', 'malformed'],
    ['not a url', 'malformed'],
  ])('%s is %s', (url, cls) => {
    expect(classifyFragranticaUrl(url)).toBe(cls);
  });
});

describe('matchFragranticaUrl: what a page that names no strength may stand for', () => {
  const eros = (name: string, concentration: string) => ({ brand: 'Versace', name, concentration });

  it('stands for an Eau de Toilette, an Eau de Parfum or an unknown strength of the same name', () => {
    for (const c of ['Eau de Toilette', 'Eau de Parfum', 'Not stated']) {
      expect(matchFragranticaUrl(U('Versace/Eros-16657'), eros('Eros', c))?.quality, c).toBe('base');
    }
  });

  it('does not stand for a Parfum, an Extrait or a Cologne, which Fragrantica lists on pages of their own', () => {
    for (const c of ['Parfum', 'Extrait de Parfum', 'Eau de Cologne']) {
      expect(matchFragranticaUrl(U('Versace/Eros-16657'), eros('Eros', c)), c).toBeNull();
    }
  });

  it('does not stand for a product whose own name says Parfum or Cologne', () => {
    expect(matchFragranticaUrl(U('Versace/Eros-16657'), eros('Eros Parfum', 'Eau de Parfum'))).toBeNull();
    expect(matchFragranticaUrl(U('Creed/Aventus-9828'), { brand: 'Creed', name: 'Aventus Cologne', concentration: 'Eau de Parfum' })).toBeNull();
    expect(matchFragranticaUrl(U('Tom-Ford/Black-Orchid-1018'), { brand: 'Tom Ford', name: 'Black Orchid Parfum', concentration: 'Eau de Parfum' })).toBeNull();
  });

  it('takes the page that does name the strength', () => {
    expect(matchFragranticaUrl(U('Versace/Eros-Parfum-70090'), eros('Eros Parfum', 'Eau de Parfum'))?.quality).toBe('exact');
    expect(matchFragranticaUrl(U('Versace/Eros-Parfum-70090'), eros('Eros', 'Parfum'))?.quality).toBe('exact');
    expect(matchFragranticaUrl(U('Versace/Eros-Eau-de-Parfum-62762'), eros('Eros', 'Eau de Parfum'))?.quality).toBe('exact');
  });

  it('keeps Eau Fraiche apart from the original: both sides state it or neither does', () => {
    const wt = (name: string) => ({ brand: 'Elizabeth Arden', name, concentration: 'Eau de Toilette' });
    expect(matchFragranticaUrl(U('Elizabeth-Arden/White-Tea-42439'), wt('White Tea Eau Fraiche'))).toBeNull();
    expect(matchFragranticaUrl(U('Elizabeth-Arden/White-Tea-Eau-Fraiche-79933'), wt('White Tea'))).toBeNull();
    expect(matchFragranticaUrl(U('Elizabeth-Arden/White-Tea-Eau-Fraiche-79933'), wt('White Tea Eau Fraiche'))?.quality).toBe('base');
    // a perfume whose own name carries it is still matched by that name
    expect(matchFragranticaUrl(U('Versace/Versace-Man-Eau-Fraiche-644'), { brand: 'Versace', name: 'Man Eau Fraiche', concentration: 'Eau de Toilette' })?.quality).toBe('base');
  });

  it('refuses a stronger page for a product whose strength is not stated unless the name says so', () => {
    const escentric = { brand: 'Escentric Molecules', name: 'Escentric 02', concentration: 'Not stated' };
    expect(matchFragranticaUrl(U('Escentric-Molecules/Escentric-02-Extrait-112764'), escentric)).toBeNull();
    expect(matchFragranticaUrl(U('Escentric-Molecules/Escentric-02-3607'), escentric)?.quality).toBe('base');
    // a page naming Eau de Parfum for an unknown strength is still a reasonable "loose" page
    expect(matchFragranticaUrl(U('Dior/Sauvage-Eau-de-Parfum-48100'), { brand: 'Dior', name: 'Sauvage', concentration: 'Not stated' })?.quality).toBe('loose');
  });

  it('accepts a base page for a Parfum only where the review says the page is the perfume\'s only one', () => {
    const wanted = { brand: 'Khadlaj', name: 'Island', concentration: 'Extrait de Parfum' };
    const url = U('Khadlaj-Perfumes/Island-102362');
    expect(matchFragranticaUrl(url, wanted)).toBeNull();
    expect(matchFragranticaUrl(url, wanted, { singlePage: true })?.quality).toBe('base');
    const index = indexReview({ ...NO_REVIEW, singlePage: [{ brand: 'Khadlaj', name: 'Island', url }] });
    expect(matchFragranticaChecked(url, wanted, index)?.quality).toBe('base');
    expect(matchFragranticaChecked(url, wanted, indexReview(NO_REVIEW))).toBeNull();
  });
});

describe('the review', () => {
  const url = U('Armaf/Club-de-Nuit-Intense-27656');
  const index = indexReview({
    ...NO_REVIEW,
    wrong: [{ brand: 'Armaf', name: 'Club De Nuit Intense', url, why: 'women\'s page' }],
    pageGender: { 'Burberry/London-813': 'women', 'Calvin-Klein/Escape-for-Men-272': 'men' },
  });

  it('refuses a reviewed wrong page for that brand and name, whatever the spelling, and no other', () => {
    expect(reviewRefusal(url, { brand: 'Armaf', name: 'club de nuit intense', concentration: 'Eau de Toilette' }, index)).toMatch(/wrong page/);
    expect(reviewRefusal(url, { brand: 'Armaf', name: 'Club de Nuit Intense Woman', concentration: 'Eau de Parfum' }, index)).toBeNull();
    expect(matchFragranticaChecked(url, { brand: 'Armaf', name: 'Club De Nuit Intense', concentration: 'Eau de Toilette' }, index)).toBeNull();
  });

  it('never sends a men\'s perfume to a page for women, or the other way round', () => {
    const london = { brand: 'Burberry', name: 'London', concentration: 'Eau de Toilette' };
    expect(reviewRefusal(U('Burberry/London-813'), { ...london, gender: 'mens' }, index)).toMatch(/for women/);
    expect(reviewRefusal(U('Burberry/London-813'), { ...london, gender: 'womens' }, index)).toBeNull();
    expect(reviewRefusal(U('Burberry/London-813'), { ...london, gender: 'unisex' }, index)).toBeNull();
    expect(reviewRefusal(U('Burberry/London-813'), london, index)).toBeNull();
    const escape = { brand: 'Calvin Klein', name: 'Escape for Men', concentration: 'Eau de Toilette' };
    expect(reviewRefusal(U('Calvin-Klein/Escape-for-Men-272'), { ...escape, gender: 'womens' }, index)).toMatch(/for men/);
  });
});

describe('auditFragranticaLink', () => {
  const ok = (url: string, brand: string, name: string, concentration = 'Eau de Parfum', gender: 'mens' | 'womens' | 'unisex' | null = null) =>
    auditFragranticaLink(url, { brand, name, concentration, gender });

  it('passes the right designer and perfume, ignoring accents, case, sizes and edition words', () => {
    expect(ok(U('Dior/Sauvage-31861'), 'Dior', 'Sauvage', 'Eau de Toilette').verdict).toBe('match');
    expect(ok(U('Hermes/Terre-d-Hermes-17'), 'Hermès', 'Terre d’Hermès', 'Eau de Toilette').verdict).toBe('match');
    expect(ok(U('Carolina-Herrera/Good-Girl-39681'), 'Carolina Herrera', 'Good Girl 1 Oz').verdict).toBe('match');
    expect(ok(U('Yves-Saint-Laurent/Black-Opium-25324'), 'Yves Saint Laurent', 'YSL Black Opium 3 Oz').verdict).toBe('match');
  });

  it('fails a different flanker, a different designer and an unrelated perfume', () => {
    expect(ok(U('Rabanne/Invictus-Victory-1'), 'Rabanne', 'Invictus').verdict).toBe('mismatch');
    expect(ok(U('Dior/Sauvage-Elixir-68415'), 'Dior', 'Sauvage').verdict).toBe('mismatch');
    expect(ok(U('Zara/Sauvage-999'), 'Dior', 'Sauvage').verdict).toBe('mismatch');
    expect(ok(U('Dior/Poison-1'), 'Dior', 'Sauvage').verdict).toBe('mismatch');
  });

  it('fails a different strength and a page that is not a perfume page at all', () => {
    expect(ok(U('Dior/Sauvage-Eau-de-Parfum-48100'), 'Dior', 'Sauvage', 'Eau de Toilette').verdict).toBe('mismatch');
    expect(ok(U('Dior/Sauvage-31861'), 'Dior', 'Sauvage', 'Parfum').verdict).toBe('mismatch');
    expect(ok('https://www.fragrantica.com/search/?query=Dior%20Sauvage', 'Dior', 'Sauvage').verdict).toBe('mismatch');
  });

  it('fails a page for the other gender, by the slug or by the product', () => {
    expect(ok(U('Calvin-Klein/Escape-for-Men-272'), 'Calvin Klein', 'Escape for Women').verdict).toBe('mismatch');
    const review = indexReview({ ...NO_REVIEW, pageGender: { 'Calvin-Klein/Escape-271': 'women' } });
    expect(
      auditFragranticaLink(U('Calvin-Klein/Escape-271'), { brand: 'Calvin Klein', name: 'Escape', concentration: 'Eau de Toilette', gender: 'mens' }, review).verdict,
    ).toBe('mismatch');
  });

  it('raises, rather than passes, a designer folder spelled differently and a page that carries a year', () => {
    expect(ok(U('Arabiyat-Prestige/Nyla-102783'), 'Arabiyat', 'Nyla').verdict).toBe('review');
    expect(ok(U('Tom-Ford/Ombre-Leather-2018-50239'), 'Tom Ford', 'Ombré Leather').verdict).toBe('review');
  });
});

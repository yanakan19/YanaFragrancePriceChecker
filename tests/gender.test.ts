import { describe, expect, it } from 'vitest';
import { GENDER_LABEL, GENDER_ORDER, readGender, readGenderEvidence } from '../demo/gender.js';

/**
 * The gender filter reads product titles, because there is no gender field in
 * this project to read instead. Everything worth pinning here is about the
 * boundary between "a shop said so" and "a shop said nothing", which is the
 * one distinction the whole feature rests on.
 */

describe('readGender: a shop naming an audience', () => {
  it.each([
    ["Issey Miyake L'eau D'issey Pour Homme Eau de Toilette", 'mens'],
    ["Lacoste L'homme Eau de Toilette", 'mens'],
    ['Carolina Herrera 212 Men Eau de Toilette', 'mens'],
    ['Jimmy Choo Man Eau de Toilette', 'mens'],
    ['Jean Paul Gaultier Le Male Elixir Eau de Parfum', 'mens'],
    ['Davidoff Adventure For Him Eau de Toilette', 'mens'],
    ["Jaguar Men's Ultimate Power Eau de Toilette", 'mens'],
    ['Trussardi Uomo Eau de Toilette', 'mens'],
    ['Versace Eros Pour Femme Eau de Parfum', 'womens'],
    ['Hugo Boss Femme Eau de Parfum', 'womens'],
    ['Calvin Klein Eternity Women Eau de Parfum', 'womens'],
    ['Davidoff Cool Water Woman Eau de Toilette', 'womens'],
    ['Rabanne Pure XS for Her Eau de Parfum', 'womens'],
    ['Valentino Born in Roma Donna Eau de Parfum', 'womens'],
    ['Armaf Ladies Club De Nuit White Imperiale Eau de Parfum', 'womens'],
    ['Calvin Klein CK One Unisex Eau de Toilette', 'unisex'],
  ])('%s reads as %s', (title, expected) => {
    expect(readGender(title)).toBe(expected);
  });

  // "men" can never match inside "women" and "male" can never match inside
  // "female": there is no word boundary in either place. This is the single
  // cheapest way for a rule like this to be wrong, so it is pinned.
  it('never reads a feminine word as masculine', () => {
    expect(readGender('Hugo Boss Femme Eau de Parfum')).toBe('womens');
    expect(readGender('Calvin Klein Women Eau de Parfum')).toBe('womens');
    expect(readGender('Test Female Eau de Parfum')).toBe('womens');
  });
});

describe('silence is never unisex', () => {
  // The whole point of the fourth option. Most of the catalogue looks like
  // this, and none of it is a claim about who the bottle is for.
  it.each([
    'Chanel No 5 Eau de Parfum',
    'Dior Sauvage Eau de Toilette',
    'Maison Francis Kurkdjian Baccarat Rouge 540 Extrait',
    'Creed Aventus Eau de Parfum',
    'Lattafa Khamrah Eau de Parfum',
  ])('%s is not stated, not unisex', (title) => {
    expect(readGender(title)).toBe('notStated');
    expect(readGender(title)).not.toBe('unisex');
  });

  it("only the word 'unisex' produces 'unisex'", () => {
    expect(readGender('Bellavita UK White Oud Unisex Perfume')).toBe('unisex');
    // A shared, famously unisex fragrance whose title does not say so. We do
    // not know it from the data, so we do not say it.
    expect(readGender('Escentric Molecules Molecule 01 Eau de Toilette')).toBe('notStated');
    // Nor does an empty string, or a title of nothing but a size.
    expect(readGender('')).toBe('notStated');
    expect(readGender('100ml')).toBe('notStated');
  });

  it('a title stating both audiences at once is unisex only when it says so', () => {
    expect(readGender('Some House Shared Eau de Parfum For Men And Women')).toBe('unisex');
  });

  // Contradictory evidence with no explicit "unisex" is a question the title
  // answers two ways. Neither answer is picked.
  it('contradictory evidence falls back to not stated', () => {
    const twinPack = 'Some House Pour Homme Pour Femme Duo Eau de Toilette';
    expect(readGender(twinPack)).toBe('notStated');
    expect(readGenderEvidence(twinPack).phrase).toBeNull();
  });
});

describe('words that look like evidence and are not', () => {
  // Each of these is a real product in the catalogue, and each was a wrong
  // classification before the exclusion that now covers it.
  it('a singular "Lady" is a character in the name, not an audience', () => {
    expect(readGender('Frederic Malle Portrait Of A Lady Eau de Parfum')).toBe('notStated');
    expect(readGender('Juliette Has a Gun Lady Vengeance Eau de Parfum')).toBe('notStated');
    expect(readGender('Rabanne Lady Million Eau de Parfum')).toBe('notStated');
  });

  it('"No Man\'s Land" is an idiom, not a men\'s fragrance', () => {
    expect(readGender("Byredo Rose Of No Man's Land Eau de Parfum")).toBe('notStated');
  });

  it('Donna Karan is a person, not an audience', () => {
    expect(readGender('DKNY Donna Karan DKNY 24/7 Eau de Toilette')).toBe('notStated');
    // The real Italian use still reads.
    expect(readGender('Lambretta Privato Per Donna No.1 Eau de Parfum')).toBe('womens');
  });

  it('does not match a gender word buried inside another word', () => {
    expect(readGender('Thierry Mugler Womanity Eau de Parfum')).toBe('notStated');
    expect(readGender('Bond No 9 Manhattan Eau de Parfum')).toBe('notStated');
    expect(readGender('Etat Libre Fat Electrician Eau de Toilette')).toBe('notStated');
  });
});

describe('the evidence is reportable', () => {
  // A reading a reader cannot check is a reading they have to take on trust.
  // The phrase behind every classification is the same string printed on the
  // card, and it is returned rather than discarded.
  it('returns the exact words that decided it', () => {
    expect(readGenderEvidence('Versace Eros Pour Femme Eau de Parfum')).toEqual({
      reading: 'womens',
      phrase: 'Pour Femme',
    });
    expect(readGenderEvidence('Calvin Klein CK One Unisex Eau de Toilette')).toEqual({
      reading: 'unisex',
      phrase: 'Unisex',
    });
  });

  it('reports no phrase when nothing was stated', () => {
    expect(readGenderEvidence('Dior Sauvage Eau de Toilette')).toEqual({
      reading: 'notStated',
      phrase: null,
    });
  });
});

describe('the four options', () => {
  it('offers not stated last, and labels every reading in words', () => {
    expect([...GENDER_ORDER]).toEqual(['womens', 'mens', 'unisex', 'notStated']);
    expect(GENDER_ORDER.at(-1)).toBe('notStated');
    for (const reading of GENDER_ORDER) {
      expect(GENDER_LABEL[reading]).toBeTruthy();
    }
  });

  // Colour is never the only carrier: the label for each option is a word,
  // and "Not stated" is worded as what it is rather than as a gender.
  it('never labels the unstated group as unisex', () => {
    expect(GENDER_LABEL.notStated).toBe('Not stated');
    expect(GENDER_LABEL.notStated).not.toMatch(/unisex/i);
  });
});

import { describe, expect, it } from 'vitest';
import { brandKey, pickBrandName, buildBrandCanon } from '../src/catalogue/brandName.js';

describe('brandKey', () => {
  it('ignores the decoration shops disagree about', () => {
    expect(brandKey('Dolce & Gabbana')).toBe(brandKey('Dolce&Gabbana'));
    expect(brandKey('DOLCE&GABBANA')).toBe(brandKey('Dolce & Gabbana'));
    expect(brandKey('Joop!')).toBe(brandKey('Joop'));
  });

  it('never merges two genuinely different names', () => {
    expect(brandKey('Armaf')).not.toBe(brandKey('Armaf Online Shop'));
    expect(brandKey('Creed')).not.toBe(brandKey('Creeds'));
  });
});

describe('pickBrandName', () => {
  it('prefers ordinary case over shouting, even when shouting is far more common', () => {
    // The real numbers: one large catalogue shouts its vendor field, so "ARMAF"
    // outnumbers "Armaf" 195 to 12. Volume is not authority.
    expect(pickBrandName(new Map([['ARMAF', 195], ['Armaf', 12]]))).toBe('Armaf');
    expect(pickBrandName(new Map([['HUGO BOSS', 31], ['Hugo Boss', 89]]))).toBe('Hugo Boss');
    expect(pickBrandName(new Map([['AFNAN', 3], ['Afnan', 9]]))).toBe('Afnan');
  });

  it('keeps genuinely capitalised brands capitalised', () => {
    // No mixed-case spelling exists, so there is nothing to prefer over it.
    // Title casing would invent "Dkny", which is simply wrong.
    expect(pickBrandName(new Map([['DKNY', 40]]))).toBe('DKNY');
    expect(pickBrandName(new Map([['YSL', 5]]))).toBe('YSL');
  });

  it('breaks ties between equally cased spellings by how often shops used them', () => {
    expect(
      pickBrandName(new Map([['Dolce&Gabbana', 4], ['Dolce & Gabbana', 78]])),
    ).toBe('Dolce & Gabbana');
  });

  it('is deterministic when frequency ties too', () => {
    const a = pickBrandName(new Map([['Bbb', 2], ['Aaa', 2]]));
    const b = pickBrandName(new Map([['Aaa', 2], ['Bbb', 2]]));
    expect(a).toBe(b);
  });
});

describe('buildBrandCanon', () => {
  it('maps every spelling in a group to the chosen one', () => {
    const canon = buildBrandCanon([
      ...Array(195).fill('ARMAF'), ...Array(12).fill('Armaf'),
      ...Array(3).fill('AFNAN'), ...Array(9).fill('Afnan'),
      'DKNY',
    ]);
    expect(canon.get('ARMAF')).toBe('Armaf');
    expect(canon.get('Armaf')).toBe('Armaf');
    expect(canon.get('AFNAN')).toBe('Afnan');
    expect(canon.get('Afnan')).toBe('Afnan');
    expect(canon.get('DKNY')).toBe('DKNY');
  });

  it('ignores blanks without creating an empty brand', () => {
    const canon = buildBrandCanon(['Armaf', '', '   ', '!!!']);
    expect(canon.has('')).toBe(false);
    expect(canon.get('Armaf')).toBe('Armaf');
  });

  it('folds known aliases the mechanical grouping cannot see on its own', () => {
    const canon = buildBrandCanon([
      'Ysl', 'Yves Saint Laurent',
      'Donna Karan', 'DKNY',
      'Paco Rabanne', 'Rabanne',
      'Armani', 'Giorgio Armani',
      'Dunhill London', 'Dunhill',
      'Estee Lauder', 'Estée Lauder',
      'Lancome', 'Lancôme',
      'Hermes', 'Hermès',
    ]);
    expect(canon.get('Ysl')).toBe('Yves Saint Laurent');
    expect(canon.get('Yves Saint Laurent')).toBe('Yves Saint Laurent');
    expect(canon.get('Donna Karan')).toBe('DKNY');
    expect(canon.get('DKNY')).toBe('DKNY');
    expect(canon.get('Paco Rabanne')).toBe('Rabanne');
    expect(canon.get('Armani')).toBe('Giorgio Armani');
    expect(canon.get('Giorgio Armani')).toBe('Giorgio Armani');
    expect(canon.get('Dunhill London')).toBe('Dunhill');
    expect(canon.get('Estee Lauder')).toBe('Estée Lauder');
    expect(canon.get('Estée Lauder')).toBe('Estée Lauder');
    expect(canon.get('Lancome')).toBe('Lancôme');
    expect(canon.get('Hermes')).toBe('Hermès');
  });

  it('leaves Emporio Armani alone rather than folding it into Giorgio Armani', () => {
    const canon = buildBrandCanon(['Armani', 'Emporio Armani']);
    expect(canon.get('Armani')).toBe('Giorgio Armani');
    expect(canon.get('Emporio Armani')).toBe('Emporio Armani');
  });

  // One feed puts the product line in the brand field, producing 51 separate
  // "Armaf - X" brand strings — measured against demo/catalogue.generated.ts
  // on 2026-08-21 (see the KNOWN_ALIASES comment above this table's Armaf
  // block for the full count and the sample-checking that ruled out any of
  // the 51 being a genuinely different house). A representative sample here,
  // not all 51 — the block above is the authoritative list.
  it('folds the "Armaf - <line>" feed artefact into plain Armaf, not 51 separate houses', () => {
    const canon = buildBrandCanon([
      'Armaf', 'Armaf - Club De Nuit', 'Armaf - Derby', 'Armaf - Ego',
      "Armaf - L'Homme", 'Armaf - Lions Club', 'Armaf - SHK',
    ]);
    expect(canon.get('Armaf - Club De Nuit')).toBe('Armaf');
    expect(canon.get('Armaf - Derby')).toBe('Armaf');
    expect(canon.get('Armaf - Ego')).toBe('Armaf');
    expect(canon.get("Armaf - L'Homme")).toBe('Armaf');
    expect(canon.get('Armaf - Lions Club')).toBe('Armaf');
    expect(canon.get('Armaf - SHK')).toBe('Armaf');
    expect(canon.get('Armaf')).toBe('Armaf');
  });

  it('does not fold an unrelated brand that merely shares the Armaf prefix', () => {
    // brandKey already keeps 'Armaf' and 'Armaf Online Shop' apart (see
    // brandKey's own test above); this checks the alias table does not
    // accidentally widen that back out for a string the fold was never
    // measured against.
    const canon = buildBrandCanon(['Armaf', 'Armaf Online Shop']);
    expect(canon.get('Armaf Online Shop')).toBe('Armaf Online Shop');
  });
});

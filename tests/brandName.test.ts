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
});

import { describe, it, expect } from 'vitest';
import { cleanBarcode, hasCheckDigit, readBarcode } from '../src/catalogue/barcode.js';
import { isBarcode, normalizedEan } from '../src/catalogue/productMatch.js';

/**
 * What a shop's barcode field must be before it is stored as an `ean`. The real
 * codes here were read from Perfume Direct's product files on 2026-10-05 (the
 * three Bvlgari Splendida Patchouli Tentation sizes) and from Dior Dune's
 * stored listing at other shops (3348900103870); the rest are made up to hit
 * each refusal, and say so.
 */

describe('a real barcode is kept', () => {
  it('keeps an EAN-13 as it is', () => {
    expect(cleanBarcode('3348900103870')).toBe('3348900103870');
  });

  it('stores a 12 digit UPC-A as the EAN-13 it is, with a zero in front', () => {
    // 769915234053 is the UPC-A Perfume Direct holds for The Ordinary's Glycolic Acid toner.
    expect(cleanBarcode('769915234053')).toBe('0769915234053');
  });

  it('reads a UPC-A and the same code padded to 13 digits as one code', () => {
    const fromUpc = cleanBarcode('783320411274');
    const fromEan = cleanBarcode('0783320411274');
    expect(fromUpc).toBe('0783320411274');
    expect(fromEan).toBe(fromUpc);
    expect(normalizedEan(fromUpc!)).toBe(normalizedEan('783320411274'));
  });

  it('reads the three sizes of a real Perfume Direct product', () => {
    expect(['0783320411182', '0783320411175', '0783320411274'].map(cleanBarcode)).toEqual([
      '0783320411182',
      '0783320411175',
      '0783320411274',
    ]);
  });

  it('keeps an EAN-8, and drops the zero of a GTIN-14 whose indicator is 0', () => {
    expect(cleanBarcode('96385074')).toBe('96385074');
    expect(cleanBarcode('03348900103870')).toBe('3348900103870');
  });

  it('ignores spaces and hyphens the shop typed inside a code', () => {
    expect(cleanBarcode(' 3348900103870 ')).toBe('3348900103870');
    expect(cleanBarcode('334890-010387-0')).toBe('3348900103870');
  });

  it('is accepted by the matcher’s own test, so the build uses it like any shop’s barcode', () => {
    for (const code of ['3348900103870', '769915234053', '783320411274']) {
      expect(isBarcode(cleanBarcode(code))).toBe(true);
    }
  });
});

describe('a field that is not a barcode is refused', () => {
  const refusal = (raw: unknown) => readBarcode(raw).refusal;

  it('refuses nothing at all, null and a blank field as empty', () => {
    expect(refusal(null)).toBe('empty');
    expect(refusal(undefined)).toBe('empty');
    expect(refusal('')).toBe('empty');
    expect(refusal('   ')).toBe('empty');
  });

  it('refuses the placeholders a shop types in', () => {
    expect(cleanBarcode('0')).toBeNull();
    expect(cleanBarcode('000000000000')).toBeNull();
    expect(cleanBarcode('0000000000000')).toBeNull();
    expect(refusal('0000000000000')).toBe('placeholder');
    // The same digit all the way along, with the one check digit that makes it pass.
    const same = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => d.repeat(13)).filter(hasCheckDigit);
    expect(same.length).toBeGreaterThan(0);
    for (const code of same) expect(refusal(code), code).toBe('placeholder');
    expect(refusal('1234567890128')).toBe('placeholder');
    expect(refusal('9876543210987')).not.toBeNull();
  });

  it('refuses a code with a wrong check digit', () => {
    expect(refusal('3348900103871')).toBe('check-digit');
    expect(refusal('769915234054')).toBe('check-digit');
  });

  it('refuses a code of the wrong length without guessing at a lost zero', () => {
    expect(refusal('83320411274')).toBe('length'); // 11 digits: a UPC-A that lost its zero
    expect(refusal('33489001038700')).not.toBeNull();
    expect(refusal('123')).toBe('length');
    expect(refusal('334890010387012345')).toBe('length');
  });

  it('refuses text: a SKU, a supplier code, a code with a letter in it', () => {
    expect(refusal('50509PD')).toBe('not-digits');
    expect(refusal('N/A')).toBe('not-digits');
    expect(refusal('33489001O3870')).toBe('not-digits');
  });

  it('refuses a GTIN-14 whose indicator names a case, not a bottle', () => {
    // 1 + the 13 digits of Dior Dune, with the check digit recomputed.
    const caseCode = '13348900103877';
    expect(hasCheckDigit(caseCode)).toBe(true);
    expect(refusal(caseCode)).toBe('case-level-gtin');
  });

  it('refuses a number with its leading zeros lost to JSON', () => {
    // 0783320411274 sent as a JSON number reads 783320411274, which is a valid UPC-A:
    // that is the same code, so it is kept as the 13 digit form.
    expect(cleanBarcode(783320411274)).toBe('0783320411274');
    // 0083320411274 would read 83320411274, 11 digits: refused, never padded by a guess.
    expect(refusal(83320411274)).toBe('length');
  });

  it('refuses the prefixes GS1 never issues for a product on a shelf', () => {
    // Made up: valid check digits on in-store, restricted and coupon prefixes.
    for (const body of ['200123456789', '215837490261', '977123456789', '990000123456', '020123456789']) {
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
      const code = `${body}${(10 - (sum % 10)) % 10}`;
      expect(hasCheckDigit(code), code).toBe(true);
      expect(refusal(code), code).toBe('not-issued');
    }
  });
});

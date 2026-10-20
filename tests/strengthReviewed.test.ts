import { describe, expect, it } from 'vitest';
import { HOUSE_STRENGTH_EVIDENCE } from '../src/catalogue/houseStrengthEvidence.js';
import { STRENGTHS_BRAND_MAKES_SEVERAL } from '../src/catalogue/strengthReviewed.js';
import { brandKey } from '../src/catalogue/brandName.js';
import { concentration } from '../src/catalogue/productName.js';
import { settleHouseConcentrations } from '../src/catalogue/productMatch.js';
import { RETAILERS } from '../src/config/retailers.js';

const key = (brand: string, name: string) => `${brandKey(brand)}|${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;

describe('the 2026-10-20 strength review', () => {
  it('every merge entry names the brand\'s own https page, a quote and a day', () => {
    for (const e of HOUSE_STRENGTH_EVIDENCE) {
      expect(e.source, `${e.brand} ${e.name}`).toMatch(/^https:\/\/[^/]+\.[a-z]+\//);
      expect(e.quote.length, `${e.brand} ${e.name}`).toBeGreaterThan(20);
      expect(e.readAt, `${e.brand} ${e.name}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.sizesMl.length, `${e.brand} ${e.name}`).toBeGreaterThan(0);
    }
  });

  it('never merges a family the brand makes in several strengths', () => {
    const merged = new Set(HOUSE_STRENGTH_EVIDENCE.map((e) => key(e.brand, e.name)));
    for (const s of STRENGTHS_BRAND_MAKES_SEVERAL) {
      expect(merged.has(key(s.brand, s.name)), `${s.brand} ${s.name} is settled to one strength`).toBe(false);
    }
  });

  it('records two or more distinct strengths, a brand page and a day for every kept family, once each', () => {
    const seen = new Set<string>();
    for (const s of STRENGTHS_BRAND_MAKES_SEVERAL) {
      expect(new Set(s.strengths).size, `${s.brand} ${s.name}`).toBeGreaterThanOrEqual(2);
      expect(s.source, `${s.brand} ${s.name}`).toMatch(/^https:\/\//);
      expect(s.evidence.length).toBeGreaterThan(20);
      expect(s.readAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const k = key(s.brand, s.name);
      expect(seen.has(k), `${s.brand} ${s.name} twice`).toBe(false);
      seen.add(k);
    }
  });

  it('settles one bottle once: no brand, name and size appears twice in the merge list', () => {
    const seen = new Set<string>();
    for (const e of HOUSE_STRENGTH_EVIDENCE) {
      for (const size of e.sizesMl) {
        const k = `${key(e.brand, e.name)}|${size}`;
        expect(seen.has(k), k).toBe(false);
        seen.add(k);
      }
    }
  });
});

describe('the causes found by the review', () => {
  it('reads "Eau de Perfume" as an Eau de Parfum', () => {
    expect(concentration('Calvin Klein Eternity Moment Eau De Perfume Spray 100ml')).toBe('Eau de Parfum');
  });

  it('lets a reviewed brand statement stand beside a silent house listing, but not beside a different strength', () => {
    const silent = { key: 'k', stated: 'Not stated' };
    expect(settleHouseConcentrations([silent, { key: 'k', stated: 'Eau de Parfum' }]).size).toBe(0);
    expect(settleHouseConcentrations([silent, { key: 'k', stated: 'Eau de Parfum', reviewed: true }]).get('k')).toBe('Eau de Parfum');
    expect(
      settleHouseConcentrations([{ key: 'k', stated: 'Parfum' }, { key: 'k', stated: 'Eau de Parfum', reviewed: true }]).size,
    ).toBe(0);
  });

  it('never reads Roullier White\'s importer tag as a house', () => {
    expect(RETAILERS.find((r) => r.id === 'roullier-white')?.vendorsNotBrands).toContain('PMD');
  });
});

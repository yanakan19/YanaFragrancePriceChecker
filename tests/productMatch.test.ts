import { describe, expect, it } from 'vitest';
import { matchKey, findDuplicateGroups, type MatchableProduct } from '../src/catalogue/productMatch.js';

const p = (o: Partial<MatchableProduct> & { id: string }): MatchableProduct => ({
  brand: 'Afnan',
  name: 'Supremacy In Extrait De Parfum',
  concentration: 'Oud',
  sizeMl: 100,
  ean: null,
  ...o,
});

describe('product matching', () => {
  describe('the reported duplicate', () => {
    // Verbatim from demo/catalogue.generated.ts: the same bottle listed twice
    // at £38.99 and £50.00 because only one shop published the barcode.
    const beautyBase = p({ id: 'ean-6290171070207', ean: '6290171070207' });
    const justmylook = p({ id: 'justmylook-afnn0005', ean: null });

    it('recognises them as one bottle', () => {
      const groups = findDuplicateGroups([beautyBase, justmylook]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.absorbed.map((x) => x.id)).toEqual(['justmylook-afnn0005']);
    });

    it('keeps the record that carries the barcode', () => {
      const groups = findDuplicateGroups([justmylook, beautyBase]);
      expect(groups[0]!.canonical.id).toBe('ean-6290171070207');
    });
  });

  describe('what counts as the same bottle', () => {
    it('ignores the word order shops disagree about', () => {
      // Also real: "Supremacy Pour Homme Silver" vs "Supremacy Silver Pour Homme".
      const a = p({ id: 'a', name: 'Supremacy Pour Homme Silver', concentration: 'Eau de Parfum' });
      const b = p({ id: 'b', name: 'Supremacy Silver Pour Homme', concentration: 'Eau de Parfum' });
      expect(matchKey(a)).toBe(matchKey(b));
    });

    it('ignores punctuation and casing', () => {
      expect(matchKey(p({ id: 'a', name: "Bade'e Al-Oud" }))).toBe(
        matchKey(p({ id: 'b', name: 'BADEE AL OUD' })),
      );
    });

    it('ignores the brand spellings feeds disagree about', () => {
      expect(matchKey(p({ id: 'a', brand: 'ARMAF' }))).toBe(matchKey(p({ id: 'b', brand: 'Armaf' })));
    });
  });

  describe('what must stay separate', () => {
    it('keeps different sizes apart', () => {
      const groups = findDuplicateGroups([p({ id: 'a', sizeMl: 100 }), p({ id: 'b', sizeMl: 150 })]);
      expect(groups).toHaveLength(0);
    });

    it('keeps different concentrations apart', () => {
      const groups = findDuplicateGroups([
        p({ id: 'a', concentration: 'Eau de Parfum' }),
        p({ id: 'b', concentration: 'Extrait' }),
      ]);
      expect(groups).toHaveLength(0);
    });

    it('keeps different houses apart', () => {
      const groups = findDuplicateGroups([p({ id: 'a', brand: 'Afnan' }), p({ id: 'b', brand: 'Armaf' })]);
      expect(groups).toHaveLength(0);
    });

    it('keeps genuinely different names apart', () => {
      const groups = findDuplicateGroups([
        p({ id: 'a', name: 'Supremacy Silver' }),
        p({ id: 'b', name: 'Supremacy Not Only' }),
      ]);
      expect(groups).toHaveLength(0);
    });

    it('never overrules two barcodes that disagree', () => {
      // A reformulation shares its name, size and concentration with the
      // original and is a different article. The manufacturer said so.
      const groups = findDuplicateGroups([
        p({ id: 'a', ean: '1111111111111' }),
        p({ id: 'b', ean: '2222222222222' }),
      ]);
      expect(groups).toHaveLength(0);
    });

    it('leaves an EAN-less listing alone when the barcodes around it disagree', () => {
      const groups = findDuplicateGroups([
        p({ id: 'a', ean: '1111111111111' }),
        p({ id: 'b', ean: '2222222222222' }),
        p({ id: 'c', ean: null }),
      ]);
      expect(groups).toHaveLength(0);
    });
  });

  describe('grouping', () => {
    it('folds three shops into one product', () => {
      const groups = findDuplicateGroups([
        p({ id: 'a', ean: '1111111111111' }),
        p({ id: 'b' }),
        p({ id: 'c' }),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.absorbed).toHaveLength(2);
    });

    it('reports nothing when every product is already distinct', () => {
      const groups = findDuplicateGroups([p({ id: 'a', sizeMl: 50 }), p({ id: 'b', sizeMl: 100 })]);
      expect(groups).toEqual([]);
    });
  });
});

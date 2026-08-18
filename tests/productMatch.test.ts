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
      // Both codes carry a valid GTIN check digit, which is what makes them
      // the manufacturer speaking rather than a shop's own numbering.
      const groups = findDuplicateGroups([
        p({ id: 'a', ean: '3349668612611' }),
        p({ id: 'b', ean: '3349668508471' }),
      ]);
      expect(groups).toHaveLength(0);
    });

    it('leaves a barcode-less listing alone when the barcodes around it disagree', () => {
      const groups = findDuplicateGroups([
        p({ id: 'a', ean: '3349668612611' }),
        p({ id: 'b', ean: '3349668508471' }),
        p({ id: 'c', ean: null }),
      ]);
      expect(groups).toHaveLength(0);
    });

    it('keeps two flankers apart when only the barcode tells them apart', () => {
      // Verbatim from data/catalogue/perfume-click.json: IN2U for Him and
      // IN2U for Her are sold under the byte-identical title "Calvin Klein
      // IN2U Eau de Toilette 100ml Spray", so name, size and concentration
      // all agree and the barcode is the only thing left saying these are two
      // different perfumes. Merging them would publish one price for both.
      const groups = findDuplicateGroups([
        p({ id: 'ean-0088300196890', brand: 'Calvin Klein', name: 'IN2U', concentration: 'Eau de Toilette', ean: '0088300196890' }),
        p({ id: 'ean-0088300196814', brand: 'Calvin Klein', name: 'IN2U', concentration: 'Eau de Toilette', ean: '0088300196814' }),
      ]);
      expect(groups).toHaveLength(0);
    });
  });

  describe('what a shop puts in its ean field is not always a barcode', () => {
    // Oud Arabian publishes its Shopify internal item ids there. 173 of its
    // listings carry an "ean" and 16 pass a GTIN check digit — 9.2%, the rate
    // random digits pass at. Those ids were counting as a second, disagreeing
    // barcode and blocking real merges.
    const real = (id: string, ean: string | null) =>
      p({ id, brand: 'Bujairami', name: 'Chubby', concentration: 'Extrait de Parfum', ean });

    it('ignores a code that fails its own check digit', () => {
      const groups = findDuplicateGroups([
        real('ean-9362014001413', '9362014001413'),
        real('ean-10485679980886', '10485679980886'),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.canonical.id).toBe('ean-9362014001413');
      expect(groups[0]!.absorbed.map((x) => x.id)).toEqual(['ean-10485679980886']);
    });

    it('ignores a GTIN-14 case code even when its check digit is valid', () => {
      // 10486020047190 does pass the check digit, at 14 digits. A GTIN-14 with
      // a non-zero indicator digit identifies a case of some number of units,
      // never the bottle inside it.
      const groups = findDuplicateGroups([
        real('ean-9362014001499', '9362014001499'),
        real('ean-10486020047190', '10486020047190'),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.canonical.id).toBe('ean-9362014001499');
    });

    it('still merges a listing whose only code is unusable into a real barcode', () => {
      const groups = findDuplicateGroups([
        real('a', null),
        real('ean-10485679980886', '10485679980886'),
        real('ean-9362014001413', '9362014001413'),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.canonical.id).toBe('ean-9362014001413');
      expect(groups[0]!.absorbed).toHaveLength(2);
    });

    it('treats two unusable codes as no barcode at all rather than a disagreement', () => {
      const groups = findDuplicateGroups([
        real('x', '10485679980886'),
        real('y', '10464548454742'),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.absorbed).toHaveLength(1);
    });

    it('reads a barcode that lost a leading zero as the same barcode', () => {
      // Both are Calvin Klein Contradiction 100ml, one feed padding to 12 and
      // the other not. See normalizedEan.
      const groups = findDuplicateGroups([
        p({ id: 'a', brand: 'Calvin Klein', name: 'Contradiction', ean: '088300602513' }),
        p({ id: 'b', brand: 'Calvin Klein', name: 'Contradiction', ean: '88300602513' }),
      ]);
      expect(groups).toHaveLength(1);
    });
  });

  describe('the reported triple listing', () => {
    // Rabanne Lady Million Eau de Parfum 30ml, verbatim from
    // demo/catalogue.generated.ts: five separate listings of one bottle.
    const lm = (id: string, ean: string | null) =>
      p({ id, brand: 'Rabanne', name: 'Lady Million', concentration: 'Eau de Parfum', sizeMl: 30, ean });

    it('folds the barcode-less shops into the barcode that agrees with them', () => {
      const groups = findDuplicateGroups([
        lm('ean-3349668612611', '3349668612611'),
        lm('justmylook-pac0023', null),
        lm('mybeauty-boutique-shopify-gb-8338265768073-44927131877513', null),
      ]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.canonical.id).toBe('ean-3349668612611');
      expect(groups[0]!.absorbed).toHaveLength(2);
    });

    it('still refuses while two genuine Rabanne barcodes disagree', () => {
      // 3349668612611 and 3349668508471 are both well-formed and both sit in
      // Rabanne's own 334966 range: one bottle each from two packaging
      // generations, which is the manufacturer's statement and not ours to
      // overrule. This group is deliberately left split — see the report.
      const groups = findDuplicateGroups([
        lm('ean-3349668612611', '3349668612611'),
        lm('ean-3349668508471', '3349668508471'),
        lm('justmylook-pac0023', null),
      ]);
      expect(groups).toHaveLength(0);
    });
  });

  describe('grouping', () => {
    it('folds three shops into one product', () => {
      const groups = findDuplicateGroups([
        p({ id: 'a', ean: '6290171070207' }),
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

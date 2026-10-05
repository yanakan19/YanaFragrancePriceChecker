import { describe, expect, it } from 'vitest';
import { findDuplicateGroups, matchKey, type MatchableProduct } from '../src/catalogue/productMatch.js';
import { duplicateKey } from '../src/catalogue/duplicateKey.js';

/**
 * "Edition" wording that only restates a name must not split a product.
 * Examples are stored from the built catalogue (2026-10-05): the pair the owner
 * reported (French Avenue's Vulcan Black Friday) and the others of the same shape.
 */
const prod = (o: Partial<MatchableProduct> & { id: string; name: string }): MatchableProduct => ({
  brand: 'French Avenue',
  concentration: 'Eau de Parfum',
  sizeMl: 100,
  ean: null,
  ...o,
});

describe('edition wording that restates the name', () => {
  it('Vulcan Black Friday and Vulcan Black Friday Edition are one key', () => {
    const a = prod({ id: 'french-avenue-17853', name: 'Vulcan Black Friday', ean: '9950783799638' });
    const b = prod({ id: 'emirates-oud-15719288504669-default-title', name: 'Vulcan Black Friday Edition' });
    expect(matchKey(a)).toBe(matchKey(b));
    expect(duplicateKey(a)).toBe(duplicateKey(b));
    const groups = findDuplicateGroups([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.canonical.id).toBe('french-avenue-17853');
    expect(groups[0]!.absorbed.map((m) => m.id)).toEqual(['emirates-oud-15719288504669-default-title']);
  });

  it.each([
    ['Al Haramain', 'Amber Oud Gold', 'Amber Oud Gold Edition'],
    ['Escada', 'Sorbetto Rosso', 'Sorbetto Rosso Edition'],
    ['Maison Francis Kurkdjian', 'Gentle Fluidity Gold', 'Gentle Fluidity Gold Edition'],
    ['Pepe Jeans', 'For Her Cocktail', 'Cocktail Edition For Her'],
    ['Jacques Bogart', 'One Man Show 24K', 'One Man Show 24K Edition'],
  ])('%s: "%s" and "%s" are one product (inner or trailing Edition)', (brand, a, b) => {
    expect(matchKey(prod({ id: 'a', brand, name: a }))).toBe(matchKey(prod({ id: 'b', brand, name: b })));
  });

  it('keeps the word that names the edition: a Limited, Collector or Special Edition is not the plain bottle', () => {
    for (const named of ['Daisy Love Pop Limited Edition', 'Absolu Aventus Limited Edition', 'Cockatiel Special Edition', 'Aventus Collector Edition']) {
      const plain = named.replace(/\s+(Limited|Special|Collector)\s+Edition$/i, '');
      expect(matchKey(prod({ id: 'a', brand: 'Creed', name: named }))).not.toBe(matchKey(prod({ id: 'b', brand: 'Creed', name: plain })));
    }
  });

  it('keeps two different named editions apart', () => {
    const gold = prod({ id: 'a', name: 'Amber Oud Gold Edition' });
    const ruby = prod({ id: 'b', name: 'Amber Oud Ruby Edition' });
    expect(matchKey(gold)).not.toBe(matchKey(ruby));
    expect(matchKey(prod({ id: 'c', name: 'Vulcan Black Friday Edition' }))).not.toBe(matchKey(prod({ id: 'd', name: 'Vulcan Feu' })));
  });

  it('never reduces a name to nothing', () => {
    expect(matchKey(prod({ id: 'a', name: 'Edition' }))).toContain('edition');
  });

  it('still refuses two different real barcodes that a shop sells side by side', () => {
    // CK One Red Edition for Him (Paco Perfumerias) and ck one red for him (Parfumdreams)
    // carry different barcodes 3607342772885 / 3607342773097: neighbouring items.
    const a = prod({ id: 'ean-3607342772885', brand: 'Calvin Klein', concentration: 'Eau de Toilette', name: 'CK One Red Edition for Him', ean: '3607342772885' });
    const b = prod({ id: 'ean-3607342773097', brand: 'Calvin Klein', concentration: 'Eau de Toilette', name: 'ck one red for him', ean: '3607342773097' });
    expect(matchKey(a)).toBe(matchKey(b));
    const shops = new Map([[a.id, ['paco-perfumerias-uk']], [b.id, ['paco-perfumerias-uk']]]);
    expect(findDuplicateGroups([a, b], { shopsOf: (x) => shops.get(x.id)! })).toHaveLength(0);
  });
});

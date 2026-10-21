import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { brandsFirstOrder, foldBrand, priorityBrandRank, PRIORITY_BRANDS } from '../src/catalogue/linkBrandPriority.js';
import { checkOrder } from '../src/catalogue/linkPriority.js';

const item = (brand: string, name: string, shops: number, offers: number) => ({
  baseKey: `${brand}|${name}`.toLowerCase(),
  brand,
  shops,
  offers,
});

describe('priority brands, matched through the site\'s brand folding', () => {
  it('knows the owner\'s list in the owner\'s order', () => {
    const owner = [
      'Yves Saint Laurent', 'French Avenue', 'Lattafa', 'Swiss Arabian', 'Ahmed Al Maghribi', 'Tom Ford', 'Gucci',
      'Prada', 'Chloé', 'Givenchy', 'Khadlaj', 'Arabiyat', 'Rabanne', 'Viktor & Rolf', 'Jean Paul Gaultier',
      'Carolina Herrera', 'Marc Jacobs', 'Dolce & Gabbana', 'Hugo Boss', 'Jimmy Choo', 'Mugler',
    ];
    expect(owner.map((b) => priorityBrandRank(b))).toEqual(owner.map((_, i) => i));
    expect(PRIORITY_BRANDS).toHaveLength(owner.length);
  });

  it('finds a brand by any spelling the site folds into it', () => {
    const same: [string, string][] = [
      ['YSL', 'Yves Saint Laurent'],
      ['Ysl', 'Yves Saint Laurent'],
      ['Lattafa Pride', 'Lattafa'],
      ['Lattafa Perfumes', 'Lattafa'],
      ['Paco Rabanne', 'Rabanne'],
      ['Thierry Mugler', 'Mugler'],
      ['Chloe', 'Chloé'],
      ['Arabiyat Prestige', 'Arabiyat'],
      ['Dolce &amp; Gabbana', 'Dolce & Gabbana'],
      ['DOLCE & GABBANA', 'Dolce & Gabbana'],
      ['Viktor and Rolf', 'Viktor & Rolf'],
      ['HUGO BOSS', 'Hugo Boss'],
    ];
    for (const [spelling, kept] of same) {
      expect(priorityBrandRank(spelling), spelling).toBe(priorityBrandRank(kept));
      expect(priorityBrandRank(spelling), spelling).not.toBeNull();
      expect(foldBrand(spelling)).toBe(foldBrand(kept));
    }
  });

  it('does not take a different house for a priority one', () => {
    for (const b of ['Armaf', 'Dior', 'Yves Rocher', 'Tom Tailor', 'Lattafa Kids Toys', 'Gucci Mane']) {
      expect(priorityBrandRank(b), b).toBeNull();
    }
  });
});

describe('brandsFirstOrder', () => {
  const items = [
    item('Armaf', 'Club de Nuit', 12, 40),
    item('Gucci', 'Bloom', 5, 9),
    item('Yves Saint Laurent', 'Libre', 4, 7),
    item('Gucci', 'Guilty', 8, 8),
    item('Lattafa', 'Khamrah', 10, 20),
    item('Yves Saint Laurent', 'Y', 9, 12),
    item('Dior', 'Sauvage', 20, 90),
    item('Gucci', 'Flora', 8, 15),
  ];
  const names = (l: { baseKey: string }[]): string[] => l.map((i) => i.baseKey);

  it('puts the owner\'s brands first in the owner\'s order, most stocked first in each, then the rest most stocked first', () => {
    expect(names(brandsFirstOrder(items))).toEqual([
      'yves saint laurent|y',
      'yves saint laurent|libre',
      'lattafa|khamrah',
      'gucci|flora', // same shops as Guilty, more offers
      'gucci|guilty',
      'gucci|bloom',
      'dior|sauvage',
      'armaf|club de nuit',
    ]);
  });

  it('counts shops before offers', () => {
    const out = brandsFirstOrder([item('Gucci', 'A', 2, 100), item('Gucci', 'B', 3, 3)]);
    expect(names(out)).toEqual(['gucci|b', 'gucci|a']);
  });

  it('is the same on every run and loses nothing', () => {
    const tied = [item('Prada', 'b', 1, 1), item('Prada', 'a', 1, 1), item('Zed', 'z', 1, 1), item('Abc', 'c', 1, 1)];
    expect(names(brandsFirstOrder(tied))).toEqual(['prada|a', 'prada|b', 'abc|c', 'zed|z']);
    expect(names(brandsFirstOrder([...tied].reverse()))).toEqual(names(brandsFirstOrder(tied)));
    expect(brandsFirstOrder(items)).toHaveLength(items.length);
  });

  it('still puts a priority perfume tried and not found behind every never checked one', () => {
    const ordered = brandsFirstOrder(items);
    const state = (i: { baseKey: string }): 'never' | 'stale' =>
      i.baseKey === 'yves saint laurent|y' ? 'stale' : 'never';
    const todo = checkOrder(ordered, state);
    expect(names(todo)[0]).toBe('yves saint laurent|libre');
    expect(names(todo).at(-1)).toBe('yves saint laurent|y');
  });
});

describe('the resolver', () => {
  const source = readFileSync(new URL('../scripts/resolve-fragrance-links.ts', import.meta.url), 'utf8');
  it('works in the brands first order unless --site-order is given', () => {
    expect(source).toContain("siteOrder: flag('site-order')");
    expect(source).toMatch(/OPTS\.siteOrder \? priorityOrder\(perfumes, siteTiers\(\)\) : brandsFirstOrder\(perfumes\)/);
  });
});

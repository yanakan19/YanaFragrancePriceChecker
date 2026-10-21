/**
 * Search as you type: how typed and searched text are read alike
 * (demo/searchIntent.ts foldText, searchMatches), how matches rank (searchRank,
 * rankSearch, brandRank) and what the box suggests (demo/searchSuggest.ts).
 * Made up products, so the rules are tested and never the catalogue.
 */
import { describe, expect, it } from 'vitest';
import { brandRank, foldText, rankSearch, searchMatches, searchRank, searchText } from '../demo/searchIntent.js';
import { SUGGEST_MAX_PRODUCTS, suggestionsFor } from '../demo/searchSuggest.js';

// In "most stocked first" order, as the site lists them.
const P = [
  { id: 'a', brand: 'Dior', name: 'Sauvage', concentration: 'Eau de Toilette' },
  { id: 'a2', brand: 'Dior', name: 'Sauvage', concentration: 'Eau de Toilette' },
  { id: 'a3', brand: 'Dior', name: 'Sauvage', concentration: 'Parfum' },
  { id: 'b', brand: 'Dior', name: "J'adore", concentration: 'Eau de Parfum' },
  { id: 'c', brand: 'Chanel', name: 'Bleu de Chanel', concentration: 'Eau de Parfum' },
  { id: 'd', brand: 'Chanel', name: 'N°5', concentration: 'Eau de Parfum' },
  { id: 'e', brand: 'Dolce & Gabbana', name: 'Light Blue', concentration: 'Eau de Toilette' },
  { id: 'f', brand: 'Yves Saint Laurent', name: "L'Homme", concentration: 'Eau de Toilette' },
  { id: 'g', brand: 'Calvin Klein', name: 'CK One', concentration: 'Eau de Toilette' },
  { id: 'h', brand: 'Diptyque', name: 'Eau Sauvage Rose', concentration: 'Eau de Toilette' },
  { id: 'i', brand: "L'Artisan Parfumeur", name: 'Côte d’Amour', concentration: 'Eau de Toilette' },
  { id: 'j', brand: 'Dior', name: 'Sauvage Elixir', concentration: 'Parfum' },
  { id: 'k', brand: 'Christian Dior', name: 'Dune', concentration: 'Eau de Toilette' },
];
const label = (f: (typeof P)[number]) => `${f.brand} ${f.name}`;
const matching = (q: string) => P.filter((f) => searchMatches(searchText(f.brand, f.name, f.concentration), q));
const find = (q: string) => rankSearch(matching(q), q, (f) => f).map(label);
const BRANDS = [...new Set(P.map((f) => f.brand))].map((name) => ({ name, count: P.filter((f) => f.brand === name).length }));
const suggest = (q: string) => {
  const ranked = rankSearch(matching(q), q, (f) => f);
  const s = suggestionsFor(q, ranked, BRANDS, ranked[0] ? searchRank(ranked[0].brand, ranked[0].name, q) : 4);
  return { brands: s.brands.map((b) => b.name), products: s.products.map(label) };
};

describe('typed text and searched text are read the same way', () => {
  it('folds case and accents, joins at apostrophes and dots, reads a degree sign as o', () => {
    expect(foldText('Côte d’Amour')).toBe('cote damour');
    expect(foldText("J'adore")).toBe('jadore');
    expect(foldText('L’Homme')).toBe('lhomme');
    expect(foldText('Y.S.L')).toBe('ysl');
    expect(foldText('N°5')).toBe('no5');
    expect(foldText('Eau-de-Parfum (Intense)')).toBe('eau de parfum intense');
    expect(foldText('Dolce & Gabbana')).toBe('dolce & gabbana');
    expect(foldText('Œillet  Æther Straße')).toBe('oeillet aether strasse');
  });

  it('finds a product whatever punctuation, accents and spacing are typed', () => {
    const cases: [string, string][] = [
      ['dolce gabbana', 'Dolce & Gabbana Light Blue'],
      ['jadore', "Dior J'adore"],
      ['j adore', "Dior J'adore"],
      ["j'adore", "Dior J'adore"],
      ['lhomme', "Yves Saint Laurent L'Homme"],
      ['l homme', "Yves Saint Laurent L'Homme"],
      ['cote', "L'Artisan Parfumeur Côte d’Amour"],
      ['côte', "L'Artisan Parfumeur Côte d’Amour"],
      ['no 5', 'Chanel N°5'],
      ['n5', 'Chanel N°5'],
      ['no5', 'Chanel N°5'],
      ['n°5', 'Chanel N°5'],
      ['ck one', 'Calvin Klein CK One'],
      ['ysl', "Yves Saint Laurent L'Homme"],
      ['y s l', "Yves Saint Laurent L'Homme"],
      ['y.s.l', "Yves Saint Laurent L'Homme"],
    ];
    for (const [q, want] of cases) expect(find(q), q).toContain(want);
  });

  it('never runs words together for an intent word', () => {
    expect(searchMatches(searchText('Dior', 'Sauvage', 'Eau de Toilette'), 'oi l')).toBe(true);
    expect(searchMatches(searchText('Dior', 'Sauvage', 'Eau de Toilette'), 'oil')).toBe(false);
  });
});

describe('the best fitting product comes first, whatever is typed first', () => {
  it('a brand: its most stocked products first', () => {
    expect(find('dior')[0]).toBe('Dior Sauvage');
    expect(find('dior').indexOf('Diptyque Eau Sauvage Rose')).toBe(-1);
  });

  it('a fragrance name: the exact name above names that start with it, above it found inside another', () => {
    const r = find('sauvage');
    expect(r[0]).toBe('Dior Sauvage');
    expect(r.indexOf('Dior Sauvage Elixir')).toBeLessThan(r.indexOf('Diptyque Eau Sauvage Rose'));
    expect(find('bleu de chanel')[0]).toBe('Chanel Bleu de Chanel');
  });

  it('brand and name in either order', () => {
    expect(find('dior sauvage')[0]).toBe('Dior Sauvage');
    expect(find('sauvage dior')[0]).toBe('Dior Sauvage');
    expect(find('dior sauv')[0]).toBe('Dior Sauvage');
    expect(find('chanel bleu')[0]).toBe('Chanel Bleu de Chanel');
  });

  it('ranks in tiers: exact, start of the name, whole words, word starts, the rest', () => {
    expect(searchRank('Dior', 'Sauvage', 'sauvage')).toBe(0);
    expect(searchRank('Dior', 'Sauvage', 'dior sauvage')).toBe(0);
    expect(searchRank('Dior', "J'adore", 'j adore')).toBe(0);
    expect(searchRank('Dior', 'Sauvage Elixir', 'sauvage')).toBe(1);
    expect(searchRank('Diptyque', 'Eau Sauvage Rose', 'sauvage')).toBe(2);
    expect(searchRank('Dior', 'Addict', 'dior')).toBe(0);
    expect(searchRank('Dolce & Gabbana', 'Light Blue', 'dolce gabbana')).toBe(0);
    expect(searchRank('Dolce & Gabbana', 'Light Blue', 'gabbana light')).toBe(2);
    expect(searchRank('Dolce & Gabbana', 'Light Blue', 'gabb lig')).toBe(3);
    expect(searchRank('Diptyque', 'Eau Sauvage Rose', 'auvag')).toBe(4);
  });

  it('a brand typed exactly fits its products as well as a fragrance of that name: the most stocked decides', () => {
    const list = [
      { brand: 'Dolce & Gabbana', name: 'Light Blue' },
      { brand: 'Some House', name: 'Dolce Gabbana' },
    ];
    expect(rankSearch(list, 'dolce gabbana', (f) => f).map((f) => f.name)).toEqual(['Light Blue', 'Dolce Gabbana']);
  });

  it('keeps the most stocked first among products that fit alike', () => {
    expect(find('dior').slice(0, 2)).toEqual(['Dior Sauvage', 'Dior Sauvage']);
  });
});

describe('brands as typed', () => {
  it('fits a brand exactly, by its start, or by the start of each word', () => {
    expect(brandRank('Yves Saint Laurent', 'ysl')).toBe(0);
    expect(brandRank('Yves Saint Laurent', 'y s l')).toBe(0);
    expect(brandRank('Dolce & Gabbana', 'dolce gabbana')).toBe(0);
    expect(brandRank('Dolce & Gabbana', 'dolce and gabbana')).toBe(0);
    expect(brandRank("L'Artisan Parfumeur", 'lartisan')).toBe(1);
    expect(brandRank('Dior', 'dio')).toBe(1);
    expect(brandRank('Dolce & Gabbana', 'gabbana')).toBe(2);
    expect(brandRank('Dior', 'sauvage')).toBeNull();
    expect(brandRank('Dior', 'dior sauvage')).toBeNull();
  });
});

describe('what the box suggests', () => {
  it('nothing for under two characters', () => {
    expect(suggest('d')).toEqual({ brands: [], products: [] });
  });

  it('a brand typed: that brand first, then its products, one row per scent (a size of it is not another)', () => {
    const s = suggest('dior');
    expect(s.brands[0]).toBe('Dior');
    expect(s.products[0]).toBe('Dior Sauvage');
    // Two sizes of the toilette are one row; the Parfum is another scent.
    expect(s.products.filter((p) => p === 'Dior Sauvage')).toHaveLength(2);
  });

  it('a fragrance or brand and fragrance typed: the fragrance first, no brand above it', () => {
    expect(suggest('sauvage').brands).toEqual([]);
    expect(suggest('sauvage').products[0]).toBe('Dior Sauvage');
    expect(suggest('dior sauvage').brands).toEqual([]);
    expect(suggest('dior sauvage').products[0]).toBe('Dior Sauvage');
    expect(suggest('bleu de chanel').brands).toEqual([]);
    expect(suggest('bleu de chanel').products[0]).toBe('Chanel Bleu de Chanel');
  });

  it('a loosely fitting brand only when no product fits better', () => {
    expect(suggest('gabbana').brands).toEqual(['Dolce & Gabbana']);
    expect(suggest('ysl lhomme').brands).toEqual([]);
  });

  it('no more than the limit', () => {
    expect(suggest('eau').products.length).toBeLessThanOrEqual(SUGGEST_MAX_PRODUCTS);
  });
});

import { describe, expect, it } from 'vitest';
import { rankSearch, searchMatches, searchText } from '../demo/searchIntent.js';

const P = [
  { brand: 'Calvin Klein', name: 'Man', concentration: 'Eau de Toilette' },
  { brand: 'Calvin Klein', name: 'CK One', concentration: 'Eau de Toilette' },
  { brand: 'Dior', name: 'Sauvage', concentration: 'Eau de Toilette' },
  { brand: 'Chanel', name: 'Bleu de Chanel', concentration: 'Eau de Parfum' },
  { brand: 'Mancera', name: 'Roses Vanille', concentration: 'Eau de Parfum' },
  { brand: 'Yves Saint Laurent', name: 'Y', concentration: 'Eau de Parfum' },
];
const find = (q: string) =>
  rankSearch(
    P.filter((f) => searchMatches(searchText(f.brand, f.name, f.concentration), q)),
    q,
    (f) => f,
  ).map((f) => `${f.brand} ${f.name}`);

describe('search by brand plus fragrance name', () => {
  it('finds a product by a short brand name and ranks it first', () => {
    expect(find('ck man')[0]).toBe('Calvin Klein Man');
    expect(find('calvin klein man')[0]).toBe('Calvin Klein Man');
    expect(find('ck one')).toEqual(['Calvin Klein CK One']);
    expect(find('ysl y')[0]).toBe('Yves Saint Laurent Y');
  });
  it('takes the words in any order and the last word as a prefix', () => {
    expect(find('dior sauvage')).toEqual(['Dior Sauvage']);
    expect(find('sauvage dior')).toEqual(['Dior Sauvage']);
    expect(find('chanel bleu')).toEqual(['Chanel Bleu de Chanel']);
    expect(find('bleu de chan')).toEqual(['Chanel Bleu de Chanel']);
    expect(find('bleu de chanel')).toEqual(['Chanel Bleu de Chanel']);
  });
  it('ranks whole word matches above words found inside others', () => {
    expect(find('man')).toEqual(['Calvin Klein Man', 'Mancera Roses Vanille']);
  });
  it('leaves a single word search as it was', () => {
    expect(find('sauv')).toEqual(['Dior Sauvage']);
    expect(find('')).toHaveLength(P.length);
  });
});

import { describe, expect, it } from 'vitest';
import { findHousePrefixDuplicates } from '../src/catalogue/housePrefixNames.js';

const p = (id: string, brand: string, name: string, ean: string | null = null, sizeMl = 100) => ({ id, brand, name, concentration: 'Eau de Toilette', sizeMl, ean });

describe('findHousePrefixDuplicates: a house word in front of the name', () => {
  it('joins CK Obsession to Obsession and keeps the barcode record', () => {
    const a = p('a', 'Calvin Klein', 'CK Obsession');
    const b = p('b', 'Calvin Klein', 'Obsession', '088300606511');
    const [g] = findHousePrefixDuplicates([a, b]);
    expect(g?.canonical).toBe(b);
    expect(g?.absorbed).toEqual([a]);
    expect(g?.name).toBe('Obsession');
  });
  it('never joins two different barcodes, a different size, or a name that is the house', () => {
    expect(findHousePrefixDuplicates([p('a', 'Tommy Hilfiger', 'Tommy Girl', '1'), p('b', 'Tommy Hilfiger', 'Girl', '2')])).toEqual([]);
    expect(findHousePrefixDuplicates([p('a', 'Calvin Klein', 'CK Obsession', null, 50), p('b', 'Calvin Klein', 'Obsession', null, 100)])).toEqual([]);
    expect(findHousePrefixDuplicates([p('a', 'Salvador Dali', 'Salvador Dali'), p('b', 'Salvador Dali', 'Dali')])).toEqual([]);
  });
  it('keeps Eau Sauvage and Sauvage apart', () => {
    expect(findHousePrefixDuplicates([p('a', 'Dior', 'Eau Sauvage'), p('b', 'Dior', 'Sauvage')])).toEqual([]);
  });
});

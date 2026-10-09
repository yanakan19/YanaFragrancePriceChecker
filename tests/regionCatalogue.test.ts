// A region's catalogue and the plan's go/no-go numbers
// (src/catalogue/regionCatalogue.ts): identity shared with the UK through the
// barcode, the UK's own same-bottle merge, sister shops counted once, and an
// append only price history.
import { describe, expect, it } from 'vitest';
import { appendRegionHistory, buildRegionCatalogue, encodeHistory, encodeLines, regionMatchName } from '../src/catalogue/regionCatalogue.js';
import type { RegionListing, RegionSnapshot } from '../src/catalogue/regionHarvest.js';

const NOW = '2026-10-09T12:00:00.000Z';
let n = 0;
const row = (title: string, brand: string, price: number, ean: string | null = null): RegionListing => ({
  retailerSku: `sku-${++n}`, url: `https://shop.example/${n}`, rawTitle: title, rawBrand: brand, ean, price, wasPrice: null,
  inStock: true, sectionId: 's', firstSeenAt: NOW, lastSeenAt: NOW, status: 'active',
});
const snap = (id: string, listings: RegionListing[]): RegionSnapshot => ({ retailerId: id, region: 'US', currency: 'USD', updatedAt: NOW, complete: true, listings });

describe('buildRegionCatalogue', () => {
  const snapshots = [
    snap('shop-a', [
      row('Dior Sauvage Eau de Parfum 100ml', 'Dior', 120, '3348901368247'),
      row('Chanel Bleu de Chanel Eau de Toilette 3.4 oz', 'Chanel', 110),
      row('Creed Aventus Eau de Parfum 100ml', 'Creed', 400),
    ]),
    snap('shop-b', [
      row('Sauvage Eau de Parfum 100ml', 'Dior', 105, '3348901368247'),
      row('Bleu de Chanel Eau de Toilette 100ml', 'Chanel', 99),
    ]),
    snap('shop-c', [row('Bleu de Chanel Eau de Toilette 100ml', 'Chanel', 101)]),
  ];
  const { products, measures } = buildRegionCatalogue(snapshots, {
    now: NOW,
    shopNames: new Map([['shop-a', 'A'], ['shop-b', 'B'], ['shop-c', 'C']]),
    ukIds: new Set(['ean-3348901368247']),
    groups: new Map([['shop-b', 'bc'], ['shop-c', 'bc']]),
  });

  it('joins the same bottle by barcode, and by house, size, strength and name (3.4 oz is 100 ml)', () => {
    expect(measures.products).toBe(3);
    const sauvage = products.find((p) => p.id === 'ean-3348901368247')!;
    expect(sauvage.offers.map((o) => o.shopId).sort()).toEqual(['shop-a', 'shop-b']);
    const bleu = products.find((p) => p.brand === 'Chanel')!;
    expect(bleu.sizeMl).toBe(100);
    expect(bleu.offers.map((o) => o.shopId).sort()).toEqual(['shop-a', 'shop-b', 'shop-c']);
    expect(bleu.offers[0]!.price).toBe(99);
  });

  it('measures the plan\'s numbers, counting sister shops on one catalogue once', () => {
    expect(measures.productsWithTwoOrMoreShops).toBe(2);
    expect(measures.productsWithThreeOrMoreShops).toBe(1);
    // shop-b and shop-c are one source: Bleu still has two (a and bc), Sauvage two.
    expect(measures.productsWithTwoOrMoreIndependentShops).toBe(2);
    expect(measures.productsMatchingUkByBarcode).toBe(1);
    expect(measures.medianPriceGap).not.toBeNull();
    expect(measures.shops.find((s) => s.id === 'shop-a')).toEqual({ id: 'shop-a', products: 3, shared: 2 });
  });

  it('never joins two perfumes that one shop prints with the same barcode', () => {
    const r = buildRegionCatalogue([snap('lucky', [
      row('Lorenzo Pazzaglia Cherry Ink Extrait de Parfum 50ml', 'Lorenzo Pazzaglia', 175, '8050628980071'),
      row('Lorenzo Pazzaglia Van Extasyx Extrait de Parfum 50ml', 'Lorenzo Pazzaglia', 175, '8050628980071'),
    ])], { now: NOW, shopNames: new Map() });
    expect(r.measures.products).toBe(2);
  });

  it('leaves out a listing not seen for a week', () => {
    const old = { ...row('Dior Sauvage Eau de Parfum 100ml', 'Dior', 120), lastSeenAt: '2026-09-01T00:00:00Z' };
    expect(buildRegionCatalogue([snap('a', [old])], { now: NOW, shopNames: new Map() }).measures.products).toBe(0);
  });
});

describe('appendRegionHistory', () => {
  it('adds a point only when a price changes, and keeps every earlier point', () => {
    const p = [{ id: 'ean-1', kind: 'bottle' as const, brand: 'B', name: 'N', concentration: 'Eau de Parfum', sizeMl: 50, ean: null, offers: [{ shopId: 's', price: 10, inStock: true }] }];
    const day1 = appendRegionHistory(null, p, 'USD', '2026-10-08T10:00:00Z');
    const same = appendRegionHistory(day1, p, 'USD', '2026-10-09T10:00:00Z');
    expect(same.points['ean-1']!['s']).toEqual([['2026-10-08', 10]]);
    const moved = appendRegionHistory(same, [{ ...p[0]!, offers: [{ shopId: 's', price: 12, inStock: true }] }], 'USD', '2026-10-09T18:00:00Z');
    expect(moved.points['ean-1']!['s']).toEqual([['2026-10-08', 10], ['2026-10-09', 12]]);
    expect(JSON.parse(encodeHistory(moved)).points['ean-1'].s.length).toBe(2);
  });

  it('writes files that parse back', () => {
    expect(JSON.parse(encodeLines({ a: 1 }, 'rows', [{ x: 1 }, { x: 2 }])).rows.length).toBe(2);
    expect(JSON.parse(encodeLines({ a: 1 }, 'rows', [])).rows).toEqual([]);
  });
});

describe('who a bottle is for, as Indian shops write it', () => {
  it('matches "For Unisex", "For Men & Women" and no word as one, and keeps one sex apart from the other', () => {
    expect(regionMatchName('Khamrah For Unisex')).toBe('Khamrah');
    expect(regionMatchName('Khamrah For Man & Woman')).toBe('Khamrah');
    expect(regionMatchName('Khamrah Dukhan For Men(New Release 2025)')).toBe('Khamrah Dukhan formen');
    expect(regionMatchName('Code for Women')).not.toBe(regionMatchName('Code for Men'));
    expect(regionMatchName('Code')).not.toBe(regionMatchName('Code for Women'));
  });

  it('joins one bottle across three shops that each say it differently, and reads the house past a shop\'s own vendor name', () => {
    const r = buildRegionCatalogue([
      snap('a', [row('Lattafa Khamrah Eau De Parfum 100ml For Unisex', 'Lattafa', 2000)]),
      snap('b', [row('Lattafa Khamrah Eau De Parfum 100ml For Men & Women', 'Seema Mehra', 2100)]),
      snap('c', [row('Khamrah Eau De Parfum 100ml', 'Lattafa', 2200), row('Armani Code Eau de Parfum 100ml for Women', 'Giorgio Armani', 9000)]),
      snap('d', [row('Armani Code Eau de Parfum 100ml for Men', 'Giorgio Armani', 8000)]),
    ], {
      now: NOW,
      shopNames: new Map([['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D']]),
      notHouse: new Map([['b', new Set(['seema mehra'])]]),
    });
    const khamrah = r.products.filter((p) => /khamrah/i.test(p.name));
    expect(khamrah).toHaveLength(1);
    expect(khamrah[0]!.brand).toBe('Lattafa');
    expect(khamrah[0]!.offers.map((o) => o.shopId).sort()).toEqual(['a', 'b', 'c']);
    expect(r.products.filter((p) => /code/i.test(p.name))).toHaveLength(2);
  });
});

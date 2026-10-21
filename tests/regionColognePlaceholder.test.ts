// A shop whose "Cologne" is not a strength (RegionRetailer.cologneWordIsNotAStrength, owner decision 21 Oct 2026):
// its "Cologne" or "Eau de Cologne" reads as strength not stated, another strength in the title wins, and every
// other shop keeps Eau de Cologne.
import { describe, expect, it } from 'vitest';
import { buildRegionCatalogue, strengthOfFlaggedShopType, withoutColognePlaceholder } from '../src/catalogue/regionCatalogue.js';
import type { RegionListing, RegionSnapshot } from '../src/catalogue/regionHarvest.js';
import { US_RETAILERS } from '../src/config/retailers.us.js';

const NOW = '2026-10-21T12:00:00.000Z';
let n = 0;
const row = (title: string, brand: string, price: number, ean: string | null = null, productType: string | null = null): RegionListing => ({
  retailerSku: `sku-${++n}`, url: `https://shop.example/${n}`, rawTitle: title, rawBrand: brand, ean, price, wasPrice: null,
  inStock: true, productType, sectionId: 's', firstSeenAt: NOW, lastSeenAt: NOW, status: 'active',
});
const snap = (id: string, listings: RegionListing[]): RegionSnapshot => ({ retailerId: id, region: 'US', currency: 'USD', updatedAt: NOW, complete: true, listings });
const build = (snaps: RegionSnapshot[]) => buildRegionCatalogue(snaps, {
  now: NOW,
  shopNames: new Map(snaps.map((s) => [s.retailerId, s.retailerId])),
  cologneNotAStrength: new Set(['flagged']),
}).products;
const strengthAt = (products: ReturnType<typeof build>, shop: string, name: RegExp) =>
  products.find((p) => p.offers.some((o) => o.shopId === shop) && name.test(p.name))?.concentration;

describe('a shop whose Cologne is not a strength', () => {
  it('is flagged in the registry for Perfumania, Fragrance Outlet and Fragrance Market only', () => {
    expect(US_RETAILERS.filter((s) => s.cologneWordIsNotAStrength).map((s) => s.id).sort()).toEqual(['fragrance-market', 'fragrance-outlet', 'perfumania']);
  });

  it('reads Cologne and Eau de Cologne as strength not stated, and keeps the name', () => {
    const p = build([snap('flagged', [row('Hugo Boss Bottled Night Cologne 3.4 oz.', 'Hugo Boss', 50), row('Hugo Boss Boss Eau de Cologne 100ml', 'Hugo Boss', 50)])]);
    expect(p.map((x) => x.concentration)).toEqual(['Not stated', 'Not stated']);
    expect(p.map((x) => x.name).sort()).toEqual(['Boss', 'Bottled Night']);
  });

  it('lets an explicit strength in the title win over the word', () => {
    const p = build([snap('flagged', [row('Paco Rabanne Invictus Eau de Toilette Cologne 100ml', 'Paco Rabanne', 60), row('Bad Boy Extreme Eau de Parfum Cologne 100ml', 'Carolina Herrera', 90)])]);
    expect(strengthAt(p, 'flagged', /Invictus/)).toBe('Eau de Toilette');
    expect(strengthAt(p, 'flagged', /Bad Boy/)).toBe('Eau de Parfum');
  });

  it('leaves Eau de Cologne alone at a shop that is not flagged', () => {
    const p = build([snap('other', [
      row('Hugo Boss Bottled Night Cologne 100ml', 'Hugo Boss', 50),
      row('4711 Original Eau de Cologne 100ml', '4711', 20),
      row('Jo Malone Lime Basil and Mandarin Cologne 100ml', 'Jo Malone', 150),
      row('Clinique Happy For Men Cologne Spray 100ml', 'Clinique', 55),
    ])]);
    expect(p.every((x) => x.concentration === 'Eau de Cologne')).toBe(true);
  });

  it('joins the flagged shop\'s unstated bottle to the other shop\'s product of the right strength', () => {
    const p = build([
      snap('other', [row('Hugo Boss Bottled Night Eau de Toilette 100ml', 'Hugo Boss', 50)]),
      snap('flagged', [row('Hugo Boss Bottled Night Cologne 3.4 oz.', 'Hugo Boss', 45)]),
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]!.concentration).toBe('Eau de Toilette');
    expect(p[0]!.offers.map((o) => o.shopId).sort()).toEqual(['flagged', 'other']);
  });

  it('joins on the barcode whatever the flagged shop wrote', () => {
    const p = build([
      snap('other', [row('Mugler Cologne Eau de Cologne 100ml', 'Mugler', 80, '3439600050000')]),
      snap('flagged', [row('Mugler Cologne 100ml', 'Mugler', 70, '3439600050000')]),
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]!.offers).toHaveLength(2);
  });

  it('reads the strength from the shop\'s own product type when the title states none', () => {
    const p = build([snap('flagged', [row('Hugo Boss Bottled Night Cologne 3.4 oz.', 'Hugo Boss', 50, null, 'Eau De Toilette')])]);
    expect(p[0]!.concentration).toBe('Eau de Toilette');
    expect(p[0]!.name).toBe('Bottled Night');
  });

  it('lets the title strength win over the product type', () => {
    const p = build([snap('flagged', [row('Paco Rabanne Invictus Eau de Parfum Cologne 100ml', 'Paco Rabanne', 60, null, 'Eau De Toilette')])]);
    expect(p[0]!.concentration).toBe('Eau de Parfum');
  });

  it('does not take Cologne or Eau de Cologne, or a type with no strength, from the product type of a flagged shop', () => {
    for (const type of ['Cologne', 'Eau De Cologne', 'Eau de Cologne', 'Gift Set', '', null]) {
      const p = build([snap('flagged', [row('Hugo Boss Bottled Night Cologne 100ml', 'Hugo Boss', 50, null, type)])]);
      expect(p[0]!.concentration, String(type)).toBe('Not stated');
    }
    expect(strengthOfFlaggedShopType('Cologne')).toBe('Not stated');
  });

  it('ignores the product type at a shop that is not flagged', () => {
    const p = build([snap('other', [row('Hugo Boss Bottled Night Cologne 100ml', 'Hugo Boss', 50, null, 'Eau De Toilette')])]);
    expect(p[0]!.concentration).toBe('Eau de Cologne');
  });

  it('takes only the word out of a title', () => {
    expect(withoutColognePlaceholder('Legend Cologne 1.7 oz.')).toBe('Legend 1.7 oz.');
    expect(withoutColognePlaceholder('Millesime Imperial Eau de Cologne 4.0 oz.')).toBe('Millesime Imperial 4.0 oz.');
    expect(withoutColognePlaceholder('Acqua di Parma Colonia 100ml')).toBe('Acqua di Parma Colonia 100ml');
  });
});

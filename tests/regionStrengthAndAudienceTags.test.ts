// Two name rules of the region catalogue (23 Oct 2026, Canada beta): a shop that states the strength in its product type
// (RegionRetailer.strengthFromProductType) and a closing audience tag "(M)", "(W)", "(U)" taken off a display name.
import { describe, expect, it } from 'vitest';
import { buildRegionCatalogue, stripAudienceTags, strengthOfShopType, withoutAudienceTag } from '../src/catalogue/regionCatalogue.js';
import type { RegionListing, RegionSnapshot } from '../src/catalogue/regionHarvest.js';
import { CA_RETAILERS } from '../src/config/retailers.ca.js';
import { IN_RETAILERS } from '../src/config/retailers.in.js';

const NOW = '2026-10-23T12:00:00.000Z';
let n = 0;
const row = (title: string, brand: string, price: number, ean: string | null = null, productType: string | null = null): RegionListing => ({
  retailerSku: `sku-${++n}`, url: `https://shop.example/${n}`, rawTitle: title, rawBrand: brand, ean, price, wasPrice: null,
  inStock: true, productType, sectionId: 's', firstSeenAt: NOW, lastSeenAt: NOW, status: 'active',
});
const snap = (id: string, listings: RegionListing[]): RegionSnapshot => ({ retailerId: id, region: 'CA', currency: 'CAD', updatedAt: NOW, complete: true, listings });
const build = (snaps: RegionSnapshot[], typed: string[] = ['maximum-fragrance']) => buildRegionCatalogue(snaps, {
  now: NOW,
  shopNames: new Map(snaps.map((s) => [s.retailerId, s.retailerId])),
  strengthFromType: new Set(typed),
}).products;

describe('strength read from the shop\'s product type', () => {
  it('maps the shop\'s type spellings to the strengths', () => {
    expect(strengthOfShopType('Eau De Parfum')).toBe('Eau de Parfum');
    expect(strengthOfShopType('Eau de Parfum Intense')).toBe('Eau de Parfum');
    expect(strengthOfShopType('Eau De Toilette')).toBe('Eau de Toilette');
    expect(strengthOfShopType('Extrait de Parfum')).toBe('Extrait de Parfum');
    expect(strengthOfShopType('Eau De Cologne')).toBe('Eau de Cologne');
  });

  it('reads a bare Cologne, a category, a gift set and no type as not stated', () => {
    for (const t of ['Cologne', 'Perfume & Cologne', 'Gift Set', '', null, undefined]) expect(strengthOfShopType(t)).toBe('Not stated');
  });

  it('gives a title without a strength the one the type states, and lets a strength in the title win', () => {
    const p = build([snap('maximum-fragrance', [
      row('Hugo Boss Bottled Night 100ml', 'Hugo Boss', 400, null, 'Eau de Parfum'),
      row('Dior Sauvage Eau de Toilette 100ml', 'Dior', 120, null, 'Eau De Parfum'),
      row('Chanel Allure 50ml', 'Chanel', 150, null, 'Perfume & Cologne'),
    ])]);
    const by = (re: RegExp) => p.find((x) => re.test(x.name))!.concentration;
    expect(by(/Bottled Night/)).toBe('Eau de Parfum');
    expect(by(/Sauvage/)).toBe('Eau de Toilette');
    expect(by(/Allure/)).toBe('Not stated');
  });

  it('leaves a shop that is not set alone, and meets the same bottle at the other shop', () => {
    const alone = build([snap('h-parfums', [row('Hugo Boss Bottled Night 100ml', 'Hugo Boss', 400, null, 'Eau de Parfum')])]);
    expect(alone[0]!.concentration).toBe('Not stated');
    const p = build([
      snap('maximum-fragrance', [row('Hugo Boss Bottled Night 100ml', 'Hugo Boss', 400, null, 'Eau de Parfum')]),
      snap('h-parfums', [row('Hugo Boss Bottled Night Eau de Parfum 100ml', 'Hugo Boss', 410)]),
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]!.offers.map((o) => o.shopId).sort()).toEqual(['h-parfums', 'maximum-fragrance']);
  });

  it('is set on Maximum Fragrance and Parfum Exquis, whose types state strengths, and not on H Parfums, whose type is a category', () => {
    const set = CA_RETAILERS.filter((s) => s.strengthFromProductType).map((s) => s.id).sort();
    expect(set).toEqual(['maximum-fragrance', 'parfum-exquis']);
  });
});

describe('the Indian shop that states strength in its type', () => {
  it('is Maison des Parfums only', () => {
    expect(IN_RETAILERS.filter((s) => s.strengthFromProductType).map((s) => s.id)).toEqual(['maison-des-parfums-in']);
  });
});

describe('a closing audience tag on a name', () => {
  it('takes off one tag or a run of tags, in any case, and only at the end', () => {
    expect(withoutAudienceTag('Guilty (W)')).toBe('Guilty');
    expect(withoutAudienceTag('Oud (W)(M)')).toBe('Oud');
    expect(withoutAudienceTag('Bottled (After Shave ) (M)')).toBe('Bottled (After Shave )');
    expect(withoutAudienceTag('Code (Men)')).toBe('Code');
    expect(withoutAudienceTag('One (u)')).toBe('One');
    expect(withoutAudienceTag('Sauvage (Parfum)')).toBe('Sauvage (Parfum)');
    expect(withoutAudienceTag('Eau (M) Fraiche')).toBe('Eau (M) Fraiche');
    expect(withoutAudienceTag('Black XS')).toBe('Black XS');
  });

  it('shows the plain name on a product that alone carries the tag', () => {
    const p = build([snap('fc', [row('Guerlain Jicky 75ML EDP Spray (W)', 'Guerlain', 150), row('Mont Blanc Explorer 100ML EDP Spray (M)', 'Mont Blanc', 80)])]);
    expect(p.map((x) => x.name).sort()).toEqual(['Explorer', 'Jicky']);
  });

  it('keeps the tag where it is what tells two bottles apart', () => {
    const p = build([snap('fc', [
      row('Gucci Guilty 50ML EDT Spray (W)', 'Gucci', 100, '1234567890128'),
      row('Gucci Guilty 50ML EDT Spray (M)', 'Gucci', 100, '2109876543210'),
    ])]);
    expect(p.map((x) => x.name).sort()).toEqual(['Guilty (M)', 'Guilty (W)']);
  });

  it('keeps the tag when a plain twin of the same strength and size exists, and strips it across sizes', () => {
    const products = [
      { brand: 'Gucci', name: 'Guilty (W)', concentration: 'Eau de Toilette', sizeMl: 50 },
      { brand: 'Gucci', name: 'Guilty', concentration: 'Eau de Toilette', sizeMl: 50 },
      { brand: 'Gucci', name: 'Bloom (W)', concentration: 'Eau de Parfum', sizeMl: 50 },
      { brand: 'Gucci', name: 'Bloom', concentration: 'Eau de Parfum', sizeMl: 100 },
    ];
    expect(stripAudienceTags(products)).toBe(1);
    expect(products.map((x) => x.name)).toEqual(['Guilty (W)', 'Guilty', 'Bloom', 'Bloom']);
  });
});

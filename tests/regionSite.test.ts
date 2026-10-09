import { describe, expect, it } from 'vitest';
import {
  buildRegionSite, cheapestSeries, isShowable, regionLinksFor, regionSlugs, type RegionInputs,
} from '../scripts/regionSite.js';
import { REGION_RETAILERS } from '../src/config/regionRetailers.js';
import type { RegionSnapshot } from '../src/catalogue/regionHarvest.js';
import { isProductSlug } from '../src/catalogue/productSlug.js';

/**
 * The data a region's pages are built from (scripts/regionSite.ts): product
 * addresses, the chart's line, the deals and photos rules, and what one
 * region's page knows of the others. Built from plain inputs here; the built
 * pages are tests/regionPages.test.ts.
 */

const slugProduct = (id: string, brand: string, name: string, sizeMl: number | null = 100) =>
  ({ id, brand, name, concentration: 'Eau de Parfum', sizeMl, giftSet: false });

describe('product addresses in a region', () => {
  it('keeps the UK address of a bottle the UK also sells, and gives a new one by the UK rules, avoiding every UK address', () => {
    const uk = { 'ean-1': 'creed_aventus_100ml', 'ean-9': 'lattafa_khamrah_100ml' };
    const slugs = regionSlugs([slugProduct('ean-1', 'Creed', 'Aventus'), slugProduct('shop-7', 'Lattafa', 'Khamrah')], uk, {});
    expect(slugs['ean-1']).toBe('creed_aventus_100ml');
    // Its plain address names another bottle in the UK, so it takes the strength form.
    expect(slugs['shop-7']).toBe('lattafa_khamrah_edp_100ml');
    expect(Object.values(slugs).every(isProductSlug)).toBe(true);
  });

  it('is append only: an address once given stays, even when the UK later gives it to another bottle', () => {
    const memory = { 'shop-7': 'lattafa_khamrah_100ml' };
    const uk = { 'ean-9': 'lattafa_khamrah_100ml' };
    const slugs = regionSlugs([slugProduct('shop-7', 'Lattafa', 'Khamrah'), slugProduct('ean-9', 'Lattafa', 'Khamrah')], uk, memory);
    expect(slugs['shop-7']).toBe('lattafa_khamrah_100ml');
    expect(slugs['ean-9']).not.toBe('lattafa_khamrah_100ml');
    // A product gone from the region keeps its address reserved.
    expect(regionSlugs([], uk, memory)).toEqual(memory);
    expect(() => regionSlugs([], uk, { a: 'x_y_100ml', b: 'x_y_100ml' })).toThrow(/append only/);
  });

  it('shows only a product that names its house', () => {
    expect(isShowable({ brand: 'Creed' })).toBe(true);
    expect(isShowable({ brand: ' ' })).toBe(false);
  });
});

describe('the price chart\'s line', () => {
  it('is the cheapest shop on each day a price changed, with the shop that held it', () => {
    expect(cheapestSeries({ a: [['2026-10-09', 50], ['2026-10-11', 40]], b: [['2026-10-09', 45], ['2026-10-10', 47]] })).toEqual([
      { at: '2026-10-09T00:00:00Z', priceGbp: 45, retailerId: 'b' },
      { at: '2026-10-10T00:00:00Z', priceGbp: 47, retailerId: 'b' },
      { at: '2026-10-11T00:00:00Z', priceGbp: 40, retailerId: 'a' },
    ]);
    expect(cheapestSeries({})).toEqual([]);
  });
});

describe('a region page built from snapshots', () => {
  const now = '2026-10-09T12:00:00.000Z';
  const listing = (sku: string, title: string, brand: string, price: number, extra: Record<string, unknown> = {}) => ({
    retailerSku: sku, url: `https://shop.example/products/${sku}`, rawTitle: title, rawBrand: brand, ean: null, price, wasPrice: null,
    inStock: true, productType: 'Fragrance', sectionId: 's', firstSeenAt: '2026-10-09T04:00:00.000Z', lastSeenAt: '2026-10-09T06:00:00.000Z',
    status: 'active' as const, ...extra,
  });
  const snapshot = (retailerId: string, listings: ReturnType<typeof listing>[]): RegionSnapshot =>
    ({ retailerId, region: 'US', currency: 'USD', updatedAt: now, complete: true, listings } as unknown as RegionSnapshot);
  const inputs: RegionInputs = {
    region: 'US',
    shops: REGION_RETAILERS.US,
    snapshots: [
      snapshot('aedes', [listing('1', 'Aventus - Eau de Parfum 3.4oz', 'Creed', 395)]),
      snapshot('luckyscent', [listing('2', 'Aventus Eau de Parfum 100ml', 'Creed', 410, { wasPrice: 470 })]),
      snapshot('twisted-lily', [listing('3', 'Mystery Eau de Parfum 50ml', '', 100)]),
    ],
    history: { currency: 'USD', updatedAt: now, points: {} },
    slugMemory: {},
    harvestRanAt: '2026-10-09T06:00:00.000Z',
  };
  const site = buildRegionSite(inputs, { 'ean-x': 'creed_aventus_100ml' }, now);

  it('lists each showable bottle once, both shops beside it, with no shop photo anywhere', () => {
    const aventus = site.catalogue.find((c) => c.brand === 'Creed')!;
    expect(aventus.shops).toBe(2);
    expect(site.catalogue.some((c) => c.brand === '')).toBe(false);
    expect(site.catalogue.every((c) => c.image === null && c.notes === null)).toBe(true);
    expect(Object.values(site.crawled).flat().every((o) => o.imageUrl === null)).toBe(true);
    expect(site.crawled[aventus.id]!.map((o) => o.retailerId).sort()).toEqual(['aedes', 'luckyscent']);
    expect(site.crawledAt).toBe('2026-10-09T06:00:00.000Z');
  });

  it('keeps a shop\'s previous price only where other shops corroborate it, as the UK does, so no deal rests on one shop\'s word', () => {
    expect(Object.values(site.crawled).flat().every((o) => o.wasPrice === null)).toBe(true);
    expect(site.deals).toEqual([]);
  });

  it('gives every product an address, and marks nothing NEW on a shop\'s first crawl', () => {
    expect(site.catalogue.every((c) => isProductSlug(c.slug))).toBe(true);
    expect(Object.values(site.crawled).flat().some((o) => o.isNew)).toBe(false);
  });
});

describe('what a page knows of the other regions', () => {
  it('maps each product it shares with another region to its address there, and lists the brands sold there', () => {
    const gb = { id: 'GB' as const, slugs: { 'ean-1': 'creed_aventus_100ml', 'ean-2': 'dior_sauvage_100ml' }, brands: ['Creed', 'Dior'] };
    const us = { id: 'US' as const, slugs: { 'ean-1': 'creed_aventus_100ml', 'us-5': 'boy_smells_kush_50ml' }, brands: ['Creed', 'Boy Smells'] };
    expect(regionLinksFor(gb, [gb, us])).toEqual({ US: { slugs: { 'ean-1': 'creed_aventus_100ml' }, brands: ['boy-smells', 'creed'] } });
    expect(regionLinksFor(us, [gb, us])).toEqual({ GB: { slugs: { 'ean-1': 'creed_aventus_100ml' }, brands: ['creed', 'dior'] } });
  });
});

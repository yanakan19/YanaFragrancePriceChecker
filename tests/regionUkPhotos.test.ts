import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchUkPhotos, type UkPhotoSource } from '../src/catalogue/regionUkPhotos.js';
import { buildRegionSite, type RegionInputs } from '../scripts/regionSite.js';
import { REGION_RETAILERS } from '../src/config/regionRetailers.js';
import type { RegionSnapshot } from '../src/catalogue/regionHarvest.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';

/**
 * UK pictures on matching US and India products (owner instruction, 9 Oct
 * 2026; docs/INTERNATIONAL-PLAN.md): the barcode match the region build counts,
 * a strict name match, never a gift set, oil or other size, and nothing in a
 * UK file touched.
 */

const uk = (over: Partial<UkPhotoSource> & { id: string }): UkPhotoSource => ({
  brand: 'Creed', name: 'Aventus', concentration: 'Eau de Parfum', sizeMl: 100, ean: null,
  image: 'https://uk-shop.example/aventus.jpg', ...over,
});
const region = (over: Record<string, unknown> & { id: string }) => ({
  kind: 'bottle' as const, brand: 'Creed', name: 'Aventus', concentration: 'Eau de Parfum', sizeMl: 100, ean: null as string | null, ...over,
});

describe('which region products take a UK picture', () => {
  it('gives a barcode matched bottle the UK image and its transform', () => {
    const m = matchUkPhotos([region({ id: 'ean-111' })], [uk({ id: 'ean-111', imageTransform: 'translate(0,2%) scale(1.1)' })]);
    expect(m.get('ean-111')).toEqual({ ukId: 'ean-111', by: 'barcode', image: 'https://uk-shop.example/aventus.jpg', imageTransform: 'translate(0,2%) scale(1.1)' });
  });

  it('gives an unmatched product nothing, and a matched one nothing when the UK has no picture', () => {
    const m = matchUkPhotos([region({ id: 'ean-222' }), region({ id: 'ean-111' }), region({ id: 'shop-9', name: 'Other' })], [uk({ id: 'ean-111', image: null })]);
    expect(m.size).toBe(0);
  });

  it('never gives a gift set, an oil, a different size or a different strength a bottle\'s picture', () => {
    const photo = [uk({ id: 'ean-1' })];
    expect(matchUkPhotos([region({ id: 'ean-1', kind: 'set' })], photo).size, 'region gift set').toBe(0);
    expect(matchUkPhotos([region({ id: 'ean-1' })], [uk({ id: 'ean-1', giftSet: { contents: null, title: 'Set' } })]).size, 'UK gift set').toBe(0);
    expect(matchUkPhotos([region({ id: 'ean-1' })], [uk({ id: 'ean-1', oil: {} })]).size, 'UK oil').toBe(0);
    expect(matchUkPhotos([region({ id: 'ean-1', sizeMl: 50 })], photo).size, 'size').toBe(0);
    expect(matchUkPhotos([region({ id: 'ean-1', concentration: 'Eau de Toilette' })], photo).size, 'strength').toBe(0);
    expect(matchUkPhotos([region({ id: 'ean-1', sizeMl: null })], photo).size, 'no size').toBe(0);
    // A barcode that names another kind of bottle ends the search: the name is not tried after it.
    expect(matchUkPhotos([region({ id: 'ean-1', sizeMl: 50 })], [...photo, uk({ id: 'ean-2', sizeMl: 50 })]).size).toBe(0);
  });

  it('matches by name only on identical house, name, strength and size after the region name normalisation', () => {
    const photo = [uk({ id: 'ean-5', brand: 'Lattafa', name: 'Khamrah', ean: '6290360590000' })];
    const same = region({ id: 'in-1', brand: 'LATTAFA', name: 'Khamrah For Men & Women' });
    expect(matchUkPhotos([same], photo).get('in-1')).toMatchObject({ ukId: 'ean-5', by: 'name' });
    expect(matchUkPhotos([region({ id: 'in-2', brand: 'Lattafa', name: 'Khamrah For Men' })], photo).size, 'who it is for').toBe(0);
    expect(matchUkPhotos([{ ...same, name: 'Khamrah Qahwa' }], photo).size, 'name').toBe(0);
    expect(matchUkPhotos([{ ...same, brand: 'Afnan' }], photo).size, 'brand').toBe(0);
    expect(matchUkPhotos([{ ...same, sizeMl: 50 }], photo).size, 'size').toBe(0);
    expect(matchUkPhotos([{ ...same, concentration: 'Extrait de Parfum' }], photo).size, 'strength').toBe(0);
    expect(matchUkPhotos([{ ...same, kind: 'set' as const }], photo).size, 'gift set').toBe(0);
  });

  it('does not match by name on an unstated strength, two UK candidates, or two barcodes that disagree', () => {
    const base = { brand: 'Lattafa', name: 'Khamrah' };
    expect(matchUkPhotos([region({ id: 'a', ...base, concentration: null })], [uk({ id: 'ean-5', ...base, concentration: 'Not stated' })]).size, 'not stated').toBe(0);
    expect(matchUkPhotos([region({ id: 'a', ...base })], [uk({ id: 'ean-5', ...base }), uk({ id: 'ean-6', ...base })]).size, 'ambiguous').toBe(0);
    expect(matchUkPhotos([region({ id: 'a', ...base, ean: '0885000000001' })], [uk({ id: 'ean-5', ...base, ean: '3000000000002' })]).size, 'barcodes disagree').toBe(0);
    expect(matchUkPhotos([region({ id: 'a', ...base, ean: '885000000001' })], [uk({ id: 'ean-5', ...base, ean: '0885000000001' })]).size, 'same barcode, padded').toBe(1);
  });
});

describe('the region page build', () => {
  const now = '2026-10-09T12:00:00.000Z';
  const listing = (sku: string, title: string, brand: string, price: number, ean: string | null = null) => ({
    retailerSku: sku, url: `https://shop.example/products/${sku}`, rawTitle: title, rawBrand: brand, ean, price, wasPrice: null,
    inStock: true, productType: 'Fragrance', sectionId: 's', firstSeenAt: '2026-10-09T04:00:00.000Z', lastSeenAt: '2026-10-09T06:00:00.000Z',
    status: 'active' as const,
  });
  const snapshot = (retailerId: string, listings: ReturnType<typeof listing>[]): RegionSnapshot =>
    ({ retailerId, region: 'US', currency: 'USD', updatedAt: now, complete: true, listings } as unknown as RegionSnapshot);
  const inputs: RegionInputs = {
    region: 'US',
    shops: REGION_RETAILERS.US,
    snapshots: [snapshot('aedes', [
      listing('1', 'Aventus Eau de Parfum 100ml', 'Creed', 395, '8412345678905'),
      listing('2', 'Aventus Eau de Parfum 50ml', 'Creed', 250, '8412345678906'),
      listing('3', 'Mystery Eau de Parfum 50ml', 'Nobody', 100),
    ])],
    history: { currency: 'USD', updatedAt: now, points: {} },
    slugMemory: {},
    harvestRanAt: '2026-10-09T06:00:00.000Z',
  };
  const ukList = [
    uk({ id: 'ean-8412345678905', ean: '8412345678905', imageTransform: 'scale(1.05)' }),
    // Same house and name, 50 ml, but a different barcode id and no UK size match.
    uk({ id: 'ean-8412345678999', sizeMl: 30, ean: '8412345678999', image: 'https://uk-shop.example/30.jpg' }),
  ];

  it('puts the UK picture on the matched product only, and never a shop photo on any offer', () => {
    const site = buildRegionSite(inputs, {}, now, ukList);
    const hundred = site.catalogue.find((c) => c.sizeMl === 100)!;
    expect(hundred.image).toBe('https://uk-shop.example/aventus.jpg');
    expect(hundred.imageTransform).toBe('scale(1.05)');
    for (const c of site.catalogue.filter((x) => x.sizeMl !== 100)) {
      expect(c.image, c.name).toBeNull();
      expect('imageTransform' in c).toBe(false);
    }
    expect(Object.values(site.crawled).flat().every((o) => o.imageUrl === null)).toBe(true);
  });

  it('is unchanged without a UK catalogue: no product has a picture', () => {
    expect(buildRegionSite(inputs, {}, now).catalogue.every((c) => c.image === null)).toBe(true);
  });

  it('leaves the UK data byte for byte unchanged', () => {
    const files = ['demo/catalogue.generated.ts', 'data/product-slugs.json', 'data/id-aliases.json'].map((f) => resolve(REPO_ROOT, f));
    const hash = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
    const before = files.map(hash);
    const frozen = JSON.stringify(ukList);
    buildRegionSite(inputs, {}, now, ukList);
    expect(JSON.stringify(ukList), 'the UK entries handed in').toBe(frozen);
    expect(files.map(hash)).toEqual(before);
  });
});

import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETAILERS } from '../src/config/retailers.js';
import { REGION_RETAILERS } from '../src/config/regionRetailers.js';
import { regionShopsAsRetailers } from '../src/config/regionShops.js';
import { buildRegionSite, type RegionInputs } from '../scripts/regionSite.js';
import { reconcileRegion, shopImageUrl, toRegionListings, type RegionSnapshot } from '../src/catalogue/regionHarvest.js';
import type { RawListing } from '../src/catalogue/types.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';

/**
 * D24 answered for the new shops (owner, 9 Oct 2026): the US shops, the India
 * shops, the UK shops added on 8 and 9 Oct 2026 and Glossier UK show their own
 * product photo, hot-linked from the shop's page and never downloaded.
 */

const UK_NEW_SHOPS = [
  // Added 8 Oct 2026
  'opulensi', 'perfume-closet', 'perfumoi', 'saad-fragrance', 'sainte-cellier', 'fenwick', 'perfumeuk', 'liberty-london',
  'rasasi-uk-store', 'direct-cosmetics',
  // Added 9 Oct 2026 (round 2)
  'rowlands-pharmacy', 'lloyds-pharmacy', 'beaute-boulevard', 'scent-warehouse', 'roullier-white', 'scented-glasgow',
  // The UK shop of a US brand
  'glossier-uk',
];

describe('which shops show their photos', () => {
  it.each(UK_NEW_SHOPS)('UK shop %s has the hot-link basis', (id) => {
    expect(RETAILERS.find((r) => r.id === id)?.affiliate.imageBasis).toBe('hotlink-unlicensed');
  });

  it('every US and India shop has it, and reaches the page with it', () => {
    for (const region of ['US', 'IN'] as const) {
      expect(REGION_RETAILERS[region].every((r) => r.imageBasis === 'hotlink-unlicensed')).toBe(true);
      expect(regionShopsAsRetailers(region).every((r) => r.affiliate.imageBasis === 'hotlink-unlicensed')).toBe(true);
    }
  });

  it('shops outside the decision stay off', () => {
    for (const id of ['notino-uk', 'boots', 'the-fragrance-shop', 'superdrug', 'french-avenue', 'al-haramain', 'zimaya', 'kayali', 'scentsational', 'cosmetify']) {
      expect(RETAILERS.find((r) => r.id === id)?.affiliate.imageBasis, id).toBeUndefined();
    }
  });
});

describe('a photo is a URL to the shop, never a file of ours', () => {
  it('keeps an https address, drops anything else and a feed\'s "no image" graphic', () => {
    expect(shopImageUrl('https://cdn.shopify.com/s/files/1/a.jpg')).toBe('https://cdn.shopify.com/s/files/1/a.jpg');
    expect(shopImageUrl('http://shop.example/a.jpg')).toBeNull();
    expect(shopImageUrl('/images/a.jpg')).toBeNull();
    expect(shopImageUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(shopImageUrl(null)).toBeNull();
    expect(shopImageUrl('https://images2.productserve.com/noimage.gif')).toBeNull();
  });

  it('is carried from the crawl into the snapshot, and an earlier address is kept when a read gives none', () => {
    const shop = REGION_RETAILERS.US.find((r) => r.id === 'aedes')!;
    const raw = (sku: string, imageUrl: string | null): RawListing => ({
      retailerSku: sku, url: `https://www.aedes.com/products/${sku}`, rawTitle: 'Aventus Eau de Parfum 100ml', rawBrand: 'Creed', ean: null,
      imageUrl, priceGbp: null, wasPriceGbp: null, promoEndsAt: null, inStock: true, sectionId: 's', nativePrice: { amount: 395, currency: 'USD' },
    } as RawListing);
    const first = toRegionListings([raw('a', 'https://cdn.example/a.jpg'), raw('b', null)], shop, '2026-10-09T00:00:00Z').listings;
    expect(first.find((l) => l.retailerSku === 'a')?.imageUrl).toBe('https://cdn.example/a.jpg');
    expect('imageUrl' in first.find((l) => l.retailerSku === 'b')!).toBe(false);
    const next = toRegionListings([raw('a', null)], shop, '2026-10-10T00:00:00Z').listings;
    expect(reconcileRegion(first, next, true).find((l) => l.retailerSku === 'a')?.imageUrl).toBe('https://cdn.example/a.jpg');
  });

  it('commits no image file in the repository outside the existing ones', () => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (['node_modules', '.git'].includes(e.name) ? [] : walk(resolve(dir, e.name))) : [resolve(dir, e.name)]);
    const regionFiles = walk(resolve(REPO_ROOT, 'data/regions'));
    expect(regionFiles.filter((f) => /\.(jpe?g|png|webp|gif|avif)$/i.test(f))).toEqual([]);
  });
});

describe('a region page shows a shop photo for a product no UK listing matches', () => {
  const now = '2026-10-09T12:00:00.000Z';
  const listing = (sku: string, title: string, brand: string, price: number, imageUrl?: string) => ({
    retailerSku: sku, url: `https://shop.example/products/${sku}`, rawTitle: title, rawBrand: brand, ean: null, price, wasPrice: null,
    inStock: true, productType: 'Fragrance', sectionId: 's', firstSeenAt: '2026-10-09T04:00:00.000Z', lastSeenAt: '2026-10-09T06:00:00.000Z',
    status: 'active' as const, ...(imageUrl ? { imageUrl } : {}),
  });
  const snapshot = (retailerId: string, listings: ReturnType<typeof listing>[]): RegionSnapshot =>
    ({ retailerId, region: 'US', currency: 'USD', updatedAt: now, complete: true, listings } as unknown as RegionSnapshot);
  const inputs = (shops: RegionInputs['shops']): RegionInputs => ({
    region: 'US',
    shops,
    snapshots: [
      snapshot('aedes', [
        listing('1', 'Mystery Eau de Parfum 50ml', 'Nobody', 100, 'https://cdn.aedes.example/mystery.jpg'),
        listing('2', 'Aventus Eau de Parfum 100ml', 'Creed', 395, 'https://cdn.aedes.example/aventus.jpg'),
        listing('3', 'Plain Eau de Parfum 50ml', 'Nobody', 90),
      ]),
      snapshot('luckyscent', [listing('4', 'Aventus Eau de Parfum 100ml', 'Creed', 410, 'https://cdn.luckyscent.example/aventus.jpg')]),
    ],
    history: { currency: 'USD', updatedAt: now, points: {} },
    slugMemory: {},
    harvestRanAt: '2026-10-09T06:00:00.000Z',
  });
  const uk = [{ id: 'x', brand: 'Creed', name: 'Aventus', concentration: 'Eau de Parfum', sizeMl: 100, ean: null, image: 'https://uk-shop.example/aventus.jpg' }];

  it('uses the shop photo for an unmatched product, and none for one with no photo', () => {
    const site = buildRegionSite(inputs(REGION_RETAILERS.US), {}, now, uk);
    expect(site.catalogue.find((c) => c.name.startsWith('Mystery'))?.image).toBe('https://cdn.aedes.example/mystery.jpg');
    expect(site.catalogue.find((c) => c.name.startsWith('Plain'))?.image).toBeNull();
    const offer = Object.values(site.crawled).flat().find((o) => o.url.endsWith('/1'))!;
    expect(offer.imageUrl).toBe('https://cdn.aedes.example/mystery.jpg');
  });

  it('prefers the UK match\'s picture, and takes a shop photo for it only when there is no UK match', () => {
    expect(buildRegionSite(inputs(REGION_RETAILERS.US), {}, now, uk).catalogue.find((c) => c.brand === 'Creed')?.image).toBe('https://uk-shop.example/aventus.jpg');
    const without = buildRegionSite(inputs(REGION_RETAILERS.US), {}, now, []).catalogue.find((c) => c.brand === 'Creed')!;
    expect(without.image).toMatch(/^https:\/\/cdn\.(aedes|luckyscent)\.example\/aventus\.jpg/);
    expect('imageTransform' in without).toBe(false);
  });

  it('shows none from a shop without the basis', () => {
    const shops = REGION_RETAILERS.US.map((s) => (s.id === 'aedes' ? { ...s, imageBasis: undefined } : s)) as RegionInputs['shops'];
    const site = buildRegionSite(inputs(shops), {}, now, []);
    expect(site.catalogue.find((c) => c.name.startsWith('Mystery'))?.image).toBeNull();
    const aedesOffers = Object.values(site.crawled).flat().filter((o) => o.retailerId === 'aedes');
    expect(aedesOffers.every((o) => o.imageUrl === null)).toBe(true);
    // The other shop's photo still shows.
    expect(site.catalogue.find((c) => c.brand === 'Creed')?.image).toMatch(/luckyscent/);
  });
});

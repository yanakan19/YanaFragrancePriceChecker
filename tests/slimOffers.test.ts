// The page's data file leaves out the offer fields no page code reads
// (scripts/slimOffers.ts; docs/SITE-AUDIT-2026-10-12.md 1c and 9.2). These
// tests hold the list to the bundle in both directions: a listed field must
// stay unread by the bundle, and the published files must carry none of them,
// while the generated module (which tests and scripts read) keeps every field.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_UNREAD_OFFER_FIELDS, slimMovedBlobs, slimOffer, slimOffersBlob } from '../scripts/slimOffers.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';
import { referencedDataFiles } from '../scripts/dataFiles.js';
import { liveRegions } from '../src/config/regions.js';

const offer = (over: Record<string, unknown> = {}) => ({
  retailerId: 'boots', price: 49.99, wasPrice: null, promoEndsAt: null, stock: 'inStock', url: 'https://x/y',
  fetchedAt: '2026-10-12T09:00:00Z', firstSeenAt: '2026-09-01T00:00:00Z', isNew: false, imageUrl: 'https://x/p.jpg', rating: null, ...over,
});

describe('slimOffer', () => {
  it('drops exactly the listed fields and keeps every other, nulls included', () => {
    expect(PAGE_UNREAD_OFFER_FIELDS).toEqual(['imageUrl', 'firstSeenAt', 'isNew']);
    const slim = slimOffer(offer({ format: 'Miniature', title: 'A set' })) as Record<string, unknown>;
    expect(Object.keys(slim).sort()).toEqual(['fetchedAt', 'format', 'price', 'promoEndsAt', 'rating', 'retailerId', 'stock', 'title', 'url', 'wasPrice']);
    expect(slim.wasPrice).toBeNull();
    expect(slim.rating).toBeNull();
  });

  it('leaves anything that is not an offer alone', () => {
    for (const v of [null, 3, 'x', [1, 2], { id: 'ean-1', slug: 'a_b_50ml', image: 'https://x', firstSeenAt: 'kept: not an offer' }]) {
      expect(slimOffer(v)).toEqual(v);
    }
  });

  it('slims a Record<id, offer[]> and returns other shapes untouched', () => {
    const blob = { 'ean-1': [offer(), offer({ retailerId: 'escentual' })], 'ean-2': 'not offers' };
    const out = slimOffersBlob(blob) as Record<string, unknown>;
    expect((out['ean-1'] as Record<string, unknown>[]).every((o) => !('imageUrl' in o) && !('firstSeenAt' in o) && !('isNew' in o))).toBe(true);
    expect(out['ean-2']).toBe('not offers');
    expect(slimOffersBlob([offer()])).toEqual([offer()]);
    expect(slimOffersBlob('x')).toBe('x');
  });

  it('slims only the catalogue module\'s offer literals, in place, and counts the offers it touched', () => {
    const blobs: unknown[] = [[{ id: 'p', slug: 's', firstSeenAt: 'product field, kept' }], { 'ean-1': [offer(), offer()] }, { 'ean-1': [offer()] }];
    expect(slimMovedBlobs('catalogue', ['CATALOGUE_CHUNK_0', 'CRAWLED', 'OLDER_OFFERS'], blobs, 0)).toBe(3);
    expect(blobs[0]).toEqual([{ id: 'p', slug: 's', firstSeenAt: 'product field, kept' }]);
    expect(Object.values(blobs[1] as Record<string, Record<string, unknown>[]>).flat().some((o) => 'imageUrl' in o)).toBe(false);
    const deals: unknown[] = [{ 'ean-1': [offer()] }];
    expect(slimMovedBlobs('deals', ['DEALS_RAW'], deals, 0)).toBe(0);
    expect(deals).toEqual([{ 'ean-1': [offer()] }]);
    // A literal under another name in the catalogue module is left whole.
    const other: unknown[] = [{ 'ean-1': [offer()] }];
    expect(slimMovedBlobs('catalogue', ['HISTORY_ALIASES'], other, 0)).toBe(0);
    expect(other).toEqual([{ 'ean-1': [offer()] }]);
  });
});

const built = existsSync(join(REPO_ROOT, 'demo/index.html')) && existsSync(join(REPO_ROOT, 'dist-demo/bundle.js'));
const read = (f: string) => readFileSync(join(REPO_ROOT, 'demo', f), 'utf8');

describe.skipIf(!built)('the built page', () => {
  it('runs no code that reads a listed field, so the slimming cannot change what it shows', () => {
    const bundle = readFileSync(join(REPO_ROOT, 'dist-demo/bundle.js'), 'utf8');
    for (const field of PAGE_UNREAD_OFFER_FIELDS) {
      // Every member read of the field in the minified bundle. The one allowed
      // use is priceService copying `offer.imageUrl` into an offer row that
      // nothing reads (`imageUrl:X.imageUrl??null`), which the first branch
      // matches; a read anywhere else fails here.
      const reads = [...bundle.matchAll(new RegExp(`\\.${field}\\b`, 'g'))].map((m) => bundle.slice(Math.max(0, m.index! - 12), m.index! + field.length + 8));
      const unexpected = reads.filter((r) => !new RegExp(`${field}:[A-Za-z_$][\\w$]*\\.${field}\\?\\?null`).test(r));
      expect(unexpected, `${field} is read by the bundle; take it off PAGE_UNREAD_OFFER_FIELDS`).toEqual([]);
    }
  });

  it('publishes every region\'s offers without the listed fields, and the module keeps them', () => {
    for (const region of liveRegions()) {
      const prefix = region.pathPrefix === '' ? '' : `${region.pathPrefix}/`;
      const page = read(`${prefix}index.html`);
      const file = referencedDataFiles(page).find((f) => f.startsWith('data/catalogue.'))!;
      const blobs = JSON.parse(read(`${prefix}${file}`)) as unknown[];
      const crawled = blobs.filter((b): b is Record<string, Record<string, unknown>[]> => !!b && typeof b === 'object' && !Array.isArray(b)
        && Object.values(b).some((v) => Array.isArray(v) && v.length > 0 && typeof (v[0] as { retailerId?: unknown })?.retailerId === 'string'));
      expect(crawled.length, `${region.id}: an offers blob`).toBeGreaterThan(0);
      const offers = crawled.flatMap((b) => Object.values(b).flat());
      expect(offers.length, region.id).toBeGreaterThan(100);
      for (const field of PAGE_UNREAD_OFFER_FIELDS) {
        expect(offers.filter((o) => field in o).length, `${region.id}: offers carrying ${field}`).toBe(0);
      }
      // What the page does read is still there on every offer.
      for (const field of ['retailerId', 'price', 'stock', 'url', 'fetchedAt']) {
        expect(offers.every((o) => field in o), `${region.id}: every offer has ${field}`).toBe(true);
      }
    }
    // The UK module on disk, which tests and scripts import, is whole.
    const module = readFileSync(join(REPO_ROOT, 'demo/catalogue.generated.ts'), 'utf8');
    for (const field of PAGE_UNREAD_OFFER_FIELDS) expect(module, field).toContain(`"${field}":`);
  });

  it('slims nothing else: the product entries carry every field the module gives them', () => {
    const file = referencedDataFiles(read('index.html')).find((f) => f.startsWith('data/catalogue.'))!;
    const blobs = JSON.parse(read(file)) as unknown[];
    const products = blobs.filter((b): b is { slug: string }[] => Array.isArray(b) && b.length > 0 && typeof (b[0] as { slug?: unknown })?.slug === 'string').flat();
    expect(products.length).toBeGreaterThan(1000);
    for (const field of ['id', 'slug', 'brand', 'name', 'concentration', 'image', 'notes', 'shops']) {
      expect(products.every((p) => field in p), field).toBe(true);
    }
    void readdirSync;
  });
});

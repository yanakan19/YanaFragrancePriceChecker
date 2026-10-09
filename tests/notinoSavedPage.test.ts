/**
 * The owner assisted Notino importer (docs/NOTINO-PLAN.md route 3).
 *
 * The fixtures are hand made, not real Notino pages: the owner's saved page is
 * not in the repository. fixtures/notino-saved/product-page.html carries fake
 * account details, a JWT, an IP address and a cookie on purpose.
 */
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parseNotinoSavedPage, looksSecret, barcodeFromVariantImage } from '../src/catalogue/notinoSavedPage.js';
import { ingestNotinoPages } from '../src/catalogue/notinoImport.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { getRetailer } from '../src/config/retailers.js';
import { fragranceId, isCatalogueListing } from '../src/catalogue/fragranceId.js';
import { settleBarcodeSizes } from '../src/catalogue/productMatch.js';
import { isTooOldToShow } from '../src/services/offerAge.js';
import type { RawListing, StoredListing } from '../src/catalogue/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (n: string) => readFileSync(resolve(here, '../fixtures/notino-saved', n), 'utf8');
const NOW = new Date('2026-10-06T12:00:00Z');
const SAVED = new Date('2026-10-05T08:00:00Z');
const parse = (html: string, fileTime: Date | null = SAVED) => parseNotinoSavedPage(html, { fileTime, now: NOW });
const retailer = getRetailer('notino-uk')!;

const SECRETS = [
  'jane.doe@example.com', 'Jane Doe', 'eyJhbGciOiJIUzI1NiIs', 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV', '203.0.113.77',
  'SECRETCOOKIEVALUE', 'Zm9vYmFyYmF6', 'SHOULDNOTSURVIVE', 'sid=abc123', 'utm_source', 'Free text that is never copied',
];

describe('product page', () => {
  const r = parse(fixture('product-page.html'));

  it('reads each variant with its own barcode, size and price', () => {
    expect(r.refusal).toBeNull();
    expect(r.listings).toHaveLength(2);
    const big = r.listings.find((l) => l.retailerSku === '16000001')!;
    const small = r.listings.find((l) => l.retailerSku === '16000002')!;
    expect(big).toMatchObject({ ean: '3348901642781', priceGbp: 25.5, inStock: true, rawBrand: 'Example House' });
    expect(big.rawTitle).toBe('Example House Example Rose Eau de Parfum 105ml');
    expect(small).toMatchObject({ ean: '3520315001235', priceGbp: 9.7, inStock: false });
    expect(small.rawTitle).toContain('10ml');
    expect(big.url).toBe('https://www.notino.co.uk/example-house/example-rose-eau-de-parfum/');
    expect(big.imageUrl).toBe('https://cdn.notinoimg.com/detail_main_lq/example-house/3348901642781_01-o.jpg');
  });

  it('keeps concentration, gender and the notes pyramid, and ignores the Converted RRP', () => {
    const big = r.listings[0]!;
    expect(big.description).toBe(
      'Eau de Parfum For women. Top notes: Pink Pepper, Bergamot. Middle notes: Rose, Peony. Base notes: Musk, Cedarwood.',
    );
    expect(big.wasPriceGbp).toBeNull();
  });

  it('reads the delivery option the page states', () => {
    expect(r.delivery).toEqual([{ name: 'Evri', priceGbp: 2.99, minDays: 3, maxDays: 4 }]);
  });

  it('takes the date read from the file time, not the import date', () => {
    expect(r.readAt).toBe(SAVED.toISOString());
  });
});

describe('brand page', () => {
  const r = parse(fixture('brand-page.html'), null);
  it('reads many products, takes the date inside the page, drops a non GBP price', () => {
    expect(r.refusal).toBeNull();
    expect(r.readAt).toBe('2026-10-02T09:30:00.000Z');
    expect(r.listings.map((l) => l.retailerSku)).toEqual(['16000010', '16000011']);
    expect(r.skipped).toBe(1);
    expect(r.listings[1]!.ean).toBeNull();
  });
});

describe('refusals', () => {
  it('refuses a Cloudflare challenge page', () => {
    const html = '<html><head><title>Just a moment...</title></head><body><div class="cf-chl-widget"></div></body></html>';
    expect(parse(html).refusal).toBe('challenge-page');
  });
  it('refuses a page from another host', () => {
    const html = fixture('product-page.html').replace(/https:\/\/www\.notino\.co\.uk/g, 'https://www.example.org');
    expect(parse(html).refusal).toBe('not-notino');
  });
  it('refuses a page with no date and a date in the future', () => {
    expect(parse(fixture('product-page.html'), null).refusal).toBe('no-read-date');
    expect(parse(fixture('product-page.html'), new Date('2027-01-01')).refusal).toBe('read-date-in-future');
  });
  it('refuses a page with no product', () => {
    expect(parse('<!-- captured 2026-10-02T09:30:00.000Z from https://www.notino.co.uk/ --><html></html>').refusal).toBe('no-products');
  });
});

describe('secrets never reach the output', () => {
  it('writes none of the fake account details into the listings', () => {
    const out = JSON.stringify(parse(fixture('product-page.html')));
    for (const s of SECRETS) expect(out, s).not.toContain(s);
  });

  it('drops a listing whose copied text carries a secret', () => {
    const html = fixture('brand-page.html').replace('Noir Eau de Toilette', 'Noir jane.doe@example.com');
    const r = parse(html, null);
    expect(r.listings.map((l) => l.retailerSku)).toEqual(['16000011']);
    expect(JSON.stringify(r)).not.toContain('jane.doe');
  });

  it('recognises the shapes it guards against, and not a product name', () => {
    expect(looksSecret('a@b.co')).toBe(true);
    expect(looksSecret('eyJhbGciOiJI.eyJzdWIiOiIx.abc')).toBe(true);
    expect(looksSecret('10.0.0.1')).toBe(true);
    expect(looksSecret('token: abc')).toBe(true);
    expect(looksSecret('Example House Noir Eau de Parfum 100 ml')).toBe(false);
  });
});

describe('the import script prints no page content', () => {
  it('runs against a dry inbox holding the fake page and prints no secret', async () => {
    const { spawnSync } = await import('node:child_process');
    const dir = mkdtempSync(join(tmpdir(), 'notino-inbox-'));
    try {
      writeFileSync(join(dir, 'page.html'), fixture('product-page.html'));
      const run = spawnSync('npx', ['tsx', 'scripts/import-notino-pages.ts', `--dir=${dir}`, '--dry-run'], {
        cwd: resolve(here, '..'), encoding: 'utf8',
      });
      const all = `${run.stdout}\n${run.stderr}`;
      expect(run.status).toBe(0);
      expect(all).toContain('2 products (2 with a barcode)');
      expect(all).toContain('Dry run');
      for (const s of SECRETS) expect(all, s).not.toContain(s);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('does nothing when the inbox is empty or missing', async () => {
    const { spawnSync } = await import('node:child_process');
    const run = spawnSync('npx', ['tsx', 'scripts/import-notino-pages.ts', '--dir=/nonexistent-notino-inbox'], {
      cwd: resolve(here, '..'), encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Nothing to do');
  }, 60_000);
});

describe('importing into the store', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const store = () => {
    const d = mkdtempSync(join(tmpdir(), 'notino-store-'));
    dirs.push(d);
    return new CatalogueStore(d);
  };
  const read = (s: string, d: Date | null = SAVED) => {
    const r = parse(s, d);
    return { readAt: r.readAt!, listings: r.listings };
  };

  it('does nothing with no pages', () => {
    const s = store();
    expect(ingestNotinoPages(s, retailer, []).written).toBe(false);
    expect(s.read('notino-uk').listings).toHaveLength(0);
  });

  it('stores the date read as lastSeenAt, so the 7 day rule counts from the save', () => {
    const s = store();
    expect(ingestNotinoPages(s, retailer, [read(fixture('product-page.html'))]).written).toBe(true);
    const stored = s.read('notino-uk').listings;
    expect(stored).toHaveLength(2);
    for (const l of stored) {
      expect(l.lastSeenAt).toBe(SAVED.toISOString());
      expect(l.eligibleForNewBadge).toBe(false);
      expect(isTooOldToShow(l.lastSeenAt, new Date('2026-10-11T00:00:00Z'))).toBe(false);
      expect(isTooOldToShow(l.lastSeenAt, new Date('2026-10-13T09:00:00Z'))).toBe(true);
    }
  });

  it('one page never delists the others, and an older file never overwrites a newer read', () => {
    const s = store();
    ingestNotinoPages(s, retailer, [read(fixture('product-page.html')), read(fixture('brand-page.html'), null)]);
    expect(s.read('notino-uk').listings.filter((l) => l.status === 'active')).toHaveLength(4);
    const older = fixture('product-page.html').replace('"price":"25.50"', '"price":"20.00"');
    const out = ingestNotinoPages(s, retailer, [read(older, new Date('2026-10-01T00:00:00Z'))]);
    expect(out.olderThanStored).toBe(2);
    expect(s.read('notino-uk').listings.find((l) => l.retailerSku === '16000001')!.priceGbp).toBe(25.5);
  });
});

describe('matching by barcode, never by rounding sizes', () => {
  const stored = (l: RawListing, retailerId: string): StoredListing => ({
    ...l, retailerId, firstSeenAt: '', lastSeenAt: '', status: 'active', delistedAt: null, relistedAt: null,
    eligibleForNewBadge: false, variantId: null,
  });
  const notino = parse(fixture('product-page.html')).listings.map((l) => stored(l, 'notino-uk'));
  const big = notino.find((l) => l.retailerSku === '16000001')!;

  it('gives a Notino offer the product id of the same barcode at another shop', () => {
    const other = stored({ ...big, retailerSku: 'x1', rawTitle: 'Example House Example Rose EDP 105ml' }, 'other-shop');
    expect(fragranceId(big)).toBe('ean-3348901642781');
    expect(fragranceId(big)).toBe(fragranceId(other));
  });

  it('never joins on size alone: another barcode at the same size is another product', () => {
    const other = stored({ ...big, retailerSku: 'x2', ean: '3145743003219' }, 'other-shop');
    expect(fragranceId(other)).not.toBe(fragranceId(big));
    const noBarcode = stored({ ...big, retailerSku: 'x3', ean: null }, 'other-shop');
    expect(fragranceId(noBarcode)).not.toBe(fragranceId(big));
  });

  it('105 ml against 100 ml: one other shop keeps the sizes apart, two outvote it on the barcode', () => {
    const vote = (retailerId: string, sizeMl: number) => ({ retailerId, retailerSku: 'a', ean: '3348901642781', sizeMl });
    const one = settleBarcodeSizes([vote('shop-a', 100), vote('notino-uk', 105)]);
    expect(one.outvoted.size).toBe(0);
    const two = settleBarcodeSizes([vote('shop-a', 100), vote('shop-b', 100), vote('notino-uk', 105)]);
    expect(two.outvoted.get('notino-uk|a')).toBe(100);
    // The importer never rounds: Notino's own label is what is stored.
    expect(big.rawTitle).toContain('105ml');
  });
});

describe('a saved Notino product page with several sizes (the Armani page saved 2026-10-07)', () => {
  const base = 'https://www.notino.co.uk/armani/emporio-stronger-with-you-intensely-eau-de-parfum-for-men/';
  const ean: Record<number, string> = { 150: '3614274347388', 100: '3614272225718', 30: '3614272225695' };
  const offer = (ml: number, id: number, sku: string, price: number, extra: Record<string, unknown> = {}) => ({
    '@type': 'Offer', name: `Armani Emporio Stronger With You Intensely ${ml} ml`, sku, price, priceCurrency: 'GBP',
    availability: 'https://schema.org/InStock', url: `/armani/emporio-stronger-with-you-intensely-eau-de-parfum-for-men/p-${id}/`,
    image: `https://cdn.notinoimg.com/order_2k/armani/${ean[ml]}_01-o/emporio-stronger-with-you-intensely___190118.jpg`, ...extra,
  });
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', '@id': base, name: 'Armani Emporio Stronger With You Intensely',
    sku: 'GIOSWIM_AEDP10', gtin13: '3614274347388', category: 'eau de parfum for men', brand: { '@type': 'Brand', name: 'Armani' },
    offers: [
      offer(100, 15802363, 'GIOSWIM_AEDP10', 65.36, { priceValidUntil: '2026-10-11T22:59:59+00:00' }),
      offer(30, 15802388, 'GIOSWIM_AEDP30', 46.66, { priceValidUntil: '2026-10-11T22:59:59+00:00' }),
      offer(150, 16286591, 'GIOSWYM_AEDP15', 79.5),
      offer(100, 15802363, 'GIOSWIM_AEDP10', 76.9),
      offer(30, 15802388, 'GIOSWIM_AEDP30', 54.9),
    ],
  };
  const html = `<!-- captured 2026-10-07T00:00:00Z from ${base} --><html><head><link rel="canonical" href="${base}"/></head><body>
<script type="application/ld+json">${JSON.stringify(ld)}</script></body></html>`;
  const out = parseNotinoSavedPage(html, { fileTime: null, now: new Date('2026-10-07T12:00:00Z') });
  const by = Object.fromEntries(out.listings.map((l) => [l.retailerSku, l]));

  it('reads each size once, at the shelf price, not the discount code price listed first', () => {
    expect(out.listings).toHaveLength(3);
    expect(by['GIOSWIM_AEDP10']!.priceGbp).toBe(76.9);
    expect(by['GIOSWIM_AEDP30']!.priceGbp).toBe(54.9);
    expect(by['GIOSWYM_AEDP15']!.priceGbp).toBe(79.5);
  });

  it('gives each size its own barcode, from its own photo address, never the product\'s', () => {
    expect(by['GIOSWIM_AEDP10']!.ean).toBe('3614272225718');
    expect(by['GIOSWIM_AEDP30']!.ean).toBe('3614272225695');
    expect(by['GIOSWYM_AEDP15']!.ean).toBe('3614274347388');
    expect(barcodeFromVariantImage('https://cdn.notinoimg.com/order_2k/armani/3614272225719_01-o/x.jpg')).toBeNull();
    expect(barcodeFromVariantImage('https://example.com/order_2k/armani/3614272225718_01-o/x.jpg')).toBeNull();
  });

  it('names the strength its category gives in the title, so the catalogue takes it', () => {
    expect(by['GIOSWIM_AEDP10']!.rawTitle).toBe('Armani Emporio Stronger With You Intensely Eau de Parfum 100ml');
    expect(isCatalogueListing({ ...by['GIOSWIM_AEDP10']!, retailerId: 'notino-uk' } as never)).toBe(true);
    expect(by['GIOSWIM_AEDP10']!.description).toBe('Eau de Parfum For men.');
  });
});

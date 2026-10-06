import { describe, it, expect } from 'vitest';
import {
  NO_BARCODE_RECHECK_DAYS,
  handleOf,
  parseProductJs,
  productJsUrl,
  readBarcodesFromProductJs,
  type BarcodeReadOptions,
  type HeldBarcode,
} from '../src/catalogue/barcodeFromProductJs.js';
import { isCatalogueListing, fragranceId } from '../src/catalogue/fragranceId.js';
import { giftSetId } from '../src/catalogue/giftSet.js';
import { findDuplicateGroups, isBarcode, normalizedEan, type MatchableProduct } from '../src/catalogue/productMatch.js';
import { parseShopifyProducts } from '../src/catalogue/shopifyJson.js';
import { parseRobots, isAllowed } from '../src/catalogue/robots.js';
import { siblingKey } from '../src/catalogue/siblingKey.js';
import { RETAILERS } from '../src/config/retailers.js';
import {
  BARCODE_BACKOFF_HOURS,
  barcodeBackoffUntil,
  parseCursor,
  withBarcodeBackoff,
  EMPTY_CURSOR,
} from '../src/catalogue/harvestCursor.js';
import { listingIdForms, settleIdAliases } from '../src/catalogue/idAliases.js';
import { assignSlugs, slugAliases, type SlugProduct } from '../src/catalogue/productSlug.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { RawListing, StoredListing } from '../src/catalogue/types.js';

/**
 * Stored examples, never live values. SPLENDIDA is a trimmed copy of what
 * https://www.perfumedirect.com/products/bvlgari-splendida-patchouli-tentation-eau-de-parfum-womens-perfume-spray-100ml.js
 * served PriceSniffsBot on 2026-10-05, keeping only the fields the read uses (the
 * real file also carries the description, the images and the selling plans).
 * ROBOTS is the part of that shop's robots.txt that bears on a product file.
 * The files for the other products are made up to exercise the rules, and say so.
 */

const ROBOTS = parseRobots(`
User-agent: *
Allow: /
Disallow: /admin
Disallow: /cart/
Disallow: /checkout
Disallow: /cart.js
Disallow: /*/cart.js
Disallow: /recommendations/products
Disallow: /collections/*sort_by*
Sitemap: https://www.perfumedirect.com/sitemap.xml
`);

/** Real, trimmed. Three sizes of one product, one barcode each. */
const SPLENDIDA = JSON.stringify({
  id: 7573591621791,
  title: "Bvlgari Splendida Patchouli Tentation Eau de Parfum Women's Perfume Spray (30ml, 50ml, 100ml)",
  handle: 'bvlgari-splendida-patchouli-tentation-eau-de-parfum-womens-perfume-spray-100ml',
  vendor: 'Bvlgari',
  variants: [
    { id: 42777456181407, title: '30ml', sku: '17447PD', barcode: '0783320411182', price: 4699 },
    { id: 42830358970527, title: '50ml', sku: '17448PD', barcode: '0783320411175', price: 5999 },
    { id: 42777456214175, title: '100ml', sku: '17449PD', barcode: '0783320411274', price: 8999 },
  ],
});
const SPLENDIDA_HANDLE = 'bvlgari-splendida-patchouli-tentation-eau-de-parfum-womens-perfume-spray-100ml';

const ORIGIN = 'https://www.perfumedirect.com';
const NOW = new Date('2026-10-06T10:00:00Z');
const noSleep = async () => {};
const HEADERS = { 'user-agent': 'PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about)' };

const listing = (sku: string, handle: string, title: string, variantId: string | null, extra: Partial<RawListing> = {}): RawListing => ({
  retailerSku: sku,
  url: `https://perfumedirect.com/products/${handle}`,
  rawTitle: title,
  rawBrand: 'Bvlgari',
  ean: null,
  shopVariantId: variantId,
  imageUrl: null,
  priceGbp: 46.99,
  wasPriceGbp: null,
  promoEndsAt: null,
  inStock: true,
  sectionId: 'shopify-products-json',
  productType: 'Fragrance',
  ...extra,
});

const SPLENDIDA_LISTINGS = [
  listing('17447PD', SPLENDIDA_HANDLE, "Bvlgari Splendida Patchouli Tentation Eau de Parfum Women's Perfume Spray (30ml) 30ml", '42777456181407'),
  listing('17448PD', SPLENDIDA_HANDLE, "Bvlgari Splendida Patchouli Tentation Eau de Parfum Women's Perfume Spray (50ml) 50ml", '42830358970527'),
  listing('17449PD', SPLENDIDA_HANDLE, "Bvlgari Splendida Patchouli Tentation Eau de Parfum Women's Perfume Spray (100ml) 100ml", '42777456214175'),
];

/** A fake shop: answers each product file from a table, and records what was asked. */
function shop(files: Record<string, { status?: number; body: string }>, asked: string[]): Http {
  return async (url) => {
    asked.push(url);
    const handle = /\/products\/(.+)\.js$/.exec(url)?.[1] ?? '';
    const f = files[handle];
    if (!f) return { status: 404, body: '', ok: false };
    const status = f.status ?? 200;
    return { status, body: f.body, ok: status >= 200 && status < 300 };
  };
}

function options(http: Http, over: Partial<BarcodeReadOptions> = {}): BarcodeReadOptions {
  return {
    http,
    robots: ROBOTS,
    headers: HEADERS,
    origin: ORIGIN,
    gapMs: 0,
    maxReads: 100,
    sleep: noSleep,
    now: NOW,
    held: new Map(),
    wanted: () => true,
    ...over,
  };
}

describe('the product file', () => {
  it('parses a stored .js sample: one product, a barcode on every variant', () => {
    const file = parseProductJs(SPLENDIDA)!;
    expect(file.handle).toBe(SPLENDIDA_HANDLE);
    expect(file.variants.map((v) => [v.id, v.sku, v.barcode])).toEqual([
      ['42777456181407', '17447PD', '0783320411182'],
      ['42830358970527', '17448PD', '0783320411175'],
      ['42777456214175', '17449PD', '0783320411274'],
    ]);
  });

  it('is not a product file when it is a challenge page, an error document or empty', () => {
    expect(parseProductJs('<!doctype html><title>Just a moment...</title>')).toBeNull();
    expect(parseProductJs('{"error":"rate limited"}')).toBeNull();
    expect(parseProductJs('')).toBeNull();
    expect(parseProductJs('[]')).toBeNull();
  });

  it('names the file at the www host for a product whose stored address is the apex host', () => {
    expect(handleOf(SPLENDIDA_LISTINGS[0]!.url)).toBe(SPLENDIDA_HANDLE);
    expect(productJsUrl(ORIGIN, SPLENDIDA_HANDLE)).toBe(`${ORIGIN}/products/${SPLENDIDA_HANDLE}.js`);
    expect(handleOf('https://perfumedirect.com/collections/all')).toBeNull();
  });

  it('is allowed by the shop’s robots.txt, which disallows /cart.js and not a product file', () => {
    expect(isAllowed(ROBOTS, productJsUrl(ORIGIN, SPLENDIDA_HANDLE))).toBe(true);
    expect(isAllowed(ROBOTS, `${ORIGIN}/cart.js`)).toBe(false);
    expect(isAllowed(ROBOTS, `${ORIGIN}/products.json?limit=250&page=1`)).toBe(true);
  });
});

describe('reading barcodes', () => {
  it('reads one request for a product with three sizes, and stores each size’s own barcode', async () => {
    const asked: string[] = [];
    const out = await readBarcodesFromProductJs(SPLENDIDA_LISTINGS, options(shop({ [SPLENDIDA_HANDLE]: { body: SPLENDIDA } }, asked)));
    expect(asked).toEqual([`${ORIGIN}/products/${SPLENDIDA_HANDLE}.js`]);
    expect(out.fetched).toBe(1);
    expect(out.listings.map((l) => l.ean)).toEqual(['0783320411182', '0783320411175', '0783320411274']);
    expect(out.listings.every((l) => l.eanReadAt === NOW.toISOString())).toBe(true);
    expect(out.newBarcodes).toBe(3);
    expect(out.withBarcode).toBe(3);
    expect(out.stopped).toBeNull();
  });

  it('matches a variant by Shopify’s own id, not by its position in the file', async () => {
    const reversed = JSON.stringify({ ...JSON.parse(SPLENDIDA), variants: [...JSON.parse(SPLENDIDA).variants].reverse() });
    const out = await readBarcodesFromProductJs(SPLENDIDA_LISTINGS, options(shop({ [SPLENDIDA_HANDLE]: { body: reversed } }, [])));
    expect(out.listings.map((l) => l.ean)).toEqual(['0783320411182', '0783320411175', '0783320411274']);
  });

  it('stores a 12 digit UPC-A as the 13 digit EAN, and refuses a placeholder', async () => {
    const body = JSON.stringify({
      id: 1,
      handle: 'made-up-upc',
      variants: [
        { id: 11, sku: 'A1', barcode: '769915234053' },
        { id: 12, sku: 'A2', barcode: '000000000000' },
        { id: 13, sku: 'A3', barcode: '' },
        { id: 14, sku: 'A4', barcode: '50509PD' },
      ],
    });
    const input = ['A1', 'A2', 'A3', 'A4'].map((sku, i) => listing(sku, 'made-up-upc', `Made Up ${sku} 50ml`, String(11 + i)));
    const out = await readBarcodesFromProductJs(input, options(shop({ 'made-up-upc': { body } }, [])));
    expect(out.listings.map((l) => l.ean)).toEqual(['0769915234053', null, null, null]);
    expect(out.refused).toEqual({ placeholder: 1, empty: 1, 'not-digits': 1 });
    // All four were read: the ones with nothing usable are marked read, not left looking unread.
    expect(out.listings.every((l) => l.eanReadAt === NOW.toISOString())).toBe(true);
    expect(out.unreadLeft).toBe(0);
  });

  it('drops a barcode the shop typed on two sizes of one product: it names neither', async () => {
    const body = JSON.stringify({
      id: 2,
      handle: 'made-up-twin',
      variants: [
        { id: 21, sku: 'T1', barcode: '3348900103870' },
        { id: 22, sku: 'T2', barcode: '3348900103870' },
        { id: 23, sku: 'T3', barcode: '0783320411274' },
      ],
    });
    const input = ['T1', 'T2', 'T3'].map((sku, i) => listing(sku, 'made-up-twin', `Made Up ${sku}`, String(21 + i)));
    const out = await readBarcodesFromProductJs(input, options(shop({ 'made-up-twin': { body } }, [])));
    expect(out.listings.map((l) => l.ean)).toEqual([null, null, '0783320411274']);
    expect(out.refused['shared-by-variants']).toBe(2);
  });

  it('leaves a listing unread, not guessed, when its variant is not in the file', async () => {
    const stray = [listing('99999PD', SPLENDIDA_HANDLE, 'Bvlgari Something 50ml', '1')];
    const out = await readBarcodesFromProductJs(stray, options(shop({ [SPLENDIDA_HANDLE]: { body: SPLENDIDA } }, [])));
    expect(out.listings[0]!.ean).toBeNull();
    expect(out.listings[0]!.eanReadAt).toBeUndefined();
    expect(out.unreadLeft).toBe(1);
  });

  it('does not read what is not a fragrance', async () => {
    const asked: string[] = [];
    const lotion = listing('L1', 'body-lotion', 'Body Lotion 200ml', '5', { productType: 'Skin Care' });
    const out = await readBarcodesFromProductJs([lotion], options(shop({}, asked), { wanted: (l) => isCatalogueListing({ ...l, retailerId: 'perfume-direct' } as StoredListing) }));
    expect(asked).toEqual([]);
    expect(out.wantedListings).toBe(0);
  });
});

describe('the incremental read', () => {
  const held = (listings: RawListing[], read: RawListing[], at = '2026-10-05T10:00:00.000Z'): Map<string, HeldBarcode> =>
    new Map(listings.map((l, i) => [l.retailerSku, { ean: read[i]!.ean, eanReadAt: at, shopVariantId: l.shopVariantId ?? null }]));

  it('never asks for a barcode it already holds while the variant is unchanged', async () => {
    const first = await readBarcodesFromProductJs(SPLENDIDA_LISTINGS, options(shop({ [SPLENDIDA_HANDLE]: { body: SPLENDIDA } }, [])));
    const asked: string[] = [];
    const again = await readBarcodesFromProductJs(
      SPLENDIDA_LISTINGS,
      options(shop({ [SPLENDIDA_HANDLE]: { body: SPLENDIDA } }, asked), { held: held(SPLENDIDA_LISTINGS, first.listings) }),
    );
    expect(asked).toEqual([]);
    expect(again.fetched).toBe(0);
    expect(again.carried).toBe(3);
    expect(again.listings.map((l) => l.ean)).toEqual(first.listings.map((l) => l.ean));
  });

  it('asks again when the shop gives the listing a different variant', async () => {
    const first = await readBarcodesFromProductJs(SPLENDIDA_LISTINGS, options(shop({ [SPLENDIDA_HANDLE]: { body: SPLENDIDA } }, [])));
    const reissued = SPLENDIDA_LISTINGS.map((l, i) => (i === 1 ? { ...l, shopVariantId: '42830358970999' } : l));
    const body = JSON.stringify({
      ...JSON.parse(SPLENDIDA),
      variants: JSON.parse(SPLENDIDA).variants.map((v: { id: number }) => (v.id === 42830358970527 ? { ...v, id: 42830358970999, barcode: '0783320411175' } : v)),
    });
    const asked: string[] = [];
    const again = await readBarcodesFromProductJs(
      reissued,
      options(shop({ [SPLENDIDA_HANDLE]: { body } }, asked), { held: held(SPLENDIDA_LISTINGS, first.listings) }),
    );
    expect(asked).toHaveLength(1);
    expect(again.carried).toBe(2);
    expect(again.listings[1]!.ean).toBe('0783320411175');
  });

  it('does not ask again for a barcode field that held nothing, until it is old enough', async () => {
    const empty = JSON.stringify({ id: 3, handle: 'made-up-empty', variants: [{ id: 31, sku: 'E1', barcode: '' }] });
    const input = [listing('E1', 'made-up-empty', 'Made Up Empty 50ml', '31')];
    const first = await readBarcodesFromProductJs(input, options(shop({ 'made-up-empty': { body: empty } }, [])));
    expect(first.listings[0]!.ean).toBeNull();

    const recent = new Map<string, HeldBarcode>([['E1', { ean: null, eanReadAt: '2026-09-20T00:00:00.000Z', shopVariantId: '31' }]]);
    const askedRecent: string[] = [];
    await readBarcodesFromProductJs(input, options(shop({ 'made-up-empty': { body: empty } }, askedRecent), { held: recent }));
    expect(askedRecent).toEqual([]);

    const old = new Map<string, HeldBarcode>([['E1', { ean: null, eanReadAt: '2026-08-01T00:00:00.000Z', shopVariantId: '31' }]]);
    const askedOld: string[] = [];
    await readBarcodesFromProductJs(input, options(shop({ 'made-up-empty': { body: empty } }, askedOld), { held: old }));
    expect(askedOld).toHaveLength(1);
    expect(NO_BARCODE_RECHECK_DAYS).toBeGreaterThan(14);
  });

  it('reads at most maxReads products a run and says how many it left', async () => {
    const files: Record<string, { body: string }> = {};
    const input: RawListing[] = [];
    for (let i = 0; i < 7; i++) {
      files[`made-up-${i}`] = { body: JSON.stringify({ id: i, handle: `made-up-${i}`, variants: [{ id: 100 + i, sku: `S${i}`, barcode: '' }] }) };
      input.push(listing(`S${i}`, `made-up-${i}`, `Made Up ${i} 50ml`, String(100 + i)));
    }
    const asked: string[] = [];
    const out = await readBarcodesFromProductJs(input, options(shop(files, asked), { maxReads: 3 }));
    expect(asked).toHaveLength(3);
    expect(out.unreadLeft).toBe(4);
    // The next run, holding what the first settled, takes the next three and not the same ones.
    const heldNow = new Map<string, HeldBarcode>(
      out.listings.filter((l) => l.eanReadAt).map((l) => [l.retailerSku, { ean: l.ean, eanReadAt: l.eanReadAt!, shopVariantId: l.shopVariantId ?? null }]),
    );
    const askedNext: string[] = [];
    await readBarcodesFromProductJs(input, options(shop(files, askedNext), { maxReads: 3, held: heldNow }));
    expect(askedNext).toHaveLength(3);
    expect(askedNext.filter((u) => asked.includes(u))).toEqual([]);
  });

  it('stops at the shop’s deadline', async () => {
    const asked: string[] = [];
    const out = await readBarcodesFromProductJs(SPLENDIDA_LISTINGS, options(shop({ [SPLENDIDA_HANDLE]: { body: SPLENDIDA } }, asked), { deadlineAt: Date.now() - 1 }));
    expect(asked).toEqual([]);
    expect(out.unreadLeft).toBe(3);
  });

  it('reads the listings that look like another shop’s product first, then those never read, then the old', async () => {
    const files: Record<string, { body: string }> = {};
    const input: RawListing[] = [];
    for (const handle of ['alone-a', 'shared-b', 'alone-c', 'shared-d']) {
      files[handle] = { body: JSON.stringify({ id: 1, handle, variants: [{ id: handle.length * 7, sku: handle, barcode: '' }] }) };
      input.push(listing(handle, handle, handle, String(handle.length * 7)));
    }
    const asked: string[] = [];
    await readBarcodesFromProductJs(input, options(shop(files, asked), { looksShared: (l) => l.retailerSku.startsWith('shared') }));
    expect(asked.map((u) => /products\/(.+)\.js/.exec(u)![1])).toEqual(['shared-b', 'shared-d', 'alone-a', 'alone-c']);
  });

  it('keeps a held barcode on a listing the budget did not reach', async () => {
    const withHeld = [listing('X1', 'made-up-x', 'Made Up X 50ml', '9')];
    const heldMap = new Map<string, HeldBarcode>([['X1', { ean: '3348900103870', eanReadAt: '2026-10-01T00:00:00.000Z', shopVariantId: '9' }]]);
    const out = await readBarcodesFromProductJs(withHeld, options(shop({}, []), { held: heldMap, maxReads: 0 }));
    expect(out.listings[0]!.ean).toBe('3348900103870');
  });
});

describe('a refusal is an answer, never worked around', () => {
  const many = (n: number) => {
    const files: Record<string, { status?: number; body: string }> = {};
    const input: RawListing[] = [];
    for (let i = 0; i < n; i++) {
      files[`h${i}`] = { body: JSON.stringify({ id: i, handle: `h${i}`, variants: [{ id: 500 + i, sku: `H${i}`, barcode: '3348900103870' }] }) };
      input.push(listing(`H${i}`, `h${i}`, `Made Up ${i}`, String(500 + i)));
    }
    return { files, input };
  };

  for (const status of [401, 403, 407, 429, 503]) {
    it(`stops the run's reading on HTTP ${status}, asks nothing more and keeps what was read`, async () => {
      const { files, input } = many(6);
      files['h2'] = { status, body: '' };
      const asked: string[] = [];
      const out = await readBarcodesFromProductJs(input, options(shop(files, asked)));
      expect(asked).toHaveLength(3);
      expect(out.stopped).toContain(`HTTP ${status}`);
      expect(out.listings.slice(0, 2).every((l) => l.eanReadAt)).toBe(true);
      expect(out.listings.slice(2).every((l) => !l.eanReadAt)).toBe(true);
      expect(out.unreadLeft).toBe(4);
    });
  }

  it('stops on a 200 that is a bot challenge page and not a product file', async () => {
    const { files, input } = many(4);
    files['h1'] = { body: '<!doctype html><title>Just a moment...</title><body>Checking your browser</body>' };
    const asked: string[] = [];
    const out = await readBarcodesFromProductJs(input, options(shop(files, asked)));
    expect(asked).toHaveLength(2);
    expect(out.stopped).toContain('not a product file');
  });

  it('skips a 404 (the product has gone) and carries on', async () => {
    const { files, input } = many(3);
    delete files['h1'];
    const asked: string[] = [];
    const out = await readBarcodesFromProductJs(input, options(shop(files, asked)));
    expect(asked).toHaveLength(3);
    expect(out.stopped).toBeNull();
    expect(out.listings.map((l) => l.ean)).toEqual(['3348900103870', null, '3348900103870']);
  });

  it('stops after three requests in a row that do not connect', async () => {
    const { input } = many(8);
    const asked: string[] = [];
    const down: Http = async (url) => {
      asked.push(url);
      return { status: 0, body: '', ok: false, error: 'timeout' };
    };
    const out = await readBarcodesFromProductJs(input, options(down));
    expect(asked).toHaveLength(3);
    expect(out.stopped).toContain('did not connect');
  });

  it('never asks for a file robots.txt disallows', async () => {
    const closed = parseRobots('User-agent: *\nDisallow: /products/\n');
    const asked: string[] = [];
    const out = await readBarcodesFromProductJs(SPLENDIDA_LISTINGS, options(shop({ [SPLENDIDA_HANDLE]: { body: SPLENDIDA } }, asked), { robots: closed }));
    expect(asked).toEqual([]);
    expect(out.unread[0]).toContain('robots.txt');
  });

  it('never asks for a file when robots.txt could not be read', async () => {
    const asked: string[] = [];
    const out = await readBarcodesFromProductJs(
      SPLENDIDA_LISTINGS,
      options(shop({ [SPLENDIDA_HANDLE]: { body: SPLENDIDA } }, asked), { robots: { ...ROBOTS, unavailable: true } }),
    );
    expect(asked).toEqual([]);
    expect(out.fetched).toBe(0);
  });

  it('spaces its requests by the gap it is given', async () => {
    const { files, input } = many(3);
    const waits: number[] = [];
    await readBarcodesFromProductJs(input, options(shop(files, []), { gapMs: 2000, sleep: async (ms) => void waits.push(ms) }));
    expect(waits).toEqual([2000, 2000]);
  });

  it('holds the shop’s barcode reads back for six hours after a refusal, and records it', () => {
    const cursor = withBarcodeBackoff(EMPTY_CURSOR, 'perfume-direct', NOW);
    expect(barcodeBackoffUntil(cursor, 'perfume-direct', NOW)).toBe(new Date(NOW.getTime() + BARCODE_BACKOFF_HOURS * 3_600_000).toISOString());
    expect(barcodeBackoffUntil(cursor, 'perfume-direct', new Date(NOW.getTime() + 7 * 3_600_000))).toBeNull();
    expect(barcodeBackoffUntil(cursor, 'someone-else', NOW)).toBeNull();
    // It survives the file: written, read back.
    const back = parseCursor(JSON.stringify(cursor));
    expect(barcodeBackoffUntil(back, 'perfume-direct', NOW)).not.toBeNull();
    // An old cursor with no such field still parses and holds nothing back.
    expect(barcodeBackoffUntil(parseCursor('{"attempted":{"x":"2026-10-01T00:00:00Z"}}'), 'perfume-direct', NOW)).toBeNull();
  });
});

describe('where the listings come from', () => {
  const PRODUCTS_JSON = JSON.stringify({
    products: [
      {
        id: 1,
        title: 'Bvlgari Splendida Eau de Parfum Spray (30ml, 50ml)',
        handle: 'made-up-splendida',
        vendor: 'Bvlgari',
        product_type: 'Fragrance',
        variants: [
          { id: 42777456181407, sku: '17447PD', title: '30ml', price: '46.99', available: true },
          { id: 42830358970527, sku: '17448PD', title: '50ml', price: '59.99', available: true },
        ],
      },
    ],
  });

  it('carries Shopify’s variant id on each listing only when the shop reads barcodes', () => {
    const on = parseShopifyProducts(PRODUCTS_JSON, { origin: ORIGIN, sectionId: 's', currency: 'GBP', keepVariantId: true });
    expect(on.map((l) => l.shopVariantId)).toEqual(['42777456181407', '42830358970527']);
    expect(on.every((l) => l.ean === null)).toBe(true);
    const off = parseShopifyProducts(PRODUCTS_JSON, { origin: ORIGIN, sectionId: 's', currency: 'GBP' });
    expect(off.every((l) => !('shopVariantId' in l))).toBe(true);
  });

  it('is switched on for Perfume Direct alone, at the host whose robots.txt was read, no faster than 3 seconds', () => {
    const shops = RETAILERS.filter((r) => r.barcodeFromProductJs);
    expect(shops.map((r) => r.id)).toEqual(['perfume-direct']);
    const route = shops[0]!.barcodeFromProductJs!;
    expect(route.origin).toBe('https://www.perfumedirect.com');
    expect(route.gapMs).toBeGreaterThanOrEqual(3000);
    expect(route.maxPerRun).toBeGreaterThan(0);
    expect(shops[0]!.shopifyStorefront).toBe(true);
  });

  it('tells a listing that another shop sells by the brand, the name and the size', () => {
    const pd = siblingKey({ rawTitle: "Bvlgari Splendida Patchouli Tentation Eau de Parfum Women's Perfume Spray (50ml) 50ml", rawBrand: 'Bvlgari' }, 'perfume-direct');
    const other = siblingKey({ rawTitle: 'Bvlgari Splendida Patchouli Tentation Eau de Parfum 50ml Spray', rawBrand: 'Bvlgari' }, 'perfume-click');
    expect(pd).not.toBeNull();
    expect(pd).toBe(other);
    // A different size is a different bottle.
    expect(siblingKey({ rawTitle: 'Bvlgari Splendida Patchouli Tentation Eau de Parfum 100ml', rawBrand: 'Bvlgari' }, 'perfume-click')).not.toBe(pd);
    expect(siblingKey({ rawTitle: 'No size here', rawBrand: 'Bvlgari' })).toBeNull();
  });
});

describe('what the catalogue build does with a barcode read here', () => {
  const stored = (retailerId: string, sku: string, ean: string | null): StoredListing => ({
    ...listing(sku, 'x', 'Bvlgari Splendida Patchouli Tentation Eau de Parfum 50ml', null, { ean }),
    retailerId,
    firstSeenAt: '2026-10-01T00:00:00Z',
    lastSeenAt: '2026-10-05T00:00:00Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
  });

  it('gives a Perfume Direct listing the same product id as another shop’s listing of that barcode', () => {
    // Perfume Direct's UPC-A, stored as the EAN-13, and Perfume Click's EAN-13 for the same bottle.
    const pd = stored('perfume-direct', '17448PD', '0783320411175');
    const pc = stored('perfume-click', '104643', '0783320411175');
    expect(fragranceId(pd)).toBe('ean-0783320411175');
    expect(fragranceId(pc)).toBe(fragranceId(pd));
    // Fragrance Click prints the same code as a 12 digit UPC: a different string, one code.
    expect(normalizedEan('783320411175')).toBe(normalizedEan('0783320411175'));
    expect(isBarcode('783320411175')).toBe(true);
  });

  it('keeps a listing with no barcode on its shop-and-SKU identity, as before', () => {
    expect(fragranceId(stored('perfume-direct', '17448PD', null))).toBe('perfume-direct-17448pd');
  });

  describe('two barcodes keep two products apart', () => {
    interface P extends MatchableProduct {
      shops: string[];
    }
    const product = (id: string, ean: string | null, shops: string[]): P => ({
      id, brand: 'Bvlgari', name: 'Splendida Patchouli Tentation', concentration: 'Eau de Parfum', sizeMl: 50, ean, shops,
    });

    it('does not merge two Perfume Direct products with the same name and different barcodes', () => {
      const a = product('ean-0783320411175', '0783320411175', ['perfume-direct']);
      const b = product('ean-0783320411199', '0783320411199', ['perfume-direct']);
      expect(findDuplicateGroups([a, b], { shopsOf: (p) => p.shops })).toEqual([]);
      expect(findDuplicateGroups([a, b])).toEqual([]);
    });

    it('does not fold a Perfume Direct product with a barcode into another shop’s bottle with a different one while a shop sells both', () => {
      const a = product('ean-0783320411175', '0783320411175', ['perfume-direct', 'perfume-click']);
      const b = product('ean-0783320411199', '0783320411199', ['perfume-direct']);
      expect(findDuplicateGroups([a, b], { shopsOf: (p) => p.shops })).toEqual([]);
    });

    it('does merge a barcode-less listing of the same name into the barcoded product, and two shops with one code into one', () => {
      const withCode = product('ean-0783320411175', '0783320411175', ['perfume-direct']);
      const bare = product('other-shop-1', null, ['justmylook']);
      const groups = findDuplicateGroups([withCode, bare], { shopsOf: (p) => p.shops });
      expect(groups).toHaveLength(1);
      expect(groups[0]!.canonical.id).toBe(withCode.id);
      expect(groups[0]!.absorbed.map((p) => p.id)).toEqual(['other-shop-1']);
    });
  });
});

describe('a Perfume Direct product that a barcode moves onto another id keeps both old addresses', () => {
  const sku = stored0('perfume-direct', '17448PD', '0783320411175');
  const oldId = 'perfume-direct-17448pd';
  const survivorId = 'ean-0783320411175';
  const shape = (id: string): SlugProduct => ({
    id, brand: 'Bvlgari', name: 'Splendida Patchouli Tentation', concentration: 'Eau de Parfum', sizeMl: 50, giftSet: false,
  });

  function stored0(retailerId: string, retailerSku: string, ean: string | null): StoredListing {
    return {
      ...listing(retailerSku, 'x', 'Bvlgari Splendida Patchouli Tentation Eau de Parfum 50ml', null, { ean }),
      retailerId, firstSeenAt: '2026-10-01T00:00:00Z', lastSeenAt: '2026-10-05T00:00:00Z', status: 'active',
      delistedAt: null, relistedAt: null, eligibleForNewBadge: false, variantId: null,
    };
  }

  it('lists the shop-and-SKU id as a form of the listing, so the build folds it into the barcode product', () => {
    expect(listingIdForms(sku, new Set())).toEqual([oldId, survivorId]);
    // Before the barcode was read it had only the first.
    expect(listingIdForms({ ...sku, ean: null }, new Set())).toEqual([oldId]);
  });

  it('redirects the old id to the survivor, and the old address to the survivor’s address', () => {
    const aliases = settleIdAliases({
      previous: {},
      wasPage: new Set([oldId, survivorId]),
      successors: new Map([[oldId, survivorId]]),
      live: new Set([survivorId]),
      dormant: new Set(),
    });
    expect(aliases.aliases).toEqual({ [oldId]: survivorId });

    // The slug map the last build wrote: the old product held the plain address.
    const before = assignSlugs({}, [shape(oldId)]).slugs;
    expect(before[oldId]).toBe('bvlgari_splendida_patchouli_tentation_50ml');
    // This build: the old id is gone, the barcode product is new and takes an address of its own (the
    // plain one is still held by the product that left, and is never reassigned).
    const after = assignSlugs(before, [shape(survivorId)]).slugs;
    expect(after[oldId]).toBe(before[oldId]);
    expect(after[survivorId]).not.toBe(before[oldId]);
    // The held address answers for the survivor: nothing that was published goes to Page Not Found.
    const redirects = slugAliases(after, aliases.aliases, (id) => id === survivorId);
    expect(redirects).toEqual({ [before[oldId]!]: survivorId });
  });
});

describe('a Perfume Direct gift set that gains a barcode keeps its old address', () => {
  // A real Perfume Direct set title (stored listing 51596PD, 2026-10-05). The barcode on it is made up.
  const title = 'Davidoff Cool Water for Men Gift Set (125ml EDT + 75ml Shower Gel + 15ml EDT)';
  const set = (ean: string | null): StoredListing => ({
    ...listing('51596PD', 'davidoff-cool-water-for-men-gift-set-125ml-edt-75ml-shower-gel-15ml-edt', title, null, { ean, rawBrand: 'Davidoff', productType: 'Fragrance' }),
    retailerId: 'perfume-direct', firstSeenAt: '2026-10-01T00:00:00Z', lastSeenAt: '2026-10-05T00:00:00Z', status: 'active',
    delistedAt: null, relistedAt: null, eligibleForNewBadge: false, variantId: null,
  });

  it('is keyed on its title before and on its barcode after, so the title id is one of its forms', () => {
    const before = fragranceId(set(null));
    expect(before).toMatch(/^set-davidoff-cool-water/);
    expect(before).toBe(giftSetId(set(null)));
    const after = fragranceId(set('3348900103870'));
    expect(after).toBe('set-ean-3348900103870');
    expect(listingIdForms(set('3348900103870'), new Set())).toContain(before);
  });

  it('redirects the old set id to the barcode set', () => {
    const before = fragranceId(set(null));
    const after = fragranceId(set('3348900103870'));
    const settled = settleIdAliases({
      previous: {}, wasPage: new Set([before, after]), successors: new Map([[before, after]]), live: new Set([after]), dormant: new Set(),
    });
    expect(settled.aliases).toEqual({ [before]: after });
  });
});

describe('a record that closed on itself still redirects, from this build’s own decision', () => {
  // Real, 2026-10-06: Lookfantastic's Hugo Boss The Scent Le Parfum for Him 100ml and Perfume Direct's
  // 50942PD were folded one way before the barcode and the other way after, leaving a pair on file.
  const lf = 'lookfantastic-15742061';
  const pd = 'perfume-direct-50942pd';
  const page = 'ean-3616305040572';

  it('publishes both old ids as the page that holds them, and rewrites neither key', () => {
    const r = settleIdAliases({
      previous: { [lf]: pd, [pd]: lf },
      wasPage: new Set([lf, pd]),
      successors: new Map([[lf, page], [pd, page]]),
      live: new Set([page]),
      dormant: new Set(),
    });
    expect(r.aliases).toEqual({ [lf]: pd, [pd]: lf });
    expect(r.published).toEqual({ [lf]: page, [pd]: page });
  });

  it('publishes nothing for a closed record this build knows nothing about', () => {
    const r = settleIdAliases({ previous: { a: 'b', b: 'a' }, wasPage: new Set(), successors: new Map(), live: new Set(['z']), dormant: new Set() });
    expect(r.published).toEqual({});
  });
});


// The US and India dry run harvest (src/catalogue/regionHarvest.ts): one
// redacted fixture per enabled shop, read on 2026-10-09 as PriceSniffsBot
// (fixtures/regions/<us|in>/), through the same UK adapters the crawl uses,
// and the currency rule: the region's own currency as the shop states it,
// never pounds, never a conversion, never a price of 0.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGION_RETAILERS } from '../src/config/regionRetailers.js';
import { parseShopifyProducts } from '../src/catalogue/shopifyJson.js';
import { parseListings } from '../src/catalogue/jsonld.js';
import { withTitleParts } from '../src/catalogue/sitemapCrawl.js';
import {
  encodeRegionSnapshot, harvestRegionShop, reconcileRegion, regionPriceOf, regionStorefrontCurrency, toRegionListings, zeroPricedSkus,
  barcodeInSku, readOgProductPage, recordingHttp,
  type RegionListing,
} from '../src/catalogue/regionHarvest.js';
import type { RawListing } from '../src/catalogue/types.js';
import type { HttpResponse } from '../src/catalogue/attempt.js';
import type { RegionRetailer } from '../src/types/regionRetailer.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';

const NOW = '2026-10-09T12:00:00.000Z';
const fixtureDir = (r: RegionRetailer) => join(REPO_ROOT, 'fixtures/regions', r.region.toLowerCase());

function readFixture(shop: RegionRetailer): RawListing[] {
  if (shop.route?.kind === 'shopify') {
    const file = join(fixtureDir(shop), `${shop.id}.products.json`);
    const body = readFileSync(file, 'utf8');
    return parseShopifyProducts(body, { origin: `https://${shop.domain}`, sectionId: 'shopify-products-json', currency: shop.currency });
  }
  const route = shop.route?.kind === 'sitemap' ? shop.route.sitemapRoute : null;
  const html = readFileSync(join(fixtureDir(shop), `${shop.id}.html`), 'utf8');
  const url = /<!-- [^,]+, (\S+), read/.exec(html)![1]!;
  if (shop.route?.kind === 'og-price') {
    const one = readOgProductPage(html, url, 'og');
    return one ? [one] : [];
  }
  const found = parseListings(html, { sectionId: 'sitemap', pageUrl: url, microdata: true, requireGbp: true });
  if (route?.titleParts?.length && found.length === 1) found[0] = { ...found[0]!, rawTitle: withTitleParts(found[0]!.rawTitle, html, route.titleParts) };
  return found;
}

const enabled = [...REGION_RETAILERS.US, ...REGION_RETAILERS.IN].filter((s) => s.enabled);

describe('one redacted fixture per enabled region shop', () => {
  it('exists for every enabled shop, and carries no review, author or photo', () => {
    for (const shop of enabled) {
      const file = join(fixtureDir(shop), shop.route?.kind === 'shopify' ? `${shop.id}.products.json` : `${shop.id}.html`);
      expect(existsSync(file), file).toBe(true);
      const text = readFileSync(file, 'utf8');
      expect(text, shop.id).not.toMatch(/"(?:review|reviewBody|author|body_html|images?)"\s*:/);
      expect(text.length, shop.id).toBeLessThan(40_000);
    }
  });

  for (const shop of enabled) {
    it(`${shop.id} (${shop.region}): priced in ${shop.currency} only, through the shared ${shop.route?.kind} reader`, () => {
      const raw = readFixture(shop);
      expect(raw.length, shop.id).toBeGreaterThan(0);
      // The UK reader never takes these as pounds.
      for (const l of raw) expect(l.priceGbp, shop.id).toBeNull();
      const { listings, priced } = toRegionListings(raw, shop, NOW);
      expect(priced, shop.id).toBeGreaterThan(0);
      for (const l of listings) {
        expect(l.price, shop.id).toBeGreaterThan(0);
        expect(Object.keys(l), shop.id).not.toContain('imageUrl');
        if (shop.singleBrandOnly) expect(l.rawBrand, shop.id).toBe(shop.singleBrandOnly);
      }
    });
  }

  it('keeps sized perfumes from the multi brand shops, with barcodes where the shop states them', () => {
    const kept = (id: string) => {
      const shop = enabled.find((s) => s.id === id)!;
      return toRegionListings(readFixture(shop), shop, NOW).listings;
    };
    for (const id of ['perfumania', 'beauty-encounter', 'fragrance-outlet', 'la-belle-perfumes', 'luckyscent', 'the-perfume-spot', 'ulta',
      'nykaa', 'purplle', 'perfume-palace', 'fridaycharm', 'perfume-network']) {
      expect(kept(id).length, id).toBeGreaterThan(0);
    }
    expect(kept('ulta')[0]!.rawTitle).toMatch(/oz/);
    // The 12 digit UPC is stored in its EAN-13 form, the id the UK uses (barcode.ts).
    expect(kept('ulta')[0]!.ean).toBe('0088300601400');
    expect(kept('nykaa')[0]!.rawTitle).toMatch(/\d+\s?ml/i);
    expect(kept('beauty-encounter').some((l) => l.ean !== null)).toBe(true);
    for (const l of kept('microperfumes')) expect(l.rawTitle).toMatch(/Retail Bottle/);
  });
});

describe('the currency rule', () => {
  const us = REGION_RETAILERS.US.find((s) => s.id === 'perfumania')!;
  const base = { presented: 'USD', settlement: 'USD', rate: 1, country: 'US', isSterling: false, reason: '' };

  it('accepts a storefront that publishes the region\'s currency at no conversion, and nothing else', () => {
    expect(regionStorefrontCurrency(base, 'USD').ok).toBe(true);
    expect(regionStorefrontCurrency({ ...base, rate: 0.766851785 }, 'USD').ok).toBe(false);
    expect(regionStorefrontCurrency({ ...base, presented: 'GBP' }, 'USD').ok).toBe(false);
    expect(regionStorefrontCurrency({ ...base, settlement: 'CAD' }, 'USD').ok).toBe(false);
    expect(regionStorefrontCurrency({ ...base, presented: null }, 'USD').ok).toBe(false);
    expect(regionStorefrontCurrency({ ...base, presented: 'USD' }, 'INR').ok).toBe(false);
  });

  it('never keeps pounds, an unnamed currency, another currency, or a price of 0 (Purplle\'s sold out pages)', () => {
    const l = (over: Partial<RawListing>): RawListing => ({
      retailerSku: 'x', url: 'https://perfumania.com/products/x', rawTitle: 'Chanel Coco Eau de Parfum 100ml', rawBrand: 'Chanel',
      ean: null, imageUrl: null, priceGbp: null, wasPriceGbp: null, promoEndsAt: null, inStock: true, sectionId: 's', ...over,
    });
    expect(regionPriceOf(l({ nativePrice: { amount: 120, currency: 'USD' } }), 'USD')).toBe(120);
    expect(regionPriceOf(l({ priceGbp: 90 }), 'USD')).toBeNull();
    expect(regionPriceOf(l({ nativePrice: { amount: 120, currency: 'unknown' } }), 'USD')).toBeNull();
    expect(regionPriceOf(l({ nativePrice: { amount: 9999, currency: 'INR' } }), 'USD')).toBeNull();
    expect(regionPriceOf(l({ nativePrice: { amount: 0, currency: 'INR' } }), 'INR')).toBeNull();
    expect(toRegionListings([l({ nativePrice: { amount: 120, currency: 'USD' } }), l({ retailerSku: 'y', productType: 'Free Gift', nativePrice: { amount: 30, currency: 'USD' } })], us, NOW).listings.map((x) => x.retailerSku)).toEqual(['x']);
  });
});

describe('a region shop read through a fake network', () => {
  const shop = REGION_RETAILERS.US.find((s) => s.id === 'ds-and-durga')!;
  const fixture = readFileSync(join(fixtureDir(shop), 'ds-and-durga.products.json'), 'utf8');
  const asked: { url: string; ua: string }[] = [];
  const http = (robots: string, theme: string) => async (url: string, headers: Record<string, string>): Promise<HttpResponse> => {
    asked.push({ url, ua: headers['user-agent'] ?? '' });
    if (url.endsWith('/robots.txt')) return { status: 200, ok: true, body: robots };
    if (url.endsWith('/meta.json')) return { status: 200, ok: true, body: JSON.stringify({ currency: theme === 'USD' ? 'USD' : 'GBP' }) };
    if (/\/products\.json\?limit=250&page=1$/.test(url)) return { status: 200, ok: true, body: fixture };
    if (/\/products\.json/.test(url)) return { status: 200, ok: true, body: '{"products":[]}' };
    return { status: 200, ok: true, body: `<script>Shopify.currency = {"active":"${theme}","rate":"1.0"};</script>` };
  };
  const run = (robots: string, theme: string) => harvestRegionShop({
    shop, http: http(robots, theme), now: NOW, previous: null, maxPages: 10, shopMs: 60_000, refreshAfterHours: 20, sleep: async () => {},
  });

  it('asks robots.txt first, as PriceSniffsBot only, and writes a snapshot in dollars', async () => {
    asked.length = 0;
    const { report, snapshot } = await run('User-agent: *\nDisallow: /cart\n', 'USD');
    expect(asked[0]!.url).toMatch(/\/robots\.txt$/);
    for (const a of asked) expect(a.ua).toMatch(/^PriceSniffsBot\//);
    expect(report.status).toBe('priced');
    expect(snapshot!.currency).toBe('USD');
    expect(snapshot!.complete).toBe(true);
    expect(JSON.parse(encodeRegionSnapshot(snapshot!)).listings.length).toBe(snapshot!.listings.length);
  });

  it('asks nothing more when robots.txt disallows the catalogue', async () => {
    asked.length = 0;
    const { report, snapshot } = await run('User-agent: *\nDisallow: /products.json\n', 'USD');
    expect(report.status).toBe('refused');
    expect(snapshot).toBeNull();
    expect(asked.every((a) => a.url.endsWith('/robots.txt'))).toBe(true);
  });

  it('prices nothing when the storefront answers in another currency', async () => {
    const { report, snapshot } = await run('User-agent: *\n', 'GBP');
    expect(report.status).toBe('no-prices');
    expect(snapshot).toBeNull();
  });
});

describe('reconcileRegion', () => {
  const row = (sku: string, at: string): RegionListing => ({
    retailerSku: sku, url: `https://x/${sku}`, rawTitle: 't', rawBrand: 'b', ean: null, price: 1, wasPrice: null, inStock: true,
    sectionId: 's', firstSeenAt: at, lastSeenAt: at, status: 'active',
  });

  it('keeps the first day seen, and delists only after a complete read', () => {
    const before = [row('a', '2026-10-01T00:00:00Z'), row('b', '2026-10-01T00:00:00Z')];
    const partial = reconcileRegion(before, [row('a', NOW)], false);
    expect(partial.find((l) => l.retailerSku === 'a')!.firstSeenAt).toBe('2026-10-01T00:00:00Z');
    expect(partial.find((l) => l.retailerSku === 'b')!.status).toBe('active');
    expect(reconcileRegion(before, [row('a', NOW)], true).find((l) => l.retailerSku === 'b')!.status).toBe('delisted');
  });

  it('reads a stated price of 0 as sold out (Purplle): the stored listing keeps its last price, out of stock', () => {
    const purplle = REGION_RETAILERS.IN.find((r) => r.id === 'purplle')!;
    expect(purplle.zeroPriceMeansSoldOut).toBe(true);
    const raw = (sku: string, amount: number, currency = 'INR'): RawListing => ({
      retailerSku: sku, url: `https://x/${sku}`, rawTitle: 't', rawBrand: 'b', ean: null, imageUrl: null,
      priceGbp: null, wasPriceGbp: null, promoEndsAt: null, inStock: true, sectionId: 's', nativePrice: { amount, currency },
    } as RawListing);
    const zero = zeroPricedSkus([raw('b', 0), raw('c', 499), raw('d', 0, 'USD')], purplle);
    expect([...zero]).toEqual(['b']);
    // A shop that never said this: a 0 is simply not a price, nothing more.
    expect(zeroPricedSkus([raw('b', 0)], REGION_RETAILERS.IN.find((r) => r.id === 'nykaa')!).size).toBe(0);
    const before = [row('a', '2026-10-01T00:00:00Z'), { ...row('b', '2026-10-01T00:00:00Z'), price: 1299 }];
    const out = reconcileRegion(before, [row('a', NOW)], false, { skus: zero, at: NOW });
    const b2 = out.find((l) => l.retailerSku === 'b')!;
    expect(b2).toMatchObject({ price: 1299, inStock: false, lastSeenAt: NOW, status: 'active' });
    // A new product read at 0 is never stored.
    expect(reconcileRegion([], [], false, { skus: new Set(['z']), at: NOW })).toEqual([]);
  });
});

describe('the Open Graph price reader (AAR Fragrances)', () => {
  const page = (amount: string, currency: string | null, h1 = 'Lattafa Dynasty For Men And Women EDP 100ml') =>
    `<html><head><meta property="og:title" content="Buy ${h1} Online - AAR Fragnances" /><meta property="og:price:amount" content="${amount}" />` +
    `${currency === null ? '' : `<meta property="product:price:currency" content="${currency}" />`}</head><body><h1 class="x">\n  ${h1}\n</h1></body></html>`;

  it('reads the <h1> as the name and "Rupee" as INR', () => {
    const l = readOgProductPage(page('₹5,000.00', 'Rupee'), 'https://www.aarfragrances.com/product/lattafa-dynasty', 'og')!;
    expect(l).toMatchObject({ retailerSku: 'lattafa-dynasty', rawTitle: 'Lattafa Dynasty For Men And Women EDP 100ml', priceGbp: null, inStock: null, nativePrice: { amount: 5000, currency: 'INR' } });
    const aar = REGION_RETAILERS.IN.find((r) => r.id === 'aar-fragrances')!;
    expect(toRegionListings([l], aar, NOW).listings[0]).toMatchObject({ price: 5000, rawTitle: 'Lattafa Dynasty For Men And Women EDP 100ml' });
  });

  it('prices nothing when the page names no currency, or one it does not know, and never pounds as rupees', () => {
    expect(readOgProductPage(page('₹5,000.00', null), 'https://x/product/a', 'og')!.nativePrice).toBeUndefined();
    expect(readOgProductPage(page('5000', 'Doubloon'), 'https://x/product/a', 'og')!.nativePrice).toBeUndefined();
    const gbp = readOgProductPage(page('£50.00', 'GBP'), 'https://x/product/a', 'og')!;
    expect(regionPriceOf(gbp, 'INR')).toBeNull();
  });

  it('leaves decants and samples out of the walk', () => {
    const aar = REGION_RETAILERS.IN.find((r) => r.id === 'aar-fragrances')!;
    if (aar.route?.kind !== 'og-price') throw new Error('AAR route');
    const product = new RegExp(aar.route.product, 'i');
    const exclude = new RegExp(aar.route.exclude!, 'i');
    expect(product.test('https://www.aarfragrances.com/product/lattafa-dynasty') && !exclude.test('https://www.aarfragrances.com/product/lattafa-dynasty')).toBe(true);
    expect(exclude.test('https://www.aarfragrances.com/product/decantsample-lattafa-dynasty')).toBe(true);
    expect(product.test('https://www.aarfragrances.com/users/login')).toBe(false);
  });
});

describe('the barcode inside a shop id (Purplle)', () => {
  it('reads PPLB plus an EAN-13 only when the check digit holds', () => {
    const purplle = REGION_RETAILERS.IN.find((r) => r.id === 'purplle')!;
    expect(barcodeInSku('PPLB8906111693723', purplle)).toBe('8906111693723');
    expect(barcodeInSku('PPLB8906111693724', purplle)).toBeNull();
    expect(barcodeInSku('8906111693723', purplle)).toBeNull();
    expect(barcodeInSku('PPLB8906111693723', { })).toBeNull();
  });
});

describe('the request diagnostics', () => {
  it('remembers the first few requests that failed, with the transport error, and nothing else', async () => {
    const sink: string[] = [];
    const fake = async (url: string): Promise<HttpResponse> =>
      url.endsWith('/ok') ? { status: 200, ok: true, body: '' } : { status: 0, ok: false, body: '', error: 'ECONNRESET' };
    const http = recordingHttp(fake, sink, 2);
    await http('https://a/ok', {});
    await http('https://a/p/1', {});
    await http('https://a/p/2', {});
    await http('https://a/p/3', {});
    expect(sink).toEqual(['https://a/p/1: HTTP 0 (ECONNRESET)', 'https://a/p/2: HTTP 0 (ECONNRESET)']);
  });
});

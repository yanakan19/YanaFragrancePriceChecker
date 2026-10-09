// Today's Deals on the US and India sites (docs/INTERNATIONAL-PLAN.md, "Deals on
// the US and India sites"): the crawl keeps each shop's own stated reference
// price in the region's currency, the UK's deal rules run on it, a fake or an
// unchanged reference never makes a deal, and a region with few deals says so.
import { describe, expect, it } from 'vitest';
import { parseShopifyProducts } from '../src/catalogue/shopifyJson.js';
import { parseListings } from '../src/catalogue/jsonld.js';
import { regionWasPriceOf, toRegionListings } from '../src/catalogue/regionHarvest.js';
import type { RegionSnapshot } from '../src/catalogue/regionHarvest.js';
import type { RawListing } from '../src/catalogue/types.js';
import { DEAL_HISTORY_DAYS, historyAllowsDeal, REGION_MIN_DEALS } from '../src/catalogue/regionDeals.js';
import { REGION_RETAILERS } from '../src/config/regionRetailers.js';
import { regionById, resetActiveRegionForTests, setActiveRegionForBuild } from '../src/config/regions.js';
import { sparseDealsLine } from '../src/services/regionText.js';
import { buildRegionSite, regionDealsFile, type RegionInputs } from '../scripts/regionSite.js';
import { dealCandidateForOffer } from '../src/services/dealCandidates.js';
import { formatMoney } from '../src/services/money.js';

const NOW = '2026-10-09T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const US = REGION_RETAILERS.US.find((s) => s.id === 'perfumania')!;
const IN = REGION_RETAILERS.IN.find((s) => s.id === 'nykaa')!;

describe('the shop\'s own reference price is kept by the adapters, in its own currency', () => {
  const shopify = (compare: string | null, price = '80.00') => JSON.stringify({
    products: [{
      id: 1, title: 'Aventus Eau de Parfum 100ml', handle: 'aventus', vendor: 'Creed', product_type: 'Fragrance', tags: [],
      variants: [{ id: 11, title: 'Default Title', sku: 'A1', price, compare_at_price: compare, available: true }],
    }],
  });
  const read = (body: string, currency: string | null) => parseShopifyProducts(body, { origin: 'https://shop.example', sectionId: 's', currency });

  it('Shopify compare_at_price rides beside a USD or INR price, never as pounds', () => {
    const us = read(shopify('100.00'), 'USD')[0]!;
    expect(us).toMatchObject({ priceGbp: null, wasPriceGbp: null, nativePrice: { amount: 80, currency: 'USD' }, nativeWasPrice: 100 });
    expect(read(shopify('9999.00', '7499.00'), 'INR')[0]).toMatchObject({ nativePrice: { amount: 7499, currency: 'INR' }, nativeWasPrice: 9999 });
  });

  it('keeps nothing where the compare at price is absent, equal or below the price, or the currency is unknown or sterling', () => {
    for (const compare of [null, '80.00', '60.00', '0']) expect(read(shopify(compare), 'USD')[0]!.nativeWasPrice, String(compare)).toBeUndefined();
    // A sterling shop (the UK) is untouched: its reference stays wasPriceGbp and no native field appears.
    const gb = read(shopify('100.00'), 'GBP')[0]!;
    expect(gb.wasPriceGbp).toBe(100);
    expect('nativeWasPrice' in gb).toBe(false);
  });

  const page = (offer: Record<string, unknown>) => `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Product', name: 'Lattafa Khamrah EDP 100ml', sku: 'K1', brand: { '@type': 'Brand', name: 'Lattafa' },
    offers: { '@type': 'Offer', availability: 'https://schema.org/InStock', ...offer },
  })}</script></head><body></body></html>`;
  const parse = (offer: Record<string, unknown>) => parseListings(page(offer), { sectionId: 's', pageUrl: 'https://shop.example/p/k1', requireGbp: true })[0]!;

  it('JSON-LD list price, highPrice on a single offer and a ListPrice or MRP specification are read beside a named currency', () => {
    expect(parse({ price: 3999, priceCurrency: 'INR', listPrice: 5499 })).toMatchObject({ nativePrice: { amount: 3999, currency: 'INR' }, nativeWasPrice: 5499 });
    expect(parse({ price: 3999, priceCurrency: 'INR', highPrice: 5000 }).nativeWasPrice).toBe(5000);
    expect(parse({ price: 3999, priceCurrency: 'INR', priceSpecification: [{ '@type': 'PriceSpecification', priceType: 'https://schema.org/ListPrice', price: 5499 }] }).nativeWasPrice).toBe(5499);
    expect(parse({ price: 3999, priceCurrency: 'INR', priceSpecification: [{ '@type': 'PriceSpecification', priceType: 'MRP', price: 5200 }] }).nativeWasPrice).toBe(5200);
  });

  it('never reads an AggregateOffer\'s highPrice (the dearest size) or a list price with no named currency or no gap', () => {
    expect(parse({ '@type': 'AggregateOffer', lowPrice: 3999, highPrice: 9999, priceCurrency: 'INR' }).nativeWasPrice).toBeUndefined();
    expect(parse({ price: 3999, listPrice: 5499 }).nativeWasPrice).toBeUndefined();
    expect(parse({ price: 3999, priceCurrency: 'INR', listPrice: 3999 }).nativeWasPrice).toBeUndefined();
    expect(parse({ price: 3999, priceCurrency: 'INR', listPrice: 2000 }).nativeWasPrice).toBeUndefined();
    // Sterling pages keep the UK's own fields and gain no native one.
    const gb = parse({ price: 39, priceCurrency: 'GBP', listPrice: 55 });
    expect(gb.wasPriceGbp).toBe(55);
    expect(gb.nativeWasPrice).toBeUndefined();
  });
});

describe('the region listing\'s reference price (wasPrice)', () => {
  const raw = (over: Partial<RawListing>): RawListing => ({
    retailerSku: 'x', url: 'https://perfumania.com/products/x', rawTitle: 'Chanel Coco Eau de Parfum 100ml', rawBrand: 'Chanel',
    ean: null, imageUrl: null, priceGbp: null, wasPriceGbp: null, promoEndsAt: null, inStock: true, sectionId: 's',
    nativePrice: { amount: 80, currency: 'USD' }, ...over,
  });

  it('is stored as published for the region\'s currency, and is null when it is missing, equal, lower or in another currency', () => {
    expect(regionWasPriceOf(raw({ nativeWasPrice: 100 }), 80, 'USD')).toBe(100);
    expect(regionWasPriceOf(raw({}), 80, 'USD')).toBeNull();
    expect(regionWasPriceOf(raw({ nativeWasPrice: 80 }), 80, 'USD')).toBeNull();
    expect(regionWasPriceOf(raw({ nativeWasPrice: 70 }), 80, 'USD')).toBeNull();
    expect(regionWasPriceOf(raw({ nativeWasPrice: 0 }), 80, 'USD')).toBeNull();
    expect(regionWasPriceOf(raw({ nativeWasPrice: 100, nativePrice: { amount: 80, currency: 'INR' } }), 80, 'USD')).toBeNull();
    expect(regionWasPriceOf(raw({ nativeWasPrice: 100, nativePrice: null, priceGbp: 80 }), 80, 'USD')).toBeNull();
    expect(regionWasPriceOf(raw({ nativeWasPrice: 999.999 }), 80, 'USD')).toBe(1000);
  });

  it('is on the stored listing of a US and an Indian shop, never converted', () => {
    const us = toRegionListings([raw({ nativeWasPrice: 100 })], US, NOW).listings[0]!;
    expect(us).toMatchObject({ price: 80, wasPrice: 100 });
    const inr = toRegionListings([raw({ nativePrice: { amount: 7499, currency: 'INR' }, nativeWasPrice: 9999 })], IN, NOW).listings[0]!;
    expect(inr).toMatchObject({ price: 7499, wasPrice: 9999 });
    expect(toRegionListings([raw({})], US, NOW).listings[0]!.wasPrice).toBeNull();
  });
});

describe('the shop\'s own price history can only take a deal away', () => {
  const day = (n: number) => new Date(NOW_MS - n * 86_400_000).toISOString().slice(0, 10);
  it('has no say with no history, one price, or a price that has not moved in 30 days', () => {
    expect(historyAllowsDeal(undefined, 80, NOW_MS)).toBe(true);
    expect(historyAllowsDeal([[day(1), 80]], 80, NOW_MS)).toBe(true);
    expect(historyAllowsDeal([[day(90), 90], [day(60), 80]], 80, NOW_MS)).toBe(true);
  });
  it('allows a price now below the highest of the last 30 days, and refuses one at or above it', () => {
    expect(historyAllowsDeal([[day(20), 100], [day(2), 80]], 80, NOW_MS)).toBe(true);
    // The price in force when the window opened counts: 100 for most of the month, 80 since.
    expect(historyAllowsDeal([[day(45), 100], [day(3), 80]], 80, NOW_MS)).toBe(true);
    // Just went up: the shop's own record says 80 was the usual price.
    expect(historyAllowsDeal([[day(20), 80], [day(2), 100]], 100, NOW_MS)).toBe(false);
    expect(DEAL_HISTORY_DAYS).toBe(30);
  });
});

describe('Today\'s Deals built for a region from the snapshots', () => {
  const listing = (sku: string, price: number, wasPrice: number | null, extra: Record<string, unknown> = {}) => ({
    retailerSku: sku, url: `https://shop.example/products/${sku}`, rawTitle: 'Aventus Eau de Parfum 100ml', rawBrand: 'Creed', ean: null, price, wasPrice,
    inStock: true, productType: 'Fragrance', sectionId: 's', firstSeenAt: '2026-10-09T04:00:00.000Z', lastSeenAt: '2026-10-09T06:00:00.000Z',
    status: 'active' as const, ...extra,
  });
  const snap = (retailerId: string, listings: ReturnType<typeof listing>[]): RegionSnapshot =>
    ({ retailerId, region: 'US', currency: 'USD', updatedAt: NOW, complete: true, listings } as unknown as RegionSnapshot);
  const inputs = (snapshots: RegionSnapshot[], points: NonNullable<RegionInputs['history']>['points'] = {}): RegionInputs => ({
    region: 'US', shops: REGION_RETAILERS.US, snapshots, history: { currency: 'USD', updatedAt: NOW, points }, slugMemory: {}, harvestRanAt: NOW,
  });
  const build = (i: RegionInputs) => buildRegionSite(i, {}, NOW);

  it('makes a deal where the shop\'s stated reference is corroborated by the other shops, worked by the UK\'s function', () => {
    const site = build(inputs([
      snap('aedes', [listing('1', 300, 400)]),
      snap('luckyscent', [listing('2', 340, null)]),
      snap('twisted-lily', [listing('3', 350, null)]),
    ]));
    expect(site.deals).toHaveLength(1);
    const d = site.deals[0]!;
    expect(d).toMatchObject({ retailerId: 'aedes', kind: 'retailer', houseName: null, wasPrice: 400 });
    // The very function the UK uses gives the same figures.
    expect(dealCandidateForOffer({ brand: 'Creed', houseCeiling: null }, { price: 300, wasPrice: 400, retailerId: 'aedes', shownPrice: d.price, shownDelivered: d.delivered })).toMatchObject({ percentOff: d.percentOff, wasPrice: 400 });
    expect(d.percentOff).toBeGreaterThan(0);
    // The page prints it with the region's symbol and format: $ in the US, whole rupees with Indian grouping in India.
    setActiveRegionForBuild(regionById('US')!);
    expect(formatMoney(d.price)).toBe('$300.00');
    expect(formatMoney(d.wasPrice)).toBe('$400.00');
    setActiveRegionForBuild(regionById('IN')!);
    expect(formatMoney(123450)).toBe('₹1,23,450');
    resetActiveRegionForTests();
  });

  it('makes no deal from a reference equal to the price, below it, or stated by one shop alone', () => {
    const none = (a: number | null, b: number | null = null) => build(inputs([
      snap('aedes', [listing('1', 300, a)]), snap('luckyscent', [listing('2', 340, b)]), snap('twisted-lily', [listing('3', 350, null)]),
    ])).deals;
    expect(none(300)).toEqual([]);
    expect(none(250)).toEqual([]);
    // Nobody to check it against: a lone shop's word is no deal (UK: only a corroborated reference survives).
    expect(build(inputs([snap('aedes', [listing('1', 300, 400)])])).deals).toEqual([]);
  });

  it('refuses a reference far above what every other shop charges (a fake RRP)', () => {
    const site = build(inputs([
      snap('aedes', [listing('1', 300, 2000)]), snap('luckyscent', [listing('2', 340, null)]), snap('twisted-lily', [listing('3', 350, null)]),
    ]));
    expect(site.deals).toEqual([]);
    expect(Object.values(site.crawled).flat().every((o) => o.wasPrice === null)).toBe(true);
  });

  it('refuses a deal the shop\'s own recorded prices contradict', () => {
    const snaps = [snap('aedes', [listing('1', 300, 400)]), snap('luckyscent', [listing('2', 340, null)]), snap('twisted-lily', [listing('3', 350, null)])];
    const id = Object.keys(build(inputs(snaps)).crawled)[0]!;
    const rose = { [id]: { aedes: [['2026-10-01', 250], ['2026-10-08', 300]] as [string, number][] } };
    expect(build(inputs(snaps, rose)).deals).toEqual([]);
    const fell = { [id]: { aedes: [['2026-10-01', 380], ['2026-10-08', 300]] as [string, number][] } };
    expect(build(inputs(snaps, fell)).deals).toHaveLength(1);
  });

  it('leaves out a sold out offer', () => {
    const out = build(inputs([
      snap('aedes', [listing('1', 300, 400, { inStock: false })]), snap('luckyscent', [listing('2', 340, null)]), snap('twisted-lily', [listing('3', 350, null)]),
    ]));
    expect(out.deals).toEqual([]);
  });

  it('writes the deals file: region, currency, the reference name, the counts and the deals', () => {
    const i = inputs([snap('aedes', [listing('1', 300, 400)]), snap('luckyscent', [listing('2', 340, null)]), snap('twisted-lily', [listing('3', 350, 360)])]);
    const site = build(i);
    const file = regionDealsFile(i, site, NOW);
    expect(file).toMatchObject({ region: 'US', currency: 'USD', referencePriceName: 'MSRP', builtAt: NOW, listingsWithReference: 2, minDealsForFullList: REGION_MIN_DEALS });
    expect(file.deals).toEqual(site.deals);
    expect(file.offersWithCorroboratedReference).toBeLessThanOrEqual(file.listingsWithReference);
    expect(Object.keys(file).sort()).toEqual(['builtAt', 'currency', 'deals', 'listingsWithReference', 'minDealsForFullList', 'offersWithCorroboratedReference', 'referencePriceName', 'region', 'rule']);
    const india = regionDealsFile({ region: 'IN', snapshots: [] }, { crawled: {}, deals: [] }, NOW);
    expect(india).toMatchObject({ currency: 'INR', referencePriceName: 'MRP', deals: [] });
  });
});

describe('a region with few deals says so', () => {
  it('says "Not many deals yet in the beta." under six deals in a beta region, and nothing in the UK or with six', () => {
    expect(REGION_MIN_DEALS).toBe(6);
    const us = regionById('US')!;
    const inr = regionById('IN')!;
    const gb = regionById('GB')!;
    for (const n of [0, 1, 5]) {
      expect(sparseDealsLine(n, us)).toBe('Not many deals yet in the beta.');
      expect(sparseDealsLine(n, inr)).toBe('Not many deals yet in the beta.');
      expect(sparseDealsLine(n, gb)).toBeNull();
    }
    expect(sparseDealsLine(6, us)).toBeNull();
    expect(sparseDealsLine(2000, inr)).toBeNull();
  });

  it('is named MSRP in the US and MRP in India', () => {
    expect(regionById('US')!.referencePriceName).toBe('MSRP');
    expect(regionById('IN')!.referencePriceName).toBe('MRP');
  });
});

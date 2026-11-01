import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../scripts/generatedFiles.js';
import { SITES_CA, SITES_IN, SITES_US, type MrpExample, type PriceExample } from '../scripts/social-video-launch-sites.js';
import { CA_RETAILERS } from '../src/config/retailers.ca.js';
import { IN_RETAILERS } from '../src/config/retailers.in.js';
import { US_RETAILERS } from '../src/config/retailers.us.js';
import { softIt } from './support/softCheck.js';

// Owner request, 1 November 2026: the US, India and Canada launch videos
// (scripts/social-video-launch-sites.ts). Every claim on screen is held here to
// the region's own report, catalogue and deals, as a RULE with the video's own
// rounded number: "at least N shops", "over X", "under Y", "save Z or more".
// No price or count is pinned. A claim the crawl's data stops supporting is a
// finding in data/soft-test-report.json (the video must then be re-checked),
// strict on a machine and on every push. Names, spelling and switched-on shops
// are config, so they stay hard.
interface Report {
  products: number;
  shops: { id: string; products: number }[];
}
interface Offer {
  shopId: string;
  price: number;
  inStock?: boolean;
}
interface Product {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  offers: Offer[];
}
interface Deal {
  fragranceId: string;
  retailerId: string;
  price: number;
  wasPrice: number;
  percentOff: number;
}
const read = <T>(region: string, file: string) => JSON.parse(readFileSync(join(REPO_ROOT, 'data', 'regions', region, file), 'utf8')) as T;
const same = (p: Product, e: { brand: string; name: string; concentration: string; sizeMl: number }) =>
  p.brand === e.brand && p.name === e.name && p.concentration === e.concentration && p.sizeMl === e.sizeMl;
const stocked = (p: Product, shop: string) => p.offers.filter((o) => o.shopId === shop && o.inStock !== false).map((o) => o.price);

const REGIONS = [
  { id: 'us', claim: SITES_US, config: US_RETAILERS },
  { id: 'in', claim: SITES_IN, config: IN_RETAILERS },
  { id: 'ca', claim: SITES_CA, config: CA_RETAILERS },
] as const;

for (const r of REGIONS) {
  describe(`${r.id} launch video: the counts`, () => {
    const report = read<Report>(r.id, 'report.json');
    softIt(`${r.id}-launch-counts`, `lists at least the products and the shops with products it claims`, () => {
      expect(report.products).toBeGreaterThanOrEqual(r.claim.minProducts);
      expect(report.shops.filter((s) => s.products > 0).length).toBeGreaterThanOrEqual(r.claim.minShops);
    });
    it('claims whole, rounded down figures that match the numbers the caption and the screen use', () => {
      expect(r.claim.productsClaim).toBe(`${r.claim.minProducts.toLocaleString('en-US')}+`);
      expect(r.claim.shopsClaim.replace('+', '')).toBe(String(r.claim.minShops));
    });
  });
}

describe('every shop the videos name is switched on, spelt as the config spells it', () => {
  const named: [string, readonly { id: string; name: string; enabled: boolean }[], string, string][] = [
    ...SITES_US.examples.flatMap((e): [string, readonly { id: string; name: string; enabled: boolean }[], string, string][] => [
      ['us', US_RETAILERS, e.highShop, e.highName],
      ['us', US_RETAILERS, e.lowShop, e.lowName],
    ]),
    ...SITES_IN.shops.map((s): [string, readonly { id: string; name: string; enabled: boolean }[], string, string] => ['in', IN_RETAILERS, s.id, s.name]),
    ...SITES_IN.examples.map((e): [string, readonly { id: string; name: string; enabled: boolean }[], string, string] => ['in', IN_RETAILERS, e.shop, e.shopName]),
    ...SITES_CA.ladder.rungs.map((s): [string, readonly { id: string; name: string; enabled: boolean }[], string, string] => ['ca', CA_RETAILERS, s.shop, s.shopName]),
  ];
  it('finds each in its region config, enabled, with the same name', () => {
    expect(named.length).toBeGreaterThanOrEqual(10);
    for (const [region, config, id, name] of named) {
      const c = config.find((x) => x.id === id);
      expect(c, `${region}: ${id} is not in the config`).toBeDefined();
      expect(c!.enabled, `${name} is switched off`).toBe(true);
      expect(c!.name).toBe(name);
    }
  });
  softIt('launch-shops-listed', 'each named shop has products in its region report', () => {
    for (const [region, , id, name] of named) {
      const report = read<Report>(region, 'report.json');
      expect(report.shops.find((s) => s.id === id)?.products ?? 0, `${name} has no products in the ${region} report`).toBeGreaterThan(0);
    }
  });
});

describe('US launch video: the same bottle in two shops', () => {
  const products = read<{ products: Product[] }>('us', 'catalogue.json').products;
  for (const e of SITES_US.examples) {
    softIt(`us-launch-${e.brand}-${e.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), `${e.brand} ${e.name} ${e.sizeMl}ml: over, under and the saving hold`, () => {
      const p = products.find((x) => same(x, e));
      expect(p, 'the bottle is not in the US catalogue').toBeDefined();
      const high = Math.min(...stocked(p!, e.highShop));
      const low = Math.min(...stocked(p!, e.lowShop));
      expect(high, `${e.highName} has it in stock`).toBeGreaterThan(e.highOver);
      expect(low, `${e.lowName} has it in stock`).toBeLessThan(e.lowUnder);
      expect(high - low).toBeGreaterThanOrEqual(e.saveOver);
    });
  }
});

describe('India launch video: MRP against the cheapest price', () => {
  const products = read<{ products: Product[] }>('in', 'catalogue.json').products;
  const deals = read<{ deals: number; items?: Deal[] } & Record<string, unknown>>('in', 'deals.json');
  const list = (Object.values(deals).find((v) => Array.isArray(v)) ?? []) as Deal[];
  for (const e of SITES_IN.examples as readonly MrpExample[]) {
    softIt(`in-launch-${e.brand}-${e.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), `${e.brand} ${e.name} ${e.sizeMl}ml: MRP over, price under and the per cent saved hold`, () => {
      const p = products.find((x) => same(x, e));
      expect(p, 'the bottle is not in the India catalogue').toBeDefined();
      const cheapest = Math.min(...p!.offers.filter((o) => o.inStock !== false).map((o) => o.price));
      expect(cheapest, 'the cheapest in stock price').toBeLessThan(e.priceUnder);
      expect(stocked(p!, e.shop).length, `${e.shopName} has it in stock`).toBeGreaterThan(0);
      const deal = list.find((d) => d.fragranceId === p!.id && d.retailerId === e.shop);
      expect(deal, `no MRP deal for ${e.shopName}`).toBeDefined();
      expect(deal!.wasPrice).toBeGreaterThan(e.mrpOver);
      expect(deal!.price).toBeLessThan(e.priceUnder);
      expect(deal!.percentOff).toBeGreaterThanOrEqual(e.saveOverPercent);
    });
  }
});

describe('Canada launch video: one bottle, five shops', () => {
  const products = read<{ products: Product[] }>('ca', 'catalogue.json').products;
  const l = SITES_CA.ladder;
  softIt('ca-launch-ladder', `${l.brand} ${l.name} ${l.sizeMl}ml: at least ${l.shopsCompared} shops, each rung under or over its price`, () => {
    const p = products.find((x) => same(x, l));
    expect(p, 'the bottle is not in the Canadian catalogue').toBeDefined();
    expect(new Set(p!.offers.filter((o) => o.inStock !== false).map((o) => o.shopId)).size).toBeGreaterThanOrEqual(l.shopsCompared);
    const prices = l.rungs.map((r) => Math.min(...stocked(p!, r.shop)));
    prices.forEach((price, i) => {
      const r = l.rungs[i]!;
      if (r.bound === 'under') expect(price, `${r.shopName} is under`).toBeLessThan(r.price);
      else expect(price, `${r.shopName} is over`).toBeGreaterThan(r.price);
    });
    expect(prices[0]!).toBeLessThan(prices[1]!);
    expect(prices[1]!).toBeLessThan(prices[2]!);
  });
});

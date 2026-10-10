import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BY_POPULARITY, DEALS, DEMO_FRAGRANCES } from '../demo/data.js';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { DEALS_RAW } from '../demo/deals.generated.js';
import { mostStockedRail } from '../demo/mostStocked.js';
import { RETAILERS } from '../src/config/retailers.js';
import { REGION_CRAWL, REGION_RETAILERS } from '../src/config/regionRetailers.js';
import { regionById } from '../src/config/regions.js';
import { formatMoney } from '../src/services/money.js';
import type { RegionCode } from '../src/types/regionRetailer.js';
import { buildRegionSite, readRegionInputs } from '../scripts/regionSite.js';
import { dealFor } from '../scripts/social-deal-of-day.js';

/**
 * Owner rule, 10 October 2026: the Most Stocked rail and the Deals section
 * (the Deals tab, deal counts, the Deal of the Day and anything that ranks or
 * lists products as deals or by shop count) use each country's own shops,
 * offers and prices only. A UK visitor never sees a US or Indian shop, offer,
 * price or deal there, and a US or India visitor never a UK one. A region
 * product may borrow a UK product's photo and notes (attribution, not an
 * offer), never its offers, prices, shop count or deals.
 *
 * The built pages are checked in tests/regionRailsBrowser.test.ts; this file
 * holds the data each rail is drawn from.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UK_SHOPS = new Set(RETAILERS.map((r) => r.id));
const REGIONS: RegionCode[] = ['US', 'IN'];
const regionShops = (r: RegionCode) => new Set(REGION_RETAILERS[r].map((s) => s.id));
const ALL_REGION_SHOPS = new Set(REGIONS.flatMap((r) => [...regionShops(r)]));
const SYMBOL: Record<'GB' | RegionCode, string> = { GB: '£', US: '$', IN: '₹' };

describe('the shop registries never share an id', () => {
  it('a UK shop id is never a US or Indian one, nor a US one an Indian one', () => {
    for (const r of REGIONS) for (const id of regionShops(r)) expect(UK_SHOPS.has(id), `${r} ${id}`).toBe(false);
    for (const id of regionShops('US')) expect(regionShops('IN').has(id), id).toBe(false);
  });
});

describe('the UK site', () => {
  it('ranks Most Stocked on UK shops only, and its rail names UK shops and pounds', () => {
    for (const offers of Object.values(CRAWLED)) for (const o of offers) expect(UK_SHOPS.has(o.retailerId), o.retailerId).toBe(true);
    const rail = mostStockedRail(BY_POPULARITY);
    expect(rail).toHaveLength(12);
    for (const f of rail) {
      const offers = CRAWLED[f.id] ?? [];
      expect(offers.length).toBeGreaterThan(0);
      expect(offers.every((o) => UK_SHOPS.has(o.retailerId))).toBe(true);
      expect(f.popularity).toBeLessThanOrEqual(offers.length);
      expect(formatMoney(Math.min(...offers.map((o) => o.price)), regionById('GB')!)).toMatch(/^£/);
    }
  });

  it('lists UK deals only: every deal at a UK shop, none at a US or Indian shop', () => {
    expect(DEALS_RAW.length).toBeGreaterThan(0);
    for (const d of DEALS_RAW) {
      expect(UK_SHOPS.has(d.retailerId), d.retailerId).toBe(true);
      expect(ALL_REGION_SHOPS.has(d.retailerId), d.retailerId).toBe(false);
    }
    const ukIds = new Set(CATALOGUE.map((c) => c.id));
    for (const d of DEALS) expect(ukIds.has(d.fragrance.id)).toBe(true);
  });

  it('picks the Deal of the Day from UK products at UK shops', () => {
    const ukIds = new Set(CATALOGUE.map((c) => c.id));
    const picks = DEMO_FRAGRANCES.filter((f) => f.houseCeiling !== null).map(dealFor).filter((p) => p !== null);
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) {
      expect(ukIds.has(p.frag.id), p.frag.id).toBe(true);
      expect(UK_SHOPS.has(p.best.retailer.id), p.best.retailer.id).toBe(true);
    }
  });

  it('builds its catalogue, deals and social posts without reading a region\'s data', () => {
    const scripts = ['build-demo-catalogue.ts', 'build-deals.ts', 'build-price-history.ts',
      // social-video-launch.ts draws the US launch video (10 Oct 2026): a post
      // about the US site, so it reads the US report on purpose. Every other
      // social script (deals, savings, Guess the Fragrance) is UK only.
      ...readdirSync(resolve(root, 'scripts')).filter((f) => /^social-.*\.ts$/.test(f) && f !== 'social-video-launch.ts')];
    for (const f of scripts) {
      const src = readFileSync(resolve(root, 'scripts', f), 'utf8');
      expect(src, f).not.toMatch(/data\/regions|dist-demo\/regions|regionSite|regionRetailers|regionShops/);
    }
  });
});

describe('the country menu\'s lookup of the other countries', () => {
  // The one file a page reads about another country (the `regions` lazy file):
  // where a product or brand lives there, never an offer, price, count or deal.
  const dir = resolve(root, 'dist-demo/regions/links');
  it.skipIf(!existsSync(dir))('holds addresses and brands only', () => {
    for (const f of readdirSync(dir)) {
      const links = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as Record<string, Record<string, unknown>>;
      for (const [other, l] of Object.entries(links)) {
        expect(Object.keys(l).sort(), `${f} ${other}`).toEqual(['brands', 'slugs']);
        for (const v of Object.values(l.slugs as Record<string, unknown>)) expect(typeof v).toBe('string');
      }
    }
  });
});

describe.each(REGIONS)('the %s site', (region) => {
  const site = buildRegionSite(readRegionInputs(root, region), {}, '2026-10-10T12:00:00Z', CATALOGUE, (id) => RETAILERS.find((r) => r.id === id)?.name);
  const own = regionShops(region);
  const config = regionById(region)!;

  it('carries only its own shops\' offers, and counts a product\'s shops from them', () => {
    expect(site.catalogue.length).toBeGreaterThan(0);
    for (const offers of Object.values(site.crawled)) for (const o of offers) expect(own.has(o.retailerId), o.retailerId).toBe(true);
    for (const c of site.catalogue) expect(c.shops).toBe(site.crawled[c.id]!.length);
    expect(site.shopCount).toBeLessThanOrEqual(own.size);
  });

  it('ranks Most Stocked on its own shops, a UK match bringing a photo or notes but no UK offer or count', () => {
    const top = site.catalogue.filter((c) => !c.giftSet).slice(0, 50);
    for (const c of top) {
      const offers = site.crawled[c.id]!;
      expect(offers.every((o) => own.has(o.retailerId))).toBe(true);
      expect(formatMoney(Math.min(...offers.map((o) => o.price)), config).startsWith(SYMBOL[region])).toBe(true);
    }
    // A product that is the same bottle as a UK product keeps the region's own count, not the UK's.
    const ukShops = new Map(CATALOGUE.map((c) => [c.id, c.shops]));
    const shared = site.catalogue.filter((c) => ukShops.has(c.id));
    expect(shared.length).toBeGreaterThan(0);
    for (const c of shared) expect(c.shops).toBe(site.crawled[c.id]!.length);
    // UK notes keep their UK credit (attribution), which is not an offer.
    for (const c of site.catalogue) if (c.notes?.source) expect(own.has(c.notes.source.retailerId)).toBe(false);
  });

  it('lists only its own shops\' deals, in its own currency', () => {
    for (const d of site.deals) {
      expect(own.has(d.retailerId), d.retailerId).toBe(true);
      expect(UK_SHOPS.has(d.retailerId), d.retailerId).toBe(false);
      expect(site.crawled[d.fragranceId]!.some((o) => o.retailerId === d.retailerId && o.price <= d.wasPrice)).toBe(true);
    }
  });

  it('commits a deals file with its own shops and currency, never a UK shop', () => {
    const file = JSON.parse(readFileSync(resolve(root, `data/regions/${REGION_CRAWL[region].folder}/deals.json`), 'utf8')) as {
      region: string; currency: string; deals: { retailerId: string; fragranceId: string }[];
    };
    expect(file.region).toBe(region);
    expect(file.currency).toBe(config.currency);
    for (const d of file.deals) {
      expect(own.has(d.retailerId), d.retailerId).toBe(true);
      expect(UK_SHOPS.has(d.retailerId), d.retailerId).toBe(false);
    }
  });
});

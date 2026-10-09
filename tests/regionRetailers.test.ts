// The US and India shop registries (src/config/retailers.us.ts, retailers.in.ts)
// for the Phase 1 dry runs (docs/INTERNATIONAL-PLAN.md). The owner's lines of
// 9 Oct 2026 are held here: no affiliate programme, photos off, the shop's own
// currency, delivery read off the shop's own page and dated, PriceSniffsBot only.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGION_CONFIGS } from '../src/config/regions.js';
import { REGION_CRAWL, REGION_RETAILERS, regionFromArg } from '../src/config/regionRetailers.js';
import { RETAILERS } from '../src/config/retailers.js';
import { IN_TAX_NOTE, US_TAX_NOTE } from '../src/types/regionRetailer.js';
import { sellsOnlyFragrance } from '../src/catalogue/fragranceId.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';

const ALL = [...REGION_RETAILERS.US, ...REGION_RETAILERS.IN];

describe('region registries', () => {
  it('give every shop an id no UK shop or other region shop uses, and one domain each', () => {
    const uk = new Set(RETAILERS.map((r) => r.id));
    const ids = ALL.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(uk.has(id), id).toBe(false);
    const domains = ALL.map((r) => r.domain.replace(/^www\./, ''));
    expect(new Set(domains).size).toBe(domains.length);
  });

  it('price every shop in its region\'s own currency, with the region\'s tax note', () => {
    for (const r of REGION_RETAILERS.US) {
      expect(r.region, r.id).toBe('US');
      expect(r.currency, r.id).toBe(REGION_CRAWL.US.currency);
      expect(r.taxNote, r.id).toBe(US_TAX_NOTE);
    }
    for (const r of REGION_RETAILERS.IN) {
      expect(r.region, r.id).toBe('IN');
      expect(r.currency, r.id).toBe(REGION_CRAWL.IN.currency);
      expect(r.taxNote, r.id).toBe(IN_TAX_NOTE);
    }
  });

  it('carry no affiliate, logo or Trustpilot field, and the one photo field the owner switched on (9 Oct 2026, D24)', () => {
    for (const r of ALL) {
      expect(r.imageBasis, `${r.id} photo basis`).toBe('hotlink-unlicensed');
      for (const key of ['affiliate', 'logo', 'squareLogo', 'trustpilotUrl', 'trustpilotBusinessId', 'deeplinkTemplate']) {
        expect(Object.keys(r), `${r.id} has ${key}`).not.toContain(key);
      }
    }
  });

  it('give every enabled shop a route and every disabled one a reason', () => {
    for (const r of ALL) {
      if (r.enabled) expect(r.route, r.id).not.toBeNull();
      else expect(r.blockedReason?.length ?? 0, r.id).toBeGreaterThan(40);
    }
    // The shortlists the plan names, and round 2's readable multi brand shops.
    const us = REGION_RETAILERS.US.map((r) => r.id);
    for (const id of ['perfumania', 'jomashop', 'luckyscent', 'aedes', 'twisted-lily', 'indigo-perfumery', 'bluemercury', 'beautyhabit',
      'ds-and-durga', 'imaginary-authors', 'maison-louis-marie', 'ellis-brooklyn', 'boy-smells', 'sol-de-janeiro', 'nordstrom',
      'beauty-encounter', 'fragrance-outlet', 'fragrance-market', 'microperfumes', 'parfums-raffy', 'ministry-of-scent',
      'la-belle-perfumes', 'ulta', 'dillards', 'the-perfume-spot', 'ecosmetics']) expect(us, id).toContain(id);
    const inIds = REGION_RETAILERS.IN.map((r) => r.id);
    for (const id of ['nykaa', 'purplle', 'bombay-perfumery', 'bellavita-india', 'wild-stone', 'naso-profumi', 'pilgrim',
      'the-man-company', 'ustraa', 'mirah-belle', 'gulab-singh-johrimal', 'kannauj-attar', 'perfume-palace', 'fridaycharm',
      'perfume-network', 'aar-fragrances']) expect(inIds, id).toContain(id);
  });

  it('mark the brand own shops as one house each', () => {
    const single = (id: string) => ALL.find((r) => r.id === id)!.singleBrandOnly;
    for (const id of ['ds-and-durga', 'imaginary-authors', 'maison-louis-marie', 'ellis-brooklyn', 'boy-smells', 'sol-de-janeiro',
      'bombay-perfumery', 'bellavita-india', 'wild-stone', 'naso-profumi', 'pilgrim', 'the-man-company', 'ustraa', 'mirah-belle',
      'gulab-singh-johrimal', 'kannauj-attar']) expect(single(id), id).toBeTruthy();
    for (const id of ['perfumania', 'luckyscent', 'nykaa', 'purplle', 'beauty-encounter', 'ulta']) expect(single(id), id).toBeUndefined();
  });

  it('record delivery as standard delivery, dated, and confirmed only with the shop\'s own sentence', () => {
    for (const r of ALL) {
      const d = r.delivery;
      expect(d.verifiedAt, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const n of [d.standard, d.freeOver, d.minimumOrder, d.codFee]) if (n !== null && n !== undefined) expect(n, r.id).toBeGreaterThanOrEqual(0);
      if (d.confidence === 'confirmed') {
        expect(d.source, r.id).toBeDefined();
        expect(d.source!.quote.length, r.id).toBeGreaterThan(10);
        expect(d.source!.readAt, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const host = new URL(d.source!.url).host.replace(/^www\./, '');
        expect(host, r.id).toBe(r.domain.replace(/^www\./, ''));
        expect(d.standard !== null || d.freeOver !== null, r.id).toBe(true);
      }
      // Never a figure read under a path the shop's robots.txt disallows (round 2's slip).
      if (['fragrance-outlet', 'microperfumes'].includes(r.id)) expect(d.source?.url ?? '', r.id).not.toContain('/policies/');
    }
  });

  it('pin every sitemap route to the shop\'s own host, with patterns that compile and a currency check on', () => {
    for (const r of ALL) {
      if (r.route?.kind !== 'sitemap') continue;
      const route = r.route.sitemapRoute;
      expect(route.requireGbp, r.id).toBe(true);
      for (const src of [route.product, route.follow, route.exclude, ...(route.titleParts ?? [])]) if (src) expect(() => new RegExp(src)).not.toThrow();
      const host = r.domain.replace(/^www\./, '').replace(/\./g, '\\.');
      expect(route.product, r.id).toContain(host);
      for (const root of route.roots) expect(new URL(root).host.replace(/^www\./, ''), r.id).toBe(r.domain.replace(/^www\./, ''));
    }
  });

  it('let a region shop that sells only fragrance say so without touching any UK shop', () => {
    expect(sellsOnlyFragrance('luckyscent')).toBe(true);
    expect(sellsOnlyFragrance('perfumania')).toBe(false);
    expect(sellsOnlyFragrance('escentric-molecules')).toBe(RETAILERS.find((r) => r.id === 'escentric-molecules')?.fragranceOnlyCatalogue === true);
  });

  it('read the region from a folder or code', () => {
    expect(regionFromArg('us')?.id).toBe('US');
    expect(regionFromArg('IN')?.folder).toBe('in');
    expect(regionFromArg('gb')).toBeNull();
  });

  it('agree with the region config in src/config/regions.ts (Phase 0)', () => {
    for (const r of Object.values(REGION_CRAWL)) {
      const cfg = REGION_CONFIGS.find((c) => c.id === r.id)!;
      expect(cfg.currency, r.id).toBe(r.currency);
      expect(cfg.pathPrefix, r.id).toBe(r.folder);
      // Live as a public beta since 9 October 2026 (the pages at /us/ and /in/).
      expect(cfg.live, r.id).toBe(true);
      expect(cfg.beta, r.id).toBe(true);
    }
  });
});

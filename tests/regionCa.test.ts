// Canada (/ca/, public beta since 22 October 2026; docs/INTERNATIONAL-PLAN.md, "Canada").
// The rules, never the figures: nothing here pins a count, a price or a product the next crawl can change.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGION_CONFIGS, liveRegions, regionById, regionHome, splitRegionPrefix, suggestRegionForTimeZone } from '../src/config/regions.js';
import { REGION_CRAWL, REGION_RETAILERS } from '../src/config/regionRetailers.js';
import { CA_TAX_NOTE } from '../src/types/regionRetailer.js';
import { formatMoney } from '../src/services/money.js';
import { betaLine, formatSize, localWords, priceTaxNote, totalTaxLabel } from '../src/services/regionText.js';
import { regionLegalPages } from '../demo/legalRegion.js';
import { flagSvg } from '../demo/flags.js';
import { REGIONS } from '../src/services/regions.js';

const root = resolve(import.meta.dirname, '..');
const CA = regionById('CA')!;
const shops = REGION_RETAILERS.CA;
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('Canada in the country config', () => {
  it('is a live beta region at /ca/ with Canadian dollars, written the US way and in millilitres', () => {
    expect(CA.name).toBe('Canada');
    expect(CA.live && CA.beta).toBe(true);
    expect(CA.currency).toBe('CAD');
    expect(CA.pathPrefix).toBe('ca');
    expect(regionHome(CA)).toBe('/ca/');
    expect(splitRegionPrefix('/ca/deals')).toEqual({ region: CA, rest: '/deals' });
    expect(liveRegions().map((r) => r.id)).toContain('CA');
    expect(formatMoney(1299, CA)).toBe('$1,299.00');
    expect(formatSize(100, CA)).toBe('100ml');
    expect(CA.delivery.postcodeWord).toBe('postal code');
  });

  it('is on the country menu of every site, with its code beside the name, and has a flag', () => {
    const menu = REGIONS.find((r) => r.id === 'CA')!;
    expect(menu.name).toBe('Canada (Beta)');
    expect(menu.currency).toBe('CAD');
    expect(menu.available).toBe(true);
    expect(flagSvg('CA')).toContain('<svg class="flag"');
    expect(REGION_CONFIGS.map((r) => r.id)).toContain('CA');
  });

  it('suggests Canada for a Canadian time zone and still the US for an American one', () => {
    expect(suggestRegionForTimeZone('America/Toronto')?.id).toBe('CA');
    expect(suggestRegionForTimeZone('America/Vancouver')?.id).toBe('CA');
    expect(suggestRegionForTimeZone('America/Chicago')?.id).toBe('US');
  });

  it('says what the price includes in Canadian words: dollars, before tax, GST HST or PST by province', () => {
    expect(priceTaxNote(CA)).toMatch(/Canadian dollars \(CA\$\)/);
    expect(priceTaxNote(CA)).toMatch(/GST, HST or PST/);
    expect(priceTaxNote(CA)).not.toMatch(/ZIP|state/);
    expect(totalTaxLabel(CA)).toBe('before tax');
    expect(betaLine(CA)).toMatch(/^Canadian prices are in beta/);
    expect(localWords('Delivery to your postcode, RRP', CA)).toBe('Shipping to your postal code, MSRP');
    expect(CA_TAX_NOTE).toMatch(/GST, HST or PST/);
  });

  it('has its own legal pages, in English, with Canadian privacy law named and nothing earned', () => {
    const pages = regionLegalPages('ca', { companyName: 'PriceSniffs', legalName: 'Someone', email: 'a@b.c', businessDetails: '<p>x</p>', shopCount: 10, coverage: 'more than 5' });
    expect(pages.map((p) => p.id).sort()).toEqual(['affiliate', 'how-it-works', 'privacy', 'refunds', 'terms']);
    const text = pages.map((p) => p.body).join('\n');
    expect(text).toMatch(/Personal Information Protection and\s+Electronic Documents Act/);
    expect(text).toMatch(/Quebec/);
    expect(text).toMatch(/No Canadian shop listed here pays us anything/);
    expect(text).not.toMatch(/California|\bZIP\b|FTC/);
  });
});

describe('the Canadian shop registry', () => {
  const enabled = shops.filter((s) => s.enabled);

  it('lists at least ten shops that are read, all in Canadian dollars', () => {
    expect(enabled.length).toBeGreaterThanOrEqual(10);
    for (const s of shops) {
      expect(s.region, s.id).toBe('CA');
      expect(s.currency, s.id).toBe('CAD');
      expect(s.taxNote, s.id).toBe(CA_TAX_NOTE);
      expect(JSON.stringify(s), s.id).not.toMatch(/GBP|£|USD/);
    }
  });

  it('keeps the crawler\'s identity and manners: polite gaps, no affiliate, hot linked photos only', () => {
    for (const s of enabled) {
      expect(s.minRequestGapMs, s.id).toBeGreaterThanOrEqual(1500);
      expect(s.imageBasis, s.id).toBe('hotlink-unlicensed');
      expect(Object.keys(s), s.id).not.toContain('affiliate');
      expect(s.route, s.id).not.toBeNull();
    }
  });

  it('leaves out every shop that refused PriceSniffsBot, with the answer it gave, and reads none of them', () => {
    for (const id of ['fragrancebuy-ca', 'ace-gifts-plus', 'sephora-ca', 'holt-renfrew', 'simons', 'london-drugs', 'shoppers-drug-mart', 'ssense', 'walmart-ca']) {
      const s = shops.find((x) => x.id === id)!;
      expect(s, id).toBeDefined();
      expect(s.enabled, id).toBe(false);
      expect(s.route, id).toBeNull();
      expect(s.blockedReason, id).toMatch(/Refused PriceSniffsBot/);
      expect(s.blockedReason, id).toMatch(/D23/);
    }
  });

  it('names no closed chain', () => {
    const text = JSON.stringify(shops).toLowerCase();
    for (const w of ['hudson', 'nordstrom', 'saks']) expect(text).not.toContain(w);
  });

  it('asks for the Canadian market only through Shopify\'s own selector, and only on Shopify shops', () => {
    for (const s of shops.filter((x) => x.marketQuery !== undefined)) {
      expect(s.marketQuery, s.id).toBe('country=CA');
      expect(s.route?.kind, s.id).toBe('shopify');
    }
  });

  it('confirms a delivery term only with the shop\'s own sentence', () => {
    for (const s of shops.filter((x) => x.delivery.confidence === 'confirmed')) {
      expect(s.delivery.source?.quote.length ?? 0, s.id).toBeGreaterThan(10);
      expect(new URL(s.delivery.source!.url).host.replace(/^www\./, ''), s.id).toBe(s.domain.replace(/^www\./, ''));
    }
  });

  it('crawls to its own folder', () => {
    expect(REGION_CRAWL.CA).toEqual({ id: 'CA', folder: 'ca', currency: 'CAD' });
  });
});

describe('the Canada crawl and its places', () => {
  it('runs once a day in its own slot and group, commits only data/regions/ca, and is deployed after', () => {
    const wf = read('.github/workflows/catalogue-ca.yml');
    expect(wf).toMatch(/- cron: '\d{1,2} \d{1,2} \* \* \*'/);
    expect(wf).toMatch(/\n {2}group: catalogue-ca\n/);
    expect(wf).toContain('./scripts/commit-and-push.sh');
    const folder = (r: string) => ['data', 'regions', r].join('/');
    expect(wf).toContain(folder('ca'));
    expect(wf).not.toContain(folder('us'));
    expect(wf).not.toContain(folder('in'));
    expect(read('.github/workflows/deploy-pages.yml')).toContain("'Catalogue crawl CA'");
  });

  it('is in the service worker\'s country list, the generated-files list and the failure digest', () => {
    expect(read('demo/sw.js')).toMatch(/const REGION_PREFIXES = \[[^\]]*'ca'[^\]]*\];/);
    expect(read('scripts/generated-files.txt')).toContain(`${['data', 'regions', 'ca'].join('/')}/ `);
    expect(read('scripts/generated-files.txt')).toContain('demo/ca/ ');
    expect(read('scripts/failure-digest.ts')).toContain('https://pricesniffs.space/ca/');
    expect(read('.gitignore')).toContain('/demo/ca/');
  });

  it('is registered in the test sets', () => {
    expect(read('scripts/test-sets.txt')).toMatch(/^code\s+tests\/regionCa\.test\.ts$/m);
  });
});

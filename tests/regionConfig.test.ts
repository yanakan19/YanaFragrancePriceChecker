import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_REGION,
  REGION_CONFIGS,
  REGION_STORAGE_KEY,
  REGION_WELCOME_ON,
  activeRegion,
  hreflangAlternates,
  liveRegions,
  regionById,
  regionHome,
  regionPath,
  resetActiveRegionForTests,
  splitRegionPrefix,
  suggestRegionForTimeZone,
  type RegionConfig,
} from '../src/config/regions.js';
import { currencySymbol, formatMoney, formatMoneyShort } from '../src/services/money.js';
import { matchRoute, routeToPath, productPath, rootWords } from '../demo/router.js';
import { headFor, hreflangFor, SITE_URL } from '../demo/head.js';
import { RESERVED_WORDS } from '../src/catalogue/productSlug.js';

/**
 * The region config (docs/INTERNATIONAL-PLAN.md, Phase 0; owner decisions of
 * 9 October 2026 in docs/DECISIONS.md D30): one place for what differs
 * between the UK, the US and India. Today only the UK is live, so every
 * address, canonical and price on the site is what it was; the helpers are
 * ready for /us/ and /in/ and are proven here by switching a region on for
 * the length of one test.
 */

const US = regionById('US')!;
const IN = regionById('IN')!;
const GB = regionById('GB')!;

/** Runs `fn` with `region` live, then puts it back. */
function withLive<T>(region: RegionConfig, fn: () => T): T {
  const was = region.live;
  (region as { live: boolean }).live = true;
  resetActiveRegionForTests();
  try {
    return fn();
  } finally {
    (region as { live: boolean }).live = was;
    resetActiveRegionForTests();
  }
}

afterEach(() => resetActiveRegionForTests());

describe('the regions', () => {
  it('are the United Kingdom, the United States and India, in that order (owner decision 3)', () => {
    expect(REGION_CONFIGS.map((r) => r.id)).toEqual(['GB', 'US', 'IN']);
    expect(REGION_CONFIGS.map((r) => r.name)).toEqual(['United Kingdom', 'United States', 'India']);
  });

  it('hold each one\'s currency, symbol, locale, units and address prefix', () => {
    expect(REGION_CONFIGS.map((r) => [r.currency, r.currencySymbol, r.locale, r.hreflang, r.units, r.pathPrefix])).toEqual([
      ['GBP', '£', 'en-GB', 'en-GB', 'ml', ''],
      ['USD', '$', 'en-US', 'en-US', 'floz-and-ml', 'us'],
      ['INR', '₹', 'en-IN', 'en-IN', 'ml', 'in'],
    ]);
  });

  it('carry the legal, tax and delivery hooks the later phases read', () => {
    expect(REGION_CONFIGS.map((r) => [r.legal, r.taxModel, r.referencePriceName, r.delivery.word, r.delivery.postcodeWord, r.delivery.codFootnote])).toEqual([
      ['uk', 'vat-included', 'RRP', 'delivery', 'postcode', false],
      ['us', 'sales-tax-at-checkout', 'MSRP', 'shipping', 'ZIP code', false],
      ['in', 'gst-included-mrp', 'MRP', 'delivery', 'PIN code', true],
    ]);
  });

  it('has the UK live and the US and India present but not live', () => {
    expect(liveRegions().map((r) => r.id)).toEqual(['GB']);
    expect(US.live).toBe(false);
    expect(IN.live).toBe(false);
    expect(DEFAULT_REGION).toBe(GB);
  });

  it('keeps the welcome pop-up switched off, and names its storage key', () => {
    expect(REGION_WELCOME_ON).toBe(false);
    expect(REGION_STORAGE_KEY).toBe('pricesniffs.region');
  });

  it('is the UK on every address while only the UK is live', () => {
    expect(activeRegion()).toBe(GB);
    for (const p of ['/', '/us/', '/us/deals', '/in', '/in/creed_aventus_100ml', '/deals']) {
      expect(splitRegionPrefix(p)).toEqual({ region: GB, rest: p });
    }
  });
});

describe('money, written each region\'s way', () => {
  it('writes the UK exactly as before: £, two decimals, no thousands separator', () => {
    expect(formatMoney(62.95, GB)).toBe('£62.95');
    expect(formatMoney(1299, GB)).toBe('£1299.00');
    expect(formatMoney(0, GB)).toBe('£0.00');
    expect(formatMoney(62.949999999999996, GB)).toBe('£62.95');
    expect(formatMoney(-0.001, GB)).toBe('£0.00');
    expect(formatMoney(-4, GB)).toBe('£-4.00');
  });

  it('writes the US with a thousands separator and India in whole rupees with Indian grouping', () => {
    expect(formatMoney(1299, US)).toBe('$1,299.00');
    expect(formatMoney(29.5, US)).toBe('$29.50');
    expect(formatMoney(123450, IN)).toBe('₹1,23,450');
    expect(formatMoney(2499.6, IN)).toBe('₹2,500');
  });

  it('states a whole amount without decimals in a sentence', () => {
    expect(formatMoneyShort(25, GB)).toBe('£25');
    expect(formatMoneyShort(3.95, GB)).toBe('£3.95');
    expect(formatMoneyShort(1000, GB)).toBe('£1000');
    expect(formatMoneyShort(35, US)).toBe('$35');
    expect(formatMoneyShort(1000, US)).toBe('$1,000');
    expect(formatMoneyShort(999, IN)).toBe('₹999');
  });

  it('defaults to the region the page is in, the UK', () => {
    expect(formatMoney(10)).toBe('£10.00');
    expect(currencySymbol()).toBe('£');
  });
});

describe('addresses inside a region', () => {
  it('leaves every UK path as it is and prefixes the others', () => {
    expect(regionPath(GB, '/deals')).toBe('/deals');
    expect(regionPath(GB, '/')).toBe('/');
    expect(regionPath(US, '/deals')).toBe('/us/deals');
    expect(regionPath(US, '/')).toBe('/us/');
    expect(regionPath(IN, '/creed_aventus_100ml')).toBe('/in/creed_aventus_100ml');
    expect(REGION_CONFIGS.map(regionHome)).toEqual(['/', '/us/', '/in/']);
  });

  it('answers /us/ addresses as a page not found while the US is not live, exactly as before', () => {
    expect(matchRoute('/us/').name).toBe('notFound');
    expect(matchRoute('/us/deals').name).toBe('notFound');
    expect(matchRoute('/in/brands/creed').name).toBe('notFound');
    expect(matchRoute('/deals').name).toBe('deals');
  });

  it('matches /us/ and /in/ addresses once the region is live, and writes links inside it', () => {
    withLive(US, () => {
      expect(activeRegion()).toBe(GB); // Node has no address: still the UK
      expect(splitRegionPrefix('/us/deals')).toEqual({ region: US, rest: '/deals' });
      expect(splitRegionPrefix('/us')).toEqual({ region: US, rest: '/' });
      expect(matchRoute('/us/').name).toBe('home');
      expect(matchRoute('/us/deals').name).toBe('deals');
      expect(matchRoute('/us/brands/creed')).toEqual({ name: 'brand', param: 'creed', query: {} });
      expect(matchRoute('/us/creed_aventus_100ml')).toEqual({ name: 'product', param: 'creed_aventus_100ml', query: {} });
      // India is still not live.
      expect(matchRoute('/in/deals').name).toBe('notFound');
    });
    const g = globalThis as { location?: unknown };
    const had = 'location' in g;
    const old = g.location;
    g.location = { pathname: '/us/deals' };
    try {
      withLive(US, () => {
        expect(activeRegion()).toBe(US);
        expect(routeToPath({ name: 'deals', param: '', query: {} })).toBe('/us/deals');
        expect(routeToPath({ name: 'home', param: '', query: {} })).toBe('/us/');
        expect(productPath('ean-0000000000000')).toBe('/us/fragrance/ean-0000000000000');
        expect(formatMoney(1299)).toBe('$1,299.00');
        expect(headFor({ route: { name: 'deals', param: '', query: {} } }).canonical).toBe(`${SITE_URL}/us/deals`);
      });
    } finally {
      if (had) g.location = old;
      else delete g.location;
    }
  });

  it('keeps the region prefixes out of the product slugs', () => {
    for (const w of ['us', 'in', 'uk']) expect(RESERVED_WORDS).toContain(w);
    for (const w of rootWords()) expect(['us', 'in', 'uk']).not.toContain(w);
  });
});

describe('canonical and hreflang', () => {
  it('declares no hreflang while only the UK is live, so no page head changes', () => {
    expect(hreflangAlternates(SITE_URL, '/deals')).toEqual([]);
    const tags = headFor({ route: { name: 'deals', param: '', query: {} } });
    expect(tags.canonical).toBe(`${SITE_URL}/deals`);
    expect(hreflangFor(tags)).toEqual([]);
  });

  it('names every live region and x-default once a second region is live', () => {
    withLive(US, () => {
      expect(hreflangAlternates(SITE_URL, '/deals')).toEqual([
        { hreflang: 'en-GB', href: `${SITE_URL}/deals` },
        { hreflang: 'en-US', href: `${SITE_URL}/us/deals` },
        { hreflang: 'x-default', href: `${SITE_URL}/deals` },
      ]);
      const tags = headFor({ route: { name: 'deals', param: '', query: {} } });
      expect(hreflangFor(tags).map((l) => l.hreflang)).toEqual(['en-GB', 'en-US', 'x-default']);
      // A page kept out of search engines declares none.
      expect(hreflangFor({ ...tags, noindex: true })).toEqual([]);
    });
  });
});

describe('the time zone suggestion', () => {
  it('suggests from the browser time zone alone', () => {
    expect(suggestRegionForTimeZone('Europe/London')?.id).toBe('GB');
    expect(suggestRegionForTimeZone('America/New_York')?.id).toBe('US');
    expect(suggestRegionForTimeZone('America/Los_Angeles')?.id).toBe('US');
    expect(suggestRegionForTimeZone('Pacific/Honolulu')?.id).toBe('US');
    expect(suggestRegionForTimeZone('Asia/Kolkata')?.id).toBe('IN');
    expect(suggestRegionForTimeZone('Asia/Calcutta')?.id).toBe('IN');
    expect(suggestRegionForTimeZone('Europe/Paris')).toBeNull();
    expect(suggestRegionForTimeZone('')).toBeNull();
    expect(suggestRegionForTimeZone(null)).toBeNull();
  });
});

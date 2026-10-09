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
  regionHasFixedPage,
  resetActiveRegionForTests,
  setActiveRegionForBuild,
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
 * between the UK, the US and India. Since the public beta of 9 October 2026
 * all three are live: the UK at the root, exactly as before, the US at /us/
 * and India at /in/. A region switched off is proven here by switching it off
 * for the length of one test.
 */

const US = regionById('US')!;
const IN = regionById('IN')!;
const GB = regionById('GB')!;

/** Runs `fn` with `region` live or not, then puts it back. */
function withLiveSet<T>(region: RegionConfig, live: boolean, fn: () => T): T {
  const was = region.live;
  (region as { live: boolean }).live = live;
  resetActiveRegionForTests();
  try {
    return fn();
  } finally {
    (region as { live: boolean }).live = was;
    resetActiveRegionForTests();
  }
}
const withLive = <T>(region: RegionConfig, fn: () => T): T => withLiveSet(region, true, fn);
const withOff = <T>(region: RegionConfig, fn: () => T): T => withLiveSet(region, false, fn);

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

  it('has all three live since the public beta of 9 October 2026, the US and India in beta', () => {
    expect(liveRegions().map((r) => r.id)).toEqual(['GB', 'US', 'IN']);
    expect(REGION_CONFIGS.map((r) => [r.id, r.live, r.beta])).toEqual([['GB', true, false], ['US', true, true], ['IN', true, true]]);
    expect(REGION_CONFIGS.map((r) => r.shopsAdjective)).toEqual(['UK', 'US', 'Indian']);
    expect(DEFAULT_REGION).toBe(GB);
  });

  it('has the welcome pop-up switched on (owner decision, while the AdSense review is open), and names its storage key', () => {
    expect(REGION_WELCOME_ON).toBe(true);
    expect(REGION_STORAGE_KEY).toBe('pricesniffs.region');
  });

  it('reads the region from the address prefix, and leaves every UK address in the UK', () => {
    expect(activeRegion()).toBe(GB);
    for (const p of ['/', '/deals', '/creed_aventus_100ml', '/brands/creed', '/uk/deals', '/usa', '/india']) {
      expect(splitRegionPrefix(p)).toEqual({ region: GB, rest: p });
    }
    expect(splitRegionPrefix('/us/')).toEqual({ region: US, rest: '/' });
    expect(splitRegionPrefix('/us/deals')).toEqual({ region: US, rest: '/deals' });
    expect(splitRegionPrefix('/in')).toEqual({ region: IN, rest: '/' });
    expect(splitRegionPrefix('/in/creed_aventus_100ml')).toEqual({ region: IN, rest: '/creed_aventus_100ml' });
  });

  it('is the UK on every address while a region is switched off', () => {
    withOff(US, () => withOff(IN, () => {
      for (const p of ['/', '/us/', '/us/deals', '/in', '/in/creed_aventus_100ml', '/deals']) {
        expect(splitRegionPrefix(p)).toEqual({ region: GB, rest: p });
      }
    }));
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

  it('answers /us/ addresses as a page not found while the US is switched off', () => {
    withOff(US, () => {
      expect(matchRoute('/us/').name).toBe('notFound');
      expect(matchRoute('/us/deals').name).toBe('notFound');
      expect(matchRoute('/in/brands/creed')).toEqual({ name: 'brand', param: 'creed', query: {} });
      expect(matchRoute('/deals').name).toBe('deals');
    });
  });

  it('matches /us/ and /in/ addresses, and writes links inside the region the page is in', () => {
    withLive(US, () => {
      expect(activeRegion()).toBe(GB); // Node has no address: still the UK
      expect(splitRegionPrefix('/us/deals')).toEqual({ region: US, rest: '/deals' });
      expect(splitRegionPrefix('/us')).toEqual({ region: US, rest: '/' });
      expect(matchRoute('/us/').name).toBe('home');
      expect(matchRoute('/us/deals').name).toBe('deals');
      expect(matchRoute('/us/brands/creed')).toEqual({ name: 'brand', param: 'creed', query: {} });
      expect(matchRoute('/us/creed_aventus_100ml')).toEqual({ name: 'product', param: 'creed_aventus_100ml', query: {} });
      expect(matchRoute('/in/deals').name).toBe('deals');
      expect(matchRoute('/in/about/legal', '', '#privacy')).toEqual({ name: 'legalNotice', param: 'privacy', query: {} });
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
    withOff(US, () => withOff(IN, () => {
      expect(hreflangAlternates(SITE_URL, '/deals')).toEqual([]);
      const tags = headFor({ route: { name: 'deals', param: '', query: {} } });
      expect(tags.canonical).toBe(`${SITE_URL}/deals`);
      expect(hreflangFor(tags)).toEqual([]);
    }));
  });

  it('names every live region and x-default (the UK page) on a page every region has', () => {
    expect(hreflangAlternates(SITE_URL, '/deals')).toEqual([
      { hreflang: 'en-GB', href: `${SITE_URL}/deals` },
      { hreflang: 'en-US', href: `${SITE_URL}/us/deals` },
      { hreflang: 'en-IN', href: `${SITE_URL}/in/deals` },
      { hreflang: 'x-default', href: `${SITE_URL}/deals` },
    ]);
    const tags = headFor({ route: { name: 'deals', param: '', query: {} } });
    expect(hreflangFor(tags).map((l) => l.hreflang)).toEqual(['en-GB', 'en-US', 'en-IN', 'x-default']);
    // A page kept out of search engines declares none.
    expect(hreflangFor({ ...tags, noindex: true })).toEqual([]);
  });

  it('names only the regions that have the page: a product or brand sold in two, Notes in the UK alone', () => {
    expect(hreflangAlternates(SITE_URL, '/creed_aventus_100ml', ['GB', 'US']).map((l) => `${l.hreflang} ${l.href}`)).toEqual([
      `en-GB ${SITE_URL}/creed_aventus_100ml`,
      `en-US ${SITE_URL}/us/creed_aventus_100ml`,
      `x-default ${SITE_URL}/creed_aventus_100ml`,
    ]);
    // Sold in the US and India but not the UK: no x-default, which is the UK page.
    expect(hreflangAlternates(SITE_URL, '/brands/rasasi', ['US', 'IN']).map((l) => l.hreflang)).toEqual(['en-US', 'en-IN']);
    expect(hreflangAlternates(SITE_URL, '/x_y_100ml', ['US'])).toEqual([]);
    // The beta regions' Notes tab is empty (their shops publish no notes), so the UK's declares none.
    expect(regionHasFixedPage(US, '/notes')).toBe(false);
    expect(regionHasFixedPage(GB, '/notes')).toBe(true);
    expect(hreflangAlternates(SITE_URL, '/notes')).toEqual([]);
  });

  it('gives each region its own canonical, never another region\'s', () => {
    for (const region of [GB, US, IN]) {
      setActiveRegionForBuild(region);
      try {
        expect(headFor({ route: { name: 'deals', param: '', query: {} } }).canonical).toBe(`${SITE_URL}${regionPath(region, '/deals')}`);
        expect(headFor({ route: { name: 'product', param: 'creed_aventus_100ml', query: {} } }).canonical).toBe(`${SITE_URL}${regionPath(region, '/creed_aventus_100ml')}`);
      } finally {
        setActiveRegionForBuild(null);
      }
    }
  });

  it('describes a region\'s pages in its own words, and keeps its empty Notes tab out of search engines', () => {
    setActiveRegionForBuild(US);
    try {
      const fragrances = headFor({ route: { name: 'fragrances', param: '', query: {} } });
      expect(fragrances.description).toContain('US shops');
      expect(fragrances.description).not.toContain('UK shops');
      expect(headFor({ route: { name: 'home', param: '', query: {} } }).description).toContain('US shops');
      expect(headFor({ route: { name: 'notes', param: '', query: {} } }).noindex).toBe(true);
    } finally {
      setActiveRegionForBuild(null);
    }
    expect(headFor({ route: { name: 'fragrances', param: '', query: {} } }).description).toContain('UK shops');
    expect(headFor({ route: { name: 'notes', param: '', query: {} } }).noindex).toBe(false);
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

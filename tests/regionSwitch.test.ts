import { describe, expect, it } from 'vitest';
import { regionById } from '../src/config/regions.js';
import {
  BAR_DISMISSED_KEY, barRegion, barText, leafAlternates, pricesWord, switchNeedsLinks, switchTarget, type RegionLinks,
} from '../demo/regionSwitch.js';
import { SITE_URL } from '../demo/head.js';

/**
 * Switching country and the slim bar (demo/regionSwitch.ts;
 * docs/INTERNATIONAL-PLAN.md section 2, "The menu: switching and
 * remembering"; public beta of 9 October 2026). Under Node the page is the
 * UK's, so every switch here starts on a UK address.
 */

const GB = regionById('GB')!;
const US = regionById('US')!;
const IN = regionById('IN')!;
const LIVE = [GB, US, IN];

const LINKS: RegionLinks = {
  US: { slugs: { 'ean-1': 'creed_aventus_100ml', 'ean-2': 'dior_sauvage_us_100ml' }, brands: ['creed', 'dior', 'lattafa'] },
  IN: { slugs: { 'ean-3': 'rasasi_hawas_100ml' }, brands: ['rasasi', 'lattafa'] },
};

const route = (name: Parameters<typeof switchTarget>[0]['route']['name'], param = '', query: Record<string, string> = {}) => ({ name, param, query });

describe('where a switch goes', () => {
  it('opens the same product there when it is sold there, by id, at its address there', () => {
    expect(switchTarget({ route: route('product', 'creed_aventus_100ml'), productId: 'ean-1', brand: 'Creed' }, US, LINKS)).toBe('/us/creed_aventus_100ml');
    // Another address in the US: the US one, found by the product id.
    expect(switchTarget({ route: route('product', 'dior_sauvage_100ml'), productId: 'ean-2', brand: 'Dior' }, US, LINKS)).toBe('/us/dior_sauvage_us_100ml');
    expect(switchTarget({ route: route('fragrance', 'ean-3'), productId: 'ean-3', brand: 'Rasasi' }, IN, LINKS)).toBe('/in/rasasi_hawas_100ml');
  });

  it('else its brand there, else that country\'s home', () => {
    expect(switchTarget({ route: route('product', 'lattafa_khamrah_100ml'), productId: 'ean-9', brand: 'Lattafa' }, IN, LINKS)).toBe('/in/brands/lattafa');
    expect(switchTarget({ route: route('product', 'x_y_100ml'), productId: 'ean-9', brand: 'Nobody' }, US, LINKS)).toBe('/us/');
    // Without the lookup file, never a page that might not exist.
    expect(switchTarget({ route: route('product', 'creed_aventus_100ml'), productId: 'ean-1', brand: 'Creed' }, US, null)).toBe('/us/');
  });

  it('opens a brand there, or that country\'s Brands; a shop page opens its Shops, a note page its Notes', () => {
    expect(switchTarget({ route: route('brand', 'creed'), brand: 'Creed' }, US, LINKS)).toBe('/us/brands/creed');
    expect(switchTarget({ route: route('brand', 'creed'), brand: 'Creed' }, IN, LINKS)).toBe('/in/brands');
    expect(switchTarget({ route: route('retailer', 'boots') }, US, LINKS)).toBe('/us/retailers');
    expect(switchTarget({ route: route('note', 'vanilla') }, IN, LINKS)).toBe('/in/notes');
  });

  it('opens the same section on the pages every country has, filters kept, and the home of the UK at the root', () => {
    expect(switchTarget({ route: route('deals') }, US, null)).toBe('/us/deals');
    expect(switchTarget({ route: route('home') }, IN, null)).toBe('/in/');
    expect(switchTarget({ route: route('fragrances', '', { size: '30-70' }) }, US, null)).toBe('/us/fragrances?size=30-70');
    expect(switchTarget({ route: route('legalNotice', 'privacy') }, US, null)).toBe('/us/about/legal#privacy');
    expect(switchTarget({ route: route('guide', 'decants-and-testers') }, IN, null)).toBe('/in/guides/decants-and-testers');
    expect(switchTarget({ route: route('deals') }, GB, null)).toBe('/deals');
  });

  it('opens that country\'s home from the account pages and from anything else', () => {
    for (const name of ['account', 'accountWishlist', 'accountNotifications', 'notFound', 'developer', 'design'] as const) {
      expect(switchTarget({ route: route(name) }, US, LINKS), name).toBe('/us/');
    }
  });

  it('needs the lookup file only on a product or a brand page', () => {
    expect(['product', 'fragrance', 'brand'].map((n) => switchNeedsLinks(route(n as 'product')))).toEqual([true, true, true]);
    expect(switchNeedsLinks(route('deals'))).toBe(false);
    expect(switchNeedsLinks(route('retailer', 'boots'))).toBe(false);
  });
});

describe('the slim bar', () => {
  const base = { active: GB, live: LIVE, pathname: '/creed_aventus_100ml', stored: null, suggested: null, dismissed: false };

  it('offers the saved country on a deep link elsewhere, never on the bare UK home (the pop-up asks there)', () => {
    expect(barRegion({ ...base, stored: 'US' })).toBe(US);
    expect(barRegion({ ...base, stored: 'US', pathname: '/' })).toBeNull();
    expect(barRegion({ ...base, stored: 'GB' })).toBeNull();
    // The mirror on a US page for a visitor who chose the UK, the US home included.
    expect(barRegion({ ...base, active: US, pathname: '/us/', stored: 'GB' })).toBe(GB);
  });

  it('falls back to the time zone only when nothing is saved, and stays shut once closed or with one country live', () => {
    expect(barRegion({ ...base, suggested: 'IN' })).toBe(IN);
    expect(barRegion({ ...base, stored: 'GB', suggested: 'IN' })).toBeNull();
    expect(barRegion({ ...base, stored: 'US', dismissed: true })).toBeNull();
    expect(barRegion({ ...base, stored: 'US', live: [GB] })).toBeNull();
  });

  it('says it in plain words, with no hyphens or dashes', () => {
    expect(barText(GB, US)).toEqual({ lead: 'You are seeing UK prices.', link: 'See US prices' });
    expect(barText(US, GB)).toEqual({ lead: 'You are seeing US prices.', link: 'See UK prices' });
    expect(barText(GB, IN).link).toBe('See Indian prices');
    expect(pricesWord(IN)).toBe('Indian prices');
    for (const t of [barText(GB, US), barText(IN, GB)]) expect(`${t.lead} ${t.link}`).not.toMatch(/[-‐-―−]/);
    expect(BAR_DISMISSED_KEY).toBe('pricesniffs.regionBarClosed');
  });
});

describe('the hreflang alternates of a product or brand page', () => {
  it('names the page and its counterpart in each country that sells it, x-default the UK page', () => {
    const alts = leafAlternates(SITE_URL, GB, LIVE, '/dior_sauvage_100ml', { route: route('product', 'dior_sauvage_100ml'), productId: 'ean-2' }, LINKS);
    expect(alts).toEqual([
      { hreflang: 'en-GB', href: `${SITE_URL}/dior_sauvage_100ml` },
      { hreflang: 'en-US', href: `${SITE_URL}/us/dior_sauvage_us_100ml` },
      { hreflang: 'x-default', href: `${SITE_URL}/dior_sauvage_100ml` },
    ]);
    const brand = leafAlternates(SITE_URL, GB, LIVE, '/brands/lattafa', { route: route('brand', 'lattafa'), brand: 'Lattafa' }, LINKS);
    expect(brand.map((a) => a.hreflang)).toEqual(['en-GB', 'en-US', 'en-IN', 'x-default']);
  });

  it('declares none for a page no other country has, or before the lookup file has loaded', () => {
    expect(leafAlternates(SITE_URL, GB, LIVE, '/x_y_100ml', { route: route('product', 'x_y_100ml'), productId: 'ean-9' }, LINKS)).toEqual([]);
    expect(leafAlternates(SITE_URL, GB, LIVE, '/dior_sauvage_100ml', { route: route('product', 'dior_sauvage_100ml'), productId: 'ean-2' }, null)).toEqual([]);
  });
});

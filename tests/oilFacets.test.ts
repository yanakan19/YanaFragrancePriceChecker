import { describe, expect, it } from 'vitest';
import { DEMO_FRAGRANCES, shopIdsOf, type DemoFragrance } from '../demo/data.js';
import { OIL_SORT_OPTIONS, sortTab } from '../demo/listSort.js';
import { OIL_FORMAT_OPTIONS, OIL_SIZE_BANDS, oilSizeBand, pricePerMl, pricePerMlLabel, slugOf } from '../demo/tabFacets.js';
import { createTabs } from '../demo/tabPanels.js';
import { tabDeps } from './support/tabDeps.js';
import { sheetBodyHtml } from '../demo/filterUi.js';
import { isOil } from '../demo/productKind.js';

/**
 * The Oils tab's own filters, sort and per ml line (docs/GIFT-SETS-AND-OILS-PLAN.md,
 * 2.4 and phase 6), recomputed from the catalogue.
 */
const tabs = createTabs(tabDeps());

const oils = DEMO_FRAGRANCES.filter(isOil);
const view = (id: string) => {
  tabs.reset('oils');
  return tabs.views('oils').find((v) => v.facet.id === id);
};
const counts = (id: string): Record<string, number> => Object.fromEntries((view(id)?.options ?? []).map((o) => [o.value, o.count]));

describe('Size', () => {
  it('has bands with the lower bound in and the upper bound out', () => {
    expect(oilSizeBand(6.9)).toBe('u7');
    expect(oilSizeBand(7)).toBe('7-13');
    expect(oilSizeBand(13)).toBe('13-21');
    expect(oilSizeBand(21)).toBe('21-45');
    expect(oilSizeBand(45)).toBe('45+');
    expect(oilSizeBand(null)).toBeNull();
  });

  it('counts each band as the oils whose size falls in it', () => {
    const want: Record<string, number> = {};
    for (const f of oils) {
      const b = oilSizeBand(f.sizeMl);
      if (b) want[b] = (want[b] ?? 0) + 1;
    }
    expect(counts('size')).toEqual(want);
    expect(view('size')!.options.map((o) => o.label)).toEqual(OIL_SIZE_BANDS.filter((b) => want[b.value]).map((b) => b.label));
    console.log('oil size bands', want, 'oils', oils.length, 'no size', oils.filter((f) => f.sizeMl === null).length);
  });
});

describe('Format and Alcohol Free', () => {
  it('count only oils whose shop stated them', () => {
    const want: Record<string, number> = {};
    for (const f of oils) if (f.oil?.format) want[f.oil.format] = (want[f.oil.format] ?? 0) + 1;
    expect(counts('format')).toEqual(want);
    expect(view('format')!.options.every((o) => OIL_FORMAT_OPTIONS.some((x) => x.value === o.value))).toBe(true);
    const alcohol = oils.filter((f) => f.oil?.alcoholFree === true).length;
    tabs.reset('oils');
    const v = tabs.views('oils').find((x) => x.facet.id === 'alcohol')!;
    expect(v.count).toBe(alcohol);
    console.log('oil formats', want, 'alcohol free', alcohol);
  });

  it('never read silence as a claim: an oil that states neither stays listed and is in no flagged result', () => {
    const silent = oils.filter((f) => !f.oil?.format && f.oil?.alcoholFree !== true);
    expect(silent.length).toBeGreaterThan(0);
    tabs.reset('oils');
    const all = new Set(tabs.listOf('oils').map((f) => f.id));
    for (const f of silent) expect(all.has(f.id)).toBe(true);
    tabs.setFacet('oils', 'format', 'roll-on');
    const roll = tabs.listOf('oils');
    expect(roll.every((f) => f.oil?.format === 'roll-on')).toBe(true);
    for (const f of silent) expect(roll.includes(f)).toBe(false);
    tabs.reset('oils');
    tabs.setFacet('oils', 'alcohol', '1');
    const free = tabs.listOf('oils');
    expect(free.every((f) => f.oil?.alcoholFree === true)).toBe(true);
    for (const f of silent) expect(free.includes(f)).toBe(false);
    tabs.reset('oils');
  });

  it('say, in the panel, that they are what a shop says', () => {
    tabs.reset('oils');
    const ctx = tabs.filterContext('oils');
    expect(sheetBodyHtml(ctx, { open: new Map([['format', true]]), find: new Map() }, { esc: (s: string) => s, iconFilter: '', iconClose: '', iconChevron: '' })).toMatch(/only what a shop says about an oil/);
    tabs.reset('oils');
  });
});

describe('Brand and Shop', () => {
  it('list the brands that have an oil and the shops that sell one, each with its count', () => {
    const brands = new Map<string, number>();
    const shops = new Map<string, number>();
    for (const f of oils) {
      brands.set(slugOf(f.brand), (brands.get(slugOf(f.brand)) ?? 0) + 1);
      for (const s of shopIdsOf(f.id)) shops.set(s, (shops.get(s) ?? 0) + 1);
    }
    expect(counts('brand')).toEqual(Object.fromEntries(brands));
    expect(counts('shop')).toEqual(Object.fromEntries(shops));
    console.log('oil brands', brands.size, 'oil shops', shops.size);
  });
});

describe('price per ml', () => {
  it('is the cheapest shop price over the size, and absent without a size or a price', () => {
    for (const f of oils) {
      const per = pricePerMl(f);
      if (f.sizeMl === null) expect(per).toBeNull();
      else if (per !== null) expect(per).toBeGreaterThan(0);
    }
    expect(pricePerMlLabel(0.8)).toBe('£0.80 per ml');
    expect(pricePerMlLabel(0.0456)).toBe('£0.046 per ml');
    expect(pricePerMl({ id: 'nope', sizeMl: 10 })).toBeNull();
    expect(pricePerMl({ id: 'nope', sizeMl: null })).toBeNull();
  });

  it('sorts lowest first, and an oil with no figure last', () => {
    const list = sortTab(oils, 'ml-low');
    const values = list.map((f) => pricePerMl(f));
    const firstNull = values.indexOf(null);
    if (firstNull !== -1) expect(values.slice(firstNull).every((v) => v === null)).toBe(true);
    const known = values.filter((v): v is number => v !== null);
    for (let i = 1; i < known.length; i++) expect(known[i]!).toBeGreaterThanOrEqual(known[i - 1]!);
    expect(known.length).toBeGreaterThan(100);
    expect(new Set(list.map((f) => f.id)).size).toBe(oils.length);
  });

  it('is offered on Oils only, with both ends named, and the size sorts beside it', () => {
    const labels = OIL_SORT_OPTIONS.map((o) => o.label);
    expect(labels).toContain('Lowest to Highest Per Ml');
    expect(labels).toContain('Smallest to Largest Size');
    expect(labels).toContain('Largest to Smallest Size');
    tabs.reset('sets');
    tabs.setSort('sets', 'ml-low');
    expect(tabs.state('sets').sort).toBe('stocked');
  });

  it('puts a size sort in order with an unreadable size last', () => {
    const list = sortTab(oils, 'size-low');
    const sizes = list.map((f: DemoFragrance) => f.sizeMl);
    const known = sizes.filter((s): s is number => s !== null);
    for (let i = 1; i < known.length; i++) expect(known[i]!).toBeGreaterThanOrEqual(known[i - 1]!);
    const firstNull = sizes.indexOf(null);
    if (firstNull !== -1) expect(sizes.slice(firstNull).every((s) => s === null)).toBe(true);
  });
});

describe('the Oils tab as drawn', () => {
  it('has the Size, Format, Alcohol Free, Brand and Shop filters beside Gender, Price, Brand Type and In Stock, and no strength', () => {
    tabs.reset('oils');
    const ids = tabs.views('oils').map((v) => v.facet.id);
    for (const id of ['size', 'format', 'alcohol', 'brand', 'shop', 'gender', 'price', 'type', 'stock']) expect(ids).toContain(id);
    expect(ids).not.toContain('strength');
    expect(ids).not.toContain('sale');
  });
});

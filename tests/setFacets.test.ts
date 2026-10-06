import { describe, expect, it } from 'vitest';
import { DEMO_FRAGRANCES, shopIdsOf, type DemoFragrance } from '../demo/data.js';
import { SET_SORT_OPTIONS, sortTab } from '../demo/listSort.js';
import { MAIN_BOTTLE_BANDS, SET_BOX_OPTIONS, SET_KIND_OPTIONS, mainBottleBand, setBoxValues, setKindOf, slugOf } from '../demo/tabFacets.js';
import { createTabs } from '../demo/tabPanels.js';
import { isSet } from '../demo/productKind.js';

/**
 * The Sets tab's own filters and sorts (docs/GIFT-SETS-AND-OILS-PLAN.md, 2.3 and
 * phase 5), recomputed from the catalogue: every option's count is the number of
 * sets that pass it, and an option nobody holds is absent.
 */
const tabs = createTabs({
  attrs: (f) => ({ concentration: 'edp', gender: 'notStated', tier: f.tier, priceBand: null, inStock: true }),
  concentrationOptions: [{ value: 'edp', label: 'Eau de Parfum (EDP)' }],
  genderOptions: [{ value: 'notStated', label: 'Not Stated' }],
  priceOptions: [{ value: '0-25', label: 'Under £25' }],
  tierOptions: [{ value: 'designer', label: 'Designer' }, { value: 'niche', label: 'Niche' }, { value: 'mideast', label: 'Middle East' }],
  fragranceList: (list, empty) => (list.length ? `<ul>${list.length}</ul>` : `<p>${empty}</p>`),
  sortControl: (id, _subject, options, current) => `<select id="${id}">${options.map((o) => `<option value="${o.value}"${o.value === current ? ' selected' : ''}>${o.label}</option>`).join('')}</select>`,
  listControls: (sort, ui) => `${sort}${ui.toggle}${ui.panel}`,
  esc: (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
  iconFilter: '<i/>',
  iconChevron: '<i/>',
});

const sets = DEMO_FRAGRANCES.filter(isSet);
const view = (id: string) => {
  tabs.reset('sets');
  return tabs.views('sets').find((v) => v.facet.id === id)!;
};
const counts = (id: string): Record<string, number> => Object.fromEntries(view(id).options.map((o) => [o.value, o.count]));

describe('Kind', () => {
  it('is Gift Set, Bundle of Full Bottles or Miniature or Discovery Set, each counted as the sets that are one', () => {
    const want: Record<string, number> = {};
    for (const f of sets) want[setKindOf(f)!] = (want[setKindOf(f)!] ?? 0) + 1;
    expect(counts('kind')).toEqual(want);
    expect(view('kind').options.map((o) => o.label)).toEqual(SET_KIND_OPTIONS.map((o) => o.label));
    expect(Object.keys(want).sort()).toEqual(['bundle', 'gift', 'miniature']);
    console.log('set kinds', want);
  });

  it('puts a set in exactly one kind, and a bundle first', () => {
    for (const f of sets) expect(['gift', 'bundle', 'miniature']).toContain(setKindOf(f));
    expect(setKindOf({ giftSet: { contents: null, title: 'x', bundle: true, mini: true } })).toBe('bundle');
    expect(setKindOf({ giftSet: null })).toBeNull();
  });

  it('calls a set with one small bottle and a lotion a gift set, and a set of 7ml and 7ml a miniature set', () => {
    const named = (re: RegExp) => sets.find((f) => re.test(f.giftSet!.title));
    const mini = named(/^Gift Set 7ml FlowerBomb EDP \+ 7ml Spicebomb EDT$/) ?? named(/Flowerbomb Gift Set Flowerbomb EDP 7ml/);
    if (mini) expect(setKindOf(mini)).toBe('miniature');
    const lotion = named(/Flowerbomb Gift Set 7ml EDP \+ 50ml Body Lotion/);
    if (lotion) expect(setKindOf(lotion)).toBe('gift');
  });
});

describe('In the Box', () => {
  it('counts each option as the sets that hold it, and a set with no list only under Contents Not Stated', () => {
    const want: Record<string, number> = {};
    for (const f of sets) for (const v of setBoxValues(f)) want[v] = (want[v] ?? 0) + 1;
    expect(counts('box')).toEqual(want);
    for (const f of sets.filter((x) => x.giftSet!.contents === null)) expect(setBoxValues(f)).toEqual(['unknown']);
    expect(want.unknown).toBeGreaterThan(0);
    expect(view('box').options.map((o) => o.label)).toEqual(SET_BOX_OPTIONS.filter((o) => want[o.value]).map((o) => o.label));
    console.log('in the box', want);
  });

  it('says a set has a lotion only where its list names a body product', () => {
    for (const f of sets) {
      if (setBoxValues(f).includes('body')) expect(f.giftSet!.contents!.join(' ')).toMatch(/lotion|cream|balm|butter|moisturi|milk|souffle|aftershave|gel/i);
    }
  });
});

describe('Main Bottle', () => {
  it('has bands with the lower bound in and the upper bound out', () => {
    expect(mainBottleBand(14.9)).toBe('u15');
    expect(mainBottleBand(15)).toBe('15-30');
    expect(mainBottleBand(30)).toBe('30-70');
    expect(mainBottleBand(70)).toBe('70-120');
    expect(mainBottleBand(120)).toBe('120+');
    expect(mainBottleBand(null)).toBeNull();
    expect(mainBottleBand(undefined)).toBeNull();
  });

  it('counts each band as the sets whose main bottle falls in it, and puts a set with none in no band', () => {
    const want: Record<string, number> = {};
    for (const f of sets) {
      const b = mainBottleBand(f.giftSet!.mainMl);
      if (b) want[b] = (want[b] ?? 0) + 1;
    }
    expect(counts('main')).toEqual(want);
    expect(view('main').options.map((o) => o.label)).toEqual(MAIN_BOTTLE_BANDS.filter((b) => want[b.value]).map((b) => b.label));
    const none = sets.filter((f) => f.giftSet!.mainMl === undefined).length;
    expect(Object.values(want).reduce((a, b) => a + b, 0) + none).toBe(sets.length);
    console.log('main bottle bands', want, 'none', none);
  });
});

describe('Brand and Shop', () => {
  it('list the brands that have a set and the shops that sell one, each with its count', () => {
    const brands = new Map<string, number>();
    const shops = new Map<string, number>();
    for (const f of sets) {
      brands.set(slugOf(f.brand), (brands.get(slugOf(f.brand)) ?? 0) + 1);
      for (const s of shopIdsOf(f.id)) shops.set(s, (shops.get(s) ?? 0) + 1);
    }
    expect(counts('brand')).toEqual(Object.fromEntries(brands));
    expect(counts('shop')).toEqual(Object.fromEntries(shops));
    console.log('set brands', brands.size, 'set shops', shops.size);
    // Named A to Z.
    const labels = view('brand').options.map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it('narrow the list, are put in the address and are taken back from it', () => {
    const top = [...view('brand').options].sort((a, b) => b.count - a.count)[0]!;
    tabs.reset('sets');
    tabs.setFacet('sets', 'brand', top.value);
    expect(tabs.listOf('sets')).toHaveLength(top.count);
    const q = tabs.query('sets');
    expect(q).toEqual({ brand: top.value });
    tabs.reset('sets');
    tabs.fromQuery('sets', { ...q, shop: 'no-such-shop', kind: 'nonsense' });
    expect(tabs.state('sets').sel).toEqual({ brand: top.value });
  });

  it('stay out of the way of each other: choosing a brand leaves the other brands in their dropdown', () => {
    const all = view('brand').options.length;
    tabs.reset('sets');
    tabs.setFacet('sets', 'brand', view('brand').options[0]!.value);
    const brandOptions = tabs.views('sets').find((v) => v.facet.id === 'brand')!.options;
    expect(brandOptions.length).toBe(all);
  });
});

describe('the sorts', () => {
  const key = (f: DemoFragrance, sort: string): number | null => (sort === 'items-high' ? (f.giftSet!.items ?? null) : (f.giftSet!.mainMl ?? null));

  it('name both ends', () => {
    const labels = SET_SORT_OPTIONS.map((o) => o.label);
    expect(labels).toContain('Smallest to Largest Bottle');
    expect(labels).toContain('Largest to Smallest Bottle');
    expect(labels).toContain('Most to Fewest Items');
  });

  for (const sort of ['main-low', 'main-high', 'items-high'] as const) {
    it(`${sort} sorts in order and puts a set with no figure last, in either direction`, () => {
      const list = sortTab(sets, sort);
      const values = list.map((f) => key(f, sort));
      const known = values.filter((v): v is number => v !== null);
      const firstNull = values.indexOf(null);
      if (firstNull !== -1) expect(values.slice(firstNull).every((v) => v === null)).toBe(true);
      for (let i = 1; i < known.length; i++) {
        if (sort === 'main-low') expect(known[i]!).toBeGreaterThanOrEqual(known[i - 1]!);
        else expect(known[i]!).toBeLessThanOrEqual(known[i - 1]!);
      }
      expect(new Set(list.map((f) => f.id)).size).toBe(sets.length);
    });
  }

  it('is a total order: it does not depend on the input order', () => {
    const shuffled = [...sets].reverse();
    for (const sort of ['main-low', 'main-high', 'items-high'] as const) {
      expect(sortTab(shuffled, sort).map((f) => f.id)).toEqual(sortTab(sets, sort).map((f) => f.id));
    }
  });
});

describe('the Sets tab as drawn', () => {
  it('has the Kind, In the Box, Main Bottle, Brand and Shop filters, and no On Sale', () => {
    tabs.reset('sets');
    const ids = tabs.views('sets').map((v) => v.facet.id);
    for (const id of ['kind', 'box', 'main', 'brand', 'shop', 'price', 'stock']) expect(ids).toContain(id);
    expect(ids).not.toContain('sale');
    tabs.toggleOpen('sets');
    // Brand and shop names are the businesses' own and may carry a hyphen; every word of ours may not.
    const html = tabs.panel('sets').replace(/<select id="tab-facet-(?:brand|shop)"[\s\S]*?<\/select>/g, '');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/[-‐-―−]/);
    tabs.reset('sets');
  });
});

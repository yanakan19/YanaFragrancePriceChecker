import { describe, expect, it } from 'vitest';
import { DEMO_FRAGRANCES, type DemoFragrance } from '../demo/data.js';
import { sortFragrances } from '../demo/listSort.js';
import { isOil, isSet } from '../demo/productKind.js';
import {
  applyFacets,
  chosenCount,
  emptyTabState,
  facetViews,
  fixedOptions,
  liftFacet,
  matchesSearch,
  namedSelect,
  runFacets,
  sameSelection,
  sameTabState,
  selFromQuery,
  selToQuery,
  tabFromQuery,
  tabToQuery,
  withChosen,
  withValue,
  type Facet,
} from '../demo/listFilters.js';
import { createTabs } from '../demo/tabPanels.js';
import { isOilStrength } from '../src/catalogue/perfumeOil.js';
import { matchRoute, routeToPath } from '../demo/router.js';
import { tabDeps } from './support/tabDeps.js';

/**
 * The filter engine every fragrance list uses (demo/listFilters.ts; owner's
 * revamp of 6 Oct 2026: several options at once in a filter, OR within a
 * filter, AND across filters, all of it in the address), on a small list first
 * so the counting rule is shown rather than assumed, then on the real catalogue
 * through the Oils and Sets tabs.
 */
interface Item {
  id: string;
  kind: 'a' | 'b' | 'c';
  tags: string[];
  stocked: boolean;
}

const items: Item[] = [
  { id: '1', kind: 'a', tags: ['x'], stocked: true },
  { id: '2', kind: 'a', tags: ['x', 'y'], stocked: false },
  { id: '3', kind: 'b', tags: ['y'], stocked: true },
  { id: '4', kind: 'b', tags: [], stocked: true },
  { id: '5', kind: 'c', tags: ['x'], stocked: false },
];

const KINDS = [
  { value: 'a', label: 'Kind A' },
  { value: 'b', label: 'Kind B' },
  { value: 'c', label: 'Kind C' },
  { value: 'z', label: 'Kind Z' },
];
const kind: Facet<Item> = { kind: 'select', id: 'kind', label: 'Kind', values: (i) => [i.kind], ...fixedOptions(KINDS) };
const tag: Facet<Item> = {
  kind: 'select', id: 'tag', label: 'Tag', values: (i) => i.tags,
  ...fixedOptions([{ value: 'x', label: 'Tag X' }, { value: 'y', label: 'Tag Y' }]),
};
const stock: Facet<Item> = { kind: 'check', id: 'stock', label: 'In Stock', flag: (i) => i.stocked };
const facets = [kind, tag, stock];

const ids = (list: Item[]) => list.map((i) => i.id);
const view = (sel: Record<string, string[]>, id: string) => facetViews(items, facets, sel).find((v) => v.facet.id === id)!;
const opts = (sel: Record<string, string[]>, id: string) => Object.fromEntries(view(sel, id).options.map((o) => [o.value, o.count]));

describe('filters', () => {
  it('apply every chosen one and nothing else', () => {
    expect(ids(applyFacets(items, facets, {}))).toEqual(['1', '2', '3', '4', '5']);
    expect(ids(applyFacets(items, facets, { kind: ['a'] }))).toEqual(['1', '2']);
    expect(ids(applyFacets(items, facets, { kind: ['a'], stock: ['1'] }))).toEqual(['1']);
    expect(ids(applyFacets(items, facets, { tag: ['x'], stock: ['1'] }))).toEqual(['1']);
    // An empty choice is no choice.
    expect(ids(applyFacets(items, facets, { kind: [] }))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('combine several options of one filter with OR, and filters with AND', () => {
    expect(ids(applyFacets(items, facets, { kind: ['a', 'c'] }))).toEqual(['1', '2', '5']);
    expect(ids(applyFacets(items, facets, { kind: ['a', 'b'], tag: ['y'] }))).toEqual(['2', '3']);
    expect(ids(applyFacets(items, facets, { kind: ['a', 'b', 'c'], stock: ['1'] }))).toEqual(['1', '3', '4']);
    // An item with several values matches when any one is chosen, and one with none matches no option.
    expect(ids(applyFacets(items, facets, { tag: ['x', 'y'] }))).toEqual(['1', '2', '3', '5']);
  });

  it('give the same list in one pass as the plain filter does', () => {
    for (const sel of [{}, { kind: ['a'] }, { kind: ['a', 'b'], tag: ['y'] }, { tag: ['x'], stock: ['1'] }, { kind: ['c'], stock: ['1'] }]) {
      expect(ids(runFacets(items, facets, sel).list)).toEqual(ids(applyFacets(items, facets, sel)));
    }
  });

  it('count each option as the list would hold with that option chosen, leaving its own filter out', () => {
    expect(opts({}, 'kind')).toEqual({ a: 2, b: 2, c: 1 });
    // Choosing kind A leaves kind's own counts alone, so a second kind can be ticked beside it...
    expect(opts({ kind: ['a'] }, 'kind')).toEqual({ a: 2, b: 2, c: 1 });
    expect(opts({ kind: ['a', 'b'] }, 'kind')).toEqual({ a: 2, b: 2, c: 1 });
    // ...and narrows the other filter to what kinds A or B hold.
    expect(opts({ kind: ['a'] }, 'tag')).toEqual({ x: 2, y: 1 });
    expect(opts({ kind: ['a', 'b'] }, 'tag')).toEqual({ x: 2, y: 2 });
    // The yes or no filter counts what it would leave.
    expect(view({ kind: ['a'] }, 'stock').count).toBe(1);
    expect(view({}, 'stock').count).toBe(3);
  });

  it('offer an option only where it would return something, and keep a chosen one at 0 so it can be unticked', () => {
    expect(Object.keys(opts({}, 'kind'))).not.toContain('z');
    expect(opts({ stock: ['1'] }, 'kind')).toEqual({ a: 1, b: 2 });
    // Kind C is chosen, then the box rules it out: it stays, at 0, in its place.
    const v = view({ kind: ['c', 'a'], stock: ['1'] }, 'kind');
    expect(v.options.map((o) => [o.value, o.count])).toEqual([['a', 1], ['b', 2], ['c', 0]]);
    expect(v.chosen).toEqual(['a', 'c']);
  });

  it('offer a filter only with two options to choose between, or a choice made', () => {
    const one: Facet<Item> = { kind: 'select', id: 'one', label: 'One', values: () => ['only'], ...fixedOptions([{ value: 'only', label: 'Only' }]) };
    expect(facetViews(items, [one], {})[0]!.offered).toBe(false);
    expect(facetViews(items, [one], { one: ['only'] })[0]!.offered).toBe(true);
    expect(view({}, 'kind').offered).toBe(true);
  });

  it('offer a yes or no filter only where ticking it would narrow the list', () => {
    expect(view({}, 'stock').offered).toBe(true);
    // Among kind B, every item is stocked: the box would change nothing.
    expect(view({ kind: ['b'] }, 'stock').offered).toBe(false);
    // Ticked, it stays offered so it can be unticked.
    expect(view({ kind: ['b'], stock: ['1'] }, 'stock').offered).toBe(true);
  });

  it('keep an item that fails two filters out of every count', () => {
    const v = facetViews(items, facets, { kind: ['a'], stock: ['1'] });
    expect(v.find((x) => x.facet.id === 'tag')!.options.map((o) => [o.value, o.count])).toEqual([['x', 1]]);
  });

  it('count an item that lists one value twice once', () => {
    const doubled: Facet<Item> = { ...tag, values: (i) => [...i.tags, ...i.tags] } as Facet<Item>;
    expect(Object.fromEntries(facetViews(items, [doubled], {})[0]!.options.map((o) => [o.value, o.count]))).toEqual({ x: 3, y: 2 });
  });

  it('say how many options are chosen, and change one value or one filter at a time', () => {
    expect(chosenCount(facets, { kind: ['a', 'b'], stock: ['1'], other: ['q'] })).toBe(3);
    expect(withValue({ kind: ['a'] }, 'kind', 'b', true)).toEqual({ kind: ['a', 'b'] });
    expect(withValue({ kind: ['a', 'b'] }, 'kind', 'a', false)).toEqual({ kind: ['b'] });
    expect(withValue({ kind: ['a'], tag: ['x'] }, 'kind', 'a', false)).toEqual({ tag: ['x'] });
    expect(withChosen({ kind: ['a'] }, 'tag', ['x', 'x'])).toEqual({ kind: ['a'], tag: ['x'] });
    expect(withChosen({ kind: ['a'] }, 'kind', [])).toEqual({});
  });

  it('carry a filter over to a list of things that hold the item', () => {
    const wrapped = items.map((i) => ({ item: i }));
    const lifted = facets.map((f) => liftFacet<Item, { item: Item }>(f, (w) => w.item));
    expect(runFacets(wrapped, lifted, { kind: ['a', 'c'], stock: ['1'] }).list.map((w) => w.item.id)).toEqual(['1']);
  });
});

describe('a filter of names (Brand, Shop)', () => {
  const labels = new Map([['zed', 'Zed'], ['amber', 'Amber'], ['emile', 'Émile'], ['bee', 'Bee']]);
  const named = namedSelect<{ n: string[] }>('brand', 'Brand', (x) => x.n, () => labels);
  const list = [{ n: ['zed'] }, { n: ['emile'] }, { n: ['amber', 'bee'] }, { n: ['zed'] }];

  it('lists what the list holds in A to Z order of the names, with counts', () => {
    const v = facetViews(list, [named], {})[0]!;
    expect(v.options.map((o) => o.label)).toEqual(['Amber', 'Bee', 'Émile', 'Zed']);
    expect(v.options.find((o) => o.value === 'zed')!.count).toBe(2);
  });

  it('knows only the names it has, and names a chosen one on its chip', () => {
    expect(named.known('amber')).toBe(true);
    expect(named.known('nobody')).toBe(false);
    expect(named.labelOf('emile')).toBe('Émile');
  });
});

describe('search', () => {
  it('needs every word, in any order and anywhere in the text', () => {
    expect(matchesSearch('Rabanne Invictus Gift Set', 'invictus rabanne')).toBe(true);
    expect(matchesSearch('Rabanne Invictus Gift Set', 'rabanne gift')).toBe(true);
    expect(matchesSearch('Rabanne Invictus Gift Set', 'rabanne lady')).toBe(false);
    expect(matchesSearch('anything', '   ')).toBe(true);
  });
});

describe('the address', () => {
  const sorts = ['stocked', 'az', 'za'];

  it('is empty for a list nobody has touched', () => {
    expect(tabToQuery(emptyTabState('stocked'), facets, 'stocked')).toEqual({});
    expect(selToQuery({}, facets)).toEqual({});
  });

  it('carries several values of a filter comma separated, in the filter\'s own order, and reads back to the same state', () => {
    const st = { ...emptyTabState('stocked'), q: ' rabanne ', sort: 'za', sel: { kind: ['c', 'a'], stock: ['1'] } };
    const query = tabToQuery(st, facets, 'stocked');
    expect(query).toEqual({ q: 'rabanne', sort: 'za', kind: 'a,c', stock: '1' });
    const back = tabFromQuery(query, facets, sorts, 'stocked');
    expect(back).toEqual({ q: 'rabanne', sort: 'za', sel: { kind: ['a', 'c'], stock: ['1'] } });
    expect(sameTabState({ ...st, q: 'rabanne' }, back)).toBe(true);
  });

  it('still opens an old address that names one value per filter', () => {
    expect(selFromQuery({ kind: 'b', tag: 'x' }, facets)).toEqual({ kind: ['b'], tag: ['x'] });
  });

  it('drops what the list does not know, value by value, rather than opening an empty list', () => {
    expect(tabFromQuery({ kind: 'nonsense', tag: 'x', stock: 'yes', sort: 'bogus', extra: '1' }, facets, sorts, 'stocked')).toEqual({
      q: '',
      sort: 'stocked',
      sel: { tag: ['x'] },
    });
    expect(selFromQuery({ kind: 'a,nonsense,,b,a' }, facets)).toEqual({ kind: ['a', 'b'] });
  });

  it('puts the lists on ordinary addresses that the router reads back, commas left bare', () => {
    expect(routeToPath({ name: 'sets', param: '', query: { brand: 'rabanne', sort: 'price-low' } })).toBe('/sets?brand=rabanne&sort=price-low');
    expect(routeToPath({ name: 'search', param: '', query: { size: '30-70,70-120', price: '200+' } })).toBe('/search?size=30-70,70-120&price=200%2B');
    const route = matchRoute('/oils', '?q=musk&type=niche,mideast');
    expect(route).toMatchObject({ name: 'oils', param: '', query: { q: 'musk', type: 'niche,mideast' } });
    expect(matchRoute('/search', '?size=30-70%2C70-120').query).toEqual({ size: '30-70,70-120' });
    expect(matchRoute('/gift-sets').name).toBe('sets');
  });

  it('compares selections whatever order their values are in', () => {
    expect(sameSelection({ kind: ['a', 'b'] }, { kind: ['b', 'a'] })).toBe(true);
    expect(sameSelection({ kind: ['a'], tag: [] }, { kind: ['a'] })).toBe(true);
    expect(sameSelection({ kind: ['a'] }, { kind: ['a', 'b'] })).toBe(false);
  });
});

describe('the Oils and Sets tabs on the real catalogue', () => {
  const tabs = createTabs(tabDeps());
  const sets = DEMO_FRAGRANCES.filter((f) => f.giftSet !== null);
  const oils = DEMO_FRAGRANCES.filter((f) => f.giftSet === null && isOilStrength(f.concentration));

  it('list every set on Sets and every oil on Oils, and never a bottle', () => {
    tabs.reset('sets');
    tabs.reset('oils');
    const s = tabs.listOf('sets');
    const o = tabs.listOf('oils');
    expect(s.length).toBe(sets.length);
    expect(o.length).toBe(oils.length);
    expect(s.every(isSet)).toBe(true);
    expect(o.every(isOil)).toBe(true);
    expect(new Set([...s, ...o].map((f) => f.id)).size).toBe(s.length + o.length);
    expect(s.length).toBeGreaterThan(1000);
    expect(o.length).toBeGreaterThan(100);
  });

  it('start with the most stocked, which is the order the catalogue arrives in', () => {
    tabs.reset('sets');
    const s = tabs.listOf('sets');
    for (let i = 1; i < s.length; i++) expect(s[i - 1]!.popularity).toBeGreaterThanOrEqual(s[i]!.popularity);
  });

  it('search only within themselves', () => {
    tabs.reset('sets');
    tabs.reset('oils');
    tabs.setQuery('sets', 'rabanne');
    tabs.setQuery('oils', 'rabanne');
    const s = tabs.listOf('sets');
    expect(s.length).toBeGreaterThan(10);
    expect(s.every((f) => isSet(f) && /rabanne/i.test(`${f.brand} ${f.name}`))).toBe(true);
    expect(tabs.listOf('oils')).toEqual([]);
    tabs.setQuery('sets', 'zzzzzzzz');
    expect(tabs.listOf('sets')).toEqual([]);
    expect(tabs.panel('sets')).toContain('<p>No set matches that.</p>');
  });

  it('sort by price both ways, and by name, with the same rule as every other list', () => {
    tabs.reset('oils');
    tabs.setSort('oils', 'price-low');
    expect(tabs.listOf('oils').map((f) => f.id)).toEqual(sortFragrances(oils, 'price-low').map((f) => f.id));
    tabs.setSort('oils', 'price-high');
    expect(tabs.listOf('oils').map((f) => f.id)).toEqual(sortFragrances(oils, 'price-high').map((f) => f.id));
    tabs.setSort('oils', 'az');
    expect(tabs.listOf('oils').map((f) => f.id)).toEqual(sortFragrances(oils, 'az').map((f) => f.id));
    // A sort the tab does not offer is the default.
    tabs.setSort('oils', 'items-high');
    expect(tabs.state('oils').sort).toBe('stocked');
  });

  it('filter on several options at once, put the choice in the address, and take it back from there', () => {
    tabs.reset('sets');
    tabs.setFacet('sets', 'type', ['niche', 'mideast']);
    const want = sets.filter((f: DemoFragrance) => f.tier === 'niche' || f.tier === 'mideast');
    expect(want.length).toBeGreaterThan(0);
    expect(tabs.listOf('sets').map((f) => f.id).sort()).toEqual(want.map((f) => f.id).sort());
    const q = tabs.query('sets');
    expect(q).toEqual({ type: 'niche,mideast' });
    tabs.reset('sets');
    expect(tabs.listOf('sets').length).toBe(sets.length);
    tabs.fromQuery('sets', q);
    expect(tabs.listOf('sets').length).toBe(want.length);
    // One value, the way addresses were before 6 Oct 2026, still works.
    tabs.fromQuery('sets', { type: 'niche' });
    expect(tabs.state('sets').sel).toEqual({ type: ['niche'] });
    tabs.setFacet('sets', 'type', '');
    expect(tabs.state('sets').sel).toEqual({});
  });

  it('keep each tab\'s state apart, and snapshot and restore it for Back, from this build or an older one', () => {
    tabs.reset('sets');
    tabs.reset('oils');
    tabs.setSort('sets', 'za');
    tabs.setFacet('oils', 'type', ['mideast', 'niche']);
    const snap = tabs.snapshot();
    tabs.reset('sets');
    tabs.reset('oils');
    tabs.restore(snap);
    expect(tabs.state('sets').sort).toBe('za');
    expect(tabs.state('oils').sel).toEqual({ type: ['niche', 'mideast'] });
    expect(tabs.state('sets').sel).toEqual({});
    // An entry an older build saved holds one value per filter, a panel flag, and may name what this build does not offer.
    tabs.restore({ sets: { q: '', sort: 'gone', sel: { nope: 'x', type: 'designer' }, open: true } as never });
    expect(tabs.state('sets')).toEqual({ q: '', sort: 'stocked', sel: { type: ['designer'] } });
  });

  it('draw the sort through the page\'s sort control, a search box that names its tab, and the shared Filters controls', () => {
    tabs.reset('sets');
    const html = tabs.panel('sets');
    expect(html).toContain('id="tab-sort"');
    expect(html).toContain('id="tab-search"');
    expect(html).toContain('aria-label="Search Sets"');
    expect(html).toContain(`<span class="count t-count">${sets.length}</span>`);
    expect(html).toMatch(/compared only with the same set at another shop, never with a single bottle/);
    expect(html).toContain('data-facets-toggle');
    expect(tabs.panel('oils')).toContain('aria-label="Search Oils"');
    // Wording rules: no hyphen or dash in what is read.
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/[-‐-―−]/);
  });

  it('hand the panel a count of what the list holds and the right word for it', () => {
    tabs.reset('oils');
    tabs.setFacet('oils', 'type', 'niche');
    const ctx = tabs.filterContext('oils');
    expect(ctx.matched).toBe(tabs.listOf('oils').length);
    expect(ctx.noun).toEqual(['Oil', 'Oils']);
    ctx.set('type', []);
    expect(tabs.state('oils').sel).toEqual({});
    tabs.setFacet('oils', 'type', 'niche');
    ctx.clear();
    expect(tabs.state('oils').sel).toEqual({});
  });
});

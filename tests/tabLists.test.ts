import { describe, expect, it } from 'vitest';
import { DEMO_FRAGRANCES, type DemoFragrance } from '../demo/data.js';
import { sortFragrances } from '../demo/listSort.js';
import { isOil, isSet } from '../demo/productKind.js';
import {
  applyFacets,
  emptyTabState,
  facetViews,
  fixedOptions,
  matchesSearch,
  sameTabState,
  tabFromQuery,
  tabToQuery,
  type Facet,
} from '../demo/tabLists.js';
import { createTabs } from '../demo/tabPanels.js';
import { matchRoute, routeToPath } from '../demo/router.js';

/**
 * The filters, search and address of the Explore Oils and Sets tabs, on a small
 * list first (so the counting rule is shown, not assumed) and then on the real
 * catalogue.
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
const kind: Facet<Item> = {
  kind: 'select', id: 'kind', label: 'Kind', any: 'Any Kind', values: (i) => [i.kind], ...fixedOptions(KINDS),
};
const tag: Facet<Item> = {
  kind: 'select', id: 'tag', label: 'Tag', any: 'Any Tag', values: (i) => i.tags,
  ...fixedOptions([{ value: 'x', label: 'Tag X' }, { value: 'y', label: 'Tag Y' }]),
};
const stock: Facet<Item> = { kind: 'check', id: 'stock', label: 'In Stock', flag: (i) => i.stocked };
const facets = [kind, tag, stock];

const opts = (sel: Record<string, string>, id: string) =>
  Object.fromEntries(facetViews(items, facets, sel).find((v) => v.facet.id === id)!.options.map((o) => [o.value, o.count]));

describe('filters', () => {
  it('apply every chosen one and nothing else', () => {
    expect(applyFacets(items, facets, {}).map((i) => i.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(applyFacets(items, facets, { kind: 'a' }).map((i) => i.id)).toEqual(['1', '2']);
    expect(applyFacets(items, facets, { kind: 'a', stock: '1' }).map((i) => i.id)).toEqual(['1']);
    expect(applyFacets(items, facets, { tag: 'x', stock: '1' }).map((i) => i.id)).toEqual(['1']);
  });

  it('match an item with several values on any of them, and one with none on no option', () => {
    expect(applyFacets(items, facets, { tag: 'y' }).map((i) => i.id)).toEqual(['2', '3']);
    expect(applyFacets(items, facets, { tag: 'x' }).map((i) => i.id)).toEqual(['1', '2', '5']);
    expect(opts({}, 'tag')).toEqual({ x: 3, y: 2 });
  });

  it('count each option as the list would hold if it were chosen, leaving the dropdown\'s own choice out', () => {
    // Nothing chosen: every option's own size.
    expect(opts({}, 'kind')).toEqual({ a: 2, b: 2, c: 1 });
    // Choosing kind A leaves kind's own counts alone, so a second kind can still be chosen...
    expect(opts({ kind: 'a' }, 'kind')).toEqual({ a: 2, b: 2, c: 1 });
    // ...and narrows the other dropdown to what kind A holds.
    expect(opts({ kind: 'a' }, 'tag')).toEqual({ x: 2, y: 1 });
    // The checkbox counts what it would leave.
    expect(facetViews(items, facets, { kind: 'a' }).find((v) => v.facet.id === 'stock')!.count).toBe(1);
    expect(facetViews(items, facets, {}).find((v) => v.facet.id === 'stock')!.count).toBe(3);
  });

  it('offer an option only where it would return something', () => {
    // "Kind Z" is a known option nothing holds.
    expect(Object.keys(opts({}, 'kind'))).not.toContain('z');
    // With the checkbox ticked, kind C (not stocked) drops out; the others stay.
    expect(opts({ stock: '1' }, 'kind')).toEqual({ a: 1, b: 2 });
  });

  it('keep an item that fails two filters out of every count', () => {
    // Item 5 is kind C and not stocked: with both chosen it fails two, so it counts nowhere.
    const v = facetViews(items, facets, { kind: 'a', stock: '1' });
    expect(v.find((x) => x.facet.id === 'tag')!.options.map((o) => [o.value, o.count])).toEqual([['x', 1]]);
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

  it('is empty for a tab nobody has touched', () => {
    expect(tabToQuery(emptyTabState('stocked'), facets, 'stocked')).toEqual({});
  });

  it('carries what was chosen and reads back to the same state', () => {
    const st = { ...emptyTabState('stocked'), q: ' rabanne ', sort: 'za', sel: { kind: 'b', stock: '1' } };
    const query = tabToQuery(st, facets, 'stocked');
    expect(query).toEqual({ q: 'rabanne', sort: 'za', kind: 'b', stock: '1' });
    const back = tabFromQuery(query, facets, sorts, 'stocked');
    expect(back).toEqual({ q: 'rabanne', sort: 'za', sel: { kind: 'b', stock: '1' } });
    expect(sameTabState({ ...st, q: 'rabanne' }, back)).toBe(true);
  });

  it('drops what the tab does not know, rather than opening an empty list', () => {
    const back = tabFromQuery({ kind: 'nonsense', tag: 'x', stock: 'yes', sort: 'bogus', extra: '1' }, facets, sorts, 'stocked');
    expect(back).toEqual({ q: '', sort: 'stocked', sel: { tag: 'x' } });
  });

  it('puts the tabs on ordinary addresses that the router reads back', () => {
    expect(routeToPath({ name: 'sets', param: '', query: { brand: 'rabanne', sort: 'price-low' } })).toBe('/sets?brand=rabanne&sort=price-low');
    const route = matchRoute('/oils', '?q=musk&type=niche');
    expect(route).toMatchObject({ name: 'oils', param: '', query: { q: 'musk', type: 'niche' } });
    expect(matchRoute('/gift-sets').name).toBe('sets');
  });

  it('does not count the panel being open as a difference', () => {
    expect(sameTabState({ q: '', sort: 'stocked', sel: {}, open: true }, { q: '', sort: 'stocked', sel: {} })).toBe(true);
    expect(sameTabState({ q: '', sort: 'az', sel: {}, open: true }, { q: '', sort: 'stocked', sel: {} })).toBe(false);
    expect(sameTabState({ q: '', sort: 'stocked', sel: { a: '1' }, open: false }, { q: '', sort: 'stocked', sel: { a: '2' } })).toBe(false);
  });
});

describe('the Oils and Sets tabs on the real catalogue', () => {
  const tabs = createTabs({
    attrs: (f) => ({ concentration: 'edp', gender: 'notStated', tier: f.tier, priceBand: null, inStock: true }),
    concentrationOptions: [{ value: 'edp', label: 'Eau de Parfum (EDP)' }],
    genderOptions: [{ value: 'notStated', label: 'Not Stated' }],
    priceOptions: [{ value: '0-25', label: 'Under £25' }],
    tierOptions: [{ value: 'designer', label: 'Designer' }, { value: 'niche', label: 'Niche' }, { value: 'mideast', label: 'Middle East' }],
    fragranceList: (list, empty) => (list.length ? `<ul>${list.length}</ul>` : `<p>${empty}</p>`),
    sortControl: (id, subject, options, current) => `<select id="${id}" data-subject="${subject}">${options.map((o) => `<option value="${o.value}"${o.value === current ? ' selected' : ''}>${o.label}</option>`).join('')}</select>`,
    listControls: (sort, ui) => `${sort}${ui.toggle}${ui.panel}`,
    esc: (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    iconFilter: '<i/>',
    iconChevron: '<i/>',
  });

  const sets = DEMO_FRAGRANCES.filter((f) => f.giftSet !== null);
  const oils = DEMO_FRAGRANCES.filter((f) => f.giftSet === null && f.concentration === 'Perfume Oil');

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
    tabs.setSort('oils', 'size-low');
    expect(tabs.state('oils').sort).toBe('stocked');
  });

  it('filter, put the choice in the address, and take it back from there', () => {
    tabs.reset('sets');
    tabs.setFacet('sets', 'type', 'niche');
    const niche = sets.filter((f: DemoFragrance) => f.tier === 'niche');
    expect(niche.length).toBeGreaterThan(0);
    expect(tabs.listOf('sets').map((f) => f.id).sort()).toEqual(niche.map((f) => f.id).sort());
    const q = tabs.query('sets');
    expect(q).toEqual({ type: 'niche' });
    tabs.reset('sets');
    expect(tabs.listOf('sets').length).toBe(sets.length);
    tabs.fromQuery('sets', q);
    expect(tabs.listOf('sets').length).toBe(niche.length);
    // A filter in a shared link opens the panel; the same address again leaves it as the reader has it.
    expect(tabs.state('sets').open).toBe(true);
    tabs.toggleOpen('sets');
    tabs.fromQuery('sets', q);
    expect(tabs.state('sets').open).toBe(false);
  });

  it('keep each tab\'s state apart, and snapshot and restore it for Back', () => {
    tabs.reset('sets');
    tabs.reset('oils');
    tabs.setSort('sets', 'za');
    tabs.setFacet('oils', 'type', 'mideast');
    tabs.toggleOpen('oils');
    const snap = tabs.snapshot();
    tabs.reset('sets');
    tabs.reset('oils');
    tabs.restore(snap);
    expect(tabs.state('sets').sort).toBe('za');
    expect(tabs.state('oils').sel).toEqual({ type: 'mideast' });
    expect(tabs.state('oils').open).toBe(true);
    expect(tabs.state('sets').sel).toEqual({});
    // An old entry naming something this build does not offer brings back only what exists.
    tabs.restore({ sets: { q: '', sort: 'gone', sel: { nope: 'x', type: 'designer' }, open: false } });
    expect(tabs.state('sets')).toMatchObject({ sort: 'stocked', sel: { type: 'designer' } });
  });

  it('draw the sort through the page\'s sort control and a search box that names its tab', () => {
    tabs.reset('sets');
    const html = tabs.panel('sets');
    expect(html).toContain('id="tab-sort"');
    expect(html).toContain('id="tab-search"');
    expect(html).toContain('aria-label="Search Sets"');
    expect(html).toContain(`<span class="count t-count">${sets.length}</span>`);
    expect(html).toMatch(/compared only with the same set at another shop, never with a single bottle/);
    expect(tabs.panel('oils')).toContain('aria-label="Search Oils"');
    // Wording rules: no hyphen or dash in what is read.
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/[-‐-―−]/);
  });
});

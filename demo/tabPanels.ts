import type { DemoFragrance } from './data.js';
import { BY_POPULARITY, shopIdsOf, shopNameOf } from './data.js';
import type { FilterContext } from './filterUi.js';
import { OIL_SORT_OPTIONS, SET_SORT_OPTIONS, sortTab, type SortOption, type TabSort } from './listSort.js';
import { isOil, isSet } from './productKind.js';
import {
  MAIN_BOTTLE_BANDS,
  OIL_FORMAT_OPTIONS,
  OIL_SIZE_BANDS,
  oilSizeBand,
  SET_BOX_OPTIONS,
  SET_KIND_OPTIONS,
  mainBottleBand,
  setBoxValues,
  setKindOf,
  slugOf,
} from './tabFacets.js';
import {
  emptyTabState,
  fixedOptions,
  matchesSearch,
  namedSelect,
  runFacets,
  sameTabState,
  tabFromQuery,
  tabToQuery,
  withChosen,
  type Facet,
  type FacetView,
  type Option,
  type SelectFacet,
  type TabListState,
} from './listFilters.js';

/**
 * The Explore Oils and Sets tabs (docs/GIFT-SETS-AND-OILS-PLAN.md): what each
 * draws, and the state it keeps (a search, a sort, filters), which lives in the
 * address so a filtered list can be shared.
 *
 * Returns markup and holds state; touches no document, so a test can draw a tab
 * in Node. demo/app.ts owns the page, the events and the parts every list shares
 * (the tile grid, the sort control, the Filters button, its chips and its
 * panel), and hands them in.
 */

export type TabKind = 'oils' | 'sets';
export const TAB_KINDS: readonly TabKind[] = ['oils', 'sets'];
export const isTabKind = (x: string): x is TabKind => x === 'oils' || x === 'sets';

/** What the page hands in. Kept to the things that need the page's own data or markup. */
export interface TabDeps {
  /** The attributes the shared filters read off a product (the page caches them per minute). */
  attrs(f: DemoFragrance): { concentration: string; gender: string; tier: string; priceBand: string | null; inStock: boolean };
  concentrationOptions: readonly Option[];
  genderOptions: readonly Option[];
  priceOptions: readonly Option[];
  tierOptions: readonly Option[];
  fragranceList(list: DemoFragrance[], empty: string): string;
  /** The "Sort By:" dropdown, built by the one sort building function. */
  sortControl(id: string, subject: string, options: readonly Option[], current: string): string;
  /** The controls row: sort, the Filters button, then the tiles per row chooser; the chips under it. */
  listControls(sort: string, ui: { toggle: string; panel: string }): string;
  /** The Filters button and the chips for a list, the same on every list (demo/filterUi.ts). */
  filterControls(ctx: FilterContext<DemoFragrance>): { toggle: string; panel: string };
  esc(s: string): string;
}

interface TabSpec {
  title: string;
  /** "Search Sets", and what a screen reader calls the box. */
  searchLabel: string;
  note: string;
  empty: string;
  /** What the list is of, one and several, for the panel's Show button. */
  noun: readonly [string, string];
  sorts: readonly SortOption<TabSort>[];
  facets: readonly Facet<DemoFragrance>[];
  items(): DemoFragrance[];
}

export const TAB_SORT_ID = 'tab-sort';
export const TAB_SEARCH_ID = 'tab-search';

const DEFAULT_SORT = 'stocked';

const GENDER_NOTE = 'Gender is read from wording in the title, such as Pour Homme or For Her. Not Stated is not the same as Unisex.';
const OIL_STATED_NOTE = 'Roll On, Dropper and Alcohol Free are only what a shop says about an oil. An oil that says nothing is not claimed to be anything else.';

/** Built once, the first time a tab is opened: the first load never pays for it. */
const itemsCache: Partial<Record<TabKind, DemoFragrance[]>> = {};
function itemsOf(kind: TabKind): DemoFragrance[] {
  return (itemsCache[kind] ??= BY_POPULARITY.filter(kind === 'sets' ? isSet : isOil));
}

export function createTabs(deps: TabDeps) {
  const select = (
    id: string,
    label: string,
    options: readonly Option[],
    value: (f: DemoFragrance) => string | null,
  ): SelectFacet<DemoFragrance> => ({
    kind: 'select',
    id,
    label,
    values: (f) => {
      const v = value(f);
      return v === null ? [] : [v];
    },
    ...fixedOptions(options),
  });

  const concentration = select('strength', 'Concentration', deps.concentrationOptions, (f) => deps.attrs(f).concentration);
  const gender = select('gender', 'Gender', deps.genderOptions, (f) => deps.attrs(f).gender);
  const price = select('price', 'Price', deps.priceOptions, (f) => deps.attrs(f).priceBand);
  const type = select('type', 'Brand Type', deps.tierOptions, (f) => deps.attrs(f).tier);
  const inStock: Facet<DemoFragrance> = { kind: 'check', id: 'stock', label: 'In Stock', flag: (f) => deps.attrs(f).inStock };

  /** Brand and Shop name whatever the list holds, so their labels come from the whole of it, read once. */
  const labelsCache: Record<string, Map<string, string>> = {};
  const labelsOf = (kind: TabKind, which: 'brand' | 'shop'): (() => ReadonlyMap<string, string>) => () =>
    (labelsCache[`${kind}-${which}`] ??= new Map(
      itemsOf(kind).flatMap((f): [string, string][] =>
        which === 'brand' ? [[slugOf(f.brand), f.brand]] : shopIdsOf(f.id).map((id): [string, string] => [id, shopNameOf(id)]),
      ),
    ));
  // A filter change runs every item through every filter, so what an item answers is kept: a
  // brand's address form for good, the shops that list it for the minute (an offer can age out).
  const brandSlugs = new Map<string, string[]>();
  const brandValues = (f: DemoFragrance): string[] => {
    let v = brandSlugs.get(f.brand);
    if (!v) brandSlugs.set(f.brand, (v = [slugOf(f.brand)]));
    return v;
  };
  const shopsByItem = new Map<string, string[]>();
  let shopsMinute = -1;
  const shopValues = (f: DemoFragrance): string[] => {
    const minute = Math.floor(Date.now() / 60_000);
    if (minute !== shopsMinute) {
      shopsByItem.clear();
      shopsMinute = minute;
    }
    let v = shopsByItem.get(f.id);
    if (!v) shopsByItem.set(f.id, (v = shopIdsOf(f.id)));
    return v;
  };
  const brandFacet = (kind: TabKind) => namedSelect<DemoFragrance>('brand', 'Brand', brandValues, labelsOf(kind, 'brand'));
  const shopFacet = (kind: TabKind) => namedSelect<DemoFragrance>('shop', 'Shop', shopValues, labelsOf(kind, 'shop'));

  const setKind = select('kind', 'Kind', SET_KIND_OPTIONS, (f) => setKindOf(f));
  const inTheBox: SelectFacet<DemoFragrance> = {
    kind: 'select',
    id: 'box',
    label: 'In the Box',
    values: (f) => setBoxValues(f),
    ...fixedOptions(SET_BOX_OPTIONS),
  };
  const mainBottle = select('main', 'Main Bottle', MAIN_BOTTLE_BANDS, (f) => mainBottleBand(f.giftSet?.mainMl));

  const oilSize = select('size', 'Size', OIL_SIZE_BANDS, (f) => oilSizeBand(f.sizeMl));
  const oilFormat = select('format', 'Format', OIL_FORMAT_OPTIONS, (f) => f.oil?.format ?? null);
  const alcoholFree: Facet<DemoFragrance> = { kind: 'check', id: 'alcohol', label: 'Alcohol Free', flag: (f) => f.oil?.alcoholFree === true };

  const specs: Record<TabKind, TabSpec> = {
    sets: {
      title: 'Sets',
      searchLabel: 'Sets',
      note:
        'Gift sets, miniature and discovery sets, and bundles of full size bottles. A set is compared only with the same set at another shop, never with a single bottle.',
      empty: 'No set matches that.',
      noun: ['Set', 'Sets'],
      sorts: SET_SORT_OPTIONS,
      facets: [setKind, inTheBox, mainBottle, price, concentration, gender, type, brandFacet('sets'), shopFacet('sets'), inStock],
      items: () => itemsOf('sets'),
    },
    oils: {
      title: 'Oils',
      searchLabel: 'Oils',
      note:
        'Perfume oils, sold in small bottles and rollers rather than sprays. An oil is compared only with the same oil at another shop, never with a spray.',
      empty: 'No oil matches that.',
      noun: ['Oil', 'Oils'],
      sorts: OIL_SORT_OPTIONS,
      facets: [oilSize, oilFormat, price, gender, type, brandFacet('oils'), shopFacet('oils'), alcoholFree, inStock],
      items: () => itemsOf('oils'),
    },
  };

  const states: Record<TabKind, TabListState> = {
    oils: emptyTabState(DEFAULT_SORT),
    sets: emptyTabState(DEFAULT_SORT),
  };

  const sortValues = (kind: TabKind): string[] => specs[kind].sorts.map((o) => o.value);

  /** A tab's own list, with its search, filters and sort applied, and every filter's options and counts. */
  function listOf(kind: TabKind): { list: DemoFragrance[]; views: FacetView<DemoFragrance>[] } {
    const spec = specs[kind];
    const st = states[kind];
    const all = spec.items();
    const searched = st.q.trim() ? all.filter((f) => matchesSearch(`${f.brand} ${f.name} ${f.concentration}`, st.q)) : all;
    const { list: faceted, views } = runFacets(searched, spec.facets, st.sel);
    const list = st.sort === DEFAULT_SORT ? faceted : sortTab(faceted, st.sort as TabSort);
    return { list, views };
  }

  /** The sentences the panel shows under a filter, where that filter is offered. */
  function notesFor(kind: TabKind, views: FacetView<DemoFragrance>[]): Record<string, string> {
    const offered = (id: string) => views.some((v) => v.facet.id === id && v.offered);
    const notes: Record<string, string> = {};
    if (offered('gender')) notes.gender = GENDER_NOTE;
    if (kind === 'oils') {
      if (offered('format')) notes.format = OIL_STATED_NOTE;
      else if (offered('alcohol')) notes.alcohol = OIL_STATED_NOTE;
    }
    return notes;
  }

  function contextOf(kind: TabKind, views: FacetView<DemoFragrance>[], matched: number): FilterContext<DemoFragrance> {
    const spec = specs[kind];
    return {
      facets: spec.facets,
      views,
      sel: states[kind].sel,
      matched,
      noun: spec.noun,
      notes: notesFor(kind, views),
      set: (id, values) => {
        states[kind].sel = withChosen(states[kind].sel, id, values);
      },
      clear: () => {
        states[kind].sel = {};
      },
    };
  }

  /** A tab: its heading with the count of what is listed, its note, its own search box, its controls and its list. */
  function panel(kind: TabKind): string {
    const spec = specs[kind];
    const st = states[kind];
    const { list, views } = listOf(kind);
    const sort = deps.sortControl(TAB_SORT_ID, spec.title, spec.sorts, st.sort);
    return `<div class="page-head"><h1 class="t-page">${deps.esc(spec.title)}</h1><span class="count t-count">${list.length}</span></div>
    <p class="panel-note t-body">${deps.esc(spec.note)}</p>
    <div role="search" class="tab-search" aria-label="Search within ${deps.esc(spec.searchLabel)}">
      <input type="search" id="${TAB_SEARCH_ID}" placeholder="Search ${deps.esc(spec.searchLabel)}" aria-label="Search ${deps.esc(spec.searchLabel)}" value="${deps.esc(st.q)}" autocomplete="off" enterkeyhint="search" />
    </div>
    ${deps.listControls(sort, deps.filterControls(contextOf(kind, views, list.length)))}
    ${deps.fragranceList(list, spec.empty)}`;
  }

  return {
    panel,
    /** The tab's list as drawn, for the page's own use (and for tests). */
    listOf: (kind: TabKind) => listOf(kind).list,
    /** Every filter's options and counts as the page draws them, for tests. */
    views: (kind: TabKind): FacetView<DemoFragrance>[] => listOf(kind).views,
    /** What the tab's Filters panel draws from, for tests. */
    filterContext: (kind: TabKind): FilterContext<DemoFragrance> => {
      const { list, views } = listOf(kind);
      return contextOf(kind, views, list.length);
    },
    state: (kind: TabKind): Readonly<TabListState> => states[kind],
    specOf: (kind: TabKind) => specs[kind],

    /** A fresh visit: nothing searched, nothing chosen, the default order. */
    reset(kind: TabKind): void {
      states[kind] = emptyTabState(DEFAULT_SORT);
    },
    setQuery(kind: TabKind, q: string): void {
      states[kind].q = q;
    },
    setSort(kind: TabKind, sort: string): void {
      states[kind].sort = sortValues(kind).includes(sort) ? sort : DEFAULT_SORT;
    },
    /** Chooses a filter's options (one value, or several); an empty value or list clears it. */
    setFacet(kind: TabKind, id: string, values: string | readonly string[]): void {
      const list = typeof values === 'string' ? (values === '' ? [] : [values]) : values;
      states[kind].sel = withChosen(states[kind].sel, id, list);
    },
    clearFilters(kind: TabKind): void {
      states[kind].sel = {};
    },

    /** The address's query for a tab. */
    query: (kind: TabKind): Record<string, string> => tabToQuery(states[kind], specs[kind].facets, DEFAULT_SORT),
    /** Takes a tab's state from an address (a shared link, a typed address, Back). */
    fromQuery(kind: TabKind, query: Readonly<Record<string, string>>): void {
      const read = tabFromQuery(query, specs[kind].facets, sortValues(kind), DEFAULT_SORT);
      if (sameTabState(states[kind], read)) return;
      states[kind] = read;
    },

    /** Both tabs' states for the history entry, and back again. */
    snapshot(): Record<TabKind, TabListState> {
      const copy = (s: TabListState): TabListState => ({ q: s.q, sort: s.sort, sel: Object.fromEntries(Object.entries(s.sel).map(([k, v]) => [k, [...v]])) });
      return { oils: copy(states.oils), sets: copy(states.sets) };
    },
    restore(saved: Partial<Record<TabKind, { q?: unknown; sort?: unknown; sel?: unknown }>> | undefined): void {
      for (const kind of TAB_KINDS) {
        const s = saved?.[kind];
        if (!s) continue;
        // An entry saved by an older build may name a filter or a sort this one
        // does not offer, or hold one value per filter where this one holds a
        // list: only what still exists comes back.
        const query: Record<string, string> = {};
        for (const [k, v] of Object.entries((s.sel ?? {}) as Record<string, unknown>)) {
          query[k] = Array.isArray(v) ? v.map(String).join(',') : String(v);
        }
        if (typeof s.q === 'string') query.q = s.q;
        if (typeof s.sort === 'string') query.sort = s.sort;
        states[kind] = tabFromQuery(query, specs[kind].facets, sortValues(kind), DEFAULT_SORT);
      }
    },
  };
}

export type Tabs = ReturnType<typeof createTabs>;

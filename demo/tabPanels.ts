import type { DemoFragrance } from './data.js';
import { BY_POPULARITY, shopIdsOf, shopNameOf } from './data.js';
import { OIL_SORT_OPTIONS, SET_SORT_OPTIONS, sortTab, type SortOption, type TabSort } from './listSort.js';
import { isOil, isSet } from './productKind.js';
import {
  MAIN_BOTTLE_BANDS,
  SET_BOX_OPTIONS,
  SET_KIND_OPTIONS,
  mainBottleBand,
  namedSelect,
  setBoxValues,
  setKindOf,
  slugOf,
} from './tabFacets.js';
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
  type FacetView,
  type Option,
  type SelectFacet,
  type TabListState,
} from './tabLists.js';

/**
 * The Explore Oils and Sets tabs (docs/GIFT-SETS-AND-OILS-PLAN.md): what each
 * draws, and the state it keeps (a search, a sort, filters), which lives in the
 * address so a filtered list can be shared.
 *
 * Returns markup and holds state; touches no document, so a test can draw a tab
 * in Node. demo/app.ts owns the page, the events and the parts every list shares
 * (the tile grid, the sort control, the Filters toggle), and hands them in.
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
  /** The controls row: sort, the Filters toggle, then the tiles per row chooser. */
  listControls(sort: string, ui: { toggle: string; panel: string }): string;
  esc(s: string): string;
  iconFilter: string;
  iconChevron: string;
}

interface TabSpec {
  title: string;
  /** "Search Sets", and what a screen reader calls the box. */
  searchLabel: string;
  note: string;
  empty: string;
  sorts: readonly SortOption<TabSort>[];
  facets: readonly Facet<DemoFragrance>[];
  items(): DemoFragrance[];
}

/** The select facet's id as the dropdown carries it on the page. */
export const facetSelectId = (id: string): string => `tab-facet-${id}`;
export const TAB_SORT_ID = 'tab-sort';
export const TAB_SEARCH_ID = 'tab-search';

const DEFAULT_SORT = 'stocked';

/** Built once, the first time a tab is opened: the first load never pays for it. */
const itemsCache: Partial<Record<TabKind, DemoFragrance[]>> = {};
function itemsOf(kind: TabKind): DemoFragrance[] {
  return (itemsCache[kind] ??= BY_POPULARITY.filter(kind === 'sets' ? isSet : isOil));
}

export function createTabs(deps: TabDeps) {
  const select = (
    id: string,
    label: string,
    any: string,
    options: readonly Option[],
    value: (f: DemoFragrance) => string | null,
  ): SelectFacet<DemoFragrance> => ({
    kind: 'select',
    id,
    label,
    any,
    values: (f) => {
      const v = value(f);
      return v === null ? [] : [v];
    },
    ...fixedOptions(options),
  });

  const concentration = select('strength', 'Concentration', 'Any Concentration', deps.concentrationOptions, (f) => deps.attrs(f).concentration);
  const gender = select('gender', 'Gender', 'Any Gender', deps.genderOptions, (f) => deps.attrs(f).gender);
  const price = select('price', 'Price', 'Any Price', deps.priceOptions, (f) => deps.attrs(f).priceBand);
  const type = select('type', 'Brand Type', 'Any Brand Type', deps.tierOptions, (f) => deps.attrs(f).tier);
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
  const brandFacet = (kind: TabKind) => namedSelect<DemoFragrance>('brand', 'Brand', 'Any Brand', brandValues, labelsOf(kind, 'brand'));
  const shopFacet = (kind: TabKind) => namedSelect<DemoFragrance>('shop', 'Shop', 'Any Shop', shopValues, labelsOf(kind, 'shop'));

  const setKind = select('kind', 'Kind', 'Any Kind', SET_KIND_OPTIONS, (f) => setKindOf(f));
  const inTheBox: SelectFacet<DemoFragrance> = {
    kind: 'select',
    id: 'box',
    label: 'In the Box',
    any: 'Anything in the Box',
    values: (f) => setBoxValues(f),
    ...fixedOptions(SET_BOX_OPTIONS),
  };
  const mainBottle = select('main', 'Main Bottle', 'Any Main Bottle', MAIN_BOTTLE_BANDS, (f) => mainBottleBand(f.giftSet?.mainMl));

  const specs: Record<TabKind, TabSpec> = {
    sets: {
      title: 'Sets',
      searchLabel: 'Sets',
      note:
        'Gift sets, miniature and discovery sets, and bundles of full size bottles. A set is compared only with the same set at another shop, never with a single bottle.',
      empty: 'No set matches that.',
      sorts: SET_SORT_OPTIONS,
      facets: [setKind, inTheBox, mainBottle, brandFacet('sets'), concentration, gender, price, type, shopFacet('sets'), inStock],
      items: () => itemsOf('sets'),
    },
    oils: {
      title: 'Oils',
      searchLabel: 'Oils',
      note:
        'Perfume oils, sold in small bottles and rollers rather than sprays. An oil is compared only with the same oil at another shop, never with a spray.',
      empty: 'No oil matches that.',
      sorts: OIL_SORT_OPTIONS,
      facets: [gender, price, type, inStock],
      items: () => itemsOf('oils'),
    },
  };

  const states: Record<TabKind, TabListState> = {
    oils: emptyTabState(DEFAULT_SORT),
    sets: emptyTabState(DEFAULT_SORT),
  };

  const sortValues = (kind: TabKind): string[] => specs[kind].sorts.map((o) => o.value);

  /** A tab's own list, with its search, filters and sort applied. */
  function listOf(kind: TabKind): { list: DemoFragrance[]; views: FacetView<DemoFragrance>[]; searched: DemoFragrance[] } {
    const spec = specs[kind];
    const st = states[kind];
    const all = spec.items();
    const searched = st.q.trim() ? all.filter((f) => matchesSearch(`${f.brand} ${f.name} ${f.concentration}`, st.q)) : all;
    const views = facetViews(searched, spec.facets, st.sel);
    const faceted = applyFacets(searched, spec.facets, st.sel);
    const list = st.sort === DEFAULT_SORT ? faceted : sortTab(faceted, st.sort as TabSort);
    return { list, views, searched };
  }

  function selectControl(v: FacetView<DemoFragrance>): string {
    const f = v.facet as SelectFacet<DemoFragrance>;
    const current = v.chosen;
    // A chosen value whose count has fallen to nothing stays in the list at 0:
    // leaving it out would make the dropdown read "Any" while the filter applied.
    const shown =
      current !== undefined && !v.options.some((o) => o.value === current)
        ? [...v.options, { value: current, label: current, count: 0 }]
        : v.options;
    if (shown.length < 2 && current === undefined) return '';
    return `<label class="control facet-control">
    <span class="sr">${deps.esc(f.label)}</span>
    <select id="${facetSelectId(f.id)}" class="dropdown">
      <option value="">${deps.esc(f.any)}</option>
      ${shown.map((o) => `<option value="${deps.esc(o.value)}"${o.value === current ? ' selected' : ''}>${deps.esc(o.label)} (${o.count.toLocaleString('en-GB')})</option>`).join('')}
    </select>
    <span class="control-chevron" aria-hidden="true">${deps.iconChevron}</span>
  </label>`;
  }

  function checkControl(v: FacetView<DemoFragrance>, listLength: number): string {
    const checked = v.chosen !== undefined;
    // Offered only when it would narrow the list, or is ticked so it can be unticked.
    if (!((v.count > 0 && v.count < listLength) || checked)) return '';
    return `<label class="control facet-check">
    <input type="checkbox" id="${facetSelectId(v.facet.id)}"${checked ? ' checked' : ''} />
    <span class="facet-check-label">${deps.esc(v.facet.label)}</span>
    <span class="facet-count t-count">${v.count.toLocaleString('en-GB')}</span>
  </label>`;
  }

  function facetUi(kind: TabKind, views: FacetView<DemoFragrance>[], searchedLength: number): { toggle: string; panel: string } {
    const st = states[kind];
    const chosen = Object.keys(st.sel).length;
    const controls = views
      .map((v) => (v.facet.kind === 'select' ? selectControl(v) : checkControl(v, searchedLength)))
      .filter(Boolean);
    if (controls.length === 0) return { toggle: '', panel: '' };
    const genderView = views.find((v) => v.facet.id === 'gender');
    const genderNote =
      genderView && genderView.options.length >= 2
        ? `<p class="facet-note t-caption">Gender is read from wording in the title, such as Pour Homme or For Her. Not Stated is not the same as Unisex.</p>`
        : '';
    return {
      toggle: `<button type="button" class="control facets-toggle" data-tab-facets-toggle aria-expanded="${st.open}">
      <span class="control-ico">${deps.iconFilter}</span>
      <span>Filters</span>
      ${chosen > 0 ? `<span class="facets-badge">${chosen}</span>` : ''}
    </button>`,
      panel: st.open
        ? `<div class="facets-panel">
          <div class="facet-grid">${controls.join('')}</div>
          ${genderNote}
          ${chosen > 0 ? `<button type="button" class="link-btn facets-clear" data-tab-facets-clear>Clear All Filters</button>` : ''}
        </div>`
        : '',
    };
  }

  /** A tab: its heading with the count of what is listed, its note, its own search box, its controls and its list. */
  function panel(kind: TabKind): string {
    const spec = specs[kind];
    const st = states[kind];
    const { list, views, searched } = listOf(kind);
    const sort = deps.sortControl(TAB_SORT_ID, spec.title, spec.sorts, st.sort);
    return `<div class="page-head"><h1 class="t-page">${deps.esc(spec.title)}</h1><span class="count t-count">${list.length}</span></div>
    <p class="panel-note t-body">${deps.esc(spec.note)}</p>
    <div role="search" class="tab-search" aria-label="Search within ${deps.esc(spec.searchLabel)}">
      <input type="search" id="${TAB_SEARCH_ID}" placeholder="Search ${deps.esc(spec.searchLabel)}" aria-label="Search ${deps.esc(spec.searchLabel)}" value="${deps.esc(st.q)}" autocomplete="off" enterkeyhint="search" />
    </div>
    ${deps.listControls(sort, facetUi(kind, views, searched.length))}
    ${deps.fragranceList(list, spec.empty)}`;
  }

  return {
    panel,
    /** The tab's list as drawn, for the page's own use (and for tests). */
    listOf: (kind: TabKind) => listOf(kind).list,
    /** Every filter's options and counts as the page draws them, for tests. */
    views: (kind: TabKind): FacetView<DemoFragrance>[] => listOf(kind).views,
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
    /** Chooses one option of a dropdown, ticks or unticks a box; an empty value clears it. */
    setFacet(kind: TabKind, id: string, value: string): void {
      const sel = states[kind].sel;
      if (value === '') delete sel[id];
      else sel[id] = value;
    },
    toggleOpen(kind: TabKind): void {
      states[kind].open = !states[kind].open;
    },
    /** Clears every filter, keeping the panel open: the reader is mid filtering, not leaving. */
    clearFilters(kind: TabKind): void {
      states[kind].sel = {};
      states[kind].open = true;
    },

    /** The address's query for a tab. */
    query: (kind: TabKind): Record<string, string> => tabToQuery(states[kind], specs[kind].facets, DEFAULT_SORT),
    /**
     * Takes a tab's state from an address. When the address says what the tab
     * already holds nothing changes, and the panel stays as the reader left it
     * (Back to a tab); when it differs (a shared link, a typed address) the tab
     * takes it, and a filter in it opens the panel so the choice is in plain
     * sight rather than a badge on a shut button.
     */
    fromQuery(kind: TabKind, query: Readonly<Record<string, string>>): void {
      const read = tabFromQuery(query, specs[kind].facets, sortValues(kind), DEFAULT_SORT);
      if (sameTabState(states[kind], read)) return;
      states[kind] = { ...read, open: Object.keys(read.sel).length > 0 };
    },

    /** Both tabs' states for the history entry, and back again. */
    snapshot(): Record<TabKind, TabListState> {
      return {
        oils: { ...states.oils, sel: { ...states.oils.sel } },
        sets: { ...states.sets, sel: { ...states.sets.sel } },
      };
    },
    restore(saved: Partial<Record<TabKind, TabListState>> | undefined): void {
      for (const kind of TAB_KINDS) {
        const s = saved?.[kind];
        if (!s) continue;
        // An entry saved by an older build may name a filter or a sort this one
        // does not offer: only what still exists comes back.
        const read = tabFromQuery({ ...s.sel, q: s.q, sort: s.sort }, specs[kind].facets, sortValues(kind), DEFAULT_SORT);
        states[kind] = { ...read, open: s.open === true };
      }
    },
  };
}

export type Tabs = ReturnType<typeof createTabs>;

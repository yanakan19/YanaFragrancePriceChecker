/**
 * The filters, search and address of the Explore Sets and Oils tabs
 * (docs/GIFT-SETS-AND-OILS-PLAN.md), as plain functions over any list.
 *
 * Split out of demo/app.ts for the reason demo/listSort.ts is: app.ts calls
 * init() against `document` when it is imported, so a Node test cannot reach it,
 * and a rule with this many branches wants tests.
 *
 * The old lists (Search, a brand, a note, Deals) keep their one shared set of
 * facets in app.ts. These two tabs each have filters of their own (a set's main
 * bottle, an oil's format) and their filters live in the address, so a filtered
 * list can be shared (owner's decision, 2026-10-05). The rules here are the same
 * ones the shared facets follow, written once for a list of anything:
 *
 *   - one value per dropdown, "Any ..." first;
 *   - an option is offered only if it would return something, and its count is
 *     what the list would hold if that option were chosen, with every other
 *     filter applied and the dropdown's own left out, so choosing a second
 *     option never empties the first;
 *   - a chosen option whose count has fallen to nothing stays in its dropdown.
 */

export interface Option {
  value: string;
  label: string;
}

export interface SelectFacet<T> {
  kind: 'select';
  /** The address parameter, and the id the page's dropdown carries. */
  id: string;
  /** What a screen reader calls the dropdown. */
  label: string;
  /** The first option, which chooses nothing: "Any Brand Type". */
  any: string;
  /**
   * Every option value this item has. An item may have several (a set with a
   * lotion and a shower gel is in two "In the Box" options) or none (it then
   * matches no option of this filter, the way a null size matches no size band).
   */
  values(item: T): readonly string[];
  /** The offered options, from how many items hold each value, in the order they are shown. */
  options(found: ReadonlyMap<string, number>): Option[];
  /** Whether an address may name this value: anything else is dropped on the way in. */
  known(value: string): boolean;
}

export interface CheckFacet<T> {
  kind: 'check';
  id: string;
  label: string;
  /** Whether the item passes when the box is ticked. */
  flag(item: T): boolean;
}

export type Facet<T> = SelectFacet<T> | CheckFacet<T>;

/** The chosen value of each filter by its id; a ticked box is '1'. A filter with no entry is not applied. */
export type Selection = Readonly<Record<string, string>>;

/** A fixed list of options in a fixed order, each offered only while something holds it. */
export function fixedOptions(all: readonly Option[]): Pick<SelectFacet<unknown>, 'options' | 'known'> {
  return {
    options: (found) => all.filter((o) => (found.get(o.value) ?? 0) > 0),
    known: (value) => all.some((o) => o.value === value),
  };
}

function passesOne<T>(f: Facet<T>, item: T, sel: Selection, values: readonly string[] | null): boolean {
  const chosen = sel[f.id];
  if (chosen === undefined) return true;
  if (f.kind === 'check') return f.flag(item);
  return (values ?? f.values(item)).includes(chosen);
}

/** The items that pass every chosen filter. */
export function applyFacets<T>(items: readonly T[], facets: readonly Facet<T>[], sel: Selection): T[] {
  const active = facets.filter((f) => sel[f.id] !== undefined);
  if (active.length === 0) return [...items];
  return items.filter((item) => active.every((f) => passesOne(f, item, sel, null)));
}

/** One filter as the page draws it. */
export interface FacetView<T> {
  facet: Facet<T>;
  /** The chosen value, if any. */
  chosen: string | undefined;
  /** A dropdown's offered options with their counts; empty for a checkbox. */
  options: (Option & { count: number })[];
  /** A checkbox's count: how many items it would leave. Zero for a dropdown. */
  count: number;
}

/**
 * Every filter's options and counts for `items`, the list before any filter is
 * applied. One pass: an item that fails no filter counts in every filter; one
 * that fails exactly one counts only in that one; one that fails two counts
 * nowhere.
 */
export function facetViews<T>(items: readonly T[], facets: readonly Facet<T>[], sel: Selection): FacetView<T>[] {
  const found = facets.map(() => new Map<string, number>());
  const checks = facets.map(() => 0);
  for (const item of items) {
    const values = facets.map((f) => (f.kind === 'select' ? f.values(item) : null));
    let failed = -1;
    let failures = 0;
    for (let i = 0; i < facets.length; i++) {
      if (passesOne(facets[i]!, item, sel, values[i]!)) continue;
      failed = i;
      if (++failures > 1) break;
    }
    if (failures > 1) continue;
    for (let i = 0; i < facets.length; i++) {
      if (failures !== 0 && failed !== i) continue;
      const f = facets[i]!;
      if (f.kind === 'check') {
        if (f.flag(item)) checks[i]! += 1;
      } else {
        for (const v of new Set(values[i]!)) found[i]!.set(v, (found[i]!.get(v) ?? 0) + 1);
      }
    }
  }
  return facets.map((f, i) => {
    if (f.kind === 'check') return { facet: f, chosen: sel[f.id], options: [], count: checks[i]! };
    const options = f.options(found[i]!).map((o) => ({ ...o, count: found[i]!.get(o.value) ?? 0 }));
    return { facet: f, chosen: sel[f.id], options, count: 0 };
  });
}

/**
 * The words of a search, all of which must appear in the text. A search of
 * "rabanne invictus" finds "Rabanne Invictus Gift Set" whatever order the words
 * are in the text; it is not the main search's one run of letters, which would
 * miss it.
 */
export function matchesSearch(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = text.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/* ── the address ─────────────────────────────────────────────────────────── */

/** A tab's own list state: its search, its sort and its filters. */
export interface TabListState {
  q: string;
  sort: string;
  sel: Record<string, string>;
  /** Whether the Filters panel is open. Not in the address. */
  open: boolean;
}

export function emptyTabState(sort: string): TabListState {
  return { q: '', sort, sel: {}, open: false };
}

/** The parameters the address never uses for a filter. */
const RESERVED = new Set(['q', 'sort']);

/**
 * The address's query for a tab: what the reader chose and nothing else, so an
 * untouched tab is the plain /sets, and a link to a filtered one is a short
 * readable address (/sets?brand=rabanne&sort=price-low).
 */
export function tabToQuery<T>(st: TabListState, facets: readonly Facet<T>[], defaultSort: string): Record<string, string> {
  const query: Record<string, string> = {};
  const q = st.q.trim();
  if (q) query.q = q;
  if (st.sort !== defaultSort) query.sort = st.sort;
  for (const f of facets) {
    const v = st.sel[f.id];
    if (v !== undefined) query[f.id] = v;
  }
  return query;
}

/**
 * A tab's state from an address's query. Anything the tab does not know (a
 * filter it has no more, a value that is not an option, a sort it does not
 * offer) is dropped, so an old or mistyped link opens the tab with what still
 * makes sense and never an empty list behind a dropdown that cannot show why.
 */
export function tabFromQuery<T>(
  query: Readonly<Record<string, string>>,
  facets: readonly Facet<T>[],
  sorts: readonly string[],
  defaultSort: string,
): Pick<TabListState, 'q' | 'sort' | 'sel'> {
  const sel: Record<string, string> = {};
  for (const f of facets) {
    if (RESERVED.has(f.id)) continue;
    const v = query[f.id];
    if (v === undefined) continue;
    if (f.kind === 'check') {
      if (v === '1') sel[f.id] = '1';
    } else if (f.known(v)) {
      sel[f.id] = v;
    }
  }
  const sort = query.sort !== undefined && sorts.includes(query.sort) ? query.sort : defaultSort;
  return { q: (query.q ?? '').trim(), sort, sel };
}

/** Whether two tab states hold the same search, sort and filters (the panel being open or shut is not one). */
export function sameTabState(a: TabListState, b: Pick<TabListState, 'q' | 'sort' | 'sel'>): boolean {
  const ka = Object.keys(a.sel).sort();
  const kb = Object.keys(b.sel).sort();
  return a.q === b.q && a.sort === b.sort && ka.length === kb.length && ka.every((k, i) => k === kb[i] && a.sel[k] === b.sel[k]);
}

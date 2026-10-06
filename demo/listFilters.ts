/**
 * The filters of every fragrance list on the site (Search and Most Stocked, a
 * brand, a shop, a note, Deals, and the Explore Oils and Sets tabs), as plain
 * functions over a list of anything. Owner's revamp of 6 Oct 2026: one filter
 * area, several options at once in a filter, a count beside every option, the
 * chosen ones shown as chips, and all of it in the address.
 *
 * Split out of demo/app.ts for the reason demo/listSort.ts is: app.ts calls
 * init() against `document` when it is imported, so a Node test cannot reach
 * it, and a rule with this many branches wants tests. Nothing here touches a
 * document; demo/filterUi.ts draws the markup and app.ts owns the page.
 *
 * The rules:
 *
 *   - a filter holds any number of chosen options. Within one filter they
 *     combine with OR (30 to 70ml or 70 to 120ml); across filters with AND
 *     (and Under £25). A filter with nothing chosen is not applied;
 *   - an option is offered only if it would return something, and its count is
 *     what the list would hold if that option alone were chosen in its filter,
 *     with every other filter applied and the filter's own choices left out, so
 *     ticking a second option never empties the first;
 *   - a chosen option whose count has fallen to nothing stays offered, at 0, so
 *     it can be unticked;
 *   - a yes or no filter (In Stock, On Sale) is offered only where ticking it
 *     would narrow the list, or while it is ticked.
 */

import { searchMatches } from './searchIntent.js';

export interface Option {
  value: string;
  label: string;
}

export interface SelectFacet<T> {
  kind: 'select';
  /** The address parameter, and what the page's inputs name the filter by. */
  id: string;
  /** The filter's heading in the panel, and its name on a chip ("Size"). */
  label: string;
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
  /** What a chip calls a chosen value, whether or not anything holds it now. */
  labelOf(value: string): string;
  /** Where a value sits in the filter's own order, so an address names chosen values the same way every time. */
  rank(value: string): number;
}

export interface CheckFacet<T> {
  kind: 'check';
  id: string;
  label: string;
  /** Whether the item passes when the box is ticked. */
  flag(item: T): boolean;
}

export type Facet<T> = SelectFacet<T> | CheckFacet<T>;

/** The chosen values of each filter by its id; a ticked box is ['1']. A filter with no entry, or an empty one, is not applied. */
export type Selection = Readonly<Record<string, readonly string[]>>;

/** The value a ticked yes or no filter carries. */
export const TICKED = '1';

/** A fixed list of options in a fixed order, each offered only while something holds it. */
export function fixedOptions(all: readonly Option[]): Pick<SelectFacet<unknown>, 'options' | 'known' | 'labelOf' | 'rank'> {
  const index = new Map(all.map((o, i) => [o.value, i]));
  return {
    options: (found) => all.filter((o) => (found.get(o.value) ?? 0) > 0),
    known: (value) => index.has(value),
    labelOf: (value) => all[index.get(value) ?? -1]?.label ?? value,
    rank: (value) => index.get(value) ?? Number.MAX_SAFE_INTEGER,
  };
}

/**
 * A filter whose options are whatever the list holds (its brands, its shops),
 * named in A to Z order. `labels` is read once, lazily: an address may name
 * only a value it has. The A to Z order of every name is worked out once too,
 * so a list of a thousand brands is not sorted again on every tick.
 */
export function namedSelect<T>(
  id: string,
  label: string,
  values: (item: T) => readonly string[],
  labels: () => ReadonlyMap<string, string>,
): SelectFacet<T> {
  let order: Map<string, number> | null = null;
  const ordered = (): Map<string, number> => {
    if (!order) {
      const sorted = [...labels().entries()].sort(([va, la], [vb, lb]) => la.localeCompare(lb) || (va < vb ? -1 : va > vb ? 1 : 0));
      order = new Map(sorted.map(([v], i) => [v, i]));
    }
    return order;
  };
  return {
    kind: 'select',
    id,
    label,
    values,
    options: (found) => {
      const rank = ordered();
      return [...found.keys()]
        .sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER) || (a < b ? -1 : a > b ? 1 : 0))
        .map((value) => ({ value, label: labels().get(value) ?? value }));
    },
    known: (value) => labels().has(value),
    labelOf: (value) => labels().get(value) ?? value,
    rank: (value) => ordered().get(value) ?? Number.MAX_SAFE_INTEGER,
  };
}

/** The same filter over a list of something that carries the item (a deal carries its fragrance). */
export function liftFacet<T, U>(f: Facet<T>, get: (u: U) => T): Facet<U> {
  return f.kind === 'check'
    ? { ...f, flag: (u: U) => f.flag(get(u)) }
    : { ...f, values: (u: U) => f.values(get(u)) };
}

const chosenOf = (sel: Selection, id: string): readonly string[] | undefined => {
  const c = sel[id];
  return c && c.length > 0 ? c : undefined;
};

/** Whether any of an item's values is chosen. Both lists are a handful long at most, so a scan beats building a set. */
function anyChosen(values: readonly string[], chosen: readonly string[]): boolean {
  for (let k = 0; k < values.length; k++) if (chosen.includes(values[k]!)) return true;
  return false;
}

function passesOne<T>(f: Facet<T>, item: T, chosen: readonly string[]): boolean {
  return f.kind === 'check' ? f.flag(item) : anyChosen(f.values(item), chosen);
}

/** One filter as the page draws it. */
export interface FacetView<T> {
  facet: Facet<T>;
  /** The chosen values, in the filter's own order; empty when none. */
  chosen: readonly string[];
  /** A select filter's offered options with their counts (a chosen one at 0 included); empty for a yes or no filter. */
  options: (Option & { count: number })[];
  /** A yes or no filter's count: how many items it would leave. Zero for a select filter. */
  count: number;
  /** Whether the panel shows this filter at all. */
  offered: boolean;
}

export interface FacetRun<T> {
  /** The items that pass every chosen filter, in the order they came. */
  list: T[];
  /** Every filter's options and counts, in the order the filters were given. */
  views: FacetView<T>[];
}

/**
 * The filtered list and every filter's options and counts, in one pass over
 * `items`, the list before any filter is applied. An item that fails no filter
 * is listed and counts in every filter; one that fails exactly one counts only
 * in that one; one that fails two counts nowhere.
 */
export function runFacets<T>(items: readonly T[], facets: readonly Facet<T>[], sel: Selection): FacetRun<T> {
  const n = facets.length;
  const chosen = facets.map((f) => chosenOf(sel, f.id));
  const active: number[] = [];
  for (let i = 0; i < n; i++) if (chosen[i]) active.push(i);
  const found = facets.map(() => new Map<string, number>());
  const checks = new Array<number>(n).fill(0);
  const others = new Array<number>(n).fill(0);
  const list: T[] = [];
  // What each filter answered for the item in hand, asked once: a chosen
  // filter is asked while testing the item and again while counting it, and
  // on the longest list that doubled the work for nothing (6 Oct 2026).
  const vals: (readonly string[])[] = new Array(n);
  const flags: boolean[] = new Array(n);
  const asked = new Array<number>(n).fill(-1);
  let seq = 0;

  for (const item of items) {
    seq++;
    let failed = -1;
    let failures = 0;
    for (let a = 0; a < active.length; a++) {
      const i = active[a]!;
      const f = facets[i]!;
      asked[i] = seq;
      let pass: boolean;
      if (f.kind === 'check') pass = flags[i] = f.flag(item);
      else pass = anyChosen((vals[i] = f.values(item)), chosen[i]!);
      if (pass) continue;
      failed = i;
      if (++failures > 1) break;
    }
    if (failures > 1) continue;
    if (failures === 0) list.push(item);
    for (let i = 0; i < n; i++) {
      if (failures !== 0 && failed !== i) continue;
      const f = facets[i]!;
      const known = asked[i] === seq;
      others[i]! += 1;
      if (f.kind === 'check') {
        if (known ? flags[i] : f.flag(item)) checks[i]! += 1;
      } else {
        const values = known ? vals[i]! : f.values(item);
        const map = found[i]!;
        for (let k = 0; k < values.length; k++) {
          const v = values[k]!;
          // An item listing one value twice still counts once.
          if (k > 0 && values.indexOf(v) < k) continue;
          map.set(v, (map.get(v) ?? 0) + 1);
        }
      }
    }
  }

  const views = facets.map((f, i): FacetView<T> => {
    const picked = ordered(f, chosen[i] ?? []);
    if (f.kind === 'check') {
      const ticked = picked.length > 0;
      return { facet: f, chosen: picked, options: [], count: checks[i]!, offered: ticked || (checks[i]! > 0 && checks[i]! < others[i]!) };
    }
    const map = found[i]!;
    const options: (Option & { count: number })[] = f.options(map).map((o) => ({ ...o, count: map.get(o.value) ?? 0 }));
    // A chosen value nothing holds any more stays, at 0, where its order puts it.
    const missing = picked.filter((v) => !options.some((o) => o.value === v));
    if (missing.length > 0) {
      options.push(...missing.map((v) => ({ value: v, label: f.labelOf(v), count: 0 })));
      options.sort((a, b) => f.rank(a.value) - f.rank(b.value));
    }
    const live = options.filter((o) => o.count > 0).length;
    return { facet: f, chosen: picked, options, count: 0, offered: picked.length > 0 || live >= 2 };
  });
  return { list, views };
}

/** The items that pass every chosen filter. */
export function applyFacets<T>(items: readonly T[], facets: readonly Facet<T>[], sel: Selection): T[] {
  const active = facets.filter((f) => chosenOf(sel, f.id));
  if (active.length === 0) return [...items];
  return items.filter((item) => active.every((f) => passesOne(f, item, sel[f.id]!)));
}

/** Every filter's options and counts for `items`, the list before any filter is applied. */
export function facetViews<T>(items: readonly T[], facets: readonly Facet<T>[], sel: Selection): FacetView<T>[] {
  return runFacets(items, facets, sel).views;
}

/** How many options are chosen across every filter: the number on the Filters button. */
export function chosenCount<T>(facets: readonly Facet<T>[], sel: Selection): number {
  return facets.reduce((n, f) => n + (chosenOf(sel, f.id)?.length ?? 0), 0);
}

/** A filter's chosen values in its own order, each once. */
function ordered<T>(f: Facet<T>, values: readonly string[]): string[] {
  const once = [...new Set(values)];
  if (f.kind === 'check') return once.includes(TICKED) ? [TICKED] : [];
  return once.sort((a, b) => f.rank(a) - f.rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** The selection with one filter's chosen values replaced; an empty list removes the filter. */
export function withChosen(sel: Selection, id: string, values: readonly string[]): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(sel)) if (k !== id && v.length > 0) next[k] = [...v];
  const once = [...new Set(values)];
  if (once.length > 0) next[id] = once;
  return next;
}

/** The selection with one value of one filter ticked or unticked. */
export function withValue(sel: Selection, id: string, value: string, on: boolean): Record<string, string[]> {
  const current = sel[id] ?? [];
  return withChosen(sel, id, on ? [...current, value] : current.filter((v) => v !== value));
}

/**
 * The words of a search, all of which must appear in the text. A search of
 * "rabanne invictus" finds "Rabanne Invictus Gift Set" whatever order the words
 * are in the text. The words that name a kind of product ("oil", "set") match
 * whole words only (demo/searchIntent.ts), the rule every search on the site uses.
 */
export const matchesSearch = searchMatches;

/* ── the address ─────────────────────────────────────────────────────────── */

/**
 * The parameters the address never uses for a filter: the search, the sort,
 * and the ad layout preview (demo/ads.ts).
 */
const RESERVED = new Set(['q', 'sort', 'adpreview']);

/** The separator between several chosen values of one filter: /search?size=30-70,70-120. */
export const VALUE_SEPARATOR = ',';

/**
 * The address's filter parameters for a selection: each filter that has a
 * choice, its values in the filter's own order joined by commas, so one state
 * is always one address and an untouched list adds nothing.
 */
export function selToQuery<T>(sel: Selection, facets: readonly Facet<T>[]): Record<string, string> {
  const query: Record<string, string> = {};
  for (const f of facets) {
    if (RESERVED.has(f.id)) continue;
    const picked = ordered(f, chosenOf(sel, f.id) ?? []);
    if (picked.length > 0) query[f.id] = picked.join(VALUE_SEPARATOR);
  }
  return query;
}

/**
 * A selection from an address's query. One value (the only kind there was
 * before 6 Oct 2026) or several, comma separated. Anything a filter does not
 * know (a filter the list has no more, a value that is not an option, a box
 * ticked with anything but 1) is dropped, so an old or mistyped link opens the
 * list with what still makes sense and never an empty list behind a filter
 * that cannot show why.
 */
export function selFromQuery<T>(query: Readonly<Record<string, string>>, facets: readonly Facet<T>[]): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const f of facets) {
    if (RESERVED.has(f.id)) continue;
    const raw = query[f.id];
    if (raw === undefined) continue;
    const parts = raw.split(VALUE_SEPARATOR).map((v) => v.trim()).filter(Boolean);
    const kept = f.kind === 'check' ? parts.filter((v) => v === TICKED) : parts.filter((v) => f.known(v));
    const picked = ordered(f, kept);
    if (picked.length > 0) sel[f.id] = picked;
  }
  return sel;
}

/** Whether two selections choose the same values (in any order). */
export function sameSelection(a: Selection, b: Selection): boolean {
  const keys = (s: Selection) => Object.keys(s).filter((k) => s[k]!.length > 0).sort();
  const ka = keys(a);
  const kb = keys(b);
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => {
    const x = new Set(a[k]);
    const y = new Set(b[k]);
    return x.size === y.size && [...x].every((v) => y.has(v));
  });
}

/* ── a tab's state ───────────────────────────────────────────────────────── */

/** A tab's own list state: its search, its sort and its filters. */
export interface TabListState {
  q: string;
  sort: string;
  sel: Record<string, string[]>;
}

export function emptyTabState(sort: string): TabListState {
  return { q: '', sort, sel: {} };
}

/**
 * The address's query for a tab: what the reader chose and nothing else, so an
 * untouched tab is the plain /sets, and a link to a filtered one is a short
 * readable address (/sets?sort=price-low&brand=dior,rabanne).
 */
export function tabToQuery<T>(st: TabListState, facets: readonly Facet<T>[], defaultSort: string): Record<string, string> {
  const query: Record<string, string> = {};
  const q = st.q.trim();
  if (q) query.q = q;
  if (st.sort !== defaultSort) query.sort = st.sort;
  return { ...query, ...selToQuery(st.sel, facets) };
}

/**
 * A tab's state from an address's query. Anything the tab does not know (a
 * filter it has no more, a value that is not an option, a sort it does not
 * offer) is dropped.
 */
export function tabFromQuery<T>(
  query: Readonly<Record<string, string>>,
  facets: readonly Facet<T>[],
  sorts: readonly string[],
  defaultSort: string,
): TabListState {
  const sort = query.sort !== undefined && sorts.includes(query.sort) ? query.sort : defaultSort;
  return { q: (query.q ?? '').trim(), sort, sel: selFromQuery(query, facets) };
}

/** Whether two tab states hold the same search, sort and filters. */
export function sameTabState(a: TabListState, b: TabListState): boolean {
  return a.q === b.q && a.sort === b.sort && sameSelection(a.sel, b.sel);
}

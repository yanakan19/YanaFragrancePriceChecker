import { chosenCount, TICKED, type Facet, type FacetView, type Selection } from './listFilters.js';

/**
 * What every fragrance list's filters look like (owner's revamp, 6 Oct 2026):
 *
 *   - one Filters button in the list's controls row, beside Sort By, with the
 *     number of chosen options on it;
 *   - under that row, the chosen options as chips, each one tap to remove, and
 *     Clear All;
 *   - the panel the button opens: a sheet from the bottom of a phone, a panel
 *     down the right of a computer (the styles in demo/template.html decide
 *     which), holding every filter as a list of real checkboxes with a count
 *     beside each option, the yes or no filters (In Stock, On Sale) first under
 *     Show Only, and a button that says how many the list now holds.
 *
 * Markup only, built from the filter engine's views (demo/listFilters.ts), so a
 * Node test can draw it. demo/app.ts owns the dialog element, the events, the
 * scroll lock and the focus.
 */

/** A list's filters as the page draws them: the engine's views, and what changing them does. */
export interface FilterContext<T = unknown> {
  facets: readonly Facet<T>[];
  views: readonly FacetView<T>[];
  sel: Selection;
  /** How many items the list holds with the filters applied. */
  matched: number;
  /** What the list is of, one and several: ['Fragrance', 'Fragrances']. */
  noun: readonly [string, string];
  /** A sentence shown under a filter's options, by the filter's id. */
  notes?: Readonly<Record<string, string>>;
  /** Replaces one filter's chosen values; an empty list clears it. */
  set(id: string, values: readonly string[]): void;
  /** Clears every filter. */
  clear(): void;
}

export interface FilterMarkupDeps {
  esc(s: string): string;
  iconFilter: string;
  iconClose: string;
  iconChevron: string;
}

/** What the reader has done to the panel itself, kept by the page between draws. */
export interface SheetUi {
  /** Whether each filter's group is open, by filter id, where the reader has opened or shut it. */
  open: ReadonlyMap<string, boolean>;
  /** What is typed in a long filter's own search box, by filter id. */
  find: ReadonlyMap<string, string>;
}

/** The dialog's id, and the ids inside it the page reads. */
export const SHEET_ID = 'ps-filters';
export const SHEET_TITLE_ID = 'ps-filters-title';

/** A filter with more options than this (Brand, Shop) is shut until opened, and gets a search box. */
export const LONG_LIST = 12;

/** How many of the first option filters are open when the panel first shows. */
const OPEN_AT_FIRST = 2;

const n = (x: number): string => x.toLocaleString('en-GB');

/** A checkbox's id: the filter and the value, with anything an id should not hold spelled out. */
export function optionInputId(facetId: string, value: string): string {
  return `fs-${facetId}-${value.replace(/[^a-z0-9-]/gi, (c) => `_${c.charCodeAt(0).toString(16)}`)}`;
}

/** "Show 1,234 Fragrances": the panel's main button, which closes it on the list. */
export function showLabel(ctx: Pick<FilterContext, 'matched' | 'noun'>): string {
  return `Show ${n(ctx.matched)} ${ctx.matched === 1 ? ctx.noun[0] : ctx.noun[1]}`;
}

/** Whether a list has anything worth filtering, or anything already filtered. */
export function hasFilters(ctx: Pick<FilterContext, 'views'>): boolean {
  return ctx.views.some((v) => v.offered || v.chosen.length > 0);
}

/** The Filters button for the controls row, with the number of chosen options on it. */
export function filterToggleHtml(count: number, deps: FilterMarkupDeps): string {
  return `<button type="button" class="control facets-toggle" data-facets-toggle aria-haspopup="dialog">
      <span class="control-ico">${deps.iconFilter}</span>
      <span>Filters</span>
      ${count > 0 ? `<span class="facets-badge" aria-hidden="true">${count}</span><span class="sr">, ${count} chosen</span>` : ''}
    </button>`;
}

/** One chip per chosen option, then Clear All; nothing when nothing is chosen. */
export function filterChipsHtml(ctx: Pick<FilterContext, 'facets' | 'sel'>, deps: FilterMarkupDeps): string {
  const chips: string[] = [];
  for (const f of ctx.facets) {
    const picked = ctx.sel[f.id] ?? [];
    for (const v of picked) {
      const text = f.kind === 'check' ? deps.esc(f.label) : `<span class="fc-name">${deps.esc(f.label)}:</span> ${deps.esc(f.labelOf(v))}`;
      chips.push(`<li><button type="button" class="filter-chip" data-filter-remove="${deps.esc(f.id)}" data-value="${deps.esc(v)}"><span class="sr">Remove </span>${text}<span class="fc-x" aria-hidden="true">${deps.iconClose}</span></button></li>`);
    }
  }
  if (chips.length === 0) return '';
  return `<ul class="filter-chips" aria-label="Chosen Filters">${chips.join('')}<li><button type="button" class="link-btn filters-clear" data-facets-clear>Clear All</button></li></ul>`;
}

/** The controls row's Filters button and the chips row under it, or nothing where there is nothing to filter. */
export function filterControlsHtml(ctx: FilterContext, deps: FilterMarkupDeps): { toggle: string; panel: string } {
  if (!hasFilters(ctx)) return { toggle: '', panel: '' };
  return { toggle: filterToggleHtml(chosenCount(ctx.facets, ctx.sel), deps), panel: filterChipsHtml(ctx, deps) };
}

/** The panel's frame: a heading, a close button, the body the filters go in, and its two buttons. */
export function sheetShellHtml(deps: FilterMarkupDeps): string {
  return `<div class="fs-card">
      <div class="fs-head">
        <h2 id="${SHEET_TITLE_ID}" class="fs-title" tabindex="-1">Filters</h2>
        <button type="button" class="fs-x" data-filters-close aria-label="Close Filters">${deps.iconClose}</button>
      </div>
      <div class="fs-body" data-fs-body></div>
      <div class="fs-foot">
        <button type="button" class="ps-dialog-btn fs-clear" data-facets-clear>Clear All</button>
        <button type="button" class="ps-dialog-btn primary fs-show" data-filters-close data-fs-show></button>
      </div>
      <p class="sr" aria-live="polite" data-fs-status></p>
    </div>`;
}

function optionRow(facetId: string, value: string, label: string, count: number, checked: boolean, hidden: boolean, deps: FilterMarkupDeps): string {
  return `<label class="fs-opt"${hidden ? ' hidden' : ''}>
        <input type="checkbox" id="${optionInputId(facetId, value)}" data-fs-facet="${deps.esc(facetId)}" value="${deps.esc(value)}"${checked ? ' checked' : ''} />
        <span class="fs-opt-label">${deps.esc(label)}</span>
        <span class="fs-opt-count">${n(count)}</span>
      </label>`;
}

const noteHtml = (text: string | undefined, deps: FilterMarkupDeps): string =>
  text ? `<p class="fs-note t-caption">${deps.esc(text)}</p>` : '';

/** Whether a filter's group is open: as the reader left it, else open for one of the first filters or one with a choice. */
export function groupOpen(v: FacetView<unknown>, index: number, ui: SheetUi): boolean {
  const set = ui.open.get(v.facet.id);
  if (set !== undefined) return set;
  if (v.chosen.length > 0) return true;
  return index < OPEN_AT_FIRST && v.options.length <= LONG_LIST;
}

/**
 * Everything inside the panel's body: Show Only (the yes or no filters) first,
 * then each option filter as a group that opens and shuts, its chosen count in
 * its heading. A shut long group draws no options until it is opened, so a list
 * of a thousand brands costs nothing while nobody is looking at it.
 */
export function sheetBodyHtml<T>(ctx: Pick<FilterContext<T>, 'views' | 'notes'>, ui: SheetUi, deps: FilterMarkupDeps): string {
  const notes = ctx.notes ?? {};
  const flags = ctx.views.filter((v) => v.facet.kind === 'check' && v.offered);
  const selects = ctx.views.filter((v) => v.facet.kind === 'select' && v.offered);
  const parts: string[] = [];

  if (flags.length > 0) {
    parts.push(`<fieldset class="fs-flags">
      <legend class="fs-name">Show Only</legend>
      ${flags.map((v) => optionRow(v.facet.id, TICKED, v.facet.label, v.count, v.chosen.length > 0, false, deps)).join('')}
      ${flags.map((v) => noteHtml(notes[v.facet.id], deps)).join('')}
    </fieldset>`);
  }

  selects.forEach((v, i) => {
    const f = v.facet;
    const open = groupOpen(v as FacetView<unknown>, i, ui);
    const long = v.options.length > LONG_LIST;
    const term = (ui.find.get(f.id) ?? '').trim().toLowerCase();
    const picked = v.chosen.length;
    let inner = '';
    if (open) {
      const rows = v.options.map((o) =>
        optionRow(f.id, o.value, o.label, o.count, v.chosen.includes(o.value), term !== '' && !o.label.toLowerCase().includes(term), deps),
      );
      const shown = term === '' || v.options.some((o) => o.label.toLowerCase().includes(term));
      inner = `<fieldset class="fs-opts">
          <legend class="sr">${deps.esc(f.label)}</legend>
          ${
            long
              ? `<input type="search" class="fs-find" id="fs-find-${deps.esc(f.id)}" data-fs-find="${deps.esc(f.id)}" value="${deps.esc(ui.find.get(f.id) ?? '')}" placeholder="Search ${deps.esc(f.label)}s" aria-label="Search ${deps.esc(f.label)}s" autocomplete="off" enterkeyhint="search" />
                 <p class="fs-none t-caption"${shown ? ' hidden' : ''}>Nothing matches that.</p>`
              : ''
          }
          ${rows.join('')}
        </fieldset>
        ${noteHtml(notes[f.id], deps)}`;
    }
    parts.push(`<details class="fs-group" data-fs-group="${deps.esc(f.id)}"${open ? ' open' : ''}>
      <summary class="fs-sum" id="fs-sum-${deps.esc(f.id)}">
        <span class="fs-name">${deps.esc(f.label)}</span>
        ${picked > 0 ? `<span class="fs-picked">${picked}<span class="sr"> chosen</span></span>` : ''}
        <span class="fs-chev" aria-hidden="true">${deps.iconChevron}</span>
      </summary>
      ${inner}
    </details>`);
  });

  if (parts.length === 0) return `<p class="fs-empty t-body">There is nothing to filter in this list.</p>`;
  return parts.join('');
}

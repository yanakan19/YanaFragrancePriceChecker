/**
 * Suggestions as you type, under the bar's search box (owner request, 21 Oct 2026).
 *
 * Brands as short text rows, then fragrances as compact rows with a small photo,
 * the name, brand, size and strength, and the price it starts from. Picked over
 * plain text rows for both after screenshots of each at 390 and 1280 wide on the
 * built page (21 Oct 2026): the text rows were no shorter on a phone (two lines
 * a row either way), and without the price and the photo two bottles of the
 * same name (Sauvage by Dior and by another house) read the same; a brand needs
 * neither, so it stays one line of text.
 *
 * What it suggests comes from the search the box already runs on every key press
 * (demo/app.ts visibleFragrances: matched and ranked by demo/searchIntent.ts), so
 * nothing here scans the catalogue again. One row per scent: the first, best
 * ranked and most stocked, of its sizes.
 *
 * The combobox pattern (WAI-ARIA 1.2, list autocomplete): the box owns a listbox;
 * Down and Up move through the options (aria-activedescendant, focus stays in the
 * box), Enter opens the chosen one, Escape closes the list (a second Escape clears
 * the box, as a search field does), Tab and a click elsewhere close it.
 */
import { brandRank, foldText } from './searchIntent.js';

/** The fewest characters, spaces and marks aside, before anything is suggested. */
export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_MAX_BRANDS = 3;
export const SUGGEST_MAX_PRODUCTS = 5;

export interface SuggestBrand {
  name: string;
  /** How many of its products are listed: the tie break, most first. */
  count: number;
}

export interface Suggestions<T> {
  brands: SuggestBrand[];
  products: T[];
}

/**
 * The suggestions for what is typed. `ranked` is the search's own result for it,
 * best first (searchIntent rankSearch, the most stocked first among equals);
 * `topTier` the rank of its first product (0 exact, 1 the start of the name).
 * A brand that the words only loosely fit (every word starts a word of it) is
 * left out when a product fits them exactly or by its start: "ysl y" is the
 * fragrance Y, not the brand.
 */
export function suggestionsFor<T extends { brand: string; name: string; concentration?: string }>(
  query: string,
  ranked: readonly T[],
  brands: readonly SuggestBrand[],
  topTier: number,
): Suggestions<T> {
  if (foldText(query).replace(/\s+/g, '').length < SUGGEST_MIN_CHARS) return { brands: [], products: [] };
  const seen = new Set<string>();
  const products: T[] = [];
  for (const p of ranked) {
    // One row per scent: a name in another strength (Sauvage EDT, Sauvage Parfum) is another scent.
    const k = `${foldText(p.brand)}\u0000${foldText(p.name)}\u0000${foldText(p.concentration ?? '')}`;
    if (seen.has(k)) continue;
    seen.add(k);
    products.push(p);
    if (products.length === SUGGEST_MAX_PRODUCTS) break;
  }
  const fitting = brands
    .map((b) => ({ b, r: brandRank(b.name, query) }))
    .filter((x): x is { b: SuggestBrand; r: 0 | 1 | 2 } => x.r !== null && (x.r < 2 || topTier > 1 || products.length === 0))
    .sort((x, y) => x.r - y.r || y.b.count - x.b.count || x.b.name.localeCompare(y.b.name))
    .slice(0, SUGGEST_MAX_BRANDS)
    .map((x) => x.b);
  return { brands: fitting, products };
}

/** What the app gives the list: the suggestions for a query, a product's row, and what a choice does. */
export interface SuggestHost<T> {
  suggest: (query: string) => Suggestions<T>;
  productRow: (p: T) => { id: string; html: string; label: string };
  openBrand: (brand: string) => void;
  openProduct: (id: string) => void;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Wires the list to the box. Returns `refresh`, which the app calls after each
 * search it runs (the list follows the box's text, a frame later so a burst of
 * key presses draws it once), and `close`.
 */
export function mountSuggest<T>(input: HTMLInputElement, host: SuggestHost<T>): { refresh: () => void; close: () => void } {
  const panel = document.createElement('div');
  panel.id = 'search-suggest';
  panel.className = 'suggest';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', 'Suggestions');
  panel.hidden = true;
  (input.offsetParent ?? input.parentElement ?? document.body).appendChild(panel);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', panel.id);
  input.setAttribute('aria-expanded', 'false');

  let options: HTMLElement[] = [];
  let active = -1;
  let timer = 0;
  // Set by a choice or by Escape: the list stays shut until the box's text changes.
  let dismissedFor: string | null = null;

  const setActive = (i: number): void => {
    options[active]?.setAttribute('aria-selected', 'false');
    active = i;
    const el = options[active];
    if (el) {
      el.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const close = (): void => {
    window.clearTimeout(timer);
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  };

  const place = (): void => {
    // Under the box, as wide as it, inside the sticky bar (its offset parent).
    panel.style.top = `${input.offsetTop + input.offsetHeight + 6}px`;
    panel.style.left = `${input.offsetLeft}px`;
    panel.style.width = `${input.offsetWidth}px`;
  };

  const draw = (): void => {
    const q = input.value;
    if (document.activeElement !== input || dismissedFor === q) return close();
    const { brands, products } = host.suggest(q);
    if (brands.length + products.length === 0) return close();
    let n = 0;
    const brandHtml = brands
      .map((b) => `<div class="suggest-opt suggest-brand" role="option" id="sg-${n++}" aria-selected="false" data-suggest-brand="${esc(b.name)}"><span class="suggest-brand-name">${esc(b.name)}</span><span class="suggest-kind t-caption">Brand</span></div>`)
      .join('');
    const productHtml = products
      .map((p) => {
        const row = host.productRow(p);
        return `<div class="suggest-opt suggest-product" role="option" id="sg-${n++}" aria-selected="false" aria-label="${esc(row.label)}" data-suggest-frag="${esc(row.id)}">${row.html}</div>`;
      })
      .join('');
    panel.innerHTML =
      (brandHtml ? `<div role="group" aria-label="Brands" class="suggest-group">${brandHtml}</div>` : '') +
      (productHtml ? `<div role="group" aria-label="Fragrances" class="suggest-group">${productHtml}</div>` : '');
    options = Array.from(panel.querySelectorAll<HTMLElement>('[role="option"]'));
    active = -1;
    input.removeAttribute('aria-activedescendant');
    place();
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const choose = (el: HTMLElement): void => {
    dismissedFor = input.value;
    close();
    const brand = el.getAttribute('data-suggest-brand');
    if (brand !== null) host.openBrand(brand);
    else host.openProduct(el.getAttribute('data-suggest-frag')!);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (panel.hidden) {
        dismissedFor = null;
        draw();
        if (panel.hidden) return;
      }
      e.preventDefault();
      const last = options.length - 1;
      setActive(e.key === 'ArrowDown' ? (active >= last ? 0 : active + 1) : active <= 0 ? last : active - 1);
    } else if (e.key === 'Enter') {
      const el = options[active];
      if (!panel.hidden && el) {
        e.preventDefault();
        choose(el);
      } else {
        // The results are already the page under the box: Enter just puts the list away.
        dismissedFor = input.value;
        close();
      }
    } else if (e.key === 'Escape') {
      if (!panel.hidden) {
        // Only the list: the box keeps its text (the browser's own Escape would clear it).
        e.preventDefault();
        dismissedFor = input.value;
        close();
      }
    } else if (e.key === 'Tab') {
      close();
    }
  });
  input.addEventListener('input', () => {
    dismissedFor = null;
  });
  input.addEventListener('blur', () => {
    // A press on an option keeps the focus in the box (mousedown below), so a blur is a real leave.
    close();
  });
  input.addEventListener('focus', () => refresh());
  // mousedown, not click: the box must not lose focus (and close the list) before the choice lands.
  panel.addEventListener('mousedown', (e) => e.preventDefault());
  panel.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[role="option"]');
    if (el) choose(el);
  });
  window.addEventListener('resize', () => {
    if (!panel.hidden) place();
  });

  function refresh(): void {
    window.clearTimeout(timer);
    timer = window.setTimeout(draw, 40);
  }
  return { refresh, close };
}

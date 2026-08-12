/**
 * Mobile and desktop harness for the PriceSniffs comparison core.
 *
 * Holds no pricing logic of its own. It is a thin renderer over the real modules
 * in `src/`, bundled unchanged, so the demo cannot drift from what ships.
 *
 * ── Structure ────────────────────────────────────────────────────────────────
 * Three top level places, and one level of subpages beneath the middle one:
 *
 *   Home      the mark, what this is, and the popular rail
 *   Explore   Brands · Deals · Retailers · Notes · Search
 *   Settings  preferences, contact, legal
 *
 * Everything else (a fragrance, a retailer, a note, a legal document) is a leaf
 * reached from one of those and always carries a Back control. Nothing is ever
 * more than two taps from Home, which is the whole reason the subpages live
 * under Explore rather than crowding the top bar.
 *
 * House style for every reader facing string in this file: no hyphens, no en
 * dashes, no em dashes. Where a compound would normally take a hyphen, reword
 * it. Code comments are exempt.
 */
import { buildComparison, bestOffer, canShowCountdown, formatGbp, RETAILERS, getRetailer, cannotCarryBrand } from '../src/index.js';
import type { PresentedOffer, StockState } from '../src/types/offer.js';
import type { Retailer, RetailerTier } from '../src/types/retailer.js';
import {
  DEMO_FRAGRANCES, BY_POPULARITY, DEALS, NOTE_INDEX,
  brandTierFor, fragranceById, fragrancesAt, listingCountAt, fragrancesWithNote, lowestPrice, compareVariants,
  type DemoFragrance, type NoteLayer,
} from './data.js';
import { productArt, type ArtSize } from './photo.js';
import { COMPANY, LEGAL_PAGES, legalPage } from './legal.js';
import { CHANGELOG } from './changelog.js';
import { isNewAt, offersFor, SHOP_COUNT, HOUSE_PRODUCTS } from './catalogue.generated.js';
import { priceHistoryFor } from './priceHistory.generated.js';
import { officialSiteFor } from './brandSites.js';
import { matchRoute, routeToPath, slugify, basePath, type Route, type RouteName } from './router.js';
import { SUPABASE_CONFIGURED } from './supabase.js';
import {
  signUp, signIn, signOut, resendVerification, requestPasswordReset, currentUser, isVerified, onAuthChange,
} from './auth.js';
import type { User } from '@supabase/supabase-js';
import { fetchWishlist, addToWishlist, removeFromWishlist, type WishlistEntry } from './wishlist.js';
import {
  VIRTUAL_YANNY_CONFIGURED, checkYannyHealth, askVirtualYanny, type YannyIntent, type YannyResult, type YannyEvent,
} from './virtualYanny.js';

type View = 'home' | 'explore' | 'browse' | 'detail' | 'retailer' | 'brand' | 'note' | 'legal' | 'about' | 'settings' | 'account';
type AuthTab = 'signIn' | 'signUp';
type ExploreTab = 'brands' | 'deals' | 'retailers' | 'notes' | 'search';
type DisplayMode = 'dark' | 'light' | 'system';
type Layout = 'mobile' | 'desktop';
type BrandSort = 'az' | 'za';
type BrandFilter = RetailerTier | 'all';
type DealSort = 'discount' | 'lowest' | 'highest';
type NoteSort = 'common' | 'az';
type NoteLayerFilter = NoteLayer | 'any';
/** Sort for a fragrance list scoped to one note, brand or retailer. Same
 *  vocabulary as the rest of the app: alphabetical both ways (Brands),
 *  price both ways (Deals). */
type ListSort = 'az' | 'za' | 'price-low' | 'price-high';

/** One of the price bands offered under the Price facet. */
type PriceBand = '0-20' | '20-30' | '30-50' | '50-80' | '80-150' | '150-300' | '300+';
/** Every facet a fragrance list can be narrowed by. Matches the state.facet* fields below 1:1. */
type FacetGroup = 'volume' | 'concentration' | 'priceBand' | 'tier' | 'onSale' | 'inStock';

const MODE_KEY = 'pricesniffs.display';
const LAYOUT_KEY = 'pricesniffs.layout';
const PER_ROW_KEY = 'pricesniffs.perrow';

const PER_ROW_CHOICES = [3, 5, 8, 10] as const;
const PER_ROW_DEFAULT = 5;

const state = {
  view: 'home' as View,
  tab: 'brands' as ExploreTab,
  fragranceId: '',
  retailerId: '',
  brandProfile: '',
  noteName: '',
  legalId: '',
  brand: null as string | null,
  query: '',
  mode: 'dark' as DisplayMode,
  layout: 'mobile' as Layout,
  perRow: PER_ROW_DEFAULT,
  brandSort: 'az' as BrandSort,
  brandFilter: 'all' as BrandFilter,
  dealSort: 'discount' as DealSort,
  noteSort: 'common' as NoteSort,
  noteLayer: 'any' as NoteLayerFilter,
  noteDetailSort: 'az' as ListSort,
  noteDetailFilter: 'all' as BrandFilter,
  brandDetailSort: 'az' as ListSort,
  retailerDetailSort: 'az' as ListSort,
  retailerDetailFilter: 'all' as BrandFilter,
  // Scoped to *this* retailer's own offer, not the sitewide inStock facet
  // above — a fragrance can be purchasable elsewhere while sold out here, and
  // a shop's own page should only ever claim what is true of that shop.
  retailerInStockOnly: false,

  // ── facets ────────────────────────────────────────────────────────────────
  // One shared set of selections rather than one per page: every list page
  // resets them on navigation (see `go`), so nothing carries over somewhere it
  // would not make sense, and one implementation covers Browse, Search, Deals,
  // a retailer's page, a brand's page and a note's page alike.
  facetsOpen: false,
  facetVolume: new Set<number>(),
  facetConcentration: new Set<string>(),
  facetPriceBand: new Set<PriceBand>(),
  facetTier: new Set<RetailerTier>(),
  facetOnSale: false,
  facetInStock: false,

  // ── accounts (Module 7) ──────────────────────────────────────────────────
  authUser: null as User | null,
  // Set once, at startup, by loadAuthUser — distinct from authUser being null
  // (signed out) so the account page can show "loading" rather than flash a
  // signed out state before the first check has even run.
  authChecked: false,
  authTab: 'signIn' as AuthTab,
  authBusy: false,
  authError: '' as string,
  // Set after a successful signup or resend, so the "check your email" state
  // knows which address to offer resending to.
  authPendingEmail: '' as string,
  authResetSent: false,

  // ── wishlist (Module 7 continued) ────────────────────────────────────────
  // The signed-in reader's own saved fragrance ids, loaded once verification
  // is confirmed and cleared on sign out (see loadWishlist/init). A Set so
  // the detail page's toggle button is an O(1) lookup rather than scanning
  // the full list on every render.
  wishlistIds: new Set<string>(),
  wishlistLoaded: false,
  wishlistBusy: false,
  // Full entries only fetched for the account page's own list, not needed
  // just to render a toggle button correctly on the detail page.
  wishlistEntries: [] as WishlistEntry[],

  // ── Virtual Yanny ─────────────────────────────────────────────────────────
  yannyOpen: false,
  // 'idle' before the panel has ever been opened this session; the health
  // check only ever runs on open (see openYanny), never speculatively, so a
  // reader who never clicks the launcher never pays for it.
  yannyStatus: 'idle' as 'idle' | 'checking' | 'unavailable' | 'ready',
  yannyIntent: null as YannyIntent | null,
  yannyThread: [] as YannyThreadItem[],
  yannyBusy: false,
  yannySplash: '',
  yannyAgentChips: [] as { agentNumber: number; ok: boolean }[],
  yannyLastResult: null as YannyResult | null,
  // Focus returns here on close — whatever had focus before the panel opened,
  // almost always the launcher button itself but not necessarily (a reader
  // could open it via keyboard from anywhere focus happens to be).
  yannyOpenedFrom: null as HTMLElement | null,
};

/** Every facet selection back to empty. Called on every navigation — see `go`. */
function clearFacets(): void {
  state.facetsOpen = false;
  state.facetVolume.clear();
  state.facetConcentration.clear();
  state.facetPriceBand.clear();
  state.facetTier.clear();
  state.facetOnSale = false;
  state.facetInStock = false;
}

function activeFacetCount(): number {
  return (
    state.facetVolume.size +
    state.facetConcentration.size +
    state.facetPriceBand.size +
    state.facetTier.size +
    (state.facetOnSale ? 1 : 0) +
    (state.facetInStock ? 1 : 0)
  );
}

function toggleInSet<T>(set: Set<T>, value: T): void {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const $ = (sel: string) => document.querySelector(sel)!;

/**
 * Display casing only — every lookup keyed on a note name (data-note
 * attributes, fragrancesWithNote, NOTE_INDEX) keeps using the raw string
 * exactly as extracted, so this never risks a note silently failing to
 * match. Extracted note text only reliably capitalises its first word
 * ("Fresh florals"), so this fixes every word for display, e.g. "Floral
 * boquet" reads as "Floral Boquet".
 */
const titleCase = (s: string) => s.replace(/\S+/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());

// Includes houses read straight from their own storefront (HOUSE_PRODUCTS)
// alongside brands with real UK offers, so a house that has not yet been
// matched to a UK listing still gets a page instead of needing a section of
// its own — it is a brand like any other, just one whose products so far
// only carry a price it charges directly.
const BRANDS = [...new Set([...DEMO_FRAGRANCES.map((f) => f.brand), ...HOUSE_PRODUCTS.map((p) => p.house)])].sort();
const TIER_LABEL: Record<RetailerTier, string> = {
  designer: 'Designer', niche: 'Niche', mideast: 'Middle Eastern / Dupe Houses',
};

/**
 * How the leading list is ranked, and what it does not claim.
 *
 * `BY_POPULARITY` orders by how many of our shops carry a fragrance, then by
 * price. That is a real, checkable fact about availability, and it is a decent
 * proxy for demand — shops stock what sells — but it is *not* a popularity
 * measurement, so the UI calls it "most stocked" rather than implying we have
 * counted anything.
 *
 * Genuine popularity would need one of: our own outbound click counts (nothing
 * is logged yet, and the site has no traffic to log), Awin conversion data
 * (which reports on transactions we referred, of which there are none so far,
 * and only for one merchant), or per product sales rank from a retailer (none
 * publish it). Time windowed popularity would additionally need a history of
 * daily snapshots per product, which only began accumulating this month.
 * Inventing any of that would be exactly the thing this project refuses to do.
 */
const TOP_N = 50;
const POPULAR = BY_POPULARITY.slice(0, 12);

/**
 * Prices come from the catalogue crawl and the affiliate feed, never from a
 * hand written table. That is what makes them live.
 */
function rowsFor(frag: DemoFragrance): PresentedOffer[] {
  return buildComparison(offersFor(frag.id), { sortBy: 'delivered', tier: frag.tier });
}

/* ── facets ──────────────────────────────────────────────────────────────────
   Amazon's own rule, not just a description of it: an option only appears if
   at least one fragrance in the list actually has it, and its count reflects
   every *other* active facet but never its own group — so ticking a second
   volume never zeroes out the first, but ticking Volume can still empty out
   Concentration. Ticking a filter that would leave nothing selected is not
   possible, because that option would never have been offered. */

const PRICE_BANDS: { id: PriceBand; label: string; min: number; max: number | null }[] = [
  { id: '0-20', label: 'Under £20', min: 0, max: 20 },
  { id: '20-30', label: '£20 - £30', min: 20, max: 30 },
  { id: '30-50', label: '£30 - £50', min: 30, max: 50 },
  { id: '50-80', label: '£50 - £80', min: 50, max: 80 },
  { id: '80-150', label: '£80 - £150', min: 80, max: 150 },
  { id: '150-300', label: '£150 - £300', min: 150, max: 300 },
  { id: '300+', label: '£300 And Over', min: 300, max: null },
];

/**
 * Which band a delivered price falls in, or null when there is no delivered
 * price because the shop does not state its delivery cost.
 *
 * Banding such an offer on its item price instead would place it in a cheaper
 * band than it can be shown to belong to, which is the same "looks artificially
 * cheap" error the whole delivered-price model exists to avoid — so it is left
 * out of the price facet rather than filed under a number nobody has.
 */
function priceBandFor(deliveredPriceGbp: number | null): PriceBand | null {
  if (deliveredPriceGbp === null) return null;
  const price = deliveredPriceGbp;
  return (PRICE_BANDS.find((b) => price >= b.min && (b.max === null || price < b.max)) ?? PRICE_BANDS[PRICE_BANDS.length - 1]!).id;
}

/**
 * Whether one fragrance survives every active facet except `exclude`. Passing
 * a group's own id when computing that same group's option counts is what
 * makes ticking a second option within a group additive rather than
 * self-defeating — see the header comment above.
 */
function passesFacets(f: DemoFragrance, exclude: FacetGroup | null): boolean {
  if (exclude !== 'volume' && state.facetVolume.size && !state.facetVolume.has(f.sizeMl)) return false;
  if (exclude !== 'concentration' && state.facetConcentration.size && !state.facetConcentration.has(f.concentration)) return false;
  if (exclude !== 'tier' && state.facetTier.size && !state.facetTier.has(f.tier)) return false;

  if (exclude !== 'priceBand' && state.facetPriceBand.size) {
    const best = bestOffer(rowsFor(f));
    const band = best ? priceBandFor(best.deliveredPriceGbp) : null;
    if (band === null || !state.facetPriceBand.has(band)) return false;
  }
  if (exclude !== 'onSale' && state.facetOnSale) {
    if (!rowsFor(f).some((r) => r.discount !== null)) return false;
  }
  if (exclude !== 'inStock' && state.facetInStock) {
    if (!rowsFor(f).some((r) => r.isPurchasable)) return false;
  }
  return true;
}

function applyFacets(list: DemoFragrance[]): DemoFragrance[] {
  return list.filter((f) => passesFacets(f, null));
}

interface FacetOption {
  value: string;
  label: string;
  count: number;
}

/**
 * Every facet option worth offering for this list, each with a live count —
 * `list` should be the *pre-facet* candidates for the page (everything Browse
 * or a brand page would show with no facets applied), not the already-filtered
 * result, or every count would just read as "however many are left".
 */
function facetGroups(list: DemoFragrance[]) {
  const volume = new Map<number, number>();
  const concentration = new Map<string, number>();
  const priceBand = new Map<PriceBand, number>();
  const tier = new Map<RetailerTier, number>();
  let onSale = 0;
  let inStock = 0;

  for (const f of list) {
    const rows = rowsFor(f);
    if (passesFacets(f, 'volume')) volume.set(f.sizeMl, (volume.get(f.sizeMl) ?? 0) + 1);
    if (passesFacets(f, 'concentration')) {
      concentration.set(f.concentration, (concentration.get(f.concentration) ?? 0) + 1);
    }
    if (passesFacets(f, 'tier')) tier.set(f.tier, (tier.get(f.tier) ?? 0) + 1);
    if (passesFacets(f, 'priceBand')) {
      const best = bestOffer(rows);
      const band = best ? priceBandFor(best.deliveredPriceGbp) : null;
      if (band !== null) {
        priceBand.set(band, (priceBand.get(band) ?? 0) + 1);
      }
    }
    if (passesFacets(f, 'onSale') && rows.some((r) => r.discount !== null)) onSale++;
    if (passesFacets(f, 'inStock') && rows.some((r) => r.isPurchasable)) inStock++;
  }

  const toOptions = <T extends string | number>(counts: Map<T, number>, label: (v: T) => string): FacetOption[] =>
    [...counts.entries()]
      .filter(([, count]) => count > 0)
      .sort((a, b) => (typeof a[0] === 'number' ? (a[0] as number) - (b[0] as number) : String(a[0]).localeCompare(String(b[0]))))
      .map(([value, count]) => ({ value: String(value), label: label(value), count }));

  return {
    volume: toOptions(volume, (v) => `${v}ml`),
    concentration: toOptions(concentration, (v) => shortConcentration(v)),
    priceBand: PRICE_BANDS.filter((b) => (priceBand.get(b.id) ?? 0) > 0).map((b) => ({
      value: b.id, label: b.label, count: priceBand.get(b.id)!,
    })),
    tier: toOptions(tier, (v) => TIER_LABEL[v as RetailerTier]),
    onSale,
    inStock,
  };
}

/** A single toggle pill within a facet group — a button, not a native
 *  checkbox, so it fits the rest of the app's delegated-click-handler
 *  pattern rather than needing a second kind of listener just for this. */
function facetPill(group: FacetGroup, value: string, label: string, count: number, active: boolean): string {
  return `<button type="button" class="facet-pill${active ? ' is-active' : ''}" data-facet-group="${group}" data-facet-value="${esc(value)}" aria-pressed="${active}">
    ${esc(label)} <span class="facet-count t-count">${count}</span>
  </button>`;
}

/**
 * The filter control for a fragrance list: a toggle button (badge shows how
 * many facets are active) that opens a panel of pill groups underneath.
 * Groups with nothing to narrow — every candidate shares the one available
 * value — are left out entirely rather than shown with a single dead option.
 */
function facetsBlock(list: DemoFragrance[]): string {
  const g = facetGroups(list);
  const count = activeFacetCount();

  const group = (title: string, groupId: FacetGroup, options: FacetOption[], isSelected: (value: string) => boolean): string => {
    if (options.length < 2) return '';
    return `<fieldset class="facet-group">
      <legend>${esc(title)}</legend>
      <div class="facet-pills">${options.map((o) => facetPill(groupId, o.value, o.label, o.count, isSelected(o.value))).join('')}</div>
    </fieldset>`;
  };

  const onSalePill = g.onSale > 0
    ? `<fieldset class="facet-group"><legend>Offers</legend><div class="facet-pills">
         ${facetPill('onSale', '1', 'On Sale', g.onSale, state.facetOnSale)}
       </div></fieldset>`
    : '';
  const inStockPill = g.inStock > 0 && g.inStock < list.length
    ? `<fieldset class="facet-group"><legend>Availability</legend><div class="facet-pills">
         ${facetPill('inStock', '1', 'In Stock Only', g.inStock, state.facetInStock)}
       </div></fieldset>`
    : '';

  const panel = `${group('Volume', 'volume', g.volume, (v) => state.facetVolume.has(Number(v)))}
    ${group('Concentration', 'concentration', g.concentration, (v) => state.facetConcentration.has(v))}
    ${group('Price', 'priceBand', g.priceBand, (v) => state.facetPriceBand.has(v as PriceBand))}
    ${group('Type', 'tier', g.tier, (v) => state.facetTier.has(v as RetailerTier))}
    ${onSalePill}
    ${inStockPill}`;

  if (!panel.trim()) return '';

  return `<div class="facets">
    <button type="button" class="control facets-toggle" data-facets-toggle aria-expanded="${state.facetsOpen}">
      <span class="control-ico">${ICON_FILTER}</span>
      <span>Filters</span>
      ${count > 0 ? `<span class="facets-badge">${count}</span>` : ''}
    </button>
    ${
      state.facetsOpen
        ? `<div class="facets-panel">
             ${panel}
             ${count > 0 ? `<button type="button" class="link-btn facets-clear" data-facets-clear>Clear all filters</button>` : ''}
           </div>`
        : ''
    }
  </div>`;
}

/* ── display mode ────────────────────────────────────────────────────────────
   `data-mode` is ours and never collides with the host's `data-theme`. When the
   reader picks "match my device" we fall through to both the OS preference and
   any theme the host has stamped, so an external toggle still works. */

function applyMode(): void {
  document.documentElement.setAttribute('data-mode', state.mode);
}

function loadMode(): void {
  try {
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'system') state.mode = saved;
  } catch {
    // Storage can be unavailable in a sandboxed frame. Dark stays the default.
  }
  applyMode();
}

function setMode(mode: DisplayMode): void {
  state.mode = mode;
  applyMode();
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Preference simply will not persist. Nothing else breaks.
  }
}

/* ── layout ──────────────────────────────────────────────────────────────────
   `data-layout` is its own attribute, deliberately not `data-mode`: an earlier
   build put layout and colour theme on the same attribute name and
   `closest('[data-mode]')` click handling matched whichever one came first,
   not the one the click was actually for. Two names, two handlers, no
   ambiguity. */

/**
 * A real desktop with a mouse gets the wider layout by default; a phone, a
 * tablet or a resized browser window on a laptop trackpad does not. This reads
 * actual device capability rather than sniffing the user agent string, which is
 * both unreliable and unnecessary here.
 */
function detectDefaultLayout(): Layout {
  try {
    const hasMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const isWide = window.innerWidth >= 900;
    return hasMouse && isWide ? 'desktop' : 'mobile';
  } catch {
    return 'mobile';
  }
}

function applyLayout(): void {
  document.documentElement.setAttribute('data-layout', state.layout);
}

function loadLayout(): void {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(LAYOUT_KEY);
  } catch {
    // Storage can be unavailable in a sandboxed frame.
  }
  state.layout = saved === 'mobile' || saved === 'desktop' ? saved : detectDefaultLayout();
  applyLayout();
}

function setLayout(layout: Layout): void {
  state.layout = layout;
  applyLayout();
  try {
    window.localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // Preference simply will not persist. Nothing else breaks.
  }
}

/* ── tiles per row ───────────────────────────────────────────────────────────
   Carried as a CSS variable rather than a class per choice, so the grid rule
   stays one line and a new count needs no new CSS.

   Only the desktop layout honours it. At mobile width ten columns would be
   about thirty pixels each, which is not a smaller tile but an unusable one,
   so the narrow layout keeps fitting as many whole tiles as the screen has
   room for and the control is not offered there. */

function applyPerRow(): void {
  document.documentElement.style.setProperty('--per-row', String(state.perRow));
}

function loadPerRow(): void {
  try {
    const saved = Number(window.localStorage.getItem(PER_ROW_KEY));
    if ((PER_ROW_CHOICES as readonly number[]).includes(saved)) state.perRow = saved;
  } catch {
    // Storage can be unavailable in a sandboxed frame. The default stands.
  }
  applyPerRow();
}

function setPerRow(perRow: number): void {
  state.perRow = perRow;
  applyPerRow();
  try {
    window.localStorage.setItem(PER_ROW_KEY, String(perRow));
  } catch {
    // Preference simply will not persist. Nothing else breaks.
  }
}

/* ── labels ──────────────────────────────────────────────────────────────── */

const STOCK_LABEL: Record<StockState, string> = {
  inStock: 'In stock',
  lowStock: 'Low stock',
  preOrder: 'Preorder',
  unknown: 'Stock not confirmed',
  outOfStock: 'Sold out',
};

const STOCK_CLASS: Record<StockState, string> = {
  inStock: 'ok',
  lowStock: 'warn',
  preOrder: 'warn',
  unknown: 'muted',
  outOfStock: 'gone',
};

function age(seconds: number): string {
  if (seconds < 90) return 'just now';
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)}h ago`;
}

function countdown(iso: string): string {
  const h = Math.floor((Date.parse(iso) - Date.now()) / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)}d left` : `${h}h left`;
}

/** "Eau de Toilette" to "EDT". Falls through for anything already short. */
const CONCENTRATION_ABBR: Record<string, string> = {
  'Eau de Parfum': 'EDP',
  'Eau de Toilette': 'EDT',
  'Eau de Cologne': 'EDC',
};
const shortConcentration = (c: string): string => CONCENTRATION_ABBR[c] ?? c;

/* ── icons ───────────────────────────────────────────────────────────────────
   Line drawn, single weight, taking their colour from the surrounding text so
   they read as quiet controls rather than decoration. */

const icon = (paths: string) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">${paths}</svg>`;

const ICON_FILTER = icon('<path d="M3.5 5h17l-6.6 7.8V20l-3.8-2.2v-5L3.5 5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>');
const ICON_SORT = icon('<path d="M4 7h16M6.5 12h11M10 17h4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>');
const ICON_RANK = icon('<path d="M7.5 20V5m0 0L4 8.5M7.5 5 11 8.5M16.5 4v15m0 0 3.5-3.5M16.5 19 13 15.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>');
// Stands in for the native <select> arrow once appearance: none removes it —
// see .control-chevron in template.html.
const ICON_CHEVRON = icon('<path d="M6 9.5 12 15.5 18 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>');
const ICON_SEARCH = icon('<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>');
const ICON_GRID = icon('<rect x="3" y="3" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/>');
const ICON_MOBILE = icon('<rect x="7" y="2.5" width="10" height="19" rx="2.5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="18.3" r=".9" fill="currentColor"/>');
const ICON_DESKTOP = icon('<rect x="2.5" y="4" width="19" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 21h7M12 17v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>');
/* Neutral marks, not TikTok's or Instagram's own logos: this project has no
   licence to reproduce those. */
const ICON_TIKTOK = icon('<path d="M14 3v11.2a3.3 3.3 0 1 1-3.3-3.3c.3 0 .6 0 .9.1V8.4a6.1 6.1 0 1 0 5.1 6V9.8a7.5 7.5 0 0 0 4.3 1.4V8.5A4.6 4.6 0 0 1 17 4.5V3h-3Z" fill="currentColor"/>');
const ICON_INSTAGRAM = icon('<rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.8"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor"/>');
const ICON_EXTERNAL = icon('<path d="M14 4h6v6M20 4l-8.5 8.5M19 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>');
// Outline by default; .wishlist-toggle.on switches it to a filled heart via
// the shared .ico fill/stroke rule in template.html, the same on/off
// language every other toggle in this app already uses (.seg-btn.on, etc).
const ICON_HEART = icon('<path d="M12 20.5s-7.5-4.6-10-9.3C.5 7.8 2.6 4.5 6 4.5c2 0 3.4 1 6 3.6 2.6-2.6 4-3.6 6-3.6 3.4 0 5.5 3.3 4 6.7-2.5 4.7-10 9.3-10 9.3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>');
const ICON_CLOSE = icon('<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>');

/** A labelled dropdown with its icon, used for every sort and filter control. */
function control(id: string, label: string, ico: string, options: { value: string; label: string }[], current: string): string {
  return `<label class="control">
    <span class="control-ico">${ico}</span>
    <span class="sr">${esc(label)}</span>
    <select id="${id}" class="dropdown">
      ${options.map((o) => `<option value="${esc(o.value)}" ${o.value === current ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>
    <span class="control-chevron" aria-hidden="true">${ICON_CHEVRON}</span>
  </label>`;
}

/**
 * The one sort applied to a fragrance list scoped to a single note, brand or
 * retailer: alphabetical both ways, price both ways. Shared so the three
 * pages that use it cannot drift into three slightly different orderings.
 */
/**
 * Every sort ends on bottle size, smallest first.
 *
 * Without that last step the four sorts here only ever compared brand, name or
 * price, all three of which are identical across the sizes of one perfume — so
 * the three Versace Dylan Blue bottles came out in whatever order the input
 * happened to be in, which read as 10ml, 50ml, 30ml. Size ascending is the
 * tiebreaker in all four directions, including Z to A: reversing the alphabet
 * is a statement about names, not a reason to start listing bottles largest
 * first. See compareVariants in demo/data.ts.
 */
function sortFragrances(list: DemoFragrance[], sort: ListSort): DemoFragrance[] {
  return [...list].sort((a, b) => {
    if (sort === 'az' || sort === 'za') {
      const names = `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`);
      if (names !== 0) return sort === 'az' ? names : -names;
      return compareVariants(a, b);
    }
    const diff = lowestPrice(a.id) - lowestPrice(b.id);
    if (diff !== 0) return sort === 'price-low' ? diff : -diff;
    const names = `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`);
    if (names !== 0) return names;
    return compareVariants(a, b);
  });
}

function listSortControl(id: string, current: ListSort): string {
  return control(id, 'Sort fragrances', ICON_SORT, [
    { value: 'az', label: 'A To Z' },
    { value: 'za', label: 'Z To A' },
    { value: 'price-low', label: 'Lowest Price' },
    { value: 'price-high', label: 'Highest Price' },
  ], current);
}

/** Same tier filter Brands uses. Not offered on a brand's own page: every
 *  fragrance from one brand shares that brand's tier, so the filter would
 *  only ever show everything or nothing — never a real subset. */
function tierFilterControl(id: string, current: BrandFilter): string {
  return control(id, 'Filter by type', ICON_FILTER, [
    { value: 'all', label: 'All Types' },
    ...(['designer', 'niche', 'mideast'] as const).map((t) => ({ value: t, label: TIER_LABEL[t] })),
  ], current);
}

/* ── shared pieces ───────────────────────────────────────────────────────── */

/**
 * Name, size and concentration as one block. The brand used to live here too,
 * but it is now its own clickable control (see `brandButton`) rendered
 * beside this rather than inside it — the fragrance tile wraps most of this
 * in a button already, and a button cannot nest another interactive element.
 *
 * Size and concentration ride on the right, smaller and quieter, vertically
 * centred against the name rather than hanging off the top. Used everywhere
 * a product appears so the same product reads identically in a rail, a list
 * row and a page heading.
 *
 * `nameRole` is the type role the name itself takes. In a tile or a row the
 * product is one object among many and reads as `.t-title`; on its own detail
 * page it *is* the page heading, so that one caller passes `.t-page`. Same
 * markup, same component, one role each — rather than a `.hero .phead-name`
 * override quietly inventing a fourth heading size.
 */
function productHead(f: DemoFragrance, tag = 'span', nameRole = 't-title'): string {
  return `<${tag} class="phead">
    <span class="phead-text">
      <span class="phead-name-wrap"><span class="phead-name ${nameRole}">${esc(f.name)}</span></span>
    </span>
    <span class="phead-meta t-caption">
      <span>${f.sizeMl}ml</span>
      <span>${esc(shortConcentration(f.concentration))}</span>
    </span>
  </${tag}>`;
}

/**
 * Brand name, clickable wherever a product appears, to that brand's own
 * profile page. A real `<button>`, styled to match the `.phead-brand` label
 * it replaces, so it is reachable and activatable by keyboard exactly like
 * every other control in the app — see the delegated `data-brand` handler.
 */
function brandButton(brand: string): string {
  return `<button type="button" class="phead-brand t-eyebrow" data-brand="${esc(brand)}">${esc(brand)}</button>`;
}

function priceLine(f: DemoFragrance): string {
  const best = bestOffer(rowsFor(f));
  if (!best) return `<span class="amt none">Sold out</span>`;
  // One element, not a bare text node beside a span: .tile-price stacks its
  // children, so anything left loose would drop the arrow onto its own line.
  if (best.deliveredPriceGbp !== null) {
    return `<span class="amt">from ${formatGbp(best.deliveredPriceGbp)} <span aria-hidden="true">→</span></span>`;
  }
  // Only reachable when no shop with a stated delivery cost has it: the number
  // shown is the item price alone, and the line under it says so, because
  // "from £45" beside every other tile's delivered price would read as the
  // same kind of figure when it is not.
  return `<span class="amt">${formatGbp(best.itemPriceGbp)} <span aria-hidden="true">→</span></span>
    <span class="amt-note">delivery not stated</span>`;
}

/**
 * One tile in any grid of fragrances: the shape used for the home rail, and
 * for every browse, search, deals and retailer results list. The picture is
 * the point, sized at 90% of the tile in CSS, so this stays one component
 * rather than a compact row version and a spacious card version drifting
 * apart from each other.
 *
 * The badge names which shop the picture and price are actually from. It is
 * text, not a logo: reproducing a retailer's own mark is a trademark question
 * this project has no licence to answer, the same call already made for the
 * Retailers directory's monogram tiles.
 */
function fragranceTile(
  f: DemoFragrance,
  opts?: { rank?: number; trailing?: string; rail?: boolean },
): string {
  const rows = rowsFor(f);
  const best = bestOffer(rows);
  // No shop named once a fragrance is sold out everywhere. This used to fall
  // back to rows[0]'s retailer — the cheapest one on record even though it is
  // not buyable right now — but naming a shop under a "Sold out" tile reads as
  // "go here for it," which is exactly backwards for a shop that does not
  // currently have it. The placeholder below still holds the row's height, so
  // a sold-out tile is never shorter than an in-stock neighbour; it just
  // never claims a specific shop.
  const badgeRetailer = best?.retailer.name ?? null;
  // "from" when the figure above is a delivered price the shop won on against
  // others, "at" when it is that one shop's own item price with delivery not
  // stated — the same distinction priceLine already draws in its wording, so
  // the balloon and the number above it never disagree about what is being
  // shown.
  const badgePrefix = best && best.deliveredPriceGbp !== null ? 'from' : 'at';
  const medal = opts?.rank !== undefined && opts.rank < 3 ? MEDALS[opts.rank] : null;
  // Two sibling buttons, not one wrapping the other: the brand's own control
  // and the rest of the tile (name, art, price, shop) each need their own
  // click and keyboard target, and a button cannot contain another button.
  return `<li${opts?.rail ? ' class="pop-item"' : ''}>
    <div class="tile">
      ${brandButton(f.brand)}
      <button class="tile-body" data-frag="${f.id}" aria-label="${esc(f.brand)} ${esc(f.name)}">
        ${productHead(f)}
        <span class="tile-art">
          ${medal ? `<span class="medal ${medal}" aria-label="Number ${opts!.rank! + 1} most popular">${opts!.rank! + 1}</span>` : ''}
          ${productArt(f.photoUrl, 'md', `${f.brand} ${f.name}`)}
        </span>
        <span class="tile-price">${opts?.trailing ?? priceLine(f)}</span>
        ${badgeRetailer ? `<span class="sold-by"><span>${badgePrefix} ${esc(badgeRetailer)}</span></span>` : `<span class="sold-by" aria-hidden="true" style="visibility:hidden"><span>&nbsp;</span></span>`}
      </button>
    </div>
  </li>`;
}

/** The per-row chooser. Empty on mobile, where the count is not the reader's. */
function perRowControl(): string {
  if (state.layout !== 'desktop') return '';
  return `<label class="control">
    <span class="control-ico">${ICON_GRID}</span>
    <span class="sr">Tiles per row</span>
    <select id="per-row" class="dropdown">
      ${PER_ROW_CHOICES.map(
        (n) => `<option value="${n}" ${n === state.perRow ? 'selected' : ''}>${n} Per Row</option>`,
      ).join('')}
    </select>
    <span class="control-chevron" aria-hidden="true">${ICON_CHEVRON}</span>
  </label>`;
}

function fragranceList(list: DemoFragrance[], empty: string): string {
  if (list.length === 0) return `<p class="empty-note t-body">${esc(empty)}</p>`;
  const control = perRowControl();
  return `${control ? `<div class="controls">${control}</div>` : ''}
    <ul class="tile-grid">${chunked(list, fragranceTile)}</ul>`;
}

/* ── home ────────────────────────────────────────────────────────────────── */

const MEDALS = ['gold', 'silver', 'bronze'] as const;

function homeView(): string {
  return `
    <section class="intro">
      <div class="hero-logo">
        <p class="hero-wordmark">Price<em>Sniffs</em></p>
        <p class="hero-by">by YannySniffs</p>
      </div>
      <p class="hero-mission">The only tool you need to find the best price on any fragrance.</p>
      <p class="intro-points">
        <span>Delivery Costs Reflected</span>
        <span>Real and Live Prices</span>
        <span>No Promoted Listings</span>
      </p>
      <p class="db-count">Current Database: ${DEMO_FRAGRANCES.length.toLocaleString('en-GB')} fragrances
        <span class="live-dot" aria-hidden="true"></span><span class="sr-only"> (live)</span></p>
    </section>

    <section class="pop-section">
      <div class="section-head">
        <h3 class="t-section">Most stocked</h3>
        <button class="link-btn see-top" data-browse>See Top ${TOP_N} <span aria-hidden="true">→</span></button>
      </div>
      <ul class="pop-rail">
        ${POPULAR.map((f, i) => fragranceTile(f, { rank: i, rail: true })).join('')}
      </ul>
    </section>

    <div class="bottom-split">
      <section class="suggest-section">
        <h3 class="t-section">Got an idea?</h3>
        <p class="panel-note t-body">Tell us what you would like to see. There is no server behind this
          page, so sending opens your own email app with this addressed and ready to go.</p>
        <form id="home-suggest-form" class="contact-form">
          <label class="field">
            <span>Your suggestion</span>
            <textarea id="home-suggest-body" rows="3" placeholder="What should we add or change?"></textarea>
          </label>
          <label class="field">
            <span>Your name <span class="dimmer">(optional)</span></span>
            <input id="home-suggest-name" type="text" placeholder="So we know who to thank" />
          </label>
          <label class="field">
            <span>Your email <span class="dimmer">(optional, if you would like a reply)</span></span>
            <input id="home-suggest-email" type="email" placeholder="you@example.com" />
          </label>
          <button type="submit" class="contact-send">Send</button>
        </form>
        <p id="home-suggest-confirm" class="contact-confirm" hidden></p>
      </section>

      <section class="updates-section">
        <h3 class="t-section">Update History</h3>
        <ul class="updates-list">
          ${CHANGELOG.map(
            (entry) => {
              const isPrelaunch = entry.version.startsWith('v0.');
              return `<li class="update-entry${isPrelaunch ? ' prelaunch' : ''}">
                <p class="update-head">
                  <span class="update-version">${esc(entry.version)}</span>
                  <span class="update-date">${esc(entry.date)}</span>
                </p>
                <p class="update-title">${esc(entry.title)}</p>
                <ul class="update-points">
                  ${entry.points.map((p) => `<li>${esc(p)}</li>`).join('')}
                </ul>
              </li>`;
            },
          ).join('')}
        </ul>
      </section>
    </div>`;
}

/* ── browse ──────────────────────────────────────────────────────────────── */

function visibleFragrances(): DemoFragrance[] {
  const q = state.query.trim().toLowerCase();
  return BY_POPULARITY.filter((f) => {
    if (state.brand && f.brand !== state.brand) return false;
    if (!q) return true;
    return `${f.brand} ${f.name} ${f.concentration}`.toLowerCase().includes(q);
  });
}

function browseView(): string {
  const filtered = visibleFragrances();
  const faceted = applyFacets(filtered);
  // With no brand or query in play this is the leading list, which is capped:
  // an 879 row wall is not a starting point anyone can use.
  const isTop = !state.brand && !state.query.trim();
  const list = isTop ? faceted.slice(0, TOP_N) : faceted;
  const title = state.brand ?? (state.query.trim() ? `Results for "${state.query.trim()}"` : `Most stocked`);

  return `
    <button class="back" data-back-home>Back</button>
    <div class="page-head"><h2 class="t-page">${esc(title)}</h2><span class="count t-count">${list.length}</span></div>
    ${
      isTop
        ? `<p class="panel-note t-body">Ranked by how many of our ${SHOP_COUNT} shops carry each one, cheapest first
             where that ties. This is stock breadth, not a measure of what sells: nothing here counts
             views or purchases, so it is never presented as if it did.</p>`
        : ''
    }
    <div class="controls">${facetsBlock(filtered)}</div>
    ${fragranceList(list, 'Nothing here matches that search.')}`;
}

/* ── detail ──────────────────────────────────────────────────────────────── */

/**
 * A retailer's own feed carries only a true/false in-stock flag, never a unit
 * count — nothing this project harvests from anywhere has ever included one.
 * "(-)" says so honestly rather than being silent about it, which otherwise
 * reads as an oversight rather than a genuine gap in what shops publish.
 * Only shown against a state that claims some stock exists; "Sold out (-)"
 * would just be a confusing way to repeat "zero".
 */
function stockQtyMark(stock: StockState): string {
  return stock === 'inStock' || stock === 'lowStock' ? ' (-)' : '';
}

function offerRow(row: PresentedOffer, isBest: boolean): string {
  const d = row.discount;
  // A shop that has never published a standard delivery rate gets said out
  // loud, the same way "No longer stocked" is. Anything quieter — a blank, a
  // "Free delivery", a £0 — would be us filling in a number the shop has not
  // given, and this row is deliberately never the cheapest one as a result.
  const deliveryUnknown = row.delivery.costGbp === null;
  const sub: string[] = [
    deliveryUnknown
      ? 'Delivery not stated'
      : row.delivery.isFree
        ? 'Free delivery'
        : `plus ${formatGbp(row.delivery.costGbp!)} delivery`,
  ];
  if (row.delivery.spendMoreForFreeGbp !== null) {
    sub.push(`${formatGbp(row.delivery.spendMoreForFreeGbp)} more for free postage`);
  }

  return `<li class="offer ${isBest ? 'best' : ''} ${row.isPurchasable ? '' : 'unavail'}">
    <a class="offer-link" href="${esc(row.outboundUrl)}" rel="nofollow noopener" target="_blank">
      <span class="offer-top">
        <span class="shop t-title">${esc(row.retailer.name)}${
          isNewAt(row.variantId, row.retailer.id) ? '<span class="tag new">New</span>' : ''
        }${isBest ? '<span class="tag">Cheapest</span>' : ''}</span>
        <span class="price">
          ${d ? `<span class="was">RRP ${formatGbp(d.wasPrice)}</span>` : ''}
          <span class="now t-price ${d ? 'sale' : ''}">${formatGbp(
            row.deliveredPriceGbp ?? row.itemPriceGbp,
          )}${deliveryUnknown ? '<span class="excl-del">+ delivery</span>' : ''}</span>
        </span>
      </span>
      <span class="offer-bot">
        <span class="facts t-caption">
          <span class="dot ${STOCK_CLASS[row.stock]}"></span>${STOCK_LABEL[row.stock]}${stockQtyMark(row.stock)}
          <span class="sep">·</span>${esc(sub.join(' · '))}
        </span>
        ${d ? `<span class="off">${d.percentOff}% off RRP</span>` : ''}
      </span>
      ${
        d && canShowCountdown(d)
          ? `<span class="offer-bot"><span class="ends">Offer ${esc(countdown(d.endsAt!))}</span></span>`
          : ''
      }
    </a>
  </li>`;
}

/** A retailer this fragrance has no listing from at all, not even sold out. */
function unavailableRow(name: string): string {
  return `<li class="offer unavail-elsewhere">
    <span class="offer-link">
      <span class="offer-top">
        <span class="shop t-title">${esc(name)}</span>
        <span class="price"><span class="now none">&minus;</span></span>
      </span>
    </span>
  </li>`;
}

/** "6 Aug" — enough to place a point in time without crowding a small chart. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * The historical cheapest-price line for one fragrance, reconstructed from
 * real harvest commits — see scripts/build-price-history.ts for how. Omitted
 * entirely below two points: a single dot has no trend to show, and showing
 * one anyway would read as a chart implying history that is not there. Most
 * fragrances are below that bar today (coverage is young), which is the
 * honest state to show rather than papering over with a flat invented line.
 */
/** YYYY-MM-DD in UTC, used only to bucket points onto calendar days. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

interface DailyHistoryPoint {
  dateKey: string;
  priceGbp: number;
  retailerId: string;
  /** The real harvest timestamp this price actually came from. */
  recordedAt: string;
  /** True on a day nothing was re-harvested — the price carried forward
   *  unchanged from recordedAt rather than a fresh reading taken that day. */
  isCarried: boolean;
}

/**
 * One point per calendar day, never one per harvest event.
 *
 * The raw history can carry several points on a single busy day and none at
 * all on a quiet one — real, but noisy and gappy to plot directly. A day
 * with a real harvest takes its cheapest recorded price that day; a day with
 * none carries the last real price forward flat, which is not an invented
 * number — the price did not change, so restating it is accurate, the same
 * way a stock chart draws flat across a weekend rather than leaving a hole.
 * `isCarried` keeps that distinction visible in the tooltip rather than
 * pretending every dot was a fresh reading.
 */
function dailyHistory(points: readonly { at: string; priceGbp: number; retailerId: string }[]): DailyHistoryPoint[] {
  const byDay = new Map<string, { at: string; priceGbp: number; retailerId: string }>();
  for (const p of points) {
    const key = dayKey(p.at);
    const cheapest = byDay.get(key);
    if (!cheapest || p.priceGbp < cheapest.priceGbp) byDay.set(key, p);
  }

  const firstDay = new Date(`${dayKey(points[0]!.at)}T00:00:00Z`);
  const lastDay = new Date(`${dayKey(points.at(-1)!.at)}T00:00:00Z`);
  const totalDays = Math.round((lastDay.getTime() - firstDay.getTime()) / 86_400_000) + 1;

  const daily: DailyHistoryPoint[] = [];
  let carrying: { priceGbp: number; retailerId: string; recordedAt: string } | null = null;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(firstDay.getTime() + i * 86_400_000);
    const key = dayKey(d.toISOString());
    const real = byDay.get(key);
    if (real) {
      carrying = { priceGbp: real.priceGbp, retailerId: real.retailerId, recordedAt: real.at };
      daily.push({ dateKey: key, priceGbp: real.priceGbp, retailerId: real.retailerId, recordedAt: real.at, isCarried: false });
    } else if (carrying) {
      daily.push({ dateKey: key, priceGbp: carrying.priceGbp, retailerId: carrying.retailerId, recordedAt: carrying.recordedAt, isCarried: true });
    }
  }
  return daily;
}

/**
 * The historical cheapest-price line for one fragrance, reconstructed from
 * real harvest commits — see scripts/build-price-history.ts for how. Omitted
 * entirely below two points: a single dot has no trend to show, and showing
 * one anyway would read as a chart implying history that is not there. Most
 * fragrances are below that bar today (coverage is young), which is the
 * honest state to show rather than papering over with a flat invented line.
 *
 * ── Why the dots are not SVG circles ──────────────────────────────────────
 * The chart's own svg stretches non-uniformly to fill whatever width its
 * column happens to be (`preserveAspectRatio="none"`, needed so the line
 * fills the full card width rather than staying locked to its viewBox's own
 * aspect ratio). That stretch also warps a `<circle>`'s fill into an
 * ellipse the moment the rendered box's aspect ratio differs from the
 * viewBox's, which it usually does. Percent-positioned HTML dots, laid over
 * the svg rather than inside it, size themselves in real CSS pixels and
 * stay perfectly round regardless of how the chart around them stretches.
 */
function priceHistoryChart(f: DemoFragrance, isCurrentlyPurchasable: boolean): string {
  const raw = priceHistoryFor(f.id);
  if (raw.length < 2) return '';
  const points = dailyHistory(raw);
  if (points.length < 2) return '';

  const W = 600;
  const H = 160;
  const PAD_X_PCT = 1.3;
  const PAD_Y_PCT = 8.75;

  const prices = points.map((p) => p.priceGbp);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  // A flat line (every point the same price) would divide by zero placing y;
  // treated as its own one-point-wide band, centred, rather than crashing.
  const spanP = maxP - minP || 1;
  const lastIndex = points.length - 1;

  const xPct = (i: number): number => PAD_X_PCT + (i / (lastIndex || 1)) * (100 - PAD_X_PCT * 2);
  const yPct = (p: number): number => PAD_Y_PCT + (1 - (p - minP) / spanP) * (100 - PAD_Y_PCT * 2);

  const coordsPx = points.map((p, i) => [(xPct(i) / 100) * W, (yPct(p.priceGbp) / 100) * H] as [number, number]);
  const linePath = coordsPx.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  // Filled area under the line, purely decorative, closed back along the
  // baseline rather than the data — never read as a second data series.
  const baseY = ((100 - PAD_Y_PCT) / 100) * H;
  const areaPath = `${linePath} L${coordsPx.at(-1)![0].toFixed(1)},${baseY.toFixed(1)} L${coordsPx[0]![0].toFixed(1)},${baseY.toFixed(1)} Z`;

  const dots = points
    .map((p, i) => {
      const isLast = i === lastIndex;
      // The pulse means "this is a live price right now", so it only belongs
      // on the final point when the fragrance is actually purchasable this
      // moment — a fragrance that has since sold out everywhere still gets
      // its last known point marked as the most recent (bigger, filled), just
      // without a live animation implying a currency this data no longer has.
      const isLive = isLast && isCurrentlyPurchasable;
      const retailerName = esc(getRetailer(p.retailerId)?.name ?? p.retailerId);
      const dateLabel = p.isCarried ? `unchanged since ${shortDate(p.recordedAt)}` : shortDate(p.recordedAt);
      const label = `${formatGbp(p.priceGbp)} at ${retailerName}, ${dateLabel}`;
      return `<button
        type="button"
        class="history-dot${isLast ? ' history-dot-last' : ''}${isLive ? ' history-dot-live' : ''}"
        style="left:${xPct(i).toFixed(2)}%;top:${yPct(p.priceGbp).toFixed(2)}%"
        data-price="${esc(formatGbp(p.priceGbp))}"
        data-retailer="${retailerName}"
        data-date="${esc(dateLabel)}"
        aria-label="${label}"
      ></button>`;
    })
    .join('');

  // A label under every single day would overlap on anything but a very
  // short history, so a small, even sample is picked instead — always the
  // first and last day (the range's own edges), spread no closer than
  // MAX_LABELS apart in between.
  const MAX_LABELS = 6;
  const labelStep = Math.max(1, Math.ceil(lastIndex / (MAX_LABELS - 1)));
  const labelIndices = new Set<number>();
  for (let i = 0; i <= lastIndex; i += labelStep) labelIndices.add(i);
  labelIndices.add(lastIndex);
  const xAxis = [...labelIndices]
    .sort((a, b) => a - b)
    // dateKey, not recordedAt: a carried day's recordedAt is the earlier real
    // reading it copied forward, which would mislabel the axis with the wrong
    // date even though the tooltip is right to cite it as "unchanged since".
    .map((i) => `<span class="history-xlabel" style="left:${xPct(i).toFixed(2)}%">${esc(shortDate(points[i]!.dateKey))}</span>`)
    .join('');

  return `<div class="history-block">
    <p class="gone-head t-eyebrow">Price history</p>
    <div class="history-chart" data-history-chart>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="history-svg" aria-hidden="true" focusable="false">
        <path d="${areaPath}" class="history-area" />
        <path d="${linePath}" class="history-line" />
      </svg>
      ${dots}
      <div class="history-tip" data-history-tip hidden></div>
    </div>
    <div class="history-xaxis">${xAxis}</div>
    <p class="notes-source t-caption">One point per day — the cheapest live price recorded that day, or carried flat from the last day it changed. Tap or hover a point for the exact price, retailer and date.</p>
  </div>`;
}

function notesBlock(f: DemoFragrance): string {
  if (!f.notes) {
    return `<div class="notes-block">
      <p class="gone-head t-eyebrow">Notes</p>
      <p class="notes-none">Notes unavailable for this fragrance.</p>
    </div>`;
  }
  // The tier is a class, not a graphic: the pyramid is drawn by each layer's
  // own indent and rule weight (see .note-layer--* in the stylesheet), so it
  // holds up at 360px, in either theme, and in a screen reader's document
  // order — none of which a triangle behind the chips would do.
  const layer = (label: string, tier: 'top' | 'middle' | 'base', list: string[]) =>
    list.length === 0
      ? ''
      : `<div class="note-layer note-layer--${tier}">
           <p class="note-layer-name t-eyebrow">${label}</p>
           <p class="note-chips">${list
             .map((n) => `<button class="note-chip" data-note="${esc(n)}">${esc(titleCase(n))}</button>`)
             .join('')}</p>
         </div>`;
  return `<div class="notes-block">
    <p class="gone-head t-eyebrow">Notes</p>
    ${layer('Top', 'top', f.notes.top)}
    ${layer('Middle', 'middle', f.notes.middle)}
    ${layer('Base', 'base', f.notes.base)}
    <p class="notes-source t-caption">As published by the retailer listing it.</p>
  </div>`;
}

/** The account page's own wishlist list — a saved fragrance no longer in the
 *  live catalogue (delisted everywhere since it was saved) is skipped rather
 *  than rendered as a broken link; the row in the database is untouched, so
 *  it would reappear if the fragrance ever comes back into stock somewhere. */
function wishlistSectionHtml(): string {
  if (!state.wishlistLoaded) return `<h3 class="t-section">Wishlist</h3><p class="settings-note t-caption">Loading.</p>`;

  const rows = state.wishlistEntries
    .map((e) => ({ entry: e, frag: fragranceById(e.fragranceId) }))
    .filter((x): x is { entry: WishlistEntry; frag: DemoFragrance } => x.frag != null);

  if (rows.length === 0) {
    return `<h3 class="t-section">Wishlist</h3><p class="settings-note t-caption">Nothing saved yet. Tap Save on a fragrance to add it here.</p>`;
  }

  return `
    <h3 class="t-section">Wishlist</h3>
    <ul class="shop-list">
      ${rows
        .map(
          ({ frag }) => `<li class="wishlist-row">
            <button class="shop-row" data-frag="${esc(frag.id)}">
              ${monogram(frag.brand)}
              <span class="shop-row-text">
                <span class="shop-row-name t-title">${esc(frag.brand)} ${esc(frag.name)}</span>
                <span class="shop-row-meta t-caption">${esc(frag.concentration)}, ${frag.sizeMl}ml</span>
              </span>
              <span class="shop-row-go" aria-hidden="true">→</span>
            </button>
            <button class="wishlist-remove" data-wishlist-remove="${esc(frag.id)}"
                aria-label="Remove ${esc(frag.brand)} ${esc(frag.name)} from your wishlist">${ICON_CLOSE}</button>
          </li>`,
        )
        .join('')}
    </ul>`;
}

/** Fetches the signed-in reader's wishlist once verification is confirmed,
 *  and re-renders when it lands — see handleAuthUser in init(). */
function loadWishlist(): void {
  fetchWishlist().then((entries) => {
    state.wishlistEntries = entries;
    state.wishlistIds = new Set(entries.map((e) => e.fragranceId));
    state.wishlistLoaded = true;
    render();
  });
}

/**
 * Invisible while accounts are not configured (nothing to save into yet).
 * Once configured: an inviting "Sign in to save" for a signed out reader —
 * this is one of the few places worth nudging toward /account, since saving
 * something is exactly the moment an account earns its keep — and a real
 * on/off toggle once signed in and verified.
 */
function wishlistButton(fragranceId: string): string {
  if (!SUPABASE_CONFIGURED) return '';
  if (!state.authChecked) return '';
  if (!state.authUser || !isVerified(state.authUser)) {
    return `<button class="wishlist-toggle" data-go-account>${ICON_HEART}<span>Sign in to save</span></button>`;
  }
  const saved = state.wishlistIds.has(fragranceId);
  return `<button class="wishlist-toggle ${saved ? 'on' : ''}" data-wishlist-toggle="${esc(fragranceId)}"
      aria-pressed="${saved}" ${state.wishlistBusy ? 'disabled' : ''}>
    ${ICON_HEART}<span>${saved ? 'Saved' : 'Save'}</span>
  </button>`;
}

function detailView(): string {
  const frag = fragranceById(state.fragranceId);
  if (!frag) return homeView();

  const rows = rowsFor(frag);
  const best = bestOffer(rows);
  const live = rows.filter((r) => r.isPurchasable);
  // Alphabetical, not by price: this section is about "who usually stocks it",
  // not "who was cheapest last time it was in stock" — a price ordering would
  // read as if these were live, buyable offers, which they are not.
  const gone = rows.filter((r) => !r.isPurchasable).sort((a, b) => a.retailer.name.localeCompare(b.retailer.name));
  const newest = rows.length ? Math.min(...rows.map((r) => r.ageSeconds)) : 0;

  const shownIds = new Set(rows.map((r) => r.retailer.id));
  const missing = RETAILERS.filter((r) => !shownIds.has(r.id)).sort((a, b) => a.name.localeCompare(b.name));
  // A shop that stocks many houses and simply does not have this one is a real
  // "not available". One house's own storefront is not: Armaf's shop was never
  // going to sell a Dior bottle, so it is excluded here rather than listed as
  // a gap in that shop's range.
  const unavailable = missing.filter((r) => !cannotCarryBrand(r, frag.brand));

  return `
    <button class="back" data-back>Back</button>

    <div class="detail-grid">
      <div class="hero">
        <div class="hero-art">${productArt(frag.photoUrl, 'lg', `${frag.brand} ${frag.name}`)}</div>
        ${brandButton(frag.brand)}
        ${productHead(frag, 'div', 't-page')}
        ${wishlistButton(frag.id)}
        ${
          best
            ? best.deliveredPriceGbp !== null
              ? `<div class="price-box">
                 <p class="price-box-label t-eyebrow">Cheapest price</p>
                 <p class="price-box-amount t-price t-price--hero">${formatGbp(best.deliveredPriceGbp)}</p>
                 <p class="price-box-from t-caption">from ${esc(best.retailer.name)}, incl. delivery</p>
               </div>`
              : // No shop that states its delivery cost has this one, so there is
                // no cheapest delivered price to name. The box says what it is
                // actually showing — an item price with delivery unknown —
                // rather than calling it the cheapest anything.
                `<div class="price-box">
                 <p class="price-box-label t-eyebrow">Lowest item price</p>
                 <p class="price-box-amount t-price t-price--hero">${formatGbp(best.itemPriceGbp)}</p>
                 <p class="price-box-from t-caption">from ${esc(best.retailer.name)} &mdash; delivery not stated, so this is not a delivered price</p>
               </div>`
            : `<p class="hero-price none">Sold out everywhere<span class="hero-at">no shop has it in stock right now</span></p>`
        }
        ${notesBlock(frag)}
      </div>

      <div class="detail-offers">
        ${live.length ? '<p class="gone-head t-eyebrow">Available at</p>' : ''}
        <div class="results-head t-caption">
          <span>${live.length} ${live.length === 1 ? 'shop' : 'shops'}</span>
          <span class="dim">${
            // "delivery included" is a claim about every row underneath, so it
            // is only made when it is true of every row underneath.
            rows.some((r) => r.deliveredPriceGbp === null)
              ? 'delivery included where the shop states it'
              : 'delivery included'
          }, checked ${esc(age(newest))}</span>
        </div>

        <ul class="offers">${live.map((r) => offerRow(r, r === best)).join('')}</ul>

        ${
          gone.length
            ? `<p class="gone-head t-eyebrow">Sold out</p>
               <ul class="offers">${gone.map((r) => offerRow(r, false)).join('')}</ul>`
            : ''
        }

        ${priceHistoryChart(frag, best !== null)}

        ${
          unavailable.length
            ? `<p class="gone-head t-eyebrow">Not available</p>
               <ul class="offers">${unavailable.map((r) => unavailableRow(r.name)).join('')}</ul>`
            : ''
        }
      </div>
    </div>`;
}

/* ── explore: brands ─────────────────────────────────────────────────────── */

function brandsPanel(): string {
  const filtered = BRANDS.filter(
    (b) => state.brandFilter === 'all' || brandTierFor(b) === state.brandFilter,
  );
  const list = [...filtered].sort((a, b) =>
    state.brandSort === 'az' ? a.localeCompare(b) : b.localeCompare(a),
  );

  const controls = `<div class="controls">
    ${control('brand-sort', 'Sort brands', ICON_SORT, [
      { value: 'az', label: 'A To Z' },
      { value: 'za', label: 'Z To A' },
    ], state.brandSort)}
    ${control('brand-filter', 'Filter brands', ICON_FILTER, [
      { value: 'all', label: 'All Types' },
      ...(['designer', 'niche', 'mideast'] as const).map((t) => ({ value: t, label: TIER_LABEL[t] })),
    ], state.brandFilter)}
  </div>`;

  if (list.length === 0) {
    return `${controls}<p class="empty-note t-body">No brands match that filter yet.</p>`;
  }

  // Group under the initial so a long alphabetical list stays scannable. The
  // rule after each letter runs to the end of the column, which is what makes
  // the break read as a divider rather than a heading that happens to be short.
  let out = '';
  let current = '';
  for (const b of list) {
    const initial = (b[0] ?? '').toUpperCase();
    if (initial !== current) {
      current = initial;
      out += `<li class="alpha-break" aria-hidden="true"><span>${esc(initial)}</span><i></i></li>`;
    }
    out += `<li><button class="brand-row t-title" data-brand="${esc(b)}">${esc(b)}</button></li>`;
  }
  return `${controls}<ul class="brand-list">${out}</ul>`;
}

/* ── explore: deals ──────────────────────────────────────────────────────── */

function dealsPanel(): string {
  const sorted = [...DEALS].sort((a, b) => {
    if (state.dealSort === 'lowest') return a.price - b.price;
    if (state.dealSort === 'highest') return b.price - a.price;
    return b.percentOff - a.percentOff;
  });
  // Facets are computed and applied against the fragrance each deal is on,
  // not the deal record itself — same groups, same counts, as everywhere
  // else a fragrance list appears.
  const filtered = sorted.filter((d) => passesFacets(d.fragrance, null));

  const controls = `<div class="controls">
    ${control('deal-sort', 'Sort deals', ICON_RANK, [
      { value: 'discount', label: 'Biggest Savings (%)' },
      { value: 'lowest', label: 'Lowest Price' },
      { value: 'highest', label: 'Highest Price' },
    ], state.dealSort)}
    ${perRowControl()}
    ${facetsBlock(sorted.map((d) => d.fragrance))}
  </div>`;

  if (sorted.length === 0) {
    return `${controls}<p class="empty-note t-body">No shop is publishing a reference price right now.</p>`;
  }
  if (filtered.length === 0) {
    return `${controls}<p class="empty-note t-body">No deal matches that filter.</p>`;
  }

  const dealTile = (d: (typeof sorted)[number]) =>
    fragranceTile(d.fragrance, {
      trailing: `<span class="off">${d.percentOff}% off</span>
        <span class="amt">${formatGbp(d.price)}</span>
        <span class="was">RRP ${formatGbp(d.wasPrice)}</span>`,
    });

  return `${controls}
    <p class="panel-note t-body">Savings are against the shop's own published recommended retail price.</p>
    <ul class="tile-grid">${chunked(filtered, dealTile)}</ul>`;
}

/* ── explore: retailers ──────────────────────────────────────────────────── */

/**
 * Deterministic hue (0-359) from a name, so the same shop or brand always
 * tints the same way and different ones are visually distinct at a glance.
 * Not a lookup of that brand's real colour — this project has no licence to
 * reproduce brand identity, the same restriction .monogram's initials-only
 * rule already applies, just extended to colour. A plain djb2-style hash: no
 * cryptographic property needed, only that it is stable and spreads names
 * across the wheel rather than clustering them.
 */
function monogramHue(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 33 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** Initials, drawn as a monogram. Deliberately not a copy of the shop's logo. */
function monogram(name: string): string {
  const initials = name
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return `<span class="monogram" style="--mh:${monogramHue(name)}" aria-hidden="true">${esc(initials || '?')}</span>`;
}

function deliveryLines(r: Retailer): string[] {
  const s = r.shipping;
  const lines: string[] = [];
  lines.push(
    s.standardGbp === null
      ? 'Delivery not stated — this shop does not publish a standard delivery cost, so its prices here are item prices only and it is never ranked as cheapest'
      : s.standardGbp === 0
        ? 'Free standard delivery on every order'
        : `Standard delivery ${formatGbp(s.standardGbp)}`,
  );
  if (s.freeOverGbp !== null && s.freeOverGbp > 0) {
    lines.push(`Free once you spend ${formatGbp(s.freeOverGbp)}`);
  } else if (s.freeOverGbp === null) {
    lines.push('No spend based free delivery');
  }
  const [lo, hi] = s.estimatedDays;
  lines.push(lo === hi ? `Arrives in about ${lo} working days` : `Arrives in about ${lo} to ${hi} working days`);
  if (s.membershipPerk) {
    lines.push(`${s.membershipPerk.scheme}: ${s.membershipPerk.description}`);
  }
  return lines;
}

/**
 * How many fragrances a retailer currently lists, as the plainest mark that
 * says so: `(n)` when we hold real live data, `(-)` when we do not — a shop
 * still on fixtures, or one added but not yet enabled, has genuinely nothing
 * to report here rather than a zero that would read as "definitely none".
 */
function retailerCountMark(retailerId: string): string {
  const n = listingCountAt(retailerId);
  return n > 0 ? `(${n.toLocaleString('en-GB')})` : '(-)';
}

/**
 * The Retailers directory: shops you could go to for many different houses.
 *
 * A house's own storefront is deliberately not here. Armaf's UK shop is a
 * genuine source of a genuine sterling price — that is why it is in the
 * retailer registry at all, and why its prices appear on Armaf fragrances the
 * same as anyone else's. But it is not somewhere you browse *for fragrance*,
 * only somewhere you buy Armaf, so listing it beside Boots and Selfridges
 * invites a reader to open it expecting a shop and find a single brand.
 *
 * Those shops are reached the way they actually make sense: through the brand.
 * Explore > Brands > Armaf carries both its fragrances and the link to its own
 * site. Being a price source and being a destination to browse are two
 * different jobs, and only the second belongs in this list.
 */
function retailersPanel(): string {
  const shops = [...RETAILERS]
    .filter((r) => !r.singleBrandOnly)
    .sort((a, b) => a.name.localeCompare(b.name));
  return `<ul class="shop-list">
    ${shops
      .map((r) => {
        return `<li>
          <button class="shop-row" data-retailer="${esc(r.id)}">
            ${monogram(r.name)}
            <span class="shop-row-text">
              <span class="shop-row-name t-title">${esc(r.name)}</span>
              <span class="shop-row-meta t-caption">${retailerCountMark(r.id)}</span>
            </span>
            <span class="shop-row-go" aria-hidden="true">→</span>
          </button>
        </li>`;
      })
      .join('')}
  </ul>`;
}

/**
 * Trustpilot's own "TrustBox" embed, in its Micro Star template — a compact
 * star rating and review count, right-sized for sitting under delivery facts
 * rather than a full review carousel. Absent entirely below a configured
 * `trustpilotBusinessId`, the same rule as every other external fact in this
 * app: nothing shown is better than something guessed, and there is no way
 * to derive this id from a domain alone (see the field's own comment in
 * src/types/retailer.ts). The fallback link inside is Trustpilot's own
 * convention — if their script never loads (blocked, offline, slow), a
 * plain link to the real review page is what a reader sees instead of a
 * blank box.
 */
function trustpilotWidget(r: Retailer): string {
  if (!r.trustpilotBusinessId) return '';
  const reviewUrl = `https://uk.trustpilot.com/review/${esc(r.domain)}`;
  return `<div class="trustpilot-block">
    <div
      class="trustpilot-widget"
      data-trustpilot-widget
      data-locale="en-GB"
      data-template-id="5419b6ffb0d04a076446a9af"
      data-businessunit-id="${esc(r.trustpilotBusinessId)}"
      data-style-height="24px"
      data-style-width="100%"
      data-theme="dark"
    >
      <a href="${reviewUrl}" target="_blank" rel="noopener nofollow">See reviews on Trustpilot</a>
    </div>
  </div>`;
}

/** Whether this retailer's own offer for `f` — not any other shop's — is
 *  currently purchasable. Reads the same `isPurchasable` flag the detail
 *  page's "Available at" / "No longer stocked" split uses, just scoped down
 *  to one retailer's row instead of every row. */
function inStockAt(f: DemoFragrance, retailerId: string): boolean {
  return rowsFor(f).some((row) => row.retailer.id === retailerId && row.isPurchasable);
}

function retailerView(): string {
  const r = getRetailer(state.retailerId);
  if (!r) return exploreView();
  const filtered = fragrancesAt(r.id).filter(
    (f) => state.retailerDetailFilter === 'all' || f.tier === state.retailerDetailFilter,
  );
  const list = sortFragrances(applyFacets(filtered), state.retailerDetailSort)
    .filter((f) => !state.retailerInStockOnly || inStockAt(f, r.id));

  const controls = `<div class="controls">
    ${listSortControl('retailer-detail-sort', state.retailerDetailSort)}
    ${tierFilterControl('retailer-detail-filter', state.retailerDetailFilter)}
    ${facetsBlock(filtered)}
  </div>`;

  return `
    <button class="back" data-back-explore>Back</button>
    <div class="org-hero">
      ${monogram(r.name)}
      <div class="org-hero-text">
        <h2 class="org-hero-name t-page">${esc(r.name)} <span class="org-hero-count t-count">${retailerCountMark(r.id)}</span></h2>
        <p class="org-hero-domain t-caption">${esc(r.domain)}</p>
        ${r.blurb ? `<p class="org-hero-blurb t-body">${esc(r.blurb)}</p>` : ''}
        <ul class="fact-list">
          ${deliveryLines(r).map((l) => `<li>${esc(l)}</li>`).join('')}
        </ul>
        ${trustpilotWidget(r)}
        <label class="stock-only">
          <input type="checkbox" id="retailer-in-stock" ${state.retailerInStockOnly ? 'checked' : ''} />
          <span>In stock only</span>
        </label>
      </div>
    </div>

    <p class="gone-head t-eyebrow">${list.length} ${list.length === 1 ? 'fragrance' : 'fragrances'} here</p>
    ${controls}
    ${fragranceList(list, 'Nothing from this shop matches that filter.')}`;
}

/**
 * A brand's own profile: the same org-hero shape as a retailer, official
 * website in place of delivery facts, its fragrances underneath. The
 * website line only appears once `officialSiteFor` has a verified entry —
 * absent rather than a guessed domain, same rule as everywhere else a link
 * leaves this app.
 */
function brandView(): string {
  const b = state.brandProfile;
  if (!b) return exploreView();
  const filtered = BY_POPULARITY.filter((f) => f.brand === b);
  const list = sortFragrances(applyFacets(filtered), state.brandDetailSort);
  const site = officialSiteFor(b);
  // Products read straight from this house's own storefront, priced in
  // whatever currency it charges. Not part of the UK comparison (see the
  // houses comment above houseCard), so shown as their own group rather than
  // mixed into `list`, which is sterling delivered price all the way down.
  const houseItems = HOUSE_PRODUCTS.filter((p) => p.house === b);
  // This house's own UK shop, when we carry one. It is kept out of the
  // Retailers directory (see retailersPanel) precisely so it can surface
  // here instead, where "buy direct from the brand" is what it means.
  const ownShop = RETAILERS.find((r) => r.singleBrandOnly && !cannotCarryBrand(r, b));

  // Sort and facets, no tier filter: every fragrance from one brand shares
  // that brand's tier (brandTierFor is a function of the brand name alone),
  // so a tier filter here would only ever show everything or nothing — the
  // Type facet group already knows this and hides itself for exactly that
  // reason (an option only appears when at least two values exist).
  const controls = `<div class="controls">
    ${listSortControl('brand-detail-sort', state.brandDetailSort)}
    ${facetsBlock(filtered)}
  </div>`;

  return `
    <button class="back" data-back-explore>Back</button>
    <div class="org-hero">
      ${monogram(b)}
      <div class="org-hero-text">
        <h2 class="org-hero-name t-page">${esc(b)}</h2>
        ${
          site
            ? `<a class="brand-site-link" href="${esc(site)}" target="_blank" rel="noopener nofollow">
                 <span class="control-ico">${ICON_EXTERNAL}</span>
                 <span>Open Brand Website</span>
               </a>`
            : `<p class="org-hero-domain dimmer t-caption">Official site not yet confirmed</p>`
        }
        ${
          ownShop
            ? `<p class="org-hero-blurb t-body">Sells direct in the UK${
                ownShop.enabled
                  ? ', and its own price is compared below like any other shop’s.'
                  : ', but its delivery terms are not confirmed yet, so its price is not compared.'
              }</p>`
            : ''
        }
      </div>
    </div>

    ${
      list.length > 0
        ? `<p class="gone-head t-eyebrow">${list.length} ${list.length === 1 ? 'fragrance' : 'fragrances'}</p>
           ${controls}
           ${fragranceList(list, 'Nothing from this brand has been harvested yet.')}`
        : houseItems.length === 0
          ? fragranceList(list, 'Nothing from this brand has been harvested yet.')
          : ''
    }
    ${
      houseItems.length > 0
        ? `<p class="gone-head t-eyebrow">${houseItems.length} direct from ${esc(b)}
             <span class="dimmer">not part of the UK comparison</span></p>
           <ul class="house-grid">${chunked(houseItems, houseCard)}</ul>`
        : ''
    }`;
}

/* ── explore: notes ──────────────────────────────────────────────────────── */

const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/**
 * The vertical A-to-Z index strip, iOS Contacts-style. Mobile only — hidden
 * on desktop by CSS (`:root[data-layout="desktop"]`), where a mouse can
 * already reach any point in a shorter list without one. `aria-hidden`
 * unconditionally, on both layouts: this is a supplementary rapid-jump
 * gesture over content that already exists as an ordinary, keyboard-reachable
 * list right next to it, not a second copy of that content, so nothing here
 * needs its own accessible path — the letters underneath do.
 *
 * A letter with nothing under it still renders, just dimmed and inert
 * (`data-empty`, no `data-letter`), rather than being left out: removing it
 * would shift every letter below it sideways under the finger mid-drag,
 * which is the one thing an index strip must never do.
 */
function alphaScrubber(activeLetters: Set<string>): string {
  const letters = ALPHABET.map((l) =>
    activeLetters.has(l)
      ? `<span class="alpha-scrubber-letter" data-letter="${l}">${l}</span>`
      : `<span class="alpha-scrubber-letter" data-empty>${l}</span>`,
  ).join('');
  return `<div class="alpha-scrubber" data-alpha-scrubber aria-hidden="true">${letters}</div>`;
}

function notesPanel(): string {
  const filtered = NOTE_INDEX.filter(
    (n) => state.noteLayer === 'any' || n.layers.has(state.noteLayer),
  );
  const list = [...filtered].sort((a, b) =>
    state.noteSort === 'az' ? a.name.localeCompare(b.name) : b.count - a.count || a.name.localeCompare(b.name),
  );

  const controls = `<div class="controls">
    ${control('note-sort', 'Sort notes', ICON_SORT, [
      { value: 'common', label: 'Most Common' },
      { value: 'az', label: 'A To Z' },
    ], state.noteSort)}
    ${control('note-layer', 'Filter notes', ICON_FILTER, [
      { value: 'any', label: 'Any Layer' },
      { value: 'top', label: 'Top Notes' },
      { value: 'middle', label: 'Middle Notes' },
      { value: 'base', label: 'Base Notes' },
    ], state.noteLayer)}
  </div>`;

  // "Fragrance Note Groups" as the three layers the sourced note data
  // genuinely carries — top, middle, base — rather than a scent-family
  // taxonomy (floral, woody, gourmand...) this dataset has no real source
  // for. Tapping one filters the alphabetical list below exactly like the
  // dropdown above does; tapping the active one again clears it. "All"
  // is the same clear, offered as its own card rather than only reachable
  // by deselecting — the combined view every note actually starts on.
  const groupCard = (id: NoteLayerFilter, label: string) => {
    const count = id === 'any' ? NOTE_INDEX.length : NOTE_INDEX.filter((n) => n.layers.has(id)).length;
    return `<button class="note-group-card${state.noteLayer === id ? ' on' : ''}" data-note-layer="${id}">
      <span class="note-group-count">${count}</span>
      <span class="note-group-label">${label} Notes</span>
    </button>`;
  };
  const groups = `<div class="notes-groups">
    <p class="section-label t-eyebrow">Note Groups</p>
    <div class="notes-groups-row">
      ${groupCard('any', 'All')}
      ${groupCard('top', 'Top')}
      ${groupCard('middle', 'Middle')}
      ${groupCard('base', 'Base')}
    </div>
  </div>`;

  if (list.length === 0) {
    return `${groups}${controls}<p class="empty-note t-body">No notes recorded for that layer yet.</p>`;
  }

  // The same row-list shape as Brands, including the alphabetical dividers —
  // but only under the A-to-Z sort. Under "most common" the list is ranked by
  // count, not by letter, so a divider between two counts would land on
  // whichever letter their names happen to start with and break up entries
  // that belong together in the ranking. The scrubber follows the same rule:
  // it only makes sense to jump to a letter the list is actually ordered by.
  let out = '';
  let current = '';
  const seenLetters = new Set<string>();
  for (const n of list) {
    if (state.noteSort === 'az') {
      const initial = (n.name[0] ?? '').toUpperCase();
      if (initial !== current) {
        current = initial;
        seenLetters.add(initial);
        out += `<li class="alpha-break" data-alpha="${esc(initial)}" aria-hidden="true"><span>${esc(initial)}</span><i></i></li>`;
      }
    }
    out += `<li><button class="brand-row note-row t-title" data-note="${esc(n.name)}">
      <span>${esc(titleCase(n.name))}</span><span class="note-row-count t-count">(${n.count})</span>
    </button></li>`;
  }

  return `${groups}
    ${controls}
    <p class="panel-note t-body">Only notes a shop has explicitly published. ${DEMO_FRAGRANCES.filter((f) => f.notes).length} of ${DEMO_FRAGRANCES.length} fragrances list them.</p>
    <div class="notes-browse">
      <p class="section-label t-eyebrow">Browse Alphabetically</p>
      <div class="notes-browse-scroll" data-notes-scroll>
        <ul class="brand-list">${out}</ul>
      </div>
      ${state.noteSort === 'az' ? alphaScrubber(seenLetters) : ''}
    </div>`;
}

/**
 * A note's own profile: this page already is that, and has been since Notes
 * shipped — a real URL (survives Back, is directly linkable), every
 * fragrance that carries it. What was missing is the note's own layer
 * breakdown, added below as tappable chips that filter the list under
 * them exactly the way the group cards on notesPanel do. Real counts read
 * straight from NOTE_INDEX, not a written description: this codebase has no
 * source for what a note "smells like" beyond what a retailer's own listing
 * says, and inventing one here would be exactly the kind of fabricated fact
 * this app exists to avoid.
 */
function noteView(): string {
  const entry = NOTE_INDEX.find((n) => n.name === state.noteName);
  const filtered = fragrancesWithNote(state.noteName, state.noteLayer).filter(
    (f) => state.noteDetailFilter === 'all' || f.tier === state.noteDetailFilter,
  );
  const list = sortFragrances(applyFacets(filtered), state.noteDetailSort);

  const controls = `<div class="controls">
    ${listSortControl('note-detail-sort', state.noteDetailSort)}
    ${tierFilterControl('note-detail-filter', state.noteDetailFilter)}
    ${facetsBlock(filtered)}
  </div>`;

  const layerChips = entry
    ? (['top', 'middle', 'base'] as NoteLayer[])
        .filter((l) => entry.layers.has(l))
        .map((l) => {
          const count = fragrancesWithNote(state.noteName, l).length;
          return `<button class="note-chip${state.noteLayer === l ? ' on' : ''}" data-note-layer="${l}">${titleCase(l)} &middot; ${count}</button>`;
        })
        .join('')
    : '';

  return `
    <button class="back" data-back-explore>Back</button>
    <div class="page-head"><h2 class="t-page">${esc(titleCase(state.noteName))}</h2><span class="count t-count">${list.length}</span></div>
    ${layerChips ? `<p class="note-chips note-chips-profile">${layerChips}</p>` : ''}
    <p class="panel-note t-body">Fragrances listing ${esc(titleCase(state.noteName))}${state.noteLayer === 'any' ? '' : ` as a ${state.noteLayer} note`}.</p>
    ${controls}
    ${fragranceList(list, 'Nothing matches that filter.')}`;
}

/* ── explore: search ─────────────────────────────────────────────────────── */

/**
 * The results half of the Search tab — its own function because the live
 * keystroke handler further down replaces just this block's innerHTML rather
 * than re-rendering the whole page, and needs the exact same markup.
 */
function searchResultsHtml(q: string): string {
  if (!q) return `<p class="empty-note t-body">Type to search all ${DEMO_FRAGRANCES.length} fragrances.</p>`;
  const filtered = visibleFragrances();
  const list = applyFacets(filtered);
  return `<div class="page-head"><h2 class="t-page">Results</h2><span class="count t-count">${list.length}</span></div>
    <div class="controls">${facetsBlock(filtered)}</div>
    ${fragranceList(list, 'Nothing matches that search.')}`;
}

function searchPanel(): string {
  const q = state.query.trim();
  return `
    <label class="search-big">
      ${ICON_SEARCH}
      <input type="search" id="search-full" placeholder="Search by brand, name or concentration"
        value="${esc(state.query)}" aria-label="Search fragrances" />
    </label>
    ${
      state.brand
        ? `<p class="panel-note t-body">Filtered to ${esc(state.brand)}. <button class="link-btn" data-clear-brand>Clear</button></p>`
        : ''
    }
    <div class="search-results">${searchResultsHtml(q)}</div>`;
}

/* ── explore shell ───────────────────────────────────────────────────────── */

const TABS: { id: ExploreTab; label: string }[] = [
  { id: 'brands', label: 'Brands' },
  { id: 'deals', label: 'Top Deals Today' },
  { id: 'retailers', label: 'Retailers' },
  { id: 'notes', label: 'Notes' },
  { id: 'search', label: 'Search' },
];

function exploreView(): string {
  const panel =
    state.tab === 'brands'
      ? brandsPanel()
      : state.tab === 'deals'
        ? dealsPanel()
        : state.tab === 'retailers'
          ? retailersPanel()
          : state.tab === 'notes'
            ? notesPanel()
            : searchPanel();
  return `<div class="explore">${panel}</div>`;
}


/* ── houses ──────────────────────────────────────────────────────────────── */

/**
 * Fragrance houses read direct from their own storefronts.
 *
 * These are deliberately not in the comparison and carry no sterling price.
 * Every one is sold in the house's own currency, and the offer pipeline —
 * bestOffer, the delivered-price sort, the discount badges — is sterling all
 * the way down. Converting at a rate we invented and presenting the result as
 * what a UK buyer pays would be a fabricated price, so the house's own figure
 * is shown in its own currency and labelled as exactly that.
 *
 * What is real here: the product exists, the house photographed it, and that
 * is the price on the house's own page. What is missing is any claim about
 * the UK. Shown on that house's own brand page (see brandView) rather than a
 * section of its own, because a house with no UK listing yet is still a
 * brand, not a different kind of thing.
 */
/** One house product. Extracted so the chunked renderer can call it per item. */
function houseCard(p: (typeof HOUSE_PRODUCTS)[number]): string {
  return `<li class="house-card">
    <a href="${esc(p.url)}" target="_blank" rel="noopener nofollow sponsored">
      ${
        p.image
          ? `<img class="house-img" src="${esc(p.image)}" alt="" loading="lazy"
               decoding="async" referrerpolicy="no-referrer" />`
          : `<span class="house-img house-img-none" aria-hidden="true"></span>`
      }
      <span class="house-name">${esc(p.name)}</span>
      <span class="house-price">${
        p.nativePrice
          ? `${esc(p.nativePrice.currency)} ${p.nativePrice.amount.toFixed(2)}`
          : 'Price not published'
      }</span>
      <span class="house-caveat">at the house, not a UK price</span>
    </a>
  </li>`;
}

/* ── settings ────────────────────────────────────────────────────────────── */

const MODE_OPTIONS: { id: DisplayMode; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'Use System Setting' },
];

const CONTACT_TYPES = ['An issue', 'A suggestion', 'A promotional enquiry', 'Something else'] as const;

function settingsView(): string {
  return `
    <button class="back" data-back>Back</button>
    <article class="doc settings-doc">
      <h2 class="t-page">Settings</h2>

      ${SUPABASE_CONFIGURED ? `<button class="account-entry" data-go-account>
        <span>${accountEntryLabel()}</span>${ICON_CHEVRON}
      </button>` : ''}

      <div class="seg-group">
        <p class="seg-label t-eyebrow">Theme</p>
        <div class="seg" role="group" aria-label="Display theme">
          ${MODE_OPTIONS.map(
            (m) =>
              `<button class="seg-btn ${state.mode === m.id ? 'on' : ''}" data-set-mode="${m.id}">${esc(m.label)}</button>`,
          ).join('')}
        </div>
      </div>

      <div class="seg-group">
        <p class="seg-label t-eyebrow">Layout</p>
        <div class="seg" role="group" aria-label="Page layout">
          <button class="seg-btn seg-icon ${state.layout === 'mobile' ? 'on' : ''}" data-set-layout="mobile" aria-label="Mobile layout">${ICON_MOBILE}<span>Mobile</span></button>
          <button class="seg-btn seg-icon ${state.layout === 'desktop' ? 'on' : ''}" data-set-layout="desktop" aria-label="Desktop layout">${ICON_DESKTOP}<span>Desktop</span></button>
        </div>
      </div>

      <p class="settings-note t-caption">Your preference will be remembered on this device.</p>

      <h3 class="t-section">Contact us</h3>
      <form id="contact-form" class="contact-form">
        <label class="field">
          <span>What is this about</span>
          <select id="contact-type">
            ${CONTACT_TYPES.map((t) => `<option>${t}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Describe it</span>
          <textarea id="contact-body" rows="4" placeholder="Tell us what is going on"></textarea>
        </label>
        <button type="submit" class="contact-send">Send</button>
      </form>
      <p id="contact-confirm" class="contact-confirm" hidden></p>

      <h3 class="t-section">Follow</h3>
      <a class="social" href="https://www.tiktok.com/@yannysniffs">
        ${ICON_TIKTOK}<span>TikTok</span><span class="social-handle">@yannysniffs</span>
      </a>
      <a class="social" href="https://www.instagram.com/yannysniffs">
        ${ICON_INSTAGRAM}<span>Instagram</span><span class="social-handle">@yannysniffs</span>
      </a>

      <h3 class="t-section">Legal</h3>
      <nav class="foot-links">
        ${LEGAL_PAGES
          // About has its own place in the top bar now, so it is not repeated
          // here — this list is the legal and policy documents.
          .filter((p) => p.id !== 'about')
          .map((p) => `<button class="link-btn" data-page="${p.id}">${esc(p.short)}</button>`)
          .join('')}
      </nav>
      <p class="foot-legal dimmer">© ${new Date().getFullYear()} ${esc(COMPANY.name)}.</p>
    </article>`;
}

/* ── account ─────────────────────────────────────────────────────────────── */

/** What the Settings entry row says: enough to act on without opening the page. */
function accountEntryLabel(): string {
  if (!state.authChecked) return 'Account';
  const user = state.authUser;
  if (!user) return 'Sign in or create an account';
  if (!isVerified(user)) return 'Verify your email';
  return user.email ?? 'Account';
}

/**
 * Signed out: a tabbed sign in / sign up form. Signed in but unverified: a
 * "check your email" state with a resend action, since a Supabase account
 * exists the moment signUp() returns but is not yet allowed to do anything
 * that assumes a real, controlled address. Signed in and verified: the
 * account itself. Never a form that fails on every submit — SUPABASE_CONFIGURED
 * being false renders as a plain, honest "not live yet" state instead.
 */
function accountView(): string {
  if (!SUPABASE_CONFIGURED) {
    return `
      <button class="back" data-back>Back</button>
      <article class="doc settings-doc">
        <h2 class="t-page">Account</h2>
        <p>Accounts are not switched on for this deployment yet. Check back soon.</p>
      </article>`;
  }

  if (!state.authChecked) {
    return `<button class="back" data-back>Back</button><article class="doc settings-doc"><h2 class="t-page">Account</h2><p>Loading.</p></article>`;
  }

  const user = state.authUser;

  if (user && isVerified(user)) {
    return `
      <button class="back" data-back>Back</button>
      <article class="doc settings-doc">
        <h2 class="t-page">Account</h2>
        <p class="account-note">Signed in as ${esc(user.email ?? '')}.</p>
        <button class="contact-send" id="auth-sign-out">Sign out</button>
        ${wishlistSectionHtml()}
      </article>`;
  }

  if (user && !isVerified(user)) {
    return `
      <button class="back" data-back>Back</button>
      <article class="doc settings-doc">
        <h2 class="t-page">Verify your email</h2>
        <p class="account-note">
          We sent a link to ${esc(user.email ?? 'your email address')}. Follow it to finish setting up your
          account, then come back here.
        </p>
        <button class="contact-send" id="auth-resend" data-email="${esc(user.email ?? '')}">Resend the email</button>
        <p id="auth-notice" class="contact-confirm" hidden></p>
        <button class="link-btn" id="auth-sign-out-pending">Sign out</button>
      </article>`;
  }

  const signUpTab = state.authTab === 'signUp';
  return `
    <button class="back" data-back>Back</button>
    <article class="doc settings-doc">
      <h2 class="t-page">Account</h2>

      <div class="seg" role="group" aria-label="Sign in or sign up">
        <button class="seg-btn ${!signUpTab ? 'on' : ''}" data-auth-tab="signIn">Sign in</button>
        <button class="seg-btn ${signUpTab ? 'on' : ''}" data-auth-tab="signUp">Sign up</button>
      </div>

      <form id="${signUpTab ? 'auth-signup-form' : 'auth-signin-form'}" class="contact-form">
        <label class="field">
          <span>Email</span>
          <input type="email" id="auth-email" autocomplete="email" required />
        </label>
        <label class="field">
          <span>Password</span>
          <input type="password" id="auth-password" autocomplete="${signUpTab ? 'new-password' : 'current-password'}" required minlength="8" />
        </label>
        <button type="submit" class="contact-send" ${state.authBusy ? 'disabled' : ''}>
          ${signUpTab ? 'Create account' : 'Sign in'}
        </button>
      </form>

      ${!signUpTab ? `<button class="link-btn" id="auth-forgot">Forgot your password</button>` : ''}

      ${state.authError ? `<p class="auth-error">${esc(state.authError)}</p>` : ''}
      ${state.authResetSent ? `<p class="contact-confirm">If that address has an account, a reset link is on its way.</p>` : ''}
    </article>`;
}

/* ── legal ───────────────────────────────────────────────────────────────── */

/**
 * About, as its own top-level page beside Explore and Settings.
 *
 * Shares its copy with the legal-page registry so there is one source for the
 * text, but renders without a Back control: this is a nav destination reached
 * from the top bar, not a leaf you arrived at from somewhere else.
 */
function aboutView(): string {
  const page = legalPage('about');
  if (!page) return homeView();
  return `
    <article class="doc">
      <h2 class="t-page">${esc(page.title)}</h2>
      ${page.body}
    </article>`;
}

function legalView(): string {
  const page = legalPage(state.legalId);
  if (!page) return homeView();
  return `
    <button class="back" data-back>Back</button>
    <article class="doc">
      <h2 class="t-page">${esc(page.title)}</h2>
      ${page.body}
    </article>`;
}


/* ── long lists ──────────────────────────────────────────────────────────────
   Rendering an entire result set in one innerHTML assignment was the single
   biggest cause of the app feeling sluggish: browse-all built roughly 35,000
   nodes and 769 images synchronously, blocking the main thread for about two
   seconds before anything appeared. Measured rather than guessed — scrolling
   and the ambient background were both already holding 60fps, so the animation
   was never the problem.

   So a list paints its first screenful immediately and appends the rest a chunk
   at a time as the reader approaches the end. Nothing is hidden or dropped: the
   same items arrive, just not all in the same frame. */

const CHUNK = 48;

/**
 * Lists on the current page that still have items waiting, keyed by sentinel id.
 *
 * A map rather than a single slot because a page can hold more than one chunked
 * list: the Houses tab renders one grid per house, so a single shared slot let
 * the second group overwrite the first and the first could never finish loading
 * — it sat at 48 of its items forever with a dead sentinel below it.
 */
const pendingLists = new Map<string, { items: unknown[]; render: (item: unknown) => string }>();
let listObserver: IntersectionObserver | null = null;
let chunkSeq = 0;

/** Clear anything held for the previous page. Called at the top of render(). */
function resetChunkedLists(): void {
  listObserver?.disconnect();
  listObserver = null;
  pendingLists.clear();
  chunkSeq = 0;
}

/** Emit the first chunk plus a sentinel, and hold the remainder for later. */
function chunked<T>(items: readonly T[], renderItem: (item: T) => string): string {
  const first = items.slice(0, CHUNK);
  const rest = items.slice(CHUNK);
  if (rest.length === 0) return first.map(renderItem).join('');

  const id = `chunk-${++chunkSeq}`;
  pendingLists.set(id, {
    items: rest as unknown[],
    render: renderItem as (i: unknown) => string,
  });
  return (
    first.map(renderItem).join('') +
    `<li class="grid-more" data-more="${id}" aria-hidden="true"></li>`
  );
}

/**
 * Watch every sentinel on the page and append the next chunk as it nears view.
 *
 * insertAdjacentHTML on the sentinel leaves every already-painted tile
 * untouched, so appending never re-creates or re-decodes what is on screen.
 * The 600px margin means the next chunk is built before the reader reaches the
 * gap where it would otherwise appear.
 */
function mountChunkedList(): void {
  listObserver?.disconnect();
  listObserver = null;
  if (pendingLists.size === 0) return;

  listObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const el = entry.target as HTMLElement;
        const id = el.dataset.more;
        const held = id ? pendingLists.get(id) : undefined;
        if (!id || !held) continue;

        const next = held.items.slice(0, CHUNK);
        const rest = held.items.slice(CHUNK);
        el.insertAdjacentHTML('beforebegin', next.map(held.render).join(''));

        if (rest.length === 0) {
          pendingLists.delete(id);
          listObserver?.unobserve(el);
          el.remove();
        } else {
          pendingLists.set(id, { items: rest, render: held.render });
        }
      }
    },
    { rootMargin: '600px 0px' },
  );

  for (const el of document.querySelectorAll('[data-more]')) listObserver.observe(el);
}

/* ── price history tooltip ──────────────────────────────────────────────────
   A hover shows it, a tap pins it — the same touch has no hover state to fall
   back on, so tapping a point has to be the way it stays open rather than
   flickering shut the instant the finger lifts. Only ever one tip live at a
   time, tracked here rather than per-dot, since a fresh render replaces every
   dot in the DOM on navigation anyway. */
let pinnedHistoryDot: Element | null = null;

function positionHistoryTip(dot: Element): void {
  const chart = dot.closest('[data-history-chart]');
  const tip = chart?.querySelector('[data-history-tip]') as HTMLElement | null;
  if (!chart || !tip) return;

  tip.innerHTML =
    `<b>${esc(dot.getAttribute('data-price') ?? '')}</b>` +
    `<span>${esc(dot.getAttribute('data-retailer') ?? '')} · ${esc(dot.getAttribute('data-date') ?? '')}</span>`;
  tip.hidden = false;

  const chartRect = chart.getBoundingClientRect();
  const dotRect = dot.getBoundingClientRect();
  const dotX = dotRect.left + dotRect.width / 2 - chartRect.left;
  const y = dotRect.top - chartRect.top;

  // Centring the tip on the dot is right everywhere except the two points
  // that matter most — the first and, especially, the last (the current
  // price, the one someone is most likely to check) — which sit flush
  // against the chart's own edges and would push the tip half off-screen.
  // Measured after the content is in and unhidden, since an empty or
  // stale-content tip has the wrong width to clamp against.
  const tipWidth = tip.offsetWidth;
  const left = Math.min(Math.max(dotX - tipWidth / 2, 4), chartRect.width - tipWidth - 4);

  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(y, 40)}px`;
}

function hideHistoryTip(): void {
  for (const tip of document.querySelectorAll('[data-history-tip]')) (tip as HTMLElement).hidden = true;
  pinnedHistoryDot = null;
}

/* ── A-to-Z scrubber ─────────────────────────────────────────────────────────
   Touch-drag and tap both resolve to the same question — which letter is the
   finger over — asked continuously on touchstart and every touchmove, so a
   tap is simply a drag with zero movement rather than a separate code path. */

/**
 * Divides the strip's own height into 26 even bands and reads off which one
 * a Y coordinate falls in, rather than hit-testing via elementFromPoint: the
 * letters are laid out in one straight column with nothing else overlapping
 * them, so the geometry is simpler and does not care whether the coordinate
 * is technically still over a `<span>` once a fast drag has outrun layout.
 * A band with nothing in it (no notes for that letter) resolves to the
 * nearest real one instead of going dead, so dragging through a gap in the
 * alphabet still tracks continuously — the same feel as iOS's own strip.
 */
function letterAtY(scrubber: HTMLElement, clientY: number): string | null {
  const rect = scrubber.getBoundingClientRect();
  if (rect.height === 0) return null;
  const ratio = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 0.999);
  const index = Math.floor(ratio * ALPHABET.length);
  const isActive = (i: number) => !!scrubber.querySelector(`.alpha-scrubber-letter[data-letter="${ALPHABET[i]}"]`);
  if (isActive(index)) return ALPHABET[index]!;
  for (let d = 1; d < ALPHABET.length; d++) {
    if (index - d >= 0 && isActive(index - d)) return ALPHABET[index - d]!;
    if (index + d < ALPHABET.length && isActive(index + d)) return ALPHABET[index + d]!;
  }
  return null;
}

/** Instant, not smooth: an animated scroll lags a fast-moving finger, and the
 *  point of a scrubber is that the list keeps pace with the drag exactly. */
function jumpToLetter(letter: string): void {
  document.querySelector(`[data-notes-scroll] [data-alpha="${letter}"]`)?.scrollIntoView({ block: 'start' });
}

let scrubberBubble: HTMLElement | null = null;

function showScrubberBubble(letter: string, x: number, y: number): void {
  if (!scrubberBubble) {
    scrubberBubble = document.createElement('div');
    scrubberBubble.className = 'alpha-scrubber-bubble';
    document.body.appendChild(scrubberBubble);
  }
  scrubberBubble.textContent = letter;
  // Left of the finger and vertically centred on it, so the strip along the
  // right edge and the bubble it spawns never sit on top of each other.
  scrubberBubble.style.left = `${x - 90}px`;
  scrubberBubble.style.top = `${y - 32}px`;
}

function hideScrubberBubble(): void {
  scrubberBubble?.remove();
  scrubberBubble = null;
}

/* ── routing ─────────────────────────────────────────────────────────────────
   The view functions and render() know nothing about URLs. Everything here is
   a translation between `state` and the address bar, so routing stays
   reversible and rendering stays ignorant of it. */

/** Where we currently are, as a route. */
function currentRoute(): Route {
  const query: Record<string, string> = {};
  if (state.query) query.q = state.query;

  switch (state.view) {
    case 'home': return { name: 'home', param: '', query: {} };
    case 'browse': return { name: 'search', param: '', query };
    case 'detail': return { name: 'fragrance', param: state.fragranceId, query: {} };
    case 'retailer': return { name: 'retailer', param: state.retailerId, query: {} };
    case 'brand': return { name: 'brand', param: slugify(state.brandProfile), query: {} };
    case 'note': return { name: 'note', param: slugify(state.noteName), query: {} };
    case 'legal': return { name: 'legal', param: state.legalId, query: {} };
    case 'about': return { name: 'about', param: '', query: {} };
    case 'settings': return { name: 'settings', param: '', query: {} };
    case 'account': return { name: 'account', param: '', query: {} };
    case 'explore':
      return {
        name: state.tab === 'search' ? 'search' : (state.tab as RouteName),
        param: '',
        query: state.tab === 'search' ? query : {},
      };
  }
}

/**
 * Apply a route to `state`.
 *
 * Returns false when the route names something that does not exist — a stale
 * bookmark to a delisted fragrance, say — so the caller can fall back to home
 * rather than rendering an empty leaf.
 */
function applyRoute(route: Route): boolean {
  state.query = route.query.q ?? '';

  switch (route.name) {
    case 'home': state.view = 'home'; return true;
    case 'about': state.view = 'about'; return true;
    case 'settings': state.view = 'settings'; return true;
    case 'account': state.view = 'account'; return true;

    case 'search':
      // The bar search and the Search subpage are the same destination.
      state.view = 'browse';
      return true;

    case 'brands': case 'deals': case 'retailers': case 'notes':
      state.view = 'explore';
      state.tab = route.name as ExploreTab;
      return true;

    case 'fragrance': {
      if (!fragranceById(route.param)) return false;
      state.fragranceId = route.param;
      state.view = 'detail';
      return true;
    }
    case 'retailer': {
      if (!getRetailer(route.param)) return false;
      state.retailerId = route.param;
      state.view = 'retailer';
      return true;
    }
    case 'brand': {
      // Brand names are free text, so the slug is resolved by scanning. See
      // the collision note in router.ts.
      const brand = BRANDS.find((b) => slugify(b) === route.param);
      if (!brand) return false;
      state.brandProfile = brand;
      state.view = 'brand';
      return true;
    }
    case 'note': {
      // NOTE_INDEX is an array of {name, count, layers}, not a lookup keyed
      // by name — Object.keys() on it silently returned numeric indices
      // ('0', '1', ...) instead, so a slug never matched anything and every
      // direct link to a note (a reload, a shared URL, Back landing on one)
      // fell through to home instead. Only ever exposed via a real URL, not
      // the in-app buttons that set state.noteName directly — which is
      // exactly why it went unnoticed.
      const note = NOTE_INDEX.find((n) => slugify(n.name) === route.param)?.name;
      if (!note) return false;
      state.noteName = note;
      state.view = 'note';
      return true;
    }
    case 'legal': {
      if (!legalPage(route.param)) return false;
      state.legalId = route.param;
      state.view = 'legal';
      return true;
    }
  }
}

/**
 * How many in-app navigations deep the current history entry is.
 *
 * Carried in `history.state` itself rather than a module-level counter,
 * because a counter would only track pushes we made in this tab and would
 * drift the moment the reader used the browser's own Back/Forward — those
 * fire `popstate`, not our code, and land on whatever entry the browser
 * restores. `history.state` is restored right along with the entry by the
 * browser itself, on both Back and Forward, so reading it here always
 * reflects the page actually on screen rather than a copy we forgot to
 * update. render() replacing the DOM every navigation cannot desync it,
 * because it never touches the DOM in the first place.
 */
function historyDepth(): number {
  return (window.history.state as { depth?: number } | null)?.depth ?? 0;
}

/** Push the current state onto history, or replace the top of it. */
function syncUrl(mode: 'push' | 'replace' = 'push'): void {
  const url = basePath().replace(/\/$/, '') + routeToPath(currentRoute());
  const current = window.location.pathname + window.location.search;
  if (url === current) return;
  const depth = mode === 'push' ? historyDepth() + 1 : historyDepth();
  try {
    window.history[mode === 'push' ? 'pushState' : 'replaceState']({ depth }, '', url);
  } catch {
    // A sandboxed frame or a file:// document rejects pushState. The app is
    // fully usable without it, so this is not worth surfacing.
  }
}

/**
 * Where Back should land when there is no in-app history entry behind the
 * current one to return to — a fragrance opened from a shared link, a
 * bookmark, or GitHub Pages serving the path through 404.html, none of which
 * push anything onto the stack before this page renders. `history.back()`
 * would walk off the site in that case, so the site's own hierarchy stands
 * in for "where the reader came from" instead: a retailer, brand or note
 * page falls back to its own list, legal and account fall back to Settings
 * (the only place either is linked from), a fragrance falls back to the
 * current search results if a query or brand filter is already active
 * (mirroring what the bar search would show) and home otherwise, and
 * anything else that is not already a top-level page falls back to home.
 */
function fallbackBackRoute(): Route {
  switch (state.view) {
    case 'detail':
      return state.query || state.brand
        ? { name: 'search', param: '', query: state.query ? { q: state.query } : {} }
        : { name: 'home', param: '', query: {} };
    case 'retailer': return { name: 'retailers', param: '', query: {} };
    case 'brand': return { name: 'brands', param: '', query: {} };
    case 'note': return { name: 'notes', param: '', query: {} };
    case 'legal':
    case 'account':
      return { name: 'settings', param: '', query: {} };
    default:
      return { name: 'home', param: '', query: {} };
  }
}

/**
 * The one handler behind every "Back" button on the site.
 *
 * When the current entry was reached by an in-app navigation (`historyDepth()
 * > 0`), the previous in-app view really is the previous entry in the
 * browser's own history, so real Back is used — `history.back()` — and
 * `popstate` (wired below) takes it from there. Nothing is pushed in that
 * branch, so History does not grow and repeated presses walk back through
 * exactly the views that were visited, never further.
 *
 * When it was not (`historyDepth() === 0`: a deep link, a reload, or a fresh
 * tab), there is nothing in real history to go back to, so the fallback
 * route above is applied with `replace` rather than `push` — it rewrites the
 * current entry instead of stacking a new one, which is what keeps this from
 * turning into a two-view Back/Back loop: the next Back press (still at
 * depth 0) walks one level further up the same fixed hierarchy rather than
 * bouncing to the page just replaced.
 */
function handleBack(): void {
  if (historyDepth() > 0) {
    window.history.back();
    return;
  }
  clearFacets();
  applyRoute(fallbackBackRoute());
  render();
  syncUrl('replace');
  window.scrollTo({ top: 0 });
}

/* ── virtual yanny ───────────────────────────────────────────────────────── */

type YannyThreadItem =
  | { kind: 'msg'; who: 'user' | 'bot'; text: string }
  | { kind: 'ranking'; result: YannyResult };

const YANNY_INTENT_LABEL: Record<YannyIntent, string> = {
  price: 'Check a price',
  suggest: 'Suggest by notes',
  general: 'General question',
};
const YANNY_PLACEHOLDER: Record<YannyIntent, string> = {
  price: 'e.g. how much is Bleu de Chanel EDP?',
  suggest: 'e.g. vanilla, oud, no florals',
  general: 'Ask anything about this site…',
};

function yannyHeadHtml(): string {
  return `<div class="yanny-head">
    <span class="yanny-head-mark" aria-hidden="true">🤖</span>
    <div class="yanny-head-text">
      <p class="yanny-head-name">Virtual Yanny</p>
      <p class="yanny-head-sub">Grounded only in what this site actually shows</p>
    </div>
    <button class="yanny-close" id="yanny-close" aria-label="Close chat">${ICON_CLOSE}</button>
  </div>`;
}

function yannyRankingHtml(result: YannyResult): string {
  if (!result.ok || !result.matrix || !result.criteria) return '';
  const critKeys = result.criteria.map((c) => c.key);
  return `<details class="yanny-ranking">
    <summary>Scoring matrix, ${result.respondedCount}/${result.agentCount} agents responded, ranked anonymously</summary>
    <table>
      <thead><tr><th>Rank</th><th>Agent</th>${critKeys.map((k) => `<th>${esc(k)}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>
        ${result.matrix
          .map(
            (m) => `<tr class="${m.rank === 1 ? 'winner' : ''}">
              <td>#${m.rank}</td><td>Agent ${m.agentNumber}</td>
              ${critKeys.map((k) => `<td>${m.criteriaScores[k]}</td>`).join('')}
              <td><strong>${m.totalScore}</strong></td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </details>`;
}

function yannyThreadHtml(): string {
  const items = state.yannyThread
    .map((item) => (item.kind === 'msg' ? `<div class="yanny-msg ${item.who}">${esc(item.text)}</div>` : yannyRankingHtml(item.result)))
    .join('');

  if (!state.yannyBusy) return items;

  const chips = state.yannyAgentChips.length
    ? `<div class="yanny-agent-chips">${state.yannyAgentChips
        .map((c) => `<span class="yanny-agent-chip ${c.ok ? 'ok' : 'fail'}">Agent ${c.agentNumber} ${c.ok ? '✓' : '✗'}</span>`)
        .join('')}</div>`
    : '';
  return `${items}<div class="yanny-splash"><span class="yanny-spinner" aria-hidden="true"></span><span>${esc(state.yannySplash)}</span></div>${chips}`;
}

function yannyPanelHtml(): string {
  if (state.yannyStatus === 'idle' || state.yannyStatus === 'checking') {
    return `<div class="yanny-panel">${yannyHeadHtml()}<div class="yanny-checking"><span class="yanny-spinner" aria-hidden="true"></span></div></div>`;
  }
  if (state.yannyStatus === 'unavailable') {
    return `<div class="yanny-panel">${yannyHeadHtml()}
      <div class="yanny-unavailable">
        <div class="yanny-unavailable-mark" aria-hidden="true">🤖💤</div>
        <p>Virtual Yanny isn't available right now. Check back soon.</p>
      </div>
    </div>`;
  }

  const intent = state.yannyIntent ?? 'general';
  return `<div class="yanny-panel">
    ${yannyHeadHtml()}
    <div class="yanny-body" id="yanny-body">${yannyThreadHtml()}</div>
    <div class="yanny-options" role="group" aria-label="What is this about">
      ${(['price', 'suggest', 'general'] as const)
        .map((i) => `<button class="yanny-option-btn ${state.yannyIntent === i ? 'on' : ''}" data-yanny-intent="${i}">${YANNY_INTENT_LABEL[i]}</button>`)
        .join('')}
    </div>
    <form id="yanny-composer" class="yanny-composer">
      <label class="sr" for="yanny-input">Message Virtual Yanny</label>
      <input id="yanny-input" type="text" placeholder="${esc(YANNY_PLACEHOLDER[intent])}" autocomplete="off" ${state.yannyBusy ? 'disabled' : ''} />
      <button type="submit" aria-label="Send" ${state.yannyBusy ? 'disabled' : ''}>&#10148;</button>
    </form>
  </div>`;
}

/** Redraws just the launcher/panel pair — never the full app render(), so
 *  opening or using the chat never disturbs whatever page sits behind it. */
function renderYanny(): void {
  const launcher = $('#yanny-launcher') as HTMLElement;
  const host = $('#yanny-panel-host') as HTMLElement;
  launcher.toggleAttribute('data-open', state.yannyOpen);
  host.innerHTML = state.yannyOpen ? yannyPanelHtml() : '';
  if (state.yannyOpen && state.yannyStatus === 'ready') {
    const body = $('#yanny-body') as HTMLElement | null;
    if (body) body.scrollTop = body.scrollHeight;
  }
}

/**
 * The health check runs every single time the panel opens, never cached
 * from an earlier open in the same session — the backend or its own
 * FreeLLMAPI router can go down between one open and the next, and a stale
 * "it worked last time" would show a chat box that then hangs on the first
 * real question instead of the honest unavailable state up front.
 */
function openYanny(triggeredBy: HTMLElement): void {
  state.yannyOpen = true;
  state.yannyOpenedFrom = triggeredBy;
  state.yannyStatus = 'checking';
  renderYanny();
  (document.querySelector('#yanny-close') as HTMLElement | null)?.focus();

  checkYannyHealth().then((health) => {
    state.yannyStatus = health.ok ? 'ready' : 'unavailable';
    if (state.yannyStatus === 'ready' && state.yannyThread.length === 0) {
      state.yannyThread.push({
        kind: 'msg',
        who: 'bot',
        text: "Hi, I'm Virtual Yanny. Ask about a price, get fragrance picks by notes, or ask how this site works.",
      });
    }
    renderYanny();
    (document.querySelector('#yanny-close') as HTMLElement | null)?.focus();
  });
}

function closeYanny(): void {
  state.yannyOpen = false;
  renderYanny();
  state.yannyOpenedFrom?.focus();
  state.yannyOpenedFrom = null;
}

function sendYannyMessage(text: string): void {
  const trimmed = text.trim();
  if (!trimmed || state.yannyBusy) return;

  state.yannyThread.push({ kind: 'msg', who: 'user', text: trimmed });
  state.yannyBusy = true;
  state.yannySplash = 'Thinking…';
  state.yannyAgentChips = [];
  renderYanny();

  askVirtualYanny(trimmed, state.yannyIntent, (event: YannyEvent) => {
    if (event.type === 'status') {
      state.yannySplash = event.message;
    } else if (event.type === 'agent') {
      state.yannyAgentChips.push({ agentNumber: event.agentNumber, ok: event.ok });
    } else if (event.type === 'result') {
      state.yannyBusy = false;
      if (event.result.ok && event.result.winner) {
        state.yannyThread.push({ kind: 'msg', who: 'bot', text: event.result.winner.content });
        state.yannyThread.push({ kind: 'ranking', result: event.result });
      } else {
        state.yannyThread.push({ kind: 'msg', who: 'bot', text: `The council could not answer that: ${event.result.error ?? 'unknown error'}.` });
      }
    } else if (event.type === 'error') {
      state.yannyBusy = false;
      state.yannyThread.push({ kind: 'msg', who: 'bot', text: event.message });
    }
    renderYanny();
  });
}

/* ── chrome ──────────────────────────────────────────────────────────────── */

function render(): void {
  resetChunkedLists();
  const body =
    state.view === 'home'
      ? homeView()
      : state.view === 'explore'
        ? exploreView()
        : state.view === 'browse'
          ? browseView()
          : state.view === 'detail'
            ? detailView()
            : state.view === 'retailer'
              ? retailerView()
              : state.view === 'brand'
                ? brandView()
                : state.view === 'note'
                  ? noteView()
                  : state.view === 'about'
                    ? aboutView()
                    : state.view === 'settings'
                      ? settingsView()
                      : state.view === 'account'
                        ? accountView()
                        : legalView();

  // The wrapper is a fresh element on every render, so the rise it carries
  // just plays on insertion. No JS animation retriggering needed. It is the
  // design system's own .ps-rise (behaviour 1: content entering a view), not
  // a class of its own — this is the one block on the page that rises, and
  // one rise per block is the whole rule.
  $('#view').innerHTML = `<div class="ps-rise">${body}</div>`;

  // Any list that emitted a sentinel now gets its observer. Done here rather
  // than inside each view so no view has to remember to do it.
  mountChunkedList();

  // The sub nav belongs to Explore and its leaves, and appears nowhere else.
  const inExplore =
    state.view === 'explore' || state.view === 'retailer' || state.view === 'brand' || state.view === 'note';
  const subnav = $('#subnav') as HTMLElement;
  subnav.hidden = !inExplore;
  subnav.innerHTML = inExplore
    ? TABS.map(
        (t) => `<button class="subnavbtn ${state.tab === t.id ? 'on' : ''}" data-tab="${t.id}">${t.label}</button>`,
      ).join('')
    : '';

  ($('#nav-home') as HTMLElement).classList.toggle('on', state.view === 'home');
  ($('#nav-explore') as HTMLElement).classList.toggle('on', inExplore || state.view === 'browse');
  ($('#nav-about') as HTMLElement).classList.toggle('on', state.view === 'about');
  // Account has no top bar entry of its own yet (see settingsView's own
  // Account section) — Module 2.3 is where "profile picture click routes to
  // /account everywhere" actually redesigns navigation for accounts.
  ($('#nav-settings') as HTMLElement).classList.toggle('on', state.view === 'settings' || state.view === 'account');

  syncUpdatesHeight();
  mountTrustpilotWidgets();
}

/**
 * On desktop, the update history sits beside the suggestion box rather than
 * below it. The list of releases only grows over time, so left unchecked it
 * would run taller than the form next to it and the two columns would end at
 * different points. Capping the list's height to whatever the suggestion box
 * actually rendered at, and letting it scroll internally past that, keeps the
 * two bottoms aligned instead. Stacked on mobile, neither constraint applies,
 * so the cap is cleared there and the list just flows.
 */
function syncUpdatesHeight(): void {
  const suggest = document.querySelector('.suggest-section') as HTMLElement | null;
  const list = document.querySelector('.updates-list') as HTMLElement | null;
  if (!suggest || !list) return;
  if (state.layout !== 'desktop') {
    list.style.maxHeight = '';
    return;
  }
  // Measured from the list's own top, not the suggestion box's total height:
  // the updates column carries its own heading above the list, so matching
  // the suggestion box's full height would push the list past it. What has
  // to match is the bottom edge, so the cap is exactly the gap between where
  // the list starts and where the suggestion box ends.
  const suggestBottom = suggest.getBoundingClientRect().bottom;
  const listTop = list.getBoundingClientRect().top;
  list.style.maxHeight = `${Math.max(120, suggestBottom - listTop)}px`;
}

/** The one method this app calls on Trustpilot's own global once it loads. */
interface TrustpilotGlobal {
  loadFromElement(el: Element, forceRedirect?: boolean): void;
}

let trustpilotScriptState: 'unloaded' | 'loading' | 'loaded' = 'unloaded';

/**
 * Trustpilot's bootstrap script is loaded on demand, the first time a
 * retailer page actually has a rating configured to show — never eagerly on
 * every page load, for a third-party script that today would render nothing
 * on all but a handful of retailers. Once loaded, the same script instance
 * serves every widget for the rest of the session; this app is a client-side
 * router, so a widget appearing on the second retailer page visited is a DOM
 * mutation the bootstrap script never saw happen on its own, and
 * `loadFromElement` is Trustpilot's own documented hook for exactly that.
 */
function mountTrustpilotWidgets(): void {
  const widgets = document.querySelectorAll('[data-trustpilot-widget]');
  if (widgets.length === 0) return;

  if (trustpilotScriptState === 'loaded') {
    const tp = (window as unknown as { Trustpilot?: TrustpilotGlobal }).Trustpilot;
    widgets.forEach((el) => tp?.loadFromElement(el, true));
    return;
  }
  if (trustpilotScriptState === 'loading') return; // Its onload below covers these too.

  trustpilotScriptState = 'loading';
  const script = document.createElement('script');
  script.src = 'https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js';
  script.async = true;
  script.onload = () => {
    trustpilotScriptState = 'loaded';
    const tp = (window as unknown as { Trustpilot?: TrustpilotGlobal }).Trustpilot;
    document.querySelectorAll('[data-trustpilot-widget]').forEach((el) => tp?.loadFromElement(el, true));
  };
  // A failed load (offline, blocked) leaves the fallback link inside the
  // widget div visible, which is exactly what it is there for — no retry,
  // no error state to manage.
  document.head.appendChild(script);
}

function go(view: View): void {
  // Every navigation lands on a different list (or none at all), so facet
  // selections from wherever we just were would only ever be stale here —
  // see clearFacets' own comment.
  clearFacets();
  state.view = view;
  render();
  syncUrl('push');
  window.scrollTo({ top: 0 });
}

function openExplore(tab: ExploreTab): void {
  state.tab = tab;
  go('explore');
}

/** Re-render from whatever the address bar now says. */
function renderFromUrl(): void {
  const route = matchRoute(
    window.location.pathname.slice(basePath().replace(/\/$/, '').length) || '/',
    window.location.search,
  );
  if (!applyRoute(route)) {
    state.view = 'home';
  }
  const box = $('#search') as HTMLInputElement | null;
  if (box) box.value = state.query;
  render();
}

/* ── wiring ──────────────────────────────────────────────────────────────── */

function init(): void {
  loadMode();
  loadLayout();
  loadPerRow();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.yannyOpen) closeYanny();
  });

  // The very first render happens synchronously below, before either of
  // these callbacks can possibly fire — accountView's own `!state.authChecked`
  // branch, and wishlistButton's own `!state.authChecked` branch, are what
  // cover that gap rather than this holding up startup for every page.
  const handleAuthUser = (user: User | null) => {
    state.authUser = user;
    state.authChecked = true;
    if (user && isVerified(user)) {
      loadWishlist();
    } else {
      // A different reader may be signing in on the same device, or this one
      // just signed out — either way, the previous session's saved ids must
      // not linger and render as if they belonged to whoever is here now.
      state.wishlistIds = new Set();
      state.wishlistEntries = [];
      state.wishlistLoaded = false;
    }
    render();
  };
  currentUser().then(handleAuthUser);
  // Fires on every sign in, sign out and token refresh, including the tab
  // that just followed a verification link back in — see its own comment in
  // auth.ts for why nothing here needs to poll for that.
  onAuthChange(handleAuthUser);

  // The bar search is the quick one: type a name, get results. The Search
  // subpage under Explore is where the same query gains a brand filter and
  // room to show what it matched against.
  // Typing replaces rather than pushes: one history entry per keystroke would
  // make Back a character-by-character undo of the search box, and leaving the
  // search would take a dozen presses to escape.
  $('#search').addEventListener('input', (e) => {
    state.query = (e.target as HTMLInputElement).value;
    state.view = 'browse';
    render();
    syncUrl('replace');
  });

  const goHome = () => {
    state.query = '';
    state.brand = null;
    ($('#search') as HTMLInputElement).value = '';
    go('home');
  };

  $('#nav-home').addEventListener('click', goHome);
  $('#brand-home').addEventListener('click', goHome);
  $('#nav-explore').addEventListener('click', () => openExplore(state.tab));
  $('#nav-about').addEventListener('click', () => go('about'));
  $('#nav-settings').addEventListener('click', () => go('settings'));

  // Hover shows a price history point; leaving it hides that point again
  // unless it is the one currently pinned by a tap (see the click handler
  // below). `focusin`/`focusout` carry the identical pair for keyboard users
  // tabbing across dots, so nothing here works only for a mouse.
  document.addEventListener('mouseover', (e) => {
    const dot = (e.target as HTMLElement).closest('.history-dot');
    if (dot) positionHistoryTip(dot);
  });
  document.addEventListener('mouseout', (e) => {
    const dot = (e.target as HTMLElement).closest('.history-dot');
    if (dot && dot !== pinnedHistoryDot) hideHistoryTip();
  });
  document.addEventListener('focusin', (e) => {
    const dot = (e.target as HTMLElement).closest('.history-dot');
    if (dot) positionHistoryTip(dot);
  });
  document.addEventListener('focusout', (e) => {
    const dot = (e.target as HTMLElement).closest('.history-dot');
    if (dot && dot !== pinnedHistoryDot) hideHistoryTip();
  });

  // The A-to-Z scrubber. `{ passive: false }` is what lets preventDefault
  // actually stop the page behind it scrolling during the drag — scoped to
  // only fire when the touch itself is on the strip, so nothing about
  // scrolling anywhere else in the app is affected. touchmove's `target`
  // stays whatever touchstart hit, not whatever is under the finger now (per
  // the Touch Events spec), so `closest` here keeps resolving correctly for
  // the rest of a drag that has moved off the strip's own bounds.
  const scrubberTouch = (e: TouchEvent): void => {
    const scrubber = (e.target as HTMLElement).closest('.alpha-scrubber') as HTMLElement | null;
    if (!scrubber) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const letter = letterAtY(scrubber, touch.clientY);
    if (letter) {
      jumpToLetter(letter);
      showScrubberBubble(letter, touch.clientX, touch.clientY);
    }
  };
  document.addEventListener('touchstart', scrubberTouch, { passive: false });
  document.addEventListener('touchmove', scrubberTouch, { passive: false });
  document.addEventListener('touchend', (e) => {
    if ((e.target as HTMLElement).closest('.alpha-scrubber')) hideScrubberBubble();
  });
  document.addEventListener('touchcancel', hideScrubberBubble);

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;

    // Touch has no hover state to show a tip on, so a tap has to double as
    // both "show" and "stay open" — pinning it here is what keeps it up once
    // the finger lifts, and tapping the same point again (or anywhere else,
    // handled just below) is what closes it again.
    const historyDot = t.closest('.history-dot');
    if (historyDot) {
      if (pinnedHistoryDot === historyDot) {
        hideHistoryTip();
      } else {
        pinnedHistoryDot = historyDot;
        positionHistoryTip(historyDot);
      }
      return;
    }
    if (pinnedHistoryDot && !t.closest('.history-tip')) hideHistoryTip();

    // Deliberately not `data-mode`: that attribute lives on <html> to drive the
    // palette, and closest() would match it for every click in the app.
    const modeBtn = t.closest('[data-set-mode]');
    if (modeBtn) {
      setMode(modeBtn.getAttribute('data-set-mode') as DisplayMode);
      render();
      return;
    }

    const layoutBtn = t.closest('[data-set-layout]');
    if (layoutBtn) {
      setLayout(layoutBtn.getAttribute('data-set-layout') as Layout);
      render();
      return;
    }

    const tab = t.closest('[data-tab]');
    if (tab) {
      openExplore(tab.getAttribute('data-tab') as ExploreTab);
      return;
    }

    const card = t.closest('[data-frag]');
    if (card) {
      state.fragranceId = card.getAttribute('data-frag')!;
      go('detail');
      return;
    }

    const shop = t.closest('[data-retailer]');
    if (shop) {
      state.retailerId = shop.getAttribute('data-retailer')!;
      go('retailer');
      return;
    }

    const note = t.closest('[data-note]');
    if (note) {
      state.noteName = note.getAttribute('data-note')!;
      go('note');
      return;
    }

    // A group card filters the alphabetical list below it in place, the same
    // in-panel update the layer dropdown already does — clicking the active
    // one again clears back to "any", the same toggle a filter chip implies.
    const noteGroup = t.closest('[data-note-layer]');
    if (noteGroup) {
      const layer = noteGroup.getAttribute('data-note-layer') as NoteLayerFilter;
      state.noteLayer = state.noteLayer === layer ? 'any' : layer;
      render();
      return;
    }

    const page = t.closest('[data-page]');
    if (page) {
      state.legalId = page.getAttribute('data-page')!;
      go('legal');
      return;
    }

    if (t.closest('[data-go-account]')) {
      go('account');
      return;
    }

    if (t.closest('#yanny-launcher')) {
      openYanny(t.closest('#yanny-launcher') as HTMLElement);
      return;
    }
    if (t.closest('#yanny-close')) {
      closeYanny();
      return;
    }
    const yannyIntentBtn = t.closest('[data-yanny-intent]');
    if (yannyIntentBtn) {
      const intent = yannyIntentBtn.getAttribute('data-yanny-intent') as YannyIntent;
      state.yannyIntent = state.yannyIntent === intent ? null : intent;
      renderYanny();
      (document.querySelector('#yanny-input') as HTMLElement | null)?.focus();
      return;
    }

    const authTabBtn = t.closest('[data-auth-tab]');
    if (authTabBtn) {
      state.authTab = authTabBtn.getAttribute('data-auth-tab') as AuthTab;
      state.authError = '';
      state.authResetSent = false;
      render();
      return;
    }

    if (t.closest('#auth-sign-out') || t.closest('#auth-sign-out-pending')) {
      void signOut();
      return;
    }

    const resendBtn = t.closest('#auth-resend');
    if (resendBtn) {
      const email = resendBtn.getAttribute('data-email') ?? '';
      const notice = $('#auth-notice') as HTMLElement;
      resendVerification(email).then((result) => {
        notice.textContent = result.ok
          ? 'Sent. Check your inbox again in a moment.'
          : result.message;
        notice.hidden = false;
      });
      return;
    }

    if (t.closest('#auth-forgot')) {
      const email = ($('#auth-email') as HTMLInputElement | null)?.value.trim() ?? '';
      if (!email) {
        state.authError = 'Enter your email above first, then tap Forgot your password again.';
        render();
        return;
      }
      state.authBusy = true;
      state.authError = '';
      render();
      requestPasswordReset(email).then((result) => {
        state.authBusy = false;
        state.authResetSent = result.ok;
        state.authError = result.ok ? '' : result.message;
        render();
      });
      return;
    }

    const wishlistRemoveBtn = t.closest('[data-wishlist-remove]');
    if (wishlistRemoveBtn) {
      const fragranceId = wishlistRemoveBtn.getAttribute('data-wishlist-remove')!;
      state.wishlistIds.delete(fragranceId);
      state.wishlistEntries = state.wishlistEntries.filter((e) => e.fragranceId !== fragranceId);
      render();
      removeFromWishlist(fragranceId).then((result) => {
        if (!result.ok) {
          // Roll back by reloading from the server rather than guessing what
          // the entry's own target price was, since this optimistic removal
          // already discarded it.
          loadWishlist();
        }
      });
      return;
    }

    const wishlistBtn = t.closest('[data-wishlist-toggle]');
    if (wishlistBtn) {
      const fragranceId = wishlistBtn.getAttribute('data-wishlist-toggle')!;
      const saved = state.wishlistIds.has(fragranceId);
      state.wishlistBusy = true;
      // Reflects the change immediately rather than waiting on the round
      // trip — a save button that visibly lags behind the tap reads as
      // broken, and the worst case of being wrong is a re-render once the
      // request actually settles a moment later.
      if (saved) state.wishlistIds.delete(fragranceId);
      else state.wishlistIds.add(fragranceId);
      render();
      const action = saved ? removeFromWishlist(fragranceId) : addToWishlist(fragranceId);
      action.then((result) => {
        state.wishlistBusy = false;
        if (!result.ok) {
          // Roll back: the optimistic flip above did not actually happen.
          if (saved) state.wishlistIds.add(fragranceId);
          else state.wishlistIds.delete(fragranceId);
        }
        render();
      });
      return;
    }

    if (t.closest('[data-browse]')) {
      state.brand = null;
      go('browse');
      return;
    }

    const brandOpt = t.closest('[data-brand]');
    if (brandOpt) {
      state.brandProfile = brandOpt.getAttribute('data-brand')!;
      go('brand');
      return;
    }

    if (t.closest('[data-back-explore], [data-back], [data-back-home]')) {
      handleBack();
      return;
    }

    if (t.closest('[data-clear-brand]')) {
      state.brand = null;
      render();
      return;
    }

    if (t.closest('[data-facets-toggle]')) {
      state.facetsOpen = !state.facetsOpen;
      render();
      return;
    }

    if (t.closest('[data-facets-clear]')) {
      clearFacets();
      state.facetsOpen = true; // stay open — the reader is mid-filtering, not leaving the page
      render();
      return;
    }

    const facetPillBtn = t.closest<HTMLElement>('[data-facet-group]');
    if (facetPillBtn) {
      const group = facetPillBtn.getAttribute('data-facet-group') as FacetGroup;
      const value = facetPillBtn.getAttribute('data-facet-value')!;
      // Two shapes: most groups are a Set toggled by value, onSale/inStock
      // are single booleans — same data-facet-group/value markup either way,
      // read differently by group id.
      if (group === 'onSale') state.facetOnSale = !state.facetOnSale;
      else if (group === 'inStock') state.facetInStock = !state.facetInStock;
      else if (group === 'volume') toggleInSet(state.facetVolume, Number(value));
      else if (group === 'concentration') toggleInSet(state.facetConcentration, value);
      else if (group === 'priceBand') toggleInSet(state.facetPriceBand, value as PriceBand);
      else if (group === 'tier') toggleInSet(state.facetTier, value as RetailerTier);
      render();
      return;
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (t.id !== 'search-full') return;
    state.query = (t as HTMLInputElement).value;
    ($('#search') as HTMLInputElement).value = state.query;
    // Re-rendering would tear out the field mid keystroke and lose focus, so
    // only the results below it are replaced.
    const panel = $('.explore') as HTMLElement;
    const results = panel.querySelector('.search-results');
    if (results) results.innerHTML = searchResultsHtml(state.query.trim());
  });

  document.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    const id = t.id;
    const value = (t as HTMLSelectElement).value;
    if (id === 'brand-sort') state.brandSort = value as BrandSort;
    else if (id === 'brand-filter') state.brandFilter = value as BrandFilter;
    else if (id === 'deal-sort') state.dealSort = value as DealSort;
    else if (id === 'note-sort') state.noteSort = value as NoteSort;
    else if (id === 'note-layer') state.noteLayer = value as NoteLayerFilter;
    else if (id === 'note-detail-sort') state.noteDetailSort = value as ListSort;
    else if (id === 'note-detail-filter') state.noteDetailFilter = value as BrandFilter;
    else if (id === 'brand-detail-sort') state.brandDetailSort = value as ListSort;
    else if (id === 'retailer-detail-sort') state.retailerDetailSort = value as ListSort;
    else if (id === 'retailer-detail-filter') state.retailerDetailFilter = value as BrandFilter;
    else if (id === 'retailer-in-stock') state.retailerInStockOnly = (t as HTMLInputElement).checked;
    else if (id === 'per-row') {
      // The grid reads a CSS variable, so the columns reflow without a
      // re-render. Returning early also keeps the search box from losing
      // focus mid-typing on the search panel.
      setPerRow(Number(value));
      return;
    } else return;
    render();
  });

  // There is no server behind this page, so "send" means handing the message to
  // the reader's own email app, not silently claiming it reached us. The
  // confirmation says exactly that rather than pretending we received it.
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLElement;
    if (form.id === 'home-suggest-form') {
      e.preventDefault();
      const suggestion = ($('#home-suggest-body') as HTMLTextAreaElement).value.trim();
      const name = ($('#home-suggest-name') as HTMLInputElement).value.trim();
      const email = ($('#home-suggest-email') as HTMLInputElement).value.trim();
      const subject = `PriceSniffs: A suggestion`;
      const body = [
        suggestion,
        name ? `\nFrom: ${name}` : '',
        email ? `Reply to: ${email}` : '',
      ].filter(Boolean).join('\n');
      const mailto = `mailto:${COMPANY.feedbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;

      const confirm = $('#home-suggest-confirm') as HTMLElement;
      confirm.textContent = `Your email app should now be open with your suggestion ready to send. Hit send there to reach us, we really appreciate it.`;
      confirm.hidden = false;
      return;
    }
    if (form.id === 'yanny-composer') {
      e.preventDefault();
      const input = $('#yanny-input') as HTMLInputElement;
      const text = input.value;
      input.value = '';
      sendYannyMessage(text);
      return;
    }
    if (form.id === 'auth-signin-form' || form.id === 'auth-signup-form') {
      e.preventDefault();
      const email = ($('#auth-email') as HTMLInputElement).value.trim();
      const password = ($('#auth-password') as HTMLInputElement).value;
      state.authBusy = true;
      state.authError = '';
      state.authResetSent = false;
      render();
      const action = form.id === 'auth-signup-form' ? signUp(email, password) : signIn(email, password);
      action.then((result) => {
        state.authBusy = false;
        if (!result.ok) {
          state.authError = result.message;
          render();
          return;
        }
        if (form.id === 'auth-signup-form') state.authPendingEmail = email;
        // A successful sign in updates state.authUser itself via
        // onAuthChange (see init), which re-renders once the session is
        // actually confirmed rather than optimistically here.
        render();
      });
      return;
    }
    if (form.id !== 'contact-form') return;
    e.preventDefault();

    const type = ($('#contact-type') as HTMLSelectElement).value;
    const body = ($('#contact-body') as HTMLTextAreaElement).value.trim();
    const subject = `PriceSniffs: ${type}`;
    const mailto = `mailto:${COMPANY.feedbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;

    const confirm = $('#contact-confirm') as HTMLElement;
    confirm.textContent = `Your email app should now be open with your ${type.toLowerCase()} ready to send. Hit send there to reach us, we really appreciate it.`;
    confirm.hidden = false;
  });

  // Back and Forward must move within the app, not out of it. popstate is the
  // only place the address bar is the source of truth: it has already changed
  // by the time this fires, so state follows it rather than the other way
  // round, and nothing is pushed in response or the history would grow on
  // every Back press.
  window.addEventListener('popstate', () => {
    renderFromUrl();
    window.scrollTo({ top: 0 });
  });

  // A window resize can change how the suggestion box wraps (and so its
  // height) without touching state or triggering a re-render on its own, so
  // the update list's cap would otherwise go stale until the next navigation.
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(syncUpdatesHeight, 120);
  });

  // First paint comes from whatever URL we were opened at, so a deep link,
  // a bookmark or a shared link lands on the right view. replaceState then
  // normalises the address bar without adding a history entry — an unmatched
  // path served through 404.html becomes "/" rather than staying a URL that
  // renders home while claiming to be something else.
  renderFromUrl();
  syncUrl('replace');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export type { ArtSize };

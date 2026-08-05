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
import { buildComparison, bestOffer, canShowCountdown, formatGbp, RETAILERS, getRetailer } from '../src/index.js';
import type { PresentedOffer, StockState } from '../src/types/offer.js';
import type { Retailer, RetailerTier } from '../src/types/retailer.js';
import {
  DEMO_FRAGRANCES, BY_POPULARITY, DEALS, NOTE_INDEX,
  brandTierFor, fragranceById, fragrancesAt, listingCountAt, fragrancesWithNote, lowestPrice,
  type DemoFragrance, type NoteLayer,
} from './data.js';
import { productArt, type ArtSize } from './photo.js';
import { COMPANY, LEGAL_PAGES, legalPage } from './legal.js';
import { isNewAt, offersFor, SHOP_COUNT, HOUSE_PRODUCTS } from './catalogue.generated.js';
import { officialSiteFor } from './brandSites.js';
import { matchRoute, routeToPath, slugify, basePath, type Route, type RouteName } from './router.js';

type View = 'home' | 'explore' | 'browse' | 'detail' | 'retailer' | 'brand' | 'note' | 'legal' | 'settings';
type ExploreTab = 'brands' | 'deals' | 'retailers' | 'houses' | 'notes' | 'search';
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
};

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

const BRANDS = [...new Set(DEMO_FRAGRANCES.map((f) => f.brand))].sort();
const TIER_LABEL: Record<RetailerTier, string> = {
  designer: 'Designer', niche: 'Niche', mideast: 'Middle Eastern',
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
const ICON_SEARCH = icon('<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>');
const ICON_GRID = icon('<rect x="3" y="3" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/>');
const ICON_MOBILE = icon('<rect x="7" y="2.5" width="10" height="19" rx="2.5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="18.3" r=".9" fill="currentColor"/>');
const ICON_DESKTOP = icon('<rect x="2.5" y="4" width="19" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 21h7M12 17v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>');
/* Neutral marks, not TikTok's or Instagram's own logos: this project has no
   licence to reproduce those. */
const ICON_TIKTOK = icon('<path d="M14 3v11.2a3.3 3.3 0 1 1-3.3-3.3c.3 0 .6 0 .9.1V8.4a6.1 6.1 0 1 0 5.1 6V9.8a7.5 7.5 0 0 0 4.3 1.4V8.5A4.6 4.6 0 0 1 17 4.5V3h-3Z" fill="currentColor"/>');
const ICON_INSTAGRAM = icon('<rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.8"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor"/>');

/** A labelled dropdown with its icon, used for every sort and filter control. */
function control(id: string, label: string, ico: string, options: { value: string; label: string }[], current: string): string {
  return `<label class="control">
    <span class="control-ico">${ico}</span>
    <span class="sr">${esc(label)}</span>
    <select id="${id}" class="dropdown">
      ${options.map((o) => `<option value="${esc(o.value)}" ${o.value === current ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>
  </label>`;
}

/**
 * The one sort applied to a fragrance list scoped to a single note, brand or
 * retailer: alphabetical both ways, price both ways. Shared so the three
 * pages that use it cannot drift into three slightly different orderings.
 */
function sortFragrances(list: DemoFragrance[], sort: ListSort): DemoFragrance[] {
  return [...list].sort((a, b) => {
    if (sort === 'az') return `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`);
    if (sort === 'za') return `${b.brand} ${b.name}`.localeCompare(`${a.brand} ${a.name}`);
    const diff = lowestPrice(a.id) - lowestPrice(b.id);
    return sort === 'price-low' ? diff : -diff;
  });
}

function listSortControl(id: string, current: ListSort): string {
  return control(id, 'Sort fragrances', ICON_SORT, [
    { value: 'az', label: 'A to Z' },
    { value: 'za', label: 'Z to A' },
    { value: 'price-low', label: 'Lowest price' },
    { value: 'price-high', label: 'Highest price' },
  ], current);
}

/** Same tier filter Brands uses. Not offered on a brand's own page: every
 *  fragrance from one brand shares that brand's tier, so the filter would
 *  only ever show everything or nothing — never a real subset. */
function tierFilterControl(id: string, current: BrandFilter): string {
  return control(id, 'Filter by type', ICON_FILTER, [
    { value: 'all', label: 'All types' },
    ...(['designer', 'niche', 'mideast'] as const).map((t) => ({ value: t, label: TIER_LABEL[t] })),
  ], current);
}

/* ── shared pieces ───────────────────────────────────────────────────────── */

/**
 * Brand, name, size and concentration as one block.
 *
 * Brand and name sit together on the left; size and concentration ride on the
 * right, smaller and quieter, vertically centred against them rather than
 * hanging off the top. Used everywhere a product appears so the same product
 * reads identically in a rail, a list row and a page heading.
 */
function productHead(f: DemoFragrance, tag = 'span'): string {
  return `<${tag} class="phead">
    <span class="phead-text">
      <span class="phead-brand">${esc(f.brand)}</span>
      <span class="phead-name-wrap"><span class="phead-name">${esc(f.name)}</span></span>
    </span>
    <span class="phead-meta">
      <span>${f.sizeMl}ml</span>
      <span>${esc(shortConcentration(f.concentration))}</span>
    </span>
  </${tag}>`;
}

function priceLine(f: DemoFragrance): string {
  const best = bestOffer(rowsFor(f));
  // One element, not a bare text node beside a span: .tile-price stacks its
  // children, so anything left loose would drop the arrow onto its own line.
  return best
    ? `<span class="amt">from ${formatGbp(best.deliveredPriceGbp)} <span aria-hidden="true">→</span></span>`
    : `<span class="amt none">Sold out</span>`;
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
  // Sold out everywhere still names a shop, the cheapest one on record even
  // though it is not buyable right now — never bare "Sold out" floating with
  // no attribution, and never a shorter tile than an in-stock neighbour in
  // the same row. Only a fragrance with zero rows ever (should not happen in
  // real data — every listed fragrance came from at least one real offer)
  // falls back to an invisible placeholder, purely to hold the row's height.
  const badgeRetailer = best?.retailer.name ?? rows[0]?.retailer.name ?? null;
  const medal = opts?.rank !== undefined && opts.rank < 3 ? MEDALS[opts.rank] : null;
  return `<li${opts?.rail ? ' class="pop-item"' : ''}>
    <button class="tile" data-frag="${f.id}">
      ${productHead(f)}
      <span class="tile-art">
        ${medal ? `<span class="medal ${medal}" aria-label="Number ${opts!.rank! + 1} most popular">${opts!.rank! + 1}</span>` : ''}
        ${productArt(f.photoUrl, 'md', `${f.brand} ${f.name}`)}
      </span>
      <span class="tile-price">${opts?.trailing ?? priceLine(f)}</span>
      ${badgeRetailer ? `<span class="sold-by">${esc(badgeRetailer)}</span>` : `<span class="sold-by" aria-hidden="true" style="visibility:hidden">&nbsp;</span>`}
    </button>
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
        (n) => `<option value="${n}" ${n === state.perRow ? 'selected' : ''}>${n} per row</option>`,
      ).join('')}
    </select>
  </label>`;
}

function fragranceList(list: DemoFragrance[], empty: string): string {
  if (list.length === 0) return `<p class="empty-note">${esc(empty)}</p>`;
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
      <ul class="intro-points">
        <li><span>Delivery Costs Reflected</span></li>
        <li><span>Real and Live Prices</span></li>
        <li><span>No Promoted Listings</span></li>
      </ul>
      <p class="db-count">Current Database: ${DEMO_FRAGRANCES.length.toLocaleString('en-GB')} fragrances</p>
    </section>

    <section class="pop-section">
      <div class="section-head">
        <h3>Most stocked</h3>
        <button class="link-btn" data-browse>See top ${TOP_N}</button>
      </div>
      <ul class="pop-rail">
        ${POPULAR.map((f, i) => fragranceTile(f, { rank: i, rail: true })).join('')}
      </ul>
    </section>`;
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
  // With no brand or query in play this is the leading list, which is capped:
  // an 879 row wall is not a starting point anyone can use.
  const isTop = !state.brand && !state.query.trim();
  const list = isTop ? filtered.slice(0, TOP_N) : filtered;
  const title = state.brand ?? (state.query.trim() ? `Results for "${state.query.trim()}"` : `Most stocked`);

  return `
    <button class="back" data-back-home>Back</button>
    <div class="page-head"><h2>${esc(title)}</h2><span class="count">${list.length}</span></div>
    ${
      isTop
        ? `<p class="panel-note">Ranked by how many of our ${SHOP_COUNT} shops carry each one, cheapest first
             where that ties. This is stock breadth, not a measure of what sells: nothing here counts
             views or purchases, so it is never presented as if it did.</p>`
        : ''
    }
    ${fragranceList(list, 'Nothing here matches that search.')}`;
}

/* ── detail ──────────────────────────────────────────────────────────────── */

function offerRow(row: PresentedOffer, isBest: boolean): string {
  const d = row.discount;
  const sub: string[] = [
    row.delivery.isFree ? 'Free delivery' : `plus ${formatGbp(row.delivery.costGbp)} delivery`,
  ];
  if (row.delivery.spendMoreForFreeGbp !== null) {
    sub.push(`${formatGbp(row.delivery.spendMoreForFreeGbp)} more for free postage`);
  }

  return `<li class="offer ${isBest ? 'best' : ''} ${row.isPurchasable ? '' : 'unavail'}">
    <a class="offer-link" href="${esc(row.outboundUrl)}" rel="nofollow noopener" target="_blank">
      <span class="offer-top">
        <span class="shop">${esc(row.retailer.name)}${
          isNewAt(row.variantId, row.retailer.id) ? '<span class="tag new">New</span>' : ''
        }${isBest ? '<span class="tag">Cheapest</span>' : ''}</span>
        <span class="price">
          ${d ? `<span class="was">RRP ${formatGbp(d.wasPrice)}</span>` : ''}
          <span class="now ${d ? 'sale' : ''}">${formatGbp(row.deliveredPriceGbp)}</span>
        </span>
      </span>
      <span class="offer-bot">
        <span class="facts">
          <span class="dot ${STOCK_CLASS[row.stock]}"></span>${STOCK_LABEL[row.stock]}
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
        <span class="shop">${esc(name)}</span>
        <span class="price"><span class="now none">&minus;</span></span>
      </span>
    </span>
  </li>`;
}

function notesBlock(f: DemoFragrance): string {
  if (!f.notes) {
    return `<div class="notes-block">
      <p class="gone-head">Notes</p>
      <p class="notes-none">Notes unavailable for this fragrance.</p>
    </div>`;
  }
  const layer = (label: string, list: string[]) =>
    list.length === 0
      ? ''
      : `<div class="note-layer">
           <p class="note-layer-name">${label}</p>
           <p class="note-chips">${list
             .map((n) => `<button class="note-chip" data-note="${esc(n)}">${esc(titleCase(n))}</button>`)
             .join('')}</p>
         </div>`;
  return `<div class="notes-block">
    <p class="gone-head">Notes</p>
    ${layer('Top', f.notes.top)}
    ${layer('Middle', f.notes.middle)}
    ${layer('Base', f.notes.base)}
    <p class="notes-source">As published by the retailer listing it.</p>
  </div>`;
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
  const unavailable = RETAILERS.filter((r) => !shownIds.has(r.id)).sort((a, b) => a.name.localeCompare(b.name));

  return `
    <button class="back" data-back>Back</button>

    <div class="detail-grid">
      <div class="hero">
        <div class="hero-art">${productArt(frag.photoUrl, 'lg', `${frag.brand} ${frag.name}`)}</div>
        ${productHead(frag, 'div')}
        ${
          best
            ? `<div class="price-box">
                 <p class="price-box-label">Cheapest price</p>
                 <p class="price-box-amount">${formatGbp(best.deliveredPriceGbp)}</p>
                 <p class="price-box-from">from ${esc(best.retailer.name)}, incl. delivery</p>
               </div>`
            : `<p class="hero-price none">Sold out everywhere<span class="hero-at">no shop has it in stock right now</span></p>`
        }
        ${notesBlock(frag)}
      </div>

      <div class="detail-offers">
        <div class="results-head">
          <span>${live.length} ${live.length === 1 ? 'shop' : 'shops'}</span>
          <span class="dim">delivery included, checked ${esc(age(newest))}</span>
        </div>

        <ul class="offers">${live.map((r) => offerRow(r, r === best)).join('')}</ul>

        ${
          gone.length
            ? `<p class="gone-head">Sold out</p>
               <ul class="offers">${gone.map((r) => offerRow(r, false)).join('')}</ul>`
            : ''
        }

        ${
          unavailable.length
            ? `<p class="gone-head">Not available</p>
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
      { value: 'az', label: 'A to Z' },
      { value: 'za', label: 'Z to A' },
    ], state.brandSort)}
    ${control('brand-filter', 'Filter brands', ICON_FILTER, [
      { value: 'all', label: 'All types' },
      ...(['designer', 'niche', 'mideast'] as const).map((t) => ({ value: t, label: TIER_LABEL[t] })),
    ], state.brandFilter)}
  </div>`;

  if (list.length === 0) {
    return `${controls}<p class="empty-note">No brands match that filter yet.</p>`;
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
    out += `<li><button class="brand-row" data-brand="${esc(b)}">${esc(b)}</button></li>`;
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

  const controls = `<div class="controls">
    ${control('deal-sort', 'Sort deals', ICON_RANK, [
      { value: 'discount', label: 'Biggest saving' },
      { value: 'lowest', label: 'Lowest price' },
      { value: 'highest', label: 'Highest price' },
    ], state.dealSort)}
    ${perRowControl()}
  </div>`;

  if (sorted.length === 0) {
    return `${controls}<p class="empty-note">No shop is publishing a reference price right now.</p>`;
  }

  const dealTile = (d: (typeof sorted)[number]) =>
    fragranceTile(d.fragrance, {
      trailing: `<span class="off">${d.percentOff}% off</span>
        <span class="amt">${formatGbp(d.price)}</span>
        <span class="was">RRP ${formatGbp(d.wasPrice)}</span>`,
    });

  return `${controls}
    <p class="panel-note">Savings are against the shop's own published recommended retail price.</p>
    <ul class="tile-grid">${chunked(sorted, dealTile)}</ul>`;
}

/* ── explore: retailers ──────────────────────────────────────────────────── */

/** Initials, drawn as a monogram. Deliberately not a copy of the shop's logo. */
function monogram(name: string): string {
  const initials = name
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return `<span class="monogram" aria-hidden="true">${esc(initials || '?')}</span>`;
}

function deliveryLines(r: Retailer): string[] {
  const s = r.shipping;
  const lines: string[] = [];
  lines.push(
    s.standardGbp === null
      ? 'Standard delivery cost not yet confirmed'
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

function retailersPanel(): string {
  const shops = [...RETAILERS].sort((a, b) => a.name.localeCompare(b.name));
  return `<ul class="shop-list">
    ${shops
      .map((r) => {
        const n = listingCountAt(r.id);
        return `<li>
          <button class="shop-row" data-retailer="${esc(r.id)}">
            ${monogram(r.name)}
            <span class="shop-row-text">
              <span class="shop-row-name">${esc(r.name)}</span>
              <span class="shop-row-meta">${n > 0 ? `${n} fragrances listed` : 'No listings yet'}</span>
            </span>
            <span class="shop-row-go" aria-hidden="true">→</span>
          </button>
        </li>`;
      })
      .join('')}
  </ul>`;
}

function retailerView(): string {
  const r = getRetailer(state.retailerId);
  if (!r) return exploreView();
  const filtered = fragrancesAt(r.id).filter(
    (f) => state.retailerDetailFilter === 'all' || f.tier === state.retailerDetailFilter,
  );
  const list = sortFragrances(filtered, state.retailerDetailSort);

  const controls = `<div class="controls">
    ${listSortControl('retailer-detail-sort', state.retailerDetailSort)}
    ${tierFilterControl('retailer-detail-filter', state.retailerDetailFilter)}
  </div>`;

  return `
    <button class="back" data-back-explore>Back</button>
    <div class="org-hero">
      ${monogram(r.name)}
      <div class="org-hero-text">
        <h2 class="org-hero-name">${esc(r.name)}</h2>
        <p class="org-hero-domain">${esc(r.domain)}</p>
        ${r.blurb ? `<p class="org-hero-blurb">${esc(r.blurb)}</p>` : ''}
        <ul class="fact-list">
          ${deliveryLines(r).map((l) => `<li>${esc(l)}</li>`).join('')}
        </ul>
      </div>
    </div>

    <p class="gone-head">${list.length} ${list.length === 1 ? 'fragrance' : 'fragrances'} here</p>
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
  const list = sortFragrances(BY_POPULARITY.filter((f) => f.brand === b), state.brandDetailSort);
  const site = officialSiteFor(b);

  // Sort only, no tier filter: every fragrance from one brand shares that
  // brand's tier (brandTierFor is a function of the brand name alone), so a
  // tier filter here would only ever show everything or nothing.
  const controls = `<div class="controls">${listSortControl('brand-detail-sort', state.brandDetailSort)}</div>`;

  return `
    <button class="back" data-back-explore>Back</button>
    <div class="org-hero">
      ${monogram(b)}
      <div class="org-hero-text">
        <h2 class="org-hero-name">${esc(b)}</h2>
        ${
          site
            ? `<p class="org-hero-domain"><a href="${esc(site)}" target="_blank" rel="noopener nofollow">${esc(site.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></p>`
            : `<p class="org-hero-domain dimmer">Official site not yet confirmed</p>`
        }
      </div>
    </div>

    <p class="gone-head">${list.length} ${list.length === 1 ? 'fragrance' : 'fragrances'}</p>
    ${controls}
    ${fragranceList(list, 'Nothing from this brand has been harvested yet.')}`;
}

/* ── explore: notes ──────────────────────────────────────────────────────── */

function notesPanel(): string {
  const filtered = NOTE_INDEX.filter(
    (n) => state.noteLayer === 'any' || n.layers.has(state.noteLayer),
  );
  const list = [...filtered].sort((a, b) =>
    state.noteSort === 'az' ? a.name.localeCompare(b.name) : b.count - a.count || a.name.localeCompare(b.name),
  );

  const controls = `<div class="controls">
    ${control('note-sort', 'Sort notes', ICON_SORT, [
      { value: 'common', label: 'Most common' },
      { value: 'az', label: 'A to Z' },
    ], state.noteSort)}
    ${control('note-layer', 'Filter notes', ICON_FILTER, [
      { value: 'any', label: 'Any layer' },
      { value: 'top', label: 'Top notes' },
      { value: 'middle', label: 'Middle notes' },
      { value: 'base', label: 'Base notes' },
    ], state.noteLayer)}
  </div>`;

  if (list.length === 0) {
    return `${controls}<p class="empty-note">No notes recorded for that layer yet.</p>`;
  }

  // The same row-list shape as Brands, including the alphabetical dividers —
  // but only under the A-to-Z sort. Under "most common" the list is ranked by
  // count, not by letter, so a divider between two counts would land on
  // whichever letter their names happen to start with and break up entries
  // that belong together in the ranking.
  let out = '';
  let current = '';
  for (const n of list) {
    if (state.noteSort === 'az') {
      const initial = (n.name[0] ?? '').toUpperCase();
      if (initial !== current) {
        current = initial;
        out += `<li class="alpha-break" aria-hidden="true"><span>${esc(initial)}</span><i></i></li>`;
      }
    }
    out += `<li><button class="brand-row note-row" data-note="${esc(n.name)}">
      <span>${esc(titleCase(n.name))}</span><span class="note-row-count">(${n.count})</span>
    </button></li>`;
  }
  return `${controls}
    <p class="panel-note">Only notes a shop has explicitly published. ${DEMO_FRAGRANCES.filter((f) => f.notes).length} of ${DEMO_FRAGRANCES.length} fragrances list them.</p>
    <ul class="brand-list">${out}</ul>`;
}

function noteView(): string {
  const filtered = fragrancesWithNote(state.noteName, state.noteLayer).filter(
    (f) => state.noteDetailFilter === 'all' || f.tier === state.noteDetailFilter,
  );
  const list = sortFragrances(filtered, state.noteDetailSort);

  const controls = `<div class="controls">
    ${listSortControl('note-detail-sort', state.noteDetailSort)}
    ${tierFilterControl('note-detail-filter', state.noteDetailFilter)}
  </div>`;

  return `
    <button class="back" data-back-explore>Back</button>
    <div class="page-head"><h2>${esc(titleCase(state.noteName))}</h2><span class="count">${list.length}</span></div>
    <p class="panel-note">Fragrances listing ${esc(titleCase(state.noteName))}${state.noteLayer === 'any' ? '' : ` as a ${state.noteLayer} note`}.</p>
    ${controls}
    ${fragranceList(list, 'Nothing matches that filter.')}`;
}

/* ── explore: search ─────────────────────────────────────────────────────── */

function searchPanel(): string {
  const q = state.query.trim();
  const list = q ? visibleFragrances() : [];
  return `
    <label class="search-big">
      ${ICON_SEARCH}
      <input type="search" id="search-full" placeholder="Search by brand, name or concentration"
        value="${esc(state.query)}" aria-label="Search fragrances" />
    </label>
    ${
      state.brand
        ? `<p class="panel-note">Filtered to ${esc(state.brand)}. <button class="link-btn" data-clear-brand>Clear</button></p>`
        : ''
    }
    <div class="search-results">${
      q
        ? `<div class="page-head"><h2>Results</h2><span class="count">${list.length}</span></div>
           ${fragranceList(list, 'Nothing matches that search.')}`
        : `<p class="empty-note">Type to search all ${DEMO_FRAGRANCES.length} fragrances.</p>`
    }</div>`;
}

/* ── explore shell ───────────────────────────────────────────────────────── */

const TABS: { id: ExploreTab; label: string }[] = [
  { id: 'brands', label: 'Brands' },
  { id: 'deals', label: 'Deals' },
  { id: 'retailers', label: 'Retailers' },
  { id: 'houses', label: 'Houses' },
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
          : state.tab === 'houses'
            ? housesPanel()
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
 * the UK.
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

function housesPanel(): string {
  if (HOUSE_PRODUCTS.length === 0) {
    return `<p class="empty-note">No house storefront has returned listings yet.</p>`;
  }

  const byHouse = new Map<string, typeof HOUSE_PRODUCTS>();
  for (const p of HOUSE_PRODUCTS) {
    const list = byHouse.get(p.house) ?? [];
    list.push(p);
    byHouse.set(p.house, list);
  }

  return `
    <p class="house-note">
      Read directly from each house's own shop. These are not part of the price
      comparison: each is sold in the house's own currency, so there is no UK
      price to compare yet and none has been invented.
    </p>
    ${[...byHouse.entries()]
      .map(
        ([house, items]) => `
        <section class="house-group">
          <h3>${esc(house)} <span class="house-count">${items.length}</span></h3>
          <ul class="house-grid">${chunked(items, houseCard)}</ul>
        </section>`,
      )
      .join('')}`;
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
      <h2>Settings</h2>

      <div class="seg-group">
        <p class="seg-label">Theme</p>
        <div class="seg" role="group" aria-label="Display theme">
          ${MODE_OPTIONS.map(
            (m) =>
              `<button class="seg-btn ${state.mode === m.id ? 'on' : ''}" data-set-mode="${m.id}">${esc(m.label)}</button>`,
          ).join('')}
        </div>
      </div>

      <div class="seg-group">
        <p class="seg-label">Layout</p>
        <div class="seg" role="group" aria-label="Page layout">
          <button class="seg-btn seg-icon ${state.layout === 'mobile' ? 'on' : ''}" data-set-layout="mobile" aria-label="Mobile layout">${ICON_MOBILE}<span>Mobile</span></button>
          <button class="seg-btn seg-icon ${state.layout === 'desktop' ? 'on' : ''}" data-set-layout="desktop" aria-label="Desktop layout">${ICON_DESKTOP}<span>Desktop</span></button>
        </div>
      </div>

      <p class="settings-note">Your preference will be remembered on this device.</p>

      <h3>Contact us</h3>
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

      <h3>Follow</h3>
      <a class="social" href="https://www.tiktok.com/@yannysniffs">
        ${ICON_TIKTOK}<span>TikTok</span><span class="social-handle">@yannysniffs</span>
      </a>
      <a class="social" href="https://www.instagram.com/yannysniffs">
        ${ICON_INSTAGRAM}<span>Instagram</span><span class="social-handle">@yannysniffs</span>
      </a>

      <h3>About</h3>
      <nav class="foot-links">
        ${LEGAL_PAGES.map((p) => `<button class="link-btn" data-page="${p.id}">${esc(p.short)}</button>`).join('')}
      </nav>
      <p class="foot-legal dimmer">
        ${esc(COMPANY.legalName)}, company number ${esc(COMPANY.number)}. We may earn commission
        on some links, and that never changes your price or the order shown.
        © ${new Date().getFullYear()} ${esc(COMPANY.name)}. Prices are a guide, always check the
        shop's own site.
      </p>
    </article>`;
}

/* ── legal ───────────────────────────────────────────────────────────────── */

function legalView(): string {
  const page = legalPage(state.legalId);
  if (!page) return homeView();
  return `
    <button class="back" data-back>Back</button>
    <article class="doc">
      <h2>${esc(page.title)}</h2>
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
    case 'settings': return { name: 'settings', param: '', query: {} };
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
    case 'settings': state.view = 'settings'; return true;

    case 'search':
      // The bar search and the Search subpage are the same destination.
      state.view = 'browse';
      return true;

    case 'brands': case 'deals': case 'retailers': case 'houses': case 'notes':
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
      const note = Object.keys(NOTE_INDEX).find((n) => slugify(n) === route.param);
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

/** Push the current state onto history, or replace the top of it. */
function syncUrl(mode: 'push' | 'replace' = 'push'): void {
  const url = basePath().replace(/\/$/, '') + routeToPath(currentRoute());
  const current = window.location.pathname + window.location.search;
  if (url === current) return;
  try {
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', url);
  } catch {
    // A sandboxed frame or a file:// document rejects pushState. The app is
    // fully usable without it, so this is not worth surfacing.
  }
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
                  : state.view === 'settings'
                    ? settingsView()
                    : legalView();

  // The wrapper is a fresh element on every render, so the fade it carries just
  // plays on insertion. No JS animation retriggering needed.
  $('#view').innerHTML = `<div class="view-fade">${body}</div>`;

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
  ($('#nav-settings') as HTMLElement).classList.toggle('on', state.view === 'settings');
}

function go(view: View): void {
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
  $('#nav-settings').addEventListener('click', () => go('settings'));

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;

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

    const page = t.closest('[data-page]');
    if (page) {
      state.legalId = page.getAttribute('data-page')!;
      go('legal');
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

    if (t.closest('[data-back-explore]')) {
      go('explore');
      return;
    }

    if (t.closest('[data-back]')) {
      go(state.query || state.brand ? 'browse' : 'home');
      return;
    }

    if (t.closest('[data-back-home]')) {
      goHome();
      return;
    }

    if (t.closest('[data-clear-brand]')) {
      state.brand = null;
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
    const q = state.query.trim();
    const list = q ? visibleFragrances() : [];
    const results = panel.querySelector('.search-results');
    const html = q
      ? `<div class="page-head"><h2>Results</h2><span class="count">${list.length}</span></div>
         ${fragranceList(list, 'Nothing matches that search.')}`
      : `<p class="empty-note">Type to search all ${DEMO_FRAGRANCES.length} fragrances.</p>`;
    if (results) results.innerHTML = html;
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

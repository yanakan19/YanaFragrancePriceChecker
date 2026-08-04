/**
 * Mobile demo harness for the PriceSniffs comparison core.
 *
 * Holds no pricing logic of its own. It is a thin renderer over the real modules
 * in `src/`, bundled unchanged, so the demo cannot drift from what ships.
 *
 * House style for every reader facing string in this file: no hyphens, no en
 * dashes, no em dashes. Where a compound would normally take a hyphen, reword
 * it. Code comments are exempt.
 */
import { buildComparison, bestOffer, canShowCountdown, formatGbp, RETAILERS } from '../src/index.js';
import type { PresentedOffer, StockState } from '../src/types/offer.js';
import type { RetailerTier } from '../src/types/retailer.js';
import { DEMO_FRAGRANCES, BY_POPULARITY, brandTierFor, type DemoFragrance } from './data.js';
import { productArt } from './photo.js';
import { COMPANY, LEGAL_PAGES, legalPage } from './legal.js';
import { isNewAt, offersFor, SHOP_COUNT, CRAWLED_AT } from './catalogue.generated.js';

type View = 'home' | 'browse' | 'detail' | 'legal' | 'settings' | 'brands';
type DisplayMode = 'dark' | 'light' | 'system';
type Layout = 'mobile' | 'desktop';
type BrandSort = 'az' | 'za';
type BrandFilter = RetailerTier | 'all';

const MODE_KEY = 'pricesniffs.display';
const LAYOUT_KEY = 'pricesniffs.layout';

const state = {
  view: 'home' as View,
  fragranceId: '',
  legalId: '',
  brand: null as string | null,
  query: '',
  mode: 'dark' as DisplayMode,
  layout: 'mobile' as Layout,
  brandSort: 'az' as BrandSort,
  brandFilter: 'all' as BrandFilter,
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const $ = (sel: string) => document.querySelector(sel)!;

const BRANDS = [...new Set(DEMO_FRAGRANCES.map((f) => f.brand))].sort();
const TIER_LABEL: Record<RetailerTier, string> = {
  designer: 'Designer', niche: 'Niche', mideast: 'Middle Eastern',
};

/** Top ten by hand seeded popularity. The contents of the rail. */
const POPULAR = BY_POPULARITY.slice(0, 10);

/**
 * Prices come from the catalogue crawl, never from a hand written table. That
 * is what makes them live: point the crawl at the shops themselves and these
 * become real figures with nothing else to change.
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
 * tablet or a resized browser window on a laptop trackpad does not. This
 * reads actual device capability (a fine pointer that supports hover, and
 * enough width to use it) rather than sniffing the user agent string, which
 * is both unreliable and unnecessary here.
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

/* ── home ────────────────────────────────────────────────────────────────── */

const MEDALS = ['gold', 'silver', 'bronze'] as const;

/** "Eau de Toilette" -> "EDT", etc. Falls back to the string itself when there is no
    standard abbreviation (e.g. "Extrait"), which is already short. */
const CONCENTRATION_ABBR: Record<string, string> = {
  'Eau de Parfum': 'EDP',
  'Eau de Toilette': 'EDT',
  'Eau de Cologne': 'EDC',
};
const shortConcentration = (c: string): string => CONCENTRATION_ABBR[c] ?? c;

function popularCard(f: DemoFragrance, rank: number): string {
  const best = bestOffer(rowsFor(f));
  const medal = rank < 3 ? MEDALS[rank] : null;

  return `<li class="pop-item">
    <button class="pop" data-frag="${f.id}">
      <span class="pop-head">
        <span class="pop-text">
          <span class="pop-brand">${esc(f.brand)}</span>
          <span class="pop-name">${esc(f.name)}</span>
        </span>
        <span class="pop-meta">
          <span>${f.sizeMl}ml</span>
          <span>${esc(shortConcentration(f.concentration))}</span>
        </span>
      </span>
      <span class="pop-art">
        ${medal ? `<span class="medal ${medal}" aria-label="Number ${rank + 1} most popular">${rank + 1}</span>` : ''}
        ${productArt(f.photoUrl, 96, `${f.brand} ${f.name}`)}
      </span>
      <span class="pop-price">
        ${best ? `from ${formatGbp(best.deliveredPriceGbp)}` : 'Sold out'}
        ${best ? '<span aria-hidden="true">→</span>' : ''}
      </span>
    </button>
  </li>`;
}

function homeView(): string {
  return `
    <section class="intro">
      <div class="hero-logo">
        <p class="hero-wordmark">Price<em>Sniffs</em></p>
        <p class="hero-by">by YannySniffs</p>
      </div>
      <p class="hero-mission">The only tool you need to find the best price on any fragrance.</p>
      <ul class="intro-points">
        <li><span>Delivery prices reflected</span> so you know what you are paying altogether</li>
        <li><span>Real and live prices</span> never made up</li>
        <li><span>Never promoted</span> no shop is favoured over another</li>
      </ul>
    </section>

    <section class="pop-section">
      <div class="section-head">
        <h3>Most popular</h3>
        <button class="link-btn" data-browse>See all ${DEMO_FRAGRANCES.length}</button>
      </div>
      <ul class="pop-rail">
        ${POPULAR.map((f, i) => popularCard(f, i)).join('')}
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
  const list = visibleFragrances();
  const back = `<button class="back" data-back-home>Back</button>`;

  if (list.length === 0) {
    return `${back}<p class="empty-note">Nothing here matches that search. Try clearing the brand filter.</p>`;
  }

  return `${back}<ul class="listing">
    ${list
      .map((f) => {
        const best = bestOffer(rowsFor(f));
        return `<li>
          <button class="card" data-frag="${f.id}">
            <span class="card-art">${productArt(f.photoUrl, 40, `${f.brand} ${f.name}`)}</span>
            <span class="card-text">
              <span class="card-brand">${esc(f.brand)}</span>
              <span class="card-name">${esc(f.name)}</span>
              <span class="card-meta">${f.sizeMl}ml, ${esc(f.concentration)}</span>
            </span>
            <span class="card-price">
              ${
                best
                  ? `<span class="from">from</span><span class="amt">${formatGbp(best.deliveredPriceGbp)}</span>`
                  : `<span class="amt none">Sold out</span>`
              }
            </span>
          </button>
        </li>`;
      })
      .join('')}
  </ul>`;
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
          ${d ? `<span class="was">${formatGbp(d.wasPrice)}</span>` : ''}
          <span class="now ${d ? 'sale' : ''}">${formatGbp(row.deliveredPriceGbp)}</span>
        </span>
      </span>
      <span class="offer-bot">
        <span class="facts">
          <span class="dot ${STOCK_CLASS[row.stock]}"></span>${STOCK_LABEL[row.stock]}
          <span class="sep">·</span>${esc(sub.join(' · '))}
        </span>
        ${d ? `<span class="off">${d.percentOff}% off</span>` : ''}
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

function detailView(): string {
  const frag = DEMO_FRAGRANCES.find((f) => f.id === state.fragranceId);
  if (!frag) return homeView();

  const rows = rowsFor(frag);
  const best = bestOffer(rows);
  const live = rows.filter((r) => r.isPurchasable);
  const gone = rows.filter((r) => !r.isPurchasable);
  const newest = rows.length ? Math.min(...rows.map((r) => r.ageSeconds)) : 0;

  const shownIds = new Set(rows.map((r) => r.retailer.id));
  const unavailable = RETAILERS.filter((r) => !shownIds.has(r.id)).sort((a, b) => a.name.localeCompare(b.name));

  return `
    <button class="back" data-back>Back</button>

    <div class="detail-grid">
      <div class="hero">
        ${productArt(frag.photoUrl, 132, `${frag.brand} ${frag.name}`)}
        <p class="hero-brand">${esc(frag.brand)}</p>
        <h2 class="hero-name">${esc(frag.name)}</h2>
        <p class="hero-meta">${frag.sizeMl}ml, ${esc(frag.concentration)}</p>
        ${
          best
            ? `<div class="price-box">
                 <p class="price-box-label">Cheapest price</p>
                 <p class="price-box-amount">${formatGbp(best.deliveredPriceGbp)}</p>
                 <p class="price-box-from">from ${esc(best.retailer.name)}, incl. delivery</p>
               </div>`
            : `<p class="hero-price none">Sold out everywhere<span class="hero-at">no shop has it in stock right now</span></p>`
        }
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

/* ── settings ────────────────────────────────────────────────────────────── */

const MODE_OPTIONS: { id: DisplayMode; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'Use System Setting' },
];

const CONTACT_TYPES = ['An issue', 'A suggestion', 'A promotional enquiry', 'Something else'] as const;

const ICON_MOBILE =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2.5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="18.3" r=".9" fill="currentColor"/></svg>';
const ICON_DESKTOP =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 21h7M12 17v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
/* Simple musical note and camera marks, not TikTok's or Instagram's own logo
   marks: this project has no licence to reproduce those, so neutral icons
   stand in for each platform. */
const ICON_TIKTOK =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3v11.2a3.3 3.3 0 1 1-3.3-3.3c.3 0 .6 0 .9.1V8.4a6.1 6.1 0 1 0 5.1 6V9.8a7.5 7.5 0 0 0 4.3 1.4V8.5A4.6 4.6 0 0 1 17 4.5V3h-3Z" fill="currentColor"/></svg>';
const ICON_INSTAGRAM =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.8"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor"/></svg>';

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
      <details class="social">
        <summary>${ICON_TIKTOK}<span>TikTok</span></summary>
        <p><a href="https://www.tiktok.com/@yannysniffs" target="_blank" rel="noopener">@yannysniffs on TikTok</a></p>
      </details>
      <details class="social">
        <summary>${ICON_INSTAGRAM}<span>Instagram</span></summary>
        <p><a href="https://www.instagram.com/yannysniffs" target="_blank" rel="noopener">@yannysniffs on Instagram</a></p>
      </details>

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

/* ── brands ──────────────────────────────────────────────────────────────── */

function brandsView(): string {
  const filtered = BRANDS.filter(
    (b) => state.brandFilter === 'all' || brandTierFor(b) === state.brandFilter,
  );
  const list = [...filtered].sort((a, b) => (state.brandSort === 'az' ? a.localeCompare(b) : b.localeCompare(a)));

  return `
    <button class="back" data-back-home>Back</button>
    <div class="brands-head">
      <h2>Brands</h2>
      <div class="brands-controls">
        <select id="brand-sort" class="dropdown" aria-label="Sort brands">
          <option value="az" ${state.brandSort === 'az' ? 'selected' : ''}>A to Z</option>
          <option value="za" ${state.brandSort === 'za' ? 'selected' : ''}>Z to A</option>
        </select>
        <select id="brand-filter" class="dropdown" aria-label="Filter brands">
          <option value="all" ${state.brandFilter === 'all' ? 'selected' : ''}>All</option>
          ${(['designer', 'niche', 'mideast'] as const)
            .map((t) => `<option value="${t}" ${state.brandFilter === t ? 'selected' : ''}>${TIER_LABEL[t]}</option>`)
            .join('')}
        </select>
      </div>
    </div>
    ${
      list.length === 0
        ? `<p class="empty-note">No brands match that filter yet.</p>`
        : `<ul class="brand-list">
             ${list.map((b) => `<li><button class="brand-row" data-brand="${esc(b)}">${esc(b)}</button></li>`).join('')}
           </ul>`
    }`;
}

/* ── chrome ──────────────────────────────────────────────────────────────── */

function render(): void {
  const body =
    state.view === 'home'
      ? homeView()
      : state.view === 'browse'
        ? browseView()
        : state.view === 'detail'
          ? detailView()
          : state.view === 'settings'
            ? settingsView()
            : state.view === 'brands'
              ? brandsView()
              : legalView();

  // The wrapper is a fresh element on every render, so the fade in it carries
  // just plays on insertion. No JS animation retriggering needed.
  $('#view').innerHTML = `<div class="view-fade">${body}</div>`;

  ($('#brand-chip') as HTMLElement).innerHTML = state.brand
    ? `<button class="chip" data-clear-brand>${esc(state.brand)} <span aria-hidden="true">×</span><span class="sr">clear brand filter</span></button>`
    : '';

  ($('#nav-home') as HTMLElement).classList.toggle('on', state.view === 'home');
  ($('#nav-brand') as HTMLElement).classList.toggle('on', state.view === 'brands');
  ($('#nav-settings') as HTMLElement).classList.toggle('on', state.view === 'settings');
}

function go(view: View): void {
  state.view = view;
  render();
  window.scrollTo({ top: 0 });
}

/* ── wiring ──────────────────────────────────────────────────────────────── */

function init(): void {
  loadMode();
  loadLayout();

  // State the provenance plainly. These are real prices from real shops, and
  // the reader is told when they were taken rather than being asked to assume.
  const when = new Date(CRAWLED_AT);
  ($('#provenance') as HTMLElement).textContent = Number.isFinite(when.getTime())
    ? `Real prices from ${SHOP_COUNT} UK shops, last checked ${when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. Always confirm on the shop's site.`
    : `Real prices from ${SHOP_COUNT} UK shops. Always confirm on the shop's site.`;

  $('#search').addEventListener('input', (e) => {
    state.query = (e.target as HTMLInputElement).value;
    state.view = 'browse';
    render();
  });

  const goHome = () => {
    state.query = '';
    state.brand = null;
    ($('#search') as HTMLInputElement).value = '';
    go('home');
  };

  $('#nav-home').addEventListener('click', goHome);
  // The wordmark is the conventional "take me home" control too, not just
  // the Home tab, so it needs the same reset (cleared search and filter)
  // rather than a bare view switch.
  $('#brand-home').addEventListener('click', goHome);

  $('#nav-brand').addEventListener('click', () => go('brands'));
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

    const card = t.closest('[data-frag]');
    if (card) {
      state.fragranceId = card.getAttribute('data-frag')!;
      go('detail');
      return;
    }

    const page = t.closest('[data-page]');
    if (page) {
      state.legalId = page.getAttribute('data-page')!;
      go('legal');
      return;
    }

    if (t.closest('[data-browse]')) {
      go('browse');
      return;
    }

    const brandOpt = t.closest('[data-brand]');
    if (brandOpt) {
      const b = brandOpt.getAttribute('data-brand')!;
      state.brand = b === '' ? null : b;
      go('browse');
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

  document.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'brand-sort') {
      state.brandSort = (t as HTMLSelectElement).value as BrandSort;
      render();
    } else if (t.id === 'brand-filter') {
      state.brandFilter = (t as HTMLSelectElement).value as BrandFilter;
      render();
    }
  });

  // There is no server behind this page, so "send" means handing the message
  // to the reader's own email app, not silently claiming it reached us. The
  // confirmation text says exactly that rather than pretending we received it.
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

  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

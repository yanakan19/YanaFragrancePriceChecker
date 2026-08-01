/**
 * Mobile demo harness for the ScentDay comparison core.
 *
 * Holds no pricing logic of its own. It is a thin renderer over the real modules
 * in `src/`, bundled unchanged, so the demo cannot drift from what ships.
 *
 * House style for every reader facing string in this file: no hyphens, no en
 * dashes, no em dashes. Where a compound would normally take a hyphen, reword
 * it. Code comments are exempt.
 */
import { buildComparison, bestOffer, canShowCountdown, formatGbp } from '../src/index.js';
import type { PresentedOffer, StockState } from '../src/types/offer.js';
import { DEMO_FRAGRANCES, BY_POPULARITY, type DemoFragrance } from './data.js';
import { bottleSvg } from './art.js';
import { COMPANY, LEGAL_PAGES, legalPage } from './legal.js';
import { isNewAt, offersFor, SHOP_COUNT, CRAWLED_AT } from './catalogue.generated.js';

type View = 'home' | 'browse' | 'detail' | 'legal' | 'settings';
type DisplayMode = 'dark' | 'light' | 'system';

const MODE_KEY = 'scentday.display';

const state = {
  view: 'home' as View,
  fragranceId: '',
  legalId: '',
  brand: null as string | null,
  query: '',
  brandSheetOpen: false,
  mode: 'dark' as DisplayMode,
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const $ = (sel: string) => document.querySelector(sel)!;

const BRANDS = [...new Set(DEMO_FRAGRANCES.map((f) => f.brand))].sort();

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

function popularCard(f: DemoFragrance, rank: number): string {
  const best = bestOffer(rowsFor(f));
  const medal = rank < 3 ? MEDALS[rank] : null;

  return `<li class="pop-item">
    <button class="pop" data-frag="${f.id}">
      <span class="pop-art">
        ${medal ? `<span class="medal ${medal}" aria-label="Number ${rank + 1} most popular">${rank + 1}</span>` : ''}
        ${bottleSvg(f.art, 74, `${f.brand} ${f.name} bottle illustration`)}
      </span>
      <span class="pop-brand">${esc(f.brand)}</span>
      <span class="pop-name">${esc(f.name)}</span>
      <span class="pop-price">${best ? formatGbp(best.deliveredPriceGbp) : 'Sold out'}</span>
    </button>
  </li>`;
}

function homeView(): string {
  return `
    <section class="intro">
      <p class="kicker">UK fragrance prices</p>
      <h2>See what a bottle really costs.</h2>
      <p class="lede">Real prices, harvested from ${SHOP_COUNT} UK shops and shown with
      delivery added, so the cheapest listing is genuinely the cheapest way to buy.</p>
      <ul class="intro-points">
        <li><span>Delivery counted</span> free postage starts at £25 in Boots and £300 in Harvey Nichols</li>
        <li><span>Real reductions</span> the shop's own previous price, never one we made up</li>
        <li><span>Never for sale</span> no shop can pay its way up the list</li>
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
  if (list.length === 0) {
    return `<p class="empty-note">Nothing here matches that search. Try clearing the brand filter.</p>`;
  }

  return `<ul class="listing">
    ${list
      .map((f) => {
        const best = bestOffer(rowsFor(f));
        return `<li>
          <button class="card" data-frag="${f.id}">
            <span class="card-art">${bottleSvg(f.art, 40, `${f.brand} ${f.name} bottle illustration`)}</span>
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

function detailView(): string {
  const frag = DEMO_FRAGRANCES.find((f) => f.id === state.fragranceId);
  if (!frag) return homeView();

  const rows = rowsFor(frag);
  const best = bestOffer(rows);
  const live = rows.filter((r) => r.isPurchasable);
  const gone = rows.filter((r) => !r.isPurchasable);
  const newest = rows.length ? Math.min(...rows.map((r) => r.ageSeconds)) : 0;

  return `
    <button class="back" data-back>Back</button>

    <div class="hero">
      ${bottleSvg(frag.art, 132, `${frag.brand} ${frag.name} bottle illustration`)}
      <p class="hero-brand">${esc(frag.brand)}</p>
      <h2 class="hero-name">${esc(frag.name)}</h2>
      <p class="hero-meta">${esc(frag.concentration)}, ${frag.sizeMl}ml</p>
      ${
        best
          ? `<p class="hero-price">${formatGbp(best.deliveredPriceGbp)}<span class="hero-at">delivered, from ${esc(best.retailer.name)}</span></p>`
          : `<p class="hero-price none">Sold out everywhere<span class="hero-at">no shop has it in stock right now</span></p>`
      }
    </div>

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
    }`;
}

/* ── settings ────────────────────────────────────────────────────────────── */

const MODE_OPTIONS: { id: DisplayMode; label: string; note: string }[] = [
  { id: 'dark', label: 'Dark', note: 'Always dark, whatever your device is set to' },
  { id: 'light', label: 'Light', note: 'Always light' },
  { id: 'system', label: 'Match my device', note: 'Follow your phone or computer setting' },
];

function settingsView(): string {
  return `
    <button class="back" data-back>Back</button>
    <article class="doc">
      <h2>Settings</h2>
      <h3>Display</h3>
      <div class="opts">
        ${MODE_OPTIONS.map(
          (m) => `<button class="opt ${state.mode === m.id ? 'on' : ''}" data-set-mode="${m.id}">
            <span class="opt-text">
              <span class="opt-label">${m.label}</span>
              <span class="opt-note">${m.note}</span>
            </span>
            <span class="opt-mark" aria-hidden="true"></span>
          </button>`,
        ).join('')}
      </div>
      <p class="opt-foot">Your choice is remembered on this device.</p>
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

/* ── chrome ──────────────────────────────────────────────────────────────── */

function footer(): string {
  return `
    <footer class="foot">
      <p class="foot-mark">Scent<em>Day</em></p>
      <p class="foot-line">Spotted a price that looks wrong? Please tell us.</p>
      <p class="foot-mail"><a href="mailto:${COMPANY.feedbackEmail}">${COMPANY.feedbackEmail}</a></p>
      <nav class="foot-links">
        ${LEGAL_PAGES.map((p) => `<button class="link-btn" data-page="${p.id}">${esc(p.short)}</button>`).join('')}
      </nav>
      <p class="foot-legal">
        ${esc(COMPANY.legalName)}. Company number ${esc(COMPANY.number)}.<br />
        ${esc(COMPANY.address)}
      </p>
      <p class="foot-legal">
        We may earn commission on some links. It never changes the price you pay
        or the order of the results.
      </p>
      <p class="foot-legal dimmer">
        © ${new Date().getFullYear()} ${esc(COMPANY.name)}. Prices are a guide.
        Always check on the shop's own site.
      </p>
    </footer>`;
}

function brandSheet(): string {
  if (!state.brandSheetOpen) return '';
  return `
    <div class="sheet-back" data-close-sheet></div>
    <div class="sheet" role="dialog" aria-label="Filter by brand">
      <p class="sheet-title">Filter by brand</p>
      <button class="brand-opt ${state.brand === null ? 'on' : ''}" data-brand="">All brands</button>
      ${BRANDS.map(
        (b) =>
          `<button class="brand-opt ${state.brand === b ? 'on' : ''}" data-brand="${esc(b)}">${esc(b)}</button>`,
      ).join('')}
    </div>`;
}

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
            : legalView();

  $('#view').innerHTML = body + footer();
  $('#sheet-host').innerHTML = brandSheet();

  ($('#brand-chip') as HTMLElement).innerHTML = state.brand
    ? `<button class="chip" data-clear-brand>${esc(state.brand)} <span aria-hidden="true">×</span><span class="sr">clear brand filter</span></button>`
    : '';

  ($('#nav-home') as HTMLElement).classList.toggle('on', state.view === 'home');
  ($('#nav-brand') as HTMLElement).classList.toggle('on', state.brandSheetOpen);
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

  $('#nav-home').addEventListener('click', () => {
    state.brandSheetOpen = false;
    state.query = '';
    ($('#search') as HTMLInputElement).value = '';
    go('home');
  });

  $('#nav-brand').addEventListener('click', () => {
    state.brandSheetOpen = !state.brandSheetOpen;
    render();
  });

  $('#nav-settings').addEventListener('click', () => {
    state.brandSheetOpen = false;
    go('settings');
  });

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
      state.brandSheetOpen = false;
      go('browse');
      return;
    }

    if (t.closest('[data-back]')) {
      go(state.query || state.brand ? 'browse' : 'home');
      return;
    }

    if (t.closest('[data-clear-brand]')) {
      state.brand = null;
      render();
      return;
    }

    if (t.closest('[data-close-sheet]')) {
      state.brandSheetOpen = false;
      render();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.brandSheetOpen) {
      state.brandSheetOpen = false;
      render();
    }
  });

  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

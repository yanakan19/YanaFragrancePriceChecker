/**
 * Mobile demo harness for the ScentDay comparison core.
 *
 * Contains no pricing logic of its own — a thin renderer over the real modules
 * in `src/`, bundled unchanged, so the demo cannot drift from what ships.
 *
 * Two views: a home listing, and a fragrance detail with its results. The
 * offers it renders are invented (see `demo/data.ts`); the page says so.
 */
import {
  buildComparison,
  bestOffer,
  canShowCountdown,
  formatGbp,
} from '../src/index.js';
import type { PresentedOffer, StockState } from '../src/types/offer.js';
import { DEMO_FRAGRANCES, type DemoFragrance } from './data.js';

type View = 'home' | 'detail';

const state = {
  view: 'home' as View,
  fragranceId: '',
  brand: null as string | null,
  query: '',
  brandSheetOpen: false,
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const $ = (sel: string) => document.querySelector(sel)!;

const BRANDS = [...new Set(DEMO_FRAGRANCES.map((f) => f.brand))].sort();

function rowsFor(frag: DemoFragrance): PresentedOffer[] {
  return buildComparison(frag.offers, { sortBy: 'delivered', tier: frag.tier });
}

/* ── generic bottle illustration ─────────────────────────────────────────────
   A placeholder, not a product photo. Real product imagery needs a licence,
   which comes with an affiliate feed — scraped images carry no such right — so
   until the feeds are in place every listing gets the same generic bottle,
   tinted so the cards stay distinguishable. */
function bottle(seed: number, size: number): string {
  const hue = (seed * 47 + 205) % 360;
  const body = `hsl(${hue} 32% 62%)`;
  const cap = `hsl(${hue} 28% 38%)`;
  return `
    <svg class="bottle" width="${size}" height="${size * 1.32}" viewBox="0 0 100 132"
         role="img" aria-label="Generic fragrance bottle illustration">
      <rect x="39" y="4" width="22" height="18" rx="3" fill="${cap}" />
      <rect x="45" y="21" width="10" height="9" fill="${cap}" opacity=".75" />
      <rect x="19" y="29" width="62" height="99" rx="11" fill="${body}" />
      <rect x="31" y="62" width="38" height="33" rx="3" fill="#fff" opacity=".82" />
    </svg>`;
}

/* ── formatting ──────────────────────────────────────────────────────────── */

const STOCK_LABEL: Record<StockState, string> = {
  inStock: 'In stock',
  lowStock: 'Low stock',
  preOrder: 'Pre-order',
  unknown: 'Stock not confirmed',
  outOfStock: 'Out of stock',
};

const STOCK_CLASS: Record<StockState, string> = {
  inStock: 'ok',
  lowStock: 'warn',
  preOrder: 'warn',
  unknown: 'muted',
  outOfStock: 'bad',
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

/* ── views ───────────────────────────────────────────────────────────────── */

function visibleFragrances(): DemoFragrance[] {
  const q = state.query.trim().toLowerCase();
  return DEMO_FRAGRANCES.filter((f) => {
    if (state.brand && f.brand !== state.brand) return false;
    if (!q) return true;
    return `${f.brand} ${f.name} ${f.concentration}`.toLowerCase().includes(q);
  });
}

function homeView(): string {
  const list = visibleFragrances();

  if (list.length === 0) {
    return `<p class="empty-note">Nothing matches that search. Try clearing the brand filter.</p>`;
  }

  return `<ul class="listing">
    ${list
      .map((f, i) => {
        const best = bestOffer(rowsFor(f));
        return `<li>
          <button class="card" data-frag="${f.id}">
            <span class="card-art">${bottle(i + 1, 46)}</span>
            <span class="card-text">
              <span class="card-brand">${esc(f.brand)}</span>
              <span class="card-name">${esc(f.name)}</span>
              <span class="card-meta">${f.sizeMl}ml · ${esc(f.concentration)}</span>
            </span>
            <span class="card-price">
              ${
                best
                  ? `<span class="from">from</span><span class="amt">${formatGbp(best.deliveredPriceGbp)}</span>`
                  : `<span class="amt none">—</span>`
              }
            </span>
          </button>
        </li>`;
      })
      .join('')}
  </ul>`;
}

function offerRow(row: PresentedOffer, isBest: boolean): string {
  const d = row.discount;
  const sub: string[] = [];

  sub.push(row.delivery.isFree ? 'Free delivery' : `+ ${formatGbp(row.delivery.costGbp)} delivery`);
  if (row.delivery.spendMoreForFreeGbp !== null) {
    sub.push(`${formatGbp(row.delivery.spendMoreForFreeGbp)} more for free`);
  }

  return `<li class="offer ${isBest ? 'best' : ''} ${row.isPurchasable ? '' : 'gone'}">
    <a class="offer-link" href="${esc(row.outboundUrl)}" rel="nofollow noopener" target="_blank">
      <span class="offer-top">
        <span class="shop">${esc(row.retailer.name)}</span>
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

  const idx = DEMO_FRAGRANCES.indexOf(frag) + 1;
  const rows = rowsFor(frag);
  const best = bestOffer(rows);
  const live = rows.filter((r) => r.isPurchasable);
  const gone = rows.filter((r) => !r.isPurchasable);
  const newest = rows.length ? Math.min(...rows.map((r) => r.ageSeconds)) : 0;

  return `
    <button class="back" data-back>← All fragrances</button>

    <div class="hero">
      ${bottle(idx, 108)}
      <p class="hero-brand">${esc(frag.brand)}</p>
      <h2 class="hero-name">${esc(frag.name)}</h2>
      <p class="hero-meta">${esc(frag.concentration)} · ${frag.sizeMl}ml</p>
      ${
        best
          ? `<p class="hero-price">${formatGbp(best.deliveredPriceGbp)}<span class="hero-at">delivered, at ${esc(best.retailer.name)}</span></p>`
          : `<p class="hero-price none">Not available<span class="hero-at">every shop is out of stock</span></p>`
      }
    </div>

    <div class="results-head">
      <span>${live.length} ${live.length === 1 ? 'shop' : 'shops'}</span>
      <span class="dim">price incl. delivery · checked ${esc(age(newest))}</span>
    </div>

    <ul class="offers">${live.map((r) => offerRow(r, r === best)).join('')}</ul>

    ${
      gone.length
        ? `<p class="gone-head">Out of stock</p>
           <ul class="offers">${gone.map((r) => offerRow(r, false)).join('')}</ul>`
        : ''
    }`;
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
  $('#view').innerHTML = state.view === 'home' ? homeView() : detailView();
  $('#sheet-host').innerHTML = brandSheet();

  const chip = $('#brand-chip') as HTMLElement;
  chip.innerHTML = state.brand
    ? `<button class="chip" data-clear-brand>${esc(state.brand)} <span aria-hidden="true">×</span><span class="sr">clear brand filter</span></button>`
    : '';

  ($('#nav-home') as HTMLElement).classList.toggle('on', state.view === 'home');
  ($('#nav-brand') as HTMLElement).classList.toggle('on', state.brandSheetOpen);
}

/* ── wiring ──────────────────────────────────────────────────────────────── */

function init(): void {
  $('#search').addEventListener('input', (e) => {
    state.query = (e.target as HTMLInputElement).value;
    if (state.view !== 'home') state.view = 'home';
    render();
  });

  $('#nav-home').addEventListener('click', () => {
    state.view = 'home';
    state.brandSheetOpen = false;
    render();
    window.scrollTo({ top: 0 });
  });

  $('#nav-brand').addEventListener('click', () => {
    state.brandSheetOpen = !state.brandSheetOpen;
    render();
  });

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;

    const card = t.closest('[data-frag]');
    if (card) {
      state.fragranceId = card.getAttribute('data-frag')!;
      state.view = 'detail';
      render();
      window.scrollTo({ top: 0 });
      return;
    }

    const brandOpt = t.closest('[data-brand]');
    if (brandOpt) {
      const b = brandOpt.getAttribute('data-brand')!;
      state.brand = b === '' ? null : b;
      state.brandSheetOpen = false;
      state.view = 'home';
      render();
      return;
    }

    if (t.closest('[data-back]')) {
      state.view = 'home';
      render();
      window.scrollTo({ top: 0 });
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

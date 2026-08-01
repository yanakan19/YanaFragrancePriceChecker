/**
 * Mobile demo harness for the ScentDay comparison core.
 *
 * Contains no pricing logic of its own — a thin renderer over the real modules
 * in `src/`, bundled unchanged, so the demo cannot drift from what ships.
 *
 * Views: an introductory home with a popular-fragrance scroller, a fragrance
 * detail with its results, an all-fragrances listing, and the legal pages.
 * The offers it renders are invented (see `demo/data.ts`); the page says so.
 */
import { buildComparison, bestOffer, canShowCountdown, formatGbp } from '../src/index.js';
import type { PresentedOffer, StockState } from '../src/types/offer.js';
import { DEMO_FRAGRANCES, BY_POPULARITY, type DemoFragrance } from './data.js';
import { bottleSvg } from './art.js';
import { COMPANY, LEGAL_PAGES, legalPage } from './legal.js';

type View = 'home' | 'browse' | 'detail' | 'legal';

const state = {
  view: 'home' as View,
  fragranceId: '',
  legalId: '',
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

/** Top ten by hand-seeded popularity — the scroller's contents. */
const POPULAR = BY_POPULARITY.slice(0, 10);

function rowsFor(frag: DemoFragrance): PresentedOffer[] {
  return buildComparison(frag.offers, { sortBy: 'delivered', tier: frag.tier });
}

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
      <span class="pop-price">${best ? formatGbp(best.deliveredPriceGbp) : 'Unavailable'}</span>
    </button>
  </li>`;
}

function homeView(): string {
  return `
    <section class="intro">
      <h2>Know what it really costs.</h2>
      <p>ScentDay checks twelve UK fragrance retailers and shows you the price
      including delivery — so the cheapest bottle on the list is genuinely the
      cheapest bottle to buy.</p>
      <ul class="intro-points">
        <li><span>Delivery included</span> free-delivery thresholds are worked out for you</li>
        <li><span>Real discounts only</span> the retailer's own was-price, never ours</li>
        <li><span>Never paid for</span> commission can't move a shop up the list</li>
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
    return `<p class="empty-note">Nothing matches that search. Try clearing the brand filter.</p>`;
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

/* ── detail ──────────────────────────────────────────────────────────────── */

function offerRow(row: PresentedOffer, isBest: boolean): string {
  const d = row.discount;
  const sub: string[] = [
    row.delivery.isFree ? 'Free delivery' : `+ ${formatGbp(row.delivery.costGbp)} delivery`,
  ];
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

  const rows = rowsFor(frag);
  const best = bestOffer(rows);
  const live = rows.filter((r) => r.isPurchasable);
  const gone = rows.filter((r) => !r.isPurchasable);
  const newest = rows.length ? Math.min(...rows.map((r) => r.ageSeconds)) : 0;

  return `
    <button class="back" data-back>← Back</button>

    <div class="hero">
      ${bottleSvg(frag.art, 132, `${frag.brand} ${frag.name} bottle illustration`)}
      <p class="hero-brand">${esc(frag.brand)}</p>
      <h2 class="hero-name">${esc(frag.name)}</h2>
      <p class="hero-meta">${esc(frag.concentration)} · ${frag.sizeMl}ml</p>
      <p class="hero-blurb">${esc(frag.blurb)}</p>
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

/* ── legal ───────────────────────────────────────────────────────────────── */

function legalView(): string {
  const page = legalPage(state.legalId);
  if (!page) return homeView();
  return `
    <button class="back" data-back>← Back</button>
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
      <p class="foot-line">Spotted a wrong price? Tell us — we would rather know.</p>
      <p class="foot-mail"><a href="mailto:${COMPANY.feedbackEmail}">${COMPANY.feedbackEmail}</a></p>
      <nav class="foot-links">
        ${LEGAL_PAGES.map((p) => `<button class="link-btn" data-page="${p.id}">${esc(p.short)}</button>`).join('')}
      </nav>
      <p class="foot-legal">
        ${esc(COMPANY.legalName)} · Company number ${esc(COMPANY.number)}<br />
        ${esc(COMPANY.address)}
      </p>
      <p class="foot-legal">
        We may earn commission on some links. It never affects the price you pay
        or the order of results.
      </p>
      <p class="foot-legal dimmer">© ${new Date().getFullYear()} ${esc(COMPANY.name)}. Prices are indicative — always check on the retailer's site.</p>
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
  const view =
    state.view === 'home'
      ? homeView()
      : state.view === 'browse'
        ? browseView()
        : state.view === 'detail'
          ? detailView()
          : legalView();

  $('#view').innerHTML = view + footer();
  $('#sheet-host').innerHTML = brandSheet();

  ($('#brand-chip') as HTMLElement).innerHTML = state.brand
    ? `<button class="chip" data-clear-brand>${esc(state.brand)} <span aria-hidden="true">×</span><span class="sr">clear brand filter</span></button>`
    : '';

  ($('#nav-home') as HTMLElement).classList.toggle('on', state.view === 'home');
  ($('#nav-brand') as HTMLElement).classList.toggle('on', state.brandSheetOpen);
}

function go(view: View): void {
  state.view = view;
  render();
  window.scrollTo({ top: 0 });
}

/* ── wiring ──────────────────────────────────────────────────────────────── */

function init(): void {
  $('#search').addEventListener('input', (e) => {
    state.query = (e.target as HTMLInputElement).value;
    // Typing is a browse action wherever you are.
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

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;

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

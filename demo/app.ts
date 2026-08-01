/**
 * Demo harness for the ScentDay comparison core.
 *
 * This file contains no pricing logic of its own — it is a thin renderer over
 * the real modules in `src/`, bundled unchanged. Every number on the page comes
 * from `buildComparison`, `resolveDelivery`, `buildDiscount` and
 * `pendingAffiliateSetup`, so the demo cannot drift from the committed code.
 *
 * The offers it renders are invented (see `demo/data.ts`). The page says so.
 */
import {
  buildComparison,
  bestOffer,
  purchasableOffers,
  outOfStockOffers,
  canShowCountdown,
  pendingAffiliateSetup,
  formatGbp,
  RETAILERS,
  TIKTOK_BETA_CONFIG,
  visibleTikTokSellers,
} from '../src/index.js';
import type { PresentedOffer, StockState } from '../src/types/offer.js';
import type { SortKey } from '../src/services/priceService.js';
import { DEMO_FRAGRANCES, type DemoFragrance } from './data.js';

const state = {
  fragranceId: DEMO_FRAGRANCES[0]!.id,
  sortBy: 'delivered' as SortKey,
  hideOutOfStock: false,
  applyTierFilter: true,
  query: '',
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const $ = (sel: string) => document.querySelector(sel)!;

function currentFragrance(): DemoFragrance {
  return DEMO_FRAGRANCES.find((f) => f.id === state.fragranceId) ?? DEMO_FRAGRANCES[0]!;
}

/* ── formatting helpers ──────────────────────────────────────────────────── */

const STOCK_LABEL: Record<StockState, string> = {
  inStock: 'In stock',
  lowStock: 'Low stock',
  preOrder: 'Pre-order',
  unknown: 'Not confirmed',
  outOfStock: 'Out of stock',
};

const STOCK_CLASS: Record<StockState, string> = {
  inStock: 'ok',
  lowStock: 'warn',
  preOrder: 'warn',
  unknown: 'muted',
  outOfStock: 'bad',
};

function relativeAge(seconds: number): string {
  if (seconds < 90) return 'checked just now';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `checked ${mins} min ago`;
  const hours = Math.round(mins / 60);
  return `checked ${hours}h ago`;
}

function countdown(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `ends in ${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `ends in ${hours}h`;
}

/* ── rendering ───────────────────────────────────────────────────────────── */

function deliveryCell(row: PresentedOffer): string {
  const d = row.delivery;
  const main = d.isFree
    ? '<span class="tag ok">Free</span>'
    : `<span class="num">${formatGbp(d.costGbp)}</span>`;

  const bits: string[] = [`<div class="cell-main">${main}</div>`];

  if (d.spendMoreForFreeGbp !== null) {
    bits.push(
      `<div class="cell-sub">${formatGbp(d.spendMoreForFreeGbp)} more for free delivery</div>`,
    );
  } else if (!d.isFree && d.freeReason === null && !d.spendMoreForFreeGbp) {
    bits.push('<div class="cell-sub">no spend-based free delivery</div>');
  }

  bits.push(
    `<div class="cell-sub dim">${d.estimatedDays[0]}–${d.estimatedDays[1]} working days</div>`,
  );

  if (d.membershipNote) {
    bits.push(
      `<div class="cell-sub dim" title="${esc(d.membershipNote)}">membership rate available</div>`,
    );
  }
  return bits.join('');
}

function offerRow(row: PresentedOffer, isBest: boolean): string {
  const discount = row.discount;
  const showCountdown = canShowCountdown(discount);

  const priceBlock = discount
    ? `<span class="num now">${formatGbp(row.itemPriceGbp)}</span>
       <span class="num was">${formatGbp(discount.wasPrice)}</span>
       <span class="tag sale">${discount.percentOff}% off</span>`
    : `<span class="num">${formatGbp(row.itemPriceGbp)}</span>`;

  const promo = showCountdown
    ? `<div class="cell-sub warnText">${esc(countdown(discount!.endsAt!))}</div>`
    : discount
      ? '<div class="cell-sub dim">no end time published</div>'
      : '';

  return `
    <tr class="${isBest ? 'best' : ''} ${row.isPurchasable ? '' : 'unavailable'}">
      <td>
        <div class="cell-main retailer">${esc(row.retailer.name)}${
          isBest ? '<span class="tag best-tag">Best delivered</span>' : ''
        }</div>
        <div class="cell-sub dim">${esc(row.retailer.domain)} · ${esc(relativeAge(row.ageSeconds))}</div>
      </td>
      <td class="right">${priceBlock}${promo}</td>
      <td class="right">${deliveryCell(row)}</td>
      <td class="right">
        <div class="cell-main"><span class="num delivered">${formatGbp(row.deliveredPriceGbp)}</span></div>
        ${row.delivery.confirmed ? '' : '<div class="cell-sub dim">rules unverified</div>'}
      </td>
      <td>
        <span class="pill ${STOCK_CLASS[row.stock]}">${STOCK_LABEL[row.stock]}</span>
      </td>
      <td class="right">
        <a class="buy" href="${esc(row.outboundUrl)}" rel="nofollow noopener" target="_blank">
          View${row.isAffiliateLink ? '' : '<span class="sr">, untracked link</span>'}
        </a>
        <div class="cell-sub dim">${row.isAffiliateLink ? 'affiliate' : 'direct link'}</div>
      </td>
    </tr>`;
}

function tableFor(rows: PresentedOffer[], best: PresentedOffer | null): string {
  if (rows.length === 0) return '';
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Retailer</th>
            <th class="right">Item price</th>
            <th class="right">Delivery</th>
            <th class="right">Delivered${state.sortBy === 'delivered' ? ' <span class="sortmark">↓</span>' : ''}</th>
            <th>Stock</th>
            <th class="right">Link</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => offerRow(r, best !== null && r === best)).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderResults(): string {
  const frag = currentFragrance();
  const rows = buildComparison(frag.offers, {
    sortBy: state.sortBy,
    hideOutOfStock: state.hideOutOfStock,
    ...(state.applyTierFilter ? { tier: frag.tier } : {}),
  });

  const buyable = purchasableOffers(rows);
  const unavailable = outOfStockOffers(rows);
  const best = bestOffer(rows);

  const skipped = frag.offers.length - rows.length;

  const headline = best
    ? `<div class="headline">
         <div class="headline-label">Cheapest delivered</div>
         <div class="headline-price num">${formatGbp(best.deliveredPriceGbp)}</div>
         <div class="headline-meta">
           at ${esc(best.retailer.name)} —
           ${formatGbp(best.itemPriceGbp)} plus
           ${best.delivery.isFree ? 'free delivery' : `${formatGbp(best.delivery.costGbp)} delivery`}
         </div>
       </div>`
    : `<div class="headline empty">
         <div class="headline-label">Nothing buyable</div>
         <div class="headline-meta">
           Every listing is explicitly out of stock. No price is headlined, because
           the cheapest figure here is one nobody can actually pay.
         </div>
       </div>`;

  return `
    <header class="frag-head">
      <div class="frag-brand">${esc(frag.brand)}</div>
      <h2 class="frag-name">${esc(frag.name)}</h2>
      <div class="frag-meta">
        ${esc(frag.concentration)} · ${frag.sizeMl}ml
        <span class="tier">${esc(frag.tier)}</span>
      </div>
    </header>

    ${headline}

    <p class="scenario"><span class="scenario-label">What this case shows</span>${esc(frag.note)}</p>

    ${tableFor(buyable, best)}

    ${
      unavailable.length > 0
        ? `<div class="group-break">
             <span>Out of stock</span>
             <span class="dim">shown last, never headlined</span>
           </div>
           ${tableFor(unavailable, null)}`
        : ''
    }

    ${
      skipped > 0
        ? `<p class="footnote">${skipped} listing${skipped === 1 ? '' : 's'} withheld —
           ${state.applyTierFilter ? `retailers that do not stock the ${esc(frag.tier)} tier are not queried` : 'filtered out'}.</p>`
        : ''
    }`;
}

function renderSearch(): string {
  const q = state.query.trim().toLowerCase();
  const matches = q
    ? DEMO_FRAGRANCES.filter((f) =>
        `${f.brand} ${f.name} ${f.concentration}`.toLowerCase().includes(q),
      )
    : DEMO_FRAGRANCES;

  if (matches.length === 0) {
    return `<li class="no-match">No demo fragrance matches “${esc(state.query)}”.</li>`;
  }

  return matches
    .map(
      (f) => `
      <li>
        <button class="frag-btn ${f.id === state.fragranceId ? 'active' : ''}" data-frag="${f.id}">
          <span class="fb-brand">${esc(f.brand)}</span>
          <span class="fb-name">${esc(f.name)}</span>
          <span class="fb-meta">${f.sizeMl}ml · ${esc(f.tier)}</span>
        </button>
      </li>`,
    )
    .join('');
}

function renderOps(): string {
  const gaps = pendingAffiliateSetup();
  const unverifiedShipping = RETAILERS.filter((r) => r.shipping.confidence === 'unverified');

  return `
    <section class="panel">
      <h3>Affiliate <span class="count">${gaps.length}/${RETAILERS.length} outstanding</span></h3>
      <p class="panel-note">
        No programme is live, so every “View” link above is the plain retailer URL —
        functional, unmonetised. Filling in a publisher ID switches it over with no
        other change.
      </p>
      <ul class="mini">
        ${gaps
          .slice(0, 4)
          .map(
            (g) => `<li>
              <span class="mini-name">${esc(g.retailerName)}</span>
              <span class="pill ${g.networkVerified ? 'warn' : 'muted'}">${esc(g.network ?? 'network unknown')}</span>
            </li>`,
          )
          .join('')}
        <li class="dim">…and ${gaps.length - 4} more — <code>npm run affiliate:status</code></li>
      </ul>
    </section>

    <section class="panel">
      <h3>Shipping data <span class="count bad-count">${unverifiedShipping.length} unverified</span></h3>
      <p class="panel-note">
        Delivery rules were sourced from search, not read off each retailer's own
        page. A stale threshold produces a wrong delivered price — invisible to the
        user and authoritative-looking, which is the worst kind of error this app
        can make. Selfridges is the worst case: sources disagree on whether free
        delivery starts at £100 or £150.
      </p>
    </section>

    <section class="panel">
      <h3>TikTok Shop <span class="pill muted">beta · off</span></h3>
      <p class="panel-note">
        Kill switch is <code>enabled: ${String(TIKTOK_BETA_CONFIG.enabled)}</code>, and the
        curated seller list is empty — ${visibleTikTokSellers().length} sellers render.
        Untrusted sellers are excluded outright rather than badged: a warning label
        still gives a counterfeit a shelf next to genuine stock.
      </p>
    </section>`;
}

function render(): void {
  $('#results').innerHTML = renderResults();
  $('#frag-list').innerHTML = renderSearch();
  ($('#sort-delivered') as HTMLInputElement).checked = state.sortBy === 'delivered';
  ($('#sort-item') as HTMLInputElement).checked = state.sortBy === 'item';
  ($('#hide-oos') as HTMLInputElement).checked = state.hideOutOfStock;
  ($('#tier-filter') as HTMLInputElement).checked = state.applyTierFilter;
}

/* ── wiring ──────────────────────────────────────────────────────────────── */

function init(): void {
  $('#ops').innerHTML = renderOps();

  $('#search').addEventListener('input', (e) => {
    state.query = (e.target as HTMLInputElement).value;
    $('#frag-list').innerHTML = renderSearch();
  });

  $('#frag-list').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-frag]');
    if (!btn) return;
    state.fragranceId = btn.getAttribute('data-frag')!;
    render();
  });

  $('#controls').addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name === 'sort') state.sortBy = el.value as SortKey;
    if (el.id === 'hide-oos') state.hideOutOfStock = el.checked;
    if (el.id === 'tier-filter') state.applyTierFilter = el.checked;
    render();
  });

  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

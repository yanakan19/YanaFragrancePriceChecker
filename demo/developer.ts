/**
 * /developer: the owner's private dashboard (owner request, 6 October 2026).
 *
 *   Visitors      the cookieless counter's totals (demo/siteCounter.ts), with
 *                 a range (hour, day, week, month, year) and a country filter
 *   Shop Clicks   the popularity index beside it: clicks through to shops,
 *                 which is what earns affiliate commission, as the most
 *                 clicked products, brands and shops over the same range
 *   Brands and    every brand and shop with its number of listings,
 *   Retailers     searchable and sortable, with Hide, Remove and Show Again
 *                 on the ticked rows (demo/siteOverrides.ts for what each does)
 *   Connections   Google AdSense and Stripe, not connected yet, each saying
 *                 what it will show and what the owner has to do
 *
 * ── Who sees it ──────────────────────────────────────────────────────────────
 * Only an account whose profile carries the owner's flag, which the owner
 * sets in the SQL Editor (supabase/migrations/0007_site_stats.sql; no address
 * or id is written in this repository). The page asks the database
 * (is_site_admin) and the database answers from the signed in session; every
 * total and every change is refused by the database itself to anyone else,
 * whatever this page does. A signed out visitor, or any account that is not
 * the owner's, gets the site's ordinary Page Not Found, with the same title.
 * Until the migration is run nobody is the owner, so a signed in account is
 * shown "Not Set Up Yet" and the steps instead.
 *
 * Its styles are added to the page the first time it opens, so no other page
 * carries them. demo/app.ts draws it through developerView() and asks
 * developerHeadName() for the tab's title.
 */
import { supabase } from './supabase.js';
import { RETAILERS } from '../src/config/retailers.js';
import { CATALOGUE, CRAWLED } from './catalogue.generated.js';
import { fragranceById, fragranceBySlug } from './data.js';
import { SITE_OVERRIDE_ROWS, SITE_STASH, SITE_STATS_ON } from './siteData.js';
import { countListings, parseOverrideRows, type OverrideKind, type OverrideRow, type OverrideState } from './siteOverrides.js';
import {
  STATS_RANGES, bucketKeys, bucketLabel, clickTops, countryName, fillSeries, isStatsRange, niceScale, parseStats,
  rangeSpec, seriesTotals, sinceFor, type StatsData, type StatsRange,
} from './siteStats.js';

export interface DeveloperHost {
  /** The signed in account, or null. */
  user(): { id: string } | null;
  /** True once the first session check has come back. */
  authChecked(): boolean;
  /** Draws the whole page again (the tab's title follows what is decided here). */
  rerender(): void;
  /** The site's own Page Not Found, shown to anyone who is not the owner. */
  notFoundHtml(): string;
  /** The site's own confirmation pop up. */
  confirm(o: { title: string; message: string; confirmLabel: string; danger?: boolean }): Promise<boolean>;
}

type Access = 'idle' | 'checking' | 'notSetUp' | 'denied' | 'owner';

const dev = {
  access: 'idle' as Access,
  /** Whose session the access answer belongs to. */
  accessFor: '' as string,
  range: 'day' as StatsRange,
  country: '',
  stats: null as StatsData | null,
  statsState: 'idle' as 'idle' | 'loading' | 'ready' | 'failed',
  statsAsked: '',
  overrides: null as OverrideRow[] | null,
  overridesState: 'idle' as 'idle' | 'loading' | 'ready' | 'failed',
  boxes: {
    brand: { q: '', sort: 'name' as SortKey, dir: 1, status: 'all' as StatusFilter, picked: new Set<string>(), busy: false, msg: '' },
    retailer: { q: '', sort: 'name' as SortKey, dir: 1, status: 'all' as StatusFilter, picked: new Set<string>(), busy: false, msg: '' },
  },
};

type SortKey = 'name' | 'products' | 'listings' | 'status';
type StatusFilter = 'all' | 'shown' | 'hidden' | 'removed' | 'off';
type RowStatus = 'shown' | 'hidden' | 'removed' | 'off';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number) => n.toLocaleString('en-GB');

let host: DeveloperHost | null = null;
let installed = false;

/* ── access ──────────────────────────────────────────────────────────────── */

/** True for PostgREST's answers that a function or table does not exist yet. */
function isMissing(error: { code?: string; message?: string } | null, status?: number): boolean {
  if (!error) return false;
  return status === 404 || error.code === 'PGRST202' || error.code === 'PGRST205' || error.code === '42P01' || error.code === '42883';
}

async function checkAccess(uid: string): Promise<void> {
  const client = supabase();
  dev.access = 'checking';
  dev.accessFor = uid;
  let next: Access = 'denied';
  if (client) {
    try {
      const { data, error, status } = await client.rpc('is_site_admin');
      if (isMissing(error, status)) next = 'notSetUp';
      else if (!error && data === true) next = 'owner';
    } catch {
      next = 'denied';
    }
  }
  if (dev.accessFor !== uid) return;
  dev.access = next;
  host?.rerender();
}

/** The tab's name: 'Developer' for the owner, nothing (Page Not Found) for anyone else. */
export function developerHeadName(): string | undefined {
  return dev.access === 'owner' || dev.access === 'notSetUp' ? 'Developer' : undefined;
}

/* ── loading ─────────────────────────────────────────────────────────────── */

function statsKey(): string {
  return `${dev.range}|${dev.country}`;
}

async function loadStats(): Promise<void> {
  const client = supabase();
  if (!client) return;
  const asked = statsKey();
  dev.statsAsked = asked;
  dev.statsState = 'loading';
  paintStats();
  const now = new Date();
  try {
    const { data, error, status } = await client.rpc('site_stats', {
      p_since: sinceFor(dev.range, now).toISOString(),
      p_unit: dev.range,
      p_country: dev.country === '' ? null : dev.country === 'unknown' ? 'unknown' : dev.country,
    });
    if (dev.statsAsked !== asked) return;
    if (isMissing(error, status)) {
      dev.access = 'notSetUp';
      host?.rerender();
      return;
    }
    if (error) throw error;
    dev.stats = parseStats(data);
    dev.statsState = 'ready';
  } catch {
    if (dev.statsAsked !== asked) return;
    dev.statsState = 'failed';
  }
  paintStats();
}

async function loadOverrides(): Promise<void> {
  const client = supabase();
  if (!client) return;
  dev.overridesState = 'loading';
  try {
    const { data, error, status } = await client.from('site_overrides').select('kind,key,state,name');
    if (isMissing(error, status)) {
      dev.access = 'notSetUp';
      host?.rerender();
      return;
    }
    if (error) throw error;
    dev.overrides = parseOverrideRows(data);
    dev.overridesState = 'ready';
  } catch {
    dev.overridesState = 'failed';
  }
  paintBox('brand');
  paintBox('retailer');
}

/* ── the view ────────────────────────────────────────────────────────────── */

/**
 * The page. Signed out, or not the owner: the site's Page Not Found. While the
 * answer is on its way: an empty page, so nothing is shown to anyone who turns
 * out not to be the owner.
 */
export function developerView(h: DeveloperHost): string {
  host = h;
  install();
  if (!h.authChecked()) return busy();
  const user = h.user();
  if (!user) {
    dev.access = 'idle';
    dev.accessFor = '';
    return h.notFoundHtml();
  }
  if (dev.accessFor !== user.id || dev.access === 'idle') {
    void checkAccess(user.id);
    return busy();
  }
  switch (dev.access) {
    case 'checking': return busy();
    case 'denied': return h.notFoundHtml();
    case 'notSetUp': return notSetUpView(user.id);
    default: break;
  }
  addStyles();
  if (dev.statsState === 'idle' || (dev.statsState !== 'loading' && dev.statsAsked !== statsKey())) queueMicrotask(() => void loadStats());
  if (dev.overridesState === 'idle') queueMicrotask(() => void loadOverrides());
  return `
    <article class="doc dev-doc" aria-labelledby="dev-title">
      <h1 class="t-page" id="dev-title">Developer</h1>
      <p class="t-caption dev-lede">Private to you. Visits are counted without cookies, and times are UK time.</p>
      ${filtersHtml()}
      <div class="dev-top">
        <section class="dev-card" id="dev-visitors" aria-labelledby="dev-visitors-h">${visitorsHtml()}</section>
        <section class="dev-card" id="dev-clicks" aria-labelledby="dev-clicks-h">${clicksHtml()}</section>
      </div>
      <div class="dev-lists">
        <section class="dev-card dev-box" id="dev-box-brand" aria-labelledby="dev-h-brand">${boxHtml('brand')}</section>
        <section class="dev-card dev-box" id="dev-box-retailer" aria-labelledby="dev-h-retailer">${boxHtml('retailer')}</section>
      </div>
      ${connectionsHtml()}
    </article>`;
}

function busy(): string {
  return `<article class="doc" aria-busy="true"></article>`;
}

function notSetUpView(uid: string): string {
  addStyles();
  return `
    <article class="doc dev-doc" aria-labelledby="dev-title">
      <h1 class="t-page" id="dev-title">Developer</h1>
      <section class="dev-card dev-setup" aria-labelledby="dev-setup-h">
        <h2 class="t-section" id="dev-setup-h">Not Set Up Yet</h2>
        <p>This dashboard needs one database script. Until it is run nothing is
        counted, nothing can be hidden, and the site works exactly as before.</p>
        <ol>
          <li>In the Supabase dashboard open SQL Editor, then New Query. Paste
          the whole of <code>supabase/migrations/0007_site_stats.sql</code> and
          press Run.</li>
          <li>Make this account the owner's. In a new query run:
          <pre class="dev-code"><code>update public.profiles set is_admin = true
where id = '${esc(uid)}';</code></pre>
          That is the id of the account you are signed in with now.</li>
          <li>On GitHub, run the Deploy site workflow, or wait for the next
          price crawl to deploy the site. Counting starts with that deploy.</li>
          <li>Reload this page.</li>
        </ol>
        <p class="t-caption">The same steps, with how to check each one, are in
        <code>docs/OWNER-STEPS.md</code> under Developer Dashboard.</p>
      </section>
    </article>`;
}

/* ── filters ─────────────────────────────────────────────────────────────── */

function filtersHtml(): string {
  return `
    <div class="dev-filters">
      <div class="seg dev-range" role="group" aria-label="Range">
        ${STATS_RANGES.map(
          (r) => `<button type="button" class="seg-btn${r.id === dev.range ? ' on' : ''}" data-dev-range="${r.id}" aria-pressed="${r.id === dev.range}">${r.label}</button>`,
        ).join('')}
      </div>
      <label class="dev-field"><span class="t-caption">Country</span>
        <select id="dev-country" class="dev-select">${countryOptions()}</select>
      </label>
    </div>
    <p class="t-caption dev-range-caption" id="dev-range-caption">${esc(rangeSpec(dev.range).caption)}</p>`;
}

function countryOptions(): string {
  const list = dev.stats?.countries ?? [];
  const opts = [`<option value=""${dev.country === '' ? ' selected' : ''}>All Countries</option>`];
  const seen = new Set<string>();
  for (const c of list) {
    const value = c.code === '' ? 'unknown' : c.code;
    seen.add(value);
    opts.push(`<option value="${value}"${dev.country === value ? ' selected' : ''}>${esc(countryName(c.code))} (${fmt(c.visits)})</option>`);
  }
  // The chosen country stays in the list while its numbers load.
  if (dev.country && !seen.has(dev.country)) {
    opts.push(`<option value="${esc(dev.country)}" selected>${esc(countryName(dev.country === 'unknown' ? '' : dev.country))}</option>`);
  }
  return opts.join('');
}

/* ── visitors ────────────────────────────────────────────────────────────── */

function visitorsHtml(): string {
  const loading = dev.statsState === 'loading' || dev.statsState === 'idle';
  const head = `<h2 class="t-section" id="dev-visitors-h">Visitors</h2>`;
  if (dev.statsState === 'failed') return `${head}<p class="dev-note" role="status">The numbers could not be loaded. Check your connection and reload.</p>`;
  if (!dev.stats) return `${head}<p class="dev-note" role="status">Loading</p>`;
  const series = fillSeries(bucketKeys(dev.range, new Date()), dev.stats.series);
  const totals = seriesTotals(series);
  const notYet = SITE_STATS_ON
    ? ''
    : `<p class="dev-note">Counting starts with the next deploy of the site.</p>`;
  return `${head}
    <div class="dev-stats${loading ? ' is-loading' : ''}">
      <div class="dev-stat"><span class="t-caption">Visitors</span><strong>${fmt(totals.visits)}</strong></div>
      <div class="dev-stat"><span class="t-caption">Page Views</span><strong>${fmt(totals.views)}</strong></div>
    </div>
    ${notYet}
    ${chartHtml(series)}
    <div class="dev-pair">
      ${topList('Top Pages', dev.stats.pages.slice(0, 5).map((p) => ({ label: pageLabel(p.page), count: p.views })), 'No page views yet.')}
      ${topList('Where Visitors Came From', dev.stats.sources.slice(0, 5).map((s) => ({ label: s.host, count: s.visits })), 'No visits from other sites yet.')}
    </div>`;
}

/** A product page's path as the product's name; any other path as it is. */
function pageLabel(path: string): string {
  const slug = path.slice(1);
  const f = /^[a-z0-9_]+$/.test(slug) ? fragranceBySlug(slug) : undefined;
  return f ? `${f.brand} ${f.name}${f.sizeMl ? ` ${f.sizeMl}ml` : ''}` : path;
}

function chartHtml(series: { key: string; views: number; visits: number }[]): string {
  const max = Math.max(0, ...series.map((p) => p.visits));
  const { top, ticks } = niceScale(max);
  const label = (k: string) => bucketLabel(dev.range, k, true);
  const marks = [0, Math.floor((series.length - 1) / 2), series.length - 1];
  const summary = `Visitors, ${rangeSpec(dev.range).caption.toLowerCase()}: ${fmt(seriesTotals(series).visits)} in all, at most ${fmt(max)} in one ${dev.range}.`;
  return `
    <figure class="dev-chart">
      <div class="dev-plot" role="img" aria-label="${esc(summary)}">
        <div class="dev-axis" aria-hidden="true">${ticks
          .map((t) => `<span class="dev-tick" style="bottom:${(t / top) * 100}%">${fmt(t)}</span>`)
          .join('')}</div>
        <div class="dev-grid" aria-hidden="true">${ticks.map((t) => `<span style="bottom:${(t / top) * 100}%"></span>`).join('')}</div>
        <div class="dev-bars" style="--n:${series.length}">${series
          .map(
            (p, i) =>
              `<span class="dev-bar-slot" data-dev-tip="${esc(`${label(p.key)}|${fmt(p.visits)}|${fmt(p.views)}`)}" data-i="${i}"><span class="dev-bar" style="height:${top ? (p.visits / top) * 100 : 0}%"></span></span>`,
          )
          .join('')}</div>
        <div class="dev-tip" hidden></div>
      </div>
      <div class="dev-xlabels" aria-hidden="true">${marks
        .filter((m, i, all) => all.indexOf(m) === i)
        .map((m) => `<span>${esc(bucketLabel(dev.range, series[m]!.key))}</span>`)
        .join('')}</div>
      <details class="dev-table-view">
        <summary>Show as Table</summary>
        <div class="dev-table-wrap"><table class="dev-table">
          <thead><tr><th scope="col">When</th><th scope="col" class="num">Visitors</th><th scope="col" class="num">Page Views</th></tr></thead>
          <tbody>${[...series]
            .reverse()
            .map((p) => `<tr><td>${esc(label(p.key))}</td><td class="num">${fmt(p.visits)}</td><td class="num">${fmt(p.views)}</td></tr>`)
            .join('')}</tbody>
        </table></div>
      </details>
    </figure>`;
}

function topList(title: string, items: { label: string; count: number }[], empty: string): string {
  return `<div class="dev-toplist">
    <h3 class="dev-toplist-h">${esc(title)}</h3>
    ${
      items.length
        ? `<ol>${items.map((i) => `<li><span class="dev-toplist-name">${esc(i.label)}</span><span class="dev-toplist-n">${fmt(i.count)}</span></li>`).join('')}</ol>`
        : `<p class="dev-note">${esc(empty)}</p>`
    }
  </div>`;
}

/* ── shop clicks ─────────────────────────────────────────────────────────── */

function clicksHtml(): string {
  const head = `<h2 class="t-section" id="dev-clicks-h">Shop Clicks</h2>
    <p class="t-caption">Clicks through to a shop, which is what earns commission.</p>`;
  if (dev.statsState === 'failed') return `${head}<p class="dev-note">The numbers could not be loaded.</p>`;
  if (!dev.stats) return `${head}<p class="dev-note" role="status">Loading</p>`;
  const tops = clickTops(dev.stats.clicks);
  const shopName = (id: string) => RETAILERS.find((r) => r.id === id)?.name ?? id;
  const productName = (id: string) => {
    const f = fragranceById(id);
    return f ? `${f.brand} ${f.name}${f.sizeMl ? ` ${f.sizeMl}ml` : ''}` : id;
  };
  return `${head}
    <div class="dev-stats${dev.statsState === 'loading' ? ' is-loading' : ''}">
      <div class="dev-stat"><span class="t-caption">Shop Clicks</span><strong>${fmt(tops.total)}</strong></div>
    </div>
    ${topList('Top Products', tops.products.map((r) => ({ label: productName(r.key), count: r.count })), 'No clicks yet.')}
    <div class="dev-pair">
      ${topList('Top Brands', tops.brands.map((r) => ({ label: r.key, count: r.count })), 'No clicks yet.')}
      ${topList('Top Shops', tops.shops.map((r) => ({ label: shopName(r.key), count: r.count })), 'No clicks yet.')}
    </div>`;
}

function paintStats(): void {
  const v = document.getElementById('dev-visitors');
  const c = document.getElementById('dev-clicks');
  if (v) v.innerHTML = visitorsHtml();
  if (c) c.innerHTML = clicksHtml();
  const sel = document.getElementById('dev-country') as HTMLSelectElement | null;
  if (sel && dev.stats) sel.innerHTML = countryOptions();
}

/* ── brands and retailers ────────────────────────────────────────────────── */

interface Row {
  key: string;
  name: string;
  products: number | null;
  listings: number | null;
  status: RowStatus;
}

let counts: ReturnType<typeof countListings> | null = null;

function currentOverrides(): OverrideRow[] {
  return dev.overrides ?? SITE_OVERRIDE_ROWS;
}

function rowsOf(kind: OverrideKind): Row[] {
  counts ??= countListings(CATALOGUE, CRAWLED, SITE_STASH);
  const state = new Map<string, OverrideRow>();
  for (const o of currentOverrides()) if (o.kind === kind) state.set(o.key, o);
  const status = (key: string, fallback: RowStatus): RowStatus => state.get(key)?.state ?? fallback;
  const rows: Row[] = [];
  const seen = new Set<string>();
  if (kind === 'brand') {
    for (const b of counts.brands.values()) {
      seen.add(b.key);
      rows.push({ key: b.key, name: b.name, products: b.products, listings: b.listings, status: status(b.key, 'shown') });
    }
  } else {
    for (const r of RETAILERS) {
      seen.add(r.id);
      // An override switches a shop off on the page itself; the code's own
      // switch is what the registry said before that.
      const onInCode = r.enabled || SITE_STASH.retailers.includes(r.id);
      rows.push({ key: r.id, name: r.name, products: null, listings: counts.retailers.get(r.id) ?? 0, status: status(r.id, onInCode ? 'shown' : 'off') });
    }
  }
  // Removed at the last deploy, so not in this page's data at all.
  for (const [key, o] of state) {
    if (seen.has(key)) continue;
    rows.push({ key, name: o.name || key, products: null, listings: null, status: o.state });
  }
  return rows;
}

const STATUS_LABEL: Record<RowStatus, string> = { shown: 'Shown', hidden: 'Hidden', removed: 'Removed', off: 'Off in Code' };
const STATUS_ORDER: Record<RowStatus, number> = { removed: 0, hidden: 1, off: 2, shown: 3 };

function visibleRows(kind: OverrideKind): Row[] {
  const box = dev.boxes[kind];
  const q = box.q.trim().toLowerCase();
  const rows = rowsOf(kind).filter(
    (r) => (box.status === 'all' || r.status === box.status) && (!q || r.name.toLowerCase().includes(q) || r.key.includes(q)),
  );
  const by = (r: Row): number | string =>
    box.sort === 'name' ? r.name.toLowerCase() : box.sort === 'status' ? STATUS_ORDER[r.status] : (box.sort === 'products' ? r.products : r.listings) ?? -1;
  return rows.sort((a, b) => {
    const x = by(a);
    const y = by(b);
    const d = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x as number) - (y as number);
    return d * box.dir || a.name.localeCompare(b.name);
  });
}

const BOX_TITLE: Record<OverrideKind, string> = { brand: 'Brands', retailer: 'Retailers' };

function boxHtml(kind: OverrideKind): string {
  const box = dev.boxes[kind];
  const all = rowsOf(kind);
  const statuses: [StatusFilter, string][] = [
    ['all', 'All'],
    ['shown', 'Shown'],
    ['hidden', 'Hidden'],
    ['removed', 'Removed'],
    ...(kind === 'retailer' ? ([['off', 'Off in Code']] as [StatusFilter, string][]) : []),
  ];
  return `
    <div class="dev-box-head">
      <h2 class="t-section" id="dev-h-${kind}">${BOX_TITLE[kind]}</h2>
      <span class="t-caption">${fmt(all.length)}</span>
    </div>
    <p class="t-caption">${
      kind === 'brand'
        ? 'Hide takes a brand off the site and keeps its data. Remove also leaves it out of the build. Show Again brings it back.'
        : 'Hide takes a shop off the site and keeps its data. Remove also stops the crawl reading it. Show Again brings it back.'
    }</p>
    <div class="dev-tools">
      <input type="search" id="dev-q-${kind}" class="dev-input" value="${esc(box.q)}" placeholder="Search ${BOX_TITLE[kind]}" aria-label="Search ${BOX_TITLE[kind]}" autocomplete="off" />
      <select id="dev-status-${kind}" class="dev-select" aria-label="Show ${BOX_TITLE[kind]}">${statuses
        .map(([v, l]) => `<option value="${v}"${box.status === v ? ' selected' : ''}>${l}</option>`)
        .join('')}</select>
    </div>
    <div class="dev-bulk" id="dev-bulk-${kind}">${bulkHtml(kind)}</div>
    <div class="dev-table-wrap dev-rows-wrap" tabindex="0" role="region" aria-label="${BOX_TITLE[kind]} list">
      <table class="dev-table dev-list" id="dev-table-${kind}">${tableHtml(kind)}</table>
    </div>`;
}

function bulkHtml(kind: OverrideKind): string {
  const box = dev.boxes[kind];
  const n = box.picked.size;
  const off = n === 0 || box.busy ? ' disabled' : '';
  return `
    <span class="t-caption dev-picked" aria-live="polite">${n === 0 ? 'None ticked' : `${fmt(n)} ticked`}</span>
    <span class="dev-actions">
      <button type="button" class="dev-btn" data-dev-act="hidden" data-kind="${kind}"${off}>Hide</button>
      <button type="button" class="dev-btn" data-dev-act="removed" data-kind="${kind}"${off}>Remove</button>
      <button type="button" class="dev-btn" data-dev-act="show" data-kind="${kind}"${off}>Show Again</button>
    </span>
    <p class="dev-msg t-caption" role="status">${esc(box.msg)}</p>`;
}

function tableHtml(kind: OverrideKind): string {
  const box = dev.boxes[kind];
  const rows = visibleRows(kind);
  const allPicked = rows.length > 0 && rows.every((r) => box.picked.has(r.key));
  const th = (key: SortKey, label: string, cls = '') => {
    const on = box.sort === key;
    return `<th scope="col" class="${cls}" aria-sort="${on ? (box.dir === 1 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="dev-sort" data-dev-sort="${key}" data-kind="${kind}">${label}${on ? (box.dir === 1 ? ' <span aria-hidden="true">↑</span>' : ' <span aria-hidden="true">↓</span>') : ''}</button></th>`;
  };
  const count = (n: number | null) => (n === null ? '<span class="dev-faint">Not built</span>' : fmt(n));
  return `
    <thead><tr>
      <th scope="col" class="pick"><input type="checkbox" data-dev-pickall="${kind}" aria-label="Tick every ${BOX_TITLE[kind].toLowerCase().replace(/s$/, '')} shown"${allPicked ? ' checked' : ''} /></th>
      ${th('name', kind === 'brand' ? 'Brand' : 'Retailer')}
      ${kind === 'brand' ? th('products', 'Products', 'num col-products') : ''}
      ${th('listings', 'Listings', 'num')}
      ${th('status', 'Status', 'col-status')}
    </tr></thead>
    <tbody>${
      rows.length
        ? rows
            .map(
              (r) => `<tr class="is-${r.status}">
        <td class="pick"><input type="checkbox" data-dev-pick="${kind}" value="${esc(r.key)}" aria-label="Tick ${esc(r.name)}"${box.picked.has(r.key) ? ' checked' : ''} /></td>
        <td class="name">${esc(r.name)}<span class="dev-status-inline"> <span class="dev-status is-${r.status}">${STATUS_LABEL[r.status]}</span></span></td>
        ${kind === 'brand' ? `<td class="num col-products">${count(r.products)}</td>` : ''}
        <td class="num">${count(r.listings)}</td>
        <td class="status col-status"><span class="dev-status is-${r.status}">${STATUS_LABEL[r.status]}</span></td>
      </tr>`,
            )
            .join('')
        : `<tr><td colspan="${kind === 'brand' ? 5 : 4}" class="dev-empty">Nothing matches.</td></tr>`
    }</tbody>`;
}

function paintBox(kind: OverrideKind, what: 'all' | 'table' | 'bulk' = 'all'): void {
  if (what === 'all') {
    const el = document.getElementById(`dev-box-${kind}`);
    if (!el) return;
    // The search box keeps the reader's caret if it is the one being typed in.
    const typing = document.activeElement?.id === `dev-q-${kind}`;
    if (typing) {
      paintBox(kind, 'table');
      paintBox(kind, 'bulk');
      return;
    }
    el.innerHTML = boxHtml(kind);
    return;
  }
  if (what === 'table') {
    const t = document.getElementById(`dev-table-${kind}`);
    if (t) t.innerHTML = tableHtml(kind);
  }
  const b = document.getElementById(`dev-bulk-${kind}`);
  if (b) b.innerHTML = bulkHtml(kind);
}

async function act(kind: OverrideKind, action: OverrideState | 'show'): Promise<void> {
  const client = supabase();
  const box = dev.boxes[kind];
  const keys = [...box.picked];
  if (!client || keys.length === 0 || box.busy) return;
  const noun = (n: number) => (kind === 'brand' ? (n === 1 ? 'brand' : 'brands') : n === 1 ? 'shop' : 'shops');
  if (action === 'removed') {
    const ok = await host?.confirm({
      title: `Remove ${fmt(keys.length)} ${noun(keys.length)}?`,
      message:
        kind === 'brand'
          ? 'They go off the site now and are left out of the next build. Show Again brings them back with the deploy after that.'
          : 'They go off the site now, are left out of the next build, and the crawl stops reading them. Show Again brings them back.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
  }
  box.busy = true;
  box.msg = '';
  paintBox(kind, 'bulk');
  const names = new Map(rowsOf(kind).map((r) => [r.key, r.name]));
  let failed = false;
  try {
    if (action === 'show') {
      const { error } = await client.from('site_overrides').delete().eq('kind', kind).in('key', keys);
      if (error) throw error;
    } else {
      const rows = keys.map((key) => ({ kind, key, state: action, name: (names.get(key) ?? key).slice(0, 120), updated_at: new Date().toISOString() }));
      const { error } = await client.from('site_overrides').upsert(rows, { onConflict: 'kind,key' });
      if (error) throw error;
    }
  } catch {
    failed = true;
  }
  box.busy = false;
  if (failed) {
    box.msg = 'That did not save. Check you are still signed in, then try again.';
    paintBox(kind, 'bulk');
    return;
  }
  const done = action === 'show' ? 'Shown again' : action === 'hidden' ? 'Hidden' : 'Removed';
  box.msg = `${done}: ${fmt(keys.length)} ${noun(keys.length)}. Visitors see the change on their next page load.`;
  box.picked.clear();
  await loadOverrides();
}

/* ── connections ─────────────────────────────────────────────────────────── */

/**
 * Services whose own figures belong on this page once the owner connects
 * them. Each needs a secret (an AdSense sign in, a Stripe key) that must never
 * be in this repository or in the page, so connecting one means a small server
 * side function holding the secret and answering only the owner, the same way
 * site_stats does (docs/OWNER-STEPS.md, Developer Dashboard). `status` is the
 * plug: it answers 'not connected' until that function exists.
 */
interface Connection {
  id: 'adsense' | 'stripe';
  name: string;
  shows: string;
  steps: string[];
  status: () => 'not connected';
}

const CONNECTIONS: Connection[] = [
  {
    id: 'adsense',
    name: 'Google AdSense',
    shows: 'Ad earnings, ad views and ad clicks by day, beside the visitor numbers above.',
    steps: [
      'Finish AdSense approval for pricesniffs.space (Owner Steps, section 5).',
      'In Google Cloud, switch on the AdSense Management API and make an OAuth client.',
      'Give the sign in token to a Supabase Edge Function as a secret, never in the code.',
      'Tell Claude it is there; this card then shows the figures.',
    ],
    status: () => 'not connected',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    shows: 'Premium subscribers, payments and refunds, once Premium is on sale.',
    steps: [
      'Open and verify the Stripe account (docs/STRIPE-SETUP.md).',
      'Make a restricted key that can only read balances, charges and subscriptions.',
      'Give it to a Supabase Edge Function as a secret, never in the code.',
      'Tell Claude it is there; this card then shows the figures.',
    ],
    status: () => 'not connected',
  },
];

function connectionsHtml(): string {
  return `
    <section class="dev-connections" aria-labelledby="dev-conn-h">
      <h2 class="t-section" id="dev-conn-h">Connections</h2>
      <div class="dev-conn-grid">${CONNECTIONS.map(
        (c) => `
        <div class="dev-card dev-conn" data-connection="${c.id}">
          <div class="dev-box-head"><h3 class="t-title">${esc(c.name)}</h3><span class="dev-status is-off">Not Connected</span></div>
          <p class="t-body">${esc(c.shows)}</p>
          <ol class="dev-steps">${c.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        </div>`,
      ).join('')}</div>
    </section>`;
}

/* ── events ──────────────────────────────────────────────────────────────── */

function install(): void {
  if (installed) return;
  installed = true;
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const range = t.closest<HTMLElement>('[data-dev-range]');
    if (range) {
      const r = range.getAttribute('data-dev-range') ?? '';
      if (isStatsRange(r) && r !== dev.range) {
        dev.range = r;
        for (const b of document.querySelectorAll<HTMLElement>('[data-dev-range]')) {
          const on = b.getAttribute('data-dev-range') === r;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        }
        const cap = document.getElementById('dev-range-caption');
        if (cap) cap.textContent = rangeSpec(r).caption;
        void loadStats();
      }
      return;
    }
    const sort = t.closest<HTMLElement>('[data-dev-sort]');
    if (sort) {
      const kind = sort.getAttribute('data-kind') as OverrideKind;
      const key = sort.getAttribute('data-dev-sort') as SortKey;
      const box = dev.boxes[kind];
      if (box.sort === key) box.dir = -box.dir;
      else {
        box.sort = key;
        box.dir = key === 'name' ? 1 : -1;
      }
      paintBox(kind, 'table');
      document.querySelector<HTMLElement>(`[data-dev-sort="${key}"][data-kind="${kind}"]`)?.focus();
      return;
    }
    const action = t.closest<HTMLButtonElement>('[data-dev-act]');
    if (action && !action.disabled) {
      void act(action.getAttribute('data-kind') as OverrideKind, action.getAttribute('data-dev-act') as OverrideState | 'show');
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.id === 'dev-country') {
      dev.country = t.value;
      void loadStats();
      return;
    }
    const status = /^dev-status-(brand|retailer)$/.exec(t.id);
    if (status) {
      const kind = status[1] as OverrideKind;
      dev.boxes[kind].status = t.value as StatusFilter;
      paintBox(kind, 'table');
      return;
    }
    const pick = t.getAttribute('data-dev-pick') as OverrideKind | null;
    if (pick) {
      const box = dev.boxes[pick];
      if ((t as HTMLInputElement).checked) box.picked.add(t.value);
      else box.picked.delete(t.value);
      paintBox(pick, 'bulk');
      const all = document.querySelector<HTMLInputElement>(`[data-dev-pickall="${pick}"]`);
      if (all) all.checked = visibleRows(pick).every((r) => box.picked.has(r.key));
      return;
    }
    const pickAll = t.getAttribute('data-dev-pickall') as OverrideKind | null;
    if (pickAll) {
      const box = dev.boxes[pickAll];
      for (const r of visibleRows(pickAll)) {
        if ((t as HTMLInputElement).checked) box.picked.add(r.key);
        else box.picked.delete(r.key);
      }
      paintBox(pickAll, 'table');
      paintBox(pickAll, 'bulk');
      document.querySelector<HTMLElement>(`[data-dev-pickall="${pickAll}"]`)?.focus();
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    const m = /^dev-q-(brand|retailer)$/.exec(t.id);
    if (!m) return;
    const kind = m[1] as OverrideKind;
    dev.boxes[kind].q = t.value;
    paintBox(kind, 'table');
  });

  // The chart's tooltip: the bar under the pointer, its period, visitors and page views.
  document.addEventListener('pointerover', (e) => {
    const slot = (e.target as HTMLElement).closest?.<HTMLElement>('[data-dev-tip]');
    const plot = slot?.closest<HTMLElement>('.dev-plot');
    const tip = plot?.querySelector<HTMLElement>('.dev-tip');
    for (const on of document.querySelectorAll('.dev-bar-slot.is-on')) on.classList.remove('is-on');
    for (const t of document.querySelectorAll<HTMLElement>('.dev-tip')) if (t !== tip) t.hidden = true;
    if (!slot || !plot || !tip) return;
    const [when, visits, views] = (slot.getAttribute('data-dev-tip') ?? '').split('|');
    tip.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = `${visits} visitors`;
    const line = document.createElement('span');
    line.textContent = `${views} page views`;
    const head = document.createElement('span');
    head.className = 'dev-tip-when';
    head.textContent = when ?? '';
    tip.append(head, strong, line);
    tip.hidden = false;
    slot.classList.add('is-on');
    const p = plot.getBoundingClientRect();
    const s = slot.getBoundingClientRect();
    const x = Math.min(Math.max(s.left + s.width / 2 - p.left - tip.offsetWidth / 2, 0), p.width - tip.offsetWidth);
    tip.style.left = `${x}px`;
  });
}

/* ── styles ──────────────────────────────────────────────────────────────── */

function addStyles(): void {
  if (document.getElementById('dev-style')) return;
  const style = document.createElement('style');
  style.id = 'dev-style';
  style.textContent = DEV_CSS;
  document.head.appendChild(style);
}

const DEV_CSS = `
  .dev-doc { max-width: none; }
  :root[data-layout="desktop"] .dev-doc { max-width: 1180px; }
  .dev-doc .dev-lede { margin: -6px 0 14px; }
  .dev-card {
    background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
    padding: 14px; margin: 0 0 14px; min-width: 0;
  }
  .dev-doc .dev-card h2 { margin: 0 0 4px; }
  .dev-doc .dev-card p { margin: 0 0 8px; }
  .dev-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 10px 16px; margin: 0 0 6px; }
  .dev-range { flex: 1 1 280px; max-width: 420px; }
  .dev-range .seg-btn { min-width: 0; padding: 8px 4px; }
  .dev-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 160px; max-width: 260px; }
  .dev-select, .dev-input {
    font: inherit; font-size: 15px; color: var(--ink); background: var(--surface);
    border: 1px solid var(--line-firm); border-radius: 10px; padding: 0 10px; min-height: 44px; min-width: 0;
  }
  .dev-select:focus-visible, .dev-input:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  .dev-doc .dev-range-caption { margin: 0 0 12px; }
  .dev-top, .dev-lists { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 14px; }
  :root[data-layout="desktop"] .dev-top { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
  :root[data-layout="desktop"] .dev-lists { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .dev-stats { display: flex; gap: 24px; margin: 10px 0 12px; transition: opacity .2s; }
  .dev-stats.is-loading { opacity: .55; }
  .dev-stat { display: flex; flex-direction: column; gap: 2px; }
  .dev-stat strong { font: 650 28px/1.1 var(--font-sans); color: var(--ink); letter-spacing: -.02em; }
  .dev-doc .dev-note { color: var(--faint); font-size: 13px; }
  .dev-chart { margin: 16px 0 12px; }
  .dev-plot { position: relative; height: 160px; margin-left: 36px; }
  .dev-axis { position: absolute; left: -36px; top: 0; bottom: 0; width: 30px; }
  .dev-tick {
    position: absolute; right: 0; transform: translateY(50%);
    font: 400 11px/1 var(--font-num); color: var(--faint); font-variant-numeric: tabular-nums;
  }
  .dev-grid span { position: absolute; left: 0; right: 0; height: 1px; background: var(--chart-grid); }
  .dev-bars { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
  .dev-bar-slot { position: relative; display: flex; align-items: flex-end; justify-content: center; padding: 0 1px; height: 100%; cursor: default; }
  .dev-bar { display: block; width: 100%; max-width: 24px; min-height: 0; background: var(--accent); border-radius: 4px 4px 0 0; }
  .dev-bar-slot.is-on .dev-bar { background: var(--accent-ink); }
  .dev-tip {
    position: absolute; top: -8px; transform: translateY(-100%); z-index: 2; pointer-events: none;
    display: flex; flex-direction: column; gap: 1px; white-space: nowrap;
    background: var(--surface-2); border: 1px solid var(--line-firm); border-radius: 8px; padding: 6px 9px;
    font-size: 12.5px; color: var(--ink-2); box-shadow: var(--shadow);
  }
  .dev-tip strong { color: var(--ink); font-size: 14px; }
  .dev-tip-when { color: var(--faint); }
  .dev-xlabels { display: flex; justify-content: space-between; margin: 6px 0 0 36px; font-size: 11.5px; color: var(--faint); }
  .dev-table-view { margin-top: 8px; }
  .dev-table-view summary { cursor: pointer; font-size: 13px; color: var(--ink-2); min-height: 24px; }
  .dev-table-wrap { overflow-x: auto; }
  .dev-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .dev-table th, .dev-table td { text-align: left; padding: 6px 6px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .dev-table th { font-weight: 600; color: var(--ink-2); font-size: 12.5px; }
  .dev-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .dev-table td.name { overflow-wrap: break-word; color: var(--ink); }
  .dev-table .pick { width: 34px; }
  .dev-table input[type="checkbox"] { width: 20px; height: 20px; margin: 0; accent-color: var(--accent); }
  .dev-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 16px; }
  @media (max-width: 380px) { .dev-pair { grid-template-columns: minmax(0, 1fr); } }
  .dev-toplist { min-width: 0; margin-top: 8px; }
  .dev-doc .dev-toplist-h { font: 600 13px/1.3 var(--font-sans); color: var(--ink); margin: 0 0 4px; }
  .dev-doc .dev-toplist ol { list-style: none; margin: 0; padding: 0; }
  .dev-doc .dev-toplist li { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--line); margin: 0; font-size: 13px; }
  .dev-toplist-name { min-width: 0; overflow-wrap: anywhere; color: var(--ink-2); }
  .dev-toplist-n { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
  .dev-box-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .dev-tools { display: flex; gap: 8px; margin: 8px 0; }
  .dev-tools .dev-input { flex: 1 1 auto; width: 100%; }
  .dev-tools .dev-select { flex: 0 0 auto; max-width: 46%; }
  .dev-bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 0 0 6px; }
  .dev-actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .dev-btn {
    min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-firm);
    background: transparent; color: var(--ink); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .dev-btn:disabled { color: var(--faint); cursor: default; }
  .dev-btn:focus-visible, .dev-sort:focus-visible, .dev-rows-wrap:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .dev-doc .dev-msg { flex-basis: 100%; margin: 0; min-height: 0; }
  .dev-rows-wrap { max-height: 420px; overflow-y: auto; border-top: 1px solid var(--line); }
  .dev-list thead th { position: sticky; top: 0; background: var(--surface); z-index: 1; }
  .dev-sort { background: none; border: 0; padding: 4px 0; min-height: 32px; font: inherit; color: inherit; cursor: pointer; }
  .dev-status { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line-firm); color: var(--ink-2); white-space: nowrap; }
  .dev-status.is-hidden { color: var(--warn); border-color: var(--warn); }
  .dev-status.is-removed { color: var(--accent-ink); border-color: var(--accent); }
  .dev-status.is-off { color: var(--faint); }
  .dev-faint, .dev-empty { color: var(--faint); }
  .dev-status-inline { display: none; }
  @media (max-width: 400px) { .dev-table .col-products { display: none; } }
  @media (max-width: 420px) {
    .dev-tools { flex-wrap: wrap; }
    .dev-tools .dev-select { flex: 1 1 100%; max-width: none; }
    .dev-table th, .dev-table td { padding: 6px 3px; }
    .dev-table .pick { width: 28px; }
    .dev-status { padding: 2px 6px; font-size: 11.5px; }
    .dev-table .col-status { display: none; }
    .dev-status-inline { display: block; margin-top: 2px; }
    .dev-card { padding: 12px; }
  }
  .dev-connections { margin-top: 4px; }
  .dev-conn-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 14px; margin-top: 8px; }
  :root[data-layout="desktop"] .dev-conn-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .dev-doc .dev-conn h3 { margin: 0; }
  .dev-doc .dev-steps { margin: 6px 0 0; padding-left: 20px; }
  .dev-doc .dev-steps li { font-size: 13.5px; }
  .dev-code { background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; overflow-x: auto; font-size: 12.5px; margin: 6px 0; white-space: pre; }
  .dev-setup ol { padding-left: 20px; }
`;

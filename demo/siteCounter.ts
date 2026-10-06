/**
 * The cookieless visitor counter (owner request, 6 October 2026), feeding the
 * developer dashboard at /developer.
 *
 * ── What it sends, and how ───────────────────────────────────────────────────
 * One small request per page shown, and one per click through to a shop, each
 * to a database function that adds one to an hourly total
 * (supabase/migrations/0007_site_stats.sql). The rules for what goes in them
 * are in demo/siteStats.ts: the page's path, whether it opened a visit, the
 * linking site's host for a visit; the product, brand and shop for a click.
 * The country is added by the database from Cloudflare's header.
 *
 * Nothing identifies a visitor and nothing is stored on their device: no
 * cookie (the requests carry no credentials, so the browser neither sends nor
 * keeps one), no local storage, no identifier. A visit is told from a page
 * view by the browser's own referrer and navigation type.
 *
 * ── Never in the way ─────────────────────────────────────────────────────────
 * Nothing is sent until the page has loaded and the browser is idle, every
 * request is fire and forget (keepalive, so a click's count survives the tab
 * moving on), and a failure is ignored. The first 404 (the database function
 * is missing) stops it for the rest of the page's life. It never runs unless
 * the deploy found the database ready (SITE_STATS_ON, demo/siteData.ts), nor
 * for crawlers and automated browsers.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_CONFIGURED } from './supabase.js';
import { countablePage, isAutomatedAgent, isEntry, referrerHost } from './siteStats.js';

export interface CounterHooks {
  /** The path of the page now on screen, as the router writes it. */
  page(): string;
  /** The product a shop link on screen belongs to, or null when it is not a product's. */
  product(): { id: string; brand: string } | null;
}

let stopped = false;

function send(fn: 'count_page_view' | 'count_shop_click', body: Record<string, unknown>): void {
  if (stopped) return;
  try {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
      .then((r) => {
        if (r.status === 404) stopped = true;
      })
      .catch(() => {});
  } catch {
    // A browser without fetch, or one that refuses keepalive: no count.
  }
}

function whenIdle(fn: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(fn, { timeout: 3000 });
  else setTimeout(fn, 1000);
}

/**
 * Starts counting, when `on`. Page views follow the address bar: the first
 * one once the page has loaded, then one each time the site pushes a new
 * address or the reader goes back or forward. Replacing the address (typing
 * in the search box, tidying an old product address) is not a new page.
 */
export function startSiteCounter(on: boolean, hooks: CounterHooks): void {
  if (!on || !SUPABASE_CONFIGURED || typeof fetch !== 'function') return;
  if (isAutomatedAgent(navigator.userAgent) || (navigator as { webdriver?: boolean }).webdriver === true) return;

  const ownHost = location.hostname;
  let last: string | null = null;
  let first = true;

  const countView = () => {
    const page = countablePage(hooks.page());
    if (page === null || page === last) return;
    last = page;
    if (first) {
      first = false;
      const nav = performance.getEntriesByType?.('navigation')[0] as { type?: string } | undefined;
      const entry = isEntry(document.referrer, ownHost, nav?.type ?? 'navigate');
      send('count_page_view', { p_page: page, p_entry: entry, p_referrer: entry ? referrerHost(document.referrer, ownHost) : '' });
    } else {
      send('count_page_view', { p_page: page, p_entry: false, p_referrer: '' });
    }
  };

  const start = () => {
    whenIdle(countView);
    const push = history.pushState;
    history.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
      push.apply(this, args);
      setTimeout(countView, 0);
    };
    addEventListener('popstate', () => setTimeout(countView, 0));
  };
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });

  // A click through to a shop: the offer rows' links carry the shop's id.
  // Middle clicks open the shop too, so they count as well.
  const onClick = (e: MouseEvent) => {
    if (e.type === 'auxclick' && e.button !== 1) return;
    const link = (e.target as Element | null)?.closest?.('a[data-shop]');
    if (!link) return;
    const retailer = link.getAttribute('data-shop') ?? '';
    const product = hooks.product();
    if (!product || !retailer) return;
    send('count_shop_click', { p_product: product.id, p_brand: product.brand, p_retailer: retailer });
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
}

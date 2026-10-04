import type { Http } from './attempt.js';
import { extractJsonLdBlocks, isPreOrderAvailability, parseAvailability } from './jsonld.js';
import { isAllowed, type RobotsRules } from './robots.js';
import type { RawListing } from './types.js';
import { HIDE_OFFER_AFTER_DAYS } from '../services/offerAge.js';

/**
 * Read a bottle's pre-order state from the shop's own product page.
 *
 * ── The shop this exists for, measured 2026-10-04 ───────────────────────────
 * Bloom Perfumery's `/products.json` calls a bottle `available: true` whether
 * it is on the shelf or a Pre-Order, and carries nothing else that tells the
 * two apart. Its product page does, per variant, in two places that agree:
 *
 *   - The page's JSON-LD Product block lists one Offer per variant, each with
 *     the variant's own `sku` and a schema.org `availability`:
 *     `https://schema.org/PreOrder` for a pre-order, `InStock` for stock,
 *     `OutOfStock` for sold out. The `sku` is the same string the feed gives
 *     the listing (`ROSE-IVOIRE-DE-CARON-100-ML-EDP`), so each stored listing
 *     is answered by its own variant and by no other.
 *   - The visible variant list prints a PRE-ORDER flag on the same variants
 *     (`variant__flag only-for-backorder`), and the page's own body carries
 *     `data-bottles-status="preorder"`.
 *
 * This reads the JSON-LD, the structured statement, and nothing else.
 *
 * ── What it will and will not do ────────────────────────────────────────────
 * It reads a stated fact and never infers one. A page whose JSON-LD does not
 * list a listing's SKU says nothing about it, and the listing stays as the
 * feed gave it. A page that says PreOrder, BackOrder or PreSale for the SKU
 * (the same words `isPreOrderAvailability` accepts for every JSON-LD shop)
 * makes the listing a pre-order. A page that says OutOfStock for a SKU the
 * feed calls available is a conflict between two statements and is left as
 * the feed said, and reported.
 *
 * Only listings the feed calls available are read: a bottle the feed already
 * says is sold out cannot be a pre-order, so its page is never asked for.
 * robots.txt is checked for every address before it is asked for and a refusal
 * is an answer; every request carries the crawler's own honest headers.
 */

/** What a product page states for one variant. */
export type PageStock = 'preOrder' | 'inStock' | 'outOfStock' | 'other';

/** The availability each SKU is given on a page's JSON-LD, by SKU. A SKU stated two ways is left out. */
export function parseProductPageAvailability(html: string): Map<string, PageStock> {
  const found = new Map<string, PageStock>();
  const conflicted = new Set<string>();

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    const sku = typeof o['sku'] === 'string' ? o['sku'].trim() : typeof o['sku'] === 'number' ? String(o['sku']) : '';
    const availability = o['availability'];
    if (sku && typeof availability === 'string') {
      const stock: PageStock = isPreOrderAvailability(availability)
        ? 'preOrder'
        : parseAvailability(availability) === true
          ? 'inStock'
          : parseAvailability(availability) === false
            ? 'outOfStock'
            : 'other';
      const before = found.get(sku);
      if (before !== undefined && before !== stock) conflicted.add(sku);
      found.set(sku, stock);
    }
    for (const value of Object.values(o)) {
      if (value && typeof value === 'object') visit(value);
    }
  };

  for (const block of extractJsonLdBlocks(html)) visit(block);
  for (const sku of conflicted) found.delete(sku);
  return found;
}

export interface PriorAvailability {
  availability?: RawListing['availability'];
  availabilityReadAt?: string | null;
}

export interface ProductPageAvailabilityReport {
  listings: RawListing[];
  /** Product pages asked for. */
  fetched: number;
  /** Listings answered by their own variant on a page read this run. */
  read: number;
  /** Listings now flagged Preorder from a page read this run. */
  preOrder: string[];
  /** Listings a page read this run says are not pre-orders any more, having been flagged before. */
  cleared: string[];
  /** Listings flagged Preorder from an earlier read because their page could not be read this run. */
  carried: string[];
  /** Listings whose page was read and does not list their SKU: left as the feed says. */
  unlisted: string[];
  /** Listings the feed calls available and the page calls out of stock: left as the feed says. */
  conflicts: string[];
  /** Pages not read (robots.txt, HTTP error, no connection, out of time) and why. */
  unread: string[];
}

export interface ProductPageAvailabilityOptions {
  http: Http;
  robots: RobotsRules;
  /** The crawler's own honest headers; never a browser's. */
  headers: Record<string, string>;
  gapMs: number;
  /** Appended to each product URL to ask for the UK market, e.g. `country=GB`. */
  marketParam?: string | null;
  deadlineAt?: number;
  sleep?: (ms: number) => Promise<void>;
  /** What the last run stored for each SKU: the order of this run's reads, and what to keep for a page that cannot be read. */
  prior?: ReadonlyMap<string, PriorAvailability>;
  now?: Date;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const DAY_MS = 24 * 60 * 60 * 1000;

/** Only a listing the feed calls available can be a pre-order that the feed hides. */
export function wantsPageAvailability(l: Pick<RawListing, 'inStock' | 'priceGbp'>): boolean {
  return l.inStock === true && l.priceGbp !== null;
}

/**
 * Read each wanted listing's product page, once per page, oldest read first,
 * and mark the listings its JSON-LD says are pre-orders.
 *
 * Order: pages holding a listing flagged on the last run first (a bottle that
 * ships should stop saying Preorder promptly), then pages never read, then the
 * rest by how long ago they were read. A run that runs out of time therefore
 * leaves the longest unread pages for the next one, and every page is
 * eventually read.
 *
 * A page that cannot be read leaves each listing as the feed gave it, except
 * that a pre-order flagged by an earlier read of that same page is kept, for
 * at most `HIDE_OFFER_AFTER_DAYS` since that read, rather than flipping a
 * bottle to in stock over one failed request. A page that was read and does
 * not list the SKU never inherits a pre-order.
 */
export async function readAvailabilityFromProductPages(
  listings: readonly RawListing[],
  options: ProductPageAvailabilityOptions,
): Promise<ProductPageAvailabilityReport> {
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const prior = options.prior ?? new Map<string, PriorAvailability>();
  const report: ProductPageAvailabilityReport = {
    listings: [], fetched: 0, read: 0, preOrder: [], cleared: [], carried: [], unlisted: [], conflicts: [], unread: [],
  };

  const perUrl = new Map<string, RawListing[]>();
  for (const l of listings) {
    if (!wantsPageAvailability(l)) continue;
    perUrl.set(l.url, [...(perUrl.get(l.url) ?? []), l]);
  }

  const rank = (group: RawListing[]): number => {
    let best = Number.POSITIVE_INFINITY;
    for (const l of group) {
      const p = prior.get(l.retailerSku);
      const readAt = p?.availabilityReadAt ? Date.parse(p.availabilityReadAt) : NaN;
      const r = p?.availability === 'preOrder' ? -2 : Number.isFinite(readAt) ? readAt : -1;
      if (r < best) best = r;
    }
    return best;
  };
  const ordered = [...perUrl.entries()].sort((a, b) => rank(a[1]) - rank(b[1]));

  const answers = new Map<RawListing, RawListing>();
  const keepRead = (l: RawListing): RawListing => {
    const readAt = prior.get(l.retailerSku)?.availabilityReadAt;
    return readAt ? { ...l, availabilityReadAt: readAt } : l;
  };
  /** The page could not answer: keep an earlier, recent pre-order; otherwise leave the feed's word. */
  const unanswered = (l: RawListing): RawListing => {
    const p = prior.get(l.retailerSku);
    const readMs = p?.availabilityReadAt ? Date.parse(p.availabilityReadAt) : NaN;
    if (p?.availability === 'preOrder' && Number.isFinite(readMs) && now.getTime() - readMs <= HIDE_OFFER_AFTER_DAYS * DAY_MS) {
      report.carried.push(`${l.retailerSku} ${l.rawTitle}`);
      return { ...l, inStock: false, availability: 'preOrder', availabilityReadAt: p.availabilityReadAt! };
    }
    return keepRead(l);
  };

  let first = true;
  for (const [url, group] of ordered) {
    const asked = options.marketParam ? `${url}${url.includes('?') ? '&' : '?'}${options.marketParam}` : url;
    if (!isAllowed(options.robots, asked)) {
      report.unread.push(`${url}: disallowed by robots.txt`);
      for (const l of group) answers.set(l, unanswered(l));
      continue;
    }
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
      report.unread.push(`${url}: out of time`);
      for (const l of group) answers.set(l, unanswered(l));
      continue;
    }
    if (!first && options.gapMs > 0) await sleep(options.gapMs);
    first = false;

    report.fetched++;
    const res = await options.http(asked, options.headers);
    if (!res.ok || res.status !== 200) {
      report.unread.push(`${url}: HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
      for (const l of group) answers.set(l, unanswered(l));
      continue;
    }

    const page = parseProductPageAvailability(res.body);
    for (const l of group) {
      const stated = page.get(l.retailerSku);
      if (stated === undefined) {
        report.unlisted.push(`${l.retailerSku} ${l.rawTitle}`);
        answers.set(l, keepRead(l));
        continue;
      }
      report.read++;
      if (stated === 'preOrder') {
        report.preOrder.push(`${l.retailerSku} ${l.rawTitle}`);
        answers.set(l, { ...l, inStock: false, availability: 'preOrder', availabilityReadAt: nowIso });
        continue;
      }
      if (stated === 'outOfStock') {
        report.conflicts.push(`${l.retailerSku} ${l.rawTitle}: feed available, page out of stock`);
      }
      if (prior.get(l.retailerSku)?.availability === 'preOrder') report.cleared.push(`${l.retailerSku} ${l.rawTitle}`);
      answers.set(l, { ...l, availabilityReadAt: nowIso });
    }
  }

  for (const l of listings) report.listings.push(answers.get(l) ?? l);
  return report;
}

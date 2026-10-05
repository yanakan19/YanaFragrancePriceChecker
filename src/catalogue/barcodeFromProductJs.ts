import type { Http } from './attempt.js';
import { readBarcode, type BarcodeRefusal } from './barcode.js';
import { isAllowed, type RobotsRules } from './robots.js';
import type { RawListing } from './types.js';

/**
 * Read each variant's barcode from a Shopify shop's own product file.
 *
 * ── Why this route, measured 2026-10-05 on Perfume Direct ───────────────────
 * Perfume Direct (www.perfumedirect.com) lists about 4,000 variants on about
 * 2,700 products, and every one has a barcode in the shop's own data. Where it
 * is exposed:
 *
 *   /products.json            250 products a request, the route the harvest
 *                             already walks. Its variants carry id, title, sku,
 *                             price, available and dates, and no barcode (read:
 *                             page 1, keys of a variant). Shopify keeps the field
 *                             out of the public listing.
 *   /products/<handle>.js     one product, every variant, and each variant has
 *                             "barcode". One request per product, however many
 *                             sizes it has. Not disallowed by robots.txt, which
 *                             disallows /cart.js and not this file.
 *   the sitemap, JSON-LD      the sitemap only lists the same product pages, so
 *                             it would be a second request per product for the
 *                             same file; a product page's JSON-LD was not read.
 *
 * So the fewest requests per listing is the product file: 2,700 requests for
 * 4,000 listings, never one per variant. `/products.json?limit=250` stays the
 * source of which variants exist and what they cost; this adds only the barcode.
 *
 * ── Incremental, and polite ─────────────────────────────────────────────────
 * - A barcode is read once. A listing keeps it (with Shopify's own variant id,
 *   `shopVariantId`) and is not read again while its variant id is the same.
 *   A listing whose field held no usable barcode is marked read (`eanReadAt`)
 *   and asked again only after NO_BARCODE_RECHECK_DAYS.
 * - At most `maxReads` products a run, `gapMs` apart, inside the shop's
 *   deadline, so the shop is read over several runs.
 * - Order: listings that look like another shop's product first (a barcode
 *   makes that match exact), then the rest; never read before read-and-empty
 *   before read a long time ago.
 * - robots.txt is checked for every address. A refusal is an answer: an HTTP
 *   401, 403, 407, 429 or 503, or a 200 that is not the product file (a bot
 *   challenge page), stops the run's reading on the spot, is recorded in
 *   `stopped`, and nothing is retried or asked another way. Three failures to
 *   connect in a row stop it too. A 404 or 410 is the shop saying the product
 *   has gone and is just skipped.
 *
 * Nothing here guesses: a barcode is stored only when `readBarcode` accepts it,
 * and only for the variant the file names by Shopify's own id (or, where the
 * listing carries no variant id, by SKU).
 */

/** How long a listing whose barcode field held nothing usable is left before it is asked again. */
export const NO_BARCODE_RECHECK_DAYS = 45;

/** One variant of a product file. */
export interface ProductJsVariant {
  id: string | null;
  sku: string | null;
  /** The barcode field exactly as the shop typed it, or null. */
  barcode: string | null;
}

/** What `/products/<handle>.js` holds that this reads. */
export interface ProductJs {
  id: string | null;
  handle: string | null;
  variants: ProductJsVariant[];
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Parse a product file. Null for anything that is not one: an HTML challenge
 * page, an error document, a product with no variants list.
 */
export function parseProductJs(body: string): ProductJs | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p['variants'])) return null;
  const variants: ProductJsVariant[] = [];
  for (const raw of p['variants']) {
    if (!raw || typeof raw !== 'object') continue;
    const v = raw as Record<string, unknown>;
    variants.push({ id: text(v['id']), sku: text(v['sku']), barcode: text(v['barcode']) });
  }
  return { id: text(p['id']), handle: text(p['handle']), variants };
}

/** The product handle in a Shopify product URL, or null. */
export function handleOf(url: string): string | null {
  try {
    const m = /^\/products\/([^/?#]+)\/?$/.exec(new URL(url).pathname);
    return m ? decodeURIComponent(m[1]!) : null;
  } catch {
    return null;
  }
}

/** The product file's address on the host the shop's robots.txt was read from. */
export function productJsUrl(origin: string, handle: string): string {
  return `${origin.replace(/\/+$/, '')}/products/${encodeURIComponent(handle)}.js`;
}

/** What a listing already holds of an earlier read. */
export interface HeldBarcode {
  ean: string | null;
  eanReadAt: string | null;
  shopVariantId: string | null;
}

export interface BarcodeReadOptions {
  http: Http;
  robots: RobotsRules;
  /** The crawler's own honest headers. */
  headers: Record<string, string>;
  /** The host the product files are read from, e.g. https://www.perfumedirect.com. */
  origin: string;
  /** Milliseconds between two requests. */
  gapMs: number;
  /** Most products to read this run. */
  maxReads: number;
  deadlineAt?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: Date;
  /** What the stored listings hold, by SKU, from the last run. */
  held: ReadonlyMap<string, HeldBarcode>;
  /** Whether a listing is worth a read (a fragrance; a body lotion's barcode matches nothing here). */
  wanted: (l: RawListing) => boolean;
  /** Whether a listing looks like a product another shop sells, so it is read first. */
  looksShared?: (l: RawListing) => boolean;
  /** Called after each request, with the number made so far and of those planned, so a long read can say it is alive. */
  onProgress?: (fetched: number, planned: number) => void;
}

export interface BarcodeReadReport {
  /** Every listing given, with `ean`, `eanReadAt` and `shopVariantId` settled as far as this run got. */
  listings: RawListing[];
  /** Product files requested. */
  fetched: number;
  /** Listings that now carry a barcode they did not carry before this run. */
  newBarcodes: number;
  /** Listings that kept a barcode read on an earlier run, with no request. */
  carried: number;
  /** Listings read this run whose field held nothing usable, by reason. */
  refused: Partial<Record<BarcodeRefusal | 'shared-by-variants', number>>;
  /** Wanted listings still with no read at all when the run stopped. */
  unreadLeft: number;
  /** Listings with a barcode after this run, of those wanted. */
  withBarcode: number;
  /** Wanted listings in all. */
  wantedListings: number;
  /** Why reading stopped early (a refusal, a challenge, no connection), or null. */
  stopped: string | null;
  /** Lines worth logging: pages not read, and why. */
  unread: string[];
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Statuses that are the shop saying no to the bot. Same set as refusal.ts, plus 503 (a challenge's usual status). */
const REFUSING = new Set([401, 403, 407, 429, 503]);

function daysBetween(fromIso: string, to: Date): number {
  const at = Date.parse(fromIso);
  return Number.isFinite(at) ? (to.getTime() - at) / 86_400_000 : Number.POSITIVE_INFINITY;
}

/**
 * The listings with their barcodes read, as far as this run's budget goes.
 * See the file header for the rules.
 */
export async function readBarcodesFromProductJs(
  listings: readonly RawListing[],
  options: BarcodeReadOptions,
): Promise<BarcodeReadReport> {
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const report: BarcodeReadReport = {
    listings: [],
    fetched: 0,
    newBarcodes: 0,
    carried: 0,
    refused: {},
    unreadLeft: 0,
    withBarcode: 0,
    wantedListings: 0,
    stopped: null,
    unread: [],
  };

  const out = new Map<RawListing, RawListing>();
  /** Listings that need a request, by product handle. */
  const toRead = new Map<string, RawListing[]>();
  /** How far down the order a handle goes: 0 shared and never read, 1 shared otherwise, 2 never read, 3 the rest. */
  const rank = new Map<string, number>();
  const oldest = new Map<string, number>();

  for (const l of listings) {
    if (!options.wanted(l)) continue;
    report.wantedListings++;
    const held = options.held.get(l.retailerSku);
    const variant = l.shopVariantId ?? null;
    const sameVariant = held !== undefined && held.shopVariantId !== null && held.shopVariantId === variant;
    if (sameVariant && held.ean) {
      out.set(l, { ...l, ean: held.ean, eanReadAt: held.eanReadAt ?? null });
      report.carried++;
      continue;
    }
    if (sameVariant && held.eanReadAt && daysBetween(held.eanReadAt, now) < NO_BARCODE_RECHECK_DAYS) {
      out.set(l, { ...l, ean: null, eanReadAt: held.eanReadAt });
      continue;
    }
    const handle = handleOf(l.url);
    if (handle === null) {
      report.unread.push(`${l.retailerSku}: no product handle in ${l.url}`);
      continue;
    }
    toRead.set(handle, [...(toRead.get(handle) ?? []), l]);
    const shared = options.looksShared?.(l) ?? false;
    const neverRead = !(held?.eanReadAt);
    const r = shared ? (neverRead ? 0 : 1) : neverRead ? 2 : 3;
    rank.set(handle, Math.min(rank.get(handle) ?? 3, r));
    const at = held?.eanReadAt ? Date.parse(held.eanReadAt) : 0;
    oldest.set(handle, Math.min(oldest.get(handle) ?? Number.POSITIVE_INFINITY, Number.isFinite(at) ? at : 0));
  }

  // The order: rank, then the longest unread, then the handle, so a run is repeatable.
  const order = [...toRead.keys()].sort(
    (a, b) => rank.get(a)! - rank.get(b)! || oldest.get(a)! - oldest.get(b)! || (a < b ? -1 : a > b ? 1 : 0),
  );

  let first = true;
  let connectFailures = 0;
  const unreadHandles = new Set<string>();
  for (let i = 0; i < order.length; i++) {
    const handle = order[i]!;
    const group = toRead.get(handle)!;
    if (report.stopped !== null) {
      unreadHandles.add(handle);
      continue;
    }
    if (report.fetched >= options.maxReads) {
      unreadHandles.add(handle);
      continue;
    }
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
      unreadHandles.add(handle);
      continue;
    }
    const url = productJsUrl(options.origin, handle);
    if (!isAllowed(options.robots, url)) {
      report.unread.push(`${handle}: disallowed by robots.txt`);
      unreadHandles.add(handle);
      continue;
    }
    if (!first && options.gapMs > 0) await sleep(options.gapMs);
    first = false;

    report.fetched++;
    const res = await options.http(url, options.headers);
    options.onProgress?.(report.fetched, Math.min(order.length, options.maxReads));
    if (REFUSING.has(res.status)) {
      report.stopped = `${url}: HTTP ${res.status}${res.error ? ` ${res.error}` : ''}; no more product files asked this run`;
      unreadHandles.add(handle);
      continue;
    }
    if (res.status === 404 || res.status === 410) {
      report.unread.push(`${handle}: HTTP ${res.status}, the shop no longer has this product`);
      unreadHandles.add(handle);
      connectFailures = 0;
      continue;
    }
    if (!res.ok || res.status !== 200) {
      report.unread.push(`${handle}: HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
      unreadHandles.add(handle);
      connectFailures = res.status === 0 ? connectFailures + 1 : 0;
      if (connectFailures >= 3) report.stopped = `three requests in a row did not connect (last ${url}); no more product files asked this run`;
      continue;
    }
    connectFailures = 0;
    const file = parseProductJs(res.body);
    if (file === null) {
      // A 200 that is not the product file is a challenge or an error page, not a product.
      report.stopped = `${url}: HTTP 200 but not a product file (a bot challenge or an error page); no more product files asked this run`;
      unreadHandles.add(handle);
      continue;
    }

    // A code the shop has typed on more than one variant of one product names
    // none of them: sizes of one perfume are different articles.
    const copies = new Map<string, number>();
    for (const v of file.variants) {
      const code = readBarcode(v.barcode).ean;
      if (code) copies.set(code, (copies.get(code) ?? 0) + 1);
    }

    for (const l of group) {
      const own = file.variants.find((v) =>
        l.shopVariantId ? v.id === l.shopVariantId : v.sku !== null && v.sku === l.retailerSku,
      );
      if (!own) {
        report.unread.push(`${l.retailerSku}: not among the ${file.variants.length} variants of ${handle}`);
        unreadHandles.add(handle);
        continue;
      }
      const reading = readBarcode(own.barcode);
      let ean = reading.ean;
      let why: BarcodeRefusal | 'shared-by-variants' | null = reading.refusal;
      if (ean !== null && (copies.get(ean) ?? 0) > 1) {
        ean = null;
        why = 'shared-by-variants';
      }
      if (ean === null && why !== null) report.refused[why] = (report.refused[why] ?? 0) + 1;
      if (ean !== null) report.newBarcodes++;
      out.set(l, { ...l, ean, eanReadAt: nowIso });
    }
  }

  report.unreadLeft = [...toRead.entries()].reduce(
    (n, [handle, group]) => (unreadHandles.has(handle) ? n + group.filter((l) => !out.has(l)).length : n),
    0,
  );

  for (const l of listings) {
    const settled = out.get(l);
    const done = settled ?? l;
    report.listings.push(done);
    if (settled && options.wanted(l) && settled.ean) report.withBarcode++;
  }
  return report;
}

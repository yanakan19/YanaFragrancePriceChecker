import { CONCENTRATION, ML_SIZE_RE, OZ_SIZE_RE, statedMl } from './fragranceId.js';
import type { Http } from './attempt.js';
import { isAllowed, type RobotsRules } from './robots.js';
import type { RawListing } from './types.js';

/**
 * Read a bottle's size from the shop's own product page.
 *
 * ── The shop this exists for, measured 2026-10-04 ───────────────────────────
 * Beauty Pie's `/products.json` titles its perfumes with the name alone
 * ("Orris Florentina Eau De Parfum"), carries a single "Default Title"
 * variant, and has no ml anywhere in the feed. `isFragrance` needs a size
 * before it will treat a listing as a comparable bottle, so all of them were
 * rejected and the shop was switched back off the day it was first enabled.
 *
 * The size is on the product page, three ways, and every one of them is the
 * shop's own statement about that variant:
 *
 *   - The theme's variants array, one object per variant, `"size": "50ml"`
 *     beside that variant's `"sku"`. This is the source used: it is
 *     per variant, it is structured, and it is keyed by the same SKU the feed
 *     gives the listing.
 *   - A hidden form field on the page, `name="properties[Size]"` with the
 *     value `50ml` (`data-product-variant-size`), the figure the basket takes.
 *   - The product feature line printed under the title, "50ml, Made in
 *     France, Vegan".
 *
 * The page `<title>` is NOT used. Of the 13 perfume pages read, only 3 carry
 * a size in their title ("Orris Florentina Eau De Parfum 50ml | Beauty Pie");
 * the other ten state the same 50ml in the three places above and leave it out
 * of the title, and one title is misspelt ("Figurier De Dalmatie Perfum").
 * A source that is right for 3 of 13 is a guess for the rest.
 *
 * ── What it will and will not do ────────────────────────────────────────────
 * This reads a stated fact and never infers one. A page that states no size,
 * or states something that is not one plain millilitre figure ("3 x 10ml",
 * "Mini", "Various"), yields null and the listing stays unsized, which
 * `isFragrance` then keeps out of the catalogue and out of every comparison:
 * `sizeMl` is null, and productMatch.ts treats a null size as "cannot
 * compare", never as "matches". It is not given another shop's size and it is
 * not given a size copied from the title of a sibling.
 *
 * Where the feed's own title already states a size, that size wins unless the
 * page states a different single one for the same variant, in which case the
 * page does: the title is the less authoritative of the two, and a wrong size
 * is the exact fault this repairs. Sizes in fl oz are left alone.
 */

/** A size the page states for one variant. */
export interface PageVariantSize {
  sku: string | null;
  /** Shopify's variant id, as the page prints it. */
  id: string | null;
  /** Plain millilitres, or null when the page states none or not one plain figure. */
  ml: number | null;
}

export interface ProductPageSizes {
  variants: PageVariantSize[];
  /**
   * The one size the page prints as its own feature line or basket field, when
   * every such statement on the page agrees. A cross check on `variants`, and
   * the only source used for a page whose variants array cannot be read.
   */
  pageMl: number | null;
  /** True when the page's own basket field and feature line state different sizes. */
  pageConflict: boolean;
  /**
   * The price a non member shopper pays, in pounds, as the "Shop now" option
   * prints it (`data-purchase-price`). Null when the page prints none.
   */
  shopNowGbp: number | null;
}

/** One plain millilitre figure and nothing else: "50ml", "7.5 ml". */
const PLAIN_ML = /^\s*(\d{1,4}(?:\.\d)?)\s*ml\s*$/i;

/** Smallest and largest plausible single bottle, in millilitres. */
const MIN_ML = 1;
const MAX_ML = 1000;

/** The millilitres in a value that is exactly one plain figure, else null. */
export function plainMl(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = PLAIN_ML.exec(value);
  if (!m) return null;
  const ml = statedMl(m[1]!);
  return Number.isFinite(ml) && ml >= MIN_ML && ml <= MAX_ML ? ml : null;
}

/** The JSON array that starts at `html[open]` (a `[`), or null if it never closes. */
function balancedArray(html: string, open: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = open; i < html.length; i++) {
    const c = html[i]!;
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return html.slice(open, i + 1);
  }
  return null;
}

/**
 * The theme's variants array: the first `"variants": [ ... ]` whose objects
 * carry a `size` key. Beauty Pie's page holds several `variants` arrays (the
 * product JSON, the analytics payload, the recommendations); only the theme's
 * own carries `size`.
 */
function themeVariants(html: string): PageVariantSize[] | null {
  const key = /"variants"\s*:\s*\[/g;
  for (let m = key.exec(html); m; m = key.exec(html)) {
    const open = m.index + m[0].length - 1;
    const text = balancedArray(html, open);
    if (!text || !/"size"\s*:/.test(text)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const out: PageVariantSize[] = [];
    for (const v of parsed) {
      if (!v || typeof v !== 'object') continue;
      const o = v as Record<string, unknown>;
      out.push({
        sku: typeof o['sku'] === 'string' && o['sku'].trim() ? o['sku'].trim() : null,
        id: o['id'] === undefined || o['id'] === null ? null : String(o['id']),
        ml: plainMl(o['size']),
      });
    }
    if (out.length > 0) return out;
  }
  return null;
}

/** Every value the page prints as its basket size field or feature line. */
function pageStatements(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/name="properties\[Size\]"\s+value="([^"]*)"/gi)) out.push(m[1]!);
  for (const m of html.matchAll(/<li class="[^"]*">\s*([^<]*?)\s*<span aria-hidden="true">&bull;<\/span><\/li>/gi)) {
    if (PLAIN_ML.test(m[1]!)) out.push(m[1]!);
  }
  return out;
}

/** What a product page states about its own size and non member price. */
export function parseProductPageSizes(html: string): ProductPageSizes {
  const variants = themeVariants(html) ?? [];

  const statements = pageStatements(html).map(plainMl);
  const distinct = new Set(statements);
  const pageMl = statements.length > 0 && distinct.size === 1 && !distinct.has(null) ? statements[0]! : null;

  const price = /data-purchase-price[^>]*>\s*£\s*([\d,]+(?:\.\d{1,2})?)\s*</i.exec(html);
  const shopNowGbp = price ? Number.parseFloat(price[1]!.replace(/,/g, '')) : null;

  return { variants, pageMl, pageConflict: distinct.size > 1, shopNowGbp: Number.isFinite(shopNowGbp) ? shopNowGbp : null };
}

/**
 * The size, in millilitres, this page states for the listing with this SKU, or
 * null when it states none.
 *
 * A SKU the page lists is answered by that variant alone. A SKU it does not
 * list is answered only for a one variant page, from the page's own statement,
 * and only when the listing is that product's only listing (`onlyListing`);
 * with several variants an unmatched SKU is a variant nobody described.
 */
export function pageSizeFor(
  page: ProductPageSizes,
  sku: string,
  onlyListing: boolean,
): number | null {
  const hit = page.variants.find((v) => v.sku === sku);
  if (hit) {
    // A one variant page that prints a different size in its basket field or
    // feature line than its variants data says contradicts itself; neither is
    // chosen, and the listing stays unsized.
    if (page.variants.length === 1 && hit.ml !== null) {
      if (page.pageConflict || (page.pageMl !== null && page.pageMl !== hit.ml)) return null;
    }
    return hit.ml;
  }
  if (page.variants.length <= 1 && onlyListing) return page.variants[0]?.ml ?? page.pageMl;
  return null;
}

/**
 * The title as it should be stored: unchanged where the page states no size,
 * the size appended where the title states none, and the title's single ml
 * size replaced where the page states a different one.
 */
export function titleWithPageSize(rawTitle: string, pageMl: number | null): string {
  if (pageMl === null) return rawTitle;
  const title = rawTitle.trim();
  if (!title) return rawTitle;
  if (OZ_SIZE_RE.test(title)) return rawTitle;

  const mls = title.match(new RegExp(ML_SIZE_RE.source, 'gi')) ?? [];
  if (mls.length === 0) return `${title} ${pageMl}ml`;
  if (mls.length > 1) return rawTitle;
  const stated = statedMl(ML_SIZE_RE.exec(title)![1]!);
  if (stated === pageMl) return rawTitle;
  return title.replace(ML_SIZE_RE, `${pageMl}ml`);
}

/**
 * Whether a listing is worth a page read: it states no size, and the shop's
 * own product type or the title says it is a perfume. Skincare, candles and
 * hand cream are never fetched.
 */
export function wantsPageSize(l: Pick<RawListing, 'rawTitle' | 'productType'>): boolean {
  if (ML_SIZE_RE.test(l.rawTitle) || OZ_SIZE_RE.test(l.rawTitle)) return false;
  if (l.productType && /^(fragrance|perfume)$/i.test(l.productType.trim())) return true;
  if (l.productType && !/^(fragrance|perfume)$/i.test(l.productType.trim())) return false;
  return CONCENTRATION.test(l.rawTitle);
}

export interface ProductPageSizeReport {
  listings: RawListing[];
  /** Pages asked for. */
  fetched: number;
  /** Listings given a size, or a corrected one, from their page. */
  sized: number;
  /** Listings whose page was read and stated no size: left unsized. */
  unsized: string[];
  /** Pages not read (robots.txt, HTTP error, no connection) and why. */
  unread: string[];
  /** Listings whose "Shop now" price on the page differs from the one held. */
  priceDisagreements: string[];
  /** One line per listing that changed: "sku: title -> title". */
  changes: string[];
}

export interface ProductPageSizeOptions {
  http: Http;
  robots: RobotsRules;
  /** The crawler's own honest headers; never a browser's. */
  headers: Record<string, string>;
  gapMs: number;
  /** Appended to each product URL to ask for the UK market, e.g. `country=GB`. */
  marketParam?: string | null;
  deadlineAt?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Titles held from the last run, by SKU, used only when a page cannot be read. */
  prior?: ReadonlyMap<string, string>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Read each wanted listing's product page, once per page, and put the size it
 * states back into the title. robots.txt is checked for every address before
 * it is asked for, and a refusal is an answer: that listing stays as it is.
 *
 * A page that cannot be read (HTTP error, timeout, robots.txt) leaves the
 * listing as the feed gave it, except that a size this same page gave on an
 * earlier run, held in `prior`, is kept for that one run rather than dropping a
 * real bottle off the site over a failed request. A page that was read and
 * states no size never inherits one.
 */
export async function readSizesFromProductPages(
  listings: readonly RawListing[],
  options: ProductPageSizeOptions,
): Promise<ProductPageSizeReport> {
  const sleep = options.sleep ?? realSleep;
  const report: ProductPageSizeReport = {
    listings: [], fetched: 0, sized: 0, unsized: [], unread: [], priceDisagreements: [], changes: [],
  };

  const perUrl = new Map<string, RawListing[]>();
  for (const l of listings) {
    if (!wantsPageSize(l)) continue;
    perUrl.set(l.url, [...(perUrl.get(l.url) ?? []), l]);
  }

  const replaced = new Map<RawListing, string>();
  let first = true;
  for (const [url, group] of perUrl) {
    const asked = options.marketParam ? `${url}${url.includes('?') ? '&' : '?'}${options.marketParam}` : url;
    if (!isAllowed(options.robots, asked)) {
      report.unread.push(`${url}: disallowed by robots.txt`);
      continue;
    }
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
      report.unread.push(`${url}: out of time`);
      continue;
    }
    if (!first && options.gapMs > 0) await sleep(options.gapMs);
    first = false;

    report.fetched++;
    const res = await options.http(asked, options.headers);
    if (!res.ok || res.status !== 200) {
      report.unread.push(`${url}: HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
      for (const l of group) {
        const held = options.prior?.get(l.retailerSku);
        if (held && ML_SIZE_RE.test(held) && held.startsWith(l.rawTitle)) replaced.set(l, held);
      }
      continue;
    }

    const page = parseProductPageSizes(res.body);
    for (const l of group) {
      const ml = pageSizeFor(page, l.retailerSku, group.length === 1);
      if (ml === null) {
        report.unsized.push(`${l.retailerSku} ${l.rawTitle}`);
        continue;
      }
      const titled = titleWithPageSize(l.rawTitle, ml);
      if (titled !== l.rawTitle) replaced.set(l, titled);
      if (page.shopNowGbp !== null && l.priceGbp !== null && Math.abs(page.shopNowGbp - l.priceGbp) > 0.005) {
        report.priceDisagreements.push(`${l.retailerSku} ${l.rawTitle}: feed ${l.priceGbp}, page ${page.shopNowGbp}`);
      }
    }
  }

  for (const l of listings) {
    const titled = replaced.get(l);
    if (titled === undefined) {
      report.listings.push(l);
      continue;
    }
    report.sized++;
    report.changes.push(`${l.retailerSku}: ${l.rawTitle} -> ${titled}`);
    report.listings.push({ ...l, rawTitle: titled });
  }
  return report;
}

import { ML_SIZE_RE, OZ_SIZE_RE } from './fragranceId.js';
import { isGiftSet } from './giftSet.js';
import { CONCENTRATION_NOT_STATED, concentration } from './productName.js';
import type { Http } from './attempt.js';
import { isAllowed, type RobotsRules } from './robots.js';
import type { RawListing } from './types.js';

/**
 * Read a perfume's strength from the shop's own product page.
 *
 * ── The shop this exists for, measured 2026-10-04 ───────────────────────────
 * Kayali's titles never name a strength ("Vanilla | 28 100ml", "Oudgasm Café
 * Oud | 19 50ml"), so every one of its perfumes was filed as "Not stated", and
 * two further faults followed from that:
 *
 *   - The word "Oud", which is part of eight Kayali names, is also the last
 *     word of CONCENTRATION's generic tier, so with no real strength in the
 *     title it was taken for one and cut out of the name: "Oudgasm Café Oud |
 *     19" was shown as "Oudgasm Café | 19" and "Dapper Daddy Saffron Oud" as
 *     "Dapper Daddy Saffron". Once a real strength is in the title the word is
 *     left alone.
 *   - Another shop's "Eden Sweet Peach 35 Eau de Parfum 10ml" (Selfridges)
 *     could not meet Kayali's own 10ml of the same perfume, because one said
 *     Eau de Parfum and the other said nothing.
 *
 * The strength is on every perfume page, in the theme's own product data: a
 * `<script type="application/json" data-product-metafields-json>` block whose
 * `metafields.subtitle` is the line the shop prints under the product's name.
 * Read from all 35 single perfume pages on 2026-10-04 (robots.txt allows
 * /products/, asked as PriceSniffsBot): 27 say "Eau de Parfum" and 8 say "Eau
 * de Parfum Intense" (the Oudgasm line and Vanilla Royale), in several
 * capitalisations. The same field on a hair mist or body spray says "Hair
 * Mist" or "All Over Body Spray", which is no strength and is not read as one.
 *
 * It is a fact about the product, so it applies to every size of that page:
 * the 100ml, the 10ml miniature and the 1.5ml vial are one liquid.
 *
 * ── What it will and will not do ────────────────────────────────────────────
 * This reads a stated fact and never infers one. A page without the block, a
 * block without a subtitle, or a subtitle that is not exactly one of the
 * strengths below (optionally followed by "Intense") yields null, and the
 * listing stays as the feed gave it: "Not stated", handled by the matching
 * rules that already exist for a shop that names none (productMatch.ts lets a
 * "Not stated" bottle join the one other strength that bottle is sold at, and
 * never decides between two).
 *
 * The title wins where it already names a strength: it is the shop's own
 * statement too, so such a listing is not even fetched. A set (a
 * gift set keeps its title whole, and its id is made from it) is never
 * rewritten, so nothing about a set's identity can move.
 *
 * The stated strength is put into the title, before the size, where every
 * consumer of a listing already looks for one: the same way a size read from
 * a page is (productPageSize.ts). Product ids come from the shop's SKU and are
 * not touched.
 */

/** The strengths a page's subtitle may be, as the catalogue spells them. */
const STRENGTHS: ReadonlyMap<string, string> = new Map([
  ['eau de parfum', 'Eau de Parfum'],
  ['eau de toilette', 'Eau de Toilette'],
  ['eau de cologne', 'Eau de Cologne'],
  ['extrait de parfum', 'Extrait de Parfum'],
  ['parfum', 'Parfum'],
]);

/** What a product page states about its own strength. */
export interface ProductPageStrength {
  /** The subtitle exactly as the page prints it. */
  stated: string;
  /** The strength in the catalogue's own spelling, "Intense" kept: "Eau de Parfum Intense". */
  strength: string;
}

/** The theme's product data block: JSON in a script tag marked `data-product-metafields-json`. */
const METAFIELDS_BLOCK = /<script\b[^>]*\bdata-product-metafields-json\b[^>]*>([\s\S]*?)<\/script>/i;

/**
 * The strength the page states, or null.
 *
 * Exactly one of the known strengths, case folded and spaces collapsed, with
 * "Intense" allowed after it: "Eau de parfum intense" is read, "Hair Mist",
 * "Elixir" and "Eau de Parfum Spray" are not.
 */
export function parseProductPageStrength(html: string): ProductPageStrength | null {
  const block = METAFIELDS_BLOCK.exec(html);
  if (!block) return null;
  let data: unknown;
  try {
    data = JSON.parse(block[1]!);
  } catch {
    return null;
  }
  const metafields = (data as { metafields?: unknown } | null)?.metafields;
  if (!metafields || typeof metafields !== 'object') return null;
  const subtitle = (metafields as Record<string, unknown>)['subtitle'];
  if (typeof subtitle !== 'string') return null;

  const stated = subtitle.replace(/\s+/g, ' ').trim();
  const m = /^(eau de parfum|eau de toilette|eau de cologne|extrait de parfum|parfum)(\s+intense)?$/i.exec(stated);
  if (!m) return null;
  const base = STRENGTHS.get(m[1]!.toLowerCase())!;
  return { stated, strength: m[2] ? `${base} Intense` : base };
}

/**
 * The title with the page's strength put in before its size, or after the
 * title when it states none: "Vanilla | 28 10ml Miniature" -> "Vanilla | 28
 * Eau de Parfum 10ml Miniature". Unchanged for a null strength.
 */
export function titleWithPageStrength(rawTitle: string, strength: string | null): string {
  if (strength === null) return rawTitle;
  const title = rawTitle.trim();
  if (!title) return rawTitle;
  const size = ML_SIZE_RE.exec(title) ?? OZ_SIZE_RE.exec(title);
  if (!size) return `${title} ${strength}`;
  const at = size.index;
  return `${title.slice(0, at).trimEnd()} ${strength} ${title.slice(at)}`;
}

/**
 * Whether a listing is worth a page read: a single perfume (the shop's own
 * product type says so) whose title names no strength. "Oud" is not a
 * strength here, which is why this asks `concentration` and not a word list:
 * it answers "Not stated" for it. Sets, body products and accessories are
 * never fetched.
 */
export function wantsPageStrength(
  l: Pick<RawListing, 'rawTitle' | 'productType' | 'description' | 'rawBrand'>,
  retailerId: string,
): boolean {
  if (!l.productType || !/^(fragrances?|perfumes?)$/i.test(l.productType.trim())) return false;
  if (isGiftSet({ ...l, retailerId })) return false;
  return concentration(l.rawTitle) === CONCENTRATION_NOT_STATED;
}

export interface ProductPageStrengthReport {
  listings: RawListing[];
  /** Pages asked for. */
  fetched: number;
  /** Listings given a strength from their page. */
  stated: number;
  /** Listings whose page was read and states no strength: left as they were. */
  unstated: string[];
  /** Pages not read (robots.txt, HTTP error, no connection) and why. */
  unread: string[];
  /** One line per listing that changed: "sku: title -> title". */
  changes: string[];
}

export interface ProductPageStrengthOptions {
  /** The shop's registry id: whether a title is a set depends on the shop (giftSet.ts). */
  retailerId: string;
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

/** The strengths a held title may carry, longest first, to recognise one this module wrote. */
const HELD_STRENGTHS = [...STRENGTHS.values()].flatMap((s) => [`${s} Intense`, s]);

/**
 * Read each wanted listing's product page, once per page, and put the strength
 * it states back into the title. robots.txt is checked for every address
 * before it is asked for, and a refusal is an answer: that listing stays as it
 * is.
 *
 * A page that cannot be read (HTTP error, timeout, robots.txt) leaves the
 * listing as the feed gave it, except that a strength this same page gave on
 * an earlier run, held in `prior`, is kept for that one run rather than
 * flipping a real bottle between two products over a failed request. A page
 * that was read and states no strength never inherits one.
 */
export async function readStrengthsFromProductPages(
  listings: readonly RawListing[],
  options: ProductPageStrengthOptions,
): Promise<ProductPageStrengthReport> {
  const sleep = options.sleep ?? realSleep;
  const report: ProductPageStrengthReport = { listings: [], fetched: 0, stated: 0, unstated: [], unread: [], changes: [] };

  const perUrl = new Map<string, RawListing[]>();
  for (const l of listings) {
    if (!wantsPageStrength(l, options.retailerId)) continue;
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
        if (held && HELD_STRENGTHS.some((s) => held === titleWithPageStrength(l.rawTitle, s))) replaced.set(l, held);
      }
      continue;
    }

    const page = parseProductPageStrength(res.body);
    if (page === null) {
      for (const l of group) report.unstated.push(`${l.retailerSku} ${l.rawTitle}`);
      continue;
    }
    for (const l of group) replaced.set(l, titleWithPageStrength(l.rawTitle, page.strength));
  }

  for (const l of listings) {
    const titled = replaced.get(l);
    if (titled === undefined || titled === l.rawTitle) {
      report.listings.push(l);
      continue;
    }
    report.stated++;
    report.changes.push(`${l.retailerSku}: ${l.rawTitle} -> ${titled}`);
    report.listings.push({ ...l, rawTitle: titled });
  }
  return report;
}

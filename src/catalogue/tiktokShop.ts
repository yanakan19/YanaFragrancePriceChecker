import type { RawListing } from './types.js';
import { parsePrice } from './jsonld.js';
import { isBarcode, normalizedEan } from './productMatch.js';
import { sizeMl } from './fragranceId.js';

/**
 * TikTok Shop capture handling — Phase 5 beta, behind TIKTOK_BETA_CONFIG.
 *
 * ── What this file is, and pointedly is not ─────────────────────────────────
 * The route into TikTok Shop is the official Affiliate Open API with the
 * owner's own creator credentials — the Awin pattern, not a scraper. The route
 * comparison, the evidence for it, and the refusal of the scraping route
 * (TikTok's ToS bans automated extraction outright and its robots.txt
 * disallows /shop/view/product/, which is precisely the page a shop scraper
 * would fetch) are in docs/TIKTOK-SHOP-PLAN.md. Nothing in this file reads the
 * network, and nothing in this repo fetches tiktok.com.
 *
 * ── Why the input type is ours rather than TikTok's ────────────────────────
 * TikTok's API documentation renders behind JavaScript and its response
 * schemas could not be transcribed from any source this project can cite.
 * Writing a parser against a response shape nobody here has seen would mean
 * inventing the shape — the exact mistake the fixture rules exist to prevent.
 *
 * So `TikTokCaptureRow` is this project's own recording format: the shape
 * scripts/tiktok-probe.ts will write down after the first credentialed call
 * returns a real response in CI. It deliberately carries only fields the
 * comparison needs and the API is documented (or reasonably expected) to
 * publish; the probe's job is to fill it from whatever the real response turns
 * out to look like, and that translation gets written *after* a genuine
 * response exists on disk, from that response, never from a guess. Until then
 * this mapper is exercised purely by labelled test fixtures.
 */

/**
 * One product as captured from the TikTok Shop Affiliate API, in this
 * project's own recording format (see the header — this is not TikTok's
 * response schema, and must never be presented as it).
 */
export interface TikTokCaptureRow {
  /**
   * TikTok Shop's own product id, e.g. "1729385047295821122". A first-class,
   * stable identifier in the official API: products are fetched, priced and
   * added to showcases by exactly this id. The old "no stable product ids"
   * note was wrong — see docs/TIKTOK-SHOP-PLAN.md §3.
   */
  productId: string;
  /** SKU id when the API distinguishes variants, else null. */
  skuId: string | null;
  /** Title exactly as the seller wrote it. TikTok titles are chaotic; carried raw. */
  title: string;
  /**
   * The price being charged, exactly as the API returned it — amount as a
   * string so nothing here has rounded or reformatted it, currency as stated.
   * Null when the response carried no price at all.
   */
  price: { amount: string; currency: string } | null;
  /**
   * The strikethrough/list price where the API publishes one. Same rules as
   * every other source: it becomes a "was" price only when genuinely above
   * the selling price, and it gets zero exemption from
   * wasPriceCredibility.ts's gates downstream.
   */
  listPrice: { amount: string; currency: string } | null;
  /**
   * Platform-published deal end, ISO-8601, or null. TikTok flash sales carry
   * a real seller-set end_time (the Promotion API models activities with
   * begin_time/end_time), so this field can finally carry genuine countdown
   * data — but only ever what the platform published. Never inferred.
   */
  dealEndsAt: string | null;
  /** Stock as reported. Null when the response said nothing either way. */
  inStock: boolean | null;
  /**
   * Canonical product URL as returned by the API. Null when the response did
   * not include one — a URL is never constructed from the id here, because a
   * guessed link that 404s looks broken and a comparison row must go where it
   * says it goes.
   */
  url: string | null;
  imageUrl: string | null;
  /** EAN/GTIN if the API exposes one. Expected rare; matching falls back to title. */
  ean: string | null;
  /** When the probe captured this row, ISO-8601. */
  capturedAt: string;
}

/** Why a capture row was left out of the mapped listings. */
export type TikTokSkipReason =
  | 'no-product-id'
  | 'no-title'
  | 'no-url'
  | 'no-price'
  | 'unparseable-price';

export interface TikTokMapResult {
  listings: RawListing[];
  /** Rows excluded, by reason — reported, never silently dropped. */
  skipped: Record<TikTokSkipReason, number>;
}

const SECTION_ID = 'tiktok-shop';

/**
 * Map captured TikTok Shop rows into `RawListing`s, under the same honesty
 * rules as every other adapter:
 *
 *   - only a GBP price becomes `priceGbp`; any other currency is carried in
 *     `nativePrice` with `priceGbp: null` — known-but-unpriced, never
 *     converted (see RawListing.nativePrice). TikTok Shop UK sells in
 *     sterling, so a non-GBP row reaching this is itself a signal worth
 *     surfacing rather than papering over;
 *   - `wasPriceGbp` only when the platform's list price is genuinely above
 *     the selling price, and only in GBP — a strikethrough in another
 *     currency cannot be compared against a sterling price;
 *   - `promoEndsAt` passes through only when the platform published an end
 *     time that parses. A countdown must never be invented, and an end time
 *     that does not parse is not an end time;
 *   - rows missing an id, title, URL or price are skipped and counted, not
 *     guessed at.
 */
export function mapTikTokCapture(rows: readonly TikTokCaptureRow[]): TikTokMapResult {
  const listings: RawListing[] = [];
  const skipped: Record<TikTokSkipReason, number> = {
    'no-product-id': 0,
    'no-title': 0,
    'no-url': 0,
    'no-price': 0,
    'unparseable-price': 0,
  };

  for (const row of rows) {
    if (!row.productId.trim()) {
      skipped['no-product-id']++;
      continue;
    }
    if (!row.title.trim()) {
      skipped['no-title']++;
      continue;
    }
    if (!row.url) {
      skipped['no-url']++;
      continue;
    }
    if (!row.price) {
      skipped['no-price']++;
      continue;
    }

    const amount = parsePrice(row.price.amount);
    if (amount === null || amount <= 0) {
      skipped['unparseable-price']++;
      continue;
    }

    const currency = row.price.currency.trim().toUpperCase();
    const isGbp = currency === 'GBP';

    // A list price only counts when it shares the selling price's currency
    // and sits genuinely above it. Cross-currency comparison is never done
    // here — see "Never subtract one currency from another" (c9fc2b14).
    let wasPriceGbp: number | null = null;
    if (isGbp && row.listPrice && row.listPrice.currency.trim().toUpperCase() === 'GBP') {
      const list = parsePrice(row.listPrice.amount);
      if (list !== null && list > amount) wasPriceGbp = list;
    }

    // An end time that does not parse is not an end time. Date.parse also
    // accepts what canShowCountdown will later re-parse, so a value passing
    // here renders consistently downstream.
    const promoEndsAt =
      row.dealEndsAt !== null && Number.isFinite(Date.parse(row.dealEndsAt))
        ? row.dealEndsAt
        : null;

    listings.push({
      // SKU-qualified where the API distinguishes variants: two SKUs of one
      // product are two prices, and collapsing them would misreport both.
      retailerSku: row.skuId ? `${row.productId}:${row.skuId}` : row.productId,
      url: row.url,
      rawTitle: row.title,
      rawBrand: null,
      ean: row.ean,
      imageUrl: row.imageUrl,
      priceGbp: isGbp ? amount : null,
      wasPriceGbp,
      promoEndsAt,
      inStock: row.inStock,
      sectionId: SECTION_ID,
      ...(isGbp ? {} : { nativePrice: { amount, currency: currency || 'unknown' } }),
    });
  }

  return { listings, skipped };
}

/**
 * ── BeautyBase pilot cross-check ─────────────────────────────────────────────
 *
 * The pilot seller (@beautybase) is the same company as the `beautybase`
 * registry retailer, whose own-website catalogue this project already holds
 * in data/catalogue/beautybase.json — 3,100+ listings with EANs and sterling
 * prices. Same bottles, two storefronts. That makes the first TikTok capture
 * checkable against a known-good source instead of taken on faith: every
 * captured row is matched against the website catalogue, and the price deltas
 * are reported before anything is trusted further.
 *
 * Matching is EAN-first (the only key that identifies a bottle outright),
 * falling back to a normalised title + size key. The fallback is honest about
 * its weakness: a title match without an agreeing size is no match at all,
 * because "same words, different bottle" is exactly the decant/size trap D9
 * exists for.
 */

export interface TikTokCrossCheckMatch {
  tiktokSku: string;
  siteSku: string;
  basis: 'ean' | 'title-size';
  tiktokPriceGbp: number;
  sitePriceGbp: number;
  /** Positive when TikTok is dearer, negative when TikTok is cheaper. */
  deltaGbp: number;
}

export interface TikTokCrossCheckReport {
  matches: TikTokCrossCheckMatch[];
  matchedByEan: number;
  matchedByTitleSize: number;
  /** TikTok rows with no counterpart on the website. TikTok-only stock is the
   *  prize, not a failure — but on the pilot it is also where a bad match key
   *  would hide, so the number is reported rather than buried. */
  unmatchedTikTok: number;
  /** Rows that could not be compared: no GBP price on one side or the other.
   *  Never compared cross-currency, never assumed. */
  incomparable: number;
  tiktokCheaper: number;
  siteCheaper: number;
  samePrice: number;
}

/** The subset of a stored website listing the cross-check needs. */
export interface SiteListingForCrossCheck {
  retailerSku: string;
  rawTitle: string;
  ean: string | null;
  priceGbp: number | null;
}

/**
 * Normalised title+size key. Lowercased, punctuation stripped, size appended
 * from the same `sizeMl` parser the rest of the pipeline uses. Null when no
 * size can be read — a sizeless key would let a 10ml sample match a 100ml
 * bottle, which is a lie about what is being compared.
 */
export function titleSizeKey(title: string): string | null {
  const size = sizeMl(title);
  if (size === null) return null;
  const words = title
    .toLowerCase()
    .replace(/\d{1,4}(?:\.\d)?\s*ml\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!words) return null;
  return `${words}::${size}`;
}

export function crossCheckTikTokCapture(
  tiktok: readonly RawListing[],
  site: readonly SiteListingForCrossCheck[],
): TikTokCrossCheckReport {
  const byEan = new Map<string, SiteListingForCrossCheck>();
  const byTitleSize = new Map<string, SiteListingForCrossCheck>();
  for (const s of site) {
    if (isBarcode(s.ean)) {
      const key = normalizedEan(s.ean);
      if (!byEan.has(key)) byEan.set(key, s);
    }
    const key = titleSizeKey(s.rawTitle);
    // First writer wins; a site catalogue carrying two listings under one
    // title+size key is ambiguous, and an ambiguous key must not decide a
    // match. EANs disambiguate those cases where they exist.
    if (key !== null && !byTitleSize.has(key)) byTitleSize.set(key, s);
  }

  const report: TikTokCrossCheckReport = {
    matches: [],
    matchedByEan: 0,
    matchedByTitleSize: 0,
    unmatchedTikTok: 0,
    incomparable: 0,
    tiktokCheaper: 0,
    siteCheaper: 0,
    samePrice: 0,
  };

  for (const t of tiktok) {
    let match: SiteListingForCrossCheck | undefined;
    let basis: 'ean' | 'title-size' | undefined;

    if (isBarcode(t.ean)) {
      match = byEan.get(normalizedEan(t.ean));
      if (match) basis = 'ean';
    }
    if (!match) {
      const key = titleSizeKey(t.rawTitle);
      if (key !== null) {
        match = byTitleSize.get(key);
        if (match) basis = 'title-size';
      }
    }

    if (!match || !basis) {
      report.unmatchedTikTok++;
      continue;
    }

    if (basis === 'ean') report.matchedByEan++;
    else report.matchedByTitleSize++;

    if (t.priceGbp === null || match.priceGbp === null) {
      report.incomparable++;
      continue;
    }

    const delta = Math.round((t.priceGbp - match.priceGbp) * 100) / 100;
    report.matches.push({
      tiktokSku: t.retailerSku,
      siteSku: match.retailerSku,
      basis,
      tiktokPriceGbp: t.priceGbp,
      sitePriceGbp: match.priceGbp,
      deltaGbp: delta,
    });
    if (delta < 0) report.tiktokCheaper++;
    else if (delta > 0) report.siteCheaper++;
    else report.samePrice++;
  }

  return report;
}

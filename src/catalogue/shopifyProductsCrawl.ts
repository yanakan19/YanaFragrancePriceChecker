import type { Retailer } from '../types/retailer.js';
import type { RawListing } from './types.js';
import type { Http } from './attempt.js';
import { isAllowed, type RobotsRules } from './robots.js';
import { parseShopifyProducts, isShopifyProductsPayload } from './shopifyJson.js';

/**
 * Shopify's own public product catalogue for a UK retailer, not a house.
 *
 * scripts/houses-harvest.ts already walks `/products.json` for fragrance
 * houses (see src/catalogue/shopifyJson.ts's own header for why that
 * official, keyless endpoint exists and is safe to read), but nothing wired
 * it into the retailer harvest, which only ever discovers products through
 * `crawlViaSitemap`'s keyword-matched walk of a shop's sitemap. That gap is
 * worth closing: `/products.json` is Shopify's complete catalogue, paginated
 * by construction, with no guessing about which sitemap entries are actually
 * fragrance — a real, more reliable route for any retailer confirmed to run
 * on Shopify, Emirates Oud (2026-08-10) among them.
 *
 * Currency is always passed as `'GBP'` by the caller, never resolved here the
 * way houses-harvest.ts resolves it — every entry in the RETAILERS registry
 * is GBP by that type's own constraint (`currency: 'GBP'`), unlike a house
 * that can genuinely price in AED or USD, so there is nothing to detect.
 */

export interface ShopifyProductsCrawlResult {
  listings: RawListing[];
  pagesFetched: number;
  errors: string[];
  /**
   * False the moment the endpoint stops looking like Shopify at all — a 404
   * or a non-Shopify payload on the very first page. Lets a caller decide
   * whether falling back to a different strategy is worth attempting, versus
   * a real Shopify store that simply had nothing new past page one.
   */
  isShopify: boolean;
}

export interface ShopifyProductsCrawlOptions {
  retailer: Retailer;
  http: Http;
  robots: RobotsRules;
  headers: Record<string, string>;
  /** Hard ceiling on pages fetched, mirroring maxPages in crawlViaSitemap. */
  maxPages: number;
  /** Milliseconds between requests. */
  gapMs: number;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (fetched: number, found: number) => void;
}

export async function crawlViaShopifyProducts(
  options: ShopifyProductsCrawlOptions,
): Promise<ShopifyProductsCrawlResult> {
  const { retailer, http, robots, headers, maxPages } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const origin = `https://${retailer.domain}`;
  const perPage = Math.min(maxPages, 250);

  const listings: RawListing[] = [];
  const errors: string[] = [];
  let pagesFetched = 0;
  let isShopify = true;

  // Shopify signals the end of the catalogue by returning fewer products
  // than asked for, but the page count is still capped independently — a
  // storefront that never shrinks its last page (some themes pad) must not
  // be able to turn maxPages into an unbounded walk.
  for (let page = 1; pagesFetched < maxPages && page <= 100; page++) {
    const url = `${origin}/products.json?limit=${perPage}&page=${page}`;
    if (!isAllowed(robots, url)) {
      errors.push(`robots.txt disallows ${url}`);
      break;
    }

    const res = await http(url, headers);
    pagesFetched++;
    options.onProgress?.(pagesFetched, listings.length);

    if (!res.ok) {
      // A 404 on the first page just means "not a Shopify storefront", which
      // is a fact about the retailer, not a failure worth an error line.
      if (!(page === 1 && res.status === 404)) {
        errors.push(`${url}: HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`);
      }
      if (page === 1) isShopify = false;
      break;
    }

    if (!isShopifyProductsPayload(res.body)) {
      // Some sites answer any unknown path with their homepage rather than a
      // clean 404 — still not Shopify, just a different way of saying so.
      if (page === 1) isShopify = false;
      break;
    }

    const batch = parseShopifyProducts(res.body, {
      origin,
      sectionId: 'shopify-products-json',
      currency: 'GBP',
    });
    if (batch.length === 0) break;
    listings.push(...batch);

    if (options.gapMs > 0) await sleep(options.gapMs);
  }

  return { listings, pagesFetched, errors, isShopify };
}

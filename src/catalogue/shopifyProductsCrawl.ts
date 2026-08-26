import type { Retailer } from '../types/retailer.js';
import type { RawListing } from './types.js';
import type { Http } from './attempt.js';
import { isAllowed, type RobotsRules } from './robots.js';
import { parseShopifyProducts, isShopifyProductsPayload } from './shopifyJson.js';
import { fetchStorefrontCurrency, type StorefrontCurrency } from './shopCurrency.js';
import {
  probeMarkets,
  summariseMarketProbe,
  ukMarketCandidates,
  type MarketCandidate,
} from './marketProbe.js';

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
 * ── Currency ────────────────────────────────────────────────────────────────
 * This used to hardcode `'GBP'`, on the reasoning that every entry in the
 * RETAILERS registry is a UK shop and so there was nothing to detect. That
 * reasoning was wrong, and Escentual is where it showed: a registry entry's
 * `currency: 'GBP'` describes the shop, not the response in front of us, and a
 * storefront can quote a different market's converted price list to whoever is
 * asking. So the currency is now resolved from what the storefront publishes
 * about itself, exactly as the house route already does, and a payload that is
 * not positively established as sterling yields listings with no `priceGbp` at
 * all. See src/catalogue/shopCurrency.ts for the measurements behind that.
 *
 * ── Which market, which is a different question from which currency ─────────
 * Detecting the currency stopped this repo publishing dollars as pounds. It
 * did not get the pounds. A UK shop on Shopify Markets serves a different
 * price list to every country, chooses which by where the caller is, and every
 * harvest this project has ever run has run from a GitHub Actions runner in
 * the United States — so "the storefront is quoting USD" was a true statement
 * about our vantage point being reported as a fact about the shop.
 *
 * Measured, on escentual.com, from a runner (currency probe, run 31880556596,
 * job 95002418010, commit a735ef6, 2026-08-15T10:52Z):
 *
 *   how we asked            /meta.json  theme quotes  a real product
 *   origin                  GBP         USD @1.38605  39.00, and 57.00 for the
 *                                                     Calvin Klein Obsession
 *                                                     125ml this repo held
 *   ?country=GB             GBP         GBP  @1       28.00, and 40.95
 *   cookie localization=GB  GBP         GBP  @1       28.00, and 40.95
 *   both cookies            GBP         GBP  @1       28.00, and 40.95
 *   cookie cart_currency    GBP         USD @1.38605  39.00
 *   Accept-Language en-GB   GBP         USD @1.38605  39.00
 *
 * So this now asks the second question when the first one answers badly: if
 * the origin is not established as sterling, try the ways a UK price list can
 * be asked for and read prices from the first that proves itself. `base`,
 * `query` and `headers` come from that candidate; `origin` still builds the
 * stored product URLs, because the address we send a shopper to should be the
 * shop's own plain URL — their own browser will land them in their own market.
 *
 * Nothing about this loosens the guard. A candidate that does not publish GBP,
 * settling in GBP, at no conversion, is not adopted, and if none does the
 * crawl proceeds exactly as before with `priceGbp` null on every row. The
 * search can only ever turn "no prices" into "prices the shop itself labelled
 * sterling"; it can never turn a foreign figure into a pound.
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
  /**
   * What the storefront said it was quoting in, and whether that settles the
   * figures as sterling. `isSterling: false` means every listing above carries
   * `priceGbp: null` — the caller must treat the shop as unpriced this run
   * rather than as having nothing for sale.
   */
  currency: StorefrontCurrency;
  /**
   * How the catalogue was asked for. `label: 'origin'` is the ordinary case;
   * anything else means the origin did not publish sterling and this candidate
   * did, and is worth putting in a log — a shop whose prices only appear under
   * a particular request is a shop whose prices can silently stop appearing.
   */
  market: MarketCandidate;
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
  /**
   * An already-resolved storefront currency, for a caller that has one (and
   * for tests, which have no network). Omitted, the crawl asks the storefront
   * itself before reading a single product.
   */
  currency?: StorefrontCurrency;
  /**
   * Set false to skip the UK-market search when the origin is not sterling.
   * Default is to search: the cost is a handful of requests at a shop we were
   * about to walk anyway, and the alternative is a shop that has a sterling
   * price list going unpriced forever.
   */
  resolveUkMarket?: boolean;
}

/** The shop as any visitor first meets it. */
function originMarket(origin: string): MarketCandidate {
  return {
    label: 'origin',
    base: origin,
    query: '',
    headers: {},
    why: 'the shop as any visitor first meets it',
  };
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

  // Asked before the catalogue is read, not after, so there is never a moment
  // where a converted price list has been parsed as pounds and is waiting to
  // be thrown away by a later check.
  let currency = options.currency ?? (await fetchStorefrontCurrency(origin, http, headers));
  let market = originMarket(origin);

  // The origin answered in something other than pounds — which may be a fact
  // about this shop or a fact about where this machine is standing. Ask the
  // other way round before concluding the first.
  if (!currency.isSterling && options.resolveUkMarket !== false) {
    const readings = await probeMarkets(
      // The origin is dropped: it has just been read, and re-reading it would
      // spend two requests confirming the measurement that got us here.
      ukMarketCandidates(origin).filter((c) => c.label !== 'origin'),
      http,
      headers,
      { allow: (url) => isAllowed(robots, url), gapMs: options.gapMs, sleep },
    );
    const won = readings.find((r) => r.currency.isSterling);
    if (won) {
      market = won.candidate;
      currency = won.currency;
    } else {
      // Recorded even though nothing changed, because the two failures it
      // distinguishes want different responses from a human: a shop with no
      // sterling list is a shop to drop, and a shop with one we cannot reach
      // is a request shape to go and find.
      errors.push(`market: ${summariseMarketProbe(readings).reading}`);
    }
  }

  if (!currency.isSterling) errors.push(`currency: ${currency.reason}`);

  // What the parser is told. Sterling only when it was established as such;
  // otherwise the presented currency where the shop named one, so the figure
  // is still carried as `nativePrice` and recorded rather than lost, and null
  // where it named nothing, which parseShopifyProducts records as 'unknown'.
  // Either way `priceGbp` stays null and no offer reaches the site.
  const parseCurrency = currency.isSterling ? 'GBP' : currency.presented === 'GBP' ? null : currency.presented;

  // A candidate's query has to merge with this endpoint's own parameters
  // rather than replace them: `?country=GB` and `?limit=250&page=3` are both
  // needed, and appending a second `?` would silently drop the pagination and
  // re-read page one until maxPages ran out.
  const marketParams = market.query ? `${market.query.replace(/^\?/, '')}&` : '';
  const marketHeaders = { ...headers, ...market.headers };

  // Shopify signals the end of the catalogue by returning fewer products
  // than asked for, but the page count is still capped independently — a
  // storefront that never shrinks its last page (some themes pad) must not
  // be able to turn maxPages into an unbounded walk.
  for (let page = 1; pagesFetched < maxPages && page <= 100; page++) {
    const url = `${market.base}/products.json?${marketParams}limit=${perPage}&page=${page}`;
    if (!isAllowed(robots, url)) {
      errors.push(`robots.txt disallows ${url}`);
      break;
    }

    const res = await http(url, marketHeaders);
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
      // The plain origin, not the market's base: a stored URL is the address a
      // shopper is sent to, and they should get their own market by being
      // themselves, not ours by being handed our query string.
      origin,
      sectionId: 'shopify-products-json',
      currency: parseCurrency,
    });
    if (batch.length === 0) break;
    listings.push(...batch);

    // Same reasoning as crawlViaSitemap's own trailing-wait skip (see its
    // comment): the gap exists to space out the *next* request, and
    // `pagesFetched < maxPages` failing is the one way this loop's own end
    // can be known before paying for it, since Shopify's "fewer than asked"
    // end-of-catalogue signal is only visible from *inside* the next fetch.
    // A catalogue that ends naturally before maxPages still pays one wasted
    // wait finding that out — unavoidable without fetching ahead of need —
    // but every storefront big enough to hit its own maxPages cap (the
    // common case this budget exists for) no longer pays it.
    if (options.gapMs > 0 && pagesFetched < maxPages) await sleep(options.gapMs);
  }

  return { listings, pagesFetched, errors, isShopify, currency, market };
}

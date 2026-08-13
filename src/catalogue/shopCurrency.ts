import type { Http } from './attempt.js';
import { parseShopCurrency } from './shopifyJson.js';

/**
 * What currency a Shopify storefront is quoting *to us*, and whether that
 * settles the numbers in `/products.json` as sterling.
 *
 * ── The defect this exists to stop ───────────────────────────────────────────
 * `/products.json` carries a bare `price` string and no currency anywhere in
 * the payload (see the header of shopifyJson.ts). The house route has always
 * resolved the currency separately before deciding whether a figure may be
 * written into `priceGbp`. The *retailer* route never did:
 * `crawlViaShopifyProducts` passed a hardcoded `currency: 'GBP'` into
 * `parseShopifyProducts`, on the reasoning that every entry in the RETAILERS
 * registry is a UK shop and so prices in pounds. That reasoning conflates two
 * different things — the currency a shop settles in, and the currency the
 * response in front of us is priced in — and only the second one is a fact
 * about the numbers being read.
 *
 * Escentual is what showed the difference. A user checked Calvin Klein
 * Obsession For Men 125ml EDT by hand: our page said £57.00, the shop's page
 * said £40.25. Every measurement that could be made from data already in this
 * repo says that is not one bad row but a scale:
 *
 *   escentual.wasPrice / fragrance-click.wasPrice   n=132  median 1.452
 *                                                   p25 1.400, p75 1.513
 *                                                   0% within 5% of 1.00
 *   escentual.wasPrice / mybeauty-boutique.wasPrice n=213  median 1.443
 *   fragrance-click.wasPrice / mybeauty.wasPrice    n=188  median 1.000
 *
 * A reference price is a manufacturer fact, so two honest UK shops quoting the
 * same bottle agree — and those two do, at 1.000. Escentual agrees with
 * neither, on none of 132 products, by a tight constant near 1.44; the hand
 * check's own 57.00/40.25 = 1.416 sits inside that band. Its selling prices
 * and its `compare_at_price` move together (price/compare_at median 0.708
 * across 3,616 listings), so both sit on that same non-sterling scale.
 *
 * ── Why this refuses rather than converts ────────────────────────────────────
 * Nothing here divides by a rate. A rate we picked would be a number we made
 * up, applied to 8,000 listings, in front of shoppers. The only safe answer to
 * "these figures are not sterling" is to publish no price at all, which is
 * what `parseShopifyProducts` already does the moment it is told the currency
 * is anything other than GBP — it has always been able to do the right thing
 * and was simply never told the truth.
 *
 * ── What the signals are ─────────────────────────────────────────────────────
 * Two, read from what a Shopify storefront publishes about itself:
 *
 *   `/meta.json`                the shop's own settlement currency
 *   `Shopify.currency` inlined  `{"active":"GBP","rate":"1.0"}` — the currency
 *   in the storefront theme     this session is being *quoted* in, and the
 *                               conversion applied to get there
 *
 * The second is the authoritative one for our purpose and takes precedence:
 * under Shopify Markets a UK shop settles in GBP and still quotes a visitor
 * abroad — a CI runner, for instance — in that market's currency at a
 * converted, rounded price. Reading the settlement currency and stopping there
 * is exactly how a converted price list passes for pounds.
 *
 * That precedence, and the meaning of `rate`, are read from Shopify's
 * documented storefront behaviour rather than from anything measured in this
 * repo — this environment has no network and cannot observe a storefront. The
 * guard is therefore built to fail closed: every ambiguity resolves to "not
 * established", and "not established" withholds prices. Being wrong about the
 * mechanism can cost listings; it cannot produce a price.
 */

export interface StorefrontCurrency {
  /**
   * The currency the storefront is quoting us in, where it says so. Null means
   * it did not say, which must be read as unknown and never as sterling.
   */
  presented: string | null;
  /** The shop's own settlement currency, where `/meta.json` publishes one. */
  settlement: string | null;
  /**
   * Shopify's conversion rate from the settlement currency to the presented
   * one, where the theme publishes it. 1 means no conversion is in play.
   */
  rate: number | null;
  /**
   * True only when every signal present says these numbers are pounds as
   * charged. False covers "something else", "converted" and "did not say"
   * alike, because all three are reasons not to publish.
   */
  isSterling: boolean;
  /** Why, in a sentence a CI log can carry. */
  reason: string;
}

/** A conversion this close to 1 is float noise in the theme's own rounding. */
const RATE_EPSILON = 0.005;

function parseActive(homepageHtml: string | null): { currency: string | null; rate: number | null } {
  if (!homepageHtml) return { currency: null, rate: null };
  const inline = homepageHtml.match(/Shopify\.currency\s*=\s*(\{[^}]*\})/i);
  if (!inline?.[1]) return { currency: null, rate: null };
  const active = inline[1].match(/"active"\s*:\s*"([A-Za-z]{3})"/);
  const rate = inline[1].match(/"rate"\s*:\s*"?([\d.]+)"?/);
  const parsedRate = rate?.[1] ? Number.parseFloat(rate[1]) : NaN;
  return {
    currency: active?.[1] ? active[1].toUpperCase() : null,
    rate: Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : null,
  };
}

/**
 * Decide, from what the storefront published, whether its prices are sterling.
 *
 * Pure so the decision can be tested without a network, which is the only way
 * it can be tested from this environment at all.
 */
export function readStorefrontCurrency(
  metaJson: string | null,
  homepageHtml: string | null,
): StorefrontCurrency {
  const { currency: active, rate } = parseActive(homepageHtml);
  // parseShopCurrency prefers /meta.json, which is the settlement currency —
  // exactly the field that must not decide this on its own.
  const settlement = parseShopCurrency(metaJson, null);
  const presented = active ?? parseShopCurrency(metaJson, homepageHtml);

  const base: Omit<StorefrontCurrency, 'isSterling' | 'reason'> = { presented, settlement, rate };

  if (presented === null) {
    return {
      ...base,
      isSterling: false,
      reason:
        'the storefront published no currency (no Shopify.currency in the theme, no /meta.json) — ' +
        'unknown, which is not the same as sterling',
    };
  }
  if (presented !== 'GBP') {
    return {
      ...base,
      isSterling: false,
      reason: `the storefront is quoting this client in ${presented}, not GBP`,
    };
  }
  if (settlement !== null && settlement !== 'GBP') {
    return {
      ...base,
      isSterling: false,
      reason:
        `the storefront settles in ${settlement} but quotes GBP, so its prices are converted ` +
        'rather than charged as published',
    };
  }
  if (rate !== null && Math.abs(rate - 1) > RATE_EPSILON) {
    return {
      ...base,
      isSterling: false,
      reason: `the storefront is applying a conversion rate of ${rate}, so its prices are converted`,
    };
  }
  return {
    ...base,
    isSterling: true,
    reason: rate === null
      ? 'the storefront publishes GBP and no conversion'
      : `the storefront publishes GBP at rate ${rate}`,
  };
}

/**
 * Ask a storefront what it is quoting in.
 *
 * Two ordinary anonymous GETs of documents the shop serves to every visitor.
 * Neither is an affiliate link and neither is behind robots.txt's product
 * rules — the caller has already loaded robots.txt and checks it for the
 * `/products.json` walk itself.
 */
export async function fetchStorefrontCurrency(
  origin: string,
  http: Http,
  headers: Record<string, string>,
): Promise<StorefrontCurrency> {
  const base = origin.replace(/\/+$/, '');
  const meta = await http(`${base}/meta.json`, headers);
  const home = await http(`${base}/`, headers);
  return readStorefrontCurrency(meta.ok ? meta.body : null, home.ok ? home.body : null);
}

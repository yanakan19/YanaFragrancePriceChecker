import type { Http } from './attempt.js';
import { readStorefrontCurrency, type StorefrontCurrency } from './shopCurrency.js';

/**
 * Ask a storefront, at every address it might publish a sterling price list
 * from, what currency it is quoting — and record the answers rather than a
 * conclusion drawn from them.
 *
 * ── Why this is separate from `shopCurrency.ts` ──────────────────────────────
 * `readStorefrontCurrency` answers "is *this* response in pounds". That is the
 * right question at the moment a price is about to be written, and it is the
 * wrong question when a shop is off and someone is trying to find out whether
 * it could ever be on. A shop that answers USD at its bare origin has not said
 * it has no sterling price list; it has said the address we asked is not it.
 * Under Shopify Markets one storefront serves several markets, each with its
 * own price list, and which one a visitor gets is decided by where the visitor
 * is — so a CI runner in Virginia and a shopper in Cardiff can read the same
 * URL and see different numbers, both correct.
 *
 * That is not a hypothetical here. Escentual's stored figures were harvested
 * by a GitHub Actions runner, and a person in the UK opening the same product
 * page by hand saw £40.25 where the harvest had stored 57.00. Whether that is
 * two markets or two currencies or something else was never established,
 * because nothing ever asked the shop from a machine that could reach it.
 *
 * ── What this module will not do ─────────────────────────────────────────────
 * It converts nothing and asserts nothing. Every field it returns is either
 * something the shop published or `null` meaning it did not. The verdict it
 * computes is only ever "proven sterling at this address" or "not proven", and
 * "not proven" is the answer for every kind of silence — a 404, an unparseable
 * theme, a currency selector matched by mistake. Being wrong in that direction
 * costs listings. Being wrong in the other direction publishes a foreign price
 * list as pounds, which is the fault this whole area of the repo exists to
 * stop.
 */

/**
 * Addresses a multi-market Shopify store may put its UK price list behind.
 *
 * `''` is the bare origin and is always tried first, because a single-market
 * UK shop publishes sterling there and must not pay for any of the rest.
 *
 * The four prefixes are Shopify's own subfolder convention for markets
 * (`/en-gb` and friends), which is what nicchialuxury.com uses. They are
 * guesses at an address, never at a currency: a candidate counts for nothing
 * unless the storefront it returns says GBP itself.
 */
export const UK_MARKET_PREFIXES = ['', '/en-gb', '/gb', '/uk', '/en-uk'] as const;

/** One address, and what the shop said when asked from this machine. */
export interface MarketReading {
  /** The prefix tried. `''` is the bare origin. */
  prefix: string;
  /** The full base the two documents were read from. */
  base: string;
  /** HTTP status of `<base>/meta.json`, or null if the request never returned. */
  metaStatus: number | null;
  /** HTTP status of `<base>/`, or null if the request never returned. */
  homeStatus: number | null;
  /** What `readStorefrontCurrency` made of the pair. */
  currency: StorefrontCurrency;
}

/**
 * A price and the currency the page itself labelled it with.
 *
 * schema.org's `priceCurrency` is the one field on a product page that is
 * *about* the number beside it, written by the shop, in a vocabulary with a
 * published meaning. `/products.json` has nothing equivalent — a bare `price`
 * string and no unit anywhere in the payload — which is precisely how a
 * foreign price list got copied into `priceGbp` without anything noticing.
 */
export interface LabelledOffer {
  price: number | null;
  currency: string | null;
}

/**
 * Read every `priceCurrency`/`price` pair out of a page's JSON-LD.
 *
 * Deliberately a scan rather than a parse of the graph. A product page may
 * carry several `Offer` nodes (one per variant), an `AggregateOffer`, and
 * unrelated `Organization`/`BreadcrumbList` blocks, and the shapes vary by
 * theme. What matters for this probe is not which offer belongs to which
 * variant but whether the page labels *any* of its prices, and with what — a
 * page that says `"priceCurrency":"USD"` has answered the question whichever
 * node said it.
 *
 * Pairs are matched within a single JSON object by taking the `price` and
 * `priceCurrency` nearest each other, which is what every JSON-LD serialiser
 * emits; a currency with no price beside it is still reported, with a null
 * price, because the currency is the part that settles anything.
 */
export function readJsonLdOffers(html: string): LabelledOffer[] {
  const offers: LabelledOffer[] = [];
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const script of scripts) {
    const block = script[1];
    if (!block) continue;
    // Every currency the block states, each paired with the price that sits
    // closest to it in the raw text.
    for (const hit of block.matchAll(/"priceCurrency"\s*:\s*"([A-Za-z]{3})"/g)) {
      const at = hit.index ?? 0;
      offers.push({ price: nearestPrice(block, at), currency: hit[1]!.toUpperCase() });
    }
  }
  return offers;
}

/** The `price` value textually nearest `at`, looking both ways. */
function nearestPrice(block: string, at: number): number | null {
  let best: { distance: number; value: number } | null = null;
  for (const hit of block.matchAll(/"(?:price|lowPrice)"\s*:\s*"?(-?[\d.]+)"?/g)) {
    const value = Number.parseFloat(hit[1]!);
    if (!Number.isFinite(value)) continue;
    const distance = Math.abs((hit.index ?? 0) - at);
    if (!best || distance < best.distance) best = { distance, value };
  }
  return best ? best.value : null;
}

/**
 * What a set of readings settles, and what it leaves open.
 *
 * `sterlingBase` is non-null only where a storefront published GBP *and* said
 * nothing that contradicts it — no foreign settlement currency behind the
 * quote, no conversion rate away from 1. That is `readStorefrontCurrency`'s
 * own bar, applied per address, and it is deliberately higher than "the page
 * mentioned GBP somewhere".
 */
export interface MarketProbeVerdict {
  /** The first address that proved sterling, or null if none did. */
  sterlingBase: string | null;
  /** Currency codes seen, in the order the addresses were tried. */
  currenciesSeen: string[];
  /** One line per address, suitable for a CI log. */
  lines: string[];
  /** A sentence saying what was and was not established. */
  reading: string;
}

export function summariseMarketProbe(readings: readonly MarketReading[]): MarketProbeVerdict {
  const lines: string[] = [];
  const currenciesSeen: string[] = [];
  let sterlingBase: string | null = null;

  for (const r of readings) {
    const where = r.prefix === '' ? 'origin' : r.prefix;
    if (r.currency.presented && !currenciesSeen.includes(r.currency.presented)) {
      currenciesSeen.push(r.currency.presented);
    }
    lines.push(
      `${where.padEnd(8)} meta ${String(r.metaStatus ?? '—').padStart(3)}  ` +
        `home ${String(r.homeStatus ?? '—').padStart(3)}  ` +
        `quotes ${(r.currency.presented ?? 'nothing').padEnd(7)} ` +
        `settles ${(r.currency.settlement ?? 'nothing').padEnd(7)} ` +
        `rate ${r.currency.rate ?? '—'}  ` +
        `${r.currency.isSterling ? 'STERLING' : 'not proven'} — ${r.currency.reason}`,
    );
    if (r.currency.isSterling && sterlingBase === null) sterlingBase = r.base;
  }

  const reading = sterlingBase
    ? `a sterling price list is published at ${sterlingBase} — its prices may be compared as pounds`
    : currenciesSeen.length > 0
      ? `no address tried published sterling; this storefront quoted ${currenciesSeen.join(', ')} ` +
        'to this machine. That is what it quotes *here*, which is not the same as what it ' +
        'charges a UK shopper — a Shopify market is chosen by the visitor, so this settles the ' +
        'numbers we harvest and settles nothing about the shop.'
      : 'no address tried published any currency at all — the storefront was silent, which must ' +
        'be read as unknown and never as sterling';

  return { sterlingBase, currenciesSeen, lines, reading };
}

/** Everything the probe needs that is not a fetch. */
export interface MarketProbeOptions {
  /** Prefixes to try, in order. Defaults to `UK_MARKET_PREFIXES`. */
  prefixes?: readonly string[];
  /** robots.txt gate. Anything disallowed is skipped, not fetched. */
  allow?: (url: string) => boolean;
  /** Milliseconds to wait between requests, honouring the shop's own limits. */
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Read `/meta.json` and `/` at each candidate address.
 *
 * Two ordinary anonymous GETs per address, of documents the shop serves to
 * every visitor, at the slower of the registry's gap and robots.txt's
 * crawl-delay. Nothing here follows an affiliate link and nothing here is a
 * product request.
 */
export async function probeMarkets(
  origin: string,
  http: Http,
  headers: Record<string, string>,
  options: MarketProbeOptions = {},
): Promise<MarketReading[]> {
  const prefixes = options.prefixes ?? UK_MARKET_PREFIXES;
  const allow = options.allow ?? (() => true);
  const gapMs = options.gapMs ?? 0;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const trimmed = origin.replace(/\/+$/, '');

  const readings: MarketReading[] = [];
  for (const prefix of prefixes) {
    const base = `${trimmed}${prefix}`;
    const metaUrl = `${base}/meta.json`;
    const homeUrl = `${base}/`;
    if (!allow(metaUrl) || !allow(homeUrl)) continue;

    const meta = await http(metaUrl, headers);
    if (gapMs > 0) await sleep(gapMs);
    const home = await http(homeUrl, headers);
    if (gapMs > 0) await sleep(gapMs);

    readings.push({
      prefix,
      base,
      metaStatus: meta.status || null,
      homeStatus: home.status || null,
      currency: readStorefrontCurrency(meta.ok ? meta.body : null, home.ok ? home.body : null),
    });
  }
  return readings;
}

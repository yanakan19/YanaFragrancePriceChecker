import type { Http } from './attempt.js';
import { readStorefrontCurrency, type StorefrontCurrency } from './shopCurrency.js';

/**
 * Ask a storefront, in every way it might be asked, what currency it is
 * quoting — and record the answers rather than a conclusion drawn from them.
 *
 * ── Why this is separate from `shopCurrency.ts` ──────────────────────────────
 * `readStorefrontCurrency` answers "is *this* response in pounds". That is the
 * right question at the moment a price is about to be written, and it is the
 * wrong question when a shop is off and someone is trying to find out whether
 * it could ever be on. A shop that answers USD has not said it has no sterling
 * price list; it has said the request we made is not one that gets it. Under
 * Shopify Markets one storefront serves several markets, each with its own
 * price list, and which one a visitor gets is decided by where the visitor is
 * — so a CI runner in Virginia and a shopper in Cardiff can read the same URL
 * and see different numbers, both correct.
 *
 * That is not hypothetical. Measured on 2026-08-15 (currency probe, run
 * 31880073037, job 95001301639, commit d72aea0): escentual.com serves a
 * `/meta.json` saying it **settles in GBP**, and a theme saying
 * `Shopify.currency` active **USD** at rate **1.38605**; its product page for
 * Calvin Klein Obsession For Men 125ml EDT carried a schema.org offer of
 * **57 labelled USD**, which is exactly the figure this repo had stored for it
 * as pounds. The sterling price list therefore certainly exists — the shop
 * charges in pounds — and the harvest had simply never been in a position to
 * be shown it.
 *
 * ── Two kinds of candidate, both guesses at a request, never at a price ──────
 * A multi-market storefront can be addressed two ways, and this tries both:
 *
 *   subfolder   `/en-gb/`, `/gb/` …  Shopify's market-per-URL-prefix layout.
 *                                    nicchialuxury.com is this shape.
 *   request     `?country=GB`, a     One domain, one path, the market chosen
 *   shape       `localization` or    per request. escentual.com is this shape:
 *               `cart_currency`      every subfolder above returned 404 in the
 *               cookie, `Accept-     run cited above while the bare origin
 *               Language: en-GB`     answered 200 in dollars.
 *
 * Every candidate is a guess at *how to ask*. None is a guess at the answer: a
 * candidate counts for nothing unless the storefront it returns says GBP
 * itself, settles in GBP, and applies no conversion — `readStorefrontCurrency`'s
 * own bar, unchanged, applied once per candidate.
 *
 * ── What this module will not do ─────────────────────────────────────────────
 * It converts nothing and asserts nothing. Every field it returns is either
 * something the shop published or `null` meaning it did not. Its verdict is
 * only ever "proven sterling by this request" or "not proven", and "not
 * proven" is the answer for every kind of silence — a 404, an unparseable
 * theme, a currency selector matched by mistake. Being wrong in that direction
 * costs listings. Being wrong in the other direction publishes a foreign price
 * list as pounds, which is the fault this whole area of the repo exists to
 * stop.
 */

/**
 * Path prefixes a multi-market Shopify store may put its UK price list behind.
 *
 * `''` is the bare origin and is always tried first, because a single-market
 * UK shop publishes sterling there and must not pay for any of the rest.
 */
export const UK_MARKET_PREFIXES = ['', '/en-gb', '/gb', '/uk', '/en-uk'] as const;

/** One way of asking a storefront for its UK price list. */
export interface MarketCandidate {
  /** Short label for a log line. */
  label: string;
  /** Origin plus any path prefix. Prices, if this one works, are read here. */
  base: string;
  /** Query string appended to every request under this candidate, `''` or `?…`. */
  query: string;
  /** Headers merged over the caller's, e.g. a `Cookie` or `Accept-Language`. */
  headers: Record<string, string>;
  /** Where the idea for this candidate comes from — never where its answer does. */
  why: string;
}

/** The market-per-URL-prefix layout. */
export function subfolderCandidates(origin: string): MarketCandidate[] {
  const trimmed = origin.replace(/\/+$/, '');
  return UK_MARKET_PREFIXES.map((prefix) => ({
    label: prefix === '' ? 'origin' : prefix,
    base: `${trimmed}${prefix}`,
    query: '',
    headers: {},
    why:
      prefix === ''
        ? 'the shop as any visitor first meets it'
        : "Shopify's subfolder layout for a market",
  }));
}

/**
 * The one-domain layout, where the market is chosen per request.
 *
 * These five are switches a Shopify storefront *may* expose to a client that
 * is not in the market it wants: the country query parameter, the cookie a
 * country selector sets, the older currency cookie, both together, and the
 * language header. They are listed because they are worth trying, not because
 * any shop was observed honouring them — at the time this was written none had
 * been tried anywhere, and finding out which work is the whole point.
 *
 * A shop is entitled to ignore all of them and serve the market it geolocates,
 * in which case no request this repo can make from a US runner will ever see
 * the UK price list, and the honest outcome is that the shop stays off.
 */
export function requestShapeCandidates(origin: string): MarketCandidate[] {
  const base = origin.replace(/\/+$/, '');
  return [
    {
      label: '?country=GB',
      base,
      query: '?country=GB',
      headers: {},
      why: "Shopify Markets' country parameter",
    },
    {
      label: 'cookie localization=GB',
      base,
      query: '',
      headers: { Cookie: 'localization=GB' },
      why: 'the cookie a Shopify country selector sets when a visitor picks the UK',
    },
    {
      label: 'cookie cart_currency=GBP',
      base,
      query: '',
      headers: { Cookie: 'cart_currency=GBP' },
      why: "Shopify's currency cookie, from before Markets",
    },
    {
      label: 'both cookies',
      base,
      query: '',
      headers: { Cookie: 'localization=GB; cart_currency=GBP' },
      why: 'a visitor who has picked the UK and holds both cookies',
    },
    {
      label: 'Accept-Language en-GB',
      base,
      query: '',
      headers: { 'Accept-Language': 'en-GB,en;q=0.9' },
      why: 'the weakest of the five — a language preference is not a market',
    },
  ];
}

/** Every way of asking, subfolders first. */
export function ukMarketCandidates(origin: string): MarketCandidate[] {
  return [...subfolderCandidates(origin), ...requestShapeCandidates(origin)];
}

/** One candidate, and what the shop said when asked that way from this machine. */
export interface MarketReading {
  candidate: MarketCandidate;
  /** HTTP status of the `meta.json` request, or null if it never returned. */
  metaStatus: number | null;
  /** HTTP status of the homepage request, or null if it never returned. */
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
 * `sterling` is non-null only where a storefront published GBP *and* said
 * nothing that contradicts it — no foreign settlement currency behind the
 * quote, no conversion rate away from 1. That is `readStorefrontCurrency`'s
 * own bar, applied per candidate, and it is deliberately higher than "the page
 * mentioned GBP somewhere".
 */
export interface MarketProbeVerdict {
  /** The first candidate that proved sterling, or null if none did. */
  sterling: MarketCandidate | null;
  /** The settlement currency the shop published, where it published one. */
  settles: string | null;
  /** Currency codes quoted, in the order the candidates were tried. */
  currenciesSeen: string[];
  /** One line per candidate, suitable for a CI log. */
  lines: string[];
  /** A sentence saying what was and was not established. */
  reading: string;
}

export function summariseMarketProbe(readings: readonly MarketReading[]): MarketProbeVerdict {
  const lines: string[] = [];
  const currenciesSeen: string[] = [];
  let sterling: MarketCandidate | null = null;
  let settles: string | null = null;

  for (const r of readings) {
    if (r.currency.presented && !currenciesSeen.includes(r.currency.presented)) {
      currenciesSeen.push(r.currency.presented);
    }
    if (settles === null) settles = r.currency.settlement;
    lines.push(
      `${r.candidate.label.padEnd(24)} meta ${String(r.metaStatus ?? '—').padStart(3)}  ` +
        `home ${String(r.homeStatus ?? '—').padStart(3)}  ` +
        `quotes ${(r.currency.presented ?? 'nothing').padEnd(7)} ` +
        `settles ${(r.currency.settlement ?? 'nothing').padEnd(7)} ` +
        `rate ${String(r.currency.rate ?? '—').padEnd(9)} ` +
        `${r.currency.isSterling ? 'STERLING' : 'not proven'} — ${r.currency.reason}`,
    );
    if (r.currency.isSterling && sterling === null) sterling = r.candidate;
  }

  return { sterling, settles, currenciesSeen, lines, reading: reading() };

  function reading(): string {
    if (sterling) {
      return (
        `a sterling price list is served to "${sterling.label}" — prices read that way may be ` +
        'compared as pounds'
      );
    }
    if (currenciesSeen.length === 0) {
      return (
        'no candidate published any currency at all — the storefront was silent, which must be ' +
        'read as unknown and never as sterling'
      );
    }
    const quoted =
      `this storefront quoted ${currenciesSeen.join(', ')} to this machine however it was asked`;
    if (settles === 'GBP') {
      return (
        `${quoted}, while its own /meta.json says it SETTLES in GBP. So a sterling price list ` +
        'exists and none of these requests reached it. Dividing the quoted figures by the rate ' +
        'the theme publishes would not recover it either: a Shopify market applies its own price ' +
        'rounding, so the back-conversion lands near the charged price rather than on it. Until ' +
        'a request that returns the GBP list is found, these numbers must not be published as ' +
        'pounds.'
      );
    }
    return (
      `${quoted}. That is what it quotes *here*, which is not the same as what it charges a UK ` +
      'shopper — a Shopify market is chosen by the visitor, so this settles the numbers we ' +
      'harvest and settles nothing about the shop.'
    );
  }
}

/** Everything the probe needs that is not a fetch. */
export interface MarketProbeOptions {
  /** robots.txt gate. Anything disallowed is skipped, not fetched. */
  allow?: (url: string) => boolean;
  /** Milliseconds to wait between requests, honouring the shop's own limits. */
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** The URL a candidate reads a given path from. */
export function candidateUrl(candidate: MarketCandidate, path: string): string {
  return `${candidate.base}${path}${candidate.query}`;
}

/**
 * Read `/meta.json` and `/` under each candidate.
 *
 * Two ordinary anonymous GETs per candidate, of documents the shop serves to
 * every visitor, at the slower of the registry's gap and robots.txt's
 * crawl-delay. Nothing here follows an affiliate link and nothing here is a
 * product request.
 */
export async function probeMarkets(
  candidates: readonly MarketCandidate[],
  http: Http,
  headers: Record<string, string>,
  options: MarketProbeOptions = {},
): Promise<MarketReading[]> {
  const allow = options.allow ?? (() => true);
  const gapMs = options.gapMs ?? 0;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const readings: MarketReading[] = [];
  for (const candidate of candidates) {
    const metaUrl = candidateUrl(candidate, '/meta.json');
    const homeUrl = candidateUrl(candidate, '/');
    if (!allow(metaUrl) || !allow(homeUrl)) continue;

    const sent = { ...headers, ...candidate.headers };
    const meta = await http(metaUrl, sent);
    if (gapMs > 0) await sleep(gapMs);
    const home = await http(homeUrl, sent);
    if (gapMs > 0) await sleep(gapMs);

    readings.push({
      candidate,
      metaStatus: meta.status || null,
      homeStatus: home.status || null,
      currency: readStorefrontCurrency(meta.ok ? meta.body : null, home.ok ? home.body : null),
    });
  }
  return readings;
}

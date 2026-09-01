/**
 * Telling "the shop refused this address" apart from "the shop has nothing".
 *
 * ── The case this exists for ────────────────────────────────────────────────
 * Run #330's harvest report (data/harvest-report.json, committed as 2cd38bf)
 * records Boots exactly like this:
 *
 *   [actor] rendered 1 section page(s), 0 listings parsed, 0 priced
 *   [actor] https://www.boots.com/fragrance/shop-all-fragrance?pageNo=1: HTTP 200, 1199 bytes
 *
 * "0 listings parsed" is the same line a shop would produce if it genuinely
 * had no products on that page, or if our parser had stopped understanding its
 * markup. Those are three different problems with three different fixes, and
 * the harvest could not tell them apart. It has the evidence to: 1,199 bytes
 * is not a catalogue page. It is a challenge or a block page, and the shop is
 * saying no to this IP.
 *
 * ── Where the byte threshold comes from ─────────────────────────────────────
 * Measured, not guessed. Everything below is a real figure from this repo's
 * own evidence or from a measurement run in this sandbox.
 *
 * Pages that were refusals:
 *   1,070   a Cloudflare-style "checking your browser" interstitial, rendered
 *           through Chromium against a local server in this sandbox
 *   1,199   Boots, HTTP 200, run #330 — the case above
 *  27,508   Notino, HTTP 403 (its 27,514 and 27,520 byte siblings likewise)
 *  27,558   The Fragrance Shop, HTTP 403 (and its 27,567/27,573 siblings)
 *
 * Pages that were real catalogue pages:
 *   699,656  Notino /fragrance/?page=1, HTTP 200, run #330
 * ~1,067,905  John Lewis through Apify's actor, harvest probe run 19
 *   697,046  a 2,500-product, 2,500-image page rendered through Chromium in
 *            this sandbox, as `page.content()` returns it
 *
 * And the floor — what the very smallest thing that could honestly be called a
 * catalogue page weighs. Built from 24 real Beauty Base listings out of
 * data/catalogue/beautybase.json, as the schema.org ItemList a parser would
 * read:
 *
 *   4,716  12 products, JSON-LD alone
 *   9,526  24 products, JSON-LD alone
 *  19,622  48 products, JSON-LD alone
 *  14,950  24 products as a whole page — JSON-LD plus one <li> each, with no
 *          navigation, no stylesheet, no script, no cookie banner
 *
 * REFUSAL_MAX_BYTES is 8,000. That sits above every measured refusal that
 * answered 200, below the 9,526 bytes that 24 products cost as bare JSON-LD
 * with nothing around them, and 87x below the smallest genuine rendered
 * catalogue page anyone here has measured.
 *
 * The threshold is also never applied alone: a page only reads as a refusal if
 * nothing at all parsed out of it. A small shop serving a genuinely short
 * category page has its products read and is never called refused, because the
 * products are the disproof.
 *
 * ── What this deliberately does not do ──────────────────────────────────────
 * It does not retry. A shop that refused this address will refuse it again,
 * and asking a second time is asking a shop that has said no to say no again.
 * The whole value here is in the reporting: the run says "refused" where it
 * used to say "found nothing", and a human reads that and decides whether the
 * answer is a different address, a partner feed, or leaving the shop alone.
 *
 * It also does not judge 5xx. A 503 (Harvey Nichols answered 503 at 9,288
 * bytes on run #330) may be a wall or may be a shop having a bad minute, and
 * this module will not guess between them; "HTTP 503" already says what is
 * known.
 */

/** See this file's header for the measurements behind this number. */
export const REFUSAL_MAX_BYTES = 8_000;

/** Statuses that are a refusal whatever the body says. */
const REFUSING_STATUSES = new Set([401, 403, 407, 429]);

export interface RenderedPage {
  url: string;
  status: number;
  /** Length of the rendered body, in bytes as the renderer measured it. */
  bytes: number;
  /** How many listings the parser got out of this page. Products disprove a refusal. */
  listingsParsed: number;
}

export interface RenderRefusal {
  url: string;
  status: number;
  bytes: number;
  /** Plain English, for a log line and for the report. */
  reason: string;
}

/**
 * Whether one rendered page reads as the shop refusing us.
 *
 * Null means "not established as a refusal", which is not the same as "the
 * shop is fine" — a timeout, a 500 and a page we simply failed to parse all
 * return null here and are reported by whatever already reported them.
 */
export function renderRefusal(page: RenderedPage): RenderRefusal | null {
  if (page.listingsParsed > 0) return null;

  if (REFUSING_STATUSES.has(page.status)) {
    return {
      url: page.url,
      status: page.status,
      bytes: page.bytes,
      reason: `the shop answered HTTP ${page.status} — this address is refused, not empty`,
    };
  }

  const is2xx = page.status >= 200 && page.status < 300;
  if (is2xx && page.bytes > 0 && page.bytes < REFUSAL_MAX_BYTES) {
    return {
      url: page.url,
      status: page.status,
      bytes: page.bytes,
      reason:
        `HTTP ${page.status} but only ${page.bytes} bytes — far too small to be a catalogue page ` +
        `(a real one measures 700KB-1MB), so this is a bot wall, not an empty shop`,
    };
  }

  return null;
}

/** Every refusal among a shop's rendered section pages, in the order given. */
export function renderRefusals(pages: readonly RenderedPage[]): RenderRefusal[] {
  return pages.map(renderRefusal).filter((r): r is RenderRefusal => r !== null);
}

/**
 * Whether a shop is worth spending a render-tier page on at all.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 * The render tier's page budget (`MAX_LOCAL_RENDER_PAGES_PER_RUN`,
 * localBrowser.ts) is one pool shared by every shop a run reaches that turn.
 * scripts/catalogue-harvest.ts used to offer that pool to any shop with zero
 * free-tier priced listings, with no memory of what rendering that shop has
 * already shown. Six shops this project markets as "designer" or "niche" and
 * confirms `renderRefused` below have answered the same way every single
 * time: Boots at 200/1188-1199 bytes, Zara at 403/325-331 bytes, Superdrug at
 * 403/317-341 bytes, The Fragrance Shop at 403/27487-27573 bytes, The Perfume
 * Shop at 403/326-344 bytes (data/harvest-report.json, five to six real — not
 * budget-exhausted — render attempts each, spanning 2026-08-25 and
 * 2026-08-26), and John Lewis at HTTP 0/0 bytes,
 * `net::ERR_HTTP2_PROTOCOL_ERROR` on all four of its section URLs, ten for
 * ten real attempts spanning 2026-08-27 to 2026-08-31 (see its own registry
 * entry for every run number and job id). John Lewis is the odd shape here —
 * no HTTP response at all rather than a 200 or 403 with a tiny body — but the
 * outcome for this function is the same: a real, repeated, non-budget-
 * exhausted refusal, not a fluke. Between the six of them they could consume
 * the entire render tier's 12-page budget on a run where every one gets a
 * real turn, for an answer already on file several times over — which is
 * exactly why Selfridges, this project's one remaining shop with a
 * genuinely positive render outcome, was starved of a real turn on most
 * runs before this flag existed.
 *
 * A shop is excluded here only once it clears a real bar: multiple dated,
 * non-budget-exhausted renders, all landing in `renderRefusal`'s refused
 * shape. A single bad render, or a run that never actually reached the
 * network (localBrowser's `HTTP 0 ... budget ... exhausted` stub), proves
 * nothing about the shop and must never set this.
 */
export function knownRenderRefusal(retailer: { name: string; renderRefused?: boolean }): string | null {
  if (!retailer.renderRefused) return null;
  return (
    `${retailer.name} has answered every real render attempt on file with a refusal ` +
    `(see its registry entry in src/config/retailers.ts for the dated evidence) — ` +
    `skipping the render tier rather than spending a page confirming that again`
  );
}

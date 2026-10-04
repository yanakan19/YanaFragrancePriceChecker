import type { Retailer } from '../types/retailer.js';
import type { RawListing } from './types.js';
import type { Http } from './attempt.js';
import { parseListings } from './jsonld.js';
import { isAllowed, type RobotsRules } from './robots.js';
import { readRobotsResponse, resolveRobotsReadings } from './robotsSource.js';
import { BEAUTY_BAY_API, beautyBayApiUrl, beautyBayParts, parseBeautyBayProduct } from './beautyBayApi.js';

/**
 * Harvest a shop's catalogue through the sitemap it publishes.
 *
 * The probe proved this is the route that works where guessed section URLs do
 * not: a sitemap exists precisely so crawlers stop guessing, and four shops
 * that returned nothing for an invented `/fragrance?page=1` handed over real
 * products the moment we asked properly.
 *
 * Two things keep this honest and affordable. Every URL is checked against
 * robots.txt before it is fetched, and the fetch budget is fixed, so a shop
 * with forty thousand products costs the same as one with four hundred.
 */

export interface SitemapCrawlOptions {
  retailer: Retailer;
  http: Http;
  robots: RobotsRules;
  /** Hard ceiling on product pages fetched. The whole cost control. */
  maxPages: number;
  /** Milliseconds between requests. */
  gapMs: number;
  headers: Record<string, string>;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Fires after every fetch in both the discovery walk and the product-page
   * walk, not just at the end of a shop's run. A CI runner treats 10 minutes
   * of a job producing no log output as a stuck process and kills it — and a
   * budgeted walk can genuinely go that long between one shop's start and its
   * single end-of-run summary line if enough of its fetches hit the timeout.
   * A caller that logs on every call keeps the runner convinced the job is
   * still alive; a caller that does nothing is exactly the silence that gets
   * a healthy-but-slow crawl mistaken for a hang.
   */
  onProgress?: (fetched: number, found: number) => void;
  /**
   * Wall-clock ceiling on this whole call, in milliseconds. `maxPages` caps
   * request *count*, not time — a shop whose every request is slow rather
   * than erroring can still burn the job's entire duration on one shop.
   * Checked between requests, not mid-request, so a single already-in-flight
   * fetch is left to its own 20-25s timeout to resolve rather than aborted.
   */
  maxDurationMs?: number;
  /**
   * Product URLs already stored for this shop, mapped to when each was last
   * fetched (ISO 8601).
   *
   * Without this the walk fetches `urls.slice(0, maxPages)` every run — the
   * same first N URLs the sitemap happens to list — so a shop with 800
   * products could never yield more than one budget's worth however many times
   * it ran. Passing what we already hold lets each run spend most of its budget
   * on products it has never seen, which is what actually grows the catalogue.
   */
  knownUrls?: ReadonlyMap<string, string>;
  /**
   * Share of the budget reserved for re-fetching URLs we already hold, oldest
   * first. Discovery alone would never revisit a listing, so its price would be
   * frozen at whatever it was the day we found it — and a stale price shown as
   * current is the one error this project must not make.
   */
  refreshShare?: number;
  /**
   * Stored product URLs to re-read this run, in order, ahead of anything the
   * budget picks. Not capped by `maxPages`: only `maxDurationMs` bounds them.
   *
   * This is what makes a refresh complete rather than sampled. `refreshShare`
   * alone re-read 28 listings a run on the scheduled --max=70, so a shop with
   * 2,000 listings came back to each one roughly every fortnight (Justmylook,
   * 2026-10-03: 1,579 of 2,020 listings 10 to 21 days old). The caller
   * passes every listing that is due, oldest first, and the walk reads them
   * all whether or not this run's sitemap discovery happened to list them.
   */
  refreshUrls?: readonly string[];
  /**
   * Where in the unseen URLs this run's discovery starts. See
   * `selectUrlsToFetch`.
   */
  discoveryOffset?: number;
}

export interface SitemapCrawlResult {
  listings: RawListing[];
  pagesFetched: number;
  urlsDiscovered: number;
  errors: string[];
  /**
   * The first few product URLs this walk actually fetched.
   *
   * A shop reporting "2862 urls  70 fetched  0 priced listings" with no errors
   * is the hardest state to diagnose in this whole pipeline: nothing failed, so
   * there is nothing to read, and the run output cannot distinguish "their
   * pages carry no JSON-LD" from "we fetched 70 pages that were never products
   * in the first place". The second was the truth for three shops for weeks
   * (see pathOf above) and it was invisible, because what got fetched was never
   * written down anywhere. Capped hard: this is a diagnostic, not a log of the
   * walk.
   */
  sampledUrls: string[];
  /**
   * Product URLs the shop answered with 404 or 410: the shop's own word that
   * the page is gone. Optional so other routes that build this shape need
   * not invent one.
   */
  goneUrls?: string[];
  /**
   * Stored product URLs that redirected to a different page. Kept apart from
   * `goneUrls` because a wall can redirect too, so the caller trusts these
   * only when the shop demonstrably served real content in the same run.
   */
  movedUrls?: string[];
  /** How many never seen URLs this run fetched, to advance the discovery offset by. */
  discoveryFetched?: number;
  /**
   * True only when every URL discovery found was fetched this run and the
   * walk was not cut short. The only state in which a stored listing missing
   * from this run means the shop no longer lists it.
   */
  fetchedEveryDiscovered?: boolean;
}

/** How many fetched URLs a result carries back for diagnosis. */
const SAMPLE_LIMIT = 5;

/**
 * How long one shop's crawl gets when the caller names no ceiling.
 *
 * Generous for a healthy shop and short enough that one slow shop cannot eat
 * a whole run: the longest shop in run #330 was Debenhams at 392s, and Riiffs
 * at 390s, both inside this.
 *
 * Exported so that a caller which has its own deadline can take the smaller of
 * the two rather than reimplementing this number. scripts/catalogue-harvest.ts
 * does exactly that — a shop started with 40 seconds of the run left must get
 * 40 seconds, not eight minutes.
 */
export const DEFAULT_CRAWL_MS = 8 * 60_000;

/**
 * Ceiling on how many product URLs one discovery pass will collect.
 *
 * This is a memory guard, not a cost control — the cost is the twelve sitemap
 * fetches above, and reading ten thousand `<loc>` entries out of XML we have
 * already paid for is free. It used to be `maxPages * 4`, which quietly made
 * the fetch budget the discovery budget too: with `--max=60` no shop could
 * ever have more than 240 of its products known to us, however long it ran.
 */
const MAX_DISCOVERED_URLS = 5000;

const locs = (xml: string): string[] =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!).filter(Boolean);

const isXml = (u: string) => /\.xml(\.gz)?(\?|$)/i.test(u);

/**
 * Names that suggest a sitemap or URL is about fragrance rather than socks.
 *
 * "scent" must start a word. Unanchored it matched the middle of "descent",
 * "crescent", "fluorescent", "iridescent" and "unscented": Debenhams' first
 * harvest (2026-10-03) spent 7 of its 40 product fetches that way, on three
 * books ("The Descent of Man" among them), highlighters, earrings, fake snow
 * and an unscented bath soak, and its products-0.xml lists 30 such URLs among
 * the 153 the old pattern called scented.
 */
const SCENT = /fragrance|perfume|aftershave|cologne|eau-de|parfum|(^|[^a-z])scent/i;

/**
 * Words that name a perfume itself, not merely a smell. A product sitemap URL
 * carrying one is fetched before one that only says "fragrance" or "scent",
 * which on a department store means candles, detergent and urinal mats as
 * often as perfume: of Debenhams' 40 first harvested pages, 12 carried one of
 * these words and 9 reached the site as perfume; its products-0.xml has 41
 * such URLs among 123 scented ones.
 */
const PERFUME_WORD = /perfume|aftershave|cologne|eau-de|parfum|extrait/i;

/**
 * The part of a URL where a fragrance word actually tells us something.
 *
 * SCENT used to be tested against the whole URL, host included, which is fine
 * until the shop's own name is a fragrance word — and for a fragrance shop it
 * usually is. escentual.com, thefragrancecounter.co.uk, scentstore.com and
 * escentric.com all match SCENT on the hostname alone ("e-scent-ual",
 * "e-scent-ric"), so *every* URL those sitemaps listed looked like a named
 * fragrance aisle: the about-us page, the blog, the basket, the store locator.
 * The `scented` set below then filled with the whole site, the `generic`
 * fallback was never reached because `scented` was non-empty, and the walk
 * spent its entire 70-page budget on the head of a sitemap full of CMS pages.
 *
 * That is exactly what run #158 (2026-08-12) recorded: Escentual 5319 urls /
 * 70 fetched / 0 priced, The Fragrance Counter 2862 / 70 / 0, ScentStore
 * 501 / 70 / 0 — 14m35s of that run spent on three shops for nothing, while
 * every shop whose hostname does *not* contain a fragrance word (Allbeauty,
 * Justmylook, Beauty Base, LOOKFANTASTIC, Glorious Beauty, BellaVita, Oud
 * Arabian, Manchester Ouds, Emirates Oud) returned real priced listings from
 * the same code on the same run. The split was on the hostname, nothing else.
 *
 * Matching the path and query only restores the signal the regex was always
 * meant to carry: this URL, specifically, is filed under fragrance.
 */
const pathOf = (u: string): string => {
  try {
    const parsed = new URL(u);
    return parsed.pathname + parsed.search;
  } catch {
    // A relative or malformed <loc>. Nothing to strip, so match it whole
    // rather than silently dropping it.
    return u;
  }
};

/**
 * A sitemap whose own name says it lists products rather than content pages.
 *
 * The leading `(^|[^a-z])` is load-bearing rather than tidiness: a bare
 * `/item/` matches the "item" inside "s-item-ap", so every sitemap in
 * existence read as a product sitemap and the generic fallback below swallowed
 * a shop's entire about-us tree. A `\b` does not fix it either, because the
 * separator in "sitemap_products_1.xml" is an underscore, which is a word
 * character — so the token must be anchored on "not a letter" specifically.
 */
const PRODUCT_SITEMAP = /(^|[^a-z])(product|item|sku|catalog)/i;

/**
 * Walk sitemaps breadth first, collecting product URLs.
 *
 * ── Matching on the URL alone is not enough ──────────────────────────────────
 * This used to keep a URL only when the URL itself said "fragrance" or
 * "perfume". That works for shops which file scent under a named aisle, and
 * finds nothing at all for shops which do not: Boots and Harvey Nichols both
 * served their sitemaps perfectly happily and yielded zero URLs, reported as
 * `0 urls  0 fetched` with no error, because their product paths carry an id
 * rather than a category word. They looked blocked in the run output and were
 * not — nothing had ever asked them the right question.
 *
 * So two passes' worth of signal is gathered in one walk:
 *
 *   - `scented`, where the URL names a fragrance word. Precise, and preferred
 *     whenever it finds anything, because it wastes no page budget on socks.
 *   - `generic`, every URL found inside a sitemap whose *own name* says it
 *     lists products. The parent is the evidence here, which is far more
 *     reliable than guessing from a path full of ids.
 *
 * The generic set is only used when the scented set is empty. A shop that
 * names its aisles behaves exactly as before; a shop that does not now returns
 * candidates instead of silence, and the fragrance test in
 * scripts/build-demo-catalogue.ts is what finally decides what is a scent.
 *
 * ── Known limitation: a shop that names its aisles starves its products ─────
 * "Only used when the scented set is empty" is wholesale, and that is the
 * flaw. A retailer whose *category* URLs contain a fragrance word fills
 * `scented` with aisle signs, `generic` is then never consulted however many
 * real product URLs it holds, and the walk spends its entire page budget
 * fetching pages that were never going to carry a Product node.
 *
 * Measured on Debenhams, which files categories under
 * /categories/beauty-*-fragrance. Harvest probe run 9, job 96343533243:
 *
 *     Debenhams  741 urls  53 fetched  0 priced listings
 *     fetched but nothing priced, e.g.:
 *       https://www.debenhams.com/categories/beauty-sale-fragrance
 *       https://www.debenhams.com/categories/beauty-mens-fragrance
 *
 * Nothing was blocked: robots.txt permits, the sitemaps serve, 741 genuine
 * fragrance URLs came back. All 53 fetched were categories.
 *
 * The shape of the fix is to rank rather than choose — a URL whose parent
 * sitemap says it lists products is a better product candidate than one that
 * merely has a fragrance word in its path, and the generic set should be
 * appended after the scented one rather than discarded, since
 * `selectUrlsToFetch` only ever takes a budget's worth from the front.
 * Deliberately not done here: it changes which URLs all 29 enabled shops
 * fetch, and that is not a change to make without a full sweep to measure it
 * against. Recorded so the next person has the diagnosis rather than the
 * symptom.
 */

/**
 * True when `domain` already carries a subdomain in front of its
 * registrable name — `groceries.asda.com`, `uk.shopfrenchavenue.com` — as
 * opposed to a bare domain that merely sits under a two-label UK-style TLD
 * such as `.co.uk` (`notino.co.uk`, three raw labels, no subdomain). Not a
 * general public-suffix-list implementation — just enough of one to cover
 * the compound TLDs this registry's real domains actually use (see
 * src/config/retailers.ts) so the conventional sitemap root neither doubles
 * up `www.` nor prepends it onto a host that does not exist.
 */
const COMPOUND_TLDS = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'ac.uk', 'gov.uk',
  'uk.com', 'uk.net', 'uk.org',
]);
function hasExistingSubdomain(domain: string): boolean {
  const labels = domain.split('.');
  if (labels.length <= 2) return false;
  const lastTwo = labels.slice(-2).join('.');
  const bareLabelCount = COMPOUND_TLDS.has(lastTwo) ? 3 : 2;
  return labels.length > bareLabelCount;
}

/**
 * A response that is a captcha challenge, not the page asked for.
 *
 * ── The case this exists for ────────────────────────────────────────────────
 * Riiffs (uk.riiffsperfumes.com) priced 65 to 68 listings on every harvest
 * that reached it until 2026-09-14T04:56Z, and none since. Its harvest-report
 * line on most runs after that read
 *
 *     Riiffs Perfumes          0 urls    0 fetched    0 priced listings
 *
 * with no error at all, which is what a shop with an empty sitemap would
 * produce. It is not what happened. Asked once each on 2026-10-03, its
 * robots.txt answered 200 as plain text (and permits the sitemap and the
 * product pages), while /sitemap_index.xml and /product/gladius/ both
 * answered HTTP 202 with an `sg-captcha: challenge` header and a 186-byte
 * page whose only content is
 *
 *     <meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=...">
 *
 * SiteGround's bot challenge. A 202 is a 2xx, so the walk took it as a
 * successful sitemap, found no <loc> in it, and moved on with nothing to say.
 * (On other runs the same host answered 403 instead, which was reported.)
 *
 * Recognised by the challenge path in the body rather than by size or status,
 * because neither is specific: a small 2xx can be a real, short sitemap. When
 * it is seen the walk records the refusal and stops asking that shop for the
 * rest of the run. It never follows the challenge, never retries, and never
 * tries another address to get past it.
 */
const CAPTCHA_CHALLENGE = /\/\.well-known\/sgcaptcha\//i;

/** The refusal to record for a captcha answer, or null for an ordinary page. */
export function captchaRefusal(url: string, res: { status: number; body: string }): string | null {
  return CAPTCHA_CHALLENGE.test(res.body)
    ? `${url}: HTTP ${res.status}, a SiteGround captcha challenge instead of the page (refused, not empty)`
    : null;
}

const CAPTCHA_STOP = 'stopped early: the shop answered with a captcha';

/** See the product walk in crawlViaSitemap. */
const MAX_FAILURES_IN_A_ROW = 5;

/**
 * True when a request ended on a different page from the one asked for:
 * another path, not merely a trailing slash, case or query difference.
 */
export function redirectedAway(asked: string, finalUrl: string | undefined): boolean {
  if (!finalUrl) return false;
  try {
    const a = new URL(asked);
    const b = new URL(finalUrl);
    const norm = (u: URL) => `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '').toLowerCase()}`;
    return norm(a) !== norm(b);
  } catch {
    return false;
  }
}

/**
 * The headers every request on a pinned route carries: the crawler's own name
 * and contact page, never a browser's. Kept here rather than imported from
 * attempt.ts so this module's identity on a pinned route cannot drift with a
 * caller's choice of headers.
 */
export const ROUTE_HEADERS: Record<string, string> = {
  'user-agent': 'PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about)',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
};

/** Upper bound on a pinned route's sitemap fetches, whatever the entry asks. */
const MAX_ROUTE_SITEMAPS = 60;

/** A pinned route's product URLs are kept up to this many. */
const MAX_ROUTE_URLS = 20000;

/** XML-escaped `<loc>` text, unescaped: `&amp;` in a sitemap is `&` in the URL. */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Discovery along a route pinned in the registry (`Retailer.sitemapRoute`).
 *
 * Starts from the named roots only, opens only the child sitemaps `follow`
 * allows, keeps only the page URLs `product` matches and `exclude` does not,
 * and checks robots.txt before every request. Requests are spaced by `gapMs`
 * here too, so a shop's crawl delay holds for its sitemaps as well as its
 * products. Product URLs naming a perfume come first, then the rest, in the
 * order the shop listed them.
 */
async function discoverViaRoute(
  options: SitemapCrawlOptions,
  deadlineAt: number,
  sleep: (ms: number) => Promise<void>,
): Promise<{ urls: string[]; errors: string[] }> {
  const route = options.retailer.sitemapRoute!;
  const { http, robots, onProgress, gapMs } = options;
  const follow = route.follow ? new RegExp(route.follow, 'i') : null;
  const product = new RegExp(route.product, 'i');
  const exclude = route.exclude ? new RegExp(route.exclude, 'i') : null;
  const budget = Math.min(route.maxSitemaps ?? 12, MAX_ROUTE_SITEMAPS);

  const queue = [...route.roots];
  const seen = new Set<string>();
  const found: string[] = [];
  const kept = new Set<string>();
  const errors: string[] = [];
  let fetched = 0;

  while (queue.length > 0 && fetched < budget && kept.size < MAX_ROUTE_URLS && Date.now() < deadlineAt) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!isAllowed(robots, url)) {
      errors.push(`${url}: not asked, robots.txt does not permit it`);
      continue;
    }

    if (fetched > 0 && gapMs > 0) await sleep(gapMs);
    const res = await http(url, ROUTE_HEADERS);
    fetched++;
    onProgress?.(fetched, kept.size);
    if (!res.ok) {
      errors.push(`${url}: HTTP ${res.status}`);
      if (res.status === 403 || res.status === 429) {
        errors.push('stopped early: the shop began refusing requests');
        break;
      }
      continue;
    }
    const captcha = captchaRefusal(url, res);
    if (captcha) {
      errors.push(captcha, CAPTCHA_STOP);
      break;
    }

    for (const raw of locs(res.body)) {
      const loc = unescapeXml(raw);
      if (isXml(loc)) {
        if (!follow || follow.test(loc)) queue.push(loc);
      } else if (product.test(loc) && !(exclude && exclude.test(loc)) && !kept.has(loc)) {
        kept.add(loc);
        found.push(loc);
      }
    }
  }

  const named = found.filter((u) => PERFUME_WORD.test(pathOf(u)));
  const rest = found.filter((u) => !PERFUME_WORD.test(pathOf(u)));
  return { urls: [...named, ...rest], errors };
}

/**
 * A listing's address with any query string the page added dropped, when it
 * is the page itself.
 *
 * Marks and Spencer's own JSON-LD sometimes carries the address a visitor
 * arrived by rather than the product's: on 2026-10-03 hbp22184550's read
 * "?extid=af_Sub+Networks_Skimlinks...&awc=1402_..." (another publisher's
 * affiliate click) and hbp60453037's a Google Ads "gclid". Stored as is,
 * our Buy link would carry someone else's tracking. Where the listing's path
 * is the path of the sitemap URL we fetched and that URL has no query of its
 * own, the clean sitemap URL is used instead, keeping any #fragment (a size
 * on Parfumdreams). Anything else is left exactly as the page gave it.
 */
export function cleanListingUrl(listingUrl: string, pageUrl: string): string {
  try {
    const l = new URL(listingUrl);
    const p = new URL(pageUrl);
    if (!l.search || p.search || l.host !== p.host || l.pathname !== p.pathname) return listingUrl;
    return `${p.origin}${p.pathname}${l.hash}`;
  } catch {
    return listingUrl;
  }
}

/** Plain text of a fragment of HTML, entities decoded, whitespace collapsed. */
function textOf(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&pound;/gi, '£')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A listing's title with the route's `titleParts` read off its own page and
 * appended, each only where the title does not already carry it.
 */
export function withTitleParts(title: string, html: string, parts: readonly string[]): string {
  let out = title;
  for (const source of parts) {
    const m = new RegExp(source, 'i').exec(html);
    const text = m?.[1] ? textOf(m[1]).replace(/[|,;:]+$/, '').trim() : '';
    if (text && !out.toLowerCase().includes(text.toLowerCase())) out = `${out} ${text}`;
  }
  return out;
}

async function discover(
  options: SitemapCrawlOptions,
  budget: number,
  deadlineAt: number,
): Promise<{ urls: string[]; errors: string[]; complete: boolean }> {
  const { retailer, http, robots, headers, onProgress } = options;

  // See `requiredUrlPrefix`'s own doc comment in src/types/retailer.ts for why
  // this exists: a shop whose currency depends on which address you ask must
  // never have its sitemap walk seeded from, or allowed to wander onto, an
  // address outside the one confirmed sterling.
  const requiredPrefix = retailer.catalogue?.requiredUrlPrefix ?? null;
  const underPrefix = (url: string) => !requiredPrefix || pathOf(url).startsWith(requiredPrefix);

  // A shop's declared sitemap can be unreachable while the conventional path
  // serves fine — John Lewis's robots.txt points at a siteindex.xml that times
  // out — so the standard location is always kept as a fallback root rather
  // than being skipped the moment robots.txt names something else. When a
  // prefix is pinned, that conventional root is scoped to it too, and
  // robots.txt's own sitemaps are only trusted where they already agree — an
  // unscoped root is never a fallback for a pinned shop, because falling back
  // to it is exactly the currency mistake the pin exists to prevent.
  // `retailer.domain` is sometimes already a subdomain (`groceries.asda.com`,
  // `groceries.morrisons.com`, `uk.shopfrenchavenue.com` — see
  // src/config/retailers.ts) rather than a bare registrable domain.
  // Unconditionally prepending `www.` turned those into a host that does not
  // exist (`www.groceries.asda.com` — HTTP 0/403, see this entry's own
  // comment in retailers.ts around line 5028, and today's real Morrisons
  // probe log showing the identical `www.groceries.morrisons.com` 403).
  // scripts/currency-probe.ts avoids this by stripping any leading `www.`
  // rather than adding one; `hasExistingSubdomain` below extends that same
  // idea to hosts whose subdomain isn't literally `www.` — so a bare domain
  // still gets `www.` added (unchanged from before) but an already-
  // subdomained one is left alone rather than getting a second label glued
  // on front.
  const bareDomain = retailer.domain.replace(/^www\./, '');
  const host = hasExistingSubdomain(bareDomain) ? bareDomain : `www.${bareDomain}`;
  const conventional = requiredPrefix
    ? `https://${host}${requiredPrefix}/sitemap.xml`
    : `https://${host}/sitemap.xml`;
  const roots = (robots.sitemaps.length ? [...robots.sitemaps.slice(0, 5)] : []).filter(underPrefix);
  if (!roots.includes(conventional)) roots.unshift(conventional);

  const seen = new Set<string>();
  const scented = new Set<string>();
  // The scented URLs a product sitemap listed: those are product pages, where
  // a scented URL from anywhere else may be an aisle (see below).
  const scentedProducts = new Set<string>();
  const generic = new Set<string>();
  const errors: string[] = [];

  // Each entry carries whether its parent index said it lists products, so a
  // child's contents can be trusted without re-deriving that from every URL.
  const queue: { url: string; isProductSitemap: boolean }[] = roots.map((url) => ({
    url,
    isProductSitemap: PRODUCT_SITEMAP.test(pathOf(url)),
  }));
  let fetched = 0;
  let failedSitemaps = 0;

  while (queue.length > 0 && fetched < budget && scented.size < MAX_DISCOVERED_URLS && Date.now() < deadlineAt) {
    const { url, isProductSitemap } = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    if (!isAllowed(robots, url)) continue;

    const res = await http(url, headers);
    fetched++;
    onProgress?.(fetched, scented.size + generic.size);
    if (!res.ok) {
      errors.push(`${url}: HTTP ${res.status}`);
      // A root answering 404 or 410 does not exist (the conventional
      // /sitemap.xml is always tried, even when robots.txt names another);
      // anything else, or a child an index listed, is a part of the shop's
      // list this walk did not read.
      if (!(roots.includes(url) && (res.status === 404 || res.status === 410))) failedSitemaps++;
      continue;
    }
    const captcha = captchaRefusal(url, res);
    if (captcha) {
      errors.push(captcha, CAPTCHA_STOP);
      break;
    }

    for (const found of locs(res.body)) {
      if (!underPrefix(found)) continue;
      const path = pathOf(found);
      if (isXml(found)) {
        const worthDescending = SCENT.test(path) || PRODUCT_SITEMAP.test(path);
        // A fragrance-named index is explored before a merely product-named
        // one, so a tight budget is spent on the aisle we actually want.
        if (SCENT.test(path)) {
          queue.unshift({ url: found, isProductSitemap: true });
        } else if (worthDescending) {
          queue.push({ url: found, isProductSitemap: true });
        }
      } else if (SCENT.test(path)) {
        scented.add(found);
        if (isProductSitemap) scentedProducts.add(found);
      } else if (isProductSitemap && generic.size < MAX_DISCOVERED_URLS) {
        generic.add(found);
      }
    }
  }

  // Ranked, not chosen between (2026-10-03): scented URLs a product sitemap
  // listed come first, then the other scented ones, so a shop that names its
  // aisles after fragrance (Debenhams: /categories/beauty-mens-fragrance)
  // spends its budget on product pages, not category pages. Every URL kept
  // before is still kept; only the order changes, and only where a product
  // sitemap was found, so a shop with no product sitemap fetches exactly as
  // it did.
  //
  // Within the product sitemap URLs, the ones that name a perfume come first
  // (PERFUME_WORD), then the ones that only name a smell. Again an order, not
  // a filter: nothing kept before is dropped.
  // ── Whether this is the shop's whole list, 2026-10-04 ─────────────────────
  // fetchedEveryDiscovered (below) tells reconcile() that a stored listing
  // missing from this walk is off sale, and it only asked whether every URL
  // *discovered* was fetched. A sitemap that failed this run (a 403 or 503
  // on one child of an index, a timeout), or a walk that ran out of budget,
  // time or room with sitemaps still queued, discovers part of the shop,
  // and fetching every URL of a part read as the whole: every listing in the
  // missing sitemaps would have been delisted at once, the shape of the mass
  // delisting scripts/repair-mass-delist.ts was written to undo. Such a walk
  // is no longer complete. Listings still leave the site on the shop's own
  // word (a 404, 410 or redirect when their page is re-read) and by age.
  const complete =
    failedSitemaps === 0 &&
    queue.length === 0 &&
    !(scented.size === 0 && generic.size >= MAX_DISCOVERED_URLS) &&
    scented.size < MAX_DISCOVERED_URLS;
  if (scented.size > 0) {
    const products = [...scentedProducts];
    const named = products.filter((u) => PERFUME_WORD.test(pathOf(u)));
    const smellOnly = products.filter((u) => !PERFUME_WORD.test(pathOf(u)));
    return { urls: [...named, ...smellOnly, ...[...scented].filter((u) => !scentedProducts.has(u))], errors, complete };
  }
  return { urls: [...generic], errors, complete };
}

/**
 * Choose which of the discovered URLs this run can afford to fetch.
 *
 * Most of the budget goes to products we have never fetched, because that is
 * the only thing that grows the catalogue. The rest re-fetches the listings
 * whose prices are oldest, so nothing sits at a price we recorded weeks ago and
 * still present as current. Where a shop has no unseen URLs left the whole
 * budget becomes a refresh, and on a shop's first ever run there is nothing to
 * refresh so all of it goes to discovery.
 */
export function selectUrlsToFetch(
  urls: readonly string[],
  maxPages: number,
  knownUrls: ReadonlyMap<string, string> = new Map(),
  refreshShare = 0.3,
  discoveryOffset = 0,
): string[] {
  // ── Discovery rotates ─────────────────────────────────────────────────────
  // A URL that yields no priced listing never becomes known, so without an
  // offset the same head of the unseen list was asked every run and the rest
  // never was. allbeauty listed 2,777 sitemap URLs and holds 117 priced; on
  // both scheduled runs of 2026-10-02 its 42 discovery fetches priced nothing,
  // and by construction they were the same first 42 unseen URLs each time.
  // The caller advances the offset by what each run fetched.
  const unseenInOrder = urls.filter((u) => !knownUrls.has(u));
  const start = unseenInOrder.length > 0 ? Math.max(0, Math.floor(discoveryOffset)) % unseenInOrder.length : 0;
  const unseen = [...unseenInOrder.slice(start), ...unseenInOrder.slice(0, start)];
  const seen = urls
    .filter((u) => knownUrls.has(u))
    // Oldest fetch first: those are the prices most at risk of being wrong.
    .sort((a, b) => (knownUrls.get(a) ?? '').localeCompare(knownUrls.get(b) ?? ''));

  const refreshBudget = Math.min(seen.length, Math.floor(maxPages * refreshShare));
  const discoverBudget = maxPages - refreshBudget;

  const picked = [...unseen.slice(0, discoverBudget), ...seen.slice(0, refreshBudget)];

  // Spend any budget the unseen list was too short to use on further refreshes
  // rather than returning under budget.
  if (picked.length < maxPages) {
    for (const url of seen.slice(refreshBudget)) {
      if (picked.length >= maxPages) break;
      picked.push(url);
    }
  }
  return picked;
}

export async function crawlViaSitemap(
  options: SitemapCrawlOptions,
): Promise<SitemapCrawlResult> {
  const { http, robots, maxPages, gapMs } = options;
  const route = options.retailer.sitemapRoute ?? null;
  // A pinned route always identifies itself honestly, whatever the caller
  // passed: see SitemapRoute's own doc comment.
  const headers = route ? ROUTE_HEADERS : options.headers;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const deadlineAt = Date.now() + (options.maxDurationMs ?? DEFAULT_CRAWL_MS);

  // A dozen sitemap fetches is plenty to find the fragrance aisle.
  const discovered: { urls: string[]; errors: string[]; complete?: boolean } = route
    ? await discoverViaRoute(options, deadlineAt, sleep)
    : await discover(options, 12, deadlineAt);
  const { urls, errors } = discovered;
  // A route (a shop's own product API) reports no completeness of its own and
  // keeps the old meaning; see `complete` in discover() for the sitemap walk.
  const discoveryComplete = discovered.complete ?? true;
  // The walk's last sitemap fetch and its first product fetch are a pair too.
  if (route && gapMs > 0 && urls.length > 0) await sleep(gapMs);

  const listings: RawListing[] = [];
  const sampledUrls: string[] = [];
  const goneUrls: string[] = [];
  const movedUrls: string[] = [];
  let pagesFetched = 0;
  let discoveryFetched = 0;
  let cutShort = false;

  // Due refreshes first, then whatever the budget picks from the rest. A URL
  // is never asked twice in one walk.
  // Without the #fragment: several sizes read off one page (Parfumdreams'
  // index_13043.aspx#variation=222365, #variation=222363 ...) are stored with
  // their own fragment, and the page answers for all of them in one request.
  const refreshUrls = [...new Set((options.refreshUrls ?? []).map((u) => u.split('#')[0]!))];
  const refreshSet = new Set(refreshUrls);
  const known = options.knownUrls ?? new Map<string, string>();
  const budgeted = selectUrlsToFetch(
    urls.filter((u) => !refreshSet.has(u)),
    maxPages,
    known,
    options.refreshShare,
    options.discoveryOffset ?? 0,
  );

  // A shop that answered discovery with a captcha is not asked again this run.
  const captchaAtDiscovery = errors.includes(CAPTCHA_STOP);
  // Nor is one that refused every sitemap outright (403, 429 or 503) and so
  // yielded nothing to discover: its stored pages are not re-asked either.
  // Before due listings were re-read this never came up, because a shop with
  // no discovered URLs had nothing to fetch; re-asking a shop that has just
  // refused us, page after page, is exactly what this crawler must not do.
  const refusedAtDiscovery =
    urls.length === 0 && errors.some((e) => /: HTTP (403|429|503)$/.test(e));
  if (refusedAtDiscovery && refreshUrls.length > 0) {
    errors.push(`not re-reading ${refreshUrls.length} stored page(s): the shop refused its sitemap`);
  }
  let picked = captchaAtDiscovery || refusedAtDiscovery ? [] : [...refreshUrls, ...budgeted];

  // A product API is a host of its own, with a robots.txt of its own, read
  // before it is asked anything. A server error there means nothing is asked.
  const apiReader = route?.pageReader === 'beauty-bay-api';
  let apiRobots: RobotsRules | null = null;
  if (apiReader && picked.length > 0) {
    const res = await http(`${BEAUTY_BAY_API}/robots.txt`, ROUTE_HEADERS);
    apiRobots = resolveRobotsReadings([readRobotsResponse(res)]);
    if (apiRobots.unavailable) {
      errors.push(`${BEAUTY_BAY_API}/robots.txt: HTTP ${res.status}, so the product API is not asked`);
      picked = [];
    } else if (gapMs > 0) {
      await sleep(gapMs);
    }
  }
  const productsRead = new Set<string>();
  const pickedSet = new Set(picked);

  // Consecutive failed pages of any kind (an error status or no answer).
  // Five in a row is a shop that is not answering, and asking on through a
  // list of hundreds would only add load to it and time to the run.
  let failedInARow = 0;
  for (let i = 0; i < picked.length; i++) {
    const url = picked[i]!;
    if (Date.now() >= deadlineAt) {
      errors.push(`stopped early: exceeded this shop's time budget`);
      cutShort = true;
      break;
    }
    if (failedInARow >= MAX_FAILURES_IN_A_ROW) {
      errors.push(`stopped early: ${failedInARow} pages in a row failed`);
      cutShort = true;
      break;
    }
    if (!isAllowed(robots, url)) continue;

    // Through the product API: one request per product answers every size,
    // so a second size of a product already read this run is skipped.
    let fetchUrl = url;
    if (apiReader) {
      const parts = beautyBayParts(url);
      const api = beautyBayApiUrl(url);
      if (!parts || !api || productsRead.has(`${parts.brand}/${parts.product}`)) continue;
      if (!isAllowed(apiRobots!, api)) continue;
      productsRead.add(`${parts.brand}/${parts.product}`);
      fetchUrl = api;
    }

    if (sampledUrls.length < SAMPLE_LIMIT) sampledUrls.push(url);
    const res = await http(fetchUrl, apiReader ? { ...headers, accept: 'application/json' } : headers);
    pagesFetched++;
    if (!refreshSet.has(url) && !known.has(url)) discoveryFetched++;
    options.onProgress?.(pagesFetched, listings.length);

    if (!res.ok && res.status !== 404 && res.status !== 410) failedInARow++;
    else failedInARow = 0;
    if (!res.ok) {
      errors.push(`${url}: HTTP ${res.status}`);
      // The shop's own answer that this product page no longer exists. Only
      // these two statuses: a 5xx or a timeout says nothing about the product.
      if (res.status === 404 || res.status === 410) goneUrls.push(url);
      // A shop that starts refusing mid walk is telling us to stop.
      if (res.status === 403 || res.status === 429) {
        errors.push('stopped early: the shop began refusing requests');
        cutShort = true;
        break;
      }
      continue;
    }
    const captcha = captchaRefusal(url, res);
    if (captcha) {
      errors.push(captcha, CAPTCHA_STOP);
      cutShort = true;
      break;
    }

    const found = apiReader ? parseBeautyBayProduct(res.body, url) : parseListings(res.body, {
      sectionId: 'sitemap',
      pageUrl: url,
      ...(route ? { microdata: true, requireGbp: route.requireGbp === true } : {}),
    });
    if (route) {
      for (let k = 0; k < found.length; k++) found[k] = { ...found[k]!, url: cleanListingUrl(found[k]!.url, url) };
    }
    if (route?.titleParts?.length && found.length === 1) {
      found[0] = { ...found[0]!, rawTitle: withTitleParts(found[0]!.rawTitle, res.body, route.titleParts) };
    }
    listings.push(...found);
    // A stored product page that now redirects to a different page is gone at
    // that address in the same sense a 404 is: Perfumeo answers its renamed
    // products this way (/products/hulmi-brandy-designs-perfumes/ to
    // /products/hulmi-by-brandy-prestige-100ml-extrait-de-parfum/,
    // 2026-10-03), and a withdrawn product often lands on a category. The
    // caller delists only stored rows whose SKU this run did not find, so a
    // product that merely moved keeps its row under the new address.
    // Judged on the address actually asked: a product API answers from its own host.
    if (known.has(url) && redirectedAway(fetchUrl, res.finalUrl)) movedUrls.push(url);

    // Spacing exists to keep every *pair* of requests to this shop apart —
    // there is no next request after the last URL in the list, so waiting
    // here only delays this shop's own finish (and, via recordAttempt's
    // "before the shop is asked" timestamp in scripts/catalogue-harvest.ts,
    // pushes every shop behind it in the sweep back by the same amount). Over
    // a 36-shop run at the registry's default 1500ms gap that is up to 54
    // wasted seconds a run, paid on every single sweep, for a wait nothing is
    // behind. `i < picked.length - 1` is the same politeness gap for the
    // pairs that still need it and none of the delay for the pair that
    // doesn't.
    if (gapMs > 0 && i < picked.length - 1) await sleep(gapMs);
  }

  const fetchedEveryDiscovered =
    !captchaAtDiscovery && discoveryComplete && !cutShort && urls.every((u) => pickedSet.has(u));

  return {
    listings, pagesFetched, urlsDiscovered: urls.length, errors, sampledUrls,
    goneUrls, movedUrls, discoveryFetched, fetchedEveryDiscovered,
  };
}

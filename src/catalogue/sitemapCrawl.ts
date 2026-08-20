import type { Retailer } from '../types/retailer.js';
import type { RawListing } from './types.js';
import type { Http } from './attempt.js';
import { parseListings } from './jsonld.js';
import { isAllowed, type RobotsRules } from './robots.js';

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
}

/** How many fetched URLs a result carries back for diagnosis. */
const SAMPLE_LIMIT = 5;

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

/** Names that suggest a sitemap or URL is about fragrance rather than socks. */
const SCENT = /fragrance|perfume|aftershave|cologne|eau-de|parfum|scent/i;

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
async function discover(
  options: SitemapCrawlOptions,
  budget: number,
  deadlineAt: number,
): Promise<{ urls: string[]; errors: string[] }> {
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
  const conventional = requiredPrefix
    ? `https://www.${retailer.domain}${requiredPrefix}/sitemap.xml`
    : `https://www.${retailer.domain}/sitemap.xml`;
  const roots = (robots.sitemaps.length ? [...robots.sitemaps.slice(0, 5)] : []).filter(underPrefix);
  if (!roots.includes(conventional)) roots.unshift(conventional);

  const seen = new Set<string>();
  const scented = new Set<string>();
  const generic = new Set<string>();
  const errors: string[] = [];

  // Each entry carries whether its parent index said it lists products, so a
  // child's contents can be trusted without re-deriving that from every URL.
  const queue: { url: string; isProductSitemap: boolean }[] = roots.map((url) => ({
    url,
    isProductSitemap: PRODUCT_SITEMAP.test(pathOf(url)),
  }));
  let fetched = 0;

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
      continue;
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
      } else if (isProductSitemap && generic.size < MAX_DISCOVERED_URLS) {
        generic.add(found);
      }
    }
  }

  return { urls: scented.size > 0 ? [...scented] : [...generic], errors };
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
): string[] {
  const unseen = urls.filter((u) => !knownUrls.has(u));
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
  const { http, robots, headers, maxPages, gapMs } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  // Default of 8 minutes: generous for a healthy shop, well short of the CI
  // job's 45-minute total and short enough that one slow shop cannot eat the
  // whole run even with progress logging keeping the job itself alive.
  const deadlineAt = Date.now() + (options.maxDurationMs ?? 8 * 60_000);

  // A dozen sitemap fetches is plenty to find the fragrance aisle.
  const { urls, errors } = await discover(options, 12, deadlineAt);

  const listings: RawListing[] = [];
  const sampledUrls: string[] = [];
  let pagesFetched = 0;

  for (const url of selectUrlsToFetch(urls, maxPages, options.knownUrls, options.refreshShare)) {
    if (Date.now() >= deadlineAt) {
      errors.push(`stopped early: exceeded this shop's time budget`);
      break;
    }
    if (!isAllowed(robots, url)) continue;

    if (sampledUrls.length < SAMPLE_LIMIT) sampledUrls.push(url);
    const res = await http(url, headers);
    pagesFetched++;
    options.onProgress?.(pagesFetched, listings.length);

    if (!res.ok) {
      errors.push(`${url}: HTTP ${res.status}`);
      // A shop that starts refusing mid walk is telling us to stop.
      if (res.status === 403 || res.status === 429) {
        errors.push('stopped early: the shop began refusing requests');
        break;
      }
      continue;
    }

    const found = parseListings(res.body, { sectionId: 'sitemap', pageUrl: url });
    listings.push(...found);

    if (gapMs > 0) await sleep(gapMs);
  }

  return { listings, pagesFetched, urlsDiscovered: urls.length, errors, sampledUrls };
}

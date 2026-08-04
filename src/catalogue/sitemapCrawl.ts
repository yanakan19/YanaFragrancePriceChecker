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
  onProgress?: (fetched: number, found: number) => void;
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
}

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
 * Walk sitemaps breadth first, collecting product URLs that look like fragrance.
 *
 * Nested indexes are followed only where the name suggests fragrance or
 * products, because downloading an entire retailer's sitemap tree to find the
 * perfume aisle is rude and slow.
 */
async function discover(
  options: SitemapCrawlOptions,
  budget: number,
): Promise<{ urls: string[]; errors: string[] }> {
  const { retailer, http, robots, headers } = options;
  const roots = robots.sitemaps.length
    ? robots.sitemaps
    : [`https://www.${retailer.domain}/sitemap.xml`];

  const seen = new Set<string>();
  const products = new Set<string>();
  const errors: string[] = [];
  const queue = [...roots.slice(0, 5)];
  let fetched = 0;

  while (queue.length > 0 && fetched < budget && products.size < MAX_DISCOVERED_URLS) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    if (!isAllowed(robots, url)) continue;

    const res = await http(url, headers);
    fetched++;
    if (!res.ok) {
      errors.push(`${url}: HTTP ${res.status}`);
      continue;
    }

    for (const found of locs(res.body)) {
      if (isXml(found)) {
        // Only descend where the name suggests it is worth it.
        if (SCENT.test(found) || /product|item/i.test(found)) queue.push(found);
      } else if (SCENT.test(found)) {
        products.add(found);
      }
    }
  }

  return { urls: [...products], errors };
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

  // A dozen sitemap fetches is plenty to find the fragrance aisle.
  const { urls, errors } = await discover(options, 12);

  const listings: RawListing[] = [];
  let pagesFetched = 0;

  for (const url of selectUrlsToFetch(urls, maxPages, options.knownUrls, options.refreshShare)) {
    if (!isAllowed(robots, url)) continue;

    const res = await http(url, headers);
    pagesFetched++;

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
    options.onProgress?.(pagesFetched, listings.length);

    if (gapMs > 0) await sleep(gapMs);
  }

  return { listings, pagesFetched, urlsDiscovered: urls.length, errors };
}

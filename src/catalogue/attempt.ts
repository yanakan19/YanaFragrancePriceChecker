import type { Retailer } from '../types/retailer.js';
import type { RawListing } from './types.js';
import type { AttemptResult, StrategyId } from './strategy.js';
import { parseListings } from './jsonld.js';
import {
  isAllowed, parseRobots, UNREACHABLE_ROBOTS, NO_RESTRICTIONS, type RobotsRules,
} from './robots.js';

/**
 * Runs one retrieval strategy against one shop and reports what happened.
 *
 * Every strategy returns real listings or nothing. There is no path here that
 * fabricates a price, and there must never be one: an invented figure on a
 * price comparison site is worse than an empty page, because the empty page is
 * honest about knowing nothing.
 */

export interface HttpResponse {
  status: number;
  body: string;
  ok: boolean;
  error?: string;
  /**
   * Where the request actually ended up, after any redirects were followed.
   *
   * Absent when the request never completed (a DNS failure or timeout has no
   * final URL to report). Every caller that only wants the body can keep
   * ignoring this; it exists because scripts/brand-site-probe.ts's whole
   * question is *where a link lands*, not what it says. A brand URL that
   * quietly 301s to a different market's storefront returns HTTP 200 with
   * perfectly ordinary content, so the status code alone cannot tell that
   * case from a healthy one — only the address it settled on can.
   */
  finalUrl?: string;
}

export type Http = (url: string, headers: Record<string, string>) => Promise<HttpResponse>;

/** Identifies us honestly and points at a page explaining what we are. */
const BOT_UA = 'PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.example/bot)';

/**
 * A current desktop browser string.
 *
 * This is presenting as an ordinary visitor rather than impersonating a
 * specific person, which is how a shop's own site expects to be read. It is not
 * an attempt to defeat a challenge: where a shop actively refuses us we take
 * that as an answer and go to the feed instead.
 */
const BROWSER_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
};

const BOT_HEADERS: Record<string, string> = {
  'user-agent': BOT_UA,
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'en-GB,en;q=0.9',
};

export interface AttemptContext {
  retailer: Retailer;
  http: Http;
  robots: RobotsRules;
  /** A product name used to exercise the shop's own search. */
  sampleQuery: string;
  /**
   * A separate, metered Http for `proxied-fetch` only. Kept apart from the
   * ordinary `http` above so free strategies never accidentally spend proxy
   * budget, and so a caller with no Apify credentials configured can omit it
   * entirely and still run every free strategy normally.
   */
  proxiedHttp?: Http;
  /**
   * Renders one or more URLs through a real headless browser (an Apify
   * actor) and hands back what it painted, for `browser-render` only. A
   * batch function rather than an `Http`, deliberately: one actor run per
   * shop amortises the browser-startup cost across that shop's sections
   * instead of paying it once per page — see apifyActor.ts's own header.
   * Kept apart from `http` and `proxiedHttp` for the same reason those are
   * kept apart from each other: a caller with no APIFY_TOKEN configured can
   * omit this entirely and every other strategy runs exactly as before.
   */
  actorRender?: (urls: string[]) => Promise<Map<string, HttpResponse>>;
}

export interface Attempt {
  result: AttemptResult;
  listings: RawListing[];
  /** Anything learned that is worth writing down, such as a working URL. */
  discovered?: { sectionUrls?: string[] };
}

/** Fetch robots.txt once per shop, so every later decision can respect it. */
export async function loadRobots(retailer: Retailer, http: Http): Promise<RobotsRules> {
  try {
    const res = await http(`https://www.${retailer.domain}/robots.txt`, BOT_HEADERS);

    if (res.ok && res.body) return parseRobots(res.body, 'pricesniffsbot');

    // 4xx means no file, or the bot wall answered instead of the file. Either
    // way the shop has published no restrictions, so we are not forbidden.
    // 5xx and network failures mean hold off until it recovers.
    if (res.status >= 400 && res.status < 500) return NO_RESTRICTIONS;
    return UNREACHABLE_ROBOTS;
  } catch {
    return UNREACHABLE_ROBOTS;
  }
}

async function fetchAndParse(
  ctx: AttemptContext,
  url: string,
  headers: Record<string, string>,
  sectionId: string,
): Promise<Attempt> {
  if (!isAllowed(ctx.robots, url)) {
    return {
      result: {
        ok: false,
        status: null,
        listings: 0,
        error: ctx.robots.unavailable
          ? 'robots.txt unreachable, holding off until the server recovers'
          : 'disallowed by robots.txt',
        // Only an actual Disallow rule is permanent. A server that was briefly
        // unwell must not disable a shop forever.
        ...(ctx.robots.unavailable ? {} : { ruleOut: 'robots.txt disallows this path' }),
      },
      listings: [],
    };
  }

  const res = await ctx.http(url, headers);
  if (!res.ok) {
    return {
      result: { ok: false, status: res.status, listings: 0, error: res.error ?? `HTTP ${res.status}` },
      listings: [],
    };
  }

  const listings = parseListings(res.body, { sectionId, pageUrl: url });
  return {
    result: { ok: true, status: res.status, listings: listings.length },
    listings,
    ...(listings.length > 0 ? { discovered: { sectionUrls: [url] } } : {}),
  };
}

/** Pull sitemap URLs out of a sitemap or sitemap index. */
function sitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!).filter(Boolean);
}

/**
 * Find the fragrance section by reading the sitemap the shop publishes.
 *
 * This is the sanctioned route. A sitemap exists precisely so crawlers do not
 * have to guess paths, and using it means we stop inventing URLs, which is what
 * produced the two 404s in the first place.
 */
async function viaSitemap(ctx: AttemptContext): Promise<Attempt> {
  // See `requiredUrlPrefix`'s own doc comment in src/types/retailer.ts, and
  // the matching guard in src/catalogue/sitemapCrawl.ts's `discover()`. This
  // is a diagnostic path (it writes nothing), but it still fetches real pages
  // and prints what it finds — a probe result that quietly wandered off the
  // one confirmed-sterling address for a pinned shop would read as "the
  // sitemap route works" while actually having tested nothing about the
  // address that matters.
  const requiredPrefix = ctx.retailer.catalogue?.requiredUrlPrefix ?? null;
  const underPrefix = (url: string) => {
    if (!requiredPrefix) return true;
    try {
      return new URL(url).pathname.startsWith(requiredPrefix);
    } catch {
      return false;
    }
  };

  const conventional = requiredPrefix
    ? `https://www.${ctx.retailer.domain}${requiredPrefix}/sitemap.xml`
    : `https://www.${ctx.retailer.domain}/sitemap.xml`;
  const roots = (ctx.robots.sitemaps.length ? ctx.robots.sitemaps : []).filter(underPrefix);
  if (!roots.includes(conventional)) roots.unshift(conventional);

  const candidates: string[] = [];

  for (const root of roots.slice(0, 3)) {
    if (!isAllowed(ctx.robots, root)) continue;
    const res = await ctx.http(root, BOT_HEADERS);
    if (!res.ok) continue;

    const found = sitemapUrls(res.body).filter(underPrefix);

    // A sitemap index points at more sitemaps. Follow only the ones whose name
    // suggests fragrance or product, rather than downloading the whole site.
    const nested = found.filter((u) => /\.xml/i.test(u));
    const direct = found.filter((u) => /fragrance|perfume|aftershave|cologne/i.test(u));
    candidates.push(...direct);

    for (const child of nested.filter((u) => /fragrance|perfume|product/i.test(u)).slice(0, 2)) {
      if (!isAllowed(ctx.robots, child)) continue;
      const sub = await ctx.http(child, BOT_HEADERS);
      if (sub.ok) candidates.push(...sitemapUrls(sub.body).filter(underPrefix).slice(0, 40));
    }
  }

  if (candidates.length === 0) {
    return {
      result: { ok: false, status: null, listings: 0, error: 'no fragrance URLs found in sitemap' },
      listings: [],
    };
  }

  // Sample a few rather than walking thousands, since this is discovery.
  const listings: RawListing[] = [];
  const worked: string[] = [];
  for (const url of candidates.slice(0, 5)) {
    const a = await fetchAndParse(ctx, url, BROWSER_HEADERS, 'sitemap');
    if (a.listings.length > 0) {
      listings.push(...a.listings);
      worked.push(url);
    }
  }

  return {
    result: { ok: listings.length > 0, status: 200, listings: listings.length },
    listings,
    ...(worked.length ? { discovered: { sectionUrls: worked } } : {}),
  };
}

/** Run a single strategy. */
export async function runStrategy(id: StrategyId, ctx: AttemptContext): Promise<Attempt> {
  const cat = ctx.retailer.catalogue;
  const section = cat?.sections[0];

  switch (id) {
    case 'section-plain':
      if (!section) return notConfigured();
      return fetchAndParse(
        ctx,
        section.urlTemplate.replace('{page}', String(cat!.firstPage)),
        BOT_HEADERS,
        section.id,
      );

    case 'section-browser-headers':
      if (!section) return notConfigured();
      return fetchAndParse(
        ctx,
        section.urlTemplate.replace('{page}', String(cat!.firstPage)),
        BROWSER_HEADERS,
        section.id,
      );

    case 'sitemap-discovery':
      return viaSitemap(ctx);

    case 'search-page': {
      if (!cat) return notConfigured();
      const url = cat.searchUrlTemplate.replace('{q}', encodeURIComponent(ctx.sampleQuery));
      return fetchAndParse(ctx, url, BROWSER_HEADERS, 'search');
    }

    case 'homepage-probe':
      // Not for listings. This answers "does this shop use JSON-LD at all",
      // which decides whether the parser is even the right tool here.
      return fetchAndParse(ctx, `https://www.${ctx.retailer.domain}/`, BROWSER_HEADERS, 'homepage');

    case 'proxied-fetch': {
      if (!ctx.proxiedHttp) {
        return {
          result: {
            ok: false,
            status: null,
            listings: 0,
            error: 'no proxy configured; set APIFY_PROXY_PASSWORD to enable',
          },
          listings: [],
        };
      }
      if (!section) return notConfigured();

      // The proxy is metered, so this still goes through robots and still
      // fetches only the category listing page, never one request per
      // product. Paying for retrieval does not relax any of the other rules.
      const proxiedCtx: AttemptContext = { ...ctx, http: ctx.proxiedHttp };
      return fetchAndParse(
        proxiedCtx,
        section.urlTemplate.replace('{page}', String(cat!.firstPage)),
        BROWSER_HEADERS,
        section.id,
      );
    }

    case 'browser-render':
      return viaBrowserRender(ctx);
  }
}

/**
 * Render every configured section's first page through a real browser and
 * parse whatever it painted — the same "one page per section, never a
 * per-product crawl" shape `proxied-fetch` already uses, applied to a route
 * that costs roughly ten times as much per page. See apifyActor.ts.
 */
async function viaBrowserRender(ctx: AttemptContext): Promise<Attempt> {
  if (!ctx.actorRender) {
    return {
      result: {
        ok: false,
        status: null,
        listings: 0,
        error: 'no Apify actor configured; set APIFY_TOKEN to enable',
      },
      listings: [],
    };
  }

  const cat = ctx.retailer.catalogue;
  if (!cat || cat.sections.length === 0) return notConfigured();

  const targets = cat.sections.map((section) => ({
    id: section.id,
    url: section.urlTemplate.replace('{page}', String(cat.firstPage)),
  }));
  const allowed = targets.filter((t) => isAllowed(ctx.robots, t.url));

  if (allowed.length === 0) {
    return {
      result: {
        ok: false,
        status: null,
        listings: 0,
        error: ctx.robots.unavailable
          ? 'robots.txt unreachable, holding off until the server recovers'
          : 'disallowed by robots.txt',
        ...(ctx.robots.unavailable ? {} : { ruleOut: 'robots.txt disallows this path' }),
      },
      listings: [],
    };
  }

  const rendered = await ctx.actorRender(allowed.map((t) => t.url));

  const listings: RawListing[] = [];
  const worked: string[] = [];
  for (const { id, url } of allowed) {
    const res = rendered.get(url);
    if (res?.ok && res.body) {
      const found = parseListings(res.body, { sectionId: id, pageUrl: url });
      if (found.length > 0) {
        listings.push(...found);
        worked.push(url);
      }
    }
  }

  return {
    result: { ok: listings.length > 0, status: 200, listings: listings.length },
    listings,
    ...(worked.length ? { discovered: { sectionUrls: worked } } : {}),
  };
}

function notConfigured(): Attempt {
  return {
    result: { ok: false, status: null, listings: 0, error: 'no catalogue sections configured' },
    listings: [],
  };
}

export { BROWSER_HEADERS, BOT_HEADERS };

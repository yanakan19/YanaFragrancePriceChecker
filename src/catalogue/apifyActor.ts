/**
 * Apify Actor client: real browser rendering for shops a proxied fetch alone
 * cannot get past.
 *
 * ── Why this exists alongside apifyProxy.ts, not instead of it ─────────────
 * apifyProxy.ts's own header explains why this project chose Apify Proxy over
 * an Apify Actor: most actors run their own extraction and hand back a schema
 * we would have to adapt to, so we outsource retrieval, not understanding.
 * That reasoning is still correct for a shop a residential IP alone gets past.
 *
 * It is not the whole story for every shop. `data/strategy-memory.json` and
 * the retailer entries in `src/config/retailers.ts` for Harvey Nichols and
 * John Lewis both record the same distinct failure: every strategy, including
 * a browser-header fetch, comes back HTTP 200 with zero listings. That is not
 * a refusal — nothing blocked us — it is a page whose product grid is drawn by
 * a script after load. No amount of retrying the raw HTTP response, proxied or
 * not, will ever contain markup that only exists after JavaScript runs. Boots
 * shows the same shape on several strategies (200, zero listings) alongside
 * one 403, so it may belong here too rather than in the hard-IP-block group;
 * see its own entry.
 *
 * That is a genuinely different problem and needs a genuinely different tool:
 * something that runs the page's own JavaScript and hands back what a real
 * browser painted. This module is that tool, and it keeps the same promise
 * apifyProxy.ts made: the actor is asked to do exactly one job — render a
 * page as a real UK browser would, and return the resulting HTML — nothing
 * more. Extraction still happens in exactly one place, `parseListings()` in
 * jsonld.ts, the same as every other retrieval route in this codebase. This
 * module outsources *rendering*, one layer further down the stack than
 * apifyProxy.ts's *retrieval*; the "one parser, one truth" rule is unchanged.
 *
 * ── Credential: a THIRD one, not to be confused with the other two ─────────
 * Needs `APIFY_TOKEN`, an Apify API token from the console's Integrations
 * page. This authenticates calls to Apify's REST API (start an actor run,
 * read its result) and is a different credential from both an ordinary
 * password and apifyProxy.ts's `APIFY_PROXY_PASSWORD`, which authenticates a
 * CONNECT tunnel and nothing else. Confusing any of the three fails silently
 * in its own way; see apifyProxy.ts's own warning about the first pair.
 *
 * ── What this costs ──────────────────────────────────────────────────────
 * A full headless-Chromium render costs far more per page than the plain
 * proxy. Apify's own published compute-unit rate is $0.13-$0.20 per CU (one
 * CU is 1 GB of RAM for one hour) depending on plan tier, and independent
 * benchmarking of Puppeteer/Playwright-class actors put the all-in cost at
 * roughly $2-5 per 1,000 pages once the browser's CPU and memory overhead is
 * counted in — see docs/INGESTION.md for the same style of sourced estimate
 * for the proxy route. Both figures are estimates gathered from public
 * pricing pages and third-party benchmarks in August 2026, not a quote for
 * this account's actual plan, and should be re-checked against the console
 * once real usage exists. `MAX_ACTOR_PAGES_PER_RUN` below (10) is sized well
 * below apifyProxy.ts's own `MAX_PROXIED_REQUESTS_PER_RUN` (40) for exactly
 * that reason — not derived to hold spend exactly equal (the per-page cost
 * gap is roughly tenfold, the budget gap is fourfold), but chosen as a
 * number that covers roughly one page per shop in this file's enabled-but-
 * dark tier with a little headroom, cheap enough to be a sane starting point
 * before any real cost has been measured. Revisit once it has.
 *
 * ── What has and has not been verified ──────────────────────────────────
 * Built against Apify's publicly documented REST API
 * (docs.apify.com/api/v2 — specifically the "run Actor synchronously and get
 * dataset items" endpoint) and the publicly documented `apify/puppeteer-scraper`
 * actor (apify.com/apify/puppeteer-scraper). I do not have an Apify account
 * and cannot create one on your behalf. Nothing here has run against Apify's
 * real infrastructure. Request building and budget gating are unit tested
 * against a fake `fetch`; whether the page function below actually receives
 * rendered HTML for these shops, and whether that HTML actually carries what
 * a real browser shows, can only be proven by running it with a real token.
 * Treat the first real run as that verification step, and read its output
 * rather than assuming it worked.
 *
 * The synchronous endpoint used here times out at 300 seconds per Apify's own
 * documentation. Every retailer this module is designed for configures at
 * most a handful of catalogue sections (see `src/config/retailers.ts`), so a
 * sequential render of one shop's sections was judged unlikely to approach
 * that ceiling — but this is a judgement made without ever having timed a
 * real run, not a measurement. If a first real run times out, the fix is the
 * asynchronous run-then-poll pattern Apify's docs recommend for longer jobs,
 * not a larger number here.
 */
import type { HttpResponse } from './attempt.js';

/** Hard ceiling on rendered pages per harvest run, independent of any caller's own budget. */
export const MAX_ACTOR_PAGES_PER_RUN = 10;

export interface ApifyActorConfig {
  /** Apify API token, from the console's Integrations page. Not a proxy password. */
  token: string;
  /** ISO country code the actor's residential proxy should exit from. */
  country: string;
  /** Actor to run, in `owner~name` form (the shape the Apify API path needs). */
  actorId: string;
}

export function apifyActorConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ApifyActorConfig | null {
  const token = env.APIFY_TOKEN;
  if (!token) return null;
  return {
    token,
    // Falls back to the proxy's own country variable before the GB default,
    // so a run that has already set APIFY_PROXY_COUNTRY for the proxy route
    // does not have to state the same UK intent twice.
    country: env.APIFY_ACTOR_COUNTRY ?? env.APIFY_PROXY_COUNTRY ?? 'GB',
    actorId: env.APIFY_ACTOR_ID ?? 'apify~puppeteer-scraper',
  };
}

/**
 * Runs entirely inside the actor: load the page, let it settle, hand back
 * exactly what a real browser would have painted. No extraction happens
 * here — see this module's own header for why that is deliberate. Kept as a
 * plain string because it is shipped as JSON to Apify's API, not executed
 * locally; `context.page`/`context.request` are the Puppeteer Scraper
 * actor's own documented page-function arguments.
 */
const PAGE_FUNCTION_SOURCE = `async function pageFunction(context) {
  const { page, request } = context;
  // A category grid drawn by client-side script needs a moment after load
  // to finish painting. This is a fixed wait rather than a per-shop selector
  // because no per-shop selector has ever been confirmed against a real
  // render — see this module's header on what remains unverified.
  await page.waitForTimeout(2500);
  return {
    url: request.url,
    html: await page.content(),
    status: context.response ? context.response.status() : null,
  };
}`;

/**
 * One actor run, rendering every URL given and handing back what it painted.
 *
 * Deliberately one run for the whole batch, not one run per URL: an actor run
 * pays a browser-startup cost before it fetches anything, and paying that
 * once per shop instead of once per page is the difference this project's own
 * cost reasoning (docs/INGESTION.md) already insists on for the proxy route,
 * applied to a tool where the startup cost is far larger.
 *
 * Every URL not present in the actor's result is reported as a failure, never
 * silently dropped — a caller counting priced listings must be able to tell
 * "the actor rendered this page and found nothing" from "the actor never
 * told us what happened to this page" (see MAX_ACTOR_PAGES_PER_RUN's own
 * budget line below for the case that produces the second).
 */
export async function renderPagesViaApifyActor(
  config: ApifyActorConfig,
  urls: string[],
  maxPages = MAX_ACTOR_PAGES_PER_RUN,
): Promise<Map<string, HttpResponse>> {
  const results = new Map<string, HttpResponse>();
  if (urls.length === 0) return results;

  const capped = urls.slice(0, maxPages);
  for (const overBudget of urls.slice(maxPages)) {
    results.set(overBudget, {
      status: 0,
      body: '',
      ok: false,
      error: `actor budget of ${maxPages} rendered pages exhausted for this run`,
    });
  }

  const endpoint =
    `https://api.apify.com/v2/acts/${config.actorId}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(config.token)}`;

  const body = {
    startUrls: capped.map((url) => ({ url })),
    pageFunction: PAGE_FUNCTION_SOURCE,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL'],
      apifyProxyCountry: config.country,
    },
    headless: true,
    maxRequestRetries: 1,
    maxPagesPerCrawl: capped.length,
    // Sequential rather than the actor's own default concurrency: predictable
    // cost, and no reason to hit a shop with several requests at once when a
    // free crawl of the same shop already runs at a polite, deliberate gap.
    maxConcurrency: 1,
  };

  const controller = new AbortController();
  // Comfortably inside the synchronous endpoint's own 300s ceiling — see this
  // module's header on why that margin was judged enough without ever having
  // timed a real run.
  const timer = setTimeout(() => controller.abort(), 280_000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const message = `Apify actor run failed: HTTP ${res.status}`;
      for (const url of capped) results.set(url, { status: res.status, body: '', ok: false, error: message });
      return results;
    }

    const items = (await res.json()) as Array<{ url?: string; html?: string; status?: number | null }>;
    const seen = new Set<string>();
    for (const item of items) {
      if (!item.url) continue;
      seen.add(item.url);
      results.set(item.url, {
        status: item.status ?? 200,
        body: item.html ?? '',
        ok: Boolean(item.html),
      });
    }
    for (const url of capped) {
      if (!seen.has(url)) {
        results.set(url, { status: 0, body: '', ok: false, error: 'actor returned no item for this URL' });
      }
    }
  } catch (err) {
    const message = String(err).slice(0, 160);
    for (const url of capped) results.set(url, { status: 0, body: '', ok: false, error: message });
  } finally {
    clearTimeout(timer);
  }

  return results;
}

/**
 * Wraps `renderPagesViaApifyActor` with a running total across many calls in
 * one harvest, so `MAX_ACTOR_PAGES_PER_RUN` is a whole-run ceiling rather
 * than a per-shop one — the same hard-backstop shape as apifyProxy.ts's
 * `apifyProxyHttp`, so a bug that loops over shops cannot spend past it
 * either.
 */
export function apifyActorRenderer(
  config: ApifyActorConfig,
  maxTotalPages = MAX_ACTOR_PAGES_PER_RUN,
): { render: (urls: string[]) => Promise<Map<string, HttpResponse>>; used: () => number } {
  let used = 0;

  return {
    render: async (urls: string[]): Promise<Map<string, HttpResponse>> => {
      const remaining = maxTotalPages - used;
      if (remaining <= 0) {
        const results = new Map<string, HttpResponse>();
        for (const url of urls) {
          results.set(url, {
            status: 0,
            body: '',
            ok: false,
            error: `actor budget of ${maxTotalPages} rendered pages exhausted for this run`,
          });
        }
        return results;
      }

      const capped = urls.slice(0, remaining);
      const rendered = await renderPagesViaApifyActor(config, capped, capped.length);
      used += capped.length;

      for (const skipped of urls.slice(remaining)) {
        rendered.set(skipped, {
          status: 0,
          body: '',
          ok: false,
          error: `actor budget of ${maxTotalPages} rendered pages exhausted for this run`,
        });
      }
      return rendered;
    },
    used: () => used,
  };
}

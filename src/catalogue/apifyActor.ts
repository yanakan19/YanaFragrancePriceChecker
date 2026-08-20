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
  /**
   * Actor to try when the first one is refused for a reason a different actor
   * could avoid — see `ACTOR_APPROVAL_REFUSAL` and `FALLBACK_ACTOR_ID`.
   * Null disables the fallback entirely.
   */
  fallbackActorId: string | null;
}

/**
 * ── The wall the first real actor run hit ────────────────────────────────────
 * Harvest probe run 11, job 96345230824, 2026-08-20T07:11Z — the first time
 * this module ever reached Apify with a live token:
 *
 *     Apify actor run failed: HTTP 403 — { "error": {
 *       "type": "full-permission-actor-not-approved",
 *       "message": "This Actor requires full access to your account. You must
 *        approve its permissions before running it:
 *        https://console.apify.com/actors/YJCnS9qogi9XxDgLB?approvePermissions=true" } }
 *
 * That is not a bug and not a plan limit. `apify/puppeteer-scraper` takes a
 * `pageFunction` — arbitrary JavaScript that Apify then runs — so Apify
 * classes it as needing full account access and will not start it until the
 * account owner approves it once, by hand, in the console. Every
 * pageFunction-shaped actor (`web-scraper`, `cheerio-scraper`, this one) is in
 * the same category for the same reason. No code change can grant that
 * approval, and none should try to.
 *
 * So the fallback below is an actor that takes no user code at all.
 * `apify/website-content-crawler` renders with a real browser and hands back
 * the page, configured entirely through declared input fields. Whether it is
 * exempt from the approval gate is a question only a live run answers, which
 * is exactly why it is a fallback and not a replacement: if it is exempt, the
 * actor tier works today; if it is not, the run says so with the same clear
 * error and the owner's single click on the URL above fixes the primary route.
 */
export const ACTOR_APPROVAL_REFUSAL = 'full-permission-actor-not-approved';

/** Runs a real browser, takes no user-supplied code. */
export const FALLBACK_ACTOR_ID = 'apify~website-content-crawler';

/**
 * Marks a failure where Apify refused the run outright rather than starting
 * it. The distinction is money: a rejected run never launches a browser, so
 * it bills nothing, and counting its pages against MAX_ACTOR_PAGES_PER_RUN
 * would spend a real budget on work that never happened. Measured on probe
 * run 12, job 96345673451, which reported "Apify actor pages rendered this
 * run: 4 of 10 budgeted" having rendered nothing at all — four pages of a
 * ten-page ceiling gone, so a full sweep would have had six left for every
 * remaining shop on the strength of one refusal.
 */
export const RUN_REJECTED_PREFIX = 'Apify actor run failed:';

/** Whether a result describes a run Apify refused to start, rather than a page that rendered badly. */
export function wasRunRejected(res: HttpResponse): boolean {
  return Boolean(res.error?.startsWith(RUN_REJECTED_PREFIX));
}

export function apifyActorConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ApifyActorConfig | null {
  const token = env.APIFY_TOKEN;
  if (!token) return null;
  const actorId = env.APIFY_ACTOR_ID ?? 'apify~puppeteer-scraper';
  return {
    token,
    // Falls back to the proxy's own country variable before the GB default,
    // so a run that has already set APIFY_PROXY_COUNTRY for the proxy route
    // does not have to state the same UK intent twice.
    country: env.APIFY_ACTOR_COUNTRY ?? env.APIFY_PROXY_COUNTRY ?? 'GB',
    actorId,
    // An explicitly chosen actor is honoured as chosen: someone naming
    // APIFY_ACTOR_ID has made a decision, and silently running a different
    // actor than the one they named would be worse than failing.
    fallbackActorId:
      env.APIFY_ACTOR_ID || actorId === FALLBACK_ACTOR_ID ? null : FALLBACK_ACTOR_ID,
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
  const { page, request, response } = context;
  // A category grid drawn by client-side script needs a moment after load
  // to finish painting. This is a fixed wait rather than a per-shop selector
  // because no per-shop selector has ever been confirmed against a real
  // render — see this module's header on what remains unverified.
  //
  // Deliberately NOT Puppeteer's own wait-for-timeout page helper. That
  // helper was deprecated in Puppeteer 20 and removed in Puppeteer 22
  // (January 2024), and the actor this runs in tracks a current Puppeteer —
  // so the call throws "is not a function", the page function fails, and the
  // actor writes no dataset item for the URL at all. From the caller's side
  // that is indistinguishable from a page that rendered nothing, which is the
  // most expensive possible way to learn about a one-line API change. A plain
  // timer has no such dependency.
  await new Promise(function (resolve) { setTimeout(resolve, 2500); });
  return {
    url: request.url,
    html: await page.content(),
    status: response ? response.status() : null,
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

  const attempts: string[] = [config.actorId];
  if (config.fallbackActorId) attempts.push(config.fallbackActorId);

  let last: Map<string, HttpResponse> | null = null;
  for (const actorId of attempts) {
    const attempt = await runOneActor(config, actorId, capped);
    if ([...attempt.values()].some((r) => r.ok)) {
      for (const [url, res] of attempt) results.set(url, res);
      return results;
    }
    last = attempt;
    // Only an approval refusal is worth asking a different actor about. Any
    // other failure — a bad proxy group, a page that rendered empty, a
    // timeout — would fail the same way twice and would cost twice as much to
    // find that out.
    const refusedForApproval = [...attempt.values()].some((r) => r.error?.includes(ACTOR_APPROVAL_REFUSAL));
    if (!refusedForApproval) break;
  }

  for (const [url, res] of last ?? []) results.set(url, res);
  return results;
}

/** The input each actor's own schema expects. See ACTOR_APPROVAL_REFUSAL for why there are two. */
function actorInput(config: ApifyActorConfig, actorId: string, urls: string[]): Record<string, unknown> {
  const proxyConfiguration = {
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL'],
    apifyProxyCountry: config.country,
  };

  if (actorId === FALLBACK_ACTOR_ID) {
    return {
      startUrls: urls.map((url) => ({ url })),
      proxyConfiguration,
      // A real browser, which is the entire reason this tier exists.
      crawlerType: 'playwright:chrome',
      // Page one of each section and no further: this actor follows links by
      // default, and a crawl that wandered would spend the whole budget in one
      // shop's navigation.
      maxCrawlDepth: 0,
      maxCrawlPages: urls.length,
      maxConcurrency: 1,
      // The raw HTML is the only field this project wants; `text` and
      // `markdown` are this actor's usual output and are useless to a JSON-LD
      // parser.
      saveHtml: true,
      saveMarkdown: false,
      // Both of these default to stripping the page down to readable prose —
      // which deletes every <script type="application/ld+json"> on it, i.e.
      // precisely and only the thing being looked for.
      htmlTransformer: 'none',
      removeElementsCssSelector: '',
    };
  }

  return {
    startUrls: urls.map((url) => ({ url })),
    pageFunction: PAGE_FUNCTION_SOURCE,
    proxyConfiguration,
    headless: true,
    maxRequestRetries: 1,
    maxPagesPerCrawl: urls.length,
    // Sequential rather than the actor's own default concurrency: predictable
    // cost, and no reason to hit a shop with several requests at once when a
    // free crawl of the same shop already runs at a polite, deliberate gap.
    maxConcurrency: 1,
  };
}

async function runOneActor(
  config: ApifyActorConfig,
  actorId: string,
  capped: string[],
): Promise<Map<string, HttpResponse>> {
  const results = new Map<string, HttpResponse>();

  const endpoint =
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(config.token)}`;

  const body = actorInput(config, actorId, capped);

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
      // Apify answers a rejected run with a JSON body naming the reason —
      // an actor id that does not exist, a proxy group the plan does not
      // include, an input field the actor's schema rejects. The status alone
      // distinguishes none of those, and this is the most expensive tier in
      // the pipeline: the one place where "it failed" without a reason costs
      // real money to ask again. Truncated because an HTML error page from an
      // intermediary would otherwise flood the run log.
      const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
      const message = `${RUN_REJECTED_PREFIX} HTTP ${res.status}${detail ? ` — ${detail}` : ''}`;
      for (const url of capped) results.set(url, { status: res.status, body: '', ok: false, error: message });
      return results;
    }

    const payload: unknown = await res.json();
    if (!Array.isArray(payload)) {
      // The documented success shape is an array of dataset items. Anything
      // else is an error envelope wearing a 2xx, and reporting it verbatim
      // beats reporting "0 listings".
      const message = `Apify actor returned a non-array payload: ${JSON.stringify(payload).slice(0, 300)}`;
      for (const url of capped) results.set(url, { status: res.status, body: '', ok: false, error: message });
      return results;
    }

    const items = payload as Array<{ url?: string; html?: string; status?: number | null }>;
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
      // Only pages Apify actually took on. See RUN_REJECTED_PREFIX.
      used += capped.filter((url) => {
        const res = rendered.get(url);
        return !res || !wasRunRejected(res);
      }).length;

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

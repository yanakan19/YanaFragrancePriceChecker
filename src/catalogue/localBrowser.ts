/**
 * A real browser render, run here rather than bought from Apify.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The actor tier in apifyActor.ts does one job: load a page, let its
 * JavaScript run, hand back the painted HTML. It does that job correctly —
 * measured, harvest probe run 19 (job 96350053274), four John Lewis category
 * pages rendered at HTTP 200 and about a megabyte each. It also costs real
 * money per page, and on 2026-08-21 the $5 monthly credit ran out mid-month
 * with three weeks of August left, taking five shops (Boots, Selfridges, John
 * Lewis, Superdrug, Zara) down to zero listings until the reset.
 *
 * Playwright was already a dependency of this repo — scripts/generate-og-preview.ts
 * has been driving headless Chromium for the site's own preview image all
 * along. So the capability was already here, already installed, already paid
 * for by the GitHub Actions minutes the crawl spends anyway. This module is
 * that same browser pointed at a retailer instead.
 *
 * Deliberately a drop-in: `localBrowserRenderer()` returns the same
 * `{ render, used }` shape as `apifyActorRenderer()`, hands back the same
 * `HttpResponse` objects, and honours the same per-run page budget. The
 * harvest can choose between them without knowing which it has.
 *
 * ── What this does NOT solve, stated plainly ────────────────────────────────
 * IP reputation. Apify's actor exits through residential addresses; a GitHub
 * Actions runner is a datacenter IP, and a shop that refuses datacenter
 * traffic will refuse this too, exactly as it refuses the plain fetch route
 * today. This module replaces the *rendering*, not the *address*.
 *
 * Whether that matters is per shop and is not yet known, because it cannot be
 * measured from the sandbox this was written in: every one of those five
 * domains fails at the egress proxy with `CONNECT tunnel failed, response
 * 403` before a request is ever made, which is this environment refusing the
 * domain and says nothing whatsoever about what the shop would answer. CI can
 * reach them and this sandbox cannot, which is where every other real
 * retrieval finding in this repo came from too.
 *
 * So the honest scope of this commit is: the render tier no longer costs
 * money, and whether each shop answers a datacenter IP is the open question
 * the first CI run settles. The downside of finding out is nil — those five
 * shops yield nothing today either way.
 *
 * ── Why one browser for the whole run ───────────────────────────────────────
 * Startup dominates. Chromium takes on the order of a second to launch and
 * milliseconds to open a further page, so a browser per URL would spend most
 * of its time starting up — the same reasoning apifyActor.ts's header gives
 * for batching there, where the cost was money rather than seconds. The
 * browser is launched on first use and closed by `dispose()`, which the
 * harvest must call.
 */
import type { HttpResponse } from './attempt.js';
import type { Browser } from 'playwright';

/**
 * Pages rendered per run.
 *
 * Higher than the actor tier's 10 because the constraint changed. There it
 * was money and the cap was rationing a $5 credit; here it is wall-clock time
 * inside a harvest step that already has a 60-minute cap and a job that has
 * 100. At roughly 5-15 seconds a page including its own settle wait, 40 pages
 * is a few minutes — real, bounded, and not the thing that will end a run.
 *
 * It stays a cap rather than becoming unlimited on purpose: a bug that
 * queued every URL in a sitemap would otherwise hit a shop thousands of times
 * with a real browser, which is a far ruder failure than a wasted dollar.
 */
export const MAX_LOCAL_RENDER_PAGES_PER_RUN = 40;

/** How long one page gets to load before it is abandoned. */
const PAGE_TIMEOUT_MS = 30_000;

/**
 * Extra settle time after the network goes quiet.
 *
 * A grid painted by JavaScript is often one frame behind the last response.
 * `networkidle` plus a short fixed wait is what actually produces markup with
 * the products in it, rather than the skeleton that was there a moment before.
 */
const SETTLE_MS = 1_500;

/**
 * A desktop Chrome user agent.
 *
 * Playwright's default advertises HeadlessChrome, which some storefronts
 * refuse outright. This is not evasion of a stated policy: robots.txt is read
 * and obeyed by the caller exactly as it is for every other route in this
 * repo, and nothing here touches a path a shop asked us to leave alone. It
 * asks in the shape a shop's own site is built to answer.
 */
const RENDER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export interface LocalBrowserOptions {
  /** Pages this run may render. Defaults to MAX_LOCAL_RENDER_PAGES_PER_RUN. */
  maxTotalPages?: number;
  /** Minimum delay between two page loads, ms. The caller's politeness gap. */
  gapMs?: number;
  /**
   * Chromium binary to drive. Defaults to whatever Playwright resolves, which
   * is correct on a CI runner after `playwright install chromium`. Set it when
   * the browser lives somewhere non-standard.
   */
  executablePath?: string;
}

export interface LocalRenderer {
  render: (urls: string[]) => Promise<Map<string, HttpResponse>>;
  used: () => number;
  /** Close the browser. Safe to call more than once, and when nothing opened. */
  dispose: () => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A renderer backed by a local headless Chromium.
 *
 * Lazily launched: constructing this costs nothing, so the harvest can build
 * one unconditionally and never pay for it on a run that renders no page.
 */
export function localBrowserRenderer(options: LocalBrowserOptions = {}): LocalRenderer {
  const maxTotalPages = options.maxTotalPages ?? MAX_LOCAL_RENDER_PAGES_PER_RUN;
  const gapMs = options.gapMs ?? 1_000;

  let used = 0;
  let browser: Browser | null = null;
  /** Set when launching failed, so a broken environment is reported once per URL rather than retried per URL. */
  let launchError: string | null = null;

  async function ensureBrowser(): Promise<Browser | null> {
    if (browser) return browser;
    if (launchError) return null;
    try {
      // Imported here rather than at module load so that merely importing this
      // file — which tests and the harvest both do — never pulls in Playwright
      // or touches a browser.
      const { chromium } = await import('playwright');
      browser = await chromium.launch({
        headless: true,
        ...(options.executablePath ? { executablePath: options.executablePath } : {}),
      });
      return browser;
    } catch (err) {
      launchError = String(err instanceof Error ? err.message : err).slice(0, 200);
      return null;
    }
  }

  return {
    used: () => used,

    dispose: async () => {
      if (!browser) return;
      try {
        await browser.close();
      } catch {
        // A browser that already died is the state we wanted anyway.
      }
      browser = null;
    },

    render: async (urls: string[]): Promise<Map<string, HttpResponse>> => {
      const results = new Map<string, HttpResponse>();
      const remaining = maxTotalPages - used;

      if (remaining <= 0) {
        for (const url of urls) {
          results.set(url, {
            status: 0,
            body: '',
            ok: false,
            error: `local render budget of ${maxTotalPages} pages exhausted for this run`,
          });
        }
        return results;
      }

      const capped = urls.slice(0, remaining);
      for (const url of urls.slice(remaining)) {
        results.set(url, {
          status: 0,
          body: '',
          ok: false,
          error: `local render budget of ${maxTotalPages} pages exhausted for this run`,
        });
      }

      const b = await ensureBrowser();
      if (!b) {
        for (const url of capped) {
          results.set(url, {
            status: 0,
            body: '',
            ok: false,
            error: `local browser unavailable: ${launchError ?? 'unknown launch failure'}`,
          });
        }
        return results;
      }

      // One context for the batch: cookies a shop sets on its first page are
      // often what its second page expects, and a fresh context per URL throws
      // them away and looks like a new visitor every time.
      const context = await b.newContext({
        userAgent: RENDER_USER_AGENT,
        viewport: { width: 1440, height: 900 },
        locale: 'en-GB',
      });

      try {
        for (let i = 0; i < capped.length; i++) {
          const url = capped[i]!;
          if (i > 0) await sleep(gapMs);

          const page = await context.newPage();
          try {
            const response = await page.goto(url, {
              waitUntil: 'domcontentloaded',
              timeout: PAGE_TIMEOUT_MS,
            });

            // Best effort: a page that never goes idle (a poller, an ad
            // carousel) still has its markup read rather than being discarded.
            await page
              .waitForLoadState('networkidle', { timeout: PAGE_TIMEOUT_MS })
              .catch(() => undefined);
            await sleep(SETTLE_MS);

            const body = await page.content();
            const status = response?.status() ?? 0;

            results.set(url, {
              status,
              body,
              // A rendered error page is still a real answer from the shop and
              // the caller decides what to do with it, exactly as on the
              // plain-fetch route.
              ok: status >= 200 && status < 300,
              finalUrl: page.url(),
            });
            used++;
          } catch (err) {
            results.set(url, {
              status: 0,
              body: '',
              ok: false,
              error: `local render failed: ${String(err instanceof Error ? err.message : err).slice(0, 160)}`,
            });
            // A page that timed out still cost the time it was given, so it
            // counts against the budget. Otherwise a shop that hangs every
            // request would be retried until the harvest's own cap landed.
            used++;
          } finally {
            await page.close().catch(() => undefined);
          }
        }
      } finally {
        await context.close().catch(() => undefined);
      }

      return results;
    },
  };
}

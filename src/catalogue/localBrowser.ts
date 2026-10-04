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
import { BOT_USER_AGENT } from './botIdentity.js';
import type { Browser } from 'playwright';

/**
 * Pages rendered per run.
 *
 * Close to the Apify actor tier's 10, though for a different reason. There the
 * scarce thing was money; here it is time inside the sitemap harvest, which on
 * run #328 hit its own 60-minute cap — as it routinely does. This is the
 * belt-and-braces half of the bound: the time budget below is what actually
 * stops a slow shop, and this stops a bug that queued a whole sitemap from
 * hitting one with a real browser thousands of times, which is a far ruder
 * failure than a wasted dollar.
 *
 * 12 covers the section pages the five render-dependent shops configure
 * between them, which is the entire population this tier exists for.
 */
export const MAX_LOCAL_RENDER_PAGES_PER_RUN = 12;

/**
 * Time spent rendering, across the whole run.
 *
 * ── What the previous version of this number got wrong, twice ───────────────
 * It was 4 minutes and it was measured as wall clock *since the first render
 * call*, not as time actually spent rendering. Both halves were wrong, and
 * run #330 (job 97881335331, harvest report committed as 2cd38bf) shows the
 * cost: John Lewis, Selfridges, Superdrug and The Perfume Shop each came back
 * with `HTTP 0, 0 bytes, local render time budget of 240s exhausted for this
 * run` on every one of their section URLs. Eleven section pages, all refused,
 * nothing rendered.
 *
 * The four shops that did get to render between them managed nine pages —
 * Notino 4, Boots 1, The Fragrance Shop 3, Harvey Nichols 1 — and the report's
 * own per-shop timestamps put those four shops at 103.5s, 32.0s, 97.4s and
 * 3.8s of wall clock, 236.7s in total. Almost all of that was their sitemap
 * walks, robots probes and timeouts, not rendering at all. A budget measured
 * as "elapsed since the first render" was therefore being spent by work this
 * module never did.
 *
 * ── The per-page cost, measured ─────────────────────────────────────────────
 * Measured in this sandbox against a local HTTP server at 120ms of simulated
 * per-response latency, serving a 697KB catalogue page carrying 2,500 products
 * and 2,500 images (scratch script, not committed; Chromium
 * chromium-1194/chrome-linux/chrome, the same build CI installs):
 *
 *   strategy                                    plain    lazy-painted  never-idle
 *   domcontentloaded + networkidle(30s) + 1.5s  32.3s      2.5s          32.7s
 *   domcontentloaded + networkidle(8s)  + 1.5s  10.4s      2.4s          10.3s
 *   domcontentloaded + networkidle(5s)  + 1.5s   7.3s      2.4s           7.4s
 *   load             +                    1.5s  31.7s      2.2s          31.7s
 *   domcontentloaded +                    1.5s   2.6s      2.1s           2.7s
 *
 * `networkidle` waits for 500ms with no connections in flight. A catalogue
 * page with hundreds of images and any kind of beacon does not reach that
 * state at all, so the wait ran to its full 30-second timeout on two of the
 * three page shapes — 12 pages of that is 384s, which a 240s budget could
 * never have covered even if nothing else had been spending it. That is the
 * whole of the "far more per page than I assumed" in one number.
 *
 * Chromium launch measured at 976ms cold and 331ms warm on the same runs, so
 * the one-browser-per-run decision this module already made is right and is
 * not what was expensive.
 *
 * ── The budget now ──────────────────────────────────────────────────────────
 * Six minutes of *rendering*, accumulated across the run, alongside the
 * unchanged 12-page cap and the new per-shop slice below. It is deliberately
 * still bounded: at the ceiling one page can cost (30s goto timeout + 5s idle
 * cap + 1.5s settle ≈ 36.5s) the page cap alone is 7.3 minutes of worst-case
 * work, so a time bound is what stops a run where every render-dependent shop
 * hangs. On the measured cost of a page that answers, 12 pages is about 90
 * seconds and this never binds.
 *
 * Not measurable from here: what any of this costs against a real retailer
 * over a real network. Every figure above is a local server on loopback with
 * latency simulated by a timer. CI settles the real one.
 */
export const MAX_LOCAL_RENDER_MS_PER_RUN = 6 * 60_000;

/**
 * Time spent rendering for any one shop.
 *
 * The per-run budget alone let the first shops asked spend all of it, which is
 * exactly what run #330 did: Notino, Boots, The Fragrance Shop and Harvey
 * Nichols rendered, and the four shops behind them in the sweep were refused
 * every URL. A budget that only bounds the total silently makes the sweep
 * order into a priority order, which nobody chose and nothing states.
 *
 * `render()` is called once per shop with that shop's section URLs, so one
 * call is one shop's slice. Two minutes covers the four sections the busiest
 * shop configures even if three of the four go all the way to their timeouts,
 * and is about 16x the measured cost of four pages that answer.
 *
 * A shop whose robots.txt has to be rendered gets a second call and so a
 * second slice. That is one extra tiny page, and worth less than the
 * complexity of tracking slices per retailer id in a module that is handed
 * URLs rather than shops.
 */
export const MAX_LOCAL_RENDER_MS_PER_SHOP = 2 * 60_000;

/** How long one page gets to load before it is abandoned. */
const PAGE_TIMEOUT_MS = 30_000;

/**
 * How long to keep waiting for the network to go quiet before giving up on it.
 *
 * Was PAGE_TIMEOUT_MS, i.e. 30 seconds, which is what made a page cost 32s
 * instead of 7s — see the measurement table above. A catalogue page with
 * hundreds of images or a single open beacon never reaches `networkidle` at
 * all, so on those pages this wait always runs to its full length and buys
 * nothing; the only pages it helps are the ones that go quiet, and those go
 * quiet in well under a second (measured: 0.8-0.9s).
 *
 * Five seconds keeps that help — a grid that arrives by XHR a few seconds
 * after DOMContentLoaded is still caught — while capping what a page that will
 * never go quiet can cost.
 */
const NETWORK_IDLE_TIMEOUT_MS = 5_000;

/**
 * Extra settle time after the network goes quiet, or after we stop waiting.
 *
 * A grid painted by JavaScript is often one frame behind the last response.
 * Measured against the local server above, a grid painted 700ms after load is
 * captured in full by this wait alone, with `networkidle` contributing
 * nothing: `domcontentloaded` + 1.5s returned all 2,500 products.
 */
const SETTLE_MS = 1_500;

/**
 * The render's user agent is the crawler's own, PriceSniffsBot (see
 * src/catalogue/botIdentity.ts), not a desktop Chrome's.
 *
 * Playwright's default advertises HeadlessChrome, and until 2026-10-04 this file
 * replaced it with a desktop Chrome string so a storefront would answer the way
 * it answers a visitor. The owner decided that every shop is read as
 * PriceSniffsBot and that no refusal is worked around: a shop that does not
 * serve the bot is a shop that refuses it, here as on every other route. The
 * render is a real Chromium, so a page that needs JavaScript still draws, but it
 * says who is asking. No client hints (`sec-ch-ua`) are sent with an overridden
 * user agent, and nothing here hides that the browser is automated.
 *
 * Used only for a shop that answered the bot and draws its grid with
 * JavaScript, never after a refusal (scripts/catalogue-harvest.ts).
 */
const RENDER_USER_AGENT = BOT_USER_AGENT;

export interface LocalBrowserOptions {
  /** Pages this run may render. Defaults to MAX_LOCAL_RENDER_PAGES_PER_RUN. */
  maxTotalPages?: number;
  /**
   * Time this run may spend rendering, summed over the pages it renders.
   *
   * Deliberately not wall clock since the first call — see
   * MAX_LOCAL_RENDER_MS_PER_RUN. Defaults to it.
   */
  maxTotalMs?: number;
  /** Time any one render() call — i.e. any one shop — may spend. Defaults to MAX_LOCAL_RENDER_MS_PER_SHOP. */
  maxShopMs?: number;
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
  /** Milliseconds actually spent rendering so far. Named in the end-of-run log. */
  spentMs: () => number;
  /** Close the browser. Safe to call more than once, and when nothing opened. */
  dispose: () => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * What the renderer takes from the machine it runs on, replaceable so its own
 * accounting can be tested without a browser. Production passes nothing and
 * gets the real launch, the real clock and real waiting.
 *
 * The time budget (what a page costs, when a shop's slice or the run's budget
 * is gone, what is refused after that) is arithmetic over the clock, and a
 * test of it that has to start Chromium and sit through its real settle waits
 * is a test of how busy the machine is: under load a launch alone can take
 * longer than any fixed test timeout. With these three replaced by a scripted
 * browser and a clock that only moves when the script says so, the same
 * assertions are exact and cannot time out. A real Chromium is still driven by
 * the rendering tests in tests/localBrowser.test.ts.
 */
export interface LocalBrowserDeps {
  /** Starts the browser. Defaults to Playwright's chromium.launch. */
  launch?: (options: { executablePath?: string }) => Promise<Browser>;
  /** Milliseconds, as Date.now(). Every cost the budgets charge is a difference of two of these. */
  now?: () => number;
  /** Waits for the given milliseconds: the politeness gap and the settle wait. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A renderer backed by a local headless Chromium.
 *
 * Lazily launched: constructing this costs nothing, so the harvest can build
 * one unconditionally and never pay for it on a run that renders no page.
 */
export function localBrowserRenderer(options: LocalBrowserOptions = {}, deps: LocalBrowserDeps = {}): LocalRenderer {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  const maxTotalPages = options.maxTotalPages ?? MAX_LOCAL_RENDER_PAGES_PER_RUN;
  const maxTotalMs = options.maxTotalMs ?? MAX_LOCAL_RENDER_MS_PER_RUN;
  const maxShopMs = options.maxShopMs ?? MAX_LOCAL_RENDER_MS_PER_SHOP;
  const gapMs = options.gapMs ?? 1_000;

  let used = 0;
  /**
   * Milliseconds spent inside this module, summed over the pages it rendered.
   *
   * Not "now minus the first call": between two render() calls the harvest is
   * off walking another shop's sitemap, and charging that to this tier is what
   * spent the whole budget on four shops in run #330.
   */
  let spentMs = 0;
  let browser: Browser | null = null;
  /** Set when launching failed, so a broken environment is reported once per URL rather than retried per URL. */
  let launchError: string | null = null;

  /**
   * Close the browser if the process is going down without reaching dispose().
   *
   * Observed on run #328: the sitemap harvest hit its 60-minute step cap, so
   * catalogue-harvest.ts never reached its own `dispose()` call at the end, and
   * the runner logged `Terminate orphan process: chrome-headless-shell` while
   * cleaning up after the job. GitHub reaped it, so nothing was harmed that
   * time — but relying on the CI runner to close what this module opened is
   * not a design, and a leaked Chromium on a developer's own machine has
   * nobody to reap it.
   *
   * SIGKILL cannot be caught and is not attempted. This covers the ordinary
   * termination paths, which is what a step timeout actually sends first.
   */
  let exitHooked = false;
  function hookProcessExit(): void {
    if (exitHooked) return;
    exitHooked = true;
    const shut = () => {
      // Synchronous best effort: the process is already leaving, so there is
      // no time to await a clean close.
      void browser?.close().catch(() => undefined);
      browser = null;
    };
    process.once('exit', shut);
    process.once('SIGINT', shut);
    process.once('SIGTERM', shut);
  }

  async function ensureBrowser(): Promise<Browser | null> {
    if (browser) return browser;
    if (launchError) return null;
    try {
      // Imported here rather than at module load so that merely importing this
      // file — which tests and the harvest both do — never pulls in Playwright
      // or touches a browser.
      const launch =
        deps.launch ??
        (async (launchOptions: { executablePath?: string }) => {
          const { chromium } = await import('playwright');
          return chromium.launch({ headless: true, ...launchOptions });
        });
      browser = await launch({
        ...(options.executablePath ? { executablePath: options.executablePath } : {}),
      });
      hookProcessExit();
      return browser;
    } catch (err) {
      launchError = String(err instanceof Error ? err.message : err).slice(0, 200);
      return null;
    }
  }

  return {
    used: () => used,
    spentMs: () => spentMs,

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
      /** Spent by this call — i.e. by this shop. Separate from the run's total. */
      let shopMs = 0;
      const runTimeGone = () => spentMs >= maxTotalMs;
      const shopTimeGone = () => shopMs >= maxShopMs;
      const outOfTime = runTimeGone();
      const remaining = outOfTime ? 0 : maxTotalPages - used;

      if (remaining <= 0) {
        for (const url of urls) {
          results.set(url, {
            status: 0,
            body: '',
            ok: false,
            error: outOfTime
              ? `local render time budget of ${Math.round(maxTotalMs / 1000)}s of rendering exhausted for this run`
              : `local render budget of ${maxTotalPages} pages exhausted for this run`,
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
          if (runTimeGone() || shopTimeGone()) {
            // Mid-batch exhaustion. Every URL not reached is reported, never
            // silently dropped: a shop that was skipped for time and a shop
            // that genuinely returned nothing must not look the same.
            //
            // Which budget ran out is named, because they mean different
            // things: the shop's slice says this shop is slow, the run's says
            // the tier as a whole is spent and every shop behind this one will
            // be refused too.
            const reason = runTimeGone()
              ? `local render time budget of ${Math.round(maxTotalMs / 1000)}s of rendering exhausted for this run`
              : `this shop's ${Math.round(maxShopMs / 1000)}s render slice exhausted`;
            for (const rest of capped.slice(i)) {
              results.set(rest, { status: 0, body: '', ok: false, error: reason });
            }
            break;
          }
          if (i > 0) await sleep(gapMs);

          // Charged from here, so the politeness gap and the page teardown are
          // counted as well: they are time the harvest pays for this tier.
          const pageStartedAt = now();
          const page = await context.newPage();
          // The user agent is set again through the DevTools protocol, without
          // user agent metadata, because that is the one way found to make
          // Chromium send no client hints. With the context's override alone it
          // still sends sec-ch-ua ("HeadlessChrome"), sec-ch-ua-mobile and
          // sec-ch-ua-platform, and Playwright reports the platform as Windows
          // on a Linux runner: a false statement about who is asking. Measured
          // 2026-10-04 against a local server, four ways (tests/botIdentity.test.ts
          // holds the result). The render says PriceSniffsBot and nothing else
          // about itself (src/catalogue/botIdentity.ts).
          const cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setUserAgentOverride', { userAgent: RENDER_USER_AGENT });
          try {
            const response = await page.goto(url, {
              waitUntil: 'domcontentloaded',
              timeout: PAGE_TIMEOUT_MS,
            });

            // Best effort, and bounded: a page that never goes idle (hundreds
            // of images, a beacon, an ad carousel) still has its markup read
            // rather than being discarded, and costs NETWORK_IDLE_TIMEOUT_MS
            // rather than a full page timeout to find that out.
            await page
              .waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
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
            const cost = now() - pageStartedAt;
            spentMs += cost;
            shopMs += cost;
          }
        }
      } finally {
        await context.close().catch(() => undefined);
      }

      return results;
    },
  };
}

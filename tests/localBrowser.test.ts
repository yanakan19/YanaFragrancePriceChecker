import { describe, expect, it, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { Browser } from 'playwright';
import {
  localBrowserRenderer,
  type LocalBrowserDeps,
  MAX_LOCAL_RENDER_PAGES_PER_RUN,
  MAX_LOCAL_RENDER_MS_PER_RUN,
  MAX_LOCAL_RENDER_MS_PER_SHOP,
} from '../src/catalogue/localBrowser.js';

/**
 * The budget and failure contracts are tested without a browser: they are
 * decided before one is ever launched, which is deliberate — a run that has
 * spent its budget should not pay Chromium's startup to find that out.
 *
 * The rendering contract needs a real browser and gets one, pointed at a local
 * HTTP server rather than a shop. No test here touches a retailer: this
 * sandbox cannot reach one (every such domain fails at the egress proxy with
 * `CONNECT tunnel failed, response 403`), and a test whose result depends on a
 * live storefront's mood is not a test.
 */

/**
 * Vitest's default 5s is not enough for anything that can reach a real browser.
 *
 * Launching Chromium costs a second or two. The case that actually broke the
 * crawl is the opposite one: a launch pointed at a path that does not exist
 * takes about five seconds to give up on a GitHub runner, where it returns
 * almost immediately in a warm local sandbox. Run #327 died on exactly that —
 * "Test before crawling" went red, so a harvest that would have been fine never
 * ran and the site's prices went stale for the cycle. The behaviour under test
 * was correct; only the budget for observing it was wrong.
 *
 * Applied to every test here that can launch, not just the one that failed: the
 * others passed at 1.5-4.7s on that same runner, which is not margin worth
 * relying on.
 */
const BROWSER_TEST_TIMEOUT_MS = 30_000;

/**
 * A scripted browser and a clock that only moves when the script moves it, for
 * the tests of the renderer's own accounting (the page budget, the run's time
 * budget, a shop's slice).
 *
 * Those tests used to start a real Chromium to make time pass, and so they
 * measured the machine as much as the code: under load a launch plus the
 * module's real settle waits ran past the 30s cap above (observed with the
 * full suite sharing the machine). What they assert is arithmetic over a clock,
 * so the clock is made explicit. Opening a page costs `pageMs` on it, and the
 * renderer's own waits (the politeness gap, the settle wait) advance it by the
 * amount they ask for, without waiting. Nothing here is a shortcut past a
 * behaviour: the renderer's code path is the production one, only the browser
 * and the clock under it are replaced. A real Chromium, a real server and real
 * waiting remain in 'localBrowserRenderer — rendering'.
 */
function scripted(pageMs = 700) {
  let clock = 1_000_000;
  const opened: string[] = [];
  let launches = 0;
  const page = () => {
    let at = '';
    return {
      goto: async (url: string) => {
        at = url;
        opened.push(url);
        clock += pageMs;
        return { status: () => 200 };
      },
      waitForLoadState: async () => undefined,
      content: async () => '<html><body>PAINTED</body></html>',
      url: () => at,
      close: async () => undefined,
    };
  };
  const browser = {
    newContext: async () => ({
      newPage: async () => page(),
      newCDPSession: async () => ({ send: async () => undefined }),
      close: async () => undefined,
    }),
    close: async () => undefined,
  } as unknown as Browser;
  const deps: LocalBrowserDeps = {
    launch: async () => {
      launches++;
      return browser;
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  };
  return {
    deps,
    opened,
    launches: () => launches,
    /** Time passing outside the renderer: the harvest off walking another shop's sitemap. */
    elapse: (ms: number) => {
      clock += ms;
    },
  };
}

const servers: Server[] = [];

afterAll(async () => {
  for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
});

/** A page whose product data exists only after JavaScript runs. */
async function jsPaintedServer(): Promise<string> {
  const server = createServer((req, res) => {
    if (req.url === '/gone') {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<html><body>gone</body></html>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      `<html><body><div id="grid">loading…</div><script>` +
        `setTimeout(function(){document.getElementById('grid').textContent='PAINTED-BY-JS';},200);` +
        `</script></body></html>`,
    );
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, r));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

describe('localBrowserRenderer — the per-run budget', () => {
  it('refuses every url once the budget is spent, without launching anything', async () => {
    // executablePath is deliberately nonsense. If this path tried to launch, it
    // would fail differently, which is the assertion.
    const r = localBrowserRenderer({ maxTotalPages: 0, executablePath: '/definitely/not/a/browser' });
    const out = await r.render(['https://example.test/a', 'https://example.test/b']);

    expect(out.size).toBe(2);
    for (const res of out.values()) {
      expect(res.ok).toBe(false);
      expect(res.status).toBe(0);
      expect(res.error).toContain('budget');
    }
    await r.dispose();
  });

  it('renders up to the budget and refuses the overflow in the same call', async () => {
    const browser = scripted();
    const r = localBrowserRenderer({ maxTotalPages: 1, gapMs: 10 }, browser.deps);

    const out = await r.render(['https://shop.test/one', 'https://shop.test/two']);
    expect(out.size).toBe(2);
    expect(out.get('https://shop.test/one')?.ok).toBe(true);
    expect(out.get('https://shop.test/two')?.ok).toBe(false);
    expect(out.get('https://shop.test/two')?.error).toContain('budget');
    // Only the page inside the budget was ever opened.
    expect(browser.opened).toEqual(['https://shop.test/one']);
    expect(r.used()).toBe(1);
    await r.dispose();
  });

  it('caps at a sane default rather than being unbounded', () => {
    // A bug that queued a whole sitemap must not hit a shop thousands of times
    // with a real browser.
    expect(MAX_LOCAL_RENDER_PAGES_PER_RUN).toBeGreaterThan(0);
    expect(MAX_LOCAL_RENDER_PAGES_PER_RUN).toBeLessThanOrEqual(100);
  });
});

describe('localBrowserRenderer — the time budget', () => {
  // The unit that is actually scarce. Run #328's sitemap harvest hit its own
  // 60-minute cap, so every second this tier spends is taken from shops that
  // were producing listings.
  it('refuses every url once the clock is spent, and says so', async () => {
    const browser = scripted();
    // 1ms: the first render call starts the clock and the budget is gone by
    // the time the second is asked for.
    const r = localBrowserRenderer({ maxTotalMs: 1, gapMs: 10 }, browser.deps);

    await r.render(['https://shop.test/one']);
    const out = await r.render(['https://shop.test/two']);
    const res = out.get('https://shop.test/two')!;

    expect(res.ok).toBe(false);
    expect(res.error).toContain('time budget');
    // Refused before any page was opened, not after.
    expect(browser.opened).toEqual(['https://shop.test/one']);
    await r.dispose();
  });

  it('reports every url it did not reach, rather than dropping them', async () => {
    const browser = scripted();
    const r = localBrowserRenderer({ maxTotalMs: 1, gapMs: 10 }, browser.deps);

    await r.render(['https://shop.test/warm']);
    const urls = ['https://shop.test/a', 'https://shop.test/b', 'https://shop.test/c'];
    const out = await r.render(urls);

    // A shop skipped for time and a shop that genuinely returned nothing must
    // not look the same from the outside.
    expect(out.size).toBe(3);
    for (const u of urls) expect(out.get(u)?.error).toContain('time budget');
    expect(browser.opened).toEqual(['https://shop.test/warm']);
    await r.dispose();
  });

  it('starts no clock on a renderer that is never asked to render', async () => {
    const r = localBrowserRenderer({ maxTotalMs: 1 });
    // Constructing is free; the budget must not already be spent by the time
    // the first real call arrives on a long run.
    expect(r.used()).toBe(0);
    await r.dispose();
  });

  it('bounds itself in both units', () => {
    expect(MAX_LOCAL_RENDER_PAGES_PER_RUN).toBeGreaterThan(0);
    expect(MAX_LOCAL_RENDER_MS_PER_RUN).toBeGreaterThan(0);
    // Small enough to be affordable inside a 60-minute harvest step that
    // already truncates.
    expect(MAX_LOCAL_RENDER_MS_PER_RUN).toBeLessThanOrEqual(10 * 60_000);
  });

  it('budgets enough time for the pages it budgets pages for', () => {
    /**
     * The defect this pins is run #330's: 12 pages allowed, 240s to render
     * them in, and a page measured at 7.4s at best and 32s as the code then
     * stood. Four shops rendered; four were refused every URL.
     *
     * 7,400ms is this sandbox's measured worst case for a page that never
     * reaches networkidle under the wait strategy this module now uses (a
     * 697KB, 2,500-image page over a local server at 120ms simulated
     * latency). What a real retailer costs over a real network could not be
     * measured here, so the budget carries 3x that as headroom rather than
     * sitting on the measurement.
     */
    const MEASURED_WORST_PAGE_MS = 7_400;
    expect(MAX_LOCAL_RENDER_MS_PER_RUN / MAX_LOCAL_RENDER_PAGES_PER_RUN).toBeGreaterThanOrEqual(
      MEASURED_WORST_PAGE_MS * 3,
    );
  });

  it('gives one shop a slice, not the run', () => {
    // A budget that only bounds the total makes sweep order into priority
    // order. The per-shop slice is what stops the first shops asked from
    // spending everything, which is what happened on run #330.
    expect(MAX_LOCAL_RENDER_MS_PER_SHOP).toBeGreaterThan(0);
    expect(MAX_LOCAL_RENDER_MS_PER_SHOP).toBeLessThan(MAX_LOCAL_RENDER_MS_PER_RUN);
  });

  it('charges only time spent rendering, not time between calls', async () => {
    const browser = scripted();
    const r = localBrowserRenderer({ gapMs: 10 }, browser.deps);

    await r.render(['https://shop.test/one']);
    const afterFirst = r.spentMs();
    expect(afterFirst).toBeGreaterThan(0);

    // Between two render() calls the harvest is off walking another shop's
    // sitemap. Charging that to this tier is exactly what spent 240s on four
    // shops' timeouts in run #330 while this module rendered nine pages.
    browser.elapse(5 * 60_000);
    expect(r.spentMs()).toBe(afterFirst);

    // And the next page is charged what it cost, not what the wait added.
    await r.render(['https://shop.test/two']);
    expect(r.spentMs()).toBe(afterFirst * 2);
    await r.dispose();
  });

  it("spends a shop's slice on that shop and leaves the next one its own", async () => {
    const browser = scripted();
    // 1ms: the first page of a call always renders, and the slice is gone by
    // the second — the same shape as the run budget test above, one level in.
    const r = localBrowserRenderer({ maxShopMs: 1, gapMs: 10 }, browser.deps);

    const first = await r.render(['https://shop.test/a', 'https://shop.test/b']);
    expect(first.get('https://shop.test/a')?.ok).toBe(true);
    expect(first.get('https://shop.test/b')?.ok).toBe(false);
    expect(first.get('https://shop.test/b')?.error).toContain('render slice');
    expect(browser.opened).toEqual(['https://shop.test/a']);

    // The next shop is a new call and gets its own slice, rather than
    // inheriting the exhaustion of the shop before it.
    const second = await r.render(['https://shop.test/c']);
    expect(second.get('https://shop.test/c')?.ok).toBe(true);
    expect(browser.opened).toEqual(['https://shop.test/a', 'https://shop.test/c']);
    // One browser for the whole run, not one per shop.
    expect(browser.launches()).toBe(1);
    await r.dispose();
  });
});

describe('localBrowserRenderer — a browser that will not start', () => {
  it('reports the failure per url instead of throwing', async () => {
    const r = localBrowserRenderer({ executablePath: '/definitely/not/a/browser' });
    const out = await r.render(['https://example.test/a', 'https://example.test/b']);

    expect(out.size).toBe(2);
    for (const res of out.values()) {
      expect(res.ok).toBe(false);
      expect(res.error).toContain('local browser unavailable');
    }
    await r.dispose();
  }, BROWSER_TEST_TIMEOUT_MS);

  it('does not count a page it never rendered against the budget', async () => {
    const r = localBrowserRenderer({ executablePath: '/definitely/not/a/browser' });
    await r.render(['https://example.test/a']);
    expect(r.used()).toBe(0);
    await r.dispose();
  }, BROWSER_TEST_TIMEOUT_MS);

  it('survives dispose() when nothing was ever launched', async () => {
    const r = localBrowserRenderer();
    await expect(r.dispose()).resolves.toBeUndefined();
    await expect(r.dispose()).resolves.toBeUndefined();
  });
});

/**
 * Playwright resolves its own browser on a CI runner after
 * `playwright install chromium`. In this sandbox the build lives at a pinned
 * path, so prefer that when it exists and fall back to Playwright's own
 * resolution everywhere else.
 */
function browserPath(): { executablePath?: string } {
  // Spread rather than returned as a possibly-undefined value: the repo builds
  // with exactOptionalPropertyTypes, under which passing `executablePath:
  // undefined` is not the same as omitting the key.
  const pinned = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  return existsSyncSafe(pinned) ? { executablePath: pinned } : {};
}

function existsSyncSafe(p: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('node:fs') as typeof import('node:fs')).existsSync(p);
  } catch {
    return false;
  }
}

describe('localBrowserRenderer — rendering', () => {
  it('returns markup only JavaScript could have produced', async () => {
    const base = await jsPaintedServer();
    const r = localBrowserRenderer({ gapMs: 10, ...browserPath() });

    const out = await r.render([`${base}/grid`]);
    const res = out.get(`${base}/grid`)!;

    if (res.error?.includes('local browser unavailable')) {
      // No browser in this environment. The contract that matters here is the
      // one already asserted above; skip rather than fail on a missing binary.
      expect(res.ok).toBe(false);
      await r.dispose();
      return;
    }

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    // The whole point of the tier: this string exists in no server response.
    expect(res.body).toContain('PAINTED-BY-JS');
    expect(r.used()).toBe(1);
    // A real render is charged real time, which the time budget is made of.
    expect(r.spentMs()).toBeGreaterThan(0);
    await r.dispose();
  }, BROWSER_TEST_TIMEOUT_MS);

  it('reports a real error status rather than calling it a failure to retrieve', async () => {
    const base = await jsPaintedServer();
    const r = localBrowserRenderer({ gapMs: 10, ...browserPath() });

    const out = await r.render([`${base}/gone`]);
    const res = out.get(`${base}/gone`)!;

    if (res.error?.includes('local browser unavailable')) {
      await r.dispose();
      return;
    }

    // A rendered 404 is a real answer from the shop, not a retrieval failure.
    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
    expect(res.error).toBeUndefined();
    await r.dispose();
  }, BROWSER_TEST_TIMEOUT_MS);
});

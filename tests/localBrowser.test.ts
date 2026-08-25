import { describe, expect, it, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { localBrowserRenderer, MAX_LOCAL_RENDER_PAGES_PER_RUN } from '../src/catalogue/localBrowser.js';

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
    const base = await jsPaintedServer();
    const r = localBrowserRenderer({ maxTotalPages: 1, gapMs: 10, ...browserPath() });

    const out = await r.render([`${base}/one`, `${base}/two`]);
    expect(out.size).toBe(2);
    // The overflow entry is refused for budget regardless of whether a browser
    // was available for the first one.
    expect(out.get(`${base}/two`)?.error).toContain('budget');
    await r.dispose();
  });

  it('caps at a sane default rather than being unbounded', () => {
    // A bug that queued a whole sitemap must not hit a shop thousands of times
    // with a real browser.
    expect(MAX_LOCAL_RENDER_PAGES_PER_RUN).toBeGreaterThan(0);
    expect(MAX_LOCAL_RENDER_PAGES_PER_RUN).toBeLessThanOrEqual(100);
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
  });

  it('does not count a page it never rendered against the budget', async () => {
    const r = localBrowserRenderer({ executablePath: '/definitely/not/a/browser' });
    await r.render(['https://example.test/a']);
    expect(r.used()).toBe(0);
    await r.dispose();
  });

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
    await r.dispose();
  });

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
  });
});

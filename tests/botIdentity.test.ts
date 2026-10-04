import { createServer, type Server } from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  BOT_HEADERS,
  BOT_USER_AGENT,
  METERED_TIERS_ENABLED,
  assertBotIdentity,
  botHeaders,
  dishonestHeaders,
  withBotIdentity,
} from '../src/catalogue/botIdentity.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { apifyProxyHttp } from '../src/catalogue/apifyProxy.js';
import { apifyActorRenderer } from '../src/catalogue/apifyActor.js';
import { localBrowserRenderer } from '../src/catalogue/localBrowser.js';
import { refusalIn } from '../src/catalogue/refusal.js';
import { ROUTE_HEADERS } from '../src/catalogue/sitemapCrawl.js';
import { ALL_STRATEGIES } from '../src/catalogue/strategy.js';
import { RETAILERS } from '../src/config/retailers.js';

/**
 * Owner's decision, 2026-10-04: every shop is read as PriceSniffsBot, with the
 * bot's user agent and honest headers, everywhere a shop is asked for anything.
 * A refusal is never worked around. These tests hold that.
 */

const root = resolve(import.meta.dirname, '..');

describe('who the bot says it is', () => {
  it('is one user agent that names the crawler and a page that explains it', () => {
    expect(BOT_USER_AGENT).toMatch(/^PriceSniffsBot\/\d/);
    expect(BOT_USER_AGENT).toContain('https://pricesniffs.space/about');
    expect(BOT_HEADERS['user-agent']).toBe(BOT_USER_AGENT);
    expect(ROUTE_HEADERS['user-agent']).toBe(BOT_USER_AGENT);
  });

  it('never claims to be a browser in its ordinary headers', () => {
    expect(dishonestHeaders(BOT_HEADERS)).toBeNull();
    for (const name of Object.keys(BOT_HEADERS)) expect(name).not.toMatch(/^sec-/);
  });

  it('refuses a browser user agent, a client hint, and the headers only a browser sends', () => {
    expect(dishonestHeaders({ 'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/124' })).toMatch(/not PriceSniffsBot/);
    expect(dishonestHeaders({ 'User-Agent': 'curl/8.5' })).toMatch(/not PriceSniffsBot/);
    expect(dishonestHeaders({ 'sec-ch-ua': '"Chromium";v="124"' })).toMatch(/only a browser sends/);
    expect(dishonestHeaders({ 'sec-fetch-mode': 'navigate' })).toMatch(/only a browser sends/);
    expect(dishonestHeaders({ 'upgrade-insecure-requests': '1' })).toMatch(/only a browser sends/);
    expect(() => assertBotIdentity({ 'user-agent': 'Mozilla/5.0' })).toThrow(/does not identify as PriceSniffsBot/);
  });

  it('allows what a bot may honestly send: a market cookie, a referer, a language, a type of answer', () => {
    expect(
      dishonestHeaders({ cookie: 'localization=GB', referer: 'https://pricesniffs.space/', 'accept-language': 'en-GB', accept: 'image/*' }),
    ).toBeNull();
    expect(botHeaders({ accept: 'application/json' })).toMatchObject({ 'user-agent': BOT_USER_AGENT, accept: 'application/json' });
  });

  it('adds its own user agent where a caller gave none, since a bare node fetch says "node"', () => {
    expect(withBotIdentity({ accept: '*/*' })['user-agent']).toBe(BOT_USER_AGENT);
    expect(withBotIdentity(undefined)['user-agent']).toBe(BOT_USER_AGENT);
    expect(withBotIdentity({ 'user-agent': BOT_USER_AGENT })['user-agent']).toBe(BOT_USER_AGENT);
  });
});

describe('every shared client sends as the bot', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('createHttp sends the bot user agent, adds it when missing, and does not send a disguise at all', async () => {
    const sent: Record<string, string>[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: { headers: Record<string, string> }) => {
      sent.push(init.headers);
      return new Response('ok', { status: 200 });
    });
    const http = createHttp();
    expect((await http('https://shop.example/a', { accept: 'text/html' })).ok).toBe(true);
    expect((await http('https://shop.example/b', BOT_HEADERS)).ok).toBe(true);
    expect(sent.map((h) => h['user-agent'])).toEqual([BOT_USER_AGENT, BOT_USER_AGENT]);

    const refused = await http('https://shop.example/c', { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/124' });
    expect(refused.ok).toBe(false);
    expect(refused.status).toBe(0);
    expect(refused.error).toMatch(/does not identify as PriceSniffsBot/);
    expect(sent).toHaveLength(2);
  });

  it('the proxy client refuses a disguise before it spends a request on it', async () => {
    const http = apifyProxyHttp({ password: 'x', country: 'GB', sessionId: 's' } as Parameters<typeof apifyProxyHttp>[0], 1);
    const res = await http('https://shop.example/', { 'user-agent': 'Mozilla/5.0 Chrome/124' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/does not identify as PriceSniffsBot/);
  });
});

describe('a refusal is not worked around', () => {
  it('the paid tiers are off: no residential proxy, no browser actor', async () => {
    expect(METERED_TIERS_ENABLED).toBe(false);
    const actor = apifyActorRenderer({ token: 't', country: 'GB' } as Parameters<typeof apifyActorRenderer>[0]);
    const out = await actor.render(['https://shop.example/a']);
    expect(out.get('https://shop.example/a')).toMatchObject({ ok: false, status: 0 });
    expect(out.get('https://shop.example/a')!.error).toMatch(/tier is off/);
  });

  it('the plan has no second way of asking in a browser\'s clothes', () => {
    expect(ALL_STRATEGIES).not.toContain('section-browser-headers');
    for (const r of RETAILERS) expect('botIdentityOnly' in r, r.id).toBe(false);
  });

  it('reads an HTTP 401, 403, 407 or 429 as a refusal, and nothing else as one', () => {
    expect(refusalIn(['https://www.notino.co.uk/sitemap.xml: HTTP 403'])).toContain('HTTP 403');
    expect(refusalIn(['x: HTTP 429'])).toBe('x: HTTP 429');
    expect(refusalIn(['x: HTTP 401'])).not.toBeNull();
    expect(refusalIn(['x: HTTP 407'])).not.toBeNull();
    for (const calm of ['x: HTTP 404', 'x: HTTP 500', 'x: HTTP 503', 'x: HTTP 0 timed out', 'no fragrance URLs found in sitemap']) {
      expect(refusalIn([calm]), calm).toBeNull();
    }
  });

  it('the harvest asks one way, never retries a refusal through a proxy or a browser, and never reads robots.txt through a browser', () => {
    const harvest = readFileSync(join(root, 'scripts/catalogue-harvest.ts'), 'utf8');
    expect(harvest).not.toMatch(/BROWSER_HEADERS|asBotOnly|ROBOTS_FALLBACK|robotsHeaderVariants|robotsTextFromRenderedHtml/);
    expect(harvest).toContain('const shopHeaders = BOT_HEADERS;');
    // The proxy tier and the render tier are both closed to a shop that refused.
    expect(harvest).toMatch(/useProxy && !refusedBot/);
    expect(harvest).toMatch(/!skipRender && !refusedBot/);
    const probe = readFileSync(join(root, 'scripts/catalogue-probe.ts'), 'utf8');
    expect(probe).not.toMatch(/BROWSER_HEADERS|botOnly|robotsHeaderVariants/);
  });
});

describe('no source file presents as a browser', () => {
  /** Every .ts under a folder, tests and generated data excluded. */
  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) out.push(...sources(path));
      else if (name.endsWith('.ts') && !name.endsWith('.generated.ts')) out.push(path);
    }
    return out;
  }
  const files = [...sources(join(root, 'src')), ...sources(join(root, 'scripts'))];

  it('has no browser user agent string in src/ or scripts/', () => {
    const offenders = files.filter((f) => /Mozilla\/\d/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });

  it('has no BROWSER_HEADERS or browser UA constant left', () => {
    // The registry's dated comments record the old header set by name; they are history, not code.
    const offenders = files
      .filter((f) => !f.endsWith('src/config/retailers.ts'))
      .filter((f) => /\bBROWSER_HEADERS\b|\bBROWSER_UA\b|RENDER_USER_AGENT\s*=\s*'/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });

  it('writes the bot\'s user agent in one place only', () => {
    const offenders = files
      .filter((f) => /PriceSniffsBot\/\d/.test(readFileSync(f, 'utf8')) && !f.endsWith('src/catalogue/botIdentity.ts'))
      .map((f) => f.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });
});

describe('the local browser render says PriceSniffsBot and nothing else about itself', () => {
  const servers: Server[] = [];
  afterAll(async () => {
    for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
  });

  it('sends the bot user agent and no client hints (a real Chromium, a local server)', async () => {
    const seen: Record<string, string | string[] | undefined>[] = [];
    const server = createServer((req, res) => {
      seen.push({ ...req.headers });
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><h1>hello</h1></body></html>');
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;

    const renderer = localBrowserRenderer({ gapMs: 0 });
    try {
      const out = await renderer.render([`http://localhost:${port}/page`]);
      expect([...out.values()][0]?.ok).toBe(true);
    } finally {
      await renderer.dispose();
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const h of seen) {
      expect(h['user-agent']).toBe(BOT_USER_AGENT);
      // Chromium would send "HeadlessChrome" and a platform it is not on.
      expect(Object.keys(h).filter((n) => n.startsWith('sec-ch-'))).toEqual([]);
    }
  }, 60_000);
});

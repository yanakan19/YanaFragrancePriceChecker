import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Same shape as tests/apifyProxy.test.ts, and the same caveat: these exercise
 * request-building and budget gating only, against a mocked global `fetch`.
 * There is no Apify credential in this environment to test the actual API
 * call against, and apifyActor.ts says plainly that nothing here has run
 * against Apify's real infrastructure.
 */

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const {
  apifyActorConfigFromEnv,
  renderPagesViaApifyActor,
  apifyActorRenderer,
  MAX_ACTOR_PAGES_PER_RUN,
  FALLBACK_ACTOR_ID,
  ACTOR_APPROVAL_REFUSAL,
  ACTOR_CALL_TIMEOUT_MS,
} = await import('../src/catalogue/apifyActor.js');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('apifyActorConfigFromEnv', () => {
  it('is null with no token set', () => {
    expect(apifyActorConfigFromEnv({})).toBeNull();
  });

  it('reads the token and defaults country and actor', () => {
    const config = apifyActorConfigFromEnv({ APIFY_TOKEN: 'tok123' });
    expect(config).toEqual({
      token: 'tok123',
      country: 'GB',
      actorId: 'apify~puppeteer-scraper',
      fallbackActorId: FALLBACK_ACTOR_ID,
    });
  });

  it('falls back to the proxy country before the GB default', () => {
    const config = apifyActorConfigFromEnv({ APIFY_TOKEN: 'tok123', APIFY_PROXY_COUNTRY: 'IE' });
    expect(config?.country).toBe('IE');
  });

  it('respects its own country and actor overrides', () => {
    const config = apifyActorConfigFromEnv({
      APIFY_TOKEN: 'tok123',
      APIFY_PROXY_COUNTRY: 'IE',
      APIFY_ACTOR_COUNTRY: 'GB',
      APIFY_ACTOR_ID: 'someoneelse~scraper',
    });
    expect(config?.country).toBe('GB');
    expect(config?.actorId).toBe('someoneelse~scraper');
    // An explicitly named actor is honoured as named. Quietly running a
    // different one than the one asked for would be worse than failing.
    expect(config?.fallbackActorId).toBeNull();
  });
});

describe('renderPagesViaApifyActor', () => {
  const config = { token: 'tok123', country: 'GB', actorId: 'apify~puppeteer-scraper', fallbackActorId: null };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns nothing and calls fetch nothing for an empty url list', async () => {
    const results = await renderPagesViaApifyActor(config, []);
    expect(results.size).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('maps each returned dataset item back onto its url', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse([
        { url: 'https://shop.example/a', html: '<html>a</html>', status: 200 },
        { url: 'https://shop.example/b', html: '<html>b</html>', status: 200 },
      ]),
    );

    const results = await renderPagesViaApifyActor(config, [
      'https://shop.example/a',
      'https://shop.example/b',
    ]);

    expect(results.get('https://shop.example/a')).toEqual({
      status: 200,
      body: '<html>a</html>',
      ok: true,
    });
    expect(results.get('https://shop.example/b')?.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // The token travels in the query string, never logged or thrown, but has
    // to actually be there for the call to authenticate.
    const [calledUrl, init] = mockFetch.mock.calls[0]!;
    expect(String(calledUrl)).toContain('token=tok123');
    expect(String(calledUrl)).toContain('apify~puppeteer-scraper');
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.startUrls).toEqual([{ url: 'https://shop.example/a' }, { url: 'https://shop.example/b' }]);
    expect(sentBody.proxyConfiguration).toEqual({
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL'],
      apifyProxyCountry: 'GB',
    });
  });

  it('reports a url the actor never returned an item for, rather than dropping it silently', async () => {
    mockFetch.mockResolvedValue(jsonResponse([{ url: 'https://shop.example/a', html: '<html>a</html>' }]));

    const results = await renderPagesViaApifyActor(config, [
      'https://shop.example/a',
      'https://shop.example/missing',
    ]);

    expect(results.get('https://shop.example/a')?.ok).toBe(true);
    expect(results.get('https://shop.example/missing')).toEqual({
      status: 0,
      body: '',
      ok: false,
      error: 'actor returned no item for this URL',
    });
  });

  it('fails every url closed on a non-ok HTTP response, without throwing', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'nope' }, 402));
    const results = await renderPagesViaApifyActor(config, ['https://shop.example/a']);
    expect(results.get('https://shop.example/a')).toEqual({
      status: 402,
      body: '',
      ok: false,
      // The reason Apify gave, not just the status. This is the most
      // expensive tier in the pipeline and the one place where "it failed"
      // without a reason costs money to ask again.
      error: 'Apify actor run failed: HTTP 402 — {"error":"nope"}',
    });
  });

  it('reports an error envelope wearing a 2xx rather than calling it zero listings', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: { type: 'actor-not-found' } }));
    const results = await renderPagesViaApifyActor(config, ['https://shop.example/a']);
    const res = results.get('https://shop.example/a');
    expect(res?.ok).toBe(false);
    expect(res?.error).toContain('actor-not-found');
  });

  it('does not call a Puppeteer helper that current Puppeteer no longer has', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));
    await renderPagesViaApifyActor(config, ['https://shop.example/a']);
    const body = JSON.parse(String(mockFetch.mock.calls[0]![1]!.body)) as { pageFunction: string };
    // Removed in Puppeteer 22. Calling it makes the page function throw, the
    // actor writes no dataset item, and the caller cannot tell that from a
    // page that genuinely rendered nothing.
    expect(body.pageFunction).not.toContain('waitForTimeout');
    expect(body.pageFunction).toContain('setTimeout');
  });

  it('fails every url closed on a network error, without throwing', async () => {
    mockFetch.mockRejectedValueOnce(new Error('connection reset'));
    const results = await renderPagesViaApifyActor(config, ['https://shop.example/a']);
    const res = results.get('https://shop.example/a');
    expect(res?.ok).toBe(false);
    expect(res?.error).toContain('connection reset');
  });

  it('caps the batch at maxPages and marks the overflow as budget-exhausted, without calling fetch for it', async () => {
    mockFetch.mockResolvedValue(jsonResponse([{ url: 'https://shop.example/a', html: '<html/>' }]));
    const results = await renderPagesViaApifyActor(
      config,
      ['https://shop.example/a', 'https://shop.example/b'],
      1,
    );
    expect(results.get('https://shop.example/a')?.ok).toBe(true);
    expect(results.get('https://shop.example/b')?.error).toContain('budget');
    const sentBody = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(sentBody.startUrls).toEqual([{ url: 'https://shop.example/a' }]);
  });
});

describe('apifyActorRenderer running total', () => {
  const config = { token: 'tok123', country: 'GB', actorId: 'apify~puppeteer-scraper', fallbackActorId: null };

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (url: unknown, init: unknown) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const items = (body.startUrls as Array<{ url: string }>).map((s) => ({ url: s.url, html: '<html/>' }));
      return jsonResponse(items);
    });
  });

  it('spends down a shared budget across multiple shops in one run', async () => {
    const renderer = apifyActorRenderer(config, 3);

    const first = await renderer.render(['https://a.example/1', 'https://a.example/2']);
    expect([...first.values()].every((r) => r.ok)).toBe(true);
    expect(renderer.used()).toBe(2);

    const second = await renderer.render(['https://b.example/1', 'https://b.example/2']);
    expect(second.get('https://b.example/1')?.ok).toBe(true);
    expect(second.get('https://b.example/2')?.error).toContain('budget');
    expect(renderer.used()).toBe(3);
  });

  it('refuses without calling fetch once the budget is fully spent', async () => {
    const renderer = apifyActorRenderer(config, 1);
    await renderer.render(['https://a.example/1']);
    mockFetch.mockClear();

    const third = await renderer.render(['https://a.example/2']);
    expect(third.get('https://a.example/2')?.error).toContain('budget');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('defaults to the module wide cap', () => {
    expect(MAX_ACTOR_PAGES_PER_RUN).toBe(10);
  });
});

/**
 * The wall the first real actor run hit: apify/puppeteer-scraper takes a
 * pageFunction, so Apify classes it as needing full account access and
 * refuses to start it until a human approves it once in the console. Probe
 * run 11, job 96345230824.
 */
describe('the approval refusal, and the actor that takes no user code', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const withFallback = {
    token: 'tok123',
    country: 'GB',
    actorId: 'apify~puppeteer-scraper',
    fallbackActorId: FALLBACK_ACTOR_ID,
  };

  const refusal = () =>
    new Response(JSON.stringify({ error: { type: ACTOR_APPROVAL_REFUSAL, message: 'approve it' } }), {
      status: 403,
    });

  it('tries the code-free actor when the first one is refused for approval', async () => {
    mockFetch
      .mockResolvedValueOnce(refusal())
      .mockResolvedValueOnce(jsonResponse([{ url: 'https://shop.example/a', html: '<html>a</html>' }]));

    const results = await renderPagesViaApifyActor(withFallback, ['https://shop.example/a']);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[1]![0])).toContain(FALLBACK_ACTOR_ID);
    expect(results.get('https://shop.example/a')?.ok).toBe(true);
  });

  it('does not try a second actor for any other failure, which would fail the same way twice', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: { type: 'rate-limit-exceeded' } }, 429));
    await renderPagesViaApifyActor(withFallback, ['https://shop.example/a']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not try a second actor when the first one worked', async () => {
    mockFetch.mockResolvedValue(jsonResponse([{ url: 'https://shop.example/a', html: '<html>a</html>' }]));
    await renderPagesViaApifyActor(withFallback, ['https://shop.example/a']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reports the approval refusal when the fallback is refused too, so the owner sees what to click', async () => {
    // A fresh Response per call: a body can only be read once.
    mockFetch.mockImplementation(async () => refusal());
    const results = await renderPagesViaApifyActor(withFallback, ['https://shop.example/a']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(results.get('https://shop.example/a')?.error).toContain(ACTOR_APPROVAL_REFUSAL);
  });

  it('asks the code-free actor for raw HTML, not the readable prose it defaults to', async () => {
    mockFetch
      .mockResolvedValueOnce(refusal())
      .mockResolvedValueOnce(jsonResponse([]));
    await renderPagesViaApifyActor(withFallback, ['https://shop.example/a']);

    const body = JSON.parse(String(mockFetch.mock.calls[1]![1]!.body)) as Record<string, unknown>;
    expect(body.saveHtml).toBe(true);
    // Both of these default to stripping the page to prose, which deletes
    // every <script type="application/ld+json"> — the only thing being
    // looked for.
    expect(body.htmlTransformer).toBe('none');
    expect(body.removeElementsCssSelector).toBe('');
    // Page one of each section and no further.
    expect(body.maxCrawlDepth).toBe(0);
    expect(body.crawlerType).toBe('playwright:chrome');
    expect(body.proxyConfiguration).toEqual({
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL'],
      apifyProxyCountry: 'GB',
    });
  });
});

describe('the budget charges only for work Apify actually took on', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const cfg = { token: 'tok', country: 'GB', actorId: 'apify~puppeteer-scraper', fallbackActorId: null };

  it('spends nothing when the run is refused before it starts', async () => {
    mockFetch.mockImplementation(
      async () => new Response(JSON.stringify({ error: { type: ACTOR_APPROVAL_REFUSAL } }), { status: 403 }),
    );
    const renderer = apifyActorRenderer(cfg);
    await renderer.render(['https://a.test/1', 'https://a.test/2', 'https://a.test/3', 'https://a.test/4']);
    // Probe run 12 reported "4 of 10 budgeted" having rendered nothing at all.
    expect(renderer.used()).toBe(0);
  });

  it('still spends the budget on pages that really were rendered', async () => {
    mockFetch.mockImplementation(async () =>
      new Response(JSON.stringify([{ url: 'https://a.test/1', html: '<html>x</html>' }]), { status: 200 }),
    );
    const renderer = apifyActorRenderer(cfg);
    await renderer.render(['https://a.test/1', 'https://a.test/2']);
    // Both were handed to a run that started; the second simply came back empty,
    // which is a rendering outcome and is billed like one.
    expect(renderer.used()).toBe(2);
  });
});

describe('a call that never comes back cannot hold up the sweep', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  it('abandons the call and reports it, rather than waiting forever', async () => {
    // Probe run 19 (job 96350053274) hung well past the abort signal's own
    // deadline and was killed by the job cap. In the scheduled sweep that
    // would take down every shop after it.
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const pending = renderPagesViaApifyActor(
      { token: 'tok', country: 'GB', actorId: 'apify~puppeteer-scraper', fallbackActorId: null },
      ['https://a.test/1'],
    );
    await vi.advanceTimersByTimeAsync(ACTOR_CALL_TIMEOUT_MS + 6_000);
    const results = await pending;

    const res = results.get('https://a.test/1');
    expect(res?.ok).toBe(false);
    expect(res?.error).toContain('exceeded');
    // Abandoning a call that never started billing is not spending.
    expect(res?.status).toBe(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * These tests exercise the gating and budget logic only. They mock undici's
 * fetch so no real network call happens, and there is no Apify credential in
 * this environment to test the actual proxy handshake against. That
 * verification can only happen with a real APIFY_PROXY_PASSWORD, which is why
 * apifyProxy.ts says plainly that it has not been run against Apify's
 * infrastructure.
 */

const mockFetch = vi.fn();

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return { ...actual, fetch: (...args: unknown[]) => mockFetch(...args) };
});

const { apifyProxyConfigFromEnv, apifyProxyHttp, MAX_PROXIED_REQUESTS_PER_RUN } = await import(
  '../src/catalogue/apifyProxy.js'
);

describe('apifyProxyConfigFromEnv', () => {
  it('is null with no password set', () => {
    expect(apifyProxyConfigFromEnv({})).toBeNull();
  });

  it('reads the password and defaults country and session', () => {
    const config = apifyProxyConfigFromEnv({ APIFY_PROXY_PASSWORD: 'secret123' });
    expect(config).toEqual({ password: 'secret123', country: 'GB', sessionId: 'scentday1' });
  });

  it('respects overrides for country and session', () => {
    const config = apifyProxyConfigFromEnv({
      APIFY_PROXY_PASSWORD: 'secret123',
      APIFY_PROXY_COUNTRY: 'IE',
      APIFY_PROXY_SESSION: 'run42',
    });
    expect(config?.country).toBe('IE');
    expect(config?.sessionId).toBe('run42');
  });
});

describe('apifyProxyHttp budget', () => {
  const config = { password: 'secret123', country: 'GB', sessionId: 'test' };

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(new Response('<html></html>', { status: 200 }));
  });

  it('makes a request while under budget', async () => {
    const http = apifyProxyHttp(config, 3);
    const res = await http('https://shop.example/fragrance', {});
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refuses once the budget is spent, without ever calling fetch again', async () => {
    const http = apifyProxyHttp(config, 2);
    await http('https://shop.example/a', {});
    await http('https://shop.example/b', {});
    const third = await http('https://shop.example/c', {});

    expect(third.ok).toBe(false);
    expect(third.error).toContain('budget');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('defaults to the module wide cap', async () => {
    const http = apifyProxyHttp(config);
    for (let i = 0; i < MAX_PROXIED_REQUESTS_PER_RUN; i++) {
      await http(`https://shop.example/${i}`, {});
    }
    const overBudget = await http('https://shop.example/over', {});
    expect(overBudget.ok).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(MAX_PROXIED_REQUESTS_PER_RUN);
  });

  it('reports a network failure without crashing', async () => {
    mockFetch.mockRejectedValueOnce(new Error('connection reset'));
    const http = apifyProxyHttp(config, 5);
    const res = await http('https://shop.example/x', {});
    expect(res.ok).toBe(false);
    expect(res.error).toContain('connection reset');
  });
});

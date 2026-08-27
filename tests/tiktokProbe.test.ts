import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_RATE_LIMIT_RETRIES,
  redact,
  refreshTokenDidRotate,
  retryDelayMs,
  sign,
  signedGet,
} from '../scripts/tiktok-probe.js';

/**
 * scripts/tiktok-probe.ts cannot be verified against a real TikTok response
 * in this sandbox (no egress to TikTok's API, no real credentials — see the
 * file's own header and docs/TIKTOK-SHOP-PLAN.md §7). What these tests cover
 * instead is everything that does not require TikTok to actually answer:
 * the signature this repo computes, the redaction it applies before writing
 * anything to disk, the rotation flag, and the bounded 429 retry — each of
 * these is deterministic, self-contained logic that a mocked fetch can
 * exercise honestly.
 */

describe('sign', () => {
  it('matches the EcomPHP/tiktokshop-php SDK algorithm by construction: secret + path + sorted "{key}{value}" concat + body + secret, HMAC-SHA256 keyed with the secret', () => {
    const path = '/affiliate_creator/202405/profiles';
    const query = { app_key: 'ak123', timestamp: '1700000000' };
    const secret = 's3cr3t';
    const expected = createHmac('sha256', secret)
      .update(`${secret}${path}app_key${query.app_key}timestamp${query.timestamp}${secret}`)
      .digest('hex');
    expect(sign(path, query, secret)).toBe(expected);
  });

  it('sorts query keys before concatenation, so field order in the object never changes the signature', () => {
    const path = '/x';
    const secret = 'shh';
    const a = sign(path, { b: '2', a: '1' }, secret);
    const b = sign(path, { a: '1', b: '2' }, secret);
    expect(a).toBe(b);
  });

  it('excludes sign and access_token from what gets signed, per the documented exclusion list', () => {
    const path = '/x';
    const secret = 'shh';
    const withoutExtras = sign(path, { app_key: 'ak' }, secret);
    const withExtras = sign(
      path,
      { app_key: 'ak', sign: 'whatever-was-here-before', access_token: 'at-1' },
      secret,
    );
    expect(withExtras).toBe(withoutExtras);
  });

  it('folds in the request body for non-GET signing', () => {
    const path = '/x';
    const secret = 'shh';
    const noBody = sign(path, { app_key: 'ak' }, secret);
    const withBody = sign(path, { app_key: 'ak' }, secret, '{"a":1}');
    expect(withBody).not.toBe(noBody);
  });
});

describe('redact', () => {
  it('replaces any key that looks like a credential, at any depth', () => {
    const out = redact({
      access_token: 'live-secret-value',
      nested: { refresh_token: 'also-secret', ok: 'fine' },
      list: [{ app_secret: 'sekrit' }, { title: 'a real product' }],
      cipher_text: 'x',
      password_hint: 'y',
    }) as Record<string, unknown>;

    expect(out['access_token']).toBe('[redacted]');
    expect((out['nested'] as Record<string, unknown>)['refresh_token']).toBe('[redacted]');
    expect((out['nested'] as Record<string, unknown>)['ok']).toBe('fine');
    expect((out['list'] as Record<string, unknown>[])[0]!['app_secret']).toBe('[redacted]');
    expect((out['list'] as Record<string, unknown>[])[1]!['title']).toBe('a real product');
    expect(out['cipher_text']).toBe('[redacted]');
    expect(out['password_hint']).toBe('[redacted]');
  });

  it('leaves ordinary product-shaped data untouched', () => {
    const data = { product_id: '123', title: 'Fragrance 100ml', price: { amount: '49.99' } };
    expect(redact(data)).toEqual(data);
  });

  it('passes through primitives and null unchanged', () => {
    expect(redact(null)).toBeNull();
    expect(redact(42)).toBe(42);
    expect(redact('plain string')).toBe('plain string');
  });
});

describe('refreshTokenDidRotate', () => {
  it('is false when TikTok hands back the same refresh token', () => {
    expect(refreshTokenDidRotate('rt-1', 'rt-1')).toBe(false);
  });

  it('is true only for a different, non-empty refresh token', () => {
    expect(refreshTokenDidRotate('rt-1', 'rt-2')).toBe(true);
  });

  it('is false when the response omits refresh_token entirely or sends garbage', () => {
    expect(refreshTokenDidRotate('rt-1', undefined)).toBe(false);
    expect(refreshTokenDidRotate('rt-1', '')).toBe(false);
    expect(refreshTokenDidRotate('rt-1', 42)).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('honours a Retry-After header given in seconds', () => {
    expect(retryDelayMs('2', 0)).toBe(2000);
  });

  it('honours a Retry-After header given as an HTTP-date', () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const delay = retryDelayMs(future, 0);
    expect(delay).toBeGreaterThan(3000);
    expect(delay).toBeLessThanOrEqual(5000);
  });

  it('falls back to bounded exponential backoff when the header is absent or unusable', () => {
    expect(retryDelayMs(null, 0)).toBe(500);
    expect(retryDelayMs(null, 1)).toBe(1000);
    expect(retryDelayMs(null, 2)).toBe(2000);
    expect(retryDelayMs('not-a-real-value', 0)).toBe(500);
  });
});

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('signedGet — the bounded 429 retry', () => {
  it('adapts to a single 429 by retrying once and returning the eventual success', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { code: 99, message: 'rate limited' }))
      .mockResolvedValueOnce(jsonResponse(200, { code: 0, message: 'ok', data: { hello: 'world' } }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    const call = await signedGet('creator profile', '/affiliate_creator/202405/profiles', 'ak', 'as', 'at', {
      fetchImpl,
      sleepImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledTimes(1);
    expect(call.rateLimited).toBe(true);
    expect(call.retries).toBe(1);
    expect(call.httpStatus).toBe(200);
    expect(call.code).toBe(0);
    expect(call.data).toEqual({ hello: 'world' });
  });

  it('never loops forever: stops after MAX_RATE_LIMIT_RETRIES and reports the last 429', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(429, { code: 99, message: 'still limited' }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    const call = await signedGet('showcase products', '/affiliate_creator/202405/showcases/products', 'ak', 'as', 'at', {
      fetchImpl,
      sleepImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(MAX_RATE_LIMIT_RETRIES + 1);
    expect(sleepImpl).toHaveBeenCalledTimes(MAX_RATE_LIMIT_RETRIES);
    expect(call.rateLimited).toBe(true);
    expect(call.retries).toBe(MAX_RATE_LIMIT_RETRIES);
    expect(call.httpStatus).toBe(429);
    expect(call.code).toBe(99);
  });

  it('respects a Retry-After header on the 429 rather than always using backoff', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { code: 99 }, { 'retry-after': '7' }))
      .mockResolvedValueOnce(jsonResponse(200, { code: 0, data: {} }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await signedGet('creator profile', '/affiliate_creator/202405/profiles', 'ak', 'as', 'at', {
      fetchImpl,
      sleepImpl,
    });

    expect(sleepImpl).toHaveBeenCalledWith(7000);
  });

  it('does not retry on a non-429 error status, and redacts token-like fields in the response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { code: 0, data: { access_token: 'leaked-if-not-redacted' } }));
    const sleepImpl = vi.fn();

    const call = await signedGet('creator profile', '/affiliate_creator/202405/profiles', 'ak', 'as', 'at', {
      fetchImpl,
      sleepImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
    expect(call.rateLimited).toBe(false);
    expect(call.data).toEqual({ access_token: '[redacted]' });
  });

  it('reports a non-JSON response as an error rather than crashing', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('<html>not json</html>', { status: 200 }));
    const call = await signedGet('creator profile', '/affiliate_creator/202405/profiles', 'ak', 'as', 'at', {
      fetchImpl,
      sleepImpl: vi.fn(),
    });
    expect(call.error).toContain('not JSON');
  });

  it('reports a thrown network error without crashing', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('connection reset'));
    const call = await signedGet('creator profile', '/affiliate_creator/202405/profiles', 'ak', 'as', 'at', {
      fetchImpl,
      sleepImpl: vi.fn(),
    });
    expect(call.error).toBe('connection reset');
    expect(call.httpStatus).toBeNull();
  });
});

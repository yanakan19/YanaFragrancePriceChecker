import { describe, it, expect } from 'vitest';
import {
  robotsCandidateUrls,
  readRobotsResponse,
  resolveRobotsReadings,
  loadRobotsResilient,
} from '../src/catalogue/robotsSource.js';
import { isAllowed } from '../src/catalogue/robots.js';
import type { HttpResponse } from '../src/catalogue/attempt.js';

/**
 * The bug being pinned: attempt.ts's `loadRobots` asks `www.{domain}` and only
 * that, so a registry entry whose domain already carries a subdomain gets a
 * hostname that need not resolve — and an unresolvable host reads as
 * "unreachable", which `isAllowed` treats as everything disallowed, silently.
 * Two enabled shops are in exactly that shape.
 */
describe('robotsCandidateUrls', () => {
  it('asks the shop own origin first for a subdomained registry entry', () => {
    expect(
      robotsCandidateUrls({
        domain: 'uk.shopfrenchavenue.com',
        homepage: 'https://uk.shopfrenchavenue.com',
      }),
    ).toEqual([
      'https://uk.shopfrenchavenue.com/robots.txt',
      // Kept, but demoted: this is the address that does not resolve, and
      // asking it first is the whole bug.
      'https://www.uk.shopfrenchavenue.com/robots.txt',
    ]);
  });

  it('costs an ordinary apex shop the www address it always used', () => {
    const urls = robotsCandidateUrls({ domain: 'boots.com', homepage: 'https://www.boots.com' });
    expect(urls[0]).toBe('https://www.boots.com/robots.txt');
  });

  it('never repeats an address', () => {
    const urls = robotsCandidateUrls({ domain: 'armaf.uk', homepage: 'https://armaf.uk' });
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('still offers the domain candidates when the homepage will not parse', () => {
    expect(robotsCandidateUrls({ domain: 'armaf.uk', homepage: 'not a url' })).toEqual([
      'https://www.armaf.uk/robots.txt',
      'https://armaf.uk/robots.txt',
    ]);
  });
});

describe('readRobotsResponse', () => {
  it('parses a published file', () => {
    const reading = readRobotsResponse({ ok: true, status: 200, body: 'User-agent: *\nDisallow: /cart' });
    expect(reading.kind).toBe('rules');
    if (reading.kind === 'rules') {
      expect(isAllowed(reading.rules, 'https://x.test/cart')).toBe(false);
      expect(isAllowed(reading.rules, 'https://x.test/products/a')).toBe(true);
    }
  });

  it('reads a 4xx as no file published, not as a refusal', () => {
    expect(readRobotsResponse({ ok: false, status: 404, body: '' })).toEqual({ kind: 'absent' });
  });

  it('reads a server error or a dead host as telling us nothing', () => {
    expect(readRobotsResponse({ ok: false, status: 503, body: '' })).toEqual({ kind: 'unreachable' });
    expect(readRobotsResponse({ ok: false, status: 0, body: '' })).toEqual({ kind: 'unreachable' });
  });
});

describe('resolveRobotsReadings', () => {
  it('takes a published file wherever it turns up', () => {
    const rules = resolveRobotsReadings([
      { kind: 'unreachable' },
      readRobotsResponse({ ok: true, status: 200, body: 'User-agent: *\nDisallow: /admin' }),
    ]);
    expect(isAllowed(rules, 'https://x.test/admin')).toBe(false);
  });

  it('treats a 4xx from any candidate as no restrictions', () => {
    const rules = resolveRobotsReadings([{ kind: 'unreachable' }, { kind: 'absent' }]);
    expect(isAllowed(rules, 'https://x.test/anything')).toBe(true);
  });

  it('holds off only when every candidate was unreachable', () => {
    const rules = resolveRobotsReadings([{ kind: 'unreachable' }, { kind: 'unreachable' }]);
    expect(rules.unavailable).toBe(true);
    expect(isAllowed(rules, 'https://x.test/anything')).toBe(false);
  });

  it('holds off when nothing was asked at all', () => {
    expect(resolveRobotsReadings([]).unavailable).toBe(true);
  });
});

const res = (over: Partial<HttpResponse>): HttpResponse => ({ ok: false, status: 0, body: '', ...over });

describe('loadRobotsResilient', () => {
  it('recovers the subdomained shop that www.{domain} could never reach', async () => {
    const asked: string[] = [];
    const http = async (url: string) => {
      asked.push(url);
      if (url === 'https://uk.shopfrenchavenue.com/robots.txt') {
        return res({ ok: true, status: 200, body: 'User-agent: *\nAllow: /' });
      }
      // What DNS failure looks like through createHttp.
      return res({ status: 0, error: 'fetch failed' });
    };

    const rules = await loadRobotsResilient(
      { domain: 'uk.shopfrenchavenue.com', homepage: 'https://uk.shopfrenchavenue.com' },
      http,
      {},
    );

    expect(rules.unavailable).toBe(false);
    expect(isAllowed(rules, 'https://uk.shopfrenchavenue.com/products.json?limit=250&page=1')).toBe(true);
    expect(asked).toEqual(['https://uk.shopfrenchavenue.com/robots.txt']);
  });

  it('stops at the first published file, so an apex shop still costs one request', async () => {
    const asked: string[] = [];
    const http = async (url: string) => {
      asked.push(url);
      return res({ ok: true, status: 200, body: 'User-agent: *\nDisallow: /checkout' });
    };
    await loadRobotsResilient({ domain: 'boots.com', homepage: 'https://www.boots.com' }, http, {});
    expect(asked).toEqual(['https://www.boots.com/robots.txt']);
  });

  it('falls through to the bare domain when www is dead and the homepage is www', async () => {
    const http = async (url: string) =>
      url === 'https://example-shop.test/robots.txt'
        ? res({ ok: true, status: 200, body: 'User-agent: *\nDisallow: /basket' })
        : res({ status: 0, error: 'fetch failed' });

    const rules = await loadRobotsResilient(
      { domain: 'example-shop.test', homepage: 'https://www.example-shop.test' },
      http,
      {},
    );
    expect(isAllowed(rules, 'https://example-shop.test/basket')).toBe(false);
    expect(isAllowed(rules, 'https://example-shop.test/p/1')).toBe(true);
  });

  it('still holds off when the whole shop is unreachable', async () => {
    const http = async () => res({ status: 503 });
    const rules = await loadRobotsResilient({ domain: 'down.test', homepage: 'https://down.test' }, http, {});
    expect(rules.unavailable).toBe(true);
  });

  it('treats a thrown fetch as unreachable rather than crashing the harvest', async () => {
    const http = async () => {
      throw new Error('boom');
    };
    const rules = await loadRobotsResilient({ domain: 'boom.test', homepage: 'https://boom.test' }, http, {});
    expect(rules.unavailable).toBe(true);
  });
});

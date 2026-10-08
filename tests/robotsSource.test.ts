import { describe, it, expect } from 'vitest';
import {
  robotsCandidateUrls,
  readRobotsResponse,
  resolveRobotsReadings,
  loadRobotsResilient,
  probeRobots,
  isBotWallNotRobots,
  ROBOTS_BOT_WALL,
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

/**
 * The Harvey Nichols case: both addresses answer 503 to `pricesniffsbot`,
 * instantly, from a CDN edge, a bot wall's fixed answer. Until 2026-10-04 the
 * file was then asked for a second time the way a browser would. The owner
 * decided every shop is read as PriceSniffsBot and a refusal is never worked
 * around, so the file is asked for once per address, as the bot, and a shop that
 * does not hand it over is held off, not asked again in other clothes.
 */
describe('probeRobots asks as the bot, once per address', () => {
  const BOT = { 'user-agent': 'PriceSniffsBot/0.2 (test)' };

  it('does not ask a second way when the first got nothing usable', async () => {
    const asked: Array<[string, string]> = [];
    const http = async (url: string, headers: Record<string, string>) => {
      asked.push([url, headers['user-agent']!]);
      return res({ status: 503 });
    };

    const probe = await probeRobots({ domain: 'harveynichols.com', homepage: 'https://www.harveynichols.com' }, http, BOT);

    expect(asked).toEqual([
      ['https://www.harveynichols.com/robots.txt', 'PriceSniffsBot/0.2 (test)'],
      ['https://harveynichols.com/robots.txt', 'PriceSniffsBot/0.2 (test)'],
    ]);
    expect(probe.rules.unavailable).toBe(true);
  });

  it('stops dead when the file it reads forbids everything', async () => {
    const http = async () => res({ ok: true, status: 200, body: 'User-agent: *\nDisallow: /' });
    const probe = await probeRobots({ domain: 'shut.test', homepage: 'https://shut.test' }, http, BOT);
    expect(isAllowed(probe.rules, 'https://shut.test/anything')).toBe(false);
  });

  it('asks one address when the bot got the file', async () => {
    const asked: string[] = [];
    const http = async (url: string) => {
      asked.push(url);
      return res({ ok: true, status: 200, body: 'User-agent: *\nAllow: /' });
    };
    await probeRobots({ domain: 'fine.test', homepage: 'https://fine.test' }, http, BOT);
    expect(asked).toEqual(['https://fine.test/robots.txt']);
  });

  it('treats a plain 404 as an answer: no file, nothing forbidden', async () => {
    const asked: string[] = [];
    const http = async (url: string) => {
      asked.push(url);
      return res({ status: 404 });
    };
    const probe = await probeRobots({ domain: 'none.test', homepage: 'https://none.test' }, http, BOT);
    expect(asked).toEqual(['https://none.test/robots.txt', 'https://www.none.test/robots.txt']);
    expect(isAllowed(probe.rules, 'https://none.test/x')).toBe(true);
  });

  it('records every attempt, so a run can say what actually happened', async () => {
    const http = async () => res({ status: 503 });
    const probe = await probeRobots({ domain: 'x.test', homepage: 'https://x.test' }, http, BOT);
    expect(probe.attempts.map((a) => a.status)).toEqual([503, 503]);
    expect(probe.rules.unavailable).toBe(true);
  });
});

/**
 * A captcha served with a 2xx in place of robots.txt is a refusal, not an empty
 * file (2026-10-08). The SiteGround body below is Riiffs Perfumes' answer to
 * /robots.txt as measured that day (docs/SHOP-PROBES-2026-10-08.md, section 7),
 * with the egress address in it replaced by a documentation address.
 */
describe('a bot wall in place of robots.txt', () => {
  const SITEGROUND_202 =
    '<html><head><meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=%2Frobots.txt&y=ipr:192.0.2.1:1791425455.123"></meta></head></html>';
  const CLOUDFLARE_200 =
    '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>' +
    '<script>window._cf_chl_opt={cvId: "3", cType: "managed"};</script>' +
    '<script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script></body></html>';

  it('reads a SiteGround captcha with HTTP 202 as refused', () => {
    expect(isBotWallNotRobots(SITEGROUND_202)).toBe(true);
    expect(readRobotsResponse({ ok: true, status: 202, body: SITEGROUND_202 })).toEqual({ kind: 'refused' });
  });

  it('reads a Cloudflare challenge served as a 200 as refused', () => {
    expect(readRobotsResponse({ ok: true, status: 200, body: CLOUDFLARE_200 })).toEqual({ kind: 'refused' });
  });

  it('still parses a real file that merely mentions a challenge path', () => {
    const body = '# /cdn-cgi/challenge-platform/ is Cloudflare\'s\nUser-agent: *\nDisallow: /cdn-cgi/\n';
    expect(isBotWallNotRobots(body)).toBe(false);
    const reading = readRobotsResponse({ ok: true, status: 200, body });
    expect(reading.kind).toBe('rules');
  });

  it('still reads an ordinary HTML page with no challenge as a (rule-less) file, as before', () => {
    expect(readRobotsResponse({ ok: true, status: 200, body: '<html><body>Home</body></html>' }).kind).toBe('rules');
  });

  it('lets a refusal hold the shop off whatever another address said', () => {
    const file = readRobotsResponse({ ok: true, status: 200, body: 'User-agent: *\nAllow: /' });
    expect(resolveRobotsReadings([{ kind: 'absent' }, { kind: 'refused' }]).unavailable).toBe(true);
    expect(resolveRobotsReadings([file, { kind: 'refused' }]).unavailable).toBe(true);
  });

  it('stops at the first address that answers with one, and says why', async () => {
    const asked: string[] = [];
    const http = async (url: string) => {
      asked.push(url);
      return res({ ok: true, status: 202, body: SITEGROUND_202 });
    };
    const probe = await probeRobots(
      { domain: 'uk.riiffsperfumes.com', homepage: 'https://uk.riiffsperfumes.com' },
      http,
      { 'user-agent': 'PriceSniffsBot/0.2 (test)' },
    );
    expect(asked).toEqual(['https://uk.riiffsperfumes.com/robots.txt']);
    expect(probe.rules.unavailable).toBe(true);
    expect(isAllowed(probe.rules, 'https://uk.riiffsperfumes.com/sitemap_index.xml')).toBe(false);
    expect(probe.attempts).toEqual([
      { url: 'https://uk.riiffsperfumes.com/robots.txt', status: 202, error: ROBOTS_BOT_WALL },
    ]);
  });
});

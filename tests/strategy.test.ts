import { describe, expect, it } from 'vitest';
import {
  EMPTY_MEMORY, planFor, record, score, getRecord, explain,
} from '../src/catalogue/strategy.js';
import { parseRobots, isAllowed, EMPTY_ROBOTS } from '../src/catalogue/robots.js';

const NOW = '2026-08-01T12:00:00Z';
/** Deterministic, and above any exploration rate, so no random promotion. */
const noExplore = { random: () => 0.99 };

describe('strategy learning', () => {
  it('starts with everything untried and free strategies first', () => {
    const plan = planFor(EMPTY_MEMORY, 'boots', noExplore);
    expect(plan).toContain('section-plain');
    // Metered retrieval is never planned unless explicitly allowed.
    expect(plan).not.toContain('proxied-fetch');
  });

  it('demotes a strategy that failed', () => {
    let m = EMPTY_MEMORY;
    for (let i = 0; i < 5; i++) {
      m = record(m, 'boots', 'section-plain', { ok: false, status: 403, listings: 0 }, NOW);
    }
    const plan = planFor(m, 'boots', noExplore);
    expect(plan[0]).not.toBe('section-plain');
    expect(plan.at(-1)).toBe('section-plain');
  });

  it('promotes a strategy that worked', () => {
    let m = EMPTY_MEMORY;
    m = record(m, 'boots', 'section-plain', { ok: false, status: 403, listings: 0 }, NOW);
    m = record(m, 'boots', 'sitemap-discovery', { ok: true, status: 200, listings: 60 }, NOW);
    expect(planFor(m, 'boots', noExplore)[0]).toBe('sitemap-discovery');
  });

  it('prefers the strategy that returns more, not merely one that returns something', () => {
    let m = EMPTY_MEMORY;
    m = record(m, 'boots', 'search-page', { ok: true, status: 200, listings: 2 }, NOW);
    m = record(m, 'boots', 'sitemap-discovery', { ok: true, status: 200, listings: 200 }, NOW);
    expect(planFor(m, 'boots', noExplore)[0]).toBe('sitemap-discovery');
  });

  it('treats a 200 with no listings as a failure', () => {
    // This is the Allbeauty case: the request worked, the page had nothing.
    let m = EMPTY_MEMORY;
    m = record(m, 'allbeauty', 'section-plain', { ok: true, status: 200, listings: 0 }, NOW);
    expect(getRecord(m, 'allbeauty', 'section-plain').successes).toBe(0);
  });

  it('never retries a strategy that was ruled out', () => {
    let m = EMPTY_MEMORY;
    m = record(m, 'boots', 'section-plain', {
      ok: false, status: null, listings: 0, ruleOut: 'robots.txt disallows this path',
    }, NOW);
    expect(planFor(m, 'boots', noExplore)).not.toContain('section-plain');
    expect(score(getRecord(m, 'boots', 'section-plain'))).toBe(-1);
  });

  it('explores occasionally so one bad night is not permanent', () => {
    let m = EMPTY_MEMORY;
    m = record(m, 'boots', 'sitemap-discovery', { ok: true, status: 200, listings: 90 }, NOW);
    const best = planFor(m, 'boots', noExplore)[0];
    // A random draw below the exploration rate promotes something else.
    const explored = planFor(m, 'boots', { random: () => 0.01 })[0];
    expect(best).toBe('sitemap-discovery');
    expect(explored).not.toBe(best);
  });

  it('allows metered retrieval only when asked, and still ranks it last', () => {
    const plan = planFor(EMPTY_MEMORY, 'boots', { ...noExplore, allowMetered: true });
    expect(plan).toContain('proxied-fetch');
    expect(plan.at(-1)).toBe('proxied-fetch');
  });

  it('can explain itself', () => {
    let m = EMPTY_MEMORY;
    m = record(m, 'boots', 'section-plain', { ok: false, status: 403, listings: 0 }, NOW);
    const lines = explain(m, 'boots');
    expect(lines.some((l) => l.includes('section-plain') && l.includes('HTTP 403'))).toBe(true);
    expect(lines.some((l) => l.includes('untried'))).toBe(true);
  });
});

describe('robots.txt', () => {
  const sample = `
User-agent: *
Disallow: /checkout
Disallow: /account
Allow: /account/public
Crawl-delay: 2
Sitemap: https://shop.example/sitemap.xml

User-agent: ScentDayBot
Disallow: /nothing-for-us
`;

  it('prefers our own group over the wildcard', () => {
    const r = parseRobots(sample, 'scentdaybot');
    expect(isAllowed(r, 'https://shop.example/checkout')).toBe(true);
    expect(isAllowed(r, 'https://shop.example/nothing-for-us')).toBe(false);
  });

  it('falls back to the wildcard group for an unknown agent', () => {
    const r = parseRobots(sample, 'someoneelse');
    expect(isAllowed(r, 'https://shop.example/checkout')).toBe(false);
    expect(isAllowed(r, 'https://shop.example/fragrance')).toBe(true);
  });

  it('lets a more specific Allow beat a Disallow', () => {
    const r = parseRobots(sample, 'someoneelse');
    expect(isAllowed(r, 'https://shop.example/account/public')).toBe(true);
    expect(isAllowed(r, 'https://shop.example/account/private')).toBe(false);
  });

  it('collects sitemaps and the crawl delay', () => {
    const r = parseRobots(sample, 'someoneelse');
    expect(r.sitemaps).toEqual(['https://shop.example/sitemap.xml']);
    expect(r.crawlDelaySeconds).toBe(2);
  });

  it('handles wildcards and end anchors in patterns', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp/*/private');
    expect(isAllowed(r, 'https://s.example/a/b.pdf')).toBe(false);
    expect(isAllowed(r, 'https://s.example/a/b.pdf?x=1')).toBe(true);
    expect(isAllowed(r, 'https://s.example/tmp/x/private')).toBe(false);
  });

  it('refuses when robots.txt could not be read, because silence is not consent', () => {
    expect(isAllowed(EMPTY_ROBOTS, 'https://shop.example/anything')).toBe(false);
  });

  it('allows everything when the file is present but empty', () => {
    const r = parseRobots('');
    expect(r.unavailable).toBe(false);
    expect(isAllowed(r, 'https://shop.example/fragrance')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { RETAILERS } from '../src/config/retailers.js';
import { waitAfter429, RETRY_WAIT_MAX_MS, RETRY_WAIT_MIN_MS } from '../src/catalogue/sitemapCrawl.js';

const SLOW_SHOPS = ['beauty-flash', 'gorgeous-shop'];
const FLOOR_MS = 5000;

describe('shops that rate limit the crawl', () => {
  for (const id of SLOW_SHOPS) {
    it(`${id} is paced at or above the floor, waits out a 429`, () => {
      const r = RETAILERS.find((x) => x.id === id)!;
      expect(r.catalogue?.minRequestGapMs ?? 0).toBeGreaterThanOrEqual(FLOOR_MS);
      expect(r.sitemapRoute?.patientOn429).toBe(true);
    });
  }

  it('no other shop was given the patient 429 route', () => {
    const others = RETAILERS.filter((r) => r.sitemapRoute?.patientOn429 && !SLOW_SHOPS.includes(r.id));
    expect(others.map((r) => r.id)).toEqual([]);
  });

  it('the wait follows Retry-After within bounds', () => {
    expect(waitAfter429(undefined)).toBe(60_000);
    expect(waitAfter429(0)).toBe(RETRY_WAIT_MIN_MS);
    expect(waitAfter429(45)).toBe(45_000);
    expect(waitAfter429(99999)).toBe(RETRY_WAIT_MAX_MS);
  });
});

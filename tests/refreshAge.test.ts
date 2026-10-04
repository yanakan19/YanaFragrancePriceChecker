import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REFRESH_AFTER_HOURS,
  FRESHNESS_LIMIT_HOURS,
  MAX_REFRESH_AFTER_HOURS,
  SWEEP_SLACK_HOURS,
  dueUrls,
  refreshAfterHoursFor,
  shopFreshness,
} from '../src/catalogue/freshness.js';
import { RETAILERS, getRetailer } from '../src/config/retailers.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * A per shop refresh age (`Retailer.refreshAfterHours`), honoured by the due
 * list, and held to the 48 hour freshness check. Cult Beauty re-read about a
 * thousand pages every 12 hours and spent its whole 40 minute slot of every
 * sweep on them; at 24 hours about half as many are due each sweep.
 */

const NOW = new Date('2026-10-04T12:00:00.000Z');
const HOUR = 3_600_000;
const hoursAgo = (h: number, from: Date = NOW) => new Date(from.getTime() - h * HOUR).toISOString();

function stored(sku: string, ageHours: number, over: Partial<StoredListing> = {}): StoredListing {
  return {
    retailerSku: sku,
    url: `https://www.shop.example/p/${sku}/`,
    rawTitle: `Perfume ${sku} Eau de Parfum 50ml`,
    rawBrand: null,
    ean: null,
    imageUrl: null,
    priceGbp: 50,
    wasPriceGbp: null,
    promoEndsAt: null,
    inStock: true,
    sectionId: 'sitemap',
    retailerId: 'shop',
    firstSeenAt: hoursAgo(500),
    lastSeenAt: hoursAgo(ageHours),
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
    ...over,
  } as StoredListing;
}

describe('refreshAfterHoursFor', () => {
  it("is the shop's own age where it sets one, and the sweep's otherwise", () => {
    expect(refreshAfterHoursFor({ refreshAfterHours: 24 }, 12)).toBe(24);
    expect(refreshAfterHoursFor({}, 12)).toBe(12);
    expect(refreshAfterHoursFor({}, 6)).toBe(6);
    // The scheduled workflow passes 12 for every shop: it must not undo a shop's own 24.
    expect(refreshAfterHoursFor({ refreshAfterHours: 24 }, 12)).toBe(24);
  });

  it('keeps 12 hours as the default', () => {
    expect(DEFAULT_REFRESH_AFTER_HOURS).toBe(12);
  });
});

describe('dueUrls', () => {
  const rows = [
    stored('young', 5),
    stored('half-day', 13),
    stored('day-and-a-bit', 26),
    stored('old', 60),
  ];

  it('re-reads what is older than the age, oldest first', () => {
    expect(dueUrls(rows, new Set(), 12, NOW)).toEqual([
      'https://www.shop.example/p/old/',
      'https://www.shop.example/p/day-and-a-bit/',
      'https://www.shop.example/p/half-day/',
    ]);
  });

  it('leaves a listing of 13 hours alone at 24 hours, and still re-reads one of 26', () => {
    expect(dueUrls(rows, new Set(), 24, NOW)).toEqual([
      'https://www.shop.example/p/old/',
      'https://www.shop.example/p/day-and-a-bit/',
    ]);
  });

  it('skips what the shop feed re-priced, what is delisted and what has no price, and names an address once', () => {
    const list = [
      stored('fed', 30),
      stored('gone', 30, { status: 'delisted' }),
      stored('unpriced', 30, { priceGbp: null }),
      stored('size-a', 30, { url: 'https://www.shop.example/p/one/' }),
      stored('size-b', 29, { url: 'https://www.shop.example/p/one/' }),
    ];
    expect(dueUrls(list, new Set(['fed']), 24, NOW)).toEqual(['https://www.shop.example/p/one/']);
  });
});

describe('the registry', () => {
  it('sets a refresh age only for the two THG shops, Cult Beauty and LOOKFANTASTIC, at 24 hours', () => {
    expect(getRetailer('cult-beauty-global')?.refreshAfterHours).toBe(24);
    expect(getRetailer('lookfantastic')?.refreshAfterHours).toBe(24);
    expect(RETAILERS.filter((r) => r.refreshAfterHours !== undefined).map((r) => r.id).sort()).toEqual(['cult-beauty-global', 'lookfantastic']);
  });

  it('holds every shop that sets one to a figure the 48 hour freshness check can bear', () => {
    expect(MAX_REFRESH_AFTER_HOURS + SWEEP_SLACK_HOURS).toBe(FRESHNESS_LIMIT_HOURS);
    for (const r of RETAILERS) {
      if (r.refreshAfterHours === undefined) continue;
      expect(r.refreshAfterHours, r.id).toBeGreaterThan(0);
      expect(r.refreshAfterHours, `${r.id} would age past the freshness check`).toBeLessThanOrEqual(MAX_REFRESH_AFTER_HOURS);
    }
  });
});

describe('what a 24 hour age does to the freshness check and to the slot', () => {
  /**
   * Sweeps every `gapHours`, each re-reading every due listing (the slot is
   * long enough, which is the point of the setting), starting from listings of
   * every age up to `startingAges` hours. Returns the oldest listing at the
   * end of any sweep and the number of pages read in the steady state.
   */
  function simulate(refreshAfterHours: number, gapHours: number, listings = 960) {
    let now = NOW;
    let rows = Array.from({ length: listings }, (_, i) => stored(`s${i}`, (i / listings) * 60));
    let oldest = 0;
    let over48 = 0;
    const read: number[] = [];
    for (let sweep = 0; sweep < 40; sweep++) {
      now = new Date(now.getTime() + gapHours * HOUR);
      const due = new Set(dueUrls(rows, new Set(), refreshAfterHours, now));
      rows = rows.map((l) => (due.has(l.url) ? { ...l, lastSeenAt: now.toISOString() } : l));
      if (sweep >= 20) read.push(due.size);
      const f = shopFreshness(rows, now);
      over48 += sweep >= 8 ? f.over48h : 0;
      // The oldest price, measured just before the next sweep re-reads it.
      const before = new Date(now.getTime() + gapHours * HOUR);
      for (const l of rows) oldest = Math.max(oldest, sweep >= 8 ? (before.getTime() - Date.parse(l.lastSeenAt)) / HOUR : 0);
    }
    return { oldest, over48, perSweep: read.reduce((a, b) => a + b, 0) / read.length };
  }

  it('keeps every price inside the 48 hour check at every gap the sweeps keep', () => {
    for (const gap of [3, 4, 5, 6, 7]) {
      const { oldest, over48 } = simulate(24, gap);
      expect(over48, `gap ${gap}h`).toBe(0);
      // 24 hours plus at most the gap to the next sweep (7), and a little for the sweep itself.
      expect(oldest, `gap ${gap}h`).toBeLessThan(24 + gap + gap + 0.01);
      expect(oldest, `gap ${gap}h`).toBeLessThan(FRESHNESS_LIMIT_HOURS - 4);
    }
  });

  it('still passes with a sweep missed: two gaps of 6 hours in a row', () => {
    const { oldest } = simulate(24, 12);
    expect(oldest).toBeLessThan(FRESHNESS_LIMIT_HOURS);
  });

  it('asks for about half the page reads a sweep that 12 hours does', () => {
    const at12 = simulate(12, 6);
    const at24 = simulate(24, 6);
    expect(at24.perSweep).toBeLessThan(at12.perSweep * 0.6);
    expect(at24.perSweep).toBeGreaterThan(at12.perSweep * 0.3);
  });

  it('keeps the largest refresh age the registry allows inside the check with sweeps six hours apart', () => {
    const { oldest } = simulate(MAX_REFRESH_AFTER_HOURS, 6);
    expect(oldest).toBeLessThan(FRESHNESS_LIMIT_HOURS);
  });
});

describe('the harvest', () => {
  it("builds each shop's due list with that shop's own age, not the sweep's flag alone", () => {
    const source = readFileSync(new URL('../scripts/catalogue-harvest.ts', import.meta.url), 'utf8');
    expect(source).toContain('refreshAfterHoursFor(retailer, refreshAfterHours)');
    expect(source).toContain('dueUrls(priorLive, refreshedSkus, shopRefreshAfterHours');
    // The due list is built nowhere else, so no shop can bypass its own age.
    expect(source.match(/lastSeenAt < dueBefore/g) ?? []).toHaveLength(0);
  });
});

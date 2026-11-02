/**
 * The self limiting mechanisms of the crawl (docs/PIPELINE-FAILURE-MODES.md, row 63):
 * the slow shop valve, the long run guard and the freshness check that fails only
 * a shop that is stale and not improving. Rules, never figures from a harvest.
 */
import { describe, expect, it } from 'vitest';
import { RETAILERS } from '../src/config/retailers.js';
import {
  EMPTY_CURSOR, HARVEST_LONG_MINUTES, MAX_SLOW_FIRST, STAGES_AROUND_SWEEP_MINUTES, SLOW_SHOP_AFTER_STOPS, SLOW_SHOP_CAP_MINUTES,
  budgetStops, isLongRun, isSlowShop, parseCursor, slowFirst, slowShopMinutes, slowestFirst, withBudgetOutcome, withRunLength,
  type HarvestCursor,
} from '../src/catalogue/harvestCursor.js';
import {
  FRESHNESS_STUCK_RUNS, FRESHNESS_STUCK_RUNS_ON_BUDGET, freshnessFailsCrawl, freshnessHardLimit, freshnessStuckRuns, freshnessTolerance,
} from '../src/catalogue/freshness.js';
import { freshnessTable } from '../src/catalogue/harvestFreshness.js';
import { mergeCursors } from '../src/catalogue/harvestGroups.js';
import type { ShopHarvestOutcome } from '../src/catalogue/harvestReport.js';

const stop = (c: HarvestCursor, id: string, n: number): HarvestCursor => {
  let out = c;
  for (let i = 0; i < n; i++) out = withBudgetOutcome(out, id, true);
  return out;
};

describe('the slow shop valve', () => {
  it('opens only after a shop stopped on its time budget SLOW_SHOP_AFTER_STOPS harvests in a row', () => {
    let c = EMPTY_CURSOR;
    for (let i = 1; i < SLOW_SHOP_AFTER_STOPS; i++) {
      c = withBudgetOutcome(c, 'a', true);
      expect(isSlowShop(c, 'a')).toBe(false);
      expect(slowShopMinutes(c, 'a', 50)).toBe(50);
    }
    c = withBudgetOutcome(c, 'a', true);
    expect(isSlowShop(c, 'a')).toBe(true);
    expect(slowShopMinutes(c, 'a', 50)).toBeGreaterThan(50);
  });

  it('gives more time each harvest in a row, never past the cap and never less than the base', () => {
    let last = 50;
    for (let n = SLOW_SHOP_AFTER_STOPS; n <= 9; n++) {
      const m = slowShopMinutes(stop(EMPTY_CURSOR, 'a', n), 'a', 50);
      expect(m).toBeGreaterThanOrEqual(last);
      expect(m).toBeLessThanOrEqual(SLOW_SHOP_CAP_MINUTES);
      last = m;
    }
    expect(last).toBe(SLOW_SHOP_CAP_MINUTES);
    // A shop whose own setting is above the cap is never cut down by the valve.
    expect(slowShopMinutes(stop(EMPTY_CURSOR, 'a', 5), 'a', SLOW_SHOP_CAP_MINUTES + 10)).toBe(SLOW_SHOP_CAP_MINUTES + 10);
  });

  it('closes at once when the shop finishes in time, and keeps the entry at 0 so a group hands the closing over', () => {
    const open = stop(EMPTY_CURSOR, 'a', 3);
    const closed = withBudgetOutcome(open, 'a', false);
    expect(budgetStops(closed, 'a')).toBe(0);
    expect(closed.slowShops).toEqual({ a: 0 });
    expect(slowShopMinutes(closed, 'a', 50)).toBe(50);
    // A shop never stopped leaves the cursor as it was.
    expect(withBudgetOutcome(EMPTY_CURSOR, 'b', false)).toBe(EMPTY_CURSOR);
  });

  it('starts the shops with an open valve first, most stops first, at most MAX_SLOW_FIRST, and drops nobody', () => {
    const ids = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}` }));
    let c = EMPTY_CURSOR;
    c = stop(c, 's9', 2);
    c = stop(c, 's7', 4);
    c = stop(c, 's3', 1); // not open
    const out = slowFirst(ids, c);
    expect(out.slice(0, 2).map((s) => s.id)).toEqual(['s7', 's9']);
    expect(out.map((s) => s.id).sort()).toEqual(ids.map((s) => s.id).sort());
    const many = Array.from({ length: 10 }, (_, i) => i).reduce((acc, i) => stop(acc, `s${i}`, 2), EMPTY_CURSOR);
    expect(slowFirst(ids, many).filter((s) => isSlowShop(many, s.id)).slice(0, MAX_SLOW_FIRST)).toHaveLength(MAX_SLOW_FIRST);
    expect(slowFirst(ids, many).slice(0, MAX_SLOW_FIRST).every((s) => isSlowShop(many, s.id))).toBe(true);
  });

  it('survives the cursor file and the merge of the groups, each group handing over only its own shops', () => {
    const a = stop(EMPTY_CURSOR, 'a', 2);
    const b = stop(EMPTY_CURSOR, 'b', 3);
    expect(parseCursor(JSON.stringify(a)).slowShops).toEqual({ a: 2 });
    const base = withRunLength(stop(EMPTY_CURSOR, 'a', 5), 130, '2026-11-02T00:00:00Z');
    const merged = mergeCursors(base, [
      { ids: new Set(['a']), cursor: withBudgetOutcome(a, 'a', false) },
      { ids: new Set(['b']), cursor: b },
    ]);
    expect(merged.slowShops).toEqual({ a: 0, b: 3 });
    // The merge keeps the run length it was given; setting it is the merge script's own job.
    expect(merged.longRun).toEqual(base.longRun);
  });

  it('is the registry setting of the shops known to answer slowly, held to the cap and to the time the sweep has', () => {
    for (const r of RETAILERS) {
      if (r.slowShopMinutes === undefined) continue;
      expect(r.slowShopMinutes, r.id).toBeGreaterThan(0);
      expect(r.slowShopMinutes, r.id).toBeLessThanOrEqual(SLOW_SHOP_CAP_MINUTES);
    }
  });
});

describe('the long run guard', () => {
  it('notes a harvest over HARVEST_LONG_MINUTES and clears the note after a quicker one', () => {
    const edge = HARVEST_LONG_MINUTES - STAGES_AROUND_SWEEP_MINUTES; // a sweep of this many minutes makes the whole run exactly the limit
    const long = withRunLength(EMPTY_CURSOR, edge + 1, 'now');
    expect(isLongRun(long)).toBe(true);
    expect(long.longRun!.minutes).toBeGreaterThan(HARVEST_LONG_MINUTES);
    expect(isLongRun(parseCursor(JSON.stringify(long)))).toBe(true);
    expect(isLongRun(withRunLength(long, edge, 'later'))).toBe(false);
    expect(isLongRun(withRunLength(EMPTY_CURSOR, null, 'now'))).toBe(false);
  });

  it('then starts the slowest shops first, the shops with no figure behind the rest, and drops nobody', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    const out = slowestFirst(ids, { c: 3000, a: 40, d: 900 });
    expect(out.map((s) => s.id)).toEqual(['c', 'd', 'a', 'b', 'e']);
  });
});

describe('the freshness check fails a shop only when it is stale and not improving', () => {
  const shown = 1000;
  const over = (n: number) => ({ shown, over48h: n });

  it('counts harvests over the tolerance without a fall, and resets on a fall or within the tolerance', () => {
    const tol = freshnessTolerance(shown);
    expect(freshnessStuckRuns(over(tol), undefined)).toBe(0);
    expect(freshnessStuckRuns(over(tol + 1), undefined)).toBe(1);
    expect(freshnessStuckRuns(over(200), { ...over(200), stuckRuns: 1 })).toBe(2);
    expect(freshnessStuckRuns(over(210), { ...over(200), stuckRuns: 2 })).toBe(3);
    expect(freshnessStuckRuns(over(190), { ...over(200), stuckRuns: 2 })).toBe(0);
    expect(freshnessStuckRuns(over(0), { ...over(200), stuckRuns: 2 })).toBe(0);
  });

  it('is a warning for a shop over the limit that is catching up, new, or stopped by its time budget for a while', () => {
    const limit = freshnessHardLimit(shown);
    expect(freshnessFailsCrawl({ ...over(limit + 1), stuckRuns: 0 }, true)).toBe(false);
    expect(freshnessFailsCrawl({ ...over(limit + 1), stuckRuns: FRESHNESS_STUCK_RUNS - 1 }, true)).toBe(false);
    expect(freshnessFailsCrawl({ ...over(limit + 1), stuckRuns: FRESHNESS_STUCK_RUNS, timeBudget: true }, true)).toBe(false);
    expect(freshnessFailsCrawl({ ...over(limit + 1), stuckRuns: FRESHNESS_STUCK_RUNS_ON_BUDGET - 1, timeBudget: true }, true)).toBe(false);
  });

  it('fails a shop over the limit that has not improved for the set harvests, and never one that did not answer or is under the limit', () => {
    const limit = freshnessHardLimit(shown);
    expect(freshnessFailsCrawl({ ...over(limit + 1), stuckRuns: FRESHNESS_STUCK_RUNS }, true)).toBe(true);
    expect(freshnessFailsCrawl({ ...over(limit + 1), stuckRuns: FRESHNESS_STUCK_RUNS_ON_BUDGET, timeBudget: true }, true)).toBe(true);
    expect(freshnessFailsCrawl({ ...over(limit + 1), stuckRuns: 99 }, false)).toBe(false);
    expect(freshnessFailsCrawl({ ...over(limit), stuckRuns: 99 }, true)).toBe(false);
    // A report from before the counter existed counts as one harvest: it never fails at once.
    expect(freshnessFailsCrawl(over(limit + 1), true)).toBe(false);
  });

  it('writes the counter and the time budget flag into the freshness table from the previous table', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    const old = '2026-10-30T12:00:00Z';
    const recent = '2026-11-02T11:00:00Z';
    const listing = (lastSeenAt: string) => ({ lastSeenAt, status: 'active' }) as never;
    const snap = { source: 'live' as const, listings: [...Array.from({ length: 30 }, () => listing(old)), ...Array.from({ length: 70 }, () => listing(recent))] };
    const shops = [{ retailerId: 'slow', tier: 'free', errors: ["stopped early: exceeded this shop's time budget"] }] as unknown as ShopHarvestOutcome[];
    const first = freshnessTable(shops, [{ id: 'slow' }], () => snap, now);
    expect(first.slow).toMatchObject({ stuckRuns: 1, timeBudget: true });
    const second = freshnessTable(shops, [{ id: 'slow' }], () => snap, now, first);
    expect(second.slow!.stuckRuns).toBe(2);
    const better = { source: 'live' as const, listings: [...Array.from({ length: 10 }, () => listing(old)), ...Array.from({ length: 90 }, () => listing(recent))] };
    expect(freshnessTable(shops, [{ id: 'slow' }], () => better, now, second).slow!.stuckRuns).toBeUndefined();
  });
});

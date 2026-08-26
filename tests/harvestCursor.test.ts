import { describe, expect, it } from 'vitest';
import {
  parseCursor,
  sweepOrder,
  staleCursorIds,
  withAttempt,
  EMPTY_CURSOR,
  type HarvestCursor,
} from '../src/catalogue/harvestCursor.js';

/**
 * The shop list run #330 actually planned, in the order it planned it, cut to
 * the part that matters: five never-live shops, then registry order, and the
 * eleven at the tail it never reached. Taken from the `planned` and
 * `notReached` arrays of data/harvest-report.json as committed in 2cd38bf.
 */
const PLANNED = [
  'notino-uk', 'boots', 'the-fragrance-shop', 'harvey-nichols', 'debenhams',
  'allbeauty', 'justmylook', 'beautybase', 'emirates-oud',
  'perfumeo', 'the-beauty-store-uk', 'zimaya', 'kayali', 'zara',
  'escentric-molecules', 'fragrancehub', 'avon', 'morrisons', 'bm-stores',
  'home-bargains',
];
const NEVER_LIVE = new Set(['notino-uk', 'boots', 'the-fragrance-shop', 'harvey-nichols', 'debenhams']);
const REACHED = PLANNED.slice(0, 9);
const NEVER_REACHED = PLANNED.slice(9);

const candidates = PLANNED.map((id) => ({ id, neverLive: NEVER_LIVE.has(id) }));

describe('sweepOrder — the starvation this exists to end', () => {
  it('puts every shop the last run never reached at the front of this one', () => {
    // Exactly run #330's outcome: the first nine were asked, the eleven at the
    // tail were not.
    let cursor = EMPTY_CURSOR;
    for (const id of REACHED) cursor = withAttempt(cursor, id, '2026-08-25T16:30:00.000Z');

    const order = sweepOrder(candidates, cursor).map((s) => s.id);

    expect(order.slice(0, NEVER_REACHED.length)).toEqual(NEVER_REACHED);
    // And nothing that was already asked jumps back in front of them.
    expect(order.slice(NEVER_REACHED.length)).toEqual(REACHED);
  });

  it('cannot starve a shop twice running, however short the run is', () => {
    // Two runs, each only long enough for four shops. Without rotation the
    // same four are asked both times and nothing else is ever asked at all.
    let cursor = EMPTY_CURSOR;
    const asked: string[][] = [];
    for (let run = 0; run < 5; run++) {
      const order = sweepOrder(candidates, cursor).map((s) => s.id);
      const thisRun = order.slice(0, 4);
      asked.push(thisRun);
      for (const id of thisRun) cursor = withAttempt(cursor, id, `2026-08-25T${10 + run}:00:00.000Z`);
    }

    // Five runs of four shops covers twenty shops, and there are twenty.
    expect(new Set(asked.flat()).size).toBe(PLANNED.length);
    // No shop asked twice before every shop has been asked once.
    expect(asked.flat().length).toBe(PLANNED.length);
  });

  it('orders by when a shop was asked, oldest first', () => {
    const cursor = {
      attempted: {
        allbeauty: '2026-08-25T16:00:00.000Z',
        boots: '2026-08-23T09:00:00.000Z',
        justmylook: '2026-08-24T12:00:00.000Z',
      },
    };
    const order = sweepOrder(
      [
        { id: 'allbeauty', neverLive: false },
        { id: 'boots', neverLive: true },
        { id: 'justmylook', neverLive: false },
      ],
      cursor,
    ).map((s) => s.id);

    expect(order).toEqual(['boots', 'justmylook', 'allbeauty']);
  });
});

describe('sweepOrder — falling back when there is no cursor', () => {
  it('reproduces the old never-live-first registry order exactly', () => {
    // The first run after this ships has no cursor, and so does any run whose
    // cursor was lost. It must behave as the harvest always did rather than in
    // some third way nobody has reasoned about.
    const order = sweepOrder(candidates, EMPTY_CURSOR).map((s) => s.id);
    expect(order).toEqual([...PLANNED.filter((id) => NEVER_LIVE.has(id)), ...PLANNED.filter((id) => !NEVER_LIVE.has(id))]);
  });

  it('breaks a tie on never-live, then on the order given', () => {
    const order = sweepOrder(
      [
        { id: 'live-a', neverLive: false },
        { id: 'unknown', neverLive: true },
        { id: 'live-b', neverLive: false },
      ],
      EMPTY_CURSOR,
    ).map((s) => s.id);
    expect(order).toEqual(['unknown', 'live-a', 'live-b']);
  });
});

describe('parseCursor — an ordering hint must never break a harvest', () => {
  it('reads a cursor it wrote', () => {
    const c = withAttempt(EMPTY_CURSOR, 'boots', '2026-08-25T16:00:00.000Z');
    expect(parseCursor(JSON.stringify(c))).toEqual(c);
  });

  it.each([
    ['a missing file', null],
    ['an empty file', ''],
    ['broken json', '{not json'],
    ['the wrong shape', '[1,2,3]'],
    ['a null attempted map', '{"attempted":null}'],
  ])('degrades to "nothing was ever asked" for %s', (_label, raw) => {
    expect(parseCursor(raw)).toEqual(EMPTY_CURSOR);
  });

  it('drops entries that are not timestamps rather than trusting them', () => {
    const c = parseCursor('{"attempted":{"good":"2026-08-25T16:00:00.000Z","bad":42,"empty":""}}');
    expect(c.attempted).toEqual({ good: '2026-08-25T16:00:00.000Z' });
  });
});

describe('staleCursorIds', () => {
  it('names stamps left behind by shops that are no longer swept', () => {
    const c = parseCursor('{"attempted":{"boots":"T","lush":"T"}}');
    expect(staleCursorIds(c, ['boots'])).toEqual(['lush']);
  });
});

/**
 * A faster per-shop cost must reach more shops per run without changing which
 * shop is asked next — exercising the actual rotation, not just inspecting
 * the sitemapCrawl.ts diff, since "a prior speed-up broke that rotation and
 * starved shops" (see harvestCursor.ts's own header) is exactly the failure
 * mode a faster crawl must not repeat.
 *
 * Mirrors scripts/catalogue-harvest.ts's own loop shape closely enough to
 * exercise the same interaction: `sweepOrder` decides the order once per run,
 * a shop's attempt is recorded the moment it is asked (not when it finishes),
 * and the run stops taking new shops the moment the next one would not fit in
 * what is left of the budget — the same "checked on a shop boundary" rule
 * catalogue-harvest.ts itself follows, and the same reason a shop that is cut
 * off keeps its old stamp and sorts first next run rather than being skipped.
 */
function runSweep(
  shops: readonly { id: string; neverLive: boolean }[],
  cursor: HarvestCursor,
  runBudgetMs: number,
  perShopMs: number,
  runStartedAt: number,
): { cursor: HarvestCursor; asked: string[] } {
  const order = sweepOrder(shops, cursor);
  let elapsedMs = 0;
  let next = cursor;
  const asked: string[] = [];
  for (const shop of order) {
    if (elapsedMs + perShopMs > runBudgetMs) break;
    next = withAttempt(next, shop.id, new Date(runStartedAt + elapsedMs).toISOString());
    asked.push(shop.id);
    elapsedMs += perShopMs;
  }
  return { cursor: next, asked };
}

describe('sweepOrder — a faster per-shop cost cannot resurrect the starvation this fixed', () => {
  // Twenty shops, a run budget wide enough for a slow sweep to finish only
  // nine of them per run (the same 9-of-20 split PLANNED/REACHED models
  // above) — this is deliberately run #330's own shape before this task's
  // sitemapCrawl.ts fix, cast as a per-shop cost instead of a shop list, so
  // the "faster" run below can be the same scenario with that fix applied.
  const SLOW_PER_SHOP_MS = 5 * 60_000;
  // The measured saving from skipping the trailing gap wait — the default
  // 1500ms request gap, once per shop, no longer paid on the last product
  // page fetched. Small next to a five-minute shop, which is the point: this
  // is a real saving that adds up across a run, not a rewrite of how shops
  // are chosen.
  const FAST_PER_SHOP_MS = SLOW_PER_SHOP_MS - 1_500;
  // Chosen so the saving actually matters at this budget: nine slow shops
  // (2,700,000ms) fit with room to spare, a tenth slow shop does not
  // (3,000,000ms), and a tenth *fast* shop does (2,985,000ms) — the exact
  // margin the trailing-wait fix buys back.
  const RUN_BUDGET_MS = 2_990_000;

  it('reaches more shops per run once shops are individually faster', () => {
    const slow = runSweep(candidates, EMPTY_CURSOR, RUN_BUDGET_MS, SLOW_PER_SHOP_MS, 0);
    const fast = runSweep(candidates, EMPTY_CURSOR, RUN_BUDGET_MS, FAST_PER_SHOP_MS, 0);

    expect(slow.asked).toHaveLength(9);
    // Fitting one more shop from a few seconds saved each is the entire
    // point of the fix — not a dramatic jump, a real one.
    expect(fast.asked.length).toBeGreaterThan(slow.asked.length);
  });

  it('never repeats a shop before every shop has been asked once, at either speed', () => {
    // A run does not stop just because coverage is now complete — it works
    // through sweepOrder's list until its own budget runs out, same as
    // scripts/catalogue-harvest.ts, so the run that finally covers the last
    // unasked shop can go on to re-ask some already-asked ones in the same
    // run. That is fine; what must never happen, at either speed, is a shop
    // being asked a *second* time while another shop has never been asked at
    // all — the exact starvation harvestCursor.ts exists to end.
    for (const perShopMs of [SLOW_PER_SHOP_MS, FAST_PER_SHOP_MS]) {
      let cursor = EMPTY_CURSOR;
      const seen = new Set<string>();
      let noRepeatBeforeFullCoverage = true;
      // Five runs is generous at either speed (20 shops, 9 or 10 asked per
      // run — full coverage lands inside two or three) and long enough to
      // also observe the repeats that follow it.
      for (let run = 0; run < 5; run++) {
        const { cursor: nextCursor, asked } = runSweep(
          candidates,
          cursor,
          RUN_BUDGET_MS,
          perShopMs,
          run * 24 * 60 * 60_000,
        );
        cursor = nextCursor;
        for (const id of asked) {
          if (seen.has(id) && seen.size < candidates.length) noRepeatBeforeFullCoverage = false;
          seen.add(id);
        }
      }

      expect(seen.size).toBe(candidates.length);
      expect(noRepeatBeforeFullCoverage).toBe(true);
    }
  });
});

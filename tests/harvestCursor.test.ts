import { describe, expect, it } from 'vitest';
import {
  parseCursor,
  sweepOrder,
  staleCursorIds,
  withAttempt,
  EMPTY_CURSOR,
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

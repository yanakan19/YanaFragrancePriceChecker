import { describe, it, expect } from 'vitest';
import {
  parseDiscoveryState,
  selectDueTargets,
  recordChecked,
  isConfirmationStale,
  STALE_CONFIRMATION_DAYS,
  type ShippingDiscoveryState,
} from '../src/catalogue/shippingDiscoveryQueue.js';

const shop = (id: string) => ({ id });

describe('parseDiscoveryState', () => {
  it('reads a well-formed ledger', () => {
    const state = parseDiscoveryState('{"checked":{"boots":"2026-08-13T09:10:00.000Z"}}');
    expect(state.checked).toEqual({ boots: '2026-08-13T09:10:00.000Z' });
  });

  // The ledger records bookkeeping, not facts about shops. Refusing to run over
  // a damaged one would cost a real capability to protect nothing.
  it('degrades to empty rather than throwing on anything unexpected', () => {
    expect(parseDiscoveryState(null).checked).toEqual({});
    expect(parseDiscoveryState('').checked).toEqual({});
    expect(parseDiscoveryState('not json at all').checked).toEqual({});
    expect(parseDiscoveryState('[1,2,3]').checked).toEqual({});
    expect(parseDiscoveryState('{"checked":"nope"}').checked).toEqual({});
  });

  it('drops entries whose timestamp is not a non-empty string', () => {
    const state = parseDiscoveryState('{"checked":{"a":"2026-01-01T00:00:00Z","b":null,"c":7,"d":""}}');
    expect(state.checked).toEqual({ a: '2026-01-01T00:00:00Z' });
  });
});

describe('selectDueTargets', () => {
  const targets = [shop('boots'), shop('allbeauty'), shop('notino-uk'), shop('zara')];

  it('puts never-checked shops first', () => {
    const state: ShippingDiscoveryState = {
      checked: { boots: '2026-08-13T09:00:00Z', zara: '2026-08-13T09:00:00Z' },
    };
    const { due } = selectDueTargets(targets, state, 2);
    expect(due.map((s) => s.id)).toEqual(['allbeauty', 'notino-uk']);
  });

  it('then takes the least recently checked', () => {
    const state: ShippingDiscoveryState = {
      checked: {
        boots: '2026-08-13T09:00:00Z',
        allbeauty: '2026-08-11T09:00:00Z',
        'notino-uk': '2026-08-12T09:00:00Z',
        zara: '2026-08-10T09:00:00Z',
      },
    };
    const { due, held } = selectDueTargets(targets, state, 2);
    expect(due.map((s) => s.id)).toEqual(['zara', 'allbeauty']);
    expect(held.map((s) => s.id)).toEqual(['notino-uk', 'boots']);
  });

  // A failed run has to be repeatable. If ties reshuffled, the run after a
  // failure would pick a different slice and the failure would be hard to chase.
  it('breaks ties on id so the same inputs pick the same shops', () => {
    const state: ShippingDiscoveryState = { checked: {} };
    const first = selectDueTargets(targets, state, 2);
    const second = selectDueTargets([...targets].reverse(), state, 2);
    expect(first.due.map((s) => s.id)).toEqual(second.due.map((s) => s.id));
    expect(first.due.map((s) => s.id)).toEqual(['allbeauty', 'boots']);
  });

  it('holds nothing when the budget is not a bound', () => {
    const state: ShippingDiscoveryState = { checked: {} };
    for (const budget of [null, 0, -1, 99]) {
      const { due, held } = selectDueTargets(targets, state, budget);
      expect(due).toHaveLength(4);
      expect(held).toHaveLength(0);
    }
  });

  it('does not mutate the caller list', () => {
    const list = [shop('b'), shop('a')];
    selectDueTargets(list, { checked: {} }, 1);
    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
  });

  // The whole rotation rests on this: every eligible shop is reached eventually,
  // none is starved by shops that keep coming back round.
  it('reaches every shop over successive runs', () => {
    const all = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(shop);
    let state: ShippingDiscoveryState = { checked: {} };
    const seen = new Set<string>();
    for (let run = 0; run < 4; run++) {
      const { due } = selectDueTargets(all, state, 2);
      for (const s of due) seen.add(s.id);
      state = recordChecked(
        state,
        due.map((s) => s.id),
        all.map((s) => s.id),
        `2026-08-${String(14 + run).padStart(2, '0')}T00:00:00.000Z`,
      );
    }
    expect(seen.size).toBe(7);
  });
});

describe('recordChecked', () => {
  it('stamps only the shops that were read', () => {
    const state: ShippingDiscoveryState = { checked: { a: '2026-01-01T00:00:00Z' } };
    const next = recordChecked(state, ['b'], ['a', 'b'], '2026-08-14T00:00:00Z');
    expect(next.checked).toEqual({
      a: '2026-01-01T00:00:00Z',
      b: '2026-08-14T00:00:00Z',
    });
  });

  // A held-over shop keeping its old stamp is what stops it drifting to the back
  // of the queue without anyone having looked at it.
  it('leaves a held shop where it was in the queue', () => {
    const state: ShippingDiscoveryState = { checked: { a: '2026-01-01T00:00:00Z' } };
    const next = recordChecked(state, ['b'], ['a', 'b'], '2026-08-14T00:00:00Z');
    const { due } = selectDueTargets([shop('a'), shop('b')], next, 1);
    expect(due.map((s) => s.id)).toEqual(['a']);
  });

  it('forgets shops that have left the registry', () => {
    const state: ShippingDiscoveryState = {
      checked: { gone: '2026-01-01T00:00:00Z', a: '2026-01-01T00:00:00Z' },
    };
    const next = recordChecked(state, [], ['a'], '2026-08-14T00:00:00Z');
    expect(next.checked).toEqual({ a: '2026-01-01T00:00:00Z' });
  });

  it('ignores a checked id that is not in the registry', () => {
    const next = recordChecked({ checked: {} }, ['ghost'], ['a'], '2026-08-14T00:00:00Z');
    expect(next.checked).toEqual({});
  });

  it('does not mutate the state it was given', () => {
    const state: ShippingDiscoveryState = { checked: { a: '2026-01-01T00:00:00Z' } };
    recordChecked(state, ['a'], ['a'], '2026-08-14T00:00:00Z');
    expect(state.checked.a).toBe('2026-01-01T00:00:00Z');
  });
});

describe('isConfirmationStale', () => {
  it('is not stale the day it was confirmed', () => {
    expect(isConfirmationStale('2026-08-05', '2026-08-05')).toBe(false);
  });

  it('is not stale one day short of the threshold', () => {
    expect(isConfirmationStale('2026-08-05', '2026-09-18', STALE_CONFIRMATION_DAYS)).toBe(false);
  });

  it('is stale exactly on the threshold, and every day past it', () => {
    // mybeauty-boutique, oud-arabian and the-beauty-store-uk: the oldest
    // confirmations in this registry as measured 2026-08-26, all
    // verifiedAt '2026-08-05'. 45 days on from that is 2026-09-19.
    expect(isConfirmationStale('2026-08-05', '2026-09-19', STALE_CONFIRMATION_DAYS)).toBe(true);
    expect(isConfirmationStale('2026-08-05', '2026-12-25', STALE_CONFIRMATION_DAYS)).toBe(true);
  });

  it('honours a custom threshold rather than only the default', () => {
    expect(isConfirmationStale('2026-08-05', '2026-08-10', 5)).toBe(true);
    expect(isConfirmationStale('2026-08-05', '2026-08-09', 5)).toBe(false);
  });

  // A bookkeeping fact that cannot be read must never force a re-check by
  // accident — the safe failure is to leave a confirmed rule trusted.
  it('treats an unparseable date on either side as not stale', () => {
    expect(isConfirmationStale('not-a-date', '2026-12-25')).toBe(false);
    expect(isConfirmationStale('2026-08-05', 'not-a-date')).toBe(false);
    expect(isConfirmationStale('', '')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildShippingDiscoveryReport,
  type ShippingDiscoveryEndedReason,
} from '../src/catalogue/shippingDiscoveryReport.js';

/**
 * The fact this report exists to preserve is the one a killed run cannot say
 * for itself: which shops it had already finished before it died. Every
 * scheduled shipping-discovery cycle from 2026-08-25T12:43 onward hit the
 * job's 900s backstop mid-batch (runs #334, #340, #341, #342 — read from
 * their job logs) while the old end-of-loop write held everything in memory,
 * so every one of those cycles recorded nothing at all — including a real
 * checkout quote for Kayali (run #342: £5.99 against the registry's £5.50)
 * that then existed only in an ephemeral CI log. These tests pin the same two
 * facts tests/harvestReport.test.ts pins for the harvest's identical fix:
 * which shops were never reached, and whether the run finished at all.
 */

interface Outcome {
  retailerId: string;
  verdict: string;
}

function outcome(id: string, verdict = 'UNREACHABLE'): Outcome {
  return { retailerId: id, verdict };
}

function build(
  planned: string[],
  outcomes: Outcome[],
  complete: boolean,
  endedReason: ShippingDiscoveryEndedReason | null = null,
) {
  return buildShippingDiscoveryReport(
    '2026-08-27T00:31:42.000Z',
    '2026-08-27T00:46:33.000Z',
    complete,
    endedReason,
    0,
    5,
    ['zimaya', 'harvey-nichols'],
    planned,
    outcomes,
  );
}

describe('buildShippingDiscoveryReport — silence made visible', () => {
  it('names the shops planned this cycle that never reported', () => {
    const r = build(['zara', 'ibraq', 'john-lewis', 'kayali'], [outcome('zara'), outcome('ibraq')], false);
    expect(r.notReached).toEqual(['john-lewis', 'kayali']);
  });

  it('reports nothing unreached when every planned shop answered', () => {
    const r = build(['zara', 'ibraq'], [outcome('zara'), outcome('ibraq')], true, 'swept-batch');
    expect(r.notReached).toEqual([]);
  });

  it('keeps the planned order, so the truncation point is readable', () => {
    // John Lewis's own cost is exactly why this matters: knowing the batch
    // stopped *right after* it, rather than at a random point, is the
    // difference between a readable report and one that just looks partial.
    const r = build(
      ['zara', 'ibraq', 'john-lewis', 'kayali'],
      [outcome('zara'), outcome('ibraq'), outcome('john-lewis')],
      false,
    );
    expect(r.notReached).toEqual(['kayali']);
  });
});

describe('buildShippingDiscoveryReport — a killed run says so', () => {
  it('is incomplete until finish() would have run', () => {
    const r = build(['zara'], [outcome('zara')], false);
    expect(r.complete).toBe(false);
  });

  it('is complete once the batch finishes on its own', () => {
    const r = build(['zara'], [outcome('zara')], true, 'swept-batch');
    expect(r.complete).toBe(true);
    expect(r.endedReason).toBe('swept-batch');
  });

  it('does not infer completeness from having reached every planned shop', () => {
    // A run can be killed after its last shop and before the report even
    // marks itself finished. This is the exact case the old end-of-loop
    // write could never distinguish from a real full sweep — `complete` is
    // the only thing that says so now.
    const r = build(['zara'], [outcome('zara')], false);
    expect(r.notReached).toEqual([]);
    expect(r.complete).toBe(false);
  });

  it('never claims a reason for a run that never got to say', () => {
    // buildShippingDiscoveryReport is called directly here with complete:
    // false and a reason anyway, the shape a caller could construct by
    // mistake — the report itself has to refuse it, not trust the caller.
    const r = build(['zara'], [], false, 'time-budget');
    expect(r.endedReason).toBeNull();
  });

  it('distinguishes a full sweep from the run stopping on its own time budget', () => {
    // The mechanism this whole fix adds: RUN_TIME_CEILING_MS in
    // scripts/shipping-discover.ts stops the run between shops on purpose,
    // before the external `timeout 900` ever has to. That is not a kill —
    // finish() still runs — but a reader needs to tell it apart from an
    // ordinary batch that simply ran out of shops.
    const swept = build(['zara', 'ibraq'], [outcome('zara'), outcome('ibraq')], true, 'swept-batch');
    expect(swept.endedReason).toBe('swept-batch');
    expect(swept.notReached).toEqual([]);

    const stopped = build(['zara', 'ibraq', 'john-lewis'], [outcome('zara')], true, 'time-budget');
    expect(stopped.endedReason).toBe('time-budget');
    expect(stopped.notReached).toEqual(['ibraq', 'john-lewis']);
  });
});

describe('buildShippingDiscoveryReport — what this cycle covered', () => {
  it('carries eligible and heldForLaterRuns through unchanged', () => {
    // Without these a reader comparing two reports would see shops vanish
    // and reappear and read it as shops being dropped from the registry,
    // rather than simply held for a later rotation — see selectDueTargets.
    const r = build(['zara'], [outcome('zara')], true, 'swept-batch');
    expect(r.eligible).toBe(5);
    expect(r.heldForLaterRuns).toEqual(['zimaya', 'harvey-nichols']);
  });

  it('does not mutate the arrays it was given', () => {
    const planned = ['zara'];
    const outcomes = [outcome('zara')];
    const held = ['zimaya'];
    buildShippingDiscoveryReport('T0', 'T1', true, 'swept-batch', 0, 5, held, planned, outcomes);
    expect(planned).toEqual(['zara']);
    expect(outcomes).toEqual([outcome('zara')]);
    expect(held).toEqual(['zimaya']);
  });
});

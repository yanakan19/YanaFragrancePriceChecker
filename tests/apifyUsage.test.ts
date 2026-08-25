import { describe, expect, it } from 'vitest';
import {
  describeApifyUsage,
  checkApifyUsage,
  APIFY_FREE_MONTHLY_USD,
  APIFY_STOP_AT_FRACTION,
} from '../src/catalogue/apifyUsage.js';

/**
 * The payloads below are synthetic. Apify's real response schema for
 * `/v2/users/me/usage/monthly` and `/v2/users/me/limits` could not be read
 * from the sandbox this was written in (docs.apify.com is egress-blocked), so
 * these exercise the *shape* of the reader — "find a USD spend figure wherever
 * it lives" — rather than asserting field names nobody here has seen on the
 * wire. See src/catalogue/apifyUsage.ts's header.
 *
 * The single most important test in this file is the last one: an unreadable
 * response must leave the metered tiers ON. A diagnostic that cannot read its
 * own input is not evidence, and switching five shops off on the strength of
 * it would invent a fact.
 */

describe('describeApifyUsage — reading a spend figure', () => {
  it('finds a flat monthly USD figure and reports room left', () => {
    const r = describeApifyUsage({ data: { monthlyUsageUsd: 1.25 } }, { data: { maxMonthlyUsageUsd: 5 } });
    expect(r.state).toBe('ok');
    expect(r.usedUsd).toBe(1.25);
    expect(r.limitUsd).toBe(5);
    expect(r.meteredAllowed).toBe(true);
  });

  it('finds a figure nested under a parent that carries the meaning', () => {
    const r = describeApifyUsage({ data: { current: { usageUsd: 2 } } }, {});
    expect(r.usedUsd).toBe(2);
    expect(r.state).toBe('ok');
  });

  it('falls back to the published free-tier limit when no ceiling is in the payload', () => {
    const r = describeApifyUsage({ data: { totalUsageUsd: 1 } }, {});
    expect(r.limitUsd).toBe(APIFY_FREE_MONTHLY_USD);
    expect(r.lines.join(' ')).toContain('assumed free tier');
  });

  it('takes the largest spend figure, so a line-item breakdown cannot undercount', () => {
    // Undercounting here spends real money, so the total must win over parts.
    const r = describeApifyUsage(
      { data: { actorUsageUsd: 1.5, proxyUsageUsd: 0.75, totalUsageUsd: 2.25 } },
      {},
    );
    expect(r.usedUsd).toBe(2.25);
  });

  it('ignores numbers whose key names no currency', () => {
    const r = describeApifyUsage({ data: { computeUnits: 9999, monthlyUsageUsd: 0.5 } }, {});
    expect(r.usedUsd).toBe(0.5);
  });
});

describe('describeApifyUsage — the budget gate', () => {
  it('stops metered work once the credit is spent', () => {
    const r = describeApifyUsage({ data: { monthlyUsageUsd: 5 } }, { data: { maxMonthlyUsageUsd: 5 } });
    expect(r.state).toBe('exhausted');
    expect(r.meteredAllowed).toBe(false);
    expect(r.lines.join(' ')).toContain('Metered tiers are OFF');
  });

  it('stops before the limit, keeping a reserve for a render already in flight', () => {
    const justPast = APIFY_FREE_MONTHLY_USD * APIFY_STOP_AT_FRACTION + 0.01;
    const r = describeApifyUsage({ data: { monthlyUsageUsd: justPast } }, {});
    expect(r.state).toBe('near-limit');
    expect(r.meteredAllowed).toBe(false);
  });

  it('allows metered work just under the reserve threshold', () => {
    const justUnder = APIFY_FREE_MONTHLY_USD * APIFY_STOP_AT_FRACTION - 0.01;
    const r = describeApifyUsage({ data: { monthlyUsageUsd: justUnder } }, {});
    expect(r.state).toBe('ok');
    expect(r.meteredAllowed).toBe(true);
  });
});

describe('describeApifyUsage — an unreadable answer never blocks a harvest', () => {
  it('reports unknown and leaves metered tiers ON when no USD figure exists', () => {
    const r = describeApifyUsage({ data: { computeUnits: 12, plan: 'FREE' } }, { data: {} });
    expect(r.state).toBe('unknown');
    expect(r.usedUsd).toBeNull();
    expect(r.meteredAllowed).toBe(true);
  });

  it('prints the key names it did see, so one real run can settle the schema', () => {
    const r = describeApifyUsage({ data: { computeUnits: 12, someOtherField: 3 } }, { data: { tier: 1 } });
    const text = r.lines.join(' ');
    expect(text).toContain('computeUnits');
    expect(text).toContain('someOtherField');
    expect(text).toContain('tier');
  });

  it('treats an entirely empty response as unknown, not as zero spend', () => {
    const r = describeApifyUsage({}, {});
    expect(r.state).toBe('unknown');
    expect(r.meteredAllowed).toBe(true);
  });
});

describe('checkApifyUsage — network failure is a report, not a throw', () => {
  it('returns unknown with tiers ON when both endpoints are unreachable', async () => {
    const failing = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const r = await checkApifyUsage('token-not-real', failing);
    expect(r.state).toBe('unknown');
    expect(r.meteredAllowed).toBe(true);
  });

  it('never puts the token in a log line', async () => {
    const failing = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const r = await checkApifyUsage('super-secret-token', failing);
    expect(r.lines.join(' ')).not.toContain('super-secret-token');
  });

  it('reads a live-shaped response through a stubbed fetch', async () => {
    const ok = (async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes('usage/monthly')
          ? { data: { monthlyUsageUsd: 4.9 } }
          : { data: { maxMonthlyUsageUsd: 5 } },
    })) as unknown as typeof fetch;

    const r = await checkApifyUsage('token-not-real', ok);
    expect(r.usedUsd).toBe(4.9);
    expect(r.limitUsd).toBe(5);
    // $4.90 of $5 is 98% — past the reserve threshold but not yet spent, so
    // `near-limit` rather than `exhausted`. Both stop metered work.
    expect(r.state).toBe('near-limit');
    expect(r.meteredAllowed).toBe(false);
  });

  it('does not mistake the ceiling for the spend when both are present', () => {
    // The bug this pair was written for: `maxMonthlyUsageUsd` also matches
    // "usage", so a naive largest-wins read returned the limit as the amount
    // spent and declared an unused account exhausted.
    const r = describeApifyUsage(
      { data: { monthlyUsageUsd: 0 } },
      { data: { maxMonthlyUsageUsd: 5 } },
    );
    expect(r.usedUsd).toBe(0);
    expect(r.limitUsd).toBe(5);
    expect(r.state).toBe('ok');
    expect(r.meteredAllowed).toBe(true);
  });
});

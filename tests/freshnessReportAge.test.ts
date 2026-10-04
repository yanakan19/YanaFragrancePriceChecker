// The freshness check runs even after an earlier step of the crawl failed, so
// it says how old the harvest report it is reading is (reportAge).
import { describe, expect, it } from 'vitest';
import { reportAge } from '../src/catalogue/freshness.js';

const NOW = new Date('2026-10-04T12:00:00Z');

describe('reportAge', () => {
  it('reports a report from this run as fresh', () => {
    const a = reportAge('2026-10-04T10:30:00Z', NOW);
    expect(a).toMatchObject({ hours: 1.5, stale: false });
    expect(a.line).toContain('started 1.5 hours ago');
  });

  it('flags a report older than a missed harvest as stale', () => {
    const a = reportAge('2026-10-04T02:36:00Z', NOW);
    expect(a.stale).toBe(true);
    expect(a.hours).toBe(9.4);
    expect(a.line).toContain('did not happen or did not commit');
  });

  it('treats a report with no start time as stale and of unknown age', () => {
    expect(reportAge(undefined, NOW)).toMatchObject({ hours: null, stale: true });
    expect(reportAge('not a date', NOW).stale).toBe(true);
  });
});

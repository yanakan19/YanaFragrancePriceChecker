import { describe, expect, it } from 'vitest';
import { cronFiresAt, cronsOf, lastDueTick, renderBody, summarise, type Run, type WorkflowInfo } from '../scripts/failure-digest.js';

const now = new Date('2026-10-14T08:23:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600e3).toISOString();
let id = 0;
const run = (workflowId: number, conclusion: string | null, h: number): Run => ({
  id: ++id, workflowId, name: `wf${workflowId}`, conclusion, createdAt: hoursAgo(h), url: `https://example.test/run/${id}`,
});
const hourly: WorkflowInfo = { id: 1, name: 'Hourly', crons: ['15 * * * *'] };
const daily: WorkflowInfo = { id: 2, name: 'Daily', crons: ['17 3 * * *'] };
const weekly: WorkflowInfo = { id: 3, name: 'Weekly', crons: ['40 4 * * 0'] };
const manual: WorkflowInfo = { id: 4, name: 'Manual', crons: [] };
const okSite = ['a', 'b', 'c'].map((u) => ({ url: u, status: 200 }));

describe('failure digest rule', () => {
  it('reports nothing when everything ran and passed', () => {
    const r = summarise({ now, workflows: [hourly, daily, manual], site: okSite, runs: [run(1, 'success', 1), run(2, 'success', 5)] });
    expect(r.problems).toEqual([]);
  });

  it('counts failure, timed_out and startup_failure per workflow, and ignores cancelled', () => {
    const runs = [run(1, 'failure', 2), run(1, 'timed_out', 3), run(1, 'startup_failure', 4), run(1, 'cancelled', 5), run(1, 'success', 1), run(2, 'cancelled', 1), run(2, 'success', 2)];
    const r = summarise({ now, workflows: [hourly, daily], site: okSite, runs });
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatchObject({ kind: 'failed', workflow: 'Hourly', count: 3, stillFailing: false });
    expect(r.subject).toBe('PriceSniffs: 1 problem in the last 24 hours');
  });

  it('flags a workflow that went quiet when its cron was due, not one that is merely not due', () => {
    const r = summarise({ now, workflows: [hourly, daily, weekly, manual], site: okSite, runs: [] });
    const quiet = r.problems.filter((p) => p.kind === 'quiet').map((p) => (p as { workflow: string }).workflow);
    expect(quiet).toEqual(['Hourly', 'Daily']);
  });

  it('does not flag a tick that is inside the grace period, or a disabled workflow, or the digest itself', () => {
    const late: WorkflowInfo = { id: 5, name: 'Late', crons: ['0 8 * * *'] }; // due 23 minutes ago
    const off: WorkflowInfo = { ...daily, id: 6, name: 'Off', disabled: true };
    const self: WorkflowInfo = { id: 7, name: 'Failure digest', crons: ['23 8 * * *'] };
    const r = summarise({ now, workflows: [late, off, self], site: okSite, runs: [], self: 'Failure digest' });
    expect(r.problems).toEqual([]);
  });

  it('flags a workflow whose latest run is failing after earlier successes, even with no failure today', () => {
    const r = summarise({ now, workflows: [weekly], site: okSite, runs: [run(3, 'failure', 30), run(3, 'success', 100)] });
    expect(r.problems).toMatchObject([{ kind: 'still-failing', workflow: 'Weekly' }]);
    const ok = summarise({ now, workflows: [weekly], site: okSite, runs: [run(3, 'success', 30), run(3, 'failure', 100)] });
    expect(ok.problems).toEqual([]);
  });

  it('marks a failure that is also the latest outcome as still failing', () => {
    const r = summarise({ now, workflows: [daily], site: okSite, runs: [run(2, 'failure', 2), run(2, 'success', 26)] });
    expect(r.problems[0]).toMatchObject({ kind: 'failed', stillFailing: true });
  });

  it('flags each site address that does not answer 200', () => {
    const site = [{ url: 'a', status: 200 }, { url: 'b', status: 503 }, { url: 'c', status: null }];
    const r = summarise({ now, workflows: [], site, runs: [] });
    expect(r.problems).toEqual([{ kind: 'site', url: 'b', status: 503 }, { kind: 'site', url: 'c', status: null }]);
    expect(r.subject).toBe('PriceSniffs: 2 problems in the last 24 hours');
  });

  it('writes one line per problem with name, link, time and the failing step', () => {
    const f = run(1, 'failure', 2);
    const body = renderBody([{ kind: 'failed', workflow: 'Hourly', count: 1, stillFailing: false, latest: f, step: 'Harvest' }]);
    const lines = body.trim().split('\n');
    expect(lines[0]).toContain('Hourly');
    expect(lines[0]).toContain(f.url);
    expect(lines[0]).toContain('UTC');
    expect(lines[0]).toContain('"Harvest"');
  });
});

describe('cron reading', () => {
  it('matches lists, steps, ranges and weekdays', () => {
    expect(cronFiresAt('7,37 * * * *', new Date('2026-10-14T05:37:00Z'))).toBe(true);
    expect(cronFiresAt('7,37 * * * *', new Date('2026-10-14T05:38:00Z'))).toBe(false);
    expect(cronFiresAt('0 */3 * * *', new Date('2026-10-14T06:00:00Z'))).toBe(true);
    expect(cronFiresAt('0 */3 * * *', new Date('2026-10-14T07:00:00Z'))).toBe(false);
    expect(cronFiresAt('40 4 * * 0', new Date('2026-10-18T04:40:00Z'))).toBe(true); // a Sunday
    expect(cronFiresAt('40 4 * * 0', new Date('2026-10-14T04:40:00Z'))).toBe(false);
  });
  it('finds the last due tick before the grace period', () => {
    expect(lastDueTick(['15 * * * *'], now)?.toISOString()).toBe('2026-10-14T06:15:00.000Z');
    expect(lastDueTick(['47 4 1 * *'], now)).toBeNull();
  });
  it('reads cron lines from workflow text', () => {
    expect(cronsOf("on:\n  schedule:\n    # comment\n    - cron: '23 8 * * *'\n    - cron: \"5 1 * * *\"\n")).toEqual(['23 8 * * *', '5 1 * * *']);
  });
});

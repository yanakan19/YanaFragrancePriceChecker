// scripts/deploy-watchdog.mjs: deploy #1165 (2026-10-06) waited almost four
// hours for a runner it never got while holding the pages group.
import { describe, expect, it } from 'vitest';
import { STUCK_AFTER_MINUTES, stuckRuns } from '../scripts/deploy-watchdog.mjs';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const job = (status: string, createdMinutesAgo: number, runner = '') =>
  [{ name: 'decide', status: 'completed', runner_name: 'GitHub Actions 1', created_at: ago(createdMinutesAgo) },
    { name: 'deploy', status, runner_name: runner, created_at: ago(createdMinutesAgo) }];

describe('which deploy runs the watchdog cancels', () => {
  it('cancels a run whose deploy job has waited for a runner past the limit (the #1165 shape)', () => {
    const jobs = new Map([[1165, job('queued', 226)]]);
    const out = stuckRuns({ runs: [{ id: 1165, run_number: 1165 }], jobsOf: (id: number) => jobs.get(id), ownRunId: 2, now: NOW });
    expect(out.map((r) => r.number)).toEqual([1165]);
    expect(out[0]!.reason).toContain('226 minutes');
  });

  it('leaves a deploy that is running, however long, to its own timeout', () => {
    const jobs = new Map([[1, job('in_progress', 240, 'GitHub Actions 7')], [2, job('queued', 240, 'GitHub Actions 8')]]);
    expect(stuckRuns({ runs: [{ id: 1, run_number: 1 }, { id: 2, run_number: 2 }], jobsOf: (id: number) => jobs.get(id), ownRunId: 9, now: NOW })).toEqual([]);
  });

  it('leaves a deploy that has waited less than the limit, its own run, and a run with no deploy job yet', () => {
    const jobs = new Map<number, ReturnType<typeof job>>([
      [1, job('queued', STUCK_AFTER_MINUTES - 1)],
      [2, job('waiting', 500)],
      [3, [{ name: 'decide', status: 'queued', runner_name: '', created_at: ago(500) }] as ReturnType<typeof job>],
    ]);
    const runs = [1, 2, 3].map((id) => ({ id, run_number: id }));
    expect(stuckRuns({ runs, jobsOf: (id: number) => jobs.get(id), ownRunId: 2, now: NOW })).toEqual([]);
  });

  it('counts waiting and pending deploy jobs as stuck too, not only queued ones', () => {
    const jobs = new Map([[1, job('waiting', 60)], [2, job('pending', 60)], [3, job('completed', 60)]]);
    const runs = [1, 2, 3].map((id) => ({ id, run_number: id }));
    expect(stuckRuns({ runs, jobsOf: (id: number) => jobs.get(id), ownRunId: 9, now: NOW }).map((r) => r.id)).toEqual([1, 2]);
  });
});

// scripts/crawl-guard.sh decides, on every hourly tick, whether the catalogue
// crawl does a real harvest. These cases feed it saved API answers.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/crawl-guard.sh', import.meta.url));
const NOW = Date.parse('2026-10-04T12:00:00Z') / 1000;
const iso = (minutesAgo: number) => new Date((NOW - minutesAgo * 60) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

interface Run { id: number; run_number: number; status: string; event: string; created_at: string }
function guard(opts: {
  event?: string;
  scheduledTick?: string;
  runs?: Run[] | string;
  harvestMinutesAgo?: number | null;
  oneShopMinutesAgo?: number;
}) {
  const dir = mkdtempSync(join(tmpdir(), 'crawl-guard-'));
  dirs.push(dir);
  const runsFile = join(dir, 'runs.json');
  const commitsFile = join(dir, 'commits.json');
  const runs = opts.runs ?? [{ id: 900, run_number: 600, status: 'in_progress', event: 'schedule', created_at: iso(0) }];
  writeFileSync(runsFile, typeof runs === 'string' ? runs : JSON.stringify({ workflow_runs: runs }));
  const commits = [];
  if (opts.oneShopMinutesAgo !== undefined) {
    commits.push({ commit: { message: 'Harvest: one shop (boots), real prices 2026-10-04', committer: { date: iso(opts.oneShopMinutesAgo) } } });
  }
  if (opts.harvestMinutesAgo !== null && opts.harvestMinutesAgo !== undefined) {
    commits.push({ commit: { message: 'Harvest: real prices 2026-10-04', committer: { date: iso(opts.harvestMinutesAgo) } } });
  }
  writeFileSync(commitsFile, JSON.stringify(commits));
  const r = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      EVENT: opts.event ?? 'schedule',
      SCHEDULED_TICK: opts.scheduledTick ?? '',
      RUN_ID: '900',
      RUN_NUMBER: '600',
      RUNS_JSON: runsFile,
      COMMITS_JSON: commitsFile,
      NOW: String(NOW),
    },
  });
  return { decision: /should-run=(true|false)/.exec(r.stdout)?.[1], out: r.stdout + r.stderr, status: r.status };
}

describe('scripts/crawl-guard.sh', () => {
  it('runs a person\'s dispatch whatever the history says', () => {
    expect(guard({ event: 'workflow_dispatch', harvestMinutesAgo: 5 }).decision).toBe('true');
  });

  it('gates a dispatch from an outside scheduler exactly like a scheduled tick', () => {
    expect(guard({ event: 'workflow_dispatch', scheduledTick: 'true', harvestMinutesAgo: 30 }).decision).toBe('false');
    expect(guard({ event: 'workflow_dispatch', scheduledTick: 'true', harvestMinutesAgo: 200 }).decision).toBe('true');
  });

  it('runs once the last full sweep is 150 minutes old, and not before', () => {
    expect(guard({ harvestMinutesAgo: 149 }).decision).toBe('false');
    expect(guard({ harvestMinutesAgo: 150 }).decision).toBe('true');
    expect(guard({ harvestMinutesAgo: 600 }).decision).toBe('true');
  });

  it('does not count a one shop dispatch as a sweep (2026-10-03)', () => {
    expect(guard({ harvestMinutesAgo: 400, oneShopMinutesAgo: 10 }).decision).toBe('true');
  });

  it('runs in full when the API answer cannot be read', () => {
    const r = guard({ harvestMinutesAgo: null, runs: 'not json' });
    expect(r.decision).toBe('true');
    expect(r.out).toContain('running in full rather than guessing a skip');
  });

  it('skips while an older run of the crawl is still going, so two crawls never queue back to back', () => {
    const r = guard({
      harvestMinutesAgo: 300,
      runs: [
        { id: 900, run_number: 600, status: 'in_progress', event: 'schedule', created_at: iso(0) },
        { id: 899, run_number: 599, status: 'in_progress', event: 'schedule', created_at: iso(70) },
      ],
    });
    expect(r.decision).toBe('false');
    expect(r.out).toContain('An older crawl run is still going: #599');
  });

  it('does not wait for a newer run, or a finished one, or one stuck for over four hours', () => {
    const r = guard({
      harvestMinutesAgo: 300,
      runs: [
        { id: 901, run_number: 601, status: 'in_progress', event: 'schedule', created_at: iso(0) },
        { id: 900, run_number: 600, status: 'in_progress', event: 'schedule', created_at: iso(0) },
        { id: 898, run_number: 598, status: 'completed', event: 'schedule', created_at: iso(90) },
        { id: 897, run_number: 597, status: 'queued', event: 'workflow_dispatch', created_at: iso(300) },
      ],
    });
    expect(r.decision).toBe('true');
  });
});

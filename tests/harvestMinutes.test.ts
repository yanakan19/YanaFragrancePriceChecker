// scripts/harvest-minutes.sh sizes the harvest's own deadline to what is left
// of the crawl job's 120 minutes, so "Commit harvested prices" always lands
// before the job's limit cancels it (run #180 lost a harvest that way).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/harvest-minutes.sh', import.meta.url));
const NOW = 1_800_000_000;

function minutes(elapsedMin: number | null) {
  const env: Record<string, string> = { ...process.env, NOW: String(NOW) } as Record<string, string>;
  delete env.JOB_STARTED_AT;
  if (elapsedMin !== null) env.JOB_STARTED_AT = String(NOW - elapsedMin * 60);
  const r = spawnSync('bash', [SCRIPT], { encoding: 'utf8', env });
  return { status: r.status, out: r.stdout.trim(), err: r.stderr };
}

describe('scripts/harvest-minutes.sh', () => {
  it('gives the usual 56 minutes when the run is on time', () => {
    expect(minutes(25)).toMatchObject({ status: 0, out: '56' });
    expect(minutes(42)).toMatchObject({ status: 0, out: '56' });
  });

  it('shortens the harvest when the stages before it ran long, so its commit still fits', () => {
    // #592 reached the harvest at about minute 38; a day twice as slow:
    const r = minutes(70);
    expect(r.status).toBe(0);
    expect(r.out).toBe('28');
    expect(r.err).toContain('gets 28 minutes instead of 56');
    expect(70 + 28 + 22).toBeLessThanOrEqual(120);
  });

  it('skips a harvest too short to be worth committing, with a reason', () => {
    const r = minutes(95);
    expect(r.status).toBe(3);
    expect(r.err).toContain('too little for a harvest');
  });

  it('falls back to 56 minutes when the start time was not recorded', () => {
    const r = minutes(null);
    expect(r).toMatchObject({ status: 0, out: '56' });
    expect(r.err).toContain('JOB_STARTED_AT is not set');
  });
});

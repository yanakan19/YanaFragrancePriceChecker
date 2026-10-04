// Rules every workflow in .github/workflows keeps, written down after run #592
// (2026-10-04) and the failure mode review in docs/PIPELINE-FAILURE-MODES.md.
// The files are read as text: they are indented consistently, and the repo
// carries no YAML parser.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { policyOf, readManifest, REPO_ROOT } from '../scripts/generatedFiles.js';

const DIR = join(REPO_ROOT, '.github/workflows');
const files = readdirSync(DIR).filter((f) => f.endsWith('.yml'));
const text = (f: string) => readFileSync(join(DIR, f), 'utf8');

/** Each job's name and its block of text, from a workflow's `jobs:` map. */
function jobs(f: string): { name: string; body: string }[] {
  const t = text(f);
  const start = t.indexOf('\njobs:\n');
  const lines = t.slice(start + 7).split('\n');
  const out: { name: string; body: string }[] = [];
  for (const line of lines) {
    // Comments are prose, often naming the very commands checked below.
    if (line.trimStart().startsWith('#')) continue;
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) out.push({ name: m[1]!, body: '' });
    else if (out.length) out[out.length - 1]!.body += `${line}\n`;
  }
  return out;
}

/** Each step of a job: its first line and its text. */
function steps(body: string): string[] {
  return body.split(/\n(?= {6}- )/).filter((s) => s.startsWith('      - '));
}

/** The concurrency group a job runs in: its own, else its workflow's. */
function groupOf(f: string, jobBody: string): string | null {
  const own = /\n {4}concurrency:\n {6}group: (\S+)/.exec(`\n${jobBody}`);
  if (own) return own[1]!;
  const wf = /\nconcurrency:\n {2}group: (\S+)/.exec(text(f));
  return wf ? wf[1]! : null;
}

const REBUILT = readManifest().filter((e) => e.policy === 'rebuild').map((e) => e.pattern.replace(/\/$/, ''));

/** The paths a job commits through scripts/commit-and-push.sh. */
function committedPaths(jobBody: string): string[] {
  const paths: string[] = [];
  for (const m of jobBody.matchAll(/\.\/scripts\/commit-and-push\.sh((?:[^\n]*\\\n)*[^\n]*)/g)) {
    const args = m[1]!.replace(/\\\n/g, ' ').trim();
    for (const token of args.slice(args.indexOf('"', 1) + 1).trim().split(/\s+/).filter(Boolean)) {
      paths.push(...(token === '$REBUILT' ? REBUILT : [token]));
    }
  }
  return paths;
}

const overlaps = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

describe('every workflow', () => {
  it('caps every job with timeout-minutes, so a hang ends instead of holding a runner for six hours', () => {
    for (const f of files) {
      for (const job of jobs(f)) {
        expect(job.body, `${f} job ${job.name}`).toMatch(/\n {4}timeout-minutes: \d+/);
      }
    }
  });

  it('caps every step that installs, harvests, builds or pushes, in every job that commits to the branch', () => {
    for (const f of files) {
      for (const job of jobs(f)) {
        if (!job.body.includes('commit-and-push.sh')) continue;
        for (const step of steps(job.body)) {
          if (!/npm ci|commit-and-push\.sh|npm run (harvest|rebuild|houses|probe)|links:resolve|playwright install|actions\/checkout/.test(step)) continue;
          expect(step, `${f} ${job.name}: ${step.split('\n')[0]}`).toMatch(/\n {8}timeout-minutes: \d+/);
        }
      }
    }
  });

  it('retries npm ci with backoff', () => {
    for (const f of files) {
      for (const m of text(f).matchAll(/^\s+(?:- )?(?:run: )?(.*\bnpm ci\b.*)$/gm)) {
        if (m[0].trimStart().startsWith('#')) continue;
        expect(m[1], f).toContain('scripts/retry.sh');
      }
    }
  });

  it('runs only repository scripts that exist from the step\'s working directory', () => {
    // apps-build.yml runs its steps in apps/, and a bare scripts/retry.sh
    // there failed both its jobs on 2026-10-04 (run #2).
    let checked = 0;
    for (const f of files) {
      for (const job of jobs(f)) {
        const jobDir = /\n {4}defaults:\n {6}run:\n {8}working-directory: (\S+)/.exec(`\n${job.body}`)?.[1] ?? '.';
        for (const step of steps(job.body)) {
          const dir = /\n {8}working-directory: (\S+)/.exec(step)?.[1] ?? jobDir;
          for (const m of step.matchAll(/(?:^|[\s"'(])((?:\.\.?\/)*scripts\/[\w.-]+\.(?:sh|ts|mjs|py))\b/g)) {
            checked++;
            const target = join(REPO_ROOT, dir, m[1]!);
            expect(existsSync(target), `${f} ${job.name}: ${m[1]} from ${dir}`).toBe(true);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('pushes only through scripts/commit-and-push.sh, never a bare git push', () => {
    for (const f of files) {
      const code = text(f).split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
      expect(code, f).not.toMatch(/\bgit push\b/);
    }
  });

  it('runs any two jobs that commit the same path in one concurrency group, so they never race', () => {
    const committers = files.flatMap((f) => jobs(f).map((j) => ({ where: `${f}:${j.name}`, group: groupOf(f, j.body), paths: committedPaths(j.body) })))
      .filter((c) => c.paths.length > 0);
    // The crawl, fragrance links, image check, photo measuring, price
    // verification and delivery re-check.
    expect(committers.length).toBeGreaterThanOrEqual(6);
    for (const a of committers) {
      expect(a.group, `${a.where} commits but has no concurrency group`).not.toBeNull();
      for (const b of committers) {
        if (a === b) continue;
        const shared = a.paths.filter((p) => b.paths.some((q) => overlaps(p, q)));
        if (shared.length) expect(a.group, `${a.where} and ${b.where} both commit ${shared[0]}`).toBe(b.group);
      }
    }
  });

  it('commits only paths the manifest of generated files covers', () => {
    for (const f of files) {
      for (const job of jobs(f)) {
        for (const p of committedPaths(job.body)) {
          const covered = policyOf(p) !== null || readManifest().some((e) => e.pattern.startsWith(`${p}/`));
          expect(covered, `${f} commits ${p}`).toBe(true);
        }
      }
    }
  });
});

describe('catalogue-daily.yml', () => {
  const daily = text('catalogue-daily.yml');
  const step = (name: string) => {
    const start = daily.indexOf(`      - name: ${name}\n`);
    expect(start, name).toBeGreaterThan(0);
    const next = daily.indexOf('\n      - ', start + 10);
    return daily.slice(start, next < 0 ? undefined : next);
  };

  it('reports freshness even after an earlier step failed (run #592 skipped it), and never on a cancelled run', () => {
    expect(step("Check every answering shop's prices are under 48 hours old")).toMatch(/if: \$\{\{ !cancelled\(\) &&/);
    expect(step('Note an incomplete harvest')).toMatch(/if: \$\{\{ !cancelled\(\) &&/);
    expect(step('Note a rebuild that did not finish')).toMatch(/if: \$\{\{ !cancelled\(\) &&/);
  });

  it('keeps a periodic stage from costing the harvest, and still turns the run red when one fails', () => {
    for (const name of ['Discover shipping terms', 'Commit the shipping report', 'Sync Awin product feeds', 'Commit synced Awin feeds']) {
      expect(step(name), name).toContain('continue-on-error: true');
    }
    expect(step('Commit synced Awin feeds')).toContain("steps.awin.outcome == 'success'");
    expect(step('Commit the shipping report')).toContain("steps.shipping.outcome == 'success'");
    expect(step('Undo an Awin sync that did not finish')).toContain("steps.awin.outcome == 'failure'");
    const fail = step('Fail the run if a periodic stage failed');
    for (const id of ['shipping', 'commit_shipping', 'awin', 'commit_awin']) expect(fail).toContain(`steps.${id}.outcome == 'failure'`);
    expect(fail).toContain('exit 1');
  });

  it('commits the rebuilt page only after a rebuild that finished and wrote nothing outside the manifest', () => {
    const rebuild = step('Rebuild the app from harvested prices');
    expect(rebuild).toContain('npx tsx scripts/check-generated-writes.ts --since-ms');
    // The mark comes more than the check's one second clock allowance after
    // the previous step's last write (dispatch #595 tripped on that).
    expect(rebuild).toMatch(/sleep 2\n\s+MARK=\$\(node -e 'console\.log\(Date\.now\(\)\)'\)\n\s+npm run rebuild/);
    expect(step('Commit rebuilt app')).toContain("steps.rebuild.outcome == 'success'");
  });

  it('runs the crawl on a pinned runner image, not ubuntu-latest, which moves to Ubuntu 26 on 2026-10-19', () => {
    const crawl = jobs('catalogue-daily.yml').find((j) => j.name === 'crawl')!;
    expect(crawl.body).toMatch(/\n {4}runs-on: ubuntu-\d\d\.\d\d\n/);
  });

  it('sizes the harvest deadline to the time the job has left', () => {
    const harvest = step('Harvest via sitemap');
    expect(harvest).toContain('RUN_MINUTES=$(scripts/harvest-minutes.sh)');
    expect(harvest).toContain('--run-minutes="$RUN_MINUTES"');
    expect(step('Note when the job started')).toContain('JOB_STARTED_AT=');
  });

  it('verifies a shipping registry edit against the branch\'s own type errors, not the whole repo\'s', () => {
    const shipping = step('Discover shipping terms');
    expect(shipping).toContain('scripts/no-new-type-errors.sh src/config/retailers.ts');
    expect(shipping).not.toMatch(/if ! npm run typecheck/);
  });

  it('treats an outside scheduler\'s scheduled_tick dispatch exactly like a scheduled tick', () => {
    expect(daily).toContain("SCHEDULED: ${{ github.event_name == 'schedule' || inputs.scheduled_tick == true }}");
    expect(daily).not.toMatch(/if: \$\{\{[^}]*github\.event_name == 'schedule'/);
    expect(daily).toContain("(github.event_name != 'schedule' && inputs.scheduled_tick != true) || needs.guard.outputs.should-run == 'true'");
    expect(daily).toContain('run: bash scripts/crawl-guard.sh');
    // The dispatch form's own defaults must not leak into a tick.
    expect(step('Harvest via sitemap')).toContain("--max=${{ (env.SCHEDULED != 'true' && inputs.harvest_max) || '70' }}");
  });
});

describe('deploy-pages.yml', () => {
  it('lets a running deployment finish rather than cancelling it mid deploy', () => {
    expect(text('deploy-pages.yml')).toMatch(/concurrency:\n {2}group: pages\n {2}cancel-in-progress: false/);
  });
});

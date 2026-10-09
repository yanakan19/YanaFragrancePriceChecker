// Rules every workflow in .github/workflows keeps, written down after run #592
// (2026-10-04) and the failure mode review in docs/PIPELINE-FAILURE-MODES.md.
// The files are read as text: they are indented consistently, and the repo
// carries no YAML parser.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

  // #426 to #575 (49 runs, 2026-09-10 to 2026-10-03): the whole suite gated
  // the harvest, and tests that pinned live data (a shop's price, a product's
  // stock, the shops with listings) failed it whenever a shop changed. Since
  // 2026-10-03 the gate is the harvest's own tests; none of them may read the
  // generated catalogue, which every crawl rewrites.
  it('gates the harvest only on tests that exist and read no data the crawl rewrites', () => {
    const gate = step('Test the harvest before crawling');
    const listed = [...gate.matchAll(/tests\/[\w./-]+\.test\.ts/g)].map((m) => m[0]);
    expect(listed.length).toBeGreaterThan(10);
    for (const t of listed) {
      const path = join(REPO_ROOT, t);
      expect(existsSync(path), t).toBe(true);
      const src = readFileSync(path, 'utf8');
      expect(src, `${t} imports a generated module`).not.toMatch(/from '[^']*\.generated(\.js)?'/);
      expect(src, `${t} reads the harvest report or price history`).not.toMatch(/['/](harvest-report|price-history-checkpoint|harvest-cursor)\.json'/);
    }
    expect(step('Test everything else')).toContain('continue-on-error: true');
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
  const deploy = text('deploy-pages.yml');
  const job = jobs('deploy-pages.yml').find((j) => j.name === 'deploy')!;
  const stepList = steps(job.body);
  const at = (needle: string) => stepList.findIndex((s) => s.includes(needle));

  it('lets a running deployment finish rather than cancelling it mid deploy', () => {
    expect(job.body).toMatch(/\n {4}concurrency:\n {6}group: pages\n {6}cancel-in-progress: false/);
  });

  // Deploy #1165 (2026-10-06) waited four hours for a runner while holding
  // the pages group; ten deploys behind it were replaced and the site stayed
  // four hours behind. The group is the deploy job's, so every run's decide
  // job can run and cancel such a wait (scripts/deploy-watchdog.mjs).
  it('keeps the pages group off the decide job, which cancels a deploy stuck waiting for a runner', () => {
    expect(deploy).not.toMatch(/\nconcurrency:/);
    const decideJob = jobs('deploy-pages.yml').find((j) => j.name === 'decide')!;
    expect(decideJob.body).not.toContain('concurrency:');
    const decideSteps = steps(decideJob.body);
    const watchdog = decideSteps.findIndex((s) => s.includes('run: node scripts/deploy-watchdog.mjs'));
    expect(watchdog, 'the watchdog step').toBeGreaterThan(0);
    expect(decideSteps[watchdog]).toContain('GH_TOKEN: ${{ github.token }}');
    expect(watchdog).toBeLessThan(decideSteps.findIndex((s) => s.includes('deploy-decision.mjs decide')));
    expect(deploy).toMatch(/\npermissions:\n(?: {2}.*\n| *#.*\n)*? {2}actions: write\n/);
  });

  // The page and its data files are built here, not committed (2026-10-04),
  // so an upload without a build would publish a site with no page at all.
  it('builds the site and checks the build before it uploads anything', () => {
    const build = at('run: npm run demo');
    const check = at('scripts/check-demo-freshness.ts');
    const upload = at('actions/upload-pages-artifact');
    expect(build, 'a step that runs npm run demo').toBeGreaterThan(0);
    expect(check, 'the freshness check').toBeGreaterThan(build);
    expect(upload, 'the upload').toBeGreaterThan(check);
    expect(at('actions/deploy-pages')).toBeGreaterThan(upload);
    expect(stepList[check]).toContain('test -s demo/index.html');
    expect(stepList[check]).toContain('cmp demo/index.html demo/404.html');
    expect(stepList[upload]).toContain('path: demo');
  });

  it('checks out the branch tip with the history the sitemap dates read', () => {
    const checkout = stepList[at('actions/checkout')]!;
    expect(checkout).toContain('ref: ${{ github.event.workflow_run.head_branch || github.ref }}');
    expect(checkout).toContain('fetch-depth: 0');
  });

  it('deploys after every crawl and links run, and on any push that can change the page, src/ included', () => {
    expect(deploy).toContain("workflows: ['Catalogue crawl', 'Fragrance links daily', 'Catalogue crawl US', 'Catalogue crawl IN']");
    for (const f of ['catalogue-daily.yml', 'fragrance-links-daily.yml', 'catalogue-us.yml', 'catalogue-in.yml']) {
      const name = /^name: (.+)$/m.exec(text(f))![1]!;
      expect(deploy, f).toContain(`'${name}'`);
    }
    const paths = /\n {2}push:\n(?: {4}.*\n)*? {4}paths:\n((?: {6}- .*\n)+)/.exec(deploy)![1]!
      .split('\n').map((l) => l.trim().replace(/^- '?|'$/g, '')).filter(Boolean);
    expect(paths[0]).toBe('**');
    // GitHub's filter globs, roughly: ** crosses folders, * does not.
    const glob = (p: string) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*')}$`);
    const inputs = ['src/config/retailers.ts', 'demo/app.ts', 'demo/template.html', 'demo/catalogue.generated.ts',
      'scripts/build-demo.ts', 'package.json', 'package-lock.json', 'tsconfig.demo.json'];
    for (const excluded of paths.filter((p) => p.startsWith('!'))) {
      for (const input of inputs) expect(glob(excluded.slice(1)).test(input), `${excluded} would skip ${input}`).toBe(false);
    }
  });

  it('caps every step', () => {
    for (const step of stepList) expect(step, step.split('\n')[0]).toMatch(/\n {8}timeout-minutes: \d+/);
  });
});

describe('catalogue-us.yml and catalogue-in.yml, the region crawls (daily since the public beta of 9 Oct 2026)', () => {
  const regions = [
    { file: 'catalogue-us.yml', folder: 'us', group: 'catalogue-us' },
    { file: 'catalogue-in.yml', folder: 'in', group: 'catalogue-in' },
  ];
  const cronOf = (f: string): string[] => [...text(f).matchAll(/\n {4}- cron: '([^']+)'/g)].map((m) => m[1]!);

  it('each runs once a day, at its own hour, off the UK crawl\'s minutes and off the hour and half hour', () => {
    const ukMinutes = new Set(cronOf('catalogue-daily.yml').map((c) => c.split(' ')[0]));
    const hours: string[] = [];
    for (const { file } of regions) {
      const crons = cronOf(file);
      expect(crons, file).toHaveLength(1);
      const [minute, hour, dom, month, dow] = crons[0]!.split(' ');
      expect([dom, month, dow], `${file} runs every day`).toEqual(['*', '*', '*']);
      expect(hour, `${file} runs once a day`).toMatch(/^\d{1,2}$/);
      expect(minute, file).toMatch(/^\d{1,2}$/);
      expect(['0', '30'], `${file} is off the hour and half hour`).not.toContain(minute);
      expect(ukMinutes.has(minute!), `${file} is off the UK crawl's minutes`).toBe(false);
      hours.push(hour!);
      expect(text(file), `${file} says when its schedule started`).toContain('since the beta of 9 October 2026');
    }
    expect(new Set(hours).size, 'the two regions at different hours').toBe(2);
  });

  it('each keeps its own concurrency group and commits only its own folder, through commit-and-push.sh, on a schedule too', () => {
    for (const { file, folder, group } of regions) {
      const t = text(file);
      expect(t, file).toMatch(new RegExp(`\\nconcurrency:\\n {2}group: ${group}\\n`));
      expect(t, file).toContain("if: ${{ github.event_name == 'schedule' || inputs.commit }}");
      expect(t, file).toMatch(new RegExp(`\\./scripts/commit-and-push\\.sh \\\\\\n[^\\n]*\\n {12}data/regions/${folder}\\n`));
    }
  });
});

describe('harvest-one-shop.yml', () => {
  const probe = text('harvest-one-shop.yml');
  const ask = steps(jobs('harvest-one-shop.yml').find((j) => j.name === 'probe')!.body).find((s) => s.includes('name: Ask one shop'))!;

  // 44 of the probe's first 65 runs went red only because the shop answered
  // nothing, which is the answer a probe exists to give.
  it('reports a shop that yields nothing as a warning, and every other failure as red', async () => {
    const { NOTHING_HARVESTED } = await import('../scripts/harvestExit.js');
    expect(NOTHING_HARVESTED).not.toBe(0);
    expect(NOTHING_HARVESTED).not.toBe(1);
    expect(ask).toContain('set +e');
    expect(ask).toContain(`if [ "$rc" -eq ${NOTHING_HARVESTED} ]; then`);
    expect(ask).toMatch(/::warning::[^\n]*\n {12}exit 0\n {10}fi\n {10}exit "\$rc"/);
    expect(ask).toContain('--dry-run');
    const harvest = readFileSync(join(REPO_ROOT, 'scripts/catalogue-harvest.ts'), 'utf8');
    expect(harvest).toMatch(/Nothing harvested\. Not writing anything[^\n]*\n(?: *\/\/.*\n)* *process\.exit\(NOTHING_HARVESTED\);/);
  });

  it('passes its inputs to the script through env, never pasted into the command', () => {
    const run = ask.slice(ask.indexOf('run: |'));
    expect(run).not.toContain('${{');
    for (const input of /\n {6}([a-z_]+):\n {8}description/g[Symbol.matchAll](probe)) {
      expect(ask, input[1]).toContain(`inputs.${input[1]}`);
    }
  });
});

// 2026-10-08 (docs/DECISIONS.md D28): a social post's pictures and videos are
// drawn from its committed text and never committed ("social" in
// scripts/generated-files.txt). The Social pictures workflow draws them for
// every post pushed and keeps them as a private artifact; the site never
// publishes them.
describe('social pictures', () => {
  const code = (f: string) => text(f).split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');

  it('no workflow commits one, and scripts/commit-and-push.sh refuses one before it stages anything', () => {
    for (const f of files) {
      for (const job of jobs(f)) {
        for (const p of committedPaths(job.body)) expect(policyOf(p), `${f} commits ${p}`).not.toBe('social');
      }
    }
    for (const picture of ['social/posts/2026-10-08-deal-of-the-day/post-3x4.png', 'social/posts/2026-10-08-deal-video-x/deal-video-9x16.mp4']) {
      // Run from an empty folder: the refusal comes before any git command.
      const run = spawnSync('bash', [join(REPO_ROOT, 'scripts/commit-and-push.sh'), 'Deal of the Day: test', 'social/posts/x/caption.txt', picture], {
        cwd: tmpdir(),
        encoding: 'utf8',
      });
      expect(run.status, run.stderr).toBe(1);
      expect(run.stderr).toContain(`Refusing to commit ${picture}: a social post's pictures are rendered, never committed`);
    }
    // The script names the same policy the manifest uses, and checks what was staged too.
    const script = readFileSync(join(REPO_ROOT, 'scripts/commit-and-push.sh'), 'utf8');
    expect(script).toMatch(/\n {4}social\)\n/);
    expect(script).toContain('[ "$(manifest_policy "$staged_file")" = social ]');
    expect(readManifest().filter((e) => e.policy === 'social').length).toBeGreaterThanOrEqual(3);
  });

  it('social-pictures.yml draws the pushed posts and keeps them as a private 90 day artifact, committing and publishing nothing', () => {
    const wf = code('social-pictures.yml');
    const render = jobs('social-pictures.yml').find((j) => j.name === 'render')!;
    const stepList = steps(render.body);
    const at = (needle: string) => stepList.findIndex((s) => s.includes(needle));
    expect(wf).toMatch(/\n {2}push:\n {4}branches: \[claude\/scentday-retailer-registry-h92tth\]\n {4}paths:\n {6}- 'social\/posts\/\*\*'\n/);
    expect(wf).toMatch(/\npermissions:\n {2}contents: read\n/);
    expect(wf).not.toMatch(/commit-and-push|git commit|contents: write|pages: write|upload-pages-artifact|deploy-pages/);
    const draw = at('scripts/render-social.ts --out');
    const upload = at('actions/upload-artifact@v4');
    expect(draw, 'the drawing step').toBeGreaterThan(0);
    expect(upload, 'the upload').toBeGreaterThan(draw);
    expect(stepList[upload]).toContain('retention-days: 90');
    expect(stepList[upload]).toContain('path: ${{ runner.temp }}/social-pictures');
    // Uploaded even when one picture failed, so the rest still reach the owner.
    expect(stepList[upload]).toContain('!cancelled()');
    for (const step of stepList) expect(step, step.split('\n')[0]).toMatch(/\n {8}timeout-minutes: \d+/);
  });

  it('the deploy never publishes them: it uploads demo/ only, and a push under social/ does not deploy', () => {
    const deploy = text('deploy-pages.yml');
    expect(deploy).toContain("      - '!social/**'");
    expect(deploy).toMatch(/upload-pages-artifact@v\d+\n(?: {8}.*\n)*? {10}path: demo\n/);
  });
});

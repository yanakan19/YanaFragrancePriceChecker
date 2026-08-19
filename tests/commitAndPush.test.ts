// Integration tests for scripts/commit-and-push.sh, run against real scratch
// git repositories rather than mocks — the behaviour under test (rebase
// conflict resolution, ours/theirs semantics, push retry) only exists as an
// interaction between bash and git, so a unit test of parsed-out logic would
// not actually cover it.
//
// These exist because of run #236 (2026-08-18): a scheduled 70-90 minute
// catalogue crawl died at the final push, discarding every price it had
// harvested, after a concurrent push landed mid-run and the conflict
// resolution the script attempted did not complete cleanly. See
// scripts/commit-and-push.sh's own comments for the post-mortem. This file
// exercises the three scenarios that matter: a generated-file conflict
// resolves and pushes; a raw-snapshot conflict keeps the *incoming* side
// (not the run's own copy — that direction was backwards until this fix);
// and a genuine source conflict aborts loudly with nothing pushed.
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/commit-and-push.sh', import.meta.url));

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepoWithFile(dir: string, relPath: string, content: string, gitignore?: string) {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'master']);
  git(dir, ['config', 'user.email', 'seed@test']);
  git(dir, ['config', 'user.name', 'seed']);
  if (gitignore) writeFileSync(join(dir, '.gitignore'), gitignore);
  const full = join(dir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
}

/** A fresh {remote, worker, concurrent} trio sharing one base commit, with
 * `worker` cloned before `concurrent` pushes — reproducing a scheduled run
 * that checked the branch out long before another push landed on it. */
function setupTrio(base: { relPath: string; content: string; gitignore?: string }) {
  const root = mkdtempSync(join(tmpdir(), 'commit-and-push-test-'));
  const seed = join(root, 'seed');
  const remote = join(root, 'remote.git');
  initRepoWithFile(seed, base.relPath, base.content, base.gitignore);
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(seed, ['push', '-q', remote, 'master']);

  const worker = join(root, 'worker');
  const concurrent = join(root, 'concurrent');
  execFileSync('git', ['clone', '-q', remote, worker]);
  execFileSync('git', ['clone', '-q', remote, concurrent]);
  git(worker, ['config', 'user.email', 'bot@test']);
  git(worker, ['config', 'user.name', 'pricesniffs-bot']);
  git(concurrent, ['config', 'user.email', 'concurrent@test']);
  git(concurrent, ['config', 'user.name', 'concurrent']);

  return { root, remote, worker, concurrent };
}

function pushConcurrentChange(concurrent: string, relPath: string, content: string) {
  writeFileSync(join(concurrent, relPath), content);
  git(concurrent, ['add', '-A']);
  git(concurrent, ['commit', '-q', '-m', 'concurrent push']);
  git(concurrent, ['push', '-q', 'origin', 'master']);
}

/** Runs the script and returns its exit status plus stdout+stderr combined —
 * the script's own progress and error messages (including git's own, e.g.
 * the "ignored by one of your .gitignore files" warning under test) go to
 * stderr, so a helper that only captured stdout would silently miss them. */
function runScript(
  worker: string,
  args: string[],
  env: Record<string, string> = {},
): { status: number; output: string } {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: worker,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: result.status ?? -1, output: (result.stdout ?? '') + (result.stderr ?? '') };
}

const cleanupDirs: string[] = [];
afterEach(() => {
  while (cleanupDirs.length) {
    const dir = cleanupDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('scripts/commit-and-push.sh', () => {
  it('resolves a generated-file conflict via regenerate and pushes, without ever staging gitignored build output', () => {
    const { root, remote, worker, concurrent } = setupTrio({
      relPath: 'demo/catalogue.generated.ts',
      content: 'BASE\n',
      gitignore: 'dist-demo/\n',
    });
    cleanupDirs.push(root);

    pushConcurrentChange(concurrent, 'demo/catalogue.generated.ts', 'INCOMING-FROM-CONCURRENT\n');

    writeFileSync(join(worker, 'demo/catalogue.generated.ts'), 'OUR-HARVEST-DATA\n');

    // Mirrors the real build: rewrites the generated file and, as a real side
    // effect of `npm run demo`, writes the gitignored dist-demo/artifact.html
    // that no caller of this script ever commits.
    const { status, output } = runScript(worker, ['Harvest: sim', 'demo/catalogue.generated.ts'], {
      REGENERATE:
        'echo "REGENERATED-FROM-MERGED-INPUTS" > demo/catalogue.generated.ts && mkdir -p dist-demo && echo built > dist-demo/artifact.html',
    });

    expect(status).toBe(0);
    expect(output).toContain('Pushed on attempt 2');
    // The bug fixed here: this string used to appear because the script
    // unconditionally tried to `git add` the gitignored dist-demo/artifact.html.
    expect(output).not.toContain('ignored by one of your .gitignore files');

    const pushed = git(worker, ['show', 'origin/master:demo/catalogue.generated.ts']);
    expect(pushed).toBe('REGENERATED-FROM-MERGED-INPUTS');
    void remote;
  });

  it('resolves a raw-snapshot conflict by keeping the incoming side, not the run\'s own copy', () => {
    const { root, remote, worker, concurrent } = setupTrio({
      relPath: 'data/catalogue/allbeauty.json',
      content: '{"v":"BASE"}\n',
    });
    cleanupDirs.push(root);

    pushConcurrentChange(concurrent, 'data/catalogue/allbeauty.json', '{"v":"INCOMING-SNAPSHOT"}\n');
    writeFileSync(join(worker, 'data/catalogue/allbeauty.json'), '{"v":"OUR-SNAPSHOT"}\n');

    const { status, output } = runScript(worker, ['Harvest: sim', 'data/catalogue']);

    expect(status).toBe(0);
    expect(output).toContain('Pushed on attempt 2');

    const pushed = git(worker, ['show', 'origin/master:data/catalogue/allbeauty.json']);
    // This is the ours/theirs direction fix: `git rebase` swaps the usual
    // merge meaning of --ours/--theirs, and the previous version of this
    // script had it backwards, silently keeping the run's own snapshot
    // instead of the incoming one its own comments say it keeps.
    expect(pushed).toBe('{"v":"INCOMING-SNAPSHOT"}');
    void remote;
  });

  it('refuses to auto-resolve a conflict in a file that is neither generated nor a raw snapshot, and pushes nothing', () => {
    const { root, remote, worker, concurrent } = setupTrio({
      relPath: 'src/config/retailers.ts',
      content: 'export const RETAILERS = "BASE";\n',
    });
    cleanupDirs.push(root);

    pushConcurrentChange(concurrent, 'src/config/retailers.ts', 'export const RETAILERS = "HUMAN-EDIT";\n');
    writeFileSync(join(worker, 'src/config/retailers.ts'), 'export const RETAILERS = "BOT-WOULD-OVERWRITE";\n');

    const { status, output } = runScript(worker, ['Shipping terms: sim', 'src/config/retailers.ts']);

    expect(status).not.toBe(0);
    expect(output).toContain('Nothing was pushed');

    const remoteContent = execSync(`git --git-dir="${remote}" show master:src/config/retailers.ts`, {
      encoding: 'utf8',
    });
    expect(remoteContent).toBe('export const RETAILERS = "HUMAN-EDIT";\n');
  });
});

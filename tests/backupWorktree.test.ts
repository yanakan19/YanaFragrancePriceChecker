// Integration tests for scripts/backup-worktree.sh, run against real scratch
// git repositories — no mocking of git, same style as
// tests/recoverStaleCheckout.test.ts and tests/commitAndPush.test.ts.
//
// docs/DECISIONS.md D16: recover-stale-checkout.sh deliberately does nothing
// inside a linked worktree, because a worktree's HEAD, branch, and
// relationship to origin are its own — fast-forwarding or discarding inside
// one would be wrong. But every agent session on this project runs inside a
// linked worktree, so those checkouts get no protection at all from that
// script. backup-worktree.sh is the different protection a worktree actually
// needs: get its uncommitted and unpushed work onto origin — the one place
// D12 established survives this container's disk — without ever touching the
// worktree's own working tree, index, or HEAD. Every case below is a clause
// of that contract.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/backup-worktree.sh', import.meta.url));

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** A {remote, worker, linked} triple: `worker` is an ordinary clone of the
 * remote (standing in for the main checkout), `linked` is a real linked
 * worktree of `worker` on its own branch — exactly the shape every agent
 * session runs in. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'backup-worktree-test-'));
  const seed = join(root, 'seed');
  const remote = join(root, 'remote.git');
  mkdirSync(seed, { recursive: true });
  git(seed, ['init', '-q', '-b', 'master']);
  git(seed, ['config', 'user.email', 'seed@test']);
  git(seed, ['config', 'user.name', 'seed']);
  writeFileSync(join(seed, 'file.txt'), 'line-1\n');
  git(seed, ['add', '-A']);
  git(seed, ['commit', '-q', '-m', 'base']);
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(seed, ['push', '-q', remote, 'master']);

  const worker = join(root, 'worker');
  execFileSync('git', ['clone', '-q', remote, worker]);
  git(worker, ['config', 'user.email', 'bot@test']);
  git(worker, ['config', 'user.name', 'bot']);

  const linked = join(root, 'linked');
  git(worker, ['worktree', 'add', '-q', '-b', 'side', linked]);
  git(linked, ['config', 'user.email', 'bot@test']);
  git(linked, ['config', 'user.name', 'bot']);

  return { root, remote, worker, linked };
}

function runScript(
  cwd: string,
  env: Record<string, string> = {},
): { status: number; output: string } {
  const result = spawnSync('bash', [SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: cwd,
      BACKUP_FETCH_TIMEOUT: '5',
      BACKUP_PUSH_TIMEOUT: '5',
      ...env,
    },
  });
  return { status: result.status ?? -1, output: (result.stdout ?? '') + (result.stderr ?? '') };
}

/** Every backup ref this script has pushed, as {ref, sha}. */
function backupRefs(remote: string): Array<{ ref: string; sha: string }> {
  const out = execFileSync(
    'git',
    ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/worktree-backup'],
    { cwd: remote, encoding: 'utf8' },
  ).trim();
  if (!out) return [];
  return out.split('\n').map((line) => {
    const [ref, sha] = line.split(' ') as [string, string];
    return { ref, sha };
  });
}

const cleanupDirs: string[] = [];
afterEach(() => {
  while (cleanupDirs.length) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe('scripts/backup-worktree.sh', () => {
  it('exits immediately outside a linked worktree (the main checkout has its own recovery path)', () => {
    const { root, worker } = setup();
    cleanupDirs.push(root);
    writeFileSync(join(worker, 'file.txt'), 'dirty, but this is not a worktree\n');

    const { status, output } = runScript(worker);

    expect(status).toBe(0);
    expect(output).toBe('');
  });

  it('is a silent no-op on a clean worktree whose HEAD is already on origin', () => {
    const { root, linked } = setup();
    cleanupDirs.push(root);

    const { status, output } = runScript(linked);

    expect(status).toBe(0);
    expect(output).toBe('');
  });

  it('backs up a dirty working tree (tracked edit + untracked file) without touching it', () => {
    const { root, remote, linked } = setup();
    cleanupDirs.push(root);
    writeFileSync(join(linked, 'file.txt'), 'line-1\nmodified in the worktree\n');
    writeFileSync(join(linked, 'newfile.txt'), 'brand new, never staged\n');
    const headBefore = git(linked, ['rev-parse', 'HEAD']);
    const statusBefore = git(linked, ['status', '--porcelain']);

    const { status, output } = runScript(linked);

    expect(status).toBe(0);
    expect(output).toContain('Backed up uncommitted changes');
    expect(output).toContain('working tree untouched');

    // The worktree itself: completely unchanged.
    expect(git(linked, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(git(linked, ['status', '--porcelain'])).toBe(statusBefore);
    expect(readFileSync(join(linked, 'file.txt'), 'utf8')).toBe('line-1\nmodified in the worktree\n');
    expect(readFileSync(join(linked, 'newfile.txt'), 'utf8')).toBe('brand new, never staged\n');

    // Origin: got a new ref under refs/worktree-backup/side/wip/ whose tree
    // contains both the modified tracked file and the untracked one.
    const refs = backupRefs(remote);
    const wipRefs = refs.filter((r) => r.ref.includes('/side/wip/'));
    expect(wipRefs.length).toBe(1);
    const wipSha = wipRefs[0]!.sha;
    const showFile = execFileSync(
      'git',
      ['show', `${wipSha}:file.txt`],
      { cwd: remote, encoding: 'utf8' },
    );
    const showNew = execFileSync(
      'git',
      ['show', `${wipSha}:newfile.txt`],
      { cwd: remote, encoding: 'utf8' },
    );
    expect(showFile).toBe('line-1\nmodified in the worktree\n');
    expect(showNew).toBe('brand new, never staged\n');
  });

  it('backs up a committed-but-unpushed HEAD (worktree branches have no upstream at all)', () => {
    const { root, remote, linked } = setup();
    cleanupDirs.push(root);
    writeFileSync(join(linked, 'file.txt'), 'line-1\ncommitted work\n');
    git(linked, ['add', '-A']);
    git(linked, ['commit', '-q', '-m', 'work only this worktree has']);
    const headBefore = git(linked, ['rev-parse', 'HEAD']);

    const { status, output } = runScript(linked);

    expect(status).toBe(0);
    expect(output).toContain('Backed up HEAD');
    expect(git(linked, ['rev-parse', 'HEAD'])).toBe(headBefore); // untouched

    const refs = backupRefs(remote);
    const commitRefs = refs.filter((r) => r.ref.includes('/side/commits/'));
    expect(commitRefs.length).toBe(1);
    expect(commitRefs[0]!.sha).toBe(headBefore);
  });

  it('backs up both an unpushed commit and dirty changes on top of it in one run', () => {
    const { root, remote, linked } = setup();
    cleanupDirs.push(root);
    writeFileSync(join(linked, 'file.txt'), 'line-1\ncommitted\n');
    git(linked, ['add', '-A']);
    git(linked, ['commit', '-q', '-m', 'committed work']);
    writeFileSync(join(linked, 'file.txt'), 'line-1\ncommitted\nplus uncommitted\n');

    const { status, output } = runScript(linked);

    expect(status).toBe(0);
    expect(output).toContain('Backed up HEAD');
    expect(output).toContain('Backed up uncommitted changes');
    const refs = backupRefs(remote);
    expect(refs.some((r) => r.ref.includes('/side/commits/'))).toBe(true);
    expect(refs.some((r) => r.ref.includes('/side/wip/'))).toBe(true);
  });

  it('does not re-push identical state on a second run (deduped via the private marker)', () => {
    const { root, remote, linked } = setup();
    cleanupDirs.push(root);
    writeFileSync(join(linked, 'file.txt'), 'line-1\nmodified\n');

    const first = runScript(linked);
    expect(first.status).toBe(0);
    expect(first.output).toContain('Backed up uncommitted changes');
    const refsAfterFirst = backupRefs(remote);
    expect(refsAfterFirst.length).toBe(1);

    const second = runScript(linked);
    expect(second.status).toBe(0);
    expect(second.output).toBe('');
    const refsAfterSecond = backupRefs(remote);
    expect(refsAfterSecond.length).toBe(1); // no new ref
  });

  it('pushes a new backup when the worktree changes again after a previous backup', () => {
    const { root, remote, linked } = setup();
    cleanupDirs.push(root);
    writeFileSync(join(linked, 'file.txt'), 'line-1\nfirst change\n');
    expect(runScript(linked).status).toBe(0);
    expect(backupRefs(remote).length).toBe(1);

    writeFileSync(join(linked, 'file.txt'), 'line-1\nsecond, different change\n');
    const { status, output } = runScript(linked);

    expect(status).toBe(0);
    expect(output).toContain('Backed up uncommitted changes');
    expect(backupRefs(remote).length).toBe(2);
  });

  it('recognises HEAD as already safe by content (containment), not by this worktree branch having an upstream', () => {
    // Confirmed against the real worktrees in this repo (`git branch -vv`):
    // none carry an upstream at all. Containment is checked by ancestry, not
    // by branch name, so a worktree whose HEAD is simply wherever it forked
    // from origin is already safe without ever being pushed anywhere itself.
    const { root, remote, worker, linked } = setup();
    cleanupDirs.push(root);
    // Advance origin with a new commit, then fast-forward the plain clone
    // (`worker`) to it — the linked worktree's own HEAD is untouched by
    // this, so it is exercising exactly "HEAD reachable from origin via
    // ancestry" rather than "HEAD equals origin's tip".
    const seed = join(root, 'seed');
    writeFileSync(join(seed, 'other.txt'), 'unrelated advance\n');
    git(seed, ['add', '-A']);
    git(seed, ['commit', '-q', '-m', 'origin moves on']);
    git(seed, ['push', '-q', remote, 'master']);
    void worker;

    const { status, output } = runScript(linked);

    expect(status).toBe(0);
    expect(output).toBe('');
    expect(backupRefs(remote).length).toBe(0);
  });

  it('never runs git add, commit, or checkout against the real index — untracked files stay untracked after backup', () => {
    const { root, linked } = setup();
    cleanupDirs.push(root);
    writeFileSync(join(linked, 'scratch.txt'), 'must remain untracked\n');

    const { status } = runScript(linked);

    expect(status).toBe(0);
    const porcelain = git(linked, ['status', '--porcelain']);
    expect(porcelain).toContain('?? scratch.txt');
  });

  it('warns and leaves everything untouched when origin is unreachable', () => {
    const { root, linked } = setup();
    cleanupDirs.push(root);
    git(linked, ['remote', 'set-url', 'origin', join(root, 'no-such-remote.git')]);
    writeFileSync(join(linked, 'file.txt'), 'line-1\nunbacked-up change\n');

    const { status, output } = runScript(linked);

    expect(status).toBe(0);
    expect(output).toContain('WARNING');
    expect(readFileSync(join(linked, 'file.txt'), 'utf8')).toBe('line-1\nunbacked-up change\n');
  });
});

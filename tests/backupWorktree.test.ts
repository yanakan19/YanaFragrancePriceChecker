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

  // ── Pruning ─────────────────────────────────────────────────────────────
  // refs/worktree-backup/<branch>/... never gets fast-forwarded or replaced,
  // so with nothing removing old ones they accumulate on origin forever.
  // Every case below is a clause of the pruning contract in the script's own
  // header: a ref is removed only once it is BOTH old enough AND its work is
  // independently, already safe on a real origin branch — age or safety
  // alone must never be enough, and a ref this script cannot positively
  // prove safe must be left alone.
  describe('pruning stale backup refs', () => {
    /** Push a ref directly (bypassing the script) with a fabricated age, the
     * same shape backup-worktree.sh itself writes. */
    function pushFabricated(
      source: string,
      remote: string,
      branch: string,
      kind: 'commits' | 'wip',
      sha: string,
      ageSeconds: number,
    ): string {
      const epoch = Math.floor(Date.now() / 1000) - ageSeconds;
      const ref = `refs/worktree-backup/${branch}/${kind}/${epoch}-${sha.slice(0, 12)}`;
      git(source, ['push', '-q', remote, `${sha}:${ref}`]);
      return ref;
    }

    const THIRTY_DAYS = 30 * 24 * 60 * 60;

    it('prunes a stale commit-backup ref once that exact commit is already on an origin branch', () => {
      const { root, remote, linked } = setup();
      cleanupDirs.push(root);
      writeFileSync(join(linked, 'file.txt'), 'line-1\nshared commit\n');
      git(linked, ['add', '-A']);
      git(linked, ['commit', '-q', '-m', 'shared commit']);
      const sha = git(linked, ['rev-parse', 'HEAD']);
      const staleRef = pushFabricated(linked, remote, 'side', 'commits', sha, THIRTY_DAYS);
      // The exact same commit lands on a real branch too — this is what
      // makes the fabricated backup ref redundant.
      git(linked, ['push', '-q', remote, 'HEAD:master']);

      const { status, output } = runScript(linked);

      expect(status).toBe(0);
      expect(output).toContain('Pruned stale backup');
      expect(output).toContain(staleRef);
      expect(backupRefs(remote).some((r) => r.ref === staleRef)).toBe(false);

      // Untouched worktree, exactly as every other case in this file.
      expect(git(linked, ['rev-parse', 'HEAD'])).toBe(sha);
      expect(git(linked, ['status', '--porcelain'])).toBe('');
    });

    it('prunes a stale wip-backup ref once its exact tree content is already on an origin branch', () => {
      const { root, remote, worker, linked } = setup();
      cleanupDirs.push(root);
      const headSha = git(linked, ['rev-parse', 'HEAD']);

      // A real commit elsewhere supplies the tree this wip snapshot claims —
      // built without ever touching `linked`'s own working tree or index.
      writeFileSync(join(worker, 'file.txt'), 'line-1\nwip content, later committed for real\n');
      git(worker, ['add', '-A']);
      git(worker, ['commit', '-q', '-m', 'the real commit this wip snapshot anticipated']);
      const realTree = git(worker, ['rev-parse', 'HEAD^{tree}']);
      git(worker, ['push', '-q', remote, 'HEAD:master']);

      const wipSha = git(linked, [
        'commit-tree', realTree, '-p', headSha, '-m', 'Worktree backup snapshot: side @ fabricated',
      ]);
      const staleRef = pushFabricated(linked, remote, 'side', 'wip', wipSha, THIRTY_DAYS);

      const { status, output } = runScript(linked);

      expect(status).toBe(0);
      expect(output).toContain('Pruned stale backup');
      expect(backupRefs(remote).some((r) => r.ref === staleRef)).toBe(false);
      expect(git(linked, ['rev-parse', 'HEAD'])).toBe(headSha);
    });

    it('never prunes a stale commit-backup ref whose commit has not landed on any origin branch', () => {
      const { root, remote, linked } = setup();
      cleanupDirs.push(root);
      writeFileSync(join(linked, 'file.txt'), 'line-1\nnever landed anywhere else\n');
      git(linked, ['add', '-A']);
      git(linked, ['commit', '-q', '-m', 'orphan commit']);
      const sha = git(linked, ['rev-parse', 'HEAD']);
      const staleRef = pushFabricated(linked, remote, 'side', 'commits', sha, THIRTY_DAYS);
      // Deliberately not pushed to master or anywhere else.

      const { status, output } = runScript(linked);

      expect(status).toBe(0);
      expect(output).not.toContain('Pruned stale backup');
      expect(backupRefs(remote).some((r) => r.ref === staleRef)).toBe(true);
    });

    it('never prunes a stale wip-backup ref whose exact tree content has not landed on any origin branch', () => {
      const { root, remote, linked } = setup();
      cleanupDirs.push(root);
      const headSha = git(linked, ['rev-parse', 'HEAD']);
      // Give the snapshot content nothing else on origin shares, so no
      // commit anywhere carries this exact tree. Built via a private temp
      // index — same technique the script itself uses — so `linked`'s own
      // real index and working tree are never touched by the test either.
      writeFileSync(join(linked, 'never-shared.txt'), 'only this snapshot ever had this\n');
      const tmpIndex = join(root, 'scratch-index');
      execFileSync('git', ['read-tree', 'HEAD'], { cwd: linked, env: { ...process.env, GIT_INDEX_FILE: tmpIndex } });
      execFileSync('git', ['add', '-A'], { cwd: linked, env: { ...process.env, GIT_INDEX_FILE: tmpIndex } });
      const distinctTree = execFileSync('git', ['write-tree'], {
        cwd: linked, encoding: 'utf8', env: { ...process.env, GIT_INDEX_FILE: tmpIndex },
      }).trim();
      rmSync(join(linked, 'never-shared.txt'));
      const wipSha = git(linked, [
        'commit-tree', distinctTree, '-p', headSha, '-m', 'Worktree backup snapshot: side @ fabricated, orphaned',
      ]);
      const staleRef = pushFabricated(linked, remote, 'side', 'wip', wipSha, THIRTY_DAYS);

      const { status, output } = runScript(linked);

      expect(status).toBe(0);
      expect(output).not.toContain('Pruned stale backup');
      expect(backupRefs(remote).some((r) => r.ref === staleRef)).toBe(true);
    });

    it('never prunes a backup ref inside the retention window, safe or not', () => {
      const { root, remote, linked } = setup();
      cleanupDirs.push(root);
      writeFileSync(join(linked, 'file.txt'), 'line-1\nrecent and already safe\n');
      git(linked, ['add', '-A']);
      git(linked, ['commit', '-q', '-m', 'recent safe commit']);
      const sha = git(linked, ['rev-parse', 'HEAD']);
      // One minute old — safe, but nowhere near BACKUP_PRUNE_DAYS (14).
      const recentRef = pushFabricated(linked, remote, 'side', 'commits', sha, 60);
      git(linked, ['push', '-q', remote, 'HEAD:master']);

      const { status, output } = runScript(linked);

      expect(status).toBe(0);
      expect(output).not.toContain('Pruned stale backup');
      expect(backupRefs(remote).some((r) => r.ref === recentRef)).toBe(true);
    });

    it('honours BACKUP_PRUNE_DAYS when set lower than the default', () => {
      const { root, remote, linked } = setup();
      cleanupDirs.push(root);
      writeFileSync(join(linked, 'file.txt'), 'line-1\nsafe within a day\n');
      git(linked, ['add', '-A']);
      git(linked, ['commit', '-q', '-m', 'safe within a day']);
      const sha = git(linked, ['rev-parse', 'HEAD']);
      // Two days old: kept under the 14-day default, prunable under a 1-day override.
      const ref = pushFabricated(linked, remote, 'side', 'commits', sha, 2 * 24 * 60 * 60);
      git(linked, ['push', '-q', remote, 'HEAD:master']);

      const { output } = runScript(linked, { BACKUP_PRUNE_DAYS: '1' });

      expect(output).toContain('Pruned stale backup');
      expect(backupRefs(remote).some((r) => r.ref === ref)).toBe(false);
    });

    it('never touches this branch\'s backup refs for a different branch', () => {
      const { root, remote, linked } = setup();
      cleanupDirs.push(root);
      const headSha = git(linked, ['rev-parse', 'HEAD']);
      // A stale-and-safe ref, but filed under a different branch name than
      // this worktree's own ('side') — pruning is scoped to this branch only.
      const otherRef = pushFabricated(linked, remote, 'unrelated-branch', 'commits', headSha, THIRTY_DAYS);
      git(linked, ['push', '-q', remote, `${headSha}:refs/heads/master`]);

      const { status } = runScript(linked);

      expect(status).toBe(0);
      expect(backupRefs(remote).some((r) => r.ref === otherRef)).toBe(true);
    });
  });
});

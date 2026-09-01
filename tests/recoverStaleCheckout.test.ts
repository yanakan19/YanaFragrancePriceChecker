// Integration tests for scripts/recover-stale-checkout.sh, run against real
// scratch git repositories rather than mocks — the behaviour under test
// (ancestry gating, the byte-exact phantom signature, ff-only semantics) only
// exists as an interaction between bash and git, so nothing short of a real
// repo covers it.
//
// These exist because of the frozen-snapshot revert documented in
// docs/DECISIONS.md D10 and D12: this branch's container restores a disk
// checkpoint from 2026-08-12 ~23:13 UTC on some resumes, which puts HEAD two
// weeks behind origin and re-materialises one specific uncommitted 14-line
// comment insertion in src/catalogue/awinFeed.ts. Through 2026-08-27 that was
// recovered from by hand thirteen times. The script automates exactly that
// recovery, under a contract that it can never destroy real work — and every
// clause of that contract is a case below. The phantom signature is
// parameterised (RECOVER_PHANTOM_*) so each fixture pins its own.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/recover-stale-checkout.sh', import.meta.url));

const FILE = 'src/data.ts';
const BASE_CONTENT = 'line-1\nline-2\nline-3\nline-4\n';
const ORIGIN_ADVANCED_CONTENT = 'line-1\nline-2 improved on origin\nline-3\nline-4\n';

// The stand-in for the real snapshot phantom: a pure insertion after line-2.
const PHANTOM_LINES = ['// phantom: stale snapshot commentary', '// phantom: second line'];
const PHANTOM_CONTENT = 'line-1\nline-2\n' + PHANTOM_LINES.join('\n') + '\nline-3\nline-4\n';
// Hashed exactly as the script hashes git diff's added lines: each line
// newline-terminated, leading '+' already stripped.
const PHANTOM_SHA256 = createHash('sha256')
  .update(PHANTOM_LINES.join('\n') + '\n')
  .digest('hex');

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** A fresh {remote, worker} pair. `worker` clones the base commit; when
 * `advanceOrigin` is set, two further commits land on the remote afterwards —
 * reproducing a checkout restored from a snapshot taken before origin moved. */
function setup(opts: { advanceOrigin: boolean }) {
  const root = mkdtempSync(join(tmpdir(), 'recover-stale-test-'));
  const seed = join(root, 'seed');
  const remote = join(root, 'remote.git');
  mkdirSync(join(seed, 'src'), { recursive: true });
  git(seed, ['init', '-q', '-b', 'master']);
  git(seed, ['config', 'user.email', 'seed@test']);
  git(seed, ['config', 'user.name', 'seed']);
  writeFileSync(join(seed, FILE), BASE_CONTENT);
  git(seed, ['add', '-A']);
  git(seed, ['commit', '-q', '-m', 'base']);
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(seed, ['push', '-q', remote, 'master']);

  const worker = join(root, 'worker');
  execFileSync('git', ['clone', '-q', remote, worker]);
  git(worker, ['config', 'user.email', 'bot@test']);
  git(worker, ['config', 'user.name', 'bot']);

  if (opts.advanceOrigin) {
    // The same path moves on origin (as awinFeed.ts really did in 5240fae),
    // plus an unrelated file, so a fast-forward genuinely rewrites FILE.
    writeFileSync(join(seed, FILE), ORIGIN_ADVANCED_CONTENT);
    git(seed, ['add', '-A']);
    git(seed, ['commit', '-q', '-m', 'origin advance 1']);
    writeFileSync(join(seed, 'src/other.ts'), 'other\n');
    git(seed, ['add', '-A']);
    git(seed, ['commit', '-q', '-m', 'origin advance 2']);
    git(seed, ['push', '-q', remote, 'master']);
  }

  return { root, remote, worker };
}

function runScript(
  worker: string,
  env: Record<string, string> = {},
): { status: number; output: string } {
  const result = spawnSync('bash', [SCRIPT], {
    cwd: worker,
    encoding: 'utf8',
    env: {
      ...process.env,
      // Point the script at the fixture, never at this repo's own checkout.
      CLAUDE_PROJECT_DIR: worker,
      RECOVER_PHANTOM_FILE: FILE,
      RECOVER_PHANTOM_SHA256: PHANTOM_SHA256,
      RECOVER_PHANTOM_LINES: String(PHANTOM_LINES.length),
      ...env,
    },
  });
  return { status: result.status ?? -1, output: (result.stdout ?? '') + (result.stderr ?? '') };
}

/** A shallow worker whose HEAD is genuinely an ancestor of origin, but whose
 * local shallow graph cannot prove it on its own — the 2026-08-31 false
 * refusal (docs/DECISIONS.md D15). `git rev-list --count` reports a false,
 * perfectly symmetric N-ahead/N-behind for a HEAD that is provably nothing
 * but behind, matching the real incident's "50 commit(s) origin does not
 * have (50 behind)" shape.
 *
 * Built by: shallow-cloning at a fixed depth (`--depth` only takes effect
 * for a *local* clone over `file://` — plain paths silently ignore it, per
 * git's own "warning: --depth is ignored in local clones"), then advancing
 * origin and re-shallowing the worker at that same fixed depth against the
 * new tip. That re-shallow is what severs the graph: verified directly
 * against a scratch repo before this fixture was written — an ordinary
 * `git fetch` with no `--depth` (exactly what the script itself calls) does
 * NOT sever it, and does not repair an already-severed one either. Origin is
 * then advanced once more, unrelated to the severing, so the fixture also
 * matches the incident's ordinary "cron kept pushing while the container
 * was frozen" shape. */
function setupShallowAncestor(opts: { alsoDiverge: boolean }) {
  const root = mkdtempSync(join(tmpdir(), 'recover-stale-shallow-test-'));
  const seed = join(root, 'seed');
  const remote = join(root, 'remote.git');
  mkdirSync(seed, { recursive: true });
  git(seed, ['init', '-q', '-b', 'master']);
  git(seed, ['config', 'user.email', 'seed@test']);
  git(seed, ['config', 'user.name', 'seed']);
  writeFileSync(join(seed, 'depth.txt'), 'seed 0\n');
  git(seed, ['add', '-A']);
  git(seed, ['commit', '-q', '-m', 'seed 0']);
  for (let i = 1; i < 5; i++) {
    writeFileSync(join(seed, 'depth.txt'), `seed ${i}\n`, { flag: 'a' });
    git(seed, ['add', '-A']);
    git(seed, ['commit', '-q', '-m', `seed ${i}`]);
  }
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(seed, ['push', '-q', remote, 'master']);

  const worker = join(root, 'worker');
  execFileSync('git', [
    'clone', '-q', '--depth=3', '--branch', 'master', `file://${remote}`, worker,
  ]);
  git(worker, ['config', 'user.email', 'bot@test']);
  git(worker, ['config', 'user.name', 'bot']);

  // Advance origin, then re-shallow the worker at the SAME depth against the
  // new tip — the step that severs the local graph. The advance must run
  // strictly more commits than the clone depth (3): fewer, and the old HEAD
  // still falls inside the freshly re-shallowed window and stays connected
  // — verified directly against a scratch repo, where a 2-commit advance
  // left the graph intact and only a 4-commit advance severed it.
  for (let i = 0; i < 4; i++) {
    writeFileSync(join(seed, 'depth.txt'), `sever ${i}\n`, { flag: 'a' });
    git(seed, ['add', '-A']);
    git(seed, ['commit', '-q', '-m', `sever advance ${i}`]);
  }
  git(seed, ['push', '-q', remote, 'master']);
  git(worker, ['fetch', '-q', '--depth=3', 'origin', 'master']);

  if (opts.alsoDiverge) {
    writeFileSync(join(worker, 'local-only.txt'), 'genuinely local, unpushed\n');
    git(worker, ['add', '-A']);
    git(worker, ['commit', '-q', '-m', 'genuinely local, unpushed']);
  }

  // Origin keeps moving, unrelated to the sever — matching the harvest cron
  // pushing on while the container sat frozen.
  for (let i = 0; i < 2; i++) {
    writeFileSync(join(seed, 'depth.txt'), `post-sever ${i}\n`, { flag: 'a' });
    git(seed, ['add', '-A']);
    git(seed, ['commit', '-q', '-m', `post-sever advance ${i}`]);
  }
  git(seed, ['push', '-q', remote, 'master']);

  return { root, remote, worker };
}

const cleanupDirs: string[] = [];
afterEach(() => {
  while (cleanupDirs.length) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe('scripts/recover-stale-checkout.sh', () => {
  it('recovers the simulated revert: discards the byte-exact phantom, then fast-forwards to origin', () => {
    const { root, worker } = setup({ advanceOrigin: true });
    cleanupDirs.push(root);
    writeFileSync(join(worker, FILE), PHANTOM_CONTENT);

    const { status, output } = runScript(worker);

    expect(status).toBe(0);
    expect(output).toContain('Discarded the known snapshot phantom');
    expect(output).toContain('Fast-forwarded');
    expect(readFileSync(join(worker, FILE), 'utf8')).toBe(ORIGIN_ADVANCED_CONTENT);
    expect(git(worker, ['rev-parse', 'HEAD'])).toBe(git(worker, ['rev-parse', 'origin/master']));
    expect(git(worker, ['status', '--porcelain'])).toBe('');
  });

  it('refuses to discard a real edit to the phantom file — signature mismatch leaves everything alone', () => {
    const { root, worker } = setup({ advanceOrigin: true });
    cleanupDirs.push(root);
    const realWork = 'line-1\nline-2\n// genuinely new work, not the phantom\nline-3\nline-4\n';
    writeFileSync(join(worker, FILE), realWork);
    const headBefore = git(worker, ['rev-parse', 'HEAD']);

    const { status, output } = runScript(worker);

    expect(status).toBe(0);
    expect(output).toContain('NOT the known phantom');
    expect(output).not.toContain('Discarded');
    expect(readFileSync(join(worker, FILE), 'utf8')).toBe(realWork);
    expect(git(worker, ['rev-parse', 'HEAD'])).toBe(headBefore);
  });

  it('refuses when the phantom is present but any other file is dirty too', () => {
    const { root, worker } = setup({ advanceOrigin: true });
    cleanupDirs.push(root);
    writeFileSync(join(worker, FILE), PHANTOM_CONTENT);
    writeFileSync(join(worker, 'scratch.txt'), 'untracked real work\n');
    const headBefore = git(worker, ['rev-parse', 'HEAD']);

    const { status, output } = runScript(worker);

    expect(status).toBe(0);
    expect(output).toContain('REFUSING to touch a dirty tree');
    expect(output).toContain('scratch.txt');
    expect(readFileSync(join(worker, FILE), 'utf8')).toBe(PHANTOM_CONTENT);
    expect(readFileSync(join(worker, 'scratch.txt'), 'utf8')).toBe('untracked real work\n');
    expect(git(worker, ['rev-parse', 'HEAD'])).toBe(headBefore);
  });

  it('refuses when the phantom edit is staged rather than unstaged — not the snapshot state', () => {
    const { root, worker } = setup({ advanceOrigin: true });
    cleanupDirs.push(root);
    writeFileSync(join(worker, FILE), PHANTOM_CONTENT);
    git(worker, ['add', FILE]);

    const { status, output } = runScript(worker);

    expect(status).toBe(0);
    expect(output).toContain('REFUSING to touch a dirty tree');
    expect(readFileSync(join(worker, FILE), 'utf8')).toBe(PHANTOM_CONTENT);
  });

  it('is a silent no-op on a healthy checkout (clean and level with origin)', () => {
    const { root, worker } = setup({ advanceOrigin: false });
    cleanupDirs.push(root);
    const headBefore = git(worker, ['rev-parse', 'HEAD']);

    const { status, output } = runScript(worker);

    expect(status).toBe(0);
    expect(output).toBe('');
    expect(git(worker, ['rev-parse', 'HEAD'])).toBe(headBefore);
  });

  it('fast-forwards a clean checkout that is merely behind', () => {
    const { root, worker } = setup({ advanceOrigin: true });
    cleanupDirs.push(root);

    const { status, output } = runScript(worker);

    expect(status).toBe(0);
    expect(output).toContain('Fast-forwarded');
    expect(git(worker, ['rev-parse', 'HEAD'])).toBe(git(worker, ['rev-parse', 'origin/master']));
  });

  it('discards the phantom even when HEAD is already level with origin', () => {
    // The lone phantom seen through 2026-08-25 turned up on a checkout that
    // was already level, so the discard must not be gated on being behind.
    const { root, worker } = setup({ advanceOrigin: false });
    cleanupDirs.push(root);
    writeFileSync(join(worker, FILE), PHANTOM_CONTENT);

    const { status, output } = runScript(worker);

    expect(status).toBe(0);
    expect(output).toContain('Discarded the known snapshot phantom');
    expect(readFileSync(join(worker, FILE), 'utf8')).toBe(BASE_CONTENT);
    expect(git(worker, ['status', '--porcelain'])).toBe('');
  });

  it('refuses to act on a diverged checkout — a local commit origin lacks is never touched', () => {
    const { root, worker } = setup({ advanceOrigin: true });
    cleanupDirs.push(root);
    writeFileSync(join(worker, 'src/local-only.ts'), 'unpushed\n');
    git(worker, ['add', '-A']);
    git(worker, ['commit', '-q', '-m', 'local only']);
    const headBefore = git(worker, ['rev-parse', 'HEAD']);

    const { status, output } = runScript(worker);

    expect(status).toBe(0);
    expect(output).toContain('REFUSING to act');
    expect(output).toContain('Reconcile by hand');
    expect(git(worker, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(readFileSync(join(worker, 'src/local-only.ts'), 'utf8')).toBe('unpushed\n');
  });

  it('warns and exits 0 when the fetch fails — a session start is never blocked', () => {
    const { root, worker } = setup({ advanceOrigin: false });
    cleanupDirs.push(root);
    git(worker, ['remote', 'set-url', 'origin', join(root, 'no-such-remote.git')]);
    writeFileSync(join(worker, FILE), PHANTOM_CONTENT);

    const { status, output } = runScript(worker);

    expect(status).toBe(0);
    expect(output).toContain('WARNING: could not fetch');
    // Without origin's word on ancestry it must not touch even the phantom.
    expect(readFileSync(join(worker, FILE), 'utf8')).toBe(PHANTOM_CONTENT);
  });

  it('exits immediately inside a linked worktree', () => {
    const { root, worker } = setup({ advanceOrigin: true });
    cleanupDirs.push(root);
    const linked = join(root, 'linked');
    git(worker, ['worktree', 'add', '-q', '-b', 'side', linked]);
    writeFileSync(join(linked, FILE), PHANTOM_CONTENT);

    const { status, output } = runScript(linked, { CLAUDE_PROJECT_DIR: linked });

    expect(status).toBe(0);
    expect(output).toBe('');
    expect(readFileSync(join(linked, FILE), 'utf8')).toBe(PHANTOM_CONTENT);
  });

  // D15 (2026-08-31): a shallow repo's `git merge-base --is-ancestor` can
  // misreport a genuine ancestor as diverged, turning a recoverable stale
  // checkout into the "REFUSING to act" manual-intervention stop. These
  // three cases were run manually against scratch repos before this file
  // was touched (see the fixture's own comment) to confirm the defect is
  // real and that deepening fixes it without loosening the contract.
  describe('shallow-repository ancestry (D15, 2026-08-31 false refusal)', () => {
    it('recovers a checkout whose HEAD is a genuine ancestor but whose shallow graph cannot prove it', () => {
      const { root, worker } = setupShallowAncestor({ alsoDiverge: false });
      cleanupDirs.push(root);

      expect(
        execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: worker, encoding: 'utf8' }).trim(),
      ).toBe('true');

      // Sanity check the fixture actually reproduces the defect before the
      // script ever runs: fetch exactly as the script itself will, then ask
      // the same question it asks. It must fail here, or this test is not
      // exercising the bug.
      execFileSync('git', ['fetch', '-q', 'origin', 'master'], { cwd: worker });
      const preCheck = spawnSync(
        'git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/master'], { cwd: worker },
      );
      expect(preCheck.status).not.toBe(0);

      const { status, output } = runScript(worker);

      expect(status).toBe(0);
      expect(output).toContain('deepening once');
      expect(output).toContain('Deepened: the shallow graph was hiding a real ancestor relationship');
      expect(output).toContain('Fast-forwarded');
      expect(output).not.toContain('REFUSING to act');
      expect(git(worker, ['rev-parse', 'HEAD'])).toBe(git(worker, ['rev-parse', 'origin/master']));
      expect(git(worker, ['rev-parse', '--is-shallow-repository'])).toBe('false');
    });

    it('still refuses a shallow checkout that is genuinely diverged, even after deepening', () => {
      const { root, worker } = setupShallowAncestor({ alsoDiverge: true });
      cleanupDirs.push(root);
      const headBefore = git(worker, ['rev-parse', 'HEAD']);

      const { status, output } = runScript(worker);

      expect(status).toBe(0);
      // It does attempt to deepen — the divergence is real regardless of
      // shallowness, so the deepen alone must not be mistaken for proof of
      // ancestry.
      expect(output).toContain('deepening once');
      expect(output).toContain('REFUSING to act');
      expect(output).toContain('Reconcile by hand');
      expect(git(worker, ['rev-parse', 'HEAD'])).toBe(headBefore);
      expect(readFileSync(join(worker, 'local-only.txt'), 'utf8')).toBe('genuinely local, unpushed\n');
    });

    it('fails safe when the deepen attempt itself fails — nothing is trusted or changed', () => {
      const { root, worker } = setupShallowAncestor({ alsoDiverge: false });
      cleanupDirs.push(root);
      const headBefore = git(worker, ['rev-parse', 'HEAD']);

      // A `git` on PATH that fails only the `--unshallow` fetch, passing
      // everything else through to the real binary — simulating a network
      // failure that hits specifically during the deepen attempt, after the
      // script's own first, ordinary fetch already succeeded.
      const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
      const shimDir = mkdtempSync(join(tmpdir(), 'git-unshallow-shim-'));
      cleanupDirs.push(shimDir);
      writeFileSync(
        join(shimDir, 'git'),
        [
          '#!/usr/bin/env bash',
          'for a in "$@"; do',
          '  if [ "$a" = "--unshallow" ]; then',
          '    echo "shim: simulated network failure on --unshallow" >&2',
          '    exit 1',
          '  fi',
          'done',
          `exec "${realGit}" "$@"`,
          '',
        ].join('\n'),
        { mode: 0o755 },
      );

      const { status, output } = runScript(worker, { PATH: `${shimDir}:${process.env.PATH ?? ''}` });

      expect(status).toBe(0);
      expect(output).toContain('deepening once');
      expect(output).toContain('could not deepen');
      expect(output).toContain('nothing was changed');
      expect(output).not.toContain('Fast-forwarded');
      expect(output).not.toContain('REFUSING to act');
      expect(git(worker, ['rev-parse', 'HEAD'])).toBe(headBefore);
    });
  });
});

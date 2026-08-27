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
});

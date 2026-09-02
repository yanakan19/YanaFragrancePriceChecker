// Integration tests for scripts/signed-commit.sh and its payload builder, run
// against real scratch git repositories for the same reason
// tests/commitAndPush.test.ts is: the behaviour under test is an interaction
// between bash, git's index and a JSON payload, and a unit test of parsed-out
// logic would not cover it.
//
// docs/DECISIONS.md D16 and D18 refused this conversion three times, and the
// blocker they both named last was that no in-session agent could verify such
// a change against a live Actions run. That is still true here: nothing below
// contacts GitHub. What these tests CAN establish, and what the whole design
// leans on, is the safety property — that every path which is not an outright
// success declines cleanly, sends nothing, and leaves the caller to do exactly
// what it does today. A failure mode that cannot lose a harvest is the thing
// being pinned; whether GitHub returns a Verified commit is the thing only a
// real run can answer.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SIGNED = fileURLToPath(new URL('../scripts/signed-commit.sh', import.meta.url));
const COMMIT_AND_PUSH = fileURLToPath(new URL('../scripts/commit-and-push.sh', import.meta.url));

/** Exit codes signed-commit.sh promises; see its own header. */
const NOT_ATTEMPTED = 3;

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const cleanupDirs: string[] = [];
afterEach(() => {
  while (cleanupDirs.length) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

/**
 * A worker clone whose HEAD matches its remote, with `files` written and
 * staged but not committed — exactly the state commit-and-push.sh is in at the
 * moment it calls signed-commit.sh.
 */
function stagedWorker(files: Record<string, string>): { root: string; worker: string } {
  const root = mkdtempSync(join(tmpdir(), 'signed-commit-test-'));
  cleanupDirs.push(root);
  const seed = join(root, 'seed');
  const remote = join(root, 'remote.git');
  mkdirSync(seed, { recursive: true });
  git(seed, ['init', '-q', '-b', 'master']);
  git(seed, ['config', 'user.email', 'seed@test']);
  git(seed, ['config', 'user.name', 'seed']);
  writeFileSync(join(seed, 'README.md'), 'base\n');
  git(seed, ['add', '-A']);
  git(seed, ['commit', '-q', '-m', 'base']);
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(seed, ['push', '-q', remote, 'master']);

  const worker = join(root, 'worker');
  execFileSync('git', ['clone', '-q', remote, worker]);
  git(worker, ['config', 'user.email', 'bot@test']);
  git(worker, ['config', 'user.name', 'pricesniffs-bot']);

  for (const [rel, body] of Object.entries(files)) {
    const full = join(worker, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
    git(worker, ['add', rel]);
  }
  return { root, worker };
}

function runSigned(worker: string, env: Record<string, string> = {}) {
  const result = spawnSync('bash', [SIGNED, 'Harvest: real prices 2026-09-02', 'master'], {
    cwd: worker,
    encoding: 'utf8',
    // A deliberately empty base: the real environment variables this reads
    // (GITHUB_TOKEN, GITHUB_REPOSITORY, SIGNED_COMMITS) must come from the
    // case under test, not leak in from whatever is running the suite.
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
      GITHUB_REPOSITORY: '',
      ...env,
    },
  });
  return { status: result.status ?? -1, output: (result.stdout ?? '') + (result.stderr ?? '') };
}

describe('signed-commit.sh: every refusal is silent, total and cheap', () => {
  it('declines when SIGNED_COMMITS is switched off, without reading anything', () => {
    // The off switch the owner can use without editing code: a repository
    // variable set to `off`. It is checked before the token, before the
    // staged set, before the network — so turning it off cannot fail in some
    // new way of its own.
    const { worker } = stagedWorker({ 'data/image-link-report.json': '{"a":1}\n' });
    for (const value of ['off', 'OFF', 'false', '0', 'no']) {
      const r = runSigned(worker, { SIGNED_COMMITS: value, GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
      expect(r.status, value).toBe(NOT_ATTEMPTED);
      expect(r.output, value).toContain('not attempted');
    }
  });

  it('declines with no token, which is every run outside CI', () => {
    const { worker } = stagedWorker({ 'data/image-link-report.json': '{"a":1}\n' });
    const r = runSigned(worker, { GITHUB_REPOSITORY: 'o/r' });
    expect(r.status).toBe(NOT_ATTEMPTED);
    expect(r.output).toContain('GH_TOKEN');
  });

  it('declines with no GITHUB_REPOSITORY', () => {
    const { worker } = stagedWorker({ 'data/image-link-report.json': '{"a":1}\n' });
    const r = runSigned(worker, { GITHUB_TOKEN: 't' });
    expect(r.status).toBe(NOT_ATTEMPTED);
    expect(r.output).toContain('GITHUB_REPOSITORY');
  });

  it.each([
    ['demo/catalogue.generated.ts'],
    ['demo/index.html'],
    ['demo/404.html'],
  ])('declines outright when the staged set includes %s', (big) => {
    // D16's first reason. These three are 19.3 MB, 18.3 MB and 18.3 MB, and
    // base64 inflates each about 1.37x in a JSON body — whether GitHub's API
    // reliably accepts a request of that shape is unknown, and the branch a
    // cron is pushing to is not where to find out. So the four call sites
    // carrying them never reach the API at all.
    const { worker } = stagedWorker({
      [big]: 'x'.repeat(64),
      'data/harvest-report.json': '{"ok":true}\n',
    });
    const r = runSigned(worker, { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
    expect(r.status).toBe(NOT_ATTEMPTED);
    expect(r.output).toContain(big);
  });

  it('declines when the branch has moved, because a rebase is not this script\'s job', () => {
    // The single most important gate. createCommitOnBranch is an atomic
    // compare-and-swap with no rebase primitive, and re-deriving
    // commit-and-push.sh's conflict handling against it is exactly what D16
    // called the larger risk and D18 re-confirmed. So the moment there is
    // anything to rebase, this declines and the existing loop does the whole
    // job — unmodified.
    const { root, worker } = stagedWorker({ 'data/image-link-report.json': '{"a":1}\n' });
    const other = join(root, 'other');
    execFileSync('git', ['clone', '-q', join(root, 'remote.git'), other]);
    git(other, ['config', 'user.email', 'other@test']);
    git(other, ['config', 'user.name', 'other']);
    writeFileSync(join(other, 'README.md'), 'moved\n');
    git(other, ['add', '-A']);
    git(other, ['commit', '-q', '-m', 'concurrent']);
    git(other, ['push', '-q', 'origin', 'master']);

    const r = runSigned(worker, { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
    expect(r.status).toBe(NOT_ATTEMPTED);
    expect(r.output).toContain('rebase');
  });

  it('declines when nothing is staged', () => {
    const { worker } = stagedWorker({});
    const r = runSigned(worker, { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
    expect(r.status).toBe(NOT_ATTEMPTED);
    expect(r.output).toContain('nothing is staged');
  });

  it('leaves the repository untouched on every refusal', () => {
    // The property the whole design rests on: a decline must be as if this
    // script had never run. No commit, no staged/unstaged change, no moved
    // head — so commit-and-push.sh's own path proceeds from exactly the state
    // it was already in.
    const { worker } = stagedWorker({ 'data/image-link-report.json': '{"a":1}\n' });
    const headBefore = git(worker, ['rev-parse', 'HEAD']);
    const stagedBefore = git(worker, ['diff', '--cached', '--name-only']);
    runSigned(worker, { SIGNED_COMMITS: 'off', GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r' });
    expect(git(worker, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(git(worker, ['diff', '--cached', '--name-only'])).toBe(stagedBefore);
    expect(git(worker, ['log', '--oneline'])).toBe(git(worker, ['log', '--oneline', 'origin/master']));
  });
});

describe('signed-commit-payload.mjs: the request body', () => {
  function buildPayload(worker: string, env: Record<string, string>) {
    const script = fileURLToPath(new URL('../scripts/signed-commit-payload.mjs', import.meta.url));
    const r = spawnSync('node', [script], {
      cwd: worker,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  }

  it('carries the staged content, the branch and the expected head as a compare-and-swap guard', () => {
    const { worker } = stagedWorker({ 'data/image-link-report.json': '{"broken":0}\n' });
    const head = git(worker, ['rev-parse', 'HEAD']);
    const r = buildPayload(worker, {
      ADDITIONS: 'data/image-link-report.json',
      DELETIONS: '',
      MESSAGE: 'Image links: 2026-09-02',
      BRANCH: 'master',
      REPO: 'yanakan19/YanaFragrancePriceChecker',
      EXPECTED_OID: head,
      MAX_BYTES: '4194304',
    });
    expect(r.status).toBe(0);
    const body = JSON.parse(r.stdout);
    const input = body.variables.input;
    expect(input.expectedHeadOid).toBe(head);
    expect(input.branch).toEqual({
      repositoryNameWithOwner: 'yanakan19/YanaFragrancePriceChecker',
      branchName: 'master',
    });
    expect(input.message).toEqual({ headline: 'Image links: 2026-09-02' });
    expect(input.fileChanges.additions).toHaveLength(1);
    expect(input.fileChanges.additions[0].path).toBe('data/image-link-report.json');
    expect(Buffer.from(input.fileChanges.additions[0].contents, 'base64').toString('utf8')).toBe('{"broken":0}\n');
  });

  it('reads the index rather than the working tree', () => {
    // commit-and-push.sh's own callers rebuild files after staging them (that
    // is what its "discard build output" steps exist for), so the working tree
    // and the index genuinely disagree in production. What gets sent must be
    // what was staged, or the API commit would carry content nobody chose.
    const { worker } = stagedWorker({ 'data/image-link-report.json': '{"staged":true}\n' });
    writeFileSync(join(worker, 'data/image-link-report.json'), '{"rewritten-after-staging":true}\n');
    const r = buildPayload(worker, {
      ADDITIONS: 'data/image-link-report.json',
      DELETIONS: '',
      MESSAGE: 'Image links: 2026-09-02',
      BRANCH: 'master',
      REPO: 'o/r',
      EXPECTED_OID: git(worker, ['rev-parse', 'HEAD']),
      MAX_BYTES: '4194304',
    });
    const contents = JSON.parse(r.stdout).variables.input.fileChanges.additions[0].contents;
    expect(Buffer.from(contents, 'base64').toString('utf8')).toBe('{"staged":true}\n');
  });

  it('survives content a shell-built body would mangle', () => {
    // Every payload this touches is JSON snapshots full of quotes and
    // backslashes, and a corrupted body is the one failure that could land
    // *wrong* content rather than no content. This is why the body is built by
    // JSON.stringify and not by shell concatenation.
    const nasty = '{"t":"he said \\"x\\"","p":"C:\\\\n\\u00e9","nl":"a\nb"}\n';
    const { worker } = stagedWorker({ 'data/harvest-report.json': nasty });
    const r = buildPayload(worker, {
      ADDITIONS: 'data/harvest-report.json',
      DELETIONS: '',
      MESSAGE: 'Harvest: real prices 2026-09-02',
      BRANCH: 'master',
      REPO: 'o/r',
      EXPECTED_OID: git(worker, ['rev-parse', 'HEAD']),
      MAX_BYTES: '4194304',
    });
    const contents = JSON.parse(r.stdout).variables.input.fileChanges.additions[0].contents;
    expect(Buffer.from(contents, 'base64').toString('utf8')).toBe(nasty);
  });

  it('records deletions as paths rather than as empty additions', () => {
    const { worker } = stagedWorker({});
    const r = buildPayload(worker, {
      ADDITIONS: '',
      DELETIONS: 'data/catalogue/retired.json',
      MESSAGE: 'Harvest: real prices 2026-09-02',
      BRANCH: 'master',
      REPO: 'o/r',
      EXPECTED_OID: git(worker, ['rev-parse', 'HEAD']),
      MAX_BYTES: '4194304',
    });
    expect(r.status).toBe(0);
    const changes = JSON.parse(r.stdout).variables.input.fileChanges;
    expect(changes.deletions).toEqual([{ path: 'data/catalogue/retired.json' }]);
    expect(changes.additions).toBeUndefined();
  });

  it('refuses rather than truncating when the staged content exceeds the cap', () => {
    // The belt-and-braces half of the size gate: OVERSIZED_PATHS names today's
    // three known-large files and cannot know about tomorrow's.
    const { worker } = stagedWorker({ 'data/harvest-report.json': 'x'.repeat(5000) });
    const r = buildPayload(worker, {
      ADDITIONS: 'data/harvest-report.json',
      DELETIONS: '',
      MESSAGE: 'Harvest: real prices 2026-09-02',
      BRANCH: 'master',
      REPO: 'o/r',
      EXPECTED_OID: git(worker, ['rev-parse', 'HEAD']),
      MAX_BYTES: '1000',
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('cap');
    expect(r.stdout).toBe('');
  });

  it('splits a multi-line message into headline and body', () => {
    const { worker } = stagedWorker({ 'data/harvest-report.json': '{}\n' });
    const r = buildPayload(worker, {
      ADDITIONS: 'data/harvest-report.json',
      DELETIONS: '',
      MESSAGE: 'Headline here\n\nA body paragraph.',
      BRANCH: 'master',
      REPO: 'o/r',
      EXPECTED_OID: git(worker, ['rev-parse', 'HEAD']),
      MAX_BYTES: '4194304',
    });
    expect(JSON.parse(r.stdout).variables.input.message).toEqual({
      headline: 'Headline here',
      body: 'A body paragraph.',
    });
  });
});

describe('commit-and-push.sh still does its whole job when the signed path declines', () => {
  it('commits and pushes exactly as before with the switch off', () => {
    // The additive guarantee, end to end. With SIGNED_COMMITS=off the script
    // must be indistinguishable from the one that ran before this existed —
    // same commit, same committer, same push.
    const { worker } = stagedWorker({});
    writeFileSync(join(worker, 'data'), '', { flag: 'a' });
    rmSync(join(worker, 'data'), { force: true });
    mkdirSync(join(worker, 'data'), { recursive: true });
    writeFileSync(join(worker, 'data/image-link-report.json'), '{"broken":0}\n');

    const r = spawnSync('bash', [COMMIT_AND_PUSH, 'Image links: 2026-09-02', 'data/image-link-report.json'], {
      cwd: worker,
      encoding: 'utf8',
      env: { ...process.env, SIGNED_COMMITS: 'off' },
    });
    expect((r.stdout ?? '') + (r.stderr ?? '')).toContain('not attempted');
    expect(r.status).toBe(0);
    expect(git(worker, ['log', '-1', '--pretty=%s', 'origin/master'])).toBe('Image links: 2026-09-02');
    expect(git(worker, ['log', '-1', '--pretty=%an', 'origin/master'])).toBe('pricesniffs-bot');
  });

  it('commits and pushes when the signed path is unavailable, not just switched off', () => {
    // The failure that actually happens in production if anything about the
    // API path is wrong: no token, no network, a 500 from GitHub. All of them
    // land here, and here has to be the path that has been running all along.
    const { worker } = stagedWorker({});
    mkdirSync(join(worker, 'data'), { recursive: true });
    writeFileSync(join(worker, 'data/price-verification-report.json'), '{"drift":[]}\n');

    const r = spawnSync(
      'bash',
      [COMMIT_AND_PUSH, 'Price verification: measured drift', 'data/price-verification-report.json'],
      {
        cwd: worker,
        encoding: 'utf8',
        env: { ...process.env, SIGNED_COMMITS: '', GITHUB_TOKEN: '', GH_TOKEN: '', GITHUB_REPOSITORY: '' },
      },
    );
    expect(r.status).toBe(0);
    expect((r.stdout ?? '') + (r.stderr ?? '')).toContain('Continuing on the ordinary git commit-and-push path');
    expect(git(worker, ['log', '-1', '--pretty=%s', 'origin/master'])).toBe('Price verification: measured drift');
  });
});

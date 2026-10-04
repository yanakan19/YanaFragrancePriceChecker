// Runs the real `npm run rebuild` in a scratch copy of the repository and fails
// when it writes a committed file that scripts/generated-files.txt does not
// list as "rebuild". The scratch copy is a git worktree of HEAD with this
// checkout's uncommitted changes applied, sharing its history (the price
// history replay reads git) and its node_modules.
//
// Why it matters: "Commit rebuilt app" commits exactly the manifest's rebuild
// paths. A build output outside the list is left uncommitted, the page on the
// branch then disagrees with its source, and the next push conflict cannot be
// settled. demo/dormant.generated.ts (added 2026-10-04) was one, caught here.
//
// A rebuild takes several minutes and a few GB of memory, so this file runs
// only with CHECK_BUILD_WRITES=1:
//
//   CHECK_BUILD_WRITES=1 npx vitest run tests/generatedFilesBuild.test.ts
//
// .github/workflows/build-manifest.yml runs it on every push that touches the
// build, and catalogue-daily.yml makes the same check, in place, straight
// after every real rebuild (scripts/check-generated-writes.ts).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWritesSince, unlistedWrites } from '../scripts/check-generated-writes.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';

const run = process.env.CHECK_BUILD_WRITES === '1';

function git(cwd: string, args: string[], input?: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024 });
}

describe.runIf(run)('npm run rebuild, in a scratch copy', () => {
  it('writes only files scripts/generated-files.txt lists as rebuild', () => {
    const scratch = join(mkdtempSync(join(tmpdir(), 'rebuild-scratch-')), 'repo');
    git(REPO_ROOT, ['worktree', 'add', '--detach', '--quiet', scratch, 'HEAD']);
    try {
      const diff = git(REPO_ROOT, ['diff', '--binary', 'HEAD']);
      if (diff.trim()) git(scratch, ['apply', '--binary', '--whitespace=nowarn'], diff);
      for (const file of git(REPO_ROOT, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) {
        mkdirSync(dirname(join(scratch, file)), { recursive: true });
        copyFileSync(join(REPO_ROOT, file), join(scratch, file));
      }
      symlinkSync(join(REPO_ROOT, 'node_modules'), join(scratch, 'node_modules'), 'dir');

      // Past the check's one second mtime allowance, so the checkout itself
      // never reads as the build's writing.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
      const mark = Date.now();
      execFileSync('npm', ['run', 'rebuild'], { cwd: scratch, stdio: 'pipe', maxBuffer: 256 * 1024 * 1024 });

      const writes = buildWritesSince(scratch, mark);
      // The build really ran: it always rewrites the page.
      expect(writes.written).toContain('demo/index.html');
      expect(unlistedWrites(writes), 'committed files the build wrote that the manifest does not list as rebuild').toEqual([]);
    } finally {
      git(REPO_ROOT, ['worktree', 'remove', '--force', scratch]);
      rmSync(dirname(scratch), { recursive: true, force: true });
    }
  }, 40 * 60 * 1000);
});

describe.skipIf(run)('npm run rebuild, in a scratch copy (skipped)', () => {
  it.skip('runs only with CHECK_BUILD_WRITES=1; see the header of this file', () => {});
});

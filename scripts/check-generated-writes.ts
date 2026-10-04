/**
 * Lists the committed files a build wrote, and fails when one of them is not a
 * "rebuild" path in scripts/generated-files.txt.
 *
 *   MARK=$(node -e 'console.log(Date.now())')
 *   npm run rebuild
 *   npx tsx scripts/check-generated-writes.ts --since-ms "$MARK"
 *
 * "Wrote" means: a tracked file whose mtime is at or after the mark (written,
 * even with the same bytes), a tracked file the build deleted, or a new file
 * git does not ignore. catalogue-daily.yml runs this straight after the real
 * rebuild, and tests/generatedFilesBuild.test.ts runs the same rebuild in a
 * scratch copy. Either fails before a page built from an uncommitted input can
 * be pushed, which is how a generated file missing from the manifest turns
 * into run #592: the page commit names every rebuild path from the manifest,
 * so a file outside it is left behind, the page on the branch no longer
 * matches its source, and the next push conflict cannot be settled.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { policyOf, type GeneratedPolicy } from './generatedFiles.js';

function gitLines(root: string, args: string[]): string[] {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((l) => l.length > 0);
}

export interface BuildWrites {
  written: string[];
  deleted: string[];
  created: string[];
}

/**
 * A file's mtime comes from the kernel's coarse clock, which can read a few
 * milliseconds behind Date.now(), so a file written just after the mark can
 * carry an mtime just before it. One second of allowance covers that; the
 * build's own first write is always later than that after the mark (node and
 * tsx take longer than a second to start).
 */
const MTIME_ALLOWANCE_MS = 1000;

/** Every committed path the build touched since `sinceMs`, in three groups. */
export function buildWritesSince(root: string, sinceMs: number): BuildWrites {
  const since = sinceMs - MTIME_ALLOWANCE_MS;
  const deleted = new Set(gitLines(root, ['ls-files', '-z', '--deleted']));
  const written: string[] = [];
  for (const file of gitLines(root, ['ls-files', '-z'])) {
    if (deleted.has(file)) continue;
    const full = join(root, file);
    if (!existsSync(full)) continue;
    if (statSync(full).mtimeMs >= since) written.push(file);
  }
  // Only new files written since the mark: an earlier step's leftovers are
  // not this build's doing.
  const created = gitLines(root, ['ls-files', '-z', '--others', '--exclude-standard']).filter((file) => {
    const full = join(root, file);
    return existsSync(full) && statSync(full).mtimeMs >= since;
  });
  return { written: written.sort(), deleted: [...deleted].sort(), created: created.sort() };
}

/** The touched paths whose manifest policy is not one of `allowed`. */
export function unlistedWrites(writes: BuildWrites, allowed: readonly GeneratedPolicy[] = ['rebuild']): string[] {
  const all = [...writes.written, ...writes.deleted, ...writes.created];
  return [...new Set(all)].filter((p) => {
    const policy = policyOf(p);
    return policy === null || !allowed.includes(policy);
  }).sort();
}

function main(): void {
  const arg = process.argv.find((a) => a.startsWith('--since-ms='))?.split('=')[1] ??
    process.argv[process.argv.indexOf('--since-ms') + 1];
  const sinceMs = Number(arg);
  if (!Number.isFinite(sinceMs) || sinceMs <= 0) {
    console.error('usage: npx tsx scripts/check-generated-writes.ts --since-ms <epoch milliseconds before the build>');
    process.exit(2);
  }
  const root = process.cwd();
  const writes = buildWritesSince(root, sinceMs);
  const bad = unlistedWrites(writes);
  console.log(
    `The build touched ${writes.written.length} tracked file(s), deleted ${writes.deleted.length}, ` +
      `created ${writes.created.length}.`,
  );
  if (bad.length > 0) {
    for (const p of bad) {
      const policy = policyOf(p);
      console.log(
        `::error::The build wrote ${p}, which scripts/generated-files.txt ` +
          (policy === null ? 'does not list.' : `lists as "${policy}", not "rebuild".`) +
          ' Add or correct its line there, or the page commit leaves it behind (see run #592).',
      );
    }
    process.exit(1);
  }
  console.log('Every file the build wrote is a "rebuild" path in scripts/generated-files.txt.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

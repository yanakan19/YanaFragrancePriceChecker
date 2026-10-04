/**
 * Refreshes demo/testCount.generated.ts (the figure on the About page) from a
 * count of the whole suite made in small batches, for a machine that cannot hold
 * one full `vitest run` in memory.
 *
 *   npm run tests:count            # count, and write the file if the number moved
 *   npm run tests:count -- --check # count, print it, change nothing
 *   npm run tests:count -- 20      # batch size (default 12 files)
 *
 * ── Why this and not the reporter ────────────────────────────────────────────
 * scripts/testCountReporter.ts writes the same file as a side effect of one
 * full `vitest run`, which is the right source of truth where a full run fits.
 * Several test files import the ~35 MB generated catalogue, and a full run of
 * 145 files in one process is killed for memory on a small machine (and so is a
 * single `vitest list` over every file, measured 2026-10-04), so there it never
 * gets to write anything.
 *
 * ── Why the number is the same one ───────────────────────────────────────────
 * `vitest list` collects each file without running a single test and prints one
 * entry per test, the same leaf tasks the reporter walks (a `describe` is not
 * counted; every `it`, `test.each` row, skipped and todo test is). This sums
 * those entries over batches of files, so no more than one batch is ever in
 * memory, and refuses to write unless every `*.test.ts` in tests/ appeared in
 * the output: a partial count is never stamped as the suite's total, the same
 * rule the reporter applies. Checked against real runs (tests/changelog.test.ts
 * with tests/offerFormat.test.ts: 205 listed, 205 run) before it was trusted;
 * the figure is a count of tests that exist, not of tests that pass, exactly as
 * the reporter's is.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTestCountFile } from './testCountReporter.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = resolve(root, 'demo/testCount.generated.ts');

const args = process.argv.slice(2);
const check = args.includes('--check');
const batchSize = Number(args.find((a) => /^\d+$/.test(a)) ?? 12);

const onDisk = readdirSync(resolve(root, 'tests'))
  .filter((f) => f.endsWith('.test.ts'))
  .sort();

const scratch = mkdtempSync(resolve(tmpdir(), 'pricesniffs-count-'));
let total = 0;
const seen = new Set<string>();

/** Lists one batch. Returns null when the process was stopped for memory (a batch too big for the machine). */
function listBatch(batch: string[], label: string): { name: string; file: string }[] | null {
  // `--json=<file>`, written out with the equals sign: a bare `--json` takes the
  // next word as the file to write into, which on the first run overwrote a test.
  const jsonFile = resolve(scratch, `batch-${label}.json`);
  const run = spawnSync('npx', ['vitest', 'list', `--json=${jsonFile}`, ...batch], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  // 137 is the shell's code for a process the system stopped for memory.
  if (run.status === 137 || run.signal === 'SIGKILL') return null;
  if (run.status !== 0) {
    console.error(`vitest list failed on ${batch.join(', ')} (exit ${run.status}):\n${run.stderr || run.stdout}`);
    process.exit(1);
  }
  // A batch in which no file has a test writes no file at all.
  return existsSync(jsonFile) ? (JSON.parse(readFileSync(jsonFile, 'utf8')) as { name: string; file: string }[]) : [];
}

for (let i = 0; i < onDisk.length; i += batchSize) {
  const batch = onDisk.slice(i, i + batchSize).map((f) => `tests/${f}`);
  let entries = listBatch(batch, String(i));
  if (entries === null) {
    // Stopped for memory: the same files again, one at a time, which is what
    // the heaviest ones (they import the generated catalogue) need.
    entries = [];
    for (const file of batch) {
      const one = listBatch([file], `${i}-${file.replace(/\W/g, '_')}`);
      if (one === null) {
        console.error(`${file} could not be listed on its own either (stopped for memory); the count is not trusted.`);
        process.exit(1);
      }
      entries.push(...one);
    }
  }
  total += entries.length;
  for (const e of entries) seen.add(e.file);
  console.log(`tests ${i + 1} to ${i + batch.length} of ${onDisk.length}: ${entries.length} (running total ${total})`);
}

rmSync(scratch, { recursive: true, force: true });

const empty = onDisk.filter((f) => !seen.has(resolve(root, 'tests', f)));
if (empty.length > 0) {
  console.error(`${empty.length} test file(s) listed no tests, so this count is not trusted: ${empty.join(', ')}`);
  process.exit(1);
}

console.log(`TEST_COUNT = ${total} across ${onDisk.length} files`);
if (check) process.exit(0);

const existing = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : '';
if (existing.match(/export const TEST_COUNT = (\d+);/)?.[1] === String(total)) {
  console.log('demo/testCount.generated.ts already says that; nothing written.');
} else {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, renderTestCountFile(total));
  console.log('demo/testCount.generated.ts written. Run `npm run demo` so the About page shows it.');
}

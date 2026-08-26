/**
 * Keeps demo/testCount.generated.ts honest by regenerating it as a side
 * effect of every real `vitest run`.
 *
 * demo/legal.ts's About page used to hardcode TEST_COUNT by hand, the one
 * figure on that page nothing in the browser bundle can compute itself,
 * because a bundle running in a reader's browser cannot execute the test
 * suite that produced the number. It drifted anyway: it read 772 against a
 * real 1,364 on 2026-08-26, then drifted again the same evening as more
 * tests landed, because "hand check it against `npm test` when this file is
 * touched" is a comment, and a comment telling the next person to remember is
 * exactly the mechanism that already failed once.
 *
 * So this is not a comment, it is a vitest Reporter, wired into
 * vitest.config.ts. That means it runs inside the same process as the run
 * itself: no subprocess, no re-invoking vitest from within vitest, no
 * measurable added time. `onFinished` fires once, after every test file has
 * finished, with the full completed task tree already in hand — the real
 * test count is one recursive walk of that tree away, the same walk
 * vitest's own JSON reporter does to produce numTotalTests. Whatever number
 * the suite actually ran with is the number written to disk, every time.
 * There is no "remember to update this" step left for a maintainer to skip,
 * because the number is now a build artefact of running the tests, not a
 * fact someone is trusted to keep in sync by hand.
 *
 * Deliberately inert in watch mode (`vitest` / `npm run test:watch`):
 * onFinished there fires after every partial rerun a file save triggers, and
 * writing whatever subset of tests just reran into a file that claims to be
 * a full-suite total would be a worse, quieter drift than the one this
 * exists to fix. It only writes on a real, non-watch run — which is exactly
 * the command this repository already requires before every commit and
 * before every crawl (see catalogue-daily.yml's "Test before crawling"
 * step, and this repo's own contribution rules), so the About page's test
 * count cannot go stale without that same required command having already
 * fixed it first.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Reporter } from 'vitest/reporters';
import type { RunnerTask, RunnerTestFile } from 'vitest';
import type { Vitest } from 'vitest/node';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = resolve(root, 'demo/testCount.generated.ts');

/**
 * Counts leaf tasks: every task that is not itself a suite container. A
 * `describe` block is a suite and holds no test of its own, only more tasks
 * underneath it, so it must not be counted; everything else (`test`, `it`,
 * `bench`) is a real, individually reported test and counts as one. This is
 * the same definition vitest's own JSON reporter uses to produce
 * `numTotalTests`, which is what keeps this number meaning the same thing a
 * reader would see if they ran `npx vitest run` themselves.
 */
function countTests(tasks: RunnerTask[]): number {
  let count = 0;
  for (const task of tasks) {
    count += task.type === 'suite' ? countTests(task.tasks) : 1;
  }
  return count;
}

export class TestCountReporter implements Reporter {
  private isWatchMode = false;

  onInit(ctx: Vitest): void {
    this.isWatchMode = ctx.config.watch;
  }

  onFinished(files: RunnerTestFile[] = []): void {
    // Watch mode reruns only the files a save affected, so `files` here is a
    // subset, not the whole suite. Writing that subset's length as if it
    // were the total would be exactly the kind of silent, hand-waved number
    // this file exists to prevent — see this file's header.
    if (this.isWatchMode) return;

    const total = countTests(files);
    // A run that collected nothing (a typo'd filter, a bad path argument) is
    // not evidence the suite shrank to zero. Never let that overwrite a real
    // count with a false one.
    if (total <= 0) return;

    const existing = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : null;
    const previousMatch = existing?.match(/export const TEST_COUNT = (\d+);/);
    if (previousMatch && Number(previousMatch[1]) === total) return; // unchanged: skip the write so an unrelated run does not manufacture a diff.

    // No generated-at timestamp here on purpose, unlike this repo's other
    // generated files (e.g. DEALS_GENERATED_AT). Those regenerate on a slow,
    // fixed cadence, so a timestamp is cheap and meaningful. This one
    // regenerates on every non-watch `vitest run` by design — which happens
    // many times an hour across several concurrent agents on a shared branch
    // — so a timestamp that bumped on every unchanged run would make this
    // file a permanent, contended merge conflict for a fact (today's date)
    // nobody reads. Skipping the write entirely when the count has not
    // moved, as above, is what actually keeps this file quiet.
    const contents = `// Generated by scripts/testCountReporter.ts as a side effect of every
// non-watch \`vitest run\` — see that file's header comment for why. Do not
// edit by hand: it is overwritten the next time anyone runs the suite,
// whether that is \`npm test\`, \`npx vitest run\`, or CI's own test step
// before every crawl.

/** How many tests vitest collected the last time the full suite ran. */
export const TEST_COUNT = ${total};
`;

    mkdirSync(dirname(OUT_FILE), { recursive: true });
    writeFileSync(OUT_FILE, contents);
    // Visible in the same run's output, the same way build-demo.ts and the
    // other generators here report what they wrote.
    console.log(`demo/testCount.generated.ts  TEST_COUNT = ${total}`);
  }
}

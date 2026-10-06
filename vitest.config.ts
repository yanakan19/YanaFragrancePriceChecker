import { defineConfig } from 'vitest/config';
import { TestCountReporter } from './scripts/testCountReporter.js';

export default defineConfig({
  test: {
    // .claude/ holds isolated git worktrees background subagents work in —
    // each is a full checkout of this repo, so without this exclusion every
    // test run here would also run (and duplicate-report) their copies.
    exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**', '**/dist-demo/**'],
    // 'default' is vitest's own console reporter; TestCountReporter adds no
    // console output of its own beyond one line when it writes a change (see
    // its header comment) and exists purely to keep
    // demo/testCount.generated.ts, and so demo/legal.ts's About page, honest
    // about how many tests actually exist.
    reporters: ['default', new TestCountReporter()],
    // Vitest's own 5 s default is too short for a test that loads the built
    // page in Chromium on a busy machine: setPageBrowser's "opens the bottle
    // page" failed on 2026-10-06 at 5,003 ms with nothing wrong but the
    // clock. 30 s is enough for any page test and still ends a real hang;
    // tests/testHygiene.test.ts keeps it from dropping back.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

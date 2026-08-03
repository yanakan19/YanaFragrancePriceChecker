import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // .claude/ holds isolated git worktrees background subagents work in —
    // each is a full checkout of this repo, so without this exclusion every
    // test run here would also run (and duplicate-report) their copies.
    exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**', '**/dist-demo/**'],
  },
});

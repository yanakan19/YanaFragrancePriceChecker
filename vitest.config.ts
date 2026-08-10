import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // .claude/ holds isolated git worktrees background subagents work in —
    // each is a full checkout of this repo, so without this exclusion every
    // test run here would also run (and duplicate-report) their copies.
    // YanaFreeAPIMerger/ is a genuinely separate Node project (its own
    // package.json and dependencies, not hoisted into this repo's own
    // node_modules) rather than part of this package — it runs its own
    // tests via its own `npm test`, see YanaFreeAPIMerger/README.md.
    exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**', '**/dist-demo/**', '**/YanaFreeAPIMerger/**'],
  },
});

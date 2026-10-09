// Every repository script a package.json script runs must exist. The
// workflows have the same rule in tests/workflowRules.test.ts; this covers
// `npm run <name>`, so a script moved or deleted without its package.json
// line fails here instead of on the owner's machine (docs/REPO-TIDY-2026-10-09.md).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../scripts/generatedFiles.js';

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

describe('package.json scripts', () => {
  it('run only repository scripts that exist', () => {
    let checked = 0;
    for (const [name, command] of Object.entries(pkg.scripts)) {
      for (const m of command.matchAll(/(?:^|[\s"'])(scripts\/[\w./-]+\.(?:sh|ts|mjs|py))\b/g)) {
        checked++;
        expect(existsSync(join(REPO_ROOT, m[1]!)), `npm run ${name}: ${m[1]}`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(40);
  });
});

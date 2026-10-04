// scripts/no-new-type-errors.sh verifies shipping discovery's own edit to
// src/config/retailers.ts. It replaced `npm run typecheck || revert`, which
// reverted every registry edit from 2026-10-01 on because of six unrelated
// type errors in a test file. These tests use a scratch TypeScript project
// with one error the branch already has and check that only an error the edit
// adds fails.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/no-new-type-errors.sh', import.meta.url));
const TSC_BIN = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'no-new-type-errors-'));
  dirs.push(dir);
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  mkdirSync(join(dir, 'src/config'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ['src/**/*.ts', 'tests/**/*.ts'] }));
  writeFileSync(join(dir, 'src/config/retailers.ts'), 'export const RETAILERS: { id: string; rate: number }[] = [{ id: "a", rate: 1 }];\n');
  // The error the branch already carries, unrelated to the registry.
  writeFileSync(join(dir, 'tests/old.test.ts'), 'const n: number = "not a number";\nexport { n };\n');
  git(['init', '-q', '-b', 'master']);
  git(['config', 'user.email', 't@test']);
  git(['config', 'user.name', 't']);
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'base']);
  return dir;
}

function check(dir: string) {
  const r = spawnSync('bash', [SCRIPT, 'src/config/retailers.ts'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, TSC: `node ${TSC_BIN} -p tsconfig.json` },
  });
  return { status: r.status, output: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe('scripts/no-new-type-errors.sh', () => {
  it('passes a registry edit that type checks, though the branch has an unrelated type error', () => {
    const dir = project();
    writeFileSync(join(dir, 'src/config/retailers.ts'), 'export const RETAILERS: { id: string; rate: number }[] = [{ id: "a", rate: 3.99 }];\n');
    const { status, output } = check(dir);
    expect(status, output).toBe(0);
    expect(output).toContain('adds no type error (1 already on the branch)');
    // The edit is still on disk, untouched, for the commit step.
    expect(readFileSync(join(dir, 'src/config/retailers.ts'), 'utf8')).toContain('3.99');
  });

  it('fails a registry edit that adds a type error, and names it', () => {
    const dir = project();
    writeFileSync(join(dir, 'src/config/retailers.ts'), 'export const RETAILERS: { id: string; rate: number }[] = [{ id: "a", rate: "3.99" }];\n');
    const { status, output } = check(dir);
    expect(status).toBe(1);
    expect(output).toContain('adds type errors the branch does not have');
    expect(output).toContain('src/config/retailers.ts');
    expect(readFileSync(join(dir, 'src/config/retailers.ts'), 'utf8')).toContain('"3.99"');
  });

  it('has nothing to check when the file is unchanged', () => {
    const { status, output } = check(project());
    expect(status).toBe(0);
    expect(output).toContain('unchanged from HEAD');
  });
});

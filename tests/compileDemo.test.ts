import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileGenerated, demoSourceFiles } from '../scripts/compile-demo.js';
import { moveLiteralsToJson } from '../scripts/dataLiterals.js';

/**
 * scripts/compile-demo.ts replaced `tsc -p tsconfig.demo.json` as the build's compile step
 * (13 Oct 2026: tsc peaked near 4 GB; this one stays under 1 GB). The type check stays
 * `tsc --noEmit -p tsconfig.json`. These hold the rules that make the swap safe.
 */
const root = resolve(import.meta.dirname, '..');

describe('the files compiled', () => {
  it('are every demo and src file tsconfig.demo.json names, minus its excludes', () => {
    const files = demoSourceFiles(root);
    expect(files).toContain('demo/app.ts');
    expect(files).toContain('src/catalogue/audienceNames.ts');
    expect(files.filter((f) => !/^(demo|src)\//.test(f))).toEqual([]);
    for (const out of ['src/catalogue/store.ts', 'src/catalogue/fetcher.ts', 'src/catalogue/crawl.ts']) expect(files).not.toContain(out);
    expect(files.some((f) => f.endsWith('.d.ts'))).toBe(false);
  });
});

describe('a generated data module compiled', () => {
  const source = [
    "import type { Entry } from './x.js';",
    'export const CHUNK_0: Entry[] = [',
    '  { "id": "a", "name": \'He said "hi"\', "tab": "x\ty", "n": 1 },',
    '  { "id": "b" }',
    '];',
    'export const MAP: Record<string, number> = {',
    '"a":1',
    '};',
    'export function twice(n: number): number { return n * 2; }',
  ].join('\n');

  it('loses its types and keeps every literal exactly as written', () => {
    const out = compileGenerated('demo/x.generated.ts', source);
    expect(out).not.toMatch(/Entry\[\]|: number|Record</);
    expect(out).toContain('{ "id": "a", "name": \'He said "hi"\', "tab": "x\ty", "n": 1 },');
    expect(out).toContain('"a":1');
  });

  it('is still a file whose valid JSON literals the bundle step moves out', () => {
    const json = ['export const A: number[] = [', ...Array.from({ length: 3000 }, (_, i) => `  { "id": ${i}, "name": "n${i}" },`), '  { "id": 999 }', '];'].join('\n');
    const out = compileGenerated('demo/y.generated.ts', json);
    const local: unknown[] = [];
    const { moved } = moveLiteralsToJson(out, local);
    expect(moved.length).toBe(1);
    expect((local[0] as unknown[]).length).toBe(3001);
  });

  it('is the real catalogue module too: its literals are moved, as they were from the tsc output', () => {
    const out = compileGenerated('demo/catalogue.generated.ts', readFileSync(resolve(root, 'demo/catalogue.generated.ts'), 'utf8'));
    const local: unknown[] = [];
    const { moved } = moveLiteralsToJson(out, local);
    expect(moved.length).toBeGreaterThan(10);
    expect(out).toContain('export const CATALOGUE');
  });
});

import { describe, expect, it } from 'vitest';
import { moveLiteralsToJson } from '../scripts/dataLiterals.js';

/** Run transformed module code with a __psData that reads `blobs`, returning what it exports. */
function evaluate(code: string, blobs: unknown[], names: string[]): Record<string, unknown> {
  const body = code.replace(/^export /gm, '') + `\nreturn { ${names.join(', ')} };`;
  return new Function('__psData', body)((i: number) => blobs[i]) as Record<string, unknown>;
}

describe('moveLiteralsToJson', () => {
  const big = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: 'Black Orchid [150ml] {EDP}', note: 'He said "hi" \\ bye' }));

  it('moves a large JSON literal and leaves the module behaving the same', () => {
    const value = big(600);
    const src = `const CHUNK_0 = ${JSON.stringify(value)};\nexport const ALL = [...CHUNK_0];\nexport function first() { return ALL[0].id; }\n`;
    const blobs: unknown[] = [];
    const { code, moved } = moveLiteralsToJson(src, blobs, 1000);
    expect(moved).toEqual(['CHUNK_0']);
    expect(code).toContain('const CHUNK_0 = __psData(0);');
    expect(code).toContain('export function first()');
    const out = evaluate(code, blobs, ['ALL', 'first']);
    expect(out.ALL).toEqual(value);
    expect((out.first as () => string)()).toBe('p0');
  });

  it('is not fooled by brackets and escaped quotes inside strings', () => {
    const value = { a: ']}]}', b: '"{"', c: '\\', d: big(300) };
    const src = `export const X = ${JSON.stringify(value)};\nexport const Y = 1;\n`;
    const blobs: unknown[] = [];
    const { code } = moveLiteralsToJson(src, blobs, 1000);
    expect(evaluate(code, blobs, ['X', 'Y'])).toEqual({ X: value, Y: 1 });
  });

  it('leaves a literal that is not valid JSON as code', () => {
    const src = `export const X = [${Array.from({ length: 400 }, (_, i) => `{ id: ${i} }`).join(', ')}];\n`;
    const blobs: unknown[] = [];
    const { code, moved } = moveLiteralsToJson(src, blobs, 1000);
    expect(moved).toEqual([]);
    expect(code).toBe(src);
  });

  it('leaves small literals as code', () => {
    const src = 'export const SMALL = {"a":1};\n';
    expect(moveLiteralsToJson(src, [], 1000).code).toBe(src);
  });
});

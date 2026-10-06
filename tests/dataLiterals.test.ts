import { describe, expect, it } from 'vitest';
import { moveLiteralsToJson, oneEntryPerLine } from '../scripts/dataLiterals.js';

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

  it('moves a small chunk with the rest of its data set, so none of it ships as code', () => {
    const src = `const X_CHUNK_0 = ${JSON.stringify(big(600))};\nconst X_CHUNK_1 = ${JSON.stringify(big(1))};\nexport const X = [...X_CHUNK_0, ...X_CHUNK_1];\n`;
    const blobs: unknown[] = [];
    const { code, moved } = moveLiteralsToJson(src, blobs, 1000);
    expect(moved).toEqual(['X_CHUNK_0', 'X_CHUNK_1']);
    expect(evaluate(code, blobs, ['X'])).toEqual({ X: [...big(600), ...big(1)] });
  });
});

describe('oneEntryPerLine', () => {
  const entries = [
    { id: 'a', name: 'Black Orchid [150ml] {EDP}', note: 'He said "hi" \\ bye', gone: undefined, nested: { top: ['x'] } },
    { id: 'b', name: 'line\nbreak', price: 12.5, image: null },
  ];

  it('writes the same value as JSON.stringify, one entry a line', () => {
    const text = oneEntryPerLine(entries);
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(entries)));
    expect(text.split('\n')).toEqual(['[', JSON.stringify(entries[0]) + ',', JSON.stringify(entries[1]), ']']);
  });

  it('writes a record one key a line, leaving out an undefined value as JSON.stringify does', () => {
    const record = { 'ean-1': [{ price: 1 }], 'ean-2': [], skipped: undefined };
    const text = oneEntryPerLine(record);
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(record)));
    expect(text.split('\n')).toEqual(['{', '"ean-1":[{"price":1}],', '"ean-2":[]', '}']);
  });

  it('writes an empty array or record as the literal JSON.stringify gives', () => {
    expect(oneEntryPerLine([])).toBe('[]');
    expect(oneEntryPerLine({})).toBe('{}');
  });

  it('is still a literal the bundle moves to the data file', () => {
    const value = Array.from({ length: 300 }, (_, i) => ({ id: `p${i}`, name: 'Black Orchid' }));
    const src = `const CHUNK_0 = ${oneEntryPerLine(value)};\nexport const ALL = [...CHUNK_0];\n`;
    const blobs: unknown[] = [];
    expect(moveLiteralsToJson(src, blobs, 1000).moved).toEqual(['CHUNK_0']);
    expect(blobs[0]).toEqual(value);
  });
});

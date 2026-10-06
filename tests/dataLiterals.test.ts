import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import {
  inlineShopTimes, moveLiteralsToJson, oneEntryPerLine, SHOP_TIME, shopTimes, withoutShopTimes, withShopTimes,
} from '../scripts/dataLiterals.js';

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

// Each shop's "fetched at" written once in demo/catalogue.generated.ts
// (2026-10-06): every importer and the page's data file must still see
// exactly the CRAWLED they always did.
describe('shop times', () => {
  const T1 = '2026-10-06T08:50:40.023Z';
  const T2 = '2026-10-05T10:00:00.000Z';
  const offer = (retailerId: string, fetchedAt: string, price: number) =>
    ({ retailerId, price, wasPrice: null, stock: 'in_stock', url: `https://${retailerId}.test/${price}`, fetchedAt, firstSeenAt: T2, isNew: false });
  const crawled = {
    'ean-1': [offer('boots', T1, 10), offer('escentual', T2, 11)],
    'ean-2': [offer('boots', T1, 20), offer('boots', T2, 21)],
    'ean-3': [offer('escentual', T2, 30)],
  };

  it('writes each shop\'s commonest time once and 0 on the offers that share it, keeping key order', () => {
    const times = shopTimes(crawled);
    expect(times).toEqual({ boots: T1, escentual: T2 });
    const stored = withoutShopTimes(crawled, times);
    expect(stored['ean-2']!.map((o) => o.fetchedAt)).toEqual([SHOP_TIME, T2]);
    expect(Object.keys(stored['ean-1']![0]!)).toEqual(Object.keys(crawled['ean-1'][0]!));
    expect(JSON.stringify(withShopTimes(stored, times))).toBe(JSON.stringify(crawled));
  });

  it('takes the later time on a tie', () => {
    expect(shopTimes({ a: [offer('boots', T2, 1), offer('boots', T1, 2)] })).toEqual({ boots: T1 });
  });

  /** The catalogue module as tsc compiles it, in the stored form build-demo-catalogue.ts writes. */
  function compiled(): string {
    const times = shopTimes(crawled);
    return [
      'export const CATALOGUE = [];',
      `export const CRAWLED_SHOP_TIMES = ${oneEntryPerLine(times)};`,
      `const CRAWLED_STORED = ${oneEntryPerLine(withoutShopTimes(crawled, times))};`,
      'function withShopTimes(stored, times) {',
      '    const out = {};',
      '    for (const id of Object.keys(stored)) {',
      '        out[id] = stored[id].map((o) => (o.fetchedAt === 0 ? { ...o, fetchedAt: times[o.retailerId] } : o));',
      '    }',
      '    return out;',
      '}',
      'export const CRAWLED = withShopTimes(CRAWLED_STORED, CRAWLED_SHOP_TIMES);',
      'export const CRAWLED_AT = "x";',
    ].join('\n');
  }

  it('gives the bundler CRAWLED written out in full, and nothing of the stored form', () => {
    const before = evaluate(compiled(), [], ['CRAWLED']);
    const out = inlineShopTimes(compiled());
    expect(out).not.toMatch(/CRAWLED_STORED|CRAWLED_SHOP_TIMES|withShopTimes/);
    expect(out).toContain(`export const CRAWLED = ${oneEntryPerLine(crawled)};`);
    expect(JSON.stringify(evaluate(out, [], ['CRAWLED']).CRAWLED)).toBe(JSON.stringify(before.CRAWLED));
    const blobs: unknown[] = [];
    expect(moveLiteralsToJson(out, blobs, 10).moved).toEqual(['CRAWLED']);
    expect(JSON.stringify(blobs[0])).toBe(JSON.stringify(crawled));
  });

  it('leaves a module in the older form alone', () => {
    const old = `export const CRAWLED = ${oneEntryPerLine(crawled)};\n`;
    expect(inlineShopTimes(old)).toBe(old);
  });

  it('matches what tsc makes of the real generated module', () => {
    const source = readFileSync(resolve(__dirname, '../demo/catalogue.generated.ts'), 'utf8');
    if (!source.includes('const CRAWLED_STORED')) return;
    // Only the part around CRAWLED, with the stored offers emptied: 34 MB of
    // literals would prove nothing more.
    const from = source.indexOf('export const CRAWLED_SHOP_TIMES');
    const to = source.indexOf('\n', source.indexOf('export const CRAWLED: Record'));
    const part = source.slice(from, to + 1)
      .replace(/^const CRAWLED_STORED: ([^=]+)= \{\n[\s\S]*?\n\};$/m, 'const CRAWLED_STORED: $1= {};');
    const js = ts.transpileModule(`type CrawledOffer = { retailerId: string; fetchedAt: string };\n${part}`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText;
    const out = inlineShopTimes(js);
    expect(out).toContain('export const CRAWLED = {}');
    expect(out).not.toMatch(/CRAWLED_STORED|CRAWLED_SHOP_TIMES|withShopTimes/);
  });
});

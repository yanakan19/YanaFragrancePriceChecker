// demo/priceHistory.generated.ts writes each commit time and shop once
// (scripts/priceHistoryFile.ts, 2026-10-06): everything that imports it, the
// page's lazily loaded data file included, must see exactly the series
// render() wrote.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compactHistoryBody, historyFromGenerated } from '../scripts/priceHistoryFile.js';
import { emptyState, OUTPUT_PATH, render, type PricePoint } from '../scripts/priceHistoryReplay.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';

const T1 = '2026-10-03T10:00:00+00:00';
const T2 = '2026-10-04T10:00:00Z';
const T3 = '2026-10-05T10:00:00+00:00';

function body(): string {
  const state = emptyState();
  state.history.set('ean-2', [{ at: T1, priceGbp: 20.5, retailerId: 'escentual' }]);
  state.history.set('ean-1', [
    { at: T1, priceGbp: 10, retailerId: 'boots' },
    { at: T2, priceGbp: null, retailerId: null },
    { at: T3, priceGbp: 9.99, retailerId: 'boots' },
  ]);
  state.everPriced.set('ean-9', { first: T1, last: T2 });
  return render(state, [{ sha: 'a'.repeat(40), at: T1 }, { sha: 'b'.repeat(40), at: T3 }]).body;
}

/** The module's exports, as running it gives them. */
function run(source: string): Record<string, unknown> {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', 'require', js)(module, module.exports, () => ({}));
  return module.exports;
}

describe('the price history file', () => {
  it('stores each time and shop once, and the module gives back exactly the same exports', () => {
    const full = body();
    const compact = compactHistoryBody(full);
    expect(compact.slice(0, compact.indexOf('PRICE_HISTORY_GAP:'))).not.toContain('"retailerId"');
    expect(compact).toContain(`const PRICE_TIMES: string[] = ${JSON.stringify([T1, T2, T3].sort())};`);
    const before = run(full);
    const after = run(compact);
    for (const key of ['PRICE_HISTORY', 'PRICE_HISTORY_GAP']) {
      expect(JSON.stringify(after[key]), key).toBe(JSON.stringify(before[key]));
    }
    expect((after.priceHistoryFor as (id: string) => PricePoint[])('ean-1')).toEqual(
      (before.priceHistoryFor as (id: string) => PricePoint[])('ean-1'),
    );
  });

  it('reads the series back from either form', () => {
    const full = body();
    const expected = JSON.stringify(run(full).PRICE_HISTORY);
    expect(JSON.stringify(historyFromGenerated(full))).toBe(expected);
    expect(JSON.stringify(historyFromGenerated(compactHistoryBody(full)))).toBe(expected);
    expect(historyFromGenerated('export const NOTHING = 1;')).toBeNull();
  });

  it('leaves a body it does not recognise as it is', () => {
    expect(compactHistoryBody('export const X = 1;\n')).toBe('export const X = 1;\n');
  });

  it('reads the real generated file', () => {
    const text = readFileSync(join(REPO_ROOT, OUTPUT_PATH), 'utf8');
    const history = historyFromGenerated(text)!;
    expect(Object.keys(history).length).toBeGreaterThan(1000);
    const first = Object.values(history)[0]![0]!;
    expect(Object.keys(first)).toEqual(['at', 'priceGbp', 'retailerId']);
  });
});

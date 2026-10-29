import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { softly } from './support/softCheck.js';
import { SOFT_FAILURE_LIMIT, buildReport, parseReport, readFindings, recordFinding, renderFindings, tooMany } from '../scripts/softTestReport.js';

// The rules of the soft data checks (scripts/softTestReport.ts, docs/PIPELINE-FAILURE-MODES.md row 61):
// what the crawl's data tests may report instead of failing, and what they never may.

const root = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'soft-'));
const file = join(dir, 'findings.jsonl');
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => {
  delete process.env.SOFT_TEST_FINDINGS;
  writeFileSync(file, '');
});

const finding = (check: string, fileName = 'tests/a.test.ts') => ({ check, file: fileName, title: `t ${check}`, message: `m ${check}` });

describe('softly', () => {
  it('is an ordinary assertion where the crawl did not ask for soft checks', () => {
    expect(() => softly('x', () => expect(1).toBe(2))).toThrow();
  });

  it('records a failed assertion and goes on, where the crawl asked', () => {
    process.env.SOFT_TEST_FINDINGS = file;
    softly('odd-listing', () => expect([1]).toEqual([]));
    const found = readFindings(file);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: 'odd-listing', file: 'tests/softTestReport.test.ts' });
    expect(found[0]!.message.length).toBeGreaterThan(0);
  });

  it('never softens anything that is not an assertion, even in the crawl', () => {
    process.env.SOFT_TEST_FINDINGS = file;
    expect(() => softly('crash', () => { throw new TypeError('cannot read properties of undefined'); })).toThrow(TypeError);
    expect(readFindings(file)).toEqual([]);
  });

  it('passes quietly when the assertion holds', () => {
    process.env.SOFT_TEST_FINDINGS = file;
    softly('fine', () => expect(1).toBe(1));
    expect(readFindings(file)).toEqual([]);
  });
});

describe('the report', () => {
  it('holds one finding per file and check, in a fixed order, so the same data commits nothing', () => {
    const a = buildReport([finding('b'), finding('a'), finding('b'), finding('c', 'tests/0.test.ts')]);
    const b = buildReport([finding('c', 'tests/0.test.ts'), finding('a'), finding('b')]);
    expect(a).toEqual(b);
    expect(a.findings.map((f) => `${f.file} ${f.check}`)).toEqual(['tests/0.test.ts c', 'tests/a.test.ts a', 'tests/a.test.ts b']);
    expect(JSON.stringify(buildReport([]))).toBe(JSON.stringify({ limit: SOFT_FAILURE_LIMIT, findings: [] }));
  });

  it('fails the run only when more than the limit of different checks found something', () => {
    const some = (n: number) => buildReport(Array.from({ length: n }, (_, i) => finding(`c${i}`)));
    expect(tooMany(some(0))).toBe(false);
    expect(tooMany(some(SOFT_FAILURE_LIMIT))).toBe(false);
    expect(tooMany(some(SOFT_FAILURE_LIMIT + 1))).toBe(true);
    // The same check twice is one check.
    expect(tooMany(buildReport(Array.from({ length: 20 }, () => finding('same'))))).toBe(false);
  });

  it('skips a line a killed process cut off, and keeps a long message short', () => {
    recordFinding(file, { ...finding('long'), message: 'x'.repeat(5000) });
    writeFileSync(file, `${readFileSync(file, 'utf8')}{"check":"cut","fi`);
    const found = readFindings(file);
    expect(found).toHaveLength(1);
    expect(found[0]!.message.length).toBeLessThanOrEqual(400);
  });

  it('reads back what it wrote, and says what it found', () => {
    const r = buildReport([finding('a')]);
    expect(parseReport(JSON.stringify(r))).toEqual(r);
    expect(parseReport('nonsense')).toBeNull();
    expect(renderFindings(buildReport([])).join('\n')).toContain('No soft data check found anything');
    expect(renderFindings(r).join('\n')).toContain('| a |');
  });

  it('is the committed, empty-or-current file the crawl rewrites', () => {
    const committed = parseReport(readFileSync(resolve(root, 'data/soft-test-report.json'), 'utf8'));
    expect(committed).not.toBeNull();
    expect(committed!.limit).toBe(SOFT_FAILURE_LIMIT);
  });
});

describe('where it is used', () => {
  const users = readdirSync(resolve(root, 'tests'))
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => ({ f, text: readFileSync(resolve(root, 'tests', f), 'utf8') }))
    .filter(({ text }) => /\bsoft(It|ly)\(/.test(text));

  it('is only in data tests, which is the set the crawl runs with soft checks on', () => {
    const sets = new Map(readFileSync(resolve(root, 'scripts/test-sets.txt'), 'utf8').split('\n')
      .filter((l) => /^(code|data) /.test(l)).map((l) => l.split(' ').reverse() as [string, string]));
    for (const { f } of users.filter(({ f }) => f !== 'softTestReport.test.ts')) {
      expect(sets.get(`tests/${f}`), `${f} must be a data test to use softIt or softly`).toBe('data');
    }
  });

  it('is never in a guard of structure: a memory, an alias, the sitemap, the deploy', () => {
    const structural = /AppendOnly|Memory|Alias|Sitemap|sitemap|DeployBudget|deployBudget|LeafPages|leafPages|Slug|generatedFiles|workflowRules|testSets/;
    expect(users.filter(({ f }) => structural.test(f) && f !== 'softTestReport.test.ts').map(({ f }) => f)).toEqual([]);
  });

  it('names each check once per file', () => {
    for (const { f, text } of users.filter(({ f }) => f !== 'softTestReport.test.ts')) {
      const names = [...text.matchAll(/\bsoft(?:It|ly)\(\s*'([^']+)'/g)].map((m) => m[1]!);
      const dups = names.filter((n, i) => names.indexOf(n) !== i);
      expect(dups, `${f} reuses a check name`).toEqual([]);
    }
  });

  it('is switched on by the crawl on its data test step, and by nothing else', () => {
    const wf = readFileSync(resolve(root, '.github/workflows/catalogue-daily.yml'), 'utf8');
    const step = wf.slice(wf.indexOf('- name: Test the data the crawl produced'));
    expect(step.slice(0, step.indexOf('- name: Report the soft data checks'))).toContain('SOFT_TEST_FINDINGS');
    expect(step).toContain('scripts/soft-test-report.ts');
    for (const f of readdirSync(resolve(root, '.github/workflows')).filter((n) => n !== 'catalogue-daily.yml')) {
      expect(readFileSync(resolve(root, '.github/workflows', f), 'utf8'), f).not.toContain('SOFT_TEST_FINDINGS');
    }
    // The "Fail the run" step reads the report step's result, so too many findings still turn the run red.
    expect(wf).toMatch(/steps\.softreport\.outcome == 'failure'/);
  });
});



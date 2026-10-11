// The split of the test suite (scripts/test-sets.txt, scripts/testSets.ts).
//
// The crawl runs the "data" set after its rebuild and tests.yml runs the "code"
// set on every push, so a test file in neither would run nowhere, quietly. This
// is the test that cannot be skipped by the split: it reads tests/ and the
// manifest and fails for any file the manifest does not place, and for a file
// placed in `code` that the rule says reads what the crawl writes.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  codeOf, drivesBrowser, NAMES_ONLY, readsCrawlData, readTestSets, REPO_ROOT, suggestedSet, testFilesOnDisk,
} from '../scripts/testSets.js';

const rows = readTestSets();
const onDisk = testFilesOnDisk();
const src = (f: string) => readFileSync(join(REPO_ROOT, f), 'utf8');

describe('scripts/test-sets.txt', () => {
  it('puts every test file in exactly one of the two sets, so none is skipped by the split', () => {
    const listed = rows.map((r) => r.file);
    const missing = onDisk.filter((f) => !listed.includes(f));
    expect(missing, `in neither set; add a line for each (npx tsx scripts/testSets.ts suggest prints it): ${missing.join(' ')}`).toEqual([]);
    const twice = listed.filter((f, i) => listed.indexOf(f) !== i);
    expect(twice, 'listed twice').toEqual([]);
    const gone = listed.filter((f) => !existsSync(join(REPO_ROOT, f)));
    expect(gone, 'listed but not on disk').toEqual([]);
    for (const r of rows) expect(['data', 'code'], `${r.file}: set ${r.set}`).toContain(r.set);
  });

  it('keeps every test that reads what the crawl writes in the data set', () => {
    const wrong = rows.filter((r) => r.set === 'code' && suggestedSet(src(r.file), r.file) === 'data').map((r) => r.file);
    expect(wrong, 'read crawl data (the catalogue modules, snapshots, memories, built data or sitemaps) but are listed as code').toEqual([]);
  });

  it('keeps every test that drives a browser out of the crawl', () => {
    const wrong = rows.filter((r) => r.set === 'data' && drivesBrowser(src(r.file))).map((r) => r.file);
    expect(wrong, 'drive a browser but are listed as data').toEqual([]);
  });

  it('holds both sets, with the data set the smaller one the crawl can finish', () => {
    const data = rows.filter((r) => r.set === 'data');
    const code = rows.filter((r) => r.set === 'code');
    expect(data.length).toBeGreaterThan(20);
    expect(code.length).toBeGreaterThan(100);
  });

  it('names only code tests as reading crawl paths by name, and they exist', () => {
    for (const f of Object.keys(NAMES_ONLY)) {
      expect(existsSync(join(REPO_ROOT, f)), f).toBe(true);
      expect(rows.find((r) => r.file === f)?.set, f).toBe('code');
    }
  });
});

describe('the rule', () => {
  it('reads an import of a generated catalogue module, and a read of a path the crawl writes', () => {
    expect(readsCrawlData(`import { CRAWLED } from '../demo/catalogue.generated.js';`)).toBe(true);
    expect(readsCrawlData(`const m = await import('../demo/dormant.generated.js');`)).toBe(true);
    expect(readsCrawlData(`readFileSync(join(root, 'data/catalogue/boots.json'), 'utf8')`)).toBe(true);
    expect(readsCrawlData(`readFileSync(resolve(root, 'demo/sitemap-gb.xml'), 'utf8')`)).toBe(true);
    expect(readsCrawlData(`const f = readdirSync(resolve(root, 'demo/data'));`)).toBe(true);
    expect(readsCrawlData(`readFileSync('data/id-aliases.json', 'utf8')`)).toBe(true);
  });

  it('does not read a comment, a name that no file is read from, or a module source', () => {
    expect(readsCrawlData(`// reads demo/catalogue.generated.ts\nreadFileSync('a.txt')`)).toBe(false);
    expect(readsCrawlData(`/* data/catalogue */ expect(1).toBe(1);`)).toBe(false);
    expect(readsCrawlData(`expect(path).toBe('data/catalogue/boots.json');`)).toBe(false);
    expect(readsCrawlData(`import { x } from '../demo/data.js'; readFileSync('demo/data.ts')`)).toBe(false);
    expect(codeOf('// a\nb\n/* c */d')).toBe('b\nd');
  });

  it('puts a browser test in the code set even when it picks its fixtures from the catalogue', () => {
    const t = `import { launchChromium } from '../scripts/a11y-audit.js';\nimport { CRAWLED } from '../demo/catalogue.generated.js';`;
    expect(readsCrawlData(t)).toBe(true);
    expect(suggestedSet(t, 'tests/x.test.ts')).toBe('code');
  });
});

describe('the runner and its scripts', () => {
  it('is an executable script, and npm run test:data and test:code use it with their set', () => {
    const script = join(REPO_ROOT, 'scripts/run-tests-chunked.sh');
    expect(statSync(script).mode & 0o111).not.toBe(0);
    const text = readFileSync(script, 'utf8');
    // One singleFork process per chunk of about 20 files, and a non zero exit if any chunk failed.
    expect(text).toContain('--pool=forks --poolOptions.forks.singleFork');
    expect(text).toContain('chunk_size=20');
    expect(text).toContain('[ "${#failed_chunks[@]}" -eq 0 ]');
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:data']).toContain('scripts/run-tests-chunked.sh --set data');
    expect(pkg.scripts['test:code']).toContain('scripts/run-tests-chunked.sh --set code');
  });
});

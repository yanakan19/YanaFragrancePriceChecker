/**
 * Which test files run in the crawl and which run on every push.
 *
 * `scripts/test-sets.txt` puts every `tests/*.test.ts` in one of two sets:
 *
 *   data  reads what the crawl writes (the catalogue modules, the harvest
 *         snapshots, the memories, the price history, the built data files and
 *         sitemaps). The crawl runs them after its rebuild, on the data it just
 *         produced: `npm run test:data`.
 *   code  everything else (page layout, accessibility, social, copy, WebKit,
 *         motion, workflow rules, the crawl routes' parsers). It does not depend
 *         on the crawl, so `.github/workflows/tests.yml` runs it on every push
 *         and pull request: `npm run test:code`.
 *
 * The rule is `readsCrawlData` below: a test whose code (comments left out)
 * imports one of the generated catalogue modules, or reads a path the crawl
 * writes, is a data test, and `tests/testSets.test.ts` fails when such a file
 * is listed as code. One exception, `drivesBrowser`: a test that drives a
 * browser is a code test even when it picks its fixtures from the catalogue. It
 * checks how the page behaves (layout, accessibility, clicks), takes minutes
 * (the axe audits run at 30 s a page) and needs Chromium, which the crawl installs
 * only for its render tier; a bad figure in the data shows in the data tests. It also fails for a test file in neither set, a listed
 * file that does not exist, and a file listed twice, so a new test cannot be
 * skipped by the split: add its line to the manifest (this file's CLI prints
 * the set the rule gives it).
 *
 *   npx tsx scripts/testSets.ts list data|code   the files of a set
 *   npx tsx scripts/testSets.ts suggest          the manifest lines for files in neither set
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST = join(REPO_ROOT, 'scripts/test-sets.txt');

export type TestSet = 'data' | 'code';

/** An import of a catalogue module the crawl rebuilds. */
const IMPORTS_GENERATED = /(?:from|import\s*\()\s*['"][^'"]*\b(?:catalogue|dormant|deals|priceHistory)\.generated(?:\.js)?['"]/;

/** A path the crawl writes: the snapshots, the memories, the checkpoint, the built data and sitemaps. */
const CRAWL_PATH =
  /data\/(?:catalogue|houses|regions)\b|'data',\s*'(?:catalogue|houses|regions)'|\b(?:id-aliases|product-slugs|price-history-checkpoint|set-match-report|catalogue-build|harvest-report|harvest-cursor|house-sourcing-report)\.json|demo\/data(?![.\w])|'demo',\s*'data'|demo\/sitemap[-.\w]*xml|\bsitemap-(?:gb|us|in)\.xml/;

/** A call that reads a file or lists a folder: a test that names a crawl path but never reads a file is not reading the crawl. */
const FILE_READ = /\b(?:readFileSync|readdirSync|existsSync|statSync|readFile|readdir|createReadStream|loadCatalogue|CatalogueStore)\b/;

/** The source without comments, which are prose and name the data files freely. */
export function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n');
}

/** A test that opens the built page in a browser. */
const DRIVES_BROWSER = /\bplaywright\b|\blaunchChromium\b|\blaunchWebkit\b|a11y-audit/;

/** Whether a test file drives a browser, which makes it a code test whatever it reads. */
export function drivesBrowser(source: string): boolean {
  return DRIVES_BROWSER.test(codeOf(source));
}

/** Whether a test file reads what the crawl writes (the rule that makes it a data test). */
export function readsCrawlData(source: string): boolean {
  const code = codeOf(source);
  if (IMPORTS_GENERATED.test(code)) return true;
  return FILE_READ.test(code) && CRAWL_PATH.test(code);
}

/**
 * Files the rule matches that only name crawl paths: they read the workflows,
 * the manifest of generated files or a scratch repository, and the paths are
 * strings in their assertions. They are code tests (the build manifest and
 * workflow rules are about the repository, not the day's data).
 */
export const NAMES_ONLY: Record<string, string> = {
  'tests/workflowRules.test.ts': 'reads the workflow files; the data paths are names it checks',
  'tests/generatedFiles.test.ts': 'checks the manifest of generated files in scratch repositories',
  'tests/deployDecision.test.ts': 'reads deploy-pages.yml; the paths are inputs to the decision',
  'tests/commitAndPush.test.ts': 'runs the push script in scratch repositories',
  'tests/regionCa.test.ts': 'reads the Canada workflow, the service worker and the manifest of generated files; the data paths are names it checks',
  'tests/harvestGroups.test.ts': 'merges the sweep groups in scratch repositories; the data paths are names it places',
};

/** The set the rule gives a test file (`file` is `tests/<name>.test.ts`). */
export function suggestedSet(source: string, file = ''): TestSet {
  if (file in NAMES_ONLY || drivesBrowser(source)) return 'code';
  return readsCrawlData(source) ? 'data' : 'code';
}

/** The test files on disk, as `tests/<name>.test.ts`. */
export function testFilesOnDisk(root = REPO_ROOT): string[] {
  return readdirSync(join(root, 'tests'))
    .filter((f) => f.endsWith('.test.ts'))
    .sort()
    .map((f) => `tests/${f}`);
}

/** The manifest's rows, in file order. */
export function readTestSets(manifest = MANIFEST): { set: string; file: string }[] {
  return readFileSync(manifest, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .map((l) => {
      const [set = '', file = ''] = l.split(/\s+/);
      return { set, file };
    });
}

function main(): void {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'list' && (arg === 'data' || arg === 'code')) {
    for (const r of readTestSets()) if (r.set === arg) console.log(r.file);
    return;
  }
  if (cmd === 'suggest') {
    const listed = new Set(readTestSets().map((r) => r.file));
    for (const f of testFilesOnDisk()) {
      if (!listed.has(f)) console.log(`${suggestedSet(readFileSync(join(REPO_ROOT, f), 'utf8'), f)} ${f}`);
    }
    return;
  }
  console.error('usage: tsx scripts/testSets.ts list data|code | suggest');
  process.exit(2);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

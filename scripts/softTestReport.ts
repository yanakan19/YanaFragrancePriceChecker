/**
 * Soft data checks: what a data test finds in today's data that is a thing to
 * look at, not a reason to stop the crawl.
 *
 * The crawl's data tests read what the harvest just wrote. Most of them guard
 * the code (a memory only grows, a sitemap address answers 200, the deploy fits
 * its budget) and those stay hard. A few judge the DATA: that no two products
 * differ by a stray "Unisex", that a gift set's items are named, that a
 * Fragrantica link is the same perfume. One new or odd listing from any shop
 * trips those, and the crawl went red about every 3 to 4 hours for a week
 * (runs #1617 to #2011, 22 to 28 Oct 2026: Kayali, an audience word, a gift set
 * count, a US picture, Fragrantica links; each a different listing, each fixed
 * after the fact). The harvest and the rebuilt page were already committed
 * every time, so the red run protected nothing.
 *
 * A test written with `softIt` (tests/support/softCheck.ts) behaves as before
 * on a developer's machine and on every push. Only where the crawl sets
 * SOFT_TEST_FINDINGS does a failed ASSERTION become a finding: the test passes,
 * a line goes into that file, and scripts/soft-test-report.ts turns the lines
 * into data/soft-test-report.json, a ::warning:: each and the run's summary.
 * Anything that is not an assertion (a crash, a missing file, a type error) is
 * still a failure, and so is the crawl when more than SOFT_FAILURE_LIMIT
 * different checks find something at once: that is not one odd listing but the
 * data being wrong. docs/PIPELINE-FAILURE-MODES.md, row 61.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

export interface SoftFinding {
  /** The check's name, unique within its file. */
  check: string;
  /** The test file, repository relative. */
  file: string;
  /** The test's own title. */
  title: string;
  /** The first words of the assertion that failed. */
  message: string;
}

export interface SoftTestReport {
  /** How many different checks may find something before the crawl fails. */
  limit: number;
  findings: SoftFinding[];
}

/** More different checks than this finding something at once is the data being wrong, not an odd listing. */
export const SOFT_FAILURE_LIMIT = 4;

const MESSAGE_CHARS = 400;

/** One finding, appended as a line to the file the crawl named in SOFT_TEST_FINDINGS. */
export function recordFinding(path: string, finding: SoftFinding): void {
  const line: SoftFinding = { ...finding, message: finding.message.replace(/\s+/g, ' ').trim().slice(0, MESSAGE_CHARS) };
  appendFileSync(path, `${JSON.stringify(line)}\n`);
}

export function readFindings(path: string): SoftFinding[] {
  if (!existsSync(path)) return [];
  const out: SoftFinding[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const f = JSON.parse(line) as Partial<SoftFinding>;
      if (typeof f.check === 'string' && typeof f.file === 'string' && typeof f.title === 'string' && typeof f.message === 'string') {
        out.push({ check: f.check, file: f.file, title: f.title, message: f.message });
      }
    } catch {
      // A line cut off by a killed process is not a finding.
    }
  }
  return out;
}

/** One finding per file and check, in a fixed order, so the same data gives the same bytes and no commit. */
export function buildReport(findings: readonly SoftFinding[]): SoftTestReport {
  const byKey = new Map<string, SoftFinding>();
  for (const f of findings) if (!byKey.has(`${f.file}\u0000${f.check}`)) byKey.set(`${f.file}\u0000${f.check}`, f);
  const list = [...byKey.values()].sort((a, b) => a.file.localeCompare(b.file) || a.check.localeCompare(b.check));
  return { limit: SOFT_FAILURE_LIMIT, findings: list };
}

export function tooMany(report: SoftTestReport): boolean {
  return report.findings.length > report.limit;
}

/** Markdown for the run's summary and the weekly health. */
export function renderFindings(report: SoftTestReport): string[] {
  if (report.findings.length === 0) return ['No soft data check found anything in the last run.'];
  const L = [
    `${report.findings.length} soft data check(s) found something in the last run (the crawl fails above ${report.limit}). ` +
      'The harvest and the page are published as they are; fix the data or the rule (a rule that keeps tripping on one listing is a rule to rewrite, not a listing to hide).',
    '',
    '| Check | File | What it found |',
    '|---|---|---|',
  ];
  for (const f of report.findings) L.push(`| ${f.check} | \`${f.file}\` | ${f.message.replace(/\|/g, '/')} |`);
  return L;
}

export function parseReport(text: string): SoftTestReport | null {
  try {
    const r = JSON.parse(text) as Partial<SoftTestReport>;
    if (!Array.isArray(r.findings)) return null;
    return buildReport(r.findings as SoftFinding[]);
  } catch {
    return null;
  }
}

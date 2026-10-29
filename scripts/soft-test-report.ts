/**
 * After the crawl's data tests: turn the soft findings they recorded into
 * data/soft-test-report.json, one ::warning:: each and the run's summary, and
 * fail the run only when more than SOFT_FAILURE_LIMIT different checks found
 * something.
 *
 *   SOFT_TEST_FINDINGS=<file the tests appended to> npx tsx scripts/soft-test-report.ts
 *
 * See scripts/softTestReport.ts. With no findings file (or an empty one) the
 * report is written empty, so a check that stopped finding something leaves
 * the report on the next commit.
 */
import { appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGenerated } from './generatedFiles.js';
import { buildReport, readFindings, renderFindings, tooMany } from './softTestReport.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = process.env.SOFT_TEST_FINDINGS ?? '';
const report = buildReport(path ? readFindings(path) : []);

writeGenerated(root, 'data/soft-test-report.json', `${JSON.stringify(report, null, 2)}\n`);
for (const f of report.findings) console.log(`::warning file=${f.file}::soft data check "${f.check}": ${f.message}`);
const md = renderFindings(report);
console.log(md.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Soft data checks\n\n${md.join('\n')}\n`);

if (tooMany(report)) {
  console.log(`::error::${report.findings.length} different data checks found something in one run (the limit is ${report.limit}). That is the data being wrong, not one odd listing: see the table above.`);
  process.exit(1);
}

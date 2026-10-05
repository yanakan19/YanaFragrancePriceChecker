/**
 * Lay a run's newly learned Fragrantica page genders onto the latest review.
 *
 *   npx tsx scripts/merge-page-genders.ts <the run's review file> <the latest review file>
 *
 * The daily links workflow (.github/workflows/fragrance-links-daily.yml) writes
 * data/fragrantica-link-review.json during its run (scripts/resolve-fragrance-
 * links.ts adds a page's gender the first time a search result shows the page),
 * then resets to the newest commit and puts its files on top. The review is also
 * edited by people (a page rejected, a gender corrected), so copying the run's
 * file over the latest would undo an edit made while the job ran. This keeps the
 * latest file exactly as it is and adds only the page genders it lacks. The
 * second file is rewritten in place; if it has no page genders to add it is
 * left byte for byte as it was.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { mergePageGenders, parseReview, renderReview } from '../src/catalogue/fragranticaReview.js';

const [runFile, latestFile] = process.argv.slice(2);
if (!runFile || !latestFile) {
  console.error('usage: merge-page-genders.ts <run review file> <latest review file>');
  process.exit(2);
}

const latestText = readFileSync(latestFile, 'utf8');
const latest = parseReview(latestText);
const merged = mergePageGenders(latest, parseReview(readFileSync(runFile, 'utf8')));
const added = Object.keys(merged.pageGender).length - Object.keys(latest.pageGender).length;
if (added > 0) {
  writeFileSync(latestFile, renderReview(merged));
}
console.log(`Page genders: ${added} added to the latest review (${Object.keys(merged.pageGender).length} in all).`);

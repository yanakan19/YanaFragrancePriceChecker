/**
 * Fail when a shop that answered the last harvest still shows old prices.
 *
 *   npx tsx scripts/freshness-check.ts            # reads data/harvest-report.json
 *   npx tsx scripts/freshness-check.ts --warn-only
 *
 * The owner's rule (2026-10-03): every listing of every enabled shop that
 * answers us is re-checked at least daily, so a shown price is never more
 * than a day or two old. The harvest writes, per shop, how many shown
 * listings were last confirmed more than 48 hours ago (see
 * src/catalogue/freshness.ts). This reads that table and:
 *
 *   - prints it;
 *   - raises a ::warning:: for every shop with any shown listing over 48h;
 *   - exits 1 when a shop that answered this run (priced something, from its
 *     pages or its own catalogue feed, and refused no page) has more over 48h than a small
 *     tolerance allows, because that shop let us in and we still left its
 *     prices to age, which is the regression this exists to catch.
 *
 * A shop that did not answer (it refused us, or the run never reached it) is
 * warned about but does not fail the check: that is a fact about the shop or
 * the run, reported in the harvest log already, not something this code
 * failed to do. Its old prices are still hidden after HIDE_OFFER_AFTER_DAYS.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HarvestReport } from '../src/catalogue/harvestReport.js';
import { freshnessTolerance } from '../src/catalogue/freshness.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const warnOnly = process.argv.includes('--warn-only');

let report: HarvestReport;
try {
  report = JSON.parse(readFileSync(resolve(root, 'data/harvest-report.json'), 'utf8')) as HarvestReport;
} catch (err) {
  console.log(`::warning::freshness check: could not read data/harvest-report.json (${String(err).slice(0, 120)})`);
  process.exit(0);
}

if (!report.freshness) {
  console.log('::warning::freshness check: the harvest report carries no freshness table (killed run, or written before it existed).');
  process.exit(0);
}

const failing: string[] = [];
console.log(`Freshness of shown listings, harvest started ${report.startedAt}`);
console.log(`  ${'shop'.padEnd(24)} ${'shown'.padStart(6)} ${'>24h'.padStart(6)} ${'>48h'.padStart(6)}  answered  oldest shown`);
for (const [id, f] of Object.entries(report.freshness).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(
    `  ${id.padEnd(24)} ${String(f.shown).padStart(6)} ${String(f.over24h).padStart(6)} ${String(f.over48h).padStart(6)}  ` +
      `${(f.answered ? 'yes' : 'no').padEnd(8)}  ${f.oldestShownAt ?? '-'}`,
  );
  if (f.over48h === 0) continue;
  const allowed = freshnessTolerance(f.shown);
  if (f.answered && f.over48h > allowed) {
    failing.push(`${id} (${f.over48h} of ${f.shown} shown listings over 48h, tolerance ${allowed})`);
    console.log(`::error::${id} answered this harvest but ${f.over48h} of its ${f.shown} shown listings were last confirmed more than 48 hours ago.`);
  } else {
    console.log(
      `::warning::${id}: ${f.over48h} of ${f.shown} shown listings last confirmed more than 48 hours ago` +
        (f.answered ? ` (within tolerance ${allowed})` : ' (shop did not answer this run)'),
    );
  }
}

if (failing.length > 0) {
  console.log(`\n${failing.length} shop(s) answered and still show prices older than 48 hours: ${failing.join('; ')}`);
  process.exit(warnOnly ? 0 : 1);
}
console.log('\nFreshness check passed.');

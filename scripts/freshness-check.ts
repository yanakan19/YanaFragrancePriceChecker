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
 *     pages or its own catalogue feed, and refused no page) has more over 48h than
 *     freshnessHardLimit allows (a tenth of its shown listings, at least 25; between
 *     the small tolerance and that it is a warning), because that shop let us in and we still left its
 *     prices to age, which is the regression this exists to catch;
 *   - judges a feed shop (affiliate feed, synced by the Awin step, never asked by
 *     the sweep) the same way, by the age of its listings: a feed that stopped
 *     syncing fails here, and `answered: no` says nothing about it. An import
 *     shop (saved pages the owner imports) is only ever warned about.
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
import { freshnessHardLimit, freshnessTolerance, reportAge } from '../src/catalogue/freshness.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const warnOnly = process.argv.includes('--warn-only');

let report: HarvestReport;
try {
  report = JSON.parse(readFileSync(resolve(root, 'data/harvest-report.json'), 'utf8')) as HarvestReport;
} catch (err) {
  console.log(`::warning::freshness check: could not read data/harvest-report.json (${String(err).slice(0, 120)})`);
  process.exit(0);
}

// Printed first, and whatever else happens: this step now runs after an earlier
// failure too (catalogue-daily.yml, `!cancelled()`), when the report on disk
// may be from an older run than this one.
const age = reportAge(report.startedAt, new Date());
console.log(age.stale ? `::warning::${age.line}` : age.line);

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
      `${(f.source ?? (f.answered ? 'yes' : 'no')).padEnd(8)}  ${f.oldestShownAt ?? '-'}`,
  );
  if (f.over48h === 0) continue;
  const allowed = freshnessTolerance(f.shown);
  // A feed shop is never asked by the sweep, so it is judged by its listings' age alone.
  const judged = f.answered || f.source === 'feed';
  const hardLimit = freshnessHardLimit(f.shown);
  if (judged && f.over48h > allowed && f.over48h <= hardLimit) {
    // Over the tolerance but a corner of the shop, not a slice of it: reported, never a red crawl.
    console.log(
      `::warning::${id}: ${f.over48h} of ${f.shown} shown listings last confirmed more than 48 hours ago ` +
        `(over the tolerance ${allowed}, under the limit ${hardLimit} that fails the run): look at which listings the shop no longer serves.`,
    );
  } else if (judged && f.over48h > hardLimit) {
    failing.push(`${id} (${f.over48h} of ${f.shown} shown listings over 48h, limit ${hardLimit}${f.source === 'feed' ? ', feed' : ''})`);
    console.log(
      f.source === 'feed'
        ? `::error::${id} is read from a feed and ${f.over48h} of its ${f.shown} shown listings were last confirmed more than 48 hours ago: the feed sync is not keeping up.`
        : `::error::${id} answered this harvest but ${f.over48h} of its ${f.shown} shown listings were last confirmed more than 48 hours ago.`,
    );
  } else {
    console.log(
      `::warning::${id}: ${f.over48h} of ${f.shown} shown listings last confirmed more than 48 hours ago` +
        (judged ? ` (within tolerance ${allowed})` : f.source === 'import' ? ' (owner import, saved pages)' : ' (shop did not answer this run)'),
    );
  }
}

if (failing.length > 0) {
  console.log(`\n${failing.length} shop(s) answered and still show prices older than 48 hours: ${failing.join('; ')}`);
  process.exit(warnOnly ? 0 : 1);
}
console.log('\nFreshness check passed.');

/**
 * The daily catalogue crawl.
 *
 *   npm run catalogue -- --source=live
 *   npm run catalogue -- --source=fixtures --fixtures=fixtures/catalogue/day1
 *   npm run catalogue -- --source=fixtures --fixtures=fixtures/catalogue/day2 --date=2026-08-01
 *
 * Writes one snapshot per retailer to data/catalogue/, then prints what
 * changed. Exits non zero if every retailer failed, so a scheduled run shows
 * up as a failure rather than quietly doing nothing.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETAILERS } from '../src/config/retailers.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { crawlRetailer } from '../src/catalogue/crawl.js';
import { liveFetcher, fixtureFetcher } from '../src/catalogue/fetcher.js';
import { newListings, NEW_WINDOW_DAYS } from '../src/catalogue/newBadge.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const source = arg('source', 'fixtures');
const fixtureDir = arg('fixtures', 'fixtures/catalogue/day1');
const dateArg = arg('date', '');
const now = dateArg ? new Date(dateArg) : new Date();

if (Number.isNaN(now.getTime())) {
  console.error(`Unusable --date value: ${dateArg}`);
  process.exit(2);
}

const fetchPage =
  source === 'live' ? liveFetcher() : fixtureFetcher(resolve(root, fixtureDir));

const store = new CatalogueStore(resolve(root, 'data/catalogue'));

console.log(`\nScentDay catalogue crawl`);
console.log(`source   ${source}${source === 'fixtures' ? ` (${fixtureDir})` : ''}`);
console.log(`as of    ${now.toISOString()}`);
console.log(`shops    ${RETAILERS.filter((r) => r.enabled && r.catalogue).length} configured\n`);

const rows: string[] = [];
let ok = 0;
let failed = 0;
let totalNew = 0;

for (const retailer of RETAILERS) {
  if (!retailer.enabled || !retailer.catalogue) continue;

  const run = await crawlRetailer({ retailer, fetchPage, store, now });

  if (run.status === 'failed') failed++;
  else ok++;
  totalNew += run.newListings;

  const flag = run.baseline ? 'baseline' : `${run.newListings} new`;
  rows.push(
    `  ${retailer.name.padEnd(20)} ${String(run.listingsSeen).padStart(4)} listings  ` +
      `${flag.padEnd(10)} ${run.delistedListings ? `${run.delistedListings} gone` : ''}` +
      `${run.status === 'ok' ? '' : `  [${run.status}]`}`,
  );

  for (const err of run.errors.slice(0, 2)) {
    rows.push(`      ${err}`);
  }
}

console.log(rows.join('\n'));
console.log(`\n${ok} shops crawled, ${failed} failed, ${totalNew} new listings\n`);

// Everything the badge will show today, so a scheduled run is self reporting.
const fresh: string[] = [];
for (const retailer of RETAILERS) {
  if (!retailer.catalogue) continue;
  const snapshot = store.read(retailer.id);
  for (const listing of newListings(snapshot.listings, now)) {
    fresh.push(`  ${retailer.name.padEnd(20)} ${listing.rawTitle}`);
  }
}

if (fresh.length > 0) {
  console.log(`New in the last ${NEW_WINDOW_DAYS} days (${fresh.length}):`);
  console.log(fresh.join('\n'));
  console.log('');
} else {
  console.log(`Nothing new in the last ${NEW_WINDOW_DAYS} days.\n`);
}

if (ok === 0) {
  console.error('Every shop failed. Not writing this off as a quiet no op.');
  process.exit(1);
}

/**
 * Ingest an Awin affiliate product feed into the catalogue.
 *
 *   npm run catalogue:feed -- --file=path/to/feed.csv --retailer=fragrance-click
 *
 * This is the ingestion route for any retailer whose registry entry sets
 * `adapter: 'affiliate-feed'` — see the guard comments in
 * scripts/catalogue-harvest.ts, scripts/catalogue-probe.ts and
 * scripts/catalogue-run.ts, all of which skip those retailers deliberately,
 * because scraping a shop that already hands over a feed is exactly the
 * wrong move (docs/INGESTION.md). This script is the other half of that
 * decision: the actual way the feed gets in.
 *
 * Nothing here fabricates a listing. A feed file that parses to zero usable
 * rows is reported as such and nothing is written — see the `parsed === 0`
 * guard below, which mirrors catalogue-harvest.ts's own refusal.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETAILERS, getRetailer } from '../src/config/retailers.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { reconcile } from '../src/catalogue/reconcile.js';
import { parseAwinFeed } from '../src/catalogue/awinFeed.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const filePath = arg('file');
const retailerId = arg('retailer');

console.log(`\nAwin feed ingest`);

if (!filePath || !retailerId) {
  console.error(
    'Usage: npm run catalogue:feed -- --file=path/to/feed.csv --retailer=fragrance-click',
  );
  process.exit(1);
}

const retailer = getRetailer(retailerId);

if (!retailer) {
  console.error(`Unknown retailer id "${retailerId}". Known ids: ${RETAILERS.map((r) => r.id).join(', ')}`);
  process.exit(1);
}

if (retailer.adapter !== 'affiliate-feed') {
  console.error(
    `${retailer.name} (${retailer.id}) has adapter "${retailer.adapter}", not "affiliate-feed". ` +
      `This script is only for retailers whose registry entry marks them feed-fed — ` +
      `everything else goes through npm run harvest instead.`,
  );
  process.exit(1);
}

const resolvedFile = resolve(filePath);

let csvText: string;
try {
  csvText = readFileSync(resolvedFile, 'utf8');
} catch (err) {
  console.error(`Could not read ${resolvedFile}: ${String(err)}`);
  process.exit(1);
}

console.log(`retailer  ${retailer.name} (${retailer.id})`);
console.log(`file      ${resolvedFile}`);
console.log('');

const parsed = parseAwinFeed(csvText);
const withPrice = parsed.filter((l) => l.priceGbp !== null);

console.log(`${withPrice.length} priced listings parsed from the feed\n`);

if (withPrice.length === 0) {
  console.error('Nothing parsed. Not writing anything rather than showing an empty app.');
  console.error(
    'Check the file is really an Awin generic datafeed export (header row present, ' +
      '"aw_deep_link", "product_name" and "search_price" columns populated).',
  );
  process.exit(1);
}

const store = new CatalogueStore(resolve(root, 'data/catalogue'));
const now = new Date().toISOString();

// Live data and fixture data must never be reconciled against each other —
// the same rule scripts/catalogue-harvest.ts enforces.
const snapshot = store.read(retailer.id);
const existing = snapshot.source === 'live' ? snapshot.listings : [];

const outcome = reconcile({
  existing, crawled: withPrice, retailerId: retailer.id, now, complete: true,
});

store.write({
  retailerId: retailer.id,
  updatedAt: now,
  source: 'live',
  listings: outcome.listings,
  runs: snapshot.source === 'live' ? snapshot.runs : [],
});

console.log(`${outcome.newIds.length} new, ${outcome.delistedIds.length} delisted, ${outcome.relistedIds.length} relisted`);
console.log(`\nWrote ${outcome.listings.length} listings for ${retailer.name} to data/catalogue/${retailer.id}.json\n`);

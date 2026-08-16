/**
 * Clear a currency-quarantined shop's sterling prices from its stored snapshot.
 *
 *   npx tsx scripts/quarantine-prices.ts --shop=nicchia-luxury-uk --dry-run
 *   npm run quarantine:prices -- --shop=nicchia-luxury-uk
 *   npm run quarantine:prices -- --shop=some-shop --currency=USD
 *
 * ── Why this is a script and not a paragraph in a commit message ────────────
 * Quarantining a shop used to be a hand-run one-liner, done once for Escentual
 * on 2026-08-15 and never written down as a repeatable act. Meanwhile
 * nicchia-luxury-uk had been in CURRENCY_UNCONFIRMED since 2026-08-13 with
 * 6,843 sterling prices still sitting in its snapshot: the declaration and the
 * data had drifted apart, and nothing was going to notice.
 *
 * So: the registry is the declaration, `CatalogueStore.write` refuses to store
 * a sterling figure against a listed id (src/catalogue/currencyQuarantine.ts),
 * and this is the tool that brings an already-stored snapshot into line with
 * that. Together they mean a quarantine is a state the repo holds, not an
 * edit someone remembered to make.
 *
 * ── What it will not do ─────────────────────────────────────────────────────
 * It refuses any shop that is not in CURRENCY_UNCONFIRMED. Clearing a shop's
 * prices is not a thing to do because a run looked odd — the declaration comes
 * first, with its reason written down, and this follows it.
 *
 * It never converts anything. `--currency` only *labels* the salvaged figures
 * in `nativePrice`, and only where a source has not already published one; the
 * amounts are carried across untouched. Omit it and they are labelled
 * 'unknown', which is the honest answer whenever the unit genuinely is not
 * known — as it is for nicchia-luxury-uk, whose stored numbers are neither the
 * euros its storefront quotes nor anything anyone has identified.
 *
 * Delisted rows keep their prices: that figure is a record of what was charged
 * while the row was on sale. See src/catalogue/priceQuarantine.ts.
 *
 * Exit codes: 0 done (or nothing to do), 1 refused.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogueStore } from '../src/catalogue/store.js';
import { quarantinePrices } from '../src/catalogue/priceQuarantine.js';
import { findQuarantineViolations } from '../src/catalogue/currencyQuarantine.js';
import { CURRENCY_UNCONFIRMED, getRetailer } from '../src/config/retailers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const shop = arg('shop');
const currency = arg('currency');
const dryRun = process.argv.includes('--dry-run');

if (!shop) {
  console.error('Usage: npx tsx scripts/quarantine-prices.ts --shop=<retailer-id> [--currency=USD] [--dry-run]');
  console.error(`Currently in CURRENCY_UNCONFIRMED: ${[...CURRENCY_UNCONFIRMED.keys()].join(', ')}`);
  process.exit(1);
}

if (!CURRENCY_UNCONFIRMED.has(shop)) {
  console.error(
    `::error:: "${shop}" is not in CURRENCY_UNCONFIRMED in src/config/retailers.ts, so there is no ` +
      'recorded reason to believe its prices are not sterling. Declare it there first, with what was ' +
      'measured and by which run, then come back. ' +
      `Currently listed: ${[...CURRENCY_UNCONFIRMED.keys()].join(', ')}`,
  );
  process.exit(1);
}

if (!getRetailer(shop)) {
  console.error(`::error:: "${shop}" is in CURRENCY_UNCONFIRMED but is not a retailer id in RETAILERS.`);
  process.exit(1);
}

const store = new CatalogueStore(resolve(root, 'data/catalogue'));
const snapshot = store.read(shop);

console.log(`${shop}: ${snapshot.listings.length} stored listing(s), snapshot source ${snapshot.source ?? 'unset'}`);
console.log(`Reason on file: ${CURRENCY_UNCONFIRMED.get(shop)}\n`);

const before = findQuarantineViolations(shop, snapshot.listings);
if (before.length === 0) {
  console.log('No active listing carries a sterling figure. Nothing to do.');
  process.exit(0);
}

const result = quarantinePrices(snapshot.listings, currency);
const after = findQuarantineViolations(shop, result.listings);

const label = currency ?? 'unknown';
console.log(`${before.length} sterling figure(s) across ${snapshot.listings.length} listing(s) to clear.`);
console.log(`${result.cleared} active listing(s) had a price; each figure is kept as nativePrice in ${label}.`);
console.log(`${after.length} remaining after quarantine (must be 0).`);

if (after.length !== 0) {
  console.error('::error:: quarantinePrices left sterling figures behind. Refusing to write.');
  process.exit(1);
}

if (dryRun) {
  console.log('\n--dry-run: nothing written.');
  process.exit(0);
}

store.write({ ...snapshot, updatedAt: new Date().toISOString(), listings: result.listings });
console.log(`\nWritten. data/catalogue/${shop}.json now publishes no sterling price for this shop.`);

/**
 * Affiliate setup reminder.
 *
 * Run `npm run affiliate:status` to see which retailers are still unmonetised
 * and what the next step is for each. Every outbound link currently resolves to
 * the plain retailer URL, so the app works fine — it just earns nothing.
 */
import { pendingAffiliateSetup } from '../src/services/affiliate.js';
import { RETAILERS } from '../src/config/retailers.js';

const gaps = pendingAffiliateSetup();

if (gaps.length === 0) {
  console.log('All retailer affiliate programmes are live. Nothing to do.');
  process.exit(0);
}

console.log(`\nAffiliate setup outstanding: ${gaps.length} of ${RETAILERS.length} retailers\n`);
console.log('Links currently resolve to plain retailer URLs — functional, unmonetised.\n');

const byStatus = new Map<string, typeof gaps>();
for (const gap of gaps) {
  const bucket = byStatus.get(gap.status) ?? [];
  bucket.push(gap);
  byStatus.set(gap.status, bucket);
}

for (const [status, entries] of byStatus) {
  console.log(`── ${status} (${entries.length}) ──`);
  for (const e of entries) {
    const net = e.network ? `${e.network}${e.networkVerified ? '' : ' (unconfirmed)'}` : 'network unknown';
    console.log(`  ${e.retailerName.padEnd(22)} ${net}`);
    console.log(`  ${' '.repeat(22)} → ${e.action}`);
  }
  console.log('');
}

console.log('Setup guide: docs/AFFILIATE_SETUP.md\n');

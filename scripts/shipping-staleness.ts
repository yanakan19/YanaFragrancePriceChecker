/**
 * Shipping data staleness check.
 *
 * Delivery terms change without notice, and a stale free-delivery threshold
 * produces a wrong delivered price — the most damaging error this app can make,
 * because it is invisible to the user and looks authoritative.
 *
 * Run `npm run shipping:staleness` to list what needs re-checking.
 */
import { RETAILERS } from '../src/config/retailers.js';

/** Re-verify delivery terms at least this often. */
const MAX_AGE_DAYS = 90;

const now = Date.now();
const unverified: string[] = [];
const stale: string[] = [];

for (const r of RETAILERS) {
  const ageDays = Math.floor((now - Date.parse(r.shipping.verifiedAt)) / 86_400_000);

  if (r.shipping.confidence === 'unverified') {
    unverified.push(`  ${r.name.padEnd(22)} https://${r.domain}`);
  } else if (ageDays > MAX_AGE_DAYS) {
    stale.push(`  ${r.name.padEnd(22)} last checked ${ageDays} days ago`);
  }
}

if (unverified.length === 0 && stale.length === 0) {
  console.log('All shipping rules confirmed and current.');
  process.exit(0);
}

if (unverified.length > 0) {
  console.log(`\nNever confirmed against the retailer's own delivery page (${unverified.length}):\n`);
  console.log(unverified.join('\n'));
  console.log('\n  Until these are confirmed, treat the delivered-price sort as indicative');
  console.log('  and show the caveat in the UI (DeliveryDisplay.confirmed === false).\n');
}

if (stale.length > 0) {
  console.log(`\nConfirmed but older than ${MAX_AGE_DAYS} days (${stale.length}):\n`);
  console.log(stale.join('\n'));
  console.log('');
}

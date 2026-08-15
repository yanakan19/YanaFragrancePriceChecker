/**
 * Repair Awin-feed mojibake already stored in `data/catalogue`.
 *
 *   npm run repair:mojibake -- --dry-run   # report what would change
 *   npm run repair:mojibake                # apply it
 *
 * ── Why this exists alongside the ingestion-time fix ────────────────────────
 * `parseAwinFeed` (src/catalogue/awinFeed.ts) now repairs `rawTitle`,
 * `rawBrand` and `description` the moment a row is built, so every *future*
 * sync is clean at the source. That does nothing for rows already written to
 * disk before the fix existed — measured before this script ran: 244
 * mojibake-carrying fields in mybeauty-boutique.json, 8 in
 * nicchia-luxury-uk.json (all of them the correctly-encoded "Âme" that
 * repairMojibake rightly declines to touch — see its own comment), 2 in
 * escentual.json (in `description`, from a direct Shopify crawl rather than
 * an Awin feed, so the same upstream cause is not assumed — repairMojibake's
 * own guard is what decides, not this script). A fix that only works for
 * future crawls leaves every name already on the site broken.
 *
 * ── Why this is safe to run on already-correct data ─────────────────────────
 * repairMojibake is conservative and idempotent (see its own tests): a field
 * with nothing to repair comes back byte-for-byte identical, so running this
 * against every retailer's snapshot, not just the ones known to be affected,
 * costs nothing and cannot silently corrupt a shop that was never broken.
 */
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogueStore } from '../src/catalogue/store.js';
import { repairMojibake } from '../src/catalogue/fragranceId.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

const dir = resolve(root, 'data/catalogue');
const store = new CatalogueStore(dir);

let totalFieldsChanged = 0;
let totalListingsChanged = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const id = file.replace(/\.json$/, '');
  const snapshot = store.read(id);

  let listingsChanged = 0;
  let fieldsChanged = 0;

  const listings = snapshot.listings.map((l) => {
    const rawTitle = repairMojibake(l.rawTitle);
    const rawBrand = l.rawBrand === null ? null : repairMojibake(l.rawBrand);
    // Left as `undefined` when the field itself is absent, rather than being
    // assigned `undefined` explicitly, to match `exactOptionalPropertyTypes`
    // and leave a listing with no `description` key exactly as it was.
    const description = l.description == null ? l.description : repairMojibake(l.description);

    if (rawTitle === l.rawTitle && rawBrand === l.rawBrand && description === l.description) {
      return l;
    }

    listingsChanged++;
    fieldsChanged +=
      (rawTitle !== l.rawTitle ? 1 : 0) +
      (rawBrand !== l.rawBrand ? 1 : 0) +
      (description !== l.description ? 1 : 0);

    return description === undefined ? { ...l, rawTitle, rawBrand } : { ...l, rawTitle, rawBrand, description };
  });

  if (listingsChanged === 0) continue;

  totalListingsChanged += listingsChanged;
  totalFieldsChanged += fieldsChanged;
  console.log(`  ${id.padEnd(24)} ${listingsChanged} listing(s), ${fieldsChanged} field(s) repaired`);

  if (!dryRun) {
    store.write({ ...snapshot, listings });
  }
}

console.log(
  `\n${totalListingsChanged} listing(s), ${totalFieldsChanged} field(s) repaired` +
    `${dryRun ? ' (dry run, nothing written)' : ''}.`,
);
if (totalListingsChanged > 0 && !dryRun) {
  console.log('Rebuild the app to see them: npm run catalogue:demo && npm run demo');
}

/**
 * Import Notino UK pages the owner saved by hand.
 *
 *   npm run notino:import
 *   npm run notino:import -- --dir=data/notino-inbox --dry-run
 *
 * Reads every .html / .htm file in the inbox (default data/notino-inbox/,
 * gitignored: raw saved pages are never committed), keeps only product facts
 * (src/catalogue/notinoSavedPage.ts), and merges them into
 * data/catalogue/notino-uk.json with the day each page was read. Nothing is
 * fetched from Notino. With an empty or missing inbox it does nothing.
 *
 * It never prints page content: only file names, counts and fixed sentences.
 * See docs/NOTINO-PLAN.md route 3 and docs/OWNER-STEPS.md.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRetailer } from '../src/config/retailers.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { parseNotinoSavedPage, type SavedPageRefusal, type DeliveryRead } from '../src/catalogue/notinoSavedPage.js';
import { ingestNotinoPages, type SavedPageRead } from '../src/catalogue/notinoImport.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name: string): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const dryRun = process.argv.includes('--dry-run');
const dir = resolve(root, arg('dir') ?? 'data/notino-inbox');

const REASONS: Record<SavedPageRefusal, string> = {
  'challenge-page': 'this is a Cloudflare "Just a moment" page, not a product page',
  'not-notino': 'this page is not from notino.co.uk',
  'no-products': 'no product details with a price in pounds were found',
  'no-read-date': 'no saved date could be worked out',
  'read-date-in-future': 'the saved date is in the future',
};

console.log('\nNotino saved page import');
const retailer = getRetailer('notino-uk');
if (!retailer) {
  console.error('notino-uk is not in the registry.');
  process.exit(1);
}

const files = existsSync(dir)
  ? readdirSync(dir).filter((f) => /\.html?$/i.test(f)).sort()
  : [];
if (files.length === 0) {
  console.log(`No saved pages in ${dir}. Nothing to do.\n`);
  process.exit(0);
}

const pages: SavedPageRead[] = [];
const delivery: DeliveryRead[] = [];
const now = new Date();
for (const f of files) {
  const path = join(dir, f);
  let html: string;
  try {
    html = readFileSync(path, 'utf8');
  } catch {
    console.log(`  ${f}: could not be read, skipped`);
    continue;
  }
  const result = parseNotinoSavedPage(html, { fileTime: statSync(path).mtime, now });
  if (result.refusal) {
    console.log(`  ${f}: refused, ${REASONS[result.refusal]}`);
    continue;
  }
  const withEan = result.listings.filter((l) => l.ean !== null).length;
  console.log(
    `  ${f}: ${result.listings.length} products (${withEan} with a barcode), read ${result.readAt!.slice(0, 10)}` +
      (result.skipped ? `, ${result.skipped} skipped` : ''),
  );
  pages.push({ readAt: result.readAt!, listings: result.listings });
  for (const d of result.delivery) delivery.push(d);
}

if (pages.length === 0) {
  console.log('\nNothing usable. Nothing written.\n');
  process.exit(pages.length === 0 && files.length > 0 ? 1 : 0);
}

for (const d of delivery.slice(0, 5)) {
  console.log(
    `  delivery read: ${d.name ?? 'unnamed'}` +
      (d.priceGbp !== null ? `, £${d.priceGbp.toFixed(2)}` : '') +
      (d.minDays !== null ? `, ${d.minDays}-${d.maxDays ?? d.minDays} days` : '') +
      ' (record in the registry by hand once the page is read in full)',
  );
}

if (dryRun) {
  console.log('\nDry run: nothing written.\n');
  process.exit(0);
}

const outcome = ingestNotinoPages(new CatalogueStore(resolve(root, 'data/catalogue')), retailer, pages);
console.log(
  `\n${outcome.applied} listings written to data/catalogue/${retailer.id}.json` +
    (outcome.olderThanStored ? ` (${outcome.olderThanStored} skipped: a newer read is already stored)` : '') +
    '.\nPrices show for 7 days after the day the page was read.\n',
);

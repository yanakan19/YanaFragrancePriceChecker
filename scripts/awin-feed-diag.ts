/**
 * One-off diagnostic for a single Awin feed column layout.
 *
 *   npm run awin:feed-diag -- --shop=mybeauty-boutique --match="Obsession for Men Eau de Toilette 125ml"
 *
 * Purpose: `src/catalogue/awinFeed.ts` only reads a fixed, documented list of
 * columns (search_price, rrp_price, ...). Awin's standard schema carries more
 * price columns than that (store_price, display_price, base_price, saving,
 * savings_percent among them), and a Shopify-backed merchant's "Sale price /
 * Regular price" pair has to land somewhere. This script exists to answer,
 * for one named merchant and one named product, which columns actually carry
 * numbers — evidence gathered from CI, where the feed is reachable, not
 * guessed at from this sandbox where it is not.
 *
 * Safety: this prints column NAMES (never secret) and the values of columns
 * whose name looks price-related, for exactly one matched row. It never
 * prints the feed URL, any query string, any token, `process.env`, or the
 * full row (which could otherwise leak an affiliate deep-link or other
 * columns nobody asked to see). If a value cannot be printed without risking
 * a credential, it is not printed.
 *
 * Reuses the same fetch/parse building blocks as scripts/awin-feed-sync.ts
 * and src/catalogue/awinFeed.ts rather than reimplementing them, so what this
 * reports about column layout is guaranteed to be what the real ingest path
 * would see too.
 */
import { RETAILERS } from '../src/config/retailers.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { parseAwinFeedList, awinMerchantIdFromSignupUrl } from '../src/catalogue/awinFeedList.js';
import { parseDelimitedText, sniffDelimiter } from '../src/catalogue/awinFeed.js';

function argValue(flag: string): string | null {
  const prefix = `--${flag}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const shopId = argValue('shop');
const matchText = argValue('match');
const matchSku = argValue('sku');

if (!shopId || (!matchText && !matchSku)) {
  console.error(
    'Usage: tsx scripts/awin-feed-diag.ts --shop=<retailer id> --match="<substring of product_name>" [--sku=<merchant_product_id>]',
  );
  process.exit(1);
}

console.log('\nAwin feed diagnostic');

const feedListUrl = process.env.AWIN_FEED_LIST_URL;
if (!feedListUrl) {
  console.log('AWIN_FEED_LIST_URL is not set. Nothing to diagnose.\n');
  process.exit(0);
}

const retailer = RETAILERS.find((r) => r.id === shopId);
if (!retailer) {
  console.error(`No retailer with id "${shopId}" in src/config/retailers.ts.`);
  process.exit(1);
}
if (retailer.adapter !== 'affiliate-feed' || retailer.affiliate.network !== 'awin') {
  console.error(`"${shopId}" is not an Awin affiliate-feed retailer.`);
  process.exit(1);
}
const merchantId = awinMerchantIdFromSignupUrl(retailer.affiliate.signupUrl);
if (!merchantId) {
  console.error(`Could not read an Awin merchant id out of ${retailer.name}'s signupUrl.`);
  process.exit(1);
}

const http = createHttp();
const headers = { 'user-agent': 'PriceSniffsBot/0.2' };

const listRes = await http(feedListUrl, headers);
if (!listRes.ok) {
  console.error(`::error::Could not fetch the Awin feed list: HTTP ${listRes.status}${listRes.error ? ` ${listRes.error}` : ''}`);
  process.exit(1);
}

const feedList = parseAwinFeedList(listRes.body);
const row = feedList.find((f) => f.advertiserId === merchantId);
if (!row) {
  console.log(`No feed visible for ${retailer.name} (merchant ${merchantId}) on this account.\n`);
  process.exit(0);
}
console.log(`Feed found for ${retailer.name} (merchant ${merchantId}), last imported ${row.lastImported || '(no timestamp given)'}.`);

const feedRes = await http(row.url, headers);
if (!feedRes.ok) {
  console.error(`::error::Feed download failed: HTTP ${feedRes.status}${feedRes.error ? ` ${feedRes.error}` : ''}`);
  process.exit(1);
}

const delimiter = sniffDelimiter(feedRes.body);
const rows = parseDelimitedText(feedRes.body, delimiter);
if (rows.length === 0) {
  console.log('Feed parsed to zero rows.\n');
  process.exit(0);
}

const header = rows[0]!.map((h) => h.trim());
console.log(`\n${rows.length - 1} data row(s). Delimiter: ${delimiter === '\t' ? 'tab' : 'comma'}.`);
console.log(`\nColumn headers present (${header.length}):`);
for (const h of header) console.log(`  - ${h}`);

const nameIdx = header.indexOf('product_name');
const skuIdx = header.indexOf('merchant_product_id');

const matchLower = matchText?.toLowerCase() ?? null;
const found = rows.slice(1).find((r) => {
  const nameOk = matchLower !== null && nameIdx !== -1 ? (r[nameIdx] ?? '').toLowerCase().includes(matchLower) : false;
  const skuOk = matchSku !== null && skuIdx !== -1 ? (r[skuIdx] ?? '').trim() === matchSku : false;
  return nameOk || skuOk;
});

if (!found) {
  console.log(
    `\nNo row matched ${matchText ? `product_name containing "${matchText}"` : ''}${matchText && matchSku ? ' or ' : ''}${matchSku ? `merchant_product_id "${matchSku}"` : ''}.\n`,
  );
  process.exit(0);
}

// Price-ish columns for the one matched row, plus enough identity to confirm
// it is the right product. URL-shaped columns (aw_deep_link,
// merchant_deep_link, image URLs) are always withheld regardless of their
// column name, since a URL can carry a tracking query string even when nobody
// expected it to — see the file header comment. `description` is withheld as
// noise, not risk. Every other column is shown: the whole point of this
// script is to catch a sale price hiding under a column name the "price-ish"
// regex would not guess (e.g. a merchant's own custom_1/custom_2/custom_3),
// so a name-based allowlist would defeat the purpose.
const URL_ISH = /link|url/i;
const NOISE = new Set(['description']);
const PRICE_ISH = /price|rrp|sale|discount|saving|cost|msrp/i;

console.log('\nMatched row — identity:');
if (nameIdx !== -1) console.log(`  product_name: ${found[nameIdx]}`);
if (skuIdx !== -1) console.log(`  merchant_product_id: ${found[skuIdx]}`);

console.log('\nMatched row — price-ish columns:');
header.forEach((h, i) => {
  if (PRICE_ISH.test(h)) {
    console.log(`  ${h} = ${JSON.stringify(found[i] ?? '')}`);
  }
});

console.log('\nMatched row — every other column (URLs and description withheld):');
header.forEach((h, i) => {
  if (PRICE_ISH.test(h) || URL_ISH.test(h) || NOISE.has(h)) return;
  console.log(`  ${h} = ${JSON.stringify(found[i] ?? '')}`);
});

console.log('');

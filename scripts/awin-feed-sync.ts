/**
 * Automated sync for every `affiliate-feed` retailer on Awin.
 *
 *   npm run awin:feed-sync
 *
 * Reads AWIN_FEED_LIST_URL from the environment — a per-publisher URL with a
 * live API credential baked into it (see docs/AFFILIATE_SETUP.md). This is a
 * real secret: it is never hardcoded here, never logged, and never written
 * to any committed file. In CI it comes from a GitHub Actions secret; run
 * locally it has to be exported into the shell first. Unset, this script
 * logs that fact and exits cleanly rather than failing the job — the same
 * "skip, don't crash" contract catalogue-harvest.ts already gives
 * APIFY_PROXY_PASSWORD.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 * Before this, getting a fresh Fragrance Click export into the catalogue
 * meant a human downloading a file from the Awin dashboard by hand and
 * handing it to `npm run catalogue:feed`. That still works and is documented
 * in docs/AFFILIATE_SETUP.md, but this script is the actual live path now:
 * it fetches the Feed List Download URL, finds the row for each
 * affiliate-feed retailer by matching Awin's own Advertiser ID against the
 * merchant id already encoded in that retailer's `signupUrl`
 * (ui.awin.com/merchant-profile/<id>), and only re-downloads and re-ingests
 * a feed whose `Last Imported` timestamp has actually moved since the last
 * run — tracked in data/awin-feed-sync-state.json, the only state this
 * script keeps.
 *
 * Every retailer is handled independently: one feed failing to download or
 * parse is logged and skipped, never a reason to abandon the others.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { RETAILERS, CURRENCY_UNCONFIRMED } from '../src/config/retailers.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { parseAwinFeedList, awinMerchantIdFromSignupUrl } from '../src/catalogue/awinFeedList.js';
import { ingestAwinFeedCsv } from '../src/catalogue/awinFeedIngest.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const statePath = resolve(root, 'data/awin-feed-sync-state.json');

console.log('\nAwin feed sync');

const feedListUrl = process.env.AWIN_FEED_LIST_URL;
if (!feedListUrl) {
  console.log('AWIN_FEED_LIST_URL is not set. Skipping — see docs/AFFILIATE_SETUP.md to configure it.\n');
  process.exit(0);
}

const feedRetailers = RETAILERS.filter(
  (r) => r.adapter === 'affiliate-feed' && r.affiliate.network === 'awin' && awinMerchantIdFromSignupUrl(r.affiliate.signupUrl),
);

if (feedRetailers.length === 0) {
  console.log('No affiliate-feed retailers on Awin configured in src/config/retailers.ts. Nothing to sync.\n');
  process.exit(0);
}

type SyncState = Record<string, { lastImported: string }>;
const state: SyncState = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};

const http = createHttp();
const now = new Date().toISOString();
const headers = { 'user-agent': 'PriceSniffsBot/0.2' };

const listRes = await http(feedListUrl, headers);
if (!listRes.ok) {
  console.error(`::error::Could not fetch the Awin feed list: HTTP ${listRes.status}${listRes.error ? ` ${listRes.error}` : ''}`);
  process.exit(1);
}

const feedList = parseAwinFeedList(listRes.body);
console.log(`${feedList.length} feed(s) visible on this Awin account\n`);

const store = new CatalogueStore(resolve(root, 'data/catalogue'));
let stateChanged = false;

for (const retailer of feedRetailers) {
  // A shop on the currency-unconfirmed list cannot be synced: its feed's
  // "GBP" column is exactly the declaration nobody has verified, and
  // CatalogueStore.write now throws rather than store sterling figures for
  // such an id. Before this check existed, the sync downloaded Nicchia's
  // feed, hit that guard, and took the whole crawl down with it — every two
  // hours (run 213, 2026-08-16, the guard's first day). Skipping is the
  // honest outcome: the feed stays unread until someone reaches the shop's
  // checkout and settles what currency it actually charges.
  if (CURRENCY_UNCONFIRMED.has(retailer.id)) {
    console.log(
      `  ${retailer.name.padEnd(20)} skipped: in CURRENCY_UNCONFIRMED — its feed's own currency ` +
        `column is the unverified claim, so there is nothing safe to ingest`,
    );
    continue;
  }

  const merchantId = awinMerchantIdFromSignupUrl(retailer.affiliate.signupUrl)!;
  const row = feedList.find((f) => f.advertiserId === merchantId);

  if (!row) {
    console.log(`  ${retailer.name.padEnd(20)} no feed visible for merchant ${merchantId} on this account`);
    continue;
  }

  if (state[retailer.id]?.lastImported === row.lastImported) {
    console.log(`  ${retailer.name.padEnd(20)} unchanged since last sync (${row.lastImported || 'no timestamp given'})`);
    continue;
  }

  const feedRes = await http(row.url, headers);
  if (!feedRes.ok) {
    console.log(`  ${retailer.name.padEnd(20)} feed download failed: HTTP ${feedRes.status}${feedRes.error ? ` ${feedRes.error}` : ''}`);
    continue;
  }

  const outcome = ingestAwinFeedCsv(store, retailer, feedRes.body, now);
  if (!outcome.written) {
    console.log(`  ${retailer.name.padEnd(20)} feed downloaded but ${outcome.reason}`);
    continue;
  }

  state[retailer.id] = { lastImported: row.lastImported };
  stateChanged = true;
  console.log(
    `  ${retailer.name.padEnd(20)} ${outcome.totalListings} listings ` +
      `(${outcome.newIds.length} new, ${outcome.delistedIds.length} delisted, ${outcome.relistedIds.length} relisted)`,
  );
}

if (stateChanged) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

console.log('');

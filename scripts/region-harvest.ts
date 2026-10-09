/**
 * Read a region's shops once and write the region's snapshots and harvest
 * report (docs/INTERNATIONAL-PLAN.md, Phase 1, step one).
 *
 *   npx tsx scripts/region-harvest.ts --region=us
 *   npx tsx scripts/region-harvest.ts --region=in --shop=nykaa --dry-run
 *   npx tsx scripts/region-harvest.ts --region=us --max=250 --shop-minutes=12 --concurrency=3
 *
 * Writes data/regions/<us|in>/catalogue/<shop>.json and
 * data/regions/<us|in>/harvest-report.json, and nothing else: never a UK path,
 * never a page. `--dry-run` writes nothing at all and prints what it read.
 * Every request is PriceSniffsBot's, robots.txt first (D23); see
 * src/catalogue/regionHarvest.ts.
 */
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { REGION_RETAILERS, regionFromArg } from '../src/config/regionRetailers.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import {
  encodeRegionSnapshot, harvestRegionShop, type RegionShopReport, type RegionSnapshot,
} from '../src/catalogue/regionHarvest.js';
import { REPO_ROOT, writeGenerated } from './generatedFiles.js';

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const region = regionFromArg(arg('region'));
if (!region) {
  console.error('usage: region-harvest.ts --region=us|in [--shop=<id>] [--dry-run] [--max=250] [--shop-minutes=12] [--concurrency=3]');
  process.exit(2);
}
const onlyShop = arg('shop');
const dryRun = process.argv.includes('--dry-run');
const maxPages = Number.parseInt(arg('max') ?? '250', 10);
const shopMinutes = Number.parseFloat(arg('shop-minutes') ?? '12');
const runMinutes = arg('run-minutes') ? Number.parseFloat(arg('run-minutes')!) : null;
const concurrency = Math.max(1, Number.parseInt(arg('concurrency') ?? '3', 10) || 1);
const refreshAfterHours = Number.parseFloat(arg('refresh-after-hours') ?? '20');

const folder = `data/regions/${region.folder}`;
const shops = REGION_RETAILERS[region.id].filter((s) => !onlyShop || s.id === onlyShop);
if (onlyShop && shops.length === 0) {
  console.error(`No ${region.id} shop has the id ${onlyShop}.`);
  process.exit(2);
}

const http = createHttp({ timeoutMs: 25_000 });
const now = new Date().toISOString();
const runStarted = Date.now();
const runDeadline = runMinutes ? runStarted + runMinutes * 60_000 : Number.POSITIVE_INFINITY;

function previousSnapshot(id: string): RegionSnapshot | null {
  const path = resolve(REPO_ROOT, folder, 'catalogue', `${id}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RegionSnapshot;
  } catch {
    return null;
  }
}

console.log(`region   ${region.id} (${region.currency}), ${shops.length} shop(s), ${shops.filter((s) => s.enabled).length} enabled`);
console.log(`budget   ${maxPages} new product page(s) a sitemap shop, ${shopMinutes} min a shop, ${concurrency} at a time${dryRun ? ', DRY RUN: nothing written' : ''}`);

const reports: RegionShopReport[] = [];
const queue = [...shops];
async function lane(): Promise<void> {
  for (;;) {
    const shop = queue.shift();
    if (!shop) return;
    const left = runDeadline - Date.now();
    if (shop.enabled && left < 60_000) {
      reports.push({
        id: shop.id, name: shop.name, route: shop.route?.kind ?? null, singleBrand: shop.singleBrandOnly !== undefined,
        status: 'no-prices', listingsRead: 0, priced: 0, kept: 0, withBarcode: 0, pagesFetched: 0, seconds: 0,
        currency: '', errors: ['not asked: the run had less than a minute left'],
      });
      continue;
    }
    const previous = previousSnapshot(shop.id);
    const result = await harvestRegionShop({
      shop,
      http,
      now,
      previous,
      maxPages,
      shopMs: Math.min(shopMinutes * 60_000, Math.max(60_000, left)),
      refreshAfterHours,
      log: (line) => console.log(`  ${line}`),
    });
    const r = result.report;
    reports.push(r);
    console.log(
      `${shop.id.padEnd(22)} ${r.status.padEnd(9)} read ${r.listingsRead}, priced ${r.priced}, kept ${r.kept} ` +
        `(${r.withBarcode} with barcode), ${r.pagesFetched} request(s), ${r.seconds}s${r.note ? ` — ${r.note.slice(0, 100)}` : ''}`,
    );
    if (r.currency) console.log(`  currency: ${r.currency}`);
    for (const e of r.errors.slice(0, 3)) console.log(`  ! ${e.slice(0, 200)}`);
    for (const d of r.diagnostics ?? []) console.log(`  ~ ${d.slice(0, 240)}`);
    if (result.snapshot && !dryRun) {
      mkdirSync(resolve(REPO_ROOT, folder, 'catalogue'), { recursive: true });
      writeGenerated(REPO_ROOT, `${folder}/catalogue/${shop.id}.json`, encodeRegionSnapshot(result.snapshot));
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, shops.length)) }, () => lane()));

const order = new Map(shops.map((s, i) => [s.id, i]));
reports.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
const minutes = Math.round((Date.now() - runStarted) / 600) / 100;
const summary = {
  region: region.id,
  currency: region.currency,
  ranAt: now,
  minutes,
  dryRun,
  shopsWired: shops.length,
  shopsEnabled: shops.filter((s) => s.enabled).length,
  shopsPriced: reports.filter((r) => r.status === 'priced').length,
  listingsKept: reports.reduce((n, r) => n + r.kept, 0),
  shops: reports,
};
console.log(`\n${summary.shopsPriced} of ${summary.shopsEnabled} enabled shop(s) priced; ${summary.listingsKept} listing(s) kept; ${minutes} min.`);
if (!dryRun && !onlyShop) {
  mkdirSync(resolve(REPO_ROOT, folder), { recursive: true });
  writeGenerated(REPO_ROOT, `${folder}/harvest-report.json`, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Report: ${folder}/harvest-report.json`);
}

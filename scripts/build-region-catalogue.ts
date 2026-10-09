/**
 * Build a region's catalogue, price history and report from its snapshots
 * (docs/INTERNATIONAL-PLAN.md, Phase 1, step one: no publishing).
 *
 *   npx tsx scripts/build-region-catalogue.ts --region=us
 *
 * Reads data/regions/<us|in>/catalogue/*.json and harvest-report.json, and
 * data/product-slugs.json read only (to count products that land on a UK
 * product by barcode). Writes only:
 *   data/regions/<us|in>/catalogue.json      the products, one per line
 *   data/regions/<us|in>/price-history.json  appended from its own last copy
 *   data/regions/<us|in>/report.json         the plan's go/no-go numbers
 * No page, no slug, no alias, no UK file. src/catalogue/regionCatalogue.ts
 * holds the logic.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REGION_RETAILERS, regionFromArg } from '../src/config/regionRetailers.js';
import type { RegionSnapshot } from '../src/catalogue/regionHarvest.js';
import {
  appendRegionHistory, buildRegionCatalogue, encodeHistory, encodeLines, REGION_STALE_DAYS, type RegionPriceHistory,
} from '../src/catalogue/regionCatalogue.js';
import { REPO_ROOT, writeGenerated } from './generatedFiles.js';

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const region = regionFromArg(arg('region'));
if (!region) {
  console.error('usage: build-region-catalogue.ts --region=us|in');
  process.exit(2);
}
const folder = `data/regions/${region.folder}`;
const dir = resolve(REPO_ROOT, folder, 'catalogue');
const readJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
};

const shops = REGION_RETAILERS[region.id];
const known = new Set(shops.map((s) => s.id));
const snapshots: RegionSnapshot[] = existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson<RegionSnapshot>(resolve(dir, f)))
    .filter((s): s is RegionSnapshot => s !== null && known.has(s.retailerId) && s.currency === region.currency)
  : [];

const slugs = readJson<{ slugs: Record<string, string> }>(resolve(REPO_ROOT, 'data/product-slugs.json'));
const ukIds = new Set(Object.keys(slugs?.slugs ?? {}));
const now = new Date().toISOString();
const { products, measures } = buildRegionCatalogue(snapshots, {
  now,
  shopNames: new Map(shops.map((s) => [s.id, s.name])),
  ukIds,
  groups: new Map(shops.filter((s) => s.catalogueGroup).map((s) => [s.id, s.catalogueGroup!])),
  formatWords: new Map(shops.filter((s) => s.titleMustMatch).map((s) => [s.id, s.titleMustMatch!])),
  notHouse: new Map(shops.filter((s) => s.vendorNotHouse?.length).map((s) => [s.id, new Set(s.vendorNotHouse!.map((v) => v.toLowerCase()))])),
});

const historyPath = resolve(REPO_ROOT, folder, 'price-history.json');
const history = appendRegionHistory(readJson<RegionPriceHistory>(historyPath), products, region.currency, now);

const harvest = readJson<Record<string, unknown> & { minutes?: number; shopsPriced?: number; shops?: { id: string; status: string; priced: number; kept: number }[] }>(
  resolve(REPO_ROOT, folder, 'harvest-report.json'),
);

const report = {
  region: region.id,
  currency: region.currency,
  builtAt: now,
  published: false,
  note: 'Dry run (docs/INTERNATIONAL-PLAN.md, Phase 1 step one): nothing here is shown on the site.',
  shopsWired: shops.length,
  shopsEnabled: shops.filter((s) => s.enabled).length,
  shopsPriced: harvest?.shopsPriced ?? null,
  crawlMinutes: harvest?.minutes ?? null,
  harvestRanAt: harvest?.ranAt ?? null,
  listingsPriced: harvest?.shops?.reduce((n, s) => n + s.priced, 0) ?? null,
  listingsKept: harvest?.shops?.reduce((n, s) => n + s.kept, 0) ?? null,
  staleAfterDays: REGION_STALE_DAYS,
  ...measures,
  goNoGo: {
    bar: 'Proceed if at least a quarter of products have two or more shops (plan section 7).',
    meetsBar: measures.shareWithTwoOrMoreIndependentShops >= 0.25,
    measuredOn: 'shareWithTwoOrMoreIndependentShops (sister shops on one catalogue counted once)',
  },
};

writeGenerated(REPO_ROOT, `${folder}/catalogue.json`, encodeLines({ region: region.id, currency: region.currency, builtAt: now }, 'products', products));
writeGenerated(REPO_ROOT, `${folder}/price-history.json`, encodeHistory(history));
writeGenerated(REPO_ROOT, `${folder}/report.json`, `${JSON.stringify(report, null, 2)}\n`);

console.log(`${region.id}: ${snapshots.length} snapshot(s), ${measures.products} product(s), ${measures.productsWithTwoOrMoreShops} with two or more shops ` +
  `(${(measures.shareWithTwoOrMoreShops * 100).toFixed(1)}%), ${measures.productsWithTwoOrMoreIndependentShops} with two or more independent ` +
  `(${(measures.shareWithTwoOrMoreIndependentShops * 100).toFixed(1)}%), ${measures.productsWithThreeOrMoreShops} with three or more; ` +
  `median gap ${measures.medianPriceGap === null ? 'n/a' : `${(measures.medianPriceGap * 100).toFixed(1)}%`}; ` +
  `${measures.productsMatchingUkByBarcode} match a UK product by barcode.`);
for (const s of measures.shops) console.log(`  ${s.id.padEnd(22)} ${String(s.products).padStart(6)} product(s), ${s.shared} shared`);

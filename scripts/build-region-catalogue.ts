/**
 * Build a region's catalogue, price history, report and product addresses from
 * its snapshots (docs/INTERNATIONAL-PLAN.md, Phase 1; public beta since
 * 9 October 2026).
 *
 *   npx tsx scripts/build-region-catalogue.ts --region=us
 *
 * Reads data/regions/<us|in>/catalogue/*.json and harvest-report.json, and
 * data/product-slugs.json read only (to count products that land on a UK
 * product by barcode, and so a bottle the UK also sells keeps its UK address).
 * Also reads the UK catalogue module (demo/catalogue.generated.ts, read only)
 * for the UK picture of each product that is the same bottle as a UK product
 * (src/catalogue/regionUkPhotos.ts): the product line carries `ukPhoto`
 * ({ id, by }, never the picture itself) and report.json counts them. The page
 * build (scripts/build-region-data.ts) shows the picture itself.
 * Writes only:
 *   data/regions/<us|in>/catalogue.json      the products, one per line
 *   data/regions/<us|in>/price-history.json  appended from its own last copy
 *   data/regions/<us|in>/report.json         the plan's go/no-go numbers
 *   data/regions/<us|in>/product-slugs.json  the region's product addresses,
 *                                            append only (scripts/regionSite.ts)
 * No page, no alias, no UK file. src/catalogue/regionCatalogue.ts holds the
 * logic; the pages are built from these files at deploy time
 * (scripts/build-region-data.ts).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REGION_RETAILERS, regionFromArg } from '../src/config/regionRetailers.js';
import type { RegionSnapshot } from '../src/catalogue/regionHarvest.js';
import {
  appendRegionHistory, buildRegionCatalogue, encodeHistory, encodeLines, REGION_STALE_DAYS, type RegionPriceHistory,
} from '../src/catalogue/regionCatalogue.js';
import { matchUkPhotos, type UkPhotoSource } from '../src/catalogue/regionUkPhotos.js';
import { REPO_ROOT, writeGenerated } from './generatedFiles.js';
import { isShowable, regionSlugPath, regionSlugProduct, regionSlugs } from './regionSite.js';

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
const slugMemoryPath = regionSlugPath(region.id);
const slugMemory = readJson<{ slugs?: Record<string, string> }>(resolve(REPO_ROOT, slugMemoryPath))?.slugs ?? {};
const now = new Date().toISOString();
const { products, measures } = buildRegionCatalogue(snapshots, {
  now,
  shopNames: new Map(shops.map((s) => [s.id, s.name])),
  ukIds,
  groups: new Map(shops.filter((s) => s.catalogueGroup).map((s) => [s.id, s.catalogueGroup!])),
  formatWords: new Map(shops.filter((s) => s.titleMustMatch).map((s) => [s.id, s.titleMustMatch!])),
  notHouse: new Map(shops.filter((s) => s.vendorNotHouse?.length).map((s) => [s.id, new Set(s.vendorNotHouse!.map((v) => v.toLowerCase()))])),
});

// The UK catalogue, read only. A crawl that cannot load it still builds: no product then carries a UK picture.
let ukCatalogue: readonly UkPhotoSource[] = [];
try {
  await import('./siteApply.js');
  await import('../demo/siteData.js');
  ukCatalogue = (await import('../demo/catalogue.generated.js')).CATALOGUE;
} catch (e) {
  console.warn(`UK catalogue not loaded, no UK pictures counted: ${(e as Error).message}`);
}
const ukPhotos = matchUkPhotos(products.filter(isShowable), ukCatalogue);
const photoCounts = {
  productsShown: products.filter(isShowable).length,
  productsWithUkPhoto: ukPhotos.size,
  productsWithUkPhotoByBarcode: [...ukPhotos.values()].filter((x) => x.by === 'barcode').length,
  productsWithUkPhotoByName: [...ukPhotos.values()].filter((x) => x.by === 'name').length,
};
const lines = products.map((p) => (ukPhotos.has(p.id) ? { ...p, ukPhoto: { id: ukPhotos.get(p.id)!.ukId, by: ukPhotos.get(p.id)!.by } } : p));

const historyPath = resolve(REPO_ROOT, folder, 'price-history.json');
const history = appendRegionHistory(readJson<RegionPriceHistory>(historyPath), products, region.currency, now);

const harvest = readJson<Record<string, unknown> & { minutes?: number; shopsPriced?: number; shops?: { id: string; status: string; priced: number; kept: number }[] }>(
  resolve(REPO_ROOT, folder, 'harvest-report.json'),
);

const report = {
  region: region.id,
  currency: region.currency,
  builtAt: now,
  published: true,
  note: `Public beta since 9 Oct 2026 (docs/INTERNATIONAL-PLAN.md): the /${region.folder}/ pages are built from these files at deploy time.`,
  shopsWired: shops.length,
  shopsEnabled: shops.filter((s) => s.enabled).length,
  shopsPriced: harvest?.shopsPriced ?? null,
  crawlMinutes: harvest?.minutes ?? null,
  harvestRanAt: harvest?.ranAt ?? null,
  listingsPriced: harvest?.shops?.reduce((n, s) => n + s.priced, 0) ?? null,
  listingsKept: harvest?.shops?.reduce((n, s) => n + s.kept, 0) ?? null,
  staleAfterDays: REGION_STALE_DAYS,
  ...measures,
  ...photoCounts,
  shareWithUkPhoto: photoCounts.productsShown ? Math.round((photoCounts.productsWithUkPhoto / photoCounts.productsShown) * 1000) / 1000 : 0,
  goNoGo: {
    bar: 'Proceed if at least a quarter of products have two or more shops (plan section 7).',
    meetsBar: measures.shareWithTwoOrMoreIndependentShops >= 0.25,
    measuredOn: 'shareWithTwoOrMoreIndependentShops (sister shops on one catalogue counted once)',
  },
};

writeGenerated(REPO_ROOT, `${folder}/catalogue.json`, encodeLines({ region: region.id, currency: region.currency, builtAt: now }, 'products', lines));
writeGenerated(REPO_ROOT, `${folder}/price-history.json`, encodeHistory(history));
writeGenerated(REPO_ROOT, `${folder}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
// The region's product addresses: append only, a UK address kept for a bottle the UK also sells.
const regionAddresses = regionSlugs(products.filter(isShowable).map(regionSlugProduct), slugs?.slugs ?? {}, slugMemory);
writeGenerated(REPO_ROOT, slugMemoryPath, `${JSON.stringify({ slugs: regionAddresses }, null, 1)}\n`);

console.log(`${region.id}: ${snapshots.length} snapshot(s), ${measures.products} product(s), ${measures.productsWithTwoOrMoreShops} with two or more shops ` +
  `(${(measures.shareWithTwoOrMoreShops * 100).toFixed(1)}%), ${measures.productsWithTwoOrMoreIndependentShops} with two or more independent ` +
  `(${(measures.shareWithTwoOrMoreIndependentShops * 100).toFixed(1)}%), ${measures.productsWithThreeOrMoreShops} with three or more; ` +
  `median gap ${measures.medianPriceGap === null ? 'n/a' : `${(measures.medianPriceGap * 100).toFixed(1)}%`}; ` +
  `${measures.productsMatchingUkByBarcode} match a UK product by barcode; ${photoCounts.productsWithUkPhoto} of ${photoCounts.productsShown} take a UK picture; ` +
  `${Object.keys(regionAddresses).length - Object.keys(slugMemory).length} new product address(es), ${Object.keys(regionAddresses).length} in all.`);
for (const s of measures.shops) console.log(`  ${s.id.padEnd(22)} ${String(s.products).padStart(6)} product(s), ${s.shared} shared`);

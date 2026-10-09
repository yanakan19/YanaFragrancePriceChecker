/**
 * Builds each live region's page data, at deploy time, into dist-demo/regions/
 * (docs/INTERNATIONAL-PLAN.md, "Public beta, 9 October 2026: what shipped").
 *
 *   tsx scripts/build-region-data.ts          (part of npm run demo)
 *
 * For the US and India (every live region but the UK), from what the region
 * crawl committed under data/regions/<us|in>/ (scripts/regionSite.ts):
 *
 *   dist-demo/regions/<r>/catalogue.generated.js   the products and offers
 *   dist-demo/regions/<r>/deals.generated.js       Today's Deals
 *   dist-demo/regions/<r>/dormant.generated.js     (empty for now)
 *   dist-demo/regions/<r>/priceHistory.generated.js the chart's line
 *   dist-demo/regions/<r>/retailers.js             the region's shops as the
 *                                                  page's registry
 *   dist-demo/regions/<r>/site.json                counts, dates and the
 *                                                  addresses the sitemap lists
 *
 * Each module has the exports of the UK module of the same name, so
 * scripts/bundle-region.ts can hand them to the same page code in place of the
 * UK's. And for every live region, the UK included:
 *
 *   dist-demo/regions/links/<GB|US|IN>.json        what that region's page
 *                                                  knows of the others (the
 *                                                  `regions` lazy data file)
 *
 * dist-demo/ is the build's scratch folder (gitignored): nothing here is
 * committed, and nothing here writes a UK file. The page files themselves are
 * written by scripts/build-demo.ts.
 */
// First, before anything reads the catalogue (see scripts/siteApply.ts).
import './siteApply.js';
import '../demo/siteData.js';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { liveRegions } from '../src/config/regions.js';
import type { RegionCode } from '../src/types/regionRetailer.js';
import { slugify } from '../demo/router.js';
import { buildRegionSite, readRegionInputs, regionCodeOf, regionLinksFor, type RegionLinkSource, type RegionSite } from './regionSite.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist-demo/regions');

/** A module exporting `name = value` lines; values are JSON, so the bundle moves the large ones into data files. */
function exportLines(values: Record<string, unknown>): string {
  return Object.entries(values).map(([k, v]) => `export const ${k} = ${JSON.stringify(v)};`).join('\n');
}

const HEADER = (region: RegionCode, what: string) =>
  `// ${what} for the ${region} page, built by scripts/build-region-data.ts at deploy time from data/regions/.\n// Never committed. The same exports as the UK module of the same name.\n`;

function catalogueModule(site: RegionSite): string {
  return `${HEADER(site.region, 'Products and offers')}${exportLines({
    CATALOGUE: site.catalogue,
    CRAWLED_SHOP_TIMES: {},
    CRAWLED: site.crawled,
    OLDER_OFFERS: {},
    HISTORY_ALIASES: {},
    NOTE_ALIASES: [],
    HOUSE_PRODUCTS: [],
    CRAWLED_AT: site.crawledAt,
    SHOP_COUNT: site.shopCount,
  })}
export function offersFor(productId) {
  return (CRAWLED[productId] ?? []).map((o) => ({
    retailerId: o.retailerId,
    variantId: productId,
    price: o.price,
    wasPrice: o.wasPrice,
    currency: 'GBP',
    stock: o.stock,
    url: o.url,
    promoEndsAt: o.promoEndsAt,
    fetchedAt: o.fetchedAt,
    rating: o.rating,
    ...(o.format ? { formatLabel: o.format } : {}),
  }));
}
export function isNewAt(productId, retailerId) {
  return CRAWLED[productId]?.some((o) => o.retailerId === retailerId && o.isNew) ?? false;
}
`;
}

function dealsModule(site: RegionSite): string {
  return `${HEADER(site.region, "Today's Deals")}${exportLines({ DEALS_GENERATED_AT: site.dealsGeneratedAt, DEALS_RAW: site.deals })}\n`;
}

function dormantModule(site: RegionSite): string {
  return `${HEADER(site.region, 'Products with no current prices (none yet)')}${exportLines({ DORMANT_PRODUCTS: {}, ID_ALIASES: {}, SLUG_ALIASES: {} })}\n`;
}

function priceHistoryModule(site: RegionSite): string {
  return `${HEADER(site.region, 'The price chart')}${exportLines({ PRICE_HISTORY: site.priceHistory, PRICE_HISTORY_GAP: site.priceHistoryGap })}
export function priceHistoryFor(fragranceId) {
  return PRICE_HISTORY[fragranceId] ?? [];
}
export function priceHistoryGapFor(fragranceId) {
  return PRICE_HISTORY_GAP[fragranceId] ?? { reason: 'never' };
}
`;
}

/** The region's shops as the page's registry: the exports of src/config/retailers.ts, from src/config/regionShops.ts. */
function retailersModule(region: RegionCode, dir: string): string {
  const shops = relative(dir, resolve(root, 'dist-demo/src/config/regionShops.js')).split('\\').join('/');
  const brand = relative(dir, resolve(root, 'dist-demo/src/catalogue/brandName.js')).split('\\').join('/');
  return `${HEADER(region, 'The shops')}import { regionShopsAsRetailers } from '${shops.startsWith('.') ? shops : `./${shops}`}';
import { brandKey } from '${brand.startsWith('.') ? brand : `./${brand}`}';
export const RETAILERS = regionShopsAsRetailers('${region}');
export const CURRENCY_UNCONFIRMED = new Map();
const BY_ID = new Map(RETAILERS.map((r) => [r.id, r]));
export function getRetailer(id) {
  return BY_ID.get(id);
}
export function enabledRetailers() {
  return RETAILERS.filter((r) => r.enabled);
}
export function retailersForTier(tier) {
  return enabledRetailers().filter((r) => r.tiers.includes(tier));
}
export function cannotCarryBrand(retailer, brand) {
  if (!retailer.singleBrandOnly) return false;
  const house = brandKey(retailer.singleBrandOnly);
  const candidate = brandKey(brand);
  if (!house || !candidate) return false;
  return !(candidate.startsWith(house) || house.startsWith(candidate));
}
`;
}

/** What the sitemap and the route pages need of a region, without reading its modules again. */
export interface RegionSiteFacts {
  region: RegionCode;
  crawledAt: string;
  shopCount: number;
  products: number;
  bottles: number;
  /** Product address and the day its newest price was read. */
  productPages: { slug: string; lastmod: string }[];
  brandSlugs: string[];
  /** Shops with something on the page. */
  shops: string[];
  /** Every id the page has, for the hreflang alternates of the other regions' sitemaps. */
  ids: Record<string, string>;
  deals: number;
}

function factsOf(site: RegionSite): RegionSiteFacts {
  const lastRead = (id: string) => (site.crawled[id] ?? []).reduce((m, o) => (o.fetchedAt > m ? o.fetchedAt : m), '').slice(0, 10);
  return {
    region: site.region,
    crawledAt: site.crawledAt,
    shopCount: site.shopCount,
    products: site.catalogue.length,
    bottles: site.catalogue.filter((c) => !c.giftSet && !/^(Perfume Oil|Attar)$/.test(c.concentration)).length,
    productPages: site.catalogue.map((c) => ({ slug: c.slug, lastmod: lastRead(c.id) || site.crawledAt.slice(0, 10) })),
    brandSlugs: [...new Set(site.catalogue.map((c) => slugify(c.brand)).filter(Boolean))].sort(),
    shops: [...new Set(Object.values(site.crawled).flatMap((o) => o.map((x) => x.retailerId)))].sort(),
    ids: Object.fromEntries(site.catalogue.map((c) => [c.id, c.slug])),
    deals: site.deals.length,
  };
}

function main(): void {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(resolve(out, 'links'), { recursive: true });
  const ukSlugs = (JSON.parse(readFileSync(resolve(root, 'data/product-slugs.json'), 'utf8')) as { slugs: Record<string, string> }).slugs;
  const now = new Date().toISOString();
  const sources: RegionLinkSource[] = [];
  const live = liveRegions();
  if (live.some((r) => r.id === 'GB')) {
    sources.push({ id: 'GB', slugs: Object.fromEntries(CATALOGUE.map((c) => [c.id, c.slug])), brands: CATALOGUE.map((c) => c.brand) });
  }
  for (const config of live) {
    if (config.id === 'GB') continue;
    const region = regionCodeOf(config);
    const started = Date.now();
    // The UK picture of every product that is the same bottle as a UK product (src/catalogue/regionUkPhotos.ts).
    const site = buildRegionSite(readRegionInputs(root, region), ukSlugs, now, CATALOGUE);
    const dir = resolve(out, config.pathPrefix);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'catalogue.generated.js'), catalogueModule(site));
    writeFileSync(resolve(dir, 'deals.generated.js'), dealsModule(site));
    writeFileSync(resolve(dir, 'dormant.generated.js'), dormantModule(site));
    writeFileSync(resolve(dir, 'priceHistory.generated.js'), priceHistoryModule(site));
    writeFileSync(resolve(dir, 'retailers.js'), retailersModule(region, dir));
    const facts = factsOf(site);
    writeFileSync(resolve(dir, 'site.json'), `${JSON.stringify(facts)}\n`);
    sources.push({ id: region, slugs: facts.ids, brands: site.catalogue.map((c) => c.brand) });
    const multi = site.catalogue.filter((c) => c.shops >= 2).length;
    console.log(
      `dist-demo/regions/${config.pathPrefix}  ${site.catalogue.length} products from ${site.shopCount} shops ` +
        `(${multi} at two or more, ${site.catalogue.length ? ((multi / site.catalogue.length) * 100).toFixed(1) : '0.0'}%), ` +
        `${site.catalogue.filter((c) => c.image).length} with a UK picture, ${site.deals.length} deals, ${Object.keys(site.priceHistory).length} price lines, ` +
        `${Object.keys(site.slugs).length} addresses, prices read ${site.crawledAt}, ${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
  }
  for (const self of sources) {
    const links = regionLinksFor(self, sources);
    writeFileSync(resolve(out, 'links', `${self.id}.json`), JSON.stringify(links));
    const shared = Object.entries(links).map(([id, l]) => `${Object.keys(l!.slugs).length} products and ${l!.brands.length} brands in ${id}`).join(', ');
    console.log(`dist-demo/regions/links/${self.id}.json  ${shared || 'no other live region'}`);
  }
}

// Run as a script, not when a test imports the facts' type.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

/**
 * Write the sitemaps from the routes that actually exist.
 *
 *   npm run sitemap
 *
 * ── One sitemap per region, and an index (public beta, 9 October 2026) ─────
 * demo/sitemap.xml is a sitemap index (robots.txt names it, unchanged) naming
 * demo/sitemap-gb.xml (every UK address, exactly the list the one sitemap held
 * before), demo/sitemap-us.xml and demo/sitemap-in.xml (the region pages,
 * read from scripts/build-region-data.ts's dist-demo/regions/<r>/site.json).
 * An address that exists in more than one region carries its hreflang
 * alternates (en-GB, en-US, en-IN, and x-default for the UK page) as
 * xhtml:link children, which search engines read whatever the page's status:
 * the fixed pages in every region, a product where the same product id is
 * sold, a brand where it is sold. A shop's page is its region's alone.
 *
 * ── Why a sitemap matters more here than on most sites ────────────────────
 * Every in-app path is served by demo/404.html, which is byte-identical to
 * demo/index.html. There is no server-rendered HTML and no crawlable <a href>
 * trail into the deep catalogue: the links are built by script as a reader
 * clicks. So a crawler that does not run the app has no way at all to
 * discover /creed_aventus_100ml, and one that does still has to click
 * its way through twelve thousand tiles to find it.
 *
 * The sitemap is the only complete list of what is here. It is generated from
 * the same catalogue the site renders, so it cannot list a page the site does
 * not have.
 *
 * ── What is deliberately NOT in it ────────────────────────────────────────
 * /search, /settings, /account, /design and the not-found path. Those are
 * marked noindex in demo/head.ts, and a URL that is in the sitemap while
 * asking not to be indexed is a contradiction that search consoles report as
 * an error. The two lists are kept in step by a test.
 *
 * ── lastmod ───────────────────────────────────────────────────────────────
 * Product pages carry the date of the harvest that last wrote a price for
 * them, read from the catalogue itself. That is a real modification date: the
 * page's content is its prices. Pages whose content is code rather than data
 * (about, legal, the lists) carry the date of the last commit that touched
 * the file behind them, read from git. Nothing here is stamped with "today"
 * to look fresh, which is the usual way a sitemap starts lying.
 */
// First, before anything reads the catalogue: the brands and shops the owner
// hid or removed from the developer dashboard are taken out of the data, as
// the page does, so the sitemap never lists a page the site does not show.
import './siteApply.js';
import { SITE_OVERRIDE_ROWS } from '../demo/siteData.js';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGenerated } from './generatedFiles.js';
import { CRAWLED } from '../demo/catalogue.generated.js';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { RETAILERS, enabledRetailers } from '../src/config/retailers.js';
import { slugify } from '../demo/router.js';
import { isProductSlug } from '../src/catalogue/productSlug.js';
import { LEGAL_PAGES, isLegalNoticeId } from '../demo/legal.js';
import { SITE_URL } from '../demo/head.js';
import { CONTENT_PATHS, GUIDES_PATH, HOW_WE_CHECK } from '../demo/guideList.js';
import { existsSync, readFileSync } from 'node:fs';
import { NOTE_GROUP_IDS } from '../src/catalogue/noteGroups.js';
import { liveRegions, regionHasFixedPage, regionPath, type RegionConfig, type RegionId } from '../src/config/regions.js';
import type { RegionSiteFacts } from './build-region-data.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Priority is a hint, not a ranking. Kept coarse and honest. */
interface Entry {
  loc: string;
  lastmod: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
}

/** The last commit date for a path, as YYYY-MM-DD. */
function gitLastModified(path: string): string {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', path], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    return out || today();
  } catch {
    return today();
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The most recent moment any shop's price for this fragrance was read.
 *
 * `fetchedAt` is written by the harvest, so this is when the page's content
 * genuinely last changed hands, not when this script ran.
 */
function lastPriceRead(fragranceId: string): string | null {
  const offers = CRAWLED[fragranceId];
  if (!offers || offers.length === 0) return null;
  let newest = '';
  for (const o of offers) {
    if (typeof o.fetchedAt === 'string' && o.fetchedAt > newest) newest = o.fetchedAt;
  }
  return newest ? newest.slice(0, 10) : null;
}

const appMod = gitLastModified('demo/app.ts');
const entries: Entry[] = [];

// ── The pages that are the same every day ────────────────────────────────
entries.push({ loc: '/', lastmod: appMod, changefreq: 'daily' });
entries.push({ loc: '/brands', lastmod: appMod, changefreq: 'weekly' });
entries.push({ loc: '/retailers', lastmod: gitLastModified('src/config/retailers.ts'), changefreq: 'weekly' });
entries.push({ loc: '/notes', lastmod: appMod, changefreq: 'weekly' });
// The 16 note group pages (docs/NOTES-PAGE-PLAN.md D). Fixed addresses with a
// route page each; single note pages stay out while they answer 404.
const groupsMod = gitLastModified('data/note-groups.json');
for (const id of NOTE_GROUP_IDS) entries.push({ loc: `/notes/group/${id}`, lastmod: groupsMod, changefreq: 'weekly' });
// The Oils and Sets tabs under Explore (docs/GIFT-SETS-AND-OILS-PLAN.md). /gift-sets
// is only the old way in to /sets and is never listed.
entries.push({ loc: '/fragrances', lastmod: appMod, changefreq: 'weekly' });
entries.push({ loc: '/oils', lastmod: appMod, changefreq: 'weekly' });
entries.push({ loc: '/sets', lastmod: appMod, changefreq: 'weekly' });
entries.push({ loc: '/deals', lastmod: today(), changefreq: 'daily' });
entries.push({ loc: '/about', lastmod: gitLastModified('demo/legal.ts'), changefreq: 'monthly' });

// ── The guides, and how prices are collected ─────────────────────────────
// Written pages (demo/guideList.ts, CONTENT_PATHS is the one list of them), dated
// by the file whose words they are, so a guide's date moves when its words do.
const contentFile = (loc: string): string =>
  loc === GUIDES_PATH ? 'demo/guideList.ts' : loc === HOW_WE_CHECK.path ? 'demo/content/methodBody.ts' : 'demo/content/guideBodies.ts';
for (const loc of CONTENT_PATHS) entries.push({ loc, lastmod: gitLastModified(contentFile(loc)), changefreq: 'monthly' });

// ── The Legal Notice, and the legal pages still under /legal ─────────────
// The terms, privacy notice, affiliate disclosure, cookies, refunds and
// contact pages are sections of one page, /about/legal (owner's revamp,
// 2026-10-06). Their old /legal/<id> addresses still open it, but only as a
// way in: they are never listed, so a crawler is offered one address for the
// one page. What is left under /legal is read from the list the site itself
// renders, not a hardcoded list of ids (this file once shipped /legal/cookies
// and /legal/affiliate-disclosure, neither of which existed).
const legalMod = gitLastModified('demo/legal.ts');
entries.push({ loc: '/about/legal', lastmod: legalMod, changefreq: 'monthly' });
// The crawler's own page, which its user agent names (src/catalogue/botIdentity.ts).
entries.push({ loc: '/about/bot', lastmod: gitLastModified('demo/app.ts'), changefreq: 'monthly' });
for (const page of LEGAL_PAGES) {
  if (isLegalNoticeId(page.id)) continue;
  entries.push({ loc: `/legal/${encodeURIComponent(page.id)}`, lastmod: legalMod, changefreq: 'monthly' });
}

// ── Every fragrance the site can actually render ─────────────────────────
// A catalogue built before products had addresses (a crawl that rebuilt it with
// an older copy of the build script) has no slug on its products. Listing them
// would put /undefined in the sitemap, so the build stops here instead: a failed
// build leaves the site on the last good deployment, and the next crawl rebuilds
// the catalogue with the slugs (npm run catalogue:demo).
const unaddressed = DEMO_FRAGRANCES.filter((f) => !isProductSlug(f.slug ?? ''));
if (unaddressed.length > 0) {
  console.error(
    `::error::${unaddressed.length} products have no product address (slug), for example ${unaddressed[0]!.id}. ` +
      'Run npm run catalogue:demo, which gives them one (data/product-slugs.json).',
  );
  process.exit(1);
}
for (const f of DEMO_FRAGRANCES) {
  entries.push({
    // The product's own address, /BRAND_NAME_VOLUME (docs/PRODUCT-URLS.md). The
    // slug is lower case a to z, 0 to 9 and underscores, so it needs no encoding.
    loc: `/${f.slug}`,
    lastmod: lastPriceRead(f.id) ?? appMod,
    changefreq: 'daily',
  });
}

// ── Brands, deduplicated by the slug the router will resolve ─────────────
const brandSlugs = new Set<string>();
for (const f of DEMO_FRAGRANCES) {
  const slug = slugify(f.brand);
  if (slug && !brandSlugs.has(slug)) {
    brandSlugs.add(slug);
    entries.push({ loc: `/brands/${encodeURIComponent(slug)}`, lastmod: appMod, changefreq: 'weekly' });
  }
}

// ── Shops. Only the ones with something on the page ──────────────────────
//
// The test used to be `enabled`, with the reasoning that "a disabled
// retailer's page renders empty and asking a crawler to index an empty page
// wastes its visit and ours". That reasoning is right and the test did not
// implement it: `enabled` is intent, and an enabled shop with no listings
// renders exactly as empty as a disabled one.
//
// Measured 2026-08-25 against the built catalogue: 8 of the 39 enabled shops
// carry no live offer at all — Notino, Boots, The Fragrance Shop, The Perfume
// Shop and Harvey Nichols wait on the metered Apify tiers, while Riiffs,
// Debenhams and Morrisons have no `catalogue` config to walk in the first
// place. Every one of them was in the sitemap, so a fifth of the shop pages
// this site advertised to a crawler had nothing on them.
//
// Asking the catalogue rather than the registry also means a shop needs no
// registry edit to appear or disappear here: the day Debenhams' discovery
// pass starts returning product pages instead of category pages, its page
// enters the sitemap on the next build, and a shop that goes dark leaves it
// the same way.
const shopsWithListings = new Set<string>();
for (const offers of Object.values(CRAWLED)) {
  for (const o of offers) shopsWithListings.add(o.retailerId);
}

for (const r of enabledRetailers()) {
  if (!shopsWithListings.has(r.id)) continue;
  entries.push({
    loc: `/retailers/${encodeURIComponent(r.id)}`,
    lastmod: gitLastModified('src/config/retailers.ts'),
    changefreq: 'daily',
  });
}

// A sitemap may hold 50,000 URLs. Catching the overflow here beats a search
// console rejecting the file silently later.
if (entries.length > 50000) {
  console.error(`::error::sitemap has ${entries.length} URLs, over the 50,000 limit. It needs splitting into an index.`);
  process.exit(1);
}

const seen = new Set<string>();
const unique = entries.filter((e) => (seen.has(e.loc) ? false : (seen.add(e.loc), true)));

// ── The region pages (public beta) ────────────────────────────────────────
// Each live region but the UK, from the facts its page build wrote. The fixed
// pages are the UK's own list, under the region's prefix, except the ones a
// beta region does not offer yet (regionHasFixedPage: Notes, whose shops
// publish no notes, so the tab has nothing on it and is noindex there).
const regionSitemaps: { region: RegionConfig; facts: RegionSiteFacts; entries: Entry[] }[] = [];
for (const region of liveRegions()) {
  if (region.pathPrefix === '') continue;
  const path = resolve(root, 'dist-demo/regions', region.pathPrefix, 'site.json');
  if (!existsSync(path)) {
    console.error(`::error::${path} is missing: run scripts/build-region-data.ts first (npm run demo does).`);
    process.exit(1);
  }
  const facts = JSON.parse(readFileSync(path, 'utf8')) as RegionSiteFacts;
  const day = facts.crawledAt.slice(0, 10);
  const list: Entry[] = [];
  const fixed = unique.filter((e) => !e.loc.startsWith('/brands/') && !e.loc.startsWith('/retailers/') && !isProductSlug(e.loc.slice(1)));
  for (const e of fixed) {
    if (!regionHasFixedPage(region, e.loc)) continue;
    // A Deals page with nothing on it is not offered to a crawler (the region
    // harvest reads no shop's previous price yet, so a region has no deals).
    if (e.loc === '/deals' && facts.deals === 0) continue;
    list.push({ ...e, lastmod: e.loc === '/deals' || e.loc === '/' ? day : e.lastmod });
  }
  for (const p of facts.productPages) list.push({ loc: `/${p.slug}`, lastmod: p.lastmod, changefreq: 'daily' });
  for (const b of facts.brandSlugs) list.push({ loc: `/brands/${encodeURIComponent(b)}`, lastmod: day, changefreq: 'weekly' });
  for (const id of facts.shops) list.push({ loc: `/retailers/${encodeURIComponent(id)}`, lastmod: day, changefreq: 'daily' });
  const regionSeen = new Set<string>();
  regionSitemaps.push({ region, facts, entries: list.filter((e) => (regionSeen.has(e.loc) ? false : (regionSeen.add(e.loc), true))) });
}

// ── hreflang: which regions have each page ────────────────────────────────
// Keyed by what the page is, not by its address: a product by its id (the
// same bottle can have a different address in another region), a brand by its
// slug, a fixed page by its path. A shop page has no alternate.
const ukIdBySlug = new Map(DEMO_FRAGRANCES.map((f) => [f.slug, f.id] as const));
const ukSlugById = new Map(DEMO_FRAGRANCES.map((f) => [f.id, f.slug] as const));
const ukBrands = brandSlugs;
const ukFixed = new Set(unique.map((e) => e.loc).filter((loc) => !loc.startsWith('/brands/') && !loc.startsWith('/retailers/') && !isProductSlug(loc.slice(1))));
type Holder = { id: RegionId; region: RegionConfig; path: string };
const GB = liveRegions().find((r) => r.id === 'GB');

/** The regions that have the same page as `loc` (a fixed page or a brand), each with its path there. */
function holders(loc: string): Holder[] {
  const out: Holder[] = [];
  if (loc.startsWith('/retailers/')) return out;
  if (loc.startsWith('/brands/')) {
    const slug = decodeURIComponent(loc.slice('/brands/'.length));
    if (GB && ukBrands.has(slug)) out.push({ id: 'GB', region: GB, path: loc });
    for (const r of regionSitemaps) if (r.facts.brandSlugs.includes(slug)) out.push({ id: r.region.id, region: r.region, path: loc });
    return out;
  }
  if (GB && ukFixed.has(loc)) out.push({ id: 'GB', region: GB, path: loc });
  for (const r of regionSitemaps) if (r.entries.some((e) => e.loc === loc)) out.push({ id: r.region.id, region: r.region, path: loc });
  return out;
}

/** A url line, with its hreflang alternates when another region has the page too. */
function urlLine(region: RegionConfig, e: Entry, alternates: Holder[]): string {
  const links = alternates.length >= 2
    ? [
        ...alternates.map((h) => `<xhtml:link rel="alternate" hreflang="${h.region.hreflang}" href="${SITE_URL}${regionPath(h.region, h.path)}"/>`),
        ...(alternates.some((h) => h.id === 'GB') ? [`<xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${alternates.find((h) => h.id === 'GB')!.path}"/>`] : []),
      ].join('')
    : '';
  return `  <url><loc>${SITE_URL}${regionPath(region, e.loc)}</loc><lastmod>${e.lastmod}</lastmod><changefreq>${e.changefreq}</changefreq>${links}</url>`;
}

// A product's alternates go by its id: the same bottle may have another address in another region.
const regionSlugToId = new Map(regionSitemaps.map((r) => [r.region.id, new Map(Object.entries(r.facts.ids).map(([id, slug]) => [slug, id] as const))] as const));
function holdersOf(fromId: RegionId, loc: string): Holder[] {
  if (!isProductSlug(loc.slice(1))) return holders(loc);
  const slug = loc.slice(1);
  const id = fromId === 'GB' ? ukIdBySlug.get(slug) : regionSlugToId.get(fromId)?.get(slug);
  if (!id) return [];
  const out: Holder[] = [];
  const uk = ukSlugById.get(id);
  if (GB && uk) out.push({ id: 'GB', region: GB, path: `/${uk}` });
  for (const r of regionSitemaps) {
    const there = r.facts.ids[id];
    if (there) out.push({ id: r.region.id, region: r.region, path: `/${there}` });
  }
  return out;
}

function urlset(region: RegionConfig, list: readonly Entry[]): { xml: string; withAlternates: number } {
  let withAlternates = 0;
  const lines = list.map((e) => {
    const alt = holdersOf(region.id, e.loc);
    if (alt.length >= 2) withAlternates++;
    return urlLine(region, e, alt);
  });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    withAlternates > 0
      ? '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
      : '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...lines,
    '</urlset>',
    '',
  ].join('\n');
  return { xml, withAlternates };
}

const ukRegion = GB ?? liveRegions()[0]!;
const gb = urlset(ukRegion, unique);
writeGenerated(root, 'demo/sitemap-gb.xml', gb.xml);
const written: { file: string; lastmod: string }[] = [{ file: 'sitemap-gb.xml', lastmod: today() }];
for (const r of regionSitemaps) {
  if (r.entries.length > 50000) {
    console.error(`::error::sitemap-${r.region.pathPrefix}.xml has ${r.entries.length} URLs, over the 50,000 limit.`);
    process.exit(1);
  }
  const out = urlset(r.region, r.entries);
  writeGenerated(root, `demo/sitemap-${r.region.pathPrefix}.xml`, out.xml);
  written.push({ file: `sitemap-${r.region.pathPrefix}.xml`, lastmod: r.facts.crawledAt.slice(0, 10) });
  console.log(`demo/sitemap-${r.region.pathPrefix}.xml  ${r.entries.length} URLs  (${r.facts.productPages.length} products, ` +
    `${r.facts.brandSlugs.length} brands, ${r.facts.shops.length} shops; ${out.withAlternates} with hreflang alternates)`);
}
// The index robots.txt names (Sitemap: https://pricesniffs.space/sitemap.xml).
writeGenerated(root, 'demo/sitemap.xml', [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...written.map((w) => `  <sitemap><loc>${SITE_URL}/${w.file}</loc><lastmod>${w.lastmod}</lastmod></sitemap>`),
  '</sitemapindex>',
  '',
].join('\n'));
// The shop figure counts what was actually written, not what is enabled. Those
// were the same number until enabled-but-empty shops stopped being listed, and
// reporting the old one would misstate the file this line is describing.
const listedShops = enabledRetailers().filter((r) => shopsWithListings.has(r.id)).length;
const emptyShops = enabledRetailers().length - listedShops;
console.log(
  `demo/sitemap-gb.xml  ${unique.length} URLs  (${DEMO_FRAGRANCES.length} fragrances, ` +
    `${brandSlugs.size} brands, ${listedShops} shops of ${RETAILERS.length} in the registry` +
    `${emptyShops ? `; ${emptyShops} enabled but carrying no listing, left out` : ''}` +
    `${SITE_OVERRIDE_ROWS.length ? `; ${SITE_OVERRIDE_ROWS.length} hidden or removed in the dashboard, left out` : ''}; ` +
    `${gb.withAlternates} with hreflang alternates)`,
);
console.log(`demo/sitemap.xml  the index: ${written.map((w) => w.file).join(', ')}`);

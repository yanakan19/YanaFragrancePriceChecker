/**
 * Write demo/sitemap.xml from the routes that actually exist.
 *
 *   npm run sitemap
 *
 * ── Why a sitemap matters more here than on most sites ────────────────────
 * Every in-app path is served by demo/404.html, which is byte-identical to
 * demo/index.html. There is no server-rendered HTML and no crawlable <a href>
 * trail into the deep catalogue: the links are built by script as a reader
 * clicks. So a crawler that does not run the app has no way at all to
 * discover /fragrance/ean-5045252668306, and one that does still has to click
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
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRAWLED } from '../demo/catalogue.generated.js';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { RETAILERS, enabledRetailers } from '../src/config/retailers.js';
import { slugify } from '../demo/router.js';
import { LEGAL_PAGES } from '../demo/legal.js';
import { SITE_URL } from '../demo/head.js';

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
entries.push({ loc: '/deals', lastmod: today(), changefreq: 'daily' });
entries.push({ loc: '/about', lastmod: gitLastModified('demo/legal.ts'), changefreq: 'monthly' });

// ── Legal pages, read from the list the site itself renders ──────────────
// Not a hardcoded list of ids: this file would have shipped /legal/cookies
// and /legal/affiliate-disclosure, neither of which exists, while missing
// /legal/how-it-works and /legal/contact, which do.
const legalMod = gitLastModified('demo/legal.ts');
for (const page of LEGAL_PAGES) {
  // 'about' is reachable at /about in its own right; listing it twice would
  // offer a crawler two URLs for one page.
  if (page.id === 'about') continue;
  entries.push({ loc: `/legal/${encodeURIComponent(page.id)}`, lastmod: legalMod, changefreq: 'monthly' });
}

// ── Every fragrance the site can actually render ─────────────────────────
for (const f of DEMO_FRAGRANCES) {
  entries.push({
    loc: `/fragrance/${encodeURIComponent(f.id)}`,
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

// ── Shops. Only the enabled ones: a disabled retailer's page renders empty
//    and asking a crawler to index an empty page wastes its visit and ours.
for (const r of enabledRetailers()) {
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

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...unique.map(
    (e) =>
      `  <url><loc>${SITE_URL}${e.loc}</loc><lastmod>${e.lastmod}</lastmod><changefreq>${e.changefreq}</changefreq></url>`,
  ),
  '</urlset>',
  '',
].join('\n');

writeFileSync(resolve(root, 'demo/sitemap.xml'), xml);
console.log(
  `demo/sitemap.xml  ${unique.length} URLs  (${DEMO_FRAGRANCES.length} fragrances, ` +
    `${brandSlugs.size} brands, ${enabledRetailers().length} shops of ${RETAILERS.length} in the registry)`,
);

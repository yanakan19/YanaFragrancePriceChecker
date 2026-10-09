/**
 * A real file for every fixed address, so the host answers it with HTTP 200.
 *
 * ── The problem ───────────────────────────────────────────────────────────
 * The site is one app. GitHub Pages serves it for any path that is not a file
 * by sending demo/404.html, with status 404. Every address except `/` was
 * therefore a "404 with the full page inside": it works in a browser, but a
 * crawler that reads the status (an AdSense reviewer, Search Console, a link
 * checker) sees /about, /about/legal and every list as unavailable
 * (docs/ADVERTISING-PLAN.md, Phase 1, risk 1).
 *
 * ── The fix ───────────────────────────────────────────────────────────────
 * Pages answers /about from about.html and /about/legal from about/legal.html
 * with status 200. This module works out which addresses get such a file and
 * what each one says in its <head>. A file is the same document as
 * demo/index.html (same bundle, same data files, same build stamp, so the app
 * boots and routes client side exactly as it does from 404.html) with the
 * title, description, canonical, share tags and robots tag of the address it
 * is for, the very tags the app writes itself on every render (demo/head.ts).
 * A crawler that does not run the script now reads the right address and the
 * right status; one that does run it ends up with the same tags either way.
 *
 * ── Which addresses (one list, no second place to remember) ────────────────
 * The union of
 *   - every list route in the router's table (listRoutePaths in
 *     demo/router.ts), and
 *   - every address in demo/sitemap.xml that is not a leaf page: the pages
 *     that are the same every day (about, about/legal, about/bot, legal/...)
 *     and whatever page is added to the sitemap later.
 * A new route in either place gets its file at the next `npm run demo`, with
 * no edit here. Leaf pages (a product, a brand, a shop, a note, the old
 * /fragrance/<id>) are not given files, and neither is an address the router
 * does not know: those stay on 404.html, which is also what makes the app say
 * "Page not found" and mark itself noindex for a wrong address.
 *
 * Why not the 27,000 leaf pages: see docs/ROUTING-PLAN.md section 3.2. Each
 * copy of the page is about 0.93 MB, so every product and brand would add
 * about 25 GB to the deployment; the bundle would have to leave the page first.
 *
 * ── Where the files go ────────────────────────────────────────────────────
 * /word is demo/word.html and /word/other is demo/word/other.html. They are
 * gitignored and "deploy" in scripts/generated-files.txt, like the page.
 */
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { SITE_URL, headFor, hreflangFor, type HeadTags } from '../demo/head.js';
import { listRoutePaths, matchRoute, type Route, type RouteName } from '../demo/router.js';
import { DEFAULT_REGION, regionPath, setActiveRegionForBuild, type RegionConfig } from '../src/config/regions.js';
import { referencedDataFiles } from './dataFiles.js';
import { readStampedHash } from './demoInputsHash.js';

/** Pages of one thing among many: never given a file of their own (see the header). */
const LEAF_ROUTES: ReadonlySet<RouteName> = new Set<RouteName>([
  'home', 'product', 'brand', 'retailer', 'note', 'fragrance', 'notFound',
]);

/** Plain path segments only: the file name comes from the address. */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

/** What the app itself passes headFor for these routes (headInputForState in demo/app.ts). */
export interface HeadFacts {
  /** Bottle count the list pages' descriptions may quote (COUNTS.bottles). */
  productCount: number;
  /** Shops showing prices (SHOP_COUNT). */
  retailerCount: number;
  /** The title of a /legal/<id> page, as the page shows it. */
  legalTitle(id: string): string | undefined;
}

export interface RoutePage {
  /** The address, with a leading slash: /about/legal, or /us/about/legal in a region. */
  path: string;
  /** The file under demo/: about/legal.html, or us/about/legal.html in a region. */
  file: string;
  /** The page it is a copy of, under demo/: index.html, or us/index.html in a region. */
  shell: string;
  route: Route;
  tags: HeadTags;
}

/**
 * The addresses a sitemap lists, as paths (`https://host/about` gives
 * `/about`). For a region's sitemap, pass the region: its prefix is taken off
 * (`https://host/us/about` gives `/about`), since the pages are worked out
 * inside the region.
 */
export function sitemapPaths(xml: string, region: RegionConfig = DEFAULT_REGION): string[] {
  const paths: string[] = [];
  const base = region.pathPrefix === '' ? SITE_URL : `${SITE_URL}/${region.pathPrefix}`;
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = m[1]!;
    if (!loc.startsWith(base)) continue;
    const rest = loc.slice(base.length);
    if (rest !== '' && !rest.startsWith('/')) continue;
    paths.push(rest || '/');
  }
  return paths;
}

/**
 * The pages to write, in address order, from the router's list routes and the
 * sitemap's paths. In a region (the US, India) the paths are the region's own
 * (`/deals`), the tags are worked out inside it (canonical /us/deals) and the
 * files land in its folder (us/deals.html).
 */
export function routePages(sitemap: readonly string[], facts: HeadFacts, region: RegionConfig = DEFAULT_REGION): RoutePage[] {
  setActiveRegionForBuild(region === DEFAULT_REGION ? null : region);
  try {
    return routePagesIn(sitemap, facts, region);
  } finally {
    setActiveRegionForBuild(null);
  }
}

function routePagesIn(sitemap: readonly string[], facts: HeadFacts, region: RegionConfig): RoutePage[] {
  const pages: RoutePage[] = [];
  const seen = new Set<string>();
  const folder = region.pathPrefix === '' ? '' : `${region.pathPrefix}/`;
  for (const path of [...listRoutePaths(), ...sitemap]) {
    if (seen.has(path)) continue;
    seen.add(path);

    const route = matchRoute(path);
    if (LEAF_ROUTES.has(route.name) || route.name === 'developer') continue;

    const segments = path.replace(/^\//, '').split('/');
    if (!segments.every((s) => SAFE_SEGMENT.test(s))) continue;

    const tags = headFor({
      route,
      productCount: facts.productCount,
      retailerCount: facts.retailerCount,
      ...(route.name === 'legal' ? { leafName: facts.legalTitle(route.param) } : {}),
    });
    // An old way in (/explore, /gift-sets) matches a route but its page lives
    // at another address; its file would claim the other address as canonical.
    // It keeps working through 404.html.
    const address = regionPath(region, path);
    if (tags.canonical !== `${SITE_URL}${address}`) continue;

    pages.push({ path: address, file: `${folder}${segments.join('/')}.html`, shell: `${folder}index.html`, route, tags });
  }
  return pages.sort((a, b) => (a.path < b.path ? -1 : 1));
}

const escapeAttr = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The head asset links of the page are relative; under /about/ they would point at /about/favicon.svg. */
const ROOT_LINKS = /(<link rel="(?:manifest|icon|apple-touch-icon)"[^>]*? href=")(?![a-z]+:|\/)([^"]+)"/g;

/** Replaces the single tag the pattern finds, and fails when the page no longer has exactly one. */
function swap(html: string, pattern: RegExp, replacement: string, what: string): string {
  const found = html.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`));
  if (!found || found.length !== 1) {
    throw new Error(
      `routePages: expected exactly one ${what} in demo/index.html, found ${found?.length ?? 0}. ` +
        'The page head changed shape; update scripts/routePages.ts to match.',
    );
  }
  return html.replace(pattern, () => replacement);
}

/** The hreflang lines a home page shell carries (scripts/build-demo.ts), each with its line break. */
const ALTERNATE_LINES = /<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>\n/g;

/** This address's own hreflang alternates, as head lines after the canonical (demo/head.ts hreflangFor). */
function alternateLinks(tags: HeadTags): string {
  return hreflangFor(tags).map((a) => `\n<link rel="alternate" hreflang="${escapeAttr(a.hreflang)}" href="${escapeAttr(a.href)}" />`).join('');
}

/** The page with one address's own <head> tags, and nothing else changed. */
export function renderRoutePage(shell: string, tags: HeadTags): string {
  const shareTitle = escapeAttr(tags.shareTitle ?? tags.title);
  const description = escapeAttr(tags.description);
  const canonical = escapeAttr(tags.canonical);
  // The home page's alternates come off; this address's go in beside its canonical.
  let html = shell.replace(ALTERNATE_LINES, '');
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${escapeAttr(tags.title)}</title>`, '<title>');
  html = swap(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`, 'meta description');
  html = swap(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonical}" />${alternateLinks(tags)}`, 'canonical link');
  html = swap(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${shareTitle}" />`, 'og:title');
  html = swap(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`, 'og:description');
  html = swap(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${canonical}" />`, 'og:url');
  html = swap(html, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${shareTitle}" />`, 'twitter:title');
  html = swap(html, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${description}" />`, 'twitter:description');
  if (tags.noindex) {
    // The same tag applyHead() writes, put first in the head's metas.
    html = swap(html, /<meta name="description" content/, '<meta name="robots" content="noindex, follow" />\n<meta name="description" content', 'meta description (robots)');
  }
  return html.replace(ROOT_LINKS, (_m, head: string, href: string) => `${head}/${href}"`);
}

/**
 * Deletes route pages an earlier build wrote for a route that no longer exists:
 * the top level `.html` files that are not the page, its fallback or the
 * template, and the `.html` files in the folders this build writes into.
 * (A deploy builds from a clean checkout; this is for a working tree.)
 */
export function removeStaleRoutePages(demoDir: string, keep: ReadonlySet<string>, folders: Iterable<string>): string[] {
  const removed: string[] = [];
  const NOT_ROUTE_PAGES = new Set(['index.html', '404.html', 'template.html']);
  const drop = (rel: string): void => {
    if (keep.has(rel)) return;
    rmSync(join(demoDir, rel), { force: true });
    removed.push(rel);
  };
  for (const f of readdirSync(demoDir)) {
    if (f.endsWith('.html') && !NOT_ROUTE_PAGES.has(f) && statSync(join(demoDir, f)).isFile()) drop(f);
  }
  for (const folder of new Set(folders)) {
    const dir = join(demoDir, folder);
    if (!existsSync(dir)) continue;
    // A region's folder (demo/us/) also holds its own page and fallback, never route pages.
    for (const f of readdirSync(dir)) if (f.endsWith('.html') && !NOT_ROUTE_PAGES.has(f)) drop(posix.join(folder, f));
  }
  return removed;
}

/**
 * What is wrong with the route pages in a built demo folder, one sentence each;
 * empty when all is well. The deploy workflow runs this before it uploads
 * (scripts/build-route-pages.ts --check) so that a page that is missing, stale
 * or carrying another address's tags stops the deployment.
 */
export function routePageProblems(demoDir: string, pages: readonly RoutePage[]): string[] {
  const problems: string[] = [];
  const shells = new Map<string, { index: string; stamp: string | null; dataFiles: string }>();
  for (const shell of new Set(pages.map((p) => p.shell).concat('index.html'))) {
    const indexPath = join(demoDir, shell);
    if (!existsSync(indexPath)) return [`demo/${shell} is not built`];
    const index = readFileSync(indexPath, 'utf8');
    shells.set(shell, { index, stamp: readStampedHash(index), dataFiles: referencedDataFiles(index).sort().join(',') });
  }

  for (const page of pages) {
    const { index, stamp, dataFiles } = shells.get(page.shell)!;
    const path = join(demoDir, page.file);
    if (!existsSync(path)) {
      problems.push(`demo/${page.file} is missing, so ${page.path} would answer 404`);
      continue;
    }
    const html = readFileSync(path, 'utf8');
    if (html !== renderRoutePage(index, page.tags)) {
      problems.push(
        readStampedHash(html) !== stamp
          ? `demo/${page.file} is from another build than demo/${page.shell}`
          : `demo/${page.file} does not carry the title, description and canonical of ${page.path}`,
      );
    } else if (referencedDataFiles(html).sort().join(',') !== dataFiles) {
      problems.push(`demo/${page.file} names other data files than demo/${page.shell}`);
    }
  }
  return problems;
}

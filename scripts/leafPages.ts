/**
 * A real page, answering HTTP 200, for each priced UK product, brand, shop and
 * note, as far as the deploy size budget allows (13 Oct 2026; the AdSense
 * application refused that day: docs/ADVERTISING-PLAN.md).
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 * GitHub Pages answers an address with no file of its own from 404.html, with
 * status 404. Every product (/creed_aventus_100ml), brand (/brands/creed) and
 * shop (/retailers/boots) address was such a "404 with the app inside", and
 * <main> was empty until the script ran. The sitemap listed about 35,000 of
 * them. A reviewer or crawler that trusts the status, or does not run the
 * script, saw broken, empty pages.
 *
 * ── The fix ─────────────────────────────────────────────────────────────────
 * Pages serves /<slug> from <slug>.html and /brands/creed from
 * brands/creed.html with status 200, as it already did for the route pages
 * (scripts/routePages.ts). Each file here is demo/index.html (same build
 * stamp, same data files, same code and styles, which since 13 Oct 2026 are
 * files of their own, assets/app.<hash>.js|css, so the page is a few kB) with:
 *   - the address's own head tags (title, description, canonical, og:, no
 *     noindex), the very tags the app writes for it (demo/head.ts headFor,
 *     with the facts demo/app.ts headInputForState gives it);
 *   - for a product, a Product + AggregateOffer JSON-LD block, prices in GBP,
 *     its lowPrice the page's own lowest shown price;
 *   - inside <main>, in place of the home page's static intro, the page's
 *     plain content (scripts/staticContent.ts), which a visitor with
 *     JavaScript never sees painted (html.js hides it) and the app replaces.
 * HTML comments are left out of the body, which the app does not read.
 *
 * ── The budget ──────────────────────────────────────────────────────────────
 * Pages refuses a site over 1 GB. DEPLOY_BUDGET_BYTES (700 MB) is the most the
 * whole deploy output may weigh; the pages are written in order of importance
 * (the shops, the brands, then products by how many shops list them, then the
 * day their price was last read, then the notes with at least
 * NOTE_MIN_FRAGRANCES fragrances) until the next one would not fit.
 * What does not fit keeps opening in the app through 404.html exactly as
 * before, and is left out of the sitemap (scripts/build-sitemap.ts lists only
 * addresses that answer 200). The US and Indian pages are not prerendered: the
 * UK's fill most of the budget (docs/PRODUCT-URLS.md section 7).
 *
 * ── Merged and retired addresses ────────────────────────────────────────────
 * Only a product's current address gets a file. An old address of a merged
 * product (data/id-aliases.json, the slug aliases of the dormant file) never
 * does, so it still reaches 404.html, where the app opens the product it
 * moved to, exactly as before.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { headFor, SITE_URL, type HeadTags } from '../demo/head.js';
import { matchRoute } from '../demo/router.js';
import { BY_POPULARITY, NOTE_INDEX, fragrancesAt, listingCountAt, noteForAddress, type DemoFragrance } from '../demo/data.js';
import { enabledRetailers } from '../src/config/retailers.js';
import { noteSlug } from '../src/catalogue/noteName.js';
import { isProductSlug } from '../src/catalogue/productSlug.js';
import { slugify } from '../demo/router.js';
import { FILES_GLOBAL, SHARED_LOADER, hashedAssetPath, referencedAssetFiles, referencedDataFiles } from './dataFiles.js';
import { readStampedHash } from './demoInputsHash.js';
import { renderRoutePage } from './routePages.js';
import {
  brandPath, brandStaticHtml, esc, jsonLdTag, notePath, noteStaticHtml, productJsonLd, productLeafDetail, productName,
  productPrices, productsWithNote, productStaticHtml, shopPath, shopStaticHtml,
} from './staticContent.js';

/** The most the whole deploy output (the demo/ folder as uploaded) may weigh. Pages' hard limit is 1 GB. */
export const DEPLOY_BUDGET_BYTES = 700 * 1024 * 1024;

/** The most one prerendered page may weigh (a product page is about 10 to 20 kB). */
export const LEAF_PAGE_MAX_BYTES = 48 * 1024;

/** Held back for what is written after the pages: the route pages and the sitemaps, with room to spare. */
export const LATER_FILES_RESERVE_BYTES = 40 * 1024 * 1024;

/**
 * A single note's page is written only when at least this many fragrances
 * list the note: 627 of 4,696 notes on 13 Oct 2026. The rest are a line or two
 * each, the thin pages a review reads as low value (docs/ADVERTISING-PLAN.md,
 * risk 2); they keep opening in the app and stay out of the sitemap, as all
 * single note pages were until now.
 */
export const NOTE_MIN_FRAGRANCES = 10;

/** What build-leaf-pages.ts wrote, for the sitemap and the checks (dist-demo is scratch, never deployed). */
export const LEAF_MANIFEST = 'dist-demo/leaf-pages.json';

export type LeafKind = 'shop' | 'brand' | 'product' | 'note';

export interface LeafPage {
  kind: LeafKind;
  /** The address: /creed_aventus_100ml, /brands/creed, /retailers/boots, /notes/vanilla. */
  path: string;
  /** The file under demo/: creed_aventus_100ml.html, brands/creed.html. */
  file: string;
}

export interface LeafCandidate extends LeafPage {
  tags: HeadTags;
  /** The page's static <main> content and, for a product, its JSON-LD tag. */
  render(): { main: string; head: string };
}

export interface LeafManifest {
  budgetBytes: number;
  /** Bytes of the pages written. */
  bytes: number;
  pages: LeafPage[];
  /** How many of each kind were left out for the budget. */
  skipped: Record<LeafKind, number>;
  /** How many of each kind there were to write. */
  candidates: Record<LeafKind, number>;
  /** The shared boot file every page loads (assets/boot.<hash>.js), written beside the pages. */
  boot?: string;
}

/** Plain path segments only: the file name comes from the address. */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

function tagsFor(path: string, input: Omit<Parameters<typeof headFor>[0], 'route'>): HeadTags | null {
  const route = matchRoute(path);
  const tags = headFor({ route, ...input });
  // Only a page whose own canonical is this address: anything else is a way in to another page.
  return tags.canonical === `${SITE_URL}${path}` && !tags.noindex ? tags : null;
}

/** Newest price read of a product, as an ISO time ('' when none). */
function newestRead(f: DemoFragrance, rows: ReturnType<typeof productPrices>['rows']): string {
  let newest = '';
  for (const r of rows) if (r.fetchedAt > newest) newest = r.fetchedAt;
  void f;
  return newest;
}

/**
 * Every page there is to write, most important first: the shops, the brands,
 * every priced product (most shops first, then the most recently read price,
 * then the address), then the notes. `priced` is filled as products are
 * listed, so a list page links a product only where that product has a page.
 */
export function leafCandidates(now: Date = new Date()): { candidates: LeafCandidate[]; isPriced: (slug: string) => boolean } {
  const pricedSlugs = new Set<string>();
  const isPriced = (slug: string): boolean => pricedSlugs.has(slug);

  // Products first, to know which are priced; listed after the shops and brands.
  const products: { f: DemoFragrance; prices: ReturnType<typeof productPrices>; read: string }[] = [];
  for (const f of BY_POPULARITY) {
    if (!isProductSlug(f.slug)) continue;
    const prices = productPrices(f, now);
    if (prices.lowest === null) continue;
    products.push({ f, prices, read: newestRead(f, prices.rows) });
  }
  products.sort((a, b) => b.prices.shops - a.prices.shops || (a.read < b.read ? 1 : a.read > b.read ? -1 : 0) || (a.f.slug < b.f.slug ? -1 : 1));
  for (const p of products) pricedSlugs.add(p.f.slug);

  const out: LeafCandidate[] = [];

  for (const r of enabledRetailers()) {
    const count = listingCountAt(r.id);
    if (count === 0 || !SAFE_SEGMENT.test(r.id)) continue;
    const path = shopPath(r.id);
    const tags = tagsFor(path, { leafName: r.name, leafDetail: `${count.toLocaleString('en-GB')} bottles`, leafEmpty: false });
    if (!tags) continue;
    out.push({ kind: 'shop', path, file: `retailers/${r.id}.html`, tags, render: () => ({ main: shopStaticHtml(r, fragrancesAt(r.id), isPriced), head: '' }) });
  }

  const brands = new Map<string, { name: string; products: DemoFragrance[] }>();
  for (const f of BY_POPULARITY) {
    const slug = slugify(f.brand);
    if (!slug) continue;
    const b = brands.get(slug) ?? { name: f.brand, products: [] };
    b.products.push(f);
    brands.set(slug, b);
  }
  for (const [slug, b] of [...brands].sort((x, y) => y[1].products.length - x[1].products.length || (x[0] < y[0] ? -1 : 1))) {
    if (!SAFE_SEGMENT.test(slug)) continue;
    const path = brandPath(b.name);
    const tags = tagsFor(path, { leafName: b.name, leafDetail: `${b.products.length} in the catalogue` });
    if (!tags) continue;
    out.push({ kind: 'brand', path, file: `brands/${slug}.html`, tags, render: () => ({ main: brandStaticHtml(b.name, b.products, isPriced, now), head: '' }) });
  }

  for (const { f, prices } of products) {
    const path = `/${f.slug}`;
    const tags = tagsFor(path, { leafName: productName(f), leafDetail: productLeafDetail(prices) });
    if (!tags) continue;
    out.push({
      kind: 'product', path, file: `${f.slug}.html`, tags,
      render: () => {
        const ld = productJsonLd(f, prices, tags.canonical);
        return { main: productStaticHtml(f, prices), head: ld ? jsonLdTag(ld, tags.canonical) : '' };
      },
    });
  }

  for (const n of [...NOTE_INDEX].sort((a, b) => b.count - a.count || (a.sort < b.sort ? -1 : 1))) {
    const slug = noteSlug(n.name);
    if (!SAFE_SEGMENT.test(slug) || slug === 'group' || noteForAddress(slug) !== n.name) continue;
    const list = productsWithNote(n.name);
    if (list.length < NOTE_MIN_FRAGRANCES) continue;
    const path = notePath(n.name);
    const tags = tagsFor(path, { leafName: n.name, leafDetail: `${list.length.toLocaleString('en-GB')} of them` });
    if (!tags) continue;
    out.push({ kind: 'note', path, file: `notes/${slug}.html`, tags, render: () => ({ main: noteStaticHtml(n.name, list, isPriced, now), head: '' }) });
  }
  return { candidates: out, isPriced };
}

/** The home page's static intro section, which a leaf page's content replaces. */
const STATIC_SECTION = /<section class="static-intro"[\s\S]*?<\/section>/g;

/** Where the document proper starts: the build stamp comment before it stays (scripts/demoInputsHash.ts). */
const DOC_START = '<html';

/**
 * The page without the comments the template and the inline scripts carry for
 * whoever reads the source (about 6 kB a page, 200 MB over every page): HTML
 * comments after the build stamp, and whole line // comments inside the inline
 * scripts (never the JSON-LD). Nothing the browser runs or shows changes.
 */
function withoutComments(html: string): string {
  const at = html.indexOf(DOC_START);
  if (at < 0) throw new Error('leafPages: demo/index.html has no <html> tag');
  const body = html
    .slice(at)
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/(<script>)([\s\S]*?)(<\/script>)/g, (_m, open: string, code: string, close: string) => `${open}${code.replace(/^[ \t]*\/\/.*\n/gm, '')}${close}`);
  return html.slice(0, at) + body;
}

/**
 * ── The shared boot (21 Oct 2026) ───────────────────────────────────────────
 * The home page's shell carries about 5 kB of inline script that is the same
 * on every page: the region hand off, the data loader, the live list (in the
 * deploy build), the two early class scripts and the service worker
 * registration. Repeated in 35,000 pages that was 190 MB of the 617 MB the
 * deploy weighed on 21 Oct (the live list alone was 40 MB, which is why a
 * local build measured 579 MB and the deploy 617 MB). A leaf page keeps only
 * its own two file lists (inline, so the page still names every data file for
 * the service worker) and loads the rest as one shared file,
 * assets/boot.<hash>.js, in the same place in the head, so it runs before
 * anything is drawn exactly as the inline scripts did.
 */
const HEAD_SCRIPTS = /((?:<script>[\s\S]*?<\/script>\n)+)(?=<title>)/;
const EARLY_SCRIPTS = /<script>document\.documentElement\.classList\.add\('js'\)<\/script>\n|<script>\(function\(\)\{var d=document\.documentElement,m=null[\s\S]*?<\/script>\n/g;
const WORKER_SCRIPT = /<script>\n(?: {2}\/\/[^\n]*\n)* {2}if \('serviceWorker' in navigator\) \{[\s\S]*?<\/script>\n/;
const LOADER_LISTS = /^\(function \(\) \{\n {2}var files = (.+);\n {2}var lazy = (.+);\n/;

/** Run if the shared boot cannot load: reload once (a page older than the deploy), then show the plain content. */
const BOOT_ERROR = `sessionStorage.getItem('pricesniffs.dataReload')||(sessionStorage.setItem('pricesniffs.dataReload','1'),location.reload())`;

export interface BootSplit {
  /** The shell with its inline scripts replaced by the page's own file lists and one script tag for the shared file. */
  shell: string;
  /** The shared file's code. */
  code: string;
  /** Its published path: assets/boot.<hash>.js. */
  asset: string;
}

/** Splits the shared inline scripts out of the built home page. Throws when the shell is not shaped as expected. */
export function splitBoot(shell: string): BootSplit {
  const head = HEAD_SCRIPTS.exec(shell);
  if (!head) throw new Error('leafPages: no inline scripts before <title> in demo/index.html');
  const parts: string[] = [];
  let lists = '';
  let sawLoader = false;
  for (const m of head[1]!.matchAll(/<script>([\s\S]*?)<\/script>\n/g)) {
    const code = m[1]!;
    const l = LOADER_LISTS.exec(code);
    if (l) {
      if (sawLoader) throw new Error('leafPages: two data loaders in demo/index.html');
      sawLoader = true;
      if (code.slice(l[0].length) !== SHARED_LOADER.slice(SHARED_LOADER.indexOf('  var path = location.pathname;'))) {
        throw new Error('leafPages: the data loader in demo/index.html is not the one scripts/dataFiles.ts SHARED_LOADER is built from');
      }
      lists = `<script>window.${FILES_GLOBAL}=[${l[1]},${l[2]}]</script>\n`;
      parts.push(SHARED_LOADER);
    } else {
      parts.push(code);
    }
  }
  if (!sawLoader) throw new Error('leafPages: no data loader in demo/index.html');
  let html = shell.replace(HEAD_SCRIPTS, () => '@@BOOT@@');
  const early = [...html.matchAll(EARLY_SCRIPTS)].map((m) => m[0]);
  if (early.length !== 2) throw new Error(`leafPages: expected the two early class scripts in demo/index.html, found ${early.length}`);
  for (const e of early) parts.push(e.replace(/^<script>|<\/script>\n$/g, ''));
  html = html.replace(EARLY_SCRIPTS, () => '');
  const worker = WORKER_SCRIPT.exec(html);
  if (!worker) throw new Error('leafPages: no service worker registration in demo/index.html');
  parts.push(worker[0].replace(/^<script>\n|<\/script>\n$/g, ''));
  html = html.replace(WORKER_SCRIPT, () => '');
  const code = `${parts.join(';\n')}\n`;
  const asset = hashedAssetPath('boot', 'js', code);
  html = html.replace('@@BOOT@@', () => `${lists}<script src="/${asset}" onerror="${BOOT_ERROR}"></script>\n`);
  return { shell: html, code, asset };
}

/** Deletes the boot files of earlier builds from an assets folder. */
export function staleBootFiles(assetsDir: string, keep: string): string[] {
  if (!existsSync(assetsDir)) return [];
  return readdirSync(assetsDir).filter((f) => /^boot\.[0-9a-f]{16}\.js$/.test(f) && `assets/${f}` !== keep);
}

/** A page from the built home page, with the address's own tags and content. */
export function renderLeafPage(shell: string, tags: HeadTags, content: { main: string; head: string }, options: { subnav?: boolean } = {}): string {
  let html = renderRoutePage(shell, tags, { alternates: false });
  // The app shows the Explore tabs over a brand, shop or note page: the
  // stylesheet keeps their room while it starts (demo/template.html, .subnav).
  if (options.subnav) html = html.replace(/<html lang="([^"]+)">/, (_m, lang: string) => `<html lang="${lang}" data-subnav>`);
  const sections = html.match(STATIC_SECTION);
  if (!sections || sections.length !== 1) throw new Error(`leafPages: expected one <section class="static-intro"> in demo/index.html, found ${sections?.length ?? 0}`);
  html = html.replace(STATIC_SECTION, () => content.main);
  if (content.head) {
    const canonical = `<link rel="canonical" href="${esc(tags.canonical)}" />`;
    if (!html.includes(canonical)) throw new Error('leafPages: the canonical link is missing');
    html = html.replace(canonical, () => `${canonical}\n${content.head}`);
  }
  return withoutComments(html);
}

/** Every file of the deploy output and its size: the demo/ folder, without dotfiles and the .ts sources the deploy leaves out. */
export function deployFiles(demoDir: string): { rel: string; bytes: number }[] {
  const out: { rel: string; bytes: number }[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const full = join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = statSync(full);
      if (st.isDirectory()) walk(full, r);
      else if (!name.endsWith('.ts')) out.push({ rel: r, bytes: st.size });
    }
  };
  walk(demoDir, '');
  return out;
}

export const deployBytes = (demoDir: string): number => deployFiles(demoDir).reduce((n, f) => n + f.bytes, 0);

/** True for a file a later build step writes (a route page or a sitemap) or this one writes (a leaf page). */
export function isPageOrSitemap(rel: string): boolean {
  if (/^sitemap.*\.xml$/.test(rel)) return true;
  if (!rel.endsWith('.html')) return false;
  const base = rel.split('/').pop()!;
  return base !== 'index.html' && base !== '404.html' && base !== 'template.html';
}

/** The leaf pages an earlier build left that this one did not write. */
export function staleLeafFiles(demoDir: string, keep: ReadonlySet<string>): string[] {
  const stale: string[] = [];
  for (const f of readdirSync(demoDir)) {
    if (f.endsWith('.html') && isProductSlug(f.slice(0, -5)) && !keep.has(f)) stale.push(f);
  }
  for (const folder of ['brands', 'retailers', 'notes']) {
    const dir = join(demoDir, folder);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const rel = `${folder}/${f}`;
      if (f.endsWith('.html') && statSync(join(dir, f)).isFile() && !keep.has(rel)) stale.push(rel);
    }
  }
  return stale;
}

/** The file Pages answers an address of this site from, relative to demo/: / is index.html, /a/b is a/b.html, /us/ is us/index.html. */
export function fileForAddress(loc: string): string | null {
  if (!loc.startsWith(SITE_URL)) return null;
  const path = decodeURIComponent(loc.slice(SITE_URL.length) || '/');
  if (path.endsWith('/')) return `${path.slice(1)}index.html`;
  return `${path.slice(1)}.html`;
}

/** Every address the sitemaps list (the index and the files it names). */
export function sitemapAddresses(demoDir: string): { file: string; locs: string[] }[] {
  const index = readFileSync(join(demoDir, 'sitemap.xml'), 'utf8');
  const out: { file: string; locs: string[] }[] = [];
  for (const m of index.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const name = m[1]!.slice(SITE_URL.length + 1);
    const xml = readFileSync(join(demoDir, name), 'utf8');
    out.push({ file: name, locs: [...xml.matchAll(/<url><loc>([^<]+)<\/loc>/g)].map((x) => x[1]!) });
  }
  return out;
}

/** Sitemap addresses that would not answer 200: no file of their own on the host. Empty when all is well. */
export function sitemapProblems(demoDir: string): string[] {
  const problems: string[] = [];
  for (const { file, locs } of sitemapAddresses(demoDir)) {
    const missing = locs.filter((loc) => {
      const f = fileForAddress(loc);
      return f === null || !existsSync(join(demoDir, f));
    });
    if (missing.length) problems.push(`${file} lists ${missing.length} address(es) with no file, which answer 404: ${missing.slice(0, 5).join(' ')}`);
  }
  return problems;
}

/** Reads a page's JSON-LD blocks, parsed. Throws on one that does not parse. */
export function jsonLdOf(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!) as Record<string, unknown>);
}

/** What is wrong with one prerendered page, one sentence each. */
export function leafPageProblems(page: LeafPage, html: string, shell: { stamp: string | null; files: string }): string[] {
  const p: string[] = [];
  const where = `demo/${page.file} (${page.path})`;
  const size = Buffer.byteLength(html);
  if (size > LEAF_PAGE_MAX_BYTES) p.push(`${where} is ${(size / 1024).toFixed(1)} kB, over the ${LEAF_PAGE_MAX_BYTES / 1024} kB cap`);
  if (/<meta name="robots" content="[^"]*noindex/.test(html)) p.push(`${where} is marked noindex`);
  const h1 = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1 !== 1) p.push(`${where} has ${h1} <h1>, not one`);
  const canonical = /<link rel="canonical" href="([^"]+)" \/>/.exec(html)?.[1];
  if (canonical !== `${SITE_URL}${page.path}`) p.push(`${where} has canonical ${canonical ?? 'none'}`);
  if (readStampedHash(html) !== shell.stamp) p.push(`${where} is from another build than demo/index.html`);
  if ([...referencedDataFiles(html), ...referencedAssetFiles(html)].sort().join(',') !== shell.files) p.push(`${where} names other data or code files than demo/index.html`);
  if (page.kind === 'product') {
    let ld: Record<string, unknown>[] = [];
    try {
      ld = jsonLdOf(html);
    } catch {
      p.push(`${where} has JSON-LD that does not parse`);
    }
    const product = ld.find((x) => x['@type'] === 'Product');
    const offers = product?.offers as { lowPrice?: string; priceCurrency?: string } | undefined;
    const shown = /data-ps-lowest="([\d.]+)"/.exec(html)?.[1];
    if (!product || !offers) p.push(`${where} has no Product JSON-LD with offers`);
    else if (offers.priceCurrency !== 'GBP') p.push(`${where} JSON-LD is not in GBP`);
    else if (shown === undefined || Number(offers.lowPrice) !== Number(shown)) p.push(`${where} JSON-LD lowPrice ${offers.lowPrice} is not the lowest price the page shows (${shown ?? 'none'})`);
  }
  return p;
}

/** Everything wrong with the prerendered pages and the deploy output; empty when all is well. The deploy runs this. */
export function leafProblems(demoDir: string, manifest: LeafManifest): string[] {
  const problems: string[] = [];
  const index = readFileSync(join(demoDir, 'index.html'), 'utf8');
  // A page names the same data and code files as the home page, plus the shared boot file (the loader's code) in place of the home page's inline one.
  const boot = manifest.boot;
  const shell = { stamp: readStampedHash(index), files: [...referencedDataFiles(index), ...referencedAssetFiles(index), ...(boot ? [boot] : [])].sort().join(',') };
  if (boot) {
    const bootPath = join(demoDir, boot);
    if (!existsSync(bootPath)) problems.push(`demo/${boot} is missing, so no prerendered page would start`);
    else if (!readFileSync(bootPath, 'utf8').includes('__psReady')) problems.push(`demo/${boot} holds no data loader`);
  }
  for (const page of manifest.pages) {
    const path = join(demoDir, page.file);
    if (!existsSync(path)) {
      problems.push(`demo/${page.file} is missing, so ${page.path} would answer 404`);
      continue;
    }
    problems.push(...leafPageProblems(page, readFileSync(path, 'utf8'), shell));
  }
  const total = deployBytes(demoDir);
  if (total > DEPLOY_BUDGET_BYTES) problems.push(`the deploy output is ${(total / 1024 / 1024).toFixed(0)} MB, over the ${DEPLOY_BUDGET_BYTES / 1024 / 1024} MB budget`);
  return problems;
}

export { productName };

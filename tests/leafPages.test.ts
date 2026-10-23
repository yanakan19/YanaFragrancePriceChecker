import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEPLOY_BUDGET_BYTES, LEAF_MANIFEST, LEAF_PAGE_MAX_BYTES, NOTE_MIN_FRAGRANCES, deployBytes, fileForAddress, isPageOrSitemap,
  jsonLdOf, leafPageProblems, leafProblems, renderLeafPage, sitemapAddresses, sitemapProblems, splitBoot, type LeafManifest,
} from '../scripts/leafPages.js';
import { loaderScript } from '../scripts/dataFiles.js';
import { siteHeadScript } from '../scripts/siteBuild.js';
import { SITE_URL } from '../demo/head.js';
import { readStampedHash } from '../scripts/demoInputsHash.js';
import { isProductSlug } from '../src/catalogue/productSlug.js';
import { liveRegions } from '../src/config/regions.js';

/**
 * A real page, answering 200, for each priced UK product, brand, shop and
 * note, as far as the deploy budget allows, and a sitemap that lists only
 * addresses that answer 200 (scripts/leafPages.ts; docs/PRODUCT-URLS.md
 * section 7; the AdSense refusal of 13 Oct 2026). These are rules over
 * whatever the last build wrote: no count, price, product or shop is pinned.
 * The pages in a browser, with and without JavaScript, are
 * tests/leafPagesBrowser.test.ts.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demo = resolve(root, 'demo');
const built = existsSync(resolve(demo, 'index.html')) && existsSync(resolve(root, LEAF_MANIFEST));
const manifest = (): LeafManifest => JSON.parse(readFileSync(resolve(root, LEAF_MANIFEST), 'utf8')) as LeafManifest;

describe('the rules, on a made up page', () => {
  const shell = [
    '<!doctype html>',
    '<!-- demo-build-hash sha256:abc -->',
    '<html lang="en-GB">',
    '<head>',
    '<meta name="description" content="x" />',
    '<link rel="canonical" href="https://pricesniffs.space/" />',
    '<link rel="alternate" hreflang="en-GB" href="https://pricesniffs.space/" />',
    '<meta property="og:title" content="x" />',
    '<meta property="og:description" content="x" />',
    '<meta property="og:url" content="x" />',
    '<meta name="twitter:title" content="x" />',
    '<meta name="twitter:description" content="x" />',
    '<script>(function () {',
    '  // a comment for the reader',
    '  var a = 1;',
    '})();</script>',
    '<title>PriceSniffs</title>',
    '<!-- a template comment -->',
    '<a class="skip-link" href="#view">Skip</a>',
    '<main id="view"><section class="static-intro" aria-labelledby="t"><h1 id="t">Home</h1></section></main>',
    '</html>',
  ].join('\n');
  const tags = { title: 'PriceSniffs: X', description: 'About X.', canonical: `${SITE_URL}/x_y_100ml`, noindex: false };

  it('puts the address\'s own tags and content in the home page, keeps the build stamp and drops the comments', () => {
    const html = renderLeafPage(shell, tags, { main: '<section class="static-intro"><h1>X</h1></section>', head: '<script type="application/ld+json" data-page="x">{}</script>' });
    expect(html).toContain('<!-- demo-build-hash sha256:abc -->');
    expect(html).not.toContain('a template comment');
    expect(html).not.toContain('a comment for the reader');
    expect(html).toContain('var a = 1;');
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/x_y_100ml" />\n<script type="application/ld+json"`);
    expect(html).not.toContain('hreflang');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('<title>PriceSniffs: X</title>');
  });

  it('marks a list page so the Explore tabs keep their room while the app starts', () => {
    expect(renderLeafPage(shell, tags, { main: '<h1>X</h1>', head: '' }, { subnav: true })).toContain('<html lang="en-GB" data-subnav>');
    expect(renderLeafPage(shell, tags, { main: '<h1>X</h1>', head: '' })).toContain('<html lang="en-GB">');
  });

  it('finds what is wrong with a page: noindex, no H1 or two, another canonical, JSON-LD that disagrees with the page', () => {
    const page = { kind: 'product' as const, path: '/x_y_100ml', file: 'x_y_100ml.html' };
    const ok = `<!-- demo-build-hash sha256:abc -->
<link rel="canonical" href="${SITE_URL}/x_y_100ml" />
<script type="application/ld+json" data-page="x">{"@type":"Product","offers":{"@type":"AggregateOffer","priceCurrency":"GBP","lowPrice":"12.50"}}</script>
<h1>X</h1><p data-ps-lowest="12.50">£12.50</p>`;
    const shellFacts = { stamp: readStampedHash(ok), files: '' };
    expect(leafPageProblems(page, ok, shellFacts)).toEqual([]);
    expect(leafPageProblems(page, ok.replace('<h1>X</h1>', ''), shellFacts).join()).toMatch(/0 <h1>/);
    expect(leafPageProblems(page, `${ok}<h1>Y</h1>`, shellFacts).join()).toMatch(/2 <h1>/);
    expect(leafPageProblems(page, `<meta name="robots" content="noindex, follow" />${ok}`, shellFacts).join()).toMatch(/noindex/);
    expect(leafPageProblems(page, ok.replace(`${SITE_URL}/x_y_100ml`, `${SITE_URL}/`), shellFacts).join()).toMatch(/canonical/);
    expect(leafPageProblems(page, ok.replace('"lowPrice":"12.50"', '"lowPrice":"11.00"'), shellFacts).join()).toMatch(/lowPrice/);
    expect(leafPageProblems(page, ok.replace('{"@type"', '{"@type":'), shellFacts).join()).toMatch(/does not parse|no Product/);
    expect(leafPageProblems(page, ok + 'x'.repeat(LEAF_PAGE_MAX_BYTES), shellFacts).join()).toMatch(/cap/);
  });

  it('maps an address to the file the host answers it from', () => {
    expect(fileForAddress(`${SITE_URL}/`)).toBe('index.html');
    expect(fileForAddress(`${SITE_URL}/us/`)).toBe('us/index.html');
    expect(fileForAddress(`${SITE_URL}/about/legal`)).toBe('about/legal.html');
    expect(fileForAddress(`${SITE_URL}/brands/creed`)).toBe('brands/creed.html');
    expect(fileForAddress('https://example.com/x')).toBeNull();
  });

  it('counts the route pages and sitemaps as written later, never the page, its fallback or the data', () => {
    expect(isPageOrSitemap('about.html')).toBe(true);
    expect(isPageOrSitemap('brands/creed.html')).toBe(true);
    expect(isPageOrSitemap('sitemap-gb.xml')).toBe(true);
    expect(isPageOrSitemap('index.html')).toBe(false);
    expect(isPageOrSitemap('us/404.html')).toBe(false);
    expect(isPageOrSitemap('data/catalogue.0123456789abcdef.json')).toBe(false);
  });

  it('keeps the budget in one constant, under the host\'s 1 GB limit with room to grow', () => {
    expect(DEPLOY_BUDGET_BYTES).toBeLessThanOrEqual(700 * 1024 * 1024);
    expect(LEAF_PAGE_MAX_BYTES).toBeLessThanOrEqual(64 * 1024);
    expect(NOTE_MIN_FRAGRANCES).toBeGreaterThan(1);
  });
});

describe('the shared boot', () => {
  const loader = loaderScript([{ path: 'data/catalogue.0123456789abcdef.json', start: 0 }, { path: 'data/deals.0123456789abcdef.json', start: 5 }], [{ name: 'notes', path: 'data/notes.0123456789abcdef.json' }]);
  const site = siteHeadScript({ stats: true, overrides: [], source: 'file' });
  const early = [
    "<script>document.documentElement.classList.add('js')</script>",
    '<!-- a comment between them -->',
    "<script>(function(){var d=document.documentElement,m=null,l=null;d.setAttribute('data-layout',l)})()</script>",
  ].join('\n');
  const worker = "<script>\n  // register it\n  if ('serviceWorker' in navigator) {\n    window.addEventListener('load', () => { Promise.resolve(window.__psReady); });\n  }\n</script>";
  const shell = [
    '<head>',
    '<script>window.__psRegion = 1;</script>',
    `<script>${loader}</script>`,
    `<script>${site}</script>`,
    '<title>PriceSniffs</title>',
    early,
    '<link rel="stylesheet" href="/assets/app.0123456789abcdef.css" />',
    '<main id="view"><section class="static-intro"><h1>Home</h1></section></main>',
    '<script src="/assets/app.0123456789abcdef.js"></script>',
    worker,
    '</html>',
    '',
  ].join('\n');

  it('moves the scripts every page repeats into one file named for its bytes, in their order, and keeps the page\'s own file lists inline', () => {
    const split = splitBoot(shell);
    expect(split.asset).toMatch(/^assets\/boot\.[0-9a-f]{16}\.js$/);
    expect(split.shell).toContain(`<script src="/${split.asset}"`);
    expect(split.shell).toContain('<script>window.__psFiles=[[["data/catalogue.0123456789abcdef.json",0],["data/deals.0123456789abcdef.json",5]],{"notes":"data/notes.0123456789abcdef.json"}]</script>');
    for (const gone of ['__psRegion', 'new Promise', '__psSite', "classList.add('js')", 'data-layout', "'serviceWorker'"]) expect(split.shell, gone).not.toContain(gone);
    const order = ['__psRegion', 'window.__psFiles', '__psSite', "classList.add('js')", 'data-layout', "'serviceWorker'"].map((t) => split.code.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(split.shell).toContain('<title>PriceSniffs</title>');
    expect(split.shell).toContain('<script src="/assets/app.0123456789abcdef.js"></script>');
  });

  it('is still a script that parses, and its loader waits for the same data as the inline one', () => {
    const { code } = splitBoot(shell);
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain('window.__psReady = Promise.all(files.map');
  });

  it('refuses a shell it does not understand instead of writing pages that never start', () => {
    expect(() => splitBoot(shell.replace(`<script>${loader}</script>`, ''))).toThrow(/no data loader/);
    expect(() => splitBoot(shell.replace(worker, ''))).toThrow(/service worker/);
    expect(() => splitBoot(shell.replace("<script>document.documentElement.classList.add('js')</script>\n", ''))).toThrow(/early class scripts/);
  });
});

describe.skipIf(!built)('the built site', () => {
  it('lists in its sitemaps only addresses that have a file of their own, so each answers 200', () => {
    expect(sitemapProblems(demo)).toEqual([]);
  });

  it('lists every prerendered page in the UK sitemap, and no address of a product without one', () => {
    const listed = new Set(sitemapAddresses(demo).flatMap((s) => s.locs).map((l) => l.slice(SITE_URL.length)));
    const pages = manifest().pages;
    expect(pages.filter((p) => !listed.has(p.path)).map((p) => p.path)).toEqual([]);
    const written = new Set(pages.map((p) => p.path));
    expect([...listed].filter((p) => isProductSlug(p.slice(1)) && !written.has(p))).toEqual([]);
  });

  it('has every prerendered page well formed: one H1, its own canonical, no noindex, under the size cap, the same build, and for a product JSON-LD whose lowest price is the page\'s', () => {
    const problems = leafProblems(demo, manifest());
    expect(problems.slice(0, 20)).toEqual([]);
  }, 300_000);

  it('repeats no script in the pages: each carries its file lists and one tag for the shared boot, not the loader, the region hand off or the live list', () => {
    const m = manifest();
    expect(m.boot).toMatch(/^assets\/boot\.[0-9a-f]{16}\.js$/);
    // The UK's boot file and one for each region (scripts/build-region-leaf-pages.ts).
    const boots = new Set([m.boot!.slice('assets/'.length)]);
    for (const r of liveRegions().filter((x) => x.pathPrefix !== '')) {
      const regionManifest = resolve(root, 'dist-demo/regions', r.pathPrefix, 'leaf-pages.json');
      if (existsSync(regionManifest)) boots.add((JSON.parse(readFileSync(regionManifest, 'utf8')) as { boot: string }).boot.slice('assets/'.length));
    }
    expect(readdirSync(resolve(demo, 'assets')).filter((f) => f.startsWith('boot.')).sort()).toEqual([...boots].sort());
    for (const p of m.pages.filter((_, i) => i % 97 === 0)) {
      const html = readFileSync(resolve(demo, p.file), 'utf8');
      const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]!).join('');
      expect(html, p.path).toContain(`<script src="/${m.boot}"`);
      expect(inline.length, p.path).toBeLessThan(1500);
      expect(html, p.path).not.toContain('window.__psReady');
    }
  });

  it('keeps the whole deploy output inside its budget', () => {
    const bytes = deployBytes(demo);
    expect(bytes, `${(bytes / 1024 / 1024).toFixed(0)} MB`).toBeLessThanOrEqual(DEPLOY_BUDGET_BYTES);
  });

  it('writes the shops and brands before any product, and the products in order of how many shops list them', () => {
    const m = manifest();
    const kinds = m.pages.map((p) => p.kind);
    const firstProduct = kinds.indexOf('product');
    expect(kinds.slice(0, Math.max(0, firstProduct)).every((k) => k === 'shop' || k === 'brand')).toBe(true);
    // Whatever was skipped for the budget was at the end of the order: a skipped product means no note was written.
    if (m.skipped.product > 0) expect(kinds).not.toContain('note');
  });

  it('never gives a merged product\'s old address a file, so it still reaches 404.html and opens the product it moved to', () => {
    const index = readFileSync(resolve(demo, 'index.html'), 'utf8');
    const dormantPath = /data\/dormant\.[0-9a-f]{16}\.json/.exec(index)?.[0];
    expect(dormantPath).toBeTruthy();
    const dormant = JSON.parse(readFileSync(resolve(demo, dormantPath!), 'utf8')) as { SLUG_ALIASES?: Record<string, string> };
    const aliases = Object.keys(dormant.SLUG_ALIASES ?? {});
    const written = new Set(manifest().pages.map((p) => p.path.slice(1)));
    expect(aliases.filter((slug) => written.has(slug) || existsSync(resolve(demo, `${slug}.html`)))).toEqual([]);
  });

  it('gives each product page parseable Product JSON-LD in pounds', () => {
    const products = manifest().pages.filter((p) => p.kind === 'product');
    const step = Math.max(1, Math.floor(products.length / 40));
    for (let i = 0; i < products.length; i += step) {
      const html = readFileSync(resolve(demo, products[i]!.file), 'utf8');
      const ld = jsonLdOf(html).find((x) => x['@type'] === 'Product') as { offers: { priceCurrency: string; lowPrice: string; highPrice: string } };
      expect(ld.offers.priceCurrency).toBe('GBP');
      expect(Number(ld.offers.lowPrice)).toBeLessThanOrEqual(Number(ld.offers.highPrice));
    }
  });
});

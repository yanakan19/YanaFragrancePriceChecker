/**
 * Every fixed address has a real file, so the host answers it with HTTP 200.
 *
 * GitHub Pages answers any path that is not a file with demo/404.html and
 * status 404, which made /about, /about/legal and every list "unavailable" to a
 * crawler that reads the status (docs/ADVERTISING-PLAN.md, Phase 1, risk 1).
 * scripts/build-route-pages.ts writes demo/about.html, demo/about/legal.html
 * and the rest: the app shell with each address's own title, description and
 * canonical. These tests hold that to the build output and to the router and
 * sitemap the list is read from. They read the built folder, so run
 * `npm run demo` before running this file alone (`npm test` does it).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HEAD_FACTS, pagesToWrite } from '../scripts/build-route-pages.js';
import { policyOf } from '../scripts/generatedFiles.js';
import { referencedDataFiles } from '../scripts/dataFiles.js';
import { readStampedHash } from '../scripts/demoInputsHash.js';
import { renderRoutePage, routePageProblems, routePages, sitemapPaths } from '../scripts/routePages.js';
import { SITE_URL, headFor } from '../demo/head.js';
import { basePath, listRoutePaths, matchRoute, rootWords } from '../demo/router.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demo = join(root, 'demo');
const read = (rel: string): string => readFileSync(join(demo, rel), 'utf8');

const FACTS = { productCount: 27000, retailerCount: 42, legalTitle: (id: string) => (id === 'how-it-works' ? 'How PriceSniffs works' : undefined) };

/** The addresses the owner and a reviewer click first (the task that added this file). */
const KEY_ADDRESSES = [
  '/about', '/about/legal', '/about/bot', '/fragrances', '/brands', '/retailers', '/notes', '/oils', '/sets', '/deals',
];

describe('which addresses get a file', () => {
  const sitemap = [
    '/', '/brands', '/about', '/about/legal', '/about/bot', '/legal/how-it-works',
    '/creed_aventus_100ml', '/brands/dior', '/retailers/boots', '/notes/vanilla', '/fragrance/ean-123',
  ];
  const pages = routePages(sitemap, FACTS);
  const paths = pages.map((p) => p.path);

  it('takes every list route of the router, with no second list', () => {
    for (const p of listRoutePaths()) expect(paths, p).toContain(p);
    expect(listRoutePaths()).toEqual(expect.arrayContaining(KEY_ADDRESSES.filter((p) => p.split('/').length === 2)));
    for (const p of listRoutePaths()) expect(rootWords(), p).toContain(p.slice(1));
  });

  it('takes the fixed addresses the sitemap lists beyond them', () => {
    for (const p of ['/about/legal', '/about/bot', '/legal/how-it-works']) expect(paths, p).toContain(p);
  });

  it('gives a file to the home page never, and to a product, brand, shop or note never', () => {
    for (const p of ['/', '/creed_aventus_100ml', '/brands/dior', '/retailers/boots', '/notes/vanilla', '/fragrance/ean-123']) {
      expect(paths, p).not.toContain(p);
    }
  });

  it('gives a file to an address the router does not know never, and keeps the owner dashboard and old aliases off', () => {
    const odd = routePages([...sitemap, '/not-a-page', '/about/nothing', '/gift-sets', '/explore', '/developer', '/../etc/passwd'], FACTS).map((p) => p.path);
    for (const p of ['/not-a-page', '/about/nothing', '/gift-sets', '/explore', '/developer', '/../etc/passwd']) expect(odd, p).not.toContain(p);
    expect(odd).toEqual(paths);
  });

  it('maps /word to word.html and /word/other to word/other.html', () => {
    const file = (p: string) => pages.find((x) => x.path === p)?.file;
    expect(file('/about')).toBe('about.html');
    expect(file('/about/legal')).toBe('about/legal.html');
    expect(file('/legal/how-it-works')).toBe('legal/how-it-works.html');
  });

  it('describes each one with the tags the app itself writes for it', () => {
    for (const page of pages) {
      expect(page.tags).toEqual(headFor({
        route: matchRoute(page.path),
        productCount: FACTS.productCount,
        retailerCount: FACTS.retailerCount,
        ...(page.route.name === 'legal' ? { leafName: FACTS.legalTitle(page.route.param) } : {}),
      }));
      expect(page.tags.canonical).toBe(`${SITE_URL}${page.path}`);
    }
  });
});

describe('renderRoutePage', () => {
  const head = (extra = '') =>
    '<!doctype html>\n<html><head>\n' +
    '<link rel="manifest" href="manifest.webmanifest" />\n<link rel="icon" type="image/svg+xml" href="favicon.svg" />\n' +
    '<meta name="description" content="Home" />\n<link rel="canonical" href="https://pricesniffs.space/" />\n' +
    '<meta property="og:title" content="Home" />\n<meta property="og:description" content="Home" />\n<meta property="og:url" content="https://pricesniffs.space/" />\n' +
    '<meta name="twitter:title" content="Home" />\n<meta name="twitter:description" content="Home" />\n' +
    `<script>var x = 1;</script>\n<title>PriceSniffs</title>${extra}</head></html>`;

  it('swaps the title, description, canonical and share tags, and nothing after the first script', () => {
    const out = renderRoutePage(head(), { title: 'PriceSniffs: Brands', description: 'A & B "c"', canonical: `${SITE_URL}/brands`, noindex: false });
    expect(out).toContain('<title>PriceSniffs: Brands</title>');
    expect(out).toContain('<meta name="description" content="A &amp; B &quot;c&quot;" />');
    expect(out).toContain(`<link rel="canonical" href="${SITE_URL}/brands" />`);
    expect(out).toContain(`<meta property="og:url" content="${SITE_URL}/brands" />`);
    expect(out).toContain('<meta property="og:title" content="PriceSniffs: Brands" />');
    expect(out).not.toContain('robots');
    expect(out.slice(out.indexOf('<script>'))).toBe(head().slice(head().indexOf('<script>')).replace('<title>PriceSniffs</title>', '<title>PriceSniffs: Brands</title>'));
  });

  it('points the head asset links at the site root, so they work two folders deep', () => {
    const out = renderRoutePage(head(), { title: 't', description: 'd', canonical: `${SITE_URL}/about/legal`, noindex: false });
    expect(out).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(out).toContain('href="/favicon.svg"');
  });

  it('adds the noindex tag the app adds, only for a noindex page', () => {
    const out = renderRoutePage(head(), { title: 't', description: 'd', canonical: `${SITE_URL}/design`, noindex: true });
    expect(out).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it('fails loudly when the page head changes shape', () => {
    expect(() => renderRoutePage(head().replace('<link rel="canonical"', '<link rel="x"'), { title: 't', description: 'd', canonical: 'c', noindex: false })).toThrow(/canonical/);
  });
});

describe('the built folder', () => {
  const index = read('index.html');
  const pages = pagesToWrite();
  const sitemap = sitemapPaths(read('sitemap-gb.xml'));

  it('has a file for each of the key addresses, with its own title and canonical', () => {
    expect(pages.length).toBeGreaterThanOrEqual(KEY_ADDRESSES.length);
    for (const path of KEY_ADDRESSES) {
      const page = pages.find((p) => p.path === path);
      expect(page, `${path} has no route page`).toBeDefined();
      const html = read(page!.file);
      expect(html, path).toContain(`<link rel="canonical" href="${SITE_URL}${path}" />`);
      expect(html, path).toContain(`<title>${page!.tags.title}</title>`);
      expect(html, path).toMatch(/<meta name="description" content="[^"]{20,}" \/>/);
      expect(html, path).not.toContain(`<link rel="canonical" href="${SITE_URL}/" />`);
    }
    expect(read('about/legal.html')).toContain('<title>PriceSniffs: Legal Notice</title>');
    expect(read('about/bot.html')).toContain('<title>PriceSniffs: PriceSniffsBot</title>');
    expect(read('brands.html')).toContain('<title>PriceSniffs: Brands</title>');
  });

  it('is the same app in each: the same bundle, data files and build stamp as the page', () => {
    for (const page of pages) {
      const html = read(page.file);
      expect(readStampedHash(html), page.file).toBe(readStampedHash(index));
      expect(referencedDataFiles(html).sort(), page.file).toEqual(referencedDataFiles(index).sort());
      // Everything from the first script on (the data loader, the bundle, the body) is the page's own.
      const tail = (s: string) => s.slice(s.indexOf('<script>'));
      expect(tail(html).replace(/<title>[^<]*<\/title>/, ''), page.file).toBe(tail(index).replace(/<title>[^<]*<\/title>/, ''));
      // The router reads location.pathname on boot, so the file's own address must open its own view.
      expect(matchRoute(page.path).name, page.file).not.toBe('notFound');
      // The loader fetches its data from the site root from any depth (loaderScript in scripts/dataFiles.ts).
      expect(basePath(page.path), page.file).toBe('/');
    }
  });

  it('keeps 404.html for the rest, byte for byte the page, so an unknown address still says Page not found', () => {
    expect(read('404.html')).toBe(index);
    for (const rel of ['not-a-page.html', 'about/nothing.html', 'developer.html', 'explore.html', 'gift-sets.html', 'brands/dior.html']) {
      expect(existsSync(join(demo, rel)), rel).toBe(false);
    }
    expect(pages.map((p) => p.path)).not.toContain('/developer');
    expect(pages.map((p) => p.path)).not.toContain('/');
  });

  it('writes no file for a product, brand, shop or note page', () => {
    const files = execFileSync('find', ['demo', '-name', '*.html', '-not', '-path', 'demo/logos/*', '-not', '-path', 'demo/icons/*'], { cwd: root, encoding: 'utf8' })
      .split('\n').filter(Boolean).map((f) => f.replace(/^demo\//, ''));
    const expected = new Set(['index.html', '404.html', 'template.html', ...pages.map((p) => p.file)]);
    expect(files.filter((f) => !expected.has(f)), 'html files in demo/ that are not the page or a route page').toEqual([]);
    expect(files.length).toBeLessThan(60);
  });

  it('is listed by the sitemap: every indexable route page, and none that asks not to be indexed', () => {
    for (const page of pages) {
      if (page.tags.noindex) {
        expect(sitemap, `${page.path} is noindex and must stay out of the sitemap`).not.toContain(page.path);
        expect(read(page.file), page.file).toContain('<meta name="robots" content="noindex, follow" />');
      } else {
        expect(sitemap, `${page.path} has a file but the sitemap does not list it`).toContain(page.path);
        expect(read(page.file), page.file).not.toContain('<meta name="robots"');
      }
    }
    for (const path of KEY_ADDRESSES) expect(sitemap, path).toContain(path);
  });

  it('is gitignored and a deploy path in the manifest, wherever a route puts its file', () => {
    for (const page of pages) {
      expect(policyOf(`demo/${page.file}`), `demo/${page.file}: add its folder to scripts/generated-files.txt and .gitignore`).toBe('deploy');
      expect(() => execFileSync('git', ['check-ignore', '-q', '--no-index', `demo/${page.file}`], { cwd: root }), `demo/${page.file} is not gitignored`).not.toThrow();
    }
  });

  it('passes the deploy check, and the check fails for a missing, stale or wrong page', () => {
    expect(routePageProblems(demo, pages)).toEqual([]);

    const scratch = mkdtempSync(join(tmpdir(), 'route-pages-'));
    try {
      for (const page of pages) {
        mkdirSync(dirname(join(scratch, page.file)), { recursive: true });
        writeFileSync(join(scratch, page.file), renderRoutePage(index, page.tags));
      }
      writeFileSync(join(scratch, 'index.html'), index);
      expect(routePageProblems(scratch, pages)).toEqual([]);

      rmSync(join(scratch, 'about.html'));
      expect(routePageProblems(scratch, pages).join('\n')).toMatch(/about\.html is missing, so \/about would answer 404/);

      writeFileSync(join(scratch, 'about.html'), read('brands.html'));
      expect(routePageProblems(scratch, pages).join('\n')).toMatch(/about\.html does not carry the title, description and canonical of \/about/);

      writeFileSync(join(scratch, 'about.html'), renderRoutePage(index, pages.find((p) => p.path === '/about')!.tags).replace(/demo-build-hash sha256:[0-9a-f]{64}/, `demo-build-hash sha256:${'0'.repeat(64)}`));
      expect(routePageProblems(scratch, pages).join('\n')).toMatch(/about\.html is from another build/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('derives the same list from the sitemap on disk as the build wrote', () => {
    expect(routePages(sitemap, HEAD_FACTS).map((p) => p.path)).toEqual(pages.map((p) => p.path));
  });
});

describe('the service worker and the deploy still work with a 200 for each address', () => {
  const sw = readFileSync(join(demo, 'sw.js'), 'utf8');

  it('keeps one offline shell: every navigation is cached as ./index.html, whichever address answered', () => {
    expect(sw).toMatch(/event\.request\.mode === 'navigate'/);
    expect(sw).toMatch(/cache\.put\('\.\/index\.html', copy\)/);
    expect(sw).toMatch(/caches\.match\('\.\/index\.html'\)/);
  });

  it('prunes data by the names a document carries, which every route page shares with the page', () => {
    const named = referencedDataFiles(read('index.html')).sort();
    expect(named.length).toBeGreaterThan(0);
    for (const page of pagesToWrite()) expect(referencedDataFiles(read(page.file)).sort(), page.file).toEqual(named);
  });

  it('is checked by the deploy workflow before it uploads, after the page copy check', () => {
    const wf = readFileSync(join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
    expect(wf).toContain('cmp demo/index.html demo/404.html');
    expect(wf).toContain('npx tsx scripts/build-route-pages.ts --check');
    expect(wf.indexOf('build-route-pages.ts --check')).toBeGreaterThan(wf.indexOf('cmp demo/index.html demo/404.html'));
    expect(wf.indexOf('build-route-pages.ts --check')).toBeLessThan(wf.indexOf('upload-pages-artifact@v3'));
  });

  it('is built by npm run demo, last, after the sitemap it reads', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    const steps = pkg.scripts.demo!.split('&&').map((s) => s.trim());
    expect(steps.indexOf('tsx scripts/build-route-pages.ts')).toBe(steps.length - 1);
    expect(steps.indexOf('tsx scripts/build-route-pages.ts')).toBeGreaterThan(steps.indexOf('tsx scripts/build-sitemap.ts'));
  });

  it('is uploaded with the rest: the deploy publishes the whole demo folder', () => {
    const wf = readFileSync(join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
    expect(wf).toMatch(/upload-pages-artifact@v3\s+timeout-minutes: \d+\s+with:\s+path: demo/);
  });
});

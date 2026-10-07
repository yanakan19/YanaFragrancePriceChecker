/**
 * Writes a page of its own for every fixed address (scripts/routePages.ts says
 * which and why), so the host answers /about, /about/legal, /fragrances and the
 * rest with HTTP 200 instead of the 404.html fallback.
 *
 *   npm run demo            runs this last, after the sitemap it reads
 *   tsx scripts/build-route-pages.ts --check
 *                           writes nothing; exits 1 when a page is missing,
 *                           stale or has another address's tags (the deploy
 *                           workflow runs it before it uploads)
 *
 * The pages are "deploy" files (scripts/generated-files.txt): built at deploy
 * time, gitignored, never committed. An address whose file would land outside
 * the folders the manifest names is skipped with a warning rather than failing
 * the build, so a new route can never take the deployment down; the test in
 * tests/routePages.test.ts fails instead and says which line to add.
 */
// First, before anything reads the catalogue (see scripts/siteApply.ts).
import './siteApply.js';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTS } from '../demo/counts.js';
import { SHOP_COUNT } from '../demo/catalogue.generated.js';
import { legalPage } from '../demo/legal.js';
import { policyOf, writeGenerated } from './generatedFiles.js';
import {
  removeStaleRoutePages, renderRoutePage, routePageProblems, routePages, sitemapPaths,
  type HeadFacts, type RoutePage,
} from './routePages.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demo = resolve(root, 'demo');

/** The facts the app gives headFor for these pages (headInputForState in demo/app.ts). */
export const HEAD_FACTS: HeadFacts = {
  productCount: COUNTS.bottles,
  retailerCount: SHOP_COUNT,
  legalTitle: (id) => legalPage(id)?.title,
};

export function pagesToWrite(): RoutePage[] {
  const sitemap = readFileSync(resolve(demo, 'sitemap.xml'), 'utf8');
  return routePages(sitemapPaths(sitemap), HEAD_FACTS);
}

function main(): void {
  const pages = pagesToWrite();

  if (process.argv.includes('--check')) {
    const problems = routePageProblems(demo, pages);
    if (pages.length === 0) problems.push('no route pages were derived: the sitemap or the router lists nothing');
    for (const p of problems) console.error(`::error::${p}`);
    if (problems.length > 0) process.exit(1);
    console.log(`route pages: ${pages.length} present and carrying their own tags`);
    return;
  }

  const index = readFileSync(resolve(demo, 'index.html'), 'utf8');
  const started = Date.now();
  const written: RoutePage[] = [];
  let bytes = 0;
  for (const page of pages) {
    if (policyOf(`demo/${page.file}`) !== 'deploy') {
      console.warn(
        `::warning::demo/${page.file} (${page.path}) is not a deploy path in scripts/generated-files.txt and .gitignore, ` +
          'so it is not written and the address still answers 404. Add the folder to both; tests/routePages.test.ts says the same.',
      );
      continue;
    }
    const html = renderRoutePage(index, page.tags);
    mkdirSync(dirname(resolve(demo, page.file)), { recursive: true });
    writeGenerated(root, `demo/${page.file}`, html);
    written.push(page);
    bytes += Buffer.byteLength(html);
  }

  const removed = removeStaleRoutePages(
    demo,
    new Set(written.map((p) => p.file)),
    pages.map((p) => dirname(p.file)).filter((d) => d !== '.'),
  );
  for (const r of removed) console.log(`demo/${r}  removed (no such route any more)`);

  console.log(
    `demo/<route>.html  ${written.length} pages, ${(bytes / 1024 / 1024).toFixed(1)} MB in all, ` +
      `${((Date.now() - started) / 1000).toFixed(1)} s (${written.map((p) => p.path).join(' ')})`,
  );
}

// Run as a script, not when a test imports HEAD_FACTS.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

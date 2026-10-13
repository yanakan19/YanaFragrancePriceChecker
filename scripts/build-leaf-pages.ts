/**
 * Writes a page answering HTTP 200 for each priced UK product, brand, shop and
 * note, as far as the deploy size budget allows (scripts/leafPages.ts says
 * which, in what order, and why).
 *
 *   npm run demo            runs this after scripts/build-demo.ts, before the
 *                           sitemap, which lists only what this wrote
 *   tsx scripts/build-leaf-pages.ts --check
 *                           writes nothing; exits 1 when a page is missing,
 *                           over its size cap, marked noindex, without one H1,
 *                           with another address as canonical, with JSON-LD
 *                           that disagrees with its lowest price, from another
 *                           build; when a sitemap lists an address with no
 *                           file; or when the deploy output is over budget
 *                           (the deploy workflow runs it before it uploads)
 *
 * The pages are "deploy" files (scripts/generated-files.txt): built at deploy
 * time, gitignored, never committed.
 */
// First, before anything reads the catalogue (see scripts/siteApply.ts).
import './siteApply.js';
import '../demo/siteData.js';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGenerated } from './generatedFiles.js';
import {
  DEPLOY_BUDGET_BYTES, LATER_FILES_RESERVE_BYTES, LEAF_MANIFEST, deployBytes, deployFiles, isPageOrSitemap, leafCandidates,
  leafProblems, renderLeafPage, sitemapProblems, staleLeafFiles, type LeafKind, type LeafManifest, type LeafPage,
} from './leafPages.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demo = resolve(root, 'demo');
const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)} MB`;

function check(): void {
  const manifestPath = resolve(root, LEAF_MANIFEST);
  if (!existsSync(manifestPath)) {
    console.error(`::error::${LEAF_MANIFEST} is missing: run npm run demo`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as LeafManifest;
  const problems = [...leafProblems(demo, manifest), ...sitemapProblems(demo)];
  if (manifest.pages.length === 0) problems.push('no prerendered pages were written');
  for (const p of problems.slice(0, 50)) console.error(`::error::${p}`);
  if (problems.length > 0) {
    console.error(`${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`prerendered pages: ${manifest.pages.length} present and well formed; every sitemap address has a file; deploy output ${mb(deployBytes(demo))} of ${mb(DEPLOY_BUDGET_BYTES)}`);
}

function build(): void {
  const started = Date.now();
  const shell = readFileSync(resolve(demo, 'index.html'), 'utf8');
  const { candidates } = leafCandidates();

  // What is already committed to the deploy, before this step's pages and the
  // route pages and sitemaps written after it (whatever an earlier local build
  // left of those is about to be replaced, so it does not count).
  const base = deployFiles(demo).filter((f) => !isPageOrSitemap(f.rel)).reduce((n, f) => n + f.bytes, 0);
  const room = DEPLOY_BUDGET_BYTES - base - LATER_FILES_RESERVE_BYTES;

  const written: LeafPage[] = [];
  const zero = (): Record<LeafKind, number> => ({ shop: 0, brand: 0, product: 0, note: 0 });
  const skipped = zero();
  const all = zero();
  let bytes = 0;
  let full = false;
  const made = new Set<string>();
  for (const c of candidates) {
    all[c.kind]++;
    if (full) {
      skipped[c.kind]++;
      continue;
    }
    const html = renderLeafPage(shell, c.tags, c.render(), { subnav: c.kind !== 'product' });
    const size = Buffer.byteLength(html);
    if (bytes + size > room) {
      // In order of importance: the first page that does not fit ends the run.
      full = true;
      skipped[c.kind]++;
      continue;
    }
    mkdirSync(dirname(resolve(demo, c.file)), { recursive: true });
    writeGenerated(root, `demo/${c.file}`, html);
    made.add(c.file);
    written.push({ kind: c.kind, path: c.path, file: c.file });
    bytes += size;
  }
  const stale = staleLeafFiles(demo, made);
  for (const f of stale) rmSync(resolve(demo, f), { force: true });

  const manifest: LeafManifest = { budgetBytes: DEPLOY_BUDGET_BYTES, bytes, pages: written, skipped, candidates: all };
  mkdirSync(resolve(root, 'dist-demo'), { recursive: true });
  writeFileSync(resolve(root, LEAF_MANIFEST), JSON.stringify(manifest));

  const kinds: LeafKind[] = ['product', 'brand', 'shop', 'note'];
  const counts = kinds.map((k) => `${all[k] - skipped[k]} of ${all[k]} ${k}s`).join(', ');
  const products = written.filter((p) => p.kind === 'product').length;
  console.log(
    `demo/<leaf>.html  ${written.length} prerendered pages (${counts}), ${mb(bytes)}, ` +
      `average ${(bytes / Math.max(1, written.length) / 1024).toFixed(1)} kB; room was ${mb(room)} of the ${mb(DEPLOY_BUDGET_BYTES)} budget ` +
      `beside ${mb(base)} of other files; ${stale.length} stale page(s) removed; ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
  if (skipped.product > 0) console.log(`::warning::${skipped.product} priced products did not fit the deploy budget and keep answering 404 (${products} do)`);
}

if (process.argv.includes('--check')) check();
else build();

/**
 * Writes a page answering HTTP 200 for each brand and shop of the US, Indian
 * and Canadian sites (scripts/regionLeafPages.ts says what and why).
 *
 *   npm run demo            runs this after scripts/build-leaf-pages.ts, before
 *                           the sitemap, which lists only what this wrote
 *   tsx scripts/build-region-leaf-pages.ts --check
 *                           writes nothing; exits 1 when a page this build
 *                           listed is missing, has another address's
 *                           canonical, is marked noindex, has no single H1, or
 *                           the deploy output is over budget
 *
 * The pages are "deploy" files (demo/us/, demo/in/, demo/ca/ in
 * scripts/generated-files.txt): built at deploy time, never committed.
 */
import './siteApply.js';
import { existsSync, mkdirSync, readFileSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeGenerated } from './generatedFiles.js';
import { DEPLOY_BUDGET_BYTES, LATER_FILES_RESERVE_BYTES, deployBytes, deployFiles, renderLeafPage, splitBoot } from './leafPages.js';
import { regionLeaves, type RegionLeafManifest, type RegionOffer, type RegionProduct, type RegionShop } from './regionLeafPages.js';
import { liveRegions, setActiveRegionForBuild, type RegionConfig } from '../src/config/regions.js';
import { SITE_URL } from '../demo/head.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demo = resolve(root, 'demo');
const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)} MB`;

export const regionLeafManifestPath = (region: RegionConfig): string => resolve(root, 'dist-demo/regions', region.pathPrefix, 'leaf-pages.json');
const regions = (): RegionConfig[] => liveRegions().filter((r) => r.pathPrefix !== '');

async function load(region: RegionConfig): Promise<{ catalogue: RegionProduct[]; offers: Record<string, RegionOffer[]>; shops: RegionShop[] }> {
  const dir = resolve(root, 'dist-demo/regions', region.pathPrefix);
  const cat = (await import(pathToFileURL(resolve(dir, 'catalogue.generated.js')).href)) as { CATALOGUE: RegionProduct[]; CRAWLED: Record<string, RegionOffer[]> };
  const ret = (await import(pathToFileURL(resolve(dir, 'retailers.js')).href)) as { RETAILERS: RegionShop[] };
  return { catalogue: cat.CATALOGUE, offers: cat.CRAWLED, shops: ret.RETAILERS };
}

/** Pages of an earlier build in this region that this one did not write. */
function staleFiles(region: RegionConfig, keep: ReadonlySet<string>): string[] {
  const stale: string[] = [];
  for (const folder of ['brands', 'retailers']) {
    const dir = resolve(demo, region.pathPrefix, folder);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const rel = `${region.pathPrefix}/${folder}/${f}`;
      if (f.endsWith('.html') && !keep.has(rel)) stale.push(rel);
    }
  }
  return stale;
}

async function build(): Promise<void> {
  const started = Date.now();
  const bootAssets = new Set<string>();
  // What is already in the deploy, without any region's brand and shop pages (this step rewrites them).
  const own = (rel: string): boolean => regions().some((r) => rel.startsWith(`${r.pathPrefix}/brands/`) || rel.startsWith(`${r.pathPrefix}/retailers/`));
  const base = deployFiles(demo).filter((f) => !own(f.rel)).reduce((n, f) => n + f.bytes, 0);
  let room = DEPLOY_BUDGET_BYTES - base - LATER_FILES_RESERVE_BYTES;
  for (const region of regions()) {
    const shellPath = resolve(demo, region.pathPrefix, 'index.html');
    if (!existsSync(shellPath)) throw new Error(`demo/${region.pathPrefix}/index.html is not built: run npm run demo`);
    const split = splitBoot(readFileSync(shellPath, 'utf8'));
    mkdirSync(resolve(demo, 'assets'), { recursive: true });
    writeGenerated(root, `demo/${split.asset}`, split.code);
    bootAssets.add(split.asset);

    setActiveRegionForBuild(region);
    let leaves;
    try {
      const data = await load(region);
      leaves = regionLeaves(region, data.catalogue, data.offers, data.shops);
    } finally {
      setActiveRegionForBuild(null);
    }
    const pages: RegionLeafManifest['pages'] = [];
    const made = new Set<string>();
    let bytes = 0;
    let skipped = 0;
    let full = false;
    for (const leaf of leaves) {
      if (full) { skipped++; continue; }
      const html = renderLeafPage(split.shell, leaf.tags, { main: leaf.main, head: '' }, { subnav: true });
      const size = Buffer.byteLength(html);
      if (size > room) { full = true; skipped++; continue; }
      room -= size;
      mkdirSync(dirname(resolve(demo, leaf.file)), { recursive: true });
      writeGenerated(root, `demo/${leaf.file}`, html);
      made.add(leaf.file);
      pages.push({ kind: leaf.kind, path: leaf.path, file: leaf.file });
      bytes += size;
    }
    for (const f of staleFiles(region, made)) rmSync(resolve(demo, f), { force: true });
    const manifest: RegionLeafManifest = { bytes, pages, boot: split.asset, skipped, candidates: leaves.length };
    mkdirSync(dirname(regionLeafManifestPath(region)), { recursive: true });
    writeFileSync(regionLeafManifestPath(region), JSON.stringify(manifest));
    console.log(
      `demo/${region.pathPrefix}/<leaf>.html  ${pages.length} of ${leaves.length} brand and shop pages, ${mb(bytes)}, ` +
        `average ${(bytes / Math.max(1, pages.length) / 1024).toFixed(1)} kB; ${skipped} left out for the budget`,
    );
  }
  console.log(`region leaf pages: ${((Date.now() - started) / 1000).toFixed(1)} s, deploy output now ${mb(deployBytes(demo))} of ${mb(DEPLOY_BUDGET_BYTES)}`);
}

function check(): void {
  const problems: string[] = [];
  for (const region of regions()) {
    const path = regionLeafManifestPath(region);
    if (!existsSync(path)) {
      problems.push(`${path} is missing: run npm run demo`);
      continue;
    }
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as RegionLeafManifest;
    if (manifest.pages.length === 0) problems.push(`no brand or shop page was written for ${region.pathPrefix}`);
    for (const p of manifest.pages) {
      const file = resolve(demo, p.file);
      if (!existsSync(file)) { problems.push(`demo/${p.file} is missing, so ${p.path} would answer 404`); continue; }
      const html = readFileSync(file, 'utf8');
      if (!html.includes(`<link rel="canonical" href="${SITE_URL}${p.path}" />`)) problems.push(`demo/${p.file} does not carry ${p.path} as its canonical`);
      if (/<meta name="robots" content="noindex/.test(html)) problems.push(`demo/${p.file} is marked noindex`);
      if ((html.match(/<h1[ >]/g) ?? []).length !== 1) problems.push(`demo/${p.file} has not exactly one h1`);
    }
  }
  const total = deployBytes(demo);
  if (total > DEPLOY_BUDGET_BYTES) problems.push(`the deploy output is ${mb(total)}, over the ${mb(DEPLOY_BUDGET_BYTES)} budget`);
  for (const p of problems.slice(0, 50)) console.error(`::error::${p}`);
  if (problems.length > 0) {
    console.error(`${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`region brand and shop pages: present and well formed in ${regions().length} regions; deploy output ${mb(total)} of ${mb(DEPLOY_BUDGET_BYTES)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) check();
  else await build();
}

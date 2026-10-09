/**
 * Bundles the page once per live region other than the UK, with that region's
 * data and shops (docs/INTERNATIONAL-PLAN.md, "Public beta, 9 October 2026:
 * what shipped").
 *
 *   tsx scripts/bundle-region.ts            (part of npm run demo, after
 *                                            scripts/build-region-data.ts and
 *                                            scripts/bundle-demo.ts)
 *
 * The same compiled app (dist-demo/demo/app.js) as the UK bundle, with five
 * modules swapped for the region's (written by scripts/build-region-data.ts):
 * the catalogue, the deals, the products with no current prices, the price
 * history, and the shop registry (src/config/retailers.js). Everything else,
 * the code, the money formatter (which reads the region from the address),
 * the guides, is the UK's own. Large literals move into data files exactly as
 * scripts/bundle-demo.ts moves the UK's, so a region page loads the same way:
 *
 *   dist-demo/<r>/bundle.js
 *   dist-demo/<r>/data/<module>.json
 *   dist-demo/<r>/data-files.json            (which blob is where)
 *
 * scripts/build-demo.ts then publishes them as demo/<r>/index.html,
 * demo/<r>/404.html and demo/<r>/data/. The UK bundle is not touched.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, type Plugin } from 'esbuild';
import { inlineShopTimes, moveLiteralsToJson } from './dataLiterals.js';
import { BLOBS_GLOBAL, LAZY_CONTENT_MODULES, LAZY_DATA_MODULES, type DataGroup, type DataManifest } from './dataFiles.js';
import { applyNumbering, localMarker, numberGroups } from './dataNumbering.js';
import { buildNoteData, buildNoteIconLookup, NOTE_DATA_FILE, NOTE_ICON_FILE, publishNoteIcons, readNoteGroupInputs } from './noteData.js';
import { pruneContext, pruneMovedBlobs, readSiteBuild, removedSets } from './siteBuild.js';
import { REGION_LINKS_FILE } from './regionPages.js';
import { liveRegions, type RegionConfig } from '../src/config/regions.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The modules a region swaps for its own, by the file name the app imports. */
export const REGION_MODULES = ['catalogue', 'deals', 'dormant', 'priceHistory'] as const;

async function bundleRegion(region: RegionConfig): Promise<void> {
  const r = region.pathPrefix;
  const regionDir = resolve(root, 'dist-demo/regions', r);
  const outDir = resolve(root, 'dist-demo', r);
  if (!existsSync(resolve(regionDir, 'catalogue.generated.js'))) {
    throw new Error(`dist-demo/regions/${r} has no catalogue: run scripts/build-region-data.ts first`);
  }
  const site = readSiteBuild(root);
  const removed = removedSets(site);
  const prune = pruneContext();
  const perModule = new Map<string, unknown[]>();
  const swapped = new Set<string>();

  const regionData: Plugin = {
    name: 'region-data',
    setup(b) {
      // The region's own modules in place of the UK's.
      b.onResolve({ filter: /(?:^|\/)(?:catalogue|deals|dormant|priceHistory)\.generated\.js$/ }, (args) => {
        const name = args.path.split('/').pop()!.replace(/\.generated\.js$/, '');
        swapped.add(name);
        return { path: resolve(regionDir, `${name}.generated.js`) };
      });
      b.onResolve({ filter: /(?:^|\/)config\/retailers\.js$/ }, () => {
        swapped.add('retailers');
        return { path: resolve(regionDir, 'retailers.js') };
      });
      b.onLoad({ filter: /[\\/]demo[\\/]content[\\/][A-Za-z]+\.js$/ }, (args) => {
        throw new Error(`${args.path.split('/').pop()} is loaded on demand (LAZY_CONTENT_MODULES) but the bundle imports it.`);
      });
      b.onLoad({ filter: /\.generated\.js$/ }, async (args) => {
        const module = args.path.split('/').pop()!.replace(/\.generated\.js$/, '');
        if (Object.hasOwn(LAZY_DATA_MODULES, module)) {
          throw new Error(`${module}.generated is loaded on demand (LAZY_DATA_MODULES) but the bundle imports it.`);
        }
        const source = inlineShopTimes(await readFile(args.path, 'utf8'));
        if (perModule.has(module)) throw new Error(`two modules are named ${module}.generated`);
        const local: unknown[] = [];
        const { code: moved_, moved } = moveLiteralsToJson(source, local);
        pruneMovedBlobs(module, moved, local, 0, removed, prune);
        perModule.set(module, local);
        const code = moved_.replace(/__psData\((\d+)\)/g, (_m, i: string) => localMarker(module, Number(i)));
        return { contents: code, loader: 'js' };
      });
    },
  };

  await mkdir(outDir, { recursive: true });
  await build({
    entryPoints: [resolve(root, 'dist-demo/demo/app.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2020',
    outfile: resolve(outDir, 'bundle.js'),
    banner: { js: `var __psData=function(i){return ${BLOBS_GLOBAL}[i]};` },
    plugins: [regionData],
    logLevel: 'warning',
  });
  // The registry and the two eager modules must have been swapped, or the page would show UK shops.
  for (const name of ['retailers', 'catalogue', 'deals']) {
    if (!swapped.has(name)) throw new Error(`the ${r} bundle never imported ${name}: the region swap did not happen`);
  }

  const groups: DataGroup[] = numberGroups(new Map([...perModule].map(([k, v]) => [k, v.length])));
  const blobs: unknown[] = groups.flatMap((g) => perModule.get(g.name)!);
  {
    const bundlePath = resolve(outDir, 'bundle.js');
    const { code, swapped: n } = applyNumbering(await readFile(bundlePath, 'utf8'), groups);
    if (n !== blobs.length) throw new Error(`${r}/bundle.js uses ${n} data lookup(s) but ${blobs.length} literal(s) were moved`);
    await writeFile(bundlePath, code);
  }
  const dataDir = resolve(outDir, 'data');
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });
  for (const g of groups) await writeFile(resolve(dataDir, `${g.name}.json`), JSON.stringify(blobs.slice(g.start, g.start + g.count)));

  const lazy: string[] = [];
  // The region's own lazy modules: its price history and its (empty) dormant file.
  for (const name of Object.keys(LAZY_DATA_MODULES)) {
    const mod = (await import(pathToFileURL(resolve(regionDir, `${name}.generated.js`)).href)) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const key of LAZY_DATA_MODULES[name]!) {
      if (mod[key] === undefined || typeof mod[key] === 'function') throw new Error(`${r}/${name}.generated has no data export ${key}`);
      data[key] = mod[key];
    }
    await writeFile(resolve(dataDir, `${name}.json`), JSON.stringify(data));
    lazy.push(name);
  }
  // The written pages are the UK's own words.
  for (const [name, { module, exports }] of Object.entries(LAZY_CONTENT_MODULES)) {
    const mod = (await import(pathToFileURL(resolve(root, `dist-demo/demo/${module}.js`)).href)) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const key of exports) data[key] = mod[key];
    await writeFile(resolve(dataDir, `${name}.json`), JSON.stringify(data));
    lazy.push(name);
  }
  // Notes (owner instruction, 9 Oct 2026): the region shops publish none, so a product that is the
  // same bottle as a UK product shows the UK product's notes (scripts/regionSite.ts). The Notes
  // tab's file and the product page's icon lookup are built from the notes this region's page
  // really ships: its own data module is read the way the page reads it (names tidied, counted).
  {
    const inputs = readNoteGroupInputs(root);
    const iconPaths = publishNoteIcons(root, inputs);
    const iconPath = (f: string): string => {
      const p = iconPaths.get(f);
      if (!p) throw new Error(`note icon ${f} was not published`);
      return p;
    };
    const probe = resolve(outDir, 'data-probe.mjs');
    await build({
      entryPoints: [resolve(root, 'dist-demo/demo/data.js')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: probe,
      plugins: [{
        name: 'region-data-probe',
        setup(b) {
          b.onResolve({ filter: /(?:^|\/)(?:catalogue|deals|dormant|priceHistory)\.generated\.js$/ }, (args) => ({
            path: resolve(regionDir, `${args.path.split('/').pop()!}`),
          }));
          b.onResolve({ filter: /(?:^|\/)config\/retailers\.js$/ }, () => ({ path: resolve(regionDir, 'retailers.js') }));
        },
      }],
      logLevel: 'warning',
    });
    const data = (await import(pathToFileURL(probe).href)) as typeof import('../demo/data.js');
    await rm(probe, { force: true });
    const pyramids = data.DEMO_FRAGRANCES.filter((f) => f.notes).map((f) => [...f.notes!.top, ...f.notes!.middle, ...f.notes!.base]);
    const file = buildNoteData(data.NOTE_INDEX, pyramids, inputs, iconPath);
    await writeFile(resolve(dataDir, `${NOTE_DATA_FILE}.json`), JSON.stringify({ NOTE_DATA: file }));
    lazy.push(NOTE_DATA_FILE);
    const icons = buildNoteIconLookup(data.NOTE_INDEX, pyramids.flat(), inputs, iconPath);
    await writeFile(resolve(dataDir, `${NOTE_ICON_FILE}.json`), JSON.stringify({ NOTE_ICONS: icons }));
    lazy.push(NOTE_ICON_FILE);
    console.log(`dist-demo/${r}  ${pyramids.length} products show notes, ${data.NOTE_INDEX.length} notes in the Notes tab`);
  }
  // What this page knows of the other regions (scripts/build-region-data.ts).
  {
    const links = await readFile(resolve(root, 'dist-demo/regions/links', `${region.id}.json`), 'utf8');
    await writeFile(resolve(dataDir, `${REGION_LINKS_FILE}.json`), JSON.stringify({ REGION_LINKS: JSON.parse(links) }));
    lazy.push(REGION_LINKS_FILE);
  }
  const manifest: DataManifest = { groups, lazy };
  await writeFile(resolve(outDir, 'data-files.json'), JSON.stringify(manifest, null, 2));

  const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)} MB`;
  console.log(`dist-demo/${r}/bundle.js  ${mb((await readFile(resolve(outDir, 'bundle.js'))).length)} code` +
    (prune.dropped.products || prune.dropped.offers ? `; left out ${prune.dropped.products} product(s) and ${prune.dropped.offers} price(s) of removed brands and shops` : ''));
  for (const name of [...groups.map((g) => g.name), ...lazy]) {
    const size = (await readFile(resolve(dataDir, `${name}.json`))).length;
    console.log(`dist-demo/${r}/data/${name}.json  ${mb(size)} data${lazy.includes(name) ? ' (on demand)' : ''}`);
  }
}

for (const region of liveRegions()) {
  if (region.pathPrefix === '') continue;
  await bundleRegion(region);
}
